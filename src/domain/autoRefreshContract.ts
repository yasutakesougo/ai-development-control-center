/**
 * AUTO-REFRESH-V1 design contract helpers.
 *
 * DESIGNED · NOT IMPLEMENTED · NO EXECUTION PATH
 *
 * Pure eligibility / anti-loop / identity logic only.
 * Does not create branches, PRs, deploy, write the Ledger, or invoke Action Gateway / Agents.
 */

import { isArchitectureRelevantPath } from "./handoffEvaluator";
import type { SnapshotStaleClassification } from "./handoffReport";

export const AUTO_REFRESH_SCHEMA_VERSION = "1.0" as const;
export const AUTO_REFRESH_DESIGN = "AUTO-REFRESH-DESIGN-V1" as const;

/** Snapshot generator id used in refresh identity (matches ARCH-SNAPSHOT-GEN-V1). */
export const SNAPSHOT_GENERATOR_VERSION = "ARCH-SNAPSHOT-GEN-V1" as const;

/**
 * Generated Architecture Snapshot artifacts.
 * Changes to these paths alone must never make a refresh eligible (anti-loop).
 */
export const GENERATED_ARCHITECTURE_ARTIFACTS = [
  "docs/architecture/architecture.json",
  "docs/architecture/architecture.html",
] as const;

export type AutoRefreshStatus =
  | "CURRENT"
  | "REFRESH_ELIGIBLE"
  | "REFRESH_IN_PROGRESS"
  | "REFRESH_DRAFT_OPEN"
  | "REFRESH_FAILED"
  | "UNKNOWN";

/** Maintenance next-action only — never Approval Ledger HumanAction. */
export type AutoRefreshNextAction =
  | "NO_REFRESH"
  | "CREATE_DRAFT"
  | "REUSE_EXISTING_DRAFT"
  | "SUPERSEDE_EXISTING"
  | "HOLD"
  | "UNKNOWN";

export type RefreshPrState = "DRAFT" | "READY" | "CLOSED" | "MERGED";

export interface ExistingRefreshPr {
  number: number;
  refreshIdentity: string;
  state: RefreshPrState;
  /** Main tip the Draft claimed to target when opened. */
  targetMainSha: string;
}

export interface AutoRefreshVerification {
  architectureSnapshot: "PASS" | "FAIL" | "NOT_RUN";
  handoff: "PASS" | "FAIL" | "NOT_RUN";
  verify: "PASS" | "FAIL" | "NOT_RUN";
  notes?: string[];
}

export interface AutoRefreshReport {
  schemaVersion: typeof AUTO_REFRESH_SCHEMA_VERSION;
  design: typeof AUTO_REFRESH_DESIGN;
  implementation: "NOT_IMPLEMENTED";
  repository: string;
  observedMain: string | null;
  snapshotGeneratedFrom: string | null;
  generatorVersion: string;
  changedPaths: string[];
  architectureRelevantPaths: string[];
  /** Source-only architecture paths after excluding generated artifacts. */
  sourceArchitectureRelevantPaths: string[];
  refreshRequired: boolean | null;
  refreshIdentity: string | null;
  status: AutoRefreshStatus;
  reason: string;
  verification: AutoRefreshVerification;
  existingRefreshPr: ExistingRefreshPr | null;
  nextAction: AutoRefreshNextAction;
  /** Explicitly non-business: never maps stale Snapshot to approval ACTION_REQUIRED. */
  approvalActionRequired: false;
  handoffStaleClassification: SnapshotStaleClassification | null;
  evaluatedAt: string;
}

export interface EvaluateAutoRefreshInput {
  repository: string;
  observedMain: string | null;
  snapshotGeneratedFrom: string | null;
  /**
   * Paths changed between generatedFrom and observedMain.
   * null = cannot determine safely.
   */
  changedPaths: string[] | null;
  generatorVersion?: string;
  existingRefreshPrs?: ExistingRefreshPr[] | null;
  /**
   * When true, observation of existing refresh PRs failed.
   * Fail closed if a publish decision would otherwise be made.
   */
  existingPrObservationFailed?: boolean;
  verification?: AutoRefreshVerification;
  /**
   * Optional HANDOFF stale classification for correlation only.
   * Must not drive Approval Ledger ACTION_REQUIRED.
   */
  handoffStaleClassification?: SnapshotStaleClassification | null;
  /**
   * After a successful regenerate, whether the Snapshot material projection changed
   * (generatedAt ignored). null = not evaluated yet.
   */
  materialSnapshotDiff?: boolean | null;
  /** Observed main moved after generation started (Case A). */
  mainMovedDuringRefreshTo?: string | null;
  evaluatedAt?: string;
}

export function isGeneratedArchitectureArtifact(path: string): boolean {
  return (GENERATED_ARCHITECTURE_ARTIFACTS as readonly string[]).includes(path);
}

/**
 * Architecture-relevant source paths that may trigger refresh.
 * Generated Snapshot artifacts are excluded even if listed elsewhere.
 */
export function filterSourceArchitectureRelevantPaths(changedPaths: string[]): string[] {
  return changedPaths
    .filter((path) => isArchitectureRelevantPath(path))
    .filter((path) => !isGeneratedArchitectureArtifact(path));
}

export function buildRefreshIdentity(input: {
  repository: string;
  snapshotGeneratedFrom: string;
  targetMainSha: string;
  generatorVersion?: string;
}): string {
  const generatorVersion = input.generatorVersion ?? SNAPSHOT_GENERATOR_VERSION;
  return [
    input.repository,
    input.snapshotGeneratedFrom,
    input.targetMainSha,
    generatorVersion,
  ].join("::");
}

export function hasMaterialSnapshotDiff(
  before: unknown,
  after: unknown,
): boolean {
  return stableSnapshotProjection(before) !== stableSnapshotProjection(after);
}

function stableSnapshotProjection(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const clone = structuredClone(value) as Record<string, unknown>;
  const generatedFrom = clone.generatedFrom;
  if (generatedFrom && typeof generatedFrom === "object") {
    const gf = { ...(generatedFrom as Record<string, unknown>) };
    delete gf.generatedAt;
    clone.generatedFrom = gf;
  }
  return JSON.stringify(clone);
}

function findMatchingPr(
  identity: string,
  existing: ExistingRefreshPr[] | null | undefined,
): ExistingRefreshPr | null {
  if (!existing) return null;
  return existing.find((pr) => pr.refreshIdentity === identity) ?? null;
}

/**
 * Pure AUTO-REFRESH-V1 eligibility evaluator.
 * Never authorizes Ready/Merge/Ledger/Gateway/Agent.
 */
export function evaluateAutoRefresh(input: EvaluateAutoRefreshInput): AutoRefreshReport {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const generatorVersion = input.generatorVersion ?? SNAPSHOT_GENERATOR_VERSION;
  const verification: AutoRefreshVerification = input.verification ?? {
    architectureSnapshot: "NOT_RUN",
    handoff: "NOT_RUN",
    verify: "NOT_RUN",
  };

  const base = {
    schemaVersion: AUTO_REFRESH_SCHEMA_VERSION,
    design: AUTO_REFRESH_DESIGN,
    implementation: "NOT_IMPLEMENTED" as const,
    repository: input.repository,
    observedMain: input.observedMain,
    snapshotGeneratedFrom: input.snapshotGeneratedFrom,
    generatorVersion,
    changedPaths: input.changedPaths ?? [],
    architectureRelevantPaths: [],
    sourceArchitectureRelevantPaths: [],
    refreshRequired: null as boolean | null,
    refreshIdentity: null as string | null,
    verification,
    existingRefreshPr: null as ExistingRefreshPr | null,
    approvalActionRequired: false as const,
    handoffStaleClassification: input.handoffStaleClassification ?? null,
    evaluatedAt,
  };

  if (!input.observedMain) {
    return {
      ...base,
      status: "UNKNOWN",
      reason: "current main SHA is unavailable; fail closed",
      nextAction: "UNKNOWN",
    };
  }

  if (!input.snapshotGeneratedFrom) {
    return {
      ...base,
      status: "UNKNOWN",
      reason: "snapshot generatedFrom.commit is unavailable; fail closed",
      nextAction: "UNKNOWN",
    };
  }

  if (input.changedPaths === null) {
    return {
      ...base,
      status: "UNKNOWN",
      reason:
        "changed-path set between generatedFrom and main could not be determined safely; fail closed",
      nextAction: "UNKNOWN",
    };
  }

  const architectureRelevantPaths = input.changedPaths.filter(isArchitectureRelevantPath);
  const sourceArchitectureRelevantPaths = filterSourceArchitectureRelevantPaths(
    input.changedPaths,
  );

  const withPaths = {
    ...base,
    architectureRelevantPaths,
    sourceArchitectureRelevantPaths,
  };

  if (input.observedMain === input.snapshotGeneratedFrom) {
    return {
      ...withPaths,
      refreshRequired: false,
      status: "CURRENT",
      reason: "generatedFrom.commit equals observed main",
      nextAction: "NO_REFRESH",
    };
  }

  // Anti-loop: generated artifacts alone never trigger refresh.
  if (sourceArchitectureRelevantPaths.length === 0) {
    return {
      ...withPaths,
      refreshRequired: false,
      status: "CURRENT",
      reason:
        "no source architecture-relevant paths changed (generated artifacts alone do not trigger refresh)",
      nextAction: "NO_REFRESH",
    };
  }

  // Case A: main moved after generation started against a prior tip.
  if (
    input.mainMovedDuringRefreshTo &&
    input.mainMovedDuringRefreshTo !== input.observedMain
  ) {
    return {
      ...withPaths,
      refreshRequired: null,
      status: "UNKNOWN",
      reason: `main moved during refresh (observed ${input.observedMain} → ${input.mainMovedDuringRefreshTo}); re-observe and regenerate; do not publish A-targeted artifacts as B`,
      nextAction: "HOLD",
    };
  }

  const refreshIdentity = buildRefreshIdentity({
    repository: input.repository,
    snapshotGeneratedFrom: input.snapshotGeneratedFrom,
    targetMainSha: input.observedMain,
    generatorVersion,
  });

  if (input.existingPrObservationFailed) {
    return {
      ...withPaths,
      refreshRequired: true,
      refreshIdentity,
      status: "UNKNOWN",
      reason: "existing refresh PR observation failed; fail closed before publish",
      nextAction: "UNKNOWN",
    };
  }

  const matching = findMatchingPr(refreshIdentity, input.existingRefreshPrs);
  if (matching && (matching.state === "DRAFT" || matching.state === "READY")) {
    return {
      ...withPaths,
      refreshRequired: true,
      refreshIdentity,
      status: "REFRESH_DRAFT_OPEN",
      reason: `equivalent refresh PR #${matching.number} already exists (${matching.state})`,
      existingRefreshPr: matching,
      nextAction: "REUSE_EXISTING_DRAFT",
    };
  }

  // Case B: open Draft targets a different main tip → superseded candidate.
  const superseded = (input.existingRefreshPrs ?? []).find(
    (pr) =>
      (pr.state === "DRAFT" || pr.state === "READY") &&
      pr.targetMainSha !== input.observedMain,
  );
  if (superseded) {
    // Still eligible for a new identity; do not Ready/Merge the old Draft.
    const verificationFailed =
      verification.architectureSnapshot === "FAIL" ||
      verification.handoff === "FAIL" ||
      verification.verify === "FAIL";

    if (verificationFailed) {
      return {
        ...withPaths,
        refreshRequired: true,
        refreshIdentity,
        status: "REFRESH_FAILED",
        reason: `verification failed while prior PR #${superseded.number} is superseded by main movement`,
        existingRefreshPr: superseded,
        nextAction: "HOLD",
      };
    }

    if (input.materialSnapshotDiff === false) {
      return {
        ...withPaths,
        refreshRequired: false,
        refreshIdentity,
        status: "CURRENT",
        reason: `prior PR #${superseded.number} superseded; regenerated Snapshot has no material diff`,
        existingRefreshPr: superseded,
        nextAction: "SUPERSEDE_EXISTING",
      };
    }

    return {
      ...withPaths,
      refreshRequired: true,
      refreshIdentity,
      status: "REFRESH_ELIGIBLE",
      reason: `prior refresh PR #${superseded.number} targets ${superseded.targetMainSha}; main is now ${input.observedMain} — classify prior Draft as superseded; new identity may CREATE_DRAFT`,
      existingRefreshPr: superseded,
      nextAction: "CREATE_DRAFT",
    };
  }

  const verificationFailed =
    verification.architectureSnapshot === "FAIL" ||
    verification.handoff === "FAIL" ||
    verification.verify === "FAIL";

  if (verificationFailed) {
    return {
      ...withPaths,
      refreshRequired: true,
      refreshIdentity,
      status: "REFRESH_FAILED",
      reason: "required verification failed; no Draft PR",
      nextAction: "HOLD",
    };
  }

  if (input.materialSnapshotDiff === false) {
    return {
      ...withPaths,
      refreshRequired: false,
      refreshIdentity,
      status: "CURRENT",
      reason: "source architecture impact present but regenerated Snapshot has no material diff",
      nextAction: "NO_REFRESH",
    };
  }

  // Eligibility proven. CREATE_DRAFT is design intent only — no runner executes it here.
  return {
    ...withPaths,
    refreshRequired: true,
    refreshIdentity,
    status: "REFRESH_ELIGIBLE",
    reason: "source architecture-relevant paths changed since generatedFrom; Draft PR allowed only after verification in a future implementation",
    nextAction: "CREATE_DRAFT",
  };
}

/** Stable projection for tests (strips volatile evaluatedAt). */
export function stableAutoRefreshProjection(report: AutoRefreshReport): unknown {
  const { evaluatedAt: _evaluatedAt, ...rest } = report;
  return rest;
}
