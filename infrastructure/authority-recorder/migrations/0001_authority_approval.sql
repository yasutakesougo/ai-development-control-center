-- authority-recorder production store
-- This database contains Approval Records only.
-- It is never bound to the Main Worker or Execution Enforcer.

CREATE TABLE authority_approval_records (
  approval_record_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = 'AUTHORITY-APPROVAL-RECORD-V1'),
  payload_json TEXT NOT NULL,
  payload_digest TEXT NOT NULL CHECK (length(payload_digest) = 64),
  human_decision_ref TEXT NOT NULL,
  approver_issuer TEXT NOT NULL,
  approver_subject_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  UNIQUE (approver_issuer, approver_subject_id, human_decision_ref)
);

CREATE TRIGGER authority_approval_records_no_update
BEFORE UPDATE ON authority_approval_records
BEGIN
  SELECT RAISE(ABORT, 'authority_approval_records is append-only');
END;

CREATE TRIGGER authority_approval_records_no_delete
BEFORE DELETE ON authority_approval_records
BEGIN
  SELECT RAISE(ABORT, 'authority_approval_records is append-only');
END;
