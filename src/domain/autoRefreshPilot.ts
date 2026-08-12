/**
 * AUTO-REFRESH-PILOT-V1 orchestration helpers.
 *
 * Manual/explicit pilot only. No scheduler. No Ready/Merge.
 * Uses AUTO-REFRESH-V1 eligibility contract; does not invent policy.
 */

import type { AutoRefreshNextAction, AutoRefreshReport } from "./autoRefreshContract";

export const AUTO_REFRESH_PILOT = "AUTO-REFRESH-PILOT-V1" as const;

export type PilotEligibility =
  | "REFRESH_ELIGIBLE"
  | "REFRESH_NOT_REQUIRED"
  | "UNKNOWN"
  | "HOLD";

export type MainRecheckResult = "MATCH" | "MOVED";

export type PilotPublicationDecision =
  | "PUBLISH_DRAFT"
  | "REUSED_EXISTING"
  | "ABORT_PUBLICATION"
  | "RE_EVALUATE_REQUIRED"
  | "NO_PUBLICATION"
  | "HOLD";

export function mapReportToPilotEligibility(report: AutoRefreshReport): PilotEligibility {
  if (report.status === "UNKNOWN" || report.nextAction === "UNKNOWN") return "UNKNOWN";
  if (report.status === "REFRESH_FAILED" || report.nextAction === "HOLD") return "HOLD";
  if (report.nextAction === "REUSE_EXISTING_DRAFT") return "REFRESH_ELIGIBLE";
  if (report.nextAction === "CREATE_DRAFT" && report.refreshRequired === true) {
    return "REFRESH_ELIGIBLE";
  }
  if (
    report.refreshRequired === false ||
    report.nextAction === "NO_REFRESH" ||
    report.nextAction === "SUPERSEDE_EXISTING" ||
    report.status === "CURRENT"
  ) {
    return "REFRESH_NOT_REQUIRED";
  }
  return "HOLD";
}

export function recheckMain(startMain: string, currentMain: string | null): MainRecheckResult {
  if (!currentMain || currentMain !== startMain) return "MOVED";
  return "MATCH";
}

export function decidePilotPublication(input: {
  eligibility: PilotEligibility;
  nextAction: AutoRefreshNextAction;
  mainRecheck: MainRecheckResult;
  verificationPassed: boolean;
  materialSnapshotDiff: boolean | null;
}): { decision: PilotPublicationDecision; reason: string } {
  if (input.mainRecheck === "MOVED") {
    return {
      decision: "ABORT_PUBLICATION",
      reason: "main moved before publication; RE_EVALUATE_REQUIRED",
    };
  }

  if (!input.verificationPassed) {
    return {
      decision: "HOLD",
      reason: "verification failed; no Draft PR",
    };
  }

  if (input.nextAction === "REUSE_EXISTING_DRAFT") {
    return {
      decision: "REUSED_EXISTING",
      reason: "equivalent refresh identity Draft/Ready already open",
    };
  }

  if (input.eligibility !== "REFRESH_ELIGIBLE" || input.nextAction !== "CREATE_DRAFT") {
    return {
      decision: "NO_PUBLICATION",
      reason: `not eligible for Draft publication (eligibility=${input.eligibility}, nextAction=${input.nextAction})`,
    };
  }

  if (input.materialSnapshotDiff === false) {
    return {
      decision: "NO_PUBLICATION",
      reason: "no material Snapshot diff after regeneration",
    };
  }

  return {
    decision: "PUBLISH_DRAFT",
    reason: "eligibility confirmed, verification passed, main unchanged, no equivalent Draft",
  };
}

/** Marker embedded in Draft PR bodies for idempotency lookups. */
export function formatRefreshIdentityMarker(refreshIdentity: string): string {
  return `refreshIdentity: \`${refreshIdentity}\``;
}

export function parseRefreshIdentityFromBody(body: string | null | undefined): string | null {
  if (!body) return null;
  const match = body.match(/refreshIdentity:\s*`([^`]+)`/);
  return match?.[1] ?? null;
}
