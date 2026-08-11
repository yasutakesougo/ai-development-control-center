import { describe, expect, it } from "vitest";
import {
  collectHumanDecisionEvidence,
  toHumanDecisionRequired,
} from "../src/domain/humanDecisionEvidence";
import { resolveHumanAction } from "../src/domain/humanActionResolver";
import type { ObservedFacts, ObservedPullRequest } from "../src/domain/observedFacts";
import { selectAuthoritativePullBody } from "../src/worker/github/readOnlyAdapter";

function factsFromBodies(
  detailBody: string | null | undefined,
  summaryBody: string | null | undefined,
): ObservedFacts {
  const body = selectAuthoritativePullBody(detailBody, summaryBody);
  const humanDecisionEvidence = collectHumanDecisionEvidence(body);
  const humanDecisionRequired = toHumanDecisionRequired(humanDecisionEvidence);

  const openPullRequest: ObservedPullRequest = {
    number: 245,
    title: "Example",
    draft: false,
    ci: "PASS",
    review: "PASS",
    mergeState: "CLEAN",
    humanDecisionRequired,
    humanDecisionEvidence,
    sourceRefs: ["github:pr:245"],
  };

  return {
    repository: "yasutakesougo/severe-behavior-support-spfx",
    observedAt: "2026-08-11T00:00:00.000Z",
    evidenceState: "CONFIRMED",
    currentMain: "abc123",
    openPullRequests: [openPullRequest],
    relevantIssueStates: {},
    errors: [],
    sourceRefs: ["github:repo:yasutakesougo/severe-behavior-support-spfx"],
  };
}

describe("selectAuthoritativePullBody", () => {
  it("does not resurrect a stale REQUIRED marker when detail body is explicit null", () => {
    const body = selectAuthoritativePullBody(null, "Human-Decision: REQUIRED");
    const evidence = collectHumanDecisionEvidence(body);
    const action = resolveHumanAction(factsFromBodies(null, "Human-Decision: REQUIRED"));

    expect(body).toBeNull();
    expect(evidence.state).toBe("UNRESOLVED");
    expect(toHumanDecisionRequired(evidence)).toBeNull();
    expect(action.status).not.toBe("ACTION_REQUIRED");
    expect(action.status).toBe("UNKNOWN");
  });

  it("recognizes REQUIRED from the authoritative detail body", () => {
    const body = selectAuthoritativePullBody("Human-Decision: REQUIRED", "stale");
    const evidence = collectHumanDecisionEvidence(body);
    const action = resolveHumanAction(
      factsFromBodies("Human-Decision: REQUIRED", "stale"),
    );

    expect(evidence.state).toBe("REQUIRED");
    expect(toHumanDecisionRequired(evidence)).toBe(true);
    expect(action.status).toBe("ACTION_REQUIRED");
  });

  it("recognizes NONE from the authoritative detail body", () => {
    const body = selectAuthoritativePullBody("Human-Decision: NONE", "Human-Decision: REQUIRED");
    const evidence = collectHumanDecisionEvidence(body);
    const action = resolveHumanAction(
      factsFromBodies("Human-Decision: NONE", "Human-Decision: REQUIRED"),
    );

    expect(evidence.state).toBe("NONE");
    expect(toHumanDecisionRequired(evidence)).toBe(false);
    expect(action.status).toBe("NO_ACTION");
  });

  it("falls back to summary body only when detail body is missing", () => {
    const body = selectAuthoritativePullBody(undefined, "Human-Decision: REQUIRED");
    const evidence = collectHumanDecisionEvidence(body);

    expect(body).toBe("Human-Decision: REQUIRED");
    expect(evidence.state).toBe("REQUIRED");
  });
});
