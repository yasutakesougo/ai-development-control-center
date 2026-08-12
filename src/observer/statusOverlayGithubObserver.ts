/**
 * STATUS-OVERLAY-V1 GitHub / workflow observer (read-only).
 *
 * Flow:
 *   read-only client + local metadata
 *     → StatusOverlayGeneratorInput
 *     → generateStatusOverlay() (caller)
 *
 * Does not mutate GitHub, write repository files, write HISTORY, invoke
 * Action Gateway / Ledger / Agents, or implement UI.
 */

import {
  inspectPersistentWorkflowYaml,
  PERSISTENT_AUTO_REFRESH_ENABLED,
  PERSISTENT_WORKFLOW_PATH,
} from "../domain/persistentAutoRefreshContract";
import type { StatusOverlayPullRequest } from "../domain/statusOverlayContract";
import type { StatusOverlayGeneratorInput } from "../domain/statusOverlayGenerator";
import { resolveActiveRefreshPr } from "../domain/statusOverlayGenerator";
import {
  STATUS_OVERLAY_AUTO_REFRESH_WORKFLOW,
  STATUS_OVERLAY_OBSERVER_IMPLEMENTED,
  type StatusOverlayObserveParams,
  type StatusOverlayObservedPull,
  type StatusOverlayObservedWorkflowRun,
  type StatusOverlayReadonlyGithubClient,
} from "./statusOverlayObservationTypes";

export {
  STATUS_OVERLAY_AUTO_REFRESH_WORKFLOW,
  STATUS_OVERLAY_OBSERVER_IMPLEMENTED,
};
export type {
  StatusOverlayLocalObservation,
  StatusOverlayObserveParams,
  StatusOverlayObservedPull,
  StatusOverlayObservedWorkflowRun,
  StatusOverlayReadonlyGithubClient,
} from "./statusOverlayObservationTypes";

/** Keys that must never appear on a read-only observer client. */
export const STATUS_OVERLAY_OBSERVER_FORBIDDEN_CLIENT_METHODS = [
  "createPullRequest",
  "updatePullRequest",
  "mergePullRequest",
  "closePullRequest",
  "createIssue",
  "updateIssue",
  "createCommit",
  "push",
  "deleteRef",
  "requestReview",
  "submitReview",
  "dispatchWorkflow",
  "cancelWorkflow",
  "writeFile",
  "putFile",
] as const;

/**
 * Deterministic PR classification for overlay projections.
 * REFRESH_DRAFT requires draft === true plus refresh-oriented title/branch/body.
 */
export function classifyOverlayPullRequest(pr: {
  draft: boolean;
  title: string;
  headRef?: string | null;
  body?: string | null;
}): StatusOverlayPullRequest["classification"] {
  const title = pr.title;
  const head = pr.headRef ?? "";
  const body = pr.body ?? "";

  const looksRefresh =
    /refresh\s+Snapshot/i.test(title) ||
    /auto-refresh\s+Snapshot/i.test(title) ||
    /architecture\):\s*refresh\b/i.test(title) ||
    /architecture\):\s*auto-refresh\b/i.test(title) ||
    (/auto-refresh/i.test(head) &&
      (/snapshot/i.test(title) || /ARCH-SNAPSHOT-GEN-V1/.test(body) || /generatedFrom/i.test(body))) ||
    /refreshIdentity\s*[:=]/i.test(body) ||
    (/ARCH-SNAPSHOT-GEN-V1/.test(body) && /snapshot/i.test(title));

  if (pr.draft && looksRefresh) return "REFRESH_DRAFT";

  const looksDesign =
    /\bdesign\b/i.test(title) ||
    /-design-/i.test(head) ||
    /\bDESIGNED\b/.test(body) ||
    /Status:\s*DESIGNED/i.test(body);

  if (looksDesign) return "DESIGN";
  return "OTHER";
}

function humanActionFor(
  draft: boolean,
  classification: StatusOverlayPullRequest["classification"],
): StatusOverlayPullRequest["humanAction"] {
  if (draft) return "REVIEW_DRAFT";
  if (classification === "OTHER" || classification === "DESIGN") return "DECIDE_MERGE";
  return "DECIDE_MERGE";
}

function unknownOr(value: string | null | undefined): string | "UNKNOWN" {
  if (value == null || value === "") return "UNKNOWN";
  return value;
}

export function projectObservedPull(
  pr: StatusOverlayObservedPull,
): StatusOverlayPullRequest {
  const classification = classifyOverlayPullRequest(pr);
  return {
    number: pr.number,
    title: pr.title,
    draft: pr.draft === true,
    mergeable:
      pr.mergeable === true || pr.mergeable === false ? pr.mergeable : "UNKNOWN",
    head: pr.headSha ?? null,
    base: pr.baseRef ?? null,
    reviewState: unknownOr(pr.reviewState),
    ciState: unknownOr(pr.ciState),
    classification,
    humanAction: humanActionFor(pr.draft === true, classification),
  };
}

function buildTriggerLabel(yaml: string | null | undefined): string | null {
  if (yaml == null || yaml === "") return null;
  const inspection = inspectPersistentWorkflowYaml(yaml);
  const parts: string[] = [];
  if (inspection.hasPushMainOnly) parts.push("push_main");
  if (inspection.hasWorkflowDispatch) parts.push("workflow_dispatch");
  if (parts.length === 0) return "UNKNOWN";
  return parts.join("+");
}

function isAutoRefreshEnabled(yaml: string | null | undefined): boolean {
  if (yaml == null || yaml === "") return PERSISTENT_AUTO_REFRESH_ENABLED;
  const inspection = inspectPersistentWorkflowYaml(yaml);
  return (
    PERSISTENT_AUTO_REFRESH_ENABLED &&
    inspection.hasPushMainOnly &&
    inspection.hasWorkflowDispatch &&
    !inspection.hasScheduleCron
  );
}

function selectLatestWorkflowRun(
  runs: readonly StatusOverlayObservedWorkflowRun[],
): StatusOverlayObservedWorkflowRun | null {
  if (runs.length === 0) return null;
  // Caller/client should return newest-first; still pick first completed-or-latest.
  return runs[0] ?? null;
}

/**
 * Observe live GitHub/workflow evidence into explicit generator input.
 * Produces `observedAt` once via `now()` and never invents PASS/READY.
 */
export async function observeStatusOverlayGithub(
  params: StatusOverlayObserveParams,
): Promise<StatusOverlayGeneratorInput> {
  const observedAt = params.now();
  const workflowFileName =
    params.workflowFileName ?? STATUS_OVERLAY_AUTO_REFRESH_WORKFLOW;
  const unknowns = [...(params.local.unknowns ?? [])];
  const holds = [...(params.local.holds ?? [])];

  const base: StatusOverlayGeneratorInput = {
    repository: params.repository,
    observedAt,
    currentMain: null,
    snapshot: {
      generatedFrom: params.local.snapshotGeneratedFrom,
      stale: params.local.snapshotStale,
      staleClassification: params.local.snapshotStaleClassification,
      architectureRelevantChanges: [
        ...(params.local.architectureRelevantChanges ?? []),
      ],
    },
    handoff: {
      nextActionStatus: params.local.handoffNextActionStatus,
      staleClassification:
        params.local.handoffStaleClassification ??
        params.local.snapshotStaleClassification,
    },
    autoRefresh: {
      enabled: isAutoRefreshEnabled(params.local.persistentWorkflowYaml),
      trigger: buildTriggerLabel(params.local.persistentWorkflowYaml),
      lastRunId: null,
      lastRunConclusion: null,
      lastEvaluation: null,
      lastPublicationOutcome: null,
      activeRefreshPr: null,
    },
    openPullRequests: [],
    holds,
    unknowns,
    liveObservationFailed: false,
    workflowObservationFailed: false,
    historicalDraftOpen: params.local.historicalDraftOpen === true,
    historyWriter: { writerImplemented: false },
  };

  let currentMain: string | null = null;
  let openPullRequests: StatusOverlayPullRequest[] = [];
  let workflowRuns: StatusOverlayObservedWorkflowRun[] = [];
  let workflowObservationFailed = false;

  try {
    const tip = await params.client.getDefaultBranchTip(params.repository);
    currentMain = tip.sha;
    const rawPulls = await params.client.listOpenPullRequests(params.repository);
    openPullRequests = [...rawPulls]
      .map(projectObservedPull)
      .sort((a, b) => a.number - b.number);

    try {
      workflowRuns = await params.client.listWorkflowRuns(
        params.repository,
        workflowFileName,
      );
    } catch {
      // Observation UNKNOWN — not automation OUTCOME_UNKNOWN.
      workflowObservationFailed = true;
      if (!unknowns.includes("workflow_state_UNKNOWN")) {
        unknowns.push("workflow_state_UNKNOWN");
      }
    }
  } catch {
    return {
      ...base,
      currentMain: null,
      openPullRequests: [],
      liveObservationFailed: true,
      unknowns: unknowns.includes("live_observation_failed")
        ? unknowns
        : [...unknowns, "live_observation_failed"],
      autoRefresh: {
        ...base.autoRefresh,
        lastRunConclusion: "UNKNOWN",
        lastEvaluation: "UNKNOWN",
        lastPublicationOutcome: "UNKNOWN",
      },
    };
  }

  const latestRun = selectLatestWorkflowRun(workflowRuns);
  let lastRunId: string | null = null;
  let lastRunConclusion: string | null = null;
  let lastEvaluation: string | null = null;
  let lastPublicationOutcome: string | null = null;
  let outcomeUnknown = false;
  let automationFailed = false;

  if (workflowObservationFailed) {
    // Workflow API unreadable: observation UNKNOWN fields only.
    lastRunConclusion = "UNKNOWN";
    lastEvaluation = "UNKNOWN";
    lastPublicationOutcome = "UNKNOWN";
  } else if (!latestRun) {
    if (!unknowns.includes("workflow_state_UNKNOWN")) {
      unknowns.push("workflow_state_UNKNOWN");
    }
    lastRunConclusion = "UNKNOWN";
    lastEvaluation = "UNKNOWN";
    lastPublicationOutcome = "UNKNOWN";
  } else {
    lastRunId = latestRun.id;
    lastRunConclusion = latestRun.conclusion ?? "UNKNOWN";
    if (latestRun.conclusion == null || latestRun.conclusion === "") {
      lastRunConclusion = "UNKNOWN";
      // Completed run with missing conclusion → automation OUTCOME_UNKNOWN.
      if (latestRun.status === "completed") {
        outcomeUnknown = true;
      }
    }
    if (latestRun.conclusion === "failure" || latestRun.conclusion === "timed_out") {
      automationFailed = true;
    }

    const runOnCurrentMain =
      !!currentMain && !!latestRun.headSha && latestRun.headSha === currentMain;

    if (!runOnCurrentMain) {
      // Older successful runs must not prove current freshness.
      unknowns.push("workflow_run_not_on_current_main");
      lastEvaluation = latestRun.lastEvaluation ?? null;
      lastPublicationOutcome = latestRun.lastPublicationOutcome ?? null;
      // Do not invent CURRENT / NOT_REQUIRED from a stale-SHA success.
    } else {
      lastEvaluation = latestRun.lastEvaluation ?? null;
      lastPublicationOutcome = latestRun.lastPublicationOutcome ?? null;
    }

    if (lastRunConclusion === "UNKNOWN" && latestRun.status === "completed") {
      outcomeUnknown = true;
    }
  }

  // activeRefreshPr only from live REFRESH_DRAFT; historical override validated.
  const { activeRefreshPr, overrideRejected } = resolveActiveRefreshPr({
    openPullRequests,
    override:
      params.local.historicalActiveRefreshPr !== undefined
        ? params.local.historicalActiveRefreshPr
        : undefined,
  });
  if (overrideRejected && !unknowns.includes("activeRefreshPr_override_rejected")) {
    unknowns.push("activeRefreshPr_override_rejected");
  }

  for (const pr of openPullRequests) {
    if (pr.ciState === "UNKNOWN") {
      const key = `pr_${pr.number}_ciState_UNKNOWN`;
      if (!unknowns.includes(key)) unknowns.push(key);
    }
    if (pr.reviewState === "UNKNOWN") {
      const key = `pr_${pr.number}_reviewState_UNKNOWN`;
      if (!unknowns.includes(key)) unknowns.push(key);
    }
  }

  return {
    ...base,
    currentMain,
    openPullRequests,
    unknowns,
    holds,
    workflowObservationFailed,
    outcomeUnknown,
    automationFailed,
    autoRefresh: {
      enabled: base.autoRefresh.enabled,
      trigger: base.autoRefresh.trigger,
      lastRunId,
      lastRunConclusion,
      lastEvaluation,
      lastPublicationOutcome,
      activeRefreshPr,
    },
  };
}

/**
 * Optional HTTP adapter — GET-only. Not used by unit tests.
 * Mutation helpers are intentionally absent.
 */
export function createStatusOverlayGithubHttpClient(env: {
  GITHUB_TOKEN?: string;
}): StatusOverlayReadonlyGithubClient {
  const API = "https://api.github.com";

  async function githubGet<T>(path: string): Promise<T> {
    const headers = new Headers({
      Accept: "application/vnd.github+json",
      "User-Agent": "ai-development-control-center-status-overlay-observer-v1",
    });
    if (env.GITHUB_TOKEN) headers.set("Authorization", `Bearer ${env.GITHUB_TOKEN}`);
    const response = await fetch(`${API}${path}`, { method: "GET", headers });
    if (!response.ok) {
      throw new Error(`GitHub GET ${path} failed: ${response.status}`);
    }
    return (await response.json()) as T;
  }

  return {
    async getDefaultBranchTip(repository) {
      const repo = await githubGet<{ default_branch?: string }>(`/repos/${repository}`);
      if (!repo.default_branch) throw new Error("default branch missing");
      const commit = await githubGet<{ sha?: string }>(
        `/repos/${repository}/commits/${encodeURIComponent(repo.default_branch)}`,
      );
      if (!commit.sha) throw new Error("main commit SHA missing");
      return { defaultBranch: repo.default_branch, sha: commit.sha };
    },

    async listOpenPullRequests(repository) {
      type Pull = {
        number: number;
        title: string;
        draft?: boolean;
        body?: string | null;
        mergeable?: boolean | null;
        head?: { sha?: string; ref?: string };
        base?: { ref?: string };
      };
      const pulls = await githubGet<Pull[]>(
        `/repos/${repository}/pulls?state=open&per_page=50`,
      );
      const out: StatusOverlayObservedPull[] = [];
      for (const pull of pulls) {
        const detail = await githubGet<Pull>(`/repos/${repository}/pulls/${pull.number}`);
        const headSha = detail.head?.sha ?? pull.head?.sha ?? null;
        let ciState: string | null = null;
        let reviewState: string | null = null;
        if (headSha) {
          try {
            const [status, checks] = await Promise.all([
              githubGet<{ state?: string; total_count?: number }>(
                `/repos/${repository}/commits/${headSha}/status`,
              ),
              githubGet<{
                check_runs?: Array<{ status?: string; conclusion?: string | null }>;
              }>(`/repos/${repository}/commits/${headSha}/check-runs`),
            ]);
            ciState = normalizeCiFromGithub(status, checks);
          } catch {
            ciState = null;
          }
        }
        try {
          const reviews = await githubGet<Array<{ state?: string }>>(
            `/repos/${repository}/pulls/${pull.number}/reviews`,
          );
          reviewState = normalizeReviewFromGithub(reviews);
        } catch {
          reviewState = null;
        }
        out.push({
          number: pull.number,
          title: detail.title ?? pull.title,
          draft: detail.draft === true || pull.draft === true,
          mergeable: detail.mergeable ?? pull.mergeable ?? null,
          headSha,
          baseRef: detail.base?.ref ?? pull.base?.ref ?? null,
          headRef: detail.head?.ref ?? pull.head?.ref ?? null,
          body: detail.body ?? pull.body ?? null,
          ciState,
          reviewState,
        });
      }
      return out;
    },

    async listWorkflowRuns(repository, workflowFileName) {
      type Run = {
        id: number;
        status?: string;
        conclusion?: string | null;
        head_sha?: string;
        event?: string;
      };
      const payload = await githubGet<{ workflow_runs?: Run[] }>(
        `/repos/${repository}/actions/workflows/${encodeURIComponent(workflowFileName)}/runs?per_page=10`,
      );
      return (payload.workflow_runs ?? []).map((run) => ({
        id: String(run.id),
        status: run.status ?? "UNKNOWN",
        conclusion: run.conclusion ?? null,
        headSha: run.head_sha ?? null,
        event: run.event ?? null,
      }));
    },
  };
}

function normalizeCiFromGithub(
  status: { state?: string; total_count?: number },
  checks: { check_runs?: Array<{ status?: string; conclusion?: string | null }> },
): string {
  const runs = checks.check_runs ?? [];
  if (runs.some((run) => run.status && run.status !== "completed")) return "PENDING";
  if (runs.some((run) => run.conclusion === "failure" || run.conclusion === "timed_out")) {
    return "FAIL";
  }
  if (
    runs.length > 0 &&
    runs.every(
      (run) =>
        run.conclusion === "success" ||
        run.conclusion === "neutral" ||
        run.conclusion === "skipped",
    )
  ) {
    return "PASS";
  }
  if (!status.state || status.total_count === 0) return "UNKNOWN";
  if (status.state === "pending") return "PENDING";
  if (status.state === "failure" || status.state === "error") return "FAIL";
  if (status.state === "success") return "PASS";
  return "UNKNOWN";
}

function normalizeReviewFromGithub(reviews: Array<{ state?: string }>): string {
  if (reviews.length === 0) return "UNKNOWN";
  if (reviews.some((review) => review.state === "CHANGES_REQUESTED")) {
    return "CHANGES_REQUESTED";
  }
  if (reviews.some((review) => review.state === "APPROVED")) return "PASS";
  return "PENDING";
}

/** Documented workflow path constant for callers assembling local YAML. */
export function statusOverlayPersistentWorkflowPath(): typeof PERSISTENT_WORKFLOW_PATH {
  return PERSISTENT_WORKFLOW_PATH;
}
