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
