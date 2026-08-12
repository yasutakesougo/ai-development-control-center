/**
 * STATUS-OVERLAY-V1 runtime generator.
 *
 * Pure projection: explicit observed inputs → StatusOverlayDocument.
 * Does not call network/APIs, read env/secrets, touch the filesystem, or
 * manufacture observation timestamps.
 */

import {
  STATUS_OVERLAY_GENERATOR_IMPLEMENTED,
  STATUS_OVERLAY_SCHEMA_VERSION,
  classifyAutoRefreshCoverage,
  classifyOverlayGateKind,
  normalizeCiState,
  projectHistoryForOverlay,
  resolveLivePrStateOverHistory,
  selectRecommendedNextAction,
  type AutoRefreshCoverage,
  type StatusOverlayDocument,
  type StatusOverlayGateKind,
  type StatusOverlayPullRequest,
} from "./statusOverlayContract";

export { STATUS_OVERLAY_GENERATOR_IMPLEMENTED };

export interface StatusOverlayGeneratorInput {
  repository: string;
  /** Caller-supplied observation time — preserved exactly; never replaced. */
  observedAt: string;
  currentMain: string | null;
  snapshot: {
    generatedFrom: string | null;
    stale: boolean | null;
    staleClassification: string | null;
    architectureRelevantChanges?: string[];
  };
  handoff: {
    nextActionStatus: "NO_ACTION" | "ACTION_REQUIRED" | "UNKNOWN" | null;
    staleClassification?: string | null;
  };
  autoRefresh: {
    enabled: boolean;
    trigger?: string | null;
    lastRunId?: string | null;
    lastRunConclusion?: string | null;
    lastEvaluation?: string | null;
    lastPublicationOutcome?: string | null;
    /**
     * Optional override. When omitted, derived from the lowest-number live
     * open Draft with classification REFRESH_DRAFT.
     */
    activeRefreshPr?: number | null;
  };
  openPullRequests?: StatusOverlayPullRequest[];
  holds?: string[];
  unknowns?: string[];
  liveObservationFailed?: boolean;
  outcomeUnknown?: boolean;
  safetyHold?: boolean;
  holdReason?: string | null;
  automationFailed?: boolean;
  /** Historical claim only — never overrides live openPullRequests. */
  historicalDraftOpen?: boolean;
  historyWriter?: {
    writerImplemented?: boolean;
    lastEvent?: string | null;
    lastConvergedAt?: string | null;
    refreshLifecycleSummary?: string | null;
  };
}

function isArchitectureAffectingStale(input: StatusOverlayGeneratorInput): boolean {
  const classification =
    input.snapshot.staleClassification ?? input.handoff.staleClassification ?? null;
  if (classification === "stale_architecture_affecting") return true;
  if (classification === "stale_no_architecture_impact" || classification === "current") {
    return false;
  }
  const changes = input.snapshot.architectureRelevantChanges ?? [];
  return input.snapshot.stale === true && changes.length > 0;
}

function normalizePullRequest(pr: StatusOverlayPullRequest): StatusOverlayPullRequest {
  return {
    ...pr,
    mergeable: pr.mergeable === true || pr.mergeable === false ? pr.mergeable : "UNKNOWN",
    reviewState: normalizeCiState(pr.reviewState),
    ciState: normalizeCiState(pr.ciState),
  };
}

function deriveActiveRefreshPr(
  prs: readonly StatusOverlayPullRequest[],
  override: number | null | undefined,
): number | null {
  if (override !== undefined) return override;
  const refreshDrafts = prs
    .filter((p) => p.draft && p.classification === "REFRESH_DRAFT")
    .sort((a, b) => a.number - b.number);
  return refreshDrafts[0]?.number ?? null;
}

function deriveCoverage(input: {
  architectureAffectingStale: boolean;
  autoRefreshEnabled: boolean;
  activeRefreshPr: number | null;
  liveObservationFailed: boolean;
  openPullRequests: StatusOverlayPullRequest[];
}): AutoRefreshCoverage {
  const base = classifyAutoRefreshCoverage({
    architectureAffectingStale: input.architectureAffectingStale,
    autoRefreshEnabled: input.autoRefreshEnabled,
    activeRefreshPr: input.activeRefreshPr,
    livePrObservationFailed: input.liveObservationFailed,
  });
  // COVERED_BY_DRAFT only when a live REFRESH_DRAFT exists.
  if (base === "COVERED_BY_DRAFT") {
    const hasRefreshDraft = input.openPullRequests.some(
      (p) => p.draft && p.classification === "REFRESH_DRAFT",
    );
    if (!hasRefreshDraft) {
      return input.autoRefreshEnabled
        ? "COVERED_BY_ENABLED_AUTOMATION_IDLE"
        : "NOT_COVERED";
    }
  }
  return base;
}

function buildHumanGates(input: {
  gateKind: StatusOverlayGateKind;
  recommendedSummary: string;
  handoffActionRequired: boolean;
  architectureAffectingStale: boolean;
  openPullRequests: StatusOverlayPullRequest[];
}): Array<{ kind: StatusOverlayGateKind; summary: string }> {
  const gates: Array<{ kind: StatusOverlayGateKind; summary: string }> = [
    { kind: input.gateKind, summary: input.recommendedSummary },
  ];
  if (input.handoffActionRequired && input.gateKind !== "HumanActionRequired") {
    gates.push({
      kind: "HumanActionRequired",
      summary: "HANDOFF nextAction is ACTION_REQUIRED",
    });
  }
  return gates;
}

/**
 * Build a JSON-serializable STATUS-OVERLAY document from explicit observations.
 * Deterministic for identical inputs. Does not invent timestamps.
 */
export function generateStatusOverlay(
  input: StatusOverlayGeneratorInput,
): StatusOverlayDocument {
  const openPullRequests = [...(input.openPullRequests ?? [])]
    .map(normalizePullRequest)
    .sort((a, b) => a.number - b.number);

  // Live open PRs win; historicalDraftOpen is context only.
  void resolveLivePrStateOverHistory({
    historicalState: input.historicalDraftOpen ? "OPEN_DRAFT" : "MISSING",
    liveState:
      openPullRequests.length === 0
        ? "MISSING"
        : openPullRequests.some((p) => p.draft)
          ? "OPEN_DRAFT"
          : "OPEN_READY",
  });

  const architectureAffectingStale = isArchitectureAffectingStale(input);
  const liveObservationFailed = input.liveObservationFailed === true;
  const activeRefreshPr = deriveActiveRefreshPr(
    openPullRequests,
    input.autoRefresh.activeRefreshPr,
  );
  const autoRefreshCoverage = deriveCoverage({
    architectureAffectingStale,
    autoRefreshEnabled: input.autoRefresh.enabled,
    activeRefreshPr,
    liveObservationFailed,
    openPullRequests,
  });

  const handoffActionRequired = input.handoff.nextActionStatus === "ACTION_REQUIRED";
  const decisionInput = {
    liveObservationFailed,
    outcomeUnknown: input.outcomeUnknown === true,
    safetyHold: input.safetyHold === true,
    holdReason: input.holdReason ?? null,
    handoffActionRequired,
    automationFailed: input.automationFailed === true,
    architectureAffectingStale,
    autoRefreshCoverage,
    openPullRequests,
    historicalDraftOpen: input.historicalDraftOpen === true,
  };

  const recommendedNextAction = selectRecommendedNextAction(decisionInput);
  const gateKind = classifyOverlayGateKind(decisionInput);
  const history = projectHistoryForOverlay(input.historyWriter);

  const holds = [...(input.holds ?? [])];
  if (input.safetyHold && input.holdReason && !holds.includes(input.holdReason)) {
    holds.push(input.holdReason);
  }

  const unknowns = [...(input.unknowns ?? [])];
  if (liveObservationFailed && !unknowns.includes("live_observation_failed")) {
    unknowns.push("live_observation_failed");
  }
  for (const pr of openPullRequests) {
    if (pr.ciState === "UNKNOWN") {
      const key = `pr_${pr.number}_ciState_UNKNOWN`;
      if (!unknowns.includes(key)) unknowns.push(key);
    }
    if (pr.reviewState === "UNKNOWN") {
      const key = `pr_${pr.number}_reviewState_UNKNOWN`;
      if (!unknowns.includes(key)) unknowns.push(key);
    }
  }

  return {
    schemaVersion: STATUS_OVERLAY_SCHEMA_VERSION,
    repository: input.repository,
    observedAt: input.observedAt,
    main: { sha: input.currentMain },
    snapshot: {
      generatedFrom: input.snapshot.generatedFrom,
      currentMain: input.currentMain,
      stale: input.snapshot.stale,
      staleClassification: input.snapshot.staleClassification,
      architectureRelevantChanges: [...(input.snapshot.architectureRelevantChanges ?? [])],
      autoRefreshCoverage,
    },
    handoff: {
      nextActionStatus: input.handoff.nextActionStatus,
      staleClassification:
        input.handoff.staleClassification ?? input.snapshot.staleClassification,
    },
    autoRefresh: {
      enabled: input.autoRefresh.enabled,
      trigger: input.autoRefresh.trigger ?? null,
      lastRunId: input.autoRefresh.lastRunId ?? null,
      lastRunConclusion: input.autoRefresh.lastRunConclusion ?? null,
      lastEvaluation: input.autoRefresh.lastEvaluation ?? null,
      lastPublicationOutcome: input.autoRefresh.lastPublicationOutcome ?? null,
      activeRefreshPr,
    },
    history,
    pullRequests: openPullRequests,
    humanGates: buildHumanGates({
      gateKind,
      recommendedSummary: recommendedNextAction.summary,
      handoffActionRequired,
      architectureAffectingStale,
      openPullRequests,
    }),
    holds,
    unknowns,
    recommendedNextAction,
  };
}
