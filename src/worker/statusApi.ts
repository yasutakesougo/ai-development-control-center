import { computeRecordableDecision } from "../domain/decisionFingerprint";
import type { HumanAction } from "../domain/humanAction";
import type { ObservedFacts } from "../domain/observedFacts";

/**
 * Server-computed status payload.
 *
 * `decisionFingerprint` is present when and only when there is a recordable
 * decision candidate (ACTION_REQUIRED + CONFIRMED). The browser never computes
 * the authoritative fingerprint.
 */
export async function buildStatusPayload(
  facts: ObservedFacts,
  action: HumanAction,
): Promise<Record<string, unknown>> {
  const decision = await computeRecordableDecision(facts, action);

  return {
    action,
    developmentStatus: {
      repository: facts.repository,
      main: facts.currentMain ? "Observed" : "Unknown",
      openPrCount: facts.openPullRequestCount,
      evidenceState: facts.evidenceState,
      observedPullRequestCount: facts.observedPullRequestCount,
      omittedPullRequestCount: facts.omittedPullRequestCount,
      observationBudget: facts.observationBudget,
      warnings: facts.warnings,
      fleetCompleteness: facts.fleetCompleteness ?? null,
      gateCompleteness: facts.gateCompleteness ?? null,
    },
    evidence:
      facts.openPullRequests?.map((pr) => ({
        pr: pr.number,
        headSha: pr.headSha ?? null,
        gateCandidate: pr.gateCandidate ?? false,
        draft: pr.draft,
        ci: pr.ci,
        review: pr.review,
        mergeState: pr.mergeState,
        humanDecision: pr.humanDecisionEvidence.state,
        humanDecisionSource: pr.humanDecisionEvidence.source,
        sourceRefs: pr.sourceRefs,
      })) ?? null,
    observedAt: facts.observedAt,
    ...(decision ? { decisionFingerprint: decision.decisionFingerprint } : {}),
  };
}
