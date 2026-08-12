/**
 * NO-PROMPT-PILOT-V1
 *
 * END-TO-END COMPOSITION HARNESS · FAKE/LOCAL ONLY
 * MANUAL AGENT PROMPT = 0
 * REAL PROVIDER EXECUTION = HOLD
 * REAL GITHUB PUBLICATION = HOLD
 *
 * Composes existing domain modules without reimplementing them:
 *   buildAgentTaskFromIssue → orchestrateAgentTaskV1 → runAgentTaskV1
 *   → verifyAgentRunnerResultV1 → publishDraftPrV1
 *
 * IMPORTANT: existing AGENT-RUNNER-V1 and DRAFT-PUBLISH-V1 authority
 * boundaries are incompatible for a single AgentTaskV1:
 *   Runner:  R0/R1 + workspace.read.v1
 *   Publisher: R2 + github.draft-pr.publish.v1 + stopAt=DRAFT_PR
 * Therefore the live positive PATH to PASS is:
 *   BLOCKED_BY_EXISTING_CONTRACT
 * Do not widen contracts merely to force PASS.
 */

import {
  parseAgentTaskV1,
  validateAgentTaskV1,
  type AgentTaskConstraints,
  type AgentTaskRiskClass,
  type AgentTaskStopAt,
  type AgentTaskV1,
  type AgentTaskVerificationCommand,
} from "./agentTaskContract";
import {
  buildAgentTaskFromIssue,
  type AgentTaskBuilderResultV1,
} from "./agentTaskBuilder";
import {
  orchestrateAgentTaskV1,
  type MinOrchestratorResultV1,
} from "./minOrchestrator";
import {
  AGENT_RUNNER_SUPPORTED_CAPABILITIES,
  AGENT_RUNNER_SUPPORTED_RISK_CLASSES,
  createFakeAgentRunnerAdapterV1,
  runAgentTaskV1,
  type AgentRunnerResultV1,
} from "./agentRunner";
import type { AgentRunnerAdapterV1 } from "./agentRunnerAdapter";
import {
  createFakeIndependentVerifyAdapterV1,
  verifyAgentRunnerResultV1,
  type IndependentVerifyResultV1,
} from "./independentVerify";
import type { IndependentVerifyAdapterV1 } from "./independentVerifyAdapter";
import {
  DRAFT_PUBLISH_REQUIRED_CAPABILITY,
  DRAFT_PUBLISH_REQUIRED_RISK_CLASS,
  DRAFT_PUBLISH_REQUIRED_STOP_AT,
  createFakeDraftPublishAdapterV1,
  publishDraftPrV1,
  type DraftPublishAttemptRecordV1,
  type DraftPublishResultV1,
} from "./draftPublish";
import {
  resetFakeDraftPublishCounterForTests,
  type DraftPublishAdapterV1,
} from "./draftPublishAdapter";

export const NO_PROMPT_PILOT_VERSION = "NO-PROMPT-PILOT-V1" as const;
export const NO_PROMPT_PILOT_EVIDENCE_SCHEMA =
  "NO-PROMPT-PILOT-EVIDENCE-V1" as const;

export const NO_PROMPT_PILOT_POSITIVE_PATH_STATUS =
  "BLOCKED_BY_EXISTING_CONTRACT" as const;

/**
 * Exact blocker: a single AgentTaskV1 cannot legitimately satisfy both
 * AGENT-RUNNER-V1 and DRAFT-PUBLISH-V1 without widening either contract.
 */
export const NO_PROMPT_PILOT_POSITIVE_PATH_BLOCKER = {
  blockerCode: "RUNNER_PUBLISHER_AUTHORITY_INCOMPATIBLE",
  runnerSupportsRiskClasses: AGENT_RUNNER_SUPPORTED_RISK_CLASSES,
  runnerSupportsCapabilities: AGENT_RUNNER_SUPPORTED_CAPABILITIES,
  publisherRequiresRiskClass: DRAFT_PUBLISH_REQUIRED_RISK_CLASS,
  publisherRequiresCapability: DRAFT_PUBLISH_REQUIRED_CAPABILITY,
  publisherRequiresStopAt: DRAFT_PUBLISH_REQUIRED_STOP_AT,
  nextContractSliceRequired:
    "Coordinated expansion of MIN-ORCHESTRATOR-V1 + AGENT-RUNNER-V1 to accept R2 and github.draft-pr.publish.v1 (or an explicit dual-stage task handoff). Do not silently widen inside the pilot.",
} as const;

export const NO_PROMPT_PILOT_INPUT_ROOT_KEYS = [
  "pilotId",
  "selectedIssue",
  "observedMainSha",
  "observedAt",
] as const;

export const NO_PROMPT_PILOT_SELECTED_ISSUE_KEYS = [
  "repository",
  "issueNumber",
  "issueTitle",
  "issueBody",
  "issueLabels",
  "allowedPaths",
  "forbiddenPaths",
  "acceptanceCriteria",
  "verificationCommands",
  "allowedCapabilities",
  "riskClass",
  "stopAt",
  "constraints",
] as const;

export type NoPromptPilotFinalStatus =
  | "PASS"
  | "HOLD"
  | "REJECT"
  | "FAILED"
  | "UNKNOWN";

export type NoPromptPilotReasonCode =
  | "PASS"
  | "HOLD_BUILDER"
  | "REJECT_BUILDER"
  | "UNKNOWN_BUILDER"
  | "REJECT_TASK_REPARSE"
  | "REJECT_TASK_REVALIDATION"
  | "HOLD_ORCHESTRATOR"
  | "REJECT_ORCHESTRATOR"
  | "UNKNOWN_ORCHESTRATOR"
  | "HOLD_RUNNER"
  | "REJECT_RUNNER"
  | "FAILED_RUNNER"
  | "UNKNOWN_RUNNER"
  | "HOLD_VERIFIER"
  | "REJECT_VERIFIER"
  | "FAILED_VERIFIER"
  | "UNKNOWN_VERIFIER"
  | "HOLD_PUBLISHER"
  | "REJECT_PUBLISHER"
  | "FAILED_PUBLISHER"
  | "UNKNOWN_PUBLISHER"
  | "HOLD_CONTRACT_INCOMPATIBILITY"
  | "REJECT_INPUT"
  | "REJECT_AUTHORITY_DRIFT"
  | "REJECT_MANUAL_PROMPT"
  | "REJECT_MANUAL_INTERVENTION"
  | "REJECT_EXTERNAL_MUTATION"
  | "UNKNOWN_PILOT_STATE";

export interface NoPromptPilotSelectedIssueV1 {
  repository: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  issueLabels?: string[];
  /** Explicit authority — never invented by the pilot after builder. */
  allowedPaths: string[];
  forbiddenPaths: string[];
  acceptanceCriteria: string[];
  verificationCommands: AgentTaskVerificationCommand[];
  allowedCapabilities: string[];
  riskClass: AgentTaskRiskClass;
  stopAt: AgentTaskStopAt;
  constraints?: AgentTaskConstraints;
}

export interface NoPromptPilotInputV1 {
  pilotId: string;
  selectedIssue: NoPromptPilotSelectedIssueV1;
  observedMainSha: string;
  observedAt: string;
}

export interface NoPromptPilotAuthorityFingerprintV1 {
  taskId: string;
  repository: string;
  baseRevision: string;
  sourceIssue: { repository: string; number: number };
  allowedPaths: string[];
  forbiddenPaths: string[];
  allowedCapabilities: string[];
  riskClass: AgentTaskRiskClass;
  stopAt: AgentTaskStopAt;
  constraints: AgentTaskConstraints | null;
}

export interface NoPromptPilotMetadataV1 {
  observedAt: string;
  pilotId: string;
  positivePathStatus: typeof NO_PROMPT_PILOT_POSITIVE_PATH_STATUS;
  positivePathBlocker: typeof NO_PROMPT_PILOT_POSITIVE_PATH_BLOCKER;
  authorityFingerprint: NoPromptPilotAuthorityFingerprintV1 | null;
  realAgentProviderExecution: false;
  realGithubPublication: false;
  githubMutationPerformed: false;
  networkAccess: false;
  secretsRequired: false;
  productionMutationPerformed: false;
  readyAuthorized: false;
  mergeAuthorized: false;
  issueCloseAuthorized: false;
  deployAuthorized: false;
  stagesCompleted: string[];
  stoppedAtStage: string | null;
}

export interface NoPromptPilotEvidenceV1 {
  schemaVersion: typeof NO_PROMPT_PILOT_EVIDENCE_SCHEMA;
  pilotVersion: typeof NO_PROMPT_PILOT_VERSION;
  pilotId: string;
  selectedIssue: NoPromptPilotSelectedIssueV1;
  observedMainSha: string;
  builderResult: AgentTaskBuilderResultV1 | null;
  agentTask: AgentTaskV1 | null;
  orchestratorResult: MinOrchestratorResultV1 | null;
  runnerResult: AgentRunnerResultV1 | null;
  independentVerifyResult: IndependentVerifyResultV1 | null;
  draftPublishResult: DraftPublishResultV1 | null;
  manualAgentPromptCount: number;
  humanActions: string[];
  externalMutations: [];
  finalStatus: NoPromptPilotFinalStatus;
  reasonCode: NoPromptPilotReasonCode;
  reasonMessage: string;
  metadata: NoPromptPilotMetadataV1;
  observedAt: string;
}

export interface RunNoPromptPilotV1Options {
  validatedAt?: string;
  runnerAdapter?: AgentRunnerAdapterV1;
  verifyAdapter?: IndependentVerifyAdapterV1;
  publishAdapter?: DraftPublishAdapterV1;
  publishAttemptRegistry?: Map<string, DraftPublishAttemptRecordV1>;
  /** Deterministic changed paths reported by the fake runner collect. */
  runnerChangedPaths?: string[];
  /**
   * Explicit KPI counter. Default 0.
   * Do not infer 0 merely because the field was absent from input — options
   * always materialize an explicit number.
   */
  manualAgentPromptCount?: number;
  humanActions?: string[];
  /** Explicit intervention flags — any true fails KPI. */
  humanTaskRepairs?: boolean;
  humanCapabilityChanges?: boolean;
  humanRiskChanges?: boolean;
  humanStopAtChanges?: boolean;
  humanRunnerEvidenceInjection?: boolean;
  humanVerifierEvidenceInjection?: boolean;
  humanPublisherEvidenceInjection?: boolean;
  /** When true, reset fake draft PR counter for deterministic suites. */
  resetFakePublishCounter?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isBaseRevision(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

/** Deterministic 40-hex SHA-like token from seed (not cryptographic security). */
export function deterministicRevisionFromSeed(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0xabcdef;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + 1), 0x01000193);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const out = `${hex(h1)}${hex(h2)}${hex(h1 ^ h2)}${hex(~h1)}${hex(h1 + h2)}`;
  return out.slice(0, 40);
}

export function captureAuthorityFingerprint(
  task: AgentTaskV1,
): NoPromptPilotAuthorityFingerprintV1 {
  return {
    taskId: task.taskId,
    repository: task.repository,
    baseRevision: task.baseRevision,
    sourceIssue: {
      repository: task.sourceIssue.repository,
      number: task.sourceIssue.number,
    },
    allowedPaths: [...task.allowedPaths],
    forbiddenPaths: [...task.forbiddenPaths],
    allowedCapabilities: [...task.allowedCapabilities],
    riskClass: task.riskClass,
    stopAt: task.stopAt,
    constraints: task.constraints ? { ...task.constraints } : null,
  };
}

export function authorityFingerprintsEqual(
  a: NoPromptPilotAuthorityFingerprintV1,
  b: NoPromptPilotAuthorityFingerprintV1,
): boolean {
  return stableJson(a) === stableJson(b);
}

/**
 * Whether one AgentTaskV1 can legitimately traverse both runner and publisher
 * under current contracts. Always false today — exported for tests/docs.
 */
export function taskSatisfiesRunnerAndPublisherContracts(
  task: AgentTaskV1,
): boolean {
  const runnerRiskOk = (
    AGENT_RUNNER_SUPPORTED_RISK_CLASSES as readonly string[]
  ).includes(task.riskClass);
  const runnerCapsOk = task.allowedCapabilities.every((c) =>
    (AGENT_RUNNER_SUPPORTED_CAPABILITIES as readonly string[]).includes(c),
  );
  const publisherRiskOk = task.riskClass === DRAFT_PUBLISH_REQUIRED_RISK_CLASS;
  const publisherCapOk = task.allowedCapabilities.includes(
    DRAFT_PUBLISH_REQUIRED_CAPABILITY,
  );
  const publisherStopOk = task.stopAt === DRAFT_PUBLISH_REQUIRED_STOP_AT;
  return (
    runnerRiskOk &&
    runnerCapsOk &&
    publisherRiskOk &&
    publisherCapOk &&
    publisherStopOk
  );
}

function metadataBase(input: {
  observedAt: string;
  pilotId: string;
  authorityFingerprint?: NoPromptPilotAuthorityFingerprintV1 | null;
  stagesCompleted?: string[];
  stoppedAtStage?: string | null;
}): NoPromptPilotMetadataV1 {
  return {
    observedAt: input.observedAt,
    pilotId: input.pilotId,
    positivePathStatus: NO_PROMPT_PILOT_POSITIVE_PATH_STATUS,
    positivePathBlocker: NO_PROMPT_PILOT_POSITIVE_PATH_BLOCKER,
    authorityFingerprint: input.authorityFingerprint ?? null,
    realAgentProviderExecution: false,
    realGithubPublication: false,
    githubMutationPerformed: false,
    networkAccess: false,
    secretsRequired: false,
    productionMutationPerformed: false,
    readyAuthorized: false,
    mergeAuthorized: false,
    issueCloseAuthorized: false,
    deployAuthorized: false,
    stagesCompleted: input.stagesCompleted ?? [],
    stoppedAtStage: input.stoppedAtStage ?? null,
  };
}

function buildEvidence(input: {
  pilotId: string;
  selectedIssue: NoPromptPilotSelectedIssueV1;
  observedMainSha: string;
  observedAt: string;
  finalStatus: NoPromptPilotFinalStatus;
  reasonCode: NoPromptPilotReasonCode;
  reasonMessage: string;
  manualAgentPromptCount: number;
  humanActions: string[];
  builderResult?: AgentTaskBuilderResultV1 | null;
  agentTask?: AgentTaskV1 | null;
  orchestratorResult?: MinOrchestratorResultV1 | null;
  runnerResult?: AgentRunnerResultV1 | null;
  independentVerifyResult?: IndependentVerifyResultV1 | null;
  draftPublishResult?: DraftPublishResultV1 | null;
  authorityFingerprint?: NoPromptPilotAuthorityFingerprintV1 | null;
  stagesCompleted?: string[];
  stoppedAtStage?: string | null;
}): NoPromptPilotEvidenceV1 {
  return {
    schemaVersion: NO_PROMPT_PILOT_EVIDENCE_SCHEMA,
    pilotVersion: NO_PROMPT_PILOT_VERSION,
    pilotId: input.pilotId,
    selectedIssue: input.selectedIssue,
    observedMainSha: input.observedMainSha,
    builderResult: input.builderResult ?? null,
    agentTask: input.agentTask ?? null,
    orchestratorResult: input.orchestratorResult ?? null,
    runnerResult: input.runnerResult ?? null,
    independentVerifyResult: input.independentVerifyResult ?? null,
    draftPublishResult: input.draftPublishResult ?? null,
    manualAgentPromptCount: input.manualAgentPromptCount,
    humanActions: [...input.humanActions],
    externalMutations: [],
    finalStatus: input.finalStatus,
    reasonCode: input.reasonCode,
    reasonMessage: input.reasonMessage,
    metadata: metadataBase({
      observedAt: input.observedAt,
      pilotId: input.pilotId,
      authorityFingerprint: input.authorityFingerprint,
      stagesCompleted: input.stagesCompleted,
      stoppedAtStage: input.stoppedAtStage,
    }),
    observedAt: input.observedAt,
  };
}

function parseSelectedIssue(
  value: unknown,
):
  | { ok: true; issue: NoPromptPilotSelectedIssueV1 }
  | { ok: false; reasonMessage: string } {
  if (!isPlainObject(value)) {
    return { ok: false, reasonMessage: "selectedIssue must be an object." };
  }
  if (!hasOnlyKeys(value, NO_PROMPT_PILOT_SELECTED_ISSUE_KEYS)) {
    return {
      ok: false,
      reasonMessage: "selectedIssue contains unknown properties.",
    };
  }
  if (typeof value.repository !== "string" || value.repository.length < 3) {
    return { ok: false, reasonMessage: "selectedIssue.repository malformed." };
  }
  if (typeof value.issueNumber !== "number" || value.issueNumber < 1) {
    return { ok: false, reasonMessage: "selectedIssue.issueNumber malformed." };
  }
  if (typeof value.issueTitle !== "string" || value.issueTitle.length < 1) {
    return { ok: false, reasonMessage: "selectedIssue.issueTitle malformed." };
  }
  if (typeof value.issueBody !== "string" || value.issueBody.length < 1) {
    return { ok: false, reasonMessage: "selectedIssue.issueBody malformed." };
  }
  if (
    value.issueLabels !== undefined &&
    (!Array.isArray(value.issueLabels) ||
      !value.issueLabels.every((l) => typeof l === "string"))
  ) {
    return { ok: false, reasonMessage: "selectedIssue.issueLabels malformed." };
  }
  if (!Array.isArray(value.allowedPaths) || !Array.isArray(value.forbiddenPaths)) {
    return {
      ok: false,
      reasonMessage: "selectedIssue path lists must be present arrays.",
    };
  }
  if (!Array.isArray(value.acceptanceCriteria)) {
    return {
      ok: false,
      reasonMessage: "selectedIssue.acceptanceCriteria must be an array.",
    };
  }
  if (!Array.isArray(value.verificationCommands)) {
    return {
      ok: false,
      reasonMessage: "selectedIssue.verificationCommands must be an array.",
    };
  }
  if (!Array.isArray(value.allowedCapabilities)) {
    return {
      ok: false,
      reasonMessage: "selectedIssue.allowedCapabilities must be an array.",
    };
  }
  if (typeof value.riskClass !== "string" || typeof value.stopAt !== "string") {
    return {
      ok: false,
      reasonMessage: "selectedIssue.riskClass/stopAt must be present strings.",
    };
  }
  return {
    ok: true,
    issue: {
      repository: value.repository,
      issueNumber: value.issueNumber,
      issueTitle: value.issueTitle,
      issueBody: value.issueBody,
      issueLabels: value.issueLabels as string[] | undefined,
      allowedPaths: value.allowedPaths as string[],
      forbiddenPaths: value.forbiddenPaths as string[],
      acceptanceCriteria: value.acceptanceCriteria as string[],
      verificationCommands:
        value.verificationCommands as AgentTaskVerificationCommand[],
      allowedCapabilities: value.allowedCapabilities as string[],
      riskClass: value.riskClass as AgentTaskRiskClass,
      stopAt: value.stopAt as AgentTaskStopAt,
      constraints: value.constraints as AgentTaskConstraints | undefined,
    },
  };
}

/**
 * Canonical LOW-risk synthetic pilot Issue representation.
 * Authority is explicit in the Issue representation — not invented later.
 *
 * Uses runner-compatible authority (R1 + workspace.read.v1 + DRAFT_PR) so
 * builder→orchestrator→runner→verify can execute for real. Publisher then
 * HOLDs on missing R2 / github.draft-pr.publish.v1 — surfacing
 * BLOCKED_BY_EXISTING_CONTRACT without widening contracts.
 */
export function createCanonicalNoPromptPilotIssue(
  observedMainSha: string,
): NoPromptPilotSelectedIssueV1 {
  void observedMainSha;
  return {
    repository: "yasutakesougo/ai-development-control-center",
    issueNumber: 55,
    issueTitle:
      "NO-PROMPT-PILOT-V1 — first end-to-end machine-selected AgentTask pilot",
    issueBody:
      "Synthetic LOW-risk pilot Issue. Machine-readable authority is explicit in proposal fields. No Human Agent execution prompt.",
    issueLabels: ["no-prompt-pilot"],
    allowedPaths: [
      "docs/no-prompt-pilot/",
      "src/domain/noPromptPilot.ts",
      "test/noPromptPilot.test.ts",
    ],
    forbiddenPaths: [".github/workflows/", "migrations/"],
    acceptanceCriteria: [
      "manualAgentPromptCount = 0",
      "Pipeline composes existing domain modules without widening contracts",
      "npm run verify passes",
    ],
    verificationCommands: [
      {
        id: "verify.all",
        command: "npm run verify",
        description: "Typecheck, test, and build",
      },
    ],
    allowedCapabilities: ["workspace.read.v1"],
    riskClass: "R1",
    stopAt: "DRAFT_PR",
    constraints: {
      maxChangedFiles: 8,
      requireIndependentVerify: true,
    },
  };
}

/**
 * Run NO-PROMPT-PILOT-V1 by composing existing domain modules.
 */
export function runNoPromptPilotV1(
  rawInput: unknown,
  options: RunNoPromptPilotV1Options = {},
): NoPromptPilotEvidenceV1 {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();
  const manualAgentPromptCount =
    typeof options.manualAgentPromptCount === "number"
      ? options.manualAgentPromptCount
      : 0;
  const humanActions = options.humanActions ?? [
    "SELECT_PILOT_ISSUE",
    "IMPLEMENTATION_START_GO",
  ];

  if (options.resetFakePublishCounter !== false) {
    resetFakeDraftPublishCounterForTests(2000);
  }

  const failEarly = (
    partial: Omit<
      Parameters<typeof buildEvidence>[0],
      "manualAgentPromptCount" | "humanActions"
    >,
  ) =>
    buildEvidence({
      ...partial,
      manualAgentPromptCount,
      humanActions,
    });

  if (!isPlainObject(rawInput)) {
    return failEarly({
      pilotId: "unknown",
      selectedIssue: createCanonicalNoPromptPilotIssue(
        "0000000000000000000000000000000000000000",
      ),
      observedMainSha: "0000000000000000000000000000000000000000",
      observedAt: validatedAt,
      finalStatus: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Pilot input must be a JSON object.",
      stoppedAtStage: "input",
    });
  }
  if (!hasOnlyKeys(rawInput, NO_PROMPT_PILOT_INPUT_ROOT_KEYS)) {
    return failEarly({
      pilotId:
        typeof rawInput.pilotId === "string" ? rawInput.pilotId : "unknown",
      selectedIssue: createCanonicalNoPromptPilotIssue(
        "0000000000000000000000000000000000000000",
      ),
      observedMainSha: "0000000000000000000000000000000000000000",
      observedAt:
        typeof rawInput.observedAt === "string"
          ? rawInput.observedAt
          : validatedAt,
      finalStatus: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "Pilot input contains unknown properties.",
      stoppedAtStage: "input",
    });
  }
  if (
    typeof rawInput.pilotId !== "string" ||
    rawInput.pilotId.length < 1 ||
    rawInput.pilotId.length > 128
  ) {
    return failEarly({
      pilotId: "unknown",
      selectedIssue: createCanonicalNoPromptPilotIssue(
        "0000000000000000000000000000000000000000",
      ),
      observedMainSha: "0000000000000000000000000000000000000000",
      observedAt: validatedAt,
      finalStatus: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "pilotId must be a non-empty bounded string.",
      stoppedAtStage: "input",
    });
  }
  if (!isBaseRevision(rawInput.observedMainSha)) {
    return failEarly({
      pilotId: rawInput.pilotId,
      selectedIssue: createCanonicalNoPromptPilotIssue(
        "0000000000000000000000000000000000000000",
      ),
      observedMainSha: "0000000000000000000000000000000000000000",
      observedAt: validatedAt,
      finalStatus: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "observedMainSha must be a 40-character lowercase Git SHA.",
      stoppedAtStage: "input",
    });
  }
  if (typeof rawInput.observedAt !== "string" || rawInput.observedAt.length < 1) {
    return failEarly({
      pilotId: rawInput.pilotId,
      selectedIssue: createCanonicalNoPromptPilotIssue(rawInput.observedMainSha),
      observedMainSha: rawInput.observedMainSha,
      observedAt: validatedAt,
      finalStatus: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "observedAt must be a non-empty string.",
      stoppedAtStage: "input",
    });
  }

  const pilotId = rawInput.pilotId;
  const observedMainSha = rawInput.observedMainSha;
  const observedAt = rawInput.observedAt;

  const issueParsed = parseSelectedIssue(rawInput.selectedIssue);
  if (!issueParsed.ok) {
    return failEarly({
      pilotId,
      selectedIssue: createCanonicalNoPromptPilotIssue(observedMainSha),
      observedMainSha,
      observedAt,
      finalStatus: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: issueParsed.reasonMessage,
      stoppedAtStage: "input",
    });
  }
  const selectedIssue = issueParsed.issue;

  // KPI / intervention gates before any stage work.
  if (manualAgentPromptCount > 0) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      finalStatus: "REJECT",
      reasonCode: "REJECT_MANUAL_PROMPT",
      reasonMessage: `manualAgentPromptCount=${manualAgentPromptCount} > 0; KPI failure.`,
      stoppedAtStage: "kpi",
    });
  }
  if (
    options.humanTaskRepairs === true ||
    options.humanCapabilityChanges === true ||
    options.humanRiskChanges === true ||
    options.humanStopAtChanges === true ||
    options.humanRunnerEvidenceInjection === true ||
    options.humanVerifierEvidenceInjection === true ||
    options.humanPublisherEvidenceInjection === true
  ) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      finalStatus: "REJECT",
      reasonCode: "REJECT_MANUAL_INTERVENTION",
      reasonMessage:
        "Human task repair / authority change / evidence injection is prohibited for NO-PROMPT-PILOT-V1.",
      stoppedAtStage: "kpi",
    });
  }

  const stagesCompleted: string[] = [];

  // ── Builder ──────────────────────────────────────────────────────────────
  const builderResult = buildAgentTaskFromIssue(
    {
      repository: selectedIssue.repository,
      issueNumber: selectedIssue.issueNumber,
      baseRevision: observedMainSha,
      issueTitle: selectedIssue.issueTitle,
      issueBody: selectedIssue.issueBody,
      issueLabels: selectedIssue.issueLabels,
      observedAt,
      proposal: {
        allowedPaths: selectedIssue.allowedPaths,
        forbiddenPaths: selectedIssue.forbiddenPaths,
        acceptanceCriteria: selectedIssue.acceptanceCriteria,
        verificationCommands: selectedIssue.verificationCommands,
        allowedCapabilities: selectedIssue.allowedCapabilities,
        riskClass: selectedIssue.riskClass,
        stopAt: selectedIssue.stopAt,
        constraints: selectedIssue.constraints,
      },
    },
    { validatedAt },
  );

  if (builderResult.status === "HOLD") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      finalStatus: "HOLD",
      reasonCode: "HOLD_BUILDER",
      reasonMessage: `Builder HOLD: ${builderResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "builder",
    });
  }
  if (builderResult.status === "INVALID") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      finalStatus: "REJECT",
      reasonCode: "REJECT_BUILDER",
      reasonMessage: `Builder INVALID: ${builderResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "builder",
    });
  }
  if (builderResult.status === "UNKNOWN") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      finalStatus: "UNKNOWN",
      reasonCode: "UNKNOWN_BUILDER",
      reasonMessage: `Builder UNKNOWN: ${builderResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "builder",
    });
  }
  if (
    builderResult.status !== "BUILT" ||
    builderResult.task === null ||
    builderResult.validation.status !== "VALID"
  ) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      finalStatus: "REJECT",
      reasonCode: "REJECT_BUILDER",
      reasonMessage:
        "Builder did not produce BUILT + non-null task + VALID validation.",
      stagesCompleted,
      stoppedAtStage: "builder",
    });
  }

  stagesCompleted.push("builder");

  // Independent reparse / revalidation — do not trust builder alone.
  const structural = parseAgentTaskV1(builderResult.task);
  if (!structural.ok) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask: builderResult.task,
      finalStatus: "REJECT",
      reasonCode: "REJECT_TASK_REPARSE",
      reasonMessage: `Independent parseAgentTaskV1 failed: ${structural.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "task-reparse",
    });
  }
  const agentTask = structural.task;
  const revalidation = validateAgentTaskV1(agentTask, { validatedAt });
  if (revalidation.status !== "VALID") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      finalStatus: "REJECT",
      reasonCode: "REJECT_TASK_REVALIDATION",
      reasonMessage: `Independent validateAgentTaskV1 status=${revalidation.status}: ${revalidation.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "task-revalidation",
    });
  }

  const fingerprint = captureAuthorityFingerprint(agentTask);
  stagesCompleted.push("task-revalidation");

  // Document incompatibility early (does not skip stages that still apply).
  const dualCompatible = taskSatisfiesRunnerAndPublisherContracts(agentTask);

  // ── Orchestrator ─────────────────────────────────────────────────────────
  const orchestratorResult = orchestrateAgentTaskV1(
    {
      builderResult,
      observedAt,
      attemptId: `orch:${pilotId}`,
    },
    { revalidatedAt: validatedAt },
  );

  if (orchestratorResult.decision === "HOLD") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      authorityFingerprint: fingerprint,
      finalStatus: "HOLD",
      reasonCode: "HOLD_ORCHESTRATOR",
      reasonMessage: `Orchestrator HOLD: ${orchestratorResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "orchestrator",
    });
  }
  if (orchestratorResult.decision === "REJECT") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      authorityFingerprint: fingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_ORCHESTRATOR",
      reasonMessage: `Orchestrator REJECT: ${orchestratorResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "orchestrator",
    });
  }
  if (orchestratorResult.decision === "UNKNOWN") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      authorityFingerprint: fingerprint,
      finalStatus: "UNKNOWN",
      reasonCode: "UNKNOWN_ORCHESTRATOR",
      reasonMessage: `Orchestrator UNKNOWN: ${orchestratorResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "orchestrator",
    });
  }
  if (orchestratorResult.decision !== "DISPATCH_ELIGIBLE") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      authorityFingerprint: fingerprint,
      finalStatus: "UNKNOWN",
      reasonCode: "UNKNOWN_ORCHESTRATOR",
      reasonMessage: "Unrecognized orchestrator decision; fail closed.",
      stagesCompleted,
      stoppedAtStage: "orchestrator",
    });
  }
  if (orchestratorResult.task === null) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      authorityFingerprint: fingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_ORCHESTRATOR",
      reasonMessage: "DISPATCH_ELIGIBLE with null task; fail closed.",
      stagesCompleted,
      stoppedAtStage: "orchestrator",
    });
  }

  const orchFp = captureAuthorityFingerprint(orchestratorResult.task);
  if (!authorityFingerprintsEqual(fingerprint, orchFp)) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      authorityFingerprint: fingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_AUTHORITY_DRIFT",
      reasonMessage:
        "Orchestrator task authority fingerprint drifted from builder task; fail closed.",
      stagesCompleted,
      stoppedAtStage: "orchestrator",
    });
  }
  stagesCompleted.push("orchestrator");

  // ── Runner ───────────────────────────────────────────────────────────────
  const runnerAdapter =
    options.runnerAdapter ??
    createFakeAgentRunnerAdapterV1({
      changedPaths: options.runnerChangedPaths ?? [
        "docs/no-prompt-pilot/no-prompt-pilot-v1.md",
        "src/domain/noPromptPilot.ts",
      ],
    });

  const runnerResult = runAgentTaskV1(
    {
      orchestratorResult,
      runnerAttemptId: `runner:${pilotId}`,
      observedAt,
      workspace: {
        repository: agentTask.repository,
        baseRevision: agentTask.baseRevision,
      },
    },
    { adapter: runnerAdapter, validatedAt },
  );

  if (runnerResult.status === "HOLD") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      authorityFingerprint: fingerprint,
      finalStatus: "HOLD",
      reasonCode: "HOLD_RUNNER",
      reasonMessage: `Runner HOLD: ${runnerResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "runner",
    });
  }
  if (runnerResult.status === "REJECT") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      authorityFingerprint: fingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_RUNNER",
      reasonMessage: `Runner REJECT: ${runnerResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "runner",
    });
  }
  if (runnerResult.status === "FAILED") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      authorityFingerprint: fingerprint,
      finalStatus: "FAILED",
      reasonCode: "FAILED_RUNNER",
      reasonMessage: `Runner FAILED: ${runnerResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "runner",
    });
  }
  if (runnerResult.status === "UNKNOWN") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      authorityFingerprint: fingerprint,
      finalStatus: "UNKNOWN",
      reasonCode: "UNKNOWN_RUNNER",
      reasonMessage: `Runner UNKNOWN: ${runnerResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "runner",
    });
  }
  if (runnerResult.status !== "COMPLETED") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      authorityFingerprint: fingerprint,
      finalStatus: "UNKNOWN",
      reasonCode: "UNKNOWN_RUNNER",
      reasonMessage: "Unrecognized runner status; fail closed.",
      stagesCompleted,
      stoppedAtStage: "runner",
    });
  }
  if (
    runnerResult.taskId !== agentTask.taskId ||
    runnerResult.repository !== agentTask.repository ||
    runnerResult.baseRevision !== agentTask.baseRevision
  ) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      authorityFingerprint: fingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_AUTHORITY_DRIFT",
      reasonMessage: "Runner identity binding drifted from AgentTaskV1.",
      stagesCompleted,
      stoppedAtStage: "runner",
    });
  }
  stagesCompleted.push("runner");

  // ── Independent verify ───────────────────────────────────────────────────
  const verifyAdapter =
    options.verifyAdapter ??
    createFakeIndependentVerifyAdapterV1({
      observedChangedPaths: [...runnerResult.changedPaths],
    });

  const independentVerifyResult = verifyAgentRunnerResultV1(
    {
      runnerResult,
      expectedTask: agentTask,
      verificationAttemptId: `verify:${pilotId}`,
      observedAt,
    },
    { adapter: verifyAdapter, validatedAt },
  );

  if (independentVerifyResult.status === "HOLD") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      authorityFingerprint: fingerprint,
      finalStatus: "HOLD",
      reasonCode: "HOLD_VERIFIER",
      reasonMessage: `Verifier HOLD: ${independentVerifyResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "verifier",
    });
  }
  if (independentVerifyResult.status === "REJECT") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      authorityFingerprint: fingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_VERIFIER",
      reasonMessage: `Verifier REJECT: ${independentVerifyResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "verifier",
    });
  }
  if (independentVerifyResult.status === "FAILED") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      authorityFingerprint: fingerprint,
      finalStatus: "FAILED",
      reasonCode: "FAILED_VERIFIER",
      reasonMessage: `Verifier FAILED: ${independentVerifyResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "verifier",
    });
  }
  if (independentVerifyResult.status === "UNKNOWN") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      authorityFingerprint: fingerprint,
      finalStatus: "UNKNOWN",
      reasonCode: "UNKNOWN_VERIFIER",
      reasonMessage: `Verifier UNKNOWN: ${independentVerifyResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "verifier",
    });
  }
  if (independentVerifyResult.status !== "VERIFIED") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      authorityFingerprint: fingerprint,
      finalStatus: "UNKNOWN",
      reasonCode: "UNKNOWN_VERIFIER",
      reasonMessage: "Unrecognized verifier status; fail closed.",
      stagesCompleted,
      stoppedAtStage: "verifier",
    });
  }
  if (
    independentVerifyResult.taskId !== agentTask.taskId ||
    independentVerifyResult.repository !== agentTask.repository ||
    independentVerifyResult.baseRevision !== agentTask.baseRevision
  ) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      authorityFingerprint: fingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_AUTHORITY_DRIFT",
      reasonMessage: "Verifier identity binding drifted from AgentTaskV1.",
      stagesCompleted,
      stoppedAtStage: "verifier",
    });
  }
  stagesCompleted.push("verifier");

  // ── Draft publish (fake/local) ────────────────────────────────────────────
  // Do not fabricate PUBLISHED_DRAFT. Publisher consumes actual verify result.
  // Canonical pilot task is runner-compatible and therefore fails publisher
  // eligibility (R2 / github.draft-pr.publish.v1) → HOLD_CONTRACT_INCOMPATIBILITY.
  const branchName = `cursor/no-prompt-pilot-${pilotId}`;
  const headRevision = deterministicRevisionFromSeed(
    `${agentTask.taskId}|${agentTask.baseRevision}|${runnerResult.changedPaths.join(",")}`,
  );

  const publishAdapter =
    options.publishAdapter ?? createFakeDraftPublishAdapterV1();
  const publishAttemptRegistry =
    options.publishAttemptRegistry ??
    new Map<string, DraftPublishAttemptRecordV1>();

  const draftPublishResult = publishDraftPrV1(
    {
      verifiedResult: independentVerifyResult,
      expectedTask: agentTask,
      publicationAttemptId: `publish:${pilotId}`,
      observedAt,
      sourceArtifact: {
        repository: agentTask.repository,
        baseRevision: agentTask.baseRevision,
        baseBranch: "main",
        headRevision,
        branchName,
        changedPaths: [...independentVerifyResult.verifiedChangedPaths],
      },
      proposedDraftPr: {
        title: `NO-PROMPT-PILOT-V1 ${pilotId}`,
        body: "Fake/local Draft publication simulation from NO-PROMPT-PILOT-V1.",
        baseBranch: "main",
        headBranch: branchName,
        draft: true,
      },
    },
    {
      adapter: publishAdapter,
      validatedAt,
      attemptRegistry: publishAttemptRegistry,
    },
  );

  if (draftPublishResult.status === "HOLD") {
    const contractHold =
      !dualCompatible &&
      (draftPublishResult.reasonCode === "HOLD_MISSING_CAPABILITY" ||
        draftPublishResult.reasonCode === "HOLD_UNSUPPORTED_RISK_CLASS" ||
        draftPublishResult.reasonCode === "HOLD_STOP_AT" ||
        draftPublishResult.reasonCode === "HOLD_UNSUPPORTED_STOP_AT");
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      draftPublishResult,
      authorityFingerprint: fingerprint,
      finalStatus: "HOLD",
      reasonCode: contractHold
        ? "HOLD_CONTRACT_INCOMPATIBILITY"
        : "HOLD_PUBLISHER",
      reasonMessage: contractHold
        ? `Publisher HOLD due to existing runner↔publisher authority incompatibility (${NO_PROMPT_PILOT_POSITIVE_PATH_BLOCKER.blockerCode}): ${draftPublishResult.reasonMessage}. Positive path = ${NO_PROMPT_PILOT_POSITIVE_PATH_STATUS}.`
        : `Publisher HOLD: ${draftPublishResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "publisher",
    });
  }
  if (draftPublishResult.status === "REJECT") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      draftPublishResult,
      authorityFingerprint: fingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_PUBLISHER",
      reasonMessage: `Publisher REJECT: ${draftPublishResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "publisher",
    });
  }
  if (draftPublishResult.status === "FAILED") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      draftPublishResult,
      authorityFingerprint: fingerprint,
      finalStatus: "FAILED",
      reasonCode: "FAILED_PUBLISHER",
      reasonMessage: `Publisher FAILED: ${draftPublishResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "publisher",
    });
  }
  if (draftPublishResult.status === "UNKNOWN") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      draftPublishResult,
      authorityFingerprint: fingerprint,
      finalStatus: "UNKNOWN",
      reasonCode: "UNKNOWN_PUBLISHER",
      reasonMessage: `Publisher UNKNOWN: ${draftPublishResult.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "publisher",
    });
  }
  if (draftPublishResult.status !== "PUBLISHED_DRAFT") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      draftPublishResult,
      authorityFingerprint: fingerprint,
      finalStatus: "UNKNOWN",
      reasonCode: "UNKNOWN_PUBLISHER",
      reasonMessage: "Unrecognized publisher status; fail closed.",
      stagesCompleted,
      stoppedAtStage: "publisher",
    });
  }

  stagesCompleted.push("publisher");

  // Guard: never PASS if dual contracts remain incompatible.
  if (!dualCompatible) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      agentTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      draftPublishResult,
      authorityFingerprint: fingerprint,
      finalStatus: "HOLD",
      reasonCode: "HOLD_CONTRACT_INCOMPATIBILITY",
      reasonMessage:
        "Publisher reported PUBLISHED_DRAFT but task cannot legitimately satisfy both runner and publisher contracts; refuse PASS.",
      stagesCompleted,
      stoppedAtStage: "publisher",
    });
  }

  // Full PASS path (unreachable under current contracts without widening).
  return buildEvidence({
    pilotId,
    selectedIssue,
    observedMainSha,
    observedAt,
    builderResult,
    agentTask,
    orchestratorResult,
    runnerResult,
    independentVerifyResult,
    draftPublishResult,
    authorityFingerprint: fingerprint,
    manualAgentPromptCount,
    humanActions,
    finalStatus: "PASS",
    reasonCode: "PASS",
    reasonMessage:
      "All stages succeeded with manualAgentPromptCount=0 and no external mutations.",
    stagesCompleted,
    stoppedAtStage: null,
  });
}

export function assertNoPromptPilotBoundaries(): void {
  if (NO_PROMPT_PILOT_POSITIVE_PATH_STATUS !== "BLOCKED_BY_EXISTING_CONTRACT") {
    throw new Error(
      "NO-PROMPT-PILOT-V1 positive path must remain BLOCKED_BY_EXISTING_CONTRACT until contracts are coordinated",
    );
  }
}
