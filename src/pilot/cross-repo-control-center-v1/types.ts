export type EvidenceState = 'PASS' | 'HOLD' | 'UNKNOWN';

export interface TargetSnapshot {
  repositoryFullName: string;
  baseBranch: string;
  baseCommitSha: string;
  capturedAt: string;
  pilotDefinitionVersion: string;
}

export interface PilotBaselinePlan {
  baselinePlanId: string;
  metricDefinitionVersion: string;
  observationWindow: { start: string; end: string };
  deterministicSelection: string;
  sourceRefs: string[];
  missingDataState: 'NOT_MEASURED' | 'UNKNOWN';
}

export interface PilotRunPlan {
  pilotRunId: string;
  pilotAttemptId: string;
  targetSnapshot: TargetSnapshot;
  baselinePlanId: string;
  state: 'PLANNED' | 'STARTED' | 'COMPLETED' | 'ABORTED' | 'INVALIDATED';
}

export interface ReadOnlyEvidenceRecord {
  evidenceId: string;
  sourceClass: 'REPOSITORY_METADATA' | 'SOURCE_FILE' | 'ISSUE' | 'PULL_REQUEST' | 'CI_LOG';
  sourceRef: string;
  sensitivityState: EvidenceState;
  observedAt: string;
}

export interface ProposalEnvelope {
  proposalId: string;
  pilotRunId: string;
  taskSnapshotRef: string;
  workerAuthoritySnapshotRef: string;
  knowledgeRefs: string[];
  policyDecisionRef: string | null;
  authorizesMutation: false;
}

export interface WriteIntentProposal {
  schemaVersion: 'CRCCP-WRITE-INTENT-PROPOSAL-V1';
  pilotRunId: string;
  targetSnapshot: TargetSnapshot;
  requestedOperation: string;
  requestedResource: string;
  requestedTool: string;
  proposedPaths: string[];
  expectedEffect: string;
  authorizesMutation: false;
}

export type PilotWriteAuthorityClass =
  | 'DRAFT_PR_WRITE_AUTHORITY'
  | 'RETRY_AUTHORITY'
  | 'ROLLBACK_AUTHORITY'
  | 'RECONCILE_AUTHORITY';

export type PilotWriteDecision =
  | 'ALLOW'
  | 'DENY'
  | 'HOLD'
  | 'REAUTHORIZE_REQUIRED'
  | 'RECONCILIATION_REQUIRED'
  | 'DUPLICATE_MUTATION_PROHIBITED'
  | 'STALE_LEASE_REJECTED';

export type PilotEffectState = 'EFFECT_APPLIED' | 'EFFECT_NOT_APPLIED' | 'UNKNOWN' | 'CONFLICT';

export interface RepositorySafetyObservation {
  pullRequestRequired: boolean | null;
  conversationResolutionRequired: boolean | null;
  forcePushDisabled: boolean | null;
  deletionDisabled: boolean | null;
  credentialNonAdmin: boolean | null;
  credentialNotBypassActor: boolean | null;
  draftPrOnlyPepActive: boolean | null;
  targetIdentityCurrent: boolean | null;
}

export interface DiffPolicy {
  allowedPaths: string[];
  forbiddenPaths: string[];
  maxFilesChanged: number;
  maxAdditions: number;
  maxDeletions: number;
  allowBinary: boolean;
  allowRenames: boolean;
  expectedCommitCount: number;
}

export interface DiffObservation {
  changedPaths: string[];
  additions: number;
  deletions: number;
  binaryPresent: boolean;
  renamePresent: boolean;
  commitCount: number;
}

export interface PilotWriteAuthority {
  authorityClass: PilotWriteAuthorityClass;
  humanGoRef: string;
  current: boolean;
  repositoryFullName: string;
  ref: string;
  expectedSha: string;
  logicalMutationId: string;
  attemptGeneration: number;
  allowedPaths: string[];
}

export type PilotWriteOperation =
  | 'CREATE_WORKING_BRANCH'
  | 'CREATE_FILE'
  | 'UPDATE_FILE'
  | 'DELETE_FILE'
  | 'CREATE_DRAFT_PR'
  | 'READBACK'
  | 'RECONCILE';

export interface PilotWritePolicyInput {
  operation: PilotWriteOperation;
  authority: PilotWriteAuthority | null;
  safety: RepositorySafetyObservation;
  diffPolicy: DiffPolicy | null;
  effectState: PilotEffectState | null;
  observedRepositoryFullName: string;
  observedRef: string;
  observedSha: string;
  requestedPaths: string[];
  leaseValid: boolean | null;
}

export interface PilotWritePolicyResult {
  decision: PilotWriteDecision;
  reason:
    | 'AUTHORIZED'
    | 'MISSING_OR_STALE_SAFETY_EVIDENCE'
    | 'MISSING_AUTHORITY'
    | 'AUTHORITY_NOT_CURRENT'
    | 'AUTHORITY_CLASS_MISMATCH'
    | 'TARGET_BINDING_MISMATCH'
    | 'PATH_NOT_ALLOWLISTED'
    | 'DIFF_POLICY_INVALID'
    | 'LEASE_REQUIRED'
    | 'EFFECT_STATE_REQUIRES_RECONCILIATION'
    | 'RETRY_REQUIRES_EFFECT_NOT_APPLIED'
    | 'DUPLICATE_EFFECT_ALREADY_APPLIED';
}

export interface GitHubWriteCommand {
  operation: Exclude<PilotWriteOperation, 'READBACK' | 'RECONCILE'>;
  repositoryFullName: string;
  ref: string;
  expectedSha: string;
  logicalMutationId: string;
  attemptGeneration: number;
  paths: string[];
}

export interface GitHubWritePort {
  execute(command: GitHubWriteCommand): Promise<{ observedHeadSha: string; draftPullRequestNumber?: number }>;
}

export interface PilotLeaseRecord {
  logicalMutationId: string;
  ownerId: string;
  fence: number;
  expiresAt: string;
}

export interface PilotEffectRecord {
  logicalMutationId: string;
  attemptGeneration: number;
  effectState: PilotEffectState;
  repositoryFullName: string;
  ref: string;
  expectedSha: string;
  observedSha: string | null;
  evidenceRef: string;
  recordedAt: string;
}
