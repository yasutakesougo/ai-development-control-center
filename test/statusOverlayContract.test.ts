import { describe, expect, it } from "vitest";
import {
  assertStatusOverlayNotImplemented,
  classifyAutoRefreshCoverage,
  classifyOverlayGateKind,
  lastRunProvesCurrentFreshness,
  normalizeCiState,
  overlayRecommendationAuthorizesMutation,
  projectHistoryForOverlay,
  proposedStatusOverlayStoragePath,
  resolveLivePrStateOverHistory,
  selectRecommendedNextAction,
  STATUS_OVERLAY_GENERATOR_IMPLEMENTED,
  STATUS_OVERLAY_IMPLEMENTED,
  STATUS_OVERLAY_MARKDOWN_SECTIONS,
  STATUS_OVERLAY_SCHEMA_VERSION,
  STATUS_OVERLAY_UI_IMPLEMENTED,
  type StatusOverlayPullRequest,
} from "../src/domain/statusOverlayContract";

function draftPr(n: number, extras: Partial<StatusOverlayPullRequest> = {}): StatusOverlayPullRequest {
  return {
    number: n,
    title: `refresh ${n}`,
    draft: true,
    mergeable: "UNKNOWN",
    head: "abc",
    base: "main",
    reviewState: "UNKNOWN",
    ciState: "UNKNOWN",
    classification: "REFRESH_DRAFT",
    humanAction: "REVIEW_DRAFT",
    ...extras,
  };
}

function readyPr(n: number): StatusOverlayPullRequest {
  return {
    number: n,
    title: `ready ${n}`,
    draft: false,
    mergeable: true,
    head: "def",
    base: "main",
    reviewState: "UNKNOWN",
    ciState: "UNKNOWN",
    classification: "OTHER",
    humanAction: "DECIDE_MERGE",
  };
}

describe("STATUS-OVERLAY-V1 design contract", () => {
  it("remains DESIGNED with no runtime generator or UI", () => {
    expect(STATUS_OVERLAY_SCHEMA_VERSION).toBe("STATUS-OVERLAY-V1");
    expect(STATUS_OVERLAY_IMPLEMENTED).toBe(false);
    expect(STATUS_OVERLAY_GENERATOR_IMPLEMENTED).toBe(false);
    expect(STATUS_OVERLAY_UI_IMPLEMENTED).toBe(false);
    expect(() => assertStatusOverlayNotImplemented()).not.toThrow();
    expect(proposedStatusOverlayStoragePath()).toBe("docs/status/status-overlay.json");
    expect(STATUS_OVERLAY_MARKDOWN_SECTIONS).toEqual([
      "CURRENT",
      "GATE",
      "AUTOMATION",
      "HOLDS",
      "UNKNOWN",
      "NEXT",
    ]);
  });

  it("live state overrides history for current PR classification", () => {
    expect(
      resolveLivePrStateOverHistory({
        historicalState: "OPEN_DRAFT",
        liveState: "MERGED",
      }),
    ).toBe("MERGED");
    expect(
      resolveLivePrStateOverHistory({
        historicalState: "MERGED",
        liveState: "OPEN_DRAFT",
      }),
    ).toBe("OPEN_DRAFT");
  });

  it("stale Snapshot + active refresh Draft → recommend Draft review, not duplicate refresh", () => {
    const action = selectRecommendedNextAction({
      architectureAffectingStale: true,
      autoRefreshCoverage: "COVERED_BY_DRAFT",
      openPullRequests: [draftPr(30)],
      historicalDraftOpen: true,
    });
    expect(action.code).toBe("REVIEW_DRAFT_PR");
    expect(action.gateKind).toBe("HumanActionRequired");
    expect(action.targets?.pullRequest).toBe(30);
    expect(action.secondaryContext?.some((s) => s.includes("duplicate refresh"))).toBe(true);
    expect(classifyOverlayGateKind({
      architectureAffectingStale: true,
      autoRefreshCoverage: "COVERED_BY_DRAFT",
      openPullRequests: [draftPr(30)],
    })).toBe("HumanActionRequired");
  });

  it("stale Snapshot + no automation coverage → maintenance action", () => {
    const action = selectRecommendedNextAction({
      architectureAffectingStale: true,
      autoRefreshCoverage: "NOT_COVERED",
      openPullRequests: [],
    });
    expect(action.code).toBe("MAINTAIN_STALE_SNAPSHOT");
    expect(action.status).toBe("STALE");
    expect(action.gateKind).toBe("SystemMaintenanceRequired");
    expect(classifyOverlayGateKind({
      architectureAffectingStale: true,
      autoRefreshCoverage: "NOT_COVERED",
    })).toBe("SystemMaintenanceRequired");
    expect(
      classifyAutoRefreshCoverage({
        architectureAffectingStale: true,
        autoRefreshEnabled: false,
        activeRefreshPr: null,
      }),
    ).toBe("NOT_COVERED");
  });

  it("Draft PR → HumanActionRequired", () => {
    const action = selectRecommendedNextAction({
      openPullRequests: [draftPr(31)],
    });
    expect(action.code).toBe("REVIEW_DRAFT_PR");
    expect(action.gateKind).toBe("HumanActionRequired");
  });

  it("Ready PR → Merge decision", () => {
    const action = selectRecommendedNextAction({
      openPullRequests: [readyPr(32)],
    });
    expect(action.code).toBe("DECIDE_MERGE_READY_PR");
    expect(action.status).toBe("READY");
    expect(action.gateKind).toBe("HumanActionRequired");
    expect(action.targets?.pullRequest).toBe(32);
  });

  it("UNKNOWN CI remains UNKNOWN", () => {
    expect(normalizeCiState(null)).toBe("UNKNOWN");
    expect(normalizeCiState(undefined)).toBe("UNKNOWN");
    expect(normalizeCiState("UNKNOWN")).toBe("UNKNOWN");
    expect(normalizeCiState("")).toBe("UNKNOWN");
    expect(normalizeCiState("PASS")).toBe("PASS");
    const pr = draftPr(33, { ciState: normalizeCiState(null) });
    expect(pr.ciState).toBe("UNKNOWN");
  });

  it("OUTCOME_UNKNOWN outranks normal next actions", () => {
    const action = selectRecommendedNextAction({
      outcomeUnknown: true,
      architectureAffectingStale: true,
      autoRefreshCoverage: "NOT_COVERED",
      openPullRequests: [draftPr(34), readyPr(35)],
      handoffActionRequired: true,
      automationFailed: true,
    });
    expect(action.code).toBe("RESOLVE_OUTCOME_UNKNOWN");
    expect(action.status).toBe("OUTCOME_UNKNOWN");
  });

  it("no work → NO_ACTION", () => {
    const action = selectRecommendedNextAction({
      architectureAffectingStale: false,
      autoRefreshCoverage: "COVERED_BY_ENABLED_AUTOMATION_IDLE",
      openPullRequests: [],
    });
    expect(action.code).toBe("NO_ACTION");
    expect(action.status).toBe("NO_ACTION");
    expect(action.gateKind).toBe("NoAction");
  });

  it("overlay recommendation does not authorize mutation", () => {
    const actions = [
      selectRecommendedNextAction({ outcomeUnknown: true }),
      selectRecommendedNextAction({ handoffActionRequired: true }),
      selectRecommendedNextAction({ openPullRequests: [draftPr(36)] }),
      selectRecommendedNextAction({ openPullRequests: [readyPr(37)] }),
      selectRecommendedNextAction({
        architectureAffectingStale: true,
        autoRefreshCoverage: "NOT_COVERED",
      }),
      selectRecommendedNextAction({}),
    ];
    for (const action of actions) {
      expect(action.authorizesMutation).toBe(false);
      expect(overlayRecommendationAuthorizesMutation(action)).toBe(false);
    }
  });

  it("HISTORY unavailable does not break current projection", () => {
    const history = projectHistoryForOverlay();
    expect(history.status).toBe("DESIGNED_NOT_IMPLEMENTED");
    expect(history.writerImplemented).toBe(false);
    expect(history.lastEvent).toBeNull();

    const action = selectRecommendedNextAction({
      openPullRequests: [],
      historicalDraftOpen: true,
      architectureAffectingStale: false,
    });
    expect(action.code).toBe("NO_ACTION");
    expect(
      resolveLivePrStateOverHistory({
        historicalState: "OPEN_DRAFT",
        liveState: "MISSING",
      }),
    ).toBe("MISSING");
  });

  it("historical Draft claim is ignored when live PRs are empty and stale needs maintenance", () => {
    const action = selectRecommendedNextAction({
      architectureAffectingStale: true,
      autoRefreshCoverage: "NOT_COVERED",
      openPullRequests: [],
      historicalDraftOpen: true,
    });
    expect(action.code).toBe("MAINTAIN_STALE_SNAPSHOT");
    expect(action.secondaryContext?.some((s) => s.includes("live wins"))).toBe(true);
  });

  it("uncovered architecture stale outranks unrelated DESIGN Draft", () => {
    const designDraft: StatusOverlayPullRequest = {
      number: 41,
      title: "docs(status): design STATUS-OVERLAY-V1",
      draft: true,
      mergeable: "UNKNOWN",
      head: "aaa",
      base: "main",
      reviewState: "UNKNOWN",
      ciState: "UNKNOWN",
      classification: "DESIGN",
      humanAction: "REVIEW_DRAFT",
    };
    const action = selectRecommendedNextAction({
      architectureAffectingStale: true,
      autoRefreshCoverage: "NOT_COVERED",
      openPullRequests: [designDraft],
    });
    expect(action.code).toBe("MAINTAIN_STALE_SNAPSHOT");
    expect(action.gateKind).toBe("SystemMaintenanceRequired");
    expect(action.authorizesMutation).toBe(false);
    expect(action.secondaryContext?.some((s) => s.includes("DESIGN"))).toBe(true);
    expect(
      classifyOverlayGateKind({
        architectureAffectingStale: true,
        autoRefreshCoverage: "NOT_COVERED",
        openPullRequests: [designDraft],
      }),
    ).toBe("SystemMaintenanceRequired");
  });

  it("unrelated OTHER Draft does not suppress MAINTAIN_STALE_SNAPSHOT", () => {
    const otherDraft = draftPr(42, {
      classification: "OTHER",
      title: "chore: unrelated",
    });
    const action = selectRecommendedNextAction({
      architectureAffectingStale: true,
      autoRefreshCoverage: "NOT_COVERED",
      openPullRequests: [otherDraft, readyPr(43)],
    });
    expect(action.code).toBe("MAINTAIN_STALE_SNAPSHOT");
    expect(action.authorizesMutation).toBe(false);
  });

  it("COVERED_BY_DRAFT + REFRESH_DRAFT still recommends Draft review", () => {
    const action = selectRecommendedNextAction({
      architectureAffectingStale: true,
      autoRefreshCoverage: "COVERED_BY_DRAFT",
      openPullRequests: [
        {
          number: 50,
          title: "docs: design only",
          draft: true,
          mergeable: "UNKNOWN",
          head: "bbb",
          base: "main",
          reviewState: "UNKNOWN",
          ciState: "UNKNOWN",
          classification: "DESIGN",
          humanAction: "REVIEW_DRAFT",
        },
        draftPr(51),
      ],
    });
    expect(action.code).toBe("REVIEW_DRAFT_PR");
    expect(action.targets?.pullRequest).toBe(51);
    expect(action.secondaryContext?.some((s) => s.includes("duplicate refresh"))).toBe(true);
  });

  it("HOLD / OUTCOME_UNKNOWN / HANDOFF / FAILED still outrank uncovered stale", () => {
    const staleWithDesign = {
      architectureAffectingStale: true,
      autoRefreshCoverage: "NOT_COVERED" as const,
      openPullRequests: [
        draftPr(60, { classification: "DESIGN", title: "design" }),
      ],
    };
    expect(selectRecommendedNextAction({ ...staleWithDesign, outcomeUnknown: true }).code).toBe(
      "RESOLVE_OUTCOME_UNKNOWN",
    );
    expect(selectRecommendedNextAction({ ...staleWithDesign, safetyHold: true }).code).toBe(
      "RESOLVE_HOLD",
    );
    expect(
      selectRecommendedNextAction({ ...staleWithDesign, handoffActionRequired: true }).code,
    ).toBe("HANDOFF_ACTION_REQUIRED");
    expect(selectRecommendedNextAction({ ...staleWithDesign, automationFailed: true }).code).toBe(
      "REVIEW_FAILED_AUTOMATION",
    );
  });

  it("last successful run does not prove freshness after main moves", () => {
    expect(
      lastRunProvesCurrentFreshness({
        lastRunHeadSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        currentMain: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    ).toBe(false);
    expect(
      lastRunProvesCurrentFreshness({
        lastRunHeadSha: "cccccccccccccccccccccccccccccccccccccccc",
        currentMain: "cccccccccccccccccccccccccccccccccccccccc",
      }),
    ).toBe(true);
  });

  it("safety HOLD outranks Draft review", () => {
    const action = selectRecommendedNextAction({
      safetyHold: true,
      holdReason: "token scope HOLD",
      openPullRequests: [draftPr(40)],
    });
    expect(action.code).toBe("RESOLVE_HOLD");
    expect(action.status).toBe("HOLD");
  });
});
