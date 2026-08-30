-- CONTROL-CENTER-CROSS-REPO-WRITE-PILOT-V1
-- Staging-only D1 state for lease/fence and effect reconciliation.
-- Applying this migration remains a separate operational gate.

CREATE TABLE IF NOT EXISTS cross_repo_write_pilot_leases (
  logical_mutation_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  fence INTEGER NOT NULL CHECK (fence > 0),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cross_repo_write_pilot_effects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  logical_mutation_id TEXT NOT NULL,
  attempt_generation INTEGER NOT NULL CHECK (attempt_generation >= 0),
  effect_state TEXT NOT NULL CHECK (effect_state IN ('EFFECT_APPLIED', 'EFFECT_NOT_APPLIED', 'UNKNOWN', 'CONFLICT')),
  repository_full_name TEXT NOT NULL,
  ref_name TEXT NOT NULL,
  expected_sha TEXT NOT NULL,
  observed_sha TEXT,
  evidence_ref TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (logical_mutation_id, attempt_generation)
);

CREATE INDEX IF NOT EXISTS idx_cross_repo_write_pilot_effects_latest
  ON cross_repo_write_pilot_effects (logical_mutation_id, attempt_generation DESC, recorded_at DESC);
