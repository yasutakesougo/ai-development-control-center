import { describe, expect, it } from "vitest";
import {
  buildHarnessEvidencePacket,
  classifyHarnessRisk,
  evaluateComparableGateEvidence,
  replayHarnessObservation,
  resolveHarnessShadowDecision,
  type ComparableGateEvidence,
  type RawHarnessObservation,
} from "../src/domain/harnessMinimality";

function observation(overrides: Partial<RawHarnessObservation> = {}): RawHarnessObservation {
  return {
    workUnitRef: "issue:example",
    changeCharacteristics: ["PRESENTATION_FORMATTING_ONLY"],
    gatesActuallyExecuted: ["Independent Implementation Review"],
    materialFindings: [],
    corrections: [],
    regressions: [],
    noNewInformationGates: ["Independent Implementation Review"],
    evidenceRefs: ["github:issue:example"],
    evidenceState: "SUFFICIENT",
    ...overrides,
  };
}

function comparable(
  source = observation(),
  overrides: Partial<Omit<ComparableGateEvidence, "observation">> = {},
): ComparableGateEvidence {
  return {
    observation: source,
    gate: "Independent Implementation Review",
    outcomeReconstructable: true,
    attributionExplicit: true,
    validComparisonBasis: true,
    ...overrides,
  };
}

describe("HARNESS-MINIMALITY-V1 risk classifier", () => {
  it("classifies pure formatting-only presentation as LOW", () => {
    expect(classifyHarnessRisk(observation())).toBe("LOW");
  });

  it("classifies workflow/gate meaning presentation as MEDIUM", () => {
    expect(
      classifyHarnessRisk(
        observation({ changeCharacteristics: ["PRESENTATION_WORKFLOW_MEANING"] }),
      ),
    ).toBe("MEDIUM");
  });

  it("classifies contract/state-transition semantics as MEDIUM", () => {
    expect(
      classifyHarnessRisk(
        observation({ changeCharacteristics: ["CONTRACT_OR_STATE_TRANSITION"] }),
      ),
    ).toBe("MEDIUM");
  });

  it("classifies credential/security/live-data boundaries as HIGH", () => {
    expect(
      classifyHarnessRisk(
        observation({ changeCharacteristics: ["PERMISSION_OR_CREDENTIAL_OR_SECURITY"] }),
      ),
    ).toBe("HIGH");
    expect(
      classifyHarnessRisk(observation({ changeCharacteristics: ["LIVE_DATA_MUTATION"] })),
    ).toBe("HIGH");
  });

  it("fails closed to UNKNOWN for ambiguous or insufficient classification evidence", () => {
    expect(
      classifyHarnessRisk(observation({ changeCharacteristics: ["AMBIGUOUS_OR_MIXED"] })),
    ).toBe("UNKNOWN");
    expect(classifyHarnessRisk(observation({ evidenceState: "INSUFFICIENT" }))).toBe("UNKNOWN");
    expect(classifyHarnessRisk(observation({ evidenceRefs: [] }))).toBe("UNKNOWN");
  });

  it("does not let a recorded historical risk label override derived risk", () => {
    expect(classifyHarnessRisk(observation({ recordedRiskLabel: "MEDIUM" }))).toBe("UNKNOWN");
    expect(classifyHarnessRisk(observation({ recordedRiskLabel: "LOW" }))).toBe("LOW");
  });
});

describe("HARNESS-MINIMALITY-V1 evidence sufficiency", () => {
  it("requires the evaluated gate to have actually executed", () => {
    const source = observation({ gatesActuallyExecuted: [], noNewInformationGates: [] });
    const result = evaluateComparableGateEvidence([comparable(source)], "Independent Implementation Review");
    expect(result.state).toBe("INSUFFICIENT");
    expect(result.reasonCodes).toContain("GATE_NOT_EXECUTED");
  });

  it("requires reconstructable, attributable, valid comparison evidence", () => {
    const result = evaluateComparableGateEvidence(
      [
        comparable(observation(), {
          outcomeReconstructable: false,
          attributionExplicit: false,
          validComparisonBasis: false,
        }),
      ],
      "Independent Implementation Review",
    );
    expect(result.state).toBe("INSUFFICIENT");
    expect(result.reasonCodes).toContain("OUTCOME_NOT_RECONSTRUCTABLE");
    expect(result.reasonCodes).toContain("OUTCOME_NOT_ATTRIBUTABLE");
    expect(result.reasonCodes).toContain("NO_VALID_COMPARISON_BASIS");
  });

  it("does not treat a gate that produced findings/corrections as no-new-information", () => {
    const source = observation({
      materialFindings: ["P1 finding"],
      corrections: ["Correction-1"],
    });
    const result = evaluateComparableGateEvidence([comparable(source)], "Independent Implementation Review");
    expect(result.state).toBe("INSUFFICIENT");
    expect(result.reasonCodes).toContain("GATE_PRODUCED_INFORMATION");
  });

  it("accepts positive comparable no-new-information evidence", () => {
    const result = evaluateComparableGateEvidence([comparable()], "Independent Implementation Review");
    expect(result).toEqual({
      state: "SUFFICIENT",
      reasonCodes: ["SUFFICIENT_COMPARABLE_EVIDENCE"],
    });
  });
});

describe("HARNESS-MINIMALITY-V1 shadow resolver", () => {
  it("keeps the full process for HIGH and UNKNOWN risk", () => {
    const sufficient = evaluateComparableGateEvidence([comparable()], "Independent Implementation Review");

    expect(
      resolveHarnessShadowDecision(
        observation({ changeCharacteristics: ["PERMISSION_OR_CREDENTIAL_OR_SECURITY"] }),
        sufficient,
      ).recommendation,
    ).toBe("KEEP_FULL");

    const unknown = resolveHarnessShadowDecision(
      observation({ evidenceState: "INSUFFICIENT" }),
      sufficient,
    );
    expect(unknown.recommendation).toBe("KEEP_FULL");
    expect(unknown.reasonCodes).toContain("INSUFFICIENT_EVIDENCE");
  });

  it("keeps the full process when comparable evidence is insufficient", () => {
    const insufficient = evaluateComparableGateEvidence([], "Independent Implementation Review");
    const decision = resolveHarnessShadowDecision(observation(), insufficient);
    expect(decision.recommendation).toBe("KEEP_FULL");
    expect(decision.reasonCodes).toContain("INSUFFICIENT_EVIDENCE");
  });

  it("emits MINIMALITY_CANDIDATE only with LOW/MEDIUM risk and sufficient comparable evidence", () => {
    const sufficient = evaluateComparableGateEvidence([comparable()], "Independent Implementation Review");
    const low = resolveHarnessShadowDecision(observation(), sufficient);
    const medium = resolveHarnessShadowDecision(
      observation({ changeCharacteristics: ["PRESENTATION_WORKFLOW_MEANING"] }),
      sufficient,
    );

    expect(low.recommendation).toBe("MINIMALITY_CANDIDATE");
    expect(medium.recommendation).toBe("MINIMALITY_CANDIDATE");
    expect(low.advisoryOnly).toBe(true);
  });

  it("keeps contradictory evidence fail-closed", () => {
    const contradictory = resolveHarnessShadowDecision(
      observation({ evidenceState: "CONTRADICTORY" }),
      { state: "CONTRADICTORY", reasonCodes: ["CONTRADICTORY_EVIDENCE"] },
    );
    expect(contradictory.recommendation).toBe("KEEP_FULL");
    expect(contradictory.reasonCodes).toContain("CONTRADICTORY_EVIDENCE");
  });
});

describe("HARNESS-MINIMALITY-V1 evidence packet / replay", () => {
  it("uses only the derived riskClass and preserves recorded label as provenance", () => {
    const source = observation({ recordedRiskLabel: "LOW" });
    const sufficient = evaluateComparableGateEvidence([comparable(source)], "Independent Implementation Review");
    const packet = buildHarnessEvidencePacket(source, sufficient);

    expect(packet.riskClass).toBe("LOW");
    expect(packet.recordedRiskLabel).toBe("LOW");
    expect(packet.actualGatePolicy).toBe("UNCHANGED");
    expect(packet.advisoryOnly).toBe(true);
  });

  it("replays deterministically without changing actual gate policy", () => {
    const source = observation();
    const first = replayHarnessObservation(source, [comparable(source)], "Independent Implementation Review");
    const second = replayHarnessObservation(source, [comparable(source)], "Independent Implementation Review");
    expect(second).toEqual(first);
    expect(first.actualGatePolicy).toBe("UNCHANGED");
  });
});
