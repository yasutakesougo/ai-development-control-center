/**
 * NO-PROMPT-PILOT-V2
 *
 * END-TO-END COMPOSITION HARNESS · FAKE/LOCAL ONLY
 * MANUAL AGENT PROMPT = 0
 * REAL PROVIDER EXECUTION = HOLD
 * REAL GITHUB PUBLICATION = HOLD
 *
 * Closes the execution-engine milestone after RUNNER-PUBLISH-HANDOFF-V1 by
 * composing the dual-stage authority path:
 *
 *   Human selects Issue
 *   → AgentTaskV1 R1 (execution)
 *   → Orchestrator
 *   → Runner
 *   → Independent Verify = VERIFIED
 *   → PublicationHandoffV1
 *   → PublicationTask R2
 *   → DRAFT-PUBLISH-V1
 *   → PUBLISHED_DRAFT (fake/local)
 *   → STOP
 *
 * Does not widen AGENT-RUNNER-V1. Does not mutate the execution task.
 * Does not reimplement domain modules — composes existing contracts only.
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
  createPublicationHandoffV1,
  PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
  PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS,
  PUBLICATION_HANDOFF_REQUIRED_STOP_AT,
  type PublicationHandoffAttemptRecordV1,
  type PublicationHandoffResultV1,
} from "./publicationHandoff";
import {
  createFakeDraftPublishAdapterV1,
  publishDraftPrV1,
  type DraftPublishAttemptRecordV1,
  type DraftPublishResultV1,
} from "./draftPublish";
import {
  resetFakeDraftPublishCounterForTests,
  type DraftPublishAdapterV1,
} from "./draftPublishAdapter";
import {
  authorityFingerprintsEqual,
  captureAuthorityFingerprint,
  createExplicitZeroInterventionAccounting,
  deterministicRevisionFromSeed,
  mapUpstreamStageToPilotResult,
  NO_PROMPT_PILOT_INPUT_ROOT_KEYS,
  NO_PROMPT_PILOT_SELECTED_ISSUE_KEYS,
  parseExecutionAccounting,
  type NoPromptPilotAuthorityFingerprintV1,
  type NoPromptPilotExecutionAccountingV1,
  type NoPromptPilotFinalStatus,
  type NoPromptPilotSelectedIssueV1,
  type NoPromptPilotUpstreamStage,
  type NoPromptPilotUpstreamStatus,
} from "./noPromptPilot";

export const NO_PROMPT_PILOT_V2_VERSION = "NO-PROMPT-PILOT-V2" as const;
export const NO_PROMPT_PILOT_V2_EVIDENCE_SCHEMA =
  "NO-PROMPT-PILOT-V2-EVIDENCE-V1" as const;

export const NO_PROMPT_PILOT_V2_POSITIVE_PATH_STATUS =
  "UNBLOCKED_VIA_PUBLICATION_HANDOFF" as const;

export const NO_PROMPT_PILOT_V2_BASELINE_MAIN =
  "265d5d8500b4c17d9c09df76c2d8e78d21f58c57" as const;

export type NoPromptPilotV2ReasonCode =
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
  | "HOLD_HANDOFF"
  | "REJECT_HANDOFF"
  | "FAILED_HANDOFF"
  | "UNKNOWN_HANDOFF"
  | "HOLD_PUBLISHER"
  | "REJECT_PUBLISHER"
  | "FAILED_PUBLISHER"
  | "UNKNOWN_PUBLISHER"
  | "REJECT_INPUT"
  | "REJECT_AUTHORITY_DRIFT"
  | "REJECT_MANUAL_PROMPT"
  | "REJECT_MANUAL_INTERVENTION"
  | "REJECT_EXECUTION_TASK_MUTATED"
  | "REJECT_PUBLICATION_TASK_IDENTITY"
  | "REJECT_EXTERNAL_MUTATION"
  | "UNKNOWN_PILOT_STATE";

export interface NoPromptPilotV2InputV1 {
  pilotId: string;
  selectedIssue: NoPromptPilotSelectedIssueV1;
  observedMainSha: string;
  observedAt: string;
  executionAccounting: NoPromptPilotExecutionAccountingV1;
}

export interface NoPromptPilotV2MetadataV1 {
  observedAt: string;
  pilotId: string;
  positivePathStatus: typeof NO_PROMPT_PILOT_V2_POSITIVE_PATH_STATUS;
  baselineMain: typeof NO_PROMPT_PILOT_V2_BASELINE_MAIN;
  executionAuthorityFingerprint: NoPromptPilotAuthorityFingerprintV1 | null;
  publicationAuthorityFingerprint: NoPromptPilotAuthorityFingerprintV1 | null;
  sourceExecutionTaskMutated: false;
  runnerAuthorityExpanded: false;
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

export interface NoPromptPilotV2EvidenceV1 {
  schemaVersion: typeof NO_PROMPT_PILOT_V2_EVIDENCE_SCHEMA;
  pilotVersion: typeof NO_PROMPT_PILOT_V2_VERSION;
  pilotId: string;
  selectedIssue: NoPromptPilotSelectedIssueV1;
  observedMainSha: string;
  builderResult: AgentTaskBuilderResultV1 | null;
  /** Source execution task (R0/R1) — never mutated for publication. */
  executionTask: AgentTaskV1 | null;
  orchestratorResult: MinOrchestratorResultV1 | null;
  runnerResult: AgentRunnerResultV1 | null;
  independentVerifyResult: IndependentVerifyResultV1 | null;
  publicationHandoffResult: PublicationHandoffResultV1 | null;
  /** Distinct publication-scoped task (R2) when handoff READY. */
  publicationTask: AgentTaskV1 | null;
  draftPublishResult: DraftPublishResultV1 | null;
  manualAgentPromptCount: number;
  humanActions: string[];
  externalMutations: [];
  finalStatus: NoPromptPilotFinalStatus;
  reasonCode: NoPromptPilotV2ReasonCode;
  reasonMessage: string;
  metadata: NoPromptPilotV2MetadataV1;
  observedAt: string;
}

export interface RunNoPromptPilotV2Options {
  validatedAt?: string;
  runnerAdapter?: AgentRunnerAdapterV1;
  verifyAdapter?: IndependentVerifyAdapterV1;
  publishAdapter?: DraftPublishAdapterV1;
  publishAttemptRegistry?: Map<string, DraftPublishAttemptRecordV1>;
  handoffAttemptRegistry?: Map<string, PublicationHandoffAttemptRecordV1>;
  runnerChangedPaths?: string[];
  resetFakePublishCounter?: boolean;
}

export type NoPromptPilotV2UpstreamStage =
  | NoPromptPilotUpstreamStage
  | "handoff";

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
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Map handoff statuses; reuse V1 mapper for other stages.
 */
export function mapV2UpstreamStageToPilotResult(
  stage: NoPromptPilotV2UpstreamStage,
  status: NoPromptPilotUpstreamStatus,
  reasonMessage: string,
): {
  finalStatus: NoPromptPilotFinalStatus;
  reasonCode: NoPromptPilotV2ReasonCode;
  reasonMessage: string;
} {
  if (stage === "handoff") {
    if (status === "HOLD") {
      return {
        finalStatus: "HOLD",
        reasonCode: "HOLD_HANDOFF",
        reasonMessage: `PublicationHandoff HOLD: ${reasonMessage}`,
      };
    }
    if (status === "REJECT" || status === "INVALID") {
      return {
        finalStatus: "REJECT",
        reasonCode: "REJECT_HANDOFF",
        reasonMessage: `PublicationHandoff REJECT: ${reasonMessage}`,
      };
    }
    if (status === "FAILED") {
      return {
        finalStatus: "FAILED",
        reasonCode: "FAILED_HANDOFF",
        reasonMessage: `PublicationHandoff FAILED: ${reasonMessage}`,
      };
    }
    if (status === "UNKNOWN") {
      return {
        finalStatus: "UNKNOWN",
        reasonCode: "UNKNOWN_HANDOFF",
        reasonMessage: `PublicationHandoff UNKNOWN: ${reasonMessage}`,
      };
    }
  }

  const mapped = mapUpstreamStageToPilotResult(
    stage as NoPromptPilotUpstreamStage,
    status,
    reasonMessage,
  );
  return {
    finalStatus: mapped.finalStatus,
    reasonCode: mapped.reasonCode as NoPromptPilotV2ReasonCode,
    reasonMessage: mapped.reasonMessage,
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
 * Canonical V2 synthetic Issue — runner-compatible execution authority only.
 * Publication authority is derived later via PublicationHandoffV1.
 */
export function createCanonicalNoPromptPilotV2Issue(
  observedMainSha: string,
): NoPromptPilotSelectedIssueV1 {
  void observedMainSha;
  return {
    repository: "yasutakesougo/ai-development-control-center",
    issueNumber: 59,
    issueTitle:
      "NO-PROMPT-PILOT-V2 — verified execution to fake Draft PR without manual Agent prompt",
    issueBody:
      "Synthetic LOW-risk pilot Issue for V2. Execution authority is R1 + workspace.read.v1. Publication uses a distinct R2 task via PublicationHandoffV1. No Human Agent execution prompt.",
    issueLabels: ["no-prompt-pilot-v2"],
    allowedPaths: [
      "docs/no-prompt-pilot/",
      "src/domain/noPromptPilotV2.ts",
      "test/noPromptPilotV2.test.ts",
    ],
    forbiddenPaths: [".github/workflows/", "migrations/"],
    acceptanceCriteria: [
      "manualAgentPromptCount = 0",
      "PUBLISHED_DRAFT via PublicationHandoffV1 without Runner authority widening",
      "source execution task remains R0/R1 and unchanged",
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

function metadataBase(input: {
  observedAt: string;
  pilotId: string;
  executionAuthorityFingerprint?: NoPromptPilotAuthorityFingerprintV1 | null;
  publicationAuthorityFingerprint?: NoPromptPilotAuthorityFingerprintV1 | null;
  stagesCompleted?: string[];
  stoppedAtStage?: string | null;
}): NoPromptPilotV2MetadataV1 {
  return {
    observedAt: input.observedAt,
    pilotId: input.pilotId,
    positivePathStatus: NO_PROMPT_PILOT_V2_POSITIVE_PATH_STATUS,
    baselineMain: NO_PROMPT_PILOT_V2_BASELINE_MAIN,
    executionAuthorityFingerprint:
      input.executionAuthorityFingerprint ?? null,
    publicationAuthorityFingerprint:
      input.publicationAuthorityFingerprint ?? null,
    sourceExecutionTaskMutated: false,
    runnerAuthorityExpanded: false,
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
  reasonCode: NoPromptPilotV2ReasonCode;
  reasonMessage: string;
  manualAgentPromptCount: number;
  humanActions: string[];
  builderResult?: AgentTaskBuilderResultV1 | null;
  executionTask?: AgentTaskV1 | null;
  orchestratorResult?: MinOrchestratorResultV1 | null;
  runnerResult?: AgentRunnerResultV1 | null;
  independentVerifyResult?: IndependentVerifyResultV1 | null;
  publicationHandoffResult?: PublicationHandoffResultV1 | null;
  publicationTask?: AgentTaskV1 | null;
  draftPublishResult?: DraftPublishResultV1 | null;
  executionAuthorityFingerprint?: NoPromptPilotAuthorityFingerprintV1 | null;
  publicationAuthorityFingerprint?: NoPromptPilotAuthorityFingerprintV1 | null;
  stagesCompleted?: string[];
  stoppedAtStage?: string | null;
}): NoPromptPilotV2EvidenceV1 {
  return {
    schemaVersion: NO_PROMPT_PILOT_V2_EVIDENCE_SCHEMA,
    pilotVersion: NO_PROMPT_PILOT_V2_VERSION,
    pilotId: input.pilotId,
    selectedIssue: input.selectedIssue,
    observedMainSha: input.observedMainSha,
    builderResult: input.builderResult ?? null,
    executionTask: input.executionTask ?? null,
    orchestratorResult: input.orchestratorResult ?? null,
    runnerResult: input.runnerResult ?? null,
    independentVerifyResult: input.independentVerifyResult ?? null,
    publicationHandoffResult: input.publicationHandoffResult ?? null,
    publicationTask: input.publicationTask ?? null,
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
      executionAuthorityFingerprint: input.executionAuthorityFingerprint,
      publicationAuthorityFingerprint: input.publicationAuthorityFingerprint,
      stagesCompleted: input.stagesCompleted,
      stoppedAtStage: input.stoppedAtStage,
    }),
    observedAt: input.observedAt,
  };
}

/**
 * Assert V2 does not widen runner / invent dual-task authority on one task.
 */
export function assertNoPromptPilotV2Boundaries(): void {
  if ((AGENT_RUNNER_SUPPORTED_RISK_CLASSES as readonly string[]).includes("R2")) {
    throw new Error(
      "NO-PROMPT-PILOT-V2 must not widen AGENT-RUNNER-V1 to R2",
    );
  }
  if (
    (AGENT_RUNNER_SUPPORTED_CAPABILITIES as readonly string[]).includes(
      PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
    )
  ) {
    throw new Error(
      "NO-PROMPT-PILOT-V2 must not add github.draft-pr.publish.v1 to AGENT-RUNNER-V1",
    );
  }
  if (
    NO_PROMPT_PILOT_V2_POSITIVE_PATH_STATUS !== "UNBLOCKED_VIA_PUBLICATION_HANDOFF"
  ) {
    throw new Error(
      "NO-PROMPT-PILOT-V2 positive path must be UNBLOCKED_VIA_PUBLICATION_HANDOFF",
    );
  }
}

/**
 * Run NO-PROMPT-PILOT-V2 by composing existing domain modules + handoff.
 */
export function runNoPromptPilotV2(
  rawInput: unknown,
  options: RunNoPromptPilotV2Options = {},
): NoPromptPilotV2EvidenceV1 {
  const validatedAt = options.validatedAt ?? new Date(0).toISOString();

  if (options.resetFakePublishCounter !== false) {
    resetFakeDraftPublishCounterForTests(3000);
  }

  let manualAgentPromptCount = -1;
  let humanActions: string[] = [];

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
      selectedIssue: createCanonicalNoPromptPilotV2Issue(
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
      selectedIssue: createCanonicalNoPromptPilotV2Issue(
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
      selectedIssue: createCanonicalNoPromptPilotV2Issue(
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
      selectedIssue: createCanonicalNoPromptPilotV2Issue(
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
      selectedIssue: createCanonicalNoPromptPilotV2Issue(rawInput.observedMainSha),
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

  const accountingParsed = parseExecutionAccounting(
    rawInput.executionAccounting,
  );
  if (!accountingParsed.ok) {
    return failEarly({
      pilotId,
      selectedIssue: createCanonicalNoPromptPilotV2Issue(observedMainSha),
      observedMainSha,
      observedAt,
      finalStatus: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: accountingParsed.reasonMessage,
      stoppedAtStage: "input",
    });
  }
  const accounting = accountingParsed.accounting;
  manualAgentPromptCount = accounting.manualAgentPromptCount;
  humanActions = accounting.humanActions;

  const issueParsed = parseSelectedIssue(rawInput.selectedIssue);
  if (!issueParsed.ok) {
    return failEarly({
      pilotId,
      selectedIssue: createCanonicalNoPromptPilotV2Issue(observedMainSha),
      observedMainSha,
      observedAt,
      finalStatus: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: issueParsed.reasonMessage,
      stoppedAtStage: "input",
    });
  }
  const selectedIssue = issueParsed.issue;

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
    accounting.humanTaskRepairs === true ||
    accounting.humanCapabilityChanges === true ||
    accounting.humanRiskChanges === true ||
    accounting.humanStopAtChanges === true ||
    accounting.humanRunnerEvidenceInjection === true ||
    accounting.humanVerifierEvidenceInjection === true ||
    accounting.humanPublisherEvidenceInjection === true
  ) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      finalStatus: "REJECT",
      reasonCode: "REJECT_MANUAL_INTERVENTION",
      reasonMessage:
        "Human task repair / authority change / evidence injection is prohibited for NO-PROMPT-PILOT-V2.",
      stoppedAtStage: "kpi",
    });
  }

  const stagesCompleted: string[] = [];

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
    const mapped = mapV2UpstreamStageToPilotResult(
      "builder",
      "HOLD",
      builderResult.reasonMessage,
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
      stagesCompleted,
      stoppedAtStage: "builder",
    });
  }
  if (builderResult.status === "INVALID") {
    const mapped = mapV2UpstreamStageToPilotResult(
      "builder",
      "INVALID",
      builderResult.reasonMessage,
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
      stagesCompleted,
      stoppedAtStage: "builder",
    });
  }
  if (builderResult.status === "UNKNOWN") {
    const mapped = mapV2UpstreamStageToPilotResult(
      "builder",
      "UNKNOWN",
      builderResult.reasonMessage,
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
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

  const structural = parseAgentTaskV1(builderResult.task);
  if (!structural.ok) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask: builderResult.task,
      finalStatus: "REJECT",
      reasonCode: "REJECT_TASK_REPARSE",
      reasonMessage: `Independent parseAgentTaskV1 failed: ${structural.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "task-reparse",
    });
  }
  const executionTask = structural.task;
  const executionTaskSnapshot = JSON.stringify(executionTask);
  const revalidation = validateAgentTaskV1(executionTask, { validatedAt });
  if (revalidation.status !== "VALID") {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      finalStatus: "REJECT",
      reasonCode: "REJECT_TASK_REVALIDATION",
      reasonMessage: `Independent validateAgentTaskV1 status=${revalidation.status}: ${revalidation.reasonMessage}`,
      stagesCompleted,
      stoppedAtStage: "task-revalidation",
    });
  }

  const executionFingerprint = captureAuthorityFingerprint(executionTask);
  stagesCompleted.push("task-revalidation");

  const orchestratorResult = orchestrateAgentTaskV1(
    {
      builderResult,
      observedAt,
      attemptId: `orch:${pilotId}`,
    },
    { revalidatedAt: validatedAt },
  );

  if (
    orchestratorResult.decision === "HOLD" ||
    orchestratorResult.decision === "REJECT" ||
    orchestratorResult.decision === "UNKNOWN"
  ) {
    const mapped = mapV2UpstreamStageToPilotResult(
      "orchestrator",
      orchestratorResult.decision,
      orchestratorResult.reasonMessage,
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
      stagesCompleted,
      stoppedAtStage: "orchestrator",
    });
  }
  if (orchestratorResult.decision !== "DISPATCH_ELIGIBLE") {
    const mapped = mapV2UpstreamStageToPilotResult(
      "orchestrator",
      "UNKNOWN",
      "Unrecognized orchestrator decision; fail closed.",
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
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
      executionTask,
      orchestratorResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_ORCHESTRATOR",
      reasonMessage: "DISPATCH_ELIGIBLE with null task; fail closed.",
      stagesCompleted,
      stoppedAtStage: "orchestrator",
    });
  }

  const orchFp = captureAuthorityFingerprint(orchestratorResult.task);
  if (!authorityFingerprintsEqual(executionFingerprint, orchFp)) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_AUTHORITY_DRIFT",
      reasonMessage:
        "Orchestrator task authority fingerprint drifted from execution task; fail closed.",
      stagesCompleted,
      stoppedAtStage: "orchestrator",
    });
  }
  stagesCompleted.push("orchestrator");

  const runnerAdapter =
    options.runnerAdapter ??
    createFakeAgentRunnerAdapterV1({
      changedPaths: options.runnerChangedPaths ?? [
        "docs/no-prompt-pilot/no-prompt-pilot-v2.md",
        "src/domain/noPromptPilotV2.ts",
      ],
    });

  const runnerResult = runAgentTaskV1(
    {
      orchestratorResult,
      runnerAttemptId: `runner:${pilotId}`,
      observedAt,
      workspace: {
        repository: executionTask.repository,
        baseRevision: executionTask.baseRevision,
      },
    },
    { adapter: runnerAdapter, validatedAt },
  );

  if (
    runnerResult.status === "HOLD" ||
    runnerResult.status === "REJECT" ||
    runnerResult.status === "FAILED" ||
    runnerResult.status === "UNKNOWN"
  ) {
    const mapped = mapV2UpstreamStageToPilotResult(
      "runner",
      runnerResult.status,
      runnerResult.reasonMessage,
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
      stagesCompleted,
      stoppedAtStage: "runner",
    });
  }
  if (runnerResult.status !== "COMPLETED") {
    const mapped = mapV2UpstreamStageToPilotResult(
      "runner",
      "UNKNOWN",
      "Unrecognized runner status; fail closed.",
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
      stagesCompleted,
      stoppedAtStage: "runner",
    });
  }
  if (
    runnerResult.taskId !== executionTask.taskId ||
    runnerResult.repository !== executionTask.repository ||
    runnerResult.baseRevision !== executionTask.baseRevision
  ) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_AUTHORITY_DRIFT",
      reasonMessage: "Runner identity binding drifted from execution AgentTaskV1.",
      stagesCompleted,
      stoppedAtStage: "runner",
    });
  }
  stagesCompleted.push("runner");

  const verifyAdapter =
    options.verifyAdapter ??
    createFakeIndependentVerifyAdapterV1({
      observedChangedPaths: [...runnerResult.changedPaths],
    });

  const independentVerifyResult = verifyAgentRunnerResultV1(
    {
      runnerResult,
      expectedTask: executionTask,
      verificationAttemptId: `verify:${pilotId}`,
      observedAt,
    },
    { adapter: verifyAdapter, validatedAt },
  );

  if (
    independentVerifyResult.status === "HOLD" ||
    independentVerifyResult.status === "REJECT" ||
    independentVerifyResult.status === "FAILED" ||
    independentVerifyResult.status === "UNKNOWN"
  ) {
    const mapped = mapV2UpstreamStageToPilotResult(
      "verifier",
      independentVerifyResult.status,
      independentVerifyResult.reasonMessage,
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
      stagesCompleted,
      stoppedAtStage: "verifier",
    });
  }
  if (independentVerifyResult.status !== "VERIFIED") {
    const mapped = mapV2UpstreamStageToPilotResult(
      "verifier",
      "UNKNOWN",
      "Unrecognized verifier status; fail closed.",
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
      stagesCompleted,
      stoppedAtStage: "verifier",
    });
  }
  if (
    independentVerifyResult.taskId !== executionTask.taskId ||
    independentVerifyResult.repository !== executionTask.repository ||
    independentVerifyResult.baseRevision !== executionTask.baseRevision
  ) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_AUTHORITY_DRIFT",
      reasonMessage:
        "Verifier identity binding drifted from execution AgentTaskV1.",
      stagesCompleted,
      stoppedAtStage: "verifier",
    });
  }
  stagesCompleted.push("verifier");

  if (JSON.stringify(executionTask) !== executionTaskSnapshot) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_EXECUTION_TASK_MUTATED",
      reasonMessage:
        "Source execution task mutated before publication handoff; fail closed.",
      stagesCompleted,
      stoppedAtStage: "verifier",
    });
  }

  const handoffResult = createPublicationHandoffV1(
    {
      handoffId: `handoff:${pilotId}`,
      sourceExecutionTask: executionTask,
      independentVerifyResult,
      requestedPublicationCapability: PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
      requestedRiskClass: PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS,
      requestedStopAt: PUBLICATION_HANDOFF_REQUIRED_STOP_AT,
      observedAt,
    },
    {
      validatedAt,
      attemptRegistry: options.handoffAttemptRegistry,
    },
  );

  if (
    handoffResult.status === "HOLD" ||
    handoffResult.status === "REJECT" ||
    handoffResult.status === "FAILED" ||
    handoffResult.status === "UNKNOWN"
  ) {
    const mapped = mapV2UpstreamStageToPilotResult(
      "handoff",
      handoffResult.status,
      handoffResult.reasonMessage,
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      publicationHandoffResult: handoffResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
      stagesCompleted,
      stoppedAtStage: "handoff",
    });
  }
  if (handoffResult.status !== "READY_FOR_PUBLICATION_TASK") {
    const mapped = mapV2UpstreamStageToPilotResult(
      "handoff",
      "UNKNOWN",
      "Unrecognized handoff status; fail closed.",
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      publicationHandoffResult: handoffResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
      stagesCompleted,
      stoppedAtStage: "handoff",
    });
  }
  if (
    handoffResult.publicationTask === null ||
    handoffResult.handoff === null ||
    handoffResult.publicationTaskId === null
  ) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      publicationHandoffResult: handoffResult,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_HANDOFF",
      reasonMessage:
        "READY_FOR_PUBLICATION_TASK without publicationTask/handoff; fail closed.",
      stagesCompleted,
      stoppedAtStage: "handoff",
    });
  }

  const publicationTask = handoffResult.publicationTask;
  if (publicationTask.taskId === executionTask.taskId) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      publicationHandoffResult: handoffResult,
      publicationTask,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_PUBLICATION_TASK_IDENTITY",
      reasonMessage:
        "Publication taskId must be distinct from source execution taskId.",
      stagesCompleted,
      stoppedAtStage: "handoff",
    });
  }
  if (
    publicationTask.riskClass !== "R2" ||
    publicationTask.stopAt !== "DRAFT_PR" ||
    JSON.stringify(publicationTask.allowedCapabilities) !==
      JSON.stringify([PUBLICATION_HANDOFF_REQUIRED_CAPABILITY])
  ) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      publicationHandoffResult: handoffResult,
      publicationTask,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_PUBLICATION_TASK_IDENTITY",
      reasonMessage:
        "Publication task must be exactly R2 + github.draft-pr.publish.v1 + DRAFT_PR.",
      stagesCompleted,
      stoppedAtStage: "handoff",
    });
  }

  if (JSON.stringify(executionTask) !== executionTaskSnapshot) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      publicationHandoffResult: handoffResult,
      publicationTask,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_EXECUTION_TASK_MUTATED",
      reasonMessage:
        "Source execution task mutated during publication handoff; fail closed.",
      stagesCompleted,
      stoppedAtStage: "handoff",
    });
  }
  if (
    executionTask.riskClass === "R2" ||
    executionTask.allowedCapabilities.includes(
      PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
    )
  ) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      publicationHandoffResult: handoffResult,
      publicationTask,
      executionAuthorityFingerprint: executionFingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_EXECUTION_TASK_MUTATED",
      reasonMessage:
        "Source execution task acquired publication authority; fail closed.",
      stagesCompleted,
      stoppedAtStage: "handoff",
    });
  }

  const publicationFingerprint = captureAuthorityFingerprint(publicationTask);
  stagesCompleted.push("handoff");

  const branchName = `cursor/no-prompt-pilot-v2-${pilotId}`;
  const headRevision = deterministicRevisionFromSeed(
    `${executionTask.taskId}|${publicationTask.taskId}|${executionTask.baseRevision}|${runnerResult.changedPaths.join(",")}`,
  );

  const publishAdapter =
    options.publishAdapter ?? createFakeDraftPublishAdapterV1();
  const publishAttemptRegistry =
    options.publishAttemptRegistry ??
    new Map<string, DraftPublishAttemptRecordV1>();

  const draftPublishResult = publishDraftPrV1(
    {
      verifiedResult: independentVerifyResult,
      expectedTask: publicationTask,
      publicationAttemptId: `publish:${pilotId}`,
      observedAt,
      sourceArtifact: {
        repository: executionTask.repository,
        baseRevision: executionTask.baseRevision,
        baseBranch: "main",
        headRevision,
        branchName,
        changedPaths: [...independentVerifyResult.verifiedChangedPaths],
      },
      proposedDraftPr: {
        title: `NO-PROMPT-PILOT-V2 ${pilotId}`,
        body: "Fake/local Draft publication simulation from NO-PROMPT-PILOT-V2 via PublicationHandoffV1.",
        baseBranch: "main",
        headBranch: branchName,
        draft: true,
      },
      authorizedPublicationHandoff: deepCloneJson(handoffResult.handoff),
    },
    {
      adapter: publishAdapter,
      validatedAt,
      attemptRegistry: publishAttemptRegistry,
    },
  );

  if (
    draftPublishResult.status === "HOLD" ||
    draftPublishResult.status === "REJECT" ||
    draftPublishResult.status === "FAILED" ||
    draftPublishResult.status === "UNKNOWN"
  ) {
    const mapped = mapV2UpstreamStageToPilotResult(
      "publisher",
      draftPublishResult.status,
      draftPublishResult.reasonMessage,
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      publicationHandoffResult: handoffResult,
      publicationTask,
      draftPublishResult,
      executionAuthorityFingerprint: executionFingerprint,
      publicationAuthorityFingerprint: publicationFingerprint,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
      stagesCompleted,
      stoppedAtStage: "publisher",
    });
  }
  if (draftPublishResult.status !== "PUBLISHED_DRAFT") {
    const mapped = mapV2UpstreamStageToPilotResult(
      "publisher",
      "UNKNOWN",
      "Unrecognized publisher status; fail closed.",
    );
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      publicationHandoffResult: handoffResult,
      publicationTask,
      draftPublishResult,
      executionAuthorityFingerprint: executionFingerprint,
      publicationAuthorityFingerprint: publicationFingerprint,
      finalStatus: mapped.finalStatus,
      reasonCode: mapped.reasonCode,
      reasonMessage: mapped.reasonMessage,
      stagesCompleted,
      stoppedAtStage: "publisher",
    });
  }

  if (JSON.stringify(executionTask) !== executionTaskSnapshot) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      publicationHandoffResult: handoffResult,
      publicationTask,
      draftPublishResult,
      executionAuthorityFingerprint: executionFingerprint,
      publicationAuthorityFingerprint: publicationFingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_EXECUTION_TASK_MUTATED",
      reasonMessage:
        "Source execution task mutated during draft publish; fail closed.",
      stagesCompleted,
      stoppedAtStage: "publisher",
    });
  }

  if (
    draftPublishResult.metadata.githubMutationPerformed === true ||
    draftPublishResult.metadata.realGithubPublicationImplemented === true ||
    draftPublishResult.metadata.readyAuthorized === true ||
    draftPublishResult.metadata.mergeAuthorized === true ||
    draftPublishResult.metadata.issueCloseAuthorized === true ||
    draftPublishResult.metadata.deployAuthorized === true
  ) {
    return failEarly({
      pilotId,
      selectedIssue,
      observedMainSha,
      observedAt,
      builderResult,
      executionTask,
      orchestratorResult,
      runnerResult,
      independentVerifyResult,
      publicationHandoffResult: handoffResult,
      publicationTask,
      draftPublishResult,
      executionAuthorityFingerprint: executionFingerprint,
      publicationAuthorityFingerprint: publicationFingerprint,
      finalStatus: "REJECT",
      reasonCode: "REJECT_EXTERNAL_MUTATION",
      reasonMessage:
        "Publisher reported forbidden mutation/authority flags; fail closed.",
      stagesCompleted,
      stoppedAtStage: "publisher",
    });
  }

  stagesCompleted.push("publisher");

  return buildEvidence({
    pilotId,
    selectedIssue,
    observedMainSha,
    observedAt,
    builderResult,
    executionTask,
    orchestratorResult,
    runnerResult,
    independentVerifyResult,
    publicationHandoffResult: handoffResult,
    publicationTask,
    draftPublishResult,
    executionAuthorityFingerprint: executionFingerprint,
    publicationAuthorityFingerprint: publicationFingerprint,
    manualAgentPromptCount,
    humanActions,
    finalStatus: "PASS",
    reasonCode: "PASS",
    reasonMessage:
      "PUBLISHED_DRAFT (fake/local) reached via PublicationHandoffV1 with manualAgentPromptCount=0; execution task unchanged; Runner authority not widened.",
    stagesCompleted,
    stoppedAtStage: null,
  });
}

export { createExplicitZeroInterventionAccounting };
