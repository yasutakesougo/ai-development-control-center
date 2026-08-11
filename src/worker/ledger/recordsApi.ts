import { computeRecordableDecision } from "../../domain/decisionFingerprint";
import { resolveHumanAction } from "../../domain/humanActionResolver";
import type { ObservedFacts } from "../../domain/observedFacts";
import type { AccessKeyResolver } from "../auth/accessJwtVerifier";
import {
  ledgerGuardDenialResponse,
  requireLedgerCapability,
  type LedgerGuardEnv,
} from "../auth/ledgerGuard";
import {
  appendLedgerRecord,
  findByIdempotencyScope,
  listLedgerRecords,
  LEDGER_LIST_DEFAULT_LIMIT,
  type ApprovalLedgerIntent,
  type D1DatabaseLike,
  type LedgerRecord,
} from "./ledgerStore";

export type LedgerApiEnv = LedgerGuardEnv & {
  /** Canonical Approval Ledger store (Cloudflare D1). */
  LEDGER_DB?: D1DatabaseLike;
};

/** Injectable seams for tests; production uses live observation and real time. */
export interface LedgerApiDeps {
  observe: () => Promise<ObservedFacts>;
  keyResolver?: AccessKeyResolver;
  now?: () => Date;
  newRecordId?: () => string;
}

const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
const INTENTS: readonly ApprovalLedgerIntent[] = ["APPROVE", "REJECT", "DEFER"];

const noStore = { "Cache-Control": "no-store" } as const;

function errorResponse(status: number, error: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error, recorded: false, ...extra }, { status, headers: noStore });
}

/**
 * Audit-UI projection of a Ledger record. No secrets, no raw JWT material.
 * Approver is the scoped principal only (issuer + subjectId).
 */
export function serializeLedgerRecord(record: LedgerRecord): Record<string, unknown> {
  return {
    recordId: record.recordId,
    schemaVersion: record.schemaVersion,
    repository: record.repository,
    sourceRefs: record.sourceRefs,
    decisionFingerprint: record.decisionFingerprint,
    humanActionStatus: record.humanActionStatus,
    evidenceState: record.evidenceState,
    observedAt: record.observedAt,
    intent: record.intent,
    recordedAt: record.recordedAt,
    approver: {
      issuer: record.approverIssuer,
      subjectId: record.approverSubjectId,
    },
    submissionState: record.submissionState,
    externalEffect: record.externalEffect,
  };
}

type RecordRequestBody = {
  intent: ApprovalLedgerIntent;
  expectedDecisionFingerprint: string;
};

function parseRecordBody(raw: unknown): RecordRequestBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const intent = body.intent;
  const expected = body.expectedDecisionFingerprint;
  if (typeof intent !== "string" || !INTENTS.includes(intent as ApprovalLedgerIntent)) return null;
  if (typeof expected !== "string" || expected.trim().length === 0) return null;
  return {
    intent: intent as ApprovalLedgerIntent,
    expectedDecisionFingerprint: expected.trim(),
  };
}

function extractIdempotencyKey(request: Request): string | null {
  const key = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim() ?? "";
  if (key.length === 0 || key.length > 200) return null;
  return key;
}

/**
 * POST /api/ledger/records
 *
 * authenticate → authorize → validate body → idempotent-replay check
 * → live observeRepository() → resolveHumanAction() → require CONFIRMED
 * + ACTION_REQUIRED → compute current server fingerprint → compare
 * expectedDecisionFingerprint → append one immutable record.
 *
 * Stale fingerprint ⇒ 409 STALE_DECISION with zero writes. The client request
 * is never silently refreshed and recorded anyway.
 */
export async function handleLedgerRecordPost(
  request: Request,
  env: LedgerApiEnv,
  deps: LedgerApiDeps,
): Promise<Response> {
  const guard = await requireLedgerCapability(request, env, "ledger.record", deps.keyResolver);
  if (!guard.ok) return ledgerGuardDenialResponse(guard);

  const db = env.LEDGER_DB;
  if (!db) return errorResponse(503, "LEDGER_UNAVAILABLE");

  const idempotencyKey = extractIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse(400, "MISSING_IDEMPOTENCY_KEY");

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(400, "INVALID_REQUEST_BODY");
  }
  const body = parseRecordBody(rawBody);
  if (!body) return errorResponse(400, "INVALID_REQUEST_BODY");

  // Idempotent retry must return the existing record without re-observing,
  // so a blind retry after an unknown network result cannot duplicate or
  // spuriously fail stale. The key is scoped by the verified principal and is
  // never identity proof by itself.
  const { principal } = guard;
  const existing = await findByIdempotencyScope(
    db,
    principal.issuer,
    principal.subjectId,
    idempotencyKey,
  );
  if (existing) {
    if (
      existing.decisionFingerprint === body.expectedDecisionFingerprint &&
      existing.intent === body.intent
    ) {
      return Response.json(
        { recorded: true, replayed: true, record: serializeLedgerRecord(existing) },
        { status: 200, headers: noStore },
      );
    }
    return errorResponse(409, "IDEMPOTENCY_CONFLICT");
  }

  const observed = await deps.observe();
  const action = resolveHumanAction(observed);
  const decision = await computeRecordableDecision(observed, action);
  if (!decision) {
    return errorResponse(409, "NO_RECORDABLE_DECISION");
  }

  if (decision.decisionFingerprint !== body.expectedDecisionFingerprint) {
    return errorResponse(409, "STALE_DECISION");
  }

  const now = deps.now?.() ?? new Date();
  const result = await appendLedgerRecord(db, {
    recordId: deps.newRecordId?.() ?? crypto.randomUUID(),
    repository: decision.facts.repository,
    sourceRefs: decision.facts.sourceRefs,
    decisionFingerprint: decision.decisionFingerprint,
    decisionFactsJson: JSON.stringify(decision.facts),
    observedAt: observed.observedAt,
    intent: body.intent,
    recordedAt: now.toISOString(),
    idempotencyKey,
    approverIssuer: principal.issuer,
    approverSubjectId: principal.subjectId,
  });

  if (result.outcome === "IDEMPOTENCY_CONFLICT") {
    return errorResponse(409, "IDEMPOTENCY_CONFLICT");
  }

  return Response.json(
    {
      recorded: true,
      replayed: result.outcome === "REPLAYED",
      record: serializeLedgerRecord(result.record),
    },
    { status: result.outcome === "RECORDED" ? 201 : 200, headers: noStore },
  );
}

/**
 * GET /api/ledger/records — most recent 50, newest first.
 * Authenticated + authorized read of audit fields only.
 */
export async function handleLedgerRecordsGet(
  request: Request,
  env: LedgerApiEnv,
  deps: Pick<LedgerApiDeps, "keyResolver"> = {},
): Promise<Response> {
  const guard = await requireLedgerCapability(request, env, "ledger.read", deps.keyResolver);
  if (!guard.ok) return ledgerGuardDenialResponse(guard);

  const db = env.LEDGER_DB;
  if (!db) return errorResponse(503, "LEDGER_UNAVAILABLE");

  const limitParam = new URL(request.url).searchParams.get("limit");
  const parsed = limitParam ? Number.parseInt(limitParam, 10) : NaN;
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : LEDGER_LIST_DEFAULT_LIMIT;

  const records = await listLedgerRecords(db, limit);
  return Response.json(
    { records: records.map(serializeLedgerRecord) },
    { headers: noStore },
  );
}
