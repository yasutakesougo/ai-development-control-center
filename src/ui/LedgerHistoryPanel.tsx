import type { LedgerRecordSummary } from "../domain/ledgerSubmission";
import type { LedgerHistoryResult } from "./ledgerApi";

type Props = {
  history: LedgerHistoryResult | null;
};

/**
 * Compact append-only Ledger history (newest first).
 * Raw approver issuer/subjectId appear only inside expandable audit details.
 */
export function LedgerHistoryPanel({ history }: Props) {
  return (
    <section className="ledger-history-card" aria-label="Ledger history">
      <h2>Ledger 履歴</h2>

      {history === null && <p>Ledger 履歴を読み込んでいます…</p>}

      {history && !history.ok && (
        <p role="status">
          {history.reason === "UNAUTHENTICATED" || history.reason === "FORBIDDEN"
            ? "Ledger 履歴を表示するには認証・認可が必要です。"
            : "Ledger 履歴を取得できませんでした。"}
        </p>
      )}

      {history?.ok && history.records.length === 0 && <p>Ledger 記録はまだありません。</p>}

      {history?.ok && history.records.length > 0 && (
        <ul className="ledger-history-list">
          {history.records.map((record) => (
            <li key={record.recordId}>
              <div className="ledger-history-main">
                <strong>{record.intent}</strong>
                {" — "}
                {record.recordedAt}
                {" / "}
                {shortRepo(record.repository)}
                <span className="ledger-history-flag">NOT EXECUTED</span>
              </div>
              <div className="ledger-history-refs">
                {record.sourceRefs.length > 0 ? record.sourceRefs.join(", ") : "(no source refs)"}
              </div>
              <div className="ledger-history-id">recordId: {record.recordId}</div>
              <details>
                <summary>監査詳細</summary>
                <AuditDetails record={record} />
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AuditDetails({ record }: { record: LedgerRecordSummary }) {
  return (
    <dl className="ledger-history-audit">
      <div>
        <dt>decisionFingerprint</dt>
        <dd>{record.decisionFingerprint}</dd>
      </div>
      <div>
        <dt>observedAt</dt>
        <dd>{record.observedAt}</dd>
      </div>
      <div>
        <dt>submissionState</dt>
        <dd>{record.submissionState}</dd>
      </div>
      <div>
        <dt>externalEffect</dt>
        <dd>{String(record.externalEffect)}</dd>
      </div>
      {record.approver && (
        <>
          <div>
            <dt>approver.issuer</dt>
            <dd>{record.approver.issuer}</dd>
          </div>
          <div>
            <dt>approver.subjectId</dt>
            <dd>{record.approver.subjectId}</dd>
          </div>
        </>
      )}
    </dl>
  );
}

function shortRepo(repository: string): string {
  return repository.split("/").at(-1) ?? repository;
}
