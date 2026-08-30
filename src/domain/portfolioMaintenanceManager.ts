export const DETECTION_CLASSES = [
  "STALE_STATE",
  "SUPERSEDED_ARTIFACT",
  "AUTHORITY_DRIFT",
  "DEAD_OR_ABANDONED_BRANCH_CANDIDATE",
  "DUPLICATE_DEFINITION",
  "ORPHAN_EVIDENCE",
  "BROKEN_REFERENCE",
  "UNRESOLVED_HOLD",
  "REVIEW_DEBT",
  "KNOWLEDGE_DEBT",
  "TEST_DEBT",
  "REGISTRY_DRIFT",
  "ROADMAP_DRIFT",
] as const;

export type DetectionClass = (typeof DETECTION_CLASSES)[number];

export const IMPLEMENTED_DETECTION_CLASSES = [
  "STALE_STATE",
  "AUTHORITY_DRIFT",
  "BROKEN_REFERENCE",
  "UNRESOLVED_HOLD",
  "ROADMAP_DRIFT",
] as const satisfies readonly DetectionClass[];

export type ImplementedDetectionClass =
  (typeof IMPLEMENTED_DETECTION_CLASSES)[number];

export type VerificationState = "UNVERIFIED" | "VERIFIED" | "INCONCLUSIVE";
export type DispositionState = "OPEN" | "HOLD" | "DISMISSED" | "SUPERSEDED";
export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type Risk = "HIGH" | "MEDIUM" | "LOW";

export type AuthorityGate =
  | "DEFINITION"
  | "IMPLEMENTATION_START"
  | "WRITE"
  | "READY"
  | "MERGE"
  | "DEPLOY"
  | "LIVE_WRITE"
  | "M365_MUTATION"
  | "SHAREPOINT_MUTATION"
  | "ENTRA_MUTATION"
  | "CUSTOMER_PRODUCTION_MUTATION"
  | "MAINTENANCE_MUTATION"
  | "UNKNOWN";

export interface EvidenceReference {
  id: string;
  kind: string;
  value: string;
}

export interface ObservationSnapshot {
  observedAt: string;
  repositoryRef: string | "UNKNOWN";
  commitSha: string | "UNKNOWN";
  issueUpdatedAt: string | "UNKNOWN";
  prUpdatedAt: string | "UNKNOWN";
}

export interface MaintenanceTarget {
  repository: string;
  type: string;
  identifier: string;
}

export interface AuthorityRequirement {
  gate: AuthorityGate;
  state: "REQUIRED" | "UNKNOWN";
}

export interface MaintenanceCandidate {
  candidateId: string;
  class: DetectionClass;
  target: MaintenanceTarget;
  snapshot: ObservationSnapshot;
  observedState: Record<string, unknown>;
  expectedOrReferencedState: Record<string, unknown>;
  decisionBasis: string;
  requiredEvidence: string[];
  evidenceRefs: EvidenceReference[];
  sourcePrecedenceUsed: string[];
  confidence: Confidence;
  risk: Risk;
  verificationState: VerificationState;
  dispositionState: DispositionState;
  proposedAction: string;
  authorityRequired: AuthorityRequirement[];
  autoMutationAllowed: false;
}

export interface NotImplementedResult {
  kind: "NOT_IMPLEMENTED";
  class: Exclude<DetectionClass, ImplementedDetectionClass>;
  verificationState: "INCONCLUSIVE";
  dispositionState: "HOLD";
  authorityRequired: [{ gate: "UNKNOWN"; state: "UNKNOWN" }];
  autoMutationAllowed: false;
  reason: "SLICE_A_NOT_IMPLEMENTED";
}

export interface InconclusiveResult {
  kind: "INCONCLUSIVE";
  class: ImplementedDetectionClass;
  verificationState: "INCONCLUSIVE";
  dispositionState: "HOLD";
  authorityRequired: [{ gate: "UNKNOWN"; state: "UNKNOWN" }];
  autoMutationAllowed: false;
  reason: "REQUIRED_EVIDENCE_MISSING" | "SOURCE_CONFLICT_UNRESOLVED";
  missingEvidence: string[];
}

export interface NoFindingResult {
  kind: "NO_FINDING";
  class: ImplementedDetectionClass;
  verificationState: "VERIFIED";
  dispositionState: "DISMISSED";
  autoMutationAllowed: false;
  reason: string;
}

export type EvaluationResult =
  | { kind: "CANDIDATE"; candidate: MaintenanceCandidate }
  | NoFindingResult
  | InconclusiveResult
  | NotImplementedResult;

export interface EvaluationInput {
  class: DetectionClass;
  candidateId: string;
  target: MaintenanceTarget;
  snapshot: ObservationSnapshot;
  observedState: Record<string, unknown>;
  expectedOrReferencedState: Record<string, unknown>;
  evidenceRefs: EvidenceReference[];
  sourcePrecedenceUsed: string[];
  sourceConflictUnresolved?: boolean;
}

type EvidenceRule = {
  requiredEvidence: readonly string[];
  risk: Risk;
  evaluate: (input: EvaluationInput) => boolean;
  decisionBasis: string;
  proposedAction: string;
};

const evidenceIds = (input: EvaluationInput): Set<string> =>
  new Set(input.evidenceRefs.map((ref) => ref.id));

const hasAll = (input: EvaluationInput, required: readonly string[]): boolean => {
  const ids = evidenceIds(input);
  return required.every((id) => ids.has(id));
};

const value = (record: Record<string, unknown>, key: string): unknown => record[key];

const rules: Record<ImplementedDetectionClass, EvidenceRule> = {
  STALE_STATE: {
    requiredEvidence: ["current-state-identity", "live-state", "mismatch-comparison"],
    risk: "MEDIUM",
    decisionBasis: "Current-state identity differs from higher/equal priority live state with explicit mismatch evidence.",
    proposedAction: "Propose current-state reconciliation; do not rewrite automatically.",
    evaluate: (input) => value(input.observedState, "state") !== value(input.expectedOrReferencedState, "state"),
  },
  AUTHORITY_DRIFT: {
    requiredEvidence: ["authority-record-identity", "gate-identity", "current-authority-conflict"],
    risk: "HIGH",
    decisionBasis: "Recorded authority conflicts with Current Authority / Current Decision for the same gate.",
    proposedAction: "Propose authority reconciliation; require explicit human authority for mutation.",
    evaluate: (input) => value(input.observedState, "authority") !== value(input.expectedOrReferencedState, "authority"),
  },
  BROKEN_REFERENCE: {
    requiredEvidence: ["reference-identity", "deterministic-lookup"],
    risk: "LOW",
    decisionBasis: "Deterministic lookup completed successfully and confirmed the referenced target is absent.",
    proposedAction: "Propose reference repair or historical reclassification; do not delete evidence.",
    evaluate: (input) => value(input.observedState, "lookupCompleted") === true && value(input.observedState, "targetFound") === false,
  },
  UNRESOLVED_HOLD: {
    requiredEvidence: ["hold-decision-identity", "original-blocker-identity", "blocker-resolution-evidence"],
    risk: "MEDIUM",
    decisionBasis: "A HOLD remains recorded while current evidence shows its original blocker is resolved.",
    proposedAction: "Propose HOLD reconciliation; do not release HOLD automatically.",
    evaluate: (input) => value(input.observedState, "holdActive") === true && value(input.expectedOrReferencedState, "blockerResolved") === true,
  },
  ROADMAP_DRIFT: {
    requiredEvidence: ["roadmap-identity", "current-gate-evidence", "sequencing-mismatch"],
    risk: "MEDIUM",
    decisionBasis: "Current blocker/dependency/completed-gate evidence conflicts with recorded roadmap sequencing.",
    proposedAction: "Propose course correction only; do not rewrite roadmap or grant sequencing authority.",
    evaluate: (input) => value(input.observedState, "sequence") !== value(input.expectedOrReferencedState, "sequence"),
  },
};

const isImplemented = (detectionClass: DetectionClass): detectionClass is ImplementedDetectionClass =>
  (IMPLEMENTED_DETECTION_CLASSES as readonly DetectionClass[]).includes(detectionClass);

const notImplemented = (
  detectionClass: Exclude<DetectionClass, ImplementedDetectionClass>,
): NotImplementedResult => ({
  kind: "NOT_IMPLEMENTED",
  class: detectionClass,
  verificationState: "INCONCLUSIVE",
  dispositionState: "HOLD",
  authorityRequired: [{ gate: "UNKNOWN", state: "UNKNOWN" }],
  autoMutationAllowed: false,
  reason: "SLICE_A_NOT_IMPLEMENTED",
});

export function evaluateMaintenance(input: EvaluationInput): EvaluationResult {
  if (!isImplemented(input.class)) {
    return notImplemented(input.class);
  }

  const rule = rules[input.class];
  const missingEvidence = rule.requiredEvidence.filter((id) => !evidenceIds(input).has(id));

  if (missingEvidence.length > 0) {
    return {
      kind: "INCONCLUSIVE",
      class: input.class,
      verificationState: "INCONCLUSIVE",
      dispositionState: "HOLD",
      authorityRequired: [{ gate: "UNKNOWN", state: "UNKNOWN" }],
      autoMutationAllowed: false,
      reason: "REQUIRED_EVIDENCE_MISSING",
      missingEvidence,
    };
  }

  if (input.sourceConflictUnresolved === true) {
    return {
      kind: "INCONCLUSIVE",
      class: input.class,
      verificationState: "INCONCLUSIVE",
      dispositionState: "HOLD",
      authorityRequired: [{ gate: "UNKNOWN", state: "UNKNOWN" }],
      autoMutationAllowed: false,
      reason: "SOURCE_CONFLICT_UNRESOLVED",
      missingEvidence: [],
    };
  }

  if (!hasAll(input, rule.requiredEvidence) || !rule.evaluate(input)) {
    return {
      kind: "NO_FINDING",
      class: input.class,
      verificationState: "VERIFIED",
      dispositionState: "DISMISSED",
      autoMutationAllowed: false,
      reason: "DETECTION_CONDITION_NOT_MET",
    };
  }

  return {
    kind: "CANDIDATE",
    candidate: {
      candidateId: input.candidateId,
      class: input.class,
      target: input.target,
      snapshot: input.snapshot,
      observedState: input.observedState,
      expectedOrReferencedState: input.expectedOrReferencedState,
      decisionBasis: rule.decisionBasis,
      requiredEvidence: [...rule.requiredEvidence],
      evidenceRefs: input.evidenceRefs,
      sourcePrecedenceUsed: input.sourcePrecedenceUsed,
      confidence: "HIGH",
      risk: rule.risk,
      verificationState: "VERIFIED",
      dispositionState: "OPEN",
      proposedAction: rule.proposedAction,
      authorityRequired: [{ gate: "MAINTENANCE_MUTATION", state: "REQUIRED" }],
      autoMutationAllowed: false,
    },
  };
}
