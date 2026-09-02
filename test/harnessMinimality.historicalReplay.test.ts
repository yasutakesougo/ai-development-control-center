import { describe, expect, it } from "vitest";
import {
  evaluateComparableGateEvidence,
  replayHarnessObservation,
  resolveHarnessShadowDecision,
  type ComparableGateEvidence,
  type RawHarnessObservation,
} from "../src/domain/harnessMinimality";

const independentImplementationReview = "Independent Implementation Review";

/**
 * Historical fixtures below are evidence-bound summaries of recorded ADCC work.
 * They are intentionally read-only and do not assert that a gate is unnecessary.
 */
describe("HARNESS-MINIMALITY-V1 historical replay / shadow evidence", () => {
  it("#137 / PR #142: a MEDIUM presentation-meaning change keeps full process when review found P1", () => {
    const observation: RawHarnessObservation = {
      workUnitRef: "github:issue:137/pr:142",
      changeCharacteristics: ["PRESENTATION_WORKFLOW_MEANING"],
      gatesActuallyExecuted: [independentImplementationReview],
      materialFindings: [
        "P1: schema-invalid /api/status payload could poison App data before fail-closed rendering",
      ],
      corrections: ["Implementation Correction-1 at 3b206e842a6829fb544815c1ffb3c0f4293f4db2"],
      regressions: [],
      noNewInformationGates: [],
      evidenceRefs: [
        "github:issue:137",
        "github:pr:142#pullrequestreview-5089396556",
        "github:pr:142@3b206e842a6829fb544815c1ffb3c0f4293f4db2",
      ],
      evidenceState: "SUFFICIENT",
    };

    const comparable: ComparableGateEvidence = {
      observation,
      gate: independentImplementationReview,
      outcomeReconstructable: true,
      attributionExplicit: true,
      validComparisonBasis: true,
    };

    const packet = replayHarnessObservation(
      observation,
      [comparable],
      independentImplementationReview,
    );

    expect(packet.riskClass).toBe("MEDIUM");
    expect(packet.recommendation).toBe("KEEP_FULL");
    expect(packet.reasonCodes).toContain("GATE_PRODUCED_INFORMATION");
    expect(packet.actualGatePolicy).toBe("UNCHANGED");
  });

  it("#140: credential/security work is HIGH and remains KEEP_FULL regardless of candidate evidence", () => {
    const observation: RawHarnessObservation = {
      workUnitRef: "github:issue:140",
      changeCharacteristics: ["PERMISSION_OR_CREDENTIAL_OR_SECURITY"],
      gatesActuallyExecuted: ["Definition Review", "Scope Review"],
      materialFindings: [
        "credential type, exact permissions, expiry/revocation and exact staging worker identity required correction",
      ],
      corrections: ["Definition Correction-1", "Scope Correction-1"],
      regressions: [],
      noNewInformationGates: [],
      evidenceRefs: ["github:issue:140"],
      evidenceState: "SUFFICIENT",
    };

    const decision = resolveHarnessShadowDecision(observation, {
      state: "SUFFICIENT",
      reasonCodes: ["SUFFICIENT_COMPARABLE_EVIDENCE"],
    });

    expect(decision.riskClass).toBe("HIGH");
    expect(decision.recommendation).toBe("KEEP_FULL");
    expect(decision.reasonCodes).toEqual(["HIGH_RISK"]);
    expect(decision.advisoryOnly).toBe(true);
  });

  it("#141: mixed docs + runtime-script change is UNKNOWN without narrower provenance and stays KEEP_FULL", () => {
    const observation: RawHarnessObservation = {
      workUnitRef: "github:pr:141",
      changeCharacteristics: ["AMBIGUOUS_OR_MIXED"],
      gatesActuallyExecuted: [],
      materialFindings: [],
      corrections: [],
      regressions: [],
      noNewInformationGates: [],
      evidenceRefs: [
        "github:pr:141",
        "github:commit:263a29e41a4fe886e689db2a4050df3e26334dcf",
      ],
      evidenceState: "SUFFICIENT",
    };

    const decision = resolveHarnessShadowDecision(
      observation,
      evaluateComparableGateEvidence([], independentImplementationReview),
    );

    expect(decision.riskClass).toBe("UNKNOWN");
    expect(decision.recommendation).toBe("KEEP_FULL");
    expect(decision.reasonCodes).toContain("INSUFFICIENT_EVIDENCE");
    expect(decision.advisoryOnly).toBe(true);
  });
});
