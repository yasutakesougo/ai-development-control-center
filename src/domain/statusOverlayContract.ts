/**
 * STATUS-OVERLAY-V1 design contract helpers.
 *
 * DESIGNED · runtime generator IMPLEMENTED · UI NOT IMPLEMENTED
 *
 * Pure live-state precedence, Human-gate classification, and deterministic
 * next-action selection. Does not observe GitHub, write files, or authorize
 * mutation. Projection assembly lives in `statusOverlayGenerator.ts`.
 */

export const STATUS_OVERLAY_SCHEMA_VERSION = "STATUS-OVERLAY-V1" as const;
export const STATUS_OVERLAY_DESIGN = "STATUS-OVERLAY-DESIGN-V1" as const;

/** Pure runtime projection generator is implemented (no observer/UI/writer). */
export const STATUS_OVERLAY_GENERATOR_IMPLEMENTED = true as const;
export const STATUS_OVERLAY_UI_IMPLEMENTED = false as const;
/** Full product (observer + UI + emit) remains incomplete. */
export const STATUS_OVERLAY_IMPLEMENTED = false as const;

/** Stable status vocabulary — no synonyms. */
export type StatusOverlayStatus =
  | "CURRENT"
  | "STALE"
  | "READY"
  | "HOLD"
  | "ACTION_REQUIRED"
  | "NO_ACTION"
  | "UNKNOWN"
  | "FAILED"
  | "OUTCOME_UNKNOWN";

export type StatusOverlayGateKind =
  | "HumanActionRequired"
  | "SystemMaintenanceRequired"
  | "NoAction"
  | "Unknown";

export type StatusOverlayNextActionCode =
  | "RESOLVE_OUTCOME_UNKNOWN"
  | "RESOLVE_HOLD"
  | "HANDOFF_ACTION_REQUIRED"
  | "REVIEW_FAILED_AUTOMATION"
  | "MAINTAIN_STALE_SNAPSHOT"
  | "REVIEW_DRAFT_PR"
  | "DECIDE_MERGE_READY_PR"
  | "NO_ACTION"
  | "UNKNOWN";

export type AutoRefreshCoverage =
  | "COVERED_BY_DRAFT"
  | "COVERED_BY_ENABLED_AUTOMATION_IDLE"
  | "NOT_COVERED"
  | "UNKNOWN";

export type HistoryOverlayStatus = "DESIGNED_NOT_IMPLEMENTED" | "AVAILABLE";

export interface StatusOverlayPullRequest {
  number: number;
  title: string;
  draft: boolean;
  mergeable: boolean | "UNKNOWN";
  head: string | null;
  base: string | null;
  reviewState: string | "UNKNOWN";
  ciState: string | "UNKNOWN";
  classification: "REFRESH_DRAFT" | "DESIGN" | "OTHER";
  humanAction: "REVIEW_DRAFT" | "DECIDE_MERGE" | "NONE" | "UNKNOWN";
}

export interface StatusOverlayRecommendedNextAction {
  code: StatusOverlayNextActionCode;
  status: StatusOverlayStatus;
  gateKind: StatusOverlayGateKind;
  summary: string;
  /** Always false — recommendation never authorizes mutation. */
  authorizesMutation: false;
  targets?: {
    pullRequest?: number;
    workflowRunId?: string | null;
  };
  secondaryContext?: string[];
}

export interface StatusOverlayHistoryProjection {
  status: HistoryOverlayStatus;
  writerImplemented: boolean;
  lastEvent: string | null;
  lastConvergedAt: string | null;
  refreshLifecycleSummary: string | null;
}

export interface StatusOverlayDocument {
  schemaVersion: typeof STATUS_OVERLAY_SCHEMA_VERSION;
  repository: string;
  observedAt: string;
  main: { sha: string | null };
  snapshot: {
    generatedFrom: string | null;
    currentMain: string | null;
    stale: boolean | null;
    staleClassification: string | null;
    architectureRelevantChanges: string[];
    autoRefreshCoverage: AutoRefreshCoverage;
  };
  handoff: {
    nextActionStatus: "NO_ACTION" | "ACTION_REQUIRED" | "UNKNOWN" | null;
    staleClassification: string | null;
  };
  autoRefresh: {
    enabled: boolean;
    trigger: string | null;
    lastRunId: string | null;
    lastRunConclusion: string | null;
    lastEvaluation: string | null;
    lastPublicationOutcome: string | null;
    activeRefreshPr: number | null;
  };
  history: StatusOverlayHistoryProjection;
  pullRequests: StatusOverlayPullRequest[];
  humanGates: Array<{ kind: StatusOverlayGateKind; summary: string }>;
  holds: string[];
  unknowns: string[];
  recommendedNextAction: StatusOverlayRecommendedNextAction;
}

export interface SelectNextActionInput {
  /** Live evidence incomplete for a required decision. */
  liveObservationFailed?: boolean;
  /**
   * Workflow/Actions observation could not be read.
   * This is observation UNKNOWN — not automation OUTCOME_UNKNOWN.
   */
  workflowObservationFailed?: boolean;
  outcomeUnknown?: boolean;
  safetyHold?: boolean;
  holdReason?: string | null;
  /** HANDOFF nextAction.status === ACTION_REQUIRED with confirmed evidence. */
  handoffActionRequired?: boolean;
  automationFailed?: boolean;
  /** Architecture-affecting stale Snapshot (not mere no-impact stale). */
  architectureAffectingStale?: boolean;
  autoRefreshCoverage?: AutoRefreshCoverage;
  openPullRequests?: StatusOverlayPullRequest[];
  /** Historical claim that a Draft is open — ignored when live PRs are supplied. */
  historicalDraftOpen?: boolean;
  /**
   * Resolved live REFRESH_DRAFT number (already validated). When set and present
   * in openPullRequests as REFRESH_DRAFT, preferred for covered Draft review.
   */
  activeRefreshPr?: number | null;
}

/** UI / observer / writer / Gateway binding remain forbidden in this slice. */
export function assertStatusOverlayUiNotImplemented(): void {
  if (STATUS_OVERLAY_UI_IMPLEMENTED) {
    throw new Error("STATUS-OVERLAY-V1 UI must remain NOT IMPLEMENTED");
  }
}

/** @deprecated Use assertStatusOverlayUiNotImplemented — generator is now implemented. */
export function assertStatusOverlayNotImplemented(): void {
  assertStatusOverlayUiNotImplemented();
  if (STATUS_OVERLAY_IMPLEMENTED) {
    throw new Error(
      "STATUS-OVERLAY-V1 full product (observer/UI/writer) must remain NOT IMPLEMENTED",
    );
  }
}

/**
 * Live GitHub/git always wins for current PR classification.
 * HISTORY may describe earlier OPEN observations but must not override live.
 */
export function resolveLivePrStateOverHistory(input: {
  historicalState: "OPEN_DRAFT" | "OPEN_READY" | "MERGED" | "CLOSED" | "MISSING";
  liveState: "OPEN_DRAFT" | "OPEN_READY" | "MERGED" | "CLOSED" | "MISSING";
}): "OPEN_DRAFT" | "OPEN_READY" | "MERGED" | "CLOSED" | "MISSING" {
  return input.liveState;
}

/** HISTORY writer absence must not break current projection. */
export function projectHistoryForOverlay(input?: {
  writerImplemented?: boolean;
  lastEvent?: string | null;
  lastConvergedAt?: string | null;
  refreshLifecycleSummary?: string | null;
}): StatusOverlayHistoryProjection {
  if (!input?.writerImplemented) {
    return {
      status: "DESIGNED_NOT_IMPLEMENTED",
      writerImplemented: false,
      lastEvent: null,
      lastConvergedAt: null,
      refreshLifecycleSummary: null,
    };
  }
  return {
    status: "AVAILABLE",
    writerImplemented: true,
    lastEvent: input.lastEvent ?? null,
    lastConvergedAt: input.lastConvergedAt ?? null,
    refreshLifecycleSummary: input.refreshLifecycleSummary ?? null,
  };
}

export function classifyAutoRefreshCoverage(input: {
  architectureAffectingStale: boolean;
  autoRefreshEnabled: boolean;
  activeRefreshPr: number | null;
  livePrObservationFailed?: boolean;
}): AutoRefreshCoverage {
  if (input.livePrObservationFailed) return "UNKNOWN";
  if (input.activeRefreshPr != null) return "COVERED_BY_DRAFT";
  if (!input.architectureAffectingStale) {
    return input.autoRefreshEnabled
      ? "COVERED_BY_ENABLED_AUTOMATION_IDLE"
      : "NOT_COVERED";
  }
  if (input.autoRefreshEnabled) return "COVERED_BY_ENABLED_AUTOMATION_IDLE";
  return "NOT_COVERED";
}

/**
 * Active refresh Draft coverage requires both:
 * - supplied autoRefreshCoverage === COVERED_BY_DRAFT
 * - a live open Draft classified as REFRESH_DRAFT
 *
 * Unrelated DESIGN / OTHER Drafts never count as Snapshot stale coverage.
 */
export function hasActiveRefreshDraftCoverage(input: {
  autoRefreshCoverage?: AutoRefreshCoverage;
  openPullRequests?: StatusOverlayPullRequest[];
}): boolean {
  if ((input.autoRefreshCoverage ?? "UNKNOWN") !== "COVERED_BY_DRAFT") return false;
  return pickActiveRefreshDraft(input.openPullRequests ?? []) != null;
}

/** Uncovered architecture-affecting stale (priority 4) — ignores unrelated Draft/Ready PRs. */
export function isUncoveredArchitectureStale(input: SelectNextActionInput): boolean {
  if (!input.architectureAffectingStale) return false;
  const coverage = input.autoRefreshCoverage ?? "UNKNOWN";
  if (coverage === "COVERED_BY_ENABLED_AUTOMATION_IDLE") return false;
  if (hasActiveRefreshDraftCoverage(input)) return false;
  return true;
}

/**
 * Classify Human/system gate kind from live facts.
 * Maintenance staleness alone is never HANDOFF ACTION_REQUIRED.
 */
export function classifyOverlayGateKind(input: SelectNextActionInput): StatusOverlayGateKind {
  if (input.liveObservationFailed) return "Unknown";
  if (input.workflowObservationFailed) return "Unknown";
  if (input.outcomeUnknown || input.safetyHold) return "HumanActionRequired";
  if (input.handoffActionRequired) return "HumanActionRequired";
  if (input.automationFailed) return "HumanActionRequired";

  // Priority 4 before unrelated Draft/Ready review (priority 5).
  if (isUncoveredArchitectureStale(input)) return "SystemMaintenanceRequired";

  const prs = input.openPullRequests ?? [];
  const draft = pickPrimaryPr(prs.filter((p) => p.draft));
  const ready = pickPrimaryPr(prs.filter((p) => !p.draft));
  if (draft || ready) return "HumanActionRequired";

  return "NoAction";
}

function pickPrimaryPr(
  prs: readonly StatusOverlayPullRequest[],
): StatusOverlayPullRequest | null {
  if (prs.length === 0) return null;
  return [...prs].sort((a, b) => a.number - b.number)[0] ?? null;
}

function pickActiveRefreshDraft(
  prs: readonly StatusOverlayPullRequest[],
): StatusOverlayPullRequest | null {
  return pickPrimaryPr(prs.filter((p) => p.draft && p.classification === "REFRESH_DRAFT"));
}

/**
 * Deterministic next-action selection (first match wins).
 * Recommendation never authorizes mutation.
 */
export function selectRecommendedNextAction(
  input: SelectNextActionInput,
): StatusOverlayRecommendedNextAction {
  const denyAuth = { authorizesMutation: false as const };

  if (input.liveObservationFailed) {
    return {
      code: "UNKNOWN",
      status: "UNKNOWN",
      gateKind: "Unknown",
      summary: "Live observation failed; cannot recommend a safe next action",
      ...denyAuth,
    };
  }

  // Workflow API/read failure is observation UNKNOWN, not automation OUTCOME_UNKNOWN.
  if (input.workflowObservationFailed) {
    return {
      code: "UNKNOWN",
      status: "UNKNOWN",
      gateKind: "Unknown",
      summary:
        "Workflow observation unavailable; cannot recommend a safe next action from missing automation evidence",
      ...denyAuth,
    };
  }

  if (input.outcomeUnknown) {
    return {
      code: "RESOLVE_OUTCOME_UNKNOWN",
      status: "OUTCOME_UNKNOWN",
      gateKind: "HumanActionRequired",
      summary: "Resolve OUTCOME_UNKNOWN automation before other actions",
      ...denyAuth,
      targets: { workflowRunId: null },
    };
  }

  if (input.safetyHold) {
    return {
      code: "RESOLVE_HOLD",
      status: "HOLD",
      gateKind: "HumanActionRequired",
      summary: input.holdReason ?? "Resolve safety HOLD before other actions",
      ...denyAuth,
    };
  }

  if (input.handoffActionRequired) {
    return {
      code: "HANDOFF_ACTION_REQUIRED",
      status: "ACTION_REQUIRED",
      gateKind: "HumanActionRequired",
      summary: "HANDOFF reports ACTION_REQUIRED with confirmed Human-Decision evidence",
      ...denyAuth,
    };
  }

  if (input.automationFailed) {
    return {
      code: "REVIEW_FAILED_AUTOMATION",
      status: "FAILED",
      gateKind: "HumanActionRequired",
      summary: "Review failed automation run",
      ...denyAuth,
    };
  }

  const prs = input.openPullRequests ?? [];
  // Live open PRs only — historicalDraftOpen must not invent a current Draft.
  const preferredRefresh =
    input.activeRefreshPr != null
      ? prs.find(
          (p) =>
            p.number === input.activeRefreshPr &&
            p.draft &&
            p.classification === "REFRESH_DRAFT",
        ) ?? null
      : null;
  const refreshDraft = preferredRefresh ?? pickActiveRefreshDraft(prs);
  const draft = pickPrimaryPr(prs.filter((p) => p.draft));
  const ready = pickPrimaryPr(prs.filter((p) => !p.draft));
  const coverage = input.autoRefreshCoverage ?? "UNKNOWN";

  // Priority 4: uncovered architecture stale outranks unrelated DESIGN/OTHER Draft/Ready.
  if (isUncoveredArchitectureStale(input)) {
    const secondary: string[] = [];
    if (input.historicalDraftOpen) {
      secondary.push("HISTORY claimed a Draft was open; live coverage evidence does not — live wins");
    }
    if (draft && draft.classification !== "REFRESH_DRAFT") {
      secondary.push(
        `Open Draft #${draft.number} is ${draft.classification}, not REFRESH_DRAFT — does not cover stale Snapshot`,
      );
    }
    return {
      code: "MAINTAIN_STALE_SNAPSHOT",
      status: "STALE",
      gateKind: "SystemMaintenanceRequired",
      summary: "Architecture-affecting Snapshot is stale without active automation coverage",
      ...denyAuth,
      secondaryContext: secondary.length > 0 ? secondary : undefined,
    };
  }

  // Covered refresh Draft is the preferred review target when present.
  const reviewDraft =
    coverage === "COVERED_BY_DRAFT" && refreshDraft != null ? refreshDraft : draft;

  if (reviewDraft) {
    return {
      code: "REVIEW_DRAFT_PR",
      status: "ACTION_REQUIRED",
      gateKind: "HumanActionRequired",
      summary: `Review Draft PR #${reviewDraft.number}`,
      ...denyAuth,
      targets: { pullRequest: reviewDraft.number },
      secondaryContext:
        input.architectureAffectingStale &&
        coverage === "COVERED_BY_DRAFT" &&
        reviewDraft.classification === "REFRESH_DRAFT"
          ? ["Stale Snapshot already covered by active refresh Draft — do not start a duplicate refresh"]
          : undefined,
    };
  }

  if (ready) {
    return {
      code: "DECIDE_MERGE_READY_PR",
      status: "READY",
      gateKind: "HumanActionRequired",
      summary: `Human merge decision for Ready PR #${ready.number}`,
      ...denyAuth,
      targets: { pullRequest: ready.number },
    };
  }

  // Enabled automation idle covering non-architecture stale (or current) → no action.
  return {
    code: "NO_ACTION",
    status: "NO_ACTION",
    gateKind: "NoAction",
    summary: "No repository action required",
    ...denyAuth,
  };
}

/**
 * Recommendation never authorizes mutation — including when status is ACTION_REQUIRED.
 */
export function overlayRecommendationAuthorizesMutation(
  action: StatusOverlayRecommendedNextAction,
): false {
  return action.authorizesMutation;
}

/** Preserve UNKNOWN CI — never upgrade missing evidence to PASS. */
export function normalizeCiState(ciState: string | null | undefined): string | "UNKNOWN" {
  if (ciState == null || ciState === "" || ciState === "UNKNOWN") return "UNKNOWN";
  return ciState;
}

export function proposedStatusOverlayStoragePath(): "docs/status/status-overlay.json" {
  return "docs/status/status-overlay.json";
}

/** Compact Markdown section order for a future renderer (not implemented). */
export const STATUS_OVERLAY_MARKDOWN_SECTIONS = [
  "CURRENT",
  "GATE",
  "AUTOMATION",
  "HOLDS",
  "UNKNOWN",
  "NEXT",
] as const;

/**
 * Last successful AUTO-REFRESH run is not proof of current freshness when main moved.
 */
export function lastRunProvesCurrentFreshness(input: {
  lastRunHeadSha: string | null;
  currentMain: string | null;
}): boolean {
  if (!input.lastRunHeadSha || !input.currentMain) return false;
  return input.lastRunHeadSha === input.currentMain;
}
