import { describe, expect, it } from "vitest";
import {
  checkSingleMaintainerArchitectureProposal,
  type SingleMaintainerArchitectureProposal,
} from "../src/domain/singleMaintainerArchitectureGuard";

function validProposal(): SingleMaintainerArchitectureProposal {
  return {
    necessity: {
      withoutChange: "The proposal boundary would not enforce the locked Guard.",
      businessBlocker: "Required proposal evidence could be omitted.",
      classification: "MUST",
    },
    complexity: {
      newRepository: false,
      newService: false,
      newAgent: false,
      newDatabase: false,
      newAbstraction: false,
      newSharedPlatform: false,
      newExternalSaas: false,
      newCrossRepoContract: false,
      boundaryDecision: "NO_NEW_BOUNDARY",
    },
    minimalAlternative: "Keep documentation only.",
    recommendation: "Use the existing proposal boundary.",
    rejected: "Do not create a policy platform.",
  };
}

describe("SINGLE-MAINTAINER-ARCHITECTURE-GUARD-V1", () => {
  it("passes a complete compliant proposal without granting Human authority", () => {
    expect(checkSingleMaintainerArchitectureProposal(validProposal())).toEqual({
      result: "PASS",
      reasons: [],
      authorizesHumanAction: false,
    });
  });

  it("holds when a mandatory field is missing", () => {
    const proposal = validProposal();
    proposal.recommendation = "";

    expect(checkSingleMaintainerArchitectureProposal(proposal)).toMatchObject({
      result: "HOLD",
      reasons: ["MISSING_RECOMMENDATION"],
      authorizesHumanAction: false,
    });
  });

  it("holds a new boundary without the required evidence", () => {
    const proposal = validProposal();
    proposal.complexity.newService = true;
    proposal.complexity.boundaryDecision = "NEW_BOUNDARY_JUSTIFIED";

    const result = checkSingleMaintainerArchitectureProposal(proposal);
    expect(result.result).toBe("HOLD");
    expect(result.reasons).toEqual([
      "MISSING_BOUNDARY_REASON",
      "MISSING_NO_NEW_BOUNDARY_ALTERNATIVE",
      "MISSING_WHY_REJECTED",
    ]);
  });

  it("holds an UNKNOWN boundary decision", () => {
    const proposal = validProposal();
    proposal.complexity.boundaryDecision = "UNKNOWN";

    expect(checkSingleMaintainerArchitectureProposal(proposal)).toMatchObject({
      result: "HOLD",
      reasons: ["BOUNDARY_DECISION_UNKNOWN"],
    });
  });

  it("holds a safety change without complete safety evidence", () => {
    const proposal = validProposal();
    proposal.safetyChange = {
      safetyChange: "Reduce an existing gate.",
      whyRequired: "Current requirement.",
      failureMode: "Unsafe mutation.",
      safetyPreservation: "",
      rollback: "Restore the prior gate.",
    };

    expect(checkSingleMaintainerArchitectureProposal(proposal)).toMatchObject({
      result: "HOLD",
      reasons: ["MISSING_SAFETY_PRESERVATION"],
      authorizesHumanAction: false,
    });
  });
});
