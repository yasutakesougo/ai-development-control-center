import {
  PUBLIC_OVERVIEW_REPOSITORIES,
  isPublicOverviewRepository,
  observePublicRepositoryDetail,
  observePublicRepositorySummary,
  type PublicGitHubFetch,
  type PublicRepositoryOverviewDetail,
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

export async function handleRepositoryDetailGet(
  request: Request,
  fetchImpl: PublicGitHubFetch = fetch,
): Promise<Response> {
  const repository = new URL(request.url).searchParams.get("repository") ?? "";
  if (!isPublicOverviewRepository(repository)) return genericNotFound();

  let detail: PublicRepositoryOverviewDetail | null;
  try {
    detail = await observePublicRepositoryDetail(repository, fetchImpl);
  } catch {
    detail = null;
  }

  if (!detail) return genericNotFound();

  return Response.json(detail, {
    headers: { "Cache-Control": "no-store" },
  });
}

function genericNotFound(): Response {
  return Response.json({ error: "Not Found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
