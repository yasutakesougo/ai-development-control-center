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
  /**
   * Exact requester binding. Must equal `request.requestedBy`.
   * Prevents moving one authorization into another idempotency scope.
   */
  authorizedRequestedBy: {
    principalKind: "HUMAN";
    subjectId: string;
    issuer?: string;
  };
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
  | "REJECTED_AUTHORIZATION_NOT_YET_VALID"
  | "REJECTED_FINGERPRINT_MISMATCH"
  | "REJECTED_TARGET_NOT_FOUND"
  | "REJECTED_TARGET_MISMATCH"
  | "REJECTED_PAYLOAD_LIMIT"
  | "REJECTED_IDEMPOTENCY_KEY_MISSING"
  | "REJECTED_IDEMPOTENCY_KEY_MISMATCH"
  | "REJECTED_REQUESTER_MISMATCH"
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

function requestedByEqual(
  a: { principalKind: string; subjectId: string; issuer?: string },
  b: { principalKind: string; subjectId: string; issuer?: string },
): boolean {
  return (
    a.principalKind === b.principalKind &&
    a.subjectId === b.subjectId &&
    (a.issuer ?? undefined) === (b.issuer ?? undefined)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTargetKind(value: unknown): value is ActionGatewayTargetKind {
  return value === "ISSUE" || value === "PULL_REQUEST";
}

function isTarget(value: unknown): value is ActionGatewayCommentTarget {
  return (
    isPlainObject(value) &&
    isTargetKind(value.kind) &&
    typeof value.number === "number" &&
    Number.isInteger(value.number) &&
    value.number >= 1
  );
}

function isRequestedBy(
  value: unknown,
): value is { principalKind: "HUMAN"; subjectId: string; issuer?: string } {
  if (!isPlainObject(value)) return false;
  if (value.principalKind !== "HUMAN") return false;
  if (typeof value.subjectId !== "string" || value.subjectId.length < 1) return false;
  if (value.issuer !== undefined && (typeof value.issuer !== "string" || value.issuer.length < 1)) {
    return false;
  }
  return true;
}

export interface ActionGatewayPreWriteOptions {
  /**
   * Independent evaluation clock (ISO-8601). Required.
   * Must not be derived from `authorizedAt`.
   * Validity window: authorizedAt <= nowIso <= effectiveExpiry.
   */
  nowIso: string;
  /**
   * Live read-only re-observation of target existence.
   * Must be the boolean `true` to proceed; omitted/false ⇒ REJECTED.
   */
  observedTargetExists?: boolean;
  /** Live observed repository; required and must equal request.repository. */
  observedRepository?: string;
  /** Live observed target kind; required and must equal request.target.kind. */
  observedTargetKind?: ActionGatewayTargetKind;
  /** Live observed target number; required and must equal request.target.number. */
  observedTargetNumber?: number;
  observedTargetNodeId?: string;
  observedTargetTitle?: string;
  /** If caller attempts to pass STATUS-OVERLAY as authorization. */
  overlayUsedAsAuthorization?: boolean;
}

/**
 * Structural fail-closed parse for request documents.
 * Never throws on malformed JSON-shaped input.
 */
export function parseActionGatewayCommentRequest(
  value: unknown,
):
  | { ok: true; request: ActionGatewayCommentRequestV1 }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request must be a JSON object.",
    };
  }
  if (
    value.schemaVersion !== ACTION_GATEWAY_COMMENT_REQUEST_SCHEMA ||
    value.capabilityId !== GITHUB_COMMENT_CREATE_CAPABILITY_ID
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request schemaVersion/capabilityId are not the V1 comment contract.",
    };
  }
  if (typeof value.repository !== "string" || !isTarget(value.target)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request repository/target are malformed.",
    };
  }
  if (typeof value.body !== "string" || typeof value.purpose !== "string") {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request body/purpose must be strings.",
    };
  }
  if (!validIdempotencyKey(value.idempotencyKey)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request idempotencyKey is malformed.",
    };
  }
  if (!isRequestedBy(value.requestedBy)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request requestedBy is malformed.",
    };
  }
  if (!isPlainObject(value.humanAuthorization) || !isPlainObject(value.expectedObservations)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request humanAuthorization/expectedObservations are malformed.",
    };
  }
  const auth = value.humanAuthorization;
  if (
    auth.authorizedCapabilityId !== GITHUB_COMMENT_CREATE_CAPABILITY_ID ||
    typeof auth.authorizedRepository !== "string" ||
    !isTarget(auth.authorizedTarget) ||
    typeof auth.authorizedRequestFingerprint !== "string" ||
    !validIdempotencyKey(auth.authorizedIdempotencyKey) ||
    !isRequestedBy(auth.authorizedRequestedBy) ||
    typeof auth.authorizedAt !== "string" ||
    (auth.expiresAt !== undefined && typeof auth.expiresAt !== "string") ||
    !Array.isArray(auth.evidenceRefs) ||
    !auth.evidenceRefs.every((ref) => typeof ref === "string")
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request humanAuthorization fields are malformed.",
    };
  }
  const expected = value.expectedObservations;
  if (
    typeof expected.repository !== "string" ||
    !isTargetKind(expected.targetKind) ||
    typeof expected.targetNumber !== "number" ||
    expected.targetExists !== true ||
    (expected.targetNodeId !== undefined && typeof expected.targetNodeId !== "string") ||
    (expected.targetTitle !== undefined && typeof expected.targetTitle !== "string")
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request expectedObservations fields are malformed.",
    };
  }

  return {
    ok: true,
    request: value as unknown as ActionGatewayCommentRequestV1,
  };
}

/**
 * Structural fail-closed parse for evaluation options.
 * Never throws on malformed input.
 */
export function parseActionGatewayPreWriteOptions(
  value: unknown,
):
  | { ok: true; options: ActionGatewayPreWriteOptions }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Evaluation options must be a JSON object.",
    };
  }
  if (typeof value.nowIso !== "string") {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Evaluation options.nowIso must be a string.",
    };
  }
  if (
    value.observedTargetExists !== undefined &&
    typeof value.observedTargetExists !== "boolean"
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Evaluation options.observedTargetExists must be boolean when present.",
    };
  }
  if (
    value.observedRepository !== undefined &&
    typeof value.observedRepository !== "string"
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Evaluation options.observedRepository must be a string when present.",
    };
  }
  if (
    value.observedTargetKind !== undefined &&
    !isTargetKind(value.observedTargetKind)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Evaluation options.observedTargetKind is malformed.",
    };
  }
  if (
    value.observedTargetNumber !== undefined &&
    (typeof value.observedTargetNumber !== "number" ||
      !Number.isInteger(value.observedTargetNumber))
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Evaluation options.observedTargetNumber is malformed.",
    };
  }
  return { ok: true, options: value as unknown as ActionGatewayPreWriteOptions };
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
 * Pure pre-write evaluation. Never calls GitHub. Accepts unknown runtime JSON
 * and fail-closes as REJECTED_SCHEMA instead of throwing.
 * On success returns ELIGIBLE with executionImplemented=false.
 */
export async function evaluateCommentRequestPreWrite(
  requestInput: unknown,
  optionsInput: unknown,
): Promise<ActionGatewayPreWriteEvaluation> {
  const parsedOptions = parseActionGatewayPreWriteOptions(optionsInput);
  if (!parsedOptions.ok) {
    return rejected(parsedOptions.reasonCode, parsedOptions.reasonMessage, null);
  }
  const options = parsedOptions.options;

  if (options.overlayUsedAsAuthorization) {
    return rejected(
      "REJECTED_OVERLAY_NOT_AUTHORIZATION",
      "STATUS-OVERLAY recommendations never authorize Action Gateway mutations.",
      null,
    );
  }

  const parsedRequest = parseActionGatewayCommentRequest(requestInput);
  if (!parsedRequest.ok) {
    return rejected(parsedRequest.reasonCode, parsedRequest.reasonMessage, null);
  }
  const request = parsedRequest.request;

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
    request.body.length < 1 ||
    request.body.length > ACTION_GATEWAY_COMMENT_BODY_MAX ||
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

  if (!requestedByEqual(auth.authorizedRequestedBy, request.requestedBy)) {
    return rejected(
      "REJECTED_REQUESTER_MISMATCH",
      "Human authorization is not bound to this requestedBy principal and cannot be moved across idempotency scopes.",
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

  if (auth.authorizedIdempotencyKey !== request.idempotencyKey) {
    return rejected(
      "REJECTED_IDEMPOTENCY_KEY_MISMATCH",
      "Human authorization is bound to a different idempotencyKey and cannot be reused.",
      fingerprint,
    );
  }

  if (auth.evidenceRefs.length < 1) {
    return rejected(
      "REJECTED_AUTHORIZATION_MISSING",
      "humanAuthorization.evidenceRefs must be non-empty.",
      fingerprint,
    );
  }

  if (options.nowIso.length < 1) {
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

  if (now < authorizedAt) {
    return rejected(
      "REJECTED_AUTHORIZATION_NOT_YET_VALID",
      "Evaluation clock is earlier than authorizedAt; authorization is not yet valid.",
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

  if (
    typeof options.observedRepository !== "string" ||
    !isTargetKind(options.observedTargetKind) ||
    typeof options.observedTargetNumber !== "number"
  ) {
    return rejected(
      "REJECTED_OBSERVATION_MISSING",
      "Live observation must include observedRepository, observedTargetKind, and observedTargetNumber.",
      fingerprint,
    );
  }

  if (
    options.observedRepository !== request.repository ||
    options.observedTargetKind !== request.target.kind ||
    options.observedTargetNumber !== request.target.number
  ) {
    return rejected(
      "REJECTED_TARGET_MISMATCH",
      "Live observed repository/kind/number do not match the request target.",
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
 * idempotency scope; never invent a new write. Malformed priors fail closed to UNKNOWN.
 */
export function reconcileUnknownCommentOutcome(input: {
  priorByIdempotencyKey: unknown;
  markerMatch: unknown;
}):
  | { status: "SUCCEEDED"; source: "PRIOR_RESULT" | "MARKER"; resultHint: { id: number; url: string } }
  | { status: "UNKNOWN"; source: "UNPROVEN" } {
  if (isPlainObject(input.priorByIdempotencyKey)) {
    const prior = input.priorByIdempotencyKey;
    if (
      prior.status === "SUCCEEDED" &&
      isPlainObject(prior.comment) &&
      typeof prior.comment.id === "number" &&
      typeof prior.comment.url === "string"
    ) {
      return {
        status: "SUCCEEDED",
        source: "PRIOR_RESULT",
        resultHint: { id: prior.comment.id, url: prior.comment.url },
      };
    }
  }
  if (
    isPlainObject(input.markerMatch) &&
    typeof input.markerMatch.id === "number" &&
    typeof input.markerMatch.url === "string"
  ) {
    return {
      status: "SUCCEEDED",
      source: "MARKER",
      resultHint: { id: input.markerMatch.id, url: input.markerMatch.url },
    };
  }
  return { status: "UNKNOWN", source: "UNPROVEN" };
}

/** Result shape invariants used by tests and future adapters. Never throws. */
export function assertCommentResultInvariants(result: unknown): string[] {
  const errors: string[] = [];
  if (!isPlainObject(result)) {
    return ["result_not_object"];
  }
  if (result.schemaVersion !== ACTION_GATEWAY_COMMENT_RESULT_SCHEMA) {
    errors.push("schemaVersion");
  }
  if (result.capabilityId !== GITHUB_COMMENT_CREATE_CAPABILITY_ID) {
    errors.push("capabilityId");
  }
  const status = result.status;
  const comment = result.comment;
  if (status === "SUCCEEDED") {
    if (
      !isPlainObject(comment) ||
      typeof comment.id !== "number" ||
      typeof comment.url !== "string"
    ) {
      errors.push("SUCCEEDED_requires_comment");
    }
  } else if (
    status === "REJECTED" ||
    status === "FAILED" ||
    status === "UNKNOWN"
  ) {
    if (comment !== undefined) {
      errors.push(`${status}_forbids_comment`);
    }
  }
  if (status === "REJECTED") {
    const timestamps = result.timestamps;
    if (isPlainObject(timestamps) && timestamps.attemptedAt !== undefined) {
      errors.push("REJECTED_forbids_attemptedAt");
    }
  }
  if (
    typeof result.reasonMessage === "string" &&
    /"?(authorization|token|bearer)"?\s*[:=]/i.test(result.reasonMessage)
  ) {
    errors.push("reasonMessage_looks_secretive");
  }
  return errors;
}
