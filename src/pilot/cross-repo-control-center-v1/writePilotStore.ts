import type { D1DatabaseLike } from '../../worker/ledger/ledgerStore';
import type { PilotEffectRecord, PilotLeaseRecord } from './types';

export async function acquirePilotLease(
  db: D1DatabaseLike,
  input: { logicalMutationId: string; ownerId: string; expiresAt: string },
): Promise<PilotLeaseRecord | null> {
  const current = await db
    .prepare(
      `SELECT logical_mutation_id, owner_id, fence, expires_at
       FROM cross_repo_write_pilot_leases
       WHERE logical_mutation_id = ?`,
    )
    .bind(input.logicalMutationId)
    .first<{ logical_mutation_id: string; owner_id: string; fence: number; expires_at: string }>();

  if (current && current.expires_at > new Date().toISOString()) return null;
  const nextFence = (current?.fence ?? 0) + 1;

  await db
    .prepare(
      `INSERT INTO cross_repo_write_pilot_leases (logical_mutation_id, owner_id, fence, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(logical_mutation_id) DO UPDATE SET
         owner_id = excluded.owner_id,
         fence = excluded.fence,
         expires_at = excluded.expires_at`,
    )
    .bind(input.logicalMutationId, input.ownerId, nextFence, input.expiresAt)
    .run();

  return {
    logicalMutationId: input.logicalMutationId,
    ownerId: input.ownerId,
    fence: nextFence,
    expiresAt: input.expiresAt,
  };
}

export async function readPilotLease(db: D1DatabaseLike, logicalMutationId: string): Promise<PilotLeaseRecord | null> {
  const row = await db
    .prepare(
      `SELECT logical_mutation_id, owner_id, fence, expires_at
       FROM cross_repo_write_pilot_leases
       WHERE logical_mutation_id = ?`,
    )
    .bind(logicalMutationId)
    .first<{ logical_mutation_id: string; owner_id: string; fence: number; expires_at: string }>();
  return row
    ? { logicalMutationId: row.logical_mutation_id, ownerId: row.owner_id, fence: row.fence, expiresAt: row.expires_at }
    : null;
}

export async function releasePilotLease(
  db: D1DatabaseLike,
  input: { logicalMutationId: string; ownerId: string; fence: number },
): Promise<boolean> {
  const current = await readPilotLease(db, input.logicalMutationId);
  if (!current || current.ownerId !== input.ownerId || current.fence !== input.fence) return false;
  await db
    .prepare(
      `DELETE FROM cross_repo_write_pilot_leases
       WHERE logical_mutation_id = ? AND owner_id = ? AND fence = ?`,
    )
    .bind(input.logicalMutationId, input.ownerId, input.fence)
    .run();
  return true;
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
