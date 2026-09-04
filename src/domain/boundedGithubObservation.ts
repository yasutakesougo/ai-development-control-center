/**
 * BOUNDED-GITHUB-OBSERVATION-V1 — pure cost + prioritizer helpers.
 * No I/O. Deterministic for identical inputs.
 */

import { collectHumanDecisionEvidence } from "./humanDecisionEvidence";

export const SUBREQUEST_LIMIT = 50;
export const SAFE_BUDGET = 45;
export const BASE_COST = 3;
export const PER_DETAILED_PR_COST = 3;
export const MAX_DETAILED_PRS = Math.floor((SAFE_BUDGET - BASE_COST) / PER_DETAILED_PR_COST); // 14

export const OPEN_PR_DETAIL_OBSERVATION_TRUNCATED = "OPEN_PR_DETAIL_OBSERVATION_TRUNCATED";
export const OPEN_PR_LIST_PAGE_TRUNCATED = "OPEN_PR_LIST_PAGE_TRUNCATED";

/** Retained for history/tests; must not encode successful-Tier-0 truncation. */
export const GITHUB_SUBREQUEST_BUDGET_EXCEEDED = "GITHUB_SUBREQUEST_BUDGET_EXCEEDED";

export type OmitReason = "BUDGET_DETAIL_CAP" | "OPEN_PR_LIST_PAGE_TRUNCATED" | "DETAIL_FETCH_FAILED";

export interface PrioritizablePull {
  number: number;
  title: string;
  draft?: boolean;
  body?: string | null;
  base?: { ref?: string };
  updated_at?: string;
}

export interface PrioritizeOptions {
  defaultBranch: string;
  /** V1: empty — Rank 2 never hits unless a later Scope adds fixed policy. */
  targetIssues?: number[];
}

export function estimatedObservationCost(detailedPullCount: number): number {
  return BASE_COST + PER_DETAILED_PR_COST * detailedPullCount;
}

export function isOpenPullListPageTruncated(pullCount: number): boolean {
  return pullCount === 30;
}

function rankClass(pull: PrioritizablePull, options: PrioritizeOptions): number {
  const decision = collectHumanDecisionEvidence(pull.body);
  if (decision.state === "REQUIRED") return 1;

  const targets = options.targetIssues ?? [];
  if (targets.length > 0) {
    const haystack = `${pull.title}\n${pull.body ?? ""}`;
    if (targets.some((issue) => new RegExp(`#${issue}\\b`).test(haystack))) return 2;
  }

  if (pull.draft !== true && pull.base?.ref === options.defaultBranch) return 3;

  if (pull.updated_at) return 4;
  return 5;
}

/**
 * Stable total order: Rank 1→5, then updated_at desc, then number asc.
 */
export function prioritizeOpenPulls<T extends PrioritizablePull>(
  pulls: T[],
  options: PrioritizeOptions,
): T[] {
  return [...pulls].sort((a, b) => {
    const rankDelta = rankClass(a, options) - rankClass(b, options);
    if (rankDelta !== 0) return rankDelta;

    const aUpdated = a.updated_at ?? "";
    const bUpdated = b.updated_at ?? "";
    if (aUpdated !== bUpdated) return aUpdated < bUpdated ? 1 : -1;

    return a.number - b.number;
  });
}

export function selectDetailedPulls<T extends PrioritizablePull>(
  ordered: T[],
): { selected: T[]; omittedFromCap: T[] } {
  return {
    selected: ordered.slice(0, MAX_DETAILED_PRS),
    omittedFromCap: ordered.slice(MAX_DETAILED_PRS),
  };
}
