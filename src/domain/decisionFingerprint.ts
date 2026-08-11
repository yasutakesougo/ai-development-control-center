import type { HumanAction } from "./humanAction";
import type { ObservedFacts, ObservedPullRequest } from "./observedFacts";

/**
 * Canonical decision-target facts for the Approval Ledger.
 *
 * The fingerprint covers only the facts the Human decision is about.
 * It MUST exclude: observedAt, approver identity, recordedAt, recordId,
 * idempotencyKey and any UI state (see docs/mvp-3-approval-ledger-contract-v1.md §5).
 */
export interface DecisionEvidenceFacts {
  pr: number;
  draft: boolean;
  ci: string;
  review: string;
  mergeState: string;
  humanDecision: string;
  humanDecisionRequired: boolean | null;
  sourceRefs: string[];
}

export interface DecisionFacts {
  repository: string;
  humanActionStatus: "ACTION_REQUIRED";
  evidenceState: "CONFIRMED";
  sourceRefs: string[];
  evidence: DecisionEvidenceFacts[];
}

/**
 * Derive the canonical decision facts for the current observation.
 * Returns null unless there is a recordable decision candidate
 * (ACTION_REQUIRED + CONFIRMED evidence + observed pull requests).
 */
export function buildDecisionFacts(
  facts: ObservedFacts,
  action: HumanAction,
): DecisionFacts | null {
  if (action.status !== "ACTION_REQUIRED") return null;
  if (facts.evidenceState !== "CONFIRMED") return null;
  if (facts.openPullRequests === null) return null;

  return {
    repository: facts.repository,
    humanActionStatus: "ACTION_REQUIRED",
    evidenceState: "CONFIRMED",
    sourceRefs: normalizeRefs(action.sourceRefs),
    evidence: facts.openPullRequests
      .map(toEvidenceFacts)
      .sort((a, b) => a.pr - b.pr),
  };
}

function toEvidenceFacts(pr: ObservedPullRequest): DecisionEvidenceFacts {
  return {
    pr: pr.number,
    draft: pr.draft,
    ci: pr.ci,
    review: pr.review,
    mergeState: pr.mergeState,
    humanDecision: pr.humanDecisionEvidence.state,
    humanDecisionRequired: pr.humanDecisionRequired,
    sourceRefs: normalizeRefs(pr.sourceRefs),
  };
}

/** Source refs carry no ordering semantics — sort + dedupe before hashing. */
function normalizeRefs(refs: string[]): string[] {
  return [...new Set(refs)].sort();
}

/**
 * Deterministic canonical JSON: recursively sorted object keys, arrays kept
 * in (already normalized) order, no whitespace.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

/** SHA-256 hex over deterministic canonical JSON of the decision facts. */
export async function computeDecisionFingerprint(facts: DecisionFacts): Promise<string> {
  const canonical = canonicalJson(facts);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RecordableDecision {
  facts: DecisionFacts;
  decisionFingerprint: string;
}

/**
 * Server-side computation of the current recordable decision candidate.
 * Null when there is nothing recordable — the browser never computes the
 * authoritative fingerprint.
 */
export async function computeRecordableDecision(
  observed: ObservedFacts,
  action: HumanAction,
): Promise<RecordableDecision | null> {
  const facts = buildDecisionFacts(observed, action);
  if (!facts) return null;
  return { facts, decisionFingerprint: await computeDecisionFingerprint(facts) };
}
