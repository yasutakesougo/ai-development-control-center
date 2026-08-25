import {
  AGENT_TASK_RISK_CLASSES,
  parseAgentTaskV1,
  validateAgentTaskV1,
  type AgentTaskConstraints,
  type AgentTaskRiskClass,
  type AgentTaskSourceIssue,
  type AgentTaskStopAt,
  type AgentTaskValidationResultV1,
  type AgentTaskVerificationCommand,
  type AgentTaskV1,
} from "./agentTaskContract";
import {
  AI_WORKER_EXECUTION_MODES,
  AI_WORKER_OBSERVATION_SCHEMA,
  AI_WORKER_REGISTRY_SCHEMA,
  AI_WORKER_ROLES,
  computeAiWorkerRegistryAuthorityFingerprint,
  computeWorkerAuthorityFingerprint,
  parseAiWorkerRegistryV1,
  parseWorkerObservationV1,
  validateWorkerObservationBinding,
  type AiWorkerExecutionMode,
  type AiWorkerRegistryV1,
  type WorkerAuthorityV1,
  type WorkerObservationV1,
  type WorkerRoleV1,
} from "./aiWorkerRegistry";
import { canonicalJson } from "./decisionFingerprint";

export const WORKER_ROUTING_INPUT_SCHEMA = "WORKER-ROUTING-INPUT-V1" as const;
export const WORKER_ROUTING_DECISION_SCHEMA = "WORKER-ROUTING-DECISION-V1" as const;
export const WORKER_ROUTING_TASK_BINDING_SCHEMA =
  "WORKER-ROUTING-TASK-BINDING-V1" as const;
export const WORKER_ROUTING_DECISION_FINGERPRINT_SCHEMA =
  "WORKER-ROUTING-DECISION-FINGERPRINT-V1" as const;

export const WORKER_ROUTING_OBSERVATIONS_MAX = 32 as const;
export const WORKER_ROUTING_TIMESTAMP_MAX = 64 as const;
export const WORKER_ROUTING_MAX_OBSERVATION_AGE_SECONDS = 86_400 as const;

/** Routing remains selection-only. */
export const WORKER_ROUTING_PROVIDER_INVOCATION_IMPLEMENTED = false as const;
export const WORKER_ROUTING_GITHUB_MUTATION_IMPLEMENTED = false as const;
export const WORKER_ROUTING_READY_IMPLEMENTED = false as const;
export const WORKER_ROUTING_MERGE_IMPLEMENTED = false as const;
export const WORKER_ROUTING_DEPLOY_IMPLEMENTED = false as const;
export const WORKER_ROUTING_BUDGET_POLICY_IMPLEMENTED = false as const;

export const WORKER_ROUTING_ROOT_KEYS = [
  "schemaVersion",
  "task",
  "registry",
  "observations",
  "intent",
  "expectedRegistryAuthorityFingerprint",
  "evaluatedAt",
  "maxObservationAgeSeconds",
] as const;

export const WORKER_ROUTING_INTENT_KEYS = [
  "requiredRole",
  "requiredExecutionMode",
] as const;

const AUTHORITY_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const STRICT_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;

export type WorkerRoutingStatusV1 = "SELECTED" | "HOLD" | "REJECT";

export type WorkerRoutingReasonCodeV1 =
  | "SELECTED"
  | "REJECTED_SCHEMA"
  | "REJECTED_TASK_SCHEMA"
  | "REJECTED_TASK_INVALID"
  | "REJECTED_REGISTRY_SCHEMA"
  | "REJECTED_OBSERVATION_SCHEMA"
  | "HOLD_TASK_VALIDATION"
  | "HOLD_TASK_VALIDATION_UNKNOWN"
  | "HOLD_REGISTRY_AUTHORITY_MISMATCH"
  | "HOLD_NO_ELIGIBLE_WORKER";

export type WorkerRoutingCandidateReasonV1 =
  | "INELIGIBLE_DISABLED"
  | "INELIGIBLE_ROLE_MISMATCH"
  | "INELIGIBLE_EXECUTION_MODE_MISMATCH"
  | "INELIGIBLE_RISK_EXCEEDED"
  | "INELIGIBLE_CAPABILITY_MISMATCH"
  | "INELIGIBLE_OBSERVATION_MISSING"
  | "INELIGIBLE_OBSERVATION_AUTHORITY_MISMATCH"
  | "INELIGIBLE_OBSERVATION_NOT_AVAILABLE"
  | "INELIGIBLE_OBSERVATION_TIMESTAMP_INVALID"
  | "INELIGIBLE_OBSERVATION_FROM_FUTURE"
  | "INELIGIBLE_OBSERVATION_STALE";

export interface WorkerRoutingIntentV1 {
  requiredRole: WorkerRoleV1;
  requiredExecutionMode: AiWorkerExecutionMode;
}

export interface WorkerRoutingInputV1 {
  schemaVersion: typeof WORKER_ROUTING_INPUT_SCHEMA;
  task: AgentTaskV1;
  registry: AiWorkerRegistryV1;
  observations: WorkerObservationV1[];
  intent: WorkerRoutingIntentV1;
  expectedRegistryAuthorityFingerprint: string;
  evaluatedAt: string;
  maxObservationAgeSeconds: number;
}

export interface WorkerRoutingTaskBindingFactsV1 {
  schemaVersion: typeof WORKER_ROUTING_TASK_BINDING_SCHEMA;
  taskId: string;
  repository: string;
  baseRevision: string;
  sourceIssue: AgentTaskSourceIssue;
  objective: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  acceptanceCriteria: string[];
  verificationCommands: AgentTaskVerificationCommand[];
  allowedCapabilities: string[];
  riskClass: AgentTaskRiskClass;
  stopAt: AgentTaskStopAt;
  constraints?: AgentTaskConstraints;
}

export interface WorkerRoutingCandidateEvaluationV1 {
  workerId: string;
  workerAuthorityFingerprint: string;
  status: "ELIGIBLE" | "INELIGIBLE";
  reasonCodes: WorkerRoutingCandidateReasonV1[];
  riskHeadroom: number | null;
  extraCapabilityCount: number | null;
}

export interface WorkerRoutingDecisionFingerprintFactsV1 {
  schemaVersion: typeof WORKER_ROUTING_DECISION_FINGERPRINT_SCHEMA;
  taskRoutingFingerprint: string;
  registryAuthorityFingerprint: string;
  requiredRole: WorkerRoleV1;
  requiredExecutionMode: AiWorkerExecutionMode;
  maxObservationAgeSeconds: number;
  evaluatedAt: string;
  selectedWorkerId: string;
  selectedWorkerAuthorityFingerprint: string;
  selectedObservation: WorkerObservationV1;
}

export interface WorkerRoutingDecisionV1 {
  schemaVersion: typeof WORKER_ROUTING_DECISION_SCHEMA;
  status: WorkerRoutingStatusV1;
  reasonCode: WorkerRoutingReasonCodeV1;
  taskId: string | null;
  taskRoutingFingerprint: string | null;
  taskValidation: AgentTaskValidationResultV1 | null;
  registryAuthorityFingerprint: string | null;
  requiredRole: WorkerRoleV1 | null;
  requiredExecutionMode: AiWorkerExecutionMode | null;
  maxObservationAgeSeconds: number | null;
  selectedWorkerId: string | null;
  selectedWorkerAuthorityFingerprint: string | null;
  selectedObservation: WorkerObservationV1 | null;
  routingDecisionFingerprint: string | null;
  candidateEvaluations: WorkerRoutingCandidateEvaluationV1[];
  evaluatedAt: string | null;
}

interface StrictTimestamp {
  raw: string;
  epochMs: number;
}

interface ParsedRoutingEnvelope {
  rawTask: unknown;
  rawRegistry: unknown;
  rawObservations: unknown[];
  intent: WorkerRoutingIntentV1;
  expectedRegistryAuthorityFingerprint: string;
  evaluatedAt: StrictTimestamp;
  maxObservationAgeSeconds: number;
}

interface EvaluatedCandidate {
  worker: WorkerAuthorityV1;
  observation: WorkerObservationV1 | null;
  evaluation: WorkerRoutingCandidateEvaluationV1;
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

function hasAllKeys(
  value: Record<string, unknown>,
  required: readonly string[],
): boolean {
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isWorkerRole(value: unknown): value is WorkerRoleV1 {
  return (AI_WORKER_ROLES as readonly unknown[]).includes(value);
}

function isExecutionMode(value: unknown): value is AiWorkerExecutionMode {
  return (AI_WORKER_EXECUTION_MODES as readonly unknown[]).includes(value);
}

function compareLexical(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

/** Strict timestamp parser for routing freshness. No silent normalization. */
export function parseWorkerRoutingTimestamp(value: unknown): StrictTimestamp | null {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > WORKER_ROUTING_TIMESTAMP_MAX
  ) {
    return null;
  }

  const match = STRICT_TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "";
  const zone = match[8];
  const offsetSign = match[9];
  const offsetHour = match[10] === undefined ? 0 : Number(match[10]);
  const offsetMinute = match[11] === undefined ? 0 : Number(match[11]);

  if (year < 1 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;
  if (offsetHour < 0 || offsetHour > 23) return null;
  if (offsetMinute < 0 || offsetMinute > 59) return null;

  const millisecond = fraction.length === 0 ? 0 : Number(fraction.padEnd(3, "0"));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  const localEpochMs = date.getTime();
  if (!Number.isFinite(localEpochMs)) return null;

  let offsetMinutes = 0;
  if (zone !== "Z") {
    const magnitude = offsetHour * 60 + offsetMinute;
    offsetMinutes = offsetSign === "+" ? magnitude : -magnitude;
  }

  return {
    raw: value,
    epochMs: localEpochMs - offsetMinutes * 60_000,
  };
}

function baseDecision(
  status: WorkerRoutingStatusV1,
  reasonCode: WorkerRoutingReasonCodeV1,
  values: Partial<WorkerRoutingDecisionV1> = {},
): WorkerRoutingDecisionV1 {
  return {
    schemaVersion: WORKER_ROUTING_DECISION_SCHEMA,
    status,
    reasonCode,
    taskId: null,
    taskRoutingFingerprint: null,
    taskValidation: null,
    registryAuthorityFingerprint: null,
    requiredRole: null,
    requiredExecutionMode: null,
    maxObservationAgeSeconds: null,
    selectedWorkerId: null,
    selectedWorkerAuthorityFingerprint: null,
    selectedObservation: null,
    routingDecisionFingerprint: null,
    candidateEvaluations: [],
    evaluatedAt: null,
    ...values,
  };
}

function parseRoutingEnvelope(rawInput: unknown):
  | { ok: true; envelope: ParsedRoutingEnvelope }
  | { ok: false; decision: WorkerRoutingDecisionV1 } {
  if (
    !isPlainObject(rawInput) ||
    !hasOnlyKeys(rawInput, WORKER_ROUTING_ROOT_KEYS) ||
    !hasAllKeys(rawInput, WORKER_ROUTING_ROOT_KEYS)
  ) {
    return { ok: false, decision: baseDecision("REJECT", "REJECTED_SCHEMA") };
  }
  if (rawInput.schemaVersion !== WORKER_ROUTING_INPUT_SCHEMA) {
    return { ok: false, decision: baseDecision("REJECT", "REJECTED_SCHEMA") };
  }

  if (
    !isPlainObject(rawInput.intent) ||
    !hasOnlyKeys(rawInput.intent, WORKER_ROUTING_INTENT_KEYS) ||
    !isWorkerRole(rawInput.intent.requiredRole) ||
    !isExecutionMode(rawInput.intent.requiredExecutionMode)
  ) {
    return { ok: false, decision: baseDecision("REJECT", "REJECTED_SCHEMA") };
  }
  const intent: WorkerRoutingIntentV1 = {
    requiredRole: rawInput.intent.requiredRole,
    requiredExecutionMode: rawInput.intent.requiredExecutionMode,
  };

  if (
    typeof rawInput.expectedRegistryAuthorityFingerprint !== "string" ||
    !AUTHORITY_FINGERPRINT_PATTERN.test(rawInput.expectedRegistryAuthorityFingerprint)
  ) {
    return {
      ok: false,
      decision: baseDecision("REJECT", "REJECTED_SCHEMA", {
        requiredRole: intent.requiredRole,
        requiredExecutionMode: intent.requiredExecutionMode,
      }),
    };
  }

  if (
    typeof rawInput.maxObservationAgeSeconds !== "number" ||
    !Number.isInteger(rawInput.maxObservationAgeSeconds) ||
    rawInput.maxObservationAgeSeconds < 1 ||
    rawInput.maxObservationAgeSeconds > WORKER_ROUTING_MAX_OBSERVATION_AGE_SECONDS
  ) {
    return {
      ok: false,
      decision: baseDecision("REJECT", "REJECTED_SCHEMA", {
        requiredRole: intent.requiredRole,
        requiredExecutionMode: intent.requiredExecutionMode,
      }),
    };
  }

  const evaluatedAt = parseWorkerRoutingTimestamp(rawInput.evaluatedAt);
  if (!evaluatedAt) {
    return {
      ok: false,
      decision: baseDecision("REJECT", "REJECTED_SCHEMA", {
        requiredRole: intent.requiredRole,
        requiredExecutionMode: intent.requiredExecutionMode,
        maxObservationAgeSeconds: rawInput.maxObservationAgeSeconds,
      }),
    };
  }

  if (
    !Array.isArray(rawInput.observations) ||
    rawInput.observations.length > WORKER_ROUTING_OBSERVATIONS_MAX
  ) {
    return {
      ok: false,
      decision: baseDecision("REJECT", "REJECTED_SCHEMA", {
        requiredRole: intent.requiredRole,
        requiredExecutionMode: intent.requiredExecutionMode,
        maxObservationAgeSeconds: rawInput.maxObservationAgeSeconds,
        evaluatedAt: evaluatedAt.raw,
      }),
    };
  }

  return {
    ok: true,
    envelope: {
      rawTask: rawInput.task,
      rawRegistry: rawInput.registry,
      rawObservations: rawInput.observations,
      intent,
      expectedRegistryAuthorityFingerprint: rawInput.expectedRegistryAuthorityFingerprint,
      evaluatedAt,
      maxObservationAgeSeconds: rawInput.maxObservationAgeSeconds,
    },
  };
}

export function captureWorkerRoutingTaskBindingFacts(
  task: AgentTaskV1,
): WorkerRoutingTaskBindingFactsV1 {
  return {
    schemaVersion: WORKER_ROUTING_TASK_BINDING_SCHEMA,
    taskId: task.taskId,
    repository: task.repository,
    baseRevision: task.baseRevision,
    sourceIssue: task.sourceIssue,
    objective: task.objective,
    allowedPaths: [...task.allowedPaths],
    forbiddenPaths: [...task.forbiddenPaths],
    acceptanceCriteria: [...task.acceptanceCriteria],
    verificationCommands: task.verificationCommands.map((command) => ({ ...command })),
    allowedCapabilities: [...task.allowedCapabilities],
    riskClass: task.riskClass,
    stopAt: task.stopAt,
    constraints: task.constraints === undefined ? undefined : { ...task.constraints },
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

export async function computeWorkerRoutingTaskFingerprint(
  task: AgentTaskV1,
): Promise<string> {
  return sha256Canonical(captureWorkerRoutingTaskBindingFacts(task));
}

export function captureWorkerRoutingDecisionFingerprintFacts(input: {
  taskRoutingFingerprint: string;
  registryAuthorityFingerprint: string;
  requiredRole: WorkerRoleV1;
  requiredExecutionMode: AiWorkerExecutionMode;
  maxObservationAgeSeconds: number;
  evaluatedAt: string;
  selectedWorkerId: string;
  selectedWorkerAuthorityFingerprint: string;
  selectedObservation: WorkerObservationV1;
}): WorkerRoutingDecisionFingerprintFactsV1 {
  return {
    schemaVersion: WORKER_ROUTING_DECISION_FINGERPRINT_SCHEMA,
    taskRoutingFingerprint: input.taskRoutingFingerprint,
    registryAuthorityFingerprint: input.registryAuthorityFingerprint,
    requiredRole: input.requiredRole,
    requiredExecutionMode: input.requiredExecutionMode,
    maxObservationAgeSeconds: input.maxObservationAgeSeconds,
    evaluatedAt: input.evaluatedAt,
    selectedWorkerId: input.selectedWorkerId,
    selectedWorkerAuthorityFingerprint: input.selectedWorkerAuthorityFingerprint,
    selectedObservation: input.selectedObservation,
  };
}

export async function computeWorkerRoutingDecisionFingerprint(
  facts: WorkerRoutingDecisionFingerprintFactsV1,
): Promise<string> {
  return sha256Canonical(facts);
}

function riskIndex(riskClass: AgentTaskRiskClass): number {
  return AGENT_TASK_RISK_CLASSES.indexOf(riskClass);
}

function hasCapabilitySubset(task: AgentTaskV1, worker: WorkerAuthorityV1): boolean {
  const workerCapabilities = new Set(worker.allowedCapabilities);
  return task.allowedCapabilities.every((capability) => workerCapabilities.has(capability));
}

function extraCapabilityCount(task: AgentTaskV1, worker: WorkerAuthorityV1): number {
  const taskCapabilities = new Set(task.allowedCapabilities);
  return worker.allowedCapabilities.filter((capability) => !taskCapabilities.has(capability)).length;
}

async function evaluateCandidate(input: {
  task: AgentTaskV1;
  worker: WorkerAuthorityV1;
  observation: WorkerObservationV1 | null;
  evaluatedAt: StrictTimestamp;
  maxObservationAgeSeconds: number;
  intent: WorkerRoutingIntentV1;
}): Promise<EvaluatedCandidate> {
  const reasons: WorkerRoutingCandidateReasonV1[] = [];
  const taskRiskIndex = riskIndex(input.task.riskClass);
  const workerRiskIndex = riskIndex(input.worker.maxRiskClass);
  const workerAuthorityFingerprint = await computeWorkerAuthorityFingerprint(input.worker);

  if (!input.worker.enabled) reasons.push("INELIGIBLE_DISABLED");
  if (!input.worker.roles.includes(input.intent.requiredRole)) {
    reasons.push("INELIGIBLE_ROLE_MISMATCH");
  }
  if (input.worker.executionMode !== input.intent.requiredExecutionMode) {
    reasons.push("INELIGIBLE_EXECUTION_MODE_MISMATCH");
  }
  if (taskRiskIndex > workerRiskIndex) reasons.push("INELIGIBLE_RISK_EXCEEDED");
  if (!hasCapabilitySubset(input.task, input.worker)) {
    reasons.push("INELIGIBLE_CAPABILITY_MISMATCH");
  }

  if (!input.observation) {
    reasons.push("INELIGIBLE_OBSERVATION_MISSING");
  } else {
    const binding = await validateWorkerObservationBinding(
      { schemaVersion: AI_WORKER_REGISTRY_SCHEMA, workers: [input.worker] },
      input.observation,
    );
    if (binding.status !== "BOUND") {
      reasons.push("INELIGIBLE_OBSERVATION_AUTHORITY_MISMATCH");
    }
    if (input.observation.serviceIntegrationState !== "AVAILABLE") {
      reasons.push("INELIGIBLE_OBSERVATION_NOT_AVAILABLE");
    }

    const observedAt = parseWorkerRoutingTimestamp(input.observation.observedAt);
    if (!observedAt) {
      reasons.push("INELIGIBLE_OBSERVATION_TIMESTAMP_INVALID");
    } else if (observedAt.epochMs > input.evaluatedAt.epochMs) {
      reasons.push("INELIGIBLE_OBSERVATION_FROM_FUTURE");
    } else if (
      input.evaluatedAt.epochMs - observedAt.epochMs >
      input.maxObservationAgeSeconds * 1000
    ) {
      reasons.push("INELIGIBLE_OBSERVATION_STALE");
    }
  }

  return {
    worker: input.worker,
    observation: input.observation,
    evaluation: {
      workerId: input.worker.workerId,
      workerAuthorityFingerprint,
      status: reasons.length === 0 ? "ELIGIBLE" : "INELIGIBLE",
      reasonCodes: reasons,
      riskHeadroom: workerRiskIndex - taskRiskIndex,
      extraCapabilityCount: extraCapabilityCount(input.task, input.worker),
    },
  };
}

function rankEligible(a: EvaluatedCandidate, b: EvaluatedCandidate): number {
  const riskDiff =
    (a.evaluation.riskHeadroom ?? Number.MAX_SAFE_INTEGER) -
    (b.evaluation.riskHeadroom ?? Number.MAX_SAFE_INTEGER);
  if (riskDiff !== 0) return riskDiff;

  const capabilityDiff =
    (a.evaluation.extraCapabilityCount ?? Number.MAX_SAFE_INTEGER) -
    (b.evaluation.extraCapabilityCount ?? Number.MAX_SAFE_INTEGER);
  if (capabilityDiff !== 0) return capabilityDiff;

  return compareLexical(a.worker.workerId, b.worker.workerId);
}

/**
 * Deterministic worker selection only. Never invokes providers or authorizes execution.
 */
export async function routeWorkerV1(rawInput: unknown): Promise<WorkerRoutingDecisionV1> {
  const parsedEnvelope = parseRoutingEnvelope(rawInput);
  if (!parsedEnvelope.ok) return parsedEnvelope.decision;
  const envelope = parsedEnvelope.envelope;

  const common = {
    requiredRole: envelope.intent.requiredRole,
    requiredExecutionMode: envelope.intent.requiredExecutionMode,
    maxObservationAgeSeconds: envelope.maxObservationAgeSeconds,
    evaluatedAt: envelope.evaluatedAt.raw,
  };

  const parsedTask = parseAgentTaskV1(envelope.rawTask);
  if (!parsedTask.ok) {
    return baseDecision("REJECT", "REJECTED_TASK_SCHEMA", common);
  }

  const taskValidation = validateAgentTaskV1(parsedTask.task, {
    validatedAt: envelope.evaluatedAt.raw,
    treatPrefixOverlapAsHold: true,
  });

  const taskCommon = {
    ...common,
    taskId: parsedTask.task.taskId,
    taskValidation,
  };

  if (taskValidation.status === "INVALID") {
    return baseDecision("REJECT", "REJECTED_TASK_INVALID", taskCommon);
  }
  if (taskValidation.status === "HOLD") {
    return baseDecision("HOLD", "HOLD_TASK_VALIDATION", taskCommon);
  }
  if (taskValidation.status === "UNKNOWN") {
    return baseDecision("HOLD", "HOLD_TASK_VALIDATION_UNKNOWN", taskCommon);
  }

  const taskRoutingFingerprint = await computeWorkerRoutingTaskFingerprint(parsedTask.task);
  const validatedTaskCommon = { ...taskCommon, taskRoutingFingerprint };

  const parsedRegistry = parseAiWorkerRegistryV1(envelope.rawRegistry);
  if (!parsedRegistry.ok) {
    return baseDecision("REJECT", "REJECTED_REGISTRY_SCHEMA", validatedTaskCommon);
  }

  const observations: WorkerObservationV1[] = [];
  for (const rawObservation of envelope.rawObservations) {
    const parsedObservation = parseWorkerObservationV1(rawObservation);
    if (!parsedObservation.ok) {
      return baseDecision("REJECT", "REJECTED_OBSERVATION_SCHEMA", validatedTaskCommon);
    }
    observations.push(parsedObservation.observation);
  }
  if (
    new Set(observations.map((observation) => observation.workerId)).size !==
    observations.length
  ) {
    return baseDecision("REJECT", "REJECTED_OBSERVATION_SCHEMA", validatedTaskCommon);
  }

  const registryAuthorityFingerprint =
    await computeAiWorkerRegistryAuthorityFingerprint(parsedRegistry.registry);
  const registryCommon = {
    ...validatedTaskCommon,
    registryAuthorityFingerprint,
  };

  if (registryAuthorityFingerprint !== envelope.expectedRegistryAuthorityFingerprint) {
    return baseDecision("HOLD", "HOLD_REGISTRY_AUTHORITY_MISMATCH", registryCommon);
  }

  const observationByWorkerId = new Map(
    observations.map((observation) => [observation.workerId, observation] as const),
  );

  const evaluatedCandidates = await Promise.all(
    parsedRegistry.registry.workers.map((worker) =>
      evaluateCandidate({
        task: parsedTask.task,
        worker,
        observation: observationByWorkerId.get(worker.workerId) ?? null,
        evaluatedAt: envelope.evaluatedAt,
        maxObservationAgeSeconds: envelope.maxObservationAgeSeconds,
        intent: envelope.intent,
      }),
    ),
  );

  evaluatedCandidates.sort((a, b) => compareLexical(a.worker.workerId, b.worker.workerId));
  const candidateEvaluations = evaluatedCandidates.map((candidate) => candidate.evaluation);
  const eligible = evaluatedCandidates
    .filter((candidate) => candidate.evaluation.status === "ELIGIBLE")
    .sort(rankEligible);

  if (eligible.length === 0) {
    return baseDecision("HOLD", "HOLD_NO_ELIGIBLE_WORKER", {
      ...registryCommon,
      candidateEvaluations,
    });
  }

  const selected = eligible[0];
  if (!selected.observation) {
    return baseDecision("HOLD", "HOLD_NO_ELIGIBLE_WORKER", {
      ...registryCommon,
      candidateEvaluations,
    });
  }

  const selectedObservation: WorkerObservationV1 = selected.observation;

  const fingerprintFacts = captureWorkerRoutingDecisionFingerprintFacts({
    taskRoutingFingerprint,
    registryAuthorityFingerprint,
    requiredRole: envelope.intent.requiredRole,
    requiredExecutionMode: envelope.intent.requiredExecutionMode,
    maxObservationAgeSeconds: envelope.maxObservationAgeSeconds,
    evaluatedAt: envelope.evaluatedAt.raw,
    selectedWorkerId: selected.worker.workerId,
    selectedWorkerAuthorityFingerprint: selected.evaluation.workerAuthorityFingerprint,
    selectedObservation,
  });
  const routingDecisionFingerprint =
    await computeWorkerRoutingDecisionFingerprint(fingerprintFacts);

  return baseDecision("SELECTED", "SELECTED", {
    ...registryCommon,
    selectedWorkerId: selected.worker.workerId,
    selectedWorkerAuthorityFingerprint: selected.evaluation.workerAuthorityFingerprint,
    selectedObservation,
    routingDecisionFingerprint,
    candidateEvaluations,
  });
}
