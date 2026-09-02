import { describe, expect, it } from "vitest";
import {
  projectChatReadbackPayload,
  unavailableChatReadbackSource,
} from "../src/domain/chatReadback";

function validPayload() {
  return {
    action: {
      status: "ACTION_REQUIRED",
      title: "Review current scope",
      instruction: "Read the independent scope review.",
      reason: "Human decision required.",
      sourceRefs: ["github:pr:138"],
    },
    developmentStatus: {
      repository: "yasutakesougo/severe-behavior-support-spfx",
      evidenceState: "CONFIRMED",
    },
    observedAt: "2026-09-02T03:00:00.000Z",
    decisionFingerprint: "server-only-fingerprint",
    evidence: [{ privateFutureField: "must-not-leak" }],
  };
}

describe("CHAT-READBACK-V1 projection", () => {
  it("projects only the exact allowlisted operational fields", () => {
    const result = projectChatReadbackPayload(validPayload());

    expect(result).toEqual({
      ok: true,
      repository: "yasutakesougo/severe-behavior-support-spfx",
      humanAction: {
        status: "ACTION_REQUIRED",
        title: "Review current scope",
        instruction: "Read the independent scope review.",
        reason: "Human decision required.",
        sourceRefs: ["github:pr:138"],
      },
      evidenceState: "CONFIRMED",
      decisionCandidate: "PRESENT",
      observedAt: "2026-09-02T03:00:00.000Z",
      sourceEndpoint: "/api/status",
      boundary: "READ_ONLY_NO_EXECUTION_AUTHORITY",
    });
    expect(result).not.toHaveProperty("evidence");
    expect(result).not.toHaveProperty("decisionFingerprint");
  });

  it("emits NOT_PRESENT only after a valid payload without decisionFingerprint", () => {
    const payload = validPayload();
    delete (payload as Partial<typeof payload>).decisionFingerprint;

    expect(projectChatReadbackPayload(payload)).toMatchObject({
      ok: true,
      decisionCandidate: "NOT_PRESENT",
    });
  });

  it("fails closed for an unknown HumanAction vocabulary value", () => {
    const payload = validPayload();
    payload.action.status = "GO";

    expect(projectChatReadbackPayload(payload)).toEqual({
      ok: false,
      state: "INVALID_PAYLOAD",
      decisionCandidate: "UNKNOWN",
      sourceEndpoint: "/api/status",
      boundary: "READ_ONLY_NO_EXECUTION_AUTHORITY",
    });
  });

  it("fails closed for an unknown EvidenceState value", () => {
    const payload = validPayload();
    payload.developmentStatus.evidenceState = "HEALTHY";

    expect(projectChatReadbackPayload(payload)).toMatchObject({
      ok: false,
      state: "INVALID_PAYLOAD",
      decisionCandidate: "UNKNOWN",
    });
  });

  it("does not confuse a malformed fingerprint with NOT_PRESENT", () => {
    const payload = validPayload();
    payload.decisionFingerprint = "";

    expect(projectChatReadbackPayload(payload)).toMatchObject({
      ok: false,
      state: "INVALID_PAYLOAD",
      decisionCandidate: "UNKNOWN",
    });
  });

  it("requires provenance fields before emitting a normal state", () => {
    const payload = validPayload();
    payload.developmentStatus.repository = "";

    expect(projectChatReadbackPayload(payload)).toMatchObject({
      ok: false,
      state: "INVALID_PAYLOAD",
      decisionCandidate: "UNKNOWN",
    });
  });

  it("represents transport/source failure separately from invalid payload", () => {
    expect(unavailableChatReadbackSource()).toEqual({
      ok: false,
      state: "SOURCE_UNAVAILABLE",
      decisionCandidate: "UNKNOWN",
      sourceEndpoint: "/api/status",
      boundary: "READ_ONLY_NO_EXECUTION_AUTHORITY",
    });
  });
});
