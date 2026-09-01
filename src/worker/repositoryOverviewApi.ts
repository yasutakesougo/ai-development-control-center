import {
  PUBLIC_OVERVIEW_REPOSITORIES,
  observePublicRepositorySummary,
  type PublicGitHubFetch,
  type PublicRepositoryOverviewSummary,
} from "./github/publicRepositoryOverview";

export type RepositoryOverviewResponse = {
  observedAt: string;
  repositories: PublicRepositoryOverviewSummary[];
  suppressedCount: number;
};

export async function handleRepositoryOverviewGet(
  fetchImpl: PublicGitHubFetch = fetch,
): Promise<Response> {
  const observations = await Promise.all(
    PUBLIC_OVERVIEW_REPOSITORIES.map(async (repository) => {
      try {
        return await observePublicRepositorySummary(repository, fetchImpl);
      } catch {
        return null;
      }
    }),
  );

  const repositories = observations.filter(
    (item): item is PublicRepositoryOverviewSummary => item !== null,
  );

  const payload: RepositoryOverviewResponse = {
    observedAt: new Date().toISOString(),
    repositories,
    suppressedCount: observations.length - repositories.length,
  };

  return Response.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
