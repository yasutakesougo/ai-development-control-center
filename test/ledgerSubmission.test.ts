import { describe, expect, it } from "vitest";
import {
  applyLedgerOutcome,
  beginLedgerSubmission,
  classifyLedgerResponse,
  retryableAttempt,
  type LedgerRecordSummary,
  type LedgerSubmissionAttempt,
} from "../src/domain/ledgerSubmission";

const RECORD: LedgerRecordSummary = {
  recordId: "rec-1",
  repository: "yasutakesougo/severe-behavior-support-spfx",
  sourceRefs: ["https://github.com/o/r/pull/7"],
  intent: "APPROVE",
  recordedAt: "2026-08-11T10:01:00.000Z",
  observedAt: "2026-08-11T10:00:00.000Z",
  decisionFingerprint: "f".repeat(64),
  submissionState: "RECORDED",
  externalEffect: false,
};

function makeAttempt(): LedgerSubmissionAttempt {
  return beginLedgerSubmission("APPROVE", "f".repeat(64), () => "key-fixed")!;
}

describe("beginLedgerSubmission", () => {
  it("generates one idempotency key per submission attempt", () => {
    let count = 0;
    const generate = () => `key-${++count}`;
    const first = beginLedgerSubmission("APPROVE", "fp", generate);
    const second = beginLedgerSubmission("REJECT", "fp", generate);

    expect(first?.idempotencyKey).toBe("key-1");
    expect(second?.idempotencyKey).toBe("key-2");
    expect(first?.intent).toBe("APPROVE");
    expect(first?.expectedDecisionFingerprint).toBe("fp");
  });

  it("defaults to crypto.randomUUID for key generation", () => {
    const attempt = beginLedgerSubmission("DEFER", "fp");
    expect(attempt?.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("refuses to build an attempt without a server-provided fingerprint", () => {
    expect(beginLedgerSubmission("APPROVE", null)).toBeNull();
    expect(beginLedgerSubmission("APPROVE", undefined)).toBeNull();
    expect(beginLedgerSubmission("APPROVE", "")).toBeNull();
  });
});

describe("classifyLedgerResponse", () => {
  it("classifies a recorded result", () => {
    const outcome = classifyLedgerResponse(201, { recorded: true, replayed: false, record: RECORD });
    expect(outcome).toEqual({ kind: "RECORDED", replayed: false, record: RECORD });
  });

  it("classifies an idempotent replay", () => {
    const outcome = classifyLedgerResponse(200, { recorded: true, replayed: true, record: RECORD });
    expect(outcome.kind).toBe("RECORDED");
    if (outcome.kind === "RECORDED") expect(outcome.replayed).toBe(true);
  });

  it("treats a malformed success payload as UNKNOWN_RESULT (safe to retry with same key)", () => {
    expect(classifyLedgerResponse(200, null).kind).toBe("UNKNOWN_RESULT");
    expect(classifyLedgerResponse(201, { recorded: true }).kind).toBe("UNKNOWN_RESULT");
    expect(
      classifyLedgerResponse(201, {
        recorded: true,
        record: { ...RECORD, externalEffect: true },
      }).kind,
    ).toBe("UNKNOWN_RESULT");
  });

  it("classifies 409 refusals", () => {
    expect(classifyLedgerResponse(409, { error: "STALE_DECISION" }).kind).toBe("STALE_DECISION");
    expect(classifyLedgerResponse(409, { error: "NO_RECORDABLE_DECISION" }).kind).toBe(
      "NO_RECORDABLE_DECISION",
    );
    expect(classifyLedgerResponse(409, { error: "IDEMPOTENCY_CONFLICT" }).kind).toBe(
      "IDEMPOTENCY_CONFLICT",
    );
  });

  it("classifies auth and availability failures", () => {
    expect(classifyLedgerResponse(401, { error: "UNAUTHENTICATED" }).kind).toBe("UNAUTHENTICATED");
    expect(classifyLedgerResponse(403, { error: "FORBIDDEN" }).kind).toBe("FORBIDDEN");
    expect(classifyLedgerResponse(503, { error: "LEDGER_UNAVAILABLE" }).kind).toBe("LEDGER_UNAVAILABLE");
  });

  it("classifies 5xx as UNKNOWN_RESULT", () => {
    expect(classifyLedgerResponse(500, null).kind).toBe("UNKNOWN_RESULT");
    expect(classifyLedgerResponse(502, "bad gateway").kind).toBe("UNKNOWN_RESULT");
  });
});

describe("applyLedgerOutcome", () => {
  it("RECORDED shows the record and refreshes state", () => {
    const attempt = makeAttempt();
    const effect = applyLedgerOutcome(attempt, { kind: "RECORDED", replayed: false, record: RECORD });

    expect(effect.state).toEqual({ phase: "RECORDED", record: RECORD, replayed: false });
    expect(effect.discardIntent).toBe(true);
    expect(effect.refreshStatus).toBe(true);
  });

  it("STALE_DECISION discards the stale local intent and refreshes status (no auto-resubmit)", () => {
    const attempt = makeAttempt();
    const effect = applyLedgerOutcome(attempt, { kind: "STALE_DECISION" });

    expect(effect.state).toEqual({ phase: "STALE" });
    expect(effect.discardIntent).toBe(true);
    expect(effect.refreshStatus).toBe(true);
    // No retry attempt is preserved: the Human must choose again.
    expect(retryableAttempt(effect.state)).toBeNull();
  });

  it("UNKNOWN_RESULT keeps the SAME attempt (same idempotency key) for manual retry", () => {
    const attempt = makeAttempt();
    const effect = applyLedgerOutcome(attempt, { kind: "UNKNOWN_RESULT" });

    expect(effect.state.phase).toBe("RETRYABLE");
    expect(effect.discardIntent).toBe(false);
    const retry = retryableAttempt(effect.state);
    expect(retry).toBe(attempt);
    expect(retry?.idempotencyKey).toBe("key-fixed");
  });

  it("IDEMPOTENCY_CONFLICT requires starting over (no retry with the same key)", () => {
    const attempt = makeAttempt();
    const effect = applyLedgerOutcome(attempt, { kind: "IDEMPOTENCY_CONFLICT" });

    expect(effect.state).toEqual({ phase: "REFUSED", code: "IDEMPOTENCY_CONFLICT" });
    expect(effect.discardIntent).toBe(true);
    expect(retryableAttempt(effect.state)).toBeNull();
  });

  it("auth failures do not discard the local intent (Human may re-authenticate)", () => {
    const attempt = makeAttempt();
    for (const kind of ["UNAUTHENTICATED", "FORBIDDEN"] as const) {
      const effect = applyLedgerOutcome(attempt, { kind });
      expect(effect.state).toEqual({ phase: "REFUSED", code: kind });
      expect(effect.discardIntent).toBe(false);
      expect(retryableAttempt(effect.state)).toBeNull();
    }
  });
});
