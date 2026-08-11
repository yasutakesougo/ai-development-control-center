import { describe, expect, it } from "vitest";
import { resolveHumanAction } from "../src/domain/humanActionResolver";
import type { ObservedFacts, ObservedPullRequest } from "../src/domain/observedFacts";

function pr(overrides: Partial<ObservedPullRequest> = {}): ObservedPullRequest {
  return {
    number: 1,
    title: "Example",
    draft: false,
    ci: "PASS",
    review: "PASS",
    mergeState: "CLEAN",
    humanDecisionRequired: false,
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
    ...overrides,
  };
}

describe("resolveHumanAction", () => {
  it("returns ACTION_REQUIRED only with explicit human decision evidence", () => {
    const result = resolveHumanAction(facts({ openPullRequests: [pr({ humanDecisionRequired: true })] }));
    expect(result.status).toBe("ACTION_REQUIRED");
  });

  it("returns WAIT while CI is pending", () => {
    const result = resolveHumanAction(facts({ openPullRequests: [pr({ ci: "PENDING", humanDecisionRequired: true })] }));
    expect(result.status).toBe("WAIT");
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

  it("returns UNKNOWN for contradictory evidence", () => {
    expect(resolveHumanAction(facts({ evidenceState: "CONTRADICTORY" })).status).toBe("UNKNOWN");
  });

  it("returns UNKNOWN when no known rule applies", () => {
    const result = resolveHumanAction(facts({ openPullRequests: [pr({ humanDecisionRequired: null })] }));
    expect(result.status).toBe("UNKNOWN");
  });

  it("never upgrades insufficient evidence to ACTION_REQUIRED", () => {
    const result = resolveHumanAction(
      facts({ evidenceState: "MISSING", openPullRequests: [pr({ humanDecisionRequired: true })] }),
    );
    expect(result.status).toBe("UNKNOWN");
  });
});
