import { describe, expect, it } from "vitest";
import {
  AUTO_REFRESH_DESIGN,
  buildRefreshIdentity,
  evaluateAutoRefresh,
  filterSourceArchitectureRelevantPaths,
  hasMaterialSnapshotDiff,
  isGeneratedArchitectureArtifact,
  stableAutoRefreshProjection,
} from "../src/domain/autoRefreshContract";

const repo = "yasutakesougo/ai-development-control-center";
const from = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const main = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const mainC = "cccccccccccccccccccccccccccccccccccccccc";

describe("AUTO-REFRESH-V1 design contract", () => {
  it("marks design as not implemented", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: from,
      snapshotGeneratedFrom: from,
      changedPaths: [],
    });
    expect(report.implementation).toBe("NOT_IMPLEMENTED");
    expect(report.design).toBe(AUTO_REFRESH_DESIGN);
    expect(report.approvalActionRequired).toBe(false);
  });

  it("current snapshot → no refresh", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: from,
      snapshotGeneratedFrom: from,
      changedPaths: [],
      handoffStaleClassification: "current",
    });
    expect(report.status).toBe("CURRENT");
    expect(report.refreshRequired).toBe(false);
    expect(report.nextAction).toBe("NO_REFRESH");
    expect(report.approvalActionRequired).toBe(false);
  });

  it("stale, non-architecture changes only → no refresh", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: ["README.md", "docs/architecture/README.md"],
      handoffStaleClassification: "stale_no_architecture_impact",
    });
    expect(report.refreshRequired).toBe(false);
    expect(report.status).toBe("CURRENT");
    expect(report.nextAction).toBe("NO_REFRESH");
    expect(report.sourceArchitectureRelevantPaths).toEqual([]);
  });

  it("stale, architecture-relevant change → refresh eligible", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: ["src/worker/index.ts", "README.md"],
      handoffStaleClassification: "stale_architecture_affecting",
      verification: {
        architectureSnapshot: "PASS",
        handoff: "PASS",
        verify: "PASS",
      },
      materialSnapshotDiff: true,
    });
    expect(report.refreshRequired).toBe(true);
    expect(report.status).toBe("REFRESH_ELIGIBLE");
    expect(report.nextAction).toBe("CREATE_DRAFT");
    expect(report.sourceArchitectureRelevantPaths).toEqual(["src/worker/index.ts"]);
    expect(report.approvalActionRequired).toBe(false);
  });

  it("generated-artifact-only change → no recursive refresh", () => {
    expect(isGeneratedArchitectureArtifact("docs/architecture/architecture.json")).toBe(true);
    expect(isGeneratedArchitectureArtifact("docs/architecture/architecture.html")).toBe(true);
    expect(
      filterSourceArchitectureRelevantPaths([
        "docs/architecture/architecture.json",
        "docs/architecture/architecture.html",
      ]),
    ).toEqual([]);

    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: [
        "docs/architecture/architecture.json",
        "docs/architecture/architecture.html",
      ],
      handoffStaleClassification: "stale_no_architecture_impact",
    });
    expect(report.refreshRequired).toBe(false);
    expect(report.nextAction).toBe("NO_REFRESH");
    expect(report.status).toBe("CURRENT");
  });

  it("generator change → refresh eligible", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: ["scripts/generate-architecture-snapshot.mjs"],
      verification: {
        architectureSnapshot: "PASS",
        handoff: "PASS",
        verify: "PASS",
      },
      materialSnapshotDiff: true,
    });
    expect(report.status).toBe("REFRESH_ELIGIBLE");
    expect(report.nextAction).toBe("CREATE_DRAFT");
    expect(report.sourceArchitectureRelevantPaths).toEqual([
      "scripts/generate-architecture-snapshot.mjs",
    ]);
  });

  it("unknown main → fail closed", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: null,
      snapshotGeneratedFrom: from,
      changedPaths: ["src/worker/index.ts"],
    });
    expect(report.status).toBe("UNKNOWN");
    expect(report.nextAction).toBe("UNKNOWN");
    expect(report.refreshRequired).toBeNull();
  });

  it("unknown changed paths → fail closed", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: null,
    });
    expect(report.status).toBe("UNKNOWN");
    expect(report.nextAction).toBe("UNKNOWN");
  });

  it("duplicate refresh identity → no duplicate Draft", () => {
    const identity = buildRefreshIdentity({
      repository: repo,
      snapshotGeneratedFrom: from,
      targetMainSha: main,
    });
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: ["src/worker/index.ts"],
      existingRefreshPrs: [
        {
          number: 99,
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
    expect(report.refreshIdentity).toBe(identity);
    expect(report.status).toBe("REFRESH_DRAFT_OPEN");
    expect(report.nextAction).toBe("REUSE_EXISTING_DRAFT");
  });

  it("main moves during refresh → stale/re-evaluate", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: ["src/worker/index.ts"],
      mainMovedDuringRefreshTo: mainC,
    });
    expect(report.status).toBe("UNKNOWN");
    expect(report.nextAction).toBe("HOLD");
    expect(report.reason).toContain("main moved during refresh");
  });

  it("stale Snapshot does not become approval ACTION_REQUIRED", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: ["wrangler.jsonc", "migrations/0001_approval_ledger.sql"],
      handoffStaleClassification: "stale_architecture_affecting",
      materialSnapshotDiff: true,
      verification: {
        architectureSnapshot: "PASS",
        handoff: "PASS",
        verify: "PASS",
      },
    });
    expect(report.refreshRequired).toBe(true);
    expect(report.nextAction).toBe("CREATE_DRAFT");
    expect(report.approvalActionRequired).toBe(false);
    expect(report.handoffStaleClassification).toBe("stale_architecture_affecting");
  });

  it("verification failure → REFRESH_FAILED and no CREATE_DRAFT", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: main,
      snapshotGeneratedFrom: from,
      changedPaths: ["src/worker/index.ts"],
      materialSnapshotDiff: true,
      verification: {
        architectureSnapshot: "PASS",
        handoff: "PASS",
        verify: "FAIL",
      },
    });
    expect(report.status).toBe("REFRESH_FAILED");
    expect(report.nextAction).toBe("HOLD");
  });

  it("material Snapshot equality ignores generatedAt", () => {
    const before = {
      schemaVersion: "1.0",
      generatedFrom: { commit: from, generatedAt: "2026-01-01T00:00:00.000Z" },
      components: [{ id: "a" }],
    };
    const after = {
      schemaVersion: "1.0",
      generatedFrom: { commit: from, generatedAt: "2026-08-12T00:00:00.000Z" },
      components: [{ id: "a" }],
    };
    expect(hasMaterialSnapshotDiff(before, after)).toBe(false);
    expect(
      hasMaterialSnapshotDiff(before, { ...after, components: [{ id: "b" }] }),
    ).toBe(true);
  });

  it("superseded Draft when main advances (Case B)", () => {
    const report = evaluateAutoRefresh({
      repository: repo,
      observedMain: mainC,
      snapshotGeneratedFrom: from,
      changedPaths: ["src/worker/index.ts"],
      existingRefreshPrs: [
        {
          number: 42,
          refreshIdentity: buildRefreshIdentity({
            repository: repo,
            snapshotGeneratedFrom: from,
            targetMainSha: main,
          }),
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
    expect(report.existingRefreshPr?.number).toBe(42);
    expect(report.status).toBe("REFRESH_ELIGIBLE");
    expect(report.nextAction).toBe("CREATE_DRAFT");
    expect(report.reason).toContain("superseded");
  });

  it("stable projection strips evaluatedAt only", () => {
    const a = evaluateAutoRefresh({
      repository: repo,
      observedMain: from,
      snapshotGeneratedFrom: from,
      changedPaths: [],
      evaluatedAt: "2026-01-01T00:00:00.000Z",
    });
    const b = evaluateAutoRefresh({
      repository: repo,
      observedMain: from,
      snapshotGeneratedFrom: from,
      changedPaths: [],
      evaluatedAt: "2026-08-12T00:00:00.000Z",
    });
    expect(stableAutoRefreshProjection(a)).toEqual(stableAutoRefreshProjection(b));
  });
});
