/**
 * HISTORY-V1 design contract helpers.
 *
 * DESIGNED · NOT IMPLEMENTED · NO PERSISTENCE WRITER
 *
 * Append-only event identity, dedupe, supersession, ordering, and separation
 * from HANDOFF / AUTO-REFRESH. Does not write history files or mutate GitHub.
 */

export const HISTORY_SCHEMA_VERSION = "1.0" as const;
export const HISTORY_DESIGN = "HISTORY-DESIGN-V1" as const;

/** Persistence / emission writer remains unimplemented in this design-only slice. */
export const HISTORY_WRITER_IMPLEMENTED = false as const;
export const HISTORY_IMPLEMENTED = false as const;

/**
 * Bootstrap boundary: Persistent AUTO-REFRESH enablement completion (PR #28 merge).
 * Older repository history is outside HISTORY-V1 unless explicitly backfilled later.
 */
export const HISTORY_BOOTSTRAP_MERGE_COMMIT =
  "46fcbc3fe7d2c617fbad82a5585bb8313268574e" as const;
export const HISTORY_BOOTSTRAP_PR = 28 as const;

export type HistoryEventType =
  | "SNAPSHOT_GENERATED"
  | "SNAPSHOT_BECAME_STALE"
  | "REFRESH_EVALUATED"
  | "REFRESH_NOT_REQUIRED"
  | "REFRESH_ELIGIBLE"
  | "REFRESH_DRAFT_CREATED"
  | "REFRESH_REUSED_EXISTING"
  | "REFRESH_ABORTED_MAIN_MOVED"
  | "REFRESH_FAILED"
  | "REFRESH_OUTCOME_UNKNOWN"
  | "REFRESH_MERGED"
  | "LIFECYCLE_CONVERGED"
  | "HISTORY_CORRECTION";

export type HistoryEvidenceConfidence =
  | "CONFIRMED"
  | "PARTIAL"
  | "UNKNOWN"
  | "OUTCOME_UNKNOWN";

export interface HistoryDraftPrRef {
  number: number;
  url?: string;
  headSha?: string;
}

export interface HistoryEvent {
  eventId: string;
  schemaVersion: typeof HISTORY_SCHEMA_VERSION;
  eventType: HistoryEventType;
  repository: string;
  observedMain?: string | null;
  snapshotGeneratedFrom?: string | null;
  refreshIdentity?: string | null;
  sourcePaths?: string[];
  architectureRelevantPaths?: string[];
  status?: string | null;
  reason?: string | null;
  draftPr?: HistoryDraftPrRef | null;
  prHead?: string | null;
  mergeCommit?: string | null;
  workflowRunId?: string | null;
  occurredAt: string;
  recordedAt: string;
  supersedesEventId?: string | null;
  evidence: string[];
  evidenceConfidence: HistoryEvidenceConfidence;
}

export type HistoryAppendResult =
  | { outcome: "APPENDED"; store: HistoryEvent[] }
  | { outcome: "DUPLICATE_NOOP"; store: HistoryEvent[] };

/** Terminal refresh-related types eligible for identity+status dedupe. */
export const HISTORY_TERMINAL_REFRESH_TYPES: readonly HistoryEventType[] = [
  "REFRESH_NOT_REQUIRED",
  "REFRESH_ELIGIBLE",
  "REFRESH_FAILED",
  "REFRESH_OUTCOME_UNKNOWN",
  "REFRESH_ABORTED_MAIN_MOVED",
  "REFRESH_REUSED_EXISTING",
  "LIFECYCLE_CONVERGED",
] as const;

export function assertHistoryWriterNotImplemented(): void {
  if (HISTORY_WRITER_IMPLEMENTED || HISTORY_IMPLEMENTED) {
    throw new Error("HISTORY-V1 writer must remain NOT IMPLEMENTED in design-only state");
  }
}

/**
 * Build deterministic dedupe key material (without repository prefix).
 * Corrections always include supersedesEventId + recordedAt (never silent dedupe).
 */
export function buildHistoryDedupeKey(input: {
  eventType: HistoryEventType;
  workflowRunId?: string | null;
  mergeCommit?: string | null;
  draftPrNumber?: number | null;
  refreshIdentity?: string | null;
  status?: string | null;
  snapshotGeneratedFrom?: string | null;
  supersedesEventId?: string | null;
  recordedAt?: string | null;
}): string {
  if (input.eventType === "HISTORY_CORRECTION") {
    const prior = input.supersedesEventId ?? "none";
    const recordedAt = input.recordedAt ?? "unspecified";
    return `correction::supersedes=${prior}::recordedAt=${recordedAt}`;
  }

  if (input.workflowRunId) {
    return `workflowRunId=${input.workflowRunId}::eventType=${input.eventType}`;
  }

  if (input.eventType === "REFRESH_MERGED" && input.mergeCommit) {
    return `mergeCommit=${input.mergeCommit}::eventType=REFRESH_MERGED`;
  }

  if (input.eventType === "REFRESH_DRAFT_CREATED" && input.draftPrNumber != null) {
    return `draftPr=${input.draftPrNumber}::eventType=REFRESH_DRAFT_CREATED`;
  }

  if (
    (HISTORY_TERMINAL_REFRESH_TYPES as readonly string[]).includes(input.eventType) &&
    input.refreshIdentity &&
    input.status
  ) {
    return `refreshIdentity=${input.refreshIdentity}::eventType=${input.eventType}::status=${input.status}`;
  }

  if (input.eventType === "SNAPSHOT_GENERATED" && input.snapshotGeneratedFrom) {
    return `snapshotGeneratedFrom=${input.snapshotGeneratedFrom}::eventType=SNAPSHOT_GENERATED`;
  }

  // Fail closed: insufficient identity material → require unique recordedAt binding.
  // Callers should prefer providing stronger keys; this path is for PARTIAL/UNKNOWN facts.
  const recordedAt = input.recordedAt ?? "unspecified";
  return `partial::eventType=${input.eventType}::recordedAt=${recordedAt}`;
}

export function buildHistoryEventId(input: {
  repository: string;
  eventType: HistoryEventType;
  workflowRunId?: string | null;
  mergeCommit?: string | null;
  draftPrNumber?: number | null;
  refreshIdentity?: string | null;
  status?: string | null;
  snapshotGeneratedFrom?: string | null;
  supersedesEventId?: string | null;
  recordedAt?: string | null;
}): string {
  const key = buildHistoryDedupeKey(input);
  return `history-v1::${input.repository}::${key}`;
}

export function createHistoryEvent(
  input: Omit<HistoryEvent, "eventId" | "schemaVersion"> & { eventId?: string },
): HistoryEvent {
  const eventId =
    input.eventId ??
    buildHistoryEventId({
      repository: input.repository,
      eventType: input.eventType,
      workflowRunId: input.workflowRunId,
      mergeCommit: input.mergeCommit,
      draftPrNumber: input.draftPr?.number,
      refreshIdentity: input.refreshIdentity,
      status: input.status,
      snapshotGeneratedFrom: input.snapshotGeneratedFrom,
      supersedesEventId: input.supersedesEventId,
      recordedAt: input.recordedAt,
    });

  return {
    ...input,
    eventId,
    schemaVersion: HISTORY_SCHEMA_VERSION,
  };
}

/** Append-only: duplicates with the same eventId are rejected as no-ops. */
export function appendHistoryEvent(
  store: readonly HistoryEvent[],
  event: HistoryEvent,
): HistoryAppendResult {
  if (store.some((existing) => existing.eventId === event.eventId)) {
    return { outcome: "DUPLICATE_NOOP", store: [...store] };
  }
  return { outcome: "APPENDED", store: [...store, event] };
}

/**
 * Corrections must append a new event referencing supersedesEventId.
 * Never mutate the prior event in place.
 */
export function createHistoryCorrection(input: {
  repository: string;
  supersedesEventId: string;
  reason: string;
  occurredAt: string;
  recordedAt: string;
  evidence: string[];
  evidenceConfidence?: HistoryEvidenceConfidence;
  patches?: Partial<
    Pick<
      HistoryEvent,
      | "status"
      | "reason"
      | "observedMain"
      | "snapshotGeneratedFrom"
      | "refreshIdentity"
      | "draftPr"
      | "mergeCommit"
      | "workflowRunId"
    >
  >;
}): HistoryEvent {
  return createHistoryEvent({
    eventType: "HISTORY_CORRECTION",
    repository: input.repository,
    supersedesEventId: input.supersedesEventId,
    reason: input.reason,
    occurredAt: input.occurredAt,
    recordedAt: input.recordedAt,
    evidence: input.evidence,
    evidenceConfidence: input.evidenceConfidence ?? "CONFIRMED",
    ...input.patches,
  });
}

/** Canonical ordering: occurredAt asc, then eventId asc. */
export function sortHistoryEvents(events: readonly HistoryEvent[]): HistoryEvent[] {
  return [...events].sort((a, b) => {
    if (a.occurredAt < b.occurredAt) return -1;
    if (a.occurredAt > b.occurredAt) return 1;
    if (a.eventId < b.eventId) return -1;
    if (a.eventId > b.eventId) return 1;
    return 0;
  });
}

/** Effective view: drop events whose eventId is referenced by a later correction. */
export function effectiveHistoryEvents(events: readonly HistoryEvent[]): HistoryEvent[] {
  const superseded = new Set(
    events
      .filter((e) => e.eventType === "HISTORY_CORRECTION" && e.supersedesEventId)
      .map((e) => e.supersedesEventId as string),
  );
  return sortHistoryEvents(events.filter((e) => !superseded.has(e.eventId)));
}

/**
 * Live GitHub/git state wins for current classification.
 * History may describe earlier observations but must not override live facts.
 */
export function resolveCurrentRefreshPrState(input: {
  historicalDraftOpen: boolean;
  livePrState: "OPEN_DRAFT" | "OPEN_READY" | "MERGED" | "CLOSED" | "MISSING";
}): "OPEN_DRAFT" | "OPEN_READY" | "MERGED" | "CLOSED" | "MISSING" {
  return input.livePrState;
}

/**
 * HISTORY existence must never manufacture HANDOFF approval ACTION_REQUIRED.
 * Always returns false for the approval mapping from history alone.
 */
export function historyCreatesApprovalActionRequired(_events: readonly HistoryEvent[]): false {
  return false;
}

/**
 * Refresh eligibility must not depend solely on HISTORY when live evidence exists.
 * Returns the live eligibility decision unchanged.
 */
export function applyHistoryToRefreshEligibility<T extends { refreshRequired: boolean | null }>(
  liveEvaluation: T,
  _history: readonly HistoryEvent[],
): T {
  return liveEvaluation;
}

/** Bootstrap gate: only commits at/after bootstrap belong in V1 by default. */
export function isWithinHistoryBootstrap(commitSha: string, bootstrapSha: string = HISTORY_BOOTSTRAP_MERGE_COMMIT): boolean {
  // Design helper: equality with bootstrap or explicit caller-provided ancestry check.
  // Full git ancestry is a future writer concern; contract exposes the boundary constant.
  return commitSha === bootstrapSha;
}

export function proposedHistoryStoragePath(): "docs/history/architecture-history.jsonl" {
  return "docs/history/architecture-history.jsonl";
}
