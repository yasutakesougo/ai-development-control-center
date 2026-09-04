import { describe, expect, it } from "vitest";
import { resolveHumanAction } from "../src/domain/humanActionResolver";
import type { ObservedFacts } from "../src/domain/observedFacts";
import { emptyObservationExtensions } from "../src/domain/observedFacts";
import { buildStatusPayload } from "../src/worker/statusApi";

function partialFacts(): ObservedFacts {
  return {
    repository: "example/repository",
    observedAt: "2026-09-03T00:00:00.000Z",
    evidenceState: "PARTIAL",
    currentMain: "main-sha",
    openPullRequests: [],
    relevantIssueStates: {},
    errors: [],
    sourceRefs: ["github:repo:example/repository"],
    openPullRequestCount: 19,
    observedPullRequestCount: 14,
    omittedPullRequestCount: 5,
    warnings: ["OPEN_PR_DETAIL_OBSERVATION_TRUNCATED"],
    observationBudget: {
      limit: 50,
      safeBudget: 45,
      estimatedUsed: 45,
      bounded: true,
    },
    omittedPullRequests: [{ number: 15, reason: "BUDGET_DETAIL_CAP" }],
  };
}

describe("statusApi budget repair projection", () => {
  it("projects openPrCount from openPullRequestCount, not detailed array length", async () => {
    const facts = partialFacts();
    facts.openPullRequests = [];
    const action = resolveHumanAction(facts);
    const payload = await buildStatusPayload(facts, action);
    const developmentStatus = payload.developmentStatus as Record<string, unknown>;
    expect(developmentStatus.openPrCount).toBe(19);
    expect(developmentStatus.evidenceState).toBe("PARTIAL");
    expect(developmentStatus.observedPullRequestCount).toBe(14);
    expect(developmentStatus.omittedPullRequestCount).toBe(5);
    expect(developmentStatus.warnings).toEqual(["OPEN_PR_DETAIL_OBSERVATION_TRUNCATED"]);
    expect(payload.decisionFingerprint).toBeUndefined();
  });

  it("keeps ERROR extensions nullish via emptyObservationExtensions shape", async () => {
    const facts: ObservedFacts = {
      repository: "example/repository",
      observedAt: "2026-09-03T00:00:00.000Z",
      evidenceState: "ERROR",
      currentMain: null,
      openPullRequests: null,
      relevantIssueStates: null,
      errors: ["GitHub API request failed"],
      sourceRefs: ["github:repo:example/repository"],
      ...emptyObservationExtensions(),
    };
    const payload = await buildStatusPayload(facts, resolveHumanAction(facts));
    const developmentStatus = payload.developmentStatus as Record<string, unknown>;
    expect(developmentStatus.openPrCount).toBeNull();
    expect(developmentStatus.evidenceState).toBe("ERROR");
  });
});
