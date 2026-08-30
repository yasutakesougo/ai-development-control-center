import { describe, expect, it } from 'vitest';
import type { D1DatabaseLike, D1PreparedStatementLike } from '../../../src/worker/ledger/ledgerStore';
import {
  acquirePilotLease,
  appendPilotEffect,
  readLatestPilotEffect,
  releasePilotLease,
} from '../../../src/pilot/cross-repo-control-center-v1/writePilotStore';

class FakeStatement implements D1PreparedStatementLike {
  readonly bound: unknown[] = [];
  constructor(
    readonly query: string,
    private readonly firstValue: unknown = null,
    private readonly onRun?: () => void,
  ) {}
  bind(...values: unknown[]): D1PreparedStatementLike {
    this.bound.push(...values);
    return this;
  }
  async first<T>(): Promise<T | null> {
    return this.firstValue as T | null;
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: [] };
  }
  async run(): Promise<unknown> {
    this.onRun?.();
    return {};
  }
}

class QueueDb implements D1DatabaseLike {
  readonly statements: FakeStatement[] = [];
  constructor(private readonly firstValues: unknown[] = []) {}
  prepare(query: string): D1PreparedStatementLike {
    const statement = new FakeStatement(query, this.firstValues.shift() ?? null);
    this.statements.push(statement);
    return statement;
  }
}

describe('CONTROL-CENTER-CROSS-REPO-WRITE-PILOT-V1 store', () => {
  it('uses one atomic INSERT/conditional-UPDATE/RETURNING statement for lease arbitration', async () => {
    const db = new QueueDb([{
      logical_mutation_id: 'lm-1', owner_id: 'worker-a', fence: 8, expires_at: '2026-08-30T12:05:00Z',
    }]);

    const lease = await acquirePilotLease(db, {
      logicalMutationId: 'lm-1', ownerId: 'worker-a', observedAt: '2026-08-30T12:00:00Z', expiresAt: '2026-08-30T12:05:00Z',
    });

    expect(lease).toEqual({ logicalMutationId: 'lm-1', ownerId: 'worker-a', fence: 8, expiresAt: '2026-08-30T12:05:00Z' });
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0].query).toContain('ON CONFLICT(logical_mutation_id) DO UPDATE');
    expect(db.statements[0].query).toContain('fence = cross_repo_write_pilot_leases.fence + 1');
    expect(db.statements[0].query).toContain('WHERE cross_repo_write_pilot_leases.expires_at <= ?');
    expect(db.statements[0].query).toContain('RETURNING logical_mutation_id, owner_id, fence, expires_at');
  });

  it('treats a losing concurrent contender as acquisition failure when conditional RETURNING yields no row', async () => {
    const winnerDb = new QueueDb([{
      logical_mutation_id: 'lm-race', owner_id: 'worker-a', fence: 3, expires_at: '2026-08-30T12:05:00Z',
    }]);
    const loserDb = new QueueDb([null]);

    const winner = await acquirePilotLease(winnerDb, {
      logicalMutationId: 'lm-race', ownerId: 'worker-a', observedAt: '2026-08-30T12:00:00Z', expiresAt: '2026-08-30T12:05:00Z',
    });
    const loser = await acquirePilotLease(loserDb, {
      logicalMutationId: 'lm-race', ownerId: 'worker-b', observedAt: '2026-08-30T12:00:00Z', expiresAt: '2026-08-30T12:05:00Z',
    });

    expect(winner?.fence).toBe(3);
    expect(loser).toBeNull();
  });

  it('rejects stale-fence release when atomic DELETE RETURNING yields no row', async () => {
    const staleDb = new QueueDb([null]);
    const currentDb = new QueueDb([{
      logical_mutation_id: 'lm-1', owner_id: 'worker-b', fence: 9, expires_at: '2026-08-30T12:05:00Z',
    }]);

    await expect(releasePilotLease(staleDb, { logicalMutationId: 'lm-1', ownerId: 'worker-a', fence: 8 })).resolves.toBe(false);
    await expect(releasePilotLease(currentDb, { logicalMutationId: 'lm-1', ownerId: 'worker-b', fence: 9 })).resolves.toBe(true);
    expect(staleDb.statements[0].query).toContain('owner_id = ? AND fence = ?');
    expect(staleDb.statements[0].query).toContain('RETURNING logical_mutation_id');
  });

  it('reads back the latest effect state with exact mutation identity', async () => {
    const db = new QueueDb([{
      logical_mutation_id: 'lm-1',
      attempt_generation: 2,
      effect_state: 'EFFECT_APPLIED',
      repository_full_name: 'yasutakesougo/severe-behavior-support-spfx',
      ref_name: 'refs/heads/pilot/lm-1',
      expected_sha: '0123456789abcdef0123456789abcdef01234567',
      observed_sha: 'abcdef0123456789abcdef0123456789abcdef01',
      evidence_ref: 'evidence://effect-2',
      recorded_at: '2026-08-30T12:02:00Z',
    }]);

    await expect(readLatestPilotEffect(db, 'lm-1')).resolves.toEqual({
      logicalMutationId: 'lm-1',
      attemptGeneration: 2,
      effectState: 'EFFECT_APPLIED',
      repositoryFullName: 'yasutakesougo/severe-behavior-support-spfx',
      ref: 'refs/heads/pilot/lm-1',
      expectedSha: '0123456789abcdef0123456789abcdef01234567',
      observedSha: 'abcdef0123456789abcdef0123456789abcdef01',
      evidenceRef: 'evidence://effect-2',
      recordedAt: '2026-08-30T12:02:00Z',
    });
  });

  it('keeps effect append structurally separate from any GitHub mutation surface', async () => {
    let ran = false;
    const statement = new FakeStatement('INSERT INTO cross_repo_write_pilot_effects', null, () => { ran = true; });
    const db: D1DatabaseLike = { prepare: () => statement };

    await appendPilotEffect(db, {
      logicalMutationId: 'lm-1', attemptGeneration: 1, effectState: 'EFFECT_NOT_APPLIED',
      repositoryFullName: 'yasutakesougo/severe-behavior-support-spfx', ref: 'refs/heads/pilot/lm-1',
      expectedSha: '0123456789abcdef0123456789abcdef01234567', observedSha: null,
      evidenceRef: 'evidence://effect-1', recordedAt: '2026-08-30T12:01:00Z',
    });

    expect(ran).toBe(true);
    expect(statement.query).toContain('cross_repo_write_pilot_effects');
  });
});
