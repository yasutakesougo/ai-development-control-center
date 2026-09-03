export type ArchitectureGuardClassification = "MUST" | "SHOULD" | "NICE-TO-HAVE";
export type ArchitectureGuardBoundaryDecision =
  | "NO_NEW_BOUNDARY"
  | "NEW_BOUNDARY_JUSTIFIED"
  | "UNKNOWN";
export type ArchitectureGuardResult = "PASS" | "HOLD";

const NEW_BOUNDARY_FIELDS = [
  "newRepository",
  "newService",
  "newAgent",
  "newDatabase",
  "newAbstraction",
  "newSharedPlatform",
  "newExternalSaas",
  "newCrossRepoContract",
] as const;

export interface SingleMaintainerArchitectureProposal {
  necessity: {
    withoutChange: string;
    businessBlocker: string;
    classification: ArchitectureGuardClassification;
  };
  complexity: {
    newRepository: boolean;
    newService: boolean;
    newAgent: boolean;
    newDatabase: boolean;
    newAbstraction: boolean;
    newSharedPlatform: boolean;
    newExternalSaas: boolean;
    newCrossRepoContract: boolean;
    boundaryDecision: ArchitectureGuardBoundaryDecision;
    boundaryReason?: string;
    noNewBoundaryAlternative?: string;
    whyRejected?: string;
  };
  minimalAlternative: string;
  recommendation: string;
  rejected: string;
  safetyChange?: {
    safetyChange: string;
    whyRequired: string;
    failureMode: string;
    safetyPreservation: string;
    rollback: string;
  };
}

export interface SingleMaintainerArchitectureGuardCheck {
  result: ArchitectureGuardResult;
  reasons: string[];
  authorizesHumanAction: false;
}

function present(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function checkSingleMaintainerArchitectureProposal(
  proposal: SingleMaintainerArchitectureProposal,
): SingleMaintainerArchitectureGuardCheck {
  const reasons: string[] = [];

  if (!present(proposal.necessity?.withoutChange)) reasons.push("MISSING_WITHOUT_CHANGE");
  if (!present(proposal.necessity?.businessBlocker)) reasons.push("MISSING_BUSINESS_BLOCKER");
  if (!present(proposal.minimalAlternative)) reasons.push("MISSING_MINIMAL_ALTERNATIVE");
  if (!present(proposal.recommendation)) reasons.push("MISSING_RECOMMENDATION");
  if (!present(proposal.rejected)) reasons.push("MISSING_REJECTED");

  const complexity = proposal.complexity;
  if (!complexity) {
    reasons.push("MISSING_COMPLEXITY");
  } else {
    const addsBoundary = NEW_BOUNDARY_FIELDS.some((field) => complexity[field] === true);
    if (complexity.boundaryDecision === "UNKNOWN") reasons.push("BOUNDARY_DECISION_UNKNOWN");
    if (addsBoundary) {
      if (!present(complexity.boundaryReason)) reasons.push("MISSING_BOUNDARY_REASON");
      if (!present(complexity.noNewBoundaryAlternative)) {
        reasons.push("MISSING_NO_NEW_BOUNDARY_ALTERNATIVE");
      }
      if (!present(complexity.whyRejected)) reasons.push("MISSING_WHY_REJECTED");
      if (complexity.boundaryDecision !== "NEW_BOUNDARY_JUSTIFIED") {
        reasons.push("NEW_BOUNDARY_NOT_JUSTIFIED");
      }
    }
  }

  if (proposal.safetyChange) {
    const safety = proposal.safetyChange;
    if (!present(safety.safetyChange)) reasons.push("MISSING_SAFETY_CHANGE");
    if (!present(safety.whyRequired)) reasons.push("MISSING_SAFETY_WHY_REQUIRED");
    if (!present(safety.failureMode)) reasons.push("MISSING_SAFETY_FAILURE_MODE");
    if (!present(safety.safetyPreservation)) reasons.push("MISSING_SAFETY_PRESERVATION");
    if (!present(safety.rollback)) reasons.push("MISSING_SAFETY_ROLLBACK");
  }

  return {
    result: reasons.length === 0 ? "PASS" : "HOLD",
    reasons,
    authorizesHumanAction: false,
  };
}
