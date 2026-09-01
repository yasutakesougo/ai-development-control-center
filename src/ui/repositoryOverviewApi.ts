import type { RepositoryOverviewData, RepositoryOverviewDetailData } from "./RepositoryOverviewPanel";

export async function fetchRepositoryOverview(): Promise<RepositoryOverviewData | null> {
  try {
    const response = await fetch("/api/repositories/overview", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as RepositoryOverviewData;
  } catch {
    return null;
  }
}

export async function fetchRepositoryDetail(repository: string): Promise<RepositoryOverviewDetailData | null> {
  try {
    const response = await fetch(
      `/api/repositories/detail?repository=${encodeURIComponent(repository)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    return (await response.json()) as RepositoryOverviewDetailData;
  } catch {
    return null;
  }
}
