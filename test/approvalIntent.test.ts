import { describe, expect, it } from "vitest";
import {
  buildApprovalIntentFingerprint,
  isApprovalIntentUiAllowed,
  reconcileApprovalIntentDraft,
  selectApprovalIntent,
  type ApprovalIntentContext,
} from "../src/domain/approvalIntent";

function context(overrides: Partial<ApprovalIntentContext> = {}): ApprovalIntentContext {
  return {
    actionStatus: "ACTION_REQUIRED",
    evidenceState: "CONFIRMED",
    sourceRefs: ["github:pr:10"],
    observedAt: "2026-08-11T07:00:00.000Z",
    evidence: [{ pr: 10, humanDecision: "REQUIRED" }],
    ...overrides,
  };
}

describe("approval intent UI visibility", () => {
  it("allows Approval Intent UI only for ACTION_REQUIRED with confirmed evidence", () => {
    expect(isApprovalIntentUiAllowed("ACTION_REQUIRED", "CONFIRMED")).toBe(true);
  });

  it("forbids Approval Intent UI for WAIT", () => {
    expect(isApprovalIntentUiAllowed("WAIT", "CONFIRMED")).toBe(false);
  });

  it("forbids Approval Intent UI for NO_ACTION", () => {
    expect(isApprovalIntentUiAllowed("NO_ACTION", "CONFIRMED")).toBe(false);
  });

  it("forbids Approval Intent UI for UNKNOWN", () => {
    expect(isApprovalIntentUiAllowed("UNKNOWN", "CONFIRMED")).toBe(false);
  });

  it("forbids Approval Intent creation for insufficient or contradictory evidence", () => {
    expect(isApprovalIntentUiAllowed("ACTION_REQUIRED", "MISSING")).toBe(false);
    expect(isApprovalIntentUiAllowed("ACTION_REQUIRED", "CONTRADICTORY")).toBe(false);
    expect(isApprovalIntentUiAllowed("ACTION_REQUIRED", "ERROR")).toBe(false);
    expect(isApprovalIntentUiAllowed("ACTION_REQUIRED", "PARTIAL")).toBe(false);
    expect(isApprovalIntentUiAllowed("ACTION_REQUIRED", null)).toBe(false);
  });
});

describe("approval intent local draft selection", () => {
  it("stores APPROVE as a local draft with no external effect", () => {
    const fingerprint = buildApprovalIntentFingerprint(context());
    const result = selectApprovalIntent(true, "APPROVE", fingerprint);
    expect(result.draft).toEqual({ intent: "APPROVE", fingerprint });
    expect(result.externalEffect).toBe(false);
  });

  it("stores REJECT as a local draft with no external effect", () => {
    const fingerprint = buildApprovalIntentFingerprint(context());
    const result = selectApprovalIntent(true, "REJECT", fingerprint);
    expect(result.draft).toEqual({ intent: "REJECT", fingerprint });
    expect(result.externalEffect).toBe(false);
  });

  it("stores DEFER as a local draft with no external effect", () => {
    const fingerprint = buildApprovalIntentFingerprint(context());
    const result = selectApprovalIntent(true, "DEFER", fingerprint);
    expect(result.draft).toEqual({ intent: "DEFER", fingerprint });
    expect(result.externalEffect).toBe(false);
  });

  it("does not create a draft when Approval Intent UI is forbidden", () => {
    const fingerprint = buildApprovalIntentFingerprint(context({ actionStatus: "WAIT" }));
    const result = selectApprovalIntent(false, "APPROVE", fingerprint);
    expect(result.draft).toBeNull();
    expect(result.externalEffect).toBe(false);
  });
});

describe("approval intent stale protection", () => {
  it("clears old local intent when action or evidence fingerprint changes", () => {
    const initial = context();
    const fingerprint = buildApprovalIntentFingerprint(initial);
    const draft = selectApprovalIntent(true, "APPROVE", fingerprint).draft;

    const changedStatus = buildApprovalIntentFingerprint(
      context({ actionStatus: "NO_ACTION" }),
    );
    expect(
      reconcileApprovalIntentDraft(draft, changedStatus, isApprovalIntentUiAllowed("NO_ACTION", "CONFIRMED")),
    ).toBeNull();

    const changedSourceRefs = buildApprovalIntentFingerprint(
      context({ sourceRefs: ["github:pr:99"] }),
    );
    expect(reconcileApprovalIntentDraft(draft, changedSourceRefs, true)).toBeNull();

    const changedEvidence = buildApprovalIntentFingerprint(
      context({ evidence: [{ pr: 10, humanDecision: "NONE" }] }),
    );
    expect(reconcileApprovalIntentDraft(draft, changedEvidence, true)).toBeNull();
  });

  it("keeps local intent only while fingerprint and visibility remain valid", () => {
    const fingerprint = buildApprovalIntentFingerprint(context());
    const draft = selectApprovalIntent(true, "REJECT", fingerprint).draft;
    expect(reconcileApprovalIntentDraft(draft, fingerprint, true)).toEqual(draft);
  });
});
