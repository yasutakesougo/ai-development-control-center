import { describe, expect, it } from "vitest";
import {
  PUBLIC_OVERVIEW_REPOSITORIES,
  isPublicOverviewRepository,
  observePublicRepositorySummary,
  type PublicGitHubFetch,
} from "../src/worker/github/publicRepositoryOverview";
import { handleRepositoryOverviewGet } from "../src/worker/repositoryOverviewApi";

const repository = PUBLIC_OVERVIEW_REPOSITORIES[0];

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function publicRepo(fullName = repository) {
  return {
    full_name: fullName,
    private: false,
    visibility: "public",
    default_branch: "main",
  };
}

function successfulPublicFetch(): PublicGitHubFetch {
  return async (input) => {
    const url = String(input);
    if (url.includes("/commits/")) return json({ sha: "abc123" });
    if (url.includes("/pulls?")) return json([]);
    return json(publicRepo());
  };
}

describe("PUBLIC-ONLY repository overview", () => {
  it("uses the explicit allowlist only", () => {
    expect(isPublicOverviewRepository(repository)).toBe(true);
    expect(isPublicOverviewRepository("yasutakesougo/severe-behavior-support-spfx")).toBe(false);
  });

  it("never attaches Authorization to public observation requests", async () => {
    const seen: Headers[] = [];
    const fetchImpl: PublicGitHubFetch = async (input, init) => {
      seen.push(new Headers(init?.headers));
      const url = String(input);
      if (url.includes("/commits/")) return json({ sha: "abc123" });
      if (url.includes("/pulls?")) return json([]);
      return json(publicRepo());
    };

    const result = await observePublicRepositorySummary(repository, fetchImpl);

    expect(result?.evidenceState).toBe("CONFIRMED");
    expect(result?.openPrCount).toBe(0);
    expect(seen.length).toBe(3);
    for (const headers of seen) expect(headers.has("Authorization")).toBe(false);
  });

  it("creates a unique epoch identity for each observation", async () => {
    const first = await observePublicRepositorySummary(repository, successfulPublicFetch());
    const second = await observePublicRepositorySummary(repository, successfulPublicFetch());

    expect(first?.epochId).toBeTruthy();
    expect(second?.epochId).toBeTruthy();
    expect(first?.epochId).not.toBe(second?.epochId);
  });

  it("suppresses targets whose current PUBLIC visibility cannot be proven", async () => {
    let calls = 0;
    const result = await observePublicRepositorySummary(repository, async () => {
      calls += 1;
      return json({ full_name: repository, private: true, visibility: "private", default_branch: "main" });
    });

    expect(result).toBeNull();
    expect(calls).toBe(1);
  });

  it("suppresses redirect/rename metadata that does not prove the exact configured repository", async () => {
    let calls = 0;
    const result = await observePublicRepositorySummary(repository, async () => {
      calls += 1;
      return json(publicRepo("yasutakesougo/renamed-repository"));
    });

    expect(result).toBeNull();
    expect(calls).toBe(1);
  });

  it("keeps an eligible repository visible when later observation fails", async () => {
    const fetchImpl: PublicGitHubFetch = async (input) => {
      const url = String(input);
      if (url.includes("/commits/")) return json({}, 503);
      if (url.includes("/pulls?")) return json([]);
      return json(publicRepo());
    };

    const result = await observePublicRepositorySummary(repository, fetchImpl);

    expect(result).not.toBeNull();
    expect(result?.repository).toBe(repository);
    expect(result?.evidenceState).toBe("ERROR");
  });

  it("returns UNKNOWN count as null instead of a truncated numeric value", async () => {
    const fetchImpl: PublicGitHubFetch = async (input) => {
      const url = String(input);
      if (url.includes("/commits/")) return json({ sha: "abc123" });
      if (url.includes("/pulls?")) return json({}, 403);
      return json(publicRepo());
    };

    const result = await observePublicRepositorySummary(repository, fetchImpl);

    expect(result?.currentMain).toBe("abc123");
    expect(result?.openPrCount).toBeNull();
    expect(result?.evidenceState).toBe("MISSING");
  });

  it("paginates open pull requests before returning a numeric count", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ number: index + 1 }));
    const fetchImpl: PublicGitHubFetch = async (input) => {
      const url = String(input);
      if (url.includes("/commits/")) return json({ sha: "abc123" });
      if (url.includes("&page=1")) return json(firstPage);
      if (url.includes("&page=2")) return json([{ number: 101 }]);
      return json(publicRepo());
    };

    const result = await observePublicRepositorySummary(repository, fetchImpl);

    expect(result?.openPrCount).toBe(101);
    expect(result?.evidenceState).toBe("CONFIRMED");
  });

  it("isolates a suppressed target from other repository results", async () => {
    const fetchImpl: PublicGitHubFetch = async (input) => {
      const url = String(input);
      if (url.includes("welfare-regulatory-update-teams") && !url.includes("/commits/") && !url.includes("/pulls?")) {
        return json({
          full_name: "yasutakesougo/welfare-regulatory-update-teams",
          private: true,
          visibility: "private",
          default_branch: "main",
        });
      }
      if (url.includes("/commits/")) return json({ sha: "abc123" });
      if (url.includes("/pulls?")) return json([]);
      const match = url.match(/\/repos\/([^?]+)/);
      return json(publicRepo(match?.[1] ?? repository));
    };

    const response = await handleRepositoryOverviewGet(fetchImpl);
    const body = (await response.json()) as {
      repositories: Array<{ repository: string }>;
      suppressedCount: number;
    };

    expect(response.status).toBe(200);
    expect(body.repositories).toHaveLength(2);
    expect(body.suppressedCount).toBe(1);
    expect(body.repositories.some((item) => item.repository.includes("welfare-regulatory-update-teams"))).toBe(false);
  });
});
