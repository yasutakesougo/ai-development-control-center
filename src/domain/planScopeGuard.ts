import type { AgentTaskV1 } from "./agentTaskContract";

export const PLAN_SCOPE_GUARD_EVALUATOR_VERSION = "PLAN-SCOPE-GUARD-V1-SLICE-A.1" as const;
export const PLAN_SCOPE_GUARD_DECISION_MODE = "SHADOW" as const;

/** Slice A is observation/evaluation only. */
export const PLAN_SCOPE_GUARD_RUNTIME_ENFORCEMENT_IMPLEMENTED = false as const;
export const PLAN_SCOPE_GUARD_WORKER_STOP_IMPLEMENTED = false as const;
export const PLAN_SCOPE_GUARD_PLAN_MUTATION_IMPLEMENTED = false as const;
export const PLAN_SCOPE_GUARD_GITHUB_MUTATION_IMPLEMENTED = false as const;
export const PLAN_SCOPE_GUARD_READY_IMPLEMENTED = false as const;
export const PLAN_SCOPE_GUARD_MERGE_IMPLEMENTED = false as const;
export const PLAN_SCOPE_GUARD_DEPLOY_IMPLEMENTED = false as const;

export type ApprovalResolutionResultV1 = "VALID" | "INVALID" | "UNKNOWN";
export type ScopeEvaluationStatusV1 = "EVALUATED" | "NOT_EVALUATED";
export type ScopeDecisionV1 =
  | "IN_SCOPE"
  | "SCOPE_EXTENSION_REQUIRED"
  | "OUT_OF_SCOPE"
  | "UNKNOWN";

export type ScopeReasonCodeV1 =
  | "PLAN_EXPLICIT"
  | "AC_REQUIRED"
  | "NECESSARY_DEPENDENCY"
  | "EXPLICITLY_EXCLUDED"
  | "CONFLICTING_SCOPE"
  | "UNREQUESTED_GENERALIZATION"
  | "OPPORTUNISTIC_REFACTOR"
  | "FUTURE_ONLY_WORK"
  | "UNPLANNED_DEPENDENCY"
  | "INSUFFICIENT_EVIDENCE"
  | "PLAN_NOT_APPROVED"
  | "APPROVAL_RESOLUTION_REQUIRED";

export type ProposedActionTypeV1 =
  | "FILE_MODIFICATION"
  | "NEW_FILE"
  | "DEPENDENCY_ADDITION"
  | "REFACTOR"
  | "ARCHITECTURE_CHANGE"
  | "INFRASTRUCTURE_CHANGE"
  | "CONFIGURATION_CHANGE"
  | "OTHER";

export interface PlanScopeSnapshotV1 {
  planId: string;
  planVersion: string;
  planIdentity: string;
  scopeSnapshotIdentity: string;
  explicitInScope: string[];
  explicitOutOfScope: string[];
}

export interface ApprovalResolutionEvidenceV1 {
  approvalResolutionEvidenceId: string;
  planIdentity: string;
  planVersion: string;
  canonicalApprovalContractRef: string;
  canonicalApprovalResolverRef: string;
  planApprovalDecisionRef: string;
  planApprovalAuthorityRef: string;
  approvalStateSemanticsRef: string;
  resolutionResult: ApprovalResolutionResultV1;
  reasonCode: string;
  resolvedAt: string;
  evidenceRefs: string[];
  supersededBy?: string;
}

/**
 * Evidence classification is an input observation, not authority. Slice A does
 * not infer these flags from keywords and never lets worker justification alone
 * establish a scope decision.
 */
export interface ScopeEvidenceClassificationV1 {
  explicitIncluded: boolean;
  acceptanceRequired: boolean;
  necessaryDependency: boolean;
  necessaryDependencyChainComplete: boolean;
  explicitExcluded: boolean;
  opportunisticWork: boolean;
  unrequestedGeneralization: boolean;
  futureOnlyWork: boolean;
  unplannedDependency: boolean;
  materialPlanChangeRequired: boolean;
  evidenceSufficient: boolean;
  evidenceRefs: string[];
}

export interface ProposedActionV1 {
  proposedActionIdentity: string;
  actionType: ProposedActionTypeV1;
  description: string;
  affectedTargets: string[];
  justification?: string;
  proposedAt: string;
  actor: string;
  classification: ScopeEvidenceClassificationV1;
}

export interface ScopeEvaluationInputV1 {
  task: AgentTaskV1;
  plan: PlanScopeSnapshotV1;
  approval: ApprovalResolutionEvidenceV1;
  proposedAction: ProposedActionV1;
  evidenceRefs: string[];
  guardActor: string;
  evaluatedAt: string;
}

export interface ScopeEvaluationRecordV1 {
  schemaVersion: "PLAN-SCOPE-GUARD-SCOPE-EVALUATION-V1";
  evaluatorVersion: typeof PLAN_SCOPE_GUARD_EVALUATOR_VERSION;
  scopeEvaluationId: string;
  decisionMode: typeof PLAN_SCOPE_GUARD_DECISION_MODE;
  taskId: string;
  planId: string;
  planVersion: string;
  planIdentity: string;
  approvalResolutionEvidenceRef: string;
  scopeSnapshotIdentity: string;
  proposedActionIdentity: string;
  scopeEvaluationStatus: ScopeEvaluationStatusV1;
  scopeDecision?: ScopeDecisionV1;
  reasonCodes: ScopeReasonCodeV1[];
  evidenceRefs: string[];
  guardActor: string;
  evaluatedAt: string;
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function approvalEvidenceComplete(value: ApprovalResolutionEvidenceV1): boolean {
  return [
    value.approvalResolutionEvidenceId,
    value.planIdentity,
    value.planVersion,
    value.canonicalApprovalContractRef,
    value.canonicalApprovalResolverRef,
    value.planApprovalDecisionRef,
    value.planApprovalAuthorityRef,
    value.approvalStateSemanticsRef,
    value.resolvedAt,
  ].every(isNonEmpty);
}

function evaluationId(input: ScopeEvaluationInputV1): string {
  return [
    PLAN_SCOPE_GUARD_EVALUATOR_VERSION,
    input.plan.planIdentity,
    input.plan.scopeSnapshotIdentity,
    input.approval.approvalResolutionEvidenceId,
    input.proposedAction.proposedActionIdentity,
  ].join(":");
}

function baseRecord(
  input: ScopeEvaluationInputV1,
): Omit<ScopeEvaluationRecordV1, "scopeEvaluationStatus" | "reasonCodes"> {
  return {
    schemaVersion: "PLAN-SCOPE-GUARD-SCOPE-EVALUATION-V1",
    evaluatorVersion: PLAN_SCOPE_GUARD_EVALUATOR_VERSION,
    scopeEvaluationId: evaluationId(input),
    decisionMode: PLAN_SCOPE_GUARD_DECISION_MODE,
    taskId: input.task.taskId,
    planId: input.plan.planId,
    planVersion: input.plan.planVersion,
    planIdentity: input.plan.planIdentity,
    approvalResolutionEvidenceRef: input.approval.approvalResolutionEvidenceId,
    scopeSnapshotIdentity: input.plan.scopeSnapshotIdentity,
    proposedActionIdentity: input.proposedAction.proposedActionIdentity,
    evidenceRefs: [
      ...new Set([
        ...input.evidenceRefs,
        ...input.proposedAction.classification.evidenceRefs,
      ]),
    ].sort(),
    guardActor: input.guardActor,
    evaluatedAt: input.evaluatedAt,
  };
}

function notEvaluated(
  input: ScopeEvaluationInputV1,
  reasonCode: ScopeReasonCodeV1,
): ScopeEvaluationRecordV1 {
  return {
    ...baseRecord(input),
    scopeEvaluationStatus: "NOT_EVALUATED",
    reasonCodes: [reasonCode],
  };
}

function evaluated(
  input: ScopeEvaluationInputV1,
  scopeDecision: ScopeDecisionV1,
  reasonCodes: ScopeReasonCodeV1[],
): ScopeEvaluationRecordV1 {
  return {
    ...baseRecord(input),
    scopeEvaluationStatus: "EVALUATED",
    scopeDecision,
    reasonCodes,
  };
}

function approvalEligible(input: ScopeEvaluationInputV1): ScopeReasonCodeV1 | null {
  const { approval, plan } = input;
  if (!approvalEvidenceComplete(approval)) return "APPROVAL_RESOLUTION_REQUIRED";
  if (approval.supersededBy) return "APPROVAL_RESOLUTION_REQUIRED";
  if (
    approval.planIdentity !== plan.planIdentity ||
    approval.planVersion !== plan.planVersion
  ) {
    return "APPROVAL_RESOLUTION_REQUIRED";
  }
  if (approval.resolutionResult === "INVALID") return "PLAN_NOT_APPROVED";
  if (approval.resolutionResult === "UNKNOWN") {
    return "APPROVAL_RESOLUTION_REQUIRED";
  }
  return null;
}

export function evaluatePlanScopeShadowV1(
  input: ScopeEvaluationInputV1,
): ScopeEvaluationRecordV1 {
  const ineligibleReason = approvalEligible(input);
  if (ineligibleReason) return notEvaluated(input, ineligibleReason);

  const c = input.proposedAction.classification;
  if (!c.evidenceSufficient || c.evidenceRefs.length === 0) {
    return evaluated(input, "UNKNOWN", ["INSUFFICIENT_EVIDENCE"]);
  }

  if (c.necessaryDependency && !c.necessaryDependencyChainComplete) {
    return evaluated(input, "UNKNOWN", ["INSUFFICIENT_EVIDENCE"]);
  }

  const included = c.explicitIncluded || c.acceptanceRequired || c.necessaryDependency;
  if (c.explicitExcluded && included) {
    return evaluated(input, "UNKNOWN", ["CONFLICTING_SCOPE"]);
  }

  if (c.explicitExcluded) {
    return evaluated(input, "OUT_OF_SCOPE", ["EXPLICITLY_EXCLUDED"]);
  }

  if (c.explicitIncluded) {
    return evaluated(input, "IN_SCOPE", ["PLAN_EXPLICIT"]);
  }

  if (c.acceptanceRequired) {
    return evaluated(input, "IN_SCOPE", ["AC_REQUIRED"]);
  }

  if (c.necessaryDependency) {
    return evaluated(input, "IN_SCOPE", ["NECESSARY_DEPENDENCY"]);
  }

  if (c.materialPlanChangeRequired) {
    return evaluated(input, "SCOPE_EXTENSION_REQUIRED", ["UNPLANNED_DEPENDENCY"]);
  }

  if (c.opportunisticWork) {
    return evaluated(input, "OUT_OF_SCOPE", ["OPPORTUNISTIC_REFACTOR"]);
  }

  if (c.unrequestedGeneralization) {
    return evaluated(input, "OUT_OF_SCOPE", ["UNREQUESTED_GENERALIZATION"]);
  }

  if (c.futureOnlyWork) {
    return evaluated(input, "OUT_OF_SCOPE", ["FUTURE_ONLY_WORK"]);
  }

  if (c.unplannedDependency) {
    return evaluated(input, "OUT_OF_SCOPE", ["UNPLANNED_DEPENDENCY"]);
  }

  return evaluated(input, "UNKNOWN", ["INSUFFICIENT_EVIDENCE"]);
}

export function isScopeEvaluationReusableV1(
  record: ScopeEvaluationRecordV1,
  input: ScopeEvaluationInputV1,
): boolean {
  return (
    record.evaluatorVersion === PLAN_SCOPE_GUARD_EVALUATOR_VERSION &&
    record.taskId === input.task.taskId &&
    record.planIdentity === input.plan.planIdentity &&
    record.planVersion === input.plan.planVersion &&
    record.scopeSnapshotIdentity === input.plan.scopeSnapshotIdentity &&
    record.approvalResolutionEvidenceRef ===
      input.approval.approvalResolutionEvidenceId &&
    record.proposedActionIdentity === input.proposedAction.proposedActionIdentity
  );
}
