/**
 * ISSUE-PROPOSAL-V1 / ISSUE-DECOMPOSER-CONTRACT-V1 design contract helpers.
 *
 * DESIGNED · CONTRACT ONLY · NO PLANNER · NO ISSUE-VALIDATOR-V1 ·
 * NO GITHUB ISSUE MUTATION · NO AGENT EXECUTION · NO SCHEDULER
 *
 * Pure parse / validate / fingerprint for machine-readable IssueProposalV1
 * records bound to a validated RoadmapContractV1 / RoadmapNodeV1. Does not
 * invoke an LLM, publish GitHub Issues, or dispatch Agents.
 */

import { canonicalJson } from "./decisionFingerprint";
import {
  isRepoRelativePath,
  normalizeRepoPath,
} from "./agentTaskContract";
import {
  computeProjectContractAuthorityFingerprint,
  type ProjectContractRiskClass,
  type ProjectContractV1,
  PROJECT_CONTRACT_RISK_CLASSES,
} from "./projectContract";
import {
  computeRoadmapContractAuthorityFingerprint,
  type RoadmapContractV1,
} from "./roadmapContract";

export const ISSUE_PROPOSAL_SCHEMA = "ISSUE-PROPOSAL-V1" as const;
export const ISSUE_PROPOSAL_VALIDATION_RESULT_SCHEMA =
  "ISSUE-PROPOSAL-VALIDATION-RESULT-V1" as const;

/** Downstream planner / mutation / execution surfaces remain unimplemented. */
export const ISSUE_PROPOSAL_PLANNER_IMPLEMENTED = false as const;
export const ISSUE_PROPOSAL_VALIDATOR_V1_IMPLEMENTED = false as const;
export const ISSUE_PROPOSAL_SPLITTER_IMPLEMENTED = false as const;
export const ISSUE_PROPOSAL_GITHUB_ISSUE_MUTATION_IMPLEMENTED = false as const;
export const ISSUE_PROPOSAL_PUBLISHER_IMPLEMENTED = false as const;
export const ISSUE_PROPOSAL_AGENT_EXECUTION_IMPLEMENTED = false as const;
export const ISSUE_PROPOSAL_SCHEDULER_IMPLEMENTED = false as const;

export const ISSUE_PROPOSAL_RISK_CLASSES = [
  "R0",
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
] as const;

export const ISSUE_PROPOSAL_STOP_AT_VALUES = [
  "TASK_BUILT",
  "AGENT_COMPLETE",
  "VERIFY_COMPLETE",
  "DRAFT_PR",
] as const;

export const ISSUE_PROPOSAL_PROPOSAL_ID_MAX = 128 as const;
export const ISSUE_PROPOSAL_NODE_ID_MAX = 128 as const;
export const ISSUE_PROPOSAL_TITLE_MAX = 256 as const;
export const ISSUE_PROPOSAL_OBJECTIVE_MAX = 4096 as const;
export const ISSUE_PROPOSAL_DEPENDS_ON_MAX = 64 as const;
export const ISSUE_PROPOSAL_PATHS_MAX = 256 as const;
export const ISSUE_PROPOSAL_PATH_MAX_LEN = 512 as const;
export const ISSUE_PROPOSAL_ACCEPTANCE_CRITERIA_MAX = 64 as const;
export const ISSUE_PROPOSAL_ACCEPTANCE_CRITERION_MAX = 2048 as const;
export const ISSUE_PROPOSAL_VERIFICATION_COMMANDS_MAX = 32 as const;
export const ISSUE_PROPOSAL_VERIFICATION_COMMAND_ID_MAX = 64 as const;
export const ISSUE_PROPOSAL_CAPABILITIES_MAX = 32 as const;
export const ISSUE_PROPOSAL_ESTIMATED_CHANGED_FILES_MAX = 10000 as const;
export const ISSUE_PROPOSAL_FINDINGS_MAX = 64 as const;
export const ISSUE_PROPOSAL_FINDING_PATH_MAX = 512 as const;
export const ISSUE_PROPOSAL_FINDING_CODE_MAX = 128 as const;
export const ISSUE_PROPOSAL_FINDING_MESSAGE_MAX = 2048 as const;
export const ISSUE_PROPOSAL_REASON_CODE_MAX = 128 as const;
export const ISSUE_PROPOSAL_REASON_MESSAGE_MAX = 2048 as const;
export const ISSUE_PROPOSAL_METADATA_NOTES_MAX = 16 as const;
export const ISSUE_PROPOSAL_METADATA_NOTE_MAX = 1024 as const;

/** Exact root keys accepted by IssueProposalV1 (additionalProperties: false). */
export const ISSUE_PROPOSAL_ROOT_KEYS = [
  "schemaVersion",
  "proposalId",
  "roadmapNodeId",
  "repository",
  "title",
  "objective",
  "dependsOn",
  "allowedPaths",
  "forbiddenPaths",
  "acceptanceCriteria",
  "verificationCommands",
  "allowedCapabilities",
  "riskClass",
  "stopAt",
  "estimatedChangedFiles",
  "provenance",
  "metadata",
] as const;

export const ISSUE_PROPOSAL_PROVENANCE_KEYS = [
  "roadmapId",
  "roadmapAuthorityFingerprint",
] as const;

export const ISSUE_PROPOSAL_VERIFICATION_COMMAND_KEYS = [
  "id",
  "command",
  "workingDirectory",
  "description",
] as const;

/**
 * Authority fingerprint includes proposal authority facts + Roadmap binding.
 * Audit-only metadata (including observedAt) is excluded.
 */
export const ISSUE_PROPOSAL_AUTHORITY_FINGERPRINT_KEYS = [
  "schemaVersion",
  "proposalId",
  "roadmapNodeId",
  "repository",
  "title",
  "objective",
  "dependsOn",
  "allowedPaths",
  "forbiddenPaths",
  "acceptanceCriteria",
  "verificationCommands",
  "allowedCapabilities",
  "riskClass",
  "stopAt",
  "estimatedChangedFiles",
  "provenance",
] as const;

export const ISSUE_PROPOSAL_METADATA_KEYS = [
  "createdAt",
  "createdBy",
  "observedAt",
  "sourceIssueUrl",
  "notes",
] as const;

export const ISSUE_PROPOSAL_VALIDATION_RESULT_ROOT_KEYS = [
  "schemaVersion",
  "proposalId",
  "roadmapNodeId",
  "status",
  "reasonCode",
  "reasonMessage",
  "findings",
  "authorityFingerprint",
  "validatedAt",
] as const;

export type IssueProposalRiskClass =
  (typeof ISSUE_PROPOSAL_RISK_CLASSES)[number];
export type IssueProposalStopAt =
  (typeof ISSUE_PROPOSAL_STOP_AT_VALUES)[number];

export type IssueProposalValidationStatus =
  | "VALID"
  | "INVALID"
  | "HOLD"
  | "UNKNOWN";

export type IssueProposalRejectReason =
  | "REJECTED_SCHEMA"
  | "REJECTED_PROPOSAL_ID"
  | "REJECTED_ROADMAP_NODE_BINDING"
  | "REJECTED_ROADMAP_BINDING"
  | "REJECTED_REPOSITORY_BINDING"
  | "REJECTED_DEPENDENCY"
  | "REJECTED_PATHS"
  | "REJECTED_PATH_CONFLICT"
  | "REJECTED_ACCEPTANCE_CRITERIA"
  | "REJECTED_VERIFICATION_COMMANDS"
  | "REJECTED_CAPABILITY"
  | "REJECTED_RISK_CLASS"
  | "REJECTED_STOP_AT"
  | "REJECTED_ESTIMATED_CHANGED_FILES"
  | "REJECTED_PROVENANCE"
  | "REJECTED_METADATA";

export interface IssueProposalVerificationCommandV1 {
  id: string;
  command: string;
  workingDirectory?: string;
  description?: string;
}

/**
 * Provenance binding to RoadmapContract authority.
 * Changes alter the proposal authority fingerprint.
 */
export interface IssueProposalProvenanceV1 {
  roadmapId: string;
  /** Exact RoadmapContractV1 authority fingerprint binding. */
  roadmapAuthorityFingerprint: string;
}

/**
 * Audit / observation metadata. Never part of the authority fingerprint.
 * observedAt is explicitly audit-only.
 */
export interface IssueProposalMetadataV1 {
  createdAt?: string;
  createdBy?: string;
  observedAt?: string;
  sourceIssueUrl?: string;
  notes?: string[];
}

export interface IssueProposalV1 {
  schemaVersion: typeof ISSUE_PROPOSAL_SCHEMA;
  proposalId: string;
  roadmapNodeId: string;
  repository: string;
  title: string;
  objective: string;
  /** ProposalId dependencies (proposal-local; not GitHub Issue numbers). */
  dependsOn: string[];
  allowedPaths: string[];
  forbiddenPaths: string[];
  acceptanceCriteria: string[];
  verificationCommands: IssueProposalVerificationCommandV1[];
  allowedCapabilities: string[];
  riskClass: IssueProposalRiskClass;
  stopAt: IssueProposalStopAt;
  estimatedChangedFiles: number;
  provenance: IssueProposalProvenanceV1;
  metadata?: IssueProposalMetadataV1;
}

export interface IssueProposalVerificationCommandAuthorityFactsV1 {
  id: string;
  command: string;
  workingDirectory?: string;
  description?: string;
}

export interface IssueProposalAuthorityFactsV1 {
  schemaVersion: typeof ISSUE_PROPOSAL_SCHEMA;
  proposalId: string;
  roadmapNodeId: string;
  repository: string;
  title: string;
  objective: string;
  dependsOn: string[];
  allowedPaths: string[];
  forbiddenPaths: string[];
  acceptanceCriteria: string[];
  verificationCommands: IssueProposalVerificationCommandAuthorityFactsV1[];
  allowedCapabilities: string[];
  riskClass: IssueProposalRiskClass;
  stopAt: IssueProposalStopAt;
  estimatedChangedFiles: number;
  provenance: IssueProposalProvenanceV1;
}

export interface IssueProposalValidationFinding {
  path: string;
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
}

export interface IssueProposalValidationResultV1 {
  schemaVersion: typeof ISSUE_PROPOSAL_VALIDATION_RESULT_SCHEMA;
  proposalId: string | null;
  roadmapNodeId: string | null;
  status: IssueProposalValidationStatus;
  reasonCode: string;
  reasonMessage: string;
  findings?: IssueProposalValidationFinding[];
  /** Present only when structural parse succeeded and fingerprint was computed. */
  authorityFingerprint?: string;
  validatedAt: string;
}

const REPOSITORY_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const PROPOSAL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const NODE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const ROADMAP_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const AUTHORITY_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
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

function isNonEmptyBoundedString(
  value: unknown,
  max: number,
): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

function isProposalId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= ISSUE_PROPOSAL_PROPOSAL_ID_MAX &&
    PROPOSAL_ID_PATTERN.test(value)
  );
}

function isNodeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= ISSUE_PROPOSAL_NODE_ID_MAX &&
    NODE_ID_PATTERN.test(value)
  );
}

function isRoadmapId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    ROADMAP_ID_PATTERN.test(value)
  );
}

function isRepository(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 256 &&
    REPOSITORY_PATTERN.test(value)
  );
}

function isAuthorityFingerprint(value: unknown): value is string {
  return (
    typeof value === "string" && AUTHORITY_FINGERPRINT_PATTERN.test(value)
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

function isRiskClass(value: unknown): value is IssueProposalRiskClass {
  return (ISSUE_PROPOSAL_RISK_CLASSES as readonly string[]).includes(
    value as string,
  );
}

function isStopAt(value: unknown): value is IssueProposalStopAt {
  return (ISSUE_PROPOSAL_STOP_AT_VALUES as readonly string[]).includes(
    value as string,
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

function riskClassRank(risk: ProjectContractRiskClass | IssueProposalRiskClass): number {
  return (PROJECT_CONTRACT_RISK_CLASSES as readonly string[]).indexOf(risk);
}

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

function parsePathArray(
  value: unknown,
  field: "allowedPaths" | "forbiddenPaths",
  minItems: number,
):
  | { ok: true; paths: string[] }
  | { ok: false; reasonMessage: string } {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      reasonMessage: `${field} must be an array.`,
    };
  }
  if (value.length < minItems || value.length > ISSUE_PROPOSAL_PATHS_MAX) {
    return {
      ok: false,
      reasonMessage: `${field} must contain between ${minItems} and ${ISSUE_PROPOSAL_PATHS_MAX} paths.`,
    };
  }
  if (!value.every(isRepoRelativePath)) {
    return {
      ok: false,
      reasonMessage: `${field} contains malformed repository-relative paths.`,
    };
  }
  const normalized = (value as string[]).map(normalizeRepoPath);
  const duplicates = hasDuplicates(normalized);
  if (duplicates.length > 0) {
    return {
      ok: false,
      reasonMessage: `${field} contains duplicate entries after trailing-slash normalization: ${duplicates.join(", ")}.`,
    };
  }
  return { ok: true, paths: value as string[] };
}

function isVerificationCommand(
  value: unknown,
): value is IssueProposalVerificationCommandV1 {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, ISSUE_PROPOSAL_VERIFICATION_COMMAND_KEYS)) {
    return false;
  }
  if (
    typeof value.id !== "string" ||
    value.id.length < 1 ||
    value.id.length > ISSUE_PROPOSAL_VERIFICATION_COMMAND_ID_MAX ||
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

function isProvenance(value: unknown): value is IssueProposalProvenanceV1 {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, ISSUE_PROPOSAL_PROVENANCE_KEYS)) return false;
  if (!isRoadmapId(value.roadmapId)) return false;
  if (!isAuthorityFingerprint(value.roadmapAuthorityFingerprint)) return false;
  return true;
}

function isMetadata(value: unknown): value is IssueProposalMetadataV1 {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, ISSUE_PROPOSAL_METADATA_KEYS)) return false;
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
      !Array.isArray(value.notes) ||
      value.notes.length > ISSUE_PROPOSAL_METADATA_NOTES_MAX ||
      !value.notes.every((note) =>
        isNonEmptyBoundedString(note, ISSUE_PROPOSAL_METADATA_NOTE_MAX),
      )
    ) {
      return false;
    }
  }
  return true;
}

function sortStringsStable(values: string[]): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Raw document body → JSON value. Syntax errors become REJECTED_SCHEMA (never throw).
 */
export function parseIssueProposalJsonBody(raw: unknown):
  | { ok: true; value: unknown }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (typeof raw !== "string") {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Issue proposal body must be a UTF-8 JSON string.",
    };
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Issue proposal body is not valid JSON syntax.",
    };
  }
}

/**
 * Structural fail-closed parse for IssueProposalV1 documents.
 * Mirrors docs/issue-proposal/schemas/issue-proposal-v1.schema.json including
 * additionalProperties:false on all objects.
 */
export function parseIssueProposalV1(
  value: unknown,
):
  | { ok: true; proposal: IssueProposalV1 }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Issue proposal must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, ISSUE_PROPOSAL_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "Issue proposal contains unknown properties (additionalProperties forbidden).",
    };
  }
  if (value.schemaVersion !== ISSUE_PROPOSAL_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `schemaVersion must be ${ISSUE_PROPOSAL_SCHEMA}.`,
    };
  }
  if (!isProposalId(value.proposalId)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "proposalId is missing or malformed.",
    };
  }
  if (!isNodeId(value.roadmapNodeId)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "roadmapNodeId is missing or malformed.",
    };
  }
  if (!isRepository(value.repository)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "repository is missing or malformed.",
    };
  }
  if (!isNonEmptyBoundedString(value.title, ISSUE_PROPOSAL_TITLE_MAX)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "title is missing or malformed.",
    };
  }
  if (
    !isNonEmptyBoundedString(value.objective, ISSUE_PROPOSAL_OBJECTIVE_MAX)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "objective is missing or malformed.",
    };
  }
  if (
    !Array.isArray(value.dependsOn) ||
    value.dependsOn.length > ISSUE_PROPOSAL_DEPENDS_ON_MAX ||
    !value.dependsOn.every(isProposalId)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "dependsOn must be an array of well-formed proposalIds.",
    };
  }
  if (hasDuplicates(value.dependsOn as string[]).length > 0) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "dependsOn contains duplicate entries.",
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
  const forbiddenParsed = parsePathArray(
    value.forbiddenPaths,
    "forbiddenPaths",
    0,
  );
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
    value.acceptanceCriteria.length > ISSUE_PROPOSAL_ACCEPTANCE_CRITERIA_MAX ||
    !value.acceptanceCriteria.every((item) =>
      isNonEmptyBoundedString(item, ISSUE_PROPOSAL_ACCEPTANCE_CRITERION_MAX),
    )
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "acceptanceCriteria must contain at least one non-empty criterion.",
    };
  }
  if (hasDuplicates(value.acceptanceCriteria as string[]).length > 0) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "acceptanceCriteria contains duplicate entries.",
    };
  }

  if (
    !Array.isArray(value.verificationCommands) ||
    value.verificationCommands.length < 1 ||
    value.verificationCommands.length >
      ISSUE_PROPOSAL_VERIFICATION_COMMANDS_MAX ||
    !value.verificationCommands.every(isVerificationCommand)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "verificationCommands must contain at least one well-formed command object.",
    };
  }
  const verificationIds = (
    value.verificationCommands as IssueProposalVerificationCommandV1[]
  ).map((command) => command.id);
  if (hasDuplicates(verificationIds).length > 0) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "verificationCommands[].id values must be unique.",
    };
  }

  if (
    !Array.isArray(value.allowedCapabilities) ||
    value.allowedCapabilities.length > ISSUE_PROPOSAL_CAPABILITIES_MAX ||
    !value.allowedCapabilities.every(isCapabilityId)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "allowedCapabilities contains malformed capability identifiers.",
    };
  }
  if (hasDuplicates(value.allowedCapabilities as string[]).length > 0) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "allowedCapabilities contains duplicate entries.",
    };
  }

  if (!isRiskClass(value.riskClass)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `riskClass must be one of ${ISSUE_PROPOSAL_RISK_CLASSES.join(", ")}.`,
    };
  }
  if (!isStopAt(value.stopAt)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `stopAt must be one of ${ISSUE_PROPOSAL_STOP_AT_VALUES.join(", ")}.`,
    };
  }
  if (
    typeof value.estimatedChangedFiles !== "number" ||
    !Number.isInteger(value.estimatedChangedFiles) ||
    value.estimatedChangedFiles < 1 ||
    value.estimatedChangedFiles > ISSUE_PROPOSAL_ESTIMATED_CHANGED_FILES_MAX
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "estimatedChangedFiles must be an integer between 1 and 10000.",
    };
  }
  if (!isProvenance(value.provenance)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "provenance must bind roadmapId and a 64-character lowercase SHA-256 roadmapAuthorityFingerprint.",
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
    proposal: {
      schemaVersion: ISSUE_PROPOSAL_SCHEMA,
      proposalId: value.proposalId,
      roadmapNodeId: value.roadmapNodeId,
      repository: value.repository,
      title: value.title,
      objective: value.objective,
      dependsOn: value.dependsOn as string[],
      allowedPaths: allowedParsed.paths,
      forbiddenPaths: forbiddenParsed.paths,
      acceptanceCriteria: value.acceptanceCriteria as string[],
      verificationCommands:
        value.verificationCommands as IssueProposalVerificationCommandV1[],
      allowedCapabilities: value.allowedCapabilities as string[],
      riskClass: value.riskClass,
      stopAt: value.stopAt,
      estimatedChangedFiles: value.estimatedChangedFiles,
      provenance: value.provenance,
      metadata: value.metadata as IssueProposalMetadataV1 | undefined,
    },
  };
}

/**
 * Authority-bearing facts only.
 * Excludes metadata (including observedAt).
 * Path / dependency / capability / criterion lists are sorted so insertion
 * order does not change the fingerprint.
 */
export function captureIssueProposalAuthorityFacts(
  proposal: IssueProposalV1,
): IssueProposalAuthorityFactsV1 {
  const verificationCommands = [...proposal.verificationCommands]
    .map(
      (command): IssueProposalVerificationCommandAuthorityFactsV1 => ({
        id: command.id,
        command: command.command,
        ...(command.workingDirectory !== undefined
          ? { workingDirectory: normalizeRepoPath(command.workingDirectory) }
          : {}),
        ...(command.description !== undefined
          ? { description: command.description }
          : {}),
      }),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    schemaVersion: proposal.schemaVersion,
    proposalId: proposal.proposalId,
    roadmapNodeId: proposal.roadmapNodeId,
    repository: proposal.repository,
    title: proposal.title,
    objective: proposal.objective,
    dependsOn: sortStringsStable(proposal.dependsOn),
    allowedPaths: sortStringsStable(
      proposal.allowedPaths.map(normalizeRepoPath),
    ),
    forbiddenPaths: sortStringsStable(
      proposal.forbiddenPaths.map(normalizeRepoPath),
    ),
    acceptanceCriteria: sortStringsStable(proposal.acceptanceCriteria),
    verificationCommands,
    allowedCapabilities: sortStringsStable(proposal.allowedCapabilities),
    riskClass: proposal.riskClass,
    stopAt: proposal.stopAt,
    estimatedChangedFiles: proposal.estimatedChangedFiles,
    provenance: {
      roadmapId: proposal.provenance.roadmapId,
      roadmapAuthorityFingerprint:
        proposal.provenance.roadmapAuthorityFingerprint,
    },
  };
}

/**
 * Deterministic SHA-256 hex over canonical JSON of authority facts.
 * metadata / observedAt never participate.
 */
export async function computeIssueProposalAuthorityFingerprint(
  proposal: IssueProposalV1,
): Promise<string> {
  const facts = captureIssueProposalAuthorityFacts(proposal);
  const canonical = canonicalJson(facts);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function issueProposalAuthorityFingerprintsEqual(
  a: string,
  b: string,
): boolean {
  return a === b;
}

export interface ValidateIssueProposalOptions {
  validatedAt?: string;
  /**
   * Validated RoadmapContractV1 used for exact roadmapId / fingerprint /
   * roadmapNodeId binding. Required for semantic validation.
   */
  roadmapContract: RoadmapContractV1;
  /**
   * Validated ProjectContractV1 used for repository / risk / prohibited
   * capability authority. Required for semantic validation.
   */
  projectContract: ProjectContractV1;
}

function buildValidationResult(input: {
  proposalId: string | null;
  roadmapNodeId: string | null;
  status: IssueProposalValidationStatus;
  reasonCode: string;
  reasonMessage: string;
  findings?: IssueProposalValidationFinding[];
  authorityFingerprint?: string;
  validatedAt: string;
}): IssueProposalValidationResultV1 {
  return {
    schemaVersion: ISSUE_PROPOSAL_VALIDATION_RESULT_SCHEMA,
    proposalId: input.proposalId,
    roadmapNodeId: input.roadmapNodeId,
    status: input.status,
    reasonCode: input.reasonCode,
    reasonMessage: input.reasonMessage,
    findings: input.findings,
    authorityFingerprint: input.authorityFingerprint,
    validatedAt: input.validatedAt,
  };
}

/**
 * Semantic proposal-local + Roadmap/Project binding validation.
 * Never grants GitHub Issue mutation or Agent execution authority.
 * Does not silently repair invalid proposal fields.
 */
export async function validateIssueProposalV1(
  proposal: IssueProposalV1,
  options: ValidateIssueProposalOptions,
): Promise<IssueProposalValidationResultV1> {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const findings: IssueProposalValidationFinding[] = [];
  const authorityFingerprint =
    await computeIssueProposalAuthorityFingerprint(proposal);
  const roadmap = options.roadmapContract;
  const project = options.projectContract;

  if (proposal.provenance.roadmapId !== roadmap.roadmapId) {
    findings.push({
      path: "provenance.roadmapId",
      code: "REJECTED_ROADMAP_BINDING",
      message: `proposal.provenance.roadmapId (${proposal.provenance.roadmapId}) must equal RoadmapContract.roadmapId (${roadmap.roadmapId}).`,
      severity: "ERROR",
    });
  }

  const expectedRoadmapFp =
    await computeRoadmapContractAuthorityFingerprint(roadmap);
  if (proposal.provenance.roadmapAuthorityFingerprint !== expectedRoadmapFp) {
    findings.push({
      path: "provenance.roadmapAuthorityFingerprint",
      code: "REJECTED_ROADMAP_BINDING",
      message:
        "proposal.provenance.roadmapAuthorityFingerprint does not match the provided RoadmapContractV1 authority fingerprint.",
      severity: "ERROR",
    });
  }

  const expectedProjectFp =
    await computeProjectContractAuthorityFingerprint(project);
  if (roadmap.projectId !== project.projectId) {
    findings.push({
      path: "roadmapContract.projectId",
      code: "REJECTED_ROADMAP_BINDING",
      message:
        "supplied RoadmapContract.projectId must equal ProjectContract.projectId for proposal binding.",
      severity: "ERROR",
    });
  }
  if (roadmap.projectAuthorityFingerprint !== expectedProjectFp) {
    findings.push({
      path: "roadmapContract.projectAuthorityFingerprint",
      code: "REJECTED_ROADMAP_BINDING",
      message:
        "supplied RoadmapContract.projectAuthorityFingerprint must match ProjectContractV1 authority fingerprint.",
      severity: "ERROR",
    });
  }

  const node = roadmap.nodes.find(
    (candidate) => candidate.nodeId === proposal.roadmapNodeId,
  );
  if (!node) {
    findings.push({
      path: "roadmapNodeId",
      code: "REJECTED_ROADMAP_NODE_BINDING",
      message: `roadmapNodeId "${proposal.roadmapNodeId}" is not present in the supplied RoadmapContractV1.`,
      severity: "ERROR",
    });
  } else if (
    node.repository !== undefined &&
    proposal.repository !== node.repository
  ) {
    findings.push({
      path: "repository",
      code: "REJECTED_REPOSITORY_BINDING",
      message: `proposal.repository (${proposal.repository}) must equal bound RoadmapNode.repository (${node.repository}).`,
      severity: "ERROR",
    });
  }

  const allowedRepositories = new Set(
    project.repositories.map((ref) => ref.repository),
  );
  if (!allowedRepositories.has(proposal.repository)) {
    findings.push({
      path: "repository",
      code: "REJECTED_REPOSITORY_BINDING",
      message: `proposal.repository "${proposal.repository}" is outside ProjectContractV1 repository authority.`,
      severity: "ERROR",
    });
  }

  if (proposal.dependsOn.includes(proposal.proposalId)) {
    findings.push({
      path: "dependsOn",
      code: "REJECTED_DEPENDENCY",
      message: `proposal "${proposal.proposalId}" depends on itself.`,
      severity: "ERROR",
    });
  }

  if (proposal.acceptanceCriteria.length < 1) {
    findings.push({
      path: "acceptanceCriteria",
      code: "REJECTED_ACCEPTANCE_CRITERIA",
      message: "acceptanceCriteria requires at least one entry.",
      severity: "ERROR",
    });
  }

  const pathConflicts = findPathBoundaryConflicts(
    proposal.allowedPaths,
    proposal.forbiddenPaths,
  );
  for (const conflict of pathConflicts) {
    findings.push({
      path: "allowedPaths/forbiddenPaths",
      code: "REJECTED_PATH_CONFLICT",
      message:
        conflict.kind === "exact"
          ? `Path "${conflict.path}" appears in both allowedPaths and forbiddenPaths.`
          : `Path "${conflict.path}" overlaps forbidden path "${conflict.other}".`,
      severity: "ERROR",
    });
  }

  const prohibited = new Set(project.constraints.prohibitedCapabilities ?? []);
  for (const capability of proposal.allowedCapabilities) {
    if (prohibited.has(capability)) {
      findings.push({
        path: "allowedCapabilities",
        code: "REJECTED_CAPABILITY",
        message: `Capability "${capability}" is prohibited by ProjectContractV1 constraints.`,
        severity: "ERROR",
      });
    }
  }

  const maxRisk = project.constraints.maxRiskClass;
  if (
    maxRisk !== undefined &&
    riskClassRank(proposal.riskClass) > riskClassRank(maxRisk)
  ) {
    findings.push({
      path: "riskClass",
      code: "REJECTED_RISK_CLASS",
      message: `proposal.riskClass (${proposal.riskClass}) exceeds ProjectContract maxRiskClass (${maxRisk}).`,
      severity: "ERROR",
    });
  }

  const hasErrors = findings.some((f) => f.severity === "ERROR");
  if (hasErrors) {
    return buildValidationResult({
      proposalId: proposal.proposalId,
      roadmapNodeId: proposal.roadmapNodeId,
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
    proposalId: proposal.proposalId,
    roadmapNodeId: proposal.roadmapNodeId,
    status: "VALID",
    reasonCode: "VALID",
    reasonMessage:
      "Issue proposal passed structural, proposal-local, and Roadmap/Project binding validation. Validation does not grant GitHub Issue mutation or Agent execution authority.",
    authorityFingerprint,
    validatedAt,
  });
}

/**
 * Parse raw value → structural parse → semantic validation in one step.
 * Malformed documents never throw.
 */
export async function parseAndValidateIssueProposalV1(
  value: unknown,
  options: ValidateIssueProposalOptions,
): Promise<
  | {
      ok: true;
      proposal: IssueProposalV1;
      validation: IssueProposalValidationResultV1;
    }
  | {
      ok: false;
      proposal: IssueProposalV1 | null;
      validation: IssueProposalValidationResultV1;
    }
> {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const parsed = parseIssueProposalV1(value);
  if (!parsed.ok) {
    const proposalId =
      isPlainObject(value) && typeof value.proposalId === "string"
        ? value.proposalId
        : null;
    const roadmapNodeId =
      isPlainObject(value) && typeof value.roadmapNodeId === "string"
        ? value.roadmapNodeId
        : null;
    return {
      ok: false,
      proposal: null,
      validation: buildValidationResult({
        proposalId,
        roadmapNodeId,
        status: "INVALID",
        reasonCode: parsed.reasonCode,
        reasonMessage: parsed.reasonMessage,
        validatedAt,
      }),
    };
  }

  const validation = await validateIssueProposalV1(parsed.proposal, options);
  if (validation.status === "VALID") {
    return { ok: true, proposal: parsed.proposal, validation };
  }
  return { ok: false, proposal: parsed.proposal, validation };
}

/**
 * Structural parse for IssueProposalValidationResultV1 documents.
 */
export function parseIssueProposalValidationResult(
  value: unknown,
):
  | { ok: true; result: IssueProposalValidationResultV1 }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Validation result must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, ISSUE_PROPOSAL_VALIDATION_RESULT_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "Validation result contains unknown properties (additionalProperties forbidden).",
    };
  }
  if (value.schemaVersion !== ISSUE_PROPOSAL_VALIDATION_RESULT_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `schemaVersion must be ${ISSUE_PROPOSAL_VALIDATION_RESULT_SCHEMA}.`,
    };
  }
  if (!Object.prototype.hasOwnProperty.call(value, "proposalId")) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "proposalId is required (use null when unknown).",
    };
  }
  if (value.proposalId !== null && !isProposalId(value.proposalId)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "proposalId is malformed when present.",
    };
  }
  if (!Object.prototype.hasOwnProperty.call(value, "roadmapNodeId")) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "roadmapNodeId is required (use null when unknown).",
    };
  }
  if (value.roadmapNodeId !== null && !isNodeId(value.roadmapNodeId)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "roadmapNodeId is malformed when present.",
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
    value.reasonCode.length > ISSUE_PROPOSAL_REASON_CODE_MAX
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
    value.reasonMessage.length > ISSUE_PROPOSAL_REASON_MESSAGE_MAX
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
      value.findings.length > ISSUE_PROPOSAL_FINDINGS_MAX ||
      !value.findings.every(
        (finding) =>
          isPlainObject(finding) &&
          hasOnlyKeys(finding, ["path", "code", "message", "severity"]) &&
          typeof finding.path === "string" &&
          finding.path.length >= 1 &&
          finding.path.length <= ISSUE_PROPOSAL_FINDING_PATH_MAX &&
          typeof finding.code === "string" &&
          finding.code.length >= 1 &&
          finding.code.length <= ISSUE_PROPOSAL_FINDING_CODE_MAX &&
          typeof finding.message === "string" &&
          finding.message.length >= 1 &&
          finding.message.length <= ISSUE_PROPOSAL_FINDING_MESSAGE_MAX &&
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
    if (!isAuthorityFingerprint(value.authorityFingerprint)) {
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
      schemaVersion: ISSUE_PROPOSAL_VALIDATION_RESULT_SCHEMA,
      proposalId: value.proposalId as string | null,
      roadmapNodeId: value.roadmapNodeId as string | null,
      status,
      reasonCode: value.reasonCode,
      reasonMessage: value.reasonMessage,
      findings: value.findings as IssueProposalValidationFinding[] | undefined,
      authorityFingerprint: value.authorityFingerprint as string | undefined,
      validatedAt: value.validatedAt,
    },
  };
}

/** Guard that planner / mutation / execution surfaces remain disabled. */
export function assertIssueProposalSurfacesNotImplemented(): void {
  if (
    ISSUE_PROPOSAL_PLANNER_IMPLEMENTED ||
    ISSUE_PROPOSAL_VALIDATOR_V1_IMPLEMENTED ||
    ISSUE_PROPOSAL_SPLITTER_IMPLEMENTED ||
    ISSUE_PROPOSAL_GITHUB_ISSUE_MUTATION_IMPLEMENTED ||
    ISSUE_PROPOSAL_PUBLISHER_IMPLEMENTED ||
    ISSUE_PROPOSAL_AGENT_EXECUTION_IMPLEMENTED ||
    ISSUE_PROPOSAL_SCHEDULER_IMPLEMENTED
  ) {
    throw new Error(
      "ISSUE-PROPOSAL-V1 planner/validator/publisher/agent/scheduler surfaces must remain NOT IMPLEMENTED in contract-only state",
    );
  }
}
