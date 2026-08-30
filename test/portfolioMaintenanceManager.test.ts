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
