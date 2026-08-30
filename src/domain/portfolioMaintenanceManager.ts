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

export type ImplementedDetectionClass = (typeof IMPLEMENTED_DETECTION_CLASSES)[number];

export const SOURCE_PRECEDENCE = [
  "Current Authority / Current Decision",
  "Locked Canonical Definition",
  "Current Repository State",
  "Verified Evidence",
  "Knowledge Registry",
  "Historical Review / Correction Evidence",
  "External Intelligence",
] as const;

export type SourcePrecedence = (typeof SOURCE_PRECEDENCE)[number];
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
  sourcePrecedenceUsed: SourcePrecedence[];
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
  reason:
    | "REQUIRED_EVIDENCE_MISSING"
    | "REQUIRED_STATE_MISSING_OR_INVALID"
    | "SOURCE_CONFLICT_UNRESOLVED"
    | "SOURCE_PRECEDENCE_INVALID";
  missingEvidence: string[];
}

export interface NoFindingResult {
  kind: "NO_FINDING";
  class: ImplementedDetectionClass;
  verificationState: "VERIFIED";
  dispositionState: "DISMISSED";
  autoMutationAllowed: false;
  reason: "DETECTION_CONDITION_NOT_MET";
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
  sourcePrecedenceUsed: SourcePrecedence[];
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

const deepEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const value = (record: Record<string, unknown>, key: string): unknown => record[key];

const hasOwnDefined = (record: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined;

const missingRequiredStateFacts = (input: EvaluationInput): string[] => {
  switch (input.class) {
    case "STALE_STATE":
      return [
        ...(hasOwnDefined(input.observedState, "state") ? [] : ["observedState.state"]),
        ...(hasOwnDefined(input.expectedOrReferencedState, "state") ? [] : ["expectedOrReferencedState.state"]),
      ];
    case "AUTHORITY_DRIFT":
      return [
        ...(hasOwnDefined(input.observedState, "authority") ? [] : ["observedState.authority"]),
        ...(hasOwnDefined(input.expectedOrReferencedState, "authority") ? [] : ["expectedOrReferencedState.authority"]),
      ];
    case "BROKEN_REFERENCE":
      return [
        ...(typeof value(input.observedState, "lookupCompleted") === "boolean" ? [] : ["observedState.lookupCompleted"]),
        ...(typeof value(input.observedState, "targetFound") === "boolean" ? [] : ["observedState.targetFound"]),
      ];
    case "UNRESOLVED_HOLD":
      return [
        ...(typeof value(input.observedState, "holdActive") === "boolean" ? [] : ["observedState.holdActive"]),
        ...(typeof value(input.expectedOrReferencedState, "blockerResolved") === "boolean" ? [] : ["expectedOrReferencedState.blockerResolved"]),
      ];
    case "ROADMAP_DRIFT":
      return [
        ...(Array.isArray(value(input.observedState, "sequence")) ? [] : ["observedState.sequence"]),
        ...(Array.isArray(value(input.expectedOrReferencedState, "sequence")) ? [] : ["expectedOrReferencedState.sequence"]),
      ];
    default:
      return [];
  }
};

const hasValidSourcePrecedence = (sources: readonly SourcePrecedence[]): boolean => {
  if (sources.length === 0) return false;
  let previousIndex = -1;
  for (const source of sources) {
    const index = SOURCE_PRECEDENCE.indexOf(source);
    if (index < 0 || index <= previousIndex) return false;
    previousIndex = index;
  }
  return true;
};

const rules: Record<ImplementedDetectionClass, EvidenceRule> = {
  STALE_STATE: {
    requiredEvidence: ["current-state-identity", "live-state", "mismatch-comparison"],
    risk: "MEDIUM",
    decisionBasis: "Current-state identity differs from higher/equal priority live state with explicit mismatch evidence.",
    proposedAction: "Propose current-state reconciliation; do not rewrite automatically.",
    evaluate: (input) => !deepEqual(value(input.observedState, "state"), value(input.expectedOrReferencedState, "state")),
  },
  AUTHORITY_DRIFT: {
    requiredEvidence: ["authority-record-identity", "gate-identity", "current-authority-conflict"],
    risk: "HIGH",
    decisionBasis: "Recorded authority conflicts with Current Authority / Current Decision for the same gate.",
    proposedAction: "Propose authority reconciliation; require explicit human authority for mutation.",
    evaluate: (input) => !deepEqual(value(input.observedState, "authority"), value(input.expectedOrReferencedState, "authority")),
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
    evaluate: (input) => !deepEqual(value(input.observedState, "sequence"), value(input.expectedOrReferencedState, "sequence")),
  },
};

const isImplemented = (detectionClass: DetectionClass): detectionClass is ImplementedDetectionClass =>
  (IMPLEMENTED_DETECTION_CLASSES as readonly DetectionClass[]).includes(detectionClass);

const hold = (
  detectionClass: ImplementedDetectionClass,
  reason: InconclusiveResult["reason"],
  missingEvidence: string[] = [],
): InconclusiveResult => ({
  kind: "INCONCLUSIVE",
  class: detectionClass,
  verificationState: "INCONCLUSIVE",
  dispositionState: "HOLD",
  authorityRequired: [{ gate: "UNKNOWN", state: "UNKNOWN" }],
  autoMutationAllowed: false,
  reason,
  missingEvidence,
});

export function evaluateMaintenance(input: EvaluationInput): EvaluationResult {
  if (!isImplemented(input.class)) {
    return {
      kind: "NOT_IMPLEMENTED",
      class: input.class,
      verificationState: "INCONCLUSIVE",
      dispositionState: "HOLD",
      authorityRequired: [{ gate: "UNKNOWN", state: "UNKNOWN" }],
      autoMutationAllowed: false,
      reason: "SLICE_A_NOT_IMPLEMENTED",
    };
  }

  const rule = rules[input.class];
  const ids = evidenceIds(input);
  const missingEvidence = rule.requiredEvidence.filter((id) => !ids.has(id));
  if (missingEvidence.length > 0) return hold(input.class, "REQUIRED_EVIDENCE_MISSING", missingEvidence);

  const missingStateFacts = missingRequiredStateFacts(input);
  if (missingStateFacts.length > 0) {
    return hold(input.class, "REQUIRED_STATE_MISSING_OR_INVALID", missingStateFacts);
  }

  if (!hasValidSourcePrecedence(input.sourcePrecedenceUsed)) return hold(input.class, "SOURCE_PRECEDENCE_INVALID");
  if (input.sourceConflictUnresolved === true) return hold(input.class, "SOURCE_CONFLICT_UNRESOLVED");

  if (!rule.evaluate(input)) {
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
