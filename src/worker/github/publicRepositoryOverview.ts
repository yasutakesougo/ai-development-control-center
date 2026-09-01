import type { EvidenceState } from "../../domain/observedFacts";

const API = "https://api.github.com";
export const MAX_OPEN_PR_PAGES = 10;

export const PUBLIC_OVERVIEW_REPOSITORIES = [
  "yasutakesougo/ai-development-control-center",
  "yasutakesougo/audit-management-system-mvp",
  "yasutakesougo/welfare-regulatory-update-teams",
] as const;

export type PublicOverviewRepository = (typeof PUBLIC_OVERVIEW_REPOSITORIES)[number];

export type PublicRepositoryOpenPullRequest = {
  number: number;
  title: string;
  draft: boolean;
  htmlUrl: string | null;
};

export type PublicRepositoryOverviewSummary = {
  repository: string;
  epochId: string;
  sourceMode: "PUBLIC_UNAUTHENTICATED";
  observedAt: string;
  evidenceState: EvidenceState;
  currentMain: string | null;
  openPrCount: number | null;
};

export type PublicRepositoryOverviewDetail = PublicRepositoryOverviewSummary & {
  openPullRequests: PublicRepositoryOpenPullRequest[] | null;
};

type RepositoryResponse = {
  full_name?: string;
  private?: boolean;
  visibility?: string;
  default_branch?: string;
};

type CommitResponse = { sha?: string };
type PullResponse = {
  number?: number;
  title?: string;
  draft?: boolean;
  html_url?: string;
};

type OpenPullObservation = {
  count: number | null;
  pulls: PublicRepositoryOpenPullRequest[] | null;
};

export type PublicGitHubFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function isPublicOverviewRepository(repository: string): repository is PublicOverviewRepository {
  return PUBLIC_OVERVIEW_REPOSITORIES.includes(repository as PublicOverviewRepository);
}

export async function observePublicRepositorySummary(
  repository: PublicOverviewRepository,
  fetchImpl: PublicGitHubFetch = fetch,
): Promise<PublicRepositoryOverviewSummary | null> {
  const detail = await observePublicRepository(repository, fetchImpl);
  if (!detail) return null;
  const { openPullRequests: _openPullRequests, ...summary } = detail;
  return summary;
}

export async function observePublicRepositoryDetail(
  repository: PublicOverviewRepository,
  fetchImpl: PublicGitHubFetch = fetch,
): Promise<PublicRepositoryOverviewDetail | null> {
  return observePublicRepository(repository, fetchImpl);
}

async function observePublicRepository(
  repository: PublicOverviewRepository,
  fetchImpl: PublicGitHubFetch,
): Promise<PublicRepositoryOverviewDetail | null> {
  const observedAt = new Date().toISOString();
  const epochId = `${repository}:${observedAt}:${crypto.randomUUID()}`;

  let repo: RepositoryResponse;
  try {
    const repoResponse = await publicGitHubGet(`/repos/${repository}`, fetchImpl);
    if (!repoResponse.ok) return null;
    repo = (await repoResponse.json()) as RepositoryResponse;
  } catch {
    return null;
  }

  if (!isExactCurrentlyPublic(repo, repository)) return null;
  if (!repo.default_branch) {
    return buildDetail(repository, epochId, observedAt, "MISSING", null, null, null);
  }

  try {
    const [branchResponse, openPullObservation] = await Promise.all([
      publicGitHubGet(
        `/repos/${repository}/commits/${encodeURIComponent(repo.default_branch)}`,
        fetchImpl,
      ),
      observeOpenPullRequests(repository, fetchImpl),
    ]);

    if (!branchResponse.ok) {
      return buildDetail(
        repository,
        epochId,
        observedAt,
        "ERROR",
        null,
        openPullObservation.count,
        openPullObservation.pulls,
      );
    }

    const branch = (await branchResponse.json()) as CommitResponse;
    if (!branch.sha) {
      return buildDetail(
        repository,
        epochId,
        observedAt,
        "MISSING",
        null,
        openPullObservation.count,
        openPullObservation.pulls,
      );
    }

    const evidenceState: EvidenceState = openPullObservation.count === null ? "MISSING" : "CONFIRMED";
    return buildDetail(
      repository,
      epochId,
      observedAt,
      evidenceState,
      branch.sha,
      openPullObservation.count,
      openPullObservation.pulls,
    );
  } catch {
    return buildDetail(repository, epochId, observedAt, "ERROR", null, null, null);
  }
}

async function observeOpenPullRequests(
  repository: PublicOverviewRepository,
  fetchImpl: PublicGitHubFetch,
): Promise<OpenPullObservation> {
  const pulls: PublicRepositoryOpenPullRequest[] = [];
  let count = 0;

  for (let page = 1; page <= MAX_OPEN_PR_PAGES; page += 1) {
    const response = await publicGitHubGet(
      `/repos/${repository}/pulls?state=open&per_page=100&page=${page}`,
      fetchImpl,
    );
    if (!response.ok) return { count: null, pulls: null };

    const pagePulls = (await response.json()) as PullResponse[];
    count += pagePulls.length;
    for (const pull of pagePulls) {
      if (typeof pull.number !== "number" || typeof pull.title !== "string") continue;
      pulls.push({
        number: pull.number,
        title: pull.title,
        draft: Boolean(pull.draft),
        htmlUrl: typeof pull.html_url === "string" ? pull.html_url : null,
      });
    }

    if (pagePulls.length < 100) return { count, pulls };
  }

  // The tenth page was full, so an exact total was not proven within the reviewed bound.
  return { count: null, pulls };
}

function isExactCurrentlyPublic(repo: RepositoryResponse, repository: string): boolean {
  return repo.full_name === repository && repo.private === false && repo.visibility === "public";
}

function buildDetail(
  repository: string,
  epochId: string,
  observedAt: string,
  evidenceState: EvidenceState,
  currentMain: string | null,
  openPrCount: number | null,
  openPullRequests: PublicRepositoryOpenPullRequest[] | null,
): PublicRepositoryOverviewDetail {
  return {
    repository,
    epochId,
    sourceMode: "PUBLIC_UNAUTHENTICATED",
    observedAt,
    evidenceState,
    currentMain,
    openPrCount,
    openPullRequests,
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
