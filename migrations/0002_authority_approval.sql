-- Migration 0002: append-only Human Authority approval records + single-use receipt consumption.
--
-- Authority records are decisions/receipts only. They do not execute an approved
-- operation. Consumption records are appended by the Execution Layer to reject
-- replay of SINGLE_USE receipts.

CREATE TABLE IF NOT EXISTS authority_approval_records (
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

CREATE TRIGGER IF NOT EXISTS authority_approval_records_no_update
BEFORE UPDATE ON authority_approval_records
BEGIN
  SELECT RAISE(ABORT, 'authority_approval_records is append-only');
END;

CREATE TRIGGER IF NOT EXISTS authority_approval_records_no_delete
BEFORE DELETE ON authority_approval_records
BEGIN
  SELECT RAISE(ABORT, 'authority_approval_records is append-only');
END;

CREATE TABLE IF NOT EXISTS authority_receipt_consumptions (
  receipt_id TEXT PRIMARY KEY,
  approval_record_id TEXT NOT NULL,
  payload_digest TEXT NOT NULL CHECK (length(payload_digest) = 64),
  consumed_at TEXT NOT NULL,
  execution_ref TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS authority_receipt_consumptions_no_update
BEFORE UPDATE ON authority_receipt_consumptions
BEGIN
  SELECT RAISE(ABORT, 'authority_receipt_consumptions is append-only');
END;

CREATE TRIGGER IF NOT EXISTS authority_receipt_consumptions_no_delete
BEFORE DELETE ON authority_receipt_consumptions
BEGIN
  SELECT RAISE(ABORT, 'authority_receipt_consumptions is append-only');
END;
