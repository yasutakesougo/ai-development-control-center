import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateStatusOverlay } from "../src/domain/statusOverlayGenerator";
import {
  STATUS_OVERLAY_OBSERVER_FORBIDDEN_CLIENT_METHODS,
  STATUS_OVERLAY_OBSERVER_IMPLEMENTED,
  classifyOverlayPullRequest,
  createStatusOverlayGithubHttpClient,
  observeStatusOverlayGithub,
  projectObservedPull,
  type StatusOverlayLocalObservation,
  type StatusOverlayObservedPull,
  type StatusOverlayObservedWorkflowRun,
  type StatusOverlayReadonlyGithubClient,
} from "../src/observer/statusOverlayGithubObserver";

const repo = "yasutakesougo/ai-development-control-center";
const main = "9877e5e89ec1fdc8d0e79bd89a108d5e24f834ed";
const from = "78a72b13965d7b4fc4ce021d0aaa08a40eb17aa0";
const observedAt = "2026-08-12T04:50:00.000Z";

const enabledWorkflowYaml = `
name: architecture-auto-refresh
on:
  push:
    branches:
      - main
  workflow_dispatch:
concurrency:
  group: architecture-auto-refresh-\${{ github.repository }}-main
  cancel-in-progress: true
permissions:
  contents: write
  pull-requests: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps: []
`;

function local(
  partial: Partial<StatusOverlayLocalObservation> = {},
): StatusOverlayLocalObservation {
  return {
    snapshotGeneratedFrom: from,
    snapshotStale: false,
    snapshotStaleClassification: "current",
    architectureRelevantChanges: [],
    handoffNextActionStatus: "NO_ACTION",
    handoffStaleClassification: "current",
    persistentWorkflowYaml: enabledWorkflowYaml,
    ...partial,
  };
}

function fakeClient(input: {
  mainSha?: string;
  pulls?: StatusOverlayObservedPull[];
  runs?: StatusOverlayObservedWorkflowRun[];
  failTip?: boolean;
  failRuns?: boolean;
}): StatusOverlayReadonlyGithubClient {
  return {
    async getDefaultBranchTip() {
      if (input.failTip) throw new Error("tip failed");
      return { defaultBranch: "main", sha: input.mainSha ?? main };
    },
    async listOpenPullRequests() {
      return [...(input.pulls ?? [])];
    },
    async listWorkflowRuns() {
      if (input.failRuns) throw new Error("runs failed");
      return [...(input.runs ?? [])];
    },
  };
}

describe("STATUS-OVERLAY-V1 GitHub / workflow observer", () => {
  it("marks observer implemented", () => {
    expect(STATUS_OVERLAY_OBSERVER_IMPLEMENTED).toBe(true);
  });

  it("observes current main", async () => {
    const input = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({ mainSha: main }),
      local: local(),
      now: () => observedAt,
    });
    expect(input.currentMain).toBe(main);
    expect(input.observedAt).toBe(observedAt);
    expect(input.liveObservationFailed).toBe(false);
  });

  it("projects Draft and Ready PRs with deterministic ordering", async () => {
    const pulls: StatusOverlayObservedPull[] = [
      {
        number: 40,
        title: "feat: ready work",
        draft: false,
        mergeable: true,
        headSha: "r1",
        baseRef: "main",
        headRef: "feat/ready",
        ciState: "PASS",
        reviewState: "PASS",
      },
      {
        number: 30,
        title: "docs(status): design STATUS-OVERLAY-V1",
        draft: true,
        headSha: "d1",
        baseRef: "main",
        headRef: "cursor/status-overlay-v1-design-2c83",
      },
    ];
    const input = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({ pulls }),
      local: local(),
      now: () => observedAt,
    });
    expect(input.openPullRequests?.map((p) => p.number)).toEqual([30, 40]);
    expect(input.openPullRequests?.[0].draft).toBe(true);
    expect(input.openPullRequests?.[1].draft).toBe(false);
  });

  it("classifies REFRESH_DRAFT vs DESIGN vs OTHER", () => {
    expect(
      classifyOverlayPullRequest({
        draft: true,
        title: "docs(architecture): refresh Snapshot after enablement",
        headRef: "cursor/auto-refresh-followup-2c83",
      }),
    ).toBe("REFRESH_DRAFT");
    expect(
      classifyOverlayPullRequest({
        draft: true,
        title: "docs(status): design STATUS-OVERLAY-V1",
        headRef: "cursor/status-overlay-v1-design-2c83",
      }),
    ).toBe("DESIGN");
    expect(
      classifyOverlayPullRequest({
        draft: false,
        title: "chore: bump deps",
        headRef: "chore/deps",
      }),
    ).toBe("OTHER");
  });

  it("missing CI and review become UNKNOWN", () => {
    const projected = projectObservedPull({
      number: 9,
      title: "docs(status): design X",
      draft: true,
      headRef: "cursor/x-design-2c83",
      ciState: null,
      reviewState: undefined,
    });
    expect(projected.ciState).toBe("UNKNOWN");
    expect(projected.reviewState).toBe("UNKNOWN");
  });

  it("workflow API read failure → observation UNKNOWN, not OUTCOME_UNKNOWN", async () => {
    const input = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({
        failRuns: true,
        pulls: [
          {
            number: 30,
            title: "docs(status): design STATUS-OVERLAY-V1",
            draft: true,
            headRef: "cursor/status-overlay-v1-design-2c83",
          },
        ],
      }),
      local: local(),
      now: () => observedAt,
    });
    expect(input.unknowns).toContain("workflow_state_UNKNOWN");
    expect(input.workflowObservationFailed).toBe(true);
    expect(input.outcomeUnknown).toBeFalsy();
    expect(input.autoRefresh.lastRunConclusion).toBe("UNKNOWN");

    const doc = generateStatusOverlay(input);
    expect(doc.recommendedNextAction.code).toBe("UNKNOWN");
    expect(doc.recommendedNextAction.code).not.toBe("RESOLVE_OUTCOME_UNKNOWN");
    expect(doc.recommendedNextAction.status).toBe("UNKNOWN");
    expect(doc.recommendedNextAction.gateKind).toBe("Unknown");
    // Must not upgrade to Draft review / NO_ACTION while workflow evidence is unavailable.
    expect(doc.recommendedNextAction.code).not.toBe("REVIEW_DRAFT_PR");
    expect(doc.recommendedNextAction.code).not.toBe("NO_ACTION");
  });

  it("completed run with missing conclusion → OUTCOME_UNKNOWN", async () => {
    const input = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({
        mainSha: main,
        runs: [
          {
            id: "31569999999",
            status: "completed",
            conclusion: null,
            headSha: main,
          },
        ],
      }),
      local: local(),
      now: () => observedAt,
    });
    expect(input.workflowObservationFailed).toBeFalsy();
    expect(input.outcomeUnknown).toBe(true);
    expect(input.autoRefresh.lastRunId).toBe("31569999999");
    expect(input.autoRefresh.lastRunConclusion).toBe("UNKNOWN");

    const doc = generateStatusOverlay(input);
    expect(doc.recommendedNextAction.code).toBe("RESOLVE_OUTCOME_UNKNOWN");
    expect(doc.recommendedNextAction.status).toBe("OUTCOME_UNKNOWN");
  });

  it("old successful workflow run does not prove freshness after main moves", async () => {
    const input = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({
        mainSha: main,
        runs: [
          {
            id: "111",
            status: "completed",
            conclusion: "success",
            headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            lastEvaluation: "NOT_REQUIRED",
            lastPublicationOutcome: "NO_PUBLICATION",
          },
        ],
      }),
      local: local(),
      now: () => observedAt,
    });
    expect(input.autoRefresh.lastRunId).toBe("111");
    expect(input.autoRefresh.lastRunConclusion).toBe("success");
    expect(input.unknowns).toContain("workflow_run_not_on_current_main");
    // Still surface observed evaluation strings, but generator freshness helper
    // and unknowns make clear the run is not current-main proof.
    const doc = generateStatusOverlay(input);
    expect(doc.recommendedNextAction.authorizesMutation).toBe(false);
  });

  it("identifies valid active refresh Draft and rejects stale historical reference", async () => {
    const pulls: StatusOverlayObservedPull[] = [
      {
        number: 44,
        title: "docs(architecture): refresh Snapshot",
        draft: true,
        headRef: "cursor/auto-refresh-followup-2c83",
        headSha: "bbbb",
        baseRef: "main",
      },
      {
        number: 30,
        title: "docs(status): design STATUS-OVERLAY-V1",
        draft: true,
        headRef: "cursor/status-overlay-v1-design-2c83",
        headSha: "cccc",
        baseRef: "main",
      },
    ];
    const valid = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({ pulls }),
      local: local(),
      now: () => observedAt,
    });
    expect(valid.autoRefresh.activeRefreshPr).toBe(44);

    const rejected = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({ pulls }),
      local: local({ historicalActiveRefreshPr: 999 }),
      now: () => observedAt,
    });
    expect(rejected.autoRefresh.activeRefreshPr).toBe(44);
    expect(rejected.unknowns).toContain("activeRefreshPr_override_rejected");
  });

  it("observer read failure → liveObservationFailed=true and UNKNOWN overlay", async () => {
    const input = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({ failTip: true }),
      local: local(),
      now: () => observedAt,
    });
    expect(input.liveObservationFailed).toBe(true);
    expect(input.unknowns).toContain("live_observation_failed");
    const doc = generateStatusOverlay(input);
    expect(doc.recommendedNextAction.code).toBe("UNKNOWN");
    expect(doc.recommendedNextAction.gateKind).toBe("Unknown");
  });

  it("generated input → expected Runtime Generator outputs", async () => {
    const currentInput = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({
        runs: [
          {
            id: "200",
            status: "completed",
            conclusion: "success",
            headSha: main,
            lastEvaluation: "NOT_REQUIRED",
            lastPublicationOutcome: "NO_PUBLICATION",
          },
        ],
      }),
      local: local(),
      now: () => observedAt,
    });
    expect(generateStatusOverlay(currentInput).recommendedNextAction.code).toBe("NO_ACTION");

    const draftInput = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({
        pulls: [
          {
            number: 41,
            title: "docs(status): design STATUS-OVERLAY-V1",
            draft: true,
            headRef: "cursor/status-overlay-v1-design-2c83",
          },
        ],
      }),
      local: local(),
      now: () => observedAt,
    });
    expect(generateStatusOverlay(draftInput).recommendedNextAction.code).toBe(
      "REVIEW_DRAFT_PR",
    );

    const staleInput = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({
        pulls: [
          {
            number: 41,
            title: "docs(status): design STATUS-OVERLAY-V1",
            draft: true,
            headRef: "cursor/status-overlay-v1-design-2c83",
          },
        ],
      }),
      local: local({
        snapshotStale: true,
        snapshotStaleClassification: "stale_architecture_affecting",
        architectureRelevantChanges: ["package.json"],
        handoffStaleClassification: "stale_architecture_affecting",
        persistentWorkflowYaml: "name: x\non:\n  workflow_dispatch:\n",
      }),
      now: () => observedAt,
    });
    // workflow yaml without push_main → enabled false via inspection
    expect(staleInput.autoRefresh.enabled).toBe(false);
    expect(generateStatusOverlay(staleInput).recommendedNextAction.code).toBe(
      "MAINTAIN_STALE_SNAPSHOT",
    );
  });

  it("preserves observedAt exactly across generator", async () => {
    const input = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({}),
      local: local(),
      now: () => "2026-02-03T04:05:06.789Z",
    });
    expect(generateStatusOverlay(input).observedAt).toBe("2026-02-03T04:05:06.789Z");
  });

  it("recommendation never authorizes mutation", async () => {
    const input = await observeStatusOverlayGithub({
      repository: repo,
      client: fakeClient({
        pulls: [
          {
            number: 1,
            title: "docs(architecture): refresh Snapshot",
            draft: true,
            headRef: "cursor/auto-refresh-x-2c83",
          },
        ],
      }),
      local: local(),
      now: () => observedAt,
    });
    expect(generateStatusOverlay(input).recommendedNextAction.authorizesMutation).toBe(
      false,
    );
  });

  it("observer path has no mutation methods on client interface / HTTP factory", () => {
    const source = readFileSync(
      new URL("../src/observer/statusOverlayGithubObserver.ts", import.meta.url),
      "utf8",
    );
    const types = readFileSync(
      new URL("../src/observer/statusOverlayObservationTypes.ts", import.meta.url),
      "utf8",
    );
    // Interface surface is GET-only.
    expect(types).toMatch(/getDefaultBranchTip/);
    expect(types).toMatch(/listOpenPullRequests/);
    expect(types).toMatch(/listWorkflowRuns/);
    for (const method of STATUS_OVERLAY_OBSERVER_FORBIDDEN_CLIENT_METHODS) {
      expect(types).not.toMatch(new RegExp(`\\b${method}\\s*\\(`));
      expect(source).not.toMatch(new RegExp(`\\basync\\s+${method}\\s*\\(`));
      expect(source).not.toMatch(new RegExp(`\\b${method}\\s*:\\s*async\\b`));
    }
    expect(source).toMatch(/method:\s*["']GET["']/);
    expect(source).not.toMatch(/method:\s*["']POST["']/);
    expect(source).not.toMatch(/method:\s*["']PATCH["']/);
    expect(source).not.toMatch(/method:\s*["']PUT["']/);
    expect(source).not.toMatch(/method:\s*["']DELETE["']/);

    const client = createStatusOverlayGithubHttpClient({});
    expect(Object.keys(client).sort()).toEqual([
      "getDefaultBranchTip",
      "listOpenPullRequests",
      "listWorkflowRuns",
    ].sort());
    const clientRecord = client as unknown as Record<string, unknown>;
    for (const method of STATUS_OVERLAY_OBSERVER_FORBIDDEN_CLIENT_METHODS) {
      expect(typeof clientRecord[method]).not.toBe("function");
    }
  });

  it("repeated observation is equivalent except observedAt", async () => {
    const client = fakeClient({
      pulls: [
        {
          number: 5,
          title: "docs(status): design X",
          draft: true,
          headRef: "cursor/x-design-2c83",
        },
      ],
      runs: [
        {
          id: "9",
          status: "completed",
          conclusion: "success",
          headSha: main,
          lastEvaluation: "NOT_REQUIRED",
        },
      ],
    });
    const a = await observeStatusOverlayGithub({
      repository: repo,
      client,
      local: local(),
      now: () => "2026-08-12T04:50:00.000Z",
    });
    const b = await observeStatusOverlayGithub({
      repository: repo,
      client,
      local: local(),
      now: () => "2026-08-12T04:51:00.000Z",
    });
    const { observedAt: _a, ...restA } = a;
    const { observedAt: _b, ...restB } = b;
    expect(restA).toEqual(restB);
    expect(_a).not.toBe(_b);
  });
});
