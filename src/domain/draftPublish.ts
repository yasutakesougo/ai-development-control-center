/**
 * DRAFT-PUBLISH-V1
 *
 * BOUNDED DRAFT PR PUBLICATION POLICY · FAKE/LOCAL ADAPTER ONLY
 * REAL GITHUB PUBLICATION = HOLD
 * NO READY / MERGE / ISSUE CLOSE / DEPLOY
 *
 * Consumes IndependentVerifyResultV1 + exact AgentTaskV1 and deterministically
 * decides whether one Draft PR publication attempt is eligible.
 *
 * VERIFIED is necessary but not publication authority.
 * PUBLISHED_DRAFT ≠ Ready / Merge / Issue Close / Deploy.
 * PUBLISHED_DRAFT (V1) = fake/local publication simulation only.
 */

import {
  parseAgentTaskV1,
  validateAgentTaskV1,
  type AgentTaskRiskClass,
  type AgentTaskStopAt,
  type AgentTaskV1,
  type AgentTaskValidationResultV1,
} from "./agentTaskContract";
import {
  evaluateChangedPathsPolicy,
} from "./agentRunner";
import {
  INDEPENDENT_VERIFY_RESULT_SCHEMA,
  INDEPENDENT_VERIFY_VERSION,
  changedPathSetsEqual,
  findDuplicateChangedPaths,
  type IndependentVerifyResultV1,
  type IndependentVerifyStatus,
} from "./independentVerify";
import {
  DRAFT_PUBLISH_ADAPTER_FAKE,
  DRAFT_PUBLISH_GITHUB_MUTATION_PERFORMED,
  DRAFT_PUBLISH_PROVIDER_INTEGRATION_STATUS,
  DRAFT_PUBLISH_REAL_GITHUB_PUBLICATION_IMPLEMENTED,
  createFakeDraftPublishAdapterV1,
  type DraftPublishAdapterV1,
  type DraftPublishEvidenceV1,
  type DraftPublishProposedDraftPrV1,
  type DraftPublishSourceArtifactV1,
} from "./draftPublishAdapter";

export const DRAFT_PUBLISH_VERSION = "DRAFT-PUBLISH-V1" as const;
export const DRAFT_PUBLISH_RESULT_SCHEMA = "DRAFT-PUBLISH-RESULT-V1" as const;

/** Narrow capability required for this stage. No generic github.write. */
export const DRAFT_PUBLISH_REQUIRED_CAPABILITY =
  "github.draft-pr.publish.v1" as const;

/** Only R2 may become publication-eligible in V1. */
export const DRAFT_PUBLISH_REQUIRED_RISK_CLASS = "R2" as const satisfies AgentTaskRiskClass;

/** Only stopAt=DRAFT_PR may become publication-eligible. */
export const DRAFT_PUBLISH_REQUIRED_STOP_AT = "DRAFT_PR" as const satisfies AgentTaskStopAt;

export const DRAFT_PUBLISH_EXECUTION_SURFACE = "FAKE_IN_MEMORY_ONLY" as const;

export {
  DRAFT_PUBLISH_ADAPTER_FAKE,
  DRAFT_PUBLISH_GITHUB_MUTATION_PERFORMED,
  DRAFT_PUBLISH_PROVIDER_INTEGRATION_STATUS,
  DRAFT_PUBLISH_REAL_GITHUB_PUBLICATION_IMPLEMENTED,
  createFakeDraftPublishAdapterV1,
};

export const DRAFT_PUBLISH_INPUT_ROOT_KEYS = [
  "verifiedResult",
  "expectedTask",
  "publicationAttemptId",
  "observedAt",
  "sourceArtifact",
  "proposedDraftPr",
] as const;

export const DRAFT_PUBLISH_SOURCE_ARTIFACT_KEYS = [
  "repository",
  "baseRevision",
  "headRevision",
  "branchName",
  "changedPaths",
] as const;

export const DRAFT_PUBLISH_PROPOSED_DRAFT_PR_KEYS = [
  "title",
  "body",
  "baseBranch",
  "headBranch",
  "draft",
] as const;

export const DRAFT_PUBLISH_RESULT_ROOT_KEYS = [
  "schemaVersion",
  "publisherVersion",
  "status",
  "reasonCode",
  "reasonMessage",
  "publicationAttemptId",
  "taskId",
  "repository",
  "baseRevision",
  "headRevision",
  "branchName",
  "draftPrNumber",
  "draftPrUrl",
  "publicationEvidence",
  "taskValidation",
  "metadata",
] as const;

export type DraftPublishStatus =
  | "PUBLISHED_DRAFT"
  | "HOLD"
  | "REJECT"
  | "FAILED"
  | "UNKNOWN";

export type DraftPublishReasonCode =
  | "PUBLISHED_DRAFT"
  | "HOLD_VERIFIED"
  | "REJECT_VERIFIED"
  | "FAILED_VERIFIED"
  | "UNKNOWN_VERIFIED"
  | "REJECT_INPUT"
  | "REJECT_VERIFIER_SCHEMA"
  | "REJECT_VERIFIER_VERSION"
  | "REJECT_TASK_NULL"
  | "REJECT_TASK_MALFORMED"
  | "REJECT_TASK_SEMANTICS"
  | "REJECT_TASK_ID_BINDING"
  | "REJECT_TASK_ID_MISMATCH"
  | "HOLD_TASK_VALIDATION"
  | "HOLD_REPOSITORY_MISMATCH"
  | "HOLD_BASE_REVISION_MISMATCH"
  | "HOLD_BASE_MOVED"
  | "HOLD_MISSING_CAPABILITY"
  | "HOLD_UNSUPPORTED_RISK_CLASS"
  | "HOLD_STOP_AT"
  | "HOLD_UNSUPPORTED_STOP_AT"
  | "REJECT_PATH_MISMATCH"
  | "REJECT_CHANGED_PATH_UNSAFE"
  | "REJECT_CHANGED_PATH_DUPLICATE"
  | "FAILED_CHANGED_PATH_OUT_OF_SCOPE"
  | "FAILED_FORBIDDEN_PATH"
  | "REJECT_DRAFT_FLAG"
  | "REJECT_READY_AUTHORIZED"
  | "REJECT_MERGE_AUTHORIZED"
  | "REJECT_GITHUB_MUTATION_AUTHORIZED"
  | "REJECT_DEPLOY_AUTHORIZED"
  | "REJECT_IDEMPOTENCY_CONFLICT"
  | "REJECT_EVIDENCE_DRAFT_FALSE"
  | "FAILED_ADAPTER_OBSERVE"
  | "FAILED_ADAPTER_PREPARE"
  | "FAILED_ADAPTER_WRITE"
  | "FAILED_ADAPTER_COMMIT"
  | "FAILED_ADAPTER_PUBLISH"
  | "FAILED_ADAPTER_COLLECT"
  | "FAILED_ADAPTER_TIMEOUT"
  | "FAILED_CLEANUP"
  | "UNKNOWN_PUBLISHER_STATE";

export interface DraftPublishInputV1 {
  verifiedResult: IndependentVerifyResultV1;
  expectedTask: AgentTaskV1;
  publicationAttemptId: string;
  observedAt: string;
  sourceArtifact: DraftPublishSourceArtifactV1;
  proposedDraftPr: DraftPublishProposedDraftPrV1;
}

export interface DraftPublishMetadataV1 {
  observedAt: string;
  publicationAttemptId: string;
  adapterKind: string | null;
  cleanupCompleted: boolean;
  payloadFingerprint: string | null;
  replayed: boolean;
  readyAuthorized: false;
  mergeAuthorized: false;
  issueCloseAuthorized: false;
  deployAuthorized: false;
  productionMutationAuthorized: false;
  realGithubPublicationImplemented: false;
  githubMutationPerformed: false;
  providerIntegration: typeof DRAFT_PUBLISH_PROVIDER_INTEGRATION_STATUS;
  /**
   * Explicit: PUBLISHED_DRAFT in V1 means fake/local simulation only.
   * It does NOT imply an actual GitHub Draft PR was created.
   */
  publishedMeansFakeLocalSimulationOnly: true;
}

export interface DraftPublishResultV1 {
  schemaVersion: typeof DRAFT_PUBLISH_RESULT_SCHEMA;
  publisherVersion: typeof DRAFT_PUBLISH_VERSION;
  status: DraftPublishStatus;
  reasonCode: DraftPublishReasonCode;
  reasonMessage: string;
  publicationAttemptId: string;
  taskId: string | null;
  repository: string | null;
  baseRevision: string | null;
  headRevision: string | null;
  branchName: string | null;
  draftPrNumber: number | null;
  draftPrUrl: string | null;
  publicationEvidence: DraftPublishEvidenceV1 | null;
  taskValidation: AgentTaskValidationResultV1 | null;
  metadata: DraftPublishMetadataV1;
}

export interface PublishDraftPrV1Options {
  adapter?: DraftPublishAdapterV1;
  validatedAt?: string;
  treatPrefixOverlapAsHold?: boolean;
  /**
   * Shared attempt registry for domain-level idempotency checks.
   * Maps publicationAttemptId → prior payload fingerprint + prior result.
   */
  attemptRegistry?: Map<string, DraftPublishAttemptRecordV1>;
}

export interface DraftPublishAttemptRecordV1 {
  payloadFingerprint: string;
  result: DraftPublishResultV1;
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

function isRepository(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(value) &&
    value.length >= 3 &&
    value.length <= 256
  );
}

function isBaseRevision(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function metadataBase(input: {
  observedAt: string;
  publicationAttemptId: string;
  adapterKind?: string | null;
  cleanupCompleted?: boolean;
  payloadFingerprint?: string | null;
  replayed?: boolean;
}): DraftPublishMetadataV1 {
  return {
    observedAt: input.observedAt,
    publicationAttemptId: input.publicationAttemptId,
    adapterKind: input.adapterKind ?? null,
    cleanupCompleted: input.cleanupCompleted === true,
    payloadFingerprint: input.payloadFingerprint ?? null,
    replayed: input.replayed === true,
    readyAuthorized: false,
    mergeAuthorized: false,
    issueCloseAuthorized: false,
    deployAuthorized: false,
    productionMutationAuthorized: false,
    realGithubPublicationImplemented: false,
    githubMutationPerformed: false,
    providerIntegration: DRAFT_PUBLISH_PROVIDER_INTEGRATION_STATUS,
    publishedMeansFakeLocalSimulationOnly: true,
  };
}

function buildResult(input: {
  status: DraftPublishStatus;
  reasonCode: DraftPublishReasonCode;
  reasonMessage: string;
  publicationAttemptId: string;
  taskId: string | null;
  repository: string | null;
  baseRevision: string | null;
  headRevision?: string | null;
  branchName?: string | null;
  draftPrNumber?: number | null;
  draftPrUrl?: string | null;
  publicationEvidence?: DraftPublishEvidenceV1 | null;
  taskValidation?: AgentTaskValidationResultV1 | null;
  observedAt: string;
  adapterKind?: string | null;
  cleanupCompleted?: boolean;
  payloadFingerprint?: string | null;
  replayed?: boolean;
}): DraftPublishResultV1 {
  return {
    schemaVersion: DRAFT_PUBLISH_RESULT_SCHEMA,
    publisherVersion: DRAFT_PUBLISH_VERSION,
    status: input.status,
    reasonCode: input.reasonCode,
    reasonMessage: input.reasonMessage,
    publicationAttemptId: input.publicationAttemptId,
    taskId: input.taskId,
    repository: input.repository,
    baseRevision: input.baseRevision,
    headRevision: input.headRevision ?? null,
    branchName: input.branchName ?? null,
    draftPrNumber: input.draftPrNumber ?? null,
    draftPrUrl: input.draftPrUrl ?? null,
    publicationEvidence: input.publicationEvidence ?? null,
    taskValidation: input.taskValidation ?? null,
    metadata: metadataBase({
      observedAt: input.observedAt,
      publicationAttemptId: input.publicationAttemptId,
      adapterKind: input.adapterKind,
      cleanupCompleted: input.cleanupCompleted,
      payloadFingerprint: input.payloadFingerprint,
      replayed: input.replayed,
    }),
  };
}

const VERIFY_STATUSES: readonly IndependentVerifyStatus[] = [
  "VERIFIED",
  "HOLD",
  "REJECT",
  "FAILED",
  "UNKNOWN",
];

/**
 * Verifier-local structural check for IndependentVerifyResultV1.
 * Exact supported contract identity only.
 */
export function parseIndependentVerifyResultStructural(
  value: unknown,
):
  | { ok: true; result: IndependentVerifyResultV1 }
  | {
      ok: false;
      reasonCode:
        | "REJECT_VERIFIER_SCHEMA"
        | "REJECT_VERIFIER_VERSION"
        | "REJECT_INPUT";
      reasonMessage: string;
    } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "verifiedResult must be a JSON object.",
    };
  }
  if (value.schemaVersion !== INDEPENDENT_VERIFY_RESULT_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECT_VERIFIER_SCHEMA",
      reasonMessage: `verifiedResult.schemaVersion must be exactly ${INDEPENDENT_VERIFY_RESULT_SCHEMA}.`,
    };
  }
  if (value.verifierVersion !== INDEPENDENT_VERIFY_VERSION) {
    return {
      ok: false,
      reasonCode: "REJECT_VERIFIER_VERSION",
      reasonMessage: `verifiedResult.verifierVersion must be exactly ${INDEPENDENT_VERIFY_VERSION}.`,
    };
  }
  if (
    typeof value.status !== "string" ||
    !(VERIFY_STATUSES as readonly string[]).includes(value.status)
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage:
        "verifiedResult.status must be one of VERIFIED|HOLD|REJECT|FAILED|UNKNOWN.",
    };
  }
  if (
    !Array.isArray(value.verifiedChangedPaths) ||
    !value.verifiedChangedPaths.every((p) => typeof p === "string")
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "verifiedResult.verifiedChangedPaths must be a string array.",
    };
  }
  if (!isPlainObject(value.metadata)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "verifiedResult.metadata must be an object.",
    };
  }
  return { ok: true, result: value as unknown as IndependentVerifyResultV1 };
}

/**
 * Deterministic payload fingerprint for attempt idempotency.
 * Does not use PR title alone.
 */
export function computeDraftPublishPayloadFingerprint(input: {
  taskId: string;
  repository: string;
  baseRevision: string;
  headRevision: string;
  changedPaths: string[];
  proposedDraftPr: DraftPublishProposedDraftPrV1;
}): string {
  const paths = [...input.changedPaths]
    .map((p) => p.replace(/\/+$/, ""))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const payload = {
    taskId: input.taskId,
    repository: input.repository,
    baseRevision: input.baseRevision,
    headRevision: input.headRevision,
    changedPaths: paths,
    proposedDraftPr: {
      title: input.proposedDraftPr.title,
      body: input.proposedDraftPr.body,
      baseBranch: input.proposedDraftPr.baseBranch,
      headBranch: input.proposedDraftPr.headBranch,
      draft: input.proposedDraftPr.draft,
    },
  };
  return `fp:v1:${JSON.stringify(payload)}`;
}

function propagateVerifiedStatus(
  verifiedResult: IndependentVerifyResultV1,
  publicationAttemptId: string,
  observedAt: string,
): DraftPublishResultV1 | null {
  if (verifiedResult.status === "HOLD") {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_VERIFIED",
      reasonMessage: `Verifier HOLD: ${verifiedResult.reasonMessage}`,
      publicationAttemptId,
      taskId: verifiedResult.taskId,
      repository: verifiedResult.repository,
      baseRevision: verifiedResult.baseRevision,
      observedAt,
    });
  }
  if (verifiedResult.status === "REJECT") {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_VERIFIED",
      reasonMessage: `Verifier REJECT: ${verifiedResult.reasonMessage}`,
      publicationAttemptId,
      taskId: verifiedResult.taskId,
      repository: verifiedResult.repository,
      baseRevision: verifiedResult.baseRevision,
      observedAt,
    });
  }
  if (verifiedResult.status === "FAILED") {
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_VERIFIED",
      reasonMessage: `Verifier FAILED: ${verifiedResult.reasonMessage}`,
      publicationAttemptId,
      taskId: verifiedResult.taskId,
      repository: verifiedResult.repository,
      baseRevision: verifiedResult.baseRevision,
      observedAt,
    });
  }
  if (verifiedResult.status === "UNKNOWN") {
    return buildResult({
      status: "UNKNOWN",
      reasonCode: "UNKNOWN_VERIFIED",
      reasonMessage: `Verifier UNKNOWN: ${verifiedResult.reasonMessage}`,
      publicationAttemptId,
      taskId: verifiedResult.taskId,
      repository: verifiedResult.repository,
      baseRevision: verifiedResult.baseRevision,
      observedAt,
    });
  }
  return null;
}

function checkVerifierMetadataBoundary(
  metadata: Record<string, unknown>,
):
  | { ok: true }
  | { ok: false; reasonCode: DraftPublishReasonCode; reasonMessage: string } {
  // publicationAuthorized === false is EXPECTED — verifier never grants publication.
  if (metadata.readyAuthorized === true) {
    return {
      ok: false,
      reasonCode: "REJECT_READY_AUTHORIZED",
      reasonMessage:
        "Verifier claims readyAuthorized=true; REJECT. Do not normalize.",
    };
  }
  if (metadata.mergeAuthorized === true) {
    return {
      ok: false,
      reasonCode: "REJECT_MERGE_AUTHORIZED",
      reasonMessage:
        "Verifier claims mergeAuthorized=true; REJECT. Do not normalize.",
    };
  }
  if (metadata.githubMutationAuthorized === true) {
    return {
      ok: false,
      reasonCode: "REJECT_GITHUB_MUTATION_AUTHORIZED",
      reasonMessage:
        "Verifier claims githubMutationAuthorized=true; REJECT. Do not normalize.",
    };
  }
  if (metadata.deployAuthorized === true) {
    return {
      ok: false,
      reasonCode: "REJECT_DEPLOY_AUTHORIZED",
      reasonMessage:
        "Verifier claims deployAuthorized=true; REJECT. Do not normalize.",
    };
  }
  return { ok: true };
}

function parseSourceArtifact(
  value: unknown,
):
  | { ok: true; artifact: DraftPublishSourceArtifactV1 }
  | { ok: false; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return { ok: false, reasonMessage: "sourceArtifact must be an object." };
  }
  if (!hasOnlyKeys(value, DRAFT_PUBLISH_SOURCE_ARTIFACT_KEYS)) {
    return {
      ok: false,
      reasonMessage: "sourceArtifact contains unknown properties.",
    };
  }
  if (!isRepository(value.repository)) {
    return {
      ok: false,
      reasonMessage: "sourceArtifact.repository is missing or malformed.",
    };
  }
  if (!isBaseRevision(value.baseRevision)) {
    return {
      ok: false,
      reasonMessage:
        "sourceArtifact.baseRevision must be a 40-character lowercase Git SHA.",
    };
  }
  if (!isBaseRevision(value.headRevision)) {
    return {
      ok: false,
      reasonMessage:
        "sourceArtifact.headRevision must be a 40-character lowercase Git SHA.",
    };
  }
  if (
    typeof value.branchName !== "string" ||
    value.branchName.length < 1 ||
    value.branchName.length > 256
  ) {
    return {
      ok: false,
      reasonMessage: "sourceArtifact.branchName must be a non-empty bounded string.",
    };
  }
  if (
    !Array.isArray(value.changedPaths) ||
    !value.changedPaths.every((p) => typeof p === "string")
  ) {
    return {
      ok: false,
      reasonMessage: "sourceArtifact.changedPaths must be a string array.",
    };
  }
  return {
    ok: true,
    artifact: {
      repository: value.repository,
      baseRevision: value.baseRevision,
      headRevision: value.headRevision,
      branchName: value.branchName,
      changedPaths: value.changedPaths as string[],
    },
  };
}

function parseProposedDraftPr(
  value: unknown,
):
  | { ok: true; proposed: DraftPublishProposedDraftPrV1 }
  | {
      ok: false;
      reasonCode: "REJECT_INPUT" | "REJECT_DRAFT_FLAG";
      reasonMessage: string;
    } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "proposedDraftPr must be an object.",
    };
  }
  if (!hasOnlyKeys(value, DRAFT_PUBLISH_PROPOSED_DRAFT_PR_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "proposedDraftPr contains unknown properties.",
    };
  }
  if (typeof value.title !== "string" || value.title.length < 1) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "proposedDraftPr.title must be a non-empty string.",
    };
  }
  if (typeof value.body !== "string" || value.body.length < 1) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "proposedDraftPr.body must be a non-empty string.",
    };
  }
  if (typeof value.baseBranch !== "string" || value.baseBranch.length < 1) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "proposedDraftPr.baseBranch must be a non-empty string.",
    };
  }
  if (typeof value.headBranch !== "string" || value.headBranch.length < 1) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "proposedDraftPr.headBranch must be a non-empty string.",
    };
  }
  // draft must be exactly true — missing / undefined / false / wrong type → REJECT
  if (!Object.prototype.hasOwnProperty.call(value, "draft")) {
    return {
      ok: false,
      reasonCode: "REJECT_DRAFT_FLAG",
      reasonMessage:
        "proposedDraftPr.draft is required and must be exactly true.",
    };
  }
  if (value.draft !== true) {
    return {
      ok: false,
      reasonCode: "REJECT_DRAFT_FLAG",
      reasonMessage:
        "proposedDraftPr.draft must be exactly true; missing/undefined/false/wrong-type fail closed.",
    };
  }
  return {
    ok: true,
    proposed: {
      title: value.title,
      body: value.body,
      baseBranch: value.baseBranch,
      headBranch: value.headBranch,
      draft: true,
    },
  };
}

/**
 * Publish one Draft PR attempt under DRAFT-PUBLISH-V1 policy.
 * Pure/deterministic aside from the injected adapter. Default adapter is fake.
 */
export function publishDraftPrV1(
  rawInput: unknown,
  options: PublishDraftPrV1Options = {},
): DraftPublishResultV1 {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const adapter = options.adapter ?? createFakeDraftPublishAdapterV1();
  const attemptRegistry =
    options.attemptRegistry ?? new Map<string, DraftPublishAttemptRecordV1>();

  const attemptIdFromRaw =
    isPlainObject(rawInput) && typeof rawInput.publicationAttemptId === "string"
      ? rawInput.publicationAttemptId
      : "unknown";
  const observedAtFromRaw =
    isPlainObject(rawInput) && typeof rawInput.observedAt === "string"
      ? rawInput.observedAt
      : validatedAt;

  if (!isPlainObject(rawInput)) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Publisher input must be a JSON object.",
      publicationAttemptId: attemptIdFromRaw,
      taskId: null,
      repository: null,
      baseRevision: null,
      observedAt: observedAtFromRaw,
    });
  }
  if (!hasOnlyKeys(rawInput, DRAFT_PUBLISH_INPUT_ROOT_KEYS)) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Publisher input contains unknown properties.",
      publicationAttemptId: attemptIdFromRaw,
      taskId: null,
      repository: null,
      baseRevision: null,
      observedAt: observedAtFromRaw,
    });
  }
  if (
    typeof rawInput.publicationAttemptId !== "string" ||
    rawInput.publicationAttemptId.length < 1 ||
    rawInput.publicationAttemptId.length > 128
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage:
        "publicationAttemptId must be a non-empty bounded string.",
      publicationAttemptId: attemptIdFromRaw,
      taskId: null,
      repository: null,
      baseRevision: null,
      observedAt: observedAtFromRaw,
    });
  }
  if (
    typeof rawInput.observedAt !== "string" ||
    rawInput.observedAt.length < 1
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "observedAt must be a non-empty string.",
      publicationAttemptId: rawInput.publicationAttemptId,
      taskId: null,
      repository: null,
      baseRevision: null,
      observedAt: observedAtFromRaw,
    });
  }

  const publicationAttemptId = rawInput.publicationAttemptId;
  const observedAt = rawInput.observedAt;

  if (rawInput.expectedTask === null || rawInput.expectedTask === undefined) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_TASK_NULL",
      reasonMessage: "expectedTask must be non-null; fail closed.",
      publicationAttemptId,
      taskId: null,
      repository: null,
      baseRevision: null,
      observedAt,
    });
  }

  const verifiedParsed = parseIndependentVerifyResultStructural(
    rawInput.verifiedResult,
  );
  if (!verifiedParsed.ok) {
    return buildResult({
      status: "REJECT",
      reasonCode: verifiedParsed.reasonCode,
      reasonMessage: verifiedParsed.reasonMessage,
      publicationAttemptId,
      taskId: null,
      repository: null,
      baseRevision: null,
      observedAt,
    });
  }
  const verifiedResult = verifiedParsed.result;

  // Non-VERIFIED never publishes.
  if (verifiedResult.status !== "VERIFIED") {
    const propagated = propagateVerifiedStatus(
      verifiedResult,
      publicationAttemptId,
      observedAt,
    );
    if (propagated) return propagated;
    return buildResult({
      status: "UNKNOWN",
      reasonCode: "UNKNOWN_PUBLISHER_STATE",
      reasonMessage: "Unrecognized verifiedResult.status; fail closed.",
      publicationAttemptId,
      taskId: verifiedResult.taskId,
      repository: verifiedResult.repository,
      baseRevision: verifiedResult.baseRevision,
      observedAt,
    });
  }

  const sourceParsed = parseSourceArtifact(rawInput.sourceArtifact);
  if (!sourceParsed.ok) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: sourceParsed.reasonMessage,
      publicationAttemptId,
      taskId: verifiedResult.taskId,
      repository: verifiedResult.repository,
      baseRevision: verifiedResult.baseRevision,
      observedAt,
    });
  }
  const sourceArtifact = sourceParsed.artifact;

  const proposedParsed = parseProposedDraftPr(rawInput.proposedDraftPr);
  if (!proposedParsed.ok) {
    return buildResult({
      status: "REJECT",
      reasonCode: proposedParsed.reasonCode,
      reasonMessage: proposedParsed.reasonMessage,
      publicationAttemptId,
      taskId: verifiedResult.taskId,
      repository: verifiedResult.repository,
      baseRevision: verifiedResult.baseRevision,
      headRevision: sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      observedAt,
    });
  }
  const proposedDraftPr = proposedParsed.proposed;

  // Task revalidation.
  const structural = parseAgentTaskV1(rawInput.expectedTask);
  if (!structural.ok) {
    const taskIdGuess =
      isPlainObject(rawInput.expectedTask) &&
      typeof rawInput.expectedTask.taskId === "string"
        ? rawInput.expectedTask.taskId
        : null;
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_TASK_MALFORMED",
      reasonMessage: `expectedTask failed structural parse: ${structural.reasonMessage}`,
      publicationAttemptId,
      taskId: taskIdGuess,
      repository: verifiedResult.repository,
      baseRevision: verifiedResult.baseRevision,
      observedAt,
    });
  }
  const expectedTask = structural.task;
  const revalidation = validateAgentTaskV1(expectedTask, {
    validatedAt,
    treatPrefixOverlapAsHold: options.treatPrefixOverlapAsHold,
  });
  if (revalidation.status !== "VALID") {
    if (revalidation.status === "HOLD") {
      return buildResult({
        status: "HOLD",
        reasonCode: "HOLD_TASK_VALIDATION",
        reasonMessage: `expectedTask revalidation HOLD: ${revalidation.reasonMessage}`,
        publicationAttemptId,
        taskId: expectedTask.taskId,
        repository: expectedTask.repository,
        baseRevision: expectedTask.baseRevision,
        taskValidation: revalidation,
        observedAt,
      });
    }
    if (revalidation.status === "UNKNOWN") {
      return buildResult({
        status: "UNKNOWN",
        reasonCode: "UNKNOWN_PUBLISHER_STATE",
        reasonMessage: `expectedTask revalidation UNKNOWN: ${revalidation.reasonMessage}`,
        publicationAttemptId,
        taskId: expectedTask.taskId,
        repository: expectedTask.repository,
        baseRevision: expectedTask.baseRevision,
        taskValidation: revalidation,
        observedAt,
      });
    }
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_TASK_SEMANTICS",
      reasonMessage: revalidation.reasonMessage,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }
  if (revalidation.taskId !== expectedTask.taskId) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_TASK_ID_BINDING",
      reasonMessage: `validation.taskId (${String(revalidation.taskId)}) is not bound to expectedTask.taskId (${expectedTask.taskId}); fail closed.`,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  // Identity binding — verified ↔ expectedTask.
  if (verifiedResult.taskId !== expectedTask.taskId) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_TASK_ID_MISMATCH",
      reasonMessage: `verifiedResult.taskId (${String(verifiedResult.taskId)}) !== expectedTask.taskId (${expectedTask.taskId}); fail closed.`,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }
  if (verifiedResult.repository !== expectedTask.repository) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_REPOSITORY_MISMATCH",
      reasonMessage: `verifiedResult.repository (${String(verifiedResult.repository)}) !== expectedTask.repository (${expectedTask.repository}); exact equality required.`,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }
  if (verifiedResult.baseRevision !== expectedTask.baseRevision) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_BASE_REVISION_MISMATCH",
      reasonMessage: `verifiedResult.baseRevision (${String(verifiedResult.baseRevision)}) !== expectedTask.baseRevision (${expectedTask.baseRevision}); exact equality required.`,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  // sourceArtifact identity binding.
  if (sourceArtifact.repository !== expectedTask.repository) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_REPOSITORY_MISMATCH",
      reasonMessage: `sourceArtifact.repository (${sourceArtifact.repository}) !== expectedTask.repository (${expectedTask.repository}); exact equality required.`,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }
  if (sourceArtifact.baseRevision !== expectedTask.baseRevision) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_BASE_REVISION_MISMATCH",
      reasonMessage: `sourceArtifact.baseRevision (${sourceArtifact.baseRevision}) !== expectedTask.baseRevision (${expectedTask.baseRevision}); exact equality required; no fetch/rebase/substitution.`,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  // Verifier metadata boundary — publicationAuthorized=false is expected.
  const metaCheck = checkVerifierMetadataBoundary(
    verifiedResult.metadata as unknown as Record<string, unknown>,
  );
  if (!metaCheck.ok) {
    return buildResult({
      status: "REJECT",
      reasonCode: metaCheck.reasonCode,
      reasonMessage: metaCheck.reasonMessage,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  // Capability boundary — no silent insertion.
  if (
    !expectedTask.allowedCapabilities.includes(DRAFT_PUBLISH_REQUIRED_CAPABILITY)
  ) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_MISSING_CAPABILITY",
      reasonMessage: `expectedTask.allowedCapabilities must include ${DRAFT_PUBLISH_REQUIRED_CAPABILITY}; missing capability → HOLD. No silent insertion.`,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  // Risk boundary — only R2 eligible; R0/R1/R3-R5 HOLD.
  if (expectedTask.riskClass !== DRAFT_PUBLISH_REQUIRED_RISK_CLASS) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_UNSUPPORTED_RISK_CLASS",
      reasonMessage: `riskClass=${expectedTask.riskClass} is not publication-eligible in DRAFT-PUBLISH-V1 (requires R2). No silent upgrade.`,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  // stopAt boundary — only DRAFT_PR eligible.
  if (expectedTask.stopAt !== DRAFT_PUBLISH_REQUIRED_STOP_AT) {
    const earlier =
      expectedTask.stopAt === "TASK_BUILT" ||
      expectedTask.stopAt === "AGENT_COMPLETE" ||
      expectedTask.stopAt === "VERIFY_COMPLETE";
    return buildResult({
      status: "HOLD",
      reasonCode: earlier ? "HOLD_STOP_AT" : "HOLD_UNSUPPORTED_STOP_AT",
      reasonMessage: earlier
        ? `stopAt=${expectedTask.stopAt} is before DRAFT_PR; publication HOLD.`
        : `stopAt=${String(expectedTask.stopAt)} is unsupported for DRAFT-PUBLISH-V1; fail closed.`,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  // Path policy on both verified and source sets; then exact equality.
  const verifiedPaths = verifiedResult.verifiedChangedPaths;
  const sourcePaths = sourceArtifact.changedPaths;

  const verifiedDup = findDuplicateChangedPaths(verifiedPaths);
  if (verifiedDup !== null) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_CHANGED_PATH_DUPLICATE",
      reasonMessage: `Duplicate verifiedChangedPaths entry fails closed: ${verifiedDup}`,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }
  const sourceDup = findDuplicateChangedPaths(sourcePaths);
  if (sourceDup !== null) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_CHANGED_PATH_DUPLICATE",
      reasonMessage: `Duplicate sourceArtifact.changedPaths entry fails closed: ${sourceDup}`,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  const verifiedPolicy = evaluateChangedPathsPolicy(expectedTask, verifiedPaths);
  if (!verifiedPolicy.ok) {
    return buildResult({
      status: verifiedPolicy.status,
      reasonCode: verifiedPolicy.reasonCode,
      reasonMessage: verifiedPolicy.reasonMessage,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }
  const sourcePolicy = evaluateChangedPathsPolicy(expectedTask, sourcePaths);
  if (!sourcePolicy.ok) {
    return buildResult({
      status: sourcePolicy.status,
      reasonCode: sourcePolicy.reasonCode,
      reasonMessage: sourcePolicy.reasonMessage,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  if (!changedPathSetsEqual(verifiedPaths, sourcePaths)) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PATH_MISMATCH",
      reasonMessage:
        "verifiedResult.verifiedChangedPaths set !== sourceArtifact.changedPaths set; fail closed. Do not accept the smaller set.",
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      taskValidation: revalidation,
      observedAt,
    });
  }

  const payloadFingerprint = computeDraftPublishPayloadFingerprint({
    taskId: expectedTask.taskId,
    repository: expectedTask.repository,
    baseRevision: expectedTask.baseRevision,
    headRevision: sourceArtifact.headRevision,
    changedPaths: sourcePaths,
    proposedDraftPr,
  });

  // Domain-level idempotency before adapter mutation.
  const prior = attemptRegistry.get(publicationAttemptId);
  if (prior) {
    if (prior.payloadFingerprint !== payloadFingerprint) {
      return buildResult({
        status: "REJECT",
        reasonCode: "REJECT_IDEMPOTENCY_CONFLICT",
        reasonMessage:
          "Same publicationAttemptId with a different payload fingerprint; REJECT_IDEMPOTENCY_CONFLICT.",
        publicationAttemptId,
        taskId: expectedTask.taskId,
        repository: expectedTask.repository,
        baseRevision: expectedTask.baseRevision,
        headRevision: sourceArtifact.headRevision,
        branchName: sourceArtifact.branchName,
        taskValidation: revalidation,
        observedAt,
        payloadFingerprint,
      });
    }
    // Same attempt + same fingerprint → deterministic replay of prior result.
    return {
      ...prior.result,
      metadata: {
        ...prior.result.metadata,
        replayed: true,
        payloadFingerprint,
      },
    };
  }

  // Adapter path — eligibility already decided.
  const ctx = {
    publicationAttemptId,
    expectedTask,
    sourceArtifact,
    proposedDraftPr,
    payloadFingerprint,
    observedAt,
  };

  let cleanupCompleted = false;
  const finishCleanup = (): boolean => {
    const cleanup = adapter.cleanup(ctx);
    cleanupCompleted = cleanup.ok && cleanup.cleaned;
    return cleanup.ok;
  };

  const observed = adapter.observeBase(ctx);
  if (!observed.ok) {
    finishCleanup();
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_ADAPTER_OBSERVE",
      reasonMessage: observed.reasonMessage ?? "Adapter observeBase failed.",
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
      payloadFingerprint,
    });
  }

  if (observed.observedBaseRevision !== expectedTask.baseRevision) {
    finishCleanup();
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_BASE_MOVED",
      reasonMessage: `Observed base revision (${String(observed.observedBaseRevision)}) !== expectedTask.baseRevision (${expectedTask.baseRevision}); HOLD_BASE_MOVED. No fetch/rebase/substitution.`,
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
      payloadFingerprint,
    });
  }

  const prepared = adapter.prepareBranch(ctx);
  if (!prepared.ok) {
    finishCleanup();
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_ADAPTER_PREPARE",
      reasonMessage: prepared.reasonMessage ?? "Adapter prepareBranch failed.",
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
      payloadFingerprint,
    });
  }

  const written = adapter.writeVerifiedChanges(ctx);
  if (!written.ok) {
    finishCleanup();
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_ADAPTER_WRITE",
      reasonMessage:
        written.reasonMessage ?? "Adapter writeVerifiedChanges failed.",
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
      payloadFingerprint,
    });
  }

  const committed = adapter.createCommit(ctx);
  if (!committed.ok) {
    finishCleanup();
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_ADAPTER_COMMIT",
      reasonMessage: committed.reasonMessage ?? "Adapter createCommit failed.",
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
      payloadFingerprint,
    });
  }

  const published = adapter.publishDraftPr(ctx);
  if (!published.ok) {
    finishCleanup();
    return buildResult({
      status: "FAILED",
      reasonCode: published.timedOut
        ? "FAILED_ADAPTER_TIMEOUT"
        : "FAILED_ADAPTER_PUBLISH",
      reasonMessage:
        published.reasonMessage ??
        (published.timedOut
          ? "Adapter publishDraftPr timed out."
          : "Adapter publishDraftPr failed."),
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
      payloadFingerprint,
    });
  }

  if (published.draft !== true) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_EVIDENCE_DRAFT_FALSE",
      reasonMessage:
        "Adapter publish evidence draft !== true; fail closed. Never claim PUBLISHED_DRAFT.",
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: committed.headRevision ?? sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      draftPrNumber: published.draftPrNumber,
      draftPrUrl: published.draftPrUrl,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
      payloadFingerprint,
    });
  }

  const collected = adapter.collectPublicationEvidence(ctx);
  if (!collected.ok) {
    finishCleanup();
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_ADAPTER_COLLECT",
      reasonMessage:
        collected.reasonMessage ?? "Adapter collectPublicationEvidence failed.",
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: committed.headRevision ?? sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      draftPrNumber: published.draftPrNumber,
      draftPrUrl: published.draftPrUrl,
      publicationEvidence: collected.evidence,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
      payloadFingerprint,
    });
  }

  const evidence = collected.evidence;
  if (evidence.draft !== true) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_EVIDENCE_DRAFT_FALSE",
      reasonMessage:
        "Publication evidence draft !== true; fail closed. Never claim PUBLISHED_DRAFT.",
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: evidence.headRevision || sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      draftPrNumber: evidence.draftPrNumber,
      draftPrUrl: evidence.draftPrUrl,
      publicationEvidence: evidence,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
      payloadFingerprint,
    });
  }

  // Core V1 evidence invariants.
  if (
    evidence.githubMutationPerformed !== false ||
    evidence.networkAccess !== false ||
    evidence.secretsRequired !== false ||
    evidence.productionMutationPerformed !== false
  ) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage:
        "Publication evidence claims network/secret/GitHub/production mutation; fail closed.",
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: evidence.headRevision,
      branchName: sourceArtifact.branchName,
      publicationEvidence: evidence,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
      payloadFingerprint,
    });
  }

  const cleanupOk = finishCleanup();
  if (!cleanupOk) {
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_CLEANUP",
      reasonMessage: "Adapter cleanup failed after publication simulation.",
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: evidence.headRevision,
      branchName: sourceArtifact.branchName,
      draftPrNumber: evidence.draftPrNumber,
      draftPrUrl: evidence.draftPrUrl,
      publicationEvidence: evidence,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted: false,
      payloadFingerprint,
      replayed: evidence.replayed,
    });
  }

  const result = buildResult({
    status: "PUBLISHED_DRAFT",
    reasonCode: "PUBLISHED_DRAFT",
    reasonMessage:
      "Draft publication PASS via fake/local simulation only. PUBLISHED_DRAFT ≠ real GitHub Draft PR, Ready, Merge, Issue Close, or Deploy authorization.",
    publicationAttemptId,
    taskId: expectedTask.taskId,
    repository: expectedTask.repository,
    baseRevision: expectedTask.baseRevision,
    headRevision: evidence.headRevision,
    branchName: sourceArtifact.branchName,
    draftPrNumber: evidence.draftPrNumber,
    draftPrUrl: evidence.draftPrUrl,
    publicationEvidence: evidence,
    taskValidation: revalidation,
    observedAt,
    adapterKind: adapter.kind,
    cleanupCompleted: true,
    payloadFingerprint,
    replayed: evidence.replayed,
  });

  attemptRegistry.set(publicationAttemptId, {
    payloadFingerprint,
    result,
  });

  return result;
}

export function assertDraftPublishBoundaries(): void {
  if (DRAFT_PUBLISH_REAL_GITHUB_PUBLICATION_IMPLEMENTED) {
    throw new Error(
      "DRAFT-PUBLISH-V1 real GitHub publication must remain NOT IMPLEMENTED",
    );
  }
  if (DRAFT_PUBLISH_GITHUB_MUTATION_PERFORMED) {
    throw new Error(
      "DRAFT-PUBLISH-V1 must not claim GitHub mutation performed",
    );
  }
  if (DRAFT_PUBLISH_PROVIDER_INTEGRATION_STATUS !== "HOLD") {
    throw new Error(
      "DRAFT-PUBLISH-V1 provider integration must remain HOLD",
    );
  }
}
