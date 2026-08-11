import {
  approvalIntentLabel,
  type ApprovalIntent,
  type ApprovalIntentDraft,
} from "../domain/approvalIntent";
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

type Props = {
  action: HumanAction;
  observedAt: string;
  evidence: PrEvidence[] | null;
  draft: ApprovalIntentDraft | null;
  onSelect: (intent: ApprovalIntent) => void;
};

const CHOICES: ApprovalIntent[] = ["APPROVE", "REJECT", "DEFER"];

/**
 * Presentation-only Approval Intent controls.
 * Selection stays in React memory and never submits externally.
 */
export function ApprovalIntentPanel({
  action,
  observedAt,
  evidence,
  draft,
  onSelect,
}: Props) {
  return (
    <section className="approval-intent-card" aria-label="Approval Intent local draft">
      <h2>Approval Intent（案）</h2>
      <p className="approval-intent-note">
        これは実際の承認ではありません。選択は端末上の一時案のみで、外部へ送信・保存されません。
      </p>

      <dl className="approval-intent-evidence">
        <div>
          <dt>Human Action</dt>
          <dd>{action.status}</dd>
        </div>
        <div>
          <dt>Title</dt>
          <dd>{action.title}</dd>
        </div>
        <div>
          <dt>Instruction</dt>
          <dd>{action.instruction}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{action.reason}</dd>
        </div>
        <div>
          <dt>observedAt</dt>
          <dd>{observedAt}</dd>
        </div>
      </dl>

      {action.sourceRefs.length > 0 && (
        <>
          <h3>sourceRefs</h3>
          <ul>
            {action.sourceRefs.map((ref) => (
              <li key={ref}>{ref}</li>
            ))}
          </ul>
        </>
      )}

      <h3>Observed evidence trace</h3>
      {evidence && evidence.length > 0 ? (
        <ul>
          {evidence.map((item) => (
            <li key={item.pr}>
              <strong>PR #{item.pr}</strong>
              {" — "}
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
      ) : (
        <p>evidence trace はありません。</p>
      )}

      <div className="approval-intent-choices" role="group" aria-label="Approval Intent choices">
        {CHOICES.map((intent) => (
          <button
            key={intent}
            type="button"
            className={draft?.intent === intent ? "selected" : undefined}
            onClick={() => onSelect(intent)}
          >
            {approvalIntentLabel(intent)}
          </button>
        ))}
      </div>

      {draft && (
        <div className="approval-intent-draft" role="status">
          <p>
            選択中の案: <strong>{approvalIntentLabel(draft.intent)}</strong>
          </p>
          <p>LOCAL DRAFT</p>
          <p>NOT SUBMITTED</p>
          <p>外部システムには反映されていません</p>
        </div>
      )}
    </section>
  );
}
