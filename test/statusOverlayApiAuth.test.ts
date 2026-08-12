import { describe, expect, it, vi } from "vitest";
import type { StatusOverlayDocument } from "../src/domain/statusOverlayContract";
import type { StatusOverlayReadonlyGithubClient } from "../src/observer/statusOverlayGithubObserver";
import {
  STATUS_OVERLAY_DEFAULT_REPOSITORY,
  statusOverlayRuntimeUnavailable,
} from "../src/runtime/statusOverlayRuntime";
import {
  STATUS_OVERLAY_PUBLIC_REPOSITORY,
  handleStatusOverlayGet,
  resolveUnauthenticatedStatusOverlayRepository,
} from "../src/worker/statusOverlayApi";

const main = "9992a58864ad4cfa7fd589a53e208431d921134c";

function sampleDocument(
  partial: Partial<StatusOverlayDocument> = {},
): StatusOverlayDocument {
  return {
    schemaVersion: "STATUS-OVERLAY-V1",
    repository: STATUS_OVERLAY_PUBLIC_REPOSITORY,
    observedAt: "2026-08-12T05:20:00.000Z",
    main: { sha: main },
    snapshot: {
      generatedFrom: main,
      currentMain: main,
      stale: false,
      staleClassification: "current",
      architectureRelevantChanges: [],
      autoRefreshCoverage: "COVERED_BY_ENABLED_AUTOMATION_IDLE",
    },
    handoff: {
      nextActionStatus: "NO_ACTION",
      staleClassification: "current",
    },
    autoRefresh: {
      enabled: true,
      trigger: "push_main+workflow_dispatch",
      lastRunId: "1",
      lastRunConclusion: "success",
      lastEvaluation: "NOT_REQUIRED",
      lastPublicationOutcome: "NO_PUBLICATION",
      activeRefreshPr: null,
    },
    history: {
      status: "DESIGNED_NOT_IMPLEMENTED",
      writerImplemented: false,
      lastEvent: null,
      lastConvergedAt: null,
      refreshLifecycleSummary: null,
    },
    pullRequests: [],
    humanGates: [{ kind: "NoAction", summary: "No repository action required" }],
    holds: [],
    unknowns: [],
    recommendedNextAction: {
      code: "NO_ACTION",
      status: "NO_ACTION",
      gateKind: "NoAction",
      summary: "No repository action required",
      authorizesMutation: false,
    },
    ...partial,
  };
}

describe("STATUS-OVERLAY /api/status-overlay authorization boundary", () => {
  it("allows the canonical public repository", () => {
    expect(STATUS_OVERLAY_PUBLIC_REPOSITORY).toBe(
      "yasutakesougo/ai-development-control-center",
    );
    expect(STATUS_OVERLAY_PUBLIC_REPOSITORY).toBe(STATUS_OVERLAY_DEFAULT_REPOSITORY);
    expect(resolveUnauthenticatedStatusOverlayRepository(undefined)).toEqual({
      allowed: true,
      repository: STATUS_OVERLAY_PUBLIC_REPOSITORY,
    });
    expect(
      resolveUnauthenticatedStatusOverlayRepository(
        "yasutakesougo/ai-development-control-center",
      ),
    ).toEqual({
      allowed: true,
      repository: STATUS_OVERLAY_PUBLIC_REPOSITORY,
    });
  });

  it("rejects alternate repository overrides", () => {
    const gate = resolveUnauthenticatedStatusOverlayRepository(
      "yasutakesougo/severe-behavior-support-spfx",
    );
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.repository).toBe("yasutakesougo/severe-behavior-support-spfx");
      expect(gate.reason).toContain("refused repository override");
    }
  });

  it("rejects alternate repo before any token-backed GitHub read", async () => {
    const createClient = vi.fn(() => {
      throw new Error("createClient must not be called");
    });
    const getTextFile = vi.fn(async () => {
      throw new Error("getTextFile must not be called");
    });
    const runCycle = vi.fn(async () => {
      throw new Error("runCycle must not be called");
    });

    const response = await handleStatusOverlayGet(
      {
        GITHUB_TOKEN: "ghp_SHOULD_NOT_LEAK_OR_USE",
        STATUS_OVERLAY_REPOSITORY: "yasutakesougo/severe-behavior-support-spfx",
      },
      { createClient, getTextFile, runCycle },
    );

    expect(response.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
    expect(getTextFile).not.toHaveBeenCalled();
    expect(runCycle).not.toHaveBeenCalled();

    const body = (await response.json()) as ReturnType<typeof statusOverlayRuntimeUnavailable>;
    expect(body.phase).toBe("unavailable");
    expect(body.document).toBeNull();
    expect(body.reason).toContain("severe-behavior-support-spfx");
    expect(JSON.stringify(body)).not.toContain("ghp_");
    expect(JSON.stringify(body)).not.toContain("SHOULD_NOT_LEAK");
  });

  it("canonical public repo is allowed and may proceed to read-only cycle", async () => {
    const createClient = vi.fn(
      (): StatusOverlayReadonlyGithubClient => ({
        async getDefaultBranchTip() {
          return { defaultBranch: "main", sha: main };
        },
        async listOpenPullRequests() {
          return [];
        },
        async listWorkflowRuns() {
          return [];
        },
      }),
    );
    const getTextFile = vi.fn(async () => null);
    const document = sampleDocument();
    const runCycle = vi.fn(async () => document);

    const response = await handleStatusOverlayGet(
      {
        GITHUB_TOKEN: "ghp_test_token_value",
        STATUS_OVERLAY_REPOSITORY: STATUS_OVERLAY_PUBLIC_REPOSITORY,
      },
      { createClient, getTextFile, runCycle },
    );

    expect(response.status).toBe(200);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(runCycle).toHaveBeenCalledTimes(1);
    const body = (await response.json()) as StatusOverlayDocument;
    expect(body.repository).toBe(STATUS_OVERLAY_PUBLIC_REPOSITORY);
    expect(body.recommendedNextAction.authorizesMutation).toBe(false);
    expect(JSON.stringify(body)).not.toContain("ghp_");
    expect(JSON.stringify(body)).not.toContain("test_token_value");
  });

  it("GITHUB_TOKEN is never returned in fail-closed responses", async () => {
    const response = await handleStatusOverlayGet(
      {
        GITHUB_TOKEN: "ghp_SUPER_SECRET_TOKEN",
        STATUS_OVERLAY_RUNTIME_ENABLED: "false",
      },
      {
        createClient: () => {
          throw new Error("unused");
        },
      },
    );
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).not.toContain("ghp_");
    expect(text).not.toContain("SUPER_SECRET_TOKEN");
    expect(text).not.toContain("GITHUB_TOKEN");
  });

  it("existing unavailable behavior remains intact on runtime failure", async () => {
    const response = await handleStatusOverlayGet(
      {
        GITHUB_TOKEN: "ghp_secret",
        STATUS_OVERLAY_REPOSITORY: STATUS_OVERLAY_PUBLIC_REPOSITORY,
      },
      {
        createClient: () => ({
          async getDefaultBranchTip() {
            throw new Error("tip failed with bearer ghp_secret");
          },
          async listOpenPullRequests() {
            return [];
          },
          async listWorkflowRuns() {
            return [];
          },
        }),
        getTextFile: async () => null,
      },
    );
    expect(response.status).toBe(503);
    const body = (await response.json()) as ReturnType<typeof statusOverlayRuntimeUnavailable>;
    expect(body.phase).toBe("unavailable");
    expect(body.document).toBeNull();
    expect(JSON.stringify(body)).not.toContain("ghp_secret");
    expect(body.reason).toContain("[REDACTED]");
  });
});
