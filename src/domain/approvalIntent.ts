import type { HumanActionStatus } from "./humanAction";

export type ApprovalIntent = "APPROVE" | "REJECT" | "DEFER";

export interface ApprovalIntentDraft {
  intent: ApprovalIntent;
  fingerprint: string;
}

export interface ApprovalIntentContext {
  actionStatus: HumanActionStatus;
  evidenceState: string | null | undefined;
  sourceRefs: string[];
  observedAt: string;
  evidence: unknown;
}

/**
 * Approval Intent UI is presentation-only and may appear only for ACTION_REQUIRED
 * with confirmed evidence. All other statuses and fail-closed evidence states hide it.
 */
export function isApprovalIntentUiAllowed(
  actionStatus: HumanActionStatus,
  evidenceState: string | null | undefined,
): boolean {
  if (actionStatus !== "ACTION_REQUIRED") return false;
  if (
    evidenceState === "ERROR" ||
    evidenceState === "MISSING" ||
    evidenceState === "CONTRADICTORY" ||
    evidenceState == null
  ) {
    return false;
  }
  return evidenceState === "CONFIRMED";
}

/**
 * Fingerprint of the actionable observation. Any change clears local draft intent.
 */
export function buildApprovalIntentFingerprint(context: ApprovalIntentContext): string {
  return JSON.stringify({
    actionStatus: context.actionStatus,
    evidenceState: context.evidenceState ?? null,
    sourceRefs: context.sourceRefs,
    observedAt: context.observedAt,
    evidence: context.evidence ?? null,
  });
}

/**
 * Drop stale local drafts when the observation fingerprint changes or UI is no longer allowed.
 */
export function reconcileApprovalIntentDraft(
  draft: ApprovalIntentDraft | null,
  fingerprint: string,
  allowed: boolean,
): ApprovalIntentDraft | null {
  if (!allowed || draft == null) return null;
  if (draft.fingerprint !== fingerprint) return null;
  return draft;
}

/**
 * Create a local-only, ephemeral draft. Never implies external submission.
 */
export function selectApprovalIntent(
  allowed: boolean,
  intent: ApprovalIntent,
  fingerprint: string,
): { draft: ApprovalIntentDraft | null; externalEffect: false } {
  if (!allowed) {
    return { draft: null, externalEffect: false };
  }
  return {
    draft: { intent, fingerprint },
    externalEffect: false,
  };
}

export function approvalIntentLabel(intent: ApprovalIntent): string {
  if (intent === "APPROVE") return "承認案";
  if (intent === "REJECT") return "却下案";
  return "保留";
}
