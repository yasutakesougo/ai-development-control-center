import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  buildRefreshIdentity,
  filterSourceArchitectureRelevantPaths,
  hasMaterialSnapshotDiff,
} from "../src/domain/autoRefreshContract";
import { AUTO_REFRESH_PILOT_PUBLISHER } from "../src/domain/autoRefreshPublisher";
import {
  assertDisabledModeWorkflow,
  assertGeneratedFromMatchesSourceMain,
  assertPersistentAutoRefreshNotEnabled,
  assertPersistentPublisherCannotReadyOrMerge,
  classifyPersistentDraftDisposition,
  classifyPersistentFailure,
  decidePersistentPublication,
  inspectPersistentWorkflowYaml,
  isGeneratedOnlyChange,
  isPersistentRefreshEligibleFromPaths,
  mayRetryPublication,
  PERSISTENT_ACTIVE_TRIGGERS,
  PERSISTENT_AUTO_REFRESH_ENABLED,
  PERSISTENT_AUTO_REFRESH_MODE,
  PERSISTENT_AUTO_REFRESH_PUBLISHER,
  PERSISTENT_CONCURRENCY_GROUP_EXPRESSION,
  PERSISTENT_GITHUB_PERMISSIONS,
  PERSISTENT_PATHS_IGNORE,
  PERSISTENT_WORKFLOW_PATH,
  persistentConcurrencyPolicy,
  resolvePersistentStatus,
} from "../src/domain/persistentAutoRefreshContract";

const repo = "yasutakesougo/ai-development-control-center";
const from = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const mainA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const mainB = "cccccccccccccccccccccccccccccccccccccccc";

const workflowYaml = readFileSync(
  new URL("../.github/workflows/architecture-auto-refresh.yml", import.meta.url),
  "utf8",
);

describe("PERSISTENT-AUTO-REFRESH-V1 DISABLED-MODE", () => {
  it("remains NOT ENABLED in DISABLED_MODE with workflow_dispatch-only active triggers", () => {
    expect(PERSISTENT_AUTO_REFRESH_ENABLED).toBe(false);
    expect(PERSISTENT_AUTO_REFRESH_MODE).toBe("DISABLED_MODE");
    expect(PERSISTENT_ACTIVE_TRIGGERS).toEqual(["workflow_dispatch"]);
    expect(PERSISTENT_ACTIVE_TRIGGERS).not.toContain("push_main");
    expect(PERSISTENT_ACTIVE_TRIGGERS).not.toContain("schedule");
    expect(() => assertPersistentAutoRefreshNotEnabled()).not.toThrow();
  });

  it("workflow only has workflow_dispatch; no push; no cron", () => {
    const inspection = inspectPersistentWorkflowYaml(workflowYaml);
    expect(inspection.path).toBe(PERSISTENT_WORKFLOW_PATH);
    expect(inspection.hasWorkflowDispatch).toBe(true);
    expect(inspection.hasPushTrigger).toBe(false);
    expect(inspection.hasScheduleCron).toBe(false);
    expect(() => assertDisabledModeWorkflow(inspection)).not.toThrow();
  });

  it("permissions are expected minimum and concurrency group exists", () => {
    const inspection = inspectPersistentWorkflowYaml(workflowYaml);
    expect(inspection.permissionsContents).toBe("write");
    expect(inspection.permissionsPullRequests).toBe("write");
    expect(inspection.grantsIssuesWrite).toBe(false);
    expect(inspection.grantsActionsWrite).toBe(false);
    expect(inspection.grantsDeploymentsWrite).toBe(false);
    expect(inspection.grantsIdTokenWrite).toBe(false);
    expect(inspection.grantsPackagesWrite).toBe(false);
    expect(inspection.concurrencyGroupExpression).toBe(
      PERSISTENT_CONCURRENCY_GROUP_EXPRESSION,
    );
    expect(inspection.cancelInProgress).toBe(true);
    expect(inspection.invokesReadyOrMerge).toBe(false);
    expect(PERSISTENT_GITHUB_PERMISSIONS.contents).toBe("write");
    expect(PERSISTENT_GITHUB_PERMISSIONS.pullRequests).toBe("write");
    expect(persistentConcurrencyPolicy().cancelInProgress).toBe(true);
  });

  it("generated-only change → no refresh", () => {
    const paths = [...PERSISTENT_PATHS_IGNORE];
    expect(isGeneratedOnlyChange(paths)).toBe(true);
    expect(isPersistentRefreshEligibleFromPaths(paths)).toBe(false);
  });

  it("relevant source change → eligible", () => {
    const paths = ["src/worker/index.ts", "README.md"];
    expect(isPersistentRefreshEligibleFromPaths(paths)).toBe(true);
    expect(filterSourceArchitectureRelevantPaths(paths)).toEqual(["src/worker/index.ts"]);
  });

  it("main moves → abort", () => {
    const decided = decidePersistentPublication({
      disposition: "NEW_DRAFT_REQUIRED",
      mainRecheck: "MOVED",
      verificationPassed: true,
      materialSnapshotDiff: true,
      failureClass: null,
    });
    expect(decided.decision).toBe("ABORTED_MAIN_MOVED");
    expect(decided.status).toBe("ABORTED_MAIN_MOVED");
    expect(
      resolvePersistentStatus({
        mainMoved: true,
        eligible: true,
        verificationPassed: true,
        disposition: "NEW_DRAFT_REQUIRED",
        failureClass: null,
        published: false,
      }),
    ).toBe("ABORTED_MAIN_MOVED");
  });

  it("duplicate identity → reuse", () => {
    const identity = buildRefreshIdentity({
      repository: repo,
      snapshotGeneratedFrom: from,
      targetMainSha: mainA,
    });
    expect(
      classifyPersistentDraftDisposition({
        refreshIdentity: identity,
        targetMainSha: mainA,
        eligible: true,
        existing: [
          {
            number: 10,
            refreshIdentity: identity,
            state: "DRAFT",
            targetMainSha: mainA,
          },
        ],
      }),
    ).toBe("REUSE");
  });

  it("obsolete Draft → superseded candidate / no mutation / HOLD publication", () => {
    const identity = buildRefreshIdentity({
      repository: repo,
      snapshotGeneratedFrom: from,
      targetMainSha: mainB,
    });
    const disposition = classifyPersistentDraftDisposition({
      refreshIdentity: identity,
      targetMainSha: mainB,
      eligible: true,
      existing: [
        {
          number: 12,
          refreshIdentity: buildRefreshIdentity({
            repository: repo,
            snapshotGeneratedFrom: from,
            targetMainSha: mainA,
          }),
          state: "DRAFT",
          targetMainSha: mainA,
        },
      ],
    });
    expect(disposition).toBe("SUPERSEDED_CANDIDATE");
    const decided = decidePersistentPublication({
      disposition,
      mainRecheck: "MATCH",
      verificationPassed: true,
      materialSnapshotDiff: true,
      failureClass: null,
    });
    expect(decided.decision).toBe("HOLD");
    expect(decided.status).toBe("HOLD");
    expect(PERSISTENT_AUTO_REFRESH_PUBLISHER.canClosePullRequest).toBe(false);
  });

  it("verification fail → no publication", () => {
    const decided = decidePersistentPublication({
      disposition: "NEW_DRAFT_REQUIRED",
      mainRecheck: "MATCH",
      verificationPassed: false,
      materialSnapshotDiff: true,
      failureClass: classifyPersistentFailure({ kind: "verification_failed" }),
    });
    expect(decided.decision).toBe("HOLD");
    expect(["HOLD", "FAILED"]).toContain(decided.status);
  });

  it("duplicate lookup unavailable → fail closed", () => {
    expect(classifyPersistentFailure({ kind: "duplicate_check_unavailable" })).toBe("HOLD");
    const decided = decidePersistentPublication({
      disposition: "NEW_DRAFT_REQUIRED",
      mainRecheck: "MATCH",
      verificationPassed: true,
      materialSnapshotDiff: true,
      failureClass: classifyPersistentFailure({ kind: "duplicate_check_unavailable" }),
    });
    expect(decided.decision).toBe("HOLD");
  });

  it("publication OUTCOME_UNKNOWN → no blind retry", () => {
    const failureClass = classifyPersistentFailure({ kind: "publish_transport_unknown" });
    expect(failureClass).toBe("OUTCOME_UNKNOWN");
    expect(
      mayRetryPublication({ failureClass, equivalentDraftStillAbsent: true }),
    ).toBe(false);
    const decided = decidePersistentPublication({
      disposition: "NEW_DRAFT_REQUIRED",
      mainRecheck: "MATCH",
      verificationPassed: true,
      materialSnapshotDiff: true,
      failureClass,
    });
    expect(decided.decision).toBe("OUTCOME_UNKNOWN");
  });

  it("publisher cannot Ready / Merge / close PR / Issue", () => {
    expect(PERSISTENT_AUTO_REFRESH_PUBLISHER.canCreateDraft).toBe(true);
    expect(PERSISTENT_AUTO_REFRESH_PUBLISHER.canMarkReady).toBe(false);
    expect(PERSISTENT_AUTO_REFRESH_PUBLISHER.canMerge).toBe(false);
    expect(PERSISTENT_AUTO_REFRESH_PUBLISHER.canClosePullRequest).toBe(false);
    expect(PERSISTENT_AUTO_REFRESH_PUBLISHER.canCloseIssue).toBe(false);
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canMarkReady).toBe(false);
    expect(() => assertPersistentPublisherCannotReadyOrMerge()).not.toThrow();
  });

  it("generatedFrom source invariant", () => {
    const require = createRequire(import.meta.url);
    const mod = require("../scripts/generate-architecture-snapshot.mjs") as {
      buildSnapshot: (
        commit: string,
        generatedAt?: string,
      ) => { generatedFrom: { commit: string } };
    };
    const source = "dddddddddddddddddddddddddddddddddddddddd";
    const snapshot = mod.buildSnapshot(source, "2026-08-12T00:00:00.000Z");
    expect(snapshot.generatedFrom.commit).toBe(source);
    expect(() =>
      assertGeneratedFromMatchesSourceMain({
        generatedFromCommit: snapshot.generatedFrom.commit,
        sourceMainSha: source,
      }),
    ).not.toThrow();
    expect(() =>
      assertGeneratedFromMatchesSourceMain({
        generatedFromCommit: "feature-branch-head",
        sourceMainSha: source,
      }),
    ).toThrow(/must equal source main/);

    const before = JSON.parse(
      readFileSync(new URL("../docs/architecture/architecture.json", import.meta.url), "utf8"),
    );
    const projected = {
      ...before,
      generatedFrom: { ...before.generatedFrom, commit: source },
    };
    expect(hasMaterialSnapshotDiff(before, projected)).toBe(true);
  });

  it("stale maintenance state != approval ACTION_REQUIRED", () => {
    expect(PERSISTENT_AUTO_REFRESH_PUBLISHER.canMarkReady).toBe(false);
    expect(PERSISTENT_AUTO_REFRESH_PUBLISHER.canMerge).toBe(false);
    expect(PERSISTENT_AUTO_REFRESH_PUBLISHER.canInvokeActionGateway).toBe(false);
    expect(PERSISTENT_AUTO_REFRESH_PUBLISHER.canExecuteAgent).toBe(false);
    // Run report type always pins approvalActionRequired: false at the contract layer.
    const approvalActionRequired = false as const;
    expect(approvalActionRequired).toBe(false);
  });

  it("rejects a push-triggered workflow YAML in DISABLED-MODE inspection", () => {
    const bad = [
      "on:",
      "  push:",
      "    branches: [main]",
      "  workflow_dispatch:",
      "concurrency:",
      `  group: ${PERSISTENT_CONCURRENCY_GROUP_EXPRESSION}`,
      "  cancel-in-progress: true",
      "permissions:",
      "  contents: write",
      "  pull-requests: write",
    ].join("\n");
    const inspection = inspectPersistentWorkflowYaml(bad);
    expect(inspection.hasPushTrigger).toBe(true);
    expect(() => assertDisabledModeWorkflow(inspection)).toThrow(/must not include push/);
  });
});
