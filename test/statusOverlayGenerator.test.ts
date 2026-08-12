import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STATUS_OVERLAY_GENERATOR_IMPLEMENTED,
  STATUS_OVERLAY_SCHEMA_VERSION,
  STATUS_OVERLAY_UI_IMPLEMENTED,
  type StatusOverlayPullRequest,
} from "../src/domain/statusOverlayContract";
import {
  generateStatusOverlay,
  resolveActiveRefreshPr,
  type StatusOverlayGeneratorInput,
} from "../src/domain/statusOverlayGenerator";

const repo = "yasutakesougo/ai-development-control-center";
const observedAt = "2026-08-12T04:40:00.000Z";
const main = "752691defeb09508137c3db9238bf9260c07dbc6";
const from = "78a72b13965d7b4fc4ce021d0aaa08a40eb17aa0";

function baseInput(
  partial: Partial<StatusOverlayGeneratorInput> = {},
): StatusOverlayGeneratorInput {
  return {
    repository: repo,
    observedAt,
    currentMain: main,
    snapshot: {
      generatedFrom: from,
      stale: false,
      staleClassification: "current",
      architectureRelevantChanges: [],
    },
    handoff: {
      nextActionStatus: "NO_ACTION",
      staleClassification: "current",
    },
    autoRefresh: {
      enabled: true,
      trigger: "push_main+workflow_dispatch",
      lastRunId: "31562991156",
      lastRunConclusion: "success",
      lastEvaluation: "NOT_REQUIRED",
      lastPublicationOutcome: "NO_PUBLICATION",
    },
    openPullRequests: [],
    ...partial,
  };
}

function designDraft(n: number): StatusOverlayPullRequest {
  return {
    number: n,
    title: "docs(status): design",
    draft: true,
    mergeable: "UNKNOWN",
    head: "aaa",
    base: "main",
    reviewState: "UNKNOWN",
    ciState: "UNKNOWN",
    classification: "DESIGN",
    humanAction: "REVIEW_DRAFT",
  };
}

function refreshDraft(n: number): StatusOverlayPullRequest {
  return {
    number: n,
    title: "docs(architecture): refresh Snapshot",
    draft: true,
    mergeable: "UNKNOWN",
    head: "bbb",
    base: "main",
    reviewState: "UNKNOWN",
    ciState: "UNKNOWN",
    classification: "REFRESH_DRAFT",
    humanAction: "REVIEW_DRAFT",
  };
}

function readyPr(n: number): StatusOverlayPullRequest {
  return {
    number: n,
    title: "ready",
    draft: false,
    mergeable: true,
    head: "ccc",
    base: "main",
    reviewState: "UNKNOWN",
    ciState: "UNKNOWN",
    classification: "OTHER",
    humanAction: "DECIDE_MERGE",
  };
}

describe("STATUS-OVERLAY-V1 runtime generator", () => {
  it("marks generator implemented and UI not implemented", () => {
    expect(STATUS_OVERLAY_GENERATOR_IMPLEMENTED).toBe(true);
    expect(STATUS_OVERLAY_UI_IMPLEMENTED).toBe(false);
  });

  it("produces a deterministic full document for identical inputs", () => {
    const input = baseInput({
      openPullRequests: [readyPr(32), designDraft(30)],
    });
    const a = generateStatusOverlay(input);
    const b = generateStatusOverlay(input);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.schemaVersion).toBe(STATUS_OVERLAY_SCHEMA_VERSION);
    expect(a.pullRequests.map((p) => p.number)).toEqual([30, 32]);
  });

  it("preserves caller-supplied observedAt exactly", () => {
    const custom = "2026-01-02T03:04:05.678Z";
    const doc = generateStatusOverlay(baseInput({ observedAt: custom }));
    expect(doc.observedAt).toBe(custom);
  });

  it("current / no-action projection", () => {
    const doc = generateStatusOverlay(baseInput());
    expect(doc.recommendedNextAction.code).toBe("NO_ACTION");
    expect(doc.recommendedNextAction.gateKind).toBe("NoAction");
    expect(doc.snapshot.autoRefreshCoverage).toBe("COVERED_BY_ENABLED_AUTOMATION_IDLE");
    expect(doc.history.status).toBe("DESIGNED_NOT_IMPLEMENTED");
  });

  it("Draft review projection", () => {
    const doc = generateStatusOverlay(
      baseInput({ openPullRequests: [designDraft(41), designDraft(40)] }),
    );
    expect(doc.recommendedNextAction.code).toBe("REVIEW_DRAFT_PR");
    expect(doc.recommendedNextAction.targets?.pullRequest).toBe(40);
    expect(doc.recommendedNextAction.gateKind).toBe("HumanActionRequired");
  });

  it("Ready merge-decision projection", () => {
    const doc = generateStatusOverlay(baseInput({ openPullRequests: [readyPr(55)] }));
    expect(doc.recommendedNextAction.code).toBe("DECIDE_MERGE_READY_PR");
    expect(doc.recommendedNextAction.status).toBe("READY");
    expect(doc.recommendedNextAction.targets?.pullRequest).toBe(55);
  });

  it("uncovered architecture stale + unrelated DESIGN Draft → maintenance", () => {
    const doc = generateStatusOverlay(
      baseInput({
        snapshot: {
          generatedFrom: from,
          stale: true,
          staleClassification: "stale_architecture_affecting",
          architectureRelevantChanges: ["package.json"],
        },
        handoff: {
          nextActionStatus: "NO_ACTION",
          staleClassification: "stale_architecture_affecting",
        },
        autoRefresh: {
          enabled: false,
          trigger: null,
        },
        openPullRequests: [designDraft(30)],
        historicalDraftOpen: true,
      }),
    );
    expect(doc.recommendedNextAction.code).toBe("MAINTAIN_STALE_SNAPSHOT");
    expect(doc.recommendedNextAction.gateKind).toBe("SystemMaintenanceRequired");
    expect(doc.snapshot.autoRefreshCoverage).toBe("NOT_COVERED");
    expect(doc.autoRefresh.activeRefreshPr).toBeNull();
  });

  it("covered stale + live REFRESH_DRAFT → review Draft (not duplicate refresh)", () => {
    const doc = generateStatusOverlay(
      baseInput({
        snapshot: {
          generatedFrom: from,
          stale: true,
          staleClassification: "stale_architecture_affecting",
          architectureRelevantChanges: ["package.json"],
        },
        handoff: {
          nextActionStatus: "NO_ACTION",
          staleClassification: "stale_architecture_affecting",
        },
        autoRefresh: {
          enabled: true,
          trigger: "push_main+workflow_dispatch",
          lastEvaluation: "ELIGIBLE",
          lastPublicationOutcome: "DRAFT_CREATED",
        },
        openPullRequests: [designDraft(30), refreshDraft(44)],
      }),
    );
    expect(doc.snapshot.autoRefreshCoverage).toBe("COVERED_BY_DRAFT");
    expect(doc.autoRefresh.activeRefreshPr).toBe(44);
    expect(doc.recommendedNextAction.code).toBe("REVIEW_DRAFT_PR");
    expect(doc.recommendedNextAction.targets?.pullRequest).toBe(44);
    expect(
      doc.recommendedNextAction.secondaryContext?.some((s) => s.includes("duplicate refresh")),
    ).toBe(true);
  });

  it("OUTCOME_UNKNOWN priority", () => {
    const doc = generateStatusOverlay(
      baseInput({
        outcomeUnknown: true,
        openPullRequests: [refreshDraft(10), readyPr(11)],
        snapshot: {
          generatedFrom: from,
          stale: true,
          staleClassification: "stale_architecture_affecting",
          architectureRelevantChanges: ["package.json"],
        },
        autoRefresh: { enabled: false },
      }),
    );
    expect(doc.recommendedNextAction.code).toBe("RESOLVE_OUTCOME_UNKNOWN");
  });

  it("safety HOLD priority", () => {
    const doc = generateStatusOverlay(
      baseInput({
        safetyHold: true,
        holdReason: "token scope HOLD",
        openPullRequests: [refreshDraft(12)],
      }),
    );
    expect(doc.recommendedNextAction.code).toBe("RESOLVE_HOLD");
    expect(doc.holds).toContain("token scope HOLD");
  });

  it("UNKNOWN / live-observation failure", () => {
    const doc = generateStatusOverlay(
      baseInput({
        liveObservationFailed: true,
        openPullRequests: [readyPr(13)],
      }),
    );
    expect(doc.recommendedNextAction.code).toBe("UNKNOWN");
    expect(doc.recommendedNextAction.gateKind).toBe("Unknown");
    expect(doc.snapshot.autoRefreshCoverage).toBe("UNKNOWN");
    expect(doc.unknowns).toContain("live_observation_failed");
  });

  it("HISTORY writer absent projects DESIGNED_NOT_IMPLEMENTED", () => {
    const doc = generateStatusOverlay(baseInput());
    expect(doc.history).toEqual({
      status: "DESIGNED_NOT_IMPLEMENTED",
      writerImplemented: false,
      lastEvent: null,
      lastConvergedAt: null,
      refreshLifecycleSummary: null,
    });
  });

  it("authorizesMutation is always false", () => {
    const cases = [
      baseInput(),
      baseInput({ openPullRequests: [designDraft(1)] }),
      baseInput({ openPullRequests: [readyPr(2)] }),
      baseInput({ outcomeUnknown: true }),
      baseInput({
        safetyHold: true,
        holdReason: "hold",
      }),
      baseInput({
        snapshot: {
          generatedFrom: from,
          stale: true,
          staleClassification: "stale_architecture_affecting",
          architectureRelevantChanges: ["package.json"],
        },
        autoRefresh: { enabled: false },
        openPullRequests: [designDraft(3)],
      }),
    ];
    for (const input of cases) {
      expect(generateStatusOverlay(input).recommendedNextAction.authorizesMutation).toBe(false);
    }
  });

  it("does not invent PASS for missing CI/review evidence", () => {
    const doc = generateStatusOverlay(
      baseInput({
        openPullRequests: [
          {
            ...designDraft(9),
            ciState: "",
            reviewState: undefined as unknown as string,
          },
        ],
      }),
    );
    expect(doc.pullRequests[0].ciState).toBe("UNKNOWN");
    expect(doc.pullRequests[0].reviewState).toBe("UNKNOWN");
    expect(doc.unknowns).toContain("pr_9_ciState_UNKNOWN");
    expect(doc.unknowns).toContain("pr_9_reviewState_UNKNOWN");
  });

  it("generator module has no network/filesystem/Date side-effect calls", () => {
    const source = readFileSync(
      new URL("../src/domain/statusOverlayGenerator.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bDate\.now\s*\(/);
    expect(source).not.toMatch(/new\s+Date\s*\(/);
    expect(source).not.toMatch(/from ["']node:fs["']/);
    expect(source).not.toMatch(/from ["']fs["']/);
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/@octokit|octokit/);
  });

  it("rejects nonexistent activeRefreshPr override and falls back to live REFRESH_DRAFT", () => {
    const prs = [refreshDraft(44)];
    expect(
      resolveActiveRefreshPr({ openPullRequests: prs, override: 999 }),
    ).toEqual({ activeRefreshPr: 44, overrideRejected: true });

    const doc = generateStatusOverlay(
      baseInput({
        snapshot: {
          generatedFrom: from,
          stale: true,
          staleClassification: "stale_architecture_affecting",
          architectureRelevantChanges: ["package.json"],
        },
        autoRefresh: {
          enabled: true,
          activeRefreshPr: 999,
        },
        openPullRequests: prs,
      }),
    );
    expect(doc.autoRefresh.activeRefreshPr).toBe(44);
    expect(doc.snapshot.autoRefreshCoverage).toBe("COVERED_BY_DRAFT");
    expect(doc.recommendedNextAction.code).toBe("REVIEW_DRAFT_PR");
    expect(doc.recommendedNextAction.targets?.pullRequest).toBe(44);
    expect(doc.unknowns).toContain("activeRefreshPr_override_rejected");
  });

  it("rejects DESIGN/OTHER Draft override while live REFRESH_DRAFT exists", () => {
    const prs = [designDraft(30), refreshDraft(44)];
    expect(
      resolveActiveRefreshPr({ openPullRequests: prs, override: 30 }),
    ).toEqual({ activeRefreshPr: 44, overrideRejected: true });

    const doc = generateStatusOverlay(
      baseInput({
        snapshot: {
          generatedFrom: from,
          stale: true,
          staleClassification: "stale_architecture_affecting",
          architectureRelevantChanges: ["package.json"],
        },
        autoRefresh: {
          enabled: true,
          activeRefreshPr: 30,
        },
        openPullRequests: prs,
      }),
    );
    expect(doc.autoRefresh.activeRefreshPr).toBe(44);
    expect(doc.snapshot.autoRefreshCoverage).toBe("COVERED_BY_DRAFT");
    expect(doc.recommendedNextAction.targets?.pullRequest).toBe(44);
    expect(doc.unknowns).toContain("activeRefreshPr_override_rejected");
  });

  it("accepts valid activeRefreshPr override pointing to live REFRESH_DRAFT", () => {
    const prs = [refreshDraft(44), refreshDraft(50)];
    expect(
      resolveActiveRefreshPr({ openPullRequests: prs, override: 50 }),
    ).toEqual({ activeRefreshPr: 50, overrideRejected: false });

    const doc = generateStatusOverlay(
      baseInput({
        snapshot: {
          generatedFrom: from,
          stale: true,
          staleClassification: "stale_architecture_affecting",
          architectureRelevantChanges: ["package.json"],
        },
        autoRefresh: {
          enabled: true,
          activeRefreshPr: 50,
        },
        openPullRequests: prs,
      }),
    );
    expect(doc.autoRefresh.activeRefreshPr).toBe(50);
    expect(doc.snapshot.autoRefreshCoverage).toBe("COVERED_BY_DRAFT");
    expect(doc.recommendedNextAction.code).toBe("REVIEW_DRAFT_PR");
    expect(doc.recommendedNextAction.targets?.pullRequest).toBe(50);
    expect(doc.unknowns).not.toContain("activeRefreshPr_override_rejected");
  });
});
