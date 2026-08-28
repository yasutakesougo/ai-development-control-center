import { parseAgentTaskV1, type AgentTaskV1 } from "./agentTaskContract";
import { canonicalJson } from "./decisionFingerprint";

export const PLAN_SCOPE_GUARD_EVALUATOR_VERSION = "PLAN-SCOPE-GUARD-V1-SLICE-A.2" as const;
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
  | "APPROVAL_RESOLUTION_REQUIRED"
  | "PATH_OUTSIDE_ALLOWED_SCOPE"
  | "CLASSIFICATION_BINDING_INVALID"
  | "CONTRADICTORY_CLASSIFICATION";

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

export interface NecessaryDependencyBindingV1 {
  acceptanceCriterion: string;
  technicalConstraintRef: string;
  requiredChangeRef: string;
}

export interface ScopeEvidenceSourceBindingsV1 {
  explicitInScope: string[];
  acceptanceCriteria: string[];
  explicitOutOfScope: string[];
  necessaryDependency?: NecessaryDependencyBindingV1;
}

/** Classification is evidence only; sourceBindings must resolve against canonical inputs. */
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
  sourceBindings: ScopeEvidenceSourceBindingsV1;
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
  planScopeFingerprint: string;
  approvalResolutionEvidenceRef: string;
  scopeSnapshotIdentity: string;
  proposedActionIdentity: string;
  proposedActionFingerprint: string;
  scopeEvaluationStatus: ScopeEvaluationStatusV1;
  scopeDecision?: ScopeDecisionV1;
  reasonCodes: ScopeReasonCodeV1[];
  evidenceRefs: string[];
  guardActor: string;
  evaluatedAt: string;
}

export interface PlanScopeGuardRejectedV1 {
  schemaVersion: "PLAN-SCOPE-GUARD-REJECTED-V1";
  resultType: "CONTRACT_REJECTED";
  reasonCode: "REJECTED_CONTRACT";
  reasonMessage: string;
}

export type PlanScopeGuardResultV1 = ScopeEvaluationRecordV1 | PlanScopeGuardRejectedV1;

const ROOT_KEYS = ["task", "plan", "approval", "proposedAction", "evidenceRefs", "guardActor", "evaluatedAt"] as const;
const PLAN_KEYS = ["planId", "planVersion", "planIdentity", "scopeSnapshotIdentity", "explicitInScope", "explicitOutOfScope"] as const;
const APPROVAL_KEYS = [
  "approvalResolutionEvidenceId", "planIdentity", "planVersion", "canonicalApprovalContractRef",
  "canonicalApprovalResolverRef", "planApprovalDecisionRef", "planApprovalAuthorityRef",
  "approvalStateSemanticsRef", "resolutionResult", "reasonCode", "resolvedAt", "evidenceRefs", "supersededBy",
] as const;
const ACTION_KEYS = ["proposedActionIdentity", "actionType", "description", "affectedTargets", "justification", "proposedAt", "actor", "classification"] as const;
const CLASSIFICATION_KEYS = [
  "explicitIncluded", "acceptanceRequired", "necessaryDependency", "necessaryDependencyChainComplete",
  "explicitExcluded", "opportunisticWork", "unrequestedGeneralization", "futureOnlyWork", "unplannedDependency",
  "materialPlanChangeRequired", "evidenceSufficient", "evidenceRefs", "sourceBindings",
] as const;
const SOURCE_BINDING_KEYS = ["explicitInScope", "acceptanceCriteria", "explicitOutOfScope", "necessaryDependency"] as const;
const NECESSARY_BINDING_KEYS = ["acceptanceCriterion", "technicalConstraintRef", "requiredChangeRef"] as const;
const ACTION_TYPES: readonly ProposedActionTypeV1[] = [
  "FILE_MODIFICATION", "NEW_FILE", "DEPENDENCY_ADDITION", "REFACTOR", "ARCHITECTURE_CHANGE",
  "INFRASTRUCTURE_CHANGE", "CONFIGURATION_CHANGE", "OTHER",
];
const STRICT_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function hasAllKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function isStringArray(value: unknown, max = 256): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every(isNonEmpty);
}
function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}
function isStrictTimestamp(value: unknown): value is string {
  return isNonEmpty(value) && STRICT_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}
function normalizeRepoPath(value: string): string {
  return value.replace(/^\.\//, "").replace(/\/+$/, "");
}
function isRepoPath(value: unknown): value is string {
  if (!isNonEmpty(value)) return false;
  const normalized = normalizeRepoPath(value);
  return normalized.length > 0 && !normalized.startsWith("/") && !normalized.includes("\\") &&
    normalized.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
function pathWithin(target: string, boundary: string): boolean {
  const t = normalizeRepoPath(target);
  const b = normalizeRepoPath(boundary);
  return t === b || t.startsWith(`${b}/`);
}
function reject(reasonMessage: string): PlanScopeGuardRejectedV1 {
  return { schemaVersion: "PLAN-SCOPE-GUARD-REJECTED-V1", resultType: "CONTRACT_REJECTED", reasonCode: "REJECTED_CONTRACT", reasonMessage };
}

function parsePlan(value: unknown): PlanScopeSnapshotV1 | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, PLAN_KEYS) || !hasAllKeys(value, PLAN_KEYS)) return null;
  if (![value.planId, value.planVersion, value.planIdentity, value.scopeSnapshotIdentity].every(isNonEmpty)) return null;
  if (!isStringArray(value.explicitInScope, 128) || !isStringArray(value.explicitOutOfScope, 128)) return null;
  return value as unknown as PlanScopeSnapshotV1;
}
function parseApproval(value: unknown): ApprovalResolutionEvidenceV1 | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, APPROVAL_KEYS)) return null;
  const required = APPROVAL_KEYS.filter((key) => key !== "supersededBy");
  if (!hasAllKeys(value, required)) return null;
  const requiredStrings = [
    value.approvalResolutionEvidenceId, value.planIdentity, value.planVersion, value.canonicalApprovalContractRef,
    value.canonicalApprovalResolverRef, value.planApprovalDecisionRef, value.planApprovalAuthorityRef,
    value.approvalStateSemanticsRef, value.reasonCode,
  ];
  if (!requiredStrings.every(isNonEmpty)) return null;
  if (!["VALID", "INVALID", "UNKNOWN"].includes(value.resolutionResult as string)) return null;
  if (!isStrictTimestamp(value.resolvedAt) || !isStringArray(value.evidenceRefs, 128)) return null;
  if (value.supersededBy !== undefined && !isNonEmpty(value.supersededBy)) return null;
  return value as unknown as ApprovalResolutionEvidenceV1;
}
function parseSourceBindings(value: unknown): ScopeEvidenceSourceBindingsV1 | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, SOURCE_BINDING_KEYS)) return null;
  if (!hasAllKeys(value, ["explicitInScope", "acceptanceCriteria", "explicitOutOfScope"])) return null;
  if (!isStringArray(value.explicitInScope, 64) || !isStringArray(value.acceptanceCriteria, 64) || !isStringArray(value.explicitOutOfScope, 64)) return null;
  if (value.necessaryDependency !== undefined) {
    const n = value.necessaryDependency;
    if (!isPlainObject(n) || !hasOnlyKeys(n, NECESSARY_BINDING_KEYS) || !hasAllKeys(n, NECESSARY_BINDING_KEYS)) return null;
    if (![n.acceptanceCriterion, n.technicalConstraintRef, n.requiredChangeRef].every(isNonEmpty)) return null;
  }
  return value as unknown as ScopeEvidenceSourceBindingsV1;
}
function parseClassification(value: unknown): ScopeEvidenceClassificationV1 | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, CLASSIFICATION_KEYS) || !hasAllKeys(value, CLASSIFICATION_KEYS)) return null;
  for (const key of CLASSIFICATION_KEYS) {
    if (["evidenceRefs", "sourceBindings"].includes(key)) continue;
    if (!isBoolean(value[key])) return null;
  }
  if (!isStringArray(value.evidenceRefs, 128)) return null;
  const sourceBindings = parseSourceBindings(value.sourceBindings);
  if (!sourceBindings) return null;
  return { ...(value as unknown as Omit<ScopeEvidenceClassificationV1, "sourceBindings">), sourceBindings };
}
function parseAction(value: unknown): ProposedActionV1 | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ACTION_KEYS)) return null;
  const required = ACTION_KEYS.filter((key) => key !== "justification");
  if (!hasAllKeys(value, required)) return null;
  if (![value.proposedActionIdentity, value.description, value.actor].every(isNonEmpty)) return null;
  if (!(ACTION_TYPES as readonly unknown[]).includes(value.actionType)) return null;
  if (!Array.isArray(value.affectedTargets) || value.affectedTargets.length < 1 || value.affectedTargets.length > 256 || !value.affectedTargets.every(isRepoPath)) return null;
  if (value.justification !== undefined && !isNonEmpty(value.justification)) return null;
  if (!isStrictTimestamp(value.proposedAt)) return null;
  const classification = parseClassification(value.classification);
  if (!classification) return null;
  return { ...(value as unknown as Omit<ProposedActionV1, "classification">), classification };
}

export function parsePlanScopeGuardInputV1(value: unknown):
  | { ok: true; input: ScopeEvaluationInputV1 }
  | { ok: false; reasonCode: "REJECTED_CONTRACT"; reasonMessage: string } {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ROOT_KEYS) || !hasAllKeys(value, ROOT_KEYS)) {
    return { ok: false, reasonCode: "REJECTED_CONTRACT", reasonMessage: "Scope Guard input root is malformed or contains unknown properties." };
  }
  const task = parseAgentTaskV1(value.task);
  if (!task.ok) return { ok: false, reasonCode: "REJECTED_CONTRACT", reasonMessage: `AgentTaskV1 invalid: ${task.reasonMessage}` };
  const plan = parsePlan(value.plan);
  if (!plan) return { ok: false, reasonCode: "REJECTED_CONTRACT", reasonMessage: "PlanScopeSnapshotV1 is malformed." };
  const approval = parseApproval(value.approval);
  if (!approval) return { ok: false, reasonCode: "REJECTED_CONTRACT", reasonMessage: "ApprovalResolutionEvidenceV1 is malformed." };
  const proposedAction = parseAction(value.proposedAction);
  if (!proposedAction) return { ok: false, reasonCode: "REJECTED_CONTRACT", reasonMessage: "ProposedActionV1 is malformed." };
  if (!isStringArray(value.evidenceRefs, 256)) return { ok: false, reasonCode: "REJECTED_CONTRACT", reasonMessage: "evidenceRefs must be a bounded non-empty-string array." };
  if (!isNonEmpty(value.guardActor) || !isStrictTimestamp(value.evaluatedAt)) return { ok: false, reasonCode: "REJECTED_CONTRACT", reasonMessage: "guardActor or evaluatedAt is malformed." };
  return { ok: true, input: { task: task.task, plan, approval, proposedAction, evidenceRefs: value.evidenceRefs, guardActor: value.guardActor, evaluatedAt: value.evaluatedAt } };
}

async function sha256Canonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function computePlanScopeFingerprintV1(input: ScopeEvaluationInputV1): Promise<string> {
  return sha256Canonical({
    task: {
      taskId: input.task.taskId,
      repository: input.task.repository,
      baseRevision: input.task.baseRevision,
      objective: input.task.objective,
      allowedPaths: [...input.task.allowedPaths].map(normalizeRepoPath).sort(),
      forbiddenPaths: [...input.task.forbiddenPaths].map(normalizeRepoPath).sort(),
      acceptanceCriteria: [...input.task.acceptanceCriteria],
      constraints: input.task.constraints,
    },
    plan: {
      planId: input.plan.planId,
      planVersion: input.plan.planVersion,
      planIdentity: input.plan.planIdentity,
      scopeSnapshotIdentity: input.plan.scopeSnapshotIdentity,
      explicitInScope: [...input.plan.explicitInScope].sort(),
      explicitOutOfScope: [...input.plan.explicitOutOfScope].sort(),
    },
  });
}

export async function computeProposedActionFingerprintV1(action: ProposedActionV1): Promise<string> {
  return sha256Canonical({
    proposedActionIdentity: action.proposedActionIdentity,
    actionType: action.actionType,
    description: action.description,
    affectedTargets: [...action.affectedTargets].map(normalizeRepoPath).sort(),
    justification: action.justification,
    actor: action.actor,
    classification: {
      ...action.classification,
      evidenceRefs: [...action.classification.evidenceRefs].sort(),
      sourceBindings: {
        explicitInScope: [...action.classification.sourceBindings.explicitInScope].sort(),
        acceptanceCriteria: [...action.classification.sourceBindings.acceptanceCriteria],
        explicitOutOfScope: [...action.classification.sourceBindings.explicitOutOfScope].sort(),
        necessaryDependency: action.classification.sourceBindings.necessaryDependency,
      },
    },
  });
}

function allBindingsResolve(values: string[], canonical: string[]): boolean {
  return values.every((value) => canonical.includes(value));
}

function bindingInvalid(input: ScopeEvaluationInputV1): boolean {
  const c = input.proposedAction.classification;
  const b = c.sourceBindings;
  if (c.explicitIncluded && (b.explicitInScope.length < 1 || !allBindingsResolve(b.explicitInScope, input.plan.explicitInScope))) return true;
  if (c.acceptanceRequired && (b.acceptanceCriteria.length < 1 || !allBindingsResolve(b.acceptanceCriteria, input.task.acceptanceCriteria))) return true;
  if (c.explicitExcluded && (b.explicitOutOfScope.length < 1 || !allBindingsResolve(b.explicitOutOfScope, input.plan.explicitOutOfScope))) return true;
  if (c.necessaryDependency) {
    const n = b.necessaryDependency;
    if (!n || !input.task.acceptanceCriteria.includes(n.acceptanceCriterion)) return true;
    if (!isNonEmpty(n.technicalConstraintRef) || !isNonEmpty(n.requiredChangeRef)) return true;
  }
  return false;
}

function classificationContradictory(input: ScopeEvaluationInputV1): boolean {
  const c = input.proposedAction.classification;
  const positive = c.explicitIncluded || c.acceptanceRequired || c.necessaryDependency;
  const negative = c.opportunisticWork || c.unrequestedGeneralization || c.futureOnlyWork;
  if (positive && negative) return true;
  if (c.materialPlanChangeRequired && c.opportunisticWork) return true;
  if (c.necessaryDependencyChainComplete && !c.necessaryDependency) return true;
  return false;
}

function pathFacts(input: ScopeEvaluationInputV1): { allAllowed: boolean; anyForbidden: boolean } {
  const targets = input.proposedAction.affectedTargets;
  return {
    allAllowed: targets.every((target) => input.task.allowedPaths.some((allowed) => pathWithin(target, allowed))),
    anyForbidden: targets.some((target) => input.task.forbiddenPaths.some((forbidden) => pathWithin(target, forbidden))),
  };
}

function approvalIneligible(input: ScopeEvaluationInputV1): ScopeReasonCodeV1 | null {
  const { approval, plan } = input;
  if (approval.supersededBy) return "APPROVAL_RESOLUTION_REQUIRED";
  if (approval.planIdentity !== plan.planIdentity || approval.planVersion !== plan.planVersion) return "APPROVAL_RESOLUTION_REQUIRED";
  if (approval.resolutionResult === "INVALID") return "PLAN_NOT_APPROVED";
  if (approval.resolutionResult === "UNKNOWN") return "APPROVAL_RESOLUTION_REQUIRED";
  return null;
}

async function baseRecord(input: ScopeEvaluationInputV1): Promise<Omit<ScopeEvaluationRecordV1, "scopeEvaluationStatus" | "reasonCodes">> {
  const planScopeFingerprint = await computePlanScopeFingerprintV1(input);
  const proposedActionFingerprint = await computeProposedActionFingerprintV1(input.proposedAction);
  return {
    schemaVersion: "PLAN-SCOPE-GUARD-SCOPE-EVALUATION-V1",
    evaluatorVersion: PLAN_SCOPE_GUARD_EVALUATOR_VERSION,
    scopeEvaluationId: [PLAN_SCOPE_GUARD_EVALUATOR_VERSION, input.plan.planIdentity, input.plan.scopeSnapshotIdentity, input.approval.approvalResolutionEvidenceId, proposedActionFingerprint].join(":"),
    decisionMode: PLAN_SCOPE_GUARD_DECISION_MODE,
    taskId: input.task.taskId,
    planId: input.plan.planId,
    planVersion: input.plan.planVersion,
    planIdentity: input.plan.planIdentity,
    planScopeFingerprint,
    approvalResolutionEvidenceRef: input.approval.approvalResolutionEvidenceId,
    scopeSnapshotIdentity: input.plan.scopeSnapshotIdentity,
    proposedActionIdentity: input.proposedAction.proposedActionIdentity,
    proposedActionFingerprint,
    evidenceRefs: [...new Set([...input.evidenceRefs, ...input.proposedAction.classification.evidenceRefs])].sort(),
    guardActor: input.guardActor,
    evaluatedAt: input.evaluatedAt,
  };
}

async function notEvaluated(input: ScopeEvaluationInputV1, reasonCode: ScopeReasonCodeV1): Promise<ScopeEvaluationRecordV1> {
  return { ...(await baseRecord(input)), scopeEvaluationStatus: "NOT_EVALUATED", reasonCodes: [reasonCode] };
}
async function evaluated(input: ScopeEvaluationInputV1, scopeDecision: ScopeDecisionV1, reasonCodes: ScopeReasonCodeV1[]): Promise<ScopeEvaluationRecordV1> {
  return { ...(await baseRecord(input)), scopeEvaluationStatus: "EVALUATED", scopeDecision, reasonCodes };
}

export async function evaluatePlanScopeShadowV1(raw: unknown): Promise<PlanScopeGuardResultV1> {
  const parsed = parsePlanScopeGuardInputV1(raw);
  if (!parsed.ok) return reject(parsed.reasonMessage);
  const input = parsed.input;
  const ineligibleReason = approvalIneligible(input);
  if (ineligibleReason) return notEvaluated(input, ineligibleReason);

  const c = input.proposedAction.classification;
  if (!c.evidenceSufficient || c.evidenceRefs.length === 0) return evaluated(input, "UNKNOWN", ["INSUFFICIENT_EVIDENCE"]);
  if (bindingInvalid(input)) return evaluated(input, "UNKNOWN", ["CLASSIFICATION_BINDING_INVALID"]);
  if (classificationContradictory(input)) return evaluated(input, "UNKNOWN", ["CONTRADICTORY_CLASSIFICATION"]);
  if (c.necessaryDependency && !c.necessaryDependencyChainComplete) return evaluated(input, "UNKNOWN", ["INSUFFICIENT_EVIDENCE"]);

  const paths = pathFacts(input);
  const canonicalIncluded = c.explicitIncluded || c.acceptanceRequired || c.necessaryDependency;
  const canonicalExcluded = paths.anyForbidden || c.explicitExcluded;
  if (canonicalExcluded && canonicalIncluded) return evaluated(input, "UNKNOWN", ["CONFLICTING_SCOPE"]);
  if (canonicalExcluded) return evaluated(input, "OUT_OF_SCOPE", ["EXPLICITLY_EXCLUDED"]);
  if (!paths.allAllowed) {
    if (c.materialPlanChangeRequired) return evaluated(input, "SCOPE_EXTENSION_REQUIRED", ["PATH_OUTSIDE_ALLOWED_SCOPE"]);
    return evaluated(input, "OUT_OF_SCOPE", ["PATH_OUTSIDE_ALLOWED_SCOPE"]);
  }
  if (c.explicitIncluded) return evaluated(input, "IN_SCOPE", ["PLAN_EXPLICIT"]);
  if (c.acceptanceRequired) return evaluated(input, "IN_SCOPE", ["AC_REQUIRED"]);
  if (c.necessaryDependency) return evaluated(input, "IN_SCOPE", ["NECESSARY_DEPENDENCY"]);
  if (c.materialPlanChangeRequired) return evaluated(input, "SCOPE_EXTENSION_REQUIRED", ["UNPLANNED_DEPENDENCY"]);
  if (c.opportunisticWork) return evaluated(input, "OUT_OF_SCOPE", ["OPPORTUNISTIC_REFACTOR"]);
  if (c.unrequestedGeneralization) return evaluated(input, "OUT_OF_SCOPE", ["UNREQUESTED_GENERALIZATION"]);
  if (c.futureOnlyWork) return evaluated(input, "OUT_OF_SCOPE", ["FUTURE_ONLY_WORK"]);
  if (c.unplannedDependency) return evaluated(input, "OUT_OF_SCOPE", ["UNPLANNED_DEPENDENCY"]);
  return evaluated(input, "UNKNOWN", ["INSUFFICIENT_EVIDENCE"]);
}

export async function isScopeEvaluationReusableV1(record: ScopeEvaluationRecordV1, raw: unknown): Promise<boolean> {
  const parsed = parsePlanScopeGuardInputV1(raw);
  if (!parsed.ok) return false;
  const input = parsed.input;
  return record.evaluatorVersion === PLAN_SCOPE_GUARD_EVALUATOR_VERSION &&
    record.taskId === input.task.taskId &&
    record.planIdentity === input.plan.planIdentity &&
    record.planVersion === input.plan.planVersion &&
    record.scopeSnapshotIdentity === input.plan.scopeSnapshotIdentity &&
    record.approvalResolutionEvidenceRef === input.approval.approvalResolutionEvidenceId &&
    record.proposedActionIdentity === input.proposedAction.proposedActionIdentity &&
    record.planScopeFingerprint === await computePlanScopeFingerprintV1(input) &&
    record.proposedActionFingerprint === await computeProposedActionFingerprintV1(input.proposedAction);
}
