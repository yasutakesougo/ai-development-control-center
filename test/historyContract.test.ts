import { describe, expect, it } from "vitest";
import {
  appendHistoryEvent,
  applyHistoryToRefreshEligibility,
  assertHistoryWriterNotImplemented,
  buildHistoryEventId,
  createHistoryCorrection,
  createHistoryEvent,
  effectiveHistoryEvents,
  HISTORY_BOOTSTRAP_MERGE_COMMIT,
  HISTORY_BOOTSTRAP_PR,
  HISTORY_IMPLEMENTED,
  HISTORY_WRITER_IMPLEMENTED,
  historyCreatesApprovalActionRequired,
  proposedHistoryStoragePath,
  resolveCurrentRefreshPrState,
  sortHistoryEvents,
  type HistoryEvent,
} from "../src/domain/historyContract";

const repo = "yasutakesougo/ai-development-control-center";
const from = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const main = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const identity = `${repo}::${from}::${main}::ARCH-SNAPSHOT-GEN-V1`;

function baseEvent(
  partial: Partial<HistoryEvent> & Pick<HistoryEvent, "eventType" | "occurredAt" | "recordedAt">,
): HistoryEvent {
  return createHistoryEvent({
    repository: repo,
    evidence: ["commit:test"],
    evidenceConfidence: "CONFIRMED",
    ...partial,
  });
}

describe("HISTORY-V1 design contract", () => {
  it("remains DESIGNED with no persistence writer", () => {
    expect(HISTORY_IMPLEMENTED).toBe(false);
    expect(HISTORY_WRITER_IMPLEMENTED).toBe(false);
    expect(() => assertHistoryWriterNotImplemented()).not.toThrow();
    expect(proposedHistoryStoragePath()).toBe("docs/history/architecture-history.jsonl");
    expect(HISTORY_BOOTSTRAP_MERGE_COMMIT).toBe(
      "46fcbc3fe7d2c617fbad82a5585bb8313268574e",
    );
    expect(HISTORY_BOOTSTRAP_PR).toBe(28);
  });

  it("append-only: new event is appended; store is not mutated in place", () => {
    const store: HistoryEvent[] = [];
    const event = baseEvent({
      eventType: "SNAPSHOT_GENERATED",
      snapshotGeneratedFrom: from,
      occurredAt: "2026-08-12T04:00:00.000Z",
      recordedAt: "2026-08-12T04:00:01.000Z",
    });
    const first = appendHistoryEvent(store, event);
    expect(first.outcome).toBe("APPENDED");
    expect(first.store).toHaveLength(1);
    expect(store).toHaveLength(0);
  });

  it("duplicate event rejected/no-op (workflow run ID dedupe)", () => {
    const a = baseEvent({
      eventType: "REFRESH_NOT_REQUIRED",
      workflowRunId: "31561500637",
      status: "NOT_REQUIRED",
      refreshIdentity: identity,
      occurredAt: "2026-08-12T03:53:57.000Z",
      recordedAt: "2026-08-12T03:53:57.000Z",
    });
    const b = baseEvent({
      eventType: "REFRESH_NOT_REQUIRED",
      workflowRunId: "31561500637",
      status: "NOT_REQUIRED",
      refreshIdentity: identity,
      occurredAt: "2026-08-12T03:54:00.000Z",
      recordedAt: "2026-08-12T03:54:00.000Z",
    });
    expect(a.eventId).toBe(b.eventId);
    expect(a.eventId).toContain("workflowRunId=31561500637");

    const once = appendHistoryEvent([], a);
    const twice = appendHistoryEvent(once.store, b);
    expect(twice.outcome).toBe("DUPLICATE_NOOP");
    expect(twice.store).toHaveLength(1);
  });

  it("merged PR can be linked to refresh identity via REFRESH_MERGED dedupe", () => {
    const mergeCommit = "d0100a1626ca5b6bf2078b2af257a857bfbbca3a";
    const event = baseEvent({
      eventType: "REFRESH_MERGED",
      mergeCommit,
      draftPr: { number: 27 },
      refreshIdentity: identity,
      occurredAt: "2026-08-12T03:43:53.000Z",
      recordedAt: "2026-08-12T04:15:00.000Z",
    });
    expect(event.eventId).toContain(`mergeCommit=${mergeCommit}`);
    expect(event.refreshIdentity).toBe(identity);
    expect(event.draftPr?.number).toBe(27);
  });

  it("correction uses supersedesEventId and does not rewrite prior event", () => {
    const prior = baseEvent({
      eventType: "REFRESH_ELIGIBLE",
      refreshIdentity: identity,
      status: "ELIGIBLE",
      occurredAt: "2026-08-12T03:00:00.000Z",
      recordedAt: "2026-08-12T03:00:00.000Z",
    });
    const correction = createHistoryCorrection({
      repository: repo,
      supersedesEventId: prior.eventId,
      reason: "prior eligibility observation was PARTIAL; corrected after live recheck",
      occurredAt: "2026-08-12T03:00:00.000Z",
      recordedAt: "2026-08-12T04:20:00.000Z",
      evidence: [`supersedes:${prior.eventId}`],
      evidenceConfidence: "CONFIRMED",
      patches: { status: "NOT_REQUIRED" },
    });
    expect(correction.eventType).toBe("HISTORY_CORRECTION");
    expect(correction.supersedesEventId).toBe(prior.eventId);
    expect(correction.evidenceConfidence).toBe("CONFIRMED");
    expect(correction.eventId).not.toBe(prior.eventId);

    const store = appendHistoryEvent([], prior).store;
    const withCorrection = appendHistoryEvent(store, correction).store;
    expect(withCorrection).toHaveLength(2);
    expect(withCorrection[0]).toEqual(prior);
    expect(effectiveHistoryEvents(withCorrection).map((e) => e.eventId)).toEqual([
      correction.eventId,
    ]);
  });

  it("UNKNOWN / OUTCOME_UNKNOWN preserved; OUTCOME_UNKNOWN not upgraded", () => {
    const unknown = baseEvent({
      eventType: "REFRESH_OUTCOME_UNKNOWN",
      workflowRunId: "999",
      status: "OUTCOME_UNKNOWN",
      evidenceConfidence: "OUTCOME_UNKNOWN",
      occurredAt: "2026-08-12T04:00:00.000Z",
      recordedAt: "2026-08-12T04:00:00.000Z",
      evidence: ["workflowRun:999"],
    });
    expect(unknown.evidenceConfidence).toBe("OUTCOME_UNKNOWN");
    expect(unknown.eventType).toBe("REFRESH_OUTCOME_UNKNOWN");
  });

  it("late-discovered event ordering uses occurredAt then eventId", () => {
    const late = baseEvent({
      eventType: "SNAPSHOT_BECAME_STALE",
      refreshIdentity: identity,
      status: "STALE",
      occurredAt: "2026-08-12T03:10:00.000Z",
      recordedAt: "2026-08-12T04:30:00.000Z",
      architectureRelevantPaths: ["package.json"],
      reason: "discovered late from git range",
      evidenceConfidence: "PARTIAL",
    });
    const early = baseEvent({
      eventType: "SNAPSHOT_GENERATED",
      snapshotGeneratedFrom: from,
      occurredAt: "2026-08-12T03:00:00.000Z",
      recordedAt: "2026-08-12T03:00:00.000Z",
    });
    const sorted = sortHistoryEvents([late, early]);
    expect(sorted.map((e) => e.eventType)).toEqual([
      "SNAPSHOT_GENERATED",
      "SNAPSHOT_BECAME_STALE",
    ]);
    expect(sorted[1].recordedAt > sorted[1].occurredAt).toBe(true);
  });

  it("history does not create ACTION_REQUIRED", () => {
    const events = [
      baseEvent({
        eventType: "SNAPSHOT_BECAME_STALE",
        occurredAt: "2026-08-12T03:10:00.000Z",
        recordedAt: "2026-08-12T03:10:00.000Z",
        architectureRelevantPaths: ["package.json"],
      }),
      baseEvent({
        eventType: "REFRESH_ELIGIBLE",
        refreshIdentity: identity,
        status: "ELIGIBLE",
        occurredAt: "2026-08-12T03:11:00.000Z",
        recordedAt: "2026-08-12T03:11:00.000Z",
      }),
    ];
    expect(historyCreatesApprovalActionRequired(events)).toBe(false);
  });

  it("history does not change refresh eligibility when live evidence exists", () => {
    const live = { refreshRequired: false as boolean | null, status: "CURRENT" };
    const history = [
      baseEvent({
        eventType: "REFRESH_ELIGIBLE",
        refreshIdentity: identity,
        status: "ELIGIBLE",
        occurredAt: "2026-08-12T03:11:00.000Z",
        recordedAt: "2026-08-12T03:11:00.000Z",
      }),
    ];
    expect(applyHistoryToRefreshEligibility(live, history)).toEqual(live);
    expect(applyHistoryToRefreshEligibility(live, history).refreshRequired).toBe(false);
  });

  it("current live state overrides stale historical state", () => {
    expect(
      resolveCurrentRefreshPrState({
        historicalDraftOpen: true,
        livePrState: "MERGED",
      }),
    ).toBe("MERGED");
    expect(
      resolveCurrentRefreshPrState({
        historicalDraftOpen: true,
        livePrState: "OPEN_DRAFT",
      }),
    ).toBe("OPEN_DRAFT");
  });

  it("deterministic eventId is stable for identical workflow-run facts", () => {
    const id1 = buildHistoryEventId({
      repository: repo,
      eventType: "REFRESH_NOT_REQUIRED",
      workflowRunId: "31561520227",
    });
    const id2 = buildHistoryEventId({
      repository: repo,
      eventType: "REFRESH_NOT_REQUIRED",
      workflowRunId: "31561520227",
    });
    expect(id1).toBe(id2);
    expect(id1.startsWith(`history-v1::${repo}::`)).toBe(true);
  });
});
