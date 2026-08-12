/**
 * ACTION-GATEWAY-V1 / github.comment.create.v1 design contract helpers.
 *
 * DESIGNED · NOT IMPLEMENTED · NO GITHUB WRITE · NO WORKER ROUTE
 *
 * Pure validation / fingerprint / outcome-shape invariants for the future
 * Action Gateway comment capability. Does not call GitHub, expand token
 * scope, or authorize Ready / Merge / Close / workflow / file writes.
 */

import { canonicalJson } from "./decisionFingerprint";

export const ACTION_GATEWAY_COMMENT_REQUEST_SCHEMA =
  "ACTION-GATEWAY-COMMENT-REQUEST-V1" as const;
export const ACTION_GATEWAY_COMMENT_RESULT_SCHEMA =
  "ACTION-GATEWAY-COMMENT-RESULT-V1" as const;
export const GITHUB_COMMENT_CREATE_CAPABILITY_ID =
  "github.comment.create.v1" as const;

/** Execution / adapter remains unimplemented in this design-only slice. */
export const ACTION_GATEWAY_EXECUTION_IMPLEMENTED = false as const;
export const GITHUB_COMMENT_ADAPTER_IMPLEMENTED = false as const;

export const ACTION_GATEWAY_ALLOWED_CAPABILITIES = [
  GITHUB_COMMENT_CREATE_CAPABILITY_ID,
] as const;

export const ACTION_GATEWAY_ALLOWED_REPOSITORIES = [
  "yasutakesougo/ai-development-control-center",
] as const;

export const ACTION_GATEWAY_COMMENT_BODY_MAX = 65536 as const;
export const ACTION_GATEWAY_COMMENT_PURPOSE_MAX = 2048 as const;
export const ACTION_GATEWAY_IDEMPOTENCY_KEY_MAX = 128 as const;

/**
 * When `humanAuthorization.expiresAt` is omitted, authorization expires at
 * `authorizedAt + DEFAULT_TTL_MS`. Evaluation must supply an independent clock
 * (`nowIso`); `authorizedAt` is never treated as "now".
 */
export const ACTION_GATEWAY_AUTHORIZATION_DEFAULT_TTL_MS = 60 * 60 * 1000;

export type ActionGatewayTargetKind = "ISSUE" | "PULL_REQUEST";

export type ActionGatewayCommentResultStatus =
  | "SUCCEEDED"
  | "REJECTED"
  | "FAILED"
  | "UNKNOWN";

export interface ActionGatewayCommentTarget {
  kind: ActionGatewayTargetKind;
  number: number;
}

export interface ActionGatewayCommentRequestFacts {
  capabilityId: typeof GITHUB_COMMENT_CREATE_CAPABILITY_ID;
  repository: string;
  target: ActionGatewayCommentTarget;
  body: string;
  purpose: string;
}

export interface ActionGatewayHumanAuthorization {
  authorizedCapabilityId: typeof GITHUB_COMMENT_CREATE_CAPABILITY_ID;
  authorizedRepository: string;
  authorizedTarget: ActionGatewayCommentTarget;
  authorizedRequestFingerprint: string;
  /**
   * Exact attempt binding. Must equal `request.idempotencyKey`.
   * Prevents reusing one Human authorization across different keys.
   */
  authorizedIdempotencyKey: string;
  authorizedAt: string;
  /** Optional absolute expiry. If omitted, default TTL from authorizedAt applies. */
  expiresAt?: string;
  evidenceRefs: string[];
}

export interface ActionGatewayExpectedObservations {
  repository: string;
  targetKind: ActionGatewayTargetKind;
  targetNumber: number;
  targetExists: true;
  targetNodeId?: string;
  targetTitle?: string;
}

export interface ActionGatewayCommentRequestV1 {
  schemaVersion: typeof ACTION_GATEWAY_COMMENT_REQUEST_SCHEMA;
  capabilityId: typeof GITHUB_COMMENT_CREATE_CAPABILITY_ID;
  repository: string;
  target: ActionGatewayCommentTarget;
  body: string;
  purpose: string;
  idempotencyKey: string;
  requestedBy: {
    principalKind: "HUMAN";
    subjectId: string;
    issuer?: string;
  };
  humanAuthorization: ActionGatewayHumanAuthorization;
  expectedObservations: ActionGatewayExpectedObservations;
}

export interface ActionGatewayCommentResultV1 {
  schemaVersion: typeof ACTION_GATEWAY_COMMENT_RESULT_SCHEMA;
  capabilityId: typeof GITHUB_COMMENT_CREATE_CAPABILITY_ID;
  status: ActionGatewayCommentResultStatus;
  repository: string;
  target: ActionGatewayCommentTarget;
  comment?: { id: number; url: string };
  requestFingerprint: string;
  idempotencyKey: string;
  authorization: {
    matched: boolean;
    evidenceRefs: string[];
  };
  timestamps: {
    acceptedAt?: string;
    attemptedAt?: string;
    completedAt: string;
  };
  reasonCode: string;
  reasonMessage: string;
}

export type ActionGatewayRejectReason =
  | "REJECTED_SCHEMA"
  | "REJECTED_CAPABILITY_NOT_ALLOWED"
  | "REJECTED_REPOSITORY_NOT_ALLOWED"
  | "REJECTED_AUTHORIZATION_MISSING"
  | "REJECTED_AUTHORIZATION_MISMATCH"
  | "REJECTED_AUTHORIZATION_EXPIRED"
  | "REJECTED_FINGERPRINT_MISMATCH"
  | "REJECTED_TARGET_NOT_FOUND"
  | "REJECTED_TARGET_MISMATCH"
  | "REJECTED_PAYLOAD_LIMIT"
  | "REJECTED_IDEMPOTENCY_KEY_MISSING"
  | "REJECTED_IDEMPOTENCY_KEY_MISMATCH"
  | "REJECTED_OBSERVATION_MISSING"
  | "REJECTED_EVALUATION_CLOCK_MISSING"
  | "REJECTED_OVERLAY_NOT_AUTHORIZATION";

export interface ActionGatewayEvaluationRejected {
  status: "REJECTED";
  reasonCode: ActionGatewayRejectReason;
  reasonMessage: string;
  requestFingerprint: string | null;
  writeAttempted: false;
}

export interface ActionGatewayEvaluationEligible {
  status: "ELIGIBLE_FOR_ADAPTER";
  reasonCode: "ELIGIBLE";
  reasonMessage: string;
  requestFingerprint: string;
  writeAttempted: false;
  /** Execution remains unimplemented — callers must not invoke GitHub. */
  executionImplemented: false;
}

export type ActionGatewayPreWriteEvaluation =
  | ActionGatewayEvaluationRejected
  | ActionGatewayEvaluationEligible;

/** Semantic facts included in the request fingerprint (no audit/auth fields). */
export function commentRequestFingerprintFacts(
  input: ActionGatewayCommentRequestFacts,
): ActionGatewayCommentRequestFacts {
  return {
    capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
    repository: input.repository,
    target: {
      kind: input.target.kind,
      number: input.target.number,
    },
    body: input.body,
    purpose: input.purpose,
  };
}

export async function computeCommentRequestFingerprint(
  input: ActionGatewayCommentRequestFacts,
): Promise<string> {
  const canonical = canonicalJson(commentRequestFingerprintFacts(input));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isAllowedCapability(id: string): boolean {
  return (ACTION_GATEWAY_ALLOWED_CAPABILITIES as readonly string[]).includes(id);
}

function isAllowedRepository(repo: string): boolean {
  return (ACTION_GATEWAY_ALLOWED_REPOSITORIES as readonly string[]).includes(repo);
}

function validIdempotencyKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length <= ACTION_GATEWAY_IDEMPOTENCY_KEY_MAX &&
    /^[\x20-\x7E]+$/.test(key)
  );
}

function targetsEqual(
  a: ActionGatewayCommentTarget,
  b: ActionGatewayCommentTarget,
): boolean {
  return a.kind === b.kind && a.number === b.number;
}

export interface ActionGatewayPreWriteOptions {
  /**
   * Independent evaluation clock (ISO-8601). Required.
   * Must not be derived from `authorizedAt`.
   */
  nowIso: string;
  /**
   * Live read-only re-observation of target existence.
   * Must be the boolean `true` to proceed; omitted/false ⇒ REJECTED.
   */
  observedTargetExists?: boolean;
  observedTargetNodeId?: string;
  observedTargetTitle?: string;
  /** If caller attempts to pass STATUS-OVERLAY as authorization. */
  overlayUsedAsAuthorization?: boolean;
}

/**
 * Effective authorization expiry:
 * - explicit `expiresAt` when present and valid
 * - otherwise `authorizedAt + ACTION_GATEWAY_AUTHORIZATION_DEFAULT_TTL_MS`
 */
export function effectiveAuthorizationExpiryMs(
  authorizedAtIso: string,
  expiresAtIso?: string,
): number | null {
  const authorizedAt = Date.parse(authorizedAtIso);
  if (!Number.isFinite(authorizedAt)) return null;
  if (expiresAtIso !== undefined) {
    const expiresAt = Date.parse(expiresAtIso);
    return Number.isFinite(expiresAt) ? expiresAt : null;
  }
  return authorizedAt + ACTION_GATEWAY_AUTHORIZATION_DEFAULT_TTL_MS;
}

/**
 * Pure pre-write evaluation. Never calls GitHub. On success returns ELIGIBLE
 * with executionImplemented=false so callers cannot treat this as authorization
 * to mutate.
 */
export async function evaluateCommentRequestPreWrite(
  request: ActionGatewayCommentRequestV1,
  options: ActionGatewayPreWriteOptions,
): Promise<ActionGatewayPreWriteEvaluation> {
  if (options.overlayUsedAsAuthorization) {
    return rejected(
      "REJECTED_OVERLAY_NOT_AUTHORIZATION",
      "STATUS-OVERLAY recommendations never authorize Action Gateway mutations.",
      null,
    );
  }

  if (
    request.schemaVersion !== ACTION_GATEWAY_COMMENT_REQUEST_SCHEMA ||
    request.capabilityId !== GITHUB_COMMENT_CREATE_CAPABILITY_ID
  ) {
    return rejected(
      "REJECTED_SCHEMA",
      "Request schemaVersion/capabilityId are not the V1 comment contract.",
      null,
    );
  }

  if (!isAllowedCapability(request.capabilityId)) {
    return rejected(
      "REJECTED_CAPABILITY_NOT_ALLOWED",
      "Capability is outside the Action Gateway V1 allowlist.",
      null,
    );
  }

  if (!isAllowedRepository(request.repository)) {
    return rejected(
      "REJECTED_REPOSITORY_NOT_ALLOWED",
      "Repository is outside the Action Gateway V1 allowlist.",
      null,
    );
  }

  if (!validIdempotencyKey(request.idempotencyKey)) {
    return rejected(
      "REJECTED_IDEMPOTENCY_KEY_MISSING",
      "idempotencyKey is required and must be printable ASCII ≤128 chars.",
      null,
    );
  }

  if (
    typeof request.body !== "string" ||
    request.body.length < 1 ||
    request.body.length > ACTION_GATEWAY_COMMENT_BODY_MAX ||
    typeof request.purpose !== "string" ||
    request.purpose.length < 1 ||
    request.purpose.length > ACTION_GATEWAY_COMMENT_PURPOSE_MAX
  ) {
    return rejected(
      "REJECTED_PAYLOAD_LIMIT",
      "body/purpose failed size or emptiness limits.",
      null,
    );
  }

  const auth = request.humanAuthorization;
  if (!auth) {
    return rejected(
      "REJECTED_AUTHORIZATION_MISSING",
      "humanAuthorization is required.",
      null,
    );
  }

  const fingerprint = await computeCommentRequestFingerprint({
    capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
    repository: request.repository,
    target: request.target,
    body: request.body,
    purpose: request.purpose,
  });

  if (
    auth.authorizedCapabilityId !== request.capabilityId ||
    auth.authorizedRepository !== request.repository ||
    !targetsEqual(auth.authorizedTarget, request.target) ||
    auth.authorizedRepository !== request.expectedObservations.repository ||
    auth.authorizedTarget.kind !== request.expectedObservations.targetKind ||
    auth.authorizedTarget.number !== request.expectedObservations.targetNumber
  ) {
    return rejected(
      "REJECTED_AUTHORIZATION_MISMATCH",
      "Human authorization is not bound to this capability/repository/target.",
      fingerprint,
    );
  }

  if (auth.authorizedRequestFingerprint !== fingerprint) {
    return rejected(
      "REJECTED_FINGERPRINT_MISMATCH",
      "authorizedRequestFingerprint does not match the request semantic fingerprint.",
      fingerprint,
    );
  }

  if (!validIdempotencyKey(auth.authorizedIdempotencyKey)) {
    return rejected(
      "REJECTED_AUTHORIZATION_MISSING",
      "humanAuthorization.authorizedIdempotencyKey is required.",
      fingerprint,
    );
  }

  if (auth.authorizedIdempotencyKey !== request.idempotencyKey) {
    return rejected(
      "REJECTED_IDEMPOTENCY_KEY_MISMATCH",
      "Human authorization is bound to a different idempotencyKey and cannot be reused.",
      fingerprint,
    );
  }

  if (!Array.isArray(auth.evidenceRefs) || auth.evidenceRefs.length < 1) {
    return rejected(
      "REJECTED_AUTHORIZATION_MISSING",
      "humanAuthorization.evidenceRefs must be non-empty.",
      fingerprint,
    );
  }

  if (typeof options.nowIso !== "string" || options.nowIso.length < 1) {
    return rejected(
      "REJECTED_EVALUATION_CLOCK_MISSING",
      "Evaluation requires an independent nowIso clock; authorizedAt is never used as now.",
      fingerprint,
    );
  }

  const now = Date.parse(options.nowIso);
  if (!Number.isFinite(now)) {
    return rejected(
      "REJECTED_EVALUATION_CLOCK_MISSING",
      "nowIso must be a valid ISO-8601 timestamp.",
      fingerprint,
    );
  }

  const authorizedAt = Date.parse(auth.authorizedAt);
  if (!Number.isFinite(authorizedAt)) {
    return rejected(
      "REJECTED_AUTHORIZATION_MISSING",
      "authorizedAt must be a valid timestamp.",
      fingerprint,
    );
  }

  const expiresAtMs = effectiveAuthorizationExpiryMs(auth.authorizedAt, auth.expiresAt);
  if (expiresAtMs === null || now > expiresAtMs) {
    return rejected(
      "REJECTED_AUTHORIZATION_EXPIRED",
      "Human authorization is expired (explicit expiresAt or default TTL from authorizedAt).",
      fingerprint,
    );
  }

  if (
    request.expectedObservations.targetExists !== true ||
    request.expectedObservations.repository !== request.repository ||
    request.expectedObservations.targetKind !== request.target.kind ||
    request.expectedObservations.targetNumber !== request.target.number
  ) {
    return rejected(
      "REJECTED_TARGET_MISMATCH",
      "expectedObservations do not match the request target/repository.",
      fingerprint,
    );
  }

  if (options.observedTargetExists !== true) {
    return rejected(
      options.observedTargetExists === false
        ? "REJECTED_TARGET_NOT_FOUND"
        : "REJECTED_OBSERVATION_MISSING",
      options.observedTargetExists === false
        ? "Target Issue/PR was not observed as existing."
        : "Live target re-observation is required before any write eligibility.",
      fingerprint,
    );
  }

  if (request.expectedObservations.targetNodeId) {
    if (!options.observedTargetNodeId) {
      return rejected(
        "REJECTED_OBSERVATION_MISSING",
        "expectedObservations.targetNodeId requires a live observedTargetNodeId.",
        fingerprint,
      );
    }
    if (request.expectedObservations.targetNodeId !== options.observedTargetNodeId) {
      return rejected(
        "REJECTED_TARGET_MISMATCH",
        "Observed targetNodeId does not match expectedObservations.",
        fingerprint,
      );
    }
  }

  if (request.expectedObservations.targetTitle) {
    if (!options.observedTargetTitle) {
      return rejected(
        "REJECTED_OBSERVATION_MISSING",
        "expectedObservations.targetTitle requires a live observedTargetTitle.",
        fingerprint,
      );
    }
    if (request.expectedObservations.targetTitle !== options.observedTargetTitle) {
      return rejected(
        "REJECTED_TARGET_MISMATCH",
        "Observed targetTitle does not match expectedObservations.",
        fingerprint,
      );
    }
  }

  return {
    status: "ELIGIBLE_FOR_ADAPTER",
    reasonCode: "ELIGIBLE",
    reasonMessage:
      "Request passed pre-write checks. Adapter execution is NOT IMPLEMENTED in this slice.",
    requestFingerprint: fingerprint,
    writeAttempted: false,
    executionImplemented: false,
  };
}

function rejected(
  reasonCode: ActionGatewayRejectReason,
  reasonMessage: string,
  requestFingerprint: string | null,
): ActionGatewayEvaluationRejected {
  return {
    status: "REJECTED",
    reasonCode,
    reasonMessage,
    requestFingerprint,
    writeAttempted: false,
  };
}

/**
 * Idempotent UNKNOWN reconciliation: prefer a prior SUCCEEDED under the same
 * idempotency scope; never invent a new write.
 */
export function reconcileUnknownCommentOutcome(input: {
  priorByIdempotencyKey: ActionGatewayCommentResultV1 | null;
  markerMatch: { id: number; url: string } | null;
}):
  | { status: "SUCCEEDED"; source: "PRIOR_RESULT" | "MARKER"; resultHint: { id: number; url: string } }
  | { status: "UNKNOWN"; source: "UNPROVEN" } {
  if (input.priorByIdempotencyKey?.status === "SUCCEEDED" && input.priorByIdempotencyKey.comment) {
    return {
      status: "SUCCEEDED",
      source: "PRIOR_RESULT",
      resultHint: input.priorByIdempotencyKey.comment,
    };
  }
  if (input.markerMatch) {
    return {
      status: "SUCCEEDED",
      source: "MARKER",
      resultHint: input.markerMatch,
    };
  }
  return { status: "UNKNOWN", source: "UNPROVEN" };
}

/** Result shape invariants used by tests and future adapters. */
export function assertCommentResultInvariants(
  result: ActionGatewayCommentResultV1,
): string[] {
  const errors: string[] = [];
  if (result.schemaVersion !== ACTION_GATEWAY_COMMENT_RESULT_SCHEMA) {
    errors.push("schemaVersion");
  }
  if (result.capabilityId !== GITHUB_COMMENT_CREATE_CAPABILITY_ID) {
    errors.push("capabilityId");
  }
  if (result.status === "SUCCEEDED") {
    if (!result.comment?.id || !result.comment.url) errors.push("SUCCEEDED_requires_comment");
  }
  if (result.status === "REJECTED") {
    if (result.comment) errors.push("REJECTED_forbids_comment");
    if (result.timestamps.attemptedAt) errors.push("REJECTED_forbids_attemptedAt");
  }
  if (/"?(authorization|token|bearer)"?\s*[:=]/i.test(result.reasonMessage)) {
    errors.push("reasonMessage_looks_secretive");
  }
  return errors;
}
