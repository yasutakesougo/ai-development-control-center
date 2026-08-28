import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AgentTaskV1 } from "../src/domain/agentTaskContract";
import {
  PLAN_SCOPE_GUARD_DEPLOY_IMPLEMENTED,
  PLAN_SCOPE_GUARD_GITHUB_MUTATION_IMPLEMENTED,
  PLAN_SCOPE_GUARD_MERGE_IMPLEMENTED,
  PLAN_SCOPE_GUARD_PLAN_MUTATION_IMPLEMENTED,
  PLAN_SCOPE_GUARD_READY_IMPLEMENTED,
  PLAN_SCOPE_GUARD_RUNTIME_ENFORCEMENT_IMPLEMENTED,
  PLAN_SCOPE_GUARD_WORKER_STOP_IMPLEMENTED,
  evaluatePlanScopeShadowV1,
  isScopeEvaluationReusableV1,
  parsePlanScopeGuardInputV1,
  type ApprovalResolutionEvidenceV1,
  type PlanScopeGuardResultV1,
  type PlanScopeSnapshotV1,
  type ProposedActionV1,
  type ScopeEvaluationInputV1,
  type ScopeEvaluationRecordV1,
  type ScopeEvidenceClassificationV1,
  type ScopeEvidenceSourceBindingsV1,
} from "../src/domain/planScopeGuard";

const BASE_SHA = "c15dbd60fe51bcb894dc555fee5defb859d3df5f";
const EVALUATED_AT = "2026-08-28T12:02:00+09:00";

type FixturePatch = {
  task?: Partial<AgentTaskV1>;
  plan?: Partial<PlanScopeSnapshotV1>;
  approval?: Partial<ApprovalResolutionEvidenceV1>;
  action?: Partial<ProposedActionV1>;
  classification?: Partial<ScopeEvidenceClassificationV1>;
  sourceBindings?: Partial<ScopeEvidenceSourceBindingsV1>;
};

type FixtureExpected = {
  resultType?: "EVALUATION" | "CONTRACT_REJECTED";
  scopeEvaluationStatus?: "EVALUATED" | "NOT_EVALUATED";
  scopeDecision?: "IN_SCOPE" | "SCOPE_EXTENSION_REQUIRED" | "OUT_OF_SCOPE" | "UNKNOWN" | null;
  forbiddenScopeDecision?: "IN_SCOPE" | "SCOPE_EXTENSION_REQUIRED" | "OUT_OF_SCOPE" | "UNKNOWN";
  reasonCode?: string;
  scopeDecisionPresent?: boolean;
  priorDecisionReusable?: boolean;
};

type Fixture = {
  id: string;
  kind: "POSITIVE" | "NEGATIVE";
  scenario: string;
  patch?: FixturePatch;
  expected: FixtureExpected;
  reuseMutation?: FixturePatch;
};

type FixtureSet = {
  schemaVersion: string;
  syntheticOnly: boolean;
  canonicalSource: boolean;
  baseline: string;
  fixtures: Fixture[];
};

const fixtureSet = JSON.parse(
  readFileSync(
    new URL("../docs/plan-scope-guard/fixtures/fixture-set-v1.json", import.meta.url),
    "utf8",
  ),
) as FixtureSet;

function task(overrides: Partial<AgentTaskV1> = {}): AgentTaskV1 {
  return {
    schemaVersion: "AGENT-TASK-V1",
    taskId: "plan-scope-guard-v1-test",
    repository: "yasutakesougo/ai-development-control-center",
    baseRevision: BASE_SHA,
    sourceIssue: { repository: "yasutakesougo/ai-development-control-center", number: 999 },
    objective: "Implement one bounded change.",
    allowedPaths: ["src/domain"],
    forbiddenPaths: ["src/runtime"],
    acceptanceCriteria: ["Required behavior works."],
    verificationCommands: [],
    allowedCapabilities: ["workspace.read.v1"],
    riskClass: "R1",
    stopAt: "VERIFY_COMPLETE",
    ...overrides,
  };
}

function plan(overrides: Partial<PlanScopeSnapshotV1> = {}): PlanScopeSnapshotV1 {
  return {
    planId: "plan-1",
    planVersion: "1",
    planIdentity: "plan-1-v1",
    scopeSnapshotIdentity: "scope-1",
    explicitInScope: ["bounded change"],
    explicitOutOfScope: ["runtime mutation"],
    ...overrides,
  };
}

function approval(overrides: Partial<ApprovalResolutionEvidenceV1> = {}): ApprovalResolutionEvidenceV1 {
  return {
    approvalResolutionEvidenceId: "approval-1",
    planIdentity: "plan-1-v1",
    planVersion: "1",
    canonicalApprovalContractRef: "contract://approval/v1",
    canonicalApprovalResolverRef: "resolver://approval/v1",
    planApprovalDecisionRef: "decision://approval/1",
    planApprovalAuthorityRef: "authority://plan-approval",
    approvalStateSemanticsRef: "semantics://approval/v1",
    resolutionResult: "VALID",
    reasonCode: "APPROVED",
    resolvedAt: "2026-08-28T12:00:00+09:00",
    evidenceRefs: ["evidence://approval/1"],
    ...overrides,
  };
}

function sourceBindings(
  overrides: Partial<ScopeEvidenceSourceBindingsV1> = {},
): ScopeEvidenceSourceBindingsV1 {
  return {
    explicitInScope: [],
    acceptanceCriteria: [],
    explicitOutOfScope: [],
    ...overrides,
  };
}

function classification(
  overrides: Partial<ScopeEvidenceClassificationV1> = {},
  bindingOverrides: Partial<ScopeEvidenceSourceBindingsV1> = {},
): ScopeEvidenceClassificationV1 {
  return {
    explicitIncluded: false,
    acceptanceRequired: false,
    necessaryDependency: false,
    necessaryDependencyChainComplete: false,
    explicitExcluded: false,
    opportunisticWork: false,
    unrequestedGeneralization: false,
    futureOnlyWork: false,
    unplannedDependency: false,
    materialPlanChangeRequired: false,
    evidenceSufficient: true,
    evidenceRefs: ["evidence://scope/1"],
    ...overrides,
    sourceBindings: sourceBindings(bindingOverrides),
  };
}

function action(
  overrides: Partial<ProposedActionV1> = {},
  classificationOverrides: Partial<ScopeEvidenceClassificationV1> = {},
  bindingOverrides: Partial<ScopeEvidenceSourceBindingsV1> = {},
): ProposedActionV1 {
  return {
    proposedActionIdentity: "action-1",
    actionType: "FILE_MODIFICATION",
    description: "Apply one bounded domain change.",
    affectedTargets: ["src/domain/example.ts"],
    proposedAt: "2026-08-28T12:01:00+09:00",
    actor: "worker://synthetic",
    ...overrides,
    classification: classification(classificationOverrides, bindingOverrides),
  };
}

function buildInput(patch: FixturePatch = {}): ScopeEvaluationInputV1 {
  return {
    task: task(patch.task),
    plan: plan(patch.plan),
    approval: approval(patch.approval),
    proposedAction: action(patch.action, patch.classification, patch.sourceBindings),
    evidenceRefs: ["evidence://input/1"],
    guardActor: "guard://shadow",
    evaluatedAt: EVALUATED_AT,
  };
}

function mergePatch(base: FixturePatch = {}, change: FixturePatch = {}): FixturePatch {
  return {
    task: { ...base.task, ...change.task },
    plan: { ...base.plan, ...change.plan },
    approval: { ...base.approval, ...change.approval },
    action: { ...base.action, ...change.action },
    classification: { ...base.classification, ...change.classification },
    sourceBindings: { ...base.sourceBindings, ...change.sourceBindings },
  };
}

function isRejected(result: PlanScopeGuardResultV1): boolean {
  return "resultType" in result && result.resultType === "CONTRACT_REJECTED";
}

function asEvaluation(result: PlanScopeGuardResultV1): ScopeEvaluationRecordV1 {
  expect(isRejected(result)).toBe(false);
  return result as ScopeEvaluationRecordV1;
}

describe("PLAN-SCOPE-GUARD-V1 Slice A Correction-1", () => {
  it("keeps runtime and mutation surfaces disabled", () => {
    expect(PLAN_SCOPE_GUARD_RUNTIME_ENFORCEMENT_IMPLEMENTED).toBe(false);
    expect(PLAN_SCOPE_GUARD_WORKER_STOP_IMPLEMENTED).toBe(false);
    expect(PLAN_SCOPE_GUARD_PLAN_MUTATION_IMPLEMENTED).toBe(false);
    expect(PLAN_SCOPE_GUARD_GITHUB_MUTATION_IMPLEMENTED).toBe(false);
    expect(PLAN_SCOPE_GUARD_READY_IMPLEMENTED).toBe(false);
    expect(PLAN_SCOPE_GUARD_MERGE_IMPLEMENTED).toBe(false);
    expect(PLAN_SCOPE_GUARD_DEPLOY_IMPLEMENTED).toBe(false);
  });

  it("uses the JSON fixture registry as the canonical executable source", () => {
    expect(fixtureSet.schemaVersion).toBe("PLAN-SCOPE-GUARD-SYNTHETIC-FIXTURE-SET-V2");
    expect(fixtureSet.syntheticOnly).toBe(true);
    expect(fixtureSet.canonicalSource).toBe(true);
    expect(fixtureSet.baseline).toBe(BASE_SHA);
    expect(fixtureSet.fixtures).toHaveLength(25);
    expect(new Set(fixtureSet.fixtures.map((fixture) => fixture.id)).size).toBe(25);
  });

  for (const fixture of fixtureSet.fixtures) {
    it(`${fixture.id} ${fixture.scenario}`, async () => {
      const baseInput = buildInput(fixture.patch);

      if (fixture.expected.priorDecisionReusable !== undefined) {
        const first = asEvaluation(await evaluatePlanScopeShadowV1(baseInput));
        const changedInput = buildInput(mergePatch(fixture.patch, fixture.reuseMutation));
        expect(await isScopeEvaluationReusableV1(first, changedInput)).toBe(
          fixture.expected.priorDecisionReusable,
        );
        return;
      }

      const result = await evaluatePlanScopeShadowV1(baseInput);
      if (fixture.expected.resultType === "CONTRACT_REJECTED") {
        expect(isRejected(result)).toBe(true);
        return;
      }

      const evaluation = asEvaluation(result);
      if (fixture.expected.scopeEvaluationStatus !== undefined) {
        expect(evaluation.scopeEvaluationStatus).toBe(fixture.expected.scopeEvaluationStatus);
      }
      if (fixture.expected.scopeDecision === null) {
        expect(evaluation.scopeDecision).toBeUndefined();
      } else if (fixture.expected.scopeDecision !== undefined) {
        expect(evaluation.scopeDecision).toBe(fixture.expected.scopeDecision);
      }
      if (fixture.expected.forbiddenScopeDecision !== undefined) {
        expect(evaluation.scopeDecision).not.toBe(fixture.expected.forbiddenScopeDecision);
      }
      if (fixture.expected.reasonCode !== undefined) {
        expect(evaluation.reasonCodes).toContain(fixture.expected.reasonCode);
      }
      if (fixture.expected.scopeDecisionPresent !== undefined) {
        expect(Object.prototype.hasOwnProperty.call(evaluation, "scopeDecision")).toBe(
          fixture.expected.scopeDecisionPresent,
        );
      }
      expect(evaluation.decisionMode).toBe("SHADOW");
      expect(evaluation.planScopeFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(evaluation.proposedActionFingerprint).toMatch(/^[a-f0-9]{64}$/);
    });
  }

  it("rejects unknown root properties before scope evaluation", async () => {
    const value = { ...buildInput(), unexpected: true };
    expect(parsePlanScopeGuardInputV1(value).ok).toBe(false);
    expect(isRejected(await evaluatePlanScopeShadowV1(value))).toBe(true);
  });

  it("rejects malformed timestamps before scope evaluation", async () => {
    const value = { ...buildInput(), evaluatedAt: "2026-02-30T12:00:00Z" };
    expect(parsePlanScopeGuardInputV1(value).ok).toBe(false);
    expect(isRejected(await evaluatePlanScopeShadowV1(value))).toBe(true);
  });
});
