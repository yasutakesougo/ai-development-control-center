import type {
  PilotBaselinePlan,
  PilotRunPlan,
  ProposalEnvelope,
  ReadOnlyEvidenceRecord,
  TargetSnapshot,
  WriteIntentProposal,
} from './types';

const SHA40 = /^[0-9a-f]{40}$/;

export function validateTargetSnapshot(snapshot: TargetSnapshot): string[] {
  const errors: string[] = [];
  if (!snapshot.repositoryFullName.includes('/')) errors.push('repositoryFullName');
  if (!snapshot.baseBranch.trim()) errors.push('baseBranch');
  if (!SHA40.test(snapshot.baseCommitSha)) errors.push('baseCommitSha');
  if (!snapshot.capturedAt.trim()) errors.push('capturedAt');
  if (!snapshot.pilotDefinitionVersion.trim()) errors.push('pilotDefinitionVersion');
  return errors;
}

export function validateBaselinePlan(plan: PilotBaselinePlan): string[] {
  const errors: string[] = [];
  if (!plan.baselinePlanId.trim()) errors.push('baselinePlanId');
  if (!plan.metricDefinitionVersion.trim()) errors.push('metricDefinitionVersion');
  if (!plan.observationWindow.start || !plan.observationWindow.end) errors.push('observationWindow');
  if (!plan.deterministicSelection.trim()) errors.push('deterministicSelection');
  if (plan.sourceRefs.length === 0) errors.push('sourceRefs');
  return errors;
}

export function buildPilotRunPlan(input: {
  pilotRunId: string;
  pilotAttemptId: string;
  targetSnapshot: TargetSnapshot;
  baselinePlan: PilotBaselinePlan;
}): PilotRunPlan {
  const targetErrors = validateTargetSnapshot(input.targetSnapshot);
  const baselineErrors = validateBaselinePlan(input.baselinePlan);
  if (targetErrors.length || baselineErrors.length) {
    throw new Error(`CRCCP_HOLD_INVALID_PRECONDITION:${[...targetErrors, ...baselineErrors].join(',')}`);
  }
  if (!input.pilotRunId.trim() || !input.pilotAttemptId.trim()) {
    throw new Error('CRCCP_HOLD_INVALID_RUN_ID');
  }
  return {
    pilotRunId: input.pilotRunId,
    pilotAttemptId: input.pilotAttemptId,
    targetSnapshot: input.targetSnapshot,
    baselinePlanId: input.baselinePlan.baselinePlanId,
    state: 'PLANNED',
  };
}

export function acceptReadOnlyEvidence(record: ReadOnlyEvidenceRecord): ReadOnlyEvidenceRecord {
  if (record.sensitivityState !== 'PASS') {
    throw new Error(`CRCCP_HOLD_SENSITIVITY_${record.sensitivityState}`);
  }
  if (!record.sourceRef.trim() || !record.observedAt.trim()) {
    throw new Error('CRCCP_HOLD_INCOMPLETE_EVIDENCE');
  }
  return Object.freeze({ ...record });
}

export function buildProposalEnvelope(input: Omit<ProposalEnvelope, 'authorizesMutation'>): ProposalEnvelope {
  if (!input.proposalId.trim() || !input.pilotRunId.trim()) {
    throw new Error('CRCCP_HOLD_INVALID_PROPOSAL_IDENTITY');
  }
  return Object.freeze({ ...input, authorizesMutation: false });
}

export function buildWriteIntentProposal(
  input: Omit<WriteIntentProposal, 'schemaVersion' | 'authorizesMutation'>,
): WriteIntentProposal {
  const targetErrors = validateTargetSnapshot(input.targetSnapshot);
  if (targetErrors.length) {
    throw new Error(`CRCCP_HOLD_INVALID_TARGET:${targetErrors.join(',')}`);
  }
  if (!input.requestedOperation.trim() || !input.requestedResource.trim() || !input.requestedTool.trim()) {
    throw new Error('CRCCP_HOLD_INCOMPLETE_WRITE_INTENT');
  }
  return Object.freeze({
    ...input,
    schemaVersion: 'CRCCP-WRITE-INTENT-PROPOSAL-V1',
    proposedPaths: [...input.proposedPaths].sort(),
    authorizesMutation: false,
  });
}

export function calculateRate(numerator: number, denominator: number): number | 'NOT_COMPUTABLE' {
  if (!Number.isInteger(numerator) || numerator < 0 || !Number.isInteger(denominator) || denominator < 0) {
    throw new Error('CRCCP_INVALID_RATE_INPUT');
  }
  if (denominator === 0) return 'NOT_COMPUTABLE';
  if (numerator > denominator) throw new Error('CRCCP_INVALID_RATE_NUMERATOR');
  return numerator / denominator;
}
