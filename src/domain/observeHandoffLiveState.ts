import { collectHumanDecisionEvidence } from "./humanDecisionEvidence";
import type { HandoffLiveState } from "./handoffReport";

const API = "https://api.github.com";

type GitHubEnv = { GITHUB_TOKEN?: string };

type RepoResponse = { default_branch?: string };
type CommitResponse = { sha?: string };
type PullResponse = {
  number: number;
  title: string;
  draft?: boolean;
  body?: string | null;
  html_url?: string;
  head?: { sha?: string };
};
type ReviewResponse = { state?: string };
type CheckRunsResponse = {
  check_runs?: Array<{ status?: string; conclusion?: string | null }>;
};
type StatusResponse = { state?: string; total_count?: number };

async function githubGet<T>(path: string, env: GitHubEnv): Promise<T> {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "ai-development-control-center-handoff-v1",
  });
  if (env.GITHUB_TOKEN) headers.set("Authorization", `Bearer ${env.GITHUB_TOKEN}`);
  const response = await fetch(`${API}${path}`, { method: "GET", headers });
  if (!response.ok) throw new Error(`GitHub GET ${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

function normalizeCi(
  status: StatusResponse,
  checks: CheckRunsResponse,
): "PASS" | "PENDING" | "FAIL" | "UNKNOWN" {
  const runs = checks.check_runs ?? [];
  if (runs.some((run) => run.status && run.status !== "completed")) return "PENDING";
  if (runs.some((run) => run.conclusion === "failure" || run.conclusion === "timed_out")) return "FAIL";
  if (runs.length > 0 && runs.every((run) => run.conclusion === "success" || run.conclusion === "neutral" || run.conclusion === "skipped")) {
    return "PASS";
  }
  if (!status.state || status.total_count === 0) return "UNKNOWN";
  if (status.state === "pending") return "PENDING";
  if (status.state === "failure" || status.state === "error") return "FAIL";
  if (status.state === "success") return "PASS";
  return "UNKNOWN";
}

function normalizeReview(reviews: ReviewResponse[]): "PASS" | "PENDING" | "CHANGES_REQUESTED" | "UNKNOWN" {
  if (reviews.length === 0) return "UNKNOWN";
  if (reviews.some((review) => review.state === "CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  if (reviews.some((review) => review.state === "APPROVED")) return "PASS";
  return "PENDING";
}

/**
 * Read-only live observation of the control-center repository for HANDOFF-V1.
 * Fail closed: any thrown/HTTP failure becomes evidenceState ERROR.
 */
export async function observeHandoffLiveState(
  repository: string,
  env: GitHubEnv = {},
): Promise<HandoffLiveState> {
  const sourceRefs = [`github:repo:${repository}`, "handoff:live"];
  try {
    const repo = await githubGet<RepoResponse>(`/repos/${repository}`, env);
    if (!repo.default_branch) {
      return {
        evidenceState: "MISSING",
        currentMain: null,
        openPullRequests: null,
        errors: ["default branch missing"],
        sourceRefs,
      };
    }

    const branch = await githubGet<CommitResponse>(
      `/repos/${repository}/commits/${encodeURIComponent(repo.default_branch)}`,
      env,
    );
    if (!branch.sha) {
      return {
        evidenceState: "MISSING",
        currentMain: null,
        openPullRequests: null,
        errors: ["main commit SHA missing"],
        sourceRefs,
      };
    }

    const pulls = await githubGet<PullResponse[]>(
      `/repos/${repository}/pulls?state=open&per_page=30`,
      env,
    );

    const openPullRequests: NonNullable<HandoffLiveState["openPullRequests"]> = [];
    for (const pull of pulls) {
      const detail = await githubGet<PullResponse>(`/repos/${repository}/pulls/${pull.number}`, env);
      const body = detail.body !== undefined ? detail.body : pull.body;
      const decision = collectHumanDecisionEvidence(body);
      const reviews = await githubGet<ReviewResponse[]>(
        `/repos/${repository}/pulls/${pull.number}/reviews`,
        env,
      );
      const headSha = detail.head?.sha ?? pull.head?.sha;
      let ci: "PASS" | "PENDING" | "FAIL" | "UNKNOWN" = "UNKNOWN";
      if (headSha) {
        const [status, checks] = await Promise.all([
          githubGet<StatusResponse>(`/repos/${repository}/commits/${headSha}/status`, env),
          githubGet<CheckRunsResponse>(
            `/repos/${repository}/commits/${headSha}/check-runs`,
            env,
          ),
        ]);
        ci = normalizeCi(status, checks);
      }

      openPullRequests.push({
        number: pull.number,
        title: pull.title,
        draft: Boolean(pull.draft),
        ci,
        review: normalizeReview(reviews),
        humanDecisionState: decision.state,
        humanDecisionRequired:
          decision.state === "REQUIRED" ? true : decision.state === "NONE" ? false : null,
      });
    }

    return {
      evidenceState: "CONFIRMED",
      currentMain: branch.sha,
      openPullRequests,
      errors: [],
      sourceRefs,
    };
  } catch (error) {
    return {
      evidenceState: "ERROR",
      currentMain: null,
      openPullRequests: null,
      errors: [error instanceof Error ? error.message : "GitHub API request failed"],
      sourceRefs,
    };
  }
}
