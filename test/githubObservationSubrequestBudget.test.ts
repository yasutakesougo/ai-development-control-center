import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_DETAILED_PRS,
  prioritizeOpenPulls,
  selectDetailedPulls,
  estimatedObservationCost,
  SAFE_BUDGET,
  SUBREQUEST_LIMIT,
  isOpenPullListPageTruncated,
} from "../src/domain/boundedGithubObservation";
import { resolveHumanAction } from "../src/domain/humanActionResolver";
import {
  BASE_COST,
  OPEN_PR_DETAIL_OBSERVATION_TRUNCATED,
  OPEN_PR_LIST_PAGE_TRUNCATED,
  observeRepository,
  PER_PR_COST,
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
      base: { ref: "main" },
      updated_at: `2026-09-01T00:00:${String(number).padStart(2, "0")}Z`,
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
        base: { ref: "main" },
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bounded GitHub observation cost helpers", () => {
  it("binds admission cost to SAFE_BUDGET headroom", () => {
    expect(MAX_DETAILED_PRS).toBe(14);
    expect(estimatedObservationCost(14)).toBe(45);
    expect(estimatedObservationCost(14)).toBeLessThanOrEqual(SAFE_BUDGET);
    expect(SAFE_BUDGET).toBeLessThanOrEqual(SUBREQUEST_LIMIT);
    expect(requiredCost(14)).toBe(BASE_COST + PER_PR_COST * 14);
  });

  it("treats pulls.length === 30 as list-page truncation", () => {
    expect(isOpenPullListPageTruncated(29)).toBe(false);
    expect(isOpenPullListPageTruncated(30)).toBe(true);
  });
});

describe("prioritizeOpenPulls determinism", () => {
  it("orders identically for identical inputs", () => {
    const pulls = [
      { number: 2, title: "b", draft: false, body: null, base: { ref: "main" }, updated_at: "2026-01-02T00:00:00Z" },
      { number: 1, title: "a", draft: true, body: "Human-Decision: REQUIRED", base: { ref: "main" }, updated_at: "2026-01-01T00:00:00Z" },
      { number: 3, title: "c", draft: false, body: null, base: { ref: "develop" }, updated_at: "2026-01-03T00:00:00Z" },
    ];
    const a = prioritizeOpenPulls(pulls, { defaultBranch: "main" }).map((p) => p.number);
    const b = prioritizeOpenPulls(pulls, { defaultBranch: "main" }).map((p) => p.number);
    expect(a).toEqual(b);
    expect(a[0]).toBe(1);
    const { selected, omittedFromCap } = selectDetailedPulls(
      prioritizeOpenPulls(
        Array.from({ length: 19 }, (_, i) => ({
          number: i + 1,
          title: `PR ${i + 1}`,
          draft: false,
          body: null,
          base: { ref: "main" },
          updated_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
        })),
        { defaultBranch: "main" },
      ),
    );
    expect(selected).toHaveLength(14);
    expect(omittedFromCap).toHaveLength(5);
  });
});

describe("GitHub observation subrequest budget (bounded PARTIAL)", () => {
  it.each([
    [0, 3, "CONFIRMED"],
    [1, 6, "CONFIRMED"],
    [14, 45, "CONFIRMED"],
  ] as const)("N=%i stays CONFIRMED with fetch count ≤%i", async (n, maxFetches, state) => {
    const { urls } = installFetchHarness(n);
    const facts = await observeRepository(REPOSITORY, {});
    expect(facts.evidenceState).toBe(state);
    expect(facts.currentMain).toBe("main-sha");
    expect(facts.openPullRequestCount).toBe(n);
    expect(facts.omittedPullRequestCount).toBe(0);
    expect(urls.length).toBeLessThanOrEqual(maxFetches);
    expect(urls.length).toBeLessThanOrEqual(SUBREQUEST_LIMIT);
    expect(urls.some((url) => url.includes("check-runs"))).toBe(false);
  });

  it.each([15, 16, 19])("N=%i becomes PARTIAL with retained main", async (n) => {
    const { urls } = installFetchHarness(n);
    const facts = await observeRepository(REPOSITORY, {});
    expect(facts.evidenceState).toBe("PARTIAL");
    expect(facts.currentMain).toBe("main-sha");
    expect(facts.openPullRequestCount).toBe(n);
    expect(facts.observedPullRequestCount).toBe(MAX_DETAILED_PRS);
    expect(facts.omittedPullRequestCount).toBe(n - MAX_DETAILED_PRS);
    expect(facts.warnings).toContain(OPEN_PR_DETAIL_OBSERVATION_TRUNCATED);
    expect(facts.observationBudget?.estimatedUsed).toBeLessThanOrEqual(SAFE_BUDGET);
    expect(urls.length).toBeLessThanOrEqual(SAFE_BUDGET);
    expect(urls.length).toBeLessThanOrEqual(SUBREQUEST_LIMIT);
    expect(resolveHumanAction(facts).status).toBe("UNKNOWN");
  });

  it("N=30 is PARTIAL with page-truncation warning and never exceeds budget", async () => {
    const { urls } = installFetchHarness(30);
    const facts = await observeRepository(REPOSITORY, {});
    expect(facts.evidenceState).toBe("PARTIAL");
    expect(facts.warnings).toContain(OPEN_PR_LIST_PAGE_TRUNCATED);
    expect(facts.warnings).toContain(OPEN_PR_DETAIL_OBSERVATION_TRUNCATED);
    expect(facts.openPullRequestCount).toBe(30);
    expect(facts.observedPullRequestCount).toBe(14);
    expect(urls.length).toBeLessThanOrEqual(SUBREQUEST_LIMIT);
  });

  it("N=100 synthetic still details at most 14 and stays ≤ SAFE_BUDGET fetches", async () => {
    // Harness only returns first page length; simulate via prioritize unit + observe N=30 shape.
    // Full 100-list is outside per_page=30; bound is still MAX_DETAILED_PRS.
    const ordered = prioritizeOpenPulls(
      Array.from({ length: 100 }, (_, i) => ({
        number: i + 1,
        title: `PR ${i + 1}`,
        draft: false,
        body: null,
        base: { ref: "main" },
        updated_at: `2026-02-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
      })),
      { defaultBranch: "main" },
    );
    const { selected, omittedFromCap } = selectDetailedPulls(ordered);
    expect(selected).toHaveLength(14);
    expect(omittedFromCap).toHaveLength(86);
    expect(estimatedObservationCost(selected.length)).toBeLessThanOrEqual(SAFE_BUDGET);
  });

  it("keeps Tier-0 when a selected detail fetch fails", async () => {
    const { urls, fetchMock } = installFetchHarness(2);
    fetchMock.mockImplementation(async (input: unknown) => {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw);
      urls.push(url.toString());
      const path = url.pathname;
      if (path === `/repos/${REPOSITORY}`) return jsonResponse({ default_branch: "main" });
      if (path === `/repos/${REPOSITORY}/commits/main`) return jsonResponse({ sha: "main-sha" });
      if (path === `/repos/${REPOSITORY}/pulls`) {
        return jsonResponse([
          { number: 1, title: "PR 1", draft: false, body: null, base: { ref: "main" }, updated_at: "2026-01-01T00:00:00Z" },
          { number: 2, title: "PR 2", draft: false, body: null, base: { ref: "main" }, updated_at: "2026-01-02T00:00:00Z" },
        ]);
      }
      if (path === `/repos/${REPOSITORY}/pulls/1`) throw new Error("boom");
      if (path === `/repos/${REPOSITORY}/pulls/2`) {
        return jsonResponse({
          number: 2,
          title: "PR 2",
          draft: false,
          body: null,
          mergeable: true,
          mergeable_state: "clean",
          html_url: `https://github.com/${REPOSITORY}/pull/2`,
          head: { sha: "detail-sha-2" },
        });
      }
      if (path.includes("/status")) return jsonResponse({ state: "success", total_count: 1 });
      if (path.includes("/reviews")) return jsonResponse([]);
      throw new Error(url.toString());
    });

    const facts = await observeRepository(REPOSITORY, {});
    expect(facts.currentMain).toBe("main-sha");
    expect(facts.evidenceState).toBe("CONFIRMED");
    expect(facts.openPullRequests?.find((pr) => pr.number === 1)).toMatchObject({
      number: 1,
      ci: "UNKNOWN",
    });
    expect(facts.openPullRequests?.some((pr) => pr.number === 2 && pr.ci === "PASS")).toBe(true);
  });

  it("uses detail head.sha short-path without inventing PASS", async () => {
    const { urls } = installFetchHarness(1, new Set([1]));
    const facts = await observeRepository(REPOSITORY, {});
    expect(facts.evidenceState).toBe("CONFIRMED");
    expect(urls.length).toBeLessThan(requiredCost(1));
    expect(facts.openPullRequests?.[0]).toMatchObject({
      ci: "UNKNOWN",
      review: "UNKNOWN",
      mergeState: "UNKNOWN",
    });
  });
});
