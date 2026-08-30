import type { D1DatabaseLike } from '../../worker/ledger/ledgerStore';
import type { PilotEffectRecord, PilotLeaseRecord } from './types';

type LeaseRow = {
  logical_mutation_id: string;
  owner_id: string;
  fence: number;
  expires_at: string;
};

function rowToLease(row: LeaseRow): PilotLeaseRecord {
  return {
    logicalMutationId: row.logical_mutation_id,
    ownerId: row.owner_id,
    fence: row.fence,
    expiresAt: row.expires_at,
  };
}

/**
 * Atomically acquire or replace an expired lease.
 *
 * The INSERT ... ON CONFLICT ... DO UPDATE ... WHERE ... RETURNING statement is
 * the arbitration point. Concurrent contenders cannot both observe success:
 * only the statement that inserts the missing row or updates the row while its
 * stored expiry is <= observedAt returns a lease. A second contender sees the
 * already-renewed non-expired row and RETURNING yields no row.
 *
 * `observedAt` is caller-bound evidence time; this function does not silently
 * source wall-clock time internally.
 */
export async function acquirePilotLease(
  db: D1DatabaseLike,
  input: { logicalMutationId: string; ownerId: string; observedAt: string; expiresAt: string },
): Promise<PilotLeaseRecord | null> {
  const row = await db
    .prepare(
      `INSERT INTO cross_repo_write_pilot_leases (logical_mutation_id, owner_id, fence, expires_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(logical_mutation_id) DO UPDATE SET
         owner_id = excluded.owner_id,
         fence = cross_repo_write_pilot_leases.fence + 1,
         expires_at = excluded.expires_at
       WHERE cross_repo_write_pilot_leases.expires_at <= ?
       RETURNING logical_mutation_id, owner_id, fence, expires_at`,
    )
    .bind(input.logicalMutationId, input.ownerId, input.expiresAt, input.observedAt)
    .first<LeaseRow>();

  return row ? rowToLease(row) : null;
}

export async function readPilotLease(db: D1DatabaseLike, logicalMutationId: string): Promise<PilotLeaseRecord | null> {
  const row = await db
    .prepare(
      `SELECT logical_mutation_id, owner_id, fence, expires_at
       FROM cross_repo_write_pilot_leases
       WHERE logical_mutation_id = ?`,
    )
    .bind(logicalMutationId)
    .first<LeaseRow>();
  return row ? rowToLease(row) : null;
}

/**
 * Release succeeds only for the exact current owner+fence identity.
 * The single DELETE predicate is the arbitration point; stale fences cannot
 * delete a newer owner's lease.
 */
export async function releasePilotLease(
  db: D1DatabaseLike,
  input: { logicalMutationId: string; ownerId: string; fence: number },
): Promise<boolean> {
  const row = await db
    .prepare(
      `DELETE FROM cross_repo_write_pilot_leases
       WHERE logical_mutation_id = ? AND owner_id = ? AND fence = ?
       RETURNING logical_mutation_id, owner_id, fence, expires_at`,
    )
    .bind(input.logicalMutationId, input.ownerId, input.fence)
    .first<LeaseRow>();
  return row !== null;
}

export async function appendPilotEffect(db: D1DatabaseLike, record: PilotEffectRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO cross_repo_write_pilot_effects (
        logical_mutation_id, attempt_generation, effect_state, repository_full_name,
        ref_name, expected_sha, observed_sha, evidence_ref, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      record.logicalMutationId,
      record.attemptGeneration,
      record.effectState,
      record.repositoryFullName,
      record.ref,
      record.expectedSha,
      record.observedSha,
      record.evidenceRef,
      record.recordedAt,
    )
    .run();
}

export async function readLatestPilotEffect(
  db: D1DatabaseLike,
  logicalMutationId: string,
): Promise<PilotEffectRecord | null> {
  const row = await db
    .prepare(
      `SELECT logical_mutation_id, attempt_generation, effect_state, repository_full_name,
              ref_name, expected_sha, observed_sha, evidence_ref, recorded_at
       FROM cross_repo_write_pilot_effects
       WHERE logical_mutation_id = ?
       ORDER BY attempt_generation DESC, recorded_at DESC
       LIMIT 1`,
    )
    .bind(logicalMutationId)
    .first<{
      logical_mutation_id: string;
      attempt_generation: number;
      effect_state: PilotEffectRecord['effectState'];
      repository_full_name: string;
      ref_name: string;
      expected_sha: string;
      observed_sha: string | null;
      evidence_ref: string;
      recorded_at: string;
    }>();

  return row
    ? {
        logicalMutationId: row.logical_mutation_id,
        attemptGeneration: row.attempt_generation,
        effectState: row.effect_state,
        repositoryFullName: row.repository_full_name,
        ref: row.ref_name,
        expectedSha: row.expected_sha,
        observedSha: row.observed_sha,
        evidenceRef: row.evidence_ref,
        recordedAt: row.recorded_at,
      }
    : null;
}
