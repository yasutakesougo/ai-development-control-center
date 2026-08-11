import { approvalIntentLabel, type ApprovalIntentDraft } from "../domain/approvalIntent";
import type { LedgerSubmissionState } from "../domain/ledgerSubmission";

type Props = {
  draft: ApprovalIntentDraft | null;
  /** Server-provided authoritative fingerprint; null when nothing is recordable. */
  decisionFingerprint: string | null;
  submission: LedgerSubmissionState;
  onRecord: () => void;
  onRetry: () => void;
};

/**
 * 「Ledger に記録」 controls.
 * Recording appends one immutable Ledger record. It never executes, merges or
 * reflects anything externally — result wording states NOT EXECUTED explicitly.
 */
export function LedgerRecordControls({
  draft,
  decisionFingerprint,
  submission,
  onRecord,
  onRetry,
}: Props) {
  const busy = submission.phase === "SUBMITTING";

  return (
    <section className="ledger-record-card" aria-label="Ledger record controls">
      <h2>Ledger 記録</h2>
      <p className="ledger-record-note">
        「Ledger に記録」は現在の判断案を監査用 Ledger
        に追記するだけです。実行・Merge・外部システムへの反映は行われません。
      </p>

      {draft && decisionFingerprint && (
        <div className="ledger-record-submit">
          <p>
            記録する判断案: <strong>{approvalIntentLabel(draft.intent)}</strong>（{draft.intent}）
          </p>
          <button type="button" onClick={onRecord} disabled={busy}>
            {busy ? "記録中…" : "Ledger に記録"}
          </button>
        </div>
      )}

      {draft && !decisionFingerprint && (
        <p role="status">
          サーバーの decision fingerprint が取得できないため、Ledger 記録は行えません。
        </p>
      )}

      {submission.phase === "RECORDED" && (
        <div className="ledger-record-result recorded" role="status">
          <p>
            <strong>Ledger に記録済み</strong>
            {submission.replayed ? "（再送を検出し、既存の記録を返しました）" : ""}
          </p>
          <p>NOT EXECUTED</p>
          <p>外部システムには反映されていません</p>
          <p className="ledger-record-meta">
            recordId: {submission.record.recordId} / intent: {submission.record.intent} / recordedAt:{" "}
            {submission.record.recordedAt}
          </p>
        </div>
      )}

      {submission.phase === "RETRYABLE" && (
        <div className="ledger-record-result retryable" role="status">
          <p>通信結果が不明です。記録されたかどうか確認できませんでした。</p>
          <p>同じ Idempotency-Key で再試行できます（重複記録は発生しません）。</p>
          <button type="button" onClick={onRetry}>
            同じキーで再試行
          </button>
        </div>
      )}

      {submission.phase === "STALE" && (
        <div className="ledger-record-result stale" role="status">
          <p>判断対象の状態が変わったため、記録しませんでした（STALE_DECISION）。</p>
          <p>最新の状態を確認し、もう一度選択してください。ローカルの判断案は破棄されました。</p>
        </div>
      )}

      {submission.phase === "REFUSED" && (
        <div className="ledger-record-result refused" role="status">
          <p>{refusedMessage(submission.code)}</p>
        </div>
      )}
    </section>
  );
}

function refusedMessage(
  code: Extract<LedgerSubmissionState, { phase: "REFUSED" }>["code"],
): string {
  switch (code) {
    case "NO_RECORDABLE_DECISION":
      return "現在は記録可能な判断対象がありません。最新の状態を確認してください。";
    case "IDEMPOTENCY_CONFLICT":
      return "同じキーで内容の異なる記録要求が検出されたため、記録しませんでした。もう一度選択からやり直してください。";
    case "UNAUTHENTICATED":
      return "認証されていないため、Ledger に記録できません。";
    case "FORBIDDEN":
      return "この操作は許可されていないため、Ledger に記録できません。";
    case "LEDGER_UNAVAILABLE":
      return "Ledger ストレージが利用できないため、記録できません。";
  }
}
