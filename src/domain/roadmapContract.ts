/**
 * ROADMAP-CONTRACT-V1 design contract helpers.
 *
 * DESIGNED · CONTRACT ONLY · NO PLANNER · NO ISSUE PROPOSAL ·
 * NO GITHUB ISSUE MUTATION · NO AGENT EXECUTION · NO SCHEDULER
 *
 * Pure parse / DAG validate / fingerprint for the machine-readable roadmap
 * contract bound to a validated ProjectContractV1. Does not invoke an LLM,
 * generate IssueProposal records, mutate GitHub, or dispatch Agents.
 */

import { canonicalJson } from "./decisionFingerprint";
import {
  computeProjectContractAuthorityFingerprint,
  type ProjectContractV1,
} from "./projectContract";

export const ROADMAP_CONTRACT_SCHEMA = "ROADMAP-CONTRACT-V1" as const;
export const ROADMAP_CONTRACT_VALIDATION_RESULT_SCHEMA =
  "ROADMAP-CONTRACT-VALIDATION-RESULT-V1" as const;

/** Downstream planning / mutation surfaces remain unimplemented in this slice. */
export const ROADMAP_PLANNER_IMPLEMENTED = false as const;
export const ROADMAP_ISSUE_PROPOSAL_GENERATION_IMPLEMENTED = false as const;
export const ROADMAP_GITHUB_ISSUE_MUTATION_IMPLEMENTED = false as const;
export const ROADMAP_AGENT_EXECUTION_IMPLEMENTED = false as const;
export const ROADMAP_SCHEDULER_IMPLEMENTED = false as const;

export const ROADMAP_NODE_COMPLEXITY_VALUES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
] as const;

export const ROADMAP_NODE_STATUS_VALUES = [
  "PLANNED",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETE",
  "HOLD",
  "UNKNOWN",
] as const;

export const ROADMAP_CONTRACT_ROADMAP_ID_MAX = 128 as const;
export const ROADMAP_CONTRACT_PROJECT_ID_MAX = 128 as const;
export const ROADMAP_CONTRACT_NODE_ID_MAX = 128 as const;
export const ROADMAP_CONTRACT_TITLE_MAX = 256 as const;
export const ROADMAP_CONTRACT_OBJECTIVE_MAX = 4096 as const;
export const ROADMAP_CONTRACT_PHASE_MAX = 64 as const;
export const ROADMAP_CONTRACT_NODES_MAX = 256 as const;
export const ROADMAP_CONTRACT_DEPENDS_ON_MAX = 64 as const;
export const ROADMAP_CONTRACT_COMPLETION_CRITERIA_MAX = 32 as const;
export const ROADMAP_CONTRACT_COMPLETION_CRITERION_MAX = 2048 as const;
export const ROADMAP_CONTRACT_FINDINGS_MAX = 64 as const;
export const ROADMAP_CONTRACT_FINDING_PATH_MAX = 512 as const;
export const ROADMAP_CONTRACT_FINDING_CODE_MAX = 128 as const;
export const ROADMAP_CONTRACT_FINDING_MESSAGE_MAX = 2048 as const;
export const ROADMAP_CONTRACT_REASON_CODE_MAX = 128 as const;
export const ROADMAP_CONTRACT_REASON_MESSAGE_MAX = 2048 as const;
export const ROADMAP_CONTRACT_METADATA_NOTES_MAX = 16 as const;
export const ROADMAP_CONTRACT_METADATA_NOTE_MAX = 1024 as const;

/** Exact root keys accepted by RoadmapContractV1 (additionalProperties: false). */
export const ROADMAP_CONTRACT_ROOT_KEYS = [
  "schemaVersion",
  "roadmapId",
  "projectId",
  "projectAuthorityFingerprint",
  "nodes",
  "metadata",
] as const;

export const ROADMAP_NODE_KEYS = [
  "nodeId",
  "title",
  "objective",
  "phase",
  "dependsOn",
  "completionCriteria",
  "estimatedComplexity",
  "status",
  "repository",
] as const;

/**
 * Authority fingerprint includes project binding + node DAG authority.
 * Audit-only metadata (including observedAt) is excluded.
 * Node `status` is progress/observation and is also excluded.
 */
export const ROADMAP_CONTRACT_AUTHORITY_FINGERPRINT_KEYS = [
  "schemaVersion",
  "roadmapId",
  "projectId",
  "projectAuthorityFingerprint",
  "nodes",
] as const;

/**
 * Per-node authority facts hashed inside the roadmap fingerprint.
 * `status` remains on RoadmapNodeV1 for progress observation but is not
 * authority-bearing — PLANNED→READY→IN_PROGRESS→COMPLETE must not change
 * the roadmap authority identity.
 */
export const ROADMAP_NODE_AUTHORITY_FINGERPRINT_KEYS = [
  "nodeId",
  "title",
  "objective",
  "phase",
  "dependsOn",
  "completionCriteria",
  "estimatedComplexity",
  "repository",
] as const;

export const ROADMAP_CONTRACT_METADATA_KEYS = [
  "createdAt",
  "createdBy",
  "observedAt",
  "sourceIssueUrl",
  "notes",
] as const;

export const ROADMAP_CONTRACT_VALIDATION_RESULT_ROOT_KEYS = [
  "schemaVersion",
  "roadmapId",
  "projectId",
  "status",
  "reasonCode",
  "reasonMessage",
  "findings",
  "authorityFingerprint",
  "validatedAt",
] as const;

export type RoadmapNodeComplexity =
  (typeof ROADMAP_NODE_COMPLEXITY_VALUES)[number];
export type RoadmapNodeStatus = (typeof ROADMAP_NODE_STATUS_VALUES)[number];

export type RoadmapContractValidationStatus =
  | "VALID"
  | "INVALID"
  | "HOLD"
  | "UNKNOWN";

export type RoadmapContractRejectReason =
  | "REJECTED_SCHEMA"
  | "REJECTED_ROADMAP_ID"
  | "REJECTED_PROJECT_BINDING"
  | "REJECTED_NODES"
  | "REJECTED_DUPLICATE_NODE_ID"
  | "REJECTED_DEPENDENCY_MISSING"
  | "REJECTED_SELF_DEPENDENCY"
  | "REJECTED_CYCLE"
  | "REJECTED_COMPLETION_CRITERIA"
  | "REJECTED_REPOSITORY_BINDING"
  | "REJECTED_METADATA";

export interface RoadmapNodeV1 {
  nodeId: string;
  title: string;
  objective: string;
  phase: string;
  dependsOn: string[];
  completionCriteria: string[];
  estimatedComplexity: RoadmapNodeComplexity;
  /**
   * Mutable progress / observation state (PLANNED → READY → IN_PROGRESS →
   * COMPLETE, etc.). Structurally validated, but never part of the authority
   * fingerprint.
   */
  status: RoadmapNodeStatus;
  /** Optional; when present must be within ProjectContractV1 repositories. */
  repository?: string;
}

/**
 * Audit / observation metadata. Never part of the authority fingerprint.
 * observedAt is explicitly audit-only.
 */
export interface RoadmapContractMetadataV1 {
  createdAt?: string;
  createdBy?: string;
  observedAt?: string;
  sourceIssueUrl?: string;
  notes?: string[];
}

export interface RoadmapContractV1 {
  schemaVersion: typeof ROADMAP_CONTRACT_SCHEMA;
  roadmapId: string;
  projectId: string;
  /** Exact ProjectContractV1 authority fingerprint binding. */
  projectAuthorityFingerprint: string;
  nodes: RoadmapNodeV1[];
  metadata?: RoadmapContractMetadataV1;
}

/**
 * Authority-bearing node facts only.
 * Excludes `status` (progress/observation) and any audit metadata.
 */
export interface RoadmapNodeAuthorityFactsV1 {
  nodeId: string;
  title: string;
  objective: string;
  phase: string;
  dependsOn: string[];
  completionCriteria: string[];
  estimatedComplexity: RoadmapNodeComplexity;
  repository?: string;
}

export interface RoadmapContractAuthorityFactsV1 {
  schemaVersion: typeof ROADMAP_CONTRACT_SCHEMA;
  roadmapId: string;
  projectId: string;
  projectAuthorityFingerprint: string;
  nodes: RoadmapNodeAuthorityFactsV1[];
}

export interface RoadmapContractValidationFinding {
  path: string;
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
}

export interface RoadmapContractValidationResultV1 {
  schemaVersion: typeof ROADMAP_CONTRACT_VALIDATION_RESULT_SCHEMA;
  roadmapId: string | null;
  projectId: string | null;
  status: RoadmapContractValidationStatus;
  reasonCode: string;
  reasonMessage: string;
  findings?: RoadmapContractValidationFinding[];
  /** Present only when structural parse succeeded and fingerprint was computed. */
  authorityFingerprint?: string;
  validatedAt: string;
}

const REPOSITORY_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const ROADMAP_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const NODE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const PHASE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const AUTHORITY_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

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

function isRoadmapId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= ROADMAP_CONTRACT_ROADMAP_ID_MAX &&
    ROADMAP_ID_PATTERN.test(value)
  );
}

function isProjectId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= ROADMAP_CONTRACT_PROJECT_ID_MAX &&
    PROJECT_ID_PATTERN.test(value)
  );
}

function isNodeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= ROADMAP_CONTRACT_NODE_ID_MAX &&
    NODE_ID_PATTERN.test(value)
  );
}

function isPhase(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= ROADMAP_CONTRACT_PHASE_MAX &&
    PHASE_PATTERN.test(value)
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

function isComplexity(value: unknown): value is RoadmapNodeComplexity {
  return (ROADMAP_NODE_COMPLEXITY_VALUES as readonly string[]).includes(
    value as string,
  );
}

function isNodeStatus(value: unknown): value is RoadmapNodeStatus {
  return (ROADMAP_NODE_STATUS_VALUES as readonly string[]).includes(
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

function isStringArray(
  value: unknown,
  maxItems: number,
  maxItemLen: number,
  minItems: number,
  itemPredicate?: (item: unknown) => boolean,
): value is string[] {
  const predicate =
    itemPredicate ??
    ((item: unknown) => isNonEmptyBoundedString(item, maxItemLen));
  return (
    Array.isArray(value) &&
    value.length >= minItems &&
    value.length <= maxItems &&
    value.every(predicate)
  );
}

function isMetadata(value: unknown): value is RoadmapContractMetadataV1 {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, ROADMAP_CONTRACT_METADATA_KEYS)) return false;
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
        ROADMAP_CONTRACT_METADATA_NOTES_MAX,
        ROADMAP_CONTRACT_METADATA_NOTE_MAX,
        0,
      )
    ) {
      return false;
    }
  }
  return true;
}

function isRoadmapNode(value: unknown): value is RoadmapNodeV1 {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, ROADMAP_NODE_KEYS)) return false;
  if (!isNodeId(value.nodeId)) return false;
  if (!isNonEmptyBoundedString(value.title, ROADMAP_CONTRACT_TITLE_MAX)) {
    return false;
  }
  if (
    !isNonEmptyBoundedString(value.objective, ROADMAP_CONTRACT_OBJECTIVE_MAX)
  ) {
    return false;
  }
  if (!isPhase(value.phase)) return false;
  if (
    !isStringArray(
      value.dependsOn,
      ROADMAP_CONTRACT_DEPENDS_ON_MAX,
      ROADMAP_CONTRACT_NODE_ID_MAX,
      0,
      isNodeId,
    )
  ) {
    return false;
  }
  if (hasDuplicates(value.dependsOn as string[]).length > 0) return false;
  if (
    !isStringArray(
      value.completionCriteria,
      ROADMAP_CONTRACT_COMPLETION_CRITERIA_MAX,
      ROADMAP_CONTRACT_COMPLETION_CRITERION_MAX,
      1,
    )
  ) {
    return false;
  }
  if (hasDuplicates(value.completionCriteria as string[]).length > 0) {
    return false;
  }
  if (!isComplexity(value.estimatedComplexity)) return false;
  if (!isNodeStatus(value.status)) return false;
  if (value.repository !== undefined && !isRepository(value.repository)) {
    return false;
  }
  return true;
}

/**
 * Detect directed cycles. Returns one cycle path (nodeIds) when found.
 * Does not repair or rewrite the graph.
 */
export function findRoadmapCycle(nodes: RoadmapNodeV1[]): string[] | null {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function dfs(nodeId: string): string[] | null {
    if (visiting.has(nodeId)) {
      const start = stack.indexOf(nodeId);
      return start >= 0
        ? [...stack.slice(start), nodeId]
        : [nodeId, nodeId];
    }
    if (visited.has(nodeId)) return null;
    const node = byId.get(nodeId);
    if (!node) return null;

    visiting.add(nodeId);
    stack.push(nodeId);
    for (const dep of node.dependsOn) {
      const cycle = dfs(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  }

  for (const node of nodes) {
    const cycle = dfs(node.nodeId);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Raw document body → JSON value. Syntax errors become REJECTED_SCHEMA (never throw).
 */
export function parseRoadmapContractJsonBody(raw: unknown):
  | { ok: true; value: unknown }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (typeof raw !== "string") {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Roadmap contract body must be a UTF-8 JSON string.",
    };
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Roadmap contract body is not valid JSON syntax.",
    };
  }
}

/**
 * Structural fail-closed parse for RoadmapContractV1 documents.
 * Mirrors docs/roadmap-contract/schemas/roadmap-contract-v1.schema.json including
 * additionalProperties:false on all objects.
 */
export function parseRoadmapContractV1(
  value: unknown,
):
  | { ok: true; roadmap: RoadmapContractV1 }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Roadmap contract must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, ROADMAP_CONTRACT_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "Roadmap contract contains unknown properties (additionalProperties forbidden).",
    };
  }
  if (value.schemaVersion !== ROADMAP_CONTRACT_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `schemaVersion must be ${ROADMAP_CONTRACT_SCHEMA}.`,
    };
  }
  if (!isRoadmapId(value.roadmapId)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "roadmapId is missing or malformed.",
    };
  }
  if (!isProjectId(value.projectId)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "projectId is missing or malformed.",
    };
  }
  if (!isAuthorityFingerprint(value.projectAuthorityFingerprint)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "projectAuthorityFingerprint must be a 64-character lowercase SHA-256 hex string.",
    };
  }
  if (
    !Array.isArray(value.nodes) ||
    value.nodes.length < 1 ||
    value.nodes.length > ROADMAP_CONTRACT_NODES_MAX ||
    !value.nodes.every(isRoadmapNode)
  ) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "nodes must contain at least one well-formed roadmap node.",
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
    roadmap: {
      schemaVersion: ROADMAP_CONTRACT_SCHEMA,
      roadmapId: value.roadmapId,
      projectId: value.projectId,
      projectAuthorityFingerprint: value.projectAuthorityFingerprint,
      nodes: value.nodes as RoadmapNodeV1[],
      metadata: value.metadata as RoadmapContractMetadataV1 | undefined,
    },
  };
}

function sortStringsStable(values: string[]): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Authority-bearing facts only.
 * Excludes:
 * - metadata (including observedAt)
 * - node.status (mutable progress / observation; not plan authority)
 *
 * Nodes are sorted by nodeId; dependsOn / completionCriteria are sorted
 * so insertion order does not change the fingerprint.
 */
export function captureRoadmapContractAuthorityFacts(
  roadmap: RoadmapContractV1,
): RoadmapContractAuthorityFactsV1 {
  const nodes = [...roadmap.nodes]
    .map((node): RoadmapNodeAuthorityFactsV1 => ({
      nodeId: node.nodeId,
      title: node.title,
      objective: node.objective,
      phase: node.phase,
      dependsOn: sortStringsStable(node.dependsOn),
      completionCriteria: sortStringsStable(node.completionCriteria),
      estimatedComplexity: node.estimatedComplexity,
      ...(node.repository !== undefined
        ? { repository: node.repository }
        : {}),
    }))
    .sort((a, b) =>
      a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0,
    );

  return {
    schemaVersion: roadmap.schemaVersion,
    roadmapId: roadmap.roadmapId,
    projectId: roadmap.projectId,
    projectAuthorityFingerprint: roadmap.projectAuthorityFingerprint,
    nodes,
  };
}

/**
 * Deterministic SHA-256 hex over canonical JSON of authority facts.
 * metadata / observedAt / node.status never participate.
 */
export async function computeRoadmapContractAuthorityFingerprint(
  roadmap: RoadmapContractV1,
): Promise<string> {
  const facts = captureRoadmapContractAuthorityFacts(roadmap);
  const canonical = canonicalJson(facts);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function roadmapContractAuthorityFingerprintsEqual(
  a: string,
  b: string,
): boolean {
  return a === b;
}

export interface ValidateRoadmapContractOptions {
  validatedAt?: string;
  /**
   * Validated ProjectContractV1 used for exact projectId / fingerprint /
   * repository-authority binding. Required for semantic validation.
   */
  projectContract: ProjectContractV1;
}

function buildValidationResult(input: {
  roadmapId: string | null;
  projectId: string | null;
  status: RoadmapContractValidationStatus;
  reasonCode: string;
  reasonMessage: string;
  findings?: RoadmapContractValidationFinding[];
  authorityFingerprint?: string;
  validatedAt: string;
}): RoadmapContractValidationResultV1 {
  return {
    schemaVersion: ROADMAP_CONTRACT_VALIDATION_RESULT_SCHEMA,
    roadmapId: input.roadmapId,
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
 * Semantic DAG + ProjectContract binding validation.
 * Never generates IssueProposal records, mutates GitHub, or dispatches Agents.
 * Does not silently repair the graph.
 */
export async function validateRoadmapContractV1(
  roadmap: RoadmapContractV1,
  options: ValidateRoadmapContractOptions,
): Promise<RoadmapContractValidationResultV1> {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const findings: RoadmapContractValidationFinding[] = [];
  const authorityFingerprint =
    await computeRoadmapContractAuthorityFingerprint(roadmap);
  const project = options.projectContract;

  if (roadmap.projectId !== project.projectId) {
    findings.push({
      path: "projectId",
      code: "REJECTED_PROJECT_BINDING",
      message: `roadmap.projectId (${roadmap.projectId}) must equal ProjectContract.projectId (${project.projectId}).`,
      severity: "ERROR",
    });
  }

  const expectedProjectFp =
    await computeProjectContractAuthorityFingerprint(project);
  if (roadmap.projectAuthorityFingerprint !== expectedProjectFp) {
    findings.push({
      path: "projectAuthorityFingerprint",
      code: "REJECTED_PROJECT_BINDING",
      message:
        "roadmap.projectAuthorityFingerprint does not match the provided ProjectContractV1 authority fingerprint.",
      severity: "ERROR",
    });
  }

  const nodeIds = roadmap.nodes.map((node) => node.nodeId);
  const duplicateNodeIds = hasDuplicates(nodeIds);
  for (const nodeId of duplicateNodeIds) {
    findings.push({
      path: "nodes",
      code: "REJECTED_DUPLICATE_NODE_ID",
      message: `Duplicate nodeId "${nodeId}".`,
      severity: "ERROR",
    });
  }

  const nodeIdSet = new Set(nodeIds);
  const allowedRepositories = new Set(
    project.repositories.map((ref) => ref.repository),
  );

  for (const node of roadmap.nodes) {
    if (node.completionCriteria.length < 1) {
      findings.push({
        path: `nodes[${node.nodeId}].completionCriteria`,
        code: "REJECTED_COMPLETION_CRITERIA",
        message: `Node "${node.nodeId}" requires at least one completionCriteria entry.`,
        severity: "ERROR",
      });
    }

    for (const dep of node.dependsOn) {
      if (dep === node.nodeId) {
        findings.push({
          path: `nodes[${node.nodeId}].dependsOn`,
          code: "REJECTED_SELF_DEPENDENCY",
          message: `Node "${node.nodeId}" depends on itself.`,
          severity: "ERROR",
        });
      } else if (!nodeIdSet.has(dep)) {
        findings.push({
          path: `nodes[${node.nodeId}].dependsOn`,
          code: "REJECTED_DEPENDENCY_MISSING",
          message: `Node "${node.nodeId}" depends on missing nodeId "${dep}".`,
          severity: "ERROR",
        });
      }
    }

    if (
      node.repository !== undefined &&
      !allowedRepositories.has(node.repository)
    ) {
      findings.push({
        path: `nodes[${node.nodeId}].repository`,
        code: "REJECTED_REPOSITORY_BINDING",
        message: `Node "${node.nodeId}" repository "${node.repository}" is outside ProjectContractV1 repository authority.`,
        severity: "ERROR",
      });
    }
  }

  // Cycle detection only after structural id/dep shape is usable.
  if (duplicateNodeIds.length === 0) {
    const cycle = findRoadmapCycle(roadmap.nodes);
    if (cycle) {
      findings.push({
        path: "nodes",
        code: "REJECTED_CYCLE",
        message: `Roadmap graph contains a cycle: ${cycle.join(" -> ")}. DAG only; no silent repair.`,
        severity: "ERROR",
      });
    }
  }

  const hasErrors = findings.some((f) => f.severity === "ERROR");
  if (hasErrors) {
    return buildValidationResult({
      roadmapId: roadmap.roadmapId,
      projectId: roadmap.projectId,
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
    roadmapId: roadmap.roadmapId,
    projectId: roadmap.projectId,
    status: "VALID",
    reasonCode: "VALID",
    reasonMessage:
      "Roadmap contract passed structural, DAG, and ProjectContract binding validation.",
    authorityFingerprint,
    validatedAt,
  });
}

/**
 * Parse raw value → structural parse → semantic validation in one step.
 * Malformed documents never throw.
 */
export async function parseAndValidateRoadmapContractV1(
  value: unknown,
  options: ValidateRoadmapContractOptions,
): Promise<
  | {
      ok: true;
      roadmap: RoadmapContractV1;
      validation: RoadmapContractValidationResultV1;
    }
  | {
      ok: false;
      roadmap: RoadmapContractV1 | null;
      validation: RoadmapContractValidationResultV1;
    }
> {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const parsed = parseRoadmapContractV1(value);
  if (!parsed.ok) {
    const roadmapId =
      isPlainObject(value) && typeof value.roadmapId === "string"
        ? value.roadmapId
        : null;
    const projectId =
      isPlainObject(value) && typeof value.projectId === "string"
        ? value.projectId
        : null;
    return {
      ok: false,
      roadmap: null,
      validation: buildValidationResult({
        roadmapId,
        projectId,
        status: "INVALID",
        reasonCode: parsed.reasonCode,
        reasonMessage: parsed.reasonMessage,
        validatedAt,
      }),
    };
  }

  const validation = await validateRoadmapContractV1(parsed.roadmap, options);
  if (validation.status === "VALID") {
    return { ok: true, roadmap: parsed.roadmap, validation };
  }
  return { ok: false, roadmap: parsed.roadmap, validation };
}

/**
 * Structural parse for RoadmapContractValidationResultV1 documents.
 */
export function parseRoadmapContractValidationResult(
  value: unknown,
):
  | { ok: true; result: RoadmapContractValidationResultV1 }
  | { ok: false; reasonCode: "REJECTED_SCHEMA"; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Validation result must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, ROADMAP_CONTRACT_VALIDATION_RESULT_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage:
        "Validation result contains unknown properties (additionalProperties forbidden).",
    };
  }
  if (value.schemaVersion !== ROADMAP_CONTRACT_VALIDATION_RESULT_SCHEMA) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: `schemaVersion must be ${ROADMAP_CONTRACT_VALIDATION_RESULT_SCHEMA}.`,
    };
  }
  if (!Object.prototype.hasOwnProperty.call(value, "roadmapId")) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "roadmapId is required (use null when unknown).",
    };
  }
  if (value.roadmapId !== null && !isRoadmapId(value.roadmapId)) {
    return {
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "roadmapId is malformed when present.",
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
    value.reasonCode.length > ROADMAP_CONTRACT_REASON_CODE_MAX
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
    value.reasonMessage.length > ROADMAP_CONTRACT_REASON_MESSAGE_MAX
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
      value.findings.length > ROADMAP_CONTRACT_FINDINGS_MAX ||
      !value.findings.every(
        (finding) =>
          isPlainObject(finding) &&
          hasOnlyKeys(finding, ["path", "code", "message", "severity"]) &&
          typeof finding.path === "string" &&
          finding.path.length >= 1 &&
          finding.path.length <= ROADMAP_CONTRACT_FINDING_PATH_MAX &&
          typeof finding.code === "string" &&
          finding.code.length >= 1 &&
          finding.code.length <= ROADMAP_CONTRACT_FINDING_CODE_MAX &&
          typeof finding.message === "string" &&
          finding.message.length >= 1 &&
          finding.message.length <= ROADMAP_CONTRACT_FINDING_MESSAGE_MAX &&
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
      schemaVersion: ROADMAP_CONTRACT_VALIDATION_RESULT_SCHEMA,
      roadmapId: value.roadmapId as string | null,
      projectId: value.projectId as string | null,
      status,
      reasonCode: value.reasonCode,
      reasonMessage: value.reasonMessage,
      findings: value.findings as RoadmapContractValidationFinding[] | undefined,
      authorityFingerprint: value.authorityFingerprint as string | undefined,
      validatedAt: value.validatedAt,
    },
  };
}

/** Guard that planning / mutation / scheduler surfaces remain disabled. */
export function assertRoadmapPlanningSurfacesNotImplemented(): void {
  if (
    ROADMAP_PLANNER_IMPLEMENTED ||
    ROADMAP_ISSUE_PROPOSAL_GENERATION_IMPLEMENTED ||
    ROADMAP_GITHUB_ISSUE_MUTATION_IMPLEMENTED ||
    ROADMAP_AGENT_EXECUTION_IMPLEMENTED ||
    ROADMAP_SCHEDULER_IMPLEMENTED
  ) {
    throw new Error(
      "ROADMAP-CONTRACT-V1 planning/mutation/scheduler surfaces must remain NOT IMPLEMENTED in contract-only state",
    );
  }
}
