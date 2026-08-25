/**
 * AGENT-TASK-V1 design contract helpers.
 *
 * DESIGNED · NOT IMPLEMENTED · NO AGENT EXECUTION · NO GITHUB PUBLICATION
 *
 * Pure validation for the machine-readable Agent task contract. Does not execute
 * verification commands, modify files, call Agents, publish branches, or mutate GitHub.
 */

export const AGENT_TASK_SCHEMA = "AGENT-TASK-V1" as const;
export const AGENT_TASK_VALIDATION_RESULT_SCHEMA =
  "AGENT-TASK-VALIDATION-RESULT-V1" as const;

/** Agent runner remains unimplemented in this contract-only slice. */
export const AGENT_EXECUTION_IMPLEMENTED = false as const;
export const AGENT_TASK_GITHUB_PUBLICATION_IMPLEMENTED = false as const;
export const DRAFT_PR_AUTOMATION_IMPLEMENTED = false as const;
export const READY_AUTOMATION_IMPLEMENTED = false as const;
export const MERGE_AUTOMATION_IMPLEMENTED = false as const;

export const AGENT_TASK_RISK_CLASSES = [
  "R0",
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
] as const;

export const AGENT_TASK_STOP_AT_VALUES = [
  "TASK_BUILT",
  "AGENT_COMPLETE",
  "VERIFY_COMPLETE",
  "DRAFT_PR",
] as const;

export const AGENT_TASK_OBJECTIVE_MAX = 4096 as const;
export const AGENT_TASK_PATHS_MAX = 256 as const;
export const AGENT_TASK_PATH_MAX_LEN = 512 as const;
export const AGENT_TASK_ACCEPTANCE_CRITERIA_MAX = 64 as const;
export const AGENT_TASK_ACCEPTANCE_CRITERION_MAX = 2048 as const;
export const AGENT_TASK_VERIFICATION_COMMANDS_MAX = 32 as const;
export const AGENT_TASK_VERIFICATION_COMMAND_ID_MAX = 64 as const;
export const AGENT_TASK_CAPABILITIES_MAX = 32 as const;
export const AGENT_TASK_TASK_ID_MAX = 128 as const;
export const AGENT_TASK_FINDINGS_MAX = 64 as const;
export const AGENT_TASK_FINDING_PATH_MAX = 512 as const;
export const AGENT_TASK_FINDING_CODE_MAX = 128 as const;
export const AGENT_TASK_FINDING_MESSAGE_MAX = 2048 as const;
export const AGENT_TASK_REASON_CODE_MAX = 128 as const;
export const AGENT_TASK_REASON_MESSAGE_MAX = 2048 as const;

/**
 * verificationCommands[].id must be unique within one AgentTaskV1 document.
 * JSON Schema cannot express nested-property uniqueness; runtime enforces this
 * as REJECTED_SCHEMA to keep structural fail-closed behavior.
 */
export const AGENT_TASK_VERIFICATION_COMMAND_IDS_MUST_BE_UNIQUE = true as const;

/**
 * Path list uniqueness is evaluated after trailing-slash normalization so
 * `docs/foo` and `docs/foo/` cannot both appear as distinct boundaries.
 */
export const AGENT_TASK_PATH_UNIQUENESS_NORMALIZES_TRAILING_SLASH = true as const;

/** Exact root keys accepted by AgentTaskV1 (additionalProperties: false). */
export const AGENT_TASK_ROOT_KEYS = [
  "schemaVersion",
  "taskId",
  "repository",
  "baseRevision",
  "sourceIssue",
  "objective",
  "allowedPaths",
  "forbiddenPaths",
  "acceptanceCriteria",
  "verificationCommands",
  "allowedCapabilities",
  "riskClass",
  "stopAt",
  "constraints",
  "metadata",
] as const;

export const AGENT_TASK_SOURCE_ISSUE_KEYS = ["repository", "number"] as const;

export const AGENT_TASK_VERIFICATION_COMMAND_KEYS = [
  "id",
  "command",
  "workingDirectory",
  "description",
] as const;

export const AGENT_TASK_CONSTRAINTS_KEYS = [
  "maxChangedFiles",
  "maxAddedLines",
  "requireIndependentVerify",
] as const;

export const AGENT_TASK_METADATA_KEYS = [
  "createdAt",
  "createdBy",
  "sourceIssueUrl",
  "builderVersion",
  "notes",
] as const;

export const AGENT_TASK_VALIDATION_RESULT_ROOT_KEYS = [
  "schemaVersion",
  "taskId",
  "status",
  "reasonCode",
  "reasonMessage",
  "findings",
  "validatedAt",
] as const;

export type AgentTaskRiskClass = (typeof AGENT_TASK_RISK_CLASSES)[number];
export type AgentTaskStopAt = (typeof AGENT_TASK_STOP_AT_VALUES)[number];

export type AgentTaskValidationStatus = "VALID" | "INVALID" | "HOLD" | "UNKNOWN";

export type AgentTaskRejectReason =
  | "REJECTED_SCHEMA"
  | "REJECTED_REPOSITORY"
  | "REJECTED_BASE_REVISION"
  | "REJECTED_SOURCE_ISSUE"
  | "REJECTED_OBJECTIVE"
  | "REJECTED_PATHS"
  | "REJECTED_PATH_CONFLICT"
  | "REJECTED_ACCEPTANCE_CRITERIA"
  | "REJECTED_VERIFICATION_COMMANDS"
  | "REJECTED_CAPABILITY"
  | "REJECTED_RISK_CLASS"
  | "REJECTED_STOP_AT"
  | "REJECTED_CONSTRAINTS"
  | "REJECTED_METADATA";

export type AgentTaskHoldReason =
  | "HOLD_PATH_BOUNDARY_AMBIGUOUS"
  | "HOLD_CAPABILITY_SCOPE_UNRESOLVED";

export interface AgentTaskSourceIssue {
  repository: string;
  number: number;
}

export interface AgentTaskVerificationCommand {
  id: string;
  command: string;
  workingDirectory?: string;
  description?: string;
}

export interface AgentTaskConstraints {
  maxChangedFiles?: number;
  maxAddedLines?: number;
  requireIndependentVerify?: boolean;
}

export interface AgentTaskMetadata {
  createdAt: string;
  createdBy?: string;
  sourceIssueUrl?: string;
  builderVersion?: string;
  notes?: string[];
}

export interface AgentTaskV1 {
  schemaVersion: typeof AGENT_TASK_SCHEMA;
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
  metadata?: AgentTaskMetadata;
}

export interface AgentTaskValidationFinding {
  path: string;
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
}

export interface AgentTaskValidationResultV1 {
  schemaVersion: typeof AGENT_TASK_VALIDATION_RESULT_SCHEMA;
  taskId: string | null;
  status: AgentTaskValidationStatus;
  reasonCode: string;
  reasonMessage: string;
  findings?: AgentTaskValidationFinding[];
  validatedAt: string;
}

const REPOSITORY_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const BASE_REVISION_PATTERN = /^[a-f0-9]{40}$/;
const TASK_ID_PATTERN = /^[\x20-\x7E]+$/;
/** Mirrors schema path pattern: no absolute, no \, no //, no . / .. segments. */
const REPO_PATH_PATTERN =
  /^(?!\/)(?!.*\\)(?!.*\/\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*(?:^|\/)\.(?:\/|$))[^\x00\\]+$/;
/**
 * Capability ids are dotted, version-suffixed identifiers.
 * Segments after the first may include hyphens (e.g. github.draft-pr.publish.v1)
 * so narrowly named stage capabilities remain expressible without broadening
 * to generic github.write / repo.write forms.
 */
const CAPABILITY_ID_PATTERN =
  /^[a-z][a-z0-9]*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+\.v[0-9]+$/;
const VERIFICATION_COMMAND_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

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

function isBaseRevision(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === 40 &&
    BASE_REVISION_PATTERN.test(value)
  );
}

function isTaskId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= AGENT_TASK_TASK_ID_MAX &&
    TASK_ID_PATTERN.test(value)
  );
}

/**
 * Strip trailing slashes so `docs/foo/` and `docs/foo` compare consistently.
 * Does not collapse internal segments or authorize parent traversal.
 */
export function normalizeRepoPath(path: string): string {
  return path.replace(/\/+$/, "");
}

/**
 * Structural path grammar shared by schema path items and candidate boundary checks.
 * Rejects absolute paths, backslash separators, empty segments, and `.` / `..`.
 */
export function isRepoRelativePath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > AGENT_TASK_PATH_MAX_LEN ||
    !REPO_PATH_PATTERN.test(value)
  ) {
    return false;
  }
  const normalized = normalizeRepoPath(value);
  if (normalized.length < 1) return false;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }
  return true;
}

export function isAgentTaskCapabilityId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    CAPABILITY_ID_PATTERN.test(value)
  );
}

function isRiskClass(value: unknown): value is AgentTaskRiskClass {
  return (AGENT_TASK_RISK_CLASSES as readonly string[]).includes(value as string);
}

function isStopAt(value: unknown): value is AgentTaskStopAt {
  return (AGENT_TASK_STOP_AT_VALUES as readonly string[]).includes(value as string);
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

/**
 * Deterministic prefix overlap after trailing-slash normalization.
 * `a` overlaps `b` when equal or either is a directory prefix of the other.
 */
function pathsOverlap(a: string, b: string): boolean {
  const left = normalizeRepoPath(a);
  const right = normalizeRepoPath(b);
  if (left === right) return true;
  return right.startsWith(`${left}/`) || left.startsWith(`${right}/`);
}

function findPathBoundaryConflicts(
  allowedPaths: string[],
  forbiddenPaths: string[],
): { kind: "exact" | "prefix"; path: string; other: string }[] {
  const conflicts: { kind: "exact" | "prefix"; path: string; other: string }[] =
    [];
  for (const allowed of allowedPaths) {
    for (const forbidden of forbiddenPaths) {
      if (normalizeRepoPath(allowed) === normalizeRepoPath(forbidden)) {
        conflicts.push({ kind: "exact", path: allowed, other: forbidden });
      } else if (pathsOverlap(allowed, forbidden)) {
        conflicts.push({ kind: "prefix", path: allowed, other: forbidden });
      }
    }
  }
  return conflicts;
}

function isSourceIssue(value: unknown): value is AgentTaskSourceIssue {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, AGENT_TASK_SOURCE_ISSUE_KEYS)) return false;
  if (!isRepository(value.repository)) return false;
  if (
    typeof value.number !== "number" ||
    !Number.isInteger(value.number) ||
    value.number < 1
  ) {
    return false;
  }
  return true;
}

function isVerificationCommand(
  value: unknown,
): value is AgentTaskVerificationCommand {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, AGENT_TASK_VERIFICATION_COMMAND_KEYS)) return false;
  if (
    typeof value.id !== "string" ||
    value.id.length < 1 ||
    value.id.length > AGENT_TASK_VERIFICATION_COMMAND_ID_MAX ||
    !VERIFICATION_COMMAND_ID_PATTERN.test(value.id)
  ) {
    return false;
  }
  if (
    typeof value.command !== "string" ||
    value.command.length < 1 ||
    value.command.length > 512
  ) {
    return false;
  }
  if (
    value.workingDirectory !== undefined &&
    !isRepoRelativePath(value.workingDirectory)
  ) {
    return false;
  }
  if (
    value.description !== undefined &&
    (typeof value.description !== "string" ||
      value.description.length < 1 ||
      value.description.length > 512)
  ) {
    return false;
  }
  return true;
}

function isConstraints(value: unknown): value is AgentTaskConstraints {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, AGENT_TASK_CONSTRAINTS_KEYS)) return false;
  if (
    value.maxChangedFiles !== undefined &&
    (typeof value.maxChangedFiles !== "number" ||
      !Number.isInteger(value.maxChangedFiles) ||
      value.maxChangedFiles < 1 ||
      value.maxChangedFiles > 10000)
  ) {
    return false;
  }
  if (
    value.maxAddedLines !== undefined &&
    (typeof value.maxAddedLines !== "number" ||
      !Number.isInteger(value.maxAddedLines) ||
      value.maxAddedLines < 1 ||
      value.maxAddedLines > 1000000)
  ) {
    return false;
  }
  if (
    value.requireIndependentVerify !== undefined &&
    typeof value.requireIndependentVerify !== "boolean"
  ) {
    return false;
  }
  return true;
}

function isMetadata(value: unknown): value is AgentTaskMetadata {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, AGENT_TASK_METADATA_KEYS)) return false;
  if (typeof value.createdAt !== "string" || value.createdAt.length < 1) {
    return false;
  }
  if (
    value.createdBy !== undefined &&
    (typeof value.createdBy !== "string" ||
      value.createdBy.length < 1 ||
      value.createdBy.length > 256)
  ) {
    return false;
  }
  if (
    value.sourceIssueUrl !== undefined &&
    (typeof value.sourceIssueUrl !== "string" ||
      value.sourceIssueUrl.length < 1 ||
      value.sourceIssueUrl.length > 2048)
  ) {
    return false;
  }
  if (
    value.builderVersion !== undefined &&
    (typeof value.builderVersion !== "string" ||
      value.builderVersion.length < 1 ||
      value.builderVersion.length > 64)
  ) {
    return false;
  }
  if (value.notes !== undefined) {
    if (
      !Array.isArray(value.notes) ||
      value.notes.length > 16 ||
      !value.notes.every(
        (note) =>
          typeof note === "string" &&
          note.length >= 1 &&
          note.length <= 1024,
      )
    ) {
      return false;
    }
  }
  return true;
}

function parsePathArray(
  value: unknown,
  field: "allowedPaths" | "forbiddenPaths",
  minItems: number,
): { ok: true; paths: string[] } | { ok: false; reasonMessage: string } {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      reasonMessage: `${field} must be an array.`,
    };
  }
  if (value.length < minItems || value.length > AGENT_TASK_PATHS_MAX) {
    return {
      ok: false,
      reasonMessage: `${field} length must be between ${minItems} and ${AGENT_TASK_PATHS_MAX}.`,
    };
  }
  if (!value.every(isRepoRelativePath)) {
    return {
      ok: false,
      reasonMessage: `${field} contains malformed repository-relative paths.`,
    };
  }
  const paths = value as string[];
  const exactDuplicates = hasDuplicates(paths);
  if (exactDuplicates.length > 0) {
    return {
      ok: false,
      reasonMessage: `${field} contains duplicate entries: ${exactDuplicates.join(", ")}.`,
    };
  }
  if (AGENT_TASK_PATH_UNIQUENESS_NORMALIZES_TRAILING_SLASH) {
    const normalizedDuplicates = hasDuplicates(paths.map(normalizeRepoPath));
    if (normalizedDuplicates.length > 0) {
      return {
        ok: false,
        reasonMessage: `${field} contains duplicate entries after trailing-slash normalization: ${normalizedDuplicates.join(", ")}.`,
      };
    }
  }
  return { ok: true, paths };
}

/**
 * Raw document body → JSON value. Syntax errors become REJECTED_SCHEMA (never throw).
 */
export function parseAgentTaskJsonBody(raw: unknown):
  | { ok: true; value: unknown }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (typeof raw !== "string") {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Agent task body must be a UTF-8 JSON string.",
    };
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Agent task body is not valid JSON syntax.",
    };
  }
}

/**
 * Structural fail-closed parse for AgentTaskV1 documents.
 * Mirrors docs/agent-task/schemas/agent-task-v1.schema.json including
 * additionalProperties:false on all objects.
 */
export function parseAgentTaskV1(
  value: unknown,
):
  | { ok: true; task: AgentTaskV1 }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Agent task must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, AGENT_TASK_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "Agent task contains unknown properties (additionalProperties forbidden).",
    };
  }
  if (value.schemaVersion !== AGENT_TASK_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `schemaVersion must be ${AGENT_TASK_SCHEMA}.`,
    };
  }
  if (!isTaskId(value.taskId)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "taskId is missing or malformed.",
    };
  }
  if (!isRepository(value.repository)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "repository is missing or malformed.",
    };
  }
  if (!isBaseRevision(value.baseRevision)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "baseRevision must be a 40-character lowercase Git SHA.",
    };
  }
  if (!isSourceIssue(value.sourceIssue)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "sourceIssue is missing or malformed.",
    };
  }
  if (
    typeof value.objective !== "string" ||
    value.objective.length < 1 ||
    value.objective.length > AGENT_TASK_OBJECTIVE_MAX
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "objective must be a non-empty bounded string.",
    };
  }

  const allowedParsed = parsePathArray(value.allowedPaths, "allowedPaths", 1);
  if (!allowedParsed.ok) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: allowedParsed.reasonMessage,
    };
  }
  const forbiddenParsed = parsePathArray(value.forbiddenPaths, "forbiddenPaths", 0);
  if (!forbiddenParsed.ok) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: forbiddenParsed.reasonMessage,
    };
  }

  if (
    !Array.isArray(value.acceptanceCriteria) ||
    value.acceptanceCriteria.length < 1 ||
    value.acceptanceCriteria.length > AGENT_TASK_ACCEPTANCE_CRITERIA_MAX ||
    !value.acceptanceCriteria.every(
      (item) =>
        typeof item === "string" &&
        item.length >= 1 &&
        item.length <= AGENT_TASK_ACCEPTANCE_CRITERION_MAX,
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "acceptanceCriteria must contain at least one non-empty bounded string.",
    };
  }

  if (
    !Array.isArray(value.verificationCommands) ||
    value.verificationCommands.length > AGENT_TASK_VERIFICATION_COMMANDS_MAX ||
    !value.verificationCommands.every(isVerificationCommand)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "verificationCommands contains malformed entries.",
    };
  }
  const verificationIds = value.verificationCommands.map((cmd) => cmd.id);
  if (AGENT_TASK_VERIFICATION_COMMAND_IDS_MUST_BE_UNIQUE) {
    const duplicateVerificationIds = hasDuplicates(verificationIds);
    if (duplicateVerificationIds.length > 0) {
      return {
        ok: false,
        reasonCode: "REJECTED_SCHEMA",
        reasonMessage: `verificationCommands contains duplicate ids: ${duplicateVerificationIds.join(", ")}. Each verificationCommands[].id must be unique.`,
      };
    }
  }

  if (
    !Array.isArray(value.allowedCapabilities) ||
    value.allowedCapabilities.length > AGENT_TASK_CAPABILITIES_MAX ||
    !value.allowedCapabilities.every(isAgentTaskCapabilityId)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "allowedCapabilities contains malformed capability identifiers.",
    };
  }
  const capabilityDuplicates = hasDuplicates(value.allowedCapabilities as string[]);
  if (capabilityDuplicates.length > 0) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `allowedCapabilities contains duplicate entries: ${capabilityDuplicates.join(", ")}.`,
    };
  }

  if (!isRiskClass(value.riskClass)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `riskClass must be one of ${AGENT_TASK_RISK_CLASSES.join(", ")}.`,
    };
  }
  if (!isStopAt(value.stopAt)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `stopAt must be one of ${AGENT_TASK_STOP_AT_VALUES.join(", ")}.`,
    };
  }

  if (value.constraints !== undefined && !isConstraints(value.constraints)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "constraints object is malformed.",
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
    task: {
      schemaVersion: AGENT_TASK_SCHEMA,
      taskId: value.taskId,
      repository: value.repository,
      baseRevision: value.baseRevision,
      sourceIssue: value.sourceIssue,
      objective: value.objective,
      allowedPaths: allowedParsed.paths,
      forbiddenPaths: forbiddenParsed.paths,
      acceptanceCriteria: value.acceptanceCriteria as string[],
      verificationCommands: value.verificationCommands as AgentTaskVerificationCommand[],
      allowedCapabilities: value.allowedCapabilities as string[],
      riskClass: value.riskClass,
      stopAt: value.stopAt,
      constraints: value.constraints as AgentTaskConstraints | undefined,
      metadata: value.metadata as AgentTaskMetadata | undefined,
    },
  };
}

export interface ValidateAgentTaskOptions {
  validatedAt?: string;
  /**
   * When true, prefix overlaps between allowedPaths and forbiddenPaths that are
   * not exact duplicates produce HOLD instead of INVALID. Default: false (INVALID).
   */
  treatPrefixOverlapAsHold?: boolean;
}

function buildValidationResult(input: {
  taskId: string | null;
  status: AgentTaskValidationStatus;
  reasonCode: string;
  reasonMessage: string;
  findings?: AgentTaskValidationFinding[];
  validatedAt: string;
}): AgentTaskValidationResultV1 {
  return {
    schemaVersion: AGENT_TASK_VALIDATION_RESULT_SCHEMA,
    taskId: input.taskId,
    status: input.status,
    reasonCode: input.reasonCode,
    reasonMessage: input.reasonMessage,
    findings: input.findings,
    validatedAt: input.validatedAt,
  };
}

/**
 * Semantic validation for a structurally parsed AgentTaskV1.
 * Never executes verificationCommands or mutates external state.
 */
export function validateAgentTaskV1(
  task: AgentTaskV1,
  options: ValidateAgentTaskOptions = {},
): AgentTaskValidationResultV1 {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const findings: AgentTaskValidationFinding[] = [];

  if (task.sourceIssue.repository !== task.repository) {
    findings.push({
      path: "sourceIssue.repository",
      code: "REJECTED_SOURCE_ISSUE",
      message: "sourceIssue.repository must match task.repository.",
      severity: "ERROR",
    });
  }

  const pathConflicts = findPathBoundaryConflicts(
    task.allowedPaths,
    task.forbiddenPaths,
  );
  const exactConflicts = pathConflicts.filter((c) => c.kind === "exact");
  const prefixConflicts = pathConflicts.filter((c) => c.kind === "prefix");

  for (const conflict of exactConflicts) {
    findings.push({
      path: "allowedPaths/forbiddenPaths",
      code: "REJECTED_PATH_CONFLICT",
      message: `Path "${conflict.path}" appears in both allowedPaths and forbiddenPaths.`,
      severity: "ERROR",
    });
  }

  if (prefixConflicts.length > 0 && exactConflicts.length === 0) {
    if (options.treatPrefixOverlapAsHold) {
      for (const conflict of prefixConflicts) {
        findings.push({
          path: "allowedPaths/forbiddenPaths",
          code: "HOLD_PATH_BOUNDARY_AMBIGUOUS",
          message: `Allowed path "${conflict.path}" overlaps forbidden path "${conflict.other}" by prefix; Human resolution required.`,
          severity: "WARNING",
        });
      }
    } else {
      for (const conflict of prefixConflicts) {
        findings.push({
          path: "allowedPaths/forbiddenPaths",
          code: "REJECTED_PATH_CONFLICT",
          message: `Allowed path "${conflict.path}" overlaps forbidden path "${conflict.other}".`,
          severity: "ERROR",
        });
      }
    }
  }

  const hasErrors = findings.some((f) => f.severity === "ERROR");
  const hasHoldWarnings = findings.some(
    (f) => f.code === "HOLD_PATH_BOUNDARY_AMBIGUOUS",
  );

  if (hasErrors) {
    return buildValidationResult({
      taskId: task.taskId,
      status: "INVALID",
      reasonCode: findings.find((f) => f.severity === "ERROR")!.code,
      reasonMessage: findings
        .filter((f) => f.severity === "ERROR")
        .map((f) => f.message)
        .join(" "),
      findings,
      validatedAt,
    });
  }

  if (hasHoldWarnings) {
    return buildValidationResult({
      taskId: task.taskId,
      status: "HOLD",
      reasonCode: "HOLD_PATH_BOUNDARY_AMBIGUOUS",
      reasonMessage:
        "Path boundary overlap requires Human resolution before dispatch.",
      findings,
      validatedAt,
    });
  }

  return buildValidationResult({
    taskId: task.taskId,
    status: "VALID",
    reasonCode: "VALID",
    reasonMessage: "Agent task contract passed structural and semantic validation.",
    validatedAt,
  });
}

/**
 * Parse raw value → structural parse → semantic validation in one step.
 * Malformed documents never throw.
 */
export function parseAndValidateAgentTaskV1(
  value: unknown,
  options: ValidateAgentTaskOptions = {},
):
  | { ok: true; task: AgentTaskV1; validation: AgentTaskValidationResultV1 }
  | {
      ok: false;
      task: AgentTaskV1 | null;
      validation: AgentTaskValidationResultV1;
    } {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const parsed = parseAgentTaskV1(value);
  if (!parsed.ok) {
    const taskId =
      isPlainObject(value) && typeof value.taskId === "string" ? value.taskId : null;
    return {
      ok: false,
      task: null,
      validation: buildValidationResult({
        taskId,
        status: "INVALID",
        reasonCode: parsed.reasonCode,
        reasonMessage: parsed.reasonMessage,
        validatedAt,
      }),
    };
  }

  const validation = validateAgentTaskV1(parsed.task, options);
  if (validation.status === "VALID") {
    return { ok: true, task: parsed.task, validation };
  }
  return { ok: false, task: parsed.task, validation };
}

/**
 * Structural parse for AgentTaskValidationResultV1 documents.
 */
export function parseAgentTaskValidationResult(
  value: unknown,
):
  | { ok: true; result: AgentTaskValidationResultV1 }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Validation result must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, AGENT_TASK_VALIDATION_RESULT_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "Validation result contains unknown properties (additionalProperties forbidden).",
    };
  }
  if (value.schemaVersion !== AGENT_TASK_VALIDATION_RESULT_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `schemaVersion must be ${AGENT_TASK_VALIDATION_RESULT_SCHEMA}.`,
    };
  }
  if (!Object.prototype.hasOwnProperty.call(value, "taskId")) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "taskId is required (use null when unknown).",
    };
  }
  if (value.taskId !== null && !isTaskId(value.taskId)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "taskId is malformed when present.",
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
    value.reasonCode.length > AGENT_TASK_REASON_CODE_MAX
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
    value.reasonMessage.length > AGENT_TASK_REASON_MESSAGE_MAX
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
      value.findings.length > AGENT_TASK_FINDINGS_MAX ||
      !value.findings.every(
        (finding) =>
          isPlainObject(finding) &&
          hasOnlyKeys(finding, ["path", "code", "message", "severity"]) &&
          typeof finding.path === "string" &&
          finding.path.length >= 1 &&
          finding.path.length <= AGENT_TASK_FINDING_PATH_MAX &&
          typeof finding.code === "string" &&
          finding.code.length >= 1 &&
          finding.code.length <= AGENT_TASK_FINDING_CODE_MAX &&
          typeof finding.message === "string" &&
          finding.message.length >= 1 &&
          finding.message.length <= AGENT_TASK_FINDING_MESSAGE_MAX &&
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
      schemaVersion: AGENT_TASK_VALIDATION_RESULT_SCHEMA,
      taskId: value.taskId as string | null,
      status,
      reasonCode: value.reasonCode,
      reasonMessage: value.reasonMessage,
      findings: value.findings as AgentTaskValidationFinding[] | undefined,
      validatedAt: value.validatedAt,
    },
  };
}

/** Guard that execution surfaces remain disabled in contract-only slices. */
export function assertAgentExecutionNotImplemented(): void {
  if (
    AGENT_EXECUTION_IMPLEMENTED ||
    AGENT_TASK_GITHUB_PUBLICATION_IMPLEMENTED ||
    DRAFT_PR_AUTOMATION_IMPLEMENTED ||
    READY_AUTOMATION_IMPLEMENTED ||
    MERGE_AUTOMATION_IMPLEMENTED
  ) {
    throw new Error(
      "AGENT-TASK-V1 execution surfaces must remain NOT IMPLEMENTED in contract-only state",
    );
  }
}

/**
 * Returns whether a repository-relative path is explicitly allowed by the task.
 * Malformed candidates fail closed (false). Does not authorize execution.
 */
export function isPathExplicitlyAllowed(
  task: AgentTaskV1,
  path: string,
): boolean {
  if (!isRepoRelativePath(path)) return false;
  const normalizedPath = normalizeRepoPath(path);
  return task.allowedPaths.some((allowed) => {
    const normalizedAllowed = normalizeRepoPath(allowed);
    return (
      normalizedPath === normalizedAllowed ||
      normalizedPath.startsWith(`${normalizedAllowed}/`)
    );
  });
}

/**
 * Returns whether a repository-relative path is explicitly forbidden by the task.
 * Malformed candidates fail closed (false).
 */
export function isPathExplicitlyForbidden(
  task: AgentTaskV1,
  path: string,
): boolean {
  if (!isRepoRelativePath(path)) return false;
  const normalizedPath = normalizeRepoPath(path);
  return task.forbiddenPaths.some((forbidden) => {
    const normalizedForbidden = normalizeRepoPath(forbidden);
    return (
      normalizedPath === normalizedForbidden ||
      normalizedPath.startsWith(`${normalizedForbidden}/`)
    );
  });
}

/**
 * Path authorization helper: allowed only when explicitly in allowedPaths and
 * not matched by forbiddenPaths. Malformed candidates are UNKNOWN (fail closed).
 * Does not authorize Agent execution.
 */
export function evaluatePathBoundary(
  task: AgentTaskV1,
  path: string,
): "ALLOWED" | "FORBIDDEN" | "UNKNOWN" {
  if (!isRepoRelativePath(path)) return "UNKNOWN";
  if (isPathExplicitlyForbidden(task, path)) return "FORBIDDEN";
  if (isPathExplicitlyAllowed(task, path)) return "ALLOWED";
  return "UNKNOWN";
}
