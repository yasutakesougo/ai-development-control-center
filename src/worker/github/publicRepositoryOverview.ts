import type { EvidenceState } from "../../domain/observedFacts";

const API = "https://api.github.com";

export const PUBLIC_OVERVIEW_REPOSITORIES = [
  "yasutakesougo/ai-development-control-center",
  "yasutakesougo/audit-management-system-mvp",
  "yasutakesougo/welfare-regulatory-update-teams",
] as const;

export type PublicOverviewRepository = (typeof PUBLIC_OVERVIEW_REPOSITORIES)[number];

export type PublicRepositoryOverviewSummary = {
  repository: string;
  epochId: string;
  sourceMode: "PUBLIC_UNAUTHENTICATED";
  observedAt: string;
  evidenceState: EvidenceState;
  currentMain: string | null;
  openPrCount: number | null;
};

type RepositoryResponse = {
  private?: boolean;
  visibility?: string;
  default_branch?: string;
};

type CommitResponse = { sha?: string };
type PullResponse = { number?: number };

export type PublicGitHubFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function isPublicOverviewRepository(repository: string): repository is PublicOverviewRepository {
  return PUBLIC_OVERVIEW_REPOSITORIES.includes(repository as PublicOverviewRepository);
}

export async function observePublicRepositorySummary(
  repository: PublicOverviewRepository,
  fetchImpl: PublicGitHubFetch = fetch,
): Promise<PublicRepositoryOverviewSummary | null> {
  const observedAt = new Date().toISOString();
  const epochId = `${repository}:${observedAt}`;

  const repoResponse = await publicGitHubGet(`/repos/${repository}`, fetchImpl);
  if (!repoResponse.ok) return null;

  const repo = (await repoResponse.json()) as RepositoryResponse;
  if (!isCurrentlyPublic(repo) || !repo.default_branch) return null;

  try {
    const [branchResponse, openPrCount] = await Promise.all([
      publicGitHubGet(
        `/repos/${repository}/commits/${encodeURIComponent(repo.default_branch)}`,
        fetchImpl,
      ),
      observeExactOpenPullRequestCount(repository, fetchImpl),
    ]);

    if (!branchResponse.ok) return null;
    const branch = (await branchResponse.json()) as CommitResponse;

    if (!branch.sha) {
      return buildSummary(repository, epochId, observedAt, "MISSING", null, openPrCount);
    }

    return buildSummary(repository, epochId, observedAt, "CONFIRMED", branch.sha, openPrCount);
  } catch {
    return buildSummary(repository, epochId, observedAt, "ERROR", null, null);
  }
}

async function observeExactOpenPullRequestCount(
  repository: PublicOverviewRepository,
  fetchImpl: PublicGitHubFetch,
): Promise<number | null> {
  let page = 1;
  let count = 0;

  while (page <= 100) {
    const response = await publicGitHubGet(
      `/repos/${repository}/pulls?state=open&per_page=100&page=${page}`,
      fetchImpl,
    );
    if (!response.ok) return null;

    const pulls = (await response.json()) as PullResponse[];
    count += pulls.length;
    if (pulls.length < 100) return count;
    page += 1;
  }

  return null;
}

function isCurrentlyPublic(repo: RepositoryResponse): boolean {
  return repo.private === false && repo.visibility === "public";
}

function buildSummary(
  repository: string,
  epochId: string,
  observedAt: string,
  evidenceState: EvidenceState,
  currentMain: string | null,
  openPrCount: number | null,
): PublicRepositoryOverviewSummary {
  return {
    repository,
    epochId,
    sourceMode: "PUBLIC_UNAUTHENTICATED",
    observedAt,
    evidenceState,
    currentMain,
    openPrCount,
  };
}

function publicGitHubGet(path: string, fetchImpl: PublicGitHubFetch): Promise<Response> {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "ai-development-control-center-public-overview",
    "X-GitHub-Api-Version": "2022-11-28",
  });

  // PUBLIC-ONLY V1 intentionally never attaches Authorization credentials.
  return fetchImpl(`${API}${path}`, { method: "GET", headers });
}
