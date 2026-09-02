import { describe, expect, it } from "vitest";
import {
  buildHumanGateViewModel,
  isHumanGateStatusSource,
  type HumanGateStatusSource,
} from "../src/ui/humanGateViewModel";

const source: HumanGateStatusSource = {
  action: {
    status: "ACTION_REQUIRED",
    title: "Review PR #140",
    instruction: "Review the current Human Gate.",
    reason: "Evidence is confirmed.",
    sourceRefs: ["github:issue/140"],
  },
  developmentStatus: { evidenceState: "CONFIRMED" },
  observedAt: "2026-09-02T11:00:00Z",
  decisionFingerprint: "fingerprint",
};

describe("humanGateViewModel", () => {
  it("projects authoritative fields from an available status payload", () => {
    const view = buildHumanGateViewModel("AVAILABLE", source);
    expect(view.status).toBe("ACTION_REQUIRED");
    expect(view.instruction).toBe(source.action.instruction);
    expect(view.evidenceState).toBe("CONFIRMED");
    expect(view.decisionCandidate).toBe("PRESENT");
    expect(view.observedAt).toBe(source.observedAt);
  });

  it("uses NOT PRESENT only for a valid available payload without a fingerprint", () => {
    const view = buildHumanGateViewModel("AVAILABLE", {
      ...source,
      decisionFingerprint: undefined,
    });
    expect(view.decisionCandidate).toBe("NOT PRESENT");
  });

  it("fails closed when the source is unavailable", () => {
    const view = buildHumanGateViewModel("UNAVAILABLE", null);
    expect(view.status).toBe("UNKNOWN");
    expect(view.evidenceState).toBe("SOURCE UNAVAILABLE");
    expect(view.decisionCandidate).toBe("UNKNOWN");
    expect(view.observedAt).toBeNull();
  });

  it("does not invent an observedAt while loading", () => {
    const view = buildHumanGateViewModel("LOADING", null);
    expect(view.decisionCandidate).toBe("UNKNOWN");
    expect(view.observedAt).toBeNull();
  });

  it("rejects an invalid status-shaped payload for the Human Gate projection", () => {
    expect(isHumanGateStatusSource({ observedAt: "2026-09-02" })).toBe(false);
    expect(isHumanGateStatusSource(source)).toBe(true);
  });
});
