/**
 * AGENT-TASK-BUILDER-V1
 *
 * BUILDER ONLY · NO AGENT EXECUTION · NO GITHUB PUBLICATION
 *
 * Deterministically converts a Human-selected GitHub Issue representation into
 * an AgentTaskV1 proposal, then validates it through AGENT-TASK-CONTRACT-V1.
 * Does not execute verification commands, call Agents, publish branches, or
 * mutate GitHub.
 */

import {
  AGENT_TASK_OBJECTIVE_MAX,
  AGENT_TASK_RISK_CLASSES,
  AGENT_TASK_SCHEMA,
  AGENT_TASK_STOP_AT_VALUES,
  AGENT_TASK_VALIDATION_RESULT_SCHEMA,
  parseAgentTaskV1,
  validateAgentTaskV1,
  type AgentTaskConstraints,
  type AgentTaskRiskClass,
  type AgentTaskStopAt,
  type AgentTaskV1,
  type AgentTaskValidationResultV1,
  type AgentTaskVerificationCommand,
} from "./agentTaskContract";

export const AGENT_TASK_BUILDER_VERSION = "AGENT-TASK-BUILDER-V1" as const;

/** Builder surfaces remain non-executing in this slice. */
export const AGENT_TASK_BUILDER_EXECUTION_IMPLEMENTED = false as const;
export const AGENT_TASK_BUILDER_PUBLICATION_IMPLEMENTED = false as const;

export const AGENT_TASK_BUILDER_INPUT_ROOT_KEYS = [
  "repository",
  "issueNumber",
  "baseRevision",
  "issueTitle",
  "issueBody",
  "issueLabels",
  "observedAt",
  "proposal",
] as const;

export const AGENT_TASK_BUILDER_PROPOSAL_KEYS = [
  "allowedPaths",
  "forbiddenPaths",
  "acceptanceCriteria",
  "verificationCommands",
  "allowedCapabilities",
  "riskClass",
  "stopAt",
  "constraints",
  "taskId",
] as const;

export type AgentTaskBuilderStatus =
  | "BUILT"
  | "HOLD"
  | "INVALID"
  | "UNKNOWN";

export type AgentTaskBuilderReasonCode =
  | "BUILT"
  | "HOLD_PATH_SCOPE_MISSING"
  | "HOLD_ACCEPTANCE_CRITERIA_MISSING"
  | "HOLD_RISK_CLASS_MISSING"
  | "HOLD_STOP_AT_MISSING"
  | "HOLD_AMBIGUOUS_AUTHORITY"
  | "HOLD_PATH_BOUNDARY_AMBIGUOUS"
  | "INVALID_INPUT"
  | "INVALID_REPOSITORY"
  | "INVALID_BASE_REVISION"
  | "INVALID_ISSUE_NUMBER"
  | "INVALID_ISSUE_TITLE"
  | "INVALID_ISSUE_BODY"
  | "INVALID_PROPOSAL"
  | "INVALID_TASK_SCHEMA"
  | "INVALID_TASK_SEMANTICS"
  | "UNKNOWN_BUILDER_STATE";

/**
 * Explicit proposal fields. Issue prose is never authority for these.
 * Missing required scope fails closed (HOLD), never invented.
 */
export interface AgentTaskBuilderProposal {
  /** Required for BUILT. Never invented from Issue prose. */
  allowedPaths?: string[];
  forbiddenPaths?: string[];
  /** Required for BUILT. Never invented from unrestricted prose. */
  acceptanceCriteria?: string[];
  /** Data only — never executed by the builder. */
  verificationCommands?: AgentTaskVerificationCommand[];
  /**
   * Default-deny. Omitted → []. Never inferred from Issue prose.
   * Explicit non-empty values are still validated by the contract parser.
   */
  allowedCapabilities?: string[];
  riskClass?: AgentTaskRiskClass;
  stopAt?: AgentTaskStopAt;
  constraints?: AgentTaskConstraints;
  /** Optional override; otherwise deterministic from bound inputs. */
  taskId?: string;
}

export interface AgentTaskBuilderInputV1 {
  repository: string;
  issueNumber: number;
  baseRevision: string;
  issueTitle: string;
  issueBody: string;
  issueLabels?: string[];
  observedAt: string;
  proposal?: AgentTaskBuilderProposal;
}

export interface AgentTaskBuilderResultV1 {
  schemaVersion: "AGENT-TASK-BUILDER-RESULT-V1";
  builderVersion: typeof AGENT_TASK_BUILDER_VERSION;
  status: AgentTaskBuilderStatus;
  task: AgentTaskV1 | null;
  validation: AgentTaskValidationResultV1;
  reasonCode: AgentTaskBuilderReasonCode;
  reasonMessage: string;
}

const REPOSITORY_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const BASE_REVISION_PATTERN = /^[a-f0-9]{40}$/;

/**
 * Phrases that claim unrestricted authority. Detection never grants authority;
 * it only forces HOLD when required explicit proposal scope is incomplete.
 */
export const AMBIGUOUS_AUTHORITY_PATTERNS: readonly RegExp[] = [
  /\bedit\s+anything\b/i,
  /\bchange\s+anything\b/i,
  /\bmodify\s+anything\b/i,
  /\bany\s+files?\s+needed\b/i,
  /\bwhatever\s+(?:files?|paths?|commands?)\b/i,
  /\brun\s+whatever\b/i,
  /\bmerge\s+when\s+done\b/i,
  /\bready\s+(?:the\s+)?pr\b/i,
  /\bunrestricted\b/i,
  /\bno\s+path\s+limits?\b/i,
  /\bentire\s+repository\b/i,
  /\bwhole\s+repo(?:sitory)?\b/i,
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function emptyValidation(
  taskId: string | null,
  validatedAt: string,
  reasonCode: string,
  reasonMessage: string,
  status: AgentTaskValidationResultV1["status"] = "INVALID",
): AgentTaskValidationResultV1 {
  return {
    schemaVersion: AGENT_TASK_VALIDATION_RESULT_SCHEMA,
    taskId,
    status,
    reasonCode,
    reasonMessage,
    validatedAt,
  };
}

function result(input: {
  status: AgentTaskBuilderStatus;
  task: AgentTaskV1 | null;
  validation: AgentTaskValidationResultV1;
  reasonCode: AgentTaskBuilderReasonCode;
  reasonMessage: string;
}): AgentTaskBuilderResultV1 {
  return {
    schemaVersion: "AGENT-TASK-BUILDER-RESULT-V1",
    builderVersion: AGENT_TASK_BUILDER_VERSION,
    status: input.status,
    task: input.task,
    validation: input.validation,
    reasonCode: input.reasonCode,
    reasonMessage: input.reasonMessage,
  };
}

export function detectAmbiguousAuthorityProse(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of AMBIGUOUS_AUTHORITY_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) hits.push(match[0]);
  }
  return hits;
}

/**
 * Deterministic task id from bound identity fields.
 * Does not incorporate Issue body prose (body may change without changing attempt).
 */
export function buildDeterministicTaskId(input: {
  repository: string;
  issueNumber: number;
  baseRevision: string;
}): string {
  const repo = input.repository.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const id = `agent-task-${repo}-${input.issueNumber}-${input.baseRevision.slice(0, 12)}`;
  return id.slice(0, 128);
}

/**
 * Deterministic objective from title + bounded body excerpt.
 * Truncates to AGENT_TASK_OBJECTIVE_MAX.
 */
export function buildObjectiveFromIssue(input: {
  issueTitle: string;
  issueBody: string;
}): string {
  const title = input.issueTitle.trim();
  const body = input.issueBody.trim().replace(/\s+/g, " ");
  const composed = `Issue objective: ${title}\n\nContext: ${body}`;
  if (composed.length <= AGENT_TASK_OBJECTIVE_MAX) return composed;
  return `${composed.slice(0, AGENT_TASK_OBJECTIVE_MAX - 1)}…`;
}

function isRiskClass(value: unknown): value is AgentTaskRiskClass {
  return (AGENT_TASK_RISK_CLASSES as readonly string[]).includes(value as string);
}

function isStopAt(value: unknown): value is AgentTaskStopAt {
  return (AGENT_TASK_STOP_AT_VALUES as readonly string[]).includes(value as string);
}

function parseProposal(
  value: unknown,
):
  | { ok: true; proposal: AgentTaskBuilderProposal }
  | { ok: false; reasonCode: AgentTaskBuilderReasonCode; reasonMessage: string } {
  if (value === undefined) {
    return { ok: true, proposal: {} };
  }
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "INVALID_PROPOSAL",
      reasonMessage: "proposal must be a JSON object when provided.",
    };
  }
  if (!hasOnlyKeys(value, AGENT_TASK_BUILDER_PROPOSAL_KEYS)) {
    return {
      ok: false,
      reasonCode: "INVALID_PROPOSAL",
      reasonMessage: "proposal contains unknown properties.",
    };
  }

  const proposal: AgentTaskBuilderProposal = {};

  if (value.allowedPaths !== undefined) {
    if (
      !Array.isArray(value.allowedPaths) ||
      !value.allowedPaths.every((p) => typeof p === "string")
    ) {
      return {
        ok: false,
        reasonCode: "INVALID_PROPOSAL",
        reasonMessage: "proposal.allowedPaths must be an array of strings.",
      };
    }
    proposal.allowedPaths = value.allowedPaths as string[];
  }

  if (value.forbiddenPaths !== undefined) {
    if (
      !Array.isArray(value.forbiddenPaths) ||
      !value.forbiddenPaths.every((p) => typeof p === "string")
    ) {
      return {
        ok: false,
        reasonCode: "INVALID_PROPOSAL",
        reasonMessage: "proposal.forbiddenPaths must be an array of strings.",
      };
    }
    proposal.forbiddenPaths = value.forbiddenPaths as string[];
  }

  if (value.acceptanceCriteria !== undefined) {
    if (
      !Array.isArray(value.acceptanceCriteria) ||
      !value.acceptanceCriteria.every((c) => typeof c === "string")
    ) {
      return {
        ok: false,
        reasonCode: "INVALID_PROPOSAL",
        reasonMessage: "proposal.acceptanceCriteria must be an array of strings.",
      };
    }
    proposal.acceptanceCriteria = value.acceptanceCriteria as string[];
  }

  if (value.verificationCommands !== undefined) {
    if (!Array.isArray(value.verificationCommands)) {
      return {
        ok: false,
        reasonCode: "INVALID_PROPOSAL",
        reasonMessage: "proposal.verificationCommands must be an array.",
      };
    }
    proposal.verificationCommands =
      value.verificationCommands as AgentTaskVerificationCommand[];
  }

  if (value.allowedCapabilities !== undefined) {
    if (
      !Array.isArray(value.allowedCapabilities) ||
      !value.allowedCapabilities.every((c) => typeof c === "string")
    ) {
      return {
        ok: false,
        reasonCode: "INVALID_PROPOSAL",
        reasonMessage: "proposal.allowedCapabilities must be an array of strings.",
      };
    }
    proposal.allowedCapabilities = value.allowedCapabilities as string[];
  }

  if (value.riskClass !== undefined) {
    if (!isRiskClass(value.riskClass)) {
      return {
        ok: false,
        reasonCode: "INVALID_PROPOSAL",
        reasonMessage: `proposal.riskClass must be one of ${AGENT_TASK_RISK_CLASSES.join(", ")}.`,
      };
    }
    proposal.riskClass = value.riskClass;
  }

  if (value.stopAt !== undefined) {
    if (!isStopAt(value.stopAt)) {
      return {
        ok: false,
        reasonCode: "INVALID_PROPOSAL",
        reasonMessage: `proposal.stopAt must be one of ${AGENT_TASK_STOP_AT_VALUES.join(", ")}.`,
      };
    }
    proposal.stopAt = value.stopAt;
  }

  if (value.constraints !== undefined) {
    if (!isPlainObject(value.constraints)) {
      return {
        ok: false,
        reasonCode: "INVALID_PROPOSAL",
        reasonMessage: "proposal.constraints must be an object.",
      };
    }
    proposal.constraints = value.constraints as AgentTaskConstraints;
  }

  if (value.taskId !== undefined) {
    if (typeof value.taskId !== "string" || value.taskId.length < 1) {
      return {
        ok: false,
        reasonCode: "INVALID_PROPOSAL",
        reasonMessage: "proposal.taskId must be a non-empty string when provided.",
      };
    }
    proposal.taskId = value.taskId;
  }

  return { ok: true, proposal };
}

/**
 * Fail-closed parse of builder input. Unknown root keys are rejected.
 */
export function parseAgentTaskBuilderInput(
  value: unknown,
):
  | { ok: true; input: AgentTaskBuilderInputV1 }
  | { ok: false; reasonCode: AgentTaskBuilderReasonCode; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reasonCode: "INVALID_INPUT",
      reasonMessage: "Builder input must be a JSON object.",
    };
  }
  if (!hasOnlyKeys(value, AGENT_TASK_BUILDER_INPUT_ROOT_KEYS)) {
    return {
      ok: false,
      reasonCode: "INVALID_INPUT",
      reasonMessage: "Builder input contains unknown properties.",
    };
  }

  if (
    typeof value.repository !== "string" ||
    value.repository.length < 3 ||
    value.repository.length > 256 ||
    !REPOSITORY_PATTERN.test(value.repository)
  ) {
    return {
      ok: false,
      reasonCode: "INVALID_REPOSITORY",
      reasonMessage: "repository is missing or malformed.",
    };
  }

  if (
    typeof value.issueNumber !== "number" ||
    !Number.isInteger(value.issueNumber) ||
    value.issueNumber < 1
  ) {
    return {
      ok: false,
      reasonCode: "INVALID_ISSUE_NUMBER",
      reasonMessage: "issueNumber must be an integer >= 1.",
    };
  }

  if (
    typeof value.baseRevision !== "string" ||
    !BASE_REVISION_PATTERN.test(value.baseRevision)
  ) {
    return {
      ok: false,
      reasonCode: "INVALID_BASE_REVISION",
      reasonMessage: "baseRevision must be a 40-character lowercase Git SHA.",
    };
  }

  if (typeof value.issueTitle !== "string" || value.issueTitle.trim().length < 1) {
    return {
      ok: false,
      reasonCode: "INVALID_ISSUE_TITLE",
      reasonMessage: "issueTitle must be a non-empty string.",
    };
  }

  if (typeof value.issueBody !== "string" || value.issueBody.trim().length < 1) {
    return {
      ok: false,
      reasonCode: "INVALID_ISSUE_BODY",
      reasonMessage: "issueBody must be a non-empty string.",
    };
  }

  if (typeof value.observedAt !== "string" || value.observedAt.length < 1) {
    return {
      ok: false,
      reasonCode: "INVALID_INPUT",
      reasonMessage: "observedAt must be a non-empty string.",
    };
  }

  if (value.issueLabels !== undefined) {
    if (
      !Array.isArray(value.issueLabels) ||
      !value.issueLabels.every((label) => typeof label === "string")
    ) {
      return {
        ok: false,
        reasonCode: "INVALID_INPUT",
        reasonMessage: "issueLabels must be an array of strings when provided.",
      };
    }
  }

  const proposalParsed = parseProposal(value.proposal);
  if (!proposalParsed.ok) {
    return {
      ok: false,
      reasonCode: proposalParsed.reasonCode,
      reasonMessage: proposalParsed.reasonMessage,
    };
  }

  return {
    ok: true,
    input: {
      repository: value.repository,
      issueNumber: value.issueNumber,
      baseRevision: value.baseRevision,
      issueTitle: value.issueTitle,
      issueBody: value.issueBody,
      issueLabels: value.issueLabels as string[] | undefined,
      observedAt: value.observedAt,
      proposal: proposalParsed.proposal,
    },
  };
}

function hasExplicitPathScope(proposal: AgentTaskBuilderProposal): boolean {
  return Array.isArray(proposal.allowedPaths) && proposal.allowedPaths.length > 0;
}

function hasExplicitAcceptanceCriteria(proposal: AgentTaskBuilderProposal): boolean {
  return (
    Array.isArray(proposal.acceptanceCriteria) &&
    proposal.acceptanceCriteria.length > 0 &&
    proposal.acceptanceCriteria.every(
      (item) => typeof item === "string" && item.trim().length > 0,
    )
  );
}

/**
 * Build AgentTaskV1 from a Human-selected Issue representation.
 * Never executes commands, widens paths, or grants capabilities from prose.
 */
export function buildAgentTaskFromIssue(
  rawInput: unknown,
  options: { validatedAt?: string; treatPrefixOverlapAsHold?: boolean } = {},
): AgentTaskBuilderResultV1 {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();

  const parsedInput = parseAgentTaskBuilderInput(rawInput);
  if (!parsedInput.ok) {
    return result({
      status: "INVALID",
      task: null,
      validation: emptyValidation(
        null,
        validatedAt,
        parsedInput.reasonCode,
        parsedInput.reasonMessage,
      ),
      reasonCode: parsedInput.reasonCode,
      reasonMessage: parsedInput.reasonMessage,
    });
  }

  const input = parsedInput.input;
  const proposal = input.proposal ?? {};

  const ambiguousHits = detectAmbiguousAuthorityProse(
    `${input.issueTitle}\n${input.issueBody}`,
  );

  if (!hasExplicitPathScope(proposal)) {
    return result({
      status: "HOLD",
      task: null,
      validation: emptyValidation(
        null,
        validatedAt,
        "HOLD_PATH_SCOPE_MISSING",
        "allowedPaths must be supplied explicitly in proposal; Issue prose is not authority.",
        "HOLD",
      ),
      reasonCode: "HOLD_PATH_SCOPE_MISSING",
      reasonMessage:
        ambiguousHits.length > 0
          ? `Path scope missing. Ambiguous authority phrases detected (${ambiguousHits.join(", ")}); explicit allowedPaths required.`
          : "Path scope missing. proposal.allowedPaths must be an explicit non-empty array.",
    });
  }

  if (!hasExplicitAcceptanceCriteria(proposal)) {
    return result({
      status: "HOLD",
      task: null,
      validation: emptyValidation(
        null,
        validatedAt,
        "HOLD_ACCEPTANCE_CRITERIA_MISSING",
        "acceptanceCriteria must be supplied explicitly in proposal.",
        "HOLD",
      ),
      reasonCode: "HOLD_ACCEPTANCE_CRITERIA_MISSING",
      reasonMessage:
        "Acceptance criteria missing. proposal.acceptanceCriteria must be an explicit non-empty array.",
    });
  }

  if (proposal.riskClass === undefined) {
    return result({
      status: "HOLD",
      task: null,
      validation: emptyValidation(
        null,
        validatedAt,
        "HOLD_RISK_CLASS_MISSING",
        "riskClass must be supplied explicitly in proposal.",
        "HOLD",
      ),
      reasonCode: "HOLD_RISK_CLASS_MISSING",
      reasonMessage: "riskClass missing. proposal.riskClass is required and must not be inferred from prose.",
    });
  }

  if (proposal.stopAt === undefined) {
    return result({
      status: "HOLD",
      task: null,
      validation: emptyValidation(
        null,
        validatedAt,
        "HOLD_STOP_AT_MISSING",
        "stopAt must be supplied explicitly in proposal.",
        "HOLD",
      ),
      reasonCode: "HOLD_STOP_AT_MISSING",
      reasonMessage: "stopAt missing. proposal.stopAt is required and must not be inferred from prose.",
    });
  }

  // Ambiguous prose never blocks an explicitly scoped proposal, but is recorded.
  const notes: string[] = [
    "Built by AGENT-TASK-BUILDER-V1",
    "Issue prose is input data, not authority",
  ];
  if (ambiguousHits.length > 0) {
    notes.push(
      `Ambiguous authority phrases ignored: ${ambiguousHits.join(", ")}`,
    );
  }
  if (input.issueLabels && input.issueLabels.length > 0) {
    notes.push(`issueLabels: ${input.issueLabels.join(", ")}`);
  }

  const taskId =
    proposal.taskId ??
    buildDeterministicTaskId({
      repository: input.repository,
      issueNumber: input.issueNumber,
      baseRevision: input.baseRevision,
    });

  // Default-deny: omitted capabilities → []. Never invent from prose.
  const allowedCapabilities = proposal.allowedCapabilities ?? [];

  const candidate: AgentTaskV1 = {
    schemaVersion: AGENT_TASK_SCHEMA,
    taskId,
    repository: input.repository,
    baseRevision: input.baseRevision,
    sourceIssue: {
      repository: input.repository,
      number: input.issueNumber,
    },
    objective: buildObjectiveFromIssue({
      issueTitle: input.issueTitle,
      issueBody: input.issueBody,
    }),
    allowedPaths: [...proposal.allowedPaths!],
    forbiddenPaths: [...(proposal.forbiddenPaths ?? [])],
    acceptanceCriteria: [...proposal.acceptanceCriteria!],
    verificationCommands: [...(proposal.verificationCommands ?? [])],
    allowedCapabilities: [...allowedCapabilities],
    riskClass: proposal.riskClass,
    stopAt: proposal.stopAt,
    constraints: proposal.constraints,
    metadata: {
      createdAt: input.observedAt,
      createdBy: AGENT_TASK_BUILDER_VERSION,
      sourceIssueUrl: `https://github.com/${input.repository}/issues/${input.issueNumber}`,
      builderVersion: AGENT_TASK_BUILDER_VERSION,
      notes,
    },
  };

  const structural = parseAgentTaskV1(candidate);
  if (!structural.ok) {
    return result({
      status: "INVALID",
      task: null,
      validation: emptyValidation(
        taskId,
        validatedAt,
        structural.reasonCode,
        structural.reasonMessage,
      ),
      reasonCode: "INVALID_TASK_SCHEMA",
      reasonMessage: structural.reasonMessage,
    });
  }

  const validation = validateAgentTaskV1(structural.task, {
    validatedAt,
    treatPrefixOverlapAsHold: options.treatPrefixOverlapAsHold,
  });

  if (validation.status === "VALID") {
    return result({
      status: "BUILT",
      task: structural.task,
      validation,
      reasonCode: "BUILT",
      reasonMessage: "AgentTaskV1 built and validated successfully.",
    });
  }

  if (validation.status === "HOLD") {
    return result({
      status: "HOLD",
      task: structural.task,
      validation,
      reasonCode: "HOLD_PATH_BOUNDARY_AMBIGUOUS",
      reasonMessage: validation.reasonMessage,
    });
  }

  if (validation.status === "UNKNOWN") {
    return result({
      status: "UNKNOWN",
      task: structural.task,
      validation,
      reasonCode: "UNKNOWN_BUILDER_STATE",
      reasonMessage: validation.reasonMessage,
    });
  }

  return result({
    status: "INVALID",
    task: structural.task,
    validation,
    reasonCode: "INVALID_TASK_SEMANTICS",
    reasonMessage: validation.reasonMessage,
  });
}

export function assertAgentTaskBuilderNotExecuting(): void {
  if (
    AGENT_TASK_BUILDER_EXECUTION_IMPLEMENTED ||
    AGENT_TASK_BUILDER_PUBLICATION_IMPLEMENTED
  ) {
    throw new Error(
      "AGENT-TASK-BUILDER-V1 execution/publication surfaces must remain NOT IMPLEMENTED",
    );
  }
}
