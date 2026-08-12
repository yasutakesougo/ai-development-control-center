import type { ArchitectureSnapshot, SnapshotFact } from "./architectureSnapshot";
import type {
  HandoffFact,
  HandoffLiveState,
  HandoffNextAction,
  HandoffReport,
  LiveDifference,
  SnapshotStaleClassification,
} from "./handoffReport";

export const HANDOFF_SCHEMA_VERSION = "1.0" as const;
export const HANDOFF_EVALUATOR = "HANDOFF-EVAL-V1";

/**
 * Paths considered architecture-relevant for HANDOFF-V1 staleness impact.
 * Derived from architecture.json staleIndicators responsibilities.
 */
export const ARCHITECTURE_RELEVANT_PATH_PREFIXES = [
  "src/worker/",
  "migrations/",
  "scripts/generate-architecture-snapshot.mjs",
] as const;

export const ARCHITECTURE_RELEVANT_EXACT_PATHS = [
  "wrangler.jsonc",
  "package.json",
  "scripts/generate-architecture-snapshot.mjs",
] as const;

export interface EvaluateHandoffInput {
  snapshot: ArchitectureSnapshot;
  /** Independent observation of current main SHA (git or GitHub). */
  currentMain: string | null;
  /**
   * Paths changed between snapshot.generatedFrom.commit and currentMain.
   * null = unable to determine safely (git unavailable / range invalid).
   */
  changedPaths: string[] | null;
  /** Read-only live GitHub state for this repository. null = observation failed. */
  live: HandoffLiveState | null;
  evaluatedAt?: string;
  repository?: string;
}

function toFact(entry: SnapshotFact): HandoffFact {
  return {
    id: entry.id,
    name: entry.name,
    status: entry.status,
    responsibility: entry.responsibility,
    evidence: [...(entry.evidence ?? [])],
  };
}

export function isArchitectureRelevantPath(path: string): boolean {
  if (ARCHITECTURE_RELEVANT_EXACT_PATHS.includes(path as (typeof ARCHITECTURE_RELEVANT_EXACT_PATHS)[number])) {
    return true;
  }
  return ARCHITECTURE_RELEVANT_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

export function classifySnapshotStaleness(input: {
  generatedFrom: string;
  currentMain: string | null;
  changedPaths: string[] | null;
}): {
  stale: boolean | null;
  classification: SnapshotStaleClassification;
  staleReasons: string[];
  architectureRelevantPaths: string[];
} {
  const { generatedFrom, currentMain, changedPaths } = input;

  if (!currentMain) {
    return {
      stale: null,
      classification: "UNKNOWN",
      staleReasons: ["current main SHA is unavailable; cannot compare to generatedFrom.commit"],
      architectureRelevantPaths: [],
    };
  }

  if (generatedFrom === currentMain) {
    return {
      stale: false,
      classification: "current",
      staleReasons: [],
      architectureRelevantPaths: [],
    };
  }

  if (changedPaths === null) {
    return {
      stale: null,
      classification: "UNKNOWN",
      staleReasons: [
        `generatedFrom.commit (${generatedFrom}) differs from currentMain (${currentMain}) but the changed-path set could not be determined safely`,
      ],
      architectureRelevantPaths: [],
    };
  }

  const architectureRelevantPaths = changedPaths.filter(isArchitectureRelevantPath);
  if (architectureRelevantPaths.length > 0) {
    return {
      stale: true,
      classification: "stale_architecture_affecting",
      staleReasons: [
        `generatedFrom.commit (${generatedFrom}) differs from currentMain (${currentMain})`,
        "architecture-relevant paths changed since the snapshot source commit",
      ],
      architectureRelevantPaths,
    };
  }

  return {
    stale: true,
    classification: "stale_no_architecture_impact",
    staleReasons: [
      `generatedFrom.commit (${generatedFrom}) differs from currentMain (${currentMain})`,
      "changed paths since the snapshot source commit are not architecture-relevant per staleIndicators",
    ],
    architectureRelevantPaths: [],
  };
}

function collectConfirmed(snapshot: ArchitectureSnapshot): HandoffFact[] {
  const collections = [
    snapshot.components,
    snapshot.dependencies,
    snapshot.flows,
    snapshot.externalSystems,
    snapshot.decisions,
    snapshot.staleIndicators,
  ];
  return collections
    .flat()
    .filter((entry) => entry.status === "confirmed")
    .map(toFact);
}

function buildForbiddenCapabilities(snapshot: ArchitectureSnapshot): HandoffFact[] {
  const fromUnknowns = snapshot.unknowns.map(toFact);
  const fromHolds = snapshot.holds
    .filter((hold) => hold.id === "hold-execution")
    .map(toFact);

  const explicit: HandoffFact[] = [
    {
      id: "forbid-github-mutation",
      name: "GitHub mutation",
      status: "confirmed",
      responsibility:
        "HANDOFF-V1 is read-only toward GitHub: no Issue/PR/Ready/Merge/branch mutation is authorized.",
      evidence: ["src/domain/handoffEvaluator.ts", "src/worker/github/readOnlyAdapter.ts"],
    },
    {
      id: "forbid-cloudflare-mutation",
      name: "Cloudflare mutation",
      status: "confirmed",
      responsibility: "HANDOFF-V1 does not deploy, mutate Access policy, or change Cloudflare bindings.",
      evidence: ["src/domain/handoffEvaluator.ts"],
    },
    {
      id: "forbid-ledger-write",
      name: "Approval Ledger write",
      status: "confirmed",
      responsibility: "HANDOFF-V1 does not record Approval Ledger decisions.",
      evidence: ["src/domain/handoffEvaluator.ts", "src/worker/ledger/recordsApi.ts"],
    },
    {
      id: "forbid-action-gateway",
      name: "Action Gateway invocation",
      status: "unknown",
      responsibility: "No Action Gateway contract or invocation path is authorized.",
      evidence: snapshot.unknowns.find((item) => item.id === "unknown-action-gateway")?.evidence ?? [
        "src/worker/index.ts",
      ],
    },
    {
      id: "forbid-agent-execution",
      name: "Agent execution",
      status: "unknown",
      responsibility: "No Agent execution path from Ledger or HANDOFF is authorized.",
      evidence: snapshot.unknowns.find((item) => item.id === "unknown-agent-execution")?.evidence ?? [
        "src/worker/ledger/ledgerStore.ts",
      ],
    },
  ];

  // Prefer explicit forbidden list; still surface snapshot unknowns that are capability gaps.
  const seen = new Set(explicit.map((item) => item.id));
  for (const item of [...fromUnknowns, ...fromHolds]) {
    if (!seen.has(item.id)) {
      explicit.push(item);
      seen.add(item.id);
    }
  }
  return explicit;
}

function buildLiveDifferences(input: {
  generatedFrom: string;
  currentMain: string | null;
  changedPaths: string[] | null;
  live: HandoffLiveState | null;
  classification: SnapshotStaleClassification;
}): LiveDifference[] {
  const differences: LiveDifference[] = [];
  const { generatedFrom, currentMain, changedPaths, live, classification } = input;

  if (currentMain && generatedFrom !== currentMain) {
    differences.push({
      id: "diff-main-sha",
      summary: `Snapshot source commit differs from current main (${generatedFrom} → ${currentMain}).`,
      evidence: ["docs/architecture/architecture.json", "git:rev-parse:main"],
    });
  }

  if (classification === "stale_architecture_affecting" && changedPaths) {
    differences.push({
      id: "diff-architecture-paths",
      summary: "Architecture-relevant paths changed since the snapshot source commit.",
      evidence: changedPaths.filter(isArchitectureRelevantPath),
    });
  }

  if (classification === "stale_no_architecture_impact" && changedPaths) {
    differences.push({
      id: "diff-non-architecture-paths",
      summary: "Paths changed since the snapshot source commit, but none are architecture-relevant.",
      evidence: changedPaths,
    });
  }

  if (!live || live.evidenceState !== "CONFIRMED" || live.openPullRequests === null) {
    differences.push({
      id: "diff-live-unavailable",
      summary: "Live GitHub open-PR observation is unavailable or incomplete.",
      evidence: live?.errors?.length ? live.errors : live?.sourceRefs ?? ["handoff:live"],
    });
    return differences;
  }

  if (live.openPullRequests.length === 0) {
    differences.push({
      id: "diff-no-open-prs",
      summary: "No open pull requests observed on the control-center repository.",
      evidence: live.sourceRefs,
    });
  } else {
    for (const pull of live.openPullRequests) {
      differences.push({
        id: `diff-pr-${pull.number}`,
        summary: `Open PR #${pull.number} (${pull.draft ? "Draft" : "Ready"}): ${pull.title} [decision=${pull.humanDecisionState}, ci=${pull.ci}, review=${pull.review}].`,
        evidence: [`github:pr:${pull.number}`],
      });
    }
  }

  return differences;
}

/**
 * Fail-closed next-action rule for HANDOFF-V1.
 *
 * ACTION_REQUIRED only when an open PR has an explicit Human-Decision: REQUIRED
 * marker AND CI/Review are confirmed PASS. Ordinary open/Draft PRs never become
 * ACTION_REQUIRED by themselves.
 */
export function resolveHandoffNextAction(live: HandoffLiveState | null): HandoffNextAction {
  if (!live) {
    return {
      status: "UNKNOWN",
      description: "Live GitHub observation was not available; next action cannot be proven.",
      evidence: ["handoff:live"],
    };
  }

  if (live.evidenceState === "ERROR" || live.evidenceState === "MISSING") {
    return {
      status: "UNKNOWN",
      description: "Live GitHub evidence is ERROR or MISSING; fail closed.",
      evidence: live.errors.length > 0 ? live.errors : live.sourceRefs,
    };
  }

  if (live.currentMain === null || live.openPullRequests === null) {
    return {
      status: "UNKNOWN",
      description: "Current main or open PR list could not be confirmed.",
      evidence: live.sourceRefs,
    };
  }

  const contradictory = live.openPullRequests.find((pull) => pull.humanDecisionState === "CONTRADICTORY");
  if (contradictory) {
    return {
      status: "UNKNOWN",
      description: `PR #${contradictory.number} has contradictory Human-Decision markers; fail closed.`,
      evidence: [`github:pr:${contradictory.number}`],
    };
  }

  const actionable = live.openPullRequests.find(
    (pull) =>
      pull.humanDecisionState === "REQUIRED" &&
      pull.humanDecisionRequired === true &&
      pull.ci === "PASS" &&
      pull.review === "PASS",
  );

  if (actionable) {
    return {
      status: "ACTION_REQUIRED",
      description: `PR #${actionable.number} has confirmed Human-Decision: REQUIRED with CI and Review PASS.`,
      evidence: [`github:pr:${actionable.number}`, "docs/architecture/architecture.json#humanGates"],
    };
  }

  // Explicit REQUIRED without confirmed CI/Review must not become ACTION_REQUIRED.
  const requiredButUnproven = live.openPullRequests.find((pull) => pull.humanDecisionState === "REQUIRED");
  if (requiredButUnproven) {
    return {
      status: "UNKNOWN",
      description: `PR #${requiredButUnproven.number} marks Human-Decision: REQUIRED but CI/Review evidence is not confirmed PASS.`,
      evidence: [
        `github:pr:${requiredButUnproven.number}`,
        `ci:${requiredButUnproven.ci}`,
        `review:${requiredButUnproven.review}`,
      ],
    };
  }

  return {
    status: "NO_ACTION",
    description:
      "No proven Human decision is currently required. Open PRs without an explicit confirmed REQUIRED gate are reported as live differences only.",
    evidence: live.sourceRefs,
  };
}

export function evaluateHandoff(input: EvaluateHandoffInput): HandoffReport {
  const repository =
    input.repository ??
    input.snapshot.generatedFrom.repository ??
    "ai-development-control-center";
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const generatedFrom = input.snapshot.generatedFrom.commit;

  const staleness = classifySnapshotStaleness({
    generatedFrom,
    currentMain: input.currentMain,
    changedPaths: input.changedPaths,
  });

  return {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    repository,
    evaluatedAt,
    currentMain: input.currentMain,
    snapshot: {
      generatedFrom,
      generatedAt: input.snapshot.generatedFrom.generatedAt,
      generator: input.snapshot.generatedFrom.generator,
      schemaVersion: input.snapshot.schemaVersion,
      stale: staleness.stale,
      classification: staleness.classification,
      staleReasons: staleness.staleReasons,
      changedPaths: input.changedPaths ?? [],
      architectureRelevantPaths: staleness.architectureRelevantPaths,
    },
    confirmed: collectConfirmed(input.snapshot),
    assumptions: input.snapshot.assumptions.map(toFact),
    unknowns: input.snapshot.unknowns.map(toFact),
    liveDifferences: buildLiveDifferences({
      generatedFrom,
      currentMain: input.currentMain,
      changedPaths: input.changedPaths,
      live: input.live,
      classification: staleness.classification,
    }),
    humanGates: input.snapshot.humanGates.map(toFact),
    holds: input.snapshot.holds.map(toFact),
    forbiddenCapabilities: buildForbiddenCapabilities(input.snapshot),
    nextAction: resolveHandoffNextAction(input.live),
  };
}

/** Stable projection for equivalence tests (strips volatile evaluatedAt). */
export function stableHandoffProjection(report: HandoffReport): unknown {
  const { evaluatedAt: _evaluatedAt, ...rest } = report;
  return rest;
}
