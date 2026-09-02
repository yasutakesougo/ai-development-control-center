import "./repositoryOverviewCrt.css";

export type RepositoryOverviewItem = {
  repository: string;
  epochId: string;
  sourceMode: "PUBLIC_UNAUTHENTICATED";
  observedAt: string;
  evidenceState: "CONFIRMED" | "MISSING" | "CONTRADICTORY" | "ERROR";
  currentMain: string | null;
  openPrCount: number | null;
};

export type RepositoryOverviewData = {
  observedAt: string;
  repositories: RepositoryOverviewItem[];
  suppressedCount: number;
};

export type RepositoryOverviewPullRequest = {
  number: number;
  title: string;
  draft: boolean;
  htmlUrl: string | null;
};

export type RepositoryOverviewDetailData = RepositoryOverviewItem & {
  openPullRequests: RepositoryOverviewPullRequest[] | null;
};

export interface RepositoryOverviewPanelProps {
  loading: boolean;
  data: RepositoryOverviewData | null;
  selectedRepository?: string | null;
  detailLoading?: boolean;
  detail?: RepositoryOverviewDetailData | null;
  onSelectRepository?: (repository: string) => void;
}

export function RepositoryOverviewPanel({
  loading,
  data,
  selectedRepository = null,
  detailLoading = false,
  detail = null,
  onSelectRepository,
}: RepositoryOverviewPanelProps) {
  return (
    <section className="repository-overview-card crt-rack" aria-labelledby="repository-overview-title">
      <div className="repository-overview-header crt-rack-header">
        <div>
          <p className="eyebrow crt-kicker">[ REPOSITORY RACK ]</p>
          <h2 id="repository-overview-title">開発中リポジトリ</h2>
        </div>
        <span className="repository-overview-count crt-counter">
          {loading ? "SCANNING" : `${data?.repositories.length ?? 0} REPOS`}
        </span>
      </div>

      <p className="repository-overview-note crt-note">
        READ-ONLY PUBLIC OBSERVATION / READY・MERGE・DEPLOY AUTHORITY: NONE
      </p>

      {loading && <p className="repository-overview-empty crt-message">&gt; 公開状態を確認しています...</p>}

      {!loading && (!data || data.repositories.length === 0) && (
        <p className="repository-overview-empty crt-message">
          &gt; SOURCE UNAVAILABLE — 現在、安全に表示できるリポジトリ情報を取得できません。
        </p>
      )}

      {!loading && data && data.repositories.length > 0 && (
        <ul className="repository-overview-list crt-rack-list">
          {data.repositories.map((item) => {
            const selected = selectedRepository === item.repository;
            const evidenceLabel = evidenceDisplay(item.evidenceState);
            return (
              <li
                key={item.repository}
                className={`repository-overview-row crt-rack-row evidence-${item.evidenceState.toLowerCase()}`}
                data-evidence-state={item.evidenceState}
              >
                <div className="repository-overview-primary crt-rack-primary">
                  <span className="crt-prompt" aria-hidden="true">&gt;</span>
                  <a
                    className="repository-overview-name crt-repo-name"
                    href={`https://github.com/${item.repository}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortRepo(item.repository)}
                  </a>
                  <span className="repository-overview-state crt-state" aria-label={`Evidence ${evidenceLabel}`}>
                    EVIDENCE: {evidenceLabel}
                  </span>
                </div>
                <dl className="repository-overview-facts crt-facts">
                  <div>
                    <dt>MAIN</dt>
                    <dd>{shortSha(item.currentMain)}</dd>
                  </div>
                  <div>
                    <dt>OPEN PR</dt>
                    <dd>{item.openPrCount === null ? "UNKNOWN" : item.openPrCount}</dd>
                  </div>
                  <div>
                    <dt>OBSERVED</dt>
                    <dd>{formatObservedAt(item.observedAt)}</dd>
                  </div>
                </dl>
                {onSelectRepository && (
                  <button
                    type="button"
                    className="repository-overview-detail-button crt-command"
                    onClick={() => onSelectRepository(item.repository)}
                    aria-expanded={selected}
                  >
                    {selected ? "[ REFRESH DETAIL ]" : "[ OPEN DETAIL ]"}
                  </button>
                )}
                {selected && (
                  <RepositoryDetail detailLoading={detailLoading} detail={detail} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && data && data.suppressedCount > 0 && (
        <p className="repository-overview-suppressed crt-message">
          &gt; SUPPRESSED: {data.suppressedCount} — PUBLIC観測条件を満たさないため非表示
        </p>
      )}
    </section>
  );
}

function RepositoryDetail({
  detailLoading,
  detail,
}: {
  detailLoading: boolean;
  detail: RepositoryOverviewDetailData | null;
}) {
  if (detailLoading) {
    return <p className="repository-overview-detail-status crt-message">&gt; DETAIL SCANNING...</p>;
  }
  if (!detail) {
    return (
      <p className="repository-overview-detail-status crt-message">
        &gt; DETAIL SOURCE UNAVAILABLE
      </p>
    );
  }

  return (
    <div className="repository-overview-detail crt-detail" data-testid="repository-overview-detail">
      <p className="repository-overview-detail-meta">
        DETAIL EPOCH: {detail.epochId.slice(-12)}
      </p>
      {detail.openPullRequests === null && (
        <p className="repository-overview-detail-status">OPEN PR DETAIL: UNKNOWN</p>
      )}
      {detail.openPullRequests?.length === 0 && (
        <p className="repository-overview-detail-status">OPEN PR: 0</p>
      )}
      {detail.openPullRequests && detail.openPullRequests.length > 0 && (
        <ul className="repository-overview-pr-list">
          {detail.openPullRequests.map((pull) => (
            <li key={pull.number}>
              {pull.htmlUrl ? (
                <a href={pull.htmlUrl} target="_blank" rel="noreferrer">
                  PR #{pull.number} — {pull.title}
                </a>
              ) : (
                <span>PR #{pull.number} — {pull.title}</span>
              )}
              {pull.draft && <span className="repository-overview-draft">DRAFT</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function evidenceDisplay(state: RepositoryOverviewItem["evidenceState"]) {
  switch (state) {
    case "CONFIRMED":
      return "[OK] CONFIRMED";
    case "MISSING":
      return "[?] MISSING";
    case "CONTRADICTORY":
      return "[!] CONTRADICTORY";
    case "ERROR":
      return "[X] ERROR";
  }
}

function shortRepo(repository: string) {
  return repository.split("/").at(-1) ?? repository;
}

function shortSha(sha: string | null) {
  return sha ? sha.slice(0, 8) : "UNKNOWN";
}

function formatObservedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
