/**
 * STATUS-OVERLAY-V1 observation types.
 *
 * Read-only evidence shapes for the GitHub / workflow observer.
 * No mutation capabilities are defined on these interfaces.
 */

import type { StatusOverlayGeneratorInput } from "../domain/statusOverlayGenerator";

export const STATUS_OVERLAY_OBSERVER_IMPLEMENTED = true as const;
export const STATUS_OVERLAY_OBSERVER_DESIGN = "STATUS-OVERLAY-OBSERVER-V1" as const;

export const STATUS_OVERLAY_AUTO_REFRESH_WORKFLOW =
  "architecture-auto-refresh.yml" as const;

/** Raw open-PR evidence from a read-only GitHub adapter. */
export interface StatusOverlayObservedPull {
  number: number;
  title: string;
  draft: boolean;
  /** null/undefined → UNKNOWN in generator input */
  mergeable?: boolean | null;
  headSha?: string | null;
  baseRef?: string | null;
  headRef?: string | null;
  body?: string | null;
  /** null/undefined/empty → UNKNOWN */
  reviewState?: string | null;
  /** null/undefined/empty → UNKNOWN */
  ciState?: string | null;
}

/** Raw workflow-run evidence from a read-only Actions adapter. */
export interface StatusOverlayObservedWorkflowRun {
  id: string;
  status: string;
  conclusion?: string | null;
  headSha?: string | null;
  event?: string | null;
  /** Optional parsed fields when available from run metadata/logs */
  lastEvaluation?: string | null;
  lastPublicationOutcome?: string | null;
}

/**
 * Narrow read-only GitHub/Actions client.
 * Implementations must use GET-only APIs and must not expose mutation methods.
 */
export interface StatusOverlayReadonlyGithubClient {
  getDefaultBranchTip(repository: string): Promise<{ defaultBranch: string; sha: string }>;
  listOpenPullRequests(repository: string): Promise<StatusOverlayObservedPull[]>;
  listWorkflowRuns(
    repository: string,
    workflowFileName: string,
  ): Promise<StatusOverlayObservedWorkflowRun[]>;
}

/** Repository-native metadata supplied by the caller (not fetched by the client). */
export interface StatusOverlayLocalObservation {
  snapshotGeneratedFrom: string | null;
  snapshotStale: boolean | null;
  snapshotStaleClassification: string | null;
  architectureRelevantChanges?: string[];
  handoffNextActionStatus: "NO_ACTION" | "ACTION_REQUIRED" | "UNKNOWN" | null;
  handoffStaleClassification?: string | null;
  /** Persistent AUTO-REFRESH workflow YAML text for trigger/enablement inspection. */
  persistentWorkflowYaml?: string | null;
  /** Historical claim only — never overrides live open PRs. */
  historicalDraftOpen?: boolean;
  /** Historical active refresh PR number — ignored unless it matches live REFRESH_DRAFT. */
  historicalActiveRefreshPr?: number | null;
  holds?: string[];
  unknowns?: string[];
}

export interface StatusOverlayObserveParams {
  repository: string;
  client: StatusOverlayReadonlyGithubClient;
  local: StatusOverlayLocalObservation;
  /**
   * Clock injection for `observedAt`. Called once per observation.
   * Production callers may pass `() => new Date().toISOString()`.
   */
  now: () => string;
  workflowFileName?: string;
}

export type StatusOverlayObservationResult = StatusOverlayGeneratorInput;
