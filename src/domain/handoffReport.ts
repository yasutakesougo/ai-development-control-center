/**
 * HANDOFF-V1 machine-readable report contract.
 *
 * Context reconstruction and decision-support only.
 * Does not authorize or execute any external capability.
 */

export type HandoffNextActionStatus = "NO_ACTION" | "ACTION_REQUIRED" | "UNKNOWN";

export type SnapshotStaleClassification =
  | "current"
  | "stale_no_architecture_impact"
  | "stale_architecture_affecting"
  | "UNKNOWN";

export interface HandoffFact {
  id: string;
  name: string;
  status: "confirmed" | "assumed" | "unknown";
  responsibility: string;
  evidence: string[];
}

export interface LiveDifference {
  id: string;
  summary: string;
  evidence: string[];
}

export interface HandoffNextAction {
  status: HandoffNextActionStatus;
  description: string;
  evidence: string[];
}

export interface HandoffReport {
  schemaVersion: "1.0";
  repository: string;
  evaluatedAt: string;
  currentMain: string | null;
  snapshot: {
    generatedFrom: string;
    generatedAt: string;
    generator: string;
    schemaVersion: string;
    stale: boolean | null;
    classification: SnapshotStaleClassification;
    staleReasons: string[];
    changedPaths: string[];
    architectureRelevantPaths: string[];
  };
  confirmed: HandoffFact[];
  assumptions: HandoffFact[];
  unknowns: HandoffFact[];
  liveDifferences: LiveDifference[];
  humanGates: HandoffFact[];
  holds: HandoffFact[];
  forbiddenCapabilities: HandoffFact[];
  nextAction: HandoffNextAction;
}

/** Read-only live GitHub observation for THIS control-center repository. */
export interface HandoffLiveState {
  evidenceState: "CONFIRMED" | "ERROR" | "MISSING";
  currentMain: string | null;
  openPullRequests: Array<{
    number: number;
    title: string;
    draft: boolean;
    ci: string;
    review: string;
    humanDecisionState: "REQUIRED" | "NONE" | "UNRESOLVED" | "CONTRADICTORY" | "UNKNOWN";
    humanDecisionRequired: boolean | null;
  }> | null;
  errors: string[];
  sourceRefs: string[];
}
