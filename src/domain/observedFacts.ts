export type EvidenceState = "CONFIRMED" | "MISSING" | "CONTRADICTORY" | "ERROR";

export type CiState = "PASS" | "PENDING" | "FAIL" | "UNKNOWN";
export type ReviewState = "PASS" | "PENDING" | "CHANGES_REQUESTED" | "UNKNOWN";
export type MergeState = "CLEAN" | "BLOCKED" | "UNKNOWN";

export interface ObservedPullRequest {
  number: number;
  title: string;
  draft: boolean;
  ci: CiState;
  review: ReviewState;
  mergeState: MergeState;
  humanDecisionRequired: boolean | null;
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
}
