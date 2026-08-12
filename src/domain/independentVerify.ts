/**
 * INDEPENDENT-VERIFY-V1
 *
 * DETERMINISTIC VERIFICATION OF RUNNER OUTCOMES · FAKE/LOCAL ADAPTER ONLY
 * NO REAL COMMAND EXECUTION · NO GITHUB PUBLICATION · NO READY/MERGE/DEPLOY
 *
 * Consumes AgentRunnerResultV1 as untrusted evidence and decides whether that
 * runner outcome is independently VERIFIED.
 *
 * Runner COMPLETED is evidence only. It is never verification authority.
 * VERIFIED ≠ publication / Ready / Merge / GitHub mutation / deploy authorization.
 */

import {
  AGENT_TASK_VALIDATION_RESULT_SCHEMA,
  evaluatePathBoundary,
  isRepoRelativePath,
  normalizeRepoPath,
  parseAgentTaskV1,
  validateAgentTaskV1,
  type AgentTaskV1,
  type AgentTaskValidationResultV1,
} from "./agentTaskContract";
import {
  AGENT_RUNNER_RESULT_SCHEMA,
  AGENT_RUNNER_VERSION,
  evaluateChangedPathsPolicy,
  type AgentRunnerResultV1,
  type AgentRunnerStatus,
} from "./agentRunner";
import {
  INDEPENDENT_VERIFY_ADAPTER_FAKE,
  INDEPENDENT_VERIFY_COMMAND_EXECUTION_IMPLEMENTED,
  INDEPENDENT_VERIFY_GITHUB_PUBLICATION_IMPLEMENTED,
  INDEPENDENT_VERIFY_PROVIDER_INTEGRATION_STATUS,
  INDEPENDENT_VERIFY_REAL_COMMAND_VERIFICATION_IMPLEMENTED,
  createFakeIndependentVerifyAdapterV1,
  type IndependentVerifyAdapterV1,
  type IndependentVerifyEvidenceV1,
} from "./independentVerifyAdapter";

export const INDEPENDENT_VERIFY_VERSION = "INDEPENDENT-VERIFY-V1" as const;
export const INDEPENDENT_VERIFY_RESULT_SCHEMA =
  "INDEPENDENT-VERIFY-RESULT-V1" as const;

/** Real shell / CI verification remains unimplemented. */
export const INDEPENDENT_VERIFY_EXECUTION_SURFACE =
  "FAKE_IN_MEMORY_ONLY" as const;

export {
  INDEPENDENT_VERIFY_ADAPTER_FAKE,
  INDEPENDENT_VERIFY_COMMAND_EXECUTION_IMPLEMENTED,
  INDEPENDENT_VERIFY_GITHUB_PUBLICATION_IMPLEMENTED,
  INDEPENDENT_VERIFY_PROVIDER_INTEGRATION_STATUS,
  INDEPENDENT_VERIFY_REAL_COMMAND_VERIFICATION_IMPLEMENTED,
  createFakeIndependentVerifyAdapterV1,
};

export const INDEPENDENT_VERIFY_INPUT_ROOT_KEYS = [
  "runnerResult",
  "expectedTask",
  "verificationAttemptId",
  "observedAt",
] as const;

export const INDEPENDENT_VERIFY_RESULT_ROOT_KEYS = [
  "schemaVersion",
  "verifierVersion",
  "status",
  "reasonCode",
  "reasonMessage",
  "verificationAttemptId",
  "taskId",
  "repository",
  "baseRevision",
  "verifiedChangedPaths",
  "verificationEvidence",
  "taskValidation",
  "metadata",
] as const;

export type IndependentVerifyStatus =
  | "VERIFIED"
  | "HOLD"
  | "REJECT"
  | "FAILED"
  | "UNKNOWN";

export type IndependentVerifyReasonCode =
  | "VERIFIED"
  | "HOLD_RUNNER"
  | "REJECT_RUNNER"
  | "FAILED_RUNNER"
  | "UNKNOWN_RUNNER"
  | "REJECT_INPUT"
  | "REJECT_RUNNER_SCHEMA"
  | "REJECT_RUNNER_VERSION"
  | "REJECT_RUNNER_STATUS"
  | "REJECT_TASK_NULL"
  | "REJECT_TASK_MALFORMED"
  | "REJECT_TASK_SEMANTICS"
  | "REJECT_TASK_ID_BINDING"
  | "REJECT_TASK_ID_MISMATCH"
  | "HOLD_TASK_VALIDATION"
  | "HOLD_REPOSITORY_MISMATCH"
  | "HOLD_BASE_REVISION_MISMATCH"
  | "REJECT_VALIDATION_SCHEMA"
  | "REJECT_VALIDATION_TASK_BINDING"
  | "REJECT_VALIDATION_STATUS"
  | "REJECT_EXECUTION_NOT_INVOKED"
  | "REJECT_CLEANUP_INCOMPLETE"
  | "REJECT_RUNNER_SELF_VERIFICATION"
  | "REJECT_PUBLICATION_AUTHORIZED"
  | "REJECT_READY_AUTHORIZED"
  | "REJECT_MERGE_AUTHORIZED"
  | "REJECT_GITHUB_MUTATION_AUTHORIZED"
  | "REJECT_WORKSPACE_NETWORK"
  | "REJECT_WORKSPACE_SECRETS"
  | "REJECT_WORKSPACE_GITHUB_MUTATION"
  | "REJECT_WORKSPACE_PRODUCTION_MUTATION"
  | "REJECT_CHANGED_PATH_UNSAFE"
  | "REJECT_CHANGED_PATH_DUPLICATE"
  | "FAILED_CHANGED_PATH_OUT_OF_SCOPE"
  | "FAILED_FORBIDDEN_PATH"
  | "REJECT_EVIDENCE_CHANGED_PATH_MISMATCH"
  | "REJECT_EVIDENCE_FAILED"
  | "FAILED_ADAPTER_OBSERVE"
  | "FAILED_ADAPTER_VERIFY"
  | "FAILED_ADAPTER_TIMEOUT"
  | "FAILED_ADAPTER_COLLECT"
  | "FAILED_CLEANUP"
  | "UNKNOWN_VERIFIER_STATE";

export interface IndependentVerifyInputV1 {
  runnerResult: AgentRunnerResultV1;
  expectedTask: AgentTaskV1;
  verificationAttemptId: string;
  observedAt: string;
}

export interface IndependentVerifyMetadataV1 {
  observedAt: string;
  verificationAttemptId: string;
  adapterKind: string | null;
  cleanupCompleted: boolean;
  /** Always false — VERIFIED never authorizes publication. */
  publicationAuthorized: false;
  readyAuthorized: false;
  mergeAuthorized: false;
  githubMutationAuthorized: false;
  deployAuthorized: false;
  commandExecutionImplemented: false;
  realCommandVerificationImplemented: false;
  providerIntegration: typeof INDEPENDENT_VERIFY_PROVIDER_INTEGRATION_STATUS;
  /**
   * Explicit: VERIFIED in V1 means deterministic fake/local evidence PASS only.
   * It does NOT imply real CI or shell verification happened.
   */
  verifiedMeansFakeLocalEvidenceOnly: true;
}

export interface IndependentVerifyResultV1 {
  schemaVersion: typeof INDEPENDENT_VERIFY_RESULT_SCHEMA;
  verifierVersion: typeof INDEPENDENT_VERIFY_VERSION;
  status: IndependentVerifyStatus;
  reasonCode: IndependentVerifyReasonCode;
  reasonMessage: string;
  verificationAttemptId: string;
  taskId: string | null;
  repository: string | null;
  baseRevision: string | null;
  verifiedChangedPaths: string[];
  verificationEvidence: IndependentVerifyEvidenceV1 | null;
  taskValidation: AgentTaskValidationResultV1 | null;
  metadata: IndependentVerifyMetadataV1;
}

export interface VerifyAgentRunnerResultV1Options {
  adapter?: IndependentVerifyAdapterV1;
  validatedAt?: string;
  treatPrefixOverlapAsHold?: boolean;
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

const RUNNER_STATUSES: readonly AgentRunnerStatus[] = [
  "COMPLETED",
  "HOLD",
  "REJECT",
  "FAILED",
  "UNKNOWN",
];

function metadataBase(input: {
  observedAt: string;
  verificationAttemptId: string;
  adapterKind?: string | null;
  cleanupCompleted?: boolean;
}): IndependentVerifyMetadataV1 {
  return {
    observedAt: input.observedAt,
    verificationAttemptId: input.verificationAttemptId,
    adapterKind: input.adapterKind ?? null,
    cleanupCompleted: input.cleanupCompleted === true,
    publicationAuthorized: false,
    readyAuthorized: false,
    mergeAuthorized: false,
    githubMutationAuthorized: false,
    deployAuthorized: false,
    commandExecutionImplemented: false,
    realCommandVerificationImplemented: false,
    providerIntegration: INDEPENDENT_VERIFY_PROVIDER_INTEGRATION_STATUS,
    verifiedMeansFakeLocalEvidenceOnly: true,
  };
}

function buildResult(input: {
  status: IndependentVerifyStatus;
  reasonCode: IndependentVerifyReasonCode;
  reasonMessage: string;
  verificationAttemptId: string;
  taskId: string | null;
  repository: string | null;
  baseRevision: string | null;
  verifiedChangedPaths?: string[];
  verificationEvidence?: IndependentVerifyEvidenceV1 | null;
  taskValidation?: AgentTaskValidationResultV1 | null;
  observedAt: string;
  adapterKind?: string | null;
  cleanupCompleted?: boolean;
}): IndependentVerifyResultV1 {
  return {
    schemaVersion: INDEPENDENT_VERIFY_RESULT_SCHEMA,
    verifierVersion: INDEPENDENT_VERIFY_VERSION,
    status: input.status,
    reasonCode: input.reasonCode,
    reasonMessage: input.reasonMessage,
    verificationAttemptId: input.verificationAttemptId,
    taskId: input.taskId,
    repository: input.repository,
    baseRevision: input.baseRevision,
    verifiedChangedPaths: input.verifiedChangedPaths ?? [],
    verificationEvidence: input.verificationEvidence ?? null,
    taskValidation: input.taskValidation ?? null,
    metadata: metadataBase({
      observedAt: input.observedAt,
      verificationAttemptId: input.verificationAttemptId,
      adapterKind: input.adapterKind,
      cleanupCompleted: input.cleanupCompleted,
    }),
  };
}

/**
 * Verifier-local structural check for AgentRunnerResultV1.
 * Does not broaden AGENT-RUNNER-V1; exact supported contract identity only.
 */
export function parseAgentRunnerResultStructural(
  value: unknown,
):
  | { ok: true; result: AgentRunnerResultV1 }
  | {
      ok: false;
      reasonCode:
        | "REJECT_RUNNER_SCHEMA"
        | "REJECT_RUNNER_VERSION"
        | "REJECT_RUNNER_STATUS"
        | "REJECT_INPUT";
      reasonMessage: string;
    } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "runnerResult must be a JSON object.",
    };
  }
  if (value.schemaVersion !== AGENT_RUNNER_RESULT_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECT_RUNNER_SCHEMA",
      reasonMessage: `runnerResult.schemaVersion must be exactly ${AGENT_RUNNER_RESULT_SCHEMA}.`,
    };
  }
  if (value.runnerVersion !== AGENT_RUNNER_VERSION) {
    return {
      ok: false,
      reasonCode: "REJECT_RUNNER_VERSION",
      reasonMessage: `runnerResult.runnerVersion must be exactly ${AGENT_RUNNER_VERSION}.`,
    };
  }
  if (
    typeof value.status !== "string" ||
    !(RUNNER_STATUSES as readonly string[]).includes(value.status)
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_RUNNER_STATUS",
      reasonMessage:
        "runnerResult.status must be one of COMPLETED|HOLD|REJECT|FAILED|UNKNOWN.",
    };
  }
  if (typeof value.reasonCode !== "string" || value.reasonCode.length < 1) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "runnerResult.reasonCode is missing or malformed.",
    };
  }
  if (
    typeof value.reasonMessage !== "string" ||
    value.reasonMessage.length < 1
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "runnerResult.reasonMessage is missing or malformed.",
    };
  }
  if (
    typeof value.runnerAttemptId !== "string" ||
    value.runnerAttemptId.length < 1
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "runnerResult.runnerAttemptId is missing or malformed.",
    };
  }
  if (
    !(
      value.taskId === null ||
      (typeof value.taskId === "string" && value.taskId.length >= 1)
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "runnerResult.taskId must be string or null.",
    };
  }
  if (
    !(
      value.repository === null ||
      (typeof value.repository === "string" && value.repository.length >= 1)
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "runnerResult.repository must be string or null.",
    };
  }
  if (
    !(
      value.baseRevision === null ||
      (typeof value.baseRevision === "string" && value.baseRevision.length >= 1)
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "runnerResult.baseRevision must be string or null.",
    };
  }
  if (
    !Array.isArray(value.changedPaths) ||
    !value.changedPaths.every((p) => typeof p === "string")
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "runnerResult.changedPaths must be a string array.",
    };
  }
  if (!isPlainObject(value.metadata)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "runnerResult.metadata must be an object.",
    };
  }

  // Accept as AgentRunnerResultV1 after exact identity + required shape checks.
  // Remaining fields are re-checked on the COMPLETED path; do not trust them.
  return { ok: true, result: value as unknown as AgentRunnerResultV1 };
}

/**
 * Fail-closed parse of verifier input. Unknown root properties → REJECT.
 */
export function parseIndependentVerifyInput(
  value: unknown,
):
  | { ok: true; input: IndependentVerifyInputV1 }
  | {
      ok: false;
      reasonCode: "REJECT_INPUT";
      reasonMessage: string;
    } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Verifier input must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, INDEPENDENT_VERIFY_INPUT_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Verifier input contains unknown properties.",
    };
  }
  if (
    typeof value.verificationAttemptId !== "string" ||
    value.verificationAttemptId.length < 1 ||
    value.verificationAttemptId.length > 128
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage:
        "verificationAttemptId must be a non-empty bounded string.",
    };
  }
  if (typeof value.observedAt !== "string" || value.observedAt.length < 1) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "observedAt must be a non-empty string.",
    };
  }
  if (value.expectedTask === null || value.expectedTask === undefined) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "expectedTask must be non-null.",
    };
  }
  if (!isPlainObject(value.expectedTask)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "expectedTask must be an object.",
    };
  }
  if (!isPlainObject(value.runnerResult)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "runnerResult must be an object.",
    };
  }

  const runnerParsed = parseAgentRunnerResultStructural(value.runnerResult);
  if (!runnerParsed.ok) {
    // Surface as REJECT_INPUT at parse layer; verify() also re-checks.
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: runnerParsed.reasonMessage,
    };
  }

  return {
    ok: true,
    input: {
      runnerResult: runnerParsed.result,
      expectedTask: value.expectedTask as unknown as AgentTaskV1,
      verificationAttemptId: value.verificationAttemptId,
      observedAt: value.observedAt,
    },
  };
}

/**
 * Detect duplicate changed-path entries after trailing-slash normalization.
 * Fail closed — do not silently dedupe into VERIFIED.
 */
export function findDuplicateChangedPaths(
  changedPaths: string[],
): string | null {
  const seen = new Set<string>();
  for (const path of changedPaths) {
    if (typeof path !== "string" || path.length < 1) {
      return String(path);
    }
    // Only normalize trailing slash for duplicate detection when path is
    // otherwise repo-relative; unsafe paths are handled by path policy.
    const key = isRepoRelativePath(path)
      ? normalizeRepoPath(path)
      : path;
    if (seen.has(key)) return path;
    seen.add(key);
  }
  return null;
}

/**
 * Exact set equality of changed paths after proving each path is safe and
 * normalizing trailing slashes. Ordering differences alone do not fail.
 * Callers must reject duplicates before invoking this.
 */
export function changedPathSetsEqual(
  a: string[],
  b: string[],
): boolean {
  if (a.length !== b.length) return false;
  const norm = (paths: string[]) =>
    [...paths]
      .map((p) => normalizeRepoPath(p))
      .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  const na = norm(a);
  const nb = norm(b);
  for (let i = 0; i < na.length; i++) {
    if (na[i] !== nb[i]) return false;
  }
  return true;
}

function propagateRunnerStatus(
  runnerResult: AgentRunnerResultV1,
  verificationAttemptId: string,
  observedAt: string,
): IndependentVerifyResultV1 | null {
  if (runnerResult.status === "HOLD") {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_RUNNER",
      reasonMessage: `Runner HOLD: ${runnerResult.reasonMessage}`,
      verificationAttemptId,
      taskId: runnerResult.taskId,
      repository: runnerResult.repository,
      baseRevision: runnerResult.baseRevision,
      observedAt,
    });
  }
  if (runnerResult.status === "REJECT") {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_RUNNER",
      reasonMessage: `Runner REJECT: ${runnerResult.reasonMessage}`,
      verificationAttemptId,
      taskId: runnerResult.taskId,
      repository: runnerResult.repository,
      baseRevision: runnerResult.baseRevision,
      observedAt,
    });
  }
  if (runnerResult.status === "FAILED") {
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_RUNNER",
      reasonMessage: `Runner FAILED: ${runnerResult.reasonMessage}`,
      verificationAttemptId,
      taskId: runnerResult.taskId,
      repository: runnerResult.repository,
      baseRevision: runnerResult.baseRevision,
      observedAt,
    });
  }
  if (runnerResult.status === "UNKNOWN") {
    return buildResult({
      status: "UNKNOWN",
      reasonCode: "UNKNOWN_RUNNER",
      reasonMessage: `Runner UNKNOWN: ${runnerResult.reasonMessage}`,
      verificationAttemptId,
      taskId: runnerResult.taskId,
      repository: runnerResult.repository,
      baseRevision: runnerResult.baseRevision,
      observedAt,
    });
  }
  return null;
}

function checkRunnerMetadataBoundary(
  metadata: Record<string, unknown>,
):
  | { ok: true }
  | { ok: false; reasonCode: IndependentVerifyReasonCode; reasonMessage: string } {
  if (metadata.executionInvoked !== true) {
    return {
      ok: false,
      reasonCode: "REJECT_EXECUTION_NOT_INVOKED",
      reasonMessage:
        "COMPLETED runner requires metadata.executionInvoked === true; fail closed.",
    };
  }
  if (metadata.cleanupCompleted !== true) {
    return {
      ok: false,
      reasonCode: "REJECT_CLEANUP_INCOMPLETE",
      reasonMessage:
        "COMPLETED runner requires metadata.cleanupCompleted === true; fail closed.",
    };
  }
  if (metadata.independentVerificationComplete !== false) {
    return {
      ok: false,
      reasonCode: "REJECT_RUNNER_SELF_VERIFICATION",
      reasonMessage:
        "Runner self-claims independentVerificationComplete; REJECT. Do not normalize.",
    };
  }
  if (metadata.publicationAuthorized !== false) {
    return {
      ok: false,
      reasonCode: "REJECT_PUBLICATION_AUTHORIZED",
      reasonMessage:
        "Runner claims publicationAuthorized; REJECT. Do not normalize.",
    };
  }
  if (metadata.readyAuthorized !== false) {
    return {
      ok: false,
      reasonCode: "REJECT_READY_AUTHORIZED",
      reasonMessage: "Runner claims readyAuthorized; REJECT. Do not normalize.",
    };
  }
  if (metadata.mergeAuthorized !== false) {
    return {
      ok: false,
      reasonCode: "REJECT_MERGE_AUTHORIZED",
      reasonMessage: "Runner claims mergeAuthorized; REJECT. Do not normalize.",
    };
  }
  if (metadata.githubMutationAuthorized !== false) {
    return {
      ok: false,
      reasonCode: "REJECT_GITHUB_MUTATION_AUTHORIZED",
      reasonMessage:
        "Runner claims githubMutationAuthorized; REJECT. Do not normalize.",
    };
  }
  return { ok: true };
}

function checkWorkspaceOutcomeBoundary(
  workspaceOutcome: unknown,
):
  | { ok: true }
  | { ok: false; reasonCode: IndependentVerifyReasonCode; reasonMessage: string } {
  if (workspaceOutcome === null || workspaceOutcome === undefined) {
    return { ok: true };
  }
  if (!isPlainObject(workspaceOutcome)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "workspaceOutcome must be an object or null.",
    };
  }
  if (workspaceOutcome.networkAccess === true) {
    return {
      ok: false,
      reasonCode: "REJECT_WORKSPACE_NETWORK",
      reasonMessage:
        "workspaceOutcome.networkAccess === true is not authorized in INDEPENDENT-VERIFY-V1.",
    };
  }
  if (workspaceOutcome.secretsRequired === true) {
    return {
      ok: false,
      reasonCode: "REJECT_WORKSPACE_SECRETS",
      reasonMessage:
        "workspaceOutcome.secretsRequired === true is not authorized in INDEPENDENT-VERIFY-V1.",
    };
  }
  if (workspaceOutcome.githubMutationPerformed === true) {
    return {
      ok: false,
      reasonCode: "REJECT_WORKSPACE_GITHUB_MUTATION",
      reasonMessage:
        "workspaceOutcome.githubMutationPerformed === true is not authorized in INDEPENDENT-VERIFY-V1.",
    };
  }
  if (workspaceOutcome.productionMutationPerformed === true) {
    return {
      ok: false,
      reasonCode: "REJECT_WORKSPACE_PRODUCTION_MUTATION",
      reasonMessage:
        "workspaceOutcome.productionMutationPerformed === true is not authorized in INDEPENDENT-VERIFY-V1.",
    };
  }
  return { ok: true };
}

/**
 * Independently verify an AgentRunnerResultV1 against an expected AgentTaskV1.
 * Pure/deterministic aside from the injected adapter. Default adapter is fake.
 */
export function verifyAgentRunnerResultV1(
  rawInput: unknown,
  options: VerifyAgentRunnerResultV1Options = {},
): IndependentVerifyResultV1 {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const adapter = options.adapter ?? createFakeIndependentVerifyAdapterV1();

  const attemptIdFromRaw =
    isPlainObject(rawInput) && typeof rawInput.verificationAttemptId === "string"
      ? rawInput.verificationAttemptId
      : "unknown";
  const observedAtFromRaw =
    isPlainObject(rawInput) && typeof rawInput.observedAt === "string"
      ? rawInput.observedAt
      : validatedAt;

  // Early structural parse — unknown roots fail closed.
  if (!isPlainObject(rawInput)) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Verifier input must be a JSON object.",
      verificationAttemptId: attemptIdFromRaw,
      taskId: null,
      repository: null,
      baseRevision: null,
      observedAt: observedAtFromRaw,
    });
  }
  if (!hasOnlyKeys(rawInput, INDEPENDENT_VERIFY_INPUT_ROOT_KEYS)) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Verifier input contains unknown properties.",
      verificationAttemptId: attemptIdFromRaw,
      taskId: null,
      repository: null,
      baseRevision: null,
      observedAt: observedAtFromRaw,
    });
  }
  if (
    typeof rawInput.verificationAttemptId !== "string" ||
    rawInput.verificationAttemptId.length < 1 ||
    rawInput.verificationAttemptId.length > 128
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage:
        "verificationAttemptId must be a non-empty bounded string.",
      verificationAttemptId: attemptIdFromRaw,
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
      verificationAttemptId: rawInput.verificationAttemptId,
      taskId: null,
      repository: null,
      baseRevision: null,
      observedAt: observedAtFromRaw,
    });
  }

  const verificationAttemptId = rawInput.verificationAttemptId;
  const observedAt = rawInput.observedAt;

  if (rawInput.expectedTask === null || rawInput.expectedTask === undefined) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_TASK_NULL",
      reasonMessage: "expectedTask must be non-null; fail closed.",
      verificationAttemptId,
      taskId: null,
      repository: null,
      baseRevision: null,
      observedAt,
    });
  }

  const runnerParsed = parseAgentRunnerResultStructural(rawInput.runnerResult);
  if (!runnerParsed.ok) {
    return buildResult({
      status: "REJECT",
      reasonCode: runnerParsed.reasonCode,
      reasonMessage: runnerParsed.reasonMessage,
      verificationAttemptId,
      taskId: null,
      repository: null,
      baseRevision: null,
      observedAt,
    });
  }

  const runnerResult = runnerParsed.result;

  // Non-COMPLETED runner statuses never enter VERIFIED path.
  if (runnerResult.status !== "COMPLETED") {
    const propagated = propagateRunnerStatus(
      runnerResult,
      verificationAttemptId,
      observedAt,
    );
    if (propagated) return propagated;
    return buildResult({
      status: "UNKNOWN",
      reasonCode: "UNKNOWN_VERIFIER_STATE",
      reasonMessage: "Unrecognized runner status; fail closed.",
      verificationAttemptId,
      taskId: runnerResult.taskId,
      repository: runnerResult.repository,
      baseRevision: runnerResult.baseRevision,
      observedAt,
    });
  }

  // ── COMPLETED path: re-bind and re-check everything ──────────────────────

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
      verificationAttemptId,
      taskId: taskIdGuess,
      repository: runnerResult.repository,
      baseRevision: runnerResult.baseRevision,
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
        verificationAttemptId,
        taskId: expectedTask.taskId,
        repository: expectedTask.repository,
        baseRevision: expectedTask.baseRevision,
        taskValidation: revalidation,
        observedAt,
      });
    }
    // Prefer REJECT for INVALID; UNKNOWN stays UNKNOWN.
    if (revalidation.status === "UNKNOWN") {
      return buildResult({
        status: "UNKNOWN",
        reasonCode: "UNKNOWN_VERIFIER_STATE",
        reasonMessage: `expectedTask revalidation UNKNOWN: ${revalidation.reasonMessage}`,
        verificationAttemptId,
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
      verificationAttemptId,
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
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  // Identity binding — exact equality; no latest-main / rebase / substitution.
  if (runnerResult.taskId !== expectedTask.taskId) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_TASK_ID_MISMATCH",
      reasonMessage: `runnerResult.taskId (${String(runnerResult.taskId)}) !== expectedTask.taskId (${expectedTask.taskId}); fail closed.`,
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  if (runnerResult.repository !== expectedTask.repository) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_REPOSITORY_MISMATCH",
      reasonMessage: `runnerResult.repository (${String(runnerResult.repository)}) !== expectedTask.repository (${expectedTask.repository}); exact equality required.`,
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  if (runnerResult.baseRevision !== expectedTask.baseRevision) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_BASE_REVISION_MISMATCH",
      reasonMessage: `runnerResult.baseRevision (${String(runnerResult.baseRevision)}) !== expectedTask.baseRevision (${expectedTask.baseRevision}); exact equality required; no fetch/rebase/substitution.`,
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  // Runner validation binding (when present).
  if (runnerResult.validation !== null && runnerResult.validation !== undefined) {
    const v = runnerResult.validation as unknown;
    if (!isPlainObject(v)) {
      return buildResult({
        status: "REJECT",
        reasonCode: "REJECT_VALIDATION_SCHEMA",
        reasonMessage: "runnerResult.validation must be an object when present.",
        verificationAttemptId,
        taskId: expectedTask.taskId,
        repository: expectedTask.repository,
        baseRevision: expectedTask.baseRevision,
        taskValidation: revalidation,
        observedAt,
      });
    }
    if (v.schemaVersion !== AGENT_TASK_VALIDATION_RESULT_SCHEMA) {
      return buildResult({
        status: "REJECT",
        reasonCode: "REJECT_VALIDATION_SCHEMA",
        reasonMessage: `runnerResult.validation.schemaVersion must be ${AGENT_TASK_VALIDATION_RESULT_SCHEMA}.`,
        verificationAttemptId,
        taskId: expectedTask.taskId,
        repository: expectedTask.repository,
        baseRevision: expectedTask.baseRevision,
        taskValidation: revalidation,
        observedAt,
      });
    }
    if (v.taskId !== expectedTask.taskId) {
      return buildResult({
        status: "REJECT",
        reasonCode: "REJECT_VALIDATION_TASK_BINDING",
        reasonMessage: `runnerResult.validation.taskId (${String(v.taskId)}) !== expectedTask.taskId (${expectedTask.taskId}); fail closed.`,
        verificationAttemptId,
        taskId: expectedTask.taskId,
        repository: expectedTask.repository,
        baseRevision: expectedTask.baseRevision,
        taskValidation: revalidation,
        observedAt,
      });
    }
    if (v.status !== "VALID") {
      return buildResult({
        status: "REJECT",
        reasonCode: "REJECT_VALIDATION_STATUS",
        reasonMessage: `runnerResult.validation.status must be VALID; got ${String(v.status)}.`,
        verificationAttemptId,
        taskId: expectedTask.taskId,
        repository: expectedTask.repository,
        baseRevision: expectedTask.baseRevision,
        taskValidation: revalidation,
        observedAt,
      });
    }
  }

  // Metadata boundary — do not normalize false and continue.
  const metaCheck = checkRunnerMetadataBoundary(
    runnerResult.metadata as unknown as Record<string, unknown>,
  );
  if (!metaCheck.ok) {
    return buildResult({
      status: "REJECT",
      reasonCode: metaCheck.reasonCode,
      reasonMessage: metaCheck.reasonMessage,
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  // Workspace outcome boundary.
  const wsCheck = checkWorkspaceOutcomeBoundary(runnerResult.workspaceOutcome);
  if (!wsCheck.ok) {
    return buildResult({
      status: "REJECT",
      reasonCode: wsCheck.reasonCode,
      reasonMessage: wsCheck.reasonMessage,
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
    });
  }

  // Duplicate path evidence → fail closed (no silent dedupe into VERIFIED).
  const dup = findDuplicateChangedPaths(runnerResult.changedPaths);
  if (dup !== null) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_CHANGED_PATH_DUPLICATE",
      reasonMessage: `Duplicate changed path evidence fails closed: ${dup}`,
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      verifiedChangedPaths: [...runnerResult.changedPaths],
      taskValidation: revalidation,
      observedAt,
    });
  }

  // Independent changed-path re-evaluation (do not trust runner prior eval).
  const pathPolicy = evaluateChangedPathsPolicy(
    expectedTask,
    runnerResult.changedPaths,
  );
  if (!pathPolicy.ok) {
    return buildResult({
      status: pathPolicy.status,
      reasonCode: pathPolicy.reasonCode,
      reasonMessage: pathPolicy.reasonMessage,
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      verifiedChangedPaths: [...runnerResult.changedPaths],
      taskValidation: revalidation,
      observedAt,
    });
  }

  // Also fail closed on symlink / normalization ambiguity signals via boundary.
  for (const path of runnerResult.changedPaths) {
    const boundary = evaluatePathBoundary(expectedTask, path);
    if (boundary === "UNKNOWN") {
      return buildResult({
        status: "REJECT",
        reasonCode: "REJECT_CHANGED_PATH_UNSAFE",
        reasonMessage: `Changed path boundary UNKNOWN (fail closed): ${path}`,
        verificationAttemptId,
        taskId: expectedTask.taskId,
        repository: expectedTask.repository,
        baseRevision: expectedTask.baseRevision,
        verifiedChangedPaths: [...runnerResult.changedPaths],
        taskValidation: revalidation,
        observedAt,
      });
    }
  }

  // Adapter path — independent evidence only.
  const ctx = {
    verificationAttemptId,
    expectedTask,
    runnerResult,
    observedAt,
  };

  let cleanupCompleted = false;
  const finishCleanup = (): boolean => {
    const cleanup = adapter.cleanup(ctx);
    cleanupCompleted = cleanup.ok && cleanup.cleaned;
    return cleanup.ok;
  };

  const observed = adapter.observeWorkspace(ctx);
  if (!observed.ok) {
    finishCleanup();
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_ADAPTER_OBSERVE",
      reasonMessage:
        observed.reasonMessage ?? "Adapter observeWorkspace failed.",
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
    });
  }

  const verifiedRun = adapter.runVerification(ctx);
  if (!verifiedRun.ok) {
    finishCleanup();
    return buildResult({
      status: "FAILED",
      reasonCode: verifiedRun.timedOut
        ? "FAILED_ADAPTER_TIMEOUT"
        : "FAILED_ADAPTER_VERIFY",
      reasonMessage:
        verifiedRun.reasonMessage ??
        (verifiedRun.timedOut
          ? "Adapter runVerification timed out."
          : "Adapter runVerification failed."),
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
    });
  }

  const collected = adapter.collectEvidence(ctx);
  if (!collected.ok) {
    finishCleanup();
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_ADAPTER_COLLECT",
      reasonMessage:
        collected.reasonMessage ?? "Adapter collectEvidence failed.",
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      verificationEvidence: collected.evidence,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
    });
  }

  const evidence = collected.evidence;

  // Independent evidence path set must exactly equal runner changedPaths.
  const evidenceDup = findDuplicateChangedPaths(evidence.observedChangedPaths);
  if (evidenceDup !== null) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_CHANGED_PATH_DUPLICATE",
      reasonMessage: `Duplicate independent evidence path fails closed: ${evidenceDup}`,
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      verifiedChangedPaths: [...runnerResult.changedPaths],
      verificationEvidence: evidence,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
    });
  }

  // Every independently observed path must also pass policy.
  const evidencePathPolicy = evaluateChangedPathsPolicy(
    expectedTask,
    evidence.observedChangedPaths,
  );
  if (!evidencePathPolicy.ok) {
    finishCleanup();
    return buildResult({
      status: evidencePathPolicy.status,
      reasonCode: evidencePathPolicy.reasonCode,
      reasonMessage: evidencePathPolicy.reasonMessage,
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      verifiedChangedPaths: [...runnerResult.changedPaths],
      verificationEvidence: evidence,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
    });
  }

  if (
    !changedPathSetsEqual(
      runnerResult.changedPaths,
      evidence.observedChangedPaths,
    )
  ) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_EVIDENCE_CHANGED_PATH_MISMATCH",
      reasonMessage:
        "Independent observedChangedPaths set !== runnerResult.changedPaths set; fail closed. Do not accept the smaller set.",
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      verifiedChangedPaths: [...runnerResult.changedPaths],
      verificationEvidence: evidence,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
    });
  }

  if (evidence.evidencePassed !== true) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_EVIDENCE_FAILED",
      reasonMessage:
        "Independent evidence evidencePassed !== true; fail closed.",
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      verifiedChangedPaths: [...runnerResult.changedPaths],
      verificationEvidence: evidence,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
    });
  }

  // Core V1 evidence invariants — never allow true mutation/network flags.
  if (
    evidence.commandExecutionImplemented !== false ||
    evidence.networkAccess !== false ||
    evidence.secretsRequired !== false ||
    evidence.githubMutationPerformed !== false ||
    evidence.productionMutationPerformed !== false
  ) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_EVIDENCE_FAILED",
      reasonMessage:
        "Independent evidence claims command/network/secret/mutation capability; fail closed.",
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      verifiedChangedPaths: [...runnerResult.changedPaths],
      verificationEvidence: evidence,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted,
    });
  }

  const cleanupOk = finishCleanup();
  if (!cleanupOk) {
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_CLEANUP",
      reasonMessage: "Adapter cleanup failed after evidence collection.",
      verificationAttemptId,
      taskId: expectedTask.taskId,
      repository: expectedTask.repository,
      baseRevision: expectedTask.baseRevision,
      verifiedChangedPaths: [...runnerResult.changedPaths],
      verificationEvidence: evidence,
      taskValidation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      cleanupCompleted: false,
    });
  }

  return buildResult({
    status: "VERIFIED",
    reasonCode: "VERIFIED",
    reasonMessage:
      "Independent verification PASS via fake/local evidence only. VERIFIED ≠ real CI/shell verification, publication, Ready, Merge, GitHub mutation, or deploy authorization.",
    verificationAttemptId,
    taskId: expectedTask.taskId,
    repository: expectedTask.repository,
    baseRevision: expectedTask.baseRevision,
    verifiedChangedPaths: [...runnerResult.changedPaths],
    verificationEvidence: evidence,
    taskValidation: revalidation,
    observedAt,
    adapterKind: adapter.kind,
    cleanupCompleted: true,
  });
}

export function assertIndependentVerifyBoundaries(): void {
  if (INDEPENDENT_VERIFY_COMMAND_EXECUTION_IMPLEMENTED) {
    throw new Error(
      "INDEPENDENT-VERIFY-V1 command execution must remain NOT IMPLEMENTED",
    );
  }
  if (INDEPENDENT_VERIFY_REAL_COMMAND_VERIFICATION_IMPLEMENTED) {
    throw new Error(
      "INDEPENDENT-VERIFY-V1 real command verification must remain NOT IMPLEMENTED",
    );
  }
  if (INDEPENDENT_VERIFY_GITHUB_PUBLICATION_IMPLEMENTED) {
    throw new Error(
      "INDEPENDENT-VERIFY-V1 GitHub publication must remain NOT IMPLEMENTED",
    );
  }
  if (INDEPENDENT_VERIFY_PROVIDER_INTEGRATION_STATUS !== "HOLD") {
    throw new Error(
      "INDEPENDENT-VERIFY-V1 provider integration must remain HOLD",
    );
  }
}
