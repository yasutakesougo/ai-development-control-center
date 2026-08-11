import { describe, expect, it } from "vitest";
import {
  collectHumanDecisionEvidence,
  toHumanDecisionRequired,
} from "../src/domain/humanDecisionEvidence";

describe("collectHumanDecisionEvidence", () => {
  it("confirms REQUIRED only from the exact structured marker", () => {
    const evidence = collectHumanDecisionEvidence("Human-Decision: REQUIRED");
    expect(evidence).toEqual({
      state: "REQUIRED",
      source: "PR_BODY_MARKER",
      matchedMarkers: ["Human-Decision: REQUIRED"],
    });
    expect(toHumanDecisionRequired(evidence)).toBe(true);
  });

  it("confirms NONE only from the exact structured marker", () => {
    const evidence = collectHumanDecisionEvidence("Human-Decision: NONE");
    expect(evidence.state).toBe("NONE");
    expect(toHumanDecisionRequired(evidence)).toBe(false);
  });

  it("does not infer a decision from free-form HUMAN-ONLY text", () => {
    const evidence = collectHumanDecisionEvidence("Ready / Merge — HUMAN-ONLY");
    expect(evidence.state).toBe("UNRESOLVED");
    expect(evidence.source).toBe("NO_RECOGNIZED_MARKER");
    expect(toHumanDecisionRequired(evidence)).toBeNull();
  });

  it("fails closed when REQUIRED and NONE markers conflict", () => {
    const evidence = collectHumanDecisionEvidence(
      "Human-Decision: REQUIRED\nHuman-Decision: NONE",
    );
    expect(evidence.state).toBe("CONTRADICTORY");
    expect(evidence.matchedMarkers).toEqual([
      "Human-Decision: REQUIRED",
      "Human-Decision: NONE",
    ]);
    expect(toHumanDecisionRequired(evidence)).toBeNull();
  });

  it("ignores marker-like prose that is not an exact marker line", () => {
    const evidence = collectHumanDecisionEvidence(
      "Example: Human-Decision: REQUIRED should not authorize anything.",
    );
    expect(evidence.state).toBe("UNRESOLVED");
  });
});
