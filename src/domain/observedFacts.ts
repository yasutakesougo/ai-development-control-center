import type { HumanDecisionEvidence } from "./humanDecisionEvidence";

export type EvidenceState = "CONFIRMED" | "PARTIAL" | "MISSING" | "CONTRADICTORY" | "ERROR";

export type CiState = "PASS" | "PENDING" | "FAIL" | "UNKNOWN";
export type ReviewState = "PASS" | "PENDING" | "CHANGES_REQUESTED" | "UNKNOWN";
export type MergeState = "CLEAN" | "BLOCKED" | "UNKNOWN";

export type ObservationOmitReason =
  | "BUDGET_DETAIL_CAP"
  | "OPEN_PR_LIST_PAGE_TRUNCATED"
  | "DETAIL_FETCH_FAILED";

export interface ObservationBudget {
  limit: number;
  safeBudget: number;
  estimatedUsed: number;
  bounded: boolean;
}

export interface OmittedPullRequest {
  number: number;
  reason: ObservationOmitReason;
}

export interface ObservedPullRequest {
  number: number;
  title: string;
  draft: boolean;
  ci: CiState;
  review: ReviewState;
  mergeState: MergeState;
  humanDecisionRequired: boolean | null;
  humanDecisionEvidence: HumanDecisionEvidence;
  sourceRefs: string[];
}

export interface ObservedFacts {
  repository: string;
  observedAt: string;
  evidenceState: EvidenceState;
  currentMain: string | null;
  openPullRequests: ObservedPullRequest[] | null;
  relevantIssueStates: Record<string, "OPEN" | "CLOSED" | "UNKNOWN"> | null;
  errors: string[];
  sourceRefs: string[];
  openPullRequestCount: number | null;
  observedPullRequestCount: number | null;
  omittedPullRequestCount: number | null;
  warnings: string[];
  observationBudget: ObservationBudget | null;
  omittedPullRequests: OmittedPullRequest[] | null;
}

/** Defaults for constructors that predate BOUNDED-GITHUB-OBSERVATION-V1 fields. */
export function emptyObservationExtensions(): Pick<
  ObservedFacts,
  | "openPullRequestCount"
  | "observedPullRequestCount"
  | "omittedPullRequestCount"
  | "warnings"
  | "observationBudget"
  | "omittedPullRequests"
> {
  return {
    openPullRequestCount: null,
    observedPullRequestCount: null,
    omittedPullRequestCount: null,
    warnings: [],
    observationBudget: null,
    omittedPullRequests: null,
  };
}
