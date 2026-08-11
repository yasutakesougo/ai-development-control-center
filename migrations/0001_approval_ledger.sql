-- Migration 0001: Approval Ledger append-only record store (MVP-3-APPROVAL-LEDGER-CORE-V1)
--
-- Invariants enforced at the DB level:
--   human_action_status = ACTION_REQUIRED
--   evidence_state      = CONFIRMED
--   intent              IN (APPROVE, REJECT, DEFER)
--   submission_state    = RECORDED
--   external_effect     = 0
--   append-only: UPDATE / DELETE rejected by triggers
--   idempotency scope:  (approver_issuer, approver_subject_id, idempotency_key) UNIQUE

CREATE TABLE approval_ledger_records (
  record_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),

  repository TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  decision_fingerprint TEXT NOT NULL,
  decision_facts_json TEXT NOT NULL,

  human_action_status TEXT NOT NULL CHECK (human_action_status = 'ACTION_REQUIRED'),
  evidence_state TEXT NOT NULL CHECK (evidence_state = 'CONFIRMED'),
  observed_at TEXT NOT NULL,

  intent TEXT NOT NULL CHECK (intent IN ('APPROVE', 'REJECT', 'DEFER')),

  recorded_at TEXT NOT NULL,

  idempotency_key TEXT NOT NULL,

  approver_issuer TEXT NOT NULL,
  approver_subject_id TEXT NOT NULL,

  submission_state TEXT NOT NULL CHECK (submission_state = 'RECORDED'),
  external_effect INTEGER NOT NULL CHECK (external_effect = 0)
);

CREATE UNIQUE INDEX idx_approval_ledger_idempotency
  ON approval_ledger_records (approver_issuer, approver_subject_id, idempotency_key);

CREATE INDEX idx_approval_ledger_recorded_at
  ON approval_ledger_records (recorded_at);

-- DB-level append-only protection: recorded history must not be rewritten.
-- Correction / revoke / supersede semantics append a NEW record.
CREATE TRIGGER approval_ledger_records_no_update
BEFORE UPDATE ON approval_ledger_records
BEGIN
  SELECT RAISE(ABORT, 'approval_ledger_records is append-only: UPDATE forbidden');
END;

CREATE TRIGGER approval_ledger_records_no_delete
BEFORE DELETE ON approval_ledger_records
BEGIN
  SELECT RAISE(ABORT, 'approval_ledger_records is append-only: DELETE forbidden');
END;
