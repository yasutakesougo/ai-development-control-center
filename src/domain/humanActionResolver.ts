import type { HumanAction } from "./humanAction";
import type { ObservedFacts, ObservedPullRequest } from "./observedFacts";

function unknown(reason: string, sourceRefs: string[] = []): HumanAction {
  return {
    status: "UNKNOWN",
    title: "判定できません",
    instruction: "安全のため判断を保留しています。",
    reason,
    sourceRefs,
  };
}

export function resolveHumanAction(facts: ObservedFacts): HumanAction {
  if (facts.evidenceState === "ERROR") {
    return unknown("GitHubの状態取得に失敗しました。", facts.sourceRefs);
  }

  if (facts.evidenceState === "MISSING") {
    return unknown("Human Action判定に必要な証拠が不足しています。", facts.sourceRefs);
  }

  if (facts.evidenceState === "CONTRADICTORY") {
    return unknown("観測した証拠に矛盾があります。", facts.sourceRefs);
  }

  if (!facts.currentMain || facts.openPullRequests === null) {
    return unknown("repository stateを確定できません。", facts.sourceRefs);
  }

  if (facts.openPullRequests.length === 0) {
    return {
      status: "NO_ACTION",
      title: "ありません",
      instruction: "今はHumanが行う作業はありません。",
      reason: "Open PRがありません。",
      sourceRefs: facts.sourceRefs,
    };
  }

  const pending = facts.openPullRequests.find((pr) => pr.ci === "PENDING" || pr.review === "PENDING");
  if (pending) {
    return {
      status: "WAIT",
      title: "待っています",
      instruction: `PR #${pending.number} のCIまたはReview完了を待っています。`,
      reason: "Human判断の前提となる確認が完了していません。",
      sourceRefs: pending.sourceRefs,
    };
  }

  const unresolved = facts.openPullRequests.find(hasUnknownEvidence);
  if (unresolved) {
    return unknown(`PR #${unresolved.number} の判定規則に必要な情報を確定できません。`, unresolved.sourceRefs);
  }

  const actionable = facts.openPullRequests.find(
    (pr) => pr.humanDecisionRequired === true && pr.ci === "PASS" && pr.review === "PASS",
  );

  if (actionable) {
    return {
      status: "ACTION_REQUIRED",
      title: `PR #${actionable.number} の判断が必要です`,
      instruction: "PRの内容を確認し、次のHuman Decisionを行ってください。",
      reason: "CIとReviewが完了し、明示的にHuman Decision待ちと確認されています。",
      sourceRefs: actionable.sourceRefs,
    };
  }

  if (facts.openPullRequests.every((pr) => pr.humanDecisionRequired === false)) {
    return {
      status: "NO_ACTION",
      title: "ありません",
      instruction: "今はHumanが行う作業はありません。",
      reason: "観測したOpen PRにはHuman Decision待ちがありません。",
      sourceRefs: facts.sourceRefs,
    };
  }

  return unknown("現在のObserved Factsに適用できるHuman Action ruleがありません。", facts.sourceRefs);
}

function hasUnknownEvidence(pr: ObservedPullRequest): boolean {
  return (
    pr.ci === "UNKNOWN" ||
    pr.review === "UNKNOWN" ||
    pr.mergeState === "UNKNOWN" ||
    pr.humanDecisionRequired === null
  );
}
