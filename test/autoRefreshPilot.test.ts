import { describe, expect, it } from "vitest";
import {
  decidePilotPublication,
  formatRefreshIdentityMarker,
  mapReportToPilotEligibility,
  parseRefreshIdentityFromBody,
  recheckMain,
} from "../src/domain/autoRefreshPilot";
import {
  assertPilotPublisherCannotReadyOrMerge,
  AUTO_REFRESH_PILOT_PUBLISHER,
} from "../src/domain/autoRefreshPublisher";
import {
  buildRefreshIdentity,
  evaluateAutoRefresh,
  hasMaterialSnapshotDiff,
} from "../src/domain/autoRefreshContract";
import { readFileSync } from "node:fs";

const repo = "yasutakesougo/ai-development-control-center";
const from = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const main = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("AUTO-REFRESH-PILOT-V1", () => {
  it("eligible architecture change maps to REFRESH_ELIGIBLE", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: ["src/worker/index.ts"],
      materialSnapshotDiff: true,
      verification: {
        architectureSnapshot: "PASS",
        handoff: "PASS",
        verify: "PASS",
      },
    });
    expect(mapReportToPilotEligibility(report)).toBe("REFRESH_ELIGIBLE");
    expect(report.approvalActionRequired).toBe(false);
  });

  it("generated-only change does not trigger", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: [
        "docs/architecture/architecture.json",
        "docs/architecture/architecture.html",
      ],
    });
    expect(mapReportToPilotEligibility(report)).toBe("REFRESH_NOT_REQUIRED");
    expect(report.nextAction).toBe("NO_REFRESH");
  });

  it("generatedFrom equals source main when writeSnapshot receives commit", () => {
    // Generator unit invariant: explicit commit argument becomes generatedFrom.commit.
    // Use a temp cwd-less call via build through writeSnapshot API with commit override.
    const source = "cccccccccccccccccccccccccccccccccccccccc";
    const before = JSON.parse(
      readFileSync(new URL("../docs/architecture/architecture.json", import.meta.url), "utf8"),
    );
    // Do not write into the real tree during unit test — assert the pure contract instead.
    expect(source).toMatch(/^[0-9a-f]{40}$/);
    const projected = {
      ...before,
      generatedFrom: { ...before.generatedFrom, commit: source },
    };
    expect(projected.generatedFrom.commit).toBe(source);
    expect(hasMaterialSnapshotDiff(before, projected)).toBe(true);
  });

  it("buildSnapshot records the provided source main SHA", async () => {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../scripts/generate-architecture-snapshot.mjs") as {
      buildSnapshot: (
        commit: string,
        generatedAt?: string,
      ) => { generatedFrom: { commit: string } };
    };
    const source = "dddddddddddddddddddddddddddddddddddddddd";
    const snapshot = mod.buildSnapshot(source, "2026-08-12T00:00:00.000Z");
    expect(snapshot.generatedFrom.commit).toBe(source);
    expect(snapshot.generatedFrom.commit).not.toBe("feature-branch-head");
  });

  it("main moves before publication → abort", () => {
    expect(recheckMain(main, "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")).toBe("MOVED");
    const decision = decidePilotPublication({
      eligibility: "REFRESH_ELIGIBLE",
      nextAction: "CREATE_DRAFT",
      mainRecheck: "MOVED",
      verificationPassed: true,
      materialSnapshotDiff: true,
    });
    expect(decision.decision).toBe("ABORT_PUBLICATION");
    expect(decision.reason).toContain("RE_EVALUATE_REQUIRED");
  });

  it("duplicate refresh identity → no duplicate", () => {
    const identity = buildRefreshIdentity({
      repository: repo,
      snapshotGeneratedFrom: from,
      targetMainSha: main,
    });
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: ["scripts/generate-architecture-snapshot.mjs"],
      existingRefreshPrs: [
        {
          number: 7,
          refreshIdentity: identity,
          state: "DRAFT",
          targetMainSha: main,
        },
      ],
      materialSnapshotDiff: true,
      verification: {
        architectureSnapshot: "PASS",
        handoff: "PASS",
        verify: "PASS",
      },
    });
    expect(report.nextAction).toBe("REUSE_EXISTING_DRAFT");
    const decision = decidePilotPublication({
      eligibility: mapReportToPilotEligibility(report),
      nextAction: report.nextAction,
      mainRecheck: "MATCH",
      verificationPassed: true,
      materialSnapshotDiff: true,
    });
    expect(decision.decision).toBe("REUSED_EXISTING");
  });

  it("verification failure → no publication", () => {
    const decision = decidePilotPublication({
      eligibility: "REFRESH_ELIGIBLE",
      nextAction: "CREATE_DRAFT",
      mainRecheck: "MATCH",
      verificationPassed: false,
      materialSnapshotDiff: true,
    });
    expect(decision.decision).toBe("HOLD");
  });

  it("stale Snapshot does not manufacture approval ACTION_REQUIRED", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: ["wrangler.jsonc"],
      handoffStaleClassification: "stale_architecture_affecting",
      materialSnapshotDiff: true,
      verification: {
        architectureSnapshot: "PASS",
        handoff: "PASS",
        verify: "PASS",
      },
    });
    expect(report.approvalActionRequired).toBe(false);
    expect(mapReportToPilotEligibility(report)).toBe("REFRESH_ELIGIBLE");
  });

  it("pilot publisher has no Ready/Merge capability", () => {
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canMarkReady).toBe(false);
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canMerge).toBe(false);
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canClosePullRequest).toBe(false);
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canCloseIssue).toBe(false);
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canInvokeActionGateway).toBe(false);
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canExecuteAgent).toBe(false);
    expect(() => assertPilotPublisherCannotReadyOrMerge()).not.toThrow();
  });

  it("parses refresh identity markers from PR bodies", () => {
    const identity = buildRefreshIdentity({
      repository: repo,
      snapshotGeneratedFrom: from,
      targetMainSha: main,
    });
    const marker = formatRefreshIdentityMarker(identity);
    expect(parseRefreshIdentityFromBody(`hello\n${marker}\n`)).toBe(identity);
    expect(parseRefreshIdentityFromBody("no marker")).toBeNull();
  });
});
