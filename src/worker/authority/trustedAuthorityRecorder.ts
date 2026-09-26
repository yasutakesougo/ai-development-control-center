import {
  AUTHORIZATION_RECEIPT_ALG,
  AUTHORIZATION_RECEIPT_V1,
  computeCanonicalApprovalDigest,
  issueAuthorizationReceipt,
  parseCanonicalApprovalPayload,
  parseReceiptHmacKey,
  type CanonicalApprovalPayloadV1,
} from "../../domain/authorityApproval";
import {
  accessVerifierConfigFromEnv,
  extractAccessJwt,
  getAccessJwksResolver,
  verifyAccessHumanJwt,
  type AccessKeyResolver,
} from "../auth/accessJwtVerifier";
import type { D1DatabaseLike } from "../ledger/ledgerStore";
import {
  appendAuthorityApprovalRecord,
  type AuthorityApprovalRecord,
} from "./authorityStore";

export type AuthorityRecorderEnv = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Explicit opt-in. Anything else fails closed. */
  AUTHORITY_AUTHZ_MODE?: string;
  /** Existing staging D1 binding used for append-only authority records. */
  LEDGER_DB?: D1DatabaseLike;
  /** Base64url-encoded HMAC key, minimum 256 bits. */
  AUTHORIZATION_RECEIPT_HMAC_KEY?: string;
};

export interface AuthorityRecorderDeps {
  keyResolver?: AccessKeyResolver;
  now?: () => Date;
  newApprovalRecordId?: () => string;
  newReceiptId?: () => string;
}

type ApprovalRequestBody = {
  decision: "APPROVE";
  human_decision_ref: string;
  payload: CanonicalApprovalPayloadV1;
};

function parseRequestBody(raw: unknown): ApprovalRequestBody | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (body.decision !== "APPROVE") return null;
  if (typeof body.human_decision_ref !== "string" || !body.human_decision_ref.trim()) return null;
  const payload = parseCanonicalApprovalPayload(body.payload);
  if (!payload) return null;
  return {
    decision: "APPROVE",
    human_decision_ref: body.human_decision_ref.trim(),
    payload,
  };
}

function errorResponse(status: number, error: string): Response {
  return Response.json(
    { recorded: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function serializeRecord(record: AuthorityApprovalRecord): Record<string, unknown> {
  return {
    approvalRecordId: record.approvalRecordId,
    payloadDigest: record.payloadDigest,
    humanDecisionRef: record.humanDecisionRef,
    approver: {
      issuer: record.approverIssuer,
      subjectId: record.approverSubjectId,
    },
    issuedAt: record.issuedAt,
  };
}

/**
 * Trusted Authority Recorder.
 *
 * Human APPROVE is authenticated with a Cloudflare Access Human JWT. The
 * recorder writes an append-only record and signs a receipt; it never performs
 * the approved state change itself.
 */
export async function handleAuthorityApprovalPost(
  request: Request,
  env: AuthorityRecorderEnv,
  deps: AuthorityRecorderDeps = {},
): Promise<Response> {
  if (env.AUTHORITY_AUTHZ_MODE?.trim() !== "access-policy") {
    return errorResponse(403, "AUTHORITY_AUTHZ_UNAVAILABLE");
  }

  const verifierConfig = accessVerifierConfigFromEnv(env);
  if (!verifierConfig) return errorResponse(401, "UNAUTHENTICATED");

  const token = extractAccessJwt(request);
  const resolver = deps.keyResolver ?? getAccessJwksResolver(verifierConfig.expectedIssuer);
  const verified = await verifyAccessHumanJwt(token, verifierConfig, resolver);
  if (!verified.ok) return errorResponse(401, "UNAUTHENTICATED");

  const db = env.LEDGER_DB;
  const receiptKey = parseReceiptHmacKey(env.AUTHORIZATION_RECEIPT_HMAC_KEY);
  if (!db || !receiptKey) return errorResponse(503, "AUTHORITY_RECORDER_UNAVAILABLE");

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(400, "INVALID_REQUEST_BODY");
  }
  const body = parseRequestBody(rawBody);
  if (!body) return errorResponse(400, "INVALID_REQUEST_BODY");

  const payloadDigest = await computeCanonicalApprovalDigest(body.payload);
  const issuedAt = (deps.now?.() ?? new Date()).toISOString();
  const approvalRecordId = deps.newApprovalRecordId?.() ?? crypto.randomUUID();
  const receiptId = deps.newReceiptId?.() ?? crypto.randomUUID();

  const receipt = await issueAuthorizationReceipt(
    {
      schema_version: AUTHORIZATION_RECEIPT_V1,
      signature_alg: AUTHORIZATION_RECEIPT_ALG,
      receipt_id: receiptId,
      approval_record_id: approvalRecordId,
      payload_digest: payloadDigest,
      human_decision_ref: body.human_decision_ref,
      approver: {
        issuer: verified.principal.issuer,
        subject_id: verified.principal.subjectId,
      },
      issued_at: issuedAt,
      replay_mode: "SINGLE_USE",
    },
    receiptKey,
  );

  const stored = await appendAuthorityApprovalRecord(db, {
    approvalRecordId,
    payload: body.payload,
    payloadDigest,
    humanDecisionRef: body.human_decision_ref,
    approverIssuer: verified.principal.issuer,
    approverSubjectId: verified.principal.subjectId,
    issuedAt,
    receipt,
  });

  if (stored.outcome === "DECISION_REF_CONFLICT") {
    return errorResponse(409, "HUMAN_DECISION_REF_CONFLICT");
  }

  return Response.json(
    {
      recorded: true,
      replayed: stored.outcome === "REPLAYED",
      approval: serializeRecord(stored.record),
      receipt: stored.record.receipt,
      externalEffect: false,
    },
    {
      status: stored.outcome === "RECORDED" ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
