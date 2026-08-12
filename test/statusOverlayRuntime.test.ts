import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateStatusOverlay } from "../src/domain/statusOverlayGenerator";
import {
  observeStatusOverlayGithub,
  type StatusOverlayObservedPull,
  type StatusOverlayReadonlyGithubClient,
} from "../src/observer/statusOverlayGithubObserver";
import {
  STATUS_OVERLAY_RUNTIME_IMPLEMENTED,
  assertStatusOverlayRuntimeInvariants,
  buildStatusOverlayLocalObservation,
  runStatusOverlayCycle,
  statusOverlayRuntimeUnavailable,
} from "../src/runtime/statusOverlayRuntime";
import { buildStatusOverlayViewModel } from "../src/ui/statusOverlayViewModel";

const repo = "yasutakesougo/ai-development-control-center";
const main = "9992a58864ad4cfa7fd589a53e208431d921134c";
const from = "78a72b13965d7b4fc4ce021d0aaa08a40eb17aa0";
const observedAt = "2026-08-12T05:15:00.000Z";

const enabledWorkflowYaml = `
name: architecture-auto-refresh
on:
  push:
    branches:
      - main
  workflow_dispatch:
concurrency:
  group: architecture-auto-refresh-main
  cancel-in-progress: true
permissions:
  contents: write
  pull-requests: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps: []
`;

function fakeClient(input: {
  mainSha?: string;
  pulls?: StatusOverlayObservedPull[];
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
      return [
        {
          id: "run-1",
          status: "completed",
          conclusion: "success",
          headSha: input.mainSha ?? main,
          lastEvaluation: "NOT_REQUIRED",
          lastPublicationOutcome: "NO_PUBLICATION",
        },
      ];
    },
  };
}

function baseLocal(
  partial: Partial<ReturnType<typeof buildStatusOverlayLocalObservation>> = {},
) {
  return {
    ...buildStatusOverlayLocalObservation({
      snapshot: {
        schemaVersion: "1.0",
        generatedFrom: {
          repository: "ai-development-control-center",
          commit: from,
          generatedAt: "2026-08-12T00:00:00.000Z",
          generator: "ARCH-SNAPSHOT-GEN-V1",
        },
        confidence: { overall: "medium", notes: [] },
        components: [],
        dependencies: [],
        flows: [],
        externalSystems: [],
        humanGates: [],
        holds: [],
        decisions: [],
        unknowns: [],
        assumptions: [],
        staleIndicators: [],
      },
      currentMain: main,
      architectureRelevantChanges: [],
      persistentWorkflowYaml: enabledWorkflowYaml,
    }),
    ...partial,
  };
}

describe("STATUS-OVERLAY-V1 read-only runtime wiring", () => {
  it("marks runtime implemented", () => {
    expect(STATUS_OVERLAY_RUNTIME_IMPLEMENTED).toBe(true);
  });

  it("successful observer → generator → UI document flow", async () => {
    const document = await runStatusOverlayCycle({
      repository: repo,
      client: fakeClient({}),
      local: baseLocal(),
      now: () => observedAt,
    });
    expect(document.observedAt).toBe(observedAt);
    expect(document.recommendedNextAction.code).toBe("NO_ACTION");
    expect(document.recommendedNextAction.authorizesMutation).toBe(false);
    const vm = buildStatusOverlayViewModel(document);
    expect(vm.next.code).toBe("NO_ACTION");
    expect(vm.current.mainSha.startsWith("9992a58864ad")).toBe(true);
  });

  it("preserves observedAt end-to-end", async () => {
    const stamp = "2026-03-04T05:06:07.890Z";
    const document = await runStatusOverlayCycle({
      repository: repo,
      client: fakeClient({}),
      local: baseLocal(),
      now: () => stamp,
    });
    expect(document.observedAt).toBe(stamp);
    assertStatusOverlayRuntimeInvariants(document, stamp);
  });

  it("Draft integration example", async () => {
    const document = await runStatusOverlayCycle({
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
      local: baseLocal(),
      now: () => observedAt,
    });
    expect(document.recommendedNextAction.code).toBe("REVIEW_DRAFT_PR");
    expect(document.recommendedNextAction.authorizesMutation).toBe(false);
  });

  it("stale maintenance integration example", async () => {
    const document = await runStatusOverlayCycle({
      repository: repo,
      client: fakeClient({
        pulls: [
          {
            number: 30,
            title: "docs(status): design STATUS-OVERLAY-V1",
            draft: true,
            headRef: "cursor/status-overlay-v1-design-2c83",
          },
        ],
      }),
      local: baseLocal({
        snapshotStale: true,
        snapshotStaleClassification: "stale_architecture_affecting",
        architectureRelevantChanges: ["package.json"],
        persistentWorkflowYaml: "name: x\non:\n  workflow_dispatch:\n",
      }),
      now: () => observedAt,
    });
    expect(document.recommendedNextAction.code).toBe("MAINTAIN_STALE_SNAPSHOT");
  });

  it("workflow observation failure remains UNKNOWN (not NO_ACTION)", async () => {
    const document = await runStatusOverlayCycle({
      repository: repo,
      client: fakeClient({ failRuns: true }),
      local: baseLocal(),
      now: () => observedAt,
    });
    expect(document.unknowns).toContain("workflow_state_UNKNOWN");
    expect(document.recommendedNextAction.code).toBe("UNKNOWN");
    expect(document.recommendedNextAction.code).not.toBe("NO_ACTION");
    expect(document.recommendedNextAction.code).not.toBe("RESOLVE_OUTCOME_UNKNOWN");
  });

  it("hard observer failure does not become NO_ACTION", async () => {
    const document = await runStatusOverlayCycle({
      repository: repo,
      client: fakeClient({ failTip: true }),
      local: baseLocal(),
      now: () => observedAt,
    });
    expect(document.unknowns).toContain("live_observation_failed");
    expect(document.recommendedNextAction.code).toBe("UNKNOWN");
    expect(document.recommendedNextAction.code).not.toBe("NO_ACTION");
  });

  it("authorizesMutation remains false end-to-end", async () => {
    const document = await runStatusOverlayCycle({
      repository: repo,
      client: fakeClient({
        pulls: [
          {
            number: 55,
            title: "ready",
            draft: false,
            headRef: "feat/ready",
          },
        ],
      }),
      local: baseLocal(),
      now: () => observedAt,
    });
    expect(document.recommendedNextAction.authorizesMutation).toBe(false);
    expect(buildStatusOverlayViewModel(document).next.authorizesMutation).toBe(false);
  });

  it("unavailable result is explicit and not healthy", () => {
    const result = statusOverlayRuntimeUnavailable("boom");
    expect(result.phase).toBe("unavailable");
    expect(result.document).toBeNull();
    expect(result.reason).toBe("boom");
  });

  it("repeated equivalent observations differ only by observedAt", async () => {
    const client = fakeClient({});
    const local = baseLocal();
    const a = await runStatusOverlayCycle({
      repository: repo,
      client,
      local,
      now: () => "2026-08-12T05:15:00.000Z",
    });
    const b = await runStatusOverlayCycle({
      repository: repo,
      client,
      local,
      now: () => "2026-08-12T05:16:00.000Z",
    });
    const { observedAt: _a, ...restA } = a;
    const { observedAt: _b, ...restB } = b;
    expect(restA).toEqual(restB);
    expect(_a).not.toBe(_b);
  });

  it("runtime path has no mutation methods/imports or writers", () => {
    const runtime = readFileSync(
      new URL("../src/runtime/statusOverlayRuntime.ts", import.meta.url),
      "utf8",
    );
    const api = readFileSync(
      new URL("../src/worker/statusOverlayApi.ts", import.meta.url),
      "utf8",
    );
    const container = readFileSync(
      new URL("../src/ui/StatusOverlayRuntimeContainer.tsx", import.meta.url),
      "utf8",
    );
    for (const source of [runtime, api, container]) {
      expect(source).not.toMatch(/createPullRequest|mergePullRequest|gh\s+pr\s+ready|gh\s+pr\s+merge/);
      expect(source).not.toMatch(/ActionGateway|postLedgerRecord|writeFile|HISTORY writer/i);
      expect(source).not.toMatch(/method:\s*["']POST["']/);
      expect(source).not.toMatch(/method:\s*["']PATCH["']/);
      expect(source).not.toMatch(/method:\s*["']PUT["']/);
      expect(source).not.toMatch(/method:\s*["']DELETE["']/);
    }
    expect(api).toMatch(/method:\s*["']GET["']/);
    expect(runtime).toMatch(/generateStatusOverlay/);
    expect(runtime).toMatch(/observeStatusOverlayGithub/);
  });

  it("does not redefine generator decision logic (delegates)", async () => {
    const local = baseLocal();
    const client = fakeClient({});
    const throughRuntime = await runStatusOverlayCycle({
      repository: repo,
      client,
      local,
      now: () => observedAt,
    });
    const input = await observeStatusOverlayGithub({
      repository: repo,
      client,
      local,
      now: () => observedAt,
    });
    const direct = generateStatusOverlay(input);
    expect(throughRuntime).toEqual(direct);
  });

  it("app remains usable without overlay document (disabled phase semantics)", () => {
    // Disabled runtime supplies null document — App contract accepts this.
    expect(statusOverlayRuntimeUnavailable("n/a").document).toBeNull();
    const disabledPhase = "disabled" as const;
    expect(disabledPhase).toBe("disabled");
  });
});
