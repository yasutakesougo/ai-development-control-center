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
     * Optional override. Counts only when that exact live open PR is
     * `draft === true` and `classification === "REFRESH_DRAFT"`.
     * Invalid/stale overrides are rejected; generator falls back to the
     * lowest-number live REFRESH_DRAFT (or null) so coverage fields stay
     * consistent.
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

function isLiveRefreshDraft(
  prs: readonly StatusOverlayPullRequest[],
  prNumber: number | null,
): boolean {
  if (prNumber == null) return false;
  return prs.some(
    (p) => p.number === prNumber && p.draft && p.classification === "REFRESH_DRAFT",
  );
}

function lowestLiveRefreshDraftNumber(
  prs: readonly StatusOverlayPullRequest[],
): number | null {
  const refreshDrafts = prs
    .filter((p) => p.draft && p.classification === "REFRESH_DRAFT")
    .sort((a, b) => a.number - b.number);
  return refreshDrafts[0]?.number ?? null;
}

/**
 * Resolve activeRefreshPr from live evidence.
 *
 * Rules:
 * - omitted override → lowest-number live REFRESH_DRAFT (or null)
 * - override === null → null (explicit none)
 * - override number valid only if that exact live PR is draft + REFRESH_DRAFT
 * - invalid/stale override → ignored; fall back to live-derived REFRESH_DRAFT
 *   (documented fail-closed consistency: never emit contradictory activeRefreshPr)
 */
export function resolveActiveRefreshPr(input: {
  openPullRequests: readonly StatusOverlayPullRequest[];
  override?: number | null;
}): { activeRefreshPr: number | null; overrideRejected: boolean } {
  const liveDerived = lowestLiveRefreshDraftNumber(input.openPullRequests);

  if (input.override === undefined) {
    return { activeRefreshPr: liveDerived, overrideRejected: false };
  }
  if (input.override === null) {
    return { activeRefreshPr: null, overrideRejected: false };
  }
  if (isLiveRefreshDraft(input.openPullRequests, input.override)) {
    return { activeRefreshPr: input.override, overrideRejected: false };
  }
  // Invalid override must not stick; fall back to live-derived state.
  return { activeRefreshPr: liveDerived, overrideRejected: true };
}

function deriveCoverage(input: {
  architectureAffectingStale: boolean;
  autoRefreshEnabled: boolean;
  activeRefreshPr: number | null;
  liveObservationFailed: boolean;
  openPullRequests: StatusOverlayPullRequest[];
}): AutoRefreshCoverage {
  // Only the resolved activeRefreshPr that matches a live REFRESH_DRAFT covers.
  const coveredByMatchedDraft = isLiveRefreshDraft(
    input.openPullRequests,
    input.activeRefreshPr,
  );
  const base = classifyAutoRefreshCoverage({
    architectureAffectingStale: input.architectureAffectingStale,
    autoRefreshEnabled: input.autoRefreshEnabled,
    activeRefreshPr: coveredByMatchedDraft ? input.activeRefreshPr : null,
    livePrObservationFailed: input.liveObservationFailed,
  });
  if (base === "COVERED_BY_DRAFT" && !coveredByMatchedDraft) {
    return input.autoRefreshEnabled
      ? "COVERED_BY_ENABLED_AUTOMATION_IDLE"
      : "NOT_COVERED";
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
  const { activeRefreshPr, overrideRejected } = resolveActiveRefreshPr({
    openPullRequests,
    override: input.autoRefresh.activeRefreshPr,
  });
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
    activeRefreshPr,
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
  if (overrideRejected && !unknowns.includes("activeRefreshPr_override_rejected")) {
    unknowns.push("activeRefreshPr_override_rejected");
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
