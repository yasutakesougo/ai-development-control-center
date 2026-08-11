import type {
  CiState,
  MergeState,
  ObservedFacts,
  ObservedPullRequest,
  ReviewState,
} from "../../domain/observedFacts";

const API = "https://api.github.com";

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

async function observePull(
  repository: string,
  summary: PullResponse,
  env: GitHubEnv,
): Promise<ObservedPullRequest> {
  const pull = await githubGet<PullResponse>(`/repos/${repository}/pulls/${summary.number}`, env);
  const sha = pull.head?.sha;
  const sourceRefs = [pull.html_url ?? `github:pr:${summary.number}`];

  if (!sha) {
    return {
      number: summary.number,
      title: summary.title,
      draft: Boolean(summary.draft),
      ci: "UNKNOWN",
      review: "UNKNOWN",
      mergeState: "UNKNOWN",
      humanDecisionRequired: parseHumanDecision(summary.body),
      sourceRefs,
    };
  }

  // Checks API may be unavailable for fine-grained PATs (no Checks permission UI).
  // Soft-fail check-runs so observation can continue with Commit Status only.
  const [checks, status, reviews] = await Promise.all([
    githubGetOptional<CheckRunsResponse>(
      `/repos/${repository}/commits/${sha}/check-runs?per_page=100`,
      env,
    ),
    githubGet<StatusResponse>(`/repos/${repository}/commits/${sha}/status`, env),
    githubGet<ReviewResponse[]>(`/repos/${repository}/pulls/${summary.number}/reviews?per_page=100`, env),
  ]);

  return {
    number: summary.number,
    title: summary.title,
    draft: Boolean(summary.draft),
    ci: normalizeCi(checks, status),
    review: normalizeReview(reviews),
    mergeState: normalizeMergeState(pull),
    humanDecisionRequired: parseHumanDecision(pull.body),
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

function parseHumanDecision(body: string | null | undefined): boolean | null {
  if (!body) return null;
  if (/Human-Decision:\s*REQUIRED/i.test(body)) return true;
  if (/Human-Decision:\s*NONE/i.test(body)) return false;
  return null;
}

async function githubGet<T>(path: string, env: GitHubEnv): Promise<T> {
  const response = await githubFetch(path, env);
  if (!response.ok) throw new Error("GitHub API request failed");
  return (await response.json()) as T;
}

/** Soft-fail GET for optional endpoints (e.g. check-runs without Checks permission). */
async function githubGetOptional<T>(path: string, env: GitHubEnv): Promise<T | null> {
  const response = await githubFetch(path, env);
  if (!response.ok) return null;
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
