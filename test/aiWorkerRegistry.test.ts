import { describe, expect, it } from "vitest";
import {
  AGENT_TASK_RISK_CLASSES,
  isAgentTaskCapabilityId,
  parseAgentTaskV1,
} from "../src/domain/agentTaskContract";
import {
  AI_WORKER_AUTHORITY_SCHEMA,
  AI_WORKER_CAPABILITIES_MAX,
  AI_WORKER_OBSERVATION_SCHEMA,
  AI_WORKER_REGISTRY_SCHEMA,
  AI_WORKER_REGISTRY_WORKERS_MAX,
  AI_WORKER_ROLES,
  captureAiWorkerRegistryFingerprintFacts,
  captureWorkerAuthorityFingerprintFacts,
  computeAiWorkerRegistryAuthorityFingerprint,
  computeWorkerAuthorityFingerprint,
  parseAiWorkerRegistryV1,
  parseWorkerObservationV1,
  validateWorkerObservationBinding,
  type AiWorkerRegistryV1,
  type WorkerAuthorityV1,
} from "../src/domain/aiWorkerRegistry";

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

function registry(workers: WorkerAuthorityV1[] = [worker()]): AiWorkerRegistryV1 {
  return {
    schemaVersion: AI_WORKER_REGISTRY_SCHEMA,
    workers,
  };
}

function validAgentTask(capability: string) {
  return {
    schemaVersion: "AGENT-TASK-V1",
    taskId: "ai-worker-registry-capability-regression",
    repository: "yasutakesougo/ai-development-control-center",
    baseRevision: "c9c8fd838c3a11fa71f68d256f94b3fc54155ce1",
    sourceIssue: {
      repository: "yasutakesougo/ai-development-control-center",
      number: 87,
    },
    objective: "Regression-check the shared capability-id predicate.",
    allowedPaths: ["src/domain/"],
    forbiddenPaths: [".github/workflows/"],
    acceptanceCriteria: ["Capability grammar remains unchanged."],
    verificationCommands: [],
    allowedCapabilities: [capability],
    riskClass: "R1",
    stopAt: "DRAFT_PR",
  };
}

describe("AI-WORKER-REGISTRY-V1", () => {
  it("parses the exact registry shape", () => {
    const parsed = parseAiWorkerRegistryV1(registry());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.registry.schemaVersion).toBe(AI_WORKER_REGISTRY_SCHEMA);
    expect(parsed.registry.workers).toHaveLength(1);
  });

  it("fails closed on unknown registry and worker keys", () => {
    expect(
      parseAiWorkerRegistryV1({ ...registry(), extra: true }).ok,
    ).toBe(false);
    expect(
      parseAiWorkerRegistryV1(
        registry([{ ...worker(), extra: true } as unknown as WorkerAuthorityV1]),
      ).ok,
    ).toBe(false);
  });

  it("rejects malformed and duplicate worker ids", () => {
    expect(
      parseAiWorkerRegistryV1(registry([worker({ workerId: "Cursor Primary" })])).ok,
    ).toBe(false);
    expect(
      parseAiWorkerRegistryV1(registry([worker(), worker()])).ok,
    ).toBe(false);
  });

  it("enforces worker and set bounds without silent repair", () => {
    const tooManyWorkers = Array.from(
      { length: AI_WORKER_REGISTRY_WORKERS_MAX + 1 },
      (_, index) => worker({ workerId: `worker-${index}` }),
    );
    expect(parseAiWorkerRegistryV1(registry(tooManyWorkers)).ok).toBe(false);

    expect(
      parseAiWorkerRegistryV1(
        registry([worker({ roles: ["PRIMARY_IMPLEMENTER", "PRIMARY_IMPLEMENTER"] })]),
      ).ok,
    ).toBe(false);

    expect(
      parseAiWorkerRegistryV1(
        registry([
          worker({
            allowedCapabilities: ["workspace.read.v1", "workspace.read.v1"],
          }),
        ]),
      ).ok,
    ).toBe(false);

    expect(
      parseAiWorkerRegistryV1(
        registry([
          worker({
            allowedCapabilities: Array.from(
              { length: AI_WORKER_CAPABILITIES_MAX + 1 },
              (_, index) => `workspace.capability-${index}.v1`,
            ),
          }),
        ]),
      ).ok,
    ).toBe(false);
  });

  it("reuses AgentTask risk semantics", () => {
    expect(AGENT_TASK_RISK_CLASSES).toEqual(["R0", "R1", "R2", "R3", "R4", "R5"]);
    for (const riskClass of AGENT_TASK_RISK_CLASSES) {
      expect(parseAiWorkerRegistryV1(registry([worker({ maxRiskClass: riskClass })])).ok).toBe(
        true,
      );
    }
    expect(
      parseAiWorkerRegistryV1(
        registry([worker({ maxRiskClass: "R9" as WorkerAuthorityV1["maxRiskClass"] })]),
      ).ok,
    ).toBe(false);
  });

  it("exports the existing AgentTask capability grammar without drift", () => {
    const valid = [
      "workspace.read.v1",
      "workspace.write.v1",
      "github.draft-pr.publish.v1",
    ];
    const invalid = ["agent.execute", "github.write", "Workspace.read.v1", "workspace.read"];

    for (const capability of valid) {
      expect(isAgentTaskCapabilityId(capability)).toBe(true);
      expect(parseAgentTaskV1(validAgentTask(capability)).ok).toBe(true);
      expect(
        parseAiWorkerRegistryV1(
          registry([worker({ allowedCapabilities: [capability] })]),
        ).ok,
      ).toBe(true);
    }

    for (const capability of invalid) {
      expect(isAgentTaskCapabilityId(capability)).toBe(false);
      expect(parseAgentTaskV1(validAgentTask(capability)).ok).toBe(false);
      expect(
        parseAiWorkerRegistryV1(
          registry([worker({ allowedCapabilities: [capability] })]),
        ).ok,
      ).toBe(false);
    }
  });

  it("uses explicit worker and registry fingerprint domains", () => {
    const facts = captureWorkerAuthorityFingerprintFacts(worker());
    expect(facts.schemaVersion).toBe(AI_WORKER_AUTHORITY_SCHEMA);

    const registryFacts = captureAiWorkerRegistryFingerprintFacts(registry());
    expect(registryFacts.schemaVersion).toBe(AI_WORKER_REGISTRY_SCHEMA);
  });

  it("normalizes only set ordering for worker fingerprints", async () => {
    const left = worker({
      roles: ["VERIFIER", "PRIMARY_IMPLEMENTER"],
      allowedCapabilities: ["workspace.write.v1", "workspace.read.v1"],
    });
    const right = worker({
      roles: ["PRIMARY_IMPLEMENTER", "VERIFIER"],
      allowedCapabilities: ["workspace.read.v1", "workspace.write.v1"],
    });

    const leftFingerprint = await computeWorkerAuthorityFingerprint(left);
    const rightFingerprint = await computeWorkerAuthorityFingerprint(right);
    expect(leftFingerprint).toBe(rightFingerprint);
    expect(leftFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("makes registry fingerprint independent of worker ordering", async () => {
    const chatgpt = worker({
      workerId: "chatgpt-default",
      service: "CHATGPT",
      roles: ["ORCHESTRATOR"],
      executionMode: "ADVISORY_ONLY",
      allowedCapabilities: [],
    });
    const cursor = worker();

    const left = await computeAiWorkerRegistryAuthorityFingerprint(
      registry([chatgpt, cursor]),
    );
    const right = await computeAiWorkerRegistryAuthorityFingerprint(
      registry([cursor, chatgpt]),
    );

    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not confuse worker and registry fingerprints", async () => {
    const workerFingerprint = await computeWorkerAuthorityFingerprint(worker());
    const registryFingerprint = await computeAiWorkerRegistryAuthorityFingerprint(registry());
    expect(workerFingerprint).not.toBe(registryFingerprint);
  });

  it("changes worker fingerprint when authority changes", async () => {
    const before = await computeWorkerAuthorityFingerprint(worker());
    const after = await computeWorkerAuthorityFingerprint(worker({ maxRiskClass: "R3" }));
    expect(after).not.toBe(before);
  });

  it("parses bounded mutable observation evidence", async () => {
    const fingerprint = await computeWorkerAuthorityFingerprint(worker());
    const parsed = parseWorkerObservationV1({
      schemaVersion: AI_WORKER_OBSERVATION_SCHEMA,
      workerId: "cursor-primary",
      workerAuthorityFingerprint: fingerprint,
      serviceIntegrationState: "AVAILABLE",
      observedAt: "2026-08-25T09:49:00+09:00",
      evidenceRefs: ["evidence://cursor/session/1"],
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects malformed observation fingerprint and duplicate evidence", () => {
    const base = {
      schemaVersion: AI_WORKER_OBSERVATION_SCHEMA,
      workerId: "cursor-primary",
      workerAuthorityFingerprint: "a".repeat(64),
      serviceIntegrationState: "AVAILABLE",
      observedAt: "2026-08-25T09:49:00+09:00",
      evidenceRefs: ["evidence://one"],
    };

    expect(
      parseWorkerObservationV1({
        ...base,
        workerAuthorityFingerprint: "A".repeat(64),
      }).ok,
    ).toBe(false);
    expect(
      parseWorkerObservationV1({
        ...base,
        evidenceRefs: ["evidence://one", "evidence://one"],
      }).ok,
    ).toBe(false);
    expect(parseWorkerObservationV1({ ...base, extra: true }).ok).toBe(false);
  });

  it("binds observation only to the exact current worker authority", async () => {
    const current = worker();
    const currentRegistry = registry([current]);
    const fingerprint = await computeWorkerAuthorityFingerprint(current);
    const parsed = parseWorkerObservationV1({
      schemaVersion: AI_WORKER_OBSERVATION_SCHEMA,
      workerId: current.workerId,
      workerAuthorityFingerprint: fingerprint,
      serviceIntegrationState: "AVAILABLE",
      observedAt: "2026-08-25T09:49:00+09:00",
      evidenceRefs: [],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const bound = await validateWorkerObservationBinding(
      currentRegistry,
      parsed.observation,
    );
    expect(bound.status).toBe("BOUND");
    expect(bound.reasonCode).toBe("BOUND");

    const changedRegistry = registry([worker({ maxRiskClass: "R3" })]);
    const stale = await validateWorkerObservationBinding(
      changedRegistry,
      parsed.observation,
    );
    expect(stale.status).toBe("HOLD");
    expect(stale.reasonCode).toBe("HOLD_WORKER_AUTHORITY_MISMATCH");
  });

  it("holds observations for workers missing from the current registry", async () => {
    const fingerprint = await computeWorkerAuthorityFingerprint(worker());
    const parsed = parseWorkerObservationV1({
      schemaVersion: AI_WORKER_OBSERVATION_SCHEMA,
      workerId: "cursor-primary",
      workerAuthorityFingerprint: fingerprint,
      serviceIntegrationState: "AVAILABLE",
      observedAt: "2026-08-25T09:49:00+09:00",
      evidenceRefs: [],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const otherRegistry = registry([
      worker({
        workerId: "chatgpt-default",
        service: "CHATGPT",
        roles: ["ORCHESTRATOR"],
        allowedCapabilities: [],
        executionMode: "ADVISORY_ONLY",
      }),
    ]);
    const result = await validateWorkerObservationBinding(
      otherRegistry,
      parsed.observation,
    );
    expect(result.status).toBe("HOLD");
    expect(result.reasonCode).toBe("HOLD_WORKER_NOT_REGISTERED");
  });

  it("keeps mutable observation data outside authority identity", async () => {
    const before = await computeAiWorkerRegistryAuthorityFingerprint(registry());
    const workerFingerprint = await computeWorkerAuthorityFingerprint(worker());

    const available = parseWorkerObservationV1({
      schemaVersion: AI_WORKER_OBSERVATION_SCHEMA,
      workerId: "cursor-primary",
      workerAuthorityFingerprint: workerFingerprint,
      serviceIntegrationState: "AVAILABLE",
      observedAt: "2026-08-25T09:49:00+09:00",
      evidenceRefs: ["evidence://available"],
    });
    const hold = parseWorkerObservationV1({
      schemaVersion: AI_WORKER_OBSERVATION_SCHEMA,
      workerId: "cursor-primary",
      workerAuthorityFingerprint: workerFingerprint,
      serviceIntegrationState: "HOLD",
      observedAt: "2026-08-25T10:49:00+09:00",
      evidenceRefs: ["evidence://hold"],
    });
    expect(available.ok).toBe(true);
    expect(hold.ok).toBe(true);

    const after = await computeAiWorkerRegistryAuthorityFingerprint(registry());
    expect(after).toBe(before);
  });

  it("does not add execution or mutation authority to registry or AVAILABLE evidence", async () => {
    const parsedRegistry = parseAiWorkerRegistryV1(registry());
    expect(parsedRegistry.ok).toBe(true);
    if (!parsedRegistry.ok) return;

    const fingerprint = await computeWorkerAuthorityFingerprint(worker());
    const parsedObservation = parseWorkerObservationV1({
      schemaVersion: AI_WORKER_OBSERVATION_SCHEMA,
      workerId: "cursor-primary",
      workerAuthorityFingerprint: fingerprint,
      serviceIntegrationState: "AVAILABLE",
      observedAt: "2026-08-25T09:49:00+09:00",
      evidenceRefs: [],
    });
    expect(parsedObservation.ok).toBe(true);
    if (!parsedObservation.ok) return;

    for (const value of [parsedRegistry.registry, parsedObservation.observation]) {
      expect("executionAuthorized" in value).toBe(false);
      expect("githubMutationAuthorized" in value).toBe(false);
      expect("readyAuthorized" in value).toBe(false);
      expect("mergeAuthorized" in value).toBe(false);
      expect("deployAuthorized" in value).toBe(false);
    }
  });

  it("keeps the role vocabulary bounded to five routing-intent values", () => {
    expect(AI_WORKER_ROLES).toEqual([
      "ORCHESTRATOR",
      "PRIMARY_IMPLEMENTER",
      "REPOSITORY_ASSISTANT",
      "INDEPENDENT_REVIEWER",
      "VERIFIER",
    ]);
  });
});
