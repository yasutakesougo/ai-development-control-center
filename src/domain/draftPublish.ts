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
  deriveCanonicalPublicationHandoffIdentities,
} from "./publicationHandoffCanonical";
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
  "authorizedPublicationHandoff",
] as const;

/**
 * Machine-readable A→B publication handoff binding accepted by DRAFT-PUBLISH-V1.
 * Compatible with PUBLICATION-HANDOFF-V1 (must include publicationTaskId).
 * Absent → legacy same-taskId path only.
 */
export const DRAFT_PUBLISH_AUTHORIZED_HANDOFF_KEYS = [
  "schemaVersion",
  "handoffId",
  "sourceExecutionTaskId",
  "publicationTaskId",
  "sourceIssue",
  "repository",
  "baseRevision",
  "verifiedChangedPaths",
  "verificationAttemptId",
  "verificationFingerprint",
  "authorityFingerprint",
  "requestedPublicationCapability",
  "requestedRiskClass",
  "requestedStopAt",
  "observedAt",
] as const;

export const DRAFT_PUBLISH_AUTHORIZED_HANDOFF_SCHEMA =
  "PUBLICATION-HANDOFF-V1" as const;

export const DRAFT_PUBLISH_SOURCE_ARTIFACT_KEYS = [
  "repository",
  "baseRevision",
  "baseBranch",
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
  | "REJECT_PUBLICATION_HANDOFF_REQUIRED"
  | "REJECT_PUBLICATION_HANDOFF"
  | "REJECT_HANDOFF_SOURCE_TASK_ID"
  | "REJECT_HANDOFF_PUBLICATION_TASK_ID"
  | "REJECT_HANDOFF_SOURCE_ISSUE"
  | "REJECT_HANDOFF_VERIFICATION_BINDING"
  | "REJECT_HANDOFF_PATHS"
  | "REJECT_HANDOFF_AUTHORITY"
  | "REJECT_HANDOFF_CANONICAL_TASK_ID"
  | "REJECT_HANDOFF_AUTHORITY_FINGERPRINT"
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
  | "REJECT_BRANCH_MISMATCH"
  | "REJECT_BASE_BRANCH_MISMATCH"
  | "REJECT_EVIDENCE_BRANCH_NOT_PREPARED"
  | "REJECT_EVIDENCE_COMMIT_NOT_CREATED"
  | "REJECT_EVIDENCE_PATH_MISMATCH"
  | "REJECT_EVIDENCE_HEAD_MISMATCH"
  | "HOLD_EVIDENCE_BASE_MISMATCH"
  | "REJECT_EVIDENCE_PR_NUMBER"
  | "REJECT_EVIDENCE_PR_URL"
  | "REJECT_EVIDENCE_PHASE_MISMATCH"
  | "REJECT_PHASE_BRANCH_NOT_PREPARED"
  | "REJECT_PHASE_PATH_MISMATCH"
  | "REJECT_PHASE_COMMIT_NOT_CREATED"
  | "REJECT_PHASE_HEAD_MISMATCH"
  | "REJECT_PHASE_PR_NUMBER"
  | "REJECT_PHASE_PR_URL"
  | "REJECT_READY_AUTHORIZED"
  | "REJECT_MERGE_AUTHORIZED"
  | "REJECT_GITHUB_MUTATION_AUTHORIZED"
  | "REJECT_DEPLOY_AUTHORIZED"
  | "REJECT_PUBLICATION_AUTHORIZED"
  | "REJECT_VERIFIER_METADATA"
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

export interface DraftPublishAuthorizedHandoffV1 {
  schemaVersion: typeof DRAFT_PUBLISH_AUTHORIZED_HANDOFF_SCHEMA;
  handoffId: string;
  sourceExecutionTaskId: string;
  publicationTaskId: string;
  sourceIssue: { repository: string; number: number };
  repository: string;
  baseRevision: string;
  verifiedChangedPaths: string[];
  verificationAttemptId: string;
  verificationFingerprint: string;
  /** Required — recomputed by DRAFT-PUBLISH against shared canonical helpers. */
  authorityFingerprint: string;
  requestedPublicationCapability: typeof DRAFT_PUBLISH_REQUIRED_CAPABILITY;
  requestedRiskClass: typeof DRAFT_PUBLISH_REQUIRED_RISK_CLASS;
  requestedStopAt: typeof DRAFT_PUBLISH_REQUIRED_STOP_AT;
  observedAt: string;
}

export interface DraftPublishInputV1 {
  verifiedResult: IndependentVerifyResultV1;
  expectedTask: AgentTaskV1;
  publicationAttemptId: string;
  observedAt: string;
  sourceArtifact: DraftPublishSourceArtifactV1;
  proposedDraftPr: DraftPublishProposedDraftPrV1;
  /**
   * Required when verifiedResult.taskId !== expectedTask.taskId
   * (execution A → publication B via RUNNER-PUBLISH-HANDOFF-V1).
   */
  authorizedPublicationHandoff?: DraftPublishAuthorizedHandoffV1;
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
  branchName: string;
  baseBranch: string;
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
    branchName: input.branchName,
    baseBranch: input.baseBranch,
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

function parseAuthorizedPublicationHandoff(
  value: unknown,
):
  | { ok: true; handoff: DraftPublishAuthorizedHandoffV1 }
  | { ok: false; reasonCode: DraftPublishReasonCode; reasonMessage: string } {
  if (value === undefined || value === null) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_HANDOFF",
      reasonMessage:
        "authorizedPublicationHandoff is present but null/undefined; fail closed.",
    };
  }
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_HANDOFF",
      reasonMessage: "authorizedPublicationHandoff must be an object.",
    };
  }
  if (!hasOnlyKeys(value, DRAFT_PUBLISH_AUTHORIZED_HANDOFF_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_HANDOFF",
      reasonMessage:
        "authorizedPublicationHandoff contains unknown properties; fail closed.",
    };
  }
  for (const key of DRAFT_PUBLISH_AUTHORIZED_HANDOFF_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      return {
        ok: false,
        reasonCode: "REJECT_PUBLICATION_HANDOFF",
        reasonMessage: `authorizedPublicationHandoff.${key} is required; missing fails closed.`,
      };
    }
    if (value[key] === undefined) {
      return {
        ok: false,
        reasonCode: "REJECT_PUBLICATION_HANDOFF",
        reasonMessage: `authorizedPublicationHandoff.${key} must not be undefined.`,
      };
    }
  }
  if (value.schemaVersion !== DRAFT_PUBLISH_AUTHORIZED_HANDOFF_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_HANDOFF",
      reasonMessage: `authorizedPublicationHandoff.schemaVersion must be ${DRAFT_PUBLISH_AUTHORIZED_HANDOFF_SCHEMA}.`,
    };
  }
  if (
    typeof value.handoffId !== "string" ||
    value.handoffId.length < 1 ||
    value.handoffId.length > 128
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_HANDOFF",
      reasonMessage: "authorizedPublicationHandoff.handoffId malformed.",
    };
  }
  if (
    typeof value.sourceExecutionTaskId !== "string" ||
    value.sourceExecutionTaskId.length < 1
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_SOURCE_TASK_ID",
      reasonMessage:
        "authorizedPublicationHandoff.sourceExecutionTaskId malformed.",
    };
  }
  if (
    typeof value.publicationTaskId !== "string" ||
    value.publicationTaskId.length < 1
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_PUBLICATION_TASK_ID",
      reasonMessage: "authorizedPublicationHandoff.publicationTaskId malformed.",
    };
  }
  if (value.sourceExecutionTaskId === value.publicationTaskId) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_HANDOFF",
      reasonMessage:
        "authorizedPublicationHandoff requires distinct sourceExecutionTaskId and publicationTaskId.",
    };
  }
  if (!isRepository(value.repository) || !isBaseRevision(value.baseRevision)) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_HANDOFF",
      reasonMessage:
        "authorizedPublicationHandoff.repository/baseRevision malformed.",
    };
  }
  if (!isPlainObject(value.sourceIssue)) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_SOURCE_ISSUE",
      reasonMessage: "authorizedPublicationHandoff.sourceIssue must be an object.",
    };
  }
  if (
    typeof value.sourceIssue.repository !== "string" ||
    typeof value.sourceIssue.number !== "number"
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_SOURCE_ISSUE",
      reasonMessage: "authorizedPublicationHandoff.sourceIssue malformed.",
    };
  }
  if (
    !Array.isArray(value.verifiedChangedPaths) ||
    !value.verifiedChangedPaths.every((p) => typeof p === "string") ||
    value.verifiedChangedPaths.length < 1
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_PATHS",
      reasonMessage:
        "authorizedPublicationHandoff.verifiedChangedPaths must be a non-empty string array.",
    };
  }
  if (
    typeof value.verificationAttemptId !== "string" ||
    value.verificationAttemptId.length < 1 ||
    typeof value.verificationFingerprint !== "string" ||
    value.verificationFingerprint.length < 1
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_VERIFICATION_BINDING",
      reasonMessage:
        "authorizedPublicationHandoff.verificationAttemptId/fingerprint required.",
    };
  }
  if (
    typeof value.authorityFingerprint !== "string" ||
    value.authorityFingerprint.length < 1
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_AUTHORITY_FINGERPRINT",
      reasonMessage:
        "authorizedPublicationHandoff.authorityFingerprint is required; missing fails closed.",
    };
  }
  if (typeof value.observedAt !== "string" || value.observedAt.length < 1) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_HANDOFF",
      reasonMessage: "authorizedPublicationHandoff.observedAt malformed.",
    };
  }
  if (
    value.requestedPublicationCapability !== DRAFT_PUBLISH_REQUIRED_CAPABILITY
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_AUTHORITY",
      reasonMessage: `authorizedPublicationHandoff.requestedPublicationCapability must be exactly ${DRAFT_PUBLISH_REQUIRED_CAPABILITY}.`,
    };
  }
  if (value.requestedRiskClass !== DRAFT_PUBLISH_REQUIRED_RISK_CLASS) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_AUTHORITY",
      reasonMessage: `authorizedPublicationHandoff.requestedRiskClass must be exactly ${DRAFT_PUBLISH_REQUIRED_RISK_CLASS}.`,
    };
  }
  if (value.requestedStopAt !== DRAFT_PUBLISH_REQUIRED_STOP_AT) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_AUTHORITY",
      reasonMessage: `authorizedPublicationHandoff.requestedStopAt must be exactly ${DRAFT_PUBLISH_REQUIRED_STOP_AT}.`,
    };
  }
  return {
    ok: true,
    handoff: {
      schemaVersion: DRAFT_PUBLISH_AUTHORIZED_HANDOFF_SCHEMA,
      handoffId: value.handoffId,
      sourceExecutionTaskId: value.sourceExecutionTaskId,
      publicationTaskId: value.publicationTaskId,
      sourceIssue: {
        repository: value.sourceIssue.repository,
        number: value.sourceIssue.number,
      },
      repository: value.repository,
      baseRevision: value.baseRevision,
      verifiedChangedPaths: value.verifiedChangedPaths as string[],
      verificationAttemptId: value.verificationAttemptId,
      verificationFingerprint: value.verificationFingerprint,
      authorityFingerprint: value.authorityFingerprint,
      requestedPublicationCapability: DRAFT_PUBLISH_REQUIRED_CAPABILITY,
      requestedRiskClass: DRAFT_PUBLISH_REQUIRED_RISK_CLASS,
      requestedStopAt: DRAFT_PUBLISH_REQUIRED_STOP_AT,
      observedAt: value.observedAt,
    },
  };
}

/**
 * Bind verified execution A + publication task B through an authorized handoff.
 * Does not mutate verifiedResult or rewrite taskIds.
 * Independently recomputes canonical publicationTaskId + fingerprints via
 * shared RUNNER-PUBLISH-HANDOFF-V1 helpers — self-asserted handoffs fail closed.
 */
function bindAuthorizedPublicationHandoff(input: {
  handoff: DraftPublishAuthorizedHandoffV1;
  verifiedResult: IndependentVerifyResultV1;
  expectedTask: AgentTaskV1;
}):
  | { ok: true }
  | { ok: false; reasonCode: DraftPublishReasonCode; reasonMessage: string } {
  const { handoff, verifiedResult, expectedTask } = input;

  if (verifiedResult.taskId !== handoff.sourceExecutionTaskId) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_SOURCE_TASK_ID",
      reasonMessage: `verifiedResult.taskId (${String(verifiedResult.taskId)}) !== handoff.sourceExecutionTaskId (${handoff.sourceExecutionTaskId}).`,
    };
  }
  if (expectedTask.taskId !== handoff.publicationTaskId) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_PUBLICATION_TASK_ID",
      reasonMessage: `expectedTask.taskId (${expectedTask.taskId}) !== handoff.publicationTaskId (${handoff.publicationTaskId}).`,
    };
  }
  if (verifiedResult.taskId === expectedTask.taskId) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_HANDOFF",
      reasonMessage:
        "authorizedPublicationHandoff present but verifiedResult.taskId === expectedTask.taskId; A→B transition required.",
    };
  }

  if (
    handoff.repository !== expectedTask.repository ||
    handoff.repository !== verifiedResult.repository
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_HANDOFF",
      reasonMessage:
        "handoff.repository must equal verifiedResult.repository and expectedTask.repository.",
    };
  }
  if (
    handoff.baseRevision !== expectedTask.baseRevision ||
    handoff.baseRevision !== verifiedResult.baseRevision
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_HANDOFF",
      reasonMessage:
        "handoff.baseRevision must equal verifiedResult.baseRevision and expectedTask.baseRevision.",
    };
  }

  if (
    handoff.sourceIssue.repository !== expectedTask.sourceIssue.repository ||
    handoff.sourceIssue.number !== expectedTask.sourceIssue.number ||
    handoff.sourceIssue.repository !== handoff.repository
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_SOURCE_ISSUE",
      reasonMessage:
        "handoff.sourceIssue must bind exactly to expectedTask.sourceIssue and handoff.repository.",
    };
  }

  if (
    handoff.verificationAttemptId !== verifiedResult.verificationAttemptId
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_VERIFICATION_BINDING",
      reasonMessage:
        "handoff.verificationAttemptId !== verifiedResult.verificationAttemptId.",
    };
  }

  // Independent canonical recompute — do not trust self-asserted IDs/fingerprints.
  const canonical = deriveCanonicalPublicationHandoffIdentities(
    {
      handoffId: handoff.handoffId,
      sourceExecutionTaskId: handoff.sourceExecutionTaskId,
      sourceIssue: handoff.sourceIssue,
      repository: handoff.repository,
      baseRevision: handoff.baseRevision,
      verifiedChangedPaths: handoff.verifiedChangedPaths,
      verificationAttemptId: handoff.verificationAttemptId,
      requestedPublicationCapability: handoff.requestedPublicationCapability,
      requestedRiskClass: handoff.requestedRiskClass,
      requestedStopAt: handoff.requestedStopAt,
    },
    {
      verificationAttemptId: String(verifiedResult.verificationAttemptId),
      sourceExecutionTaskId: String(verifiedResult.taskId),
      repository: String(verifiedResult.repository),
      baseRevision: String(verifiedResult.baseRevision),
      verifiedChangedPaths: verifiedResult.verifiedChangedPaths,
    },
  );

  if (handoff.publicationTaskId !== canonical.publicationTaskId) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_CANONICAL_TASK_ID",
      reasonMessage:
        "handoff.publicationTaskId is not the canonical RUNNER-PUBLISH-HANDOFF-V1 derivation; forged/self-asserted publication task rejected.",
    };
  }
  if (expectedTask.taskId !== canonical.publicationTaskId) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_CANONICAL_TASK_ID",
      reasonMessage:
        "expectedTask.taskId is not the canonical publication taskId derived from authorized handoff fields.",
    };
  }
  if (handoff.authorityFingerprint !== canonical.authorityFingerprint) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_AUTHORITY_FINGERPRINT",
      reasonMessage:
        "handoff.authorityFingerprint does not recompute exactly; forged/stale authority rejected.",
    };
  }
  if (handoff.verificationFingerprint !== canonical.verificationFingerprint) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_VERIFICATION_BINDING",
      reasonMessage:
        "handoff.verificationFingerprint does not match recomputed VERIFIED binding fingerprint; forged/stale provenance rejected.",
    };
  }

  if (
    !changedPathSetsEqual(
      handoff.verifiedChangedPaths,
      verifiedResult.verifiedChangedPaths,
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_PATHS",
      reasonMessage:
        "handoff.verifiedChangedPaths !== verifiedResult.verifiedChangedPaths.",
    };
  }
  if (
    !changedPathSetsEqual(
      expectedTask.allowedPaths,
      verifiedResult.verifiedChangedPaths,
    ) ||
    expectedTask.allowedPaths.length !==
      verifiedResult.verifiedChangedPaths.length
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_PATHS",
      reasonMessage:
        "expectedTask.allowedPaths must equal verifiedResult.verifiedChangedPaths under authorized handoff.",
    };
  }

  if (
    expectedTask.allowedCapabilities.length !== 1 ||
    expectedTask.allowedCapabilities[0] !== DRAFT_PUBLISH_REQUIRED_CAPABILITY ||
    handoff.requestedPublicationCapability !== DRAFT_PUBLISH_REQUIRED_CAPABILITY
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_AUTHORITY",
      reasonMessage:
        "Under authorized handoff, publication capability must be exactly github.draft-pr.publish.v1 (no generics).",
    };
  }
  if (
    expectedTask.riskClass !== DRAFT_PUBLISH_REQUIRED_RISK_CLASS ||
    handoff.requestedRiskClass !== DRAFT_PUBLISH_REQUIRED_RISK_CLASS
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_AUTHORITY",
      reasonMessage: "Under authorized handoff, riskClass must be exactly R2.",
    };
  }
  if (
    expectedTask.stopAt !== DRAFT_PUBLISH_REQUIRED_STOP_AT ||
    handoff.requestedStopAt !== DRAFT_PUBLISH_REQUIRED_STOP_AT
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_HANDOFF_AUTHORITY",
      reasonMessage: "Under authorized handoff, stopAt must be exactly DRAFT_PR.",
    };
  }

  return { ok: true };
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
  // Untrusted verifier metadata: require exact literals (missing/undefined fail closed).
  // publicationAuthorized === false is EXPECTED — verifier never grants publication.
  if (metadata.publicationAuthorized !== false) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_AUTHORIZED",
      reasonMessage:
        "verifiedResult.metadata.publicationAuthorized must be exactly false; missing/undefined/true fail closed.",
    };
  }
  if (metadata.readyAuthorized !== false) {
    return {
      ok: false,
      reasonCode: "REJECT_READY_AUTHORIZED",
      reasonMessage:
        "verifiedResult.metadata.readyAuthorized must be exactly false; missing/undefined/true fail closed.",
    };
  }
  if (metadata.mergeAuthorized !== false) {
    return {
      ok: false,
      reasonCode: "REJECT_MERGE_AUTHORIZED",
      reasonMessage:
        "verifiedResult.metadata.mergeAuthorized must be exactly false; missing/undefined/true fail closed.",
    };
  }
  if (metadata.githubMutationAuthorized !== false) {
    return {
      ok: false,
      reasonCode: "REJECT_GITHUB_MUTATION_AUTHORIZED",
      reasonMessage:
        "verifiedResult.metadata.githubMutationAuthorized must be exactly false; missing/undefined/true fail closed.",
    };
  }
  if (metadata.deployAuthorized !== false) {
    return {
      ok: false,
      reasonCode: "REJECT_DEPLOY_AUTHORIZED",
      reasonMessage:
        "verifiedResult.metadata.deployAuthorized must be exactly false; missing/undefined/true fail closed.",
    };
  }
  return { ok: true };
}

/**
 * Re-validate untrusted adapter evidence before PUBLISHED_DRAFT.
 * Adapter ok=true alone is never authority — phase payloads and evidence must
 * agree with each other and with the source artifact.
 */
function checkPublicationEvidenceBoundary(input: {
  evidence: DraftPublishEvidenceV1;
  expectedTask: AgentTaskV1;
  sourceArtifact: DraftPublishSourceArtifactV1;
  prepared: { branchPrepared: boolean };
  written: { verifiedPathsWritten: string[] };
  committed: { commitCreated: boolean; headRevision: string };
  published: {
    draft: boolean;
    draftPrNumber: number;
    draftPrUrl: string;
  };
}):
  | { ok: true }
  | { ok: false; reasonCode: DraftPublishReasonCode; reasonMessage: string } {
  const {
    evidence,
    expectedTask,
    sourceArtifact,
    prepared,
    written,
    committed,
    published,
  } = input;

  if (evidence.draft !== true) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_DRAFT_FALSE",
      reasonMessage:
        "Publication evidence draft !== true; fail closed. Never claim PUBLISHED_DRAFT.",
    };
  }
  if (evidence.observedBaseRevision !== expectedTask.baseRevision) {
    return {
      ok: false,
      reasonCode: "HOLD_EVIDENCE_BASE_MISMATCH",
      reasonMessage: `evidence.observedBaseRevision (${String(evidence.observedBaseRevision)}) !== expectedTask.baseRevision (${expectedTask.baseRevision}); fail closed.`,
    };
  }
  if (evidence.branchPrepared !== true) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_BRANCH_NOT_PREPARED",
      reasonMessage:
        "evidence.branchPrepared must be exactly true before PUBLISHED_DRAFT; fail closed.",
    };
  }
  if (evidence.commitCreated !== true) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_COMMIT_NOT_CREATED",
      reasonMessage:
        "evidence.commitCreated must be exactly true before PUBLISHED_DRAFT; fail closed.",
    };
  }
  if (!Array.isArray(evidence.verifiedPathsWritten)) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_PATH_MISMATCH",
      reasonMessage:
        "evidence.verifiedPathsWritten must be a string array; fail closed.",
    };
  }
  const writtenDup = findDuplicateChangedPaths(evidence.verifiedPathsWritten);
  if (writtenDup !== null) {
    return {
      ok: false,
      reasonCode: "REJECT_CHANGED_PATH_DUPLICATE",
      reasonMessage: `Duplicate evidence.verifiedPathsWritten entry fails closed: ${writtenDup}`,
    };
  }
  if (
    !changedPathSetsEqual(
      evidence.verifiedPathsWritten,
      sourceArtifact.changedPaths,
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_PATH_MISMATCH",
      reasonMessage:
        "evidence.verifiedPathsWritten set !== sourceArtifact.changedPaths set; fail closed.",
    };
  }
  if (evidence.headRevision !== sourceArtifact.headRevision) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_HEAD_MISMATCH",
      reasonMessage: `evidence.headRevision (${String(evidence.headRevision)}) !== sourceArtifact.headRevision (${sourceArtifact.headRevision}); fail closed.`,
    };
  }
  if (
    typeof evidence.draftPrNumber !== "number" ||
    !Number.isInteger(evidence.draftPrNumber) ||
    evidence.draftPrNumber < 1
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_PR_NUMBER",
      reasonMessage:
        "evidence.draftPrNumber must be a valid positive integer; fail closed.",
    };
  }
  if (
    typeof evidence.draftPrUrl !== "string" ||
    evidence.draftPrUrl.length < 1 ||
    evidence.draftPrUrl.length > 2048
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_PR_URL",
      reasonMessage:
        "evidence.draftPrUrl must be a non-empty bounded string; fail closed.",
    };
  }
  if (
    evidence.githubMutationPerformed !== false ||
    evidence.networkAccess !== false ||
    evidence.secretsRequired !== false ||
    evidence.productionMutationPerformed !== false
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage:
        "Publication evidence claims network/secret/GitHub/production mutation; fail closed.",
    };
  }

  // Phase ↔ evidence binding (adapter must not invent a second story).
  if (evidence.branchPrepared !== prepared.branchPrepared) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_PHASE_MISMATCH",
      reasonMessage:
        "evidence.branchPrepared !== prepareBranch.branchPrepared; fail closed.",
    };
  }
  if (
    !changedPathSetsEqual(
      evidence.verifiedPathsWritten,
      written.verifiedPathsWritten,
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_PHASE_MISMATCH",
      reasonMessage:
        "evidence.verifiedPathsWritten !== writeVerifiedChanges.verifiedPathsWritten; fail closed.",
    };
  }
  if (evidence.commitCreated !== committed.commitCreated) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_PHASE_MISMATCH",
      reasonMessage:
        "evidence.commitCreated !== createCommit.commitCreated; fail closed.",
    };
  }
  if (evidence.headRevision !== committed.headRevision) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_PHASE_MISMATCH",
      reasonMessage:
        "evidence.headRevision !== createCommit.headRevision; fail closed.",
    };
  }
  if (evidence.draftPrNumber !== published.draftPrNumber) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_PHASE_MISMATCH",
      reasonMessage:
        "evidence.draftPrNumber !== publishDraftPr.draftPrNumber; fail closed.",
    };
  }
  if (evidence.draftPrUrl !== published.draftPrUrl) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_PHASE_MISMATCH",
      reasonMessage:
        "evidence.draftPrUrl !== publishDraftPr.draftPrUrl; fail closed.",
    };
  }
  if (evidence.draft !== published.draft) {
    return {
      ok: false,
      reasonCode: "REJECT_EVIDENCE_PHASE_MISMATCH",
      reasonMessage:
        "evidence.draft !== publishDraftPr.draft; fail closed.",
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
    typeof value.baseBranch !== "string" ||
    value.baseBranch.length < 1 ||
    value.baseBranch.length > 256
  ) {
    return {
      ok: false,
      reasonMessage: "sourceArtifact.baseBranch must be a non-empty bounded string.",
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
      baseBranch: value.baseBranch,
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

  // Exact branch identity binding — publication metadata must match source artifact.
  if (proposedDraftPr.headBranch !== sourceArtifact.branchName) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_BRANCH_MISMATCH",
      reasonMessage: `proposedDraftPr.headBranch (${proposedDraftPr.headBranch}) !== sourceArtifact.branchName (${sourceArtifact.branchName}); exact equality required.`,
      publicationAttemptId,
      taskId: verifiedResult.taskId,
      repository: verifiedResult.repository,
      baseRevision: verifiedResult.baseRevision,
      headRevision: sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      observedAt,
    });
  }
  if (proposedDraftPr.baseBranch !== sourceArtifact.baseBranch) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_BASE_BRANCH_MISMATCH",
      reasonMessage: `proposedDraftPr.baseBranch (${proposedDraftPr.baseBranch}) !== sourceArtifact.baseBranch (${sourceArtifact.baseBranch}); exact equality required.`,
      publicationAttemptId,
      taskId: verifiedResult.taskId,
      repository: verifiedResult.repository,
      baseRevision: verifiedResult.baseRevision,
      headRevision: sourceArtifact.headRevision,
      branchName: sourceArtifact.branchName,
      observedAt,
    });
  }

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
  // Same taskId: legacy direct path.
  // Distinct taskIds: require authorizedPublicationHandoff (A→B) provenance.
  const handoffRaw = Object.prototype.hasOwnProperty.call(
    rawInput,
    "authorizedPublicationHandoff",
  )
    ? rawInput.authorizedPublicationHandoff
    : undefined;

  if (handoffRaw !== undefined) {
    const handoffParsed = parseAuthorizedPublicationHandoff(handoffRaw);
    if (!handoffParsed.ok) {
      return buildResult({
        status: "REJECT",
        reasonCode: handoffParsed.reasonCode,
        reasonMessage: handoffParsed.reasonMessage,
        publicationAttemptId,
        taskId: expectedTask.taskId,
        repository: expectedTask.repository,
        baseRevision: expectedTask.baseRevision,
        taskValidation: revalidation,
        observedAt,
      });
    }
    const handoffBind = bindAuthorizedPublicationHandoff({
      handoff: handoffParsed.handoff,
      verifiedResult,
      expectedTask,
    });
    if (!handoffBind.ok) {
      return buildResult({
        status: "REJECT",
        reasonCode: handoffBind.reasonCode,
        reasonMessage: handoffBind.reasonMessage,
        publicationAttemptId,
        taskId: expectedTask.taskId,
        repository: expectedTask.repository,
        baseRevision: expectedTask.baseRevision,
        taskValidation: revalidation,
        observedAt,
      });
    }
  } else if (verifiedResult.taskId !== expectedTask.taskId) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PUBLICATION_HANDOFF_REQUIRED",
      reasonMessage: `verifiedResult.taskId (${String(verifiedResult.taskId)}) !== expectedTask.taskId (${expectedTask.taskId}); authorizedPublicationHandoff is required for A→B publication (do not rewrite verify taskId). Legacy same-taskId path remains available without handoff.`,
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
    branchName: sourceArtifact.branchName,
    baseBranch: sourceArtifact.baseBranch,
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
  if (prepared.branchPrepared !== true) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PHASE_BRANCH_NOT_PREPARED",
      reasonMessage:
        "prepareBranch.ok=true but branchPrepared !== true; fail closed.",
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
  if (
    !Array.isArray(written.verifiedPathsWritten) ||
    findDuplicateChangedPaths(written.verifiedPathsWritten) !== null ||
    !changedPathSetsEqual(
      written.verifiedPathsWritten,
      sourceArtifact.changedPaths,
    )
  ) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PHASE_PATH_MISMATCH",
      reasonMessage:
        "writeVerifiedChanges.verifiedPathsWritten must exactly equal sourceArtifact.changedPaths; fail closed.",
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
  if (committed.commitCreated !== true) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PHASE_COMMIT_NOT_CREATED",
      reasonMessage:
        "createCommit.ok=true but commitCreated !== true; fail closed.",
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
  if (committed.headRevision !== sourceArtifact.headRevision) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PHASE_HEAD_MISMATCH",
      reasonMessage: `createCommit.headRevision (${String(committed.headRevision)}) !== sourceArtifact.headRevision (${sourceArtifact.headRevision}); fail closed.`,
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
      headRevision: sourceArtifact.headRevision,
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
  if (
    typeof published.draftPrNumber !== "number" ||
    !Number.isInteger(published.draftPrNumber) ||
    published.draftPrNumber < 1
  ) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PHASE_PR_NUMBER",
      reasonMessage:
        "publishDraftPr.draftPrNumber must be a valid positive integer; fail closed.",
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: sourceArtifact.headRevision,
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
  if (
    typeof published.draftPrUrl !== "string" ||
    published.draftPrUrl.length < 1 ||
    published.draftPrUrl.length > 2048
  ) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_PHASE_PR_URL",
      reasonMessage:
        "publishDraftPr.draftPrUrl must be a non-empty bounded string; fail closed.",
      publicationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      headRevision: sourceArtifact.headRevision,
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
      headRevision: sourceArtifact.headRevision,
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
  const evidenceCheck = checkPublicationEvidenceBoundary({
    evidence,
    expectedTask,
    sourceArtifact,
    prepared: { branchPrepared: prepared.branchPrepared },
    written: { verifiedPathsWritten: written.verifiedPathsWritten },
    committed: {
      commitCreated: committed.commitCreated,
      headRevision: committed.headRevision as string,
    },
    published: {
      draft: published.draft,
      draftPrNumber: published.draftPrNumber,
      draftPrUrl: published.draftPrUrl,
    },
  });
  if (!evidenceCheck.ok) {
    finishCleanup();
    const status: DraftPublishStatus =
      evidenceCheck.reasonCode === "HOLD_EVIDENCE_BASE_MISMATCH"
        ? "HOLD"
        : "REJECT";
    return buildResult({
      status,
      reasonCode: evidenceCheck.reasonCode,
      reasonMessage: evidenceCheck.reasonMessage,
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
