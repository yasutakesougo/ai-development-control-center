import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BASE_COST,
  DETAIL_ONLY_COST,
  GITHUB_SUBREQUEST_BUDGET_EXCEEDED,
  OPEN_PR_LIST_PAGE_TRUNCATED,
  SAFE_BUDGET,
  SELECTED_CANDIDATE_COST,
  SUBREQUEST_LIMIT,
  observeRepository,
  requiredCost,
} from "../src/worker/github/readOnlyAdapter";
import { resolveHumanAction } from "../src/domain/humanActionResolver";
import type { ObservedFacts, ObservedPullRequest } from "../src/domain/observedFacts";
import {
  DISCOVERY_INCOMPLETE,
  GATE_CRITICAL_OBSERVATION_INCOMPLETE,
  MULTIPLE_GATE_CANDIDATES,
  NO_GATE_CANDIDATE,
  emptyObservationExtensions,
} from "../src/domain/observedFacts";

const REPOSITORY = "example/repository";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchHarness(
  openPullRequestCount: number,
  missingDetailSha = new Set<number>(),
  candidateNumbers = new Set([1]),
  failedDetailNumbers = new Set<number>(),
) {
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
      if (failedDetailNumbers.has(number)) {
        return new Response("detail failed", { status: 500 });
      }
      return jsonResponse({
        number,
        title: `PR ${number}`,
        draft: false,
        body: candidateNumbers.has(number)
          ? "Human-Decision: REQUIRED"
          : "Human-Decision: NONE",
        mergeable: true,
        mergeable_state: "clean",
        html_url: `https://github.com/${REPOSITORY}/pull/${number}`,
        head: missingDetailSha.has(number) ? {} : { sha: `detail-sha-${number}` },
        base: { ref: "main" },
      });
    }

    const statusMatch = path.match(
      new RegExp(`^/repos/${REPOSITORY}/commits/detail-sha-(\\d+)/status$`),
    );
    if (statusMatch) {
      return jsonResponse({ state: "success", total_count: 1 });
    }

    const reviewsMatch = path.match(new RegExp(`^/repos/${REPOSITORY}/pulls/(\\d+)/reviews$`));
    if (reviewsMatch) {
      const number = Number(reviewsMatch[1]);
      return jsonResponse(
        candidateNumbers.has(number)
          ? [{ user: { login: "reviewer" }, state: "APPROVED" }]
          : [],
      );
    }

    throw new Error(`unexpected GitHub URL: ${url.toString()}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { urls, fetchMock };
}

function perPullUrls(urls: string[]): string[] {
  return urls.filter((raw) => {
    const path = new URL(raw).pathname;
    return (
      /\/pulls\/\d+$/.test(path) ||
      /\/pulls\/\d+\/reviews$/.test(path) ||
      /\/commits\/detail-sha-\d+\/status$/.test(path)
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub observation subrequest budget", () => {
  it("binds requiredCost to the detail-only plus selected-candidate formula", () => {
    for (const n of [0, 12, 15, 18, 40, 41]) {
      expect(requiredCost(n)).toBe(
        BASE_COST + DETAIL_ONLY_COST * n + (n > 0 ? SELECTED_CANDIDATE_COST : 0),
      );
    }
    expect(requiredCost(18)).toBe(23);
    expect(requiredCost(40)).toBe(SAFE_BUDGET);
    expect(requiredCost(41)).toBeGreaterThan(SAFE_BUDGET);
    expect(SAFE_BUDGET).toBeLessThanOrEqual(SUBREQUEST_LIMIT);
  });

  it.each([
    [12, 17],
    [15, 20],
  ])(
    "keeps the canonical candidate-enrichment path within the modeled cost for N=%i",
    async (n, expectedFetches) => {
      const { urls } = installFetchHarness(n);

      const facts = await observeRepository(REPOSITORY, {});

      expect(facts.evidenceState).toBe("CONFIRMED");
      expect(facts.fleetCompleteness).toBe("COMPLETE");
      expect(facts.gateCompleteness).toBe("COMPLETE");
      expect(urls).toHaveLength(expectedFetches);
      expect(urls).toHaveLength(requiredCost(n));
      expect(urls.some((url) => url.includes("check-runs"))).toBe(false);
      expect(facts.openPullRequests).toHaveLength(n);
      expect(facts.openPullRequests?.filter((pull) => pull.gateCandidate)).toHaveLength(1);
      expect(facts.openPullRequests?.filter((pull) => pull.ci !== "UNKNOWN")).toHaveLength(1);
      expect(facts.openPullRequests?.filter((pull) => pull.review !== "UNKNOWN")).toHaveLength(1);
      expect(resolveHumanAction(facts).status).toBe("ACTION_REQUIRED");
    },
  );

  it("rejects an over-budget inventory after the three base fetches", async () => {
    const { urls } = installFetchHarness(41);

    const facts = await observeRepository(REPOSITORY, {});

    expect(requiredCost(41)).toBeGreaterThan(SAFE_BUDGET);
    expect(facts.evidenceState).toBe("ERROR");
    expect(facts.currentMain).toBeNull();
    expect(facts.openPullRequests).toBeNull();
    expect(facts.relevantIssueStates).toBeNull();
    expect(facts.errors).toEqual([GITHUB_SUBREQUEST_BUDGET_EXCEEDED]);
    expect(urls).toHaveLength(BASE_COST);
    expect(perPullUrls(urls)).toEqual([]);
  });

  it("uses detail head.sha as the critical-read predicate without inventing PASS", async () => {
    const { urls } = installFetchHarness(1, new Set([1]));

    const facts = await observeRepository(REPOSITORY, {});

    expect(facts.evidenceState).toBe("CONFIRMED");
    expect(urls).toHaveLength(4);
    expect(urls.some((url) => url.includes("/commits/detail-sha-1/status"))).toBe(false);
    expect(urls.some((url) => url.includes("/pulls/1/reviews"))).toBe(false);
    expect(facts.openPullRequests?.[0]).toMatchObject({
      ci: "UNKNOWN",
      review: "UNKNOWN",
      mergeState: "CLEAN",
      gateCandidate: true,
    });
    expect(facts.gateCompleteness).toBe("PARTIAL");
    expect(facts.errors).toContain(GATE_CRITICAL_OBSERVATION_INCOMPLETE);
    expect(resolveHumanAction(facts).status).toBe("UNKNOWN");
  });

  it("observes every open PR for candidate discovery, then enriches only the selected candidate", async () => {
    const { urls, fetchMock } = installFetchHarness(18, new Set(), new Set([18]));

    const facts = await observeRepository(REPOSITORY, {});
    const detailUrls = urls.filter((url) => /\/pulls\/\d+$/.test(new URL(url).pathname));
    const criticalUrls = urls.filter(
      (url) =>
        /\/pulls\/\d+\/reviews$/.test(new URL(url).pathname) ||
        /\/commits\/detail-sha-\d+\/status$/.test(new URL(url).pathname),
    );

    expect(facts.openPullRequests?.map((pull) => pull.number)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1),
    );
    expect(detailUrls).toHaveLength(18);
    expect(criticalUrls).toEqual([
      `https://api.github.com/repos/${REPOSITORY}/commits/detail-sha-18/status`,
      `https://api.github.com/repos/${REPOSITORY}/pulls/18/reviews?per_page=100`,
    ]);
    expect(urls).toHaveLength(23);
    expect(facts.observationBudget?.estimatedUsed).toBe(23);
    expect(facts.openPullRequests?.find((pull) => pull.gateCandidate)?.number).toBe(18);
    expect(facts.openPullRequests?.filter((pull) => pull.ci !== "UNKNOWN")).toHaveLength(1);
    expect(resolveHumanAction(facts).status).toBe("ACTION_REQUIRED");
    expect(
      fetchMock.mock.calls.every(
        (call) =>
          (call as unknown[])[1] &&
          ((call as unknown[])[1] as RequestInit).method === "GET",
      ),
    ).toBe(true);
  });

  it("returns NO_GATE_CANDIDATE and UNKNOWN when no structured candidate exists", async () => {
    const { urls } = installFetchHarness(3, new Set(), new Set());

    const facts = await observeRepository(REPOSITORY, {});

    expect(facts.errors).toContain(NO_GATE_CANDIDATE);
    expect(facts.gateCompleteness).toBe("PARTIAL");
    expect(resolveHumanAction(facts).status).toBe("UNKNOWN");
    expect(urls).toHaveLength(6);
  });

  it("returns MULTIPLE_GATE_CANDIDATES and UNKNOWN without enriching either candidate", async () => {
    const { urls } = installFetchHarness(3, new Set(), new Set([1, 3]));

    const facts = await observeRepository(REPOSITORY, {});

    expect(facts.errors).toContain(MULTIPLE_GATE_CANDIDATES);
    expect(facts.gateCompleteness).toBe("PARTIAL");
    expect(urls).toHaveLength(6);
    expect(perPullUrls(urls).filter((url) => url.includes("/status") || url.includes("/reviews"))).toEqual([]);
    expect(resolveHumanAction(facts).status).toBe("UNKNOWN");
  });

  it("keeps discovery incomplete and UNKNOWN when a possible candidate detail fails", async () => {
    const { urls } = installFetchHarness(3, new Set(), new Set([2]), new Set([2]));

    const facts = await observeRepository(REPOSITORY, {});

    expect(facts.fleetCompleteness).toBe("PARTIAL");
    expect(facts.errors).toEqual([DISCOVERY_INCOMPLETE, NO_GATE_CANDIDATE]);
    expect(facts.gateCompleteness).toBe("PARTIAL");
    expect(resolveHumanAction(facts).status).toBe("UNKNOWN");
    expect(urls).toHaveLength(6);
  });

  it("allows candidate action when unrelated fleet discovery is partial", async () => {
    const { urls } = installFetchHarness(2, new Set(), new Set([1]), new Set([2]));

    const facts = await observeRepository(REPOSITORY, {});

    expect(facts.fleetCompleteness).toBe("PARTIAL");
    expect(facts.gateCompleteness).toBe("COMPLETE");
    expect(urls).toHaveLength(7);
    expect(resolveHumanAction(facts).status).toBe("ACTION_REQUIRED");
  });

  it("keeps Human Action UNKNOWN when gate-critical observation is partial", () => {
    const candidate = observedPull({
      number: 18,
      gateCandidate: true,
      ci: "PASS",
      review: "PASS",
      mergeState: "CLEAN",
      humanDecisionRequired: true,
      humanDecisionEvidence: {
        state: "REQUIRED",
        source: "PR_BODY_MARKER",
        matchedMarkers: ["Human-Decision: REQUIRED"],
      },
    });
    const facts = observedFacts({
      fleetCompleteness: "PARTIAL",
      gateCompleteness: "PARTIAL",
      openPullRequests: [candidate, observedPull()],
    });

    expect(resolveHumanAction(facts).status).toBe("UNKNOWN");
  });

  it("does not upgrade CI UNKNOWN to a Human GO", () => {
    const candidate = observedPull({
      gateCandidate: true,
      ci: "UNKNOWN",
      review: "PASS",
      mergeState: "CLEAN",
      humanDecisionRequired: true,
      humanDecisionEvidence: {
        state: "REQUIRED",
        source: "PR_BODY_MARKER",
        matchedMarkers: ["Human-Decision: REQUIRED"],
      },
    });
    const facts = observedFacts({
      fleetCompleteness: "COMPLETE",
      gateCompleteness: "COMPLETE",
      openPullRequests: [candidate],
    });

    expect(resolveHumanAction(facts).status).toBe("UNKNOWN");
  });

  it("surfaces a truncated open-PR page as PARTIAL and keeps the gate fail-closed", async () => {
    const { urls } = installFetchHarness(30);

    const facts = await observeRepository(REPOSITORY, {});

    expect(facts.evidenceState).toBe("PARTIAL");
    expect(facts.fleetCompleteness).toBe("PARTIAL");
    expect(facts.gateCompleteness).toBe("PARTIAL");
    expect(facts.warnings).toContain(OPEN_PR_LIST_PAGE_TRUNCATED);
    expect(facts.openPullRequestCount).toBe(30);
    expect(facts.observedPullRequestCount).toBe(30);
    expect(facts.observationBudget?.estimatedUsed).toBe(35);
    expect(urls.length).toBeLessThanOrEqual(SAFE_BUDGET);
    expect(resolveHumanAction(facts).status).toBe("UNKNOWN");
  });
});

function observedPull(overrides: Partial<ObservedPullRequest> = {}): ObservedPullRequest {
  return {
    number: 1,
    title: "PR",
    draft: false,
    ci: "UNKNOWN",
    review: "UNKNOWN",
    mergeState: "UNKNOWN",
    humanDecisionRequired: false,
    humanDecisionEvidence: {
      state: "NONE",
      source: "PR_BODY_MARKER",
      matchedMarkers: ["Human-Decision: NONE"],
    },
    sourceRefs: ["github:pr:1"],
    ...overrides,
  };
}

function observedFacts(overrides: Partial<ObservedFacts> = {}): ObservedFacts {
  return {
    repository: REPOSITORY,
    observedAt: "2026-09-04T00:00:00.000Z",
    evidenceState: "CONFIRMED",
    currentMain: "main-sha",
    openPullRequests: [],
    relevantIssueStates: {},
    errors: [],
    sourceRefs: [`github:repo:${REPOSITORY}`],
    ...emptyObservationExtensions(),
    ...overrides,
  };
}
