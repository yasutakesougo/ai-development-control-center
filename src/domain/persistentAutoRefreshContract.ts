/**
 * PERSISTENT-AUTO-REFRESH-V1 contract helpers.
 *
 * DISABLED-MODE IMPLEMENTATION · NOT ENABLED (no push-to-main automatic execution)
 *
 * Concurrency, failure, Draft disposition, workflow static inspection, and
 * publication decision logic. Does not enable cron or push triggers.
 */

import {
  filterSourceArchitectureRelevantPaths,
  isGeneratedArchitectureArtifact,
  type ExistingRefreshPr,
} from "./autoRefreshContract";
import {
  AUTO_REFRESH_PILOT_PUBLISHER,
  assertPilotPublisherCannotReadyOrMerge,
  type AutoRefreshPilotPublisher,
} from "./autoRefreshPublisher";
import type { MainRecheckResult } from "./autoRefreshPilot";

export const PERSISTENT_AUTO_REFRESH_DESIGN = "PERSISTENT-AUTO-REFRESH-DESIGN-V1" as const;
export const PERSISTENT_AUTO_REFRESH_MODE = "DISABLED_MODE" as const;

/** Push-to-main / scheduled persistent automation remains off. */
export const PERSISTENT_AUTO_REFRESH_ENABLED = false as const;

export const PERSISTENT_CONCURRENCY_GROUP = "architecture-auto-refresh-main" as const;
export const PERSISTENT_CONCURRENCY_GROUP_EXPRESSION =
  "architecture-auto-refresh-${{ github.repository }}-main" as const;
export const PERSISTENT_CANCEL_IN_PROGRESS = true as const;

export const PERSISTENT_WORKFLOW_PATH =
  ".github/workflows/architecture-auto-refresh.yml" as const;

/** Active triggers in DISABLED-MODE (push/cron must remain absent). */
export const PERSISTENT_ACTIVE_TRIGGERS = ["workflow_dispatch"] as const;

/**
 * Designed preference for a future enablement slice.
 * Scheduler is not selected for V1.
 */
export type PersistentTriggerKind = "push_main" | "workflow_dispatch" | "schedule";

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
  actions: "none",
  idToken: "none",
  packages: "none",
} as const;

/**
 * Draft-only publisher capabilities (reuse pilot publisher; no parallel policy).
 * Platform `pull-requests: write` is broader than these intended capabilities.
 */
export const PERSISTENT_AUTO_REFRESH_PUBLISHER = {
  ...AUTO_REFRESH_PILOT_PUBLISHER,
  canCreateDraft: true,
} as const satisfies AutoRefreshPilotPublisher & { canCreateDraft: true };

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

export type PersistentPublicationDecision =
  | "PUBLISH_DRAFT"
  | "REUSED_EXISTING"
  | "ABORTED_MAIN_MOVED"
  | "NO_PUBLICATION"
  | "HOLD"
  | "OUTCOME_UNKNOWN";

export interface PersistentWorkflowInspection {
  path: typeof PERSISTENT_WORKFLOW_PATH;
  hasWorkflowDispatch: boolean;
  hasPushTrigger: boolean;
  hasScheduleCron: boolean;
  concurrencyGroupExpression: string | null;
  cancelInProgress: boolean | null;
  permissionsContents: string | null;
  permissionsPullRequests: string | null;
  grantsIssuesWrite: boolean;
  grantsActionsWrite: boolean;
  grantsDeploymentsWrite: boolean;
  grantsIdTokenWrite: boolean;
  grantsPackagesWrite: boolean;
  invokesReadyOrMerge: boolean;
  mode: typeof PERSISTENT_AUTO_REFRESH_MODE;
  persistentEnabled: typeof PERSISTENT_AUTO_REFRESH_ENABLED;
}

export interface PersistentAutoRefreshRunReport {
  schemaVersion: "1.0";
  mode: typeof PERSISTENT_AUTO_REFRESH_MODE;
  trigger: "workflow_dispatch" | "manual_cli" | "unknown";
  repository: string;
  runId: string | null;
  observedMain: string | null;
  snapshotGeneratedFrom: string | null;
  changedPaths: string[];
  architectureRelevantPaths: string[];
  refreshRequired: boolean | null;
  refreshIdentity: string | null;
  status: PersistentWorkflowStatus;
  reason: string;
  verification: {
    architectureSnapshot: "PASS" | "FAIL" | "NOT_RUN";
    handoff: "PASS" | "FAIL" | "NOT_RUN";
    verify: "PASS" | "FAIL" | "NOT_RUN";
  };
  duplicateState:
    | "NONE"
    | "REUSE"
    | "SUPERSEDED_CANDIDATE"
    | "NOT_CHECKED"
    | "LOOKUP_FAILED";
  mainRecheck: MainRecheckResult | "NOT_RUN" | "UNAVAILABLE";
  publicationOutcome: PersistentPublicationDecision;
  draftPr: { number: number; url: string; headSha: string } | null;
  mutations: {
    featureBranch: boolean;
    snapshotCommit: boolean;
    draftPrCreated: boolean;
  };
  failureClass: PersistentFailureClass | null;
  approvalActionRequired: false;
  persistentAutoRefreshEnabled: false;
  evaluatedAt: string;
}

export function assertPersistentAutoRefreshNotEnabled(): void {
  if (PERSISTENT_AUTO_REFRESH_ENABLED) {
    throw new Error(
      "PERSISTENT-AUTO-REFRESH-V1 must remain NOT ENABLED (no push-to-main automatic execution)",
    );
  }
}

export function assertPersistentPublisherCannotReadyOrMerge(): void {
  assertPilotPublisherCannotReadyOrMerge(AUTO_REFRESH_PILOT_PUBLISHER);
  if (!PERSISTENT_AUTO_REFRESH_PUBLISHER.canCreateDraft) {
    throw new Error("PERSISTENT-AUTO-REFRESH-V1 Draft creation capability missing");
  }
  if (PERSISTENT_AUTO_REFRESH_PUBLISHER.canMarkReady) {
    throw new Error("PERSISTENT-AUTO-REFRESH-V1 must not authorize Ready");
  }
  if (PERSISTENT_AUTO_REFRESH_PUBLISHER.canMerge) {
    throw new Error("PERSISTENT-AUTO-REFRESH-V1 must not authorize Merge");
  }
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

/**
 * Draft disposition per persistent design.
 *
 * SUPERSEDED_CANDIDATE is report-only: this contract does **not** authorize a
 * new Draft while an obsolete open refresh Draft/Ready remains (fail closed /
 * HOLD at publication). Equivalent identity → REUSE.
 */
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
    | "observation_unavailable"
    | "changed_paths_unavailable"
    | "generator_failed"
    | "handoff_failed"
    | "verification_failed"
    | "main_recheck_unavailable"
    | "duplicate_check_unavailable"
    | "branch_mutation_failed"
    | "commit_push_failed"
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
    case "observation_unavailable":
    case "changed_paths_unavailable":
    case "generator_failed":
    case "handoff_failed":
    case "verification_failed":
    case "main_recheck_unavailable":
    case "duplicate_check_unavailable":
    case "branch_mutation_failed":
    case "commit_push_failed":
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
  if (input.disposition === "SUPERSEDED_CANDIDATE") return "HOLD";
  if (!input.eligible) return "NOT_REQUIRED";
  if (input.disposition === "REUSE") return "REUSED_EXISTING";
  if (input.published) return "DRAFT_OPEN";
  if (input.eligible) return "ELIGIBLE";
  return "IDLE";
}

/**
 * Publication gate combining disposition, main recheck, verification, and failures.
 * Does not invent new Draft authorization while SUPERSEDED_CANDIDATE applies.
 */
export function decidePersistentPublication(input: {
  disposition: PersistentDraftDisposition;
  mainRecheck: MainRecheckResult | "UNAVAILABLE" | "NOT_RUN";
  verificationPassed: boolean;
  materialSnapshotDiff: boolean | null;
  failureClass: PersistentFailureClass | null;
}): { decision: PersistentPublicationDecision; status: PersistentWorkflowStatus; reason: string } {
  if (input.failureClass === "OUTCOME_UNKNOWN") {
    return {
      decision: "OUTCOME_UNKNOWN",
      status: "OUTCOME_UNKNOWN",
      reason: "publication outcome unknown; no blind retry",
    };
  }
  if (input.failureClass === "HOLD") {
    return {
      decision: "HOLD",
      status: "HOLD",
      reason: "failure classified HOLD; no Draft publication",
    };
  }
  if (input.mainRecheck === "UNAVAILABLE" || input.mainRecheck === "NOT_RUN") {
    return {
      decision: "HOLD",
      status: "HOLD",
      reason: "main recheck unavailable; fail closed before publication",
    };
  }
  if (input.mainRecheck === "MOVED") {
    return {
      decision: "ABORTED_MAIN_MOVED",
      status: "ABORTED_MAIN_MOVED",
      reason: "main moved before publication; do not publish stale artifacts",
    };
  }
  if (!input.verificationPassed) {
    return {
      decision: "HOLD",
      status: "FAILED",
      reason: "verification failed; no Draft publication",
    };
  }
  if (input.disposition === "REUSE") {
    return {
      decision: "REUSED_EXISTING",
      status: "REUSED_EXISTING",
      reason: "equivalent refresh identity Draft/Ready already open",
    };
  }
  if (input.disposition === "SUPERSEDED_CANDIDATE") {
    return {
      decision: "HOLD",
      status: "HOLD",
      reason:
        "obsolete open refresh Draft/Ready present (SUPERSEDED_CANDIDATE); no auto-close and no new Draft authorized",
    };
  }
  if (input.disposition === "NO_ACTION") {
    return {
      decision: "NO_PUBLICATION",
      status: "NOT_REQUIRED",
      reason: "not eligible for Draft publication",
    };
  }
  if (input.materialSnapshotDiff === false) {
    return {
      decision: "NO_PUBLICATION",
      status: "NOT_REQUIRED",
      reason: "no material Snapshot diff after regeneration",
    };
  }
  return {
    decision: "PUBLISH_DRAFT",
    status: "ELIGIBLE",
    reason: "NEW_DRAFT_REQUIRED, verification passed, main unchanged, no equivalent Draft",
  };
}

/** Assert generatedFrom.commit equals the exact source main used for generation. */
export function assertGeneratedFromMatchesSourceMain(input: {
  generatedFromCommit: string;
  sourceMainSha: string;
}): void {
  if (input.generatedFromCommit !== input.sourceMainSha) {
    throw new Error(
      `generatedFrom.commit (${input.generatedFromCommit}) must equal source main (${input.sourceMainSha})`,
    );
  }
}

/** Designed concurrency policy projection for tests/docs. */
export function persistentConcurrencyPolicy(): {
  group: typeof PERSISTENT_CONCURRENCY_GROUP;
  groupExpression: typeof PERSISTENT_CONCURRENCY_GROUP_EXPRESSION;
  cancelInProgress: typeof PERSISTENT_CANCEL_IN_PROGRESS;
} {
  return {
    group: PERSISTENT_CONCURRENCY_GROUP,
    groupExpression: PERSISTENT_CONCURRENCY_GROUP_EXPRESSION,
    cancelInProgress: PERSISTENT_CANCEL_IN_PROGRESS,
  };
}

/**
 * Static inspection of the DISABLED-MODE workflow YAML text.
 * Uses conservative string checks (no YAML dependency).
 */
export function inspectPersistentWorkflowYaml(yaml: string): PersistentWorkflowInspection {
  const withoutComments = yaml
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

  const hasWorkflowDispatch = /^\s*workflow_dispatch\s*:/m.test(withoutComments);
  // Active push trigger only if an uncommented `push:` appears under `on:`.
  const hasPushTrigger = /^\s*push\s*:/m.test(withoutComments);
  const hasScheduleCron =
    /^\s*schedule\s*:/m.test(withoutComments) || /^\s*-\s*cron\s*:/m.test(withoutComments);

  const concurrencyMatch = withoutComments.match(
    /concurrency:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+group:\s*([^\n]+)/,
  );
  const concurrencyGroupExpression = concurrencyMatch?.[1]?.trim() ?? null;

  const cancelMatch = withoutComments.match(/cancel-in-progress:\s*(true|false)/);
  const cancelInProgress = cancelMatch ? cancelMatch[1] === "true" : null;

  const contentsMatch = withoutComments.match(/^\s*contents:\s*(\w+)/m);
  const prMatch = withoutComments.match(/^\s*pull-requests:\s*(\w+)/m);

  const grantsIssuesWrite = /^\s*issues:\s*write\b/m.test(withoutComments);
  const grantsActionsWrite = /^\s*actions:\s*write\b/m.test(withoutComments);
  const grantsDeploymentsWrite = /^\s*deployments:\s*write\b/m.test(withoutComments);
  const grantsIdTokenWrite = /^\s*id-token:\s*write\b/m.test(withoutComments);
  const grantsPackagesWrite = /^\s*packages:\s*write\b/m.test(withoutComments);

  const invokesReadyOrMerge =
    /gh\s+pr\s+ready/.test(withoutComments) ||
    /gh\s+pr\s+merge/.test(withoutComments) ||
    /auto-merge/.test(withoutComments);

  return {
    path: PERSISTENT_WORKFLOW_PATH,
    hasWorkflowDispatch,
    hasPushTrigger,
    hasScheduleCron,
    concurrencyGroupExpression,
    cancelInProgress,
    permissionsContents: contentsMatch?.[1] ?? null,
    permissionsPullRequests: prMatch?.[1] ?? null,
    grantsIssuesWrite,
    grantsActionsWrite,
    grantsDeploymentsWrite,
    grantsIdTokenWrite,
    grantsPackagesWrite,
    invokesReadyOrMerge,
    mode: PERSISTENT_AUTO_REFRESH_MODE,
    persistentEnabled: PERSISTENT_AUTO_REFRESH_ENABLED,
  };
}

export function assertDisabledModeWorkflow(inspection: PersistentWorkflowInspection): void {
  if (!inspection.hasWorkflowDispatch) {
    throw new Error("DISABLED-MODE workflow must include workflow_dispatch");
  }
  if (inspection.hasPushTrigger) {
    throw new Error("DISABLED-MODE workflow must not include push trigger");
  }
  if (inspection.hasScheduleCron) {
    throw new Error("DISABLED-MODE workflow must not include cron/schedule");
  }
  if (inspection.persistentEnabled) {
    throw new Error("DISABLED-MODE must keep PERSISTENT_AUTO_REFRESH_ENABLED=false");
  }
  if (inspection.concurrencyGroupExpression !== PERSISTENT_CONCURRENCY_GROUP_EXPRESSION) {
    throw new Error("DISABLED-MODE workflow concurrency group mismatch");
  }
  if (inspection.cancelInProgress !== true) {
    throw new Error("DISABLED-MODE workflow must set cancel-in-progress: true");
  }
  if (inspection.permissionsContents !== "write") {
    throw new Error("DISABLED-MODE workflow contents permission must be write");
  }
  if (inspection.permissionsPullRequests !== "write") {
    throw new Error("DISABLED-MODE workflow pull-requests permission must be write");
  }
  if (
    inspection.grantsIssuesWrite ||
    inspection.grantsActionsWrite ||
    inspection.grantsDeploymentsWrite ||
    inspection.grantsIdTokenWrite ||
    inspection.grantsPackagesWrite
  ) {
    throw new Error("DISABLED-MODE workflow grants excess permissions");
  }
  if (inspection.invokesReadyOrMerge) {
    throw new Error("DISABLED-MODE workflow must not Ready/Merge/auto-merge");
  }
}
