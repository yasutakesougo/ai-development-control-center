import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STATUS_OVERLAY_MARKDOWN_SECTIONS,
  STATUS_OVERLAY_UI_IMPLEMENTED,
  type StatusOverlayDocument,
  type StatusOverlayPullRequest,
} from "../src/domain/statusOverlayContract";
import {
  generateStatusOverlay,
  type StatusOverlayGeneratorInput,
} from "../src/domain/statusOverlayGenerator";
import {
  buildStatusOverlayViewModel,
  renderStatusOverlayMarkdown,
} from "../src/ui/statusOverlayViewModel";

const repo = "yasutakesougo/ai-development-control-center";
const observedAt = "2026-08-12T05:00:00.000Z";
const main = "58064f0fa7c99a6f9f6492095db4ef87c9cab553";
const from = "78a72b13965d7b4fc4ce021d0aaa08a40eb17aa0";

function designDraft(n: number): StatusOverlayPullRequest {
  return {
    number: n,
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
    title: "ready work",
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

function docFrom(partial: Partial<StatusOverlayGeneratorInput> = {}): StatusOverlayDocument {
  return generateStatusOverlay({
    repository: repo,
    observedAt,
    currentMain: main,
    snapshot: {
      generatedFrom: from,
      stale: false,
      staleClassification: "current",
      architectureRelevantChanges: [],
    },
    handoff: { nextActionStatus: "NO_ACTION", staleClassification: "current" },
    autoRefresh: {
      enabled: true,
      trigger: "push_main+workflow_dispatch",
      lastRunId: "1",
      lastRunConclusion: "success",
      lastEvaluation: "NOT_REQUIRED",
      lastPublicationOutcome: "NO_PUBLICATION",
    },
    openPullRequests: [],
    ...partial,
  });
}

describe("STATUS-OVERLAY-V1 UI projection", () => {
  it("marks UI implemented", () => {
    expect(STATUS_OVERLAY_UI_IMPLEMENTED).toBe(true);
    expect(STATUS_OVERLAY_MARKDOWN_SECTIONS).toEqual([
      "CURRENT",
      "GATE",
      "NEXT",
      "AUTOMATION",
      "HOLDS",
      "UNKNOWNS",
      "PRS",
    ]);
  });

  it("CURRENT / NO_ACTION", () => {
    const doc = docFrom({});
    const vm = buildStatusOverlayViewModel(doc);
    expect(vm.next.code).toBe("NO_ACTION");
    expect(vm.next.tone).toBe("current");
    expect(vm.gate.kind).toBe("NoAction");
    expect(vm.current.snapshotLabel).toBe("CURRENT");
    expect(vm.holds.empty).toBe(true);
    expect(vm.holds.emptyLabel).toBe("none");
    expect(vm.unknowns.empty).toBe(true);
    expect(vm.unknowns.emptyLabel).toBe("none");
  });

  it("Draft review", () => {
    const vm = buildStatusOverlayViewModel(
      docFrom({ openPullRequests: [designDraft(41)] }),
    );
    expect(vm.next.code).toBe("REVIEW_DRAFT_PR");
    expect(vm.gate.kind).toBe("HumanActionRequired");
    expect(vm.gate.kindLabel).toBe("Human action required");
    expect(vm.next.targetPr).toBe(41);
    expect(vm.next.targetPrUrl).toBe(`https://github.com/${repo}/pull/41`);
  });

  it("Ready merge-decision", () => {
    const vm = buildStatusOverlayViewModel(docFrom({ openPullRequests: [readyPr(55)] }));
    expect(vm.next.code).toBe("DECIDE_MERGE_READY_PR");
    expect(vm.next.status).toBe("READY");
    expect(vm.next.tone).toBe("ready");
    expect(vm.next.targetPr).toBe(55);
  });

  it("SystemMaintenanceRequired stale Snapshot", () => {
    const vm = buildStatusOverlayViewModel(
      docFrom({
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
        autoRefresh: { enabled: false },
        openPullRequests: [designDraft(30)],
      }),
    );
    expect(vm.next.code).toBe("MAINTAIN_STALE_SNAPSHOT");
    expect(vm.gate.kind).toBe("SystemMaintenanceRequired");
    expect(vm.gate.kindLabel).toBe("System maintenance required");
    expect(vm.gate.tone).toBe("maintenance");
    expect(vm.current.snapshotLabel).toBe("STALE");
    expect(vm.current.tone).toBe("stale");
  });

  it("HOLD is not downplayed as success", () => {
    const vm = buildStatusOverlayViewModel(
      docFrom({ safetyHold: true, holdReason: "token scope HOLD" }),
    );
    expect(vm.next.code).toBe("RESOLVE_HOLD");
    expect(vm.next.tone).toBe("hold");
    expect(vm.holds.items).toContain("token scope HOLD");
    expect(vm.holds.tone).toBe("hold");
    expect(vm.next.tone).not.toBe("current");
  });

  it("OUTCOME_UNKNOWN is distinct", () => {
    const vm = buildStatusOverlayViewModel(docFrom({ outcomeUnknown: true }));
    expect(vm.next.code).toBe("RESOLVE_OUTCOME_UNKNOWN");
    expect(vm.next.status).toBe("OUTCOME_UNKNOWN");
    expect(vm.next.tone).toBe("outcome-unknown");
    expect(vm.next.tone).not.toBe("current");
  });

  it("FAILED automation", () => {
    const vm = buildStatusOverlayViewModel(docFrom({ automationFailed: true }));
    expect(vm.next.code).toBe("REVIEW_FAILED_AUTOMATION");
    expect(vm.next.status).toBe("FAILED");
    expect(vm.next.tone).toBe("failed");
  });

  it("observation UNKNOWN", () => {
    const vm = buildStatusOverlayViewModel(docFrom({ liveObservationFailed: true }));
    expect(vm.next.code).toBe("UNKNOWN");
    expect(vm.next.tone).toBe("unknown");
    expect(vm.gate.kind).toBe("Unknown");
    expect(vm.gate.tone).toBe("unknown");
  });

  it("workflow observation UNKNOWN", () => {
    const vm = buildStatusOverlayViewModel(
      docFrom({
        workflowObservationFailed: true,
        openPullRequests: [designDraft(30)],
      }),
    );
    expect(vm.next.code).toBe("UNKNOWN");
    expect(vm.next.tone).toBe("unknown");
    expect(vm.next.code).not.toBe("RESOLVE_OUTCOME_UNKNOWN");
    expect(vm.next.code).not.toBe("REVIEW_DRAFT_PR");
  });

  it("active refresh Draft", () => {
    const vm = buildStatusOverlayViewModel(
      docFrom({
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
          activeRefreshPr: 44,
          lastPublicationOutcome: "DRAFT_CREATED",
        },
        openPullRequests: [designDraft(30), refreshDraft(44)],
      }),
    );
    expect(vm.automation.activeRefreshPr).toBe(44);
    expect(vm.automation.activeRefreshPrUrl).toBe(`https://github.com/${repo}/pull/44`);
    expect(vm.pullRequests.find((p) => p.number === 44)?.isActiveRefresh).toBe(true);
    expect(vm.next.code).toBe("REVIEW_DRAFT_PR");
    expect(vm.next.targetPr).toBe(44);
  });

  it("authorizesMutation is always false and visible in markdown", () => {
    const doc = docFrom({ openPullRequests: [readyPr(9)] });
    const vm = buildStatusOverlayViewModel(doc);
    expect(vm.next.authorizesMutation).toBe(false);
    const md = renderStatusOverlayMarkdown(doc);
    expect(md).toContain("authorizesMutation: false");
    expect(md).toContain("Recommendation does not authorize mutation");
  });

  it("deterministic view-model and markdown for identical document", () => {
    const doc = docFrom({
      openPullRequests: [designDraft(12), readyPr(13)],
      unknowns: ["sample_unknown"],
      holds: ["sample_hold"],
    });
    expect(buildStatusOverlayViewModel(doc)).toEqual(buildStatusOverlayViewModel(doc));
    expect(renderStatusOverlayMarkdown(doc)).toBe(renderStatusOverlayMarkdown(doc));
    const md = renderStatusOverlayMarkdown(doc);
    expect(md.indexOf("## CURRENT")).toBeLessThan(md.indexOf("## GATE"));
    expect(md.indexOf("## GATE")).toBeLessThan(md.indexOf("## NEXT"));
    expect(md.indexOf("## NEXT")).toBeLessThan(md.indexOf("## AUTOMATION"));
    expect(md.indexOf("## HOLDS")).toBeLessThan(md.indexOf("## UNKNOWNS"));
    expect(md).toContain("- sample_hold");
    expect(md).toContain("- sample_unknown");
  });

  it("empty holds / unknowns render explicit none", () => {
    const md = renderStatusOverlayMarkdown(docFrom({}));
    expect(md).toMatch(/## HOLDS\n- none/);
    expect(md).toMatch(/## UNKNOWNS\n- none/);
  });

  it("UI modules have no mutation controls or mutation client imports", () => {
    const viewModel = readFileSync(
      new URL("../src/ui/statusOverlayViewModel.ts", import.meta.url),
      "utf8",
    );
    const panel = readFileSync(
      new URL("../src/ui/StatusOverlayPanel.tsx", import.meta.url),
      "utf8",
    );
    for (const source of [viewModel, panel]) {
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/\bDate\.now\s*\(/);
      expect(source).not.toMatch(/new\s+Date\s*\(/);
      expect(source).not.toMatch(/postLedgerRecord|ledgerApi|ActionGateway|octokit/i);
      expect(source).not.toMatch(/observeStatusOverlayGithub/);
      expect(source).not.toMatch(/<button/i);
      expect(source).not.toMatch(/\bonClick\b/);
      expect(source).not.toMatch(/Ready|Merge|createPullRequest/);
    }
  });
});
