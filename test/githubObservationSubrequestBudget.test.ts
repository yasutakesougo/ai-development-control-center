import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BASE_COST,
  GITHUB_SUBREQUEST_BUDGET_EXCEEDED,
  PER_PR_COST,
  SUBREQUEST_LIMIT,
  observeRepository,
  requiredCost,
} from "../src/worker/github/readOnlyAdapter";

const REPOSITORY = "example/repository";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchHarness(openPullRequestCount: number, missingDetailSha = new Set<number>()) {
  const urls: string[] = [];
  const summaries = Array.from({ length: openPullRequestCount }, (_, index) => {
    const number = index + 1;
    return {
      number,
      title: `PR ${number}`,
      draft: false,
      body: null,
      head: { sha: `summary-sha-${number}` },
    };
  });

  const fetchMock = vi.fn(async (input: unknown) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw);
    const path = url.pathname;
    urls.push(url.toString());

    if (path.includes("/check-runs")) {
      throw new Error("production observation must not call check-runs");
    }

    if (path === `/repos/${REPOSITORY}`) {
      return jsonResponse({ default_branch: "main" });
    }

    if (path === `/repos/${REPOSITORY}/commits/main`) {
      return jsonResponse({ sha: "main-sha" });
    }

    if (path === `/repos/${REPOSITORY}/pulls`) {
      return jsonResponse(summaries);
    }

    const detailMatch = path.match(new RegExp(`^/repos/${REPOSITORY}/pulls/(\\d+)$`));
    if (detailMatch) {
      const number = Number(detailMatch[1]);
      return jsonResponse({
        number,
        title: `PR ${number}`,
        draft: false,
        body: null,
        mergeable: true,
        mergeable_state: "clean",
        html_url: `https://github.com/${REPOSITORY}/pull/${number}`,
        head: missingDetailSha.has(number) ? {} : { sha: `detail-sha-${number}` },
      });
    }

    const statusMatch = path.match(new RegExp(`^/repos/${REPOSITORY}/commits/detail-sha-(\\d+)/status$`));
    if (statusMatch) {
      return jsonResponse({ state: "success", total_count: 1 });
    }

    const reviewsMatch = path.match(new RegExp(`^/repos/${REPOSITORY}/pulls/(\\d+)/reviews$`));
    if (reviewsMatch) {
      return jsonResponse([]);
    }

    throw new Error(`unexpected GitHub URL: ${url.toString()}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { urls, fetchMock };
}

function perPullUrls(urls: string[]): string[] {
  return urls.filter((raw) => {
    const path = new URL(raw).pathname;
    return /\/pulls\/\d+$/.test(path) || /\/pulls\/\d+\/reviews$/.test(path) || /\/commits\/detail-sha-\d+\/status$/.test(path);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub observation subrequest budget", () => {
  it("binds requiredCost to the locked worst-case formula", () => {
    for (const n of [0, 12, 15, 16]) {
      expect(requiredCost(n)).toBe(BASE_COST + PER_PR_COST * n);
    }
    expect(requiredCost(12)).toBe(39);
    expect(requiredCost(15)).toBe(48);
    expect(requiredCost(16)).toBe(51);
  });

  it.each([
    [12, 39],
    [15, 48],
  ])("keeps the canonical all-detail-sha path within the modeled cost for N=%i", async (n, expectedFetches) => {
    const { urls } = installFetchHarness(n);

    const facts = await observeRepository(REPOSITORY, {});

    expect(facts.evidenceState).toBe("CONFIRMED");
    expect(urls).toHaveLength(expectedFetches);
    expect(urls).toHaveLength(requiredCost(n));
    expect(urls.some((url) => url.includes("check-runs"))).toBe(false);
    expect(facts.openPullRequests).toHaveLength(n);
    expect(facts.openPullRequests?.every((pull) => pull.ci === "PASS")).toBe(true);
  });

  it("rejects N=16 after the three base fetches and before per-PR fan-out", async () => {
    const { urls } = installFetchHarness(16);

    const facts = await observeRepository(REPOSITORY, {});

    expect(requiredCost(16)).toBeGreaterThan(SUBREQUEST_LIMIT);
    expect(facts.evidenceState).toBe("ERROR");
    expect(facts.currentMain).toBeNull();
    expect(facts.openPullRequests).toBeNull();
    expect(facts.relevantIssueStates).toBeNull();
    expect(facts.errors).toEqual([GITHUB_SUBREQUEST_BUDGET_EXCEEDED]);
    expect(urls).toHaveLength(BASE_COST);
    expect(perPullUrls(urls)).toEqual([]);
  });

  it("uses detail head.sha as the short-path predicate even when the list summary has a sha", async () => {
    const { urls } = installFetchHarness(1, new Set([1]));

    const facts = await observeRepository(REPOSITORY, {});

    expect(facts.evidenceState).toBe("CONFIRMED");
    expect(urls).toHaveLength(4);
    expect(urls.length).toBeLessThan(requiredCost(1));
    expect(urls.length).toBeLessThanOrEqual(requiredCost(1));
    expect(urls.some((url) => url.includes("check-runs"))).toBe(false);
    expect(urls.some((url) => url.includes("/commits/detail-sha-1/status"))).toBe(false);
    expect(urls.some((url) => url.includes("/pulls/1/reviews"))).toBe(false);
    expect(facts.openPullRequests?.[0]).toMatchObject({
      ci: "UNKNOWN",
      review: "UNKNOWN",
      mergeState: "UNKNOWN",
    });
  });

  it("keeps the overflow predicate formula-driven instead of hard-coding the PR threshold", () => {
    const adapterSource = readFileSync(
      fileURLToPath(new URL("../src/worker/github/readOnlyAdapter.ts", import.meta.url)),
      "utf8",
    );

    expect(adapterSource).toContain("requiredCost(pulls.length) > SUBREQUEST_LIMIT");
    expect(adapterSource).not.toMatch(/pulls\.length\s*>=\s*16/);
    expect(adapterSource).not.toMatch(/pulls\.length\s*>\s*15/);
  });
});
