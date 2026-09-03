import { describe, expect, it } from "vitest";
import type { AgentTaskV1 } from "../src/domain/agentTaskContract";
import { computeWorkerRoutingTaskFingerprint } from "../src/domain/workerRouting";
import * as coordinationModule from "../src/domain/multiAgentCoordination";
import {
  MULTI_AGENT_COORDINATION_CANCELLATION_SCHEMA,
  MULTI_AGENT_COORDINATION_GITHUB_MUTATION_IMPLEMENTED,
  MULTI_AGENT_COORDINATION_HARNESS_INVOCATION_IMPLEMENTED,
  MULTI_AGENT_COORDINATION_PLAN_SCHEMA,
  MULTI_AGENT_COORDINATION_PROGRESSION_DECISION_SCHEMA,
  MULTI_AGENT_COORDINATION_PROGRESSION_EVALUATOR_IMPLEMENTED,
  MULTI_AGENT_COORDINATION_PROGRESSION_INPUT_SCHEMA,
  MULTI_AGENT_COORDINATION_PROVIDER_INVOCATION_IMPLEMENTED,
  MULTI_AGENT_COORDINATION_SHARED_STATE_BINDING_IMPLEMENTED,
  MULTI_AGENT_COORDINATION_SHARED_STATE_SNAPSHOT_SCHEMA,
  captureCoordinationPlanFingerprintFacts,
  computeCoordinationPlanFingerprint,
  computeCoordinationProgressionDecisionFingerprint,
  computeCoordinationSharedStateSnapshotDigest,
  computeCoordinationTaskRoutingFingerprint,
  computeEffectiveConcurrencyCeiling,
  parseCoordinationCancellationRequestV1,
  parseCoordinationConcurrencyCeilingRefV1,
  parseCoordinationEvidenceBindingV1,
  parseCoordinationPlanV1,
  parseCoordinationProgressionDecisionV1,
  parseCoordinationProgressionInputV1,
  parseCoordinationSharedStateSnapshotV1,
  parseCoordinationTaskStateBindingV1,
  validateCoordinationSharedStateSnapshotV1,
  type CoordinationCancellationRequestV1,
  type CoordinationEvidenceBindingV1,
  type CoordinationPlanBindingV1,
  type CoordinationPlanV1,
  type CoordinationProgressionDecisionBindingV1,
  type CoordinationProgressionDecisionV1,
  type CoordinationProgressionInputV1,
  type CoordinationSharedStateSnapshotV1,
  type CoordinationTaskStateBindingV1,
} from "../src/domain/multiAgentCoordination";

const FPA = "a".repeat(64);
const FPB = "b".repeat(64);
const FPC = "c".repeat(64);

function plan(overrides: Partial<CoordinationPlanV1> = {}): CoordinationPlanV1 {
  return {
    schemaVersion: MULTI_AGENT_COORDINATION_PLAN_SCHEMA,
    coordinationId: "coordination-1",
    taskRefs: [
      {
        taskId: "task-a",
        taskRoutingFingerprint: FPA,
        dependencyTaskIds: [],
        coordinationMode: "SEQUENTIAL",
      },
    ],
    ...overrides,
  };
}

async function binding(value = plan()): Promise<CoordinationPlanBindingV1> {
  return {
    plan: value,
    coordinationPlanFingerprint: await computeCoordinationPlanFingerprint(value),
  };
}

function cancellation(
  planBinding: CoordinationPlanBindingV1,
  overrides: Partial<CoordinationCancellationRequestV1> = {},
): CoordinationCancellationRequestV1 {
  return {
    schemaVersion: MULTI_AGENT_COORDINATION_CANCELLATION_SCHEMA,
    cancellationRequestId: "cancel-1",
    source: "HUMAN_CONTROL_SURFACE",
    coordinationId: planBinding.plan.coordinationId,
    coordinationPlanFingerprint: planBinding.coordinationPlanFingerprint,
    targetScope: "TASK",
    targetTaskId: planBinding.plan.taskRefs[0].taskId,
    authorizationRef: "evidence://cancel/1",
    requestedAt: "2026-08-29T19:30:00+09:00",
    ...overrides,
  };
}

function progressionInput(
  planBinding: CoordinationPlanBindingV1,
  overrides: Partial<CoordinationProgressionInputV1> = {},
): CoordinationProgressionInputV1 {
  return {
    schemaVersion: MULTI_AGENT_COORDINATION_PROGRESSION_INPUT_SCHEMA,
    coordinationId: planBinding.plan.coordinationId,
    coordinationPlanFingerprint: planBinding.coordinationPlanFingerprint,
    taskId: planBinding.plan.taskRefs[0].taskId,
    authorizationObservation: "NOT_EVALUATED",
    executionObservation: "NOT_INVOKED",
    resultValidationObservation: "NOT_EVALUATED",
    executionAuthorizationRef: null,
    executionAttemptId: null,
    executionOutcomeRef: null,
    resultValidationRef: null,
    dependencyEvaluation: null,
    resourceConcurrencyEvaluation: null,
    acceptedCancellationRequest: null,
    ...overrides,
  };
}

function agentTask(): AgentTaskV1 {
  return {
    schemaVersion: "AGENT-TASK-V1",
    taskId: "task-a",
    repository: "yasutakesougo/ai-development-control-center",
    baseRevision: "c15dbd60fe51bcb894dc555fee5defb859d3df5f",
    sourceIssue: {
      repository: "yasutakesougo/ai-development-control-center",
      number: 111,
    },
    objective: "Synthetic coordination binding test.",
    allowedPaths: ["src/domain/multiAgentCoordination.ts"],
    forbiddenPaths: [".github/workflows"],
    acceptanceCriteria: ["Reuse the routing task binding."],
    verificationCommands: [],
    allowedCapabilities: ["workspace.read.v1"],
    riskClass: "R1",
    stopAt: "VERIFY_COMPLETE",
  };
}

describe("MULTI-AGENT-COORDINATION-V1 Slice A", () => {
  it("A01 valid minimal plan parses", () => {
    const parsed = parseCoordinationPlanV1(plan());
    expect(parsed.ok).toBe(true);
  });

  it("A02 unknown root key rejects", () => {
    expect(parseCoordinationPlanV1({ ...plan(), extra: true }).ok).toBe(false);
  });

  it("A03 malformed coordinationId rejects", () => {
    expect(parseCoordinationPlanV1({ ...plan(), coordinationId: "Coord 1" }).ok).toBe(false);
  });

  it("A04 duplicate taskId rejects", () => {
    const value = plan({
      taskRefs: [plan().taskRefs[0], { ...plan().taskRefs[0], taskRoutingFingerprint: FPB }],
    });
    expect(parseCoordinationPlanV1(value).ok).toBe(false);
  });

  it("A05 duplicate dependencyTaskId rejects", () => {
    const value = plan({
      taskRefs: [
        plan().taskRefs[0],
        {
          taskId: "task-b",
          taskRoutingFingerprint: FPB,
          dependencyTaskIds: ["task-a", "task-a"],
          coordinationMode: "SEQUENTIAL",
        },
      ],
    });
    expect(parseCoordinationPlanV1(value).ok).toBe(false);
  });

  it("A06 self dependency rejects", () => {
    const value = plan({
      taskRefs: [{ ...plan().taskRefs[0], dependencyTaskIds: ["task-a"] }],
    });
    expect(parseCoordinationPlanV1(value).ok).toBe(false);
  });

  it("A07 missing dependency target rejects", () => {
    const value = plan({
      taskRefs: [{ ...plan().taskRefs[0], dependencyTaskIds: ["task-missing"] }],
    });
    expect(parseCoordinationPlanV1(value).ok).toBe(false);
  });

  it("A08 dependency cycle rejects", () => {
    const value = plan({
      taskRefs: [
        { ...plan().taskRefs[0], dependencyTaskIds: ["task-b"] },
        {
          taskId: "task-b",
          taskRoutingFingerprint: FPB,
          dependencyTaskIds: ["task-a"],
          coordinationMode: "SEQUENTIAL",
        },
      ],
    });
    expect(parseCoordinationPlanV1(value).ok).toBe(false);
  });

  it("A09 taskRefs > max rejects", () => {
    const taskRefs = Array.from({ length: 33 }, (_, index) => ({
      taskId: `task-${index}`,
      taskRoutingFingerprint: FPA,
      dependencyTaskIds: [],
      coordinationMode: "SEQUENTIAL" as const,
    }));
    expect(parseCoordinationPlanV1(plan({ taskRefs })).ok).toBe(false);
  });

  it("A10 dependencyTaskIds > max rejects", () => {
    const dependencies = Array.from({ length: 32 }, (_, index) => `dep-${index}`);
    const taskRefs = [
      { ...plan().taskRefs[0], dependencyTaskIds: dependencies },
      ...dependencies.slice(0, 31).map((taskId) => ({
        taskId,
        taskRoutingFingerprint: FPB,
        dependencyTaskIds: [],
        coordinationMode: "SEQUENTIAL" as const,
      })),
    ];
    expect(parseCoordinationPlanV1(plan({ taskRefs })).ok).toBe(false);
  });

  it("A11 malformed taskRoutingFingerprint rejects", () => {
    const value = plan({
      taskRefs: [{ ...plan().taskRefs[0], taskRoutingFingerprint: "ABC" }],
    });
    expect(parseCoordinationPlanV1(value).ok).toBe(false);
  });

  it("A12 taskRoutingFingerprint helper reuse produces expected binding", async () => {
    const task = agentTask();
    await expect(computeCoordinationTaskRoutingFingerprint(task)).resolves.toBe(
      await computeWorkerRoutingTaskFingerprint(task),
    );
  });

  it("A13 plan fingerprint is deterministic", async () => {
    const value = plan();
    expect(await computeCoordinationPlanFingerprint(value)).toBe(
      await computeCoordinationPlanFingerprint(value),
    );
  });

  it("A14 plan fingerprint changes when identity-bearing task order changes", async () => {
    const first = plan({
      taskRefs: [
        plan().taskRefs[0],
        {
          taskId: "task-b",
          taskRoutingFingerprint: FPB,
          dependencyTaskIds: [],
          coordinationMode: "SEQUENTIAL",
        },
      ],
    });
    const second = plan({ taskRefs: [...first.taskRefs].reverse() });
    expect(await computeCoordinationPlanFingerprint(first)).not.toBe(
      await computeCoordinationPlanFingerprint(second),
    );
  });

  it("A15 plan fingerprint changes when dependency order changes", async () => {
    const common = [
      plan().taskRefs[0],
      {
        taskId: "task-b",
        taskRoutingFingerprint: FPB,
        dependencyTaskIds: [],
        coordinationMode: "SEQUENTIAL" as const,
      },
    ];
    const first = plan({
      taskRefs: [
        ...common,
        {
          taskId: "task-c",
          taskRoutingFingerprint: FPC,
          dependencyTaskIds: ["task-a", "task-b"],
          coordinationMode: "SEQUENTIAL",
        },
      ],
    });
    const second = plan({
      taskRefs: [
        ...common,
        {
          taskId: "task-c",
          taskRoutingFingerprint: FPC,
          dependencyTaskIds: ["task-b", "task-a"],
          coordinationMode: "SEQUENTIAL",
        },
      ],
    });
    expect(await computeCoordinationPlanFingerprint(first)).not.toBe(
      await computeCoordinationPlanFingerprint(second),
    );
  });

  it("A16 plan fingerprint changes when any exact fact changes", async () => {
    const first = plan();
    const second = plan({ coordinationId: "coordination-2" });
    expect(await computeCoordinationPlanFingerprint(first)).not.toBe(
      await computeCoordinationPlanFingerprint(second),
    );
  });

  it("A17 no extra field participates in fingerprint facts", () => {
    expect(Object.keys(captureCoordinationPlanFingerprintFacts(plan()))).toEqual([
      "schemaVersion",
      "coordinationId",
      "taskRefs",
    ]);
    expect(Object.keys(captureCoordinationPlanFingerprintFacts(plan()).taskRefs[0])).toEqual([
      "taskId",
      "taskRoutingFingerprint",
      "dependencyTaskIds",
      "coordinationMode",
    ]);
  });

  it("A18 cancellation envelope exact keys/bounds", async () => {
    const current = await binding();
    expect(parseCoordinationCancellationRequestV1(cancellation(current), current).ok).toBe(true);
    expect(
      parseCoordinationCancellationRequestV1({ ...cancellation(current), extra: true }, current).ok,
    ).toBe(false);
    expect(
      parseCoordinationCancellationRequestV1(
        { ...cancellation(current), cancellationRequestId: "x".repeat(129) },
        current,
      ).ok,
    ).toBe(false);
  });

  it("A19 cancellation target mismatch rejects", async () => {
    const current = await binding();
    expect(
      parseCoordinationCancellationRequestV1(
        cancellation(current, { targetTaskId: "task-other" }),
        current,
      ).ok,
    ).toBe(false);
  });

  it("A20 worker/protocol message cannot satisfy cancellation envelope", async () => {
    const current = await binding();
    expect(
      parseCoordinationCancellationRequestV1(
        { message: "cancel task-a", workerId: "worker-a" },
        current,
      ).ok,
    ).toBe(false);
  });

  it("A21 zero concurrency ceilings fail closed for concurrent eligibility", () => {
    expect(computeEffectiveConcurrencyCeiling([])).toEqual({
      status: "HOLD",
      effectiveCeiling: null,
    });
  });

  it("A22 multiple ceilings choose minimum", async () => {
    const current = await binding();
    expect(
      computeEffectiveConcurrencyCeiling(
        [
          {
            sourceId: "repo-policy",
            coordinationId: current.plan.coordinationId,
            coordinationPlanFingerprint: current.coordinationPlanFingerprint,
            ceiling: 4,
            evidenceRef: "evidence://repo-policy",
          },
          {
            sourceId: "project-policy",
            coordinationId: current.plan.coordinationId,
            coordinationPlanFingerprint: current.coordinationPlanFingerprint,
            ceiling: 2,
            evidenceRef: "evidence://project-policy",
          },
        ],
        current,
      ),
    ).toEqual({ status: "PASS", effectiveCeiling: 2 });
  });

  it("A23 invalid ceiling rejects", async () => {
    const current = await binding();
    const invalid = {
      sourceId: "repo-policy",
      coordinationId: current.plan.coordinationId,
      coordinationPlanFingerprint: current.coordinationPlanFingerprint,
      ceiling: 33,
      evidenceRef: "evidence://repo-policy",
    };
    expect(parseCoordinationConcurrencyCeilingRefV1(invalid, current).ok).toBe(false);
    expect(computeEffectiveConcurrencyCeiling([invalid], current).status).toBe("HOLD");
  });

  it("A24 progression input unknown key rejects", async () => {
    const current = await binding();
    expect(
      parseCoordinationProgressionInputV1({ ...progressionInput(current), extra: true }, current).ok,
    ).toBe(false);
  });

  it("A25 progression input plan/task binding mismatch rejects", async () => {
    const current = await binding();
    expect(
      parseCoordinationProgressionInputV1(
        { ...progressionInput(current), taskId: "task-other" },
        current,
      ).ok,
    ).toBe(false);
  });

  it("A26 authorization ref nullability matrix", async () => {
    const current = await binding();
    expect(
      parseCoordinationProgressionInputV1(
        { ...progressionInput(current), executionAuthorizationRef: "evidence://auth" },
        current,
      ).ok,
    ).toBe(false);
    expect(
      parseCoordinationProgressionInputV1(
        {
          ...progressionInput(current),
          authorizationObservation: "AUTHORIZED",
          executionAuthorizationRef: null,
        },
        current,
      ).ok,
    ).toBe(false);
    expect(
      parseCoordinationProgressionInputV1(
        {
          ...progressionInput(current),
          authorizationObservation: "AUTHORIZED",
          executionAuthorizationRef: "evidence://auth",
        },
        current,
      ).ok,
    ).toBe(true);
  });

  it("A27 execution attempt/outcome ref nullability matrix", async () => {
    const current = await binding();
    const base = {
      ...progressionInput(current),
      authorizationObservation: "AUTHORIZED" as const,
      executionAuthorizationRef: "evidence://auth",
    };
    expect(
      parseCoordinationProgressionInputV1(
        {
          ...base,
          executionObservation: "RUNNING",
          executionAttemptId: "attempt-1",
          executionOutcomeRef: null,
        },
        current,
      ).ok,
    ).toBe(true);
    expect(
      parseCoordinationProgressionInputV1(
        {
          ...base,
          executionObservation: "EXECUTION_SUCCEEDED",
          executionAttemptId: "attempt-1",
          executionOutcomeRef: null,
        },
        current,
      ).ok,
    ).toBe(false);
  });

  it("A28 result-validation ref nullability matrix including NOT_REQUIRED", async () => {
    const current = await binding();
    const base = {
      ...progressionInput(current),
      authorizationObservation: "AUTHORIZED" as const,
      executionAuthorizationRef: "evidence://auth",
      executionObservation: "EXECUTION_SUCCEEDED" as const,
      executionAttemptId: "attempt-1",
      executionOutcomeRef: "evidence://outcome",
    };
    expect(
      parseCoordinationProgressionInputV1(
        { ...base, resultValidationObservation: "NOT_REQUIRED", resultValidationRef: null },
        current,
      ).ok,
    ).toBe(false);
    expect(
      parseCoordinationProgressionInputV1(
        {
          ...base,
          resultValidationObservation: "NOT_REQUIRED",
          resultValidationRef: "evidence://validation-not-required",
        },
        current,
      ).ok,
    ).toBe(true);
  });

  it("A29 partial readiness pair rejects", async () => {
    const current = await binding();
    expect(
      parseCoordinationProgressionInputV1(
        { ...progressionInput(current), dependencyEvaluation: "SATISFIED" },
        current,
      ).ok,
    ).toBe(false);
  });

  it("A30 invalid cancellation binding in progression input rejects", async () => {
    const current = await binding();
    expect(
      parseCoordinationProgressionInputV1(
        {
          ...progressionInput(current),
          acceptedCancellationRequest: cancellation(current, { targetTaskId: "task-other" }),
        },
        current,
      ).ok,
    ).toBe(false);
  });

  it("A31 progression decision contract contains no execution Authority field", async () => {
    const current = await binding();
    const decision = {
      schemaVersion: MULTI_AGENT_COORDINATION_PROGRESSION_DECISION_SCHEMA,
      coordinationId: current.plan.coordinationId,
      coordinationPlanFingerprint: current.coordinationPlanFingerprint,
      taskId: "task-a",
      coordinationProgressionStatus: "PLANNED",
      coordinationProgressionReason: "PLAN_ADMITTED",
    };
    expect(parseCoordinationProgressionDecisionV1(decision, current).ok).toBe(true);
    expect(
      parseCoordinationProgressionDecisionV1({ ...decision, executionAuthorized: true }, current).ok,
    ).toBe(false);
  });

  it("A32 no exported side-effecting execution/dispatch API", () => {
    const prohibited = /^(execute|dispatch|invoke|approve|merge|deploy)/i;
    expect(Object.keys(coordinationModule).filter((key) => prohibited.test(key))).toEqual([]);
    expect(MULTI_AGENT_COORDINATION_PROGRESSION_EVALUATOR_IMPLEMENTED).toBe(true);
    expect(MULTI_AGENT_COORDINATION_PROVIDER_INVOCATION_IMPLEMENTED).toBe(false);
    expect(MULTI_AGENT_COORDINATION_HARNESS_INVOCATION_IMPLEMENTED).toBe(false);
    expect(MULTI_AGENT_COORDINATION_GITHUB_MUTATION_IMPLEMENTED).toBe(false);
  });
});

function evaluatedDecision(
  current: CoordinationPlanBindingV1,
  overrides: Partial<CoordinationProgressionInputV1> = {},
) {
  const result = coordinationModule.evaluateCoordinationProgressionV1(
    progressionInput(current, overrides),
    current,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.decision;
}

function executed(
  overrides: Partial<CoordinationProgressionInputV1>,
): Partial<CoordinationProgressionInputV1> {
  return {
    authorizationObservation: "AUTHORIZED",
    executionAuthorizationRef: "evidence://auth",
    executionAttemptId: "attempt-1",
    executionOutcomeRef: "evidence://outcome",
    ...overrides,
  };
}

type StageBCase = [
  string,
  (current: CoordinationPlanBindingV1) => Partial<CoordinationProgressionInputV1>,
  string,
  string,
];

const stageBCases: StageBCase[] = [
  [
    "B10 rule 1 EXECUTION_UNKNOWN",
    () => executed({ executionObservation: "EXECUTION_UNKNOWN" }),
    "UNKNOWN",
    "EXECUTION_UNKNOWN",
  ],
  [
    "B11 rule 2 SUCCEEDED + RESULT_UNKNOWN",
    () =>
      executed({
        executionObservation: "EXECUTION_SUCCEEDED",
        resultValidationObservation: "RESULT_UNKNOWN",
        resultValidationRef: "evidence://result",
      }),
    "UNKNOWN",
    "RESULT_UNKNOWN",
  ],
  [
    "B12 rule 3 EXECUTION_FAILED",
    () => executed({ executionObservation: "EXECUTION_FAILED" }),
    "FAILED",
    "EXECUTION_FAILED",
  ],
  [
    "B13 rule 4 SUCCEEDED + RESULT_INVALID",
    () =>
      executed({
        executionObservation: "EXECUTION_SUCCEEDED",
        resultValidationObservation: "RESULT_INVALID",
        resultValidationRef: "evidence://result",
      }),
    "FAILED",
    "RESULT_INVALID",
  ],
  [
    "B14 rule 5 SUCCEEDED + RESULT_VALID",
    () =>
      executed({
        executionObservation: "EXECUTION_SUCCEEDED",
        resultValidationObservation: "RESULT_VALID",
        resultValidationRef: "evidence://result",
      }),
    "SUCCEEDED",
    "EXECUTION_AND_RESULT_VALID",
  ],
  [
    "B15 rule 6 SUCCEEDED + NOT_REQUIRED with evidence ref",
    () =>
      executed({
        executionObservation: "EXECUTION_SUCCEEDED",
        resultValidationObservation: "NOT_REQUIRED",
        resultValidationRef: "evidence://not-required",
      }),
    "SUCCEEDED",
    "EXECUTION_VALIDATION_NOT_REQUIRED",
  ],
  [
    "B16 rule 7 SUCCEEDED + NOT_EVALUATED",
    () => executed({ executionObservation: "EXECUTION_SUCCEEDED" }),
    "RUNNING",
    "RESULT_VALIDATION_PENDING",
  ],
  [
    "B17 rule 8 RUNNING",
    () =>
      executed({
        executionObservation: "RUNNING",
        executionOutcomeRef: null,
      }),
    "RUNNING",
    "EXECUTION_RUNNING",
  ],
  [
    "B18 rule 9 DENIED + NOT_INVOKED",
    () => ({ authorizationObservation: "DENIED", executionAuthorizationRef: "evidence://deny" }),
    "NOT_EXECUTED",
    "AUTHORIZATION_DENIED",
  ],
  [
    "B19 rule 9 beats accepted cancellation",
    (current) => ({
      authorizationObservation: "DENIED",
      executionAuthorizationRef: "evidence://deny",
      acceptedCancellationRequest: cancellation(current),
    }),
    "NOT_EXECUTED",
    "AUTHORIZATION_DENIED",
  ],
  [
    "B20 rule 10 accepted cancellation + NOT_INVOKED",
    (current) => ({ acceptedCancellationRequest: cancellation(current) }),
    "CANCELLED",
    "CANCELLATION_ACCEPTED",
  ],
  [
    "B21 rule 11 DEPENDENCY_BLOCKED",
    () => ({ dependencyEvaluation: "BLOCKED", resourceConcurrencyEvaluation: "PASS" }),
    "HOLD",
    "DEPENDENCY_BLOCKED",
  ],
  [
    "B22 rule 12 AUTHORIZATION_HOLD",
    () => ({
      authorizationObservation: "HOLD",
      executionAuthorizationRef: "evidence://hold",
      dependencyEvaluation: "SATISFIED",
      resourceConcurrencyEvaluation: "PASS",
    }),
    "HOLD",
    "AUTHORIZATION_HOLD",
  ],
  [
    "B23 rule 13 AUTHORIZATION_UNKNOWN",
    () => ({
      authorizationObservation: "UNKNOWN",
      executionAuthorizationRef: "evidence://unknown",
      dependencyEvaluation: "SATISFIED",
      resourceConcurrencyEvaluation: "PASS",
    }),
    "HOLD",
    "AUTHORIZATION_UNKNOWN",
  ],
  [
    "B24 rule 14 DEPENDENCY_PENDING",
    () => ({ dependencyEvaluation: "PENDING", resourceConcurrencyEvaluation: "PASS" }),
    "WAITING_DEPENDENCY",
    "DEPENDENCY_PENDING",
  ],
  [
    "B25 rule 15 RESOURCE_WAIT",
    () => ({ dependencyEvaluation: "SATISFIED", resourceConcurrencyEvaluation: "WAIT" }),
    "WAITING_RESOURCE",
    "RESOURCE_WAIT",
  ],
  [
    "B26 rule 16 HUMAN_GATE_WAIT",
    () => ({
      authorizationObservation: "WAITING_HUMAN_GATE",
      executionAuthorizationRef: "evidence://human-gate",
      dependencyEvaluation: "SATISFIED",
      resourceConcurrencyEvaluation: "PASS",
    }),
    "WAITING_HUMAN_GATE",
    "HUMAN_GATE_WAIT",
  ],
  [
    "B27 rule 17 AUTHORIZED_NOT_INVOKED",
    () => ({
      authorizationObservation: "AUTHORIZED",
      executionAuthorizationRef: "evidence://auth",
      dependencyEvaluation: "SATISFIED",
      resourceConcurrencyEvaluation: "PASS",
    }),
    "READY",
    "AUTHORIZED_NOT_INVOKED",
  ],
  [
    "B28 rule 18 READY_FOR_AUTHORIZATION",
    () => ({ dependencyEvaluation: "SATISFIED", resourceConcurrencyEvaluation: "PASS" }),
    "READY",
    "READY_FOR_AUTHORIZATION",
  ],
  ["B29 rule 19 PLANNED", () => ({}), "PLANNED", "PLAN_ADMITTED"],
];

describe("MULTI-AGENT-COORDINATION-V1 Slice B", () => {
  it("B01 evaluator implemented while execution capabilities stay disabled", () => {
    expect(coordinationModule.MULTI_AGENT_COORDINATION_PROGRESSION_EVALUATOR_IMPLEMENTED).toBe(true);
    expect(coordinationModule.MULTI_AGENT_COORDINATION_EXECUTION_IMPLEMENTED).toBe(false);
    expect(coordinationModule.MULTI_AGENT_COORDINATION_PROVIDER_INVOCATION_IMPLEMENTED).toBe(false);
    expect(coordinationModule.MULTI_AGENT_COORDINATION_HARNESS_INVOCATION_IMPLEMENTED).toBe(false);
    expect(coordinationModule.MULTI_AGENT_COORDINATION_GITHUB_MUTATION_IMPLEMENTED).toBe(false);
    expect(coordinationModule.MULTI_AGENT_COORDINATION_READY_IMPLEMENTED).toBe(false);
    expect(coordinationModule.MULTI_AGENT_COORDINATION_MERGE_IMPLEMENTED).toBe(false);
    expect(coordinationModule.MULTI_AGENT_COORDINATION_DEPLOY_IMPLEMENTED).toBe(false);
  });

  it("B02 schema-unparseable input returns REJECTED_SCHEMA without decision", async () => {
    const current = await binding();
    expect(
      coordinationModule.evaluateCoordinationProgressionV1(
        { ...progressionInput(current), extra: true },
        current,
      ),
    ).toEqual({ ok: false, reason: "REJECTED_SCHEMA" });
  });

  it("B03 plan fingerprint mismatch maps to identity-bound UNKNOWN", async () => {
    const current = await binding();
    const raw = progressionInput(current, { coordinationPlanFingerprint: FPA });
    const result = coordinationModule.evaluateCoordinationProgressionV1(raw, current);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.decision).toMatchObject({
      coordinationPlanFingerprint: FPA,
      coordinationProgressionStatus: "UNKNOWN",
      coordinationProgressionReason: "OBSERVATION_CONTRADICTION",
    });
  });

  it("B04 unknown taskId maps to UNKNOWN", async () => {
    const current = await binding();
    const decision = evaluatedDecision(current, { taskId: "task-other" });
    expect(decision).toMatchObject({
      taskId: "task-other",
      coordinationProgressionStatus: "UNKNOWN",
      coordinationProgressionReason: "OBSERVATION_CONTRADICTION",
    });
  });

  it("B05 invalid authorization x execution cell maps to UNKNOWN", async () => {
    const current = await binding();
    const decision = evaluatedDecision(current, {
      authorizationObservation: "DENIED",
      executionAuthorizationRef: "evidence://deny",
      executionObservation: "RUNNING",
      executionAttemptId: "attempt-1",
    });
    expect(decision).toMatchObject({
      coordinationProgressionStatus: "UNKNOWN",
      coordinationProgressionReason: "OBSERVATION_CONTRADICTION",
    });
  });

  it("B06 invalid execution x result cell maps to UNKNOWN", async () => {
    const current = await binding();
    const decision = evaluatedDecision(current, {
      authorizationObservation: "AUTHORIZED",
      executionAuthorizationRef: "evidence://auth",
      executionObservation: "RUNNING",
      executionAttemptId: "attempt-1",
      resultValidationObservation: "RESULT_VALID",
      resultValidationRef: "evidence://result",
    });
    expect(decision).toMatchObject({
      coordinationProgressionStatus: "UNKNOWN",
      coordinationProgressionReason: "OBSERVATION_CONTRADICTION",
    });
  });

  it("B07 partial readiness pair maps to UNKNOWN", async () => {
    const current = await binding();
    expect(evaluatedDecision(current, { dependencyEvaluation: "SATISFIED" })).toMatchObject({
      coordinationProgressionStatus: "UNKNOWN",
      coordinationProgressionReason: "OBSERVATION_CONTRADICTION",
    });
  });

  it("B08 NOT_REQUIRED without resultValidationRef maps to UNKNOWN", async () => {
    const current = await binding();
    expect(
      evaluatedDecision(
        current,
        executed({
          executionObservation: "EXECUTION_SUCCEEDED",
          resultValidationObservation: "NOT_REQUIRED",
          resultValidationRef: null,
        }),
      ),
    ).toMatchObject({
      coordinationProgressionStatus: "UNKNOWN",
      coordinationProgressionReason: "OBSERVATION_CONTRADICTION",
    });
  });

  it("B09 invalid cancellation binding maps to UNKNOWN", async () => {
    const current = await binding();
    expect(
      evaluatedDecision(current, {
        acceptedCancellationRequest: cancellation(current, { targetTaskId: "task-other" }),
      }),
    ).toMatchObject({
      coordinationProgressionStatus: "UNKNOWN",
      coordinationProgressionReason: "OBSERVATION_CONTRADICTION",
    });
  });

  it.each(stageBCases)("%s", async (_label, makeOverrides, status, reason) => {
    const current = await binding();
    expect(evaluatedDecision(current, makeOverrides(current))).toMatchObject({
      coordinationProgressionStatus: status,
      coordinationProgressionReason: reason,
    });
  });

  it("B30 AUTHORIZED + NOT_INVOKED + both readiness null stays PLANNED", async () => {
    const current = await binding();
    expect(
      evaluatedDecision(current, {
        authorizationObservation: "AUTHORIZED",
        executionAuthorizationRef: "evidence://auth",
      }),
    ).toMatchObject({
      coordinationProgressionStatus: "PLANNED",
      coordinationProgressionReason: "PLAN_ADMITTED",
    });
  });

  it("B31 cancellation + RUNNING remains EXECUTION_RUNNING", async () => {
    const current = await binding();
    expect(
      evaluatedDecision(current, {
        ...executed({ executionObservation: "RUNNING", executionOutcomeRef: null }),
        acceptedCancellationRequest: cancellation(current),
      }),
    ).toMatchObject({
      coordinationProgressionStatus: "RUNNING",
      coordinationProgressionReason: "EXECUTION_RUNNING",
    });
  });

  it("B32 cancellation + EXECUTION_SUCCEEDED uses terminal result mapping", async () => {
    const current = await binding();
    expect(
      evaluatedDecision(current, {
        ...executed({
          executionObservation: "EXECUTION_SUCCEEDED",
          resultValidationObservation: "RESULT_VALID",
          resultValidationRef: "evidence://result",
        }),
        acceptedCancellationRequest: cancellation(current),
      }),
    ).toMatchObject({
      coordinationProgressionStatus: "SUCCEEDED",
      coordinationProgressionReason: "EXECUTION_AND_RESULT_VALID",
    });
  });

  it("B33 decision contains no execution Authority field", async () => {
    const current = await binding();
    const decision = evaluatedDecision(current);
    expect(Object.keys(decision)).toEqual([
      "schemaVersion",
      "coordinationId",
      "coordinationPlanFingerprint",
      "taskId",
      "coordinationProgressionStatus",
      "coordinationProgressionReason",
    ]);
    expect("executionAuthorized" in decision).toBe(false);
  });

  it("B34 no exported side-effecting execution/dispatch API", () => {
    const prohibited = /^(execute|dispatch|invoke|approve|merge|deploy)/i;
    expect(Object.keys(coordinationModule).filter((key) => prohibited.test(key))).toEqual([]);
  });

  it("B35 Slice A parser contradictions remain REJECTED_CONTRADICTION", async () => {
    const current = await binding();
    expect(
      parseCoordinationProgressionInputV1(
        {
          ...progressionInput(current),
          authorizationObservation: "DENIED",
          executionAuthorizationRef: "evidence://deny",
          executionObservation: "RUNNING",
          executionAttemptId: "attempt-1",
        },
        current,
      ),
    ).toEqual({ ok: false, reason: "REJECTED_CONTRADICTION" });
  });
});

const FPD = "d".repeat(64);
const FPE = "e".repeat(64);
const FPW = "f".repeat(64);

function evidenceBinding(
  planOrOverrides?: CoordinationPlanBindingV1 | Partial<CoordinationEvidenceBindingV1>,
  maybeOverrides: Partial<CoordinationEvidenceBindingV1> = {},
): CoordinationEvidenceBindingV1 {
  const isPlan =
    planOrOverrides !== undefined &&
    typeof planOrOverrides === "object" &&
    "plan" in planOrOverrides &&
    "coordinationPlanFingerprint" in planOrOverrides;
  const planBinding = isPlan ? (planOrOverrides as CoordinationPlanBindingV1) : undefined;
  const overrides = isPlan
    ? maybeOverrides
    : ((planOrOverrides as Partial<CoordinationEvidenceBindingV1> | undefined) ?? {});
  return {
    ref: "evidence://task/1",
    evidenceDigest: FPD,
    ownerScope: "TASK",
    coordinationId: planBinding?.plan.coordinationId ?? "coordination-1",
    coordinationPlanFingerprint: planBinding?.coordinationPlanFingerprint ?? FPA,
    taskId: "task-a",
    kind: "EVIDENCE",
    sourceId: "source-1",
    ...overrides,
  };
}

function progressionDecision(
  planBinding: CoordinationPlanBindingV1,
  overrides: Partial<CoordinationProgressionDecisionV1> = {},
): CoordinationProgressionDecisionV1 {
  return {
    schemaVersion: MULTI_AGENT_COORDINATION_PROGRESSION_DECISION_SCHEMA,
    coordinationId: planBinding.plan.coordinationId,
    coordinationPlanFingerprint: planBinding.coordinationPlanFingerprint,
    taskId: planBinding.plan.taskRefs[0].taskId,
    coordinationProgressionStatus: "PLANNED",
    coordinationProgressionReason: "PLAN_ADMITTED",
    ...overrides,
  };
}

async function progressionBinding(
  planBinding: CoordinationPlanBindingV1,
  ref = "progression://decision/1",
  overrides: Partial<CoordinationProgressionDecisionV1> = {},
): Promise<CoordinationProgressionDecisionBindingV1> {
  const decision = progressionDecision(planBinding, overrides);
  return {
    progressionDecisionRef: ref,
    decision,
  };
}

function plannedTaskState(
  planBinding: CoordinationPlanBindingV1,
  overrides: Partial<CoordinationTaskStateBindingV1> = {},
): CoordinationTaskStateBindingV1 {
  return {
    taskId: planBinding.plan.taskRefs[0].taskId,
    taskRoutingFingerprint: planBinding.plan.taskRefs[0].taskRoutingFingerprint,
    workerId: null,
    workerAuthorityFingerprint: null,
    routingDecisionFingerprint: null,
    humanDecisionRef: null,
    executionAuthorizationRef: null,
    executionAttemptId: null,
    executionOutcomeRef: null,
    resultValidationRef: null,
    resourceLockDecisionRef: null,
    coordinationProgressionStatus: "PLANNED",
    progressionDecisionRef: "progression://decision/1",
    progressionDecisionFingerprint: FPD,
    evidenceBindings: [],
    ...overrides,
  };
}

async function snapshotPayload(
  planBinding: CoordinationPlanBindingV1,
  overrides: {
    taskStates?: CoordinationTaskStateBindingV1[];
    coordinationEvidenceBindings?: CoordinationEvidenceBindingV1[];
    auditBindings?: CoordinationEvidenceBindingV1[];
    coordinationId?: string;
    coordinationPlanFingerprint?: string;
  } = {},
): Promise<CoordinationSharedStateSnapshotV1> {
  const payload = {
    schemaVersion: MULTI_AGENT_COORDINATION_SHARED_STATE_SNAPSHOT_SCHEMA,
    coordinationId: overrides.coordinationId ?? planBinding.plan.coordinationId,
    coordinationPlanFingerprint:
      overrides.coordinationPlanFingerprint ?? planBinding.coordinationPlanFingerprint,
    taskStates: overrides.taskStates ?? [plannedTaskState(planBinding)],
    coordinationEvidenceBindings: overrides.coordinationEvidenceBindings ?? [],
    auditBindings: overrides.auditBindings ?? [],
  };
  const snapshotDigest = await computeCoordinationSharedStateSnapshotDigest(payload);
  return { ...payload, snapshotDigest };
}

describe("MULTI-AGENT-COORDINATION-V1 Slice C", () => {
  it("C01 valid FULL snapshot bound to exact plan identity passes", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    const result = await validateCoordinationSharedStateSnapshotV1(snap, current, [
      {
        progressionDecisionRef: "progression://decision/1",
        decision,
      },
    ]);
    expect(result.ok).toBe(true);
  });

  it("C02 coordinationId mismatch fails closed", async () => {
    const current = await binding();
    const snap = await snapshotPayload(current, { coordinationId: "coordination-other" });
    expect((await validateCoordinationSharedStateSnapshotV1(snap, current)).ok).toBe(false);
  });

  it("C03 plan fingerprint mismatch fails closed", async () => {
    const current = await binding();
    const snap = await snapshotPayload(current, { coordinationPlanFingerprint: FPA });
    expect((await validateCoordinationSharedStateSnapshotV1(snap, current)).ok).toBe(false);
  });

  it("C04 unknown taskId fails closed", async () => {
    const current = await binding();
    const snap = await snapshotPayload(current, {
      taskStates: [plannedTaskState(current, { taskId: "task-unknown" })],
    });
    expect((await validateCoordinationSharedStateSnapshotV1(snap, current)).ok).toBe(false);
  });

  it("C05 duplicate task binding fails closed", async () => {
    const current = await binding();
    const state = plannedTaskState(current);
    const snap = await snapshotPayload(current, { taskStates: [state, { ...state }] });
    expect((await validateCoordinationSharedStateSnapshotV1(snap, current)).ok).toBe(false);
  });

  it("C06 taskRoutingFingerprint mismatch fails closed", async () => {
    const current = await binding();
    const snap = await snapshotPayload(current, {
      taskStates: [plannedTaskState(current, { taskRoutingFingerprint: FPB })],
    });
    expect((await validateCoordinationSharedStateSnapshotV1(snap, current)).ok).toBe(false);
  });

  it("C07 lifecycle matrix accepts OPTIONAL null refs", async () => {
    const current = await binding();
    const decision = progressionDecision(current, {
      coordinationProgressionStatus: "WAITING_DEPENDENCY",
      coordinationProgressionReason: "DEPENDENCY_PENDING",
    });
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "WAITING_DEPENDENCY",
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(true);
  });

  it("C08 lifecycle matrix rejects missing REQUIRED ref", async () => {
    const current = await binding();
    const decision = progressionDecision(current, {
      coordinationProgressionStatus: "READY",
      coordinationProgressionReason: "AUTHORIZED_NOT_INVOKED",
    });
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "READY",
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C09 lifecycle matrix rejects MUST_BE_NULL contradiction", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          workerId: "worker-1",
          workerAuthorityFingerprint: FPW,
          routingDecisionFingerprint: FPE,
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C10 partial snapshot rejects", async () => {
    const current = await binding(plan({
      taskRefs: [
        plan().taskRefs[0],
        {
          taskId: "task-b",
          taskRoutingFingerprint: FPB,
          dependencyTaskIds: [],
          coordinationMode: "SEQUENTIAL",
        },
      ],
    }));
    const snap = await snapshotPayload(current);
    expect((await validateCoordinationSharedStateSnapshotV1(snap, current)).ok).toBe(false);
  });

  it("C11 task evidence owner mismatch rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          progressionDecisionFingerprint: fingerprint,
          evidenceBindings: [evidenceBinding(current, { taskId: "task-other" })],
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C12 coordination evidence with task owner rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [plannedTaskState(current, { progressionDecisionFingerprint: fingerprint })],
      coordinationEvidenceBindings: [
        evidenceBinding(current, { ownerScope: "TASK", taskId: "task-a", kind: "EVIDENCE" }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C13 audit binding unknown task rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [plannedTaskState(current, { progressionDecisionFingerprint: fingerprint })],
      auditBindings: [
        evidenceBinding(current, {
          ownerScope: "TASK",
          taskId: "task-unknown",
          kind: "AUDIT",
          ref: "audit://1",
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C14 duplicate evidence identity tuple rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const duplicate = evidenceBinding(current);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          progressionDecisionFingerprint: fingerprint,
          evidenceBindings: [duplicate, { ...duplicate }],
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C15 array order preserved; no sort/dedupe/repair", async () => {
    const current = await binding();
    const first = evidenceBinding(current, { ref: "evidence://first", sourceId: "source-a" });
    const second = evidenceBinding(current, { ref: "evidence://second", sourceId: "source-b" });
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          progressionDecisionFingerprint: fingerprint,
          evidenceBindings: [first, second],
        }),
      ],
    });
    const result = await validateCoordinationSharedStateSnapshotV1(snap, current, [
      { progressionDecisionRef: "progression://decision/1", decision },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.taskStates[0].evidenceBindings.map((item) => item.ref)).toEqual([
      "evidence://first",
      "evidence://second",
    ]);
  });

  it("C16 bare ref cannot substitute for bounded attribution record", () => {
    expect(parseCoordinationEvidenceBindingV1("evidence://only-a-ref").ok).toBe(false);
  });

  it("C17 progression identity mismatch fails closed", async () => {
    const current = await binding();
    const decision = progressionDecision(current, {
      coordinationProgressionStatus: "READY",
      coordinationProgressionReason: "AUTHORIZED_NOT_INVOKED",
    });
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "PLANNED",
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C18 snapshot validation changes no canonical execution/routing/policy result", async () => {
    const current = await binding();
    const raw = progressionInput(current);
    const before = coordinationModule.evaluateCoordinationProgressionV1(raw, current);
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [plannedTaskState(current, { progressionDecisionFingerprint: fingerprint })],
    });
    await validateCoordinationSharedStateSnapshotV1(snap, current, [
      { progressionDecisionRef: "progression://decision/1", decision },
    ]);
    const after = coordinationModule.evaluateCoordinationProgressionV1(raw, current);
    expect(after).toEqual(before);
  });

  it("C19 no exported persistence / dispatch / invoke / approve / merge / deploy API", () => {
    const prohibited = /^(execute|dispatch|invoke|approve|merge|deploy|persist)/i;
    expect(Object.keys(coordinationModule).filter((key) => prohibited.test(key))).toEqual([]);
    expect(coordinationModule.MULTI_AGENT_COORDINATION_SHARED_STATE_BINDING_IMPLEMENTED).toBe(true);
    expect(coordinationModule.MULTI_AGENT_COORDINATION_EXECUTION_IMPLEMENTED).toBe(false);
  });

  it("C20 existing Slice B progression evaluator behavior unchanged", async () => {
    const current = await binding();
    expect(evaluatedDecision(current)).toMatchObject({
      coordinationProgressionStatus: "PLANNED",
      coordinationProgressionReason: "PLAN_ADMITTED",
    });
  });

  it("C21 SUCCEEDED missing resultValidationRef rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current, {
      coordinationProgressionStatus: "SUCCEEDED",
      coordinationProgressionReason: "EXECUTION_AND_RESULT_VALID",
    });
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "SUCCEEDED",
          workerId: "worker-1",
          workerAuthorityFingerprint: FPW,
          routingDecisionFingerprint: FPE,
          executionAuthorizationRef: "evidence://auth",
          executionAttemptId: "attempt-1",
          executionOutcomeRef: "evidence://outcome",
          resultValidationRef: null,
          progressionDecisionFingerprint: fingerprint,
          evidenceBindings: [evidenceBinding(current)],
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C22 FAILED missing executionOutcomeRef/evidence rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current, {
      coordinationProgressionStatus: "FAILED",
      coordinationProgressionReason: "EXECUTION_FAILED",
    });
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "FAILED",
          workerId: "worker-1",
          workerAuthorityFingerprint: FPW,
          routingDecisionFingerprint: FPE,
          executionAuthorizationRef: "evidence://auth",
          executionAttemptId: "attempt-1",
          executionOutcomeRef: null,
          progressionDecisionFingerprint: fingerprint,
          evidenceBindings: [],
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C23 NOT_EXECUTED with executionAttemptId rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current, {
      coordinationProgressionStatus: "NOT_EXECUTED",
      coordinationProgressionReason: "AUTHORIZATION_DENIED",
    });
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "NOT_EXECUTED",
          executionAuthorizationRef: "evidence://auth",
          executionAttemptId: "attempt-1",
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C24 PLANNED with routing/execution/resource ref rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          resourceLockDecisionRef: "evidence://lock",
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C25 WAITING_HUMAN_GATE with executionAuthorizationRef rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current, {
      coordinationProgressionStatus: "WAITING_HUMAN_GATE",
      coordinationProgressionReason: "HUMAN_GATE_WAIT",
    });
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "WAITING_HUMAN_GATE",
          workerId: "worker-1",
          workerAuthorityFingerprint: FPW,
          routingDecisionFingerprint: FPE,
          executionAuthorizationRef: "evidence://auth",
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C26 WAITING_HUMAN_GATE without executionAuthorizationRef accepts when other requirements hold", async () => {
    const current = await binding();
    const decision = progressionDecision(current, {
      coordinationProgressionStatus: "WAITING_HUMAN_GATE",
      coordinationProgressionReason: "HUMAN_GATE_WAIT",
    });
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "WAITING_HUMAN_GATE",
          workerId: "worker-1",
          workerAuthorityFingerprint: FPW,
          routingDecisionFingerprint: FPE,
          humanDecisionRef: "evidence://human-gate",
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(true);
  });

  it("C27 humanDecisionRef never substitutes for executionAuthorizationRef", async () => {
    const current = await binding();
    const decision = progressionDecision(current, {
      coordinationProgressionStatus: "READY",
      coordinationProgressionReason: "AUTHORIZED_NOT_INVOKED",
    });
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "READY",
          workerId: "worker-1",
          workerAuthorityFingerprint: FPW,
          routingDecisionFingerprint: FPE,
          humanDecisionRef: "evidence://human-gate",
          executionAuthorizationRef: null,
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C28 valid exact snapshotDigest passes", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [plannedTaskState(current, { progressionDecisionFingerprint: fingerprint })],
    });
    expect((await validateCoordinationSharedStateSnapshotV1(snap, current)).ok).toBe(true);
  });

  it("C29 snapshotDigest mismatch rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [plannedTaskState(current, { progressionDecisionFingerprint: fingerprint })],
    });
    snap.snapshotDigest = FPA;
    expect((await validateCoordinationSharedStateSnapshotV1(snap, current)).ok).toBe(false);
  });

  it("C30 identical payload deterministically reproduces snapshotDigest", async () => {
    const current = await binding();
    const payload = {
      schemaVersion: MULTI_AGENT_COORDINATION_SHARED_STATE_SNAPSHOT_SCHEMA,
      coordinationId: current.plan.coordinationId,
      coordinationPlanFingerprint: current.coordinationPlanFingerprint,
      taskStates: [plannedTaskState(current)],
      coordinationEvidenceBindings: [] as CoordinationEvidenceBindingV1[],
      auditBindings: [] as CoordinationEvidenceBindingV1[],
    };
    const first = await computeCoordinationSharedStateSnapshotDigest(payload);
    const second = await computeCoordinationSharedStateSnapshotDigest(payload);
    expect(first).toBe(second);
  });

  it("C31 evidence binding missing evidenceDigest rejects", () => {
    expect(
      parseCoordinationEvidenceBindingV1({
        ref: "evidence://task/1",
        ownerScope: "TASK",
        coordinationId: "coordination-1",
        coordinationPlanFingerprint: FPA,
        taskId: "task-a",
        kind: "EVIDENCE",
        sourceId: "source-1",
      }).ok,
    ).toBe(false);
  });

  it("C32 same ref + conflicting evidenceDigest rejects snapshot-wide", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          progressionDecisionFingerprint: fingerprint,
          evidenceBindings: [evidenceBinding(current, { ref: "evidence://shared", evidenceDigest: FPD })],
        }),
      ],
      coordinationEvidenceBindings: [
        evidenceBinding(current, {
          ref: "evidence://shared",
          evidenceDigest: FPE,
          ownerScope: "COORDINATION",
          taskId: null,
        }),
      ],
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C33 progression status missing progressionDecisionRef/fingerprint rejects", async () => {
    const current = await binding();
    expect(
      parseCoordinationTaskStateBindingV1({
        ...plannedTaskState(current),
        progressionDecisionRef: "",
      }).ok,
    ).toBe(false);
  });

  it("C34 progression binding identity mismatch rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current, {
      coordinationProgressionStatus: "READY",
      coordinationProgressionReason: "AUTHORIZED_NOT_INVOKED",
    });
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "READY",
          workerId: "worker-1",
          workerAuthorityFingerprint: FPW,
          routingDecisionFingerprint: FPE,
          executionAuthorizationRef: "evidence://auth",
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    expect(
      (
        await validateCoordinationSharedStateSnapshotV1(snap, current, [
          {
            progressionDecisionRef: "progression://decision/1",
            decision: progressionDecision(current, { taskId: "task-other" }),
          },
        ])
      ).ok,
    ).toBe(false);
  });

  it("C35 duplicate evidence tuple across different arrays rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const shared = evidenceBinding(current);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          progressionDecisionFingerprint: fingerprint,
          evidenceBindings: [shared],
        }),
      ],
      auditBindings: [{ ...shared, kind: "AUDIT", ref: "audit://dup" }],
    });
    const duplicateAudit = evidenceBinding(current, { kind: "AUDIT", ref: "audit://1" });
    snap.auditBindings = [duplicateAudit, { ...duplicateAudit }];
    snap.snapshotDigest = await computeCoordinationSharedStateSnapshotDigest({
      schemaVersion: snap.schemaVersion,
      coordinationId: snap.coordinationId,
      coordinationPlanFingerprint: snap.coordinationPlanFingerprint,
      taskStates: snap.taskStates,
      coordinationEvidenceBindings: snap.coordinationEvidenceBindings,
      auditBindings: snap.auditBindings,
    });
    expect(
      (await validateCoordinationSharedStateSnapshotV1(snap, current, [
        { progressionDecisionRef: "progression://decision/1", decision },
      ])).ok,
    ).toBe(false);
  });

  it("C36 global collision validation preserves original order", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const taskEvidence = evidenceBinding(current, { ref: "evidence://task", sourceId: "source-task" });
    const auditEvidence = evidenceBinding(current, {
      ref: "audit://1",
      kind: "AUDIT",
      sourceId: "source-audit",
    });
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          progressionDecisionFingerprint: fingerprint,
          evidenceBindings: [taskEvidence],
        }),
      ],
      auditBindings: [auditEvidence],
    });
    const result = await validateCoordinationSharedStateSnapshotV1(snap, current, [
      { progressionDecisionRef: "progression://decision/1", decision },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.auditBindings[0].ref).toBe("audit://1");
    expect(result.value.taskStates[0].evidenceBindings[0].ref).toBe("evidence://task");
  });

  it("C37 READY/READY_FOR_AUTHORIZATION with null executionAuthorizationRef passes", async () => {
    const current = await binding();
    const decision = progressionDecision(current, {
      coordinationProgressionStatus: "READY",
      coordinationProgressionReason: "READY_FOR_AUTHORIZATION",
    });
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "READY",
          workerId: "worker-1",
          workerAuthorityFingerprint: FPW,
          routingDecisionFingerprint: FPE,
          executionAuthorizationRef: null,
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    expect(
      (
        await validateCoordinationSharedStateSnapshotV1(snap, current, [
          { progressionDecisionRef: "progression://decision/1", decision },
        ])
      ).ok,
    ).toBe(true);
  });

  it("C38 READY/AUTHORIZED_NOT_INVOKED with null executionAuthorizationRef rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current, {
      coordinationProgressionStatus: "READY",
      coordinationProgressionReason: "AUTHORIZED_NOT_INVOKED",
    });
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "READY",
          workerId: "worker-1",
          workerAuthorityFingerprint: FPW,
          routingDecisionFingerprint: FPE,
          executionAuthorizationRef: null,
          progressionDecisionFingerprint: fingerprint,
        }),
      ],
    });
    expect(
      (
        await validateCoordinationSharedStateSnapshotV1(snap, current, [
          { progressionDecisionRef: "progression://decision/1", decision },
        ])
      ).ok,
    ).toBe(false);
  });

  it("C39 evidence binding plan fingerprint mismatch rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          progressionDecisionFingerprint: fingerprint,
          evidenceBindings: [
            evidenceBinding(current, { coordinationPlanFingerprint: FPA }),
          ],
        }),
      ],
    });
    expect(
      (
        await validateCoordinationSharedStateSnapshotV1(snap, current, [
          { progressionDecisionRef: "progression://decision/1", decision },
        ])
      ).ok,
    ).toBe(false);
  });

  it("C40 FAILED/SUCCEEDED require lifecycle refs bound to task evidence records", async () => {
    const current = await binding();
    const failedDecision = progressionDecision(current, {
      coordinationProgressionStatus: "FAILED",
      coordinationProgressionReason: "EXECUTION_FAILED",
    });
    const failedFingerprint =
      await computeCoordinationProgressionDecisionFingerprint(failedDecision);
    const failedSnap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "FAILED",
          workerId: "worker-1",
          workerAuthorityFingerprint: FPW,
          routingDecisionFingerprint: FPE,
          executionAuthorizationRef: "evidence://auth",
          executionAttemptId: "attempt-1",
          executionOutcomeRef: "evidence://outcome",
          progressionDecisionFingerprint: failedFingerprint,
          evidenceBindings: [
            evidenceBinding(current, { ref: "evidence://unrelated" }),
          ],
        }),
      ],
    });
    expect(
      (
        await validateCoordinationSharedStateSnapshotV1(failedSnap, current, [
          { progressionDecisionRef: "progression://decision/1", decision: failedDecision },
        ])
      ).ok,
    ).toBe(false);

    const succeededDecision = progressionDecision(current, {
      coordinationProgressionStatus: "SUCCEEDED",
      coordinationProgressionReason: "EXECUTION_AND_RESULT_VALID",
    });
    const succeededFingerprint =
      await computeCoordinationProgressionDecisionFingerprint(succeededDecision);
    const succeededSnap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "SUCCEEDED",
          workerId: "worker-1",
          workerAuthorityFingerprint: FPW,
          routingDecisionFingerprint: FPE,
          executionAuthorizationRef: "evidence://auth",
          executionAttemptId: "attempt-1",
          executionOutcomeRef: "evidence://outcome",
          resultValidationRef: "evidence://result",
          progressionDecisionFingerprint: succeededFingerprint,
          evidenceBindings: [
            evidenceBinding(current, { ref: "evidence://outcome" }),
            // resultValidationRef unbound — only outcome bound
          ],
        }),
      ],
    });
    expect(
      (
        await validateCoordinationSharedStateSnapshotV1(succeededSnap, current, [
          {
            progressionDecisionRef: "progression://decision/1",
            decision: succeededDecision,
          },
        ])
      ).ok,
    ).toBe(false);

    const succeededOk = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          coordinationProgressionStatus: "SUCCEEDED",
          workerId: "worker-1",
          workerAuthorityFingerprint: FPW,
          routingDecisionFingerprint: FPE,
          executionAuthorizationRef: "evidence://auth",
          executionAttemptId: "attempt-1",
          executionOutcomeRef: "evidence://outcome",
          resultValidationRef: "evidence://result",
          progressionDecisionFingerprint: succeededFingerprint,
          evidenceBindings: [
            evidenceBinding(current, { ref: "evidence://outcome", sourceId: "source-outcome" }),
            evidenceBinding(current, { ref: "evidence://result", sourceId: "source-result" }),
          ],
        }),
      ],
    });
    expect(
      (
        await validateCoordinationSharedStateSnapshotV1(succeededOk, current, [
          {
            progressionDecisionRef: "progression://decision/1",
            decision: succeededDecision,
          },
        ])
      ).ok,
    ).toBe(true);
  });

  it("C41 task evidenceBindings reject COORDINATION-owned records", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, {
          progressionDecisionFingerprint: fingerprint,
          evidenceBindings: [
            evidenceBinding(current, {
              ownerScope: "COORDINATION",
              taskId: null,
            }),
          ],
        }),
      ],
    });
    expect(
      (
        await validateCoordinationSharedStateSnapshotV1(snap, current, [
          { progressionDecisionRef: "progression://decision/1", decision },
        ])
      ).ok,
    ).toBe(false);
  });

  it("C42 snapshotDigest recomputation excludes pre-existing digest; duplicate progressionDecisionRef rejects", async () => {
    const current = await binding();
    const decision = progressionDecision(current);
    const fingerprint = await computeCoordinationProgressionDecisionFingerprint(decision);
    const snap = await snapshotPayload(current, {
      taskStates: [
        plannedTaskState(current, { progressionDecisionFingerprint: fingerprint }),
      ],
    });
    const recomputed = await computeCoordinationSharedStateSnapshotDigest(snap);
    expect(recomputed).toBe(snap.snapshotDigest);
    const mutated = {
      ...snap,
      snapshotDigest: FPA,
    };
    const recomputedFromMutated = await computeCoordinationSharedStateSnapshotDigest(mutated);
    expect(recomputedFromMutated).toBe(snap.snapshotDigest);

    expect(
      (
        await validateCoordinationSharedStateSnapshotV1(snap, current, [
          { progressionDecisionRef: "progression://decision/1", decision },
          {
            progressionDecisionRef: "progression://decision/1",
            decision: progressionDecision(current, {
              coordinationProgressionStatus: "READY",
              coordinationProgressionReason: "READY_FOR_AUTHORIZATION",
            }),
          },
        ])
      ).ok,
    ).toBe(false);
  });
});
