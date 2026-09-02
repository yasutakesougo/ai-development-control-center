export type HarnessRiskClass = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type HarnessEvidenceState = "SUFFICIENT" | "INSUFFICIENT" | "CONTRADICTORY";
export type HarnessRecommendation = "KEEP_FULL" | "MINIMALITY_CANDIDATE";

export type HarnessReasonCode =
  | "HIGH_RISK"
  | "INSUFFICIENT_EVIDENCE"
  | "CONTRADICTORY_EVIDENCE"
  | "RECORDED_RISK_MISMATCH"
  | "GATE_NOT_EXECUTED"
  | "OUTCOME_NOT_RECONSTRUCTABLE"
  | "OUTCOME_NOT_ATTRIBUTABLE"
  | "NO_VALID_COMPARISON_BASIS"
  | "GATE_PRODUCED_INFORMATION"
  | "SUFFICIENT_COMPARABLE_EVIDENCE";

export type HarnessChangeCharacteristic =
  | "PRESENTATION_FORMATTING_ONLY"
  | "PRESENTATION_WORKFLOW_MEANING"
  | "CONTRACT_OR_STATE_TRANSITION"
  | "PERSISTENCE_OR_SCHEMA"
  | "PERMISSION_OR_CREDENTIAL_OR_SECURITY"
  | "LIVE_DATA_MUTATION"
  | "AMBIGUOUS_OR_MIXED";

export interface RawHarnessObservation {
  workUnitRef: string;
  changeCharacteristics: HarnessChangeCharacteristic[];
  gatesActuallyExecuted: string[];
  materialFindings: string[];
  corrections: string[];
  regressions: string[];
  noNewInformationGates: string[];
  evidenceRefs: string[];
  evidenceState: HarnessEvidenceState;
  /** Historical/source label only. Never authoritative classifier input. */
  recordedRiskLabel?: HarnessRiskClass;
}

export interface ComparableGateEvidence {
  observation: RawHarnessObservation;
  gate: string;
  outcomeReconstructable: boolean;
  attributionExplicit: boolean;
  validComparisonBasis: boolean;
}

export interface HarnessEvidenceSufficiency {
  state: HarnessEvidenceState;
  reasonCodes: HarnessReasonCode[];
}

export interface HarnessShadowDecision {
  riskClass: HarnessRiskClass;
  recommendation: HarnessRecommendation;
  reasonCodes: HarnessReasonCode[];
  advisoryOnly: true;
}

export interface HarnessEvidencePacket extends HarnessShadowDecision {
  workUnitRef: string;
  evidenceState: HarnessEvidenceState;
  gatesActuallyExecuted: string[];
  materialFindings: string[];
  corrections: string[];
  regressions: string[];
  noNewInformationGates: string[];
  evidenceRefs: string[];
  recordedRiskLabel?: HarnessRiskClass;
  actualGatePolicy: "UNCHANGED";
}

const HIGH_CHARACTERISTICS = new Set<HarnessChangeCharacteristic>([
  "PERSISTENCE_OR_SCHEMA",
  "PERMISSION_OR_CREDENTIAL_OR_SECURITY",
  "LIVE_DATA_MUTATION",
]);

const MEDIUM_CHARACTERISTICS = new Set<HarnessChangeCharacteristic>([
  "PRESENTATION_WORKFLOW_MEANING",
  "CONTRACT_OR_STATE_TRANSITION",
]);

/**
 * Pure fail-closed classifier. riskClass is derived here and nowhere else.
 */
export function classifyHarnessRisk(observation: RawHarnessObservation): HarnessRiskClass {
  if (
    observation.evidenceState !== "SUFFICIENT" ||
    observation.evidenceRefs.length === 0 ||
    observation.changeCharacteristics.length === 0 ||
    observation.changeCharacteristics.includes("AMBIGUOUS_OR_MIXED")
  ) {
    return "UNKNOWN";
  }

  let derived: HarnessRiskClass;
  if (observation.changeCharacteristics.some((item) => HIGH_CHARACTERISTICS.has(item))) {
    derived = "HIGH";
  } else if (observation.changeCharacteristics.some((item) => MEDIUM_CHARACTERISTICS.has(item))) {
    derived = "MEDIUM";
  } else if (observation.changeCharacteristics.every((item) => item === "PRESENTATION_FORMATTING_ONLY")) {
    derived = "LOW";
  } else {
    derived = "UNKNOWN";
  }

  if (observation.recordedRiskLabel && observation.recordedRiskLabel !== derived) {
    return "UNKNOWN";
  }

  return derived;
}

/**
 * Historical evidence may support a candidate only when the evaluated gate was
 * actually executed and its recorded outcome is reconstructable and attributable.
 * Unexecuted gates are never treated as no-new-information.
 */
export function evaluateComparableGateEvidence(
  comparable: ComparableGateEvidence[],
  gate: string,
): HarnessEvidenceSufficiency {
  if (comparable.length === 0) {
    return { state: "INSUFFICIENT", reasonCodes: ["INSUFFICIENT_EVIDENCE"] };
  }

  const reasons = new Set<HarnessReasonCode>();

  for (const item of comparable) {
    if (item.gate !== gate || !item.observation.gatesActuallyExecuted.includes(gate)) {
      reasons.add("GATE_NOT_EXECUTED");
      continue;
    }

    if (item.observation.evidenceState === "CONTRADICTORY") {
      reasons.add("CONTRADICTORY_EVIDENCE");
      continue;
    }

    const risk = classifyHarnessRisk(item.observation);
    if (risk === "HIGH" || risk === "UNKNOWN") {
      reasons.add("INSUFFICIENT_EVIDENCE");
    }

    if (!item.outcomeReconstructable) reasons.add("OUTCOME_NOT_RECONSTRUCTABLE");
    if (!item.attributionExplicit) reasons.add("OUTCOME_NOT_ATTRIBUTABLE");
    if (!item.validComparisonBasis) reasons.add("NO_VALID_COMPARISON_BASIS");
    if (item.observation.evidenceRefs.length === 0) reasons.add("INSUFFICIENT_EVIDENCE");

    const gateProducedInformation =
      !item.observation.noNewInformationGates.includes(gate) ||
      item.observation.materialFindings.length > 0 ||
      item.observation.corrections.length > 0 ||
      item.observation.regressions.length > 0;

    if (gateProducedInformation) reasons.add("GATE_PRODUCED_INFORMATION");
  }

  if (reasons.has("CONTRADICTORY_EVIDENCE")) {
    return { state: "CONTRADICTORY", reasonCodes: [...reasons] };
  }

  if (reasons.size > 0) {
    return { state: "INSUFFICIENT", reasonCodes: [...reasons] };
  }

  return { state: "SUFFICIENT", reasonCodes: ["SUFFICIENT_COMPARABLE_EVIDENCE"] };
}

/**
 * Advisory-only resolver. It never changes real gate execution or eligibility.
 */
export function resolveHarnessShadowDecision(
  observation: RawHarnessObservation,
  comparableEvidence: HarnessEvidenceSufficiency,
): HarnessShadowDecision {
  const riskClass = classifyHarnessRisk(observation);

  if (observation.evidenceState === "CONTRADICTORY" || comparableEvidence.state === "CONTRADICTORY") {
    return {
      riskClass: riskClass === "UNKNOWN" ? "UNKNOWN" : riskClass,
      recommendation: "KEEP_FULL",
      reasonCodes: unique(["CONTRADICTORY_EVIDENCE", ...comparableEvidence.reasonCodes]),
      advisoryOnly: true,
    };
  }

  if (riskClass === "HIGH") {
    return {
      riskClass,
      recommendation: "KEEP_FULL",
      reasonCodes: ["HIGH_RISK"],
      advisoryOnly: true,
    };
  }

  if (riskClass === "UNKNOWN") {
    const recordedMismatch = Boolean(
      observation.recordedRiskLabel &&
        deriveRiskIgnoringRecordedLabel(observation) !== observation.recordedRiskLabel,
    );
    return {
      riskClass,
      recommendation: "KEEP_FULL",
      reasonCodes: unique([
        recordedMismatch ? "RECORDED_RISK_MISMATCH" : "INSUFFICIENT_EVIDENCE",
        ...comparableEvidence.reasonCodes,
      ]),
      advisoryOnly: true,
    };
  }

  if (comparableEvidence.state !== "SUFFICIENT") {
    return {
      riskClass,
      recommendation: "KEEP_FULL",
      reasonCodes: unique(["INSUFFICIENT_EVIDENCE", ...comparableEvidence.reasonCodes]),
      advisoryOnly: true,
    };
  }

  return {
    riskClass,
    recommendation: "MINIMALITY_CANDIDATE",
    reasonCodes: ["SUFFICIENT_COMPARABLE_EVIDENCE"],
    advisoryOnly: true,
  };
}

export function buildHarnessEvidencePacket(
  observation: RawHarnessObservation,
  comparableEvidence: HarnessEvidenceSufficiency,
): HarnessEvidencePacket {
  const decision = resolveHarnessShadowDecision(observation, comparableEvidence);
  return {
    workUnitRef: observation.workUnitRef,
    ...decision,
    evidenceState: observation.evidenceState,
    gatesActuallyExecuted: [...observation.gatesActuallyExecuted],
    materialFindings: [...observation.materialFindings],
    corrections: [...observation.corrections],
    regressions: [...observation.regressions],
    noNewInformationGates: [...observation.noNewInformationGates],
    evidenceRefs: [...observation.evidenceRefs],
    ...(observation.recordedRiskLabel ? { recordedRiskLabel: observation.recordedRiskLabel } : {}),
    actualGatePolicy: "UNCHANGED",
  };
}

export function replayHarnessObservation(
  observation: RawHarnessObservation,
  comparable: ComparableGateEvidence[],
  gate: string,
): HarnessEvidencePacket {
  return buildHarnessEvidencePacket(observation, evaluateComparableGateEvidence(comparable, gate));
}

function deriveRiskIgnoringRecordedLabel(observation: RawHarnessObservation): HarnessRiskClass {
  const { recordedRiskLabel: _recordedRiskLabel, ...withoutRecorded } = observation;
  return classifyHarnessRisk(withoutRecorded);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
