-- authority-execution-enforcer production replay-consumption store
-- This database contains Receipt consumption state only.
-- It is never bound to the Main Worker or Trusted Authority Recorder.

CREATE TABLE authority_receipt_consumptions (
  receipt_id TEXT PRIMARY KEY,
  approval_record_id TEXT NOT NULL,
  payload_digest TEXT NOT NULL CHECK (length(payload_digest) = 64),
  consumed_at TEXT NOT NULL,
  execution_ref TEXT NOT NULL
);

CREATE TRIGGER authority_receipt_consumptions_no_update
BEFORE UPDATE ON authority_receipt_consumptions
BEGIN
  SELECT RAISE(ABORT, 'authority_receipt_consumptions is append-only');
END;

CREATE TRIGGER authority_receipt_consumptions_no_delete
BEFORE DELETE ON authority_receipt_consumptions
BEGIN
  SELECT RAISE(ABORT, 'authority_receipt_consumptions is append-only');
END;
