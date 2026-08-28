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
  type ApprovalResolutionEvidenceV1,
  type PlanScopeSnapshotV1,
  type ProposedActionV1,
  type ScopeEvaluationInputV1,
  type ScopeEvidenceClassificationV1,
} from "../src/domain/planScopeGuard";

const BASE_SHA = "c15dbd60fe51bcb894dc555fee5defb859d3df5f";
const EVALUATED_AT = "2026-08-28T12:02:00+09:00";

function task(overrides: Partial<AgentTaskV1> = {}): AgentTaskV1 {
  return {
    schemaVersion: "AGENT-TASK-V1",
    taskId: "plan-scope-guard-v1-test",
    repository: "yasutakesougo/ai-development-control-center",
    baseRevision: BASE_SHA,
    sourceIssue: {
      repository: "yasutakesougo/ai-development-control-center",
      number: 999,
    },
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

function approval(
  overrides: Partial<ApprovalResolutionEvidenceV1> = {},
): ApprovalResolutionEvidenceV1 {
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

function classification(
  overrides: Partial<ScopeEvidenceClassificationV1> = {},
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
  };
}

function action(overrides: Partial<ProposedActionV1> = {}): ProposedActionV1 {
  return {
    proposedActionIdentity: "action-1",
    actionType: "FILE_MODIFICATION",
    description: "Apply one bounded domain change.",
    affectedTargets: ["src/domain/example.ts"],
    proposedAt: "2026-08-28T12:01:00+09:00",
    actor: "worker://synthetic",
    classification: classification(),
    ...overrides,
  };
}

function input(overrides: Partial<ScopeEvaluationInputV1> = {}): ScopeEvaluationInputV1 {
  return {
    task: task(),
    plan: plan(),
    approval: approval(),
    proposedAction: action(),
    evidenceRefs: ["evidence://input/1"],
    guardActor: "guard://shadow",
    evaluatedAt: EVALUATED_AT,
    ...overrides,
  };
}

describe("PLAN-SCOPE-GUARD-V1 Slice A", () => {
  it("keeps runtime and mutation surfaces disabled", () => {
    expect(PLAN_SCOPE_GUARD_RUNTIME_ENFORCEMENT_IMPLEMENTED).toBe(false);
    expect(PLAN_SCOPE_GUARD_WORKER_STOP_IMPLEMENTED).toBe(false);
    expect(PLAN_SCOPE_GUARD_PLAN_MUTATION_IMPLEMENTED).toBe(false);
    expect(PLAN_SCOPE_GUARD_GITHUB_MUTATION_IMPLEMENTED).toBe(false);
    expect(PLAN_SCOPE_GUARD_READY_IMPLEMENTED).toBe(false);
    expect(PLAN_SCOPE_GUARD_MERGE_IMPLEMENTED).toBe(false);
    expect(PLAN_SCOPE_GUARD_DEPLOY_IMPLEMENTED).toBe(false);
  });

  it("FX-001 Explicit In-Scope → IN_SCOPE / PLAN_EXPLICIT", () => {
    const result = evaluatePlanScopeShadowV1(
      input({ proposedAction: action({ classification: classification({ explicitIncluded: true }) }) }),
    );
    expect(result.scopeEvaluationStatus).toBe("EVALUATED");
    expect(result.scopeDecision).toBe("IN_SCOPE");
    expect(result.reasonCodes).toContain("PLAN_EXPLICIT");
    expect(result.decisionMode).toBe("SHADOW");
  });

  it("FX-002 Acceptance Required → IN_SCOPE / AC_REQUIRED", () => {
    const result = evaluatePlanScopeShadowV1(
      input({ proposedAction: action({ classification: classification({ acceptanceRequired: true }) }) }),
    );
    expect(result.scopeDecision).toBe("IN_SCOPE");
    expect(result.reasonCodes).toContain("AC_REQUIRED");
  });

  it("FX-003 Necessary Dependency → IN_SCOPE only with complete chain", () => {
    const result = evaluatePlanScopeShadowV1(
      input({
        proposedAction: action({
          classification: classification({
            necessaryDependency: true,
            necessaryDependencyChainComplete: true,
          }),
        }),
      }),
    );
    expect(result.scopeDecision).toBe("IN_SCOPE");
    expect(result.reasonCodes).toContain("NECESSARY_DEPENDENCY");
  });

  it("FX-004 Explicit Out-of-Scope → OUT_OF_SCOPE", () => {
    const result = evaluatePlanScopeShadowV1(
      input({ proposedAction: action({ classification: classification({ explicitExcluded: true }) }) }),
    );
    expect(result.scopeDecision).toBe("OUT_OF_SCOPE");
    expect(result.reasonCodes).toContain("EXPLICITLY_EXCLUDED");
  });

  it("FX-005 Necessary + Explicit Exclusion → UNKNOWN / CONFLICTING_SCOPE", () => {
    const result = evaluatePlanScopeShadowV1(
      input({
        proposedAction: action({
          classification: classification({
            explicitExcluded: true,
            necessaryDependency: true,
            necessaryDependencyChainComplete: true,
          }),
        }),
      }),
    );
    expect(result.scopeDecision).toBe("UNKNOWN");
    expect(result.reasonCodes).toContain("CONFLICTING_SCOPE");
  });

  it("FX-006 Opportunistic Fix → OUT_OF_SCOPE", () => {
    const result = evaluatePlanScopeShadowV1(
      input({ proposedAction: action({ classification: classification({ opportunisticWork: true }) }) }),
    );
    expect(result.scopeDecision).toBe("OUT_OF_SCOPE");
    expect(result.reasonCodes).toContain("OPPORTUNISTIC_REFACTOR");
  });

  it("FX-007 Future-only Generalization → OUT_OF_SCOPE", () => {
    const result = evaluatePlanScopeShadowV1(
      input({
        proposedAction: action({
          classification: classification({ unrequestedGeneralization: true }),
        }),
      }),
    );
    expect(result.scopeDecision).toBe("OUT_OF_SCOPE");
    expect(result.reasonCodes).toContain("UNREQUESTED_GENERALIZATION");
  });

  it("FX-008 Rational Scope Extension → SCOPE_EXTENSION_REQUIRED", () => {
    const result = evaluatePlanScopeShadowV1(
      input({
        proposedAction: action({
          classification: classification({
            unplannedDependency: true,
            materialPlanChangeRequired: true,
          }),
        }),
      }),
    );
    expect(result.scopeDecision).toBe("SCOPE_EXTENSION_REQUIRED");
    expect(result.reasonCodes).toContain("UNPLANNED_DEPENDENCY");
  });

  it("FX-009 Evidence Insufficient → UNKNOWN", () => {
    const result = evaluatePlanScopeShadowV1(
      input({
        proposedAction: action({
          classification: classification({ evidenceSufficient: false, evidenceRefs: [] }),
        }),
      }),
    );
    expect(result.scopeDecision).toBe("UNKNOWN");
    expect(result.reasonCodes).toContain("INSUFFICIENT_EVIDENCE");
  });

  it("FX-010 Approval INVALID → NOT_EVALUATED and no scopeDecision", () => {
    const result = evaluatePlanScopeShadowV1(
      input({ approval: approval({ resolutionResult: "INVALID" }) }),
    );
    expect(result.scopeEvaluationStatus).toBe("NOT_EVALUATED");
    expect(result.scopeDecision).toBeUndefined();
    expect(result.reasonCodes).toEqual(["PLAN_NOT_APPROVED"]);
  });

  it("FX-011 Approval UNKNOWN → NOT_EVALUATED and no scopeDecision", () => {
    const result = evaluatePlanScopeShadowV1(
      input({ approval: approval({ resolutionResult: "UNKNOWN" }) }),
    );
    expect(result.scopeEvaluationStatus).toBe("NOT_EVALUATED");
    expect(result.scopeDecision).toBeUndefined();
    expect(result.reasonCodes).toEqual(["APPROVAL_RESOLUTION_REQUIRED"]);
  });

  it("FX-012 Action Identity Changed → prior decision not reusable", () => {
    const base = input({ proposedAction: action({ classification: classification({ explicitIncluded: true }) }) });
    const result = evaluatePlanScopeShadowV1(base);
    const changed: ScopeEvaluationInputV1 = {
      ...base,
      proposedAction: { ...base.proposedAction, proposedActionIdentity: "action-2" },
    };
    expect(isScopeEvaluationReusableV1(result, changed)).toBe(false);
  });

  it("FX-013 Plan Identity Changed → prior decision not reusable", () => {
    const base = input({ proposedAction: action({ classification: classification({ explicitIncluded: true }) }) });
    const result = evaluatePlanScopeShadowV1(base);
    const changed: ScopeEvaluationInputV1 = {
      ...base,
      plan: { ...base.plan, planIdentity: "plan-2-v1" },
    };
    expect(isScopeEvaluationReusableV1(result, changed)).toBe(false);
  });

  it("FX-014 Scope Snapshot Changed → prior decision not reusable", () => {
    const base = input({ proposedAction: action({ classification: classification({ explicitIncluded: true }) }) });
    const result = evaluatePlanScopeShadowV1(base);
    const changed: ScopeEvaluationInputV1 = {
      ...base,
      plan: { ...base.plan, scopeSnapshotIdentity: "scope-2" },
    };
    expect(isScopeEvaluationReusableV1(result, changed)).toBe(false);
  });

  it("NG-001 rejects INVALID → OUT_OF_SCOPE fail-open conversion", () => {
    const result = evaluatePlanScopeShadowV1(
      input({ approval: approval({ resolutionResult: "INVALID" }) }),
    );
    expect(result.scopeDecision).not.toBe("OUT_OF_SCOPE");
    expect(result.scopeEvaluationStatus).toBe("NOT_EVALUATED");
  });

  it("NG-002 rejects Approval UNKNOWN → Scope UNKNOWN conversion", () => {
    const result = evaluatePlanScopeShadowV1(
      input({ approval: approval({ resolutionResult: "UNKNOWN" }) }),
    );
    expect(result.scopeDecision).not.toBe("UNKNOWN");
    expect(result.scopeEvaluationStatus).toBe("NOT_EVALUATED");
  });

  it("NG-003 rejects missing Approval Evidence as evaluable", () => {
    const result = evaluatePlanScopeShadowV1(
      input({ approval: approval({ canonicalApprovalContractRef: "" }) }),
    );
    expect(result.scopeEvaluationStatus).toBe("NOT_EVALUATED");
    expect(result.scopeDecision).toBeUndefined();
  });

  it("NG-004 rejects prior IN_SCOPE reuse after Action identity change", () => {
    const base = input({ proposedAction: action({ classification: classification({ explicitIncluded: true }) }) });
    const result = evaluatePlanScopeShadowV1(base);
    expect(
      isScopeEvaluationReusableV1(result, {
        ...base,
        proposedAction: { ...base.proposedAction, proposedActionIdentity: "changed-action" },
      }),
    ).toBe(false);
  });

  it("NG-005 rejects worker-style inclusion claim overriding explicit exclusion", () => {
    const result = evaluatePlanScopeShadowV1(
      input({
        proposedAction: action({
          justification: "This is required.",
          classification: classification({
            acceptanceRequired: true,
            explicitExcluded: true,
          }),
        }),
      }),
    );
    expect(result.scopeDecision).toBe("UNKNOWN");
    expect(result.reasonCodes).toContain("CONFLICTING_SCOPE");
  });

  it("NG-006 never fabricates scopeDecision on NOT_EVALUATED", () => {
    const result = evaluatePlanScopeShadowV1(
      input({ approval: approval({ resolutionResult: "INVALID" }) }),
    );
    expect(result.scopeEvaluationStatus).toBe("NOT_EVALUATED");
    expect(Object.prototype.hasOwnProperty.call(result, "scopeDecision")).toBe(false);
  });
});
