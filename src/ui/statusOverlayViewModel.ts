/**
 * STATUS-OVERLAY-V1 UI view-model (read-only presentation).
 *
 * Consumes only StatusOverlayDocument. Does not observe GitHub, mutate state,
 * invent timestamps, or authorize mutation.
 */

import type {
  StatusOverlayDocument,
  StatusOverlayGateKind,
  StatusOverlayStatus,
} from "../domain/statusOverlayContract";

export const STATUS_OVERLAY_UI_PROJECTION = "STATUS-OVERLAY-UI-V1" as const;

/** Visual tone — never maps UNKNOWN/HOLD/FAILED/OUTCOME_UNKNOWN to success. */
export type StatusOverlayTone =
  | "current"
  | "action"
  | "maintenance"
  | "ready"
  | "stale"
  | "hold"
  | "failed"
  | "outcome-unknown"
  | "unknown"
  | "neutral";

export interface StatusOverlayPrView {
  number: number;
  title: string;
  draft: boolean;
  classification: string;
  ciState: string;
  reviewState: string;
  url: string;
  isActiveRefresh: boolean;
}

export interface StatusOverlayViewModel {
  schemaVersion: typeof STATUS_OVERLAY_UI_PROJECTION;
  sectionOrder: readonly [
    "CURRENT",
    "GATE",
    "NEXT",
    "AUTOMATION",
    "HOLDS",
    "UNKNOWNS",
    "PRS",
  ];
  current: {
    repository: string;
    mainSha: string;
    observedAt: string;
    snapshotLabel: string;
    snapshotClassification: string;
    coverage: string;
    tone: StatusOverlayTone;
  };
  gate: {
    kind: StatusOverlayGateKind;
    kindLabel: string;
    summary: string;
    tone: StatusOverlayTone;
  };
  next: {
    code: string;
    status: StatusOverlayStatus;
    summary: string;
    targetPr: number | null;
    targetPrUrl: string | null;
    authorizesMutation: false;
    authorizationNote: string;
    secondaryContext: string[];
    tone: StatusOverlayTone;
  };
  automation: {
    enabledLabel: string;
    trigger: string;
    lastRunId: string;
    lastRunConclusion: string;
    lastEvaluation: string;
    lastPublicationOutcome: string;
    activeRefreshPr: number | null;
    activeRefreshPrUrl: string | null;
    tone: StatusOverlayTone;
  };
  holds: {
    items: string[];
    empty: boolean;
    emptyLabel: "none";
    tone: StatusOverlayTone;
  };
  unknowns: {
    items: string[];
    empty: boolean;
    emptyLabel: "none";
    tone: StatusOverlayTone;
  };
  pullRequests: StatusOverlayPrView[];
}

function githubPrUrl(repository: string, number: number): string {
  return `https://github.com/${repository}/pull/${number}`;
}

function shortSha(sha: string | null | undefined): string {
  if (!sha) return "UNKNOWN";
  return sha.length > 12 ? `${sha.slice(0, 12)}…` : sha;
}

function gateKindLabel(kind: StatusOverlayGateKind): string {
  switch (kind) {
    case "HumanActionRequired":
      return "Human action required";
    case "SystemMaintenanceRequired":
      return "System maintenance required";
    case "NoAction":
      return "No action";
    case "Unknown":
      return "Unknown";
  }
}

function toneForStatus(status: StatusOverlayStatus): StatusOverlayTone {
  switch (status) {
    case "CURRENT":
    case "NO_ACTION":
      return "current";
    case "READY":
      return "ready";
    case "STALE":
      return "stale";
    case "HOLD":
      return "hold";
    case "FAILED":
      return "failed";
    case "OUTCOME_UNKNOWN":
      return "outcome-unknown";
    case "UNKNOWN":
      return "unknown";
    case "ACTION_REQUIRED":
      return "action";
  }
}

function toneForGate(kind: StatusOverlayGateKind): StatusOverlayTone {
  switch (kind) {
    case "HumanActionRequired":
      return "action";
    case "SystemMaintenanceRequired":
      return "maintenance";
    case "NoAction":
      return "current";
    case "Unknown":
      return "unknown";
  }
}

function snapshotLabel(doc: StatusOverlayDocument): string {
  if (doc.snapshot.stale === false) return "CURRENT";
  if (doc.snapshot.stale === true) return "STALE";
  return "UNKNOWN";
}

function primaryGate(doc: StatusOverlayDocument): {
  kind: StatusOverlayGateKind;
  summary: string;
} {
  const fromNext = doc.recommendedNextAction.gateKind;
  const match = doc.humanGates.find((g) => g.kind === fromNext);
  return {
    kind: fromNext,
    summary: match?.summary ?? doc.recommendedNextAction.summary,
  };
}

/**
 * Build a deterministic read-only view-model from a StatusOverlayDocument.
 */
export function buildStatusOverlayViewModel(
  document: StatusOverlayDocument,
): StatusOverlayViewModel {
  const gate = primaryGate(document);
  const next = document.recommendedNextAction;
  const targetPr = next.targets?.pullRequest ?? null;
  const activeRefreshPr = document.autoRefresh.activeRefreshPr;

  const holds = [...document.holds];
  const unknowns = [...document.unknowns];

  return {
    schemaVersion: STATUS_OVERLAY_UI_PROJECTION,
    sectionOrder: ["CURRENT", "GATE", "NEXT", "AUTOMATION", "HOLDS", "UNKNOWNS", "PRS"],
    current: {
      repository: document.repository,
      mainSha: shortSha(document.main.sha),
      observedAt: document.observedAt,
      snapshotLabel: snapshotLabel(document),
      snapshotClassification: document.snapshot.staleClassification ?? "UNKNOWN",
      coverage: document.snapshot.autoRefreshCoverage,
      tone:
        document.snapshot.stale === null
          ? "unknown"
          : document.snapshot.stale
            ? "stale"
            : "current",
    },
    gate: {
      kind: gate.kind,
      kindLabel: gateKindLabel(gate.kind),
      summary: gate.summary,
      tone: toneForGate(gate.kind),
    },
    next: {
      code: next.code,
      status: next.status,
      summary: next.summary,
      targetPr,
      targetPrUrl:
        targetPr != null ? githubPrUrl(document.repository, targetPr) : null,
      authorizesMutation: false,
      authorizationNote: "Recommendation does not authorize mutation",
      secondaryContext: [...(next.secondaryContext ?? [])],
      tone: toneForStatus(next.status),
    },
    automation: {
      enabledLabel: document.autoRefresh.enabled ? "ENABLED" : "DISABLED",
      trigger: document.autoRefresh.trigger ?? "UNKNOWN",
      lastRunId: document.autoRefresh.lastRunId ?? "none",
      lastRunConclusion: document.autoRefresh.lastRunConclusion ?? "UNKNOWN",
      lastEvaluation: document.autoRefresh.lastEvaluation ?? "UNKNOWN",
      lastPublicationOutcome: document.autoRefresh.lastPublicationOutcome ?? "UNKNOWN",
      activeRefreshPr,
      activeRefreshPrUrl:
        activeRefreshPr != null
          ? githubPrUrl(document.repository, activeRefreshPr)
          : null,
      tone:
        document.autoRefresh.lastRunConclusion === "failure" ||
        document.autoRefresh.lastRunConclusion === "FAILED"
          ? "failed"
          : document.autoRefresh.lastRunConclusion === "UNKNOWN"
            ? "unknown"
            : "neutral",
    },
    holds: {
      items: holds,
      empty: holds.length === 0,
      emptyLabel: "none",
      tone: holds.length > 0 ? "hold" : "neutral",
    },
    unknowns: {
      items: unknowns,
      empty: unknowns.length === 0,
      emptyLabel: "none",
      tone: unknowns.length > 0 ? "unknown" : "neutral",
    },
    pullRequests: document.pullRequests.map((pr) => ({
      number: pr.number,
      title: pr.title,
      draft: pr.draft,
      classification: pr.classification,
      ciState: pr.ciState,
      reviewState: pr.reviewState,
      url: githubPrUrl(document.repository, pr.number),
      isActiveRefresh: activeRefreshPr === pr.number,
    })),
  };
}

/**
 * Deterministic compact Markdown projection (no Date.now / network).
 * Section order matches Issue #35 UI contract.
 */
export function renderStatusOverlayMarkdown(document: StatusOverlayDocument): string {
  const vm = buildStatusOverlayViewModel(document);
  const lines: string[] = [
    "# STATUS-OVERLAY",
    "",
    "## CURRENT",
    `- repository: ${vm.current.repository}`,
    `- main: ${vm.current.mainSha}`,
    `- observedAt: ${vm.current.observedAt}`,
    `- snapshot: ${vm.current.snapshotLabel} (${vm.current.snapshotClassification})`,
    `- autoRefreshCoverage: ${vm.current.coverage}`,
    "",
    "## GATE",
    `- kind: ${vm.gate.kind}`,
    `- label: ${vm.gate.kindLabel}`,
    `- summary: ${vm.gate.summary}`,
    "",
    "## NEXT",
    `- code: ${vm.next.code}`,
    `- status: ${vm.next.status}`,
    `- summary: ${vm.next.summary}`,
    `- targetPr: ${vm.next.targetPr ?? "none"}`,
    `- authorizesMutation: false`,
    `- note: ${vm.next.authorizationNote}`,
  ];
  if (vm.next.secondaryContext.length > 0) {
    lines.push("- secondary:");
    for (const item of vm.next.secondaryContext) {
      lines.push(`  - ${item}`);
    }
  }
  lines.push(
    "",
    "## AUTOMATION",
    `- enabled: ${vm.automation.enabledLabel}`,
    `- trigger: ${vm.automation.trigger}`,
    `- lastRunId: ${vm.automation.lastRunId}`,
    `- lastRunConclusion: ${vm.automation.lastRunConclusion}`,
    `- lastEvaluation: ${vm.automation.lastEvaluation}`,
    `- lastPublicationOutcome: ${vm.automation.lastPublicationOutcome}`,
    `- activeRefreshPr: ${vm.automation.activeRefreshPr ?? "none"}`,
    "",
    "## HOLDS",
  );
  if (vm.holds.empty) {
    lines.push(`- ${vm.holds.emptyLabel}`);
  } else {
    for (const item of vm.holds.items) lines.push(`- ${item}`);
  }
  lines.push("", "## UNKNOWNS");
  if (vm.unknowns.empty) {
    lines.push(`- ${vm.unknowns.emptyLabel}`);
  } else {
    for (const item of vm.unknowns.items) lines.push(`- ${item}`);
  }
  lines.push("", "## PRS");
  if (vm.pullRequests.length === 0) {
    lines.push("- none");
  } else {
    for (const pr of vm.pullRequests) {
      lines.push(
        `- #${pr.number} [${pr.draft ? "DRAFT" : "READY"}|${pr.classification}] ${pr.title} (CI=${pr.ciState}, Review=${pr.reviewState}${pr.isActiveRefresh ? ", activeRefresh" : ""})`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}
