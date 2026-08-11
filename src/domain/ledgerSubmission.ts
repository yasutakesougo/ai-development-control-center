import type { ApprovalIntent } from "./approvalIntent";

/**
 * Client-side Ledger submission state machine.
 *
 * Pure logic (testable without React):
 * - one idempotency key per submission attempt, generated when the Human
 *   presses 「Ledger に記録」 and retained for blind retries;
 * - unknown network results retry with the SAME key (never auto-regenerated);
 * - 409 STALE_DECISION discards the stale local intent and requires the Human
 *   to choose again after a status refresh — never auto-resubmits.
 */
export interface LedgerSubmissionAttempt {
  idempotencyKey: string;
  intent: ApprovalIntent;
  expectedDecisionFingerprint: string;
}

/** Audit projection returned by the Ledger APIs. */
export interface LedgerRecordSummary {
  recordId: string;
  repository: string;
  sourceRefs: string[];
  intent: string;
  recordedAt: string;
  observedAt: string;
  decisionFingerprint: string;
  submissionState: string;
  externalEffect: boolean;
  approver?: { issuer: string; subjectId: string };
}

export type LedgerSubmitOutcome =
  | { kind: "RECORDED"; replayed: boolean; record: LedgerRecordSummary }
  | { kind: "STALE_DECISION" }
  | { kind: "NO_RECORDABLE_DECISION" }
  | { kind: "IDEMPOTENCY_CONFLICT" }
  | { kind: "UNAUTHENTICATED" }
  | { kind: "FORBIDDEN" }
  | { kind: "LEDGER_UNAVAILABLE" }
  /** Result unknown (network failure / 5xx / malformed success) — retry with SAME key. */
  | { kind: "UNKNOWN_RESULT" };

export type LedgerSubmissionState =
  | { phase: "IDLE" }
  | { phase: "SUBMITTING"; attempt: LedgerSubmissionAttempt }
  | { phase: "RECORDED"; record: LedgerRecordSummary; replayed: boolean }
  /** Unknown result: keep the SAME attempt for manual retry. */
  | { phase: "RETRYABLE"; attempt: LedgerSubmissionAttempt }
  /** Stale decision: local intent discarded; Human must choose again. */
  | { phase: "STALE" }
  | {
      phase: "REFUSED";
      code: "NO_RECORDABLE_DECISION" | "IDEMPOTENCY_CONFLICT" | "UNAUTHENTICATED" | "FORBIDDEN" | "LEDGER_UNAVAILABLE";
    };

/**
 * Create one submission attempt with a fresh idempotency key.
 * Returns null when there is no server-provided fingerprint — the browser
 * never invents the authoritative fingerprint.
 */
export function beginLedgerSubmission(
  intent: ApprovalIntent,
  expectedDecisionFingerprint: string | null | undefined,
  generateKey: () => string = () => crypto.randomUUID(),
): LedgerSubmissionAttempt | null {
  if (!expectedDecisionFingerprint) return null;
  return {
    idempotencyKey: generateKey(),
    intent,
    expectedDecisionFingerprint,
  };
}

/** The attempt to reuse for a manual retry after an unknown result — same key. */
export function retryableAttempt(state: LedgerSubmissionState): LedgerSubmissionAttempt | null {
  return state.phase === "RETRYABLE" ? state.attempt : null;
}

function parseRecordSummary(value: unknown): LedgerRecordSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.recordId !== "string" || typeof record.recordedAt !== "string") return null;
  if (record.externalEffect !== false || record.submissionState !== "RECORDED") return null;
  return {
    recordId: record.recordId,
    repository: typeof record.repository === "string" ? record.repository : "",
    sourceRefs: Array.isArray(record.sourceRefs)
      ? record.sourceRefs.filter((ref): ref is string => typeof ref === "string")
      : [],
    intent: typeof record.intent === "string" ? record.intent : "",
    recordedAt: record.recordedAt,
    observedAt: typeof record.observedAt === "string" ? record.observedAt : "",
    decisionFingerprint:
      typeof record.decisionFingerprint === "string" ? record.decisionFingerprint : "",
    submissionState: "RECORDED",
    externalEffect: false,
    approver:
      typeof record.approver === "object" &&
      record.approver !== null &&
      typeof (record.approver as Record<string, unknown>).issuer === "string" &&
      typeof (record.approver as Record<string, unknown>).subjectId === "string"
        ? {
            issuer: (record.approver as Record<string, string>).issuer,
            subjectId: (record.approver as Record<string, string>).subjectId,
          }
        : undefined,
  };
}

/**
 * Classify an HTTP result from POST /api/ledger/records.
 * Anything ambiguous is UNKNOWN_RESULT so the Human can retry with the same key.
 */
export function classifyLedgerResponse(status: number, body: unknown): LedgerSubmitOutcome {
  const error =
    typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).error === "string"
      ? ((body as Record<string, unknown>).error as string)
      : null;

  if (status === 200 || status === 201) {
    const payload = body as Record<string, unknown> | null;
    const record = payload ? parseRecordSummary(payload.record) : null;
    if (payload?.recorded === true && record) {
      return { kind: "RECORDED", replayed: payload.replayed === true, record };
    }
    return { kind: "UNKNOWN_RESULT" };
  }

  if (status === 409) {
    if (error === "STALE_DECISION") return { kind: "STALE_DECISION" };
    if (error === "NO_RECORDABLE_DECISION") return { kind: "NO_RECORDABLE_DECISION" };
    if (error === "IDEMPOTENCY_CONFLICT") return { kind: "IDEMPOTENCY_CONFLICT" };
    return { kind: "UNKNOWN_RESULT" };
  }

  if (status === 401) return { kind: "UNAUTHENTICATED" };
  if (status === 403) return { kind: "FORBIDDEN" };
  if (status === 503) return { kind: "LEDGER_UNAVAILABLE" };
  if (status >= 400 && status < 500) return { kind: "UNKNOWN_RESULT" };
  return { kind: "UNKNOWN_RESULT" };
}

export interface LedgerOutcomeEffect {
  state: LedgerSubmissionState;
  /** Discard the stale local intent draft (Human must choose again). */
  discardIntent: boolean;
  /** Re-fetch server status (fresh fingerprint) before the next choice. */
  refreshStatus: boolean;
}

/** Apply a submission outcome. Never auto-resubmits. */
export function applyLedgerOutcome(
  attempt: LedgerSubmissionAttempt,
  outcome: LedgerSubmitOutcome,
): LedgerOutcomeEffect {
  switch (outcome.kind) {
    case "RECORDED":
      return {
        state: { phase: "RECORDED", record: outcome.record, replayed: outcome.replayed },
        discardIntent: true,
        refreshStatus: true,
      };
    case "STALE_DECISION":
      return { state: { phase: "STALE" }, discardIntent: true, refreshStatus: true };
    case "NO_RECORDABLE_DECISION":
      return {
        state: { phase: "REFUSED", code: "NO_RECORDABLE_DECISION" },
        discardIntent: true,
        refreshStatus: true,
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        state: { phase: "REFUSED", code: "IDEMPOTENCY_CONFLICT" },
        discardIntent: true,
        refreshStatus: true,
      };
    case "UNAUTHENTICATED":
      return { state: { phase: "REFUSED", code: "UNAUTHENTICATED" }, discardIntent: false, refreshStatus: false };
    case "FORBIDDEN":
      return { state: { phase: "REFUSED", code: "FORBIDDEN" }, discardIntent: false, refreshStatus: false };
    case "LEDGER_UNAVAILABLE":
      return { state: { phase: "REFUSED", code: "LEDGER_UNAVAILABLE" }, discardIntent: false, refreshStatus: false };
    case "UNKNOWN_RESULT":
      return { state: { phase: "RETRYABLE", attempt }, discardIntent: false, refreshStatus: false };
  }
}
