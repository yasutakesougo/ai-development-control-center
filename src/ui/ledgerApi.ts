import {
  classifyLedgerResponse,
  type LedgerRecordSummary,
  type LedgerSubmissionAttempt,
  type LedgerSubmitOutcome,
} from "../domain/ledgerSubmission";

/** POST one Ledger record attempt. Network failures classify as UNKNOWN_RESULT. */
export async function postLedgerRecord(
  attempt: LedgerSubmissionAttempt,
): Promise<LedgerSubmitOutcome> {
  try {
    const response = await fetch("/api/ledger/records", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": attempt.idempotencyKey,
      },
      body: JSON.stringify({
        intent: attempt.intent,
        expectedDecisionFingerprint: attempt.expectedDecisionFingerprint,
      }),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return classifyLedgerResponse(response.status, body);
  } catch {
    return { kind: "UNKNOWN_RESULT" };
  }
}

export type LedgerHistoryResult =
  | { ok: true; records: LedgerRecordSummary[] }
  | { ok: false; reason: "UNAUTHENTICATED" | "FORBIDDEN" | "UNAVAILABLE" };

/** GET recent Ledger history (newest first, server-capped at 50). */
export async function fetchLedgerHistory(): Promise<LedgerHistoryResult> {
  try {
    const response = await fetch("/api/ledger/records", { cache: "no-store" });
    if (response.status === 401) return { ok: false, reason: "UNAUTHENTICATED" };
    if (response.status === 403) return { ok: false, reason: "FORBIDDEN" };
    if (!response.ok) return { ok: false, reason: "UNAVAILABLE" };
    const body = (await response.json()) as { records?: unknown };
    if (!Array.isArray(body.records)) return { ok: false, reason: "UNAVAILABLE" };
    return { ok: true, records: body.records as LedgerRecordSummary[] };
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }
}
