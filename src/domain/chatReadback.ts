export const CHAT_READBACK_SOURCE_ENDPOINT = "/api/status" as const;
export const CHAT_READBACK_BOUNDARY = "READ_ONLY_NO_EXECUTION_AUTHORITY" as const;

export type ChatReadbackHumanActionStatus =
  | "ACTION_REQUIRED"
  | "WAIT"
  | "NO_ACTION"
  | "UNKNOWN";

export type ChatReadbackEvidenceState =
  | "CONFIRMED"
  | "MISSING"
  | "CONTRADICTORY"
  | "ERROR";

export type ChatReadbackDecisionCandidate = "PRESENT" | "NOT_PRESENT" | "UNKNOWN";

export interface ChatReadbackSuccess {
  ok: true;
  repository: string;
  humanAction: {
    status: ChatReadbackHumanActionStatus;
    title: string;
    instruction: string;
    reason: string;
    sourceRefs: string[];
  };
  evidenceState: ChatReadbackEvidenceState;
  decisionCandidate: Exclude<ChatReadbackDecisionCandidate, "UNKNOWN">;
  observedAt: string;
  sourceEndpoint: typeof CHAT_READBACK_SOURCE_ENDPOINT;
  boundary: typeof CHAT_READBACK_BOUNDARY;
}

export interface ChatReadbackFailure {
  ok: false;
  state: "SOURCE_UNAVAILABLE" | "INVALID_PAYLOAD";
  decisionCandidate: "UNKNOWN";
  sourceEndpoint: typeof CHAT_READBACK_SOURCE_ENDPOINT;
  boundary: typeof CHAT_READBACK_BOUNDARY;
}

export type ChatReadbackResult = ChatReadbackSuccess | ChatReadbackFailure;

const HUMAN_ACTION_STATUSES = new Set<ChatReadbackHumanActionStatus>([
  "ACTION_REQUIRED",
  "WAIT",
  "NO_ACTION",
  "UNKNOWN",
]);

const EVIDENCE_STATES = new Set<ChatReadbackEvidenceState>([
  "CONFIRMED",
  "MISSING",
  "CONTRADICTORY",
  "ERROR",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function invalidChatReadbackPayload(): ChatReadbackFailure {
  return {
    ok: false,
    state: "INVALID_PAYLOAD",
    decisionCandidate: "UNKNOWN",
    sourceEndpoint: CHAT_READBACK_SOURCE_ENDPOINT,
    boundary: CHAT_READBACK_BOUNDARY,
  };
}

export function unavailableChatReadbackSource(): ChatReadbackFailure {
  return {
    ok: false,
    state: "SOURCE_UNAVAILABLE",
    decisionCandidate: "UNKNOWN",
    sourceEndpoint: CHAT_READBACK_SOURCE_ENDPOINT,
    boundary: CHAT_READBACK_BOUNDARY,
  };
}

export function projectChatReadbackPayload(payload: unknown): ChatReadbackResult {
  if (!isRecord(payload)) return invalidChatReadbackPayload();

  const action = payload.action;
  const developmentStatus = payload.developmentStatus;
  const observedAt = payload.observedAt;

  if (!isRecord(action) || !isRecord(developmentStatus)) return invalidChatReadbackPayload();

  const actionStatus = action.status;
  const title = action.title;
  const instruction = action.instruction;
  const reason = action.reason;
  const sourceRefs = action.sourceRefs;
  const repository = developmentStatus.repository;
  const evidenceState = developmentStatus.evidenceState;

  if (
    typeof actionStatus !== "string" ||
    !HUMAN_ACTION_STATUSES.has(actionStatus as ChatReadbackHumanActionStatus) ||
    typeof title !== "string" ||
    typeof instruction !== "string" ||
    typeof reason !== "string" ||
    !isStringArray(sourceRefs) ||
    typeof repository !== "string" ||
    repository.trim().length === 0 ||
    typeof evidenceState !== "string" ||
    !EVIDENCE_STATES.has(evidenceState as ChatReadbackEvidenceState) ||
    typeof observedAt !== "string" ||
    observedAt.trim().length === 0
  ) {
    return invalidChatReadbackPayload();
  }

  const hasDecisionFingerprint = Object.prototype.hasOwnProperty.call(payload, "decisionFingerprint");
  if (
    hasDecisionFingerprint &&
    (typeof payload.decisionFingerprint !== "string" || payload.decisionFingerprint.trim().length === 0)
  ) {
    return invalidChatReadbackPayload();
  }

  return {
    ok: true,
    repository,
    humanAction: {
      status: actionStatus as ChatReadbackHumanActionStatus,
      title,
      instruction,
      reason,
      sourceRefs: [...sourceRefs],
    },
    evidenceState: evidenceState as ChatReadbackEvidenceState,
    decisionCandidate: hasDecisionFingerprint ? "PRESENT" : "NOT_PRESENT",
    observedAt,
    sourceEndpoint: CHAT_READBACK_SOURCE_ENDPOINT,
    boundary: CHAT_READBACK_BOUNDARY,
  };
}
