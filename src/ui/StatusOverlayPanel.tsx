/**
 * STATUS-OVERLAY-V1 read-only React panel.
 *
 * Renders a StatusOverlayDocument only. No observe/fetch/Date.now/mutation controls.
 */

import type { StatusOverlayDocument } from "../domain/statusOverlayContract";
import { buildStatusOverlayViewModel } from "./statusOverlayViewModel";

export interface StatusOverlayPanelProps {
  document: StatusOverlayDocument;
}

export function StatusOverlayPanel({ document }: StatusOverlayPanelProps) {
  const vm = buildStatusOverlayViewModel(document);

  return (
    <section
      className="status-overlay-card"
      data-testid="status-overlay-panel"
      aria-label="STATUS-OVERLAY"
    >
      <header className="status-overlay-header">
        <p className="eyebrow">STATUS-OVERLAY-V1</p>
        <h2>Repository status</h2>
        <p className="status-overlay-note">
          Read-only projection. Recommendations do not authorize mutation.
        </p>
      </header>

      <section className={`status-overlay-section tone-${vm.current.tone}`} data-section="CURRENT">
        <h3>CURRENT</h3>
        <dl>
          <div><dt>Repository</dt><dd>{vm.current.repository}</dd></div>
          <div><dt>Main</dt><dd>{vm.current.mainSha}</dd></div>
          <div><dt>observedAt</dt><dd>{vm.current.observedAt}</dd></div>
          <div>
            <dt>Snapshot</dt>
            <dd>
              <span className={`status-overlay-badge tone-${vm.current.tone}`}>
                {vm.current.snapshotLabel}
              </span>{" "}
              {vm.current.snapshotClassification}
            </dd>
          </div>
          <div><dt>Coverage</dt><dd>{vm.current.coverage}</dd></div>
        </dl>
      </section>

      <section className={`status-overlay-section tone-${vm.gate.tone}`} data-section="GATE">
        <h3>GATE</h3>
        <p>
          <span className={`status-overlay-badge tone-${vm.gate.tone}`}>{vm.gate.kind}</span>
          {" — "}
          {vm.gate.kindLabel}
        </p>
        <p className="status-overlay-summary">{vm.gate.summary}</p>
      </section>

      <section className={`status-overlay-section tone-${vm.next.tone}`} data-section="NEXT">
        <h3>NEXT</h3>
        <p>
          <span className={`status-overlay-badge tone-${vm.next.tone}`}>{vm.next.code}</span>
          {" / "}
          <span className={`status-overlay-badge tone-${vm.next.tone}`}>{vm.next.status}</span>
        </p>
        <p className="status-overlay-summary">{vm.next.summary}</p>
        {vm.next.targetPr != null && vm.next.targetPrUrl && (
          <p>
            Target PR:{" "}
            <a href={vm.next.targetPrUrl} rel="noreferrer">
              #{vm.next.targetPr}
            </a>
          </p>
        )}
        <p className="status-overlay-auth" data-testid="status-overlay-no-auth">
          authorizesMutation: false — {vm.next.authorizationNote}
        </p>
        {vm.next.secondaryContext.length > 0 && (
          <ul className="status-overlay-secondary">
            {vm.next.secondaryContext.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section
        className={`status-overlay-section tone-${vm.automation.tone}`}
        data-section="AUTOMATION"
      >
        <h3>AUTOMATION</h3>
        <dl>
          <div><dt>Enabled</dt><dd>{vm.automation.enabledLabel}</dd></div>
          <div><dt>Trigger</dt><dd>{vm.automation.trigger}</dd></div>
          <div><dt>Last run</dt><dd>{vm.automation.lastRunId}</dd></div>
          <div>
            <dt>Conclusion</dt>
            <dd>
              <span className={`status-overlay-badge tone-${vm.automation.tone}`}>
                {vm.automation.lastRunConclusion}
              </span>
            </dd>
          </div>
          <div><dt>Evaluation</dt><dd>{vm.automation.lastEvaluation}</dd></div>
          <div><dt>Publication</dt><dd>{vm.automation.lastPublicationOutcome}</dd></div>
          <div>
            <dt>Active refresh PR</dt>
            <dd>
              {vm.automation.activeRefreshPr != null && vm.automation.activeRefreshPrUrl ? (
                <a href={vm.automation.activeRefreshPrUrl} rel="noreferrer">
                  #{vm.automation.activeRefreshPr}
                </a>
              ) : (
                "none"
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className={`status-overlay-section tone-${vm.holds.tone}`} data-section="HOLDS">
        <h3>HOLDS</h3>
        {vm.holds.empty ? (
          <p className="status-overlay-empty">{vm.holds.emptyLabel}</p>
        ) : (
          <ul>
            {vm.holds.items.map((item) => (
              <li key={item}>
                <span className="status-overlay-badge tone-hold">HOLD</span> {item}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className={`status-overlay-section tone-${vm.unknowns.tone}`}
        data-section="UNKNOWNS"
      >
        <h3>UNKNOWNS</h3>
        {vm.unknowns.empty ? (
          <p className="status-overlay-empty">{vm.unknowns.emptyLabel}</p>
        ) : (
          <ul>
            {vm.unknowns.items.map((item) => (
              <li key={item}>
                <span className="status-overlay-badge tone-unknown">UNKNOWN</span> {item}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="status-overlay-section tone-neutral" data-section="PRS">
        <h3>PRS</h3>
        {vm.pullRequests.length === 0 ? (
          <p className="status-overlay-empty">none</p>
        ) : (
          <ul className="status-overlay-pr-list">
            {vm.pullRequests.map((pr) => (
              <li key={pr.number}>
                <a href={pr.url} rel="noreferrer">
                  #{pr.number}
                </a>{" "}
                <span className="status-overlay-badge tone-neutral">
                  {pr.draft ? "DRAFT" : "READY"}
                </span>{" "}
                <span className="status-overlay-badge tone-neutral">{pr.classification}</span>
                {pr.isActiveRefresh && (
                  <span className="status-overlay-badge tone-action">activeRefresh</span>
                )}{" "}
                {pr.title}
                <div className="status-overlay-pr-meta">
                  CI={pr.ciState} · Review={pr.reviewState}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
