/**
 * PROJECT-CONTRACT-V1 design contract helpers.
 *
 * DESIGNED · CONTRACT ONLY · NO PLANNER · NO ROADMAP GENERATION ·
 * NO ISSUE PROPOSAL · NO GITHUB ISSUE MUTATION · NO AGENT EXECUTION
 *
 * Pure parse / validate / fingerprint for the machine-readable project
 * source of truth. Does not invoke an LLM, generate roadmaps/issues, or
 * mutate GitHub.
 */

import { canonicalJson } from "./decisionFingerprint";

export const PROJECT_CONTRACT_SCHEMA = "PROJECT-CONTRACT-V1" as const;
export const PROJECT_CONTRACT_VALIDATION_RESULT_SCHEMA =
  "PROJECT-CONTRACT-VALIDATION-RESULT-V1" as const;

/** Downstream planning / mutation surfaces remain unimplemented in this slice. */
export const PROJECT_PLANNER_IMPLEMENTED = false as const;
export const PROJECT_ROADMAP_GENERATION_IMPLEMENTED = false as const;
export const PROJECT_ISSUE_PROPOSAL_GENERATION_IMPLEMENTED = false as const;
export const PROJECT_GITHUB_ISSUE_MUTATION_IMPLEMENTED = false as const;
export const PROJECT_AGENT_EXECUTION_IMPLEMENTED = false as const;

export const PROJECT_CONTRACT_RISK_CLASSES = [
  "R0",
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
] as const;

export const PROJECT_REPOSITORY_ROLES = [
  "PRIMARY",
  "SECONDARY",
  "OBSERVED",
] as const;

export const PROJECT_CONTRACT_PROJECT_ID_MAX = 128 as const;
export const PROJECT_CONTRACT_NAME_MAX = 256 as const;
export const PROJECT_CONTRACT_OBJECTIVE_MAX = 4096 as const;
export const PROJECT_CONTRACT_PROBLEM_STATEMENT_MAX = 8192 as const;
export const PROJECT_CONTRACT_ACTORS_MAX = 64 as const;
export const PROJECT_CONTRACT_ACTOR_MAX = 256 as const;
export const PROJECT_CONTRACT_CRITERIA_MAX = 64 as const;
export const PROJECT_CONTRACT_CRITERION_MAX = 2048 as const;
export const PROJECT_CONTRACT_SCOPE_ITEMS_MAX = 128 as const;
export const PROJECT_CONTRACT_SCOPE_ITEM_MAX = 2048 as const;
export const PROJECT_CONTRACT_REPOSITORIES_MAX = 32 as const;
export const PROJECT_CONTRACT_CONSTRAINT_NOTES_MAX = 16 as const;
export const PROJECT_CONTRACT_CONSTRAINT_NOTE_MAX = 1024 as const;
export const PROJECT_CONTRACT_PROHIBITED_CAPABILITIES_MAX = 64 as const;
export const PROJECT_CONTRACT_FINDINGS_MAX = 64 as const;
export const PROJECT_CONTRACT_FINDING_PATH_MAX = 512 as const;
export const PROJECT_CONTRACT_FINDING_CODE_MAX = 128 as const;
export const PROJECT_CONTRACT_FINDING_MESSAGE_MAX = 2048 as const;
export const PROJECT_CONTRACT_REASON_CODE_MAX = 128 as const;
export const PROJECT_CONTRACT_REASON_MESSAGE_MAX = 2048 as const;

/** Exact root keys accepted by ProjectContractV1 (additionalProperties: false). */
export const PROJECT_CONTRACT_ROOT_KEYS = [
  "schemaVersion",
  "projectId",
  "name",
  "objective",
  "problemStatement",
  "users",
  "successCriteria",
  "inScope",
  "outOfScope",
  "constraints",
  "repositories",
  "humanGatePolicy",
  "metadata",
] as const;

export const PROJECT_CONTRACT_CONSTRAINTS_KEYS = [
  "maxRiskClass",
  "prohibitedCapabilities",
  "maxRepositories",
  "requireIndependentVerify",
  "notes",
] as const;

export const PROJECT_CONTRACT_REPOSITORY_REF_KEYS = [
  "repository",
  "role",
  "defaultBranch",
] as const;

export const PROJECT_CONTRACT_HUMAN_GATE_POLICY_KEYS = [
  "readyRequiresHuman",
  "mergeRequiresHuman",
  "issueCloseRequiresHuman",
  "deployRequiresHuman",
] as const;

/**
 * Authority fingerprint includes every Human-gate field.
 * Audit-only metadata (including observedAt) is excluded.
 */
export const PROJECT_CONTRACT_AUTHORITY_FINGERPRINT_KEYS = [
  "schemaVersion",
  "projectId",
  "name",
  "objective",
  "problemStatement",
  "users",
  "successCriteria",
  "inScope",
  "outOfScope",
  "constraints",
  "repositories",
  "humanGatePolicy",
] as const;

export const PROJECT_CONTRACT_METADATA_KEYS = [
  "createdAt",
  "createdBy",
  "observedAt",
  "sourceIssueUrl",
  "notes",
] as const;

export const PROJECT_CONTRACT_VALIDATION_RESULT_ROOT_KEYS = [
  "schemaVersion",
  "projectId",
  "status",
  "reasonCode",
  "reasonMessage",
  "findings",
  "authorityFingerprint",
  "validatedAt",
] as const;

export type ProjectContractRiskClass =
  (typeof PROJECT_CONTRACT_RISK_CLASSES)[number];
export type ProjectRepositoryRole =
  (typeof PROJECT_REPOSITORY_ROLES)[number];

export type ProjectContractValidationStatus =
  | "VALID"
  | "INVALID"
  | "HOLD"
  | "UNKNOWN";

export type ProjectContractRejectReason =
  | "REJECTED_SCHEMA"
  | "REJECTED_PROJECT_ID"
  | "REJECTED_NAME"
  | "REJECTED_OBJECTIVE"
  | "REJECTED_PROBLEM_STATEMENT"
  | "REJECTED_USERS"
  | "REJECTED_SUCCESS_CRITERIA"
  | "REJECTED_SCOPE"
  | "REJECTED_SCOPE_CONFLICT"
  | "REJECTED_CONSTRAINTS"
  | "REJECTED_REPOSITORIES"
  | "REJECTED_HUMAN_GATE_POLICY"
  | "REJECTED_METADATA";

export interface ProjectRepositoryRefV1 {
  repository: string;
  role: ProjectRepositoryRole;
  defaultBranch?: string;
}

export interface ProjectContractConstraintsV1 {
  maxRiskClass?: ProjectContractRiskClass;
  prohibitedCapabilities?: string[];
  maxRepositories?: number;
  requireIndependentVerify?: boolean;
  notes?: string[];
}

/**
 * Explicit Human-gate policy as data.
 * The contract never grants Ready / Merge / IssueClose / Deploy authority;
 * V1 semantic validation requires all four flags to remain true.
 */
export interface ProjectHumanGatePolicyV1 {
  readyRequiresHuman: boolean;
  mergeRequiresHuman: boolean;
  issueCloseRequiresHuman: boolean;
  deployRequiresHuman: boolean;
}

/**
 * Audit / observation metadata. Never part of the authority fingerprint.
 * observedAt is explicitly audit-only.
 */
export interface ProjectContractMetadataV1 {
  createdAt?: string;
  createdBy?: string;
  observedAt?: string;
  sourceIssueUrl?: string;
  notes?: string[];
}

export interface ProjectContractV1 {
  schemaVersion: typeof PROJECT_CONTRACT_SCHEMA;
  projectId: string;
  name: string;
  objective: string;
  problemStatement: string;
  users: string[];
  successCriteria: string[];
  inScope: string[];
  outOfScope: string[];
  constraints: ProjectContractConstraintsV1;
  repositories: ProjectRepositoryRefV1[];
  humanGatePolicy: ProjectHumanGatePolicyV1;
  metadata?: ProjectContractMetadataV1;
}

export interface ProjectContractAuthorityFactsV1 {
  schemaVersion: typeof PROJECT_CONTRACT_SCHEMA;
  projectId: string;
  name: string;
  objective: string;
  problemStatement: string;
  users: string[];
  successCriteria: string[];
  inScope: string[];
  outOfScope: string[];
  constraints: ProjectContractConstraintsV1;
  repositories: ProjectRepositoryRefV1[];
  humanGatePolicy: ProjectHumanGatePolicyV1;
}

export interface ProjectContractValidationFinding {
  path: string;
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
}

export interface ProjectContractValidationResultV1 {
  schemaVersion: typeof PROJECT_CONTRACT_VALIDATION_RESULT_SCHEMA;
  projectId: string | null;
  status: ProjectContractValidationStatus;
  reasonCode: string;
  reasonMessage: string;
  findings?: ProjectContractValidationFinding[];
  /** Present only when structural parse succeeded and fingerprint was computed. */
  authorityFingerprint?: string;
  validatedAt: string;
}

const REPOSITORY_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const DEFAULT_BRANCH_PATTERN = /^[a-zA-Z0-9._\/-]{1,256}$/;
/**
 * Capability ids are dotted, version-suffixed identifiers.
 * Matches AGENT-TASK-V1 so project constraints can name the same capabilities.
 */
const CAPABILITY_ID_PATTERN =
  /^[a-z][a-z0-9]*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+\.v[0-9]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isRepository(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 256 &&
    REPOSITORY_PATTERN.test(value)
  );
}

function isProjectId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= PROJECT_CONTRACT_PROJECT_ID_MAX &&
    PROJECT_ID_PATTERN.test(value)
  );
}

function isRiskClass(value: unknown): value is ProjectContractRiskClass {
  return (PROJECT_CONTRACT_RISK_CLASSES as readonly string[]).includes(
    value as string,
  );
}

function isRepositoryRole(value: unknown): value is ProjectRepositoryRole {
  return (PROJECT_REPOSITORY_ROLES as readonly string[]).includes(
    value as string,
  );
}

function isCapabilityId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    CAPABILITY_ID_PATTERN.test(value)
  );
}

function hasDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const value of values) {
    if (seen.has(value)) duplicates.push(value);
    seen.add(value);
  }
  return duplicates;
}

function isNonEmptyBoundedString(
  value: unknown,
  max: number,
): value is string {
  return (
    typeof value === "string" && value.length >= 1 && value.length <= max
  );
}

function isStringArray(
  value: unknown,
  maxItems: number,
  maxItemLen: number,
  minItems: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minItems &&
    value.length <= maxItems &&
    value.every((item) => isNonEmptyBoundedString(item, maxItemLen))
  );
}

function isConstraints(value: unknown): value is ProjectContractConstraintsV1 {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, PROJECT_CONTRACT_CONSTRAINTS_KEYS)) return false;
  if (value.maxRiskClass !== undefined && !isRiskClass(value.maxRiskClass)) {
    return false;
  }
  if (value.prohibitedCapabilities !== undefined) {
    if (
      !Array.isArray(value.prohibitedCapabilities) ||
      value.prohibitedCapabilities.length >
        PROJECT_CONTRACT_PROHIBITED_CAPABILITIES_MAX ||
      !value.prohibitedCapabilities.every(isCapabilityId)
    ) {
      return false;
    }
    if (hasDuplicates(value.prohibitedCapabilities as string[]).length > 0) {
      return false;
    }
  }
  if (
    value.maxRepositories !== undefined &&
    (typeof value.maxRepositories !== "number" ||
      !Number.isInteger(value.maxRepositories) ||
      value.maxRepositories < 1 ||
      value.maxRepositories > PROJECT_CONTRACT_REPOSITORIES_MAX)
  ) {
    return false;
  }
  if (
    value.requireIndependentVerify !== undefined &&
    typeof value.requireIndependentVerify !== "boolean"
  ) {
    return false;
  }
  if (value.notes !== undefined) {
    if (
      !isStringArray(
        value.notes,
        PROJECT_CONTRACT_CONSTRAINT_NOTES_MAX,
        PROJECT_CONTRACT_CONSTRAINT_NOTE_MAX,
        0,
      )
    ) {
      return false;
    }
  }
  return true;
}

function isRepositoryRef(value: unknown): value is ProjectRepositoryRefV1 {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, PROJECT_CONTRACT_REPOSITORY_REF_KEYS)) return false;
  if (!isRepository(value.repository)) return false;
  if (!isRepositoryRole(value.role)) return false;
  if (
    value.defaultBranch !== undefined &&
    (typeof value.defaultBranch !== "string" ||
      !DEFAULT_BRANCH_PATTERN.test(value.defaultBranch))
  ) {
    return false;
  }
  return true;
}

function isHumanGatePolicy(value: unknown): value is ProjectHumanGatePolicyV1 {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, PROJECT_CONTRACT_HUMAN_GATE_POLICY_KEYS)) return false;
  for (const key of PROJECT_CONTRACT_HUMAN_GATE_POLICY_KEYS) {
    if (typeof value[key] !== "boolean") return false;
  }
  return true;
}

function isMetadata(value: unknown): value is ProjectContractMetadataV1 {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, PROJECT_CONTRACT_METADATA_KEYS)) return false;
  if (
    value.createdAt !== undefined &&
    !isNonEmptyBoundedString(value.createdAt, 64)
  ) {
    return false;
  }
  if (
    value.createdBy !== undefined &&
    !isNonEmptyBoundedString(value.createdBy, 256)
  ) {
    return false;
  }
  if (
    value.observedAt !== undefined &&
    !isNonEmptyBoundedString(value.observedAt, 64)
  ) {
    return false;
  }
  if (
    value.sourceIssueUrl !== undefined &&
    !isNonEmptyBoundedString(value.sourceIssueUrl, 2048)
  ) {
    return false;
  }
  if (value.notes !== undefined) {
    if (
      !isStringArray(
        value.notes,
        PROJECT_CONTRACT_CONSTRAINT_NOTES_MAX,
        PROJECT_CONTRACT_CONSTRAINT_NOTE_MAX,
        0,
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Raw document body → JSON value. Syntax errors become REJECTED_SCHEMA (never throw).
 */
export function parseProjectContractJsonBody(raw: unknown):
  | { ok: true; value: unknown }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (typeof raw !== "string") {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Project contract body must be a UTF-8 JSON string.",
    };
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Project contract body is not valid JSON syntax.",
    };
  }
}

/**
 * Structural fail-closed parse for ProjectContractV1 documents.
 * Mirrors docs/project-contract/schemas/project-contract-v1.schema.json including
 * additionalProperties:false on all objects.
 */
export function parseProjectContractV1(
  value: unknown,
):
  | { ok: true; contract: ProjectContractV1 }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Project contract must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, PROJECT_CONTRACT_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "Project contract contains unknown properties (additionalProperties forbidden).",
    };
  }
  if (value.schemaVersion !== PROJECT_CONTRACT_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `schemaVersion must be ${PROJECT_CONTRACT_SCHEMA}.`,
    };
  }
  if (!isProjectId(value.projectId)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "projectId is missing or malformed.",
    };
  }
  if (!isNonEmptyBoundedString(value.name, PROJECT_CONTRACT_NAME_MAX)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "name must be a non-empty bounded string.",
    };
  }
  if (
    !isNonEmptyBoundedString(value.objective, PROJECT_CONTRACT_OBJECTIVE_MAX)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "objective must be a non-empty bounded string.",
    };
  }
  if (
    !isNonEmptyBoundedString(
      value.problemStatement,
      PROJECT_CONTRACT_PROBLEM_STATEMENT_MAX,
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "problemStatement must be a non-empty bounded string.",
    };
  }
  if (
    !isStringArray(
      value.users,
      PROJECT_CONTRACT_ACTORS_MAX,
      PROJECT_CONTRACT_ACTOR_MAX,
      1,
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "users must contain at least one non-empty bounded actor string.",
    };
  }
  if (hasDuplicates(value.users as string[]).length > 0) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "users contains duplicate entries.",
    };
  }
  if (
    !isStringArray(
      value.successCriteria,
      PROJECT_CONTRACT_CRITERIA_MAX,
      PROJECT_CONTRACT_CRITERION_MAX,
      1,
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "successCriteria must contain at least one non-empty bounded string.",
    };
  }
  if (hasDuplicates(value.successCriteria as string[]).length > 0) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "successCriteria contains duplicate entries.",
    };
  }
  if (
    !isStringArray(
      value.inScope,
      PROJECT_CONTRACT_SCOPE_ITEMS_MAX,
      PROJECT_CONTRACT_SCOPE_ITEM_MAX,
      1,
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "inScope must contain at least one non-empty bounded string.",
    };
  }
  if (hasDuplicates(value.inScope as string[]).length > 0) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "inScope contains duplicate entries.",
    };
  }
  if (
    !isStringArray(
      value.outOfScope,
      PROJECT_CONTRACT_SCOPE_ITEMS_MAX,
      PROJECT_CONTRACT_SCOPE_ITEM_MAX,
      1,
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "outOfScope must contain at least one non-empty bounded string.",
    };
  }
  if (hasDuplicates(value.outOfScope as string[]).length > 0) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "outOfScope contains duplicate entries.",
    };
  }
  if (!isConstraints(value.constraints)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "constraints object is missing or malformed.",
    };
  }
  if (
    !Array.isArray(value.repositories) ||
    value.repositories.length < 1 ||
    value.repositories.length > PROJECT_CONTRACT_REPOSITORIES_MAX ||
    !value.repositories.every(isRepositoryRef)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "repositories must contain at least one well-formed repository reference.",
    };
  }
  if (!isHumanGatePolicy(value.humanGatePolicy)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "humanGatePolicy is missing or malformed.",
    };
  }
  if (value.metadata !== undefined && !isMetadata(value.metadata)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "metadata object is malformed.",
    };
  }

  return {
    ok: true,
    contract: {
      schemaVersion: PROJECT_CONTRACT_SCHEMA,
      projectId: value.projectId,
      name: value.name,
      objective: value.objective,
      problemStatement: value.problemStatement,
      users: value.users as string[],
      successCriteria: value.successCriteria as string[],
      inScope: value.inScope as string[],
      outOfScope: value.outOfScope as string[],
      constraints: value.constraints as ProjectContractConstraintsV1,
      repositories: value.repositories as ProjectRepositoryRefV1[],
      humanGatePolicy: value.humanGatePolicy as ProjectHumanGatePolicyV1,
      metadata: value.metadata as ProjectContractMetadataV1 | undefined,
    },
  };
}

/**
 * Authority-bearing facts only. Excludes metadata (including observedAt).
 * Arrays are copied; callers must not mutate the returned object as a shared cache.
 */
export function captureProjectContractAuthorityFacts(
  contract: ProjectContractV1,
): ProjectContractAuthorityFactsV1 {
  return {
    schemaVersion: contract.schemaVersion,
    projectId: contract.projectId,
    name: contract.name,
    objective: contract.objective,
    problemStatement: contract.problemStatement,
    users: [...contract.users],
    successCriteria: [...contract.successCriteria],
    inScope: [...contract.inScope],
    outOfScope: [...contract.outOfScope],
    constraints: {
      ...(contract.constraints.maxRiskClass !== undefined
        ? { maxRiskClass: contract.constraints.maxRiskClass }
        : {}),
      ...(contract.constraints.prohibitedCapabilities !== undefined
        ? {
            prohibitedCapabilities: [
              ...contract.constraints.prohibitedCapabilities,
            ],
          }
        : {}),
      ...(contract.constraints.maxRepositories !== undefined
        ? { maxRepositories: contract.constraints.maxRepositories }
        : {}),
      ...(contract.constraints.requireIndependentVerify !== undefined
        ? {
            requireIndependentVerify:
              contract.constraints.requireIndependentVerify,
          }
        : {}),
      ...(contract.constraints.notes !== undefined
        ? { notes: [...contract.constraints.notes] }
        : {}),
    },
    repositories: contract.repositories.map((ref) => ({
      repository: ref.repository,
      role: ref.role,
      ...(ref.defaultBranch !== undefined
        ? { defaultBranch: ref.defaultBranch }
        : {}),
    })),
    humanGatePolicy: {
      readyRequiresHuman: contract.humanGatePolicy.readyRequiresHuman,
      mergeRequiresHuman: contract.humanGatePolicy.mergeRequiresHuman,
      issueCloseRequiresHuman: contract.humanGatePolicy.issueCloseRequiresHuman,
      deployRequiresHuman: contract.humanGatePolicy.deployRequiresHuman,
    },
  };
}

/**
 * Deterministic SHA-256 hex over canonical JSON of authority facts.
 * metadata / observedAt never participate.
 */
export async function computeProjectContractAuthorityFingerprint(
  contract: ProjectContractV1,
): Promise<string> {
  const facts = captureProjectContractAuthorityFacts(contract);
  const canonical = canonicalJson(facts);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function projectContractAuthorityFingerprintsEqual(
  a: string,
  b: string,
): boolean {
  return a === b;
}

export interface ValidateProjectContractOptions {
  validatedAt?: string;
}

function buildValidationResult(input: {
  projectId: string | null;
  status: ProjectContractValidationStatus;
  reasonCode: string;
  reasonMessage: string;
  findings?: ProjectContractValidationFinding[];
  authorityFingerprint?: string;
  validatedAt: string;
}): ProjectContractValidationResultV1 {
  return {
    schemaVersion: PROJECT_CONTRACT_VALIDATION_RESULT_SCHEMA,
    projectId: input.projectId,
    status: input.status,
    reasonCode: input.reasonCode,
    reasonMessage: input.reasonMessage,
    findings: input.findings,
    authorityFingerprint: input.authorityFingerprint,
    validatedAt: input.validatedAt,
  };
}

/**
 * Semantic validation for a structurally parsed ProjectContractV1.
 * Never generates roadmaps, issues, or mutates external state.
 */
export async function validateProjectContractV1(
  contract: ProjectContractV1,
  options: ValidateProjectContractOptions = {},
): Promise<ProjectContractValidationResultV1> {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const findings: ProjectContractValidationFinding[] = [];
  const authorityFingerprint =
    await computeProjectContractAuthorityFingerprint(contract);

  const scopeOverlap = contract.inScope.filter((item) =>
    contract.outOfScope.includes(item),
  );
  for (const item of scopeOverlap) {
    findings.push({
      path: "inScope/outOfScope",
      code: "REJECTED_SCOPE_CONFLICT",
      message: `Scope item "${item}" appears in both inScope and outOfScope.`,
      severity: "ERROR",
    });
  }

  const repoNames = contract.repositories.map((r) => r.repository);
  const duplicateRepos = hasDuplicates(repoNames);
  for (const repo of duplicateRepos) {
    findings.push({
      path: "repositories",
      code: "REJECTED_REPOSITORIES",
      message: `Repository "${repo}" is listed more than once.`,
      severity: "ERROR",
    });
  }

  const primaryCount = contract.repositories.filter(
    (r) => r.role === "PRIMARY",
  ).length;
  if (primaryCount !== 1) {
    findings.push({
      path: "repositories",
      code: "REJECTED_REPOSITORIES",
      message: `Exactly one PRIMARY repository is required; found ${primaryCount}.`,
      severity: "ERROR",
    });
  }

  if (
    contract.constraints.maxRepositories !== undefined &&
    contract.repositories.length > contract.constraints.maxRepositories
  ) {
    findings.push({
      path: "constraints.maxRepositories",
      code: "REJECTED_CONSTRAINTS",
      message: `repositories.length (${contract.repositories.length}) exceeds constraints.maxRepositories (${contract.constraints.maxRepositories}).`,
      severity: "ERROR",
    });
  }

  const policy = contract.humanGatePolicy;
  const weakenedGates: string[] = [];
  if (!policy.readyRequiresHuman) weakenedGates.push("readyRequiresHuman");
  if (!policy.mergeRequiresHuman) weakenedGates.push("mergeRequiresHuman");
  if (!policy.issueCloseRequiresHuman) {
    weakenedGates.push("issueCloseRequiresHuman");
  }
  if (!policy.deployRequiresHuman) weakenedGates.push("deployRequiresHuman");
  if (weakenedGates.length > 0) {
    findings.push({
      path: "humanGatePolicy",
      code: "REJECTED_HUMAN_GATE_POLICY",
      message: `PROJECT-CONTRACT-V1 requires Human gates to remain true; weakened: ${weakenedGates.join(", ")}. The contract does not grant Ready/Merge/IssueClose/Deploy authority.`,
      severity: "ERROR",
    });
  }

  const hasErrors = findings.some((f) => f.severity === "ERROR");
  if (hasErrors) {
    return buildValidationResult({
      projectId: contract.projectId,
      status: "INVALID",
      reasonCode: findings.find((f) => f.severity === "ERROR")!.code,
      reasonMessage: findings
        .filter((f) => f.severity === "ERROR")
        .map((f) => f.message)
        .join(" "),
      findings,
      authorityFingerprint,
      validatedAt,
    });
  }

  return buildValidationResult({
    projectId: contract.projectId,
    status: "VALID",
    reasonCode: "VALID",
    reasonMessage:
      "Project contract passed structural and semantic validation.",
    authorityFingerprint,
    validatedAt,
  });
}

/**
 * Parse raw value → structural parse → semantic validation in one step.
 * Malformed documents never throw.
 */
export async function parseAndValidateProjectContractV1(
  value: unknown,
  options: ValidateProjectContractOptions = {},
): Promise<
  | {
      ok: true;
      contract: ProjectContractV1;
      validation: ProjectContractValidationResultV1;
    }
  | {
      ok: false;
      contract: ProjectContractV1 | null;
      validation: ProjectContractValidationResultV1;
    }
> {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const parsed = parseProjectContractV1(value);
  if (!parsed.ok) {
    const projectId =
      isPlainObject(value) && typeof value.projectId === "string"
        ? value.projectId
        : null;
    return {
      ok: false,
      contract: null,
      validation: buildValidationResult({
        projectId,
        status: "INVALID",
        reasonCode: parsed.reasonCode,
        reasonMessage: parsed.reasonMessage,
        validatedAt,
      }),
    };
  }

  const validation = await validateProjectContractV1(parsed.contract, options);
  if (validation.status === "VALID") {
    return { ok: true, contract: parsed.contract, validation };
  }
  return { ok: false, contract: parsed.contract, validation };
}

/**
 * Structural parse for ProjectContractValidationResultV1 documents.
 */
export function parseProjectContractValidationResult(
  value: unknown,
):
  | { ok: true; result: ProjectContractValidationResultV1 }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Validation result must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, PROJECT_CONTRACT_VALIDATION_RESULT_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "Validation result contains unknown properties (additionalProperties forbidden).",
    };
  }
  if (value.schemaVersion !== PROJECT_CONTRACT_VALIDATION_RESULT_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `schemaVersion must be ${PROJECT_CONTRACT_VALIDATION_RESULT_SCHEMA}.`,
    };
  }
  if (!Object.prototype.hasOwnProperty.call(value, "projectId")) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "projectId is required (use null when unknown).",
    };
  }
  if (value.projectId !== null && !isProjectId(value.projectId)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "projectId is malformed when present.",
    };
  }
  const status = value.status;
  if (
    status !== "VALID" &&
    status !== "INVALID" &&
    status !== "HOLD" &&
    status !== "UNKNOWN"
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "status must be VALID, INVALID, HOLD, or UNKNOWN.",
    };
  }
  if (
    typeof value.reasonCode !== "string" ||
    value.reasonCode.length < 1 ||
    value.reasonCode.length > PROJECT_CONTRACT_REASON_CODE_MAX
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "reasonCode is missing or malformed.",
    };
  }
  if (
    typeof value.reasonMessage !== "string" ||
    value.reasonMessage.length < 1 ||
    value.reasonMessage.length > PROJECT_CONTRACT_REASON_MESSAGE_MAX
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "reasonMessage is missing or malformed.",
    };
  }
  if (value.findings !== undefined) {
    if (
      !Array.isArray(value.findings) ||
      value.findings.length > PROJECT_CONTRACT_FINDINGS_MAX ||
      !value.findings.every(
        (finding) =>
          isPlainObject(finding) &&
          hasOnlyKeys(finding, ["path", "code", "message", "severity"]) &&
          typeof finding.path === "string" &&
          finding.path.length >= 1 &&
          finding.path.length <= PROJECT_CONTRACT_FINDING_PATH_MAX &&
          typeof finding.code === "string" &&
          finding.code.length >= 1 &&
          finding.code.length <= PROJECT_CONTRACT_FINDING_CODE_MAX &&
          typeof finding.message === "string" &&
          finding.message.length >= 1 &&
          finding.message.length <= PROJECT_CONTRACT_FINDING_MESSAGE_MAX &&
          (finding.severity === "ERROR" || finding.severity === "WARNING"),
      )
    ) {
      return {
        ok: false,
        reasonCode: "REJECTED_SCHEMA",
        reasonMessage: "findings array is malformed.",
      };
    }
  }
  if (value.authorityFingerprint !== undefined) {
    if (
      typeof value.authorityFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.authorityFingerprint)
    ) {
      return {
        ok: false,
        reasonCode: "REJECTED_SCHEMA",
        reasonMessage:
          "authorityFingerprint must be a 64-character lowercase SHA-256 hex string when present.",
      };
    }
  }
  if (typeof value.validatedAt !== "string" || value.validatedAt.length < 1) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "validatedAt is missing or malformed.",
    };
  }

  return {
    ok: true,
    result: {
      schemaVersion: PROJECT_CONTRACT_VALIDATION_RESULT_SCHEMA,
      projectId: value.projectId as string | null,
      status,
      reasonCode: value.reasonCode,
      reasonMessage: value.reasonMessage,
      findings: value.findings as ProjectContractValidationFinding[] | undefined,
      authorityFingerprint: value.authorityFingerprint as string | undefined,
      validatedAt: value.validatedAt,
    },
  };
}

/** Guard that planning / mutation surfaces remain disabled in contract-only slices. */
export function assertProjectPlanningSurfacesNotImplemented(): void {
  if (
    PROJECT_PLANNER_IMPLEMENTED ||
    PROJECT_ROADMAP_GENERATION_IMPLEMENTED ||
    PROJECT_ISSUE_PROPOSAL_GENERATION_IMPLEMENTED ||
    PROJECT_GITHUB_ISSUE_MUTATION_IMPLEMENTED ||
    PROJECT_AGENT_EXECUTION_IMPLEMENTED
  ) {
    throw new Error(
      "PROJECT-CONTRACT-V1 planning/mutation surfaces must remain NOT IMPLEMENTED in contract-only state",
    );
  }
}
