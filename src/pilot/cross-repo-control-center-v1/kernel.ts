import type {
  DiffObservation,
  DiffPolicy,
  PilotBaselinePlan,
  PilotRunPlan,
  PilotWritePolicyInput,
  PilotWritePolicyResult,
  ProposalEnvelope,
  ReadOnlyEvidenceRecord,
  RepositorySafetyObservation,
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

export function isRepositorySafetyEligible(safety: RepositorySafetyObservation): boolean {
  return Object.values(safety).every((value) => value === true);
}

function pathAllowed(path: string, allowedPaths: string[]): boolean {
  return allowedPaths.some((allowed) => path === allowed || path.startsWith(`${allowed.replace(/\/$/, '')}/`));
}

export function validateDiffPolicy(policy: DiffPolicy | null): string[] {
  if (!policy) return ['missing'];
  const errors: string[] = [];
  if (policy.allowedPaths.length === 0 || policy.allowedPaths.some((path) => !path.trim())) errors.push('allowedPaths');
  if (policy.forbiddenPaths.some((path) => !path.trim())) errors.push('forbiddenPaths');
  if (!Number.isInteger(policy.maxFilesChanged) || policy.maxFilesChanged <= 0) errors.push('maxFilesChanged');
  if (!Number.isInteger(policy.maxAdditions) || policy.maxAdditions < 0) errors.push('maxAdditions');
  if (!Number.isInteger(policy.maxDeletions) || policy.maxDeletions < 0) errors.push('maxDeletions');
  if (!Number.isInteger(policy.expectedCommitCount) || policy.expectedCommitCount < 0) errors.push('expectedCommitCount');
  return errors;
}

export function evaluateDiffObservation(policy: DiffPolicy, observation: DiffObservation): 'PASS' | 'HOLD' {
  if (validateDiffPolicy(policy).length > 0) return 'HOLD';
  if (observation.changedPaths.length > policy.maxFilesChanged) return 'HOLD';
  if (observation.additions > policy.maxAdditions || observation.deletions > policy.maxDeletions) return 'HOLD';
  if (observation.binaryPresent && !policy.allowBinary) return 'HOLD';
  if (observation.renamePresent && !policy.allowRenames) return 'HOLD';
  if (observation.commitCount !== policy.expectedCommitCount) return 'HOLD';
  for (const path of observation.changedPaths) {
    if (!pathAllowed(path, policy.allowedPaths)) return 'HOLD';
    if (pathAllowed(path, policy.forbiddenPaths)) return 'HOLD';
  }
  return 'PASS';
}

export function evaluatePilotWritePolicy(input: PilotWritePolicyInput): PilotWritePolicyResult {
  if (!isRepositorySafetyEligible(input.safety)) {
    return { decision: 'HOLD', reason: 'MISSING_OR_STALE_SAFETY_EVIDENCE' };
  }
  if (!input.authority) return { decision: 'DENY', reason: 'MISSING_AUTHORITY' };
  if (!input.authority.current) return { decision: 'REAUTHORIZE_REQUIRED', reason: 'AUTHORITY_NOT_CURRENT' };
  if (validateDiffPolicy(input.diffPolicy).length > 0) return { decision: 'HOLD', reason: 'DIFF_POLICY_INVALID' };

  const authority = input.authority;
  if (
    authority.repositoryFullName !== input.observedRepositoryFullName ||
    authority.ref !== input.observedRef ||
    authority.expectedSha !== input.observedSha
  ) {
    return { decision: 'HOLD', reason: 'TARGET_BINDING_MISMATCH' };
  }

  if (input.requestedPaths.some((path) => !pathAllowed(path, authority.allowedPaths))) {
    return { decision: 'DENY', reason: 'PATH_NOT_ALLOWLISTED' };
  }

  if (input.operation === 'READBACK' || input.operation === 'RECONCILE') {
    if (authority.authorityClass !== 'RECONCILE_AUTHORITY') {
      return { decision: 'DENY', reason: 'AUTHORITY_CLASS_MISMATCH' };
    }
    return { decision: 'ALLOW', reason: 'AUTHORIZED' };
  }

  if (input.effectState === 'EFFECT_APPLIED') {
    return { decision: 'DUPLICATE_MUTATION_PROHIBITED', reason: 'DUPLICATE_EFFECT_ALREADY_APPLIED' };
  }
  if (input.effectState === 'UNKNOWN' || input.effectState === 'CONFLICT') {
    return { decision: 'RECONCILIATION_REQUIRED', reason: 'EFFECT_STATE_REQUIRES_RECONCILIATION' };
  }

  if (authority.authorityClass === 'RETRY_AUTHORITY') {
    if (input.effectState !== 'EFFECT_NOT_APPLIED') {
      return { decision: 'DENY', reason: 'RETRY_REQUIRES_EFFECT_NOT_APPLIED' };
    }
  } else if (authority.authorityClass !== 'DRAFT_PR_WRITE_AUTHORITY' && authority.authorityClass !== 'ROLLBACK_AUTHORITY') {
    return { decision: 'DENY', reason: 'AUTHORITY_CLASS_MISMATCH' };
  }

  if (input.leaseValid !== true) return { decision: 'STALE_LEASE_REJECTED', reason: 'LEASE_REQUIRED' };
  return { decision: 'ALLOW', reason: 'AUTHORIZED' };
}

export function calculateRate(numerator: number, denominator: number): number | 'NOT_COMPUTABLE' {
  if (!Number.isInteger(numerator) || numerator < 0 || !Number.isInteger(denominator) || denominator < 0) {
    throw new Error('CRCCP_INVALID_RATE_INPUT');
  }
  if (denominator === 0) return 'NOT_COMPUTABLE';
  if (numerator > denominator) throw new Error('CRCCP_INVALID_RATE_NUMERATOR');
  return numerator / denominator;
}
