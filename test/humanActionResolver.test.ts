import { describe, expect, it } from "vitest";
import { resolveHumanAction } from "../src/domain/humanActionResolver";
import type { ObservedFacts, ObservedPullRequest } from "../src/domain/observedFacts";

const requiredEvidence = {
  state: "REQUIRED" as const,
  source: "PR_BODY_MARKER" as const,
  matchedMarkers: ["Human-Decision: REQUIRED" as const],
};

const noneEvidence = {
  state: "NONE" as const,
  source: "PR_BODY_MARKER" as const,
  matchedMarkers: ["Human-Decision: NONE" as const],
};

const unresolvedEvidence = {
  state: "UNRESOLVED" as const,
  source: "NO_RECOGNIZED_MARKER" as const,
  matchedMarkers: [],
};

function pr(overrides: Partial<ObservedPullRequest> = {}): ObservedPullRequest {
  return {
    number: 1,
    title: "Example",
    draft: false,
    ci: "PASS",
    review: "PASS",
    mergeState: "CLEAN",
    humanDecisionRequired: false,
    humanDecisionEvidence: noneEvidence,
    sourceRefs: ["github:pr:1"],
    ...overrides,
  };
}

function facts(overrides: Partial<ObservedFacts> = {}): ObservedFacts {
  return {
    repository: "owner/repo",
    observedAt: "2026-08-11T00:00:00.000Z",
    evidenceState: "CONFIRMED",
    currentMain: "abc123",
    openPullRequests: [],
    relevantIssueStates: {},
    errors: [],
    sourceRefs: ["github:repo"],
    openPullRequestCount: null,
    observedPullRequestCount: null,
    omittedPullRequestCount: null,
    warnings: [],
    observationBudget: null,
    omittedPullRequests: null,
    ...overrides,
  };
}

describe("resolveHumanAction", () => {
  it("returns ACTION_REQUIRED only with explicit human decision evidence", () => {
    const result = resolveHumanAction(
      facts({
        openPullRequests: [
          pr({ humanDecisionRequired: true, humanDecisionEvidence: requiredEvidence }),
        ],
      }),
    );
    expect(result.status).toBe("ACTION_REQUIRED");
  });

  it("returns WAIT while CI is pending when all other PR evidence is known", () => {
    const result = resolveHumanAction(
      facts({
        openPullRequests: [
          pr({
            ci: "PENDING",
            review: "PASS",
            mergeState: "CLEAN",
            humanDecisionRequired: true,
            humanDecisionEvidence: requiredEvidence,
          }),
        ],
      }),
    );
    expect(result.status).toBe("WAIT");
  });

  it("prefers UNKNOWN over WAIT when another PR has insufficient evidence", () => {
    const result = resolveHumanAction(
      facts({
        openPullRequests: [
          pr({
            number: 1,
            ci: "PENDING",
            review: "PASS",
            mergeState: "CLEAN",
            humanDecisionRequired: true,
            humanDecisionEvidence: requiredEvidence,
            sourceRefs: ["github:pr:1"],
          }),
          pr({
            number: 2,
            ci: "UNKNOWN",
            review: "PASS",
            mergeState: "CLEAN",
            humanDecisionRequired: false,
            humanDecisionEvidence: noneEvidence,
            sourceRefs: ["github:pr:2"],
          }),
        ],
      }),
    );
    expect(result.status).toBe("UNKNOWN");
    expect(result.sourceRefs).toEqual(["github:pr:2"]);
  });

  it("returns NO_ACTION when no human action exists", () => {
    const result = resolveHumanAction(facts({ openPullRequests: [pr()] }));
    expect(result.status).toBe("NO_ACTION");
  });

  it("returns UNKNOWN for missing evidence", () => {
    expect(resolveHumanAction(facts({ evidenceState: "MISSING" })).status).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for GitHub API failure", () => {
    expect(resolveHumanAction(facts({ evidenceState: "ERROR" })).status).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for contradictory repository evidence", () => {
    expect(resolveHumanAction(facts({ evidenceState: "CONTRADICTORY" })).status).toBe("UNKNOWN");
  });

  it("returns UNKNOWN when human decision evidence is unresolved", () => {
    const result = resolveHumanAction(
      facts({
        openPullRequests: [
          pr({ humanDecisionRequired: null, humanDecisionEvidence: unresolvedEvidence }),
        ],
      }),
    );
    expect(result.status).toBe("UNKNOWN");
  });

  it("returns UNKNOWN when structured decision markers contradict", () => {
    const result = resolveHumanAction(
      facts({
        openPullRequests: [
          pr({
            humanDecisionRequired: null,
            humanDecisionEvidence: {
              state: "CONTRADICTORY",
              source: "PR_BODY_MARKER",
              matchedMarkers: ["Human-Decision: REQUIRED", "Human-Decision: NONE"],
            },
          }),
        ],
      }),
    );
    expect(result.status).toBe("UNKNOWN");
  });

  it("returns UNKNOWN when boolean projection conflicts with decision evidence", () => {
    const result = resolveHumanAction(
      facts({
        openPullRequests: [pr({ humanDecisionRequired: true, humanDecisionEvidence: noneEvidence })],
      }),
    );
    expect(result.status).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for PARTIAL budget-bounded observation", () => {
    const result = resolveHumanAction(
      facts({
        evidenceState: "PARTIAL",
        openPullRequestCount: 19,
        observedPullRequestCount: 14,
        omittedPullRequestCount: 5,
        openPullRequests: [
          pr({ humanDecisionRequired: true, humanDecisionEvidence: requiredEvidence }),
        ],
      }),
    );
    expect(result.status).toBe("UNKNOWN");
    expect(result.reason).toContain("観測予算上限");
  });

  it("never upgrades insufficient evidence to ACTION_REQUIRED", () => {
    const result = resolveHumanAction(
      facts({
        evidenceState: "MISSING",
        openPullRequests: [
          pr({ humanDecisionRequired: true, humanDecisionEvidence: requiredEvidence }),
        ],
      }),
    );
    expect(result.status).toBe("UNKNOWN");
  });
});
