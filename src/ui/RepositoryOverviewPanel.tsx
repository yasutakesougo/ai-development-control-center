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
    <section className="repository-overview-card" aria-labelledby="repository-overview-title">
      <div className="repository-overview-header">
        <div>
          <p className="eyebrow">MULTI-REPOSITORY-OVERVIEW-V1</p>
          <h2 id="repository-overview-title">開発中リポジトリ</h2>
        </div>
        <span className="repository-overview-count">
          {loading ? "確認中" : `${data?.repositories.length ?? 0} repos`}
        </span>
      </div>

      <p className="repository-overview-note">
        公開リポジトリのREAD-ONLY観測です。ここでReady・Merge・Deployの権限は発生しません。
      </p>

      {loading && <p className="repository-overview-empty">公開状態を確認しています。</p>}

      {!loading && (!data || data.repositories.length === 0) && (
        <p className="repository-overview-empty">
          現在、安全に表示できるリポジトリ情報を取得できませんでした。
        </p>
      )}

      {!loading && data && data.repositories.length > 0 && (
        <ul className="repository-overview-list">
          {data.repositories.map((item) => {
            const selected = selectedRepository === item.repository;
            return (
              <li
                key={item.repository}
                className={`repository-overview-row evidence-${item.evidenceState.toLowerCase()}`}
              >
                <div className="repository-overview-primary">
                  <a
                    className="repository-overview-name"
                    href={`https://github.com/${item.repository}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortRepo(item.repository)}
                  </a>
                  <span className="repository-overview-state">{item.evidenceState}</span>
                </div>
                <dl className="repository-overview-facts">
                  <div>
                    <dt>Main</dt>
                    <dd>{shortSha(item.currentMain)}</dd>
                  </div>
                  <div>
                    <dt>Open PR</dt>
                    <dd>{item.openPrCount === null ? "UNKNOWN" : item.openPrCount}</dd>
                  </div>
                  <div>
                    <dt>Observed</dt>
                    <dd>{formatObservedAt(item.observedAt)}</dd>
                  </div>
                </dl>
                {onSelectRepository && (
                  <button
                    type="button"
                    className="repository-overview-detail-button"
                    onClick={() => onSelectRepository(item.repository)}
                    aria-expanded={selected}
                  >
                    {selected ? "詳細を更新" : "詳細を見る"}
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
        <p className="repository-overview-suppressed">
          {data.suppressedCount}件は現在のPUBLIC観測条件を満たさないため表示していません。
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
    return <p className="repository-overview-detail-status">詳細を確認しています。</p>;
  }
  if (!detail) {
    return (
      <p className="repository-overview-detail-status">
        現在、安全に表示できる詳細情報を取得できませんでした。
      </p>
    );
  }

  return (
    <div className="repository-overview-detail" data-testid="repository-overview-detail">
      <p className="repository-overview-detail-meta">
        Detail epoch: {detail.epochId.slice(-12)}
      </p>
      {detail.openPullRequests === null && (
        <p className="repository-overview-detail-status">Open PR detail: UNKNOWN</p>
      )}
      {detail.openPullRequests?.length === 0 && (
        <p className="repository-overview-detail-status">Open PR: 0</p>
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
