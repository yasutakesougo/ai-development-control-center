import {
  AGENT_TASK_CAPABILITIES_MAX,
  AGENT_TASK_RISK_CLASSES,
  isAgentTaskCapabilityId,
  type AgentTaskRiskClass,
} from "./agentTaskContract";
import { canonicalJson } from "./decisionFingerprint";

export const AI_WORKER_REGISTRY_SCHEMA = "AI-WORKER-REGISTRY-V1" as const;
export const AI_WORKER_AUTHORITY_SCHEMA = "AI-WORKER-AUTHORITY-V1" as const;
export const AI_WORKER_OBSERVATION_SCHEMA = "AI-WORKER-OBSERVATION-V1" as const;

export const AI_WORKER_SERVICES = [
  "CHATGPT",
  "CURSOR",
  "GITHUB_COPILOT",
  "OPENCODE",
] as const;

export const AI_WORKER_ROLES = [
  "ORCHESTRATOR",
  "PRIMARY_IMPLEMENTER",
  "REPOSITORY_ASSISTANT",
  "INDEPENDENT_REVIEWER",
  "VERIFIER",
] as const;

export const AI_WORKER_EXECUTION_MODES = [
  "ADVISORY_ONLY",
  "LOCAL_TOOL",
  "REMOTE_AGENT",
] as const;

export const AI_WORKER_SERVICE_INTEGRATION_STATES = [
  "UNCONFIGURED",
  "HOLD",
  "AVAILABLE",
  "UNKNOWN",
] as const;

export const AI_WORKER_ID_MAX = 128 as const;
export const AI_WORKER_REGISTRY_WORKERS_MAX = 32 as const;
export const AI_WORKER_ROLES_MAX = 5 as const;
export const AI_WORKER_CAPABILITIES_MAX = AGENT_TASK_CAPABILITIES_MAX;
export const AI_WORKER_EVIDENCE_REFS_MAX = 32 as const;
export const AI_WORKER_EVIDENCE_REF_MAX = 2048 as const;
export const AI_WORKER_OBSERVED_AT_MAX = 64 as const;

const WORKER_ID_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
const AUTHORITY_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

export const AI_WORKER_REGISTRY_ROOT_KEYS = ["schemaVersion", "workers"] as const;
export const AI_WORKER_AUTHORITY_KEYS = [
  "workerId",
  "service",
  "enabled",
  "roles",
  "maxRiskClass",
  "allowedCapabilities",
  "executionMode",
] as const;
export const AI_WORKER_OBSERVATION_KEYS = [
  "schemaVersion",
  "workerId",
  "workerAuthorityFingerprint",
  "serviceIntegrationState",
  "observedAt",
  "evidenceRefs",
] as const;

export type AiWorkerService = (typeof AI_WORKER_SERVICES)[number];
export type WorkerRoleV1 = (typeof AI_WORKER_ROLES)[number];
export type AiWorkerExecutionMode = (typeof AI_WORKER_EXECUTION_MODES)[number];
export type AiWorkerServiceIntegrationState =
  (typeof AI_WORKER_SERVICE_INTEGRATION_STATES)[number];

export interface WorkerAuthorityV1 {
  workerId: string;
  service: AiWorkerService;
  enabled: boolean;
  roles: WorkerRoleV1[];
  maxRiskClass: AgentTaskRiskClass;
  allowedCapabilities: string[];
  executionMode: AiWorkerExecutionMode;
}

export interface AiWorkerRegistryV1 {
  schemaVersion: typeof AI_WORKER_REGISTRY_SCHEMA;
  workers: WorkerAuthorityV1[];
}

export interface WorkerAuthorityFingerprintFactsV1 {
  schemaVersion: typeof AI_WORKER_AUTHORITY_SCHEMA;
  workerId: string;
  service: AiWorkerService;
  enabled: boolean;
  roles: WorkerRoleV1[];
  maxRiskClass: AgentTaskRiskClass;
  allowedCapabilities: string[];
  executionMode: AiWorkerExecutionMode;
}

export interface AiWorkerRegistryFingerprintFactsV1 {
  schemaVersion: typeof AI_WORKER_REGISTRY_SCHEMA;
  workers: WorkerAuthorityFingerprintFactsV1[];
}

export interface WorkerObservationV1 {
  schemaVersion: typeof AI_WORKER_OBSERVATION_SCHEMA;
  workerId: string;
  workerAuthorityFingerprint: string;
  serviceIntegrationState: AiWorkerServiceIntegrationState;
  observedAt: string;
  evidenceRefs: string[];
}

export type WorkerObservationBindingStatus = "BOUND" | "HOLD";

export interface WorkerObservationBindingResultV1 {
  status: WorkerObservationBindingStatus;
  reasonCode:
    | "BOUND"
    | "HOLD_WORKER_NOT_REGISTERED"
    | "HOLD_WORKER_AUTHORITY_MISMATCH";
  workerId: string;
  currentWorkerAuthorityFingerprint: string | null;
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

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function isWorkerId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= AI_WORKER_ID_MAX &&
    WORKER_ID_PATTERN.test(value)
  );
}

function isService(value: unknown): value is AiWorkerService {
  return (AI_WORKER_SERVICES as readonly unknown[]).includes(value);
}

function isRole(value: unknown): value is WorkerRoleV1 {
  return (AI_WORKER_ROLES as readonly unknown[]).includes(value);
}

function isRiskClass(value: unknown): value is AgentTaskRiskClass {
  return (AGENT_TASK_RISK_CLASSES as readonly unknown[]).includes(value);
}

function isExecutionMode(value: unknown): value is AiWorkerExecutionMode {
  return (AI_WORKER_EXECUTION_MODES as readonly unknown[]).includes(value);
}

function isServiceIntegrationState(
  value: unknown,
): value is AiWorkerServiceIntegrationState {
  return (AI_WORKER_SERVICE_INTEGRATION_STATES as readonly unknown[]).includes(
    value,
  );
}

function isAuthorityFingerprint(value: unknown): value is string {
  return (
    typeof value === "string" && AUTHORITY_FINGERPRINT_PATTERN.test(value)
  );
}

function parseWorkerAuthority(value: unknown):
  | { ok: true; worker: WorkerAuthorityV1 }
  | { ok: false; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return { ok: false, reasonMessage: "worker must be a JSON object." };
  }
  if (!hasOnlyKeys(value, AI_WORKER_AUTHORITY_KEYS)) {
    return {
      ok: false,
      reasonMessage:
        "worker contains unknown properties (additionalProperties forbidden).",
    };
  }
  if (!isWorkerId(value.workerId)) {
    return { ok: false, reasonMessage: "workerId is missing or malformed." };
  }
  if (!isService(value.service)) {
    return { ok: false, reasonMessage: "service is missing or unsupported." };
  }
  if (typeof value.enabled !== "boolean") {
    return { ok: false, reasonMessage: "enabled must be boolean." };
  }
  if (
    !Array.isArray(value.roles) ||
    value.roles.length < 1 ||
    value.roles.length > AI_WORKER_ROLES_MAX ||
    !value.roles.every(isRole)
  ) {
    return { ok: false, reasonMessage: "roles is missing or malformed." };
  }
  if (hasDuplicates(value.roles as string[])) {
    return { ok: false, reasonMessage: "roles contains duplicate entries." };
  }
  if (!isRiskClass(value.maxRiskClass)) {
    return {
      ok: false,
      reasonMessage: `maxRiskClass must be one of ${AGENT_TASK_RISK_CLASSES.join(", ")}.`,
    };
  }
  if (
    !Array.isArray(value.allowedCapabilities) ||
    value.allowedCapabilities.length > AI_WORKER_CAPABILITIES_MAX ||
    !value.allowedCapabilities.every(isAgentTaskCapabilityId)
  ) {
    return {
      ok: false,
      reasonMessage:
        "allowedCapabilities contains malformed capability identifiers.",
    };
  }
  if (hasDuplicates(value.allowedCapabilities as string[])) {
    return {
      ok: false,
      reasonMessage: "allowedCapabilities contains duplicate entries.",
    };
  }
  if (!isExecutionMode(value.executionMode)) {
    return {
      ok: false,
      reasonMessage: "executionMode is missing or unsupported.",
    };
  }

  return {
    ok: true,
    worker: {
      workerId: value.workerId,
      service: value.service,
      enabled: value.enabled,
      roles: [...(value.roles as WorkerRoleV1[])],
      maxRiskClass: value.maxRiskClass,
      allowedCapabilities: [...(value.allowedCapabilities as string[])],
      executionMode: value.executionMode,
    },
  };
}

/** Structural fail-closed parser. Registry presence grants no execution authority. */
export function parseAiWorkerRegistryV1(value: unknown):
  | { ok: true; registry: AiWorkerRegistryV1 }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "AI worker registry must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, AI_WORKER_REGISTRY_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "AI worker registry contains unknown properties (additionalProperties forbidden).",
    };
  }
  if (value.schemaVersion !== AI_WORKER_REGISTRY_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `schemaVersion must be ${AI_WORKER_REGISTRY_SCHEMA}.`,
    };
  }
  if (
    !Array.isArray(value.workers) ||
    value.workers.length < 1 ||
    value.workers.length > AI_WORKER_REGISTRY_WORKERS_MAX
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `workers length must be between 1 and ${AI_WORKER_REGISTRY_WORKERS_MAX}.`,
    };
  }

  const workers: WorkerAuthorityV1[] = [];
  for (const rawWorker of value.workers) {
    const parsed = parseWorkerAuthority(rawWorker);
    if (!parsed.ok) {
      return {
        ok: false,
        reasonCode: "REJECTED_SCHEMA",
        reasonMessage: parsed.reasonMessage,
      };
    }
    workers.push(parsed.worker);
  }

  if (hasDuplicates(workers.map((worker) => worker.workerId))) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "workers contains duplicate workerId values.",
    };
  }

  return {
    ok: true,
    registry: {
      schemaVersion: AI_WORKER_REGISTRY_SCHEMA,
      workers,
    },
  };
}

/** Structural fail-closed parser for mutable worker/service evidence. */
export function parseWorkerObservationV1(value: unknown):
  | { ok: true; observation: WorkerObservationV1 }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Worker observation must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, AI_WORKER_OBSERVATION_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "Worker observation contains unknown properties (additionalProperties forbidden).",
    };
  }
  if (value.schemaVersion !== AI_WORKER_OBSERVATION_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `schemaVersion must be ${AI_WORKER_OBSERVATION_SCHEMA}.`,
    };
  }
  if (!isWorkerId(value.workerId)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "workerId is missing or malformed.",
    };
  }
  if (!isAuthorityFingerprint(value.workerAuthorityFingerprint)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "workerAuthorityFingerprint must be exactly 64 lowercase hexadecimal characters.",
    };
  }
  if (!isServiceIntegrationState(value.serviceIntegrationState)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "serviceIntegrationState is missing or unsupported.",
    };
  }
  if (
    typeof value.observedAt !== "string" ||
    value.observedAt.length < 1 ||
    value.observedAt.length > AI_WORKER_OBSERVED_AT_MAX
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "observedAt is missing or malformed.",
    };
  }
  if (
    !Array.isArray(value.evidenceRefs) ||
    value.evidenceRefs.length > AI_WORKER_EVIDENCE_REFS_MAX ||
    !value.evidenceRefs.every(
      (ref) =>
        typeof ref === "string" &&
        ref.length >= 1 &&
        ref.length <= AI_WORKER_EVIDENCE_REF_MAX,
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "evidenceRefs contains malformed entries.",
    };
  }
  if (hasDuplicates(value.evidenceRefs as string[])) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "evidenceRefs contains duplicate entries.",
    };
  }

  return {
    ok: true,
    observation: {
      schemaVersion: AI_WORKER_OBSERVATION_SCHEMA,
      workerId: value.workerId,
      workerAuthorityFingerprint: value.workerAuthorityFingerprint,
      serviceIntegrationState: value.serviceIntegrationState,
      observedAt: value.observedAt,
      evidenceRefs: [...(value.evidenceRefs as string[])],
    },
  };
}

/** Authority-only facts. Set-like arrays are sorted after duplicate rejection. */
export function captureWorkerAuthorityFingerprintFacts(
  worker: WorkerAuthorityV1,
): WorkerAuthorityFingerprintFactsV1 {
  return {
    schemaVersion: AI_WORKER_AUTHORITY_SCHEMA,
    workerId: worker.workerId,
    service: worker.service,
    enabled: worker.enabled,
    roles: [...worker.roles].sort(),
    maxRiskClass: worker.maxRiskClass,
    allowedCapabilities: [...worker.allowedCapabilities].sort(),
    executionMode: worker.executionMode,
  };
}

export function captureAiWorkerRegistryFingerprintFacts(
  registry: AiWorkerRegistryV1,
): AiWorkerRegistryFingerprintFactsV1 {
  return {
    schemaVersion: AI_WORKER_REGISTRY_SCHEMA,
    workers: [...registry.workers]
      .sort((a, b) => a.workerId.localeCompare(b.workerId))
      .map(captureWorkerAuthorityFingerprintFacts),
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

export async function computeWorkerAuthorityFingerprint(
  worker: WorkerAuthorityV1,
): Promise<string> {
  return sha256Canonical(captureWorkerAuthorityFingerprintFacts(worker));
}

export async function computeAiWorkerRegistryAuthorityFingerprint(
  registry: AiWorkerRegistryV1,
): Promise<string> {
  return sha256Canonical(captureAiWorkerRegistryFingerprintFacts(registry));
}

/**
 * Bind mutable observation evidence to the exact current worker authority.
 * BOUND means binding only; it never means routing or execution is authorized.
 */
export async function validateWorkerObservationBinding(
  registry: AiWorkerRegistryV1,
  observation: WorkerObservationV1,
): Promise<WorkerObservationBindingResultV1> {
  const worker = registry.workers.find(
    (candidate) => candidate.workerId === observation.workerId,
  );
  if (!worker) {
    return {
      status: "HOLD",
      reasonCode: "HOLD_WORKER_NOT_REGISTERED",
      workerId: observation.workerId,
      currentWorkerAuthorityFingerprint: null,
    };
  }

  const currentWorkerAuthorityFingerprint =
    await computeWorkerAuthorityFingerprint(worker);
  if (
    observation.workerAuthorityFingerprint !== currentWorkerAuthorityFingerprint
  ) {
    return {
      status: "HOLD",
      reasonCode: "HOLD_WORKER_AUTHORITY_MISMATCH",
      workerId: observation.workerId,
      currentWorkerAuthorityFingerprint,
    };
  }

  return {
    status: "BOUND",
    reasonCode: "BOUND",
    workerId: observation.workerId,
    currentWorkerAuthorityFingerprint,
  };
}
