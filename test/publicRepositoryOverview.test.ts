import { describe, expect, it } from "vitest";
import {
  MAX_OPEN_PR_PAGES,
  PUBLIC_OVERVIEW_REPOSITORIES,
  isPublicOverviewRepository,
  observePublicRepositoryDetail,
  observePublicRepositorySummary,
  type PublicGitHubFetch,
} from "../src/worker/github/publicRepositoryOverview";
import {
  handleRepositoryDetailGet,
  handleRepositoryOverviewGet,
} from "../src/worker/repositoryOverviewApi";

const repository = PUBLIC_OVERVIEW_REPOSITORIES[0];

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function publicRepo(fullName: string = repository) {
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
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ number: index + 1, title: `PR ${index + 1}` }));
    const fetchImpl: PublicGitHubFetch = async (input) => {
      const url = String(input);
      if (url.includes("/commits/")) return json({ sha: "abc123" });
      if (url.includes("&page=1")) return json(firstPage);
      if (url.includes("&page=2")) return json([{ number: 101, title: "PR 101" }]);
      return json(publicRepo());
    };

    const result = await observePublicRepositorySummary(repository, fetchImpl);

    expect(result?.openPrCount).toBe(101);
    expect(result?.evidenceState).toBe("CONFIRMED");
  });

  it("stops at the reviewed ten-page cap and returns UNKNOWN when the terminal page is not proven", async () => {
    let pullCalls = 0;
    const fullPage = Array.from({ length: 100 }, (_, index) => ({ number: index + 1, title: `PR ${index + 1}` }));
    const fetchImpl: PublicGitHubFetch = async (input) => {
      const url = String(input);
      if (url.includes("/commits/")) return json({ sha: "abc123" });
      if (url.includes("/pulls?")) {
        pullCalls += 1;
        return json(fullPage);
      }
      return json(publicRepo());
    };

    const detail = await observePublicRepositoryDetail(repository, fetchImpl);

    expect(MAX_OPEN_PR_PAGES).toBe(10);
    expect(pullCalls).toBe(10);
    expect(detail?.openPrCount).toBeNull();
    expect(detail?.openPullRequests).toBeNull();
    expect(detail?.evidenceState).toBe("MISSING");
  });

  it("rejects an unconfigured detail selector before any GitHub fetch", async () => {
    let calls = 0;
    const request = new Request("https://control.example/api/repositories/detail?repository=yasutakesougo/private-repo");
    const response = await handleRepositoryDetailGet(request, async () => {
      calls += 1;
      return json({});
    });

    expect(response.status).toBe(404);
    expect(calls).toBe(0);
    expect(await response.json()).toEqual({ error: "Not Found" });
  });

  it("returns selected repository detail from one bounded public observation", async () => {
    const seen: Headers[] = [];
    const fetchImpl: PublicGitHubFetch = async (input, init) => {
      seen.push(new Headers(init?.headers));
      const url = String(input);
      if (url.includes("/commits/")) return json({ sha: "abc123" });
      if (url.includes("/pulls?")) {
        return json([{ number: 7, title: "Selected detail", draft: true, html_url: "https://github.com/example/pr/7" }]);
      }
      return json(publicRepo());
    };

    const detail = await observePublicRepositoryDetail(repository, fetchImpl);

    expect(detail?.repository).toBe(repository);
    expect(detail?.currentMain).toBe("abc123");
    expect(detail?.openPrCount).toBe(1);
    expect(detail?.openPullRequests?.[0]).toMatchObject({ number: 7, title: "Selected detail", draft: true });
    expect(detail?.epochId.startsWith(`${repository}:`)).toBe(true);
    for (const headers of seen) expect(headers.has("Authorization")).toBe(false);
  });

  it("does not disclose repository identity when selected detail is no longer PUBLIC", async () => {
    const request = new Request(`https://control.example/api/repositories/detail?repository=${encodeURIComponent(repository)}`);
    const response = await handleRepositoryDetailGet(request, async () =>
      json({ full_name: repository, private: true, visibility: "private", default_branch: "main" }),
    );

    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain(repository);
  });

  it("rejects cross-repository detail metadata instead of rebinding it to the selected repository", async () => {
    const selected = PUBLIC_OVERVIEW_REPOSITORIES[1];
    const request = new Request(`https://control.example/api/repositories/detail?repository=${encodeURIComponent(selected)}`);
    let calls = 0;
    const response = await handleRepositoryDetailGet(request, async () => {
      calls += 1;
      return json(publicRepo(repository));
    });

    expect(response.status).toBe(404);
    expect(calls).toBe(1);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain(selected);
    expect(body).not.toContain(repository);
  });

  it("fleet summary never fans out to per-PR CI, review, or status endpoints", async () => {
    const urls: string[] = [];
    const fetchImpl: PublicGitHubFetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/commits/")) return json({ sha: "abc123" });
      if (url.includes("/pulls?")) return json([]);
      const match = url.match(/\/repos\/([^?]+)/);
      return json(publicRepo(match?.[1] ?? repository));
    };

    const response = await handleRepositoryOverviewGet(fetchImpl);

    expect(response.status).toBe(200);
    expect(urls.some((url) => url.includes("check-runs"))).toBe(false);
    expect(urls.some((url) => /\/pulls\/\d+/.test(url))).toBe(false);
    expect(urls.some((url) => url.includes("/reviews"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/status"))).toBe(false);
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
