import type { HumanAction } from "../domain/humanAction";

export type HumanGateSourceAvailability = "LOADING" | "AVAILABLE" | "UNAVAILABLE";
export type DecisionCandidatePresence = "PRESENT" | "NOT PRESENT" | "UNKNOWN";

export interface HumanGateStatusSource {
  action: HumanAction;
  developmentStatus: {
    evidenceState: string;
  };
  observedAt: string;
  decisionFingerprint?: string;
}

export interface HumanGateViewModel {
  sourceAvailability: HumanGateSourceAvailability;
  status: HumanAction["status"];
  title: string;
  instruction: string;
  reason: string;
  sourceRefs: string[];
  evidenceState: string;
  decisionCandidate: DecisionCandidatePresence;
  observedAt: string | null;
}

const unavailableAction: HumanAction = {
  status: "UNKNOWN",
  title: "判定できません",
  instruction: "安全のため判断を保留しています。",
  reason: "SOURCE UNAVAILABLE",
  sourceRefs: [],
};

export function isHumanGateStatusSource(value: unknown): value is HumanGateStatusSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<HumanGateStatusSource>;
  const action = source.action;
  const developmentStatus = source.developmentStatus;

  return Boolean(
    action &&
      typeof action.status === "string" &&
      ["ACTION_REQUIRED", "WAIT", "NO_ACTION", "UNKNOWN"].includes(action.status) &&
      typeof action.title === "string" &&
      typeof action.instruction === "string" &&
      typeof action.reason === "string" &&
      Array.isArray(action.sourceRefs) &&
      action.sourceRefs.every((ref) => typeof ref === "string") &&
      developmentStatus &&
      typeof developmentStatus.evidenceState === "string" &&
      typeof source.observedAt === "string",
  );
}

export function buildHumanGateViewModel(
  availability: HumanGateSourceAvailability,
  source: HumanGateStatusSource | null,
): HumanGateViewModel {
  if (availability !== "AVAILABLE" || !source) {
    return {
      sourceAvailability: availability,
      ...unavailableAction,
      evidenceState: availability === "LOADING" ? "確認中" : "SOURCE UNAVAILABLE",
      decisionCandidate: "UNKNOWN",
      observedAt: null,
    };
  }

  return {
    sourceAvailability: "AVAILABLE",
    status: source.action.status,
    title: source.action.title,
    instruction: source.action.instruction,
    reason: source.action.reason,
    sourceRefs: source.action.sourceRefs,
    evidenceState: source.developmentStatus.evidenceState,
    decisionCandidate: source.decisionFingerprint ? "PRESENT" : "NOT PRESENT",
    observedAt: source.observedAt,
  };
}
