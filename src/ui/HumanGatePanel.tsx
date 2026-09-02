import {
  buildHumanGateViewModel,
  type HumanGateSourceAvailability,
  type HumanGateStatusSource,
} from "./humanGateViewModel";

export interface HumanGatePanelProps {
  availability: HumanGateSourceAvailability;
  source: HumanGateStatusSource | null;
}

export function HumanGatePanel({ availability, source }: HumanGatePanelProps) {
  const view = buildHumanGateViewModel(availability, source);

  return (
    <section className="human-gate-crt" data-testid="human-gate-crt">
      <div className="human-gate-crt-header">
        <div>
          <p className="human-gate-crt-kicker">[ HUMAN GATE ]</p>
          <h2>{view.title}</h2>
        </div>
        <p className="human-gate-crt-boundary">DISPLAY ONLY / NO EXECUTION AUTHORITY</p>
      </div>

      <dl className="human-gate-crt-axes">
        <div><dt>ACTION</dt><dd>{view.status}</dd></div>
        <div><dt>EVIDENCE</dt><dd>{view.evidenceState}</dd></div>
        <div><dt>DECISION</dt><dd>{view.decisionCandidate}</dd></div>
        <div><dt>SOURCE</dt><dd>{view.sourceAvailability}</dd></div>
        <div><dt>OBSERVED</dt><dd>{view.observedAt ?? "—"}</dd></div>
      </dl>

      <div className="human-gate-crt-block">
        <h3>NEXT HUMAN ACTION</h3>
        <p>{view.instruction}</p>
      </div>

      <div className="human-gate-crt-block">
        <h3>REASON</h3>
        <p>{view.reason}</p>
      </div>

      <div className="human-gate-crt-block">
        <h3>SOURCE REFS</h3>
        {view.sourceRefs.length > 0 ? (
          <ul>
            {view.sourceRefs.map((ref) => <li key={ref}>{ref}</li>)}
          </ul>
        ) : (
          <p>—</p>
        )}
      </div>
    </section>
  );
}
