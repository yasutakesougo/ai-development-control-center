import {
  collectHumanDecisionEvidence,
  toHumanDecisionRequired,
} from "../../domain/humanDecisionEvidence";
import type {
  CiState,
  MergeState,
  ObservedFacts,
  ObservedPullRequest,
  ReviewState,
} from "../../domain/observedFacts";

const API = "https://api.github.com";

export const GITHUB_SUBREQUEST_BUDGET_EXCEEDED = "GITHUB_SUBREQUEST_BUDGET_EXCEEDED";
export const SUBREQUEST_LIMIT = 50;
export const BASE_COST = 3;
export const PER_PR_COST = 3;

export function requiredCost(openPullRequestCount: number): number {
  return BASE_COST + PER_PR_COST * openPullRequestCount;
}

type GitHubEnv = { GITHUB_TOKEN?: string };

type RepoResponse = { default_branch?: string };
type CommitResponse = { sha?: string };
type PullResponse = {
  number: number;
  title: string;
  draft?: boolean;
  body?: string | null;
  mergeable?: boolean | null;
  mergeable_state?: string;
  html_url?: string;
  head?: { sha?: string };
};
type ReviewResponse = { user?: { login?: string }; state?: string; submitted_at?: string };
type CheckRunsResponse = {
  total_count?: number;
  check_runs?: Array<{ status?: string; conclusion?: string | null }>;
};
type StatusResponse = { state?: string; total_count?: number };

export async function observeRepository(
  repository: string,
  env: GitHubEnv,
): Promise<ObservedFacts> {
  const sourceRefs = [`github:repo:${repository}`];

  try {
    const repo = await githubGet<RepoResponse>(`/repos/${repository}`, env);
    if (!repo.default_branch) return missing(repository, sourceRefs, "default branch missing");

    const branch = await githubGet<CommitResponse>(
      `/repos/${repository}/commits/${encodeURIComponent(repo.default_branch)}`,
      env,
    );
    if (!branch.sha) return missing(repository, sourceRefs, "main commit SHA missing");

    const pulls = await githubGet<PullResponse[]>(`/repos/${repository}/pulls?state=open&per_page=30`, env);
    if (requiredCost(pulls.length) > SUBREQUEST_LIMIT) {
      return budgetExceeded(repository, sourceRefs);
    }

    const observedPullRequests: ObservedPullRequest[] = [];
    for (const pull of pulls) {
      observedPullRequests.push(await observePull(repository, pull, env));
    }

    return {
      repository,
      observedAt: new Date().toISOString(),
      evidenceState: "CONFIRMED",
      currentMain: branch.sha,
      openPullRequests: observedPullRequests,
      relevantIssueStates: {},
      errors: [],
      sourceRefs,
    };
  } catch {
    return {
      repository,
      observedAt: new Date().toISOString(),
      evidenceState: "ERROR",
      currentMain: null,
      openPullRequests: null,
      relevantIssueStates: null,
      errors: ["GitHub API request failed"],
      sourceRefs,
    };
  }
}

/**
 * Prefer the authoritative PR detail body.
 * Explicit `null` means the body is empty — do not resurrect a stale list-response marker.
 * Fall back to summary.body only when the detail body property is missing (`undefined`).
 */
export function selectAuthoritativePullBody(
  detailBody: string | null | undefined,
  summaryBody: string | null | undefined,
): string | null | undefined {
  if (detailBody !== undefined) return detailBody;
  return summaryBody;
}

async function observePull(
  repository: string,
  summary: PullResponse,
  env: GitHubEnv,
): Promise<ObservedPullRequest> {
  const pull = await githubGet<PullResponse>(`/repos/${repository}/pulls/${summary.number}`, env);
  const sha = pull.head?.sha;
  const sourceRefs = [pull.html_url ?? `github:pr:${summary.number}`];
  const humanDecisionEvidence = collectHumanDecisionEvidence(
    selectAuthoritativePullBody(pull.body, summary.body),
  );

  if (!sha) {
    return {
      number: summary.number,
      title: summary.title,
      draft: Boolean(summary.draft),
      ci: "UNKNOWN",
      review: "UNKNOWN",
      mergeState: "UNKNOWN",
      humanDecisionRequired: toHumanDecisionRequired(humanDecisionEvidence),
      humanDecisionEvidence,
      sourceRefs,
    };
  }

  const [status, reviews] = await Promise.all([
    githubGet<StatusResponse>(`/repos/${repository}/commits/${sha}/status`, env),
    githubGet<ReviewResponse[]>(`/repos/${repository}/pulls/${summary.number}/reviews?per_page=100`, env),
  ]);

  return {
    number: summary.number,
    title: summary.title,
    draft: Boolean(summary.draft),
    ci: normalizeCi(null, status),
    review: normalizeReview(reviews),
    mergeState: normalizeMergeState(pull),
    humanDecisionRequired: toHumanDecisionRequired(humanDecisionEvidence),
    humanDecisionEvidence,
    sourceRefs,
  };
}

/**
 * Prefer Check Runs when available.
 * If Checks API is unavailable or returns no runs, fall back to Commit Status
 * only when total_count > 0. GitHub returns state=pending even with zero statuses,
 * so empty combined status must be UNKNOWN (fail-closed), not PENDING.
 */
export function normalizeCi(checks: CheckRunsResponse | null, status: StatusResponse): CiState {
  const runs = checks?.check_runs ?? [];
  if (runs.length > 0) {
    if (runs.some((run) => run.status !== "completed")) return "PENDING";
    if (runs.some((run) => run.conclusion && !["success", "neutral", "skipped"].includes(run.conclusion))) {
      return "FAIL";
    }
    return "PASS";
  }

  if (typeof status.total_count !== "number" || status.total_count <= 0) {
    return "UNKNOWN";
  }

  if (status.state === "pending") return "PENDING";
  if (status.state === "failure" || status.state === "error") return "FAIL";
  if (status.state === "success") return "PASS";
  return "UNKNOWN";
}

function normalizeReview(reviews: ReviewResponse[]): ReviewState {
  if (reviews.length === 0) return "UNKNOWN";
  const latest = new Map<string, ReviewResponse>();
  for (const review of reviews) {
    const login = review.user?.login;
    if (login) latest.set(login, review);
  }
  const states = [...latest.values()].map((review) => review.state);
  if (states.includes("CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  if (states.includes("APPROVED")) return "PASS";
  if (states.some((state) => state === "PENDING")) return "PENDING";
  return "UNKNOWN";
}

function normalizeMergeState(pull: PullResponse): MergeState {
  if (pull.mergeable === true && ["clean", "unstable", "has_hooks"].includes(pull.mergeable_state ?? "")) {
    return "CLEAN";
  }
  if (pull.mergeable === false) return "BLOCKED";
  return "UNKNOWN";
}

async function githubGet<T>(path: string, env: GitHubEnv): Promise<T> {
  const response = await githubFetch(path, env);
  if (!response.ok) throw new Error("GitHub API request failed");
  return (await response.json()) as T;
}

async function githubFetch(path: string, env: GitHubEnv): Promise<Response> {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "ai-development-control-center",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  if (env.GITHUB_TOKEN) headers.set("Authorization", `Bearer ${env.GITHUB_TOKEN}`);
  return fetch(`${API}${path}`, { method: "GET", headers });
}

function budgetExceeded(repository: string, sourceRefs: string[]): ObservedFacts {
  return {
    repository,
    observedAt: new Date().toISOString(),
    evidenceState: "ERROR",
    currentMain: null,
    openPullRequests: null,
    relevantIssueStates: null,
    errors: [GITHUB_SUBREQUEST_BUDGET_EXCEEDED],
    sourceRefs,
  };
}

function missing(repository: string, sourceRefs: string[], message: string): ObservedFacts {
  return {
    repository,
    observedAt: new Date().toISOString(),
    evidenceState: "MISSING",
    currentMain: null,
    openPullRequests: null,
    relevantIssueStates: null,
    errors: [message],
    sourceRefs,
  };
}
