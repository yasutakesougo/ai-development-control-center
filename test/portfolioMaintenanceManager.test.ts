import { describe, expect, it } from "vitest";
import {
  DETECTION_CLASSES,
  IMPLEMENTED_DETECTION_CLASSES,
  evaluateMaintenance,
  type DetectionClass,
  type EvaluationInput,
  type EvidenceReference,
} from "../src/domain/portfolioMaintenanceManager";

const snapshot = {
  observedAt: "2026-08-30T08:25:00Z",
  repositoryRef: "refs/heads/main",
  commitSha: "abc123",
  issueUpdatedAt: "UNKNOWN" as const,
  prUpdatedAt: "UNKNOWN" as const,
};

const target = {
  repository: "yasutakesougo/WELFARE-AI-ENGINEERING-PLATFORM",
  type: "document",
  identifier: "03-CURRENT-ROADMAP.txt",
};

const evidence = (...ids: string[]): EvidenceReference[] =>
  ids.map((id) => ({ id, kind: "TEST", value: id }));

const base = (overrides: Partial<EvaluationInput>): EvaluationInput => ({
  class: "STALE_STATE",
  candidateId: "PMC-TEST-1",
  target,
  snapshot,
  observedState: {},
  expectedOrReferencedState: {},
  stateSourceBinding: {
    observedStateSource: "Current Repository State",
    expectedOrReferencedStateSource: "Current Repository State",
  },
  evidenceRefs: [],
  sourcePrecedenceUsed: ["Current Repository State"],
  ...overrides,
});

describe("portfolio maintenance manager slice A", () => {
  it("implements only the five approved detection classes", () => {
    expect(IMPLEMENTED_DETECTION_CLASSES).toEqual([
      "STALE_STATE",
      "AUTHORITY_DRIFT",
      "BROKEN_REFERENCE",
      "UNRESOLVED_HOLD",
      "ROADMAP_DRIFT",
    ]);
  });

  it("fails closed for all non-implemented detection classes", () => {
    const unimplemented = DETECTION_CLASSES.filter(
      (item) => !(IMPLEMENTED_DETECTION_CLASSES as readonly DetectionClass[]).includes(item),
    );

    expect(unimplemented).toHaveLength(8);

    for (const detectionClass of unimplemented) {
      expect(evaluateMaintenance(base({ class: detectionClass }))).toEqual({
        kind: "NOT_IMPLEMENTED",
        class: detectionClass,
        verificationState: "INCONCLUSIVE",
        dispositionState: "HOLD",
        authorityRequired: [{ gate: "UNKNOWN", state: "UNKNOWN" }],
        autoMutationAllowed: false,
        reason: "SLICE_A_NOT_IMPLEMENTED",
      });
    }
  });

  it("holds when required evidence is missing", () => {
    const result = evaluateMaintenance(
      base({
        class: "STALE_STATE",
        observedState: { state: "OPEN" },
        expectedOrReferencedState: { state: "CLOSED" },
        evidenceRefs: evidence("current-state-identity", "live-state"),
      }),
    );

    expect(result.kind).toBe("INCONCLUSIVE");
    if (result.kind === "INCONCLUSIVE") {
      expect(result.reason).toBe("REQUIRED_EVIDENCE_MISSING");
      expect(result.missingEvidence).toEqual(["mismatch-comparison"]);
      expect(result.authorityRequired[0].gate).toBe("UNKNOWN");
    }
  });

  it("holds when class-specific state facts are absent or invalid", () => {
    const cases: EvaluationInput[] = [
      base({
        class: "STALE_STATE",
        evidenceRefs: evidence("current-state-identity", "live-state", "mismatch-comparison"),
      }),
      base({
        class: "AUTHORITY_DRIFT",
        evidenceRefs: evidence("authority-record-identity", "gate-identity", "current-authority-conflict"),
      }),
      base({
        class: "BROKEN_REFERENCE",
        observedState: { lookupCompleted: "yes", targetFound: false },
        stateSourceBinding: { observedStateSource: "Current Repository State" },
        evidenceRefs: evidence("reference-identity", "deterministic-lookup"),
      }),
      base({
        class: "UNRESOLVED_HOLD",
        observedState: { holdActive: true },
        expectedOrReferencedState: { blockerResolved: "yes" },
        evidenceRefs: evidence(
          "hold-decision-identity",
          "original-blocker-identity",
          "blocker-resolution-evidence",
        ),
      }),
      base({
        class: "ROADMAP_DRIFT",
        observedState: { sequence: "A,B" },
        expectedOrReferencedState: { sequence: ["A", "B"] },
        evidenceRefs: evidence("roadmap-identity", "current-gate-evidence", "sequencing-mismatch"),
      }),
    ];

    for (const input of cases) {
      const result = evaluateMaintenance(input);
      expect(result).toMatchObject({
        kind: "INCONCLUSIVE",
        class: input.class,
        verificationState: "INCONCLUSIVE",
        dispositionState: "HOLD",
        reason: "REQUIRED_STATE_MISSING_OR_INVALID",
        autoMutationAllowed: false,
      });
    }
  });

  it("holds unresolved source conflicts even with complete evidence", () => {
    const result = evaluateMaintenance(
      base({
        class: "AUTHORITY_DRIFT",
        observedState: { authority: "READY_GO" },
        expectedOrReferencedState: { authority: "NOT_AUTHORIZED" },
        evidenceRefs: evidence(
          "authority-record-identity",
          "gate-identity",
          "current-authority-conflict",
        ),
        sourceConflictUnresolved: true,
      }),
    );

    expect(result).toMatchObject({
      kind: "INCONCLUSIVE",
      reason: "SOURCE_CONFLICT_UNRESOLVED",
      dispositionState: "HOLD",
      autoMutationAllowed: false,
    });
  });

  it("treats object insertion order as canonically equal", () => {
    const result = evaluateMaintenance(
      base({
        class: "STALE_STATE",
        observedState: { state: { alpha: 1, nested: { left: true, right: false } } },
        expectedOrReferencedState: { state: { nested: { right: false, left: true }, alpha: 1 } },
        evidenceRefs: evidence("current-state-identity", "live-state", "mismatch-comparison"),
      }),
    );

    expect(result).toMatchObject({
      kind: "NO_FINDING",
      verificationState: "VERIFIED",
      dispositionState: "DISMISSED",
      reason: "DETECTION_CONDITION_NOT_MET",
    });
  });

  it("fails closed when state values are not bound to source identities", () => {
    const result = evaluateMaintenance(
      base({
        class: "STALE_STATE",
        observedState: { state: "OPEN" },
        expectedOrReferencedState: { state: "CLOSED" },
        stateSourceBinding: undefined,
        evidenceRefs: evidence("current-state-identity", "live-state", "mismatch-comparison"),
      }),
    );

    expect(result).toMatchObject({
      kind: "INCONCLUSIVE",
      reason: "SOURCE_VALUE_BINDING_INVALID",
      dispositionState: "HOLD",
      autoMutationAllowed: false,
    });
  });

  it("fails closed when expected state comes from a lower-priority source", () => {
    const result = evaluateMaintenance(
      base({
        class: "AUTHORITY_DRIFT",
        observedState: { authority: "READY_GO" },
        expectedOrReferencedState: { authority: "NOT_AUTHORIZED" },
        sourcePrecedenceUsed: [
          "Current Repository State",
          "Historical Review / Correction Evidence",
        ],
        stateSourceBinding: {
          observedStateSource: "Current Repository State",
          expectedOrReferencedStateSource: "Historical Review / Correction Evidence",
        },
        evidenceRefs: evidence(
          "authority-record-identity",
          "gate-identity",
          "current-authority-conflict",
        ),
      }),
    );

    expect(result).toMatchObject({
      kind: "INCONCLUSIVE",
      reason: "SOURCE_VALUE_BINDING_INVALID",
      dispositionState: "HOLD",
      autoMutationAllowed: false,
    });
  });

  it("accepts explicit binding when expected state is from an equal-or-higher priority source", () => {
    const result = evaluateMaintenance(
      base({
        class: "AUTHORITY_DRIFT",
        observedState: { authority: "READY_GO" },
        expectedOrReferencedState: { authority: "NOT_AUTHORIZED" },
        sourcePrecedenceUsed: [
          "Current Authority / Current Decision",
          "Historical Review / Correction Evidence",
        ],
        stateSourceBinding: {
          observedStateSource: "Historical Review / Correction Evidence",
          expectedOrReferencedStateSource: "Current Authority / Current Decision",
        },
        evidenceRefs: evidence(
          "authority-record-identity",
          "gate-identity",
          "current-authority-conflict",
        ),
      }),
    );

    expect(result.kind).toBe("CANDIDATE");
    if (result.kind === "CANDIDATE") {
      expect(result.candidate.stateSourceBinding).toEqual({
        observedStateSource: "Historical Review / Correction Evidence",
        expectedOrReferencedStateSource: "Current Authority / Current Decision",
      });
      expect(result.candidate.autoMutationAllowed).toBe(false);
    }
  });

  it("creates a verified stale-state candidate without mutation authority", () => {
    const result = evaluateMaintenance(
      base({
        class: "STALE_STATE",
        observedState: { state: "OPEN" },
        expectedOrReferencedState: { state: "CLOSED" },
        evidenceRefs: evidence(
          "current-state-identity",
          "live-state",
          "mismatch-comparison",
        ),
      }),
    );

    expect(result.kind).toBe("CANDIDATE");
    if (result.kind === "CANDIDATE") {
      expect(result.candidate.verificationState).toBe("VERIFIED");
      expect(result.candidate.dispositionState).toBe("OPEN");
      expect(result.candidate.autoMutationAllowed).toBe(false);
      expect(result.candidate.authorityRequired).toEqual([
        { gate: "MAINTENANCE_MUTATION", state: "REQUIRED" },
      ]);
    }
  });

  it("does not report a broken reference when deterministic lookup found the target", () => {
    const result = evaluateMaintenance(
      base({
        class: "BROKEN_REFERENCE",
        observedState: { lookupCompleted: true, targetFound: true },
        stateSourceBinding: { observedStateSource: "Current Repository State" },
        evidenceRefs: evidence("reference-identity", "deterministic-lookup"),
      }),
    );

    expect(result).toMatchObject({
      kind: "NO_FINDING",
      verificationState: "VERIFIED",
      dispositionState: "DISMISSED",
      autoMutationAllowed: false,
    });
  });

  it("detects unresolved HOLD only when blocker resolution evidence is present", () => {
    const result = evaluateMaintenance(
      base({
        class: "UNRESOLVED_HOLD",
        observedState: { holdActive: true },
        expectedOrReferencedState: { blockerResolved: true },
        evidenceRefs: evidence(
          "hold-decision-identity",
          "original-blocker-identity",
          "blocker-resolution-evidence",
        ),
      }),
    );

    expect(result.kind).toBe("CANDIDATE");
  });

  it("returns course-correction proposal only for roadmap drift", () => {
    const result = evaluateMaintenance(
      base({
        class: "ROADMAP_DRIFT",
        observedState: { sequence: ["A", "B"] },
        expectedOrReferencedState: { sequence: ["B", "A"] },
        evidenceRefs: evidence(
          "roadmap-identity",
          "current-gate-evidence",
          "sequencing-mismatch",
        ),
      }),
    );

    expect(result.kind).toBe("CANDIDATE");
    if (result.kind === "CANDIDATE") {
      expect(result.candidate.proposedAction).toContain("Propose course correction only");
      expect(result.candidate.autoMutationAllowed).toBe(false);
    }
  });
});
