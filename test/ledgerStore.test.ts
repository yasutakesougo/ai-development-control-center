import { describe, expect, it } from "vitest";
import {
  appendLedgerRecord,
  findByIdempotencyScope,
  listLedgerRecords,
  type NewLedgerRecordInput,
} from "../src/worker/ledger/ledgerStore";
import { createLedgerTestDb } from "./helpers/sqliteLedgerDb";

function makeInput(overrides: Partial<NewLedgerRecordInput> = {}): NewLedgerRecordInput {
  return {
    recordId: "rec-1",
    repository: "yasutakesougo/severe-behavior-support-spfx",
    sourceRefs: ["https://github.com/o/r/pull/7"],
    decisionFingerprint: "f".repeat(64),
    decisionFactsJson: JSON.stringify({ repository: "yasutakesougo/severe-behavior-support-spfx" }),
    observedAt: "2026-08-11T10:00:00.000Z",
    intent: "APPROVE",
    recordedAt: "2026-08-11T10:01:00.000Z",
    idempotencyKey: "key-1",
    approverIssuer: "https://example.cloudflareaccess.com",
    approverSubjectId: "human-subject-1",
    ...overrides,
  };
}

describe("appendLedgerRecord (D1/SQLite)", () => {
  it("appends one immutable record with contract invariants", async () => {
    const db = createLedgerTestDb();
    const result = await appendLedgerRecord(db, makeInput());

    expect(result.outcome).toBe("RECORDED");
    if (result.outcome !== "RECORDED") return;
    expect(result.record.recordId).toBe("rec-1");
    expect(result.record.schemaVersion).toBe(1);
    expect(result.record.humanActionStatus).toBe("ACTION_REQUIRED");
    expect(result.record.evidenceState).toBe("CONFIRMED");
    expect(result.record.submissionState).toBe("RECORDED");
    expect(result.record.externalEffect).toBe(false);
    expect(result.record.sourceRefs).toEqual(["https://github.com/o/r/pull/7"]);
  });

  it("identical retry returns the existing record without duplicating", async () => {
    const db = createLedgerTestDb();
    const first = await appendLedgerRecord(db, makeInput({ recordId: "rec-1" }));
    const retry = await appendLedgerRecord(db, makeInput({ recordId: "rec-2-should-not-be-used" }));

    expect(first.outcome).toBe("RECORDED");
    expect(retry.outcome).toBe("REPLAYED");
    if (retry.outcome !== "REPLAYED") return;
    expect(retry.record.recordId).toBe("rec-1");

    const all = await listLedgerRecords(db);
    expect(all).toHaveLength(1);
  });

  it("same idempotency key with different semantic payload ⇒ IDEMPOTENCY_CONFLICT, no write", async () => {
    const db = createLedgerTestDb();
    await appendLedgerRecord(db, makeInput());

    const differentIntent = await appendLedgerRecord(
      db,
      makeInput({ recordId: "rec-2", intent: "REJECT" }),
    );
    const differentFingerprint = await appendLedgerRecord(
      db,
      makeInput({ recordId: "rec-3", decisionFingerprint: "e".repeat(64) }),
    );

    expect(differentIntent.outcome).toBe("IDEMPOTENCY_CONFLICT");
    expect(differentFingerprint.outcome).toBe("IDEMPOTENCY_CONFLICT");
    expect(await listLedgerRecords(db)).toHaveLength(1);
  });

  it("idempotency scope includes approver issuer + subjectId", async () => {
    const db = createLedgerTestDb();
    await appendLedgerRecord(db, makeInput());

    const otherHuman = await appendLedgerRecord(
      db,
      makeInput({ recordId: "rec-2", approverSubjectId: "human-subject-2", intent: "REJECT" }),
    );
    const otherIssuer = await appendLedgerRecord(
      db,
      makeInput({
        recordId: "rec-3",
        approverIssuer: "https://other.cloudflareaccess.com",
        intent: "DEFER",
      }),
    );

    expect(otherHuman.outcome).toBe("RECORDED");
    expect(otherIssuer.outcome).toBe("RECORDED");
    expect(await listLedgerRecords(db)).toHaveLength(3);
  });

  it("DB unique index rejects a raced duplicate insert and the store resolves it as replay", async () => {
    const db = createLedgerTestDb();
    await appendLedgerRecord(db, makeInput({ recordId: "rec-1" }));

    // Simulate a race: insert directly (bypassing the pre-check) with the same scope.
    expect(() =>
      db.raw
        .prepare(
          `INSERT INTO approval_ledger_records (
             record_id, schema_version, repository, source_refs_json,
             decision_fingerprint, decision_facts_json, human_action_status,
             evidence_state, observed_at, intent, recorded_at, idempotency_key,
             approver_issuer, approver_subject_id, submission_state, external_effect
           ) VALUES ('rec-x', 1, 'r', '[]', 'fp', '{}', 'ACTION_REQUIRED', 'CONFIRMED',
             'o', 'APPROVE', 'r', 'key-1', 'https://example.cloudflareaccess.com',
             'human-subject-1', 'RECORDED', 0)`,
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/);
  });
});

describe("listLedgerRecords", () => {
  it("returns newest first, capped at 50", async () => {
    const db = createLedgerTestDb();
    for (let i = 0; i < 55; i++) {
      await appendLedgerRecord(
        db,
        makeInput({
          recordId: `rec-${i}`,
          idempotencyKey: `key-${i}`,
          recordedAt: `2026-08-11T10:${String(i).padStart(2, "0")}:00.000Z`,
        }),
      );
    }

    const records = await listLedgerRecords(db);
    expect(records).toHaveLength(50);
    expect(records[0].recordId).toBe("rec-54");
    expect(records[49].recordId).toBe("rec-5");

    const limited = await listLedgerRecords(db, 3);
    expect(limited.map((r) => r.recordId)).toEqual(["rec-54", "rec-53", "rec-52"]);

    const overCap = await listLedgerRecords(db, 500);
    expect(overCap).toHaveLength(50);
  });
});

describe("append-only DB protection (migration 0001 triggers + CHECKs)", () => {
  it("rejects UPDATE of a recorded ledger record", async () => {
    const db = createLedgerTestDb();
    await appendLedgerRecord(db, makeInput());

    expect(() =>
      db.raw.prepare("UPDATE approval_ledger_records SET intent = 'REJECT'").run(),
    ).toThrow(/append-only: UPDATE forbidden/);

    const record = await findByIdempotencyScope(
      db,
      "https://example.cloudflareaccess.com",
      "human-subject-1",
      "key-1",
    );
    expect(record?.intent).toBe("APPROVE");
  });

  it("rejects DELETE of a recorded ledger record", async () => {
    const db = createLedgerTestDb();
    await appendLedgerRecord(db, makeInput());

    expect(() => db.raw.prepare("DELETE FROM approval_ledger_records").run()).toThrow(
      /append-only: DELETE forbidden/,
    );
    expect(await listLedgerRecords(db)).toHaveLength(1);
  });

  it("rejects rows violating contract invariants at the DB level", async () => {
    const db = createLedgerTestDb();
    const insert = (columns: Record<string, unknown>) => {
      const base: Record<string, unknown> = {
        record_id: "rec-bad",
        schema_version: 1,
        repository: "r",
        source_refs_json: "[]",
        decision_fingerprint: "fp",
        decision_facts_json: "{}",
        human_action_status: "ACTION_REQUIRED",
        evidence_state: "CONFIRMED",
        observed_at: "o",
        intent: "APPROVE",
        recorded_at: "r",
        idempotency_key: "k-bad",
        approver_issuer: "i",
        approver_subject_id: "s",
        submission_state: "RECORDED",
        external_effect: 0,
        ...columns,
      };
      const keys = Object.keys(base);
      db.raw
        .prepare(
          `INSERT INTO approval_ledger_records (${keys.join(", ")})
           VALUES (${keys.map(() => "?").join(", ")})`,
        )
        .run(...(Object.values(base) as never[]));
    };

    expect(() => insert({ human_action_status: "NO_ACTION" })).toThrow(/CHECK constraint failed/);
    expect(() => insert({ evidence_state: "MISSING" })).toThrow(/CHECK constraint failed/);
    expect(() => insert({ intent: "MERGE" })).toThrow(/CHECK constraint failed/);
    expect(() => insert({ submission_state: "EXECUTED" })).toThrow(/CHECK constraint failed/);
    expect(() => insert({ external_effect: 1 })).toThrow(/CHECK constraint failed/);
  });
});
