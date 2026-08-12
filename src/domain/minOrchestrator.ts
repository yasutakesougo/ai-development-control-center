/**
 * MIN-ORCHESTRATOR-V1
 *
 * ORCHESTRATION DECISION ONLY · NO AGENT EXECUTION · NO GITHUB PUBLICATION
 *
 * Consumes AgentTaskBuilderResultV1 and produces an explicit dispatch decision.
 * DISPATCH_ELIGIBLE ≠ Agent execution, Action Gateway, Ready, Merge, or GitHub
 * mutation authorization.
 */

import {
  AGENT_TASK_VALIDATION_RESULT_SCHEMA,
  parseAgentTaskV1,
  validateAgentTaskV1,
  type AgentTaskRiskClass,
  type AgentTaskStopAt,
  type AgentTaskV1,
  type AgentTaskValidationResultV1,
  type AgentTaskValidationStatus,
} from "./agentTaskContract";
import {
  AGENT_TASK_BUILDER_VERSION,
  type AgentTaskBuilderResultV1,
  type AgentTaskBuilderStatus,
} from "./agentTaskBuilder";

export const MIN_ORCHESTRATOR_VERSION = "MIN-ORCHESTRATOR-V1" as const;
export const MIN_ORCHESTRATOR_RESULT_SCHEMA =
  "MIN-ORCHESTRATOR-RESULT-V1" as const;

/** Orchestrator surfaces remain non-executing in this slice. */
export const MIN_ORCHESTRATOR_EXECUTION_IMPLEMENTED = false as const;
export const MIN_ORCHESTRATOR_PUBLICATION_IMPLEMENTED = false as const;
export const MIN_ORCHESTRATOR_AGENT_RUNNER_IMPLEMENTED = false as const;
export const MIN_ORCHESTRATOR_ACTION_GATEWAY_EXPANSION_IMPLEMENTED =
  false as const;

export const MIN_ORCHESTRATOR_INPUT_ROOT_KEYS = [
  "builderResult",
  "observedAt",
  "attemptId",
] as const;

export const MIN_ORCHESTRATOR_RESULT_ROOT_KEYS = [
  "schemaVersion",
  "orchestratorVersion",
  "decision",
  "reasonCode",
  "reasonMessage",
  "task",
  "builderStatus",
  "validation",
  "metadata",
] as const;

/**
 * Capabilities this orchestration stage may observe without HOLD.
 * Empty allowlist remains valid (default-deny). Any other capability fails closed.
 * Orchestrator never adds or widens capabilities.
 */
export const MIN_ORCHESTRATOR_SUPPORTED_CAPABILITIES = [
  "workspace.read.v1",
] as const;

/**
 * Risk classes eligible for DISPATCH_ELIGIBLE at this non-executing stage.
 * R3–R5 require future mutation/authorization stages → HOLD.
 */
export const MIN_ORCHESTRATOR_SUPPORTED_RISK_CLASSES = [
  "R0",
  "R1",
  "R2",
] as const satisfies readonly AgentTaskRiskClass[];

/**
 * stopAt values that may become DISPATCH_ELIGIBLE.
 * TASK_BUILT means contract-only / no runner activity → HOLD.
 */
export const MIN_ORCHESTRATOR_SUPPORTED_STOP_AT = [
  "AGENT_COMPLETE",
  "VERIFY_COMPLETE",
  "DRAFT_PR",
] as const satisfies readonly AgentTaskStopAt[];

export type MinOrchestratorDecision =
  | "DISPATCH_ELIGIBLE"
  | "HOLD"
  | "REJECT"
  | "UNKNOWN";

export type MinOrchestratorReasonCode =
  | "DISPATCH_ELIGIBLE"
  | "HOLD_BUILDER"
  | "HOLD_VALIDATION"
  | "HOLD_STOP_AT_TASK_BUILT"
  | "HOLD_UNSUPPORTED_RISK_CLASS"
  | "HOLD_UNSUPPORTED_CAPABILITY"
  | "HOLD_UNSUPPORTED_STOP_AT"
  | "REJECT_BUILDER_INVALID"
  | "REJECT_BUILT_NULL_TASK"
  | "REJECT_FOREIGN_BUILDER_VERSION"
  | "REJECT_VALIDATION_SCHEMA"
  | "REJECT_VALIDATION_TASK_BINDING"
  | "REJECT_VALIDATION_INVALID"
  | "REJECT_TASK_MALFORMED"
  | "REJECT_TASK_SEMANTICS"
  | "REJECT_REVALIDATION_MISMATCH"
  | "REJECT_INCONSISTENT_BUILDER_STATE"
  | "REJECT_INPUT"
  | "UNKNOWN_BUILDER"
  | "UNKNOWN_VALIDATION"
  | "UNKNOWN_ORCHESTRATOR_STATE";

export interface MinOrchestratorInputV1 {
  builderResult: AgentTaskBuilderResultV1;
  observedAt: string;
  /** Optional deterministic attempt / correlation id. */
  attemptId?: string;
}

export interface MinOrchestratorMetadata {
  observedAt: string;
  attemptId?: string;
  revalidatedAt: string;
  /** True only when DISPATCH_ELIGIBLE; still ≠ execution authorization. */
  dispatchEligible: boolean;
  executionAuthorized: false;
  actionGatewayAuthorized: false;
  readyAuthorized: false;
  mergeAuthorized: false;
  githubMutationAuthorized: false;
}

export interface MinOrchestratorResultV1 {
  schemaVersion: typeof MIN_ORCHESTRATOR_RESULT_SCHEMA;
  orchestratorVersion: typeof MIN_ORCHESTRATOR_VERSION;
  decision: MinOrchestratorDecision;
  reasonCode: MinOrchestratorReasonCode;
  reasonMessage: string;
  task: AgentTaskV1 | null;
  builderStatus: AgentTaskBuilderStatus | null;
  validation: AgentTaskValidationResultV1 | null;
  metadata: MinOrchestratorMetadata;
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

function emptyValidation(
  taskId: string | null,
  validatedAt: string,
  reasonCode: string,
  reasonMessage: string,
  status: AgentTaskValidationStatus = "INVALID",
): AgentTaskValidationResultV1 {
  return {
    schemaVersion: AGENT_TASK_VALIDATION_RESULT_SCHEMA,
    taskId,
    status,
    reasonCode,
    reasonMessage,
    validatedAt,
  };
}

function metadataBase(input: {
  observedAt: string;
  attemptId?: string;
  revalidatedAt: string;
}): MinOrchestratorMetadata {
  return {
    observedAt: input.observedAt,
    attemptId: input.attemptId,
    revalidatedAt: input.revalidatedAt,
    dispatchEligible: false,
    executionAuthorized: false,
    actionGatewayAuthorized: false,
    readyAuthorized: false,
    mergeAuthorized: false,
    githubMutationAuthorized: false,
  };
}

function result(input: {
  decision: MinOrchestratorDecision;
  reasonCode: MinOrchestratorReasonCode;
  reasonMessage: string;
  task: AgentTaskV1 | null;
  builderStatus: AgentTaskBuilderStatus | null;
  validation: AgentTaskValidationResultV1 | null;
  observedAt: string;
  attemptId?: string;
  revalidatedAt: string;
}): MinOrchestratorResultV1 {
  const meta = metadataBase({
    observedAt: input.observedAt,
    attemptId: input.attemptId,
    revalidatedAt: input.revalidatedAt,
  });
  if (input.decision === "DISPATCH_ELIGIBLE") {
    meta.dispatchEligible = true;
  }
  return {
    schemaVersion: MIN_ORCHESTRATOR_RESULT_SCHEMA,
    orchestratorVersion: MIN_ORCHESTRATOR_VERSION,
    decision: input.decision,
    reasonCode: input.reasonCode,
    reasonMessage: input.reasonMessage,
    task: input.task,
    builderStatus: input.builderStatus,
    validation: input.validation,
    metadata: meta,
  };
}

function isBuilderStatus(value: unknown): value is AgentTaskBuilderStatus {
  return (
    value === "BUILT" ||
    value === "HOLD" ||
    value === "INVALID" ||
    value === "UNKNOWN"
  );
}

function isValidationStatus(value: unknown): value is AgentTaskValidationStatus {
  return (
    value === "VALID" ||
    value === "INVALID" ||
    value === "HOLD" ||
    value === "UNKNOWN"
  );
}

/**
 * Minimal structural check for builderResult. Unknown keys on the orchestration
 * input are rejected by parseMinOrchestratorInput; builderResult itself is
 * treated as an already-produced upstream document — inconsistent shapes fail closed.
 */
function looksLikeBuilderResult(
  value: unknown,
): value is AgentTaskBuilderResultV1 {
  if (!isPlainObject(value)) return false;
  if (value.schemaVersion !== "AGENT-TASK-BUILDER-RESULT-V1") return false;
  if (typeof value.builderVersion !== "string") return false;
  if (!isBuilderStatus(value.status)) return false;
  if (!Object.prototype.hasOwnProperty.call(value, "task")) return false;
  if (value.task !== null && !isPlainObject(value.task)) return false;
  if (!isPlainObject(value.validation)) return false;
  if (!isValidationStatus(value.validation.status)) return false;
  if (typeof value.reasonCode !== "string" || value.reasonCode.length < 1) {
    return false;
  }
  if (
    typeof value.reasonMessage !== "string" ||
    value.reasonMessage.length < 1
  ) {
    return false;
  }
  return true;
}

/**
 * Fail-closed parse of orchestration input. Unknown root keys are rejected.
 */
export function parseMinOrchestratorInput(
  value: unknown,
):
  | { ok: true; input: MinOrchestratorInputV1 }
  | {
      ok: false;
      reasonCode: "REJECT_INPUT";
      reasonMessage: string;
    } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Orchestrator input must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, MIN_ORCHESTRATOR_INPUT_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Orchestrator input contains unknown properties.",
    };
  }
  if (typeof value.observedAt !== "string" || value.observedAt.length < 1) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "observedAt must be a non-empty string.",
    };
  }
  if (value.attemptId !== undefined) {
    if (typeof value.attemptId !== "string" || value.attemptId.length < 1) {
      return {
        ok: false,
        reasonCode: "REJECT_INPUT",
        reasonMessage: "attemptId must be a non-empty string when provided.",
      };
    }
  }
  if (!looksLikeBuilderResult(value.builderResult)) {
    return {
      ok: false,
      reasonCode: "REJECT_INPUT",
      reasonMessage: "builderResult is missing or malformed.",
    };
  }

  return {
    ok: true,
    input: {
      builderResult: value.builderResult,
      observedAt: value.observedAt,
      attemptId: value.attemptId as string | undefined,
    },
  };
}

function unsupportedCapabilities(task: AgentTaskV1): string[] {
  const supported = new Set<string>(MIN_ORCHESTRATOR_SUPPORTED_CAPABILITIES);
  return task.allowedCapabilities.filter((cap) => !supported.has(cap));
}

function isSupportedRiskClass(riskClass: AgentTaskRiskClass): boolean {
  return (MIN_ORCHESTRATOR_SUPPORTED_RISK_CLASSES as readonly string[]).includes(
    riskClass,
  );
}

function isSupportedStopAt(stopAt: AgentTaskStopAt): boolean {
  return (MIN_ORCHESTRATOR_SUPPORTED_STOP_AT as readonly string[]).includes(
    stopAt,
  );
}

/**
 * Apply capability / riskClass / stopAt stage rules after successful revalidation.
 * Never mutates the task. Unsupported future states fail closed (HOLD).
 */
function applyStageRules(
  task: AgentTaskV1,
  validation: AgentTaskValidationResultV1,
  ctx: {
    builderStatus: AgentTaskBuilderStatus;
    observedAt: string;
    attemptId?: string;
    revalidatedAt: string;
  },
): MinOrchestratorResultV1 {
  if (task.stopAt === "TASK_BUILT") {
    return result({
      decision: "HOLD",
      reasonCode: "HOLD_STOP_AT_TASK_BUILT",
      reasonMessage:
        "stopAt=TASK_BUILT means no runner activity; dispatch is not eligible.",
      task,
      builderStatus: ctx.builderStatus,
      validation,
      observedAt: ctx.observedAt,
      attemptId: ctx.attemptId,
      revalidatedAt: ctx.revalidatedAt,
    });
  }

  if (!isSupportedStopAt(task.stopAt)) {
    return result({
      decision: "HOLD",
      reasonCode: "HOLD_UNSUPPORTED_STOP_AT",
      reasonMessage: `stopAt=${task.stopAt} is unsupported for MIN-ORCHESTRATOR-V1 dispatch eligibility.`,
      task,
      builderStatus: ctx.builderStatus,
      validation,
      observedAt: ctx.observedAt,
      attemptId: ctx.attemptId,
      revalidatedAt: ctx.revalidatedAt,
    });
  }

  if (!isSupportedRiskClass(task.riskClass)) {
    return result({
      decision: "HOLD",
      reasonCode: "HOLD_UNSUPPORTED_RISK_CLASS",
      reasonMessage: `riskClass=${task.riskClass} requires a future authorization stage; HOLD for Human resolution.`,
      task,
      builderStatus: ctx.builderStatus,
      validation,
      observedAt: ctx.observedAt,
      attemptId: ctx.attemptId,
      revalidatedAt: ctx.revalidatedAt,
    });
  }

  const unknownCaps = unsupportedCapabilities(task);
  if (unknownCaps.length > 0) {
    return result({
      decision: "HOLD",
      reasonCode: "HOLD_UNSUPPORTED_CAPABILITY",
      reasonMessage: `Unsupported or unknown capability for this stage: ${unknownCaps.join(", ")}. Orchestrator does not widen or authorize capabilities.`,
      task,
      builderStatus: ctx.builderStatus,
      validation,
      observedAt: ctx.observedAt,
      attemptId: ctx.attemptId,
      revalidatedAt: ctx.revalidatedAt,
    });
  }

  return result({
    decision: "DISPATCH_ELIGIBLE",
    reasonCode: "DISPATCH_ELIGIBLE",
    reasonMessage:
      "Builder BUILT + VALID task revalidated; stage rules passed. DISPATCH_ELIGIBLE ≠ execution or publication authorization.",
    task,
    builderStatus: ctx.builderStatus,
    validation,
    observedAt: ctx.observedAt,
    attemptId: ctx.attemptId,
    revalidatedAt: ctx.revalidatedAt,
  });
}

/**
 * Decide dispatch eligibility from a builder result.
 * Pure / deterministic. Never executes Agents, mutates GitHub, or widens task authority.
 */
export function orchestrateAgentTaskV1(
  rawInput: unknown,
  options: { revalidatedAt?: string; treatPrefixOverlapAsHold?: boolean } = {},
): MinOrchestratorResultV1 {
  const revalidatedAt = options.revalidatedAt ?? new Date(0).toISOString();

  const parsed = parseMinOrchestratorInput(rawInput);
  if (!parsed.ok) {
    return result({
      decision: "REJECT",
      reasonCode: parsed.reasonCode,
      reasonMessage: parsed.reasonMessage,
      task: null,
      builderStatus: null,
      validation: emptyValidation(
        null,
        revalidatedAt,
        parsed.reasonCode,
        parsed.reasonMessage,
      ),
      observedAt:
        isPlainObject(rawInput) && typeof rawInput.observedAt === "string"
          ? rawInput.observedAt
          : revalidatedAt,
      attemptId: undefined,
      revalidatedAt,
    });
  }

  const { builderResult, observedAt, attemptId } = parsed.input;
  const ctx = {
    builderStatus: builderResult.status,
    observedAt,
    attemptId,
    revalidatedAt,
  };

  // Non-BUILT statuses map directly — never promote to DISPATCH_ELIGIBLE.
  if (builderResult.status === "HOLD") {
    return result({
      decision: "HOLD",
      reasonCode: "HOLD_BUILDER",
      reasonMessage: `Builder HOLD: ${builderResult.reasonMessage}`,
      task: builderResult.task,
      validation: builderResult.validation,
      ...ctx,
    });
  }

  if (builderResult.status === "INVALID") {
    return result({
      decision: "REJECT",
      reasonCode: "REJECT_BUILDER_INVALID",
      reasonMessage: `Builder INVALID: ${builderResult.reasonMessage}`,
      task: builderResult.task,
      validation: builderResult.validation,
      ...ctx,
    });
  }

  if (builderResult.status === "UNKNOWN") {
    return result({
      decision: "UNKNOWN",
      reasonCode: "UNKNOWN_BUILDER",
      reasonMessage: `Builder UNKNOWN: ${builderResult.reasonMessage}`,
      task: builderResult.task,
      validation: builderResult.validation,
      ...ctx,
    });
  }

  if (builderResult.status !== "BUILT") {
    return result({
      decision: "UNKNOWN",
      reasonCode: "UNKNOWN_ORCHESTRATOR_STATE",
      reasonMessage: "Unrecognized builder status; fail closed.",
      task: null,
      validation: emptyValidation(
        null,
        revalidatedAt,
        "UNKNOWN_ORCHESTRATOR_STATE",
        "Unrecognized builder status; fail closed.",
        "UNKNOWN",
      ),
      ...ctx,
    });
  }

  // --- BUILT path: do not trust status alone ---

  if (builderResult.builderVersion !== AGENT_TASK_BUILDER_VERSION) {
    return result({
      decision: "REJECT",
      reasonCode: "REJECT_FOREIGN_BUILDER_VERSION",
      reasonMessage: `BUILT result builderVersion must be ${AGENT_TASK_BUILDER_VERSION}; got ${String(builderResult.builderVersion)}.`,
      task: builderResult.task,
      validation: builderResult.validation,
      ...ctx,
    });
  }

  if (
    builderResult.validation.schemaVersion !==
    AGENT_TASK_VALIDATION_RESULT_SCHEMA
  ) {
    return result({
      decision: "REJECT",
      reasonCode: "REJECT_VALIDATION_SCHEMA",
      reasonMessage: `BUILT result validation.schemaVersion must be ${AGENT_TASK_VALIDATION_RESULT_SCHEMA}.`,
      task: builderResult.task,
      validation: builderResult.validation,
      ...ctx,
    });
  }

  // Inconsistent: BUILT claiming non-VALID validation before revalidation.
  const claimedValidation = builderResult.validation.status;

  if (claimedValidation === "INVALID") {
    return result({
      decision: "REJECT",
      reasonCode: "REJECT_VALIDATION_INVALID",
      reasonMessage: `BUILT result reports validation INVALID: ${builderResult.validation.reasonMessage}`,
      task: builderResult.task,
      validation: builderResult.validation,
      ...ctx,
    });
  }

  if (claimedValidation === "HOLD") {
    return result({
      decision: "HOLD",
      reasonCode: "HOLD_VALIDATION",
      reasonMessage: `BUILT result reports validation HOLD: ${builderResult.validation.reasonMessage}`,
      task: builderResult.task,
      validation: builderResult.validation,
      ...ctx,
    });
  }

  if (claimedValidation === "UNKNOWN") {
    return result({
      decision: "UNKNOWN",
      reasonCode: "UNKNOWN_VALIDATION",
      reasonMessage: `BUILT result reports validation UNKNOWN: ${builderResult.validation.reasonMessage}`,
      task: builderResult.task,
      validation: builderResult.validation,
      ...ctx,
    });
  }

  if (claimedValidation !== "VALID") {
    return result({
      decision: "REJECT",
      reasonCode: "REJECT_INCONSISTENT_BUILDER_STATE",
      reasonMessage: "BUILT result has unrecognized validation status; fail closed.",
      task: builderResult.task,
      validation: builderResult.validation,
      ...ctx,
    });
  }

  if (builderResult.task === null) {
    return result({
      decision: "REJECT",
      reasonCode: "REJECT_BUILT_NULL_TASK",
      reasonMessage: "BUILT + VALID claimed but task is null; fail closed.",
      task: null,
      validation: builderResult.validation,
      ...ctx,
    });
  }

  // Upstream VALID must be bound to THIS task identity (not a foreign taskId).
  if (builderResult.validation.taskId !== builderResult.task.taskId) {
    return result({
      decision: "REJECT",
      reasonCode: "REJECT_VALIDATION_TASK_BINDING",
      reasonMessage: `Builder validation.taskId (${String(builderResult.validation.taskId)}) is not bound to task.taskId (${String(builderResult.task.taskId)}); fail closed.`,
      task: builderResult.task,
      validation: builderResult.validation,
      ...ctx,
    });
  }

  // Revalidate: parse → validate. Do not trust upstream status alone.
  const structural = parseAgentTaskV1(builderResult.task);
  if (!structural.ok) {
    return result({
      decision: "REJECT",
      reasonCode: "REJECT_TASK_MALFORMED",
      reasonMessage: `Task failed structural reparse: ${structural.reasonMessage}`,
      task: null,
      validation: emptyValidation(
        null,
        revalidatedAt,
        structural.reasonCode,
        structural.reasonMessage,
      ),
      ...ctx,
    });
  }

  const upstreamTask = builderResult.task;
  const revalidation = validateAgentTaskV1(structural.task, {
    validatedAt: revalidatedAt,
    treatPrefixOverlapAsHold: options.treatPrefixOverlapAsHold,
  });

  // Compare at least task identity + validation status (validatedAt may differ).
  if (
    revalidation.status !== builderResult.validation.status ||
    revalidation.taskId !== builderResult.validation.taskId
  ) {
    return result({
      decision: "REJECT",
      reasonCode: "REJECT_REVALIDATION_MISMATCH",
      reasonMessage: `Revalidation (status=${revalidation.status}, taskId=${String(revalidation.taskId)}) differs from builder validation (status=${builderResult.validation.status}, taskId=${String(builderResult.validation.taskId)}); fail closed.`,
      task: upstreamTask,
      validation: revalidation,
      ...ctx,
    });
  }

  if (revalidation.taskId !== upstreamTask.taskId) {
    return result({
      decision: "REJECT",
      reasonCode: "REJECT_REVALIDATION_MISMATCH",
      reasonMessage: `Revalidation.taskId (${String(revalidation.taskId)}) is not bound to task.taskId (${upstreamTask.taskId}); fail closed.`,
      task: upstreamTask,
      validation: revalidation,
      ...ctx,
    });
  }

  if (revalidation.status === "INVALID") {
    return result({
      decision: "REJECT",
      reasonCode: "REJECT_TASK_SEMANTICS",
      reasonMessage: revalidation.reasonMessage,
      task: upstreamTask,
      validation: revalidation,
      ...ctx,
    });
  }

  if (revalidation.status === "HOLD") {
    return result({
      decision: "HOLD",
      reasonCode: "HOLD_VALIDATION",
      reasonMessage: revalidation.reasonMessage,
      task: upstreamTask,
      validation: revalidation,
      ...ctx,
    });
  }

  if (revalidation.status === "UNKNOWN") {
    return result({
      decision: "UNKNOWN",
      reasonCode: "UNKNOWN_VALIDATION",
      reasonMessage: revalidation.reasonMessage,
      task: upstreamTask,
      validation: revalidation,
      ...ctx,
    });
  }

  if (revalidation.status !== "VALID") {
    return result({
      decision: "UNKNOWN",
      reasonCode: "UNKNOWN_ORCHESTRATOR_STATE",
      reasonMessage: "Unrecognized revalidation status; fail closed.",
      task: upstreamTask,
      validation: revalidation,
      ...ctx,
    });
  }

  // Preserve upstream validated task (no rewrite / widen).
  return applyStageRules(upstreamTask, revalidation, ctx);
}

export function assertMinOrchestratorNotExecuting(): void {
  if (
    MIN_ORCHESTRATOR_EXECUTION_IMPLEMENTED ||
    MIN_ORCHESTRATOR_PUBLICATION_IMPLEMENTED ||
    MIN_ORCHESTRATOR_AGENT_RUNNER_IMPLEMENTED ||
    MIN_ORCHESTRATOR_ACTION_GATEWAY_EXPANSION_IMPLEMENTED
  ) {
    throw new Error(
      "MIN-ORCHESTRATOR-V1 execution/publication/runner/gateway-expansion surfaces must remain NOT IMPLEMENTED",
    );
  }
}
