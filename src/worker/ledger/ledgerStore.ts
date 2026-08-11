/**
 * Append-only D1 store for Approval Ledger records.
 *
 * The application layer exposes no UPDATE and no DELETE; migration 0001 also
 * rejects UPDATE / DELETE with DB triggers. Structural D1 types keep the store
 * testable against any SQLite-compatible binding.
 */

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export const LEDGER_SCHEMA_VERSION = 1;

export type ApprovalLedgerIntent = "APPROVE" | "REJECT" | "DEFER";

export interface LedgerRecord {
  recordId: string;
  schemaVersion: number;
  repository: string;
  sourceRefs: string[];
  decisionFingerprint: string;
  decisionFactsJson: string;
  humanActionStatus: "ACTION_REQUIRED";
  evidenceState: "CONFIRMED";
  observedAt: string;
  intent: ApprovalLedgerIntent;
  recordedAt: string;
  idempotencyKey: string;
  approverIssuer: string;
  approverSubjectId: string;
  submissionState: "RECORDED";
  externalEffect: false;
}

export interface NewLedgerRecordInput {
  recordId: string;
  repository: string;
  sourceRefs: string[];
  decisionFingerprint: string;
  decisionFactsJson: string;
  observedAt: string;
  intent: ApprovalLedgerIntent;
  recordedAt: string;
  idempotencyKey: string;
  approverIssuer: string;
  approverSubjectId: string;
}

export type AppendLedgerRecordResult =
  /** New record appended. */
  | { outcome: "RECORDED"; record: LedgerRecord }
  /** Identical retry — existing record returned, nothing written. */
  | { outcome: "REPLAYED"; record: LedgerRecord }
  /** Same idempotency scope but different semantic payload — nothing written. */
  | { outcome: "IDEMPOTENCY_CONFLICT" };

type LedgerRow = {
  record_id: string;
  schema_version: number;
  repository: string;
  source_refs_json: string;
  decision_fingerprint: string;
  decision_facts_json: string;
  human_action_status: string;
  evidence_state: string;
  observed_at: string;
  intent: string;
  recorded_at: string;
  idempotency_key: string;
  approver_issuer: string;
  approver_subject_id: string;
  submission_state: string;
  external_effect: number;
};

const SELECT_COLUMNS = `record_id, schema_version, repository, source_refs_json,
  decision_fingerprint, decision_facts_json, human_action_status, evidence_state,
  observed_at, intent, recorded_at, idempotency_key, approver_issuer,
  approver_subject_id, submission_state, external_effect`;

function rowToRecord(row: LedgerRow): LedgerRecord {
  return {
    recordId: row.record_id,
    schemaVersion: row.schema_version,
    repository: row.repository,
    sourceRefs: JSON.parse(row.source_refs_json) as string[],
    decisionFingerprint: row.decision_fingerprint,
    decisionFactsJson: row.decision_facts_json,
    humanActionStatus: "ACTION_REQUIRED",
    evidenceState: "CONFIRMED",
    observedAt: row.observed_at,
    intent: row.intent as ApprovalLedgerIntent,
    recordedAt: row.recorded_at,
    idempotencyKey: row.idempotency_key,
    approverIssuer: row.approver_issuer,
    approverSubjectId: row.approver_subject_id,
    submissionState: "RECORDED",
    externalEffect: false,
  };
}

export async function findByIdempotencyScope(
  db: D1DatabaseLike,
  approverIssuer: string,
  approverSubjectId: string,
  idempotencyKey: string,
): Promise<LedgerRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM approval_ledger_records
       WHERE approver_issuer = ? AND approver_subject_id = ? AND idempotency_key = ?`,
    )
    .bind(approverIssuer, approverSubjectId, idempotencyKey)
    .first<LedgerRow>();
  return row ? rowToRecord(row) : null;
}

/**
 * Identical retry means the same semantic decision payload:
 * same decision fingerprint and same intent for the same repository.
 */
export function isIdenticalReplay(
  existing: LedgerRecord,
  input: Pick<NewLedgerRecordInput, "decisionFingerprint" | "intent" | "repository">,
): boolean {
  return (
    existing.decisionFingerprint === input.decisionFingerprint &&
    existing.intent === input.intent &&
    existing.repository === input.repository
  );
}

/**
 * Append one immutable Ledger record.
 *
 * Idempotency scope = (approver issuer + approver subjectId + idempotencyKey).
 * Retries with the identical payload return the existing record; the same key
 * with a different semantic payload conflicts without writing. A racing insert
 * on the unique index is re-read and resolved the same way.
 */
export async function appendLedgerRecord(
  db: D1DatabaseLike,
  input: NewLedgerRecordInput,
): Promise<AppendLedgerRecordResult> {
  const existing = await findByIdempotencyScope(
    db,
    input.approverIssuer,
    input.approverSubjectId,
    input.idempotencyKey,
  );
  if (existing) {
    return isIdenticalReplay(existing, input)
      ? { outcome: "REPLAYED", record: existing }
      : { outcome: "IDEMPOTENCY_CONFLICT" };
  }

  try {
    await db
      .prepare(
        `INSERT INTO approval_ledger_records (
           record_id, schema_version, repository, source_refs_json,
           decision_fingerprint, decision_facts_json, human_action_status,
           evidence_state, observed_at, intent, recorded_at, idempotency_key,
           approver_issuer, approver_subject_id, submission_state, external_effect
         ) VALUES (?, ?, ?, ?, ?, ?, 'ACTION_REQUIRED', 'CONFIRMED', ?, ?, ?, ?, ?, ?, 'RECORDED', 0)`,
      )
      .bind(
        input.recordId,
        LEDGER_SCHEMA_VERSION,
        input.repository,
        JSON.stringify(input.sourceRefs),
        input.decisionFingerprint,
        input.decisionFactsJson,
        input.observedAt,
        input.intent,
        input.recordedAt,
        input.idempotencyKey,
        input.approverIssuer,
        input.approverSubjectId,
      )
      .run();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await findByIdempotencyScope(
        db,
        input.approverIssuer,
        input.approverSubjectId,
        input.idempotencyKey,
      );
      if (raced) {
        return isIdenticalReplay(raced, input)
          ? { outcome: "REPLAYED", record: raced }
          : { outcome: "IDEMPOTENCY_CONFLICT" };
      }
    }
    throw error;
  }

  const record = await findByIdempotencyScope(
    db,
    input.approverIssuer,
    input.approverSubjectId,
    input.idempotencyKey,
  );
  if (!record) throw new Error("ledger record not found after append");
  return { outcome: "RECORDED", record };
}

export const LEDGER_LIST_DEFAULT_LIMIT = 50;
export const LEDGER_LIST_MAX_LIMIT = 50;

/** Most recent records first. Read-only; no UPDATE/DELETE exists in this store. */
export async function listLedgerRecords(
  db: D1DatabaseLike,
  limit: number = LEDGER_LIST_DEFAULT_LIMIT,
): Promise<LedgerRecord[]> {
  const bounded = Math.max(1, Math.min(LEDGER_LIST_MAX_LIMIT, Math.floor(limit)));
  const { results } = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM approval_ledger_records
       ORDER BY recorded_at DESC, record_id DESC LIMIT ?`,
    )
    .bind(bounded)
    .all<LedgerRow>();
  return results.map(rowToRecord);
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(message);
}
