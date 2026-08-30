import { describe, expect, it } from 'vitest';
import {
  acceptReadOnlyEvidence,
  buildPilotRunPlan,
  buildProposalEnvelope,
  buildWriteIntentProposal,
  calculateRate,
  evaluateDiffObservation,
  evaluatePilotWritePolicy,
  isRepositorySafetyEligible,
} from '../../../src/pilot/cross-repo-control-center-v1/kernel';
import type {
  DiffPolicy,
  PilotBaselinePlan,
  PilotWriteAuthority,
  RepositorySafetyObservation,
  TargetSnapshot,
} from '../../../src/pilot/cross-repo-control-center-v1/types';

const target: TargetSnapshot = {
  repositoryFullName: 'yasutakesougo/severe-behavior-support-spfx',
  baseBranch: 'main',
  baseCommitSha: '0123456789abcdef0123456789abcdef01234567',
  capturedAt: '2026-08-30T12:00:00+09:00',
  pilotDefinitionVersion: 'CROSS-REPO-CONTROL-CENTER-PILOT-V1/Definition-Correction-1',
};

const baseline: PilotBaselinePlan = {
  baselinePlanId: 'baseline-001',
  metricDefinitionVersion: 'CRCCP-METRICS-V1',
  observationWindow: { start: '2026-08-01T00:00:00+09:00', end: '2026-08-30T00:00:00+09:00' },
  deterministicSelection: 'all qualifying work items in fixed window',
  sourceRefs: ['repo://issues?window=2026-08'],
  missingDataState: 'NOT_MEASURED',
};

const safetyPass: RepositorySafetyObservation = {
  pullRequestRequired: true,
  conversationResolutionRequired: true,
  forcePushDisabled: true,
  deletionDisabled: true,
  credentialNonAdmin: true,
  credentialNotBypassActor: true,
  draftPrOnlyPepActive: true,
  targetIdentityCurrent: true,
};

const diffPolicy: DiffPolicy = {
  allowedPaths: ['docs/pilot'],
  forbiddenPaths: ['docs/pilot/forbidden'],
  maxFilesChanged: 2,
  maxAdditions: 50,
  maxDeletions: 10,
  allowBinary: false,
  allowRenames: false,
  expectedCommitCount: 1,
};

const authority: PilotWriteAuthority = {
  authorityClass: 'DRAFT_PR_WRITE_AUTHORITY',
  humanGoRef: 'human-go://pilot-write-1',
  current: true,
  repositoryFullName: target.repositoryFullName,
  ref: 'refs/heads/pilot/example',
  expectedSha: target.baseCommitSha,
  logicalMutationId: 'lm-001',
  attemptGeneration: 0,
  allowedPaths: ['docs/pilot'],
};

describe('CRCCP-SLICE-A', () => {
  it('creates an immutable PLANNED run from exact baseline and target identity', () => {
    expect(buildPilotRunPlan({ pilotRunId: 'run-001', pilotAttemptId: 'attempt-001', targetSnapshot: target, baselinePlan: baseline })).toEqual({
      pilotRunId: 'run-001',
      pilotAttemptId: 'attempt-001',
      targetSnapshot: target,
      baselinePlanId: 'baseline-001',
      state: 'PLANNED',
    });
  });

  it('fails closed when the target commit is not exact', () => {
    expect(() => buildPilotRunPlan({ pilotRunId: 'run-001', pilotAttemptId: 'attempt-001', targetSnapshot: { ...target, baseCommitSha: 'main' }, baselinePlan: baseline }))
      .toThrow(/CRCCP_HOLD_INVALID_PRECONDITION/);
  });

  it('rejects read-only evidence with UNKNOWN sensitivity', () => {
    expect(() => acceptReadOnlyEvidence({ evidenceId: 'e1', sourceClass: 'ISSUE', sourceRef: 'issue://1', sensitivityState: 'UNKNOWN', observedAt: target.capturedAt }))
      .toThrow('CRCCP_HOLD_SENSITIVITY_UNKNOWN');
  });

  it('never grants mutation through worker/knowledge/policy proposal generation', () => {
    const proposal = buildProposalEnvelope({ proposalId: 'p1', pilotRunId: 'run-001', taskSnapshotRef: 'task://1', workerAuthoritySnapshotRef: 'worker://1', knowledgeRefs: ['knowledge://1'], policyDecisionRef: 'policy://1' });
    expect(proposal.authorizesMutation).toBe(false);
  });

  it('produces only a non-executable write intent proposal', () => {
    const intent = buildWriteIntentProposal({ pilotRunId: 'run-001', targetSnapshot: target, requestedOperation: 'MODIFY', requestedResource: 'repository-file', requestedTool: 'github.contents', proposedPaths: ['b.ts', 'a.ts'], expectedEffect: 'candidate change only' });
    expect(intent.authorizesMutation).toBe(false);
    expect(intent.proposedPaths).toEqual(['a.ts', 'b.ts']);
  });

  it('does not coerce zero-denominator rates to zero', () => {
    expect(calculateRate(0, 0)).toBe('NOT_COMPUTABLE');
    expect(calculateRate(1, 4)).toBe(0.25);
  });
});

describe('CONTROL-CENTER-CROSS-REPO-WRITE-PILOT-V1', () => {
  it('requires every repository-safety fact to be positive PASS', () => {
    expect(isRepositorySafetyEligible(safetyPass)).toBe(true);
    expect(isRepositorySafetyEligible({ ...safetyPass, credentialNotBypassActor: null })).toBe(false);
    expect(isRepositorySafetyEligible({ ...safetyPass, pullRequestRequired: false })).toBe(false);
  });

  it('denies a first mutation without explicit DRAFT_PR_WRITE authority', () => {
    expect(evaluatePilotWritePolicy({
      operation: 'CREATE_FILE', authority: null, safety: safetyPass, diffPolicy, effectState: null,
      observedRepositoryFullName: target.repositoryFullName, observedRef: authority.ref,
      observedSha: target.baseCommitSha, requestedPaths: ['docs/pilot/a.md'], leaseValid: true,
    })).toEqual({ decision: 'DENY', reason: 'MISSING_AUTHORITY' });
  });

  it('fails closed on target SHA drift', () => {
    expect(evaluatePilotWritePolicy({
      operation: 'CREATE_FILE', authority, safety: safetyPass, diffPolicy, effectState: null,
      observedRepositoryFullName: target.repositoryFullName, observedRef: authority.ref,
      observedSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', requestedPaths: ['docs/pilot/a.md'], leaseValid: true,
    })).toEqual({ decision: 'HOLD', reason: 'TARGET_BINDING_MISMATCH' });
  });

  it('does not allow RETRY authority to bootstrap an initial mutation', () => {
    expect(evaluatePilotWritePolicy({
      operation: 'CREATE_FILE', authority: { ...authority, authorityClass: 'RETRY_AUTHORITY' }, safety: safetyPass,
      diffPolicy, effectState: null, observedRepositoryFullName: target.repositoryFullName, observedRef: authority.ref,
      observedSha: target.baseCommitSha, requestedPaths: ['docs/pilot/a.md'], leaseValid: true,
    })).toEqual({ decision: 'DENY', reason: 'RETRY_REQUIRES_EFFECT_NOT_APPLIED' });
  });

  it('allows RETRY only after EFFECT_NOT_APPLIED with a valid lease', () => {
    expect(evaluatePilotWritePolicy({
      operation: 'UPDATE_FILE', authority: { ...authority, authorityClass: 'RETRY_AUTHORITY', attemptGeneration: 1 }, safety: safetyPass,
      diffPolicy, effectState: 'EFFECT_NOT_APPLIED', observedRepositoryFullName: target.repositoryFullName,
      observedRef: authority.ref, observedSha: target.baseCommitSha, requestedPaths: ['docs/pilot/a.md'], leaseValid: true,
    })).toEqual({ decision: 'ALLOW', reason: 'AUTHORIZED' });
  });

  it('prohibits duplicate mutation after EFFECT_APPLIED', () => {
    expect(evaluatePilotWritePolicy({
      operation: 'UPDATE_FILE', authority, safety: safetyPass, diffPolicy, effectState: 'EFFECT_APPLIED',
      observedRepositoryFullName: target.repositoryFullName, observedRef: authority.ref, observedSha: target.baseCommitSha,
      requestedPaths: ['docs/pilot/a.md'], leaseValid: true,
    })).toEqual({ decision: 'DUPLICATE_MUTATION_PROHIBITED', reason: 'DUPLICATE_EFFECT_ALREADY_APPLIED' });
  });

  it('requires reconciliation for UNKNOWN effect state', () => {
    expect(evaluatePilotWritePolicy({
      operation: 'UPDATE_FILE', authority, safety: safetyPass, diffPolicy, effectState: 'UNKNOWN',
      observedRepositoryFullName: target.repositoryFullName, observedRef: authority.ref, observedSha: target.baseCommitSha,
      requestedPaths: ['docs/pilot/a.md'], leaseValid: true,
    })).toEqual({ decision: 'RECONCILIATION_REQUIRED', reason: 'EFFECT_STATE_REQUIRES_RECONCILIATION' });
  });

  it('denies paths outside the Human-GO-bound allowlist', () => {
    expect(evaluatePilotWritePolicy({
      operation: 'CREATE_FILE', authority, safety: safetyPass, diffPolicy, effectState: null,
      observedRepositoryFullName: target.repositoryFullName, observedRef: authority.ref, observedSha: target.baseCommitSha,
      requestedPaths: ['src/index.ts'], leaseValid: true,
    })).toEqual({ decision: 'DENY', reason: 'PATH_NOT_ALLOWLISTED' });
  });

  it('requires a current fence/lease for mutating operations', () => {
    expect(evaluatePilotWritePolicy({
      operation: 'CREATE_DRAFT_PR', authority, safety: safetyPass, diffPolicy, effectState: null,
      observedRepositoryFullName: target.repositoryFullName, observedRef: authority.ref, observedSha: target.baseCommitSha,
      requestedPaths: [], leaseValid: null,
    })).toEqual({ decision: 'STALE_LEASE_REJECTED', reason: 'LEASE_REQUIRED' });
  });

  it('holds unexpected diff paths and numeric churn', () => {
    expect(evaluateDiffObservation(diffPolicy, {
      changedPaths: ['docs/pilot/a.md'], additions: 5, deletions: 1, binaryPresent: false, renamePresent: false, commitCount: 1,
    })).toBe('PASS');
    expect(evaluateDiffObservation(diffPolicy, {
      changedPaths: ['src/index.ts'], additions: 5, deletions: 1, binaryPresent: false, renamePresent: false, commitCount: 1,
    })).toBe('HOLD');
    expect(evaluateDiffObservation(diffPolicy, {
      changedPaths: ['docs/pilot/a.md'], additions: 51, deletions: 1, binaryPresent: false, renamePresent: false, commitCount: 1,
    })).toBe('HOLD');
  });

  it('keeps RECONCILE authority read-only', () => {
    const reconcileAuthority = { ...authority, authorityClass: 'RECONCILE_AUTHORITY' as const };
    expect(evaluatePilotWritePolicy({
      operation: 'RECONCILE', authority: reconcileAuthority, safety: safetyPass, diffPolicy, effectState: 'UNKNOWN',
      observedRepositoryFullName: target.repositoryFullName, observedRef: authority.ref, observedSha: target.baseCommitSha,
      requestedPaths: [], leaseValid: null,
    })).toEqual({ decision: 'ALLOW', reason: 'AUTHORIZED' });
    expect(evaluatePilotWritePolicy({
      operation: 'CREATE_FILE', authority: reconcileAuthority, safety: safetyPass, diffPolicy, effectState: null,
      observedRepositoryFullName: target.repositoryFullName, observedRef: authority.ref, observedSha: target.baseCommitSha,
      requestedPaths: ['docs/pilot/a.md'], leaseValid: true,
    })).toEqual({ decision: 'DENY', reason: 'AUTHORITY_CLASS_MISMATCH' });
  });
});
