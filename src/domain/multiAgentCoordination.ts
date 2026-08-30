import type { AgentTaskV1 } from "./agentTaskContract";
import { canonicalJson } from "./decisionFingerprint";
import { computeWorkerRoutingTaskFingerprint } from "./workerRouting";

export const MULTI_AGENT_COORDINATION_PLAN_SCHEMA =
  "MULTI-AGENT-COORDINATION-PLAN-V1" as const;
export const MULTI_AGENT_COORDINATION_PLAN_FINGERPRINT_SCHEMA =
  "MULTI-AGENT-COORDINATION-PLAN-FINGERPRINT-V1" as const;
export const MULTI_AGENT_COORDINATION_CANCELLATION_SCHEMA =
  "MULTI-AGENT-COORDINATION-CANCELLATION-V1" as const;
export const MULTI_AGENT_COORDINATION_PROGRESSION_INPUT_SCHEMA =
  "MULTI-AGENT-COORDINATION-PROGRESSION-INPUT-V1" as const;
export const MULTI_AGENT_COORDINATION_PROGRESSION_DECISION_SCHEMA =
  "MULTI-AGENT-COORDINATION-PROGRESSION-DECISION-V1" as const;

export const MULTI_AGENT_COORDINATION_ID_MAX = 128 as const;
export const MULTI_AGENT_COORDINATION_TASK_REFS_MAX = 32 as const;
export const MULTI_AGENT_COORDINATION_DEPENDENCIES_MAX = 31 as const;
export const MULTI_AGENT_COORDINATION_REFERENCE_MAX = 2048 as const;
export const MULTI_AGENT_COORDINATION_REFERENCE_ARRAY_MAX = 32 as const;
export const MULTI_AGENT_COORDINATION_CONCURRENCY_REFS_MAX = 16 as const;
export const MULTI_AGENT_COORDINATION_SOURCE_ID_MAX = 128 as const;
export const MULTI_AGENT_COORDINATION_CONCURRENCY_MAX = 32 as const;
export const MULTI_AGENT_COORDINATION_TIMESTAMP_MAX = 64 as const;

/** Slice B implements only the pure progression evaluator. Execution surfaces remain disabled. */
export const MULTI_AGENT_COORDINATION_PROGRESSION_EVALUATOR_IMPLEMENTED = true as const;
export const MULTI_AGENT_COORDINATION_EXECUTION_IMPLEMENTED = false as const;
export const MULTI_AGENT_COORDINATION_PROVIDER_INVOCATION_IMPLEMENTED = false as const;
export const MULTI_AGENT_COORDINATION_HARNESS_INVOCATION_IMPLEMENTED = false as const;
export const MULTI_AGENT_COORDINATION_GITHUB_MUTATION_IMPLEMENTED = false as const;
export const MULTI_AGENT_COORDINATION_READY_IMPLEMENTED = false as const;
export const MULTI_AGENT_COORDINATION_MERGE_IMPLEMENTED = false as const;
export const MULTI_AGENT_COORDINATION_DEPLOY_IMPLEMENTED = false as const;

const LOCAL_ID_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const AGENT_TASK_ID_PATTERN = /^[\x20-\x7E]+$/;

const PLAN_ROOT_KEYS = ["schemaVersion", "coordinationId", "taskRefs"] as const;
const TASK_REF_KEYS = [
  "taskId",
  "taskRoutingFingerprint",
  "dependencyTaskIds",
  "coordinationMode",
] as const;
const CANCELLATION_KEYS = [
  "schemaVersion",
  "cancellationRequestId",
  "source",
  "coordinationId",
  "coordinationPlanFingerprint",
  "targetScope",
  "targetTaskId",
  "authorizationRef",
  "requestedAt",
] as const;
const CONCURRENCY_CEILING_KEYS = [
  "sourceId",
  "coordinationId",
  "coordinationPlanFingerprint",
  "ceiling",
  "evidenceRef",
] as const;
const PROGRESSION_INPUT_KEYS = [
  "schemaVersion",
  "coordinationId",
  "coordinationPlanFingerprint",
  "taskId",
  "authorizationObservation",
  "executionObservation",
  "resultValidationObservation",
  "executionAuthorizationRef",
  "executionAttemptId",
  "executionOutcomeRef",
  "resultValidationRef",
  "dependencyEvaluation",
  "resourceConcurrencyEvaluation",
  "acceptedCancellationRequest",
] as const;
const PROGRESSION_DECISION_KEYS = [
  "schemaVersion",
  "coordinationId",
  "coordinationPlanFingerprint",
  "taskId",
  "coordinationProgressionStatus",
  "coordinationProgressionReason",
] as const;

export type CoordinationModeV1 = "SEQUENTIAL" | "PARALLEL_ELIGIBLE";

export interface CoordinationTaskRefV1 {
  taskId: string;
  taskRoutingFingerprint: string;
  dependencyTaskIds: string[];
  coordinationMode: CoordinationModeV1;
}

export interface CoordinationPlanV1 {
  schemaVersion: typeof MULTI_AGENT_COORDINATION_PLAN_SCHEMA;
  coordinationId: string;
  taskRefs: CoordinationTaskRefV1[];
}

export interface CoordinationPlanFingerprintTaskRefFactsV1 {
  taskId: string;
  taskRoutingFingerprint: string;
  dependencyTaskIds: string[];
  coordinationMode: CoordinationModeV1;
}

export interface CoordinationPlanFingerprintFactsV1 {
  schemaVersion: typeof MULTI_AGENT_COORDINATION_PLAN_FINGERPRINT_SCHEMA;
  coordinationId: string;
  taskRefs: CoordinationPlanFingerprintTaskRefFactsV1[];
}

export type CoordinationCancellationSourceV1 =
  | "HUMAN_CONTROL_SURFACE"
  | "OWNING_POLICY_SURFACE";
export type CoordinationCancellationTargetScopeV1 = "COORDINATION" | "TASK";

export interface CoordinationCancellationRequestV1 {
  schemaVersion: typeof MULTI_AGENT_COORDINATION_CANCELLATION_SCHEMA;
  cancellationRequestId: string;
  source: CoordinationCancellationSourceV1;
  coordinationId: string;
  coordinationPlanFingerprint: string;
  targetScope: CoordinationCancellationTargetScopeV1;
  targetTaskId: string | null;
  authorizationRef: string;
  requestedAt: string;
}

export interface CoordinationConcurrencyCeilingRefV1 {
  sourceId: string;
  coordinationId: string;
  coordinationPlanFingerprint: string;
  ceiling: number;
  evidenceRef: string;
}

export type CoordinationAuthorizationObservationV1 =
  | "NOT_EVALUATED"
  | "AUTHORIZED"
  | "DENIED"
  | "WAITING_HUMAN_GATE"
  | "HOLD"
  | "UNKNOWN";

export type CoordinationExecutionObservationV1 =
  | "NOT_INVOKED"
  | "RUNNING"
  | "EXECUTION_SUCCEEDED"
  | "EXECUTION_FAILED"
  | "EXECUTION_UNKNOWN";

export type CoordinationResultValidationObservationV1 =
  | "NOT_REQUIRED"
  | "NOT_EVALUATED"
  | "RESULT_VALID"
  | "RESULT_INVALID"
  | "RESULT_UNKNOWN";

export type CoordinationDependencyEvaluationV1 =
  | "SATISFIED"
  | "PENDING"
  | "BLOCKED";

export type CoordinationResourceConcurrencyEvaluationV1 = "PASS" | "WAIT";

export type CoordinationProgressionStatusV1 =
  | "PLANNED"
  | "READY"
  | "RUNNING"
  | "WAITING_DEPENDENCY"
  | "WAITING_RESOURCE"
  | "WAITING_HUMAN_GATE"
  | "HOLD"
  | "SUCCEEDED"
  | "FAILED"
  | "UNKNOWN"
  | "CANCELLED"
  | "NOT_EXECUTED";

export type CoordinationProgressionReasonV1 =
  | "PLAN_ADMITTED"
  | "DEPENDENCY_PENDING"
  | "DEPENDENCY_BLOCKED"
  | "RESOURCE_WAIT"
  | "READY_FOR_AUTHORIZATION"
  | "AUTHORIZATION_DENIED"
  | "AUTHORIZATION_HOLD"
  | "AUTHORIZATION_UNKNOWN"
  | "HUMAN_GATE_WAIT"
  | "EXECUTION_RUNNING"
  | "EXECUTION_FAILED"
  | "EXECUTION_UNKNOWN"
  | "RESULT_INVALID"
  | "RESULT_UNKNOWN"
  | "EXECUTION_AND_RESULT_VALID"
  | "EXECUTION_VALIDATION_NOT_REQUIRED"
  | "CANCELLATION_ACCEPTED"
  | "OBSERVATION_CONTRADICTION"
  | "RESULT_VALIDATION_PENDING"
  | "AUTHORIZED_NOT_INVOKED";

export interface CoordinationProgressionInputV1 {
  schemaVersion: typeof MULTI_AGENT_COORDINATION_PROGRESSION_INPUT_SCHEMA;
  coordinationId: string;
  coordinationPlanFingerprint: string;
  taskId: string;
  authorizationObservation: CoordinationAuthorizationObservationV1;
  executionObservation: CoordinationExecutionObservationV1;
  resultValidationObservation: CoordinationResultValidationObservationV1;
  executionAuthorizationRef: string | null;
  executionAttemptId: string | null;
  executionOutcomeRef: string | null;
  resultValidationRef: string | null;
  dependencyEvaluation: CoordinationDependencyEvaluationV1 | null;
  resourceConcurrencyEvaluation: CoordinationResourceConcurrencyEvaluationV1 | null;
  acceptedCancellationRequest: CoordinationCancellationRequestV1 | null;
}

export interface CoordinationProgressionDecisionV1 {
  schemaVersion: typeof MULTI_AGENT_COORDINATION_PROGRESSION_DECISION_SCHEMA;
  coordinationId: string;
  coordinationPlanFingerprint: string;
  taskId: string;
  coordinationProgressionStatus: CoordinationProgressionStatusV1;
  coordinationProgressionReason: CoordinationProgressionReasonV1;
}

export interface CoordinationPlanBindingV1 {
  plan: CoordinationPlanV1;
  coordinationPlanFingerprint: string;
}

export type CoordinationParseReasonV1 =
  | "REJECTED_SCHEMA"
  | "REJECTED_BINDING"
  | "REJECTED_GRAPH"
  | "REJECTED_CONTRADICTION";

export type CoordinationParseResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reason: CoordinationParseReasonV1 };

export type EffectiveConcurrencyCeilingResultV1 =
  | { status: "PASS"; effectiveCeiling: number }
  | { status: "HOLD"; effectiveCeiling: null };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isLocalId(value: unknown): value is string {
  return typeof value === "string" && LOCAL_ID_PATTERN.test(value);
}

function isAgentTaskId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    AGENT_TASK_ID_PATTERN.test(value)
  );
}

function isFingerprint(value: unknown): value is string {
  return typeof value === "string" && FINGERPRINT_PATTERN.test(value);
}

function isOpaqueRef(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= MULTI_AGENT_COORDINATION_REFERENCE_MAX
  );
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function isStringArray(
  value: unknown,
  maxItems: number,
  item: (value: unknown) => value is string,
): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every(item);
}

function isCoordinationMode(value: unknown): value is CoordinationModeV1 {
  return value === "SEQUENTIAL" || value === "PARALLEL_ELIGIBLE";
}

function parseTaskRef(value: unknown): CoordinationParseResultV1<CoordinationTaskRefV1> {
  if (!isPlainObject(value) || !hasExactKeys(value, TASK_REF_KEYS)) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }
  if (
    !isAgentTaskId(value.taskId) ||
    !isFingerprint(value.taskRoutingFingerprint) ||
    !isStringArray(
      value.dependencyTaskIds,
      MULTI_AGENT_COORDINATION_DEPENDENCIES_MAX,
      isAgentTaskId,
    ) ||
    hasDuplicates(value.dependencyTaskIds) ||
    !isCoordinationMode(value.coordinationMode)
  ) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }
  return {
    ok: true,
    value: {
      taskId: value.taskId,
      taskRoutingFingerprint: value.taskRoutingFingerprint,
      dependencyTaskIds: [...value.dependencyTaskIds],
      coordinationMode: value.coordinationMode,
    },
  };
}

function graphIsAcyclic(taskRefs: readonly CoordinationTaskRefV1[]): boolean {
  const byId = new Map(taskRefs.map((task) => [task.taskId, task] as const));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (taskId: string): boolean => {
    if (visited.has(taskId)) return true;
    if (visiting.has(taskId)) return false;
    const task = byId.get(taskId);
    if (!task) return false;
    visiting.add(taskId);
    for (const dependencyId of task.dependencyTaskIds) {
      if (!visit(dependencyId)) return false;
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return true;
  };

  return taskRefs.every((task) => visit(task.taskId));
}

export function parseCoordinationPlanV1(
  raw: unknown,
): CoordinationParseResultV1<CoordinationPlanV1> {
  if (!isPlainObject(raw) || !hasExactKeys(raw, PLAN_ROOT_KEYS)) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }
  if (
    raw.schemaVersion !== MULTI_AGENT_COORDINATION_PLAN_SCHEMA ||
    !isLocalId(raw.coordinationId) ||
    !Array.isArray(raw.taskRefs) ||
    raw.taskRefs.length < 1 ||
    raw.taskRefs.length > MULTI_AGENT_COORDINATION_TASK_REFS_MAX
  ) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }

  const taskRefs: CoordinationTaskRefV1[] = [];
  for (const item of raw.taskRefs) {
    const parsed = parseTaskRef(item);
    if (!parsed.ok) return parsed;
    taskRefs.push(parsed.value);
  }

  const taskIds = taskRefs.map((task) => task.taskId);
  if (hasDuplicates(taskIds)) return { ok: false, reason: "REJECTED_GRAPH" };
  const taskIdSet = new Set(taskIds);
  for (const task of taskRefs) {
    if (task.dependencyTaskIds.includes(task.taskId)) {
      return { ok: false, reason: "REJECTED_GRAPH" };
    }
    if (task.dependencyTaskIds.some((dependencyId) => !taskIdSet.has(dependencyId))) {
      return { ok: false, reason: "REJECTED_GRAPH" };
    }
  }
  if (!graphIsAcyclic(taskRefs)) return { ok: false, reason: "REJECTED_GRAPH" };

  return {
    ok: true,
    value: {
      schemaVersion: MULTI_AGENT_COORDINATION_PLAN_SCHEMA,
      coordinationId: raw.coordinationId,
      taskRefs,
    },
  };
}

export function captureCoordinationPlanFingerprintFacts(
  plan: CoordinationPlanV1,
): CoordinationPlanFingerprintFactsV1 {
  return {
    schemaVersion: MULTI_AGENT_COORDINATION_PLAN_FINGERPRINT_SCHEMA,
    coordinationId: plan.coordinationId,
    taskRefs: plan.taskRefs.map((task) => ({
      taskId: task.taskId,
      taskRoutingFingerprint: task.taskRoutingFingerprint,
      dependencyTaskIds: [...task.dependencyTaskIds],
      coordinationMode: task.coordinationMode,
    })),
  };
}

async function sha256Canonical(value: unknown): Promise<string> {
  const canonical = canonicalJson(value);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeCoordinationPlanFingerprint(
  plan: CoordinationPlanV1,
): Promise<string> {
  return sha256Canonical(captureCoordinationPlanFingerprintFacts(plan));
}

/** Exact delegation to the existing WORKER-ROUTING-TASK-BINDING-V1 helper. */
export async function computeCoordinationTaskRoutingFingerprint(
  task: AgentTaskV1,
): Promise<string> {
  return computeWorkerRoutingTaskFingerprint(task);
}

function bindingMatches(
  binding: CoordinationPlanBindingV1,
  coordinationId: string,
  coordinationPlanFingerprint: string,
): boolean {
  return (
    binding.plan.coordinationId === coordinationId &&
    binding.coordinationPlanFingerprint === coordinationPlanFingerprint
  );
}

export function parseCoordinationCancellationRequestV1(
  raw: unknown,
  binding?: CoordinationPlanBindingV1,
): CoordinationParseResultV1<CoordinationCancellationRequestV1> {
  if (!isPlainObject(raw) || !hasExactKeys(raw, CANCELLATION_KEYS)) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }
  if (
    raw.schemaVersion !== MULTI_AGENT_COORDINATION_CANCELLATION_SCHEMA ||
    !isLocalId(raw.cancellationRequestId) ||
    (raw.source !== "HUMAN_CONTROL_SURFACE" && raw.source !== "OWNING_POLICY_SURFACE") ||
    !isLocalId(raw.coordinationId) ||
    !isFingerprint(raw.coordinationPlanFingerprint) ||
    (raw.targetScope !== "COORDINATION" && raw.targetScope !== "TASK") ||
    !isOpaqueRef(raw.authorizationRef) ||
    typeof raw.requestedAt !== "string" ||
    raw.requestedAt.length < 1 ||
    raw.requestedAt.length > MULTI_AGENT_COORDINATION_TIMESTAMP_MAX
  ) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }
  if (raw.targetScope === "COORDINATION" && raw.targetTaskId !== null) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }
  if (raw.targetScope === "TASK" && !isAgentTaskId(raw.targetTaskId)) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }

  if (binding) {
    if (!bindingMatches(binding, raw.coordinationId, raw.coordinationPlanFingerprint)) {
      return { ok: false, reason: "REJECTED_BINDING" };
    }
    if (
      raw.targetScope === "TASK" &&
      !binding.plan.taskRefs.some((task) => task.taskId === raw.targetTaskId)
    ) {
      return { ok: false, reason: "REJECTED_BINDING" };
    }
  }

  return {
    ok: true,
    value: {
      schemaVersion: MULTI_AGENT_COORDINATION_CANCELLATION_SCHEMA,
      cancellationRequestId: raw.cancellationRequestId,
      source: raw.source,
      coordinationId: raw.coordinationId,
      coordinationPlanFingerprint: raw.coordinationPlanFingerprint,
      targetScope: raw.targetScope,
      targetTaskId: raw.targetTaskId as string | null,
      authorizationRef: raw.authorizationRef,
      requestedAt: raw.requestedAt,
    },
  };
}

export function parseCoordinationConcurrencyCeilingRefV1(
  raw: unknown,
  binding?: CoordinationPlanBindingV1,
): CoordinationParseResultV1<CoordinationConcurrencyCeilingRefV1> {
  if (!isPlainObject(raw) || !hasExactKeys(raw, CONCURRENCY_CEILING_KEYS)) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }
  if (
    typeof raw.sourceId !== "string" ||
    raw.sourceId.length < 1 ||
    raw.sourceId.length > MULTI_AGENT_COORDINATION_SOURCE_ID_MAX ||
    !isLocalId(raw.coordinationId) ||
    !isFingerprint(raw.coordinationPlanFingerprint) ||
    typeof raw.ceiling !== "number" ||
    !Number.isInteger(raw.ceiling) ||
    raw.ceiling < 1 ||
    raw.ceiling > MULTI_AGENT_COORDINATION_CONCURRENCY_MAX ||
    !isOpaqueRef(raw.evidenceRef)
  ) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }
  if (binding && !bindingMatches(binding, raw.coordinationId, raw.coordinationPlanFingerprint)) {
    return { ok: false, reason: "REJECTED_BINDING" };
  }
  return {
    ok: true,
    value: {
      sourceId: raw.sourceId,
      coordinationId: raw.coordinationId,
      coordinationPlanFingerprint: raw.coordinationPlanFingerprint,
      ceiling: raw.ceiling,
      evidenceRef: raw.evidenceRef,
    },
  };
}

export function computeEffectiveConcurrencyCeiling(
  rawRefs: readonly unknown[],
  binding?: CoordinationPlanBindingV1,
): EffectiveConcurrencyCeilingResultV1 {
  if (
    rawRefs.length < 1 ||
    rawRefs.length > MULTI_AGENT_COORDINATION_CONCURRENCY_REFS_MAX
  ) {
    return { status: "HOLD", effectiveCeiling: null };
  }
  const parsed: CoordinationConcurrencyCeilingRefV1[] = [];
  for (const raw of rawRefs) {
    const value = parseCoordinationConcurrencyCeilingRefV1(raw, binding);
    if (!value.ok) return { status: "HOLD", effectiveCeiling: null };
    parsed.push(value.value);
  }
  if (hasDuplicates(parsed.map((ref) => ref.sourceId))) {
    return { status: "HOLD", effectiveCeiling: null };
  }
  return {
    status: "PASS",
    effectiveCeiling: Math.min(...parsed.map((ref) => ref.ceiling)),
  };
}

const AUTHORIZATION_OBSERVATIONS: readonly CoordinationAuthorizationObservationV1[] = [
  "NOT_EVALUATED",
  "AUTHORIZED",
  "DENIED",
  "WAITING_HUMAN_GATE",
  "HOLD",
  "UNKNOWN",
];
const EXECUTION_OBSERVATIONS: readonly CoordinationExecutionObservationV1[] = [
  "NOT_INVOKED",
  "RUNNING",
  "EXECUTION_SUCCEEDED",
  "EXECUTION_FAILED",
  "EXECUTION_UNKNOWN",
];
const RESULT_OBSERVATIONS: readonly CoordinationResultValidationObservationV1[] = [
  "NOT_REQUIRED",
  "NOT_EVALUATED",
  "RESULT_VALID",
  "RESULT_INVALID",
  "RESULT_UNKNOWN",
];
const DEPENDENCY_EVALUATIONS: readonly CoordinationDependencyEvaluationV1[] = [
  "SATISFIED",
  "PENDING",
  "BLOCKED",
];
const RESOURCE_EVALUATIONS: readonly CoordinationResourceConcurrencyEvaluationV1[] = [
  "PASS",
  "WAIT",
];
const PROGRESSION_STATUSES: readonly CoordinationProgressionStatusV1[] = [
  "PLANNED",
  "READY",
  "RUNNING",
  "WAITING_DEPENDENCY",
  "WAITING_RESOURCE",
  "WAITING_HUMAN_GATE",
  "HOLD",
  "SUCCEEDED",
  "FAILED",
  "UNKNOWN",
  "CANCELLED",
  "NOT_EXECUTED",
];
const PROGRESSION_REASONS: readonly CoordinationProgressionReasonV1[] = [
  "PLAN_ADMITTED",
  "DEPENDENCY_PENDING",
  "DEPENDENCY_BLOCKED",
  "RESOURCE_WAIT",
  "READY_FOR_AUTHORIZATION",
  "AUTHORIZATION_DENIED",
  "AUTHORIZATION_HOLD",
  "AUTHORIZATION_UNKNOWN",
  "HUMAN_GATE_WAIT",
  "EXECUTION_RUNNING",
  "EXECUTION_FAILED",
  "EXECUTION_UNKNOWN",
  "RESULT_INVALID",
  "RESULT_UNKNOWN",
  "EXECUTION_AND_RESULT_VALID",
  "EXECUTION_VALIDATION_NOT_REQUIRED",
  "CANCELLATION_ACCEPTED",
  "OBSERVATION_CONTRADICTION",
  "RESULT_VALIDATION_PENDING",
  "AUTHORIZED_NOT_INVOKED",
];

function includesValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function authorizationExecutionCombinationIsValid(
  authorization: CoordinationAuthorizationObservationV1,
  execution: CoordinationExecutionObservationV1,
): boolean {
  if (authorization === "AUTHORIZED") return true;
  return execution === "NOT_INVOKED";
}

function executionResultCombinationIsValid(
  execution: CoordinationExecutionObservationV1,
  result: CoordinationResultValidationObservationV1,
): boolean {
  if (result === "NOT_REQUIRED" || result === "NOT_EVALUATED") return true;
  if (result === "RESULT_UNKNOWN") {
    return execution === "EXECUTION_SUCCEEDED" || execution === "EXECUTION_UNKNOWN";
  }
  return execution === "EXECUTION_SUCCEEDED";
}

function refsAreConsistent(input: CoordinationProgressionInputV1): boolean {
  if (input.authorizationObservation === "NOT_EVALUATED") {
    if (input.executionAuthorizationRef !== null) return false;
  } else if (!isOpaqueRef(input.executionAuthorizationRef)) {
    return false;
  }

  if (input.executionObservation === "NOT_INVOKED") {
    if (input.executionAttemptId !== null || input.executionOutcomeRef !== null) return false;
  } else if (input.executionObservation === "RUNNING") {
    if (!isOpaqueRef(input.executionAttemptId) || input.executionOutcomeRef !== null) return false;
  } else if (!isOpaqueRef(input.executionAttemptId) || !isOpaqueRef(input.executionOutcomeRef)) {
    return false;
  }

  if (input.resultValidationObservation === "NOT_EVALUATED") {
    if (input.resultValidationRef !== null) return false;
  } else if (!isOpaqueRef(input.resultValidationRef)) {
    return false;
  }

  const dependencyIsNull = input.dependencyEvaluation === null;
  const resourceIsNull = input.resourceConcurrencyEvaluation === null;
  if (dependencyIsNull !== resourceIsNull) return false;

  return true;
}

function parseCoordinationProgressionEnvelopeV1(
  raw: unknown,
): CoordinationParseResultV1<CoordinationProgressionInputV1> {
  if (!isPlainObject(raw) || !hasExactKeys(raw, PROGRESSION_INPUT_KEYS)) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }
  if (
    raw.schemaVersion !== MULTI_AGENT_COORDINATION_PROGRESSION_INPUT_SCHEMA ||
    !isLocalId(raw.coordinationId) ||
    !isFingerprint(raw.coordinationPlanFingerprint) ||
    !isAgentTaskId(raw.taskId) ||
    !includesValue(AUTHORIZATION_OBSERVATIONS, raw.authorizationObservation) ||
    !includesValue(EXECUTION_OBSERVATIONS, raw.executionObservation) ||
    !includesValue(RESULT_OBSERVATIONS, raw.resultValidationObservation) ||
    (raw.executionAuthorizationRef !== null && !isOpaqueRef(raw.executionAuthorizationRef)) ||
    (raw.executionAttemptId !== null && !isOpaqueRef(raw.executionAttemptId)) ||
    (raw.executionOutcomeRef !== null && !isOpaqueRef(raw.executionOutcomeRef)) ||
    (raw.resultValidationRef !== null && !isOpaqueRef(raw.resultValidationRef)) ||
    (raw.dependencyEvaluation !== null &&
      !includesValue(DEPENDENCY_EVALUATIONS, raw.dependencyEvaluation)) ||
    (raw.resourceConcurrencyEvaluation !== null &&
      !includesValue(RESOURCE_EVALUATIONS, raw.resourceConcurrencyEvaluation))
  ) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }

  let cancellation: CoordinationCancellationRequestV1 | null = null;
  if (raw.acceptedCancellationRequest !== null) {
    const parsedCancellation = parseCoordinationCancellationRequestV1(
      raw.acceptedCancellationRequest,
    );
    if (!parsedCancellation.ok) return parsedCancellation;
    cancellation = parsedCancellation.value;
  }

  return {
    ok: true,
    value: {
      schemaVersion: MULTI_AGENT_COORDINATION_PROGRESSION_INPUT_SCHEMA,
      coordinationId: raw.coordinationId,
      coordinationPlanFingerprint: raw.coordinationPlanFingerprint,
      taskId: raw.taskId,
      authorizationObservation: raw.authorizationObservation,
      executionObservation: raw.executionObservation,
      resultValidationObservation: raw.resultValidationObservation,
      executionAuthorizationRef: raw.executionAuthorizationRef as string | null,
      executionAttemptId: raw.executionAttemptId as string | null,
      executionOutcomeRef: raw.executionOutcomeRef as string | null,
      resultValidationRef: raw.resultValidationRef as string | null,
      dependencyEvaluation: raw.dependencyEvaluation,
      resourceConcurrencyEvaluation: raw.resourceConcurrencyEvaluation,
      acceptedCancellationRequest: cancellation,
    },
  };
}

function progressionPlanTaskBindingIsValid(
  input: CoordinationProgressionInputV1,
  binding: CoordinationPlanBindingV1,
): boolean {
  return (
    bindingMatches(binding, input.coordinationId, input.coordinationPlanFingerprint) &&
    binding.plan.taskRefs.some((task) => task.taskId === input.taskId)
  );
}

function progressionCancellationBindingIsValid(
  input: CoordinationProgressionInputV1,
  binding: CoordinationPlanBindingV1,
): boolean {
  if (input.acceptedCancellationRequest === null) return true;
  const parsed = parseCoordinationCancellationRequestV1(
    input.acceptedCancellationRequest,
    binding,
  );
  if (!parsed.ok) return false;
  return parsed.value.targetScope !== "TASK" || parsed.value.targetTaskId === input.taskId;
}

export function parseCoordinationProgressionInputV1(
  raw: unknown,
  binding?: CoordinationPlanBindingV1,
): CoordinationParseResultV1<CoordinationProgressionInputV1> {
  const parsed = parseCoordinationProgressionEnvelopeV1(raw);
  if (!parsed.ok) return parsed;
  const input = parsed.value;

  if (binding) {
    if (!progressionPlanTaskBindingIsValid(input, binding)) {
      return { ok: false, reason: "REJECTED_BINDING" };
    }
    if (!progressionCancellationBindingIsValid(input, binding)) {
      return { ok: false, reason: "REJECTED_BINDING" };
    }
  }

  if (
    !authorizationExecutionCombinationIsValid(
      input.authorizationObservation,
      input.executionObservation,
    ) ||
    !executionResultCombinationIsValid(
      input.executionObservation,
      input.resultValidationObservation,
    ) ||
    !refsAreConsistent(input)
  ) {
    return { ok: false, reason: "REJECTED_CONTRADICTION" };
  }

  return { ok: true, value: input };
}

function progressionDecision(
  input: Pick<CoordinationProgressionInputV1, "coordinationId" | "coordinationPlanFingerprint" | "taskId">,
  coordinationProgressionStatus: CoordinationProgressionStatusV1,
  coordinationProgressionReason: CoordinationProgressionReasonV1,
): CoordinationProgressionDecisionV1 {
  return {
    schemaVersion: MULTI_AGENT_COORDINATION_PROGRESSION_DECISION_SCHEMA,
    coordinationId: input.coordinationId,
    coordinationPlanFingerprint: input.coordinationPlanFingerprint,
    taskId: input.taskId,
    coordinationProgressionStatus,
    coordinationProgressionReason,
  };
}

function observationContradictionDecision(
  input: CoordinationProgressionInputV1,
): CoordinationProgressionDecisionV1 {
  return progressionDecision(input, "UNKNOWN", "OBSERVATION_CONTRADICTION");
}

export function evaluateCoordinationProgressionV1(
  raw: unknown,
  binding: CoordinationPlanBindingV1,
):
  | { ok: true; decision: CoordinationProgressionDecisionV1 }
  | { ok: false; reason: "REJECTED_SCHEMA" } {
  const parsedEnvelope = parseCoordinationProgressionEnvelopeV1(raw);
  if (!parsedEnvelope.ok) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }
  const input = parsedEnvelope.value;

  if (!progressionPlanTaskBindingIsValid(input, binding)) {
    return { ok: true, decision: observationContradictionDecision(input) };
  }
  if (!refsAreConsistent(input)) {
    return { ok: true, decision: observationContradictionDecision(input) };
  }
  if (
    !authorizationExecutionCombinationIsValid(
      input.authorizationObservation,
      input.executionObservation,
    )
  ) {
    return { ok: true, decision: observationContradictionDecision(input) };
  }
  if (
    !executionResultCombinationIsValid(
      input.executionObservation,
      input.resultValidationObservation,
    )
  ) {
    return { ok: true, decision: observationContradictionDecision(input) };
  }
  if (!progressionCancellationBindingIsValid(input, binding)) {
    return { ok: true, decision: observationContradictionDecision(input) };
  }

  const decision = (
    status: CoordinationProgressionStatusV1,
    reason: CoordinationProgressionReasonV1,
  ) => ({ ok: true as const, decision: progressionDecision(input, status, reason) });

  if (input.executionObservation === "EXECUTION_UNKNOWN") {
    return decision("UNKNOWN", "EXECUTION_UNKNOWN");
  }
  if (
    input.executionObservation === "EXECUTION_SUCCEEDED" &&
    input.resultValidationObservation === "RESULT_UNKNOWN"
  ) {
    return decision("UNKNOWN", "RESULT_UNKNOWN");
  }
  if (input.executionObservation === "EXECUTION_FAILED") {
    return decision("FAILED", "EXECUTION_FAILED");
  }
  if (
    input.executionObservation === "EXECUTION_SUCCEEDED" &&
    input.resultValidationObservation === "RESULT_INVALID"
  ) {
    return decision("FAILED", "RESULT_INVALID");
  }
  if (
    input.executionObservation === "EXECUTION_SUCCEEDED" &&
    input.resultValidationObservation === "RESULT_VALID"
  ) {
    return decision("SUCCEEDED", "EXECUTION_AND_RESULT_VALID");
  }
  if (
    input.executionObservation === "EXECUTION_SUCCEEDED" &&
    input.resultValidationObservation === "NOT_REQUIRED"
  ) {
    return decision("SUCCEEDED", "EXECUTION_VALIDATION_NOT_REQUIRED");
  }
  if (
    input.executionObservation === "EXECUTION_SUCCEEDED" &&
    input.resultValidationObservation === "NOT_EVALUATED"
  ) {
    return decision("RUNNING", "RESULT_VALIDATION_PENDING");
  }
  if (input.executionObservation === "RUNNING") {
    return decision("RUNNING", "EXECUTION_RUNNING");
  }
  if (
    input.authorizationObservation === "DENIED" &&
    input.executionObservation === "NOT_INVOKED"
  ) {
    return decision("NOT_EXECUTED", "AUTHORIZATION_DENIED");
  }
  if (
    input.acceptedCancellationRequest !== null &&
    input.executionObservation === "NOT_INVOKED" &&
    input.authorizationObservation !== "DENIED"
  ) {
    return decision("CANCELLED", "CANCELLATION_ACCEPTED");
  }
  if (input.dependencyEvaluation === "BLOCKED") {
    return decision("HOLD", "DEPENDENCY_BLOCKED");
  }
  if (
    input.authorizationObservation === "HOLD" &&
    input.executionObservation === "NOT_INVOKED"
  ) {
    return decision("HOLD", "AUTHORIZATION_HOLD");
  }
  if (
    input.authorizationObservation === "UNKNOWN" &&
    input.executionObservation === "NOT_INVOKED"
  ) {
    return decision("HOLD", "AUTHORIZATION_UNKNOWN");
  }
  if (input.dependencyEvaluation === "PENDING") {
    return decision("WAITING_DEPENDENCY", "DEPENDENCY_PENDING");
  }
  if (input.resourceConcurrencyEvaluation === "WAIT") {
    return decision("WAITING_RESOURCE", "RESOURCE_WAIT");
  }
  if (
    input.authorizationObservation === "WAITING_HUMAN_GATE" &&
    input.executionObservation === "NOT_INVOKED"
  ) {
    return decision("WAITING_HUMAN_GATE", "HUMAN_GATE_WAIT");
  }
  if (
    input.authorizationObservation === "AUTHORIZED" &&
    input.executionObservation === "NOT_INVOKED" &&
    input.dependencyEvaluation === "SATISFIED" &&
    input.resourceConcurrencyEvaluation === "PASS"
  ) {
    return decision("READY", "AUTHORIZED_NOT_INVOKED");
  }
  if (
    input.authorizationObservation === "NOT_EVALUATED" &&
    input.executionObservation === "NOT_INVOKED" &&
    input.dependencyEvaluation === "SATISFIED" &&
    input.resourceConcurrencyEvaluation === "PASS"
  ) {
    return decision("READY", "READY_FOR_AUTHORIZATION");
  }
  if (input.dependencyEvaluation === null && input.resourceConcurrencyEvaluation === null) {
    return decision("PLANNED", "PLAN_ADMITTED");
  }

  return decision("UNKNOWN", "OBSERVATION_CONTRADICTION");
}

export function parseCoordinationProgressionDecisionV1(
  raw: unknown,
  binding?: CoordinationPlanBindingV1,
): CoordinationParseResultV1<CoordinationProgressionDecisionV1> {
  if (!isPlainObject(raw) || !hasExactKeys(raw, PROGRESSION_DECISION_KEYS)) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }
  if (
    raw.schemaVersion !== MULTI_AGENT_COORDINATION_PROGRESSION_DECISION_SCHEMA ||
    !isLocalId(raw.coordinationId) ||
    !isFingerprint(raw.coordinationPlanFingerprint) ||
    !isAgentTaskId(raw.taskId) ||
    !includesValue(PROGRESSION_STATUSES, raw.coordinationProgressionStatus) ||
    !includesValue(PROGRESSION_REASONS, raw.coordinationProgressionReason)
  ) {
    return { ok: false, reason: "REJECTED_SCHEMA" };
  }
  if (binding) {
    if (!bindingMatches(binding, raw.coordinationId, raw.coordinationPlanFingerprint)) {
      return { ok: false, reason: "REJECTED_BINDING" };
    }
    if (!binding.plan.taskRefs.some((task) => task.taskId === raw.taskId)) {
      return { ok: false, reason: "REJECTED_BINDING" };
    }
  }
  return {
    ok: true,
    value: {
      schemaVersion: MULTI_AGENT_COORDINATION_PROGRESSION_DECISION_SCHEMA,
      coordinationId: raw.coordinationId,
      coordinationPlanFingerprint: raw.coordinationPlanFingerprint,
      taskId: raw.taskId,
      coordinationProgressionStatus: raw.coordinationProgressionStatus,
      coordinationProgressionReason: raw.coordinationProgressionReason,
    },
  };
}
