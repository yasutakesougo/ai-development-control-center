import { useEffect, useState } from "react";
import type { HumanAction } from "../domain/humanAction";

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
};

const fallback: HumanAction = {
  status: "UNKNOWN",
  title: "判定できません",
  instruction: "安全のため判断を保留しています。",
  reason: "状態をまだ取得できていません。",
  sourceRefs: [],
};

export function App() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("status request failed");
        return response.json() as Promise<StatusResponse>;
      })
      .then(setData)
      .catch(() =>
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
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  const action = data?.action ?? fallback;

  return (
    <main className="shell">
      <section className={`action-card status-${action.status.toLowerCase()}`}>
        <p className="eyebrow">今日あなたがやること</p>
        <h1>{loading ? "確認中です" : action.title}</h1>
        <p className="instruction">{loading ? "GitHubの状態を確認しています。" : action.instruction}</p>
        {!loading && <p className="reason">{action.reason}</p>}
      </section>

      <section className="status-card">
        <h2>Development Status</h2>
        <dl>
          <div><dt>Repository</dt><dd>{shortRepo(data?.developmentStatus.repository)}</dd></div>
          <div><dt>Main</dt><dd>{data?.developmentStatus.main ?? "確認中"}</dd></div>
          <div><dt>Open PR</dt><dd>{data?.developmentStatus.openPrCount ?? "—"}</dd></div>
          <div><dt>Evidence</dt><dd>{data?.developmentStatus.evidenceState ?? "確認中"}</dd></div>
        </dl>
      </section>

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
