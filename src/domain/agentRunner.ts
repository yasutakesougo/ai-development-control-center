/**
 * AGENT-RUNNER-V1
 *
 * ISOLATED WORKSPACE RUNNER CONTRACT · FAKE/LOCAL ADAPTER ONLY
 * NO GITHUB PUBLICATION · NO READY/MERGE · NO PROVIDER REMOTE EXECUTION
 *
 * Consumes MinOrchestratorResultV1 and may invoke an AgentRunnerAdapterV1 only
 * after independent task revalidation and runner policy checks.
 *
 * COMPLETED ≠ independent verification
 * COMPLETED ≠ publication / Ready / Merge / GitHub mutation authorization
 */

import {
  evaluatePathBoundary,
  isRepoRelativePath,
  parseAgentTaskV1,
  validateAgentTaskV1,
  type AgentTaskRiskClass,
  type AgentTaskStopAt,
  type AgentTaskV1,
  type AgentTaskValidationResultV1,
} from "./agentTaskContract";
import {
  AGENT_RUNNER_ADAPTER_FAKE,
  AGENT_RUNNER_COMMAND_EXECUTION_IMPLEMENTED,
  AGENT_RUNNER_GITHUB_PUBLICATION_IMPLEMENTED,
  AGENT_RUNNER_PROVIDER_INTEGRATION_STATUS,
  AGENT_RUNNER_REAL_WORKSPACE_EXECUTION_IMPLEMENTED,
  createFakeAgentRunnerAdapterV1,
  type AgentRunnerAdapterV1,
  type AgentRunnerVerificationObservationV1,
  type AgentRunnerWorkspaceBindingV1,
  type AgentRunnerWorkspaceOutcomeV1,
} from "./agentRunnerAdapter";
import {
  MIN_ORCHESTRATOR_RESULT_SCHEMA,
  MIN_ORCHESTRATOR_VERSION,
  type MinOrchestratorDecision,
  type MinOrchestratorResultV1,
} from "./minOrchestrator";

export const AGENT_RUNNER_VERSION = "AGENT-RUNNER-V1" as const;
export const AGENT_RUNNER_RESULT_SCHEMA = "AGENT-RUNNER-RESULT-V1" as const;

/** Real remote provider / shell / GitHub publication remain unimplemented. */
export const AGENT_RUNNER_EXECUTION_SURFACE =
  "FAKE_IN_MEMORY_ONLY" as const;

export {
  AGENT_RUNNER_ADAPTER_FAKE,
  AGENT_RUNNER_COMMAND_EXECUTION_IMPLEMENTED,
  AGENT_RUNNER_GITHUB_PUBLICATION_IMPLEMENTED,
  AGENT_RUNNER_PROVIDER_INTEGRATION_STATUS,
  AGENT_RUNNER_REAL_WORKSPACE_EXECUTION_IMPLEMENTED,
  createFakeAgentRunnerAdapterV1,
};

export const AGENT_RUNNER_INPUT_ROOT_KEYS = [
  "orchestratorResult",
  "runnerAttemptId",
  "observedAt",
  "workspace",
] as const;

export const AGENT_RUNNER_WORKSPACE_KEYS = [
  "repository",
  "baseRevision",
] as const;

export const AGENT_RUNNER_RESULT_ROOT_KEYS = [
  "schemaVersion",
  "runnerVersion",
  "status",
  "reasonCode",
  "reasonMessage",
  "runnerAttemptId",
  "taskId",
  "repository",
  "baseRevision",
  "changedPaths",
  "workspaceOutcome",
  "verificationObservation",
  "validation",
  "metadata",
] as const;

/**
 * Capabilities this runner stage may accept without HOLD.
 * Empty allowlist remains valid (default-deny).
 * workspace.write.v1 / command.execute.v1 = HOLD (not added; material authority
 * expansion deferred; fake adapter does not require them).
 */
export const AGENT_RUNNER_SUPPORTED_CAPABILITIES = [
  "workspace.read.v1",
] as const;

/**
 * Risk classes that may reach adapter invocation in V1.
 * R0 = read-only isolated observation (supported).
 * R1 = isolated workspace code/test activity (supported via fake adapter).
 * R2–R5 = HOLD (no automatic escalation).
 */
export const AGENT_RUNNER_SUPPORTED_RISK_CLASSES = [
  "R0",
  "R1",
] as const satisfies readonly AgentTaskRiskClass[];

/**
 * stopAt values that may reach adapter invocation in V1.
 * TASK_BUILT = contract-only / no runner activity → HOLD.
 * AGENT_COMPLETE / VERIFY_COMPLETE / DRAFT_PR = runner stage allowed.
 * Runner responsibility ends at isolated Agent activity; COMPLETED never
 * means independent verification or Draft PR publication was achieved.
 */
export const AGENT_RUNNER_SUPPORTED_STOP_AT = [
  "AGENT_COMPLETE",
  "VERIFY_COMPLETE",
  "DRAFT_PR",
] as const satisfies readonly AgentTaskStopAt[];

export type AgentRunnerStatus =
  | "COMPLETED"
  | "HOLD"
  | "REJECT"
  | "FAILED"
  | "UNKNOWN";

export type AgentRunnerReasonCode =
  | "COMPLETED"
  | "HOLD_ORCHESTRATOR"
  | "HOLD_STOP_AT_TASK_BUILT"
  | "HOLD_UNSUPPORTED_STOP_AT"
  | "HOLD_UNSUPPORTED_RISK_CLASS"
  | "HOLD_UNSUPPORTED_CAPABILITY"
  | "HOLD_REPOSITORY_MISMATCH"
  | "HOLD_BASE_REVISION_MISMATCH"
  | "HOLD_COMMAND_EXECUTION"
  | "REJECT_INPUT"
  | "REJECT_ORCHESTRATOR"
  | "REJECT_DISPATCH_NULL_TASK"
  | "REJECT_DISPATCH_METADATA_INCONSISTENT"
  | "REJECT_TASK_MALFORMED"
  | "REJECT_TASK_SEMANTICS"
  | "REJECT_TASK_ID_BINDING"
  | "REJECT_REVALIDATION_MISMATCH"
  | "REJECT_CHANGED_PATH_UNSAFE"
  | "REJECT_SYMLINK_WRITE"
  | "FAILED_ADAPTER"
  | "FAILED_TIMEOUT"
  | "FAILED_CHANGED_PATH_OUT_OF_SCOPE"
  | "FAILED_FORBIDDEN_PATH"
  | "FAILED_CLEANUP"
  | "UNKNOWN_ORCHESTRATOR"
  | "UNKNOWN_RUNNER_STATE";

export interface AgentRunnerInputV1 {
  orchestratorResult: MinOrchestratorResultV1;
  runnerAttemptId: string;
  observedAt: string;
  workspace: AgentRunnerWorkspaceBindingV1;
}

export interface AgentRunnerMetadataV1 {
  observedAt: string;
  runnerAttemptId: string;
  adapterKind: string | null;
  executionInvoked: boolean;
  cleanupCompleted: boolean;
  independentVerificationComplete: false;
  publicationAuthorized: false;
  readyAuthorized: false;
  mergeAuthorized: false;
  githubMutationAuthorized: false;
  commandExecutionImplemented: false;
  providerIntegration: typeof AGENT_RUNNER_PROVIDER_INTEGRATION_STATUS;
  realWorkspaceExecutionImplemented: false;
}

export interface AgentRunnerResultV1 {
  schemaVersion: typeof AGENT_RUNNER_RESULT_SCHEMA;
  runnerVersion: typeof AGENT_RUNNER_VERSION;
  status: AgentRunnerStatus;
  reasonCode: AgentRunnerReasonCode;
  reasonMessage: string;
  runnerAttemptId: string;
  taskId: string | null;
  repository: string | null;
  baseRevision: string | null;
  changedPaths: string[];
  workspaceOutcome: AgentRunnerWorkspaceOutcomeV1 | null;
  verificationObservation: AgentRunnerVerificationObservationV1 | null;
  validation: AgentTaskValidationResultV1 | null;
  metadata: AgentRunnerMetadataV1;
}

export interface RunAgentTaskV1Options {
  adapter?: AgentRunnerAdapterV1;
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
  runnerAttemptId: string;
  adapterKind?: string | null;
  executionInvoked?: boolean;
  cleanupCompleted?: boolean;
}): AgentRunnerMetadataV1 {
  return {
    observedAt: input.observedAt,
    runnerAttemptId: input.runnerAttemptId,
    adapterKind: input.adapterKind ?? null,
    executionInvoked: input.executionInvoked === true,
    cleanupCompleted: input.cleanupCompleted === true,
    independentVerificationComplete: false,
    publicationAuthorized: false,
    readyAuthorized: false,
    mergeAuthorized: false,
    githubMutationAuthorized: false,
    commandExecutionImplemented: false,
    providerIntegration: AGENT_RUNNER_PROVIDER_INTEGRATION_STATUS,
    realWorkspaceExecutionImplemented: false,
  };
}

function buildResult(input: {
  status: AgentRunnerStatus;
  reasonCode: AgentRunnerReasonCode;
  reasonMessage: string;
  runnerAttemptId: string;
  taskId: string | null;
  repository: string | null;
  baseRevision: string | null;
  changedPaths?: string[];
  workspaceOutcome?: AgentRunnerWorkspaceOutcomeV1 | null;
  verificationObservation?: AgentRunnerVerificationObservationV1 | null;
  validation?: AgentTaskValidationResultV1 | null;
  observedAt: string;
  adapterKind?: string | null;
  executionInvoked?: boolean;
  cleanupCompleted?: boolean;
}): AgentRunnerResultV1 {
  return {
    schemaVersion: AGENT_RUNNER_RESULT_SCHEMA,
    runnerVersion: AGENT_RUNNER_VERSION,
    status: input.status,
    reasonCode: input.reasonCode,
    reasonMessage: input.reasonMessage,
    runnerAttemptId: input.runnerAttemptId,
    taskId: input.taskId,
    repository: input.repository,
    baseRevision: input.baseRevision,
    changedPaths: input.changedPaths ?? [],
    workspaceOutcome: input.workspaceOutcome ?? null,
    verificationObservation: input.verificationObservation ?? null,
    validation: input.validation ?? null,
    metadata: metadataBase({
      observedAt: input.observedAt,
      runnerAttemptId: input.runnerAttemptId,
      adapterKind: input.adapterKind,
      executionInvoked: input.executionInvoked,
      cleanupCompleted: input.cleanupCompleted,
    }),
  };
}

function looksLikeOrchestratorResult(
  value: unknown,
): value is MinOrchestratorResultV1 {
  if (!isPlainObject(value)) return false;
  if (value.schemaVersion !== MIN_ORCHESTRATOR_RESULT_SCHEMA) return false;
  if (value.orchestratorVersion !== MIN_ORCHESTRATOR_VERSION) return false;
  const decision = value.decision;
  if (
    decision !== "DISPATCH_ELIGIBLE" &&
    decision !== "HOLD" &&
    decision !== "REJECT" &&
    decision !== "UNKNOWN"
  ) {
    return false;
  }
  if (typeof value.reasonCode !== "string" || value.reasonCode.length < 1) {
    return false;
  }
  if (
    typeof value.reasonMessage !== "string" ||
    value.reasonMessage.length < 1
  ) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(value, "task")) return false;
  if (value.task !== null && !isPlainObject(value.task)) return false;
  if (!isPlainObject(value.metadata)) return false;
  if (typeof value.metadata.dispatchEligible !== "boolean") return false;
  if (value.metadata.executionAuthorized !== false) return false;
  return true;
}

/**
 * Fail-closed parse of runner input. Unknown root properties → REJECT.
 */
export function parseAgentRunnerInput(
  value: unknown,
):
  | { ok: true; input: AgentRunnerInputV1 }
  | {
      ok: false;
      reasonCode: "REJECT_INPUT";
      reasonMessage: string;
    } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Runner input must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, AGENT_RUNNER_INPUT_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Runner input contains unknown properties.",
    };
  }
  if (
    typeof value.runnerAttemptId !== "string" ||
    value.runnerAttemptId.length < 1 ||
    value.runnerAttemptId.length > 128
  ) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "runnerAttemptId must be a non-empty bounded string.",
    };
  }
  if (typeof value.observedAt !== "string" || value.observedAt.length < 1) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "observedAt must be a non-empty string.",
    };
  }
  if (!isPlainObject(value.workspace)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "workspace must be an object.",
    };
  }
  if (!hasOnlyKeys(value.workspace, AGENT_RUNNER_WORKSPACE_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "workspace contains unknown properties.",
    };
  }
  if (!isRepository(value.workspace.repository)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "workspace.repository is missing or malformed.",
    };
  }
  if (!isBaseRevision(value.workspace.baseRevision)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage:
        "workspace.baseRevision must be a 40-character lowercase Git SHA.",
    };
  }
  if (!looksLikeOrchestratorResult(value.orchestratorResult)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "orchestratorResult is missing or malformed.",
    };
  }

  return {
    ok: true,
    input: {
      orchestratorResult: value.orchestratorResult,
      runnerAttemptId: value.runnerAttemptId,
      observedAt: value.observedAt,
      workspace: {
        repository: value.workspace.repository,
        baseRevision: value.workspace.baseRevision,
      },
    },
  };
}

function unsupportedCapabilities(task: AgentTaskV1): string[] {
  const supported = new Set<string>(AGENT_RUNNER_SUPPORTED_CAPABILITIES);
  return task.allowedCapabilities.filter((cap) => !supported.has(cap));
}

function isSupportedRiskClass(riskClass: AgentTaskRiskClass): boolean {
  return (AGENT_RUNNER_SUPPORTED_RISK_CLASSES as readonly string[]).includes(
    riskClass,
  );
}

function isSupportedStopAt(stopAt: AgentTaskStopAt): boolean {
  return (AGENT_RUNNER_SUPPORTED_STOP_AT as readonly string[]).includes(stopAt);
}

/**
 * Enforce changed-path policy after adapter collect.
 * forbiddenPaths always wins. Unsafe / ambiguous paths fail closed.
 */
export function evaluateChangedPathsPolicy(
  task: AgentTaskV1,
  changedPaths: string[],
):
  | { ok: true }
  | {
      ok: false;
      status: "REJECT" | "FAILED";
      reasonCode:
        | "REJECT_CHANGED_PATH_UNSAFE"
        | "FAILED_CHANGED_PATH_OUT_OF_SCOPE"
        | "FAILED_FORBIDDEN_PATH";
      reasonMessage: string;
      offendingPath: string;
    } {
  for (const path of changedPaths) {
    if (typeof path !== "string" || path.length < 1) {
      return {
        ok: false,
        status: "REJECT",
        reasonCode: "REJECT_CHANGED_PATH_UNSAFE",
        reasonMessage: "Changed path is empty or malformed.",
        offendingPath: String(path),
      };
    }
    // Absolute, backslash, traversal, empty/dot segments — fail closed.
    if (
      path.startsWith("/") ||
      path.includes("\\") ||
      path.includes("\0") ||
      !isRepoRelativePath(path)
    ) {
      return {
        ok: false,
        status: "REJECT",
        reasonCode: "REJECT_CHANGED_PATH_UNSAFE",
        reasonMessage: `Changed path fails closed as unsafe or non-repo-relative: ${path}`,
        offendingPath: path,
      };
    }

    const boundary = evaluatePathBoundary(task, path);
    if (boundary === "FORBIDDEN") {
      return {
        ok: false,
        status: "FAILED",
        reasonCode: "FAILED_FORBIDDEN_PATH",
        reasonMessage: `Changed path is forbidden (forbiddenPaths wins): ${path}`,
        offendingPath: path,
      };
    }
    if (boundary !== "ALLOWED") {
      return {
        ok: false,
        status: "FAILED",
        reasonCode: "FAILED_CHANGED_PATH_OUT_OF_SCOPE",
        reasonMessage: `Changed path is outside allowedPaths: ${path}`,
        offendingPath: path,
      };
    }
  }
  return { ok: true };
}

function propagateOrchestratorDecision(
  orchestratorResult: MinOrchestratorResultV1,
  runnerAttemptId: string,
  observedAt: string,
  workspace: AgentRunnerWorkspaceBindingV1,
): AgentRunnerResultV1 | null {
  const decision = orchestratorResult.decision as MinOrchestratorDecision;
  const taskId = orchestratorResult.task?.taskId ?? null;
  const repository =
    orchestratorResult.task?.repository ?? workspace.repository;
  const baseRevision =
    orchestratorResult.task?.baseRevision ?? workspace.baseRevision;

  if (decision === "HOLD") {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_ORCHESTRATOR",
      reasonMessage: `Orchestrator HOLD: ${orchestratorResult.reasonMessage}`,
      runnerAttemptId,
      taskId,
      repository,
      baseRevision,
      validation: orchestratorResult.validation,
      observedAt,
    });
  }
  if (decision === "REJECT") {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_ORCHESTRATOR",
      reasonMessage: `Orchestrator REJECT: ${orchestratorResult.reasonMessage}`,
      runnerAttemptId,
      taskId,
      repository,
      baseRevision,
      validation: orchestratorResult.validation,
      observedAt,
    });
  }
  if (decision === "UNKNOWN") {
    return buildResult({
      status: "UNKNOWN",
      reasonCode: "UNKNOWN_ORCHESTRATOR",
      reasonMessage: `Orchestrator UNKNOWN: ${orchestratorResult.reasonMessage}`,
      runnerAttemptId,
      taskId,
      repository,
      baseRevision,
      validation: orchestratorResult.validation,
      observedAt,
    });
  }
  return null;
}

/**
 * Run AGENT-RUNNER-V1 against an orchestrator result.
 * Pure/deterministic aside from the injected adapter. Default adapter is fake.
 */
export function runAgentTaskV1(
  rawInput: unknown,
  options: RunAgentTaskV1Options = {},
): AgentRunnerResultV1 {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const adapter = options.adapter ?? createFakeAgentRunnerAdapterV1();

  const parsed = parseAgentRunnerInput(rawInput);
  if (!parsed.ok) {
    const attemptId =
      isPlainObject(rawInput) && typeof rawInput.runnerAttemptId === "string"
        ? rawInput.runnerAttemptId
        : "unknown";
    const observedAt =
      isPlainObject(rawInput) && typeof rawInput.observedAt === "string"
        ? rawInput.observedAt
        : validatedAt;
    return buildResult({
      status: "REJECT",
      reasonCode: parsed.reasonCode,
      reasonMessage: parsed.reasonMessage,
      runnerAttemptId: attemptId,
      taskId: null,
      repository: null,
      baseRevision: null,
      observedAt,
    });
  }

  const { orchestratorResult, runnerAttemptId, observedAt, workspace } =
    parsed.input;

  // Upstream non-dispatch decisions propagate first (no repair).
  if (orchestratorResult.decision !== "DISPATCH_ELIGIBLE") {
    const propagated = propagateOrchestratorDecision(
      orchestratorResult,
      runnerAttemptId,
      observedAt,
      workspace,
    );
    if (propagated) return propagated;
    return buildResult({
      status: "UNKNOWN",
      reasonCode: "UNKNOWN_RUNNER_STATE",
      reasonMessage: "Unrecognized orchestrator decision; fail closed.",
      runnerAttemptId,
      taskId: null,
      repository: workspace.repository,
      baseRevision: workspace.baseRevision,
      observedAt,
    });
  }

  // DISPATCH_ELIGIBLE path — never trust decision alone.
  const meta = orchestratorResult.metadata;
  if (
    meta.dispatchEligible !== true ||
    meta.executionAuthorized !== false ||
    meta.actionGatewayAuthorized !== false ||
    meta.readyAuthorized !== false ||
    meta.mergeAuthorized !== false ||
    meta.githubMutationAuthorized !== false
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_DISPATCH_METADATA_INCONSISTENT",
      reasonMessage:
        "DISPATCH_ELIGIBLE metadata is inconsistent with runner preconditions; fail closed.",
      runnerAttemptId,
      taskId: orchestratorResult.task?.taskId ?? null,
      repository: orchestratorResult.task?.repository ?? workspace.repository,
      baseRevision:
        orchestratorResult.task?.baseRevision ?? workspace.baseRevision,
      validation: orchestratorResult.validation,
      observedAt,
    });
  }

  if (orchestratorResult.task === null) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_DISPATCH_NULL_TASK",
      reasonMessage:
        "DISPATCH_ELIGIBLE claimed but task is null; fail closed.",
      runnerAttemptId,
      taskId: null,
      repository: workspace.repository,
      baseRevision: workspace.baseRevision,
      validation: orchestratorResult.validation,
      observedAt,
    });
  }

  const upstreamTask = orchestratorResult.task;

  // Independent structural + semantic revalidation.
  const structural = parseAgentTaskV1(upstreamTask);
  if (!structural.ok) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_TASK_MALFORMED",
      reasonMessage: `Task failed structural reparse: ${structural.reasonMessage}`,
      runnerAttemptId,
      taskId: typeof upstreamTask.taskId === "string" ? upstreamTask.taskId : null,
      repository: workspace.repository,
      baseRevision: workspace.baseRevision,
      observedAt,
    });
  }

  const revalidation = validateAgentTaskV1(structural.task, {
    validatedAt,
    treatPrefixOverlapAsHold: options.treatPrefixOverlapAsHold,
  });

  if (revalidation.status !== "VALID") {
    if (revalidation.status === "HOLD") {
      return buildResult({
        status: "HOLD",
        reasonCode: "HOLD_ORCHESTRATOR",
        reasonMessage: `Task revalidation HOLD: ${revalidation.reasonMessage}`,
        runnerAttemptId,
        taskId: upstreamTask.taskId,
        repository: upstreamTask.repository,
        baseRevision: upstreamTask.baseRevision,
        validation: revalidation,
        observedAt,
      });
    }
    if (revalidation.status === "UNKNOWN") {
      return buildResult({
        status: "UNKNOWN",
        reasonCode: "UNKNOWN_RUNNER_STATE",
        reasonMessage: `Task revalidation UNKNOWN: ${revalidation.reasonMessage}`,
        runnerAttemptId,
        taskId: upstreamTask.taskId,
        repository: upstreamTask.repository,
        baseRevision: upstreamTask.baseRevision,
        validation: revalidation,
        observedAt,
      });
    }
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_TASK_SEMANTICS",
      reasonMessage: revalidation.reasonMessage,
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      validation: revalidation,
      observedAt,
    });
  }

  if (revalidation.taskId !== upstreamTask.taskId) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_TASK_ID_BINDING",
      reasonMessage: `validation.taskId (${String(revalidation.taskId)}) is not bound to task.taskId (${upstreamTask.taskId}); fail closed.`,
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      validation: revalidation,
      observedAt,
    });
  }

  if (
    orchestratorResult.validation !== null &&
    orchestratorResult.validation.taskId !== upstreamTask.taskId
  ) {
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_REVALIDATION_MISMATCH",
      reasonMessage: `Orchestrator validation.taskId (${String(orchestratorResult.validation.taskId)}) is not bound to task.taskId (${upstreamTask.taskId}); fail closed.`,
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      validation: revalidation,
      observedAt,
    });
  }

  // Exact workspace identity binding — no fetch/rebase/substitution.
  if (workspace.repository !== upstreamTask.repository) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_REPOSITORY_MISMATCH",
      reasonMessage: `workspace.repository (${workspace.repository}) !== task.repository (${upstreamTask.repository}); exact equality required.`,
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      validation: revalidation,
      observedAt,
    });
  }

  if (workspace.baseRevision !== upstreamTask.baseRevision) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_BASE_REVISION_MISMATCH",
      reasonMessage: `workspace.baseRevision (${workspace.baseRevision}) !== task.baseRevision (${upstreamTask.baseRevision}); exact equality required; no fetch/rebase/substitution.`,
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      validation: revalidation,
      observedAt,
    });
  }

  // Independent stopAt policy — never trust DISPATCH_ELIGIBLE alone.
  if (upstreamTask.stopAt === "TASK_BUILT") {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_STOP_AT_TASK_BUILT",
      reasonMessage:
        "stopAt=TASK_BUILT means no runner activity; adapter must not be invoked.",
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      validation: revalidation,
      observedAt,
    });
  }

  if (!isSupportedStopAt(upstreamTask.stopAt)) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_UNSUPPORTED_STOP_AT",
      reasonMessage: `stopAt=${upstreamTask.stopAt} is unsupported for AGENT-RUNNER-V1; fail closed.`,
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      validation: revalidation,
      observedAt,
    });
  }

  if (!isSupportedRiskClass(upstreamTask.riskClass)) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_UNSUPPORTED_RISK_CLASS",
      reasonMessage: `riskClass=${upstreamTask.riskClass} is not executable in AGENT-RUNNER-V1 (only R0/R1). No automatic escalation.`,
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      validation: revalidation,
      observedAt,
    });
  }

  const unknownCaps = unsupportedCapabilities(upstreamTask);
  if (unknownCaps.length > 0) {
    return buildResult({
      status: "HOLD",
      reasonCode: "HOLD_UNSUPPORTED_CAPABILITY",
      reasonMessage: `Unsupported capability for AGENT-RUNNER-V1: ${unknownCaps.join(", ")}. workspace.write.v1 / command.execute.v1 remain HOLD; no material authority expansion in this slice.`,
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      validation: revalidation,
      observedAt,
    });
  }

  // Adapter invocation path — domain has authorized isolated activity only.
  const ctx = {
    runnerAttemptId,
    task: upstreamTask,
    workspace,
    observedAt,
  };

  let cleanupCompleted = false;
  const finishCleanup = (): boolean => {
    const cleanup = adapter.cleanupWorkspace(ctx);
    cleanupCompleted = cleanup.ok && cleanup.cleaned;
    return cleanup.ok;
  };

  const prepared = adapter.prepareWorkspace(ctx);
  if (!prepared.ok) {
    finishCleanup();
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_ADAPTER",
      reasonMessage:
        prepared.reasonMessage ?? "Adapter prepareWorkspace failed.",
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      validation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      executionInvoked: false,
      cleanupCompleted,
    });
  }

  const executed = adapter.executeTask(ctx);
  if (!executed.ok) {
    finishCleanup();
    return buildResult({
      status: "FAILED",
      reasonCode: executed.timedOut ? "FAILED_TIMEOUT" : "FAILED_ADAPTER",
      reasonMessage:
        executed.reasonMessage ??
        (executed.timedOut
          ? "Adapter executeTask timed out."
          : "Adapter executeTask failed."),
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      validation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      executionInvoked: true,
      cleanupCompleted,
    });
  }

  const collected = adapter.collectOutcome(ctx);
  if (!collected.ok) {
    finishCleanup();
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_ADAPTER",
      reasonMessage:
        collected.reasonMessage ?? "Adapter collectOutcome failed.",
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      changedPaths: collected.changedPaths,
      workspaceOutcome: collected.workspaceOutcome,
      verificationObservation: collected.verificationObservation,
      validation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      executionInvoked: true,
      cleanupCompleted,
    });
  }

  if (collected.symlinkWriteAttempted) {
    finishCleanup();
    return buildResult({
      status: "REJECT",
      reasonCode: "REJECT_SYMLINK_WRITE",
      reasonMessage:
        "Symlink-based writes are rejected entirely in AGENT-RUNNER-V1; safe containment cannot be proven.",
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      changedPaths: collected.changedPaths,
      workspaceOutcome: collected.workspaceOutcome,
      verificationObservation: collected.verificationObservation,
      validation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      executionInvoked: true,
      cleanupCompleted,
    });
  }

  const pathPolicy = evaluateChangedPathsPolicy(
    upstreamTask,
    collected.changedPaths,
  );
  if (!pathPolicy.ok) {
    finishCleanup();
    return buildResult({
      status: pathPolicy.status,
      reasonCode: pathPolicy.reasonCode,
      reasonMessage: pathPolicy.reasonMessage,
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      changedPaths: collected.changedPaths,
      workspaceOutcome: collected.workspaceOutcome,
      verificationObservation: collected.verificationObservation,
      validation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      executionInvoked: true,
      cleanupCompleted,
    });
  }

  const cleanupOk = finishCleanup();
  if (!cleanupOk) {
    return buildResult({
      status: "FAILED",
      reasonCode: "FAILED_CLEANUP",
      reasonMessage: "Adapter cleanupWorkspace failed after execution.",
      runnerAttemptId,
      taskId: upstreamTask.taskId,
      repository: upstreamTask.repository,
      baseRevision: upstreamTask.baseRevision,
      changedPaths: collected.changedPaths,
      workspaceOutcome: collected.workspaceOutcome,
      verificationObservation: collected.verificationObservation,
      validation: revalidation,
      observedAt,
      adapterKind: adapter.kind,
      executionInvoked: true,
      cleanupCompleted: false,
    });
  }

  return buildResult({
    status: "COMPLETED",
    reasonCode: "COMPLETED",
    reasonMessage:
      "Isolated runner activity completed via fake/in-memory adapter. COMPLETED ≠ independent verification, publication, Ready, Merge, or GitHub mutation authorization.",
    runnerAttemptId,
    taskId: upstreamTask.taskId,
    repository: upstreamTask.repository,
    baseRevision: upstreamTask.baseRevision,
    changedPaths: collected.changedPaths,
    workspaceOutcome: collected.workspaceOutcome,
    verificationObservation: collected.verificationObservation,
    validation: revalidation,
    observedAt,
    adapterKind: adapter.kind,
    executionInvoked: true,
    cleanupCompleted: true,
  });
}

export function assertAgentRunnerBoundaries(): void {
  if (AGENT_RUNNER_COMMAND_EXECUTION_IMPLEMENTED) {
    throw new Error(
      "AGENT-RUNNER-V1 command execution must remain NOT IMPLEMENTED",
    );
  }
  if (AGENT_RUNNER_GITHUB_PUBLICATION_IMPLEMENTED) {
    throw new Error(
      "AGENT-RUNNER-V1 GitHub publication must remain NOT IMPLEMENTED",
    );
  }
  if (AGENT_RUNNER_REAL_WORKSPACE_EXECUTION_IMPLEMENTED) {
    throw new Error(
      "AGENT-RUNNER-V1 real workspace execution must remain NOT IMPLEMENTED",
    );
  }
  if (AGENT_RUNNER_PROVIDER_INTEGRATION_STATUS !== "HOLD") {
    throw new Error("AGENT-RUNNER-V1 provider integration must remain HOLD");
  }
}
