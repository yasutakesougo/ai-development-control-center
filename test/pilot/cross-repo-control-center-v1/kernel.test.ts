import { describe, expect, it } from 'vitest';
import {
  acceptReadOnlyEvidence,
  buildPilotRunPlan,
  buildProposalEnvelope,
  buildWriteIntentProposal,
  calculateRate,
} from '../../../src/pilot/cross-repo-control-center-v1/kernel';
import type { PilotBaselinePlan, TargetSnapshot } from '../../../src/pilot/cross-repo-control-center-v1/types';

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
