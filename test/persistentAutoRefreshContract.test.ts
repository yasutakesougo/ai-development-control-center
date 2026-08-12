import { describe, expect, it } from "vitest";
import {
  buildRefreshIdentity,
  filterSourceArchitectureRelevantPaths,
} from "../src/domain/autoRefreshContract";
import {
  assertPersistentAutoRefreshNotEnabled,
  assertPersistentPublisherCannotReadyOrMerge,
  classifyPersistentDraftDisposition,
  classifyPersistentFailure,
  isGeneratedOnlyChange,
  isPersistentRefreshEligibleFromPaths,
  mayRetryPublication,
  PERSISTENT_AUTO_REFRESH_ENABLED,
  PERSISTENT_GITHUB_PERMISSIONS,
  PERSISTENT_PATHS_IGNORE,
  PERSISTENT_TRIGGER_PREFERENCE,
  persistentConcurrencyPolicy,
  resolvePersistentStatus,
} from "../src/domain/persistentAutoRefreshContract";
import { AUTO_REFRESH_PILOT_PUBLISHER } from "../src/domain/autoRefreshPublisher";

const repo = "yasutakesougo/ai-development-control-center";
const from = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const mainA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const mainB = "cccccccccccccccccccccccccccccccccccccccc";

describe("PERSISTENT-AUTO-REFRESH-V1 design contract", () => {
  it("remains NOT ENABLED and prefers push_main then workflow_dispatch", () => {
    expect(PERSISTENT_AUTO_REFRESH_ENABLED).toBe(false);
    expect(() => assertPersistentAutoRefreshNotEnabled()).not.toThrow();
    expect(PERSISTENT_TRIGGER_PREFERENCE).toEqual(["push_main", "workflow_dispatch"]);
    expect(PERSISTENT_TRIGGER_PREFERENCE).not.toContain("schedule");
  });

  it("push to main with architecture source change → eligible", () => {
    const paths = ["src/worker/index.ts", "README.md"];
    expect(isPersistentRefreshEligibleFromPaths(paths)).toBe(true);
    expect(filterSourceArchitectureRelevantPaths(paths)).toEqual(["src/worker/index.ts"]);
  });

  it("generated-only merge → no refresh", () => {
    const paths = [...PERSISTENT_PATHS_IGNORE];
    expect(isGeneratedOnlyChange(paths)).toBe(true);
    expect(isPersistentRefreshEligibleFromPaths(paths)).toBe(false);
  });

  it("unrelated main change → no refresh", () => {
    const paths = ["README.md", "docs/architecture/README.md"];
    expect(isPersistentRefreshEligibleFromPaths(paths)).toBe(false);
  });

  it("rapid A→B events → concurrency cancels in progress for current target", () => {
    const policy = persistentConcurrencyPolicy();
    expect(policy.group).toBe("architecture-auto-refresh-main");
    expect(policy.cancelInProgress).toBe(true);
    // Cancel-in-progress means only the latest evaluation for main survives.
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

  it("duplicate identity → ≤1 Draft publication (reuse)", () => {
    const identity = buildRefreshIdentity({
      repository: repo,
      snapshotGeneratedFrom: from,
      targetMainSha: mainA,
    });
    const disposition = classifyPersistentDraftDisposition({
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
    });
    expect(disposition).toBe("REUSE");
    expect(
      resolvePersistentStatus({
        mainMoved: false,
        eligible: true,
        verificationPassed: true,
        disposition,
        failureClass: null,
        published: false,
      }),
    ).toBe("REUSED_EXISTING");
  });

  it("main moves during generation → abort", () => {
    expect(
      resolvePersistentStatus({
        mainMoved: true,
        eligible: true,
        verificationPassed: true,
        disposition: null,
        failureClass: null,
        published: false,
      }),
    ).toBe("ABORTED_MAIN_MOVED");
  });

  it("verification fail → no Draft (HOLD/FAILED)", () => {
    expect(classifyPersistentFailure({ kind: "verification_failed" })).toBe("HOLD");
    expect(
      resolvePersistentStatus({
        mainMoved: false,
        eligible: true,
        verificationPassed: false,
        disposition: "NEW_DRAFT_REQUIRED",
        failureClass: "HOLD",
        published: false,
      }),
    ).toBe("HOLD");
  });

  it("publication outcome unknown → no blind retry", () => {
    const failureClass = classifyPersistentFailure({ kind: "publish_transport_unknown" });
    expect(failureClass).toBe("OUTCOME_UNKNOWN");
    expect(
      mayRetryPublication({ failureClass, equivalentDraftStillAbsent: true }),
    ).toBe(false);
  });

  it("existing equivalent Draft → reuse", () => {
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
            number: 11,
            refreshIdentity: identity,
            state: "READY",
            targetMainSha: mainA,
          },
        ],
      }),
    ).toBe("REUSE");
  });

  it("existing obsolete Draft → superseded candidate, no close", () => {
    const identity = buildRefreshIdentity({
      repository: repo,
      snapshotGeneratedFrom: from,
      targetMainSha: mainB,
    });
    expect(
      classifyPersistentDraftDisposition({
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
      }),
    ).toBe("SUPERSEDED_CANDIDATE");
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canClosePullRequest).toBe(false);
  });

  it("stale state never becomes approval ACTION_REQUIRED", () => {
    // Persistent design reuses Draft-only publisher; no approval mapping exists.
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canMarkReady).toBe(false);
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canMerge).toBe(false);
    expect(() => assertPersistentPublisherCannotReadyOrMerge()).not.toThrow();
  });

  it("workflow has no Ready/Merge permission or capability", () => {
    expect(PERSISTENT_GITHUB_PERMISSIONS.issues).toBe("none");
    expect(PERSISTENT_GITHUB_PERMISSIONS.deployments).toBe("none");
    expect(PERSISTENT_GITHUB_PERMISSIONS.contents).toBe("write");
    expect(PERSISTENT_GITHUB_PERMISSIONS.pullRequests).toBe("write");
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canMarkReady).toBe(false);
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canMerge).toBe(false);
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canInvokeActionGateway).toBe(false);
    expect(AUTO_REFRESH_PILOT_PUBLISHER.canExecuteAgent).toBe(false);
  });

  it("eligible source change maps to NEW_DRAFT_REQUIRED when no existing PR", () => {
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
        existing: [],
      }),
    ).toBe("NEW_DRAFT_REQUIRED");
  });
});
