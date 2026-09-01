import { useCallback, useEffect, useState } from "react";
import {
  buildApprovalIntentFingerprint,
  isApprovalIntentUiAllowed,
  reconcileApprovalIntentDraft,
  selectApprovalIntent,
  type ApprovalIntent,
  type ApprovalIntentDraft,
} from "../domain/approvalIntent";
import type { HumanAction } from "../domain/humanAction";
import {
  applyLedgerOutcome,
  beginLedgerSubmission,
  retryableAttempt,
  type LedgerSubmissionAttempt,
  type LedgerSubmissionState,
} from "../domain/ledgerSubmission";
import type { StatusOverlayDocument } from "../domain/statusOverlayContract";
import type { StatusOverlayRuntimePhase } from "../runtime/statusOverlayRuntime";
import { ApprovalIntentPanel } from "./ApprovalIntentPanel";
import { fetchLedgerHistory, postLedgerRecord, type LedgerHistoryResult } from "./ledgerApi";
import { LedgerHistoryPanel } from "./LedgerHistoryPanel";
import { LedgerRecordControls } from "./LedgerRecordControls";
import {
  RepositoryOverviewPanel,
  type RepositoryOverviewData,
} from "./RepositoryOverviewPanel";
import { StatusOverlayPanel } from "./StatusOverlayPanel";

type PrEvidence = {
  pr: number;
  draft: boolean;
  ci: string;
  review: string;
  mergeState: string;
  humanDecision: string;
  humanDecisionSource: string;
  sourceRefs: string[];
};

type StatusResponse = {
  action: HumanAction;
  developmentStatus: {
    repository: string;
    main: string;
    openPrCount: number | null;
    evidenceState: string;
  };
  evidence: PrEvidence[] | null;
  observedAt: string;
  /** Server-computed; present only when a recordable decision candidate exists. */
  decisionFingerprint?: string;
};

const fallback: HumanAction = {
  status: "UNKNOWN",
  title: "判定できません",
  instruction: "安全のため判断を保留しています。",
  reason: "状態をまだ取得できていません。",
  sourceRefs: [],
};

export interface AppProps {
  /**
   * Optional STATUS-OVERLAY document for read-only display.
   * The UI never observes GitHub/workflow itself — callers supply the document.
   */
  statusOverlay?: StatusOverlayDocument | null;
  /** Runtime wiring phase; defaults to disabled when omitted. */
  statusOverlayPhase?: StatusOverlayRuntimePhase;
  statusOverlayUnavailableReason?: string | null;
}

export function App({
  statusOverlay = null,
  statusOverlayPhase = "disabled",
  statusOverlayUnavailableReason = null,
}: AppProps = {}) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [repositoryOverview, setRepositoryOverview] = useState<RepositoryOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [intentDraft, setIntentDraft] = useState<ApprovalIntentDraft | null>(null);
  const [submission, setSubmission] = useState<LedgerSubmissionState>({ phase: "IDLE" });
  const [history, setHistory] = useState<LedgerHistoryResult | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) throw new Error("status request failed");
      setData((await response.json()) as StatusResponse);
    } catch {
      setData({
        action: fallback,
        developmentStatus: {
          repository: "severe-behavior-support-spfx",
          main: "Unknown",
          openPrCount: null,
          evidenceState: "ERROR",
        },
        evidence: null,
        observedAt: new Date().toISOString(),
      });
    }
  }, []);

  const loadRepositoryOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const response = await fetch("/api/repositories/overview", { cache: "no-store" });
      if (!response.ok) throw new Error("repository overview request failed");
      setRepositoryOverview((await response.json()) as RepositoryOverviewData);
    } catch {
      setRepositoryOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistory(await fetchLedgerHistory());
  }, []);

  useEffect(() => {
    void loadRepositoryOverview();
    Promise.all([loadStatus(), loadHistory()]).finally(() => setLoading(false));
  }, [loadStatus, loadHistory, loadRepositoryOverview]);

  const action = data?.action ?? fallback;
  const evidenceState = data?.developmentStatus.evidenceState;
  const approvalAllowed = isApprovalIntentUiAllowed(action.status, evidenceState);
  const serverFingerprint = data?.decisionFingerprint ?? null;
  const localFingerprint = data
    ? buildApprovalIntentFingerprint({
        actionStatus: action.status,
        evidenceState,
        sourceRefs: action.sourceRefs,
        observedAt: data.observedAt,
        evidence: data.evidence,
      })
    : "";

  useEffect(() => {
    setIntentDraft((current) => reconcileApprovalIntentDraft(current, localFingerprint, approvalAllowed));
  }, [localFingerprint, approvalAllowed]);

  function handleSelectIntent(intent: ApprovalIntent) {
    const result = selectApprovalIntent(approvalAllowed, intent, localFingerprint);
    setIntentDraft(result.draft);
    // A fresh choice starts a fresh submission context (a later press generates a new key).
    setSubmission({ phase: "IDLE" });
  }

  async function submitAttempt(attempt: LedgerSubmissionAttempt) {
    setSubmission({ phase: "SUBMITTING", attempt });
    const outcome = await postLedgerRecord(attempt);
    const effect = applyLedgerOutcome(attempt, outcome);
    setSubmission(effect.state);
    if (effect.discardIntent) setIntentDraft(null);
    if (effect.refreshStatus) await loadStatus();
    if (effect.state.phase === "RECORDED") await loadHistory();
  }

  function handleRecord() {
    if (!intentDraft) return;
    const attempt = beginLedgerSubmission(intentDraft.intent, serverFingerprint);
    if (!attempt) return;
    void submitAttempt(attempt);
  }

  function handleRetry() {
    // Blind retry after an unknown result reuses the SAME idempotency key.
    const attempt = retryableAttempt(submission);
    if (!attempt) return;
    void submitAttempt(attempt);
  }

  return (
    <main className="shell">
      <section className={`action-card status-${action.status.toLowerCase()}`}>
        <p className="eyebrow">今日あなたがやること</p>
        <h1>{loading ? "確認中です" : action.title}</h1>
        <p className="instruction">{loading ? "GitHubの状態を確認しています。" : action.instruction}</p>
        {!loading && <p className="reason">{action.reason}</p>}
      </section>

      <RepositoryOverviewPanel loading={overviewLoading} data={repositoryOverview} />

      <section className="status-card">
        <h2>Development Status</h2>
        <dl>
          <div><dt>Repository</dt><dd>{shortRepo(data?.developmentStatus.repository)}</dd></div>
          <div><dt>Main</dt><dd>{data?.developmentStatus.main ?? "確認中"}</dd></div>
          <div><dt>Open PR</dt><dd>{data?.developmentStatus.openPrCount ?? "—"}</dd></div>
          <div><dt>Evidence</dt><dd>{data?.developmentStatus.evidenceState ?? "確認中"}</dd></div>
          <div><dt>observedAt</dt><dd>{data?.observedAt ?? "確認中"}</dd></div>
        </dl>
      </section>

      {statusOverlayPhase === "loading" && (
        <section className="status-overlay-card" data-testid="status-overlay-loading">
          <p className="eyebrow">STATUS-OVERLAY-V1</p>
          <h2>Loading repository status</h2>
          <p className="status-overlay-note">Read-only observation in progress.</p>
        </section>
      )}

      {statusOverlayPhase === "unavailable" && (
        <section
          className="status-overlay-card tone-unknown"
          data-testid="status-overlay-unavailable"
        >
          <p className="eyebrow">STATUS-OVERLAY-V1</p>
          <h2>Status overlay unavailable</h2>
          <p className="status-overlay-note">
            {statusOverlayUnavailableReason ??
              "STATUS-OVERLAY could not be loaded. This is not NO_ACTION."}
          </p>
        </section>
      )}

      {statusOverlay && statusOverlayPhase !== "loading" && (
        <StatusOverlayPanel document={statusOverlay} />
      )}

      {!loading && approvalAllowed && data && (
        <ApprovalIntentPanel
          action={action}
          observedAt={data.observedAt}
          evidence={data.evidence}
          draft={intentDraft}
          onSelect={handleSelectIntent}
        />
      )}

      {!loading && (approvalAllowed || submission.phase !== "IDLE") && (
        <LedgerRecordControls
          draft={intentDraft}
          decisionFingerprint={serverFingerprint}
          submission={submission}
          onRecord={handleRecord}
          onRetry={handleRetry}
        />
      )}

      {!loading && <LedgerHistoryPanel history={history} />}

      <details className="details-card">
        <summary>理由と参照元を見る</summary>
        <p>{action.reason}</p>
        {action.sourceRefs.length > 0 && (
          <ul>{action.sourceRefs.map((ref) => <li key={ref}>{ref}</li>)}</ul>
        )}

        {data?.evidence && data.evidence.length > 0 && (
          <>
            <h3>Observed PR evidence</h3>
            <ul>
              {data.evidence.map((item) => (
                <li key={item.pr}>
                  <strong>PR #{item.pr}</strong>{" — "}
                  Draft={item.draft ? "YES" : "NO"}, CI={item.ci}, Review={item.review}, Merge={item.mergeState},{" "}
                  HumanDecision={item.humanDecision} ({item.humanDecisionSource})
                  {item.sourceRefs.length > 0 && (
                    <ul>
                      {item.sourceRefs.map((ref) => (
                        <li key={ref}>{ref}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
    </main>
  );
}

function shortRepo(repository?: string) {
  return repository?.split("/").at(-1) ?? "確認中";
}
