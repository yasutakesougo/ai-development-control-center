/**
 * PERSISTENT-AUTO-REFRESH-V1 design contract helpers.
 *
 * DESIGNED · NOT ENABLED · NO ACTIVE TRIGGER
 *
 * Concurrency, failure, and Draft disposition logic only.
 * Does not create workflows, PRs, or enable cron.
 */

import {
  filterSourceArchitectureRelevantPaths,
  isGeneratedArchitectureArtifact,
  type ExistingRefreshPr,
} from "./autoRefreshContract";
import {
  AUTO_REFRESH_PILOT_PUBLISHER,
  assertPilotPublisherCannotReadyOrMerge,
} from "./autoRefreshPublisher";

export const PERSISTENT_AUTO_REFRESH_DESIGN = "PERSISTENT-AUTO-REFRESH-DESIGN-V1" as const;
export const PERSISTENT_AUTO_REFRESH_ENABLED = false as const;

export const PERSISTENT_CONCURRENCY_GROUP = "architecture-auto-refresh-main" as const;
export const PERSISTENT_CANCEL_IN_PROGRESS = true as const;

export type PersistentWorkflowStatus =
  | "IDLE"
  | "EVALUATING"
  | "NOT_REQUIRED"
  | "ELIGIBLE"
  | "GENERATING"
  | "VERIFYING"
  | "DRAFT_PUBLISHING"
  | "DRAFT_OPEN"
  | "REUSED_EXISTING"
  | "ABORTED_MAIN_MOVED"
  | "FAILED"
  | "OUTCOME_UNKNOWN"
  | "HOLD";

export type PersistentDraftDisposition =
  | "REUSE"
  | "SUPERSEDED_CANDIDATE"
  | "NEW_DRAFT_REQUIRED"
  | "NO_ACTION";

export type PersistentFailureClass = "SAFE_RETRY" | "OUTCOME_UNKNOWN" | "HOLD";

export type PersistentTriggerKind = "push_main" | "workflow_dispatch" | "schedule";

/** Designed trigger preference. Scheduler is not selected for V1. */
export const PERSISTENT_TRIGGER_PREFERENCE: PersistentTriggerKind[] = [
  "push_main",
  "workflow_dispatch",
];

export const PERSISTENT_PATHS_IGNORE = [
  "docs/architecture/architecture.json",
  "docs/architecture/architecture.html",
] as const;

export const PERSISTENT_GITHUB_PERMISSIONS = {
  contents: "write",
  pullRequests: "write",
  issues: "none",
  deployments: "none",
} as const;

export function assertPersistentAutoRefreshNotEnabled(): void {
  if (PERSISTENT_AUTO_REFRESH_ENABLED) {
    throw new Error("PERSISTENT-AUTO-REFRESH-V1 must remain NOT ENABLED in design-only state");
  }
}

export function assertPersistentPublisherCannotReadyOrMerge(): void {
  assertPilotPublisherCannotReadyOrMerge(AUTO_REFRESH_PILOT_PUBLISHER);
}

/**
 * First-line Actions filter helper: whether a push event's changed paths are
 * exclusively generated Snapshot artifacts (workflow should no-op / not publish).
 */
export function isGeneratedOnlyChange(changedPaths: string[]): boolean {
  if (changedPaths.length === 0) return false;
  return changedPaths.every((path) => isGeneratedArchitectureArtifact(path));
}

/**
 * Whether a main-push event is publication-eligible after source/generated split.
 */
export function isPersistentRefreshEligibleFromPaths(changedPaths: string[]): boolean {
  return filterSourceArchitectureRelevantPaths(changedPaths).length > 0;
}

export function classifyPersistentDraftDisposition(input: {
  refreshIdentity: string;
  targetMainSha: string;
  eligible: boolean;
  existing: ExistingRefreshPr[];
}): PersistentDraftDisposition {
  if (!input.eligible) return "NO_ACTION";

  const equivalent = input.existing.find(
    (pr) =>
      pr.refreshIdentity === input.refreshIdentity &&
      (pr.state === "DRAFT" || pr.state === "READY"),
  );
  if (equivalent) return "REUSE";

  const obsolete = input.existing.find(
    (pr) =>
      (pr.state === "DRAFT" || pr.state === "READY") &&
      pr.targetMainSha !== input.targetMainSha,
  );
  if (obsolete) return "SUPERSEDED_CANDIDATE";

  return "NEW_DRAFT_REQUIRED";
}

/**
 * Map failure context to retry class.
 * Blind retry after unknown publish outcome is forbidden.
 */
export function classifyPersistentFailure(input: {
  kind:
    | "github_read_transient"
    | "changed_paths_unavailable"
    | "generator_failed"
    | "verification_failed"
    | "main_recheck_unavailable"
    | "duplicate_check_unavailable"
    | "publish_transport_unknown"
    | "publish_rejected";
}): PersistentFailureClass {
  switch (input.kind) {
    case "github_read_transient":
      return "SAFE_RETRY";
    case "publish_rejected":
      return "SAFE_RETRY";
    case "publish_transport_unknown":
      return "OUTCOME_UNKNOWN";
    case "changed_paths_unavailable":
    case "generator_failed":
    case "verification_failed":
    case "main_recheck_unavailable":
    case "duplicate_check_unavailable":
      return "HOLD";
    default:
      return "HOLD";
  }
}

export function mayRetryPublication(input: {
  failureClass: PersistentFailureClass;
  equivalentDraftStillAbsent: boolean;
}): boolean {
  if (input.failureClass === "OUTCOME_UNKNOWN") return false;
  if (input.failureClass === "HOLD") return false;
  return input.failureClass === "SAFE_RETRY" && input.equivalentDraftStillAbsent;
}

export function resolvePersistentStatus(input: {
  mainMoved: boolean;
  eligible: boolean;
  verificationPassed: boolean | null;
  disposition: PersistentDraftDisposition | null;
  failureClass: PersistentFailureClass | null;
  published: boolean;
}): PersistentWorkflowStatus {
  if (input.failureClass === "OUTCOME_UNKNOWN") return "OUTCOME_UNKNOWN";
  if (input.failureClass === "HOLD") return "HOLD";
  if (input.mainMoved) return "ABORTED_MAIN_MOVED";
  if (input.verificationPassed === false) return "FAILED";
  if (!input.eligible) return "NOT_REQUIRED";
  if (input.disposition === "REUSE") return "REUSED_EXISTING";
  if (input.published) return "DRAFT_OPEN";
  if (input.eligible) return "ELIGIBLE";
  return "IDLE";
}

/** Designed concurrency policy projection for tests/docs. */
export function persistentConcurrencyPolicy(): {
  group: typeof PERSISTENT_CONCURRENCY_GROUP;
  cancelInProgress: typeof PERSISTENT_CANCEL_IN_PROGRESS;
} {
  return {
    group: PERSISTENT_CONCURRENCY_GROUP,
    cancelInProgress: PERSISTENT_CANCEL_IN_PROGRESS,
  };
}
