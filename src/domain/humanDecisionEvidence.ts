export type HumanDecisionEvidenceState =
  | "REQUIRED"
  | "NONE"
  | "UNRESOLVED"
  | "CONTRADICTORY";

export type HumanDecisionEvidenceSource =
  | "PR_BODY_MARKER"
  | "NO_RECOGNIZED_MARKER";

export interface HumanDecisionEvidence {
  state: HumanDecisionEvidenceState;
  source: HumanDecisionEvidenceSource;
  matchedMarkers: Array<"Human-Decision: REQUIRED" | "Human-Decision: NONE">;
}

const REQUIRED_MARKER = /^[ \t]*Human-Decision:[ \t]*REQUIRED[ \t]*$/im;
const NONE_MARKER = /^[ \t]*Human-Decision:[ \t]*NONE[ \t]*$/im;

export function collectHumanDecisionEvidence(
  body: string | null | undefined,
): HumanDecisionEvidence {
  const required = Boolean(body && REQUIRED_MARKER.test(body));
  const none = Boolean(body && NONE_MARKER.test(body));

  if (required && none) {
    return {
      state: "CONTRADICTORY",
      source: "PR_BODY_MARKER",
      matchedMarkers: ["Human-Decision: REQUIRED", "Human-Decision: NONE"],
    };
  }

  if (required) {
    return {
      state: "REQUIRED",
      source: "PR_BODY_MARKER",
      matchedMarkers: ["Human-Decision: REQUIRED"],
    };
  }

  if (none) {
    return {
      state: "NONE",
      source: "PR_BODY_MARKER",
      matchedMarkers: ["Human-Decision: NONE"],
    };
  }

  return {
    state: "UNRESOLVED",
    source: "NO_RECOGNIZED_MARKER",
    matchedMarkers: [],
  };
}

export function toHumanDecisionRequired(evidence: HumanDecisionEvidence): boolean | null {
  if (evidence.state === "REQUIRED") return true;
  if (evidence.state === "NONE") return false;
  return null;
}
