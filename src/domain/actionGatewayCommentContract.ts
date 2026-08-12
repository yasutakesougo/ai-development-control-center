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
export const ACTION_GATEWAY_AUTHORIZATION_ARTIFACT_KIND =
  "SERVER_ISSUED_AUTHORIZATION_V1" as const;

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
export const ACTION_GATEWAY_EVIDENCE_REFS_MAX = 16 as const;
export const ACTION_GATEWAY_EVIDENCE_REF_MAX_LEN = 2048 as const;
export const ACTION_GATEWAY_ARTIFACT_ID_MAX = 128 as const;

/**
 * When `humanAuthorization.expiresAt` is omitted, authorization expires at
 * `authorizedAt + DEFAULT_TTL_MS`. Evaluation must supply an independent clock
 * (`nowIso`); `authorizedAt` is never treated as "now".
 */
export const ACTION_GATEWAY_AUTHORIZATION_DEFAULT_TTL_MS = 60 * 60 * 1000;

/** Exact root keys accepted by the V1 request schema (additionalProperties: false). */
export const ACTION_GATEWAY_REQUEST_ROOT_KEYS = [
  "schemaVersion",
  "capabilityId",
  "repository",
  "target",
  "body",
  "purpose",
  "idempotencyKey",
  "requestedBy",
  "humanAuthorization",
  "expectedObservations",
] as const;

export const ACTION_GATEWAY_HUMAN_AUTH_KEYS = [
  "authorizedCapabilityId",
  "authorizedRepository",
  "authorizedTarget",
  "authorizedRequestFingerprint",
  "authorizedIdempotencyKey",
  "authorizedRequestedBy",
  "authorizationArtifact",
  "authorizedAt",
  "expiresAt",
  "evidenceRefs",
] as const;

export type ActionGatewayTargetKind = "ISSUE" | "PULL_REQUEST";

export interface ActionGatewayCommentTarget {
  kind: ActionGatewayTargetKind;
  number: number;
}

export interface ActionGatewayPrincipal {
  principalKind: "HUMAN";
  subjectId: string;
  issuer?: string;
}

export interface ActionGatewayCommentRequestFacts {
  capabilityId: typeof GITHUB_COMMENT_CREATE_CAPABILITY_ID;
  repository: string;
  target: ActionGatewayCommentTarget;
  body: string;
  purpose: string;
}

/**
 * Opaque handle to a server-issued authorization artifact.
 * Callers may present the id; they must not invent the artifact contents.
 * Gateway re-verifies against a trusted store (future Approval Ledger grant,
 * dedicated authorization table, or signed server artifact).
 */
export interface ActionGatewayAuthorizationArtifactRef {
  kind: typeof ACTION_GATEWAY_AUTHORIZATION_ARTIFACT_KIND;
  artifactId: string;
  /** Optional non-secret locator for humans/audit; never a token. */
  artifactLocator?: string;
}

export interface ActionGatewayHumanAuthorization {
  authorizedCapabilityId: typeof GITHUB_COMMENT_CREATE_CAPABILITY_ID;
  authorizedRepository: string;
  authorizedTarget: ActionGatewayCommentTarget;
  authorizedRequestFingerprint: string;
  authorizedIdempotencyKey: string;
  authorizedRequestedBy: ActionGatewayPrincipal;
  /**
   * Trusted provenance handle. evidenceRefs alone never authorize.
   * Server must re-verify this artifact before any write eligibility.
   */
  authorizationArtifact: ActionGatewayAuthorizationArtifactRef;
  authorizedAt: string;
  expiresAt?: string;
  /**
   * Supplemental non-secret audit pointers only.
   * Not sufficient as authorization provenance by themselves.
   */
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
  requestedBy: ActionGatewayPrincipal;
  humanAuthorization: ActionGatewayHumanAuthorization;
  expectedObservations: ActionGatewayExpectedObservations;
}

export type ActionGatewayCommentResultStatus =
  | "SUCCEEDED"
  | "REJECTED"
  | "FAILED"
  | "UNKNOWN";

interface ActionGatewayCommentResultBase {
  schemaVersion: typeof ACTION_GATEWAY_COMMENT_RESULT_SCHEMA;
  capabilityId: typeof GITHUB_COMMENT_CREATE_CAPABILITY_ID;
  repository: string;
  target: ActionGatewayCommentTarget;
  requestFingerprint: string;
  idempotencyKey: string;
  authorization: {
    matched: boolean;
    evidenceRefs: string[];
    artifactId?: string;
  };
  timestamps: {
    acceptedAt?: string;
    attemptedAt?: string;
    completedAt: string;
  };
  reasonCode: string;
  reasonMessage: string;
}

/** Discriminated result: comment is present only on SUCCEEDED. */
export type ActionGatewayCommentResultV1 =
  | (ActionGatewayCommentResultBase & {
      status: "SUCCEEDED";
      comment: { id: number; url: string };
    })
  | (ActionGatewayCommentResultBase & {
      status: "REJECTED" | "FAILED" | "UNKNOWN";
      comment?: undefined;
    });

export type ActionGatewayRejectReason =
  | "REJECTED_SCHEMA"
  | "REJECTED_CAPABILITY_NOT_ALLOWED"
  | "REJECTED_REPOSITORY_NOT_ALLOWED"
  | "REJECTED_AUTHORIZATION_MISSING"
  | "REJECTED_AUTHORIZATION_MISMATCH"
  | "REJECTED_AUTHORIZATION_EXPIRED"
  | "REJECTED_AUTHORIZATION_NOT_YET_VALID"
  | "REJECTED_AUTHORIZATION_ARTIFACT"
  | "REJECTED_AUTHENTICATED_PRINCIPAL_MISMATCH"
  | "REJECTED_FINGERPRINT_MISMATCH"
  | "REJECTED_TARGET_NOT_FOUND"
  | "REJECTED_TARGET_MISMATCH"
  | "REJECTED_PAYLOAD_LIMIT"
  | "REJECTED_IDEMPOTENCY_KEY_MISSING"
  | "REJECTED_IDEMPOTENCY_KEY_MISMATCH"
  | "REJECTED_IDEMPOTENCY_CONFLICT"
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
  executionImplemented: false;
}

export type ActionGatewayPreWriteEvaluation =
  | ActionGatewayEvaluationRejected
  | ActionGatewayEvaluationEligible;

/**
 * Server-side lookup of a trusted authorization artifact.
 * Populated only after Gateway loads the artifact from an authoritative store.
 */
export type TrustedAuthorizationLookup =
  | {
      status: "VERIFIED";
      artifactId: string;
      boundCapabilityId: typeof GITHUB_COMMENT_CREATE_CAPABILITY_ID;
      boundRepository: string;
      boundTarget: ActionGatewayCommentTarget;
      boundRequestFingerprint: string;
      boundIdempotencyKey: string;
      boundRequestedBy: ActionGatewayPrincipal;
      boundAuthorizedAt: string;
      boundExpiresAt?: string;
    }
  | {
      status: "MISSING" | "MISMATCH" | "REVOKED" | "EXPIRED";
      artifactId: string;
    };

export interface ActionGatewayIdempotencyRecord {
  capabilityId: typeof GITHUB_COMMENT_CREATE_CAPABILITY_ID;
  repository: string;
  target: ActionGatewayCommentTarget;
  requestFingerprint: string;
  idempotencyKey: string;
  requestedBy: ActionGatewayPrincipal;
  result: ActionGatewayCommentResultV1;
}

export interface ActionGatewayPreWriteOptions {
  nowIso: string;
  /**
   * Authenticated caller from the Gateway auth layer (not request JSON).
   * Must equal request.requestedBy and authorizedRequestedBy.
   */
  authenticatedPrincipal: ActionGatewayPrincipal;
  /**
   * Result of server-side authorization artifact re-verification.
   * Required for eligibility; caller-supplied artifact bodies are never trusted.
   */
  trustedAuthorizationLookup: TrustedAuthorizationLookup;
  /**
   * Existing idempotency-store record for this scope, if any.
   * When present, repository/target/fingerprint/requestedBy must match or CONFLICT.
   */
  existingIdempotencyRecord?: ActionGatewayIdempotencyRecord | null;
  observedTargetExists?: boolean;
  observedRepository?: string;
  observedTargetKind?: ActionGatewayTargetKind;
  observedTargetNumber?: number;
  observedTargetNodeId?: string;
  observedTargetTitle?: string;
  overlayUsedAsAuthorization?: boolean;
}

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
  a: ActionGatewayPrincipal,
  b: ActionGatewayPrincipal,
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

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isTargetKind(value: unknown): value is ActionGatewayTargetKind {
  return value === "ISSUE" || value === "PULL_REQUEST";
}

function isTarget(value: unknown): value is ActionGatewayCommentTarget {
  return (
    isPlainObject(value) &&
    hasOnlyKeys(value, ["kind", "number"]) &&
    isTargetKind(value.kind) &&
    typeof value.number === "number" &&
    Number.isInteger(value.number) &&
    value.number >= 1
  );
}

function isPrincipal(value: unknown): value is ActionGatewayPrincipal {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, ["principalKind", "subjectId", "issuer"])) return false;
  if (value.principalKind !== "HUMAN") return false;
  if (typeof value.subjectId !== "string" || value.subjectId.length < 1) return false;
  if (value.issuer !== undefined && (typeof value.issuer !== "string" || value.issuer.length < 1)) {
    return false;
  }
  return true;
}

function isAuthorizationArtifactRef(
  value: unknown,
): value is ActionGatewayAuthorizationArtifactRef {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, ["kind", "artifactId", "artifactLocator"])) return false;
  if (value.kind !== ACTION_GATEWAY_AUTHORIZATION_ARTIFACT_KIND) return false;
  if (
    typeof value.artifactId !== "string" ||
    value.artifactId.length < 1 ||
    value.artifactId.length > ACTION_GATEWAY_ARTIFACT_ID_MAX ||
    !/^[\x20-\x7E]+$/.test(value.artifactId)
  ) {
    return false;
  }
  if (
    value.artifactLocator !== undefined &&
    (typeof value.artifactLocator !== "string" ||
      value.artifactLocator.length < 1 ||
      value.artifactLocator.length > ACTION_GATEWAY_EVIDENCE_REF_MAX_LEN)
  ) {
    return false;
  }
  return true;
}

function isEvidenceRefs(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= ACTION_GATEWAY_EVIDENCE_REFS_MAX &&
    value.every(
      (ref) =>
        typeof ref === "string" &&
        ref.length >= 1 &&
        ref.length <= ACTION_GATEWAY_EVIDENCE_REF_MAX_LEN,
    )
  );
}

/**
 * Gateway entry: raw HTTP body → JSON value.
 * Syntax errors become REJECTED_SCHEMA (never throw to callers).
 */
export function parseGatewayJsonBody(raw: unknown):
  | { ok: true; value: unknown }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (typeof raw !== "string") {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Gateway body must be a UTF-8 JSON string.",
    };
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Gateway body is not valid JSON syntax.",
    };
  }
}

/**
 * Structural fail-closed parse for request documents.
 * Mirrors docs/action-gateway/schemas/action-gateway-comment-request-v1.schema.json
 * including additionalProperties:false and evidenceRefs limits.
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
  if (!hasOnlyKeys(value, ACTION_GATEWAY_REQUEST_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request contains unknown properties (additionalProperties forbidden).",
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
  if (
    value.repository !== "yasutakesougo/ai-development-control-center" ||
    !isTarget(value.target)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request repository/target are malformed.",
    };
  }
  if (
    typeof value.body !== "string" ||
    value.body.length < 1 ||
    value.body.length > ACTION_GATEWAY_COMMENT_BODY_MAX ||
    typeof value.purpose !== "string" ||
    value.purpose.length < 1 ||
    value.purpose.length > ACTION_GATEWAY_COMMENT_PURPOSE_MAX
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request body/purpose failed schema size constraints.",
    };
  }
  if (!validIdempotencyKey(value.idempotencyKey)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request idempotencyKey is malformed.",
    };
  }
  if (!isPrincipal(value.requestedBy)) {
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
  if (!hasOnlyKeys(value.humanAuthorization, ACTION_GATEWAY_HUMAN_AUTH_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "humanAuthorization contains unknown properties.",
    };
  }
  const auth = value.humanAuthorization;
  if (
    auth.authorizedCapabilityId !== GITHUB_COMMENT_CREATE_CAPABILITY_ID ||
    typeof auth.authorizedRepository !== "string" ||
    !isTarget(auth.authorizedTarget) ||
    typeof auth.authorizedRequestFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(auth.authorizedRequestFingerprint) ||
    !validIdempotencyKey(auth.authorizedIdempotencyKey) ||
    !isPrincipal(auth.authorizedRequestedBy) ||
    !isAuthorizationArtifactRef(auth.authorizationArtifact) ||
    typeof auth.authorizedAt !== "string" ||
    auth.authorizedAt.length < 1 ||
    (auth.expiresAt !== undefined &&
      (typeof auth.expiresAt !== "string" || auth.expiresAt.length < 1)) ||
    !isEvidenceRefs(auth.evidenceRefs)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Request humanAuthorization fields are malformed.",
    };
  }
  const expected = value.expectedObservations;
  if (
    !hasOnlyKeys(expected, [
      "repository",
      "targetKind",
      "targetNumber",
      "targetExists",
      "targetNodeId",
      "targetTitle",
    ]) ||
    typeof expected.repository !== "string" ||
    !isTargetKind(expected.targetKind) ||
    typeof expected.targetNumber !== "number" ||
    !Number.isInteger(expected.targetNumber) ||
    expected.targetNumber < 1 ||
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
  if (!isPrincipal(value.authenticatedPrincipal)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Evaluation options.authenticatedPrincipal is required and malformed.",
    };
  }
  if (!isPlainObject(value.trustedAuthorizationLookup)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Evaluation options.trustedAuthorizationLookup is required.",
    };
  }
  return { ok: true, options: value as unknown as ActionGatewayPreWriteOptions };
}

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
 * Idempotency conflict check: same key under mismatched semantic identity
 * must not replay a foreign SUCCEEDED/FAILED/UNKNOWN/REJECTED result.
 */
export function evaluateIdempotencyConflict(input: {
  existing: ActionGatewayIdempotencyRecord | null | undefined;
  current: {
    capabilityId: typeof GITHUB_COMMENT_CREATE_CAPABILITY_ID;
    repository: string;
    target: ActionGatewayCommentTarget;
    requestFingerprint: string;
    idempotencyKey: string;
    requestedBy: ActionGatewayPrincipal;
  };
}):
  | { outcome: "NO_EXISTING" }
  | { outcome: "REPLAY"; record: ActionGatewayIdempotencyRecord }
  | { outcome: "CONFLICT"; reasonCode: "REJECTED_IDEMPOTENCY_CONFLICT" } {
  if (!input.existing) return { outcome: "NO_EXISTING" };
  const existing = input.existing;
  const current = input.current;
  const sameIdentity =
    existing.capabilityId === current.capabilityId &&
    existing.repository === current.repository &&
    targetsEqual(existing.target, current.target) &&
    existing.requestFingerprint === current.requestFingerprint &&
    existing.idempotencyKey === current.idempotencyKey &&
    requestedByEqual(existing.requestedBy, current.requestedBy);
  if (!sameIdentity) {
    return { outcome: "CONFLICT", reasonCode: "REJECTED_IDEMPOTENCY_CONFLICT" };
  }
  return { outcome: "REPLAY", record: existing };
}

/**
 * Pure pre-write evaluation. Never calls GitHub.
 * Fail-closes malformed runtime JSON as REJECTED_SCHEMA (no throw).
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

  const auth = request.humanAuthorization;
  const fingerprint = await computeCommentRequestFingerprint({
    capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
    repository: request.repository,
    target: request.target,
    body: request.body,
    purpose: request.purpose,
  });

  if (!requestedByEqual(options.authenticatedPrincipal, request.requestedBy)) {
    return rejected(
      "REJECTED_AUTHENTICATED_PRINCIPAL_MISMATCH",
      "Authenticated principal must equal request.requestedBy.",
      fingerprint,
    );
  }

  if (!requestedByEqual(auth.authorizedRequestedBy, request.requestedBy)) {
    return rejected(
      "REJECTED_REQUESTER_MISMATCH",
      "Human authorization is not bound to this requestedBy principal.",
      fingerprint,
    );
  }

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

  if (auth.authorizedIdempotencyKey !== request.idempotencyKey) {
    return rejected(
      "REJECTED_IDEMPOTENCY_KEY_MISMATCH",
      "Human authorization is bound to a different idempotencyKey and cannot be reused.",
      fingerprint,
    );
  }

  const lookup = options.trustedAuthorizationLookup;
  if (lookup.status !== "VERIFIED") {
    return rejected(
      "REJECTED_AUTHORIZATION_ARTIFACT",
      `Trusted authorization artifact lookup status=${lookup.status}.`,
      fingerprint,
    );
  }
  if (
    lookup.artifactId !== auth.authorizationArtifact.artifactId ||
    lookup.boundCapabilityId !== request.capabilityId ||
    lookup.boundRepository !== request.repository ||
    !targetsEqual(lookup.boundTarget, request.target) ||
    lookup.boundRequestFingerprint !== fingerprint ||
    lookup.boundIdempotencyKey !== request.idempotencyKey ||
    !requestedByEqual(lookup.boundRequestedBy, request.requestedBy) ||
    lookup.boundAuthorizedAt !== auth.authorizedAt ||
    (lookup.boundExpiresAt ?? undefined) !== (auth.expiresAt ?? undefined)
  ) {
    return rejected(
      "REJECTED_AUTHORIZATION_ARTIFACT",
      "Trusted authorization artifact bindings do not match this request.",
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

  const idempotency = evaluateIdempotencyConflict({
    existing: options.existingIdempotencyRecord,
    current: {
      capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
      repository: request.repository,
      target: request.target,
      requestFingerprint: fingerprint,
      idempotencyKey: request.idempotencyKey,
      requestedBy: request.requestedBy,
    },
  });
  if (idempotency.outcome === "CONFLICT") {
    return rejected(
      "REJECTED_IDEMPOTENCY_CONFLICT",
      "idempotencyKey already bound to a different repository/target/fingerprint/requestedBy.",
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

export interface UnknownReconciliationCurrent {
  repository: string;
  target: ActionGatewayCommentTarget;
  idempotencyKey: string;
  requestFingerprint: string;
}

export interface UnknownReconciliationMarkerProof {
  id: number;
  url: string;
  repository: string;
  target: ActionGatewayCommentTarget;
  idempotencyKey: string;
  requestFingerprint: string;
}

/**
 * UNKNOWN → SUCCEEDED requires positive proof stronger than normal validation:
 * prior/marker must match repository + target + idempotencyKey + requestFingerprint.
 */
export function reconcileUnknownCommentOutcome(input: {
  current: UnknownReconciliationCurrent;
  priorByIdempotencyKey: unknown;
  markerMatch: unknown;
}):
  | { status: "SUCCEEDED"; source: "PRIOR_RESULT" | "MARKER"; resultHint: { id: number; url: string } }
  | { status: "UNKNOWN"; source: "UNPROVEN" } {
  if (isPlainObject(input.priorByIdempotencyKey)) {
    const prior = input.priorByIdempotencyKey;
    const priorTarget = prior.target;
    if (
      prior.status === "SUCCEEDED" &&
      prior.repository === input.current.repository &&
      isTarget(priorTarget) &&
      targetsEqual(priorTarget, input.current.target) &&
      prior.idempotencyKey === input.current.idempotencyKey &&
      prior.requestFingerprint === input.current.requestFingerprint &&
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

  if (isPlainObject(input.markerMatch)) {
    const marker = input.markerMatch;
    const markerTarget = marker.target;
    if (
      typeof marker.id === "number" &&
      typeof marker.url === "string" &&
      marker.repository === input.current.repository &&
      isTarget(markerTarget) &&
      targetsEqual(markerTarget, input.current.target) &&
      marker.idempotencyKey === input.current.idempotencyKey &&
      marker.requestFingerprint === input.current.requestFingerprint
    ) {
      return {
        status: "SUCCEEDED",
        source: "MARKER",
        resultHint: { id: marker.id, url: marker.url },
      };
    }
  }

  return { status: "UNKNOWN", source: "UNPROVEN" };
}

/** Result shape invariants. Never throws. comment only on SUCCEEDED. */
export function assertCommentResultInvariants(result: unknown): string[] {
  const errors: string[] = [];
  if (!isPlainObject(result)) return ["result_not_object"];
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
    if (comment !== undefined) errors.push(`${status}_forbids_comment`);
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
