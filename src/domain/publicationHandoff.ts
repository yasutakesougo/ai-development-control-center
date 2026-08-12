/**
 * RUNNER-PUBLISH-HANDOFF-V1
 *
 * Explicit execution → publication authority transition.
 * Resolves RUNNER_PUBLISHER_AUTHORITY_INCOMPATIBLE without widening
 * AGENT-RUNNER-V1 into R2 / GitHub publication authority.
 *
 * ExecutionTask (R0/R1)
 * → IndependentVerifyResultV1 = VERIFIED
 * → PublicationHandoffV1
 * → distinct PublicationTask (R2 + github.draft-pr.publish.v1 + DRAFT_PR)
 *
 * Do NOT mutate the source execution AgentTaskV1.
 * Do NOT call runAgentTaskV1(publicationTask).
 * REAL PROVIDER EXECUTION = HOLD
 * REAL GITHUB PUBLICATION = HOLD
 */

import {
  AGENT_TASK_SCHEMA,
  parseAgentTaskV1,
  validateAgentTaskV1,
  type AgentTaskRiskClass,
  type AgentTaskSourceIssue,
  type AgentTaskV1,
  type AgentTaskValidationResultV1,
} from "./agentTaskContract";
import {
  AGENT_RUNNER_SUPPORTED_CAPABILITIES,
  AGENT_RUNNER_SUPPORTED_RISK_CLASSES,
  evaluateChangedPathsPolicy,
} from "./agentRunner";
import {
  findDuplicateChangedPaths,
  changedPathSetsEqual,
  type IndependentVerifyResultV1,
  type IndependentVerifyStatus,
} from "./independentVerify";
import type { IndependentVerifyEvidenceV1 } from "./independentVerifyAdapter";
import {
  PUBLICATION_HANDOFF_CANONICAL_CAPABILITY,
  PUBLICATION_HANDOFF_CANONICAL_RISK_CLASS,
  PUBLICATION_HANDOFF_CANONICAL_STOP_AT,
  authorityFingerprintsEqual,
  buildDeterministicPublicationTaskId,
  capturePublicationHandoffAuthorityFingerprint,
  computeVerificationFingerprint,
  deriveCanonicalPublicationHandoffIdentities,
  deterministicHexFromSeed,
  serializeAuthorityFingerprint,
  type PublicationHandoffAuthoritySeedV1,
} from "./publicationHandoffCanonical";

export {
  authorityFingerprintsEqual,
  buildDeterministicPublicationTaskId,
  capturePublicationHandoffAuthorityFingerprint,
  computeVerificationFingerprint,
  deriveCanonicalPublicationHandoffIdentities,
  deterministicHexFromSeed,
  serializeAuthorityFingerprint,
};
export type { PublicationHandoffAuthoritySeedV1 };

export const PUBLICATION_HANDOFF_VERSION = "RUNNER-PUBLISH-HANDOFF-V1" as const;
export const PUBLICATION_HANDOFF_SCHEMA = "PUBLICATION-HANDOFF-V1" as const;
export const PUBLICATION_HANDOFF_RESULT_SCHEMA =
  "PUBLICATION-HANDOFF-RESULT-V1" as const;

/**
 * Publication authority constants — string-identical to DRAFT-PUBLISH-V1
 * requirements. Sourced from shared canonical module.
 */
export const PUBLICATION_HANDOFF_REQUIRED_CAPABILITY =
  PUBLICATION_HANDOFF_CANONICAL_CAPABILITY;
export const PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS =
  PUBLICATION_HANDOFF_CANONICAL_RISK_CLASS;
export const PUBLICATION_HANDOFF_REQUIRED_STOP_AT =
  PUBLICATION_HANDOFF_CANONICAL_STOP_AT;

/** Frozen snapshot of runner allowlists — must never expand in this slice. */
export const PUBLICATION_HANDOFF_RUNNER_RISK_CLASSES_SNAPSHOT = [
  "R0",
  "R1",
] as const satisfies readonly AgentTaskRiskClass[];
export const PUBLICATION_HANDOFF_RUNNER_CAPABILITIES_SNAPSHOT = [
  "workspace.read.v1",
] as const;

export const PUBLICATION_HANDOFF_INPUT_ROOT_KEYS = [
  "handoffId",
  "sourceExecutionTask",
  "independentVerifyResult",
  "requestedPublicationCapability",
  "requestedRiskClass",
  "requestedStopAt",
  "observedAt",
] as const;

export type PublicationHandoffStatus =
  | "READY_FOR_PUBLICATION_TASK"
  | "HOLD"
  | "REJECT"
  | "FAILED"
  | "UNKNOWN";

export type PublicationHandoffReasonCode =
  | "READY_FOR_PUBLICATION_TASK"
  | "HOLD_VERIFIER"
  | "REJECT_VERIFIER"
  | "FAILED_VERIFIER"
  | "UNKNOWN_VERIFIER"
  | "REJECT_INPUT"
  | "REJECT_SOURCE_TASK"
  | "REJECT_SOURCE_TASK_INVALID"
  | "REJECT_IDENTITY_TASK_ID"
  | "REJECT_IDENTITY_REPOSITORY"
  | "REJECT_IDENTITY_BASE_REVISION"
  | "REJECT_IDENTITY_SOURCE_ISSUE"
  | "REJECT_VERIFIED_PATHS"
  | "REJECT_CHANGED_PATH_DUPLICATE"
  | "REJECT_CHANGED_PATH_UNSAFE"
  | "FAILED_FORBIDDEN_PATH"
  | "FAILED_CHANGED_PATH_OUT_OF_SCOPE"
  | "REJECT_VERIFIER_METADATA"
  | "REJECT_VERIFIER_EVIDENCE"
  | "REJECT_PUBLICATION_CAPABILITY"
  | "HOLD_PUBLICATION_CAPABILITY"
  | "REJECT_PUBLICATION_RISK"
  | "HOLD_PUBLICATION_RISK"
  | "REJECT_PUBLICATION_STOP_AT"
  | "HOLD_PUBLICATION_STOP_AT"
  | "REJECT_PUBLICATION_TASK"
  | "REJECT_HANDOFF_IDEMPOTENCY_CONFLICT"
  | "UNKNOWN_HANDOFF_STATE";

export interface PublicationHandoffInputV1 {
  handoffId: string;
  sourceExecutionTask: AgentTaskV1;
  independentVerifyResult: IndependentVerifyResultV1;
  requestedPublicationCapability: typeof PUBLICATION_HANDOFF_REQUIRED_CAPABILITY;
  requestedRiskClass: typeof PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS;
  requestedStopAt: typeof PUBLICATION_HANDOFF_REQUIRED_STOP_AT;
  observedAt: string;
}

export interface PublicationHandoffV1 {
  schemaVersion: typeof PUBLICATION_HANDOFF_SCHEMA;
  handoffId: string;
  sourceExecutionTaskId: string;
  /** Distinct publication-scoped task identity (≠ sourceExecutionTaskId). */
  publicationTaskId: string;
  sourceIssue: AgentTaskSourceIssue;
  repository: string;
  baseRevision: string;
  verifiedChangedPaths: string[];
  verificationAttemptId: string;
  verificationFingerprint: string;
  /** Canonical authority fingerprint — recomputed by DRAFT-PUBLISH-V1. */
  authorityFingerprint: string;
  requestedPublicationCapability: typeof PUBLICATION_HANDOFF_REQUIRED_CAPABILITY;
  requestedRiskClass: typeof PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS;
  requestedStopAt: typeof PUBLICATION_HANDOFF_REQUIRED_STOP_AT;
  observedAt: string;
}

export type PublicationHandoffAuthorityFingerprintV1 =
  PublicationHandoffAuthoritySeedV1;

export interface PublicationHandoffMetadataV1 {
  observedAt: string;
  handoffId: string;
  authorityFingerprint: string;
  verificationFingerprint: string;
  realAgentProviderExecution: false;
  realGithubPublication: false;
  githubMutationPerformed: false;
  networkAccess: false;
  secretsRequired: false;
  productionMutationPerformed: false;
  productionMutationAuthorized: false;
  readyAuthorized: false;
  mergeAuthorized: false;
  issueCloseAuthorized: false;
  deployAuthorized: false;
  runnerAuthorityExpanded: false;
  draftPublishAuthorityExpanded: false;
  sourceExecutionTaskMutated: false;
  publicationTaskDispatchedToRunner: false;
}

export interface PublicationHandoffResultV1 {
  schemaVersion: typeof PUBLICATION_HANDOFF_RESULT_SCHEMA;
  handoffVersion: typeof PUBLICATION_HANDOFF_VERSION;
  status: PublicationHandoffStatus;
  reasonCode: PublicationHandoffReasonCode;
  reasonMessage: string;
  handoffId: string | null;
  sourceExecutionTaskId: string | null;
  publicationTaskId: string | null;
  repository: string | null;
  baseRevision: string | null;
  verifiedChangedPaths: string[];
  handoff: PublicationHandoffV1 | null;
  publicationTask: AgentTaskV1 | null;
  sourceTaskValidation: AgentTaskValidationResultV1 | null;
  publicationTaskValidation: AgentTaskValidationResultV1 | null;
  authorityFingerprint: string | null;
  metadata: PublicationHandoffMetadataV1;
  observedAt: string;
}

export interface PublicationHandoffAttemptRecordV1 {
  handoffId: string;
  authorityFingerprint: string;
  result: PublicationHandoffResultV1;
}

export interface CreatePublicationHandoffV1Options {
  validatedAt?: string;
  /** Injected local registry — no external persistence in V1. */
  attemptRegistry?: Map<string, PublicationHandoffAttemptRecordV1>;
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

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Narrow compatibility check against DRAFT-PUBLISH-V1 authority constants.
 * Does not invoke publishDraftPrV1.
 */
export function publicationTaskMeetsDraftPublishAuthority(
  task: AgentTaskV1,
): boolean {
  return (
    task.riskClass === PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS &&
    task.stopAt === PUBLICATION_HANDOFF_REQUIRED_STOP_AT &&
    task.allowedCapabilities.length === 1 &&
    task.allowedCapabilities[0] === PUBLICATION_HANDOFF_REQUIRED_CAPABILITY
  );
}

/** Publication tasks must not be runner-dispatchable under current allowlists. */
export function publicationTaskIsRunnerDispatchable(
  task: AgentTaskV1,
): boolean {
  const riskOk = (
    AGENT_RUNNER_SUPPORTED_RISK_CLASSES as readonly string[]
  ).includes(task.riskClass);
  const capsOk = task.allowedCapabilities.every((c) =>
    (AGENT_RUNNER_SUPPORTED_CAPABILITIES as readonly string[]).includes(c),
  );
  return riskOk && capsOk;
}

export function assertPublicationHandoffBoundaries(): void {
  if (
    stableJson([...AGENT_RUNNER_SUPPORTED_RISK_CLASSES]) !==
    stableJson([...PUBLICATION_HANDOFF_RUNNER_RISK_CLASSES_SNAPSHOT])
  ) {
    throw new Error(
      "RUNNER-PUBLISH-HANDOFF-V1 forbids expanding AGENT_RUNNER_SUPPORTED_RISK_CLASSES",
    );
  }
  if (
    stableJson([...AGENT_RUNNER_SUPPORTED_CAPABILITIES]) !==
    stableJson([...PUBLICATION_HANDOFF_RUNNER_CAPABILITIES_SNAPSHOT])
  ) {
    throw new Error(
      "RUNNER-PUBLISH-HANDOFF-V1 forbids expanding AGENT_RUNNER_SUPPORTED_CAPABILITIES",
    );
  }
  if (
    (AGENT_RUNNER_SUPPORTED_CAPABILITIES as readonly string[]).includes(
      PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
    )
  ) {
    throw new Error(
      "RUNNER-PUBLISH-HANDOFF-V1 forbids adding github.draft-pr.publish.v1 to runner capabilities",
    );
  }
  if (
    (AGENT_RUNNER_SUPPORTED_RISK_CLASSES as readonly string[]).includes("R2")
  ) {
    throw new Error(
      "RUNNER-PUBLISH-HANDOFF-V1 forbids adding R2 to runner risk classes",
    );
  }
}

function metadataBase(input: {
  observedAt: string;
  handoffId: string;
  authorityFingerprint: string | null;
  verificationFingerprint: string | null;
}): PublicationHandoffMetadataV1 {
  return {
    observedAt: input.observedAt,
    handoffId: input.handoffId,
    authorityFingerprint: input.authorityFingerprint ?? "",
    verificationFingerprint: input.verificationFingerprint ?? "",
    realAgentProviderExecution: false,
    realGithubPublication: false,
    githubMutationPerformed: false,
    networkAccess: false,
    secretsRequired: false,
    productionMutationPerformed: false,
    productionMutationAuthorized: false,
    readyAuthorized: false,
    mergeAuthorized: false,
    issueCloseAuthorized: false,
    deployAuthorized: false,
    runnerAuthorityExpanded: false,
    draftPublishAuthorityExpanded: false,
    sourceExecutionTaskMutated: false,
    publicationTaskDispatchedToRunner: false,
  };
}

function buildResult(input: {
  status: PublicationHandoffStatus;
  reasonCode: PublicationHandoffReasonCode;
  reasonMessage: string;
  handoffId: string | null;
  sourceExecutionTaskId?: string | null;
  publicationTaskId?: string | null;
  repository?: string | null;
  baseRevision?: string | null;
  verifiedChangedPaths?: string[];
  handoff?: PublicationHandoffV1 | null;
  publicationTask?: AgentTaskV1 | null;
  sourceTaskValidation?: AgentTaskValidationResultV1 | null;
  publicationTaskValidation?: AgentTaskValidationResultV1 | null;
  authorityFingerprint?: string | null;
  verificationFingerprint?: string | null;
  observedAt: string;
}): PublicationHandoffResultV1 {
  const handoffId = input.handoffId ?? "unknown";
  return {
    schemaVersion: PUBLICATION_HANDOFF_RESULT_SCHEMA,
    handoffVersion: PUBLICATION_HANDOFF_VERSION,
    status: input.status,
    reasonCode: input.reasonCode,
    reasonMessage: input.reasonMessage,
    handoffId: input.handoffId,
    sourceExecutionTaskId: input.sourceExecutionTaskId ?? null,
    publicationTaskId: input.publicationTaskId ?? null,
    repository: input.repository ?? null,
    baseRevision: input.baseRevision ?? null,
    verifiedChangedPaths: input.verifiedChangedPaths
      ? [...input.verifiedChangedPaths]
      : [],
    handoff: input.handoff ?? null,
    publicationTask: input.publicationTask ?? null,
    sourceTaskValidation: input.sourceTaskValidation ?? null,
    publicationTaskValidation: input.publicationTaskValidation ?? null,
    authorityFingerprint: input.authorityFingerprint ?? null,
    metadata: metadataBase({
      observedAt: input.observedAt,
      handoffId,
      authorityFingerprint: input.authorityFingerprint ?? null,
      verificationFingerprint: input.verificationFingerprint ?? null,
    }),
    observedAt: input.observedAt,
  };
}

function isExactBooleanFalse(value: unknown): value is false {
  return value === false;
}

function checkVerifierMetadataBoundary(
  metadata: unknown,
): { ok: true } | { ok: false; reasonMessage: string } {
  if (!isPlainObject(metadata)) {
    return { ok: false, reasonMessage: "verifier metadata must be an object." };
  }
  const requiredFalse = [
    "publicationAuthorized",
    "readyAuthorized",
    "mergeAuthorized",
    "githubMutationAuthorized",
    "deployAuthorized",
  ] as const;
  for (const key of requiredFalse) {
    if (!isExactBooleanFalse(metadata[key])) {
      return {
        ok: false,
        reasonMessage: `independentVerifyResult.metadata.${key} must be exactly false; VERIFIED is not publication authority.`,
      };
    }
  }
  return { ok: true };
}

function checkVerifierEvidenceSafety(
  evidence: IndependentVerifyEvidenceV1 | null,
): { ok: true } | { ok: false; reasonMessage: string } {
  if (evidence === null || evidence === undefined) {
    return {
      ok: false,
      reasonMessage:
        "independentVerifyResult.verificationEvidence is required for handoff safety checks; missing fails closed.",
    };
  }
  const requiredFalse = [
    "networkAccess",
    "secretsRequired",
    "githubMutationPerformed",
    "productionMutationPerformed",
  ] as const;
  for (const key of requiredFalse) {
    if (!isExactBooleanFalse(evidence[key])) {
      return {
        ok: false,
        reasonMessage: `verificationEvidence.${key} must be exactly false; missing/contradictory fails closed.`,
      };
    }
  }
  return { ok: true };
}

function mapVerifierStatus(
  status: IndependentVerifyStatus,
  reasonMessage: string,
): {
  status: PublicationHandoffStatus;
  reasonCode: PublicationHandoffReasonCode;
  reasonMessage: string;
} | null {
  if (status === "HOLD") {
    return {
      status: "HOLD",
      reasonCode: "HOLD_VERIFIER",
      reasonMessage: `Verifier HOLD: ${reasonMessage}`,
    };
  }
  if (status === "REJECT") {
    return {
      status: "REJECT",
      reasonCode: "REJECT_VERIFIER",
      reasonMessage: `Verifier REJECT: ${reasonMessage}`,
    };
  }
  if (status === "FAILED") {
    return {
      status: "FAILED",
      reasonCode: "FAILED_VERIFIER",
      reasonMessage: `Verifier FAILED: ${reasonMessage}`,
    };
  }
  if (status === "UNKNOWN") {
    return {
      status: "UNKNOWN",
      reasonCode: "UNKNOWN_VERIFIER",
      reasonMessage: `Verifier UNKNOWN: ${reasonMessage}`,
    };
  }
  if (status === "VERIFIED") {
    return null;
  }
  return {
    status: "UNKNOWN",
    reasonCode: "UNKNOWN_VERIFIER",
    reasonMessage: `Unrecognized verifier status; fail closed: ${reasonMessage}`,
  };
}

function isForbiddenGenericGithubCapability(capability: string): boolean {
  if (capability === PUBLICATION_HANDOFF_REQUIRED_CAPABILITY) {
    return false;
  }
  if (capability === "github.write" || capability === "repo.write") {
    return true;
  }
  if (capability === "github.*" || capability.startsWith("github.")) {
    return true;
  }
  if (capability.startsWith("repo.")) {
    return true;
  }
  return false;
}

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Create a publication handoff from a VERIFIED execution result.
 * Never mutates sourceExecutionTask. Never dispatches publication through runner.
 */
export function createPublicationHandoffV1(
  rawInput: unknown,
  options: CreatePublicationHandoffV1Options = {},
): PublicationHandoffResultV1 {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const registry = options.attemptRegistry;

  if (!isPlainObject(rawInput)) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Publication handoff input must be a JSON object.",
      handoffId: null,
      observedAt: validatedAt,
    });
  }
  if (!hasOnlyKeys(rawInput, PUBLICATION_HANDOFF_INPUT_ROOT_KEYS)) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Publication handoff input contains unknown properties.",
      handoffId:
        typeof rawInput.handoffId === "string" ? rawInput.handoffId : null,
      observedAt:
        typeof rawInput.observedAt === "string"
          ? rawInput.observedAt
          : validatedAt,
    });
  }

  if (
    rawInput.handoffId === undefined ||
    rawInput.handoffId === null ||
    typeof rawInput.handoffId !== "string" ||
    rawInput.handoffId.length < 1 ||
    rawInput.handoffId.length > 128
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage:
        "handoffId is required (non-empty bounded string); missing fails closed.",
      handoffId: null,
      observedAt:
        typeof rawInput.observedAt === "string"
          ? rawInput.observedAt
          : validatedAt,
    });
  }
  const handoffId = rawInput.handoffId;

  if (
    typeof rawInput.observedAt !== "string" ||
    rawInput.observedAt.length < 1
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "observedAt must be a non-empty string.",
      handoffId,
      observedAt: validatedAt,
    });
  }
  const observedAt = rawInput.observedAt;

  if (rawInput.requestedPublicationCapability === undefined) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage:
        "requestedPublicationCapability is required; do not default to github.draft-pr.publish.v1.",
      handoffId,
      observedAt,
    });
  }
  if (rawInput.requestedRiskClass === undefined) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "requestedRiskClass is required; do not default to R2.",
      handoffId,
      observedAt,
    });
  }
  if (rawInput.requestedStopAt === undefined) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "requestedStopAt is required; do not default to DRAFT_PR.",
      handoffId,
      observedAt,
    });
  }

  if (typeof rawInput.requestedPublicationCapability !== "string") {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_CAPABILITY",
      reasonMessage: "requestedPublicationCapability must be a string.",
      handoffId,
      observedAt,
    });
  }
  if (
    isForbiddenGenericGithubCapability(rawInput.requestedPublicationCapability)
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_CAPABILITY",
      reasonMessage: `Generic or wildcard GitHub capability rejected: ${rawInput.requestedPublicationCapability}`,
      handoffId,
      observedAt,
    });
  }
  if (
    rawInput.requestedPublicationCapability !==
    PUBLICATION_HANDOFF_REQUIRED_CAPABILITY
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_CAPABILITY",
      reasonMessage: `requestedPublicationCapability must be exactly ${PUBLICATION_HANDOFF_REQUIRED_CAPABILITY}; got ${rawInput.requestedPublicationCapability}.`,
      handoffId,
      observedAt,
    });
  }

  if (typeof rawInput.requestedRiskClass !== "string") {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_RISK",
      reasonMessage: "requestedRiskClass must be a string.",
      handoffId,
      observedAt,
    });
  }
  if (rawInput.requestedRiskClass !== PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_RISK",
      reasonMessage: `requestedRiskClass must be exactly ${PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS}; got ${rawInput.requestedRiskClass}. No silent upgrade.`,
      handoffId,
      observedAt,
    });
  }

  if (typeof rawInput.requestedStopAt !== "string") {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_STOP_AT",
      reasonMessage: "requestedStopAt must be a string.",
      handoffId,
      observedAt,
    });
  }
  if (rawInput.requestedStopAt !== PUBLICATION_HANDOFF_REQUIRED_STOP_AT) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_STOP_AT",
      reasonMessage: `requestedStopAt must be exactly ${PUBLICATION_HANDOFF_REQUIRED_STOP_AT}; got ${rawInput.requestedStopAt}.`,
      handoffId,
      observedAt,
    });
  }

  const requestedPublicationCapability =
    PUBLICATION_HANDOFF_REQUIRED_CAPABILITY;
  const requestedRiskClass = PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS;
  const requestedStopAt = PUBLICATION_HANDOFF_REQUIRED_STOP_AT;

  if (rawInput.sourceExecutionTask === undefined) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "sourceExecutionTask is required.",
      handoffId,
      observedAt,
    });
  }
  const sourceParsed = parseAgentTaskV1(rawInput.sourceExecutionTask);
  if (!sourceParsed.ok) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_SOURCE_TASK",
      reasonMessage: `sourceExecutionTask failed structural parse: ${sourceParsed.reasonMessage}`,
      handoffId,
      observedAt,
    });
  }
  const sourceExecutionTask = sourceParsed.task;
  const sourceValidation = validateAgentTaskV1(sourceExecutionTask, {
    validatedAt,
  });
  if (sourceValidation.status !== "VALID") {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_SOURCE_TASK_INVALID",
      reasonMessage: `sourceExecutionTask revalidation status=${sourceValidation.status}: ${sourceValidation.reasonMessage}`,
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }

  if (rawInput.independentVerifyResult === undefined) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "independentVerifyResult is required.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }
  if (!isPlainObject(rawInput.independentVerifyResult)) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "independentVerifyResult must be an object.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }

  const verifiedRaw = rawInput.independentVerifyResult;
  if (typeof verifiedRaw.status !== "string") {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "independentVerifyResult.status must be a string.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }

  const verifiedResult = verifiedRaw as unknown as IndependentVerifyResultV1;

  const propagated = mapVerifierStatus(
    verifiedResult.status,
    typeof verifiedResult.reasonMessage === "string"
      ? verifiedResult.reasonMessage
      : "no reasonMessage",
  );
  if (propagated !== null) {
    return buildResult({
      status: propagated.status,
      reasonCode: propagated.reasonCode,
      reasonMessage: propagated.reasonMessage,
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }

  if (verifiedResult.taskId !== sourceExecutionTask.taskId) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_IDENTITY_TASK_ID",
      reasonMessage: `independentVerifyResult.taskId !== sourceExecutionTask.taskId (${String(verifiedResult.taskId)} !== ${sourceExecutionTask.taskId}).`,
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }
  if (verifiedResult.repository !== sourceExecutionTask.repository) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_IDENTITY_REPOSITORY",
      reasonMessage:
        "independentVerifyResult.repository !== sourceExecutionTask.repository.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }
  if (verifiedResult.baseRevision !== sourceExecutionTask.baseRevision) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_IDENTITY_BASE_REVISION",
      reasonMessage:
        "independentVerifyResult.baseRevision !== sourceExecutionTask.baseRevision.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }

  if (
    typeof verifiedResult.verificationAttemptId !== "string" ||
    verifiedResult.verificationAttemptId.length < 1
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "independentVerifyResult.verificationAttemptId is required.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }
  const verificationAttemptId = verifiedResult.verificationAttemptId;

  if (
    sourceExecutionTask.sourceIssue.repository !==
      sourceExecutionTask.repository ||
    typeof sourceExecutionTask.sourceIssue.number !== "number"
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_IDENTITY_SOURCE_ISSUE",
      reasonMessage: "sourceExecutionTask.sourceIssue failed binding checks.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }

  const metaCheck = checkVerifierMetadataBoundary(verifiedResult.metadata);
  if (!metaCheck.ok) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_VERIFIER_METADATA",
      reasonMessage: metaCheck.reasonMessage,
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }

  const evidenceCheck = checkVerifierEvidenceSafety(
    verifiedResult.verificationEvidence,
  );
  if (!evidenceCheck.ok) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_VERIFIER_EVIDENCE",
      reasonMessage: evidenceCheck.reasonMessage,
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }

  if (!Array.isArray(verifiedResult.verifiedChangedPaths)) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_VERIFIED_PATHS",
      reasonMessage: "verifiedChangedPaths must be an array.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }
  if (verifiedResult.verifiedChangedPaths.length < 1) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_VERIFIED_PATHS",
      reasonMessage:
        "verifiedChangedPaths must be non-empty for publication handoff (publication allowedPaths minItems=1).",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }
  if (
    !verifiedResult.verifiedChangedPaths.every((p) => typeof p === "string")
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_VERIFIED_PATHS",
      reasonMessage: "verifiedChangedPaths entries must be strings.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }

  const verifiedChangedPaths = [...verifiedResult.verifiedChangedPaths];

  const dup = findDuplicateChangedPaths(verifiedChangedPaths);
  if (dup !== null) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_CHANGED_PATH_DUPLICATE",
      reasonMessage: `Duplicate verifiedChangedPaths entry fails closed: ${dup}`,
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }

  const pathPolicy = evaluateChangedPathsPolicy(
    sourceExecutionTask,
    verifiedChangedPaths,
  );
  if (!pathPolicy.ok) {
    const reasonCode: PublicationHandoffReasonCode =
      pathPolicy.reasonCode === "REJECT_CHANGED_PATH_UNSAFE"
        ? "REJECT_CHANGED_PATH_UNSAFE"
        : pathPolicy.reasonCode === "FAILED_FORBIDDEN_PATH"
          ? "FAILED_FORBIDDEN_PATH"
          : "FAILED_CHANGED_PATH_OUT_OF_SCOPE";
    return buildResult({
      status: pathPolicy.status === "REJECT" ? "REJECT" : "FAILED",
      reasonCode,
      reasonMessage: pathPolicy.reasonMessage,
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths,
      sourceTaskValidation: sourceValidation,
      observedAt,
    });
  }

  const canonical = deriveCanonicalPublicationHandoffIdentities(
    {
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      sourceIssue: sourceExecutionTask.sourceIssue,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths,
      verificationAttemptId,
      requestedPublicationCapability,
      requestedRiskClass,
      requestedStopAt,
    },
    {
      verificationAttemptId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths,
    },
  );
  const {
    publicationTaskId,
    authorityFingerprint,
    verificationFingerprint,
  } = canonical;

  if (registry) {
    const prior = registry.get(handoffId);
    if (prior) {
      if (prior.authorityFingerprint === authorityFingerprint) {
        return deepCloneJson(prior.result);
      }
      return buildResult({
        status: "REJECT",
        reasonCode: "REJECT_HANDOFF_IDEMPOTENCY_CONFLICT",
        reasonMessage:
          "same handoffId with different authority fingerprint; REJECT_HANDOFF_IDEMPOTENCY_CONFLICT.",
        handoffId,
        sourceExecutionTaskId: sourceExecutionTask.taskId,
        repository: sourceExecutionTask.repository,
        baseRevision: sourceExecutionTask.baseRevision,
        verifiedChangedPaths,
        sourceTaskValidation: sourceValidation,
        authorityFingerprint,
        verificationFingerprint,
        observedAt,
      });
    }
  }

  if (publicationTaskId === sourceExecutionTask.taskId) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_TASK",
      reasonMessage:
        "publicationTask.taskId collided with sourceExecutionTask.taskId; fail closed.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths,
      sourceTaskValidation: sourceValidation,
      authorityFingerprint,
      verificationFingerprint,
      observedAt,
    });
  }

  const publicationTaskCandidate: AgentTaskV1 = {
    schemaVersion: AGENT_TASK_SCHEMA,
    taskId: publicationTaskId,
    repository: sourceExecutionTask.repository,
    baseRevision: sourceExecutionTask.baseRevision,
    sourceIssue: {
      repository: sourceExecutionTask.sourceIssue.repository,
      number: sourceExecutionTask.sourceIssue.number,
    },
    objective: `RUNNER-PUBLISH-HANDOFF-V1 publication task for verified execution ${sourceExecutionTask.taskId} (handoff ${handoffId}). Draft-only publication scope.`,
    allowedPaths: [...verifiedChangedPaths],
    forbiddenPaths: [...sourceExecutionTask.forbiddenPaths],
    acceptanceCriteria: [
      "Publication task derived from VERIFIED execution via PublicationHandoffV1",
      "allowedPaths exact verifiedChangedPaths",
      "capability exactly github.draft-pr.publish.v1; risk R2; stopAt DRAFT_PR",
    ],
    verificationCommands: sourceExecutionTask.verificationCommands.map(
      (cmd) => ({
        id: cmd.id,
        command: cmd.command,
        ...(cmd.workingDirectory !== undefined
          ? { workingDirectory: cmd.workingDirectory }
          : {}),
        ...(cmd.description !== undefined
          ? { description: cmd.description }
          : {}),
      }),
    ),
    allowedCapabilities: [PUBLICATION_HANDOFF_REQUIRED_CAPABILITY],
    riskClass: PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS,
    stopAt: PUBLICATION_HANDOFF_REQUIRED_STOP_AT,
  };

  const pubParsed = parseAgentTaskV1(publicationTaskCandidate);
  if (!pubParsed.ok) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_TASK",
      reasonMessage: `publicationTask failed structural parse: ${pubParsed.reasonMessage}`,
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths,
      sourceTaskValidation: sourceValidation,
      authorityFingerprint,
      verificationFingerprint,
      observedAt,
    });
  }
  const publicationTask = pubParsed.task;
  const publicationValidation = validateAgentTaskV1(publicationTask, {
    validatedAt,
  });
  if (publicationValidation.status !== "VALID") {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_TASK",
      reasonMessage: `publicationTask revalidation status=${publicationValidation.status}: ${publicationValidation.reasonMessage}`,
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      publicationTaskId: publicationTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths,
      publicationTask,
      sourceTaskValidation: sourceValidation,
      publicationTaskValidation: publicationValidation,
      authorityFingerprint,
      verificationFingerprint,
      observedAt,
    });
  }

  if (
    !changedPathSetsEqual(publicationTask.allowedPaths, verifiedChangedPaths) ||
    publicationTask.allowedPaths.length !== verifiedChangedPaths.length
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_TASK",
      reasonMessage:
        "publicationTask.allowedPaths must be exactly equal to verifiedChangedPaths.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      publicationTaskId: publicationTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths,
      publicationTask,
      sourceTaskValidation: sourceValidation,
      publicationTaskValidation: publicationValidation,
      authorityFingerprint,
      verificationFingerprint,
      observedAt,
    });
  }

  if (!publicationTaskMeetsDraftPublishAuthority(publicationTask)) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_TASK",
      reasonMessage:
        "publicationTask does not meet DRAFT-PUBLISH-V1 eligibility authority boundary.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      publicationTaskId: publicationTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths,
      publicationTask,
      sourceTaskValidation: sourceValidation,
      publicationTaskValidation: publicationValidation,
      authorityFingerprint,
      verificationFingerprint,
      observedAt,
    });
  }

  if (publicationTaskIsRunnerDispatchable(publicationTask)) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_TASK",
      reasonMessage:
        "publicationTask must not be AGENT-RUNNER-V1 dispatchable; fail closed.",
      handoffId,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      publicationTaskId: publicationTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths,
      publicationTask,
      sourceTaskValidation: sourceValidation,
      publicationTaskValidation: publicationValidation,
      authorityFingerprint,
      verificationFingerprint,
      observedAt,
    });
  }

  const handoff: PublicationHandoffV1 = {
    schemaVersion: PUBLICATION_HANDOFF_SCHEMA,
    handoffId,
    sourceExecutionTaskId: sourceExecutionTask.taskId,
    publicationTaskId: publicationTask.taskId,
    sourceIssue: {
      repository: sourceExecutionTask.sourceIssue.repository,
      number: sourceExecutionTask.sourceIssue.number,
    },
    repository: sourceExecutionTask.repository,
    baseRevision: sourceExecutionTask.baseRevision,
    verifiedChangedPaths: [...verifiedChangedPaths],
    verificationAttemptId,
    verificationFingerprint,
    authorityFingerprint,
    requestedPublicationCapability,
    requestedRiskClass,
    requestedStopAt,
    observedAt,
  };

  const result = buildResult({
    status: "READY_FOR_PUBLICATION_TASK",
    reasonCode: "READY_FOR_PUBLICATION_TASK",
    reasonMessage:
      "Verified execution bound to distinct R2 publication task via PublicationHandoffV1. Source execution task unchanged. Runner authority not expanded. Ready/Merge/IssueClose/Deploy remain unauthorized.",
    handoffId,
    sourceExecutionTaskId: sourceExecutionTask.taskId,
    publicationTaskId: publicationTask.taskId,
    repository: sourceExecutionTask.repository,
    baseRevision: sourceExecutionTask.baseRevision,
    verifiedChangedPaths,
    handoff,
    publicationTask,
    sourceTaskValidation: sourceValidation,
    publicationTaskValidation: publicationValidation,
    authorityFingerprint,
    verificationFingerprint,
    observedAt,
  });

  if (registry) {
    registry.set(handoffId, {
      handoffId,
      authorityFingerprint,
      result: deepCloneJson(result),
    });
  }

  return result;
}
