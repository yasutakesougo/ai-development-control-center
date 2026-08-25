import { describe, expect, it } from "vitest";
import type { AgentTaskV1 } from "../src/domain/agentTaskContract";
import {
  AI_WORKER_OBSERVATION_SCHEMA,
  AI_WORKER_REGISTRY_SCHEMA,
  computeAiWorkerRegistryAuthorityFingerprint,
  computeWorkerAuthorityFingerprint,
  type AiWorkerRegistryV1,
  type WorkerAuthorityV1,
  type WorkerObservationV1,
} from "../src/domain/aiWorkerRegistry";
import {
  WORKER_ROUTING_BUDGET_POLICY_IMPLEMENTED,
  WORKER_ROUTING_DEPLOY_IMPLEMENTED,
  WORKER_ROUTING_GITHUB_MUTATION_IMPLEMENTED,
  WORKER_ROUTING_MERGE_IMPLEMENTED,
  WORKER_ROUTING_PROVIDER_INVOCATION_IMPLEMENTED,
  WORKER_ROUTING_READY_IMPLEMENTED,
  computeWorkerRoutingDecisionFingerprint,
  computeWorkerRoutingTaskFingerprint,
  parseWorkerRoutingTimestamp,
  routeWorkerV1,
  type WorkerRoutingInputV1,
} from "../src/domain/workerRouting";

const BASE_SHA = "0d596eb57a200f622cb139d5754fba8a5a434ebd";
const EVALUATED_AT = "2026-08-25T17:27:00+09:00";

function task(overrides: Partial<AgentTaskV1> = {}): AgentTaskV1 {
  return {
    schemaVersion: "AGENT-TASK-V1",
    taskId: "worker-routing-v1-test",
    repository: "yasutakesougo/ai-development-control-center",
    baseRevision: BASE_SHA,
    sourceIssue: {
      repository: "yasutakesougo/ai-development-control-center",
      number: 91,
    },
    objective: "Route one bounded implementation task.",
    allowedPaths: ["src/domain/workerRouting.ts"],
    forbiddenPaths: [".github/workflows"],
    acceptanceCriteria: ["Select only an eligible registered worker."],
    verificationCommands: [],
    allowedCapabilities: ["workspace.read.v1"],
    riskClass: "R1",
    stopAt: "VERIFY_COMPLETE",
    ...overrides,
  };
}

function worker(overrides: Partial<WorkerAuthorityV1> = {}): WorkerAuthorityV1 {
  return {
    workerId: "cursor-primary",
    service: "CURSOR",
    enabled: true,
    roles: ["PRIMARY_IMPLEMENTER"],
    maxRiskClass: "R2",
    allowedCapabilities: ["workspace.read.v1", "workspace.write.v1"],
    executionMode: "LOCAL_TOOL",
    ...overrides,
  };
}

function registry(workers: WorkerAuthorityV1[]): AiWorkerRegistryV1 {
  return { schemaVersion: AI_WORKER_REGISTRY_SCHEMA, workers };
}

async function observation(
  targetWorker: WorkerAuthorityV1,
  overrides: Partial<WorkerObservationV1> = {},
): Promise<WorkerObservationV1> {
  return {
    schemaVersion: AI_WORKER_OBSERVATION_SCHEMA,
    workerId: targetWorker.workerId,
    workerAuthorityFingerprint: await computeWorkerAuthorityFingerprint(targetWorker),
    serviceIntegrationState: "AVAILABLE",
    observedAt: "2026-08-25T17:26:30+09:00",
    evidenceRefs: ["evidence://worker-routing/test"],
    ...overrides,
  };
}

async function input(
  workers: WorkerAuthorityV1[],
  observations: WorkerObservationV1[],
  overrides: Partial<WorkerRoutingInputV1> = {},
): Promise<WorkerRoutingInputV1> {
  const value = registry(workers);
  return {
    schemaVersion: "WORKER-ROUTING-INPUT-V1",
    task: task(),
    registry: value,
    observations,
    intent: {
      requiredRole: "PRIMARY_IMPLEMENTER",
      requiredExecutionMode: "LOCAL_TOOL",
    },
    expectedRegistryAuthorityFingerprint:
      await computeAiWorkerRegistryAuthorityFingerprint(value),
    evaluatedAt: EVALUATED_AT,
    maxObservationAgeSeconds: 300,
    ...overrides,
  };
}

describe("WORKER-ROUTING-V1", () => {
  it("keeps all mutation and provider surfaces disabled", () => {
    expect(WORKER_ROUTING_PROVIDER_INVOCATION_IMPLEMENTED).toBe(false);
    expect(WORKER_ROUTING_GITHUB_MUTATION_IMPLEMENTED).toBe(false);
    expect(WORKER_ROUTING_READY_IMPLEMENTED).toBe(false);
    expect(WORKER_ROUTING_MERGE_IMPLEMENTED).toBe(false);
    expect(WORKER_ROUTING_DEPLOY_IMPLEMENTED).toBe(false);
    expect(WORKER_ROUTING_BUDGET_POLICY_IMPLEMENTED).toBe(false);
  });

  it("parses the strict timestamp subset without silent calendar repair", () => {
    expect(parseWorkerRoutingTimestamp("2026-08-25T17:27:00Z")).not.toBeNull();
    expect(parseWorkerRoutingTimestamp("0004-02-29T00:00:00.1Z")).not.toBeNull();
    expect(parseWorkerRoutingTimestamp("2026-08-25T17:27:00.123+09:00")).not.toBeNull();
    expect(parseWorkerRoutingTimestamp("2026-02-30T12:00:00Z")).toBeNull();
    expect(parseWorkerRoutingTimestamp("2026-08-25t17:27:00Z")).toBeNull();
    expect(parseWorkerRoutingTimestamp("2026-08-25T17:27:60Z")).toBeNull();
    expect(parseWorkerRoutingTimestamp("2026-08-25T17:27:00.1234Z")).toBeNull();
  });

  it("rejects malformed routing root and never invents evaluatedAt", async () => {
    const result = await routeWorkerV1({
      schemaVersion: "WORKER-ROUTING-INPUT-V1",
      unexpected: true,
    });
    expect(result.status).toBe("REJECT");
    expect(result.reasonCode).toBe("REJECTED_SCHEMA");
    expect(result.evaluatedAt).toBeNull();
  });

  it("rejects semantic INVALID tasks before candidate evaluation", async () => {
    const target = worker();
    const base = await input([target], [await observation(target)]);
    const result = await routeWorkerV1({
      ...base,
      task: task({
        sourceIssue: {
          repository: "yasutakesougo/other-repository",
          number: 91,
        },
      }),
    });

    expect(result.status).toBe("REJECT");
    expect(result.reasonCode).toBe("REJECTED_TASK_INVALID");
    expect(result.taskValidation?.status).toBe("INVALID");
    expect(result.candidateEvaluations).toEqual([]);
  });

  it("HOLDs semantic task ambiguity before candidate evaluation", async () => {
    const target = worker();
    const base = await input([target], [await observation(target)]);
    const result = await routeWorkerV1({
      ...base,
      task: task({
        allowedPaths: ["src"],
        forbiddenPaths: ["src/domain"],
      }),
    });

    expect(result.status).toBe("HOLD");
    expect(result.reasonCode).toBe("HOLD_TASK_VALIDATION");
    expect(result.taskValidation?.status).toBe("HOLD");
    expect(result.candidateEvaluations).toEqual([]);
  });

  it("HOLDs when the expected registry authority fingerprint is stale", async () => {
    const target = worker();
    const base = await input([target], [await observation(target)]);
    const result = await routeWorkerV1({
      ...base,
      expectedRegistryAuthorityFingerprint: "a".repeat(64),
    });

    expect(result.status).toBe("HOLD");
    expect(result.reasonCode).toBe("HOLD_REGISTRY_AUTHORITY_MISMATCH");
    expect(result.registryAuthorityFingerprint).not.toBe("a".repeat(64));
    expect(result.candidateEvaluations).toEqual([]);
  });

  it("selects a worker only when role, mode, risk, capability, binding and freshness pass", async () => {
    const target = worker({ maxRiskClass: "R1", allowedCapabilities: ["workspace.read.v1"] });
    const selectedObservation = await observation(target);
    const result = await routeWorkerV1(await input([target], [selectedObservation]));

    expect(result.status).toBe("SELECTED");
    expect(result.reasonCode).toBe("SELECTED");
    expect(result.selectedWorkerId).toBe("cursor-primary");
    expect(result.selectedObservation).toEqual(selectedObservation);
    expect(result.taskValidation?.status).toBe("VALID");
    expect(result.taskRoutingFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.routingDecisionFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.candidateEvaluations[0]?.status).toBe("ELIGIBLE");
  });

  it("fails closed for missing, unavailable, future and stale observations", async () => {
    const target = worker();

    const missing = await routeWorkerV1(await input([target], []));
    expect(missing.reasonCode).toBe("HOLD_NO_ELIGIBLE_WORKER");
    expect(missing.candidateEvaluations[0]?.reasonCodes).toContain(
      "INELIGIBLE_OBSERVATION_MISSING",
    );

    const unavailable = await routeWorkerV1(
      await input(
        [target],
        [await observation(target, { serviceIntegrationState: "UNKNOWN" })],
      ),
    );
    expect(unavailable.candidateEvaluations[0]?.reasonCodes).toContain(
      "INELIGIBLE_OBSERVATION_NOT_AVAILABLE",
    );

    const future = await routeWorkerV1(
      await input(
        [target],
        [await observation(target, { observedAt: "2026-08-25T17:27:01+09:00" })],
      ),
    );
    expect(future.candidateEvaluations[0]?.reasonCodes).toContain(
      "INELIGIBLE_OBSERVATION_FROM_FUTURE",
    );

    const stale = await routeWorkerV1(
      await input(
        [target],
        [await observation(target, { observedAt: "2026-08-25T17:21:59+09:00" })],
      ),
    );
    expect(stale.candidateEvaluations[0]?.reasonCodes).toContain(
      "INELIGIBLE_OBSERVATION_STALE",
    );
  });

  it("treats the exact TTL boundary as fresh", async () => {
    const target = worker();
    const result = await routeWorkerV1(
      await input(
        [target],
        [await observation(target, { observedAt: "2026-08-25T17:22:00+09:00" })],
      ),
    );
    expect(result.status).toBe("SELECTED");
  });

  it("uses subset semantics for risk and capabilities", async () => {
    const target = worker({
      maxRiskClass: "R0",
      allowedCapabilities: ["workspace.write.v1"],
    });
    const result = await routeWorkerV1(await input([target], [await observation(target)]));
    expect(result.status).toBe("HOLD");
    expect(result.candidateEvaluations[0]?.reasonCodes).toEqual(
      expect.arrayContaining([
        "INELIGIBLE_RISK_EXCEEDED",
        "INELIGIBLE_CAPABILITY_MISMATCH",
      ]),
    );
  });

  it("ranks multiple eligible workers by least risk, least capability surplus, then lexical workerId", async () => {
    const alpha = worker({
      workerId: "alpha-worker",
      service: "OPENCODE",
      maxRiskClass: "R1",
      allowedCapabilities: ["workspace.read.v1"],
    });
    const beta = worker({
      workerId: "beta-worker",
      maxRiskClass: "R1",
      allowedCapabilities: ["workspace.read.v1"],
    });
    const broader = worker({
      workerId: "broader-worker",
      maxRiskClass: "R1",
      allowedCapabilities: ["workspace.read.v1", "workspace.write.v1"],
    });
    const higherRisk = worker({
      workerId: "higher-risk-worker",
      maxRiskClass: "R2",
      allowedCapabilities: ["workspace.read.v1"],
    });
    const workers = [higherRisk, broader, beta, alpha];
    const observations = await Promise.all(workers.map((item) => observation(item)));

    const result = await routeWorkerV1(await input(workers, observations));
    expect(result.status).toBe("SELECTED");
    expect(result.selectedWorkerId).toBe("alpha-worker");
    expect(result.candidateEvaluations.map((item) => item.workerId)).toEqual([
      "alpha-worker",
      "beta-worker",
      "broader-worker",
      "higher-risk-worker",
    ]);
  });

  it("excludes task metadata from the routing task fingerprint but preserves task array order", async () => {
    const left = task({
      metadata: { createdAt: "2026-08-25T00:00:00Z", notes: ["left"] },
    });
    const right = task({
      metadata: { createdAt: "2026-08-25T01:00:00Z", notes: ["right"] },
    });
    expect(await computeWorkerRoutingTaskFingerprint(left)).toBe(
      await computeWorkerRoutingTaskFingerprint(right),
    );

    const ordered = task({
      allowedCapabilities: ["workspace.read.v1", "workspace.write.v1"],
    });
    const reversed = task({
      allowedCapabilities: ["workspace.write.v1", "workspace.read.v1"],
    });
    expect(await computeWorkerRoutingTaskFingerprint(ordered)).not.toBe(
      await computeWorkerRoutingTaskFingerprint(reversed),
    );
  });

  it("emits a reproducible selected-decision fingerprint", async () => {
    const target = worker({ maxRiskClass: "R1", allowedCapabilities: ["workspace.read.v1"] });
    const result = await routeWorkerV1(
      await input([target], [await observation(target)]),
    );
    expect(result.status).toBe("SELECTED");
    if (
      result.taskRoutingFingerprint === null ||
      result.registryAuthorityFingerprint === null ||
      result.requiredRole === null ||
      result.requiredExecutionMode === null ||
      result.maxObservationAgeSeconds === null ||
      result.evaluatedAt === null ||
      result.selectedWorkerId === null ||
      result.selectedWorkerAuthorityFingerprint === null ||
      result.selectedObservation === null
    ) {
      throw new Error("SELECTED decision omitted required binding facts");
    }

    const recomputed = await computeWorkerRoutingDecisionFingerprint({
      schemaVersion: "WORKER-ROUTING-DECISION-FINGERPRINT-V1",
      taskRoutingFingerprint: result.taskRoutingFingerprint,
      registryAuthorityFingerprint: result.registryAuthorityFingerprint,
      requiredRole: result.requiredRole,
      requiredExecutionMode: result.requiredExecutionMode,
      maxObservationAgeSeconds: result.maxObservationAgeSeconds,
      evaluatedAt: result.evaluatedAt,
      selectedWorkerId: result.selectedWorkerId,
      selectedWorkerAuthorityFingerprint: result.selectedWorkerAuthorityFingerprint,
      selectedObservation: result.selectedObservation,
    });
    expect(recomputed).toBe(result.routingDecisionFingerprint);
  });
});
