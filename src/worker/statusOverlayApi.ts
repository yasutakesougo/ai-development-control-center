/**
 * Worker handler: read-only STATUS-OVERLAY runtime endpoint.
 *
 * GET /api/status-overlay → StatusOverlayDocument
 * Uses only GET GitHub APIs via createStatusOverlayGithubHttpClient.
 *
 * Unauthenticated access is fail-closed to the canonical public repository only.
 */

import { PERSISTENT_WORKFLOW_PATH } from "../domain/persistentAutoRefreshContract";
import type { HandoffReport } from "../domain/handoffReport";
import {
  createStatusOverlayGithubHttpClient,
  type StatusOverlayReadonlyGithubClient,
} from "../observer/statusOverlayGithubObserver";
import {
  STATUS_OVERLAY_DEFAULT_REPOSITORY,
  buildStatusOverlayLocalObservation,
  parseArchitectureSnapshotJson,
  runStatusOverlayCycle,
  statusOverlayRuntimeUnavailable,
} from "../runtime/statusOverlayRuntime";

/** Canonical public repository allowed for unauthenticated STATUS-OVERLAY reads. */
export const STATUS_OVERLAY_PUBLIC_REPOSITORY =
  STATUS_OVERLAY_DEFAULT_REPOSITORY;

export interface StatusOverlayApiEnv {
  GITHUB_TOKEN?: string;
  /** Optional override; defaults to ai-development-control-center. */
  STATUS_OVERLAY_REPOSITORY?: string;
  /** Set to "false" to disable the endpoint. */
  STATUS_OVERLAY_RUNTIME_ENABLED?: string;
}

export type StatusOverlayRepositoryGate =
  | { allowed: true; repository: typeof STATUS_OVERLAY_PUBLIC_REPOSITORY }
  | { allowed: false; repository: string; reason: string };

/**
 * Resolve the repository for unauthenticated /api/status-overlay.
 * Only the canonical public control-center repository is permitted.
 */
export function resolveUnauthenticatedStatusOverlayRepository(
  configured: string | undefined,
): StatusOverlayRepositoryGate {
  const repository = (configured?.trim() || STATUS_OVERLAY_PUBLIC_REPOSITORY).replace(
    /^\/+|\/+$/g,
    "",
  );
  if (repository === STATUS_OVERLAY_PUBLIC_REPOSITORY) {
    return { allowed: true, repository: STATUS_OVERLAY_PUBLIC_REPOSITORY };
  }
  return {
    allowed: false,
    repository,
    reason: `STATUS-OVERLAY unauthenticated access is limited to ${STATUS_OVERLAY_PUBLIC_REPOSITORY}; refused repository override: ${repository}`,
  };
}

async function githubGetTextFile(
  repository: string,
  path: string,
  token?: string,
): Promise<string | null> {
  const headers = new Headers({
    Accept: "application/vnd.github.raw+json",
    "User-Agent": "ai-development-control-center-status-overlay-runtime-v1",
  });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(
    `https://api.github.com/repos/${repository}/contents/${path}`,
    { method: "GET", headers },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub GET contents/${path} failed: ${response.status}`);
  }
  return await response.text();
}

export interface StatusOverlayApiDeps {
  createClient?: (env: { GITHUB_TOKEN?: string }) => StatusOverlayReadonlyGithubClient;
  getTextFile?: (
    repository: string,
    path: string,
    token?: string,
  ) => Promise<string | null>;
  runCycle?: typeof runStatusOverlayCycle;
  now?: () => string;
}

function sanitizeUnavailableReason(reason: string): string {
  return reason
    .replace(/bearer\s+[a-z0-9._\-]+/gi, "bearer [REDACTED]")
    .replace(/ghp_[a-zA-Z0-9]+/g, "[REDACTED_TOKEN]")
    .replace(/github_pat_[a-zA-Z0-9_]+/g, "[REDACTED_TOKEN]");
}

function jsonResponse(body: unknown, status: number): Response {
  const payload = JSON.stringify(body);
  if (/ghp_[a-zA-Z0-9]+/i.test(payload) || /github_pat_[a-zA-Z0-9_]+/i.test(payload)) {
    return Response.json(
      statusOverlayRuntimeUnavailable("STATUS-OVERLAY refused to emit secret material"),
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  return new Response(payload, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function handleStatusOverlayGet(
  env: StatusOverlayApiEnv,
  deps: StatusOverlayApiDeps = {},
): Promise<Response> {
  if (env.STATUS_OVERLAY_RUNTIME_ENABLED === "false") {
    return jsonResponse(
      statusOverlayRuntimeUnavailable("STATUS-OVERLAY runtime disabled"),
      404,
    );
  }

  const gate = resolveUnauthenticatedStatusOverlayRepository(env.STATUS_OVERLAY_REPOSITORY);
  if (!gate.allowed) {
    // Fail closed BEFORE any token-backed GitHub client/API usage.
    return jsonResponse(
      statusOverlayRuntimeUnavailable(gate.reason),
      403,
    );
  }

  const repository = gate.repository;
  const createClient = deps.createClient ?? createStatusOverlayGithubHttpClient;
  const getTextFile = deps.getTextFile ?? githubGetTextFile;
  const runCycle = deps.runCycle ?? runStatusOverlayCycle;
  const now = deps.now ?? (() => new Date().toISOString());

  try {
    const client = createClient({
      GITHUB_TOKEN: env.GITHUB_TOKEN,
    });
    const tip = await client.getDefaultBranchTip(repository);

    const [snapshotRaw, workflowYaml, handoffRaw] = await Promise.all([
      getTextFile(repository, "docs/architecture/architecture.json", env.GITHUB_TOKEN),
      getTextFile(repository, PERSISTENT_WORKFLOW_PATH, env.GITHUB_TOKEN),
      getTextFile(repository, "docs/handoff/handoff.json", env.GITHUB_TOKEN),
    ]);

    const snapshot = snapshotRaw
      ? parseArchitectureSnapshotJson(JSON.parse(snapshotRaw) as unknown)
      : null;
    let handoff: HandoffReport | null = null;
    if (handoffRaw) {
      try {
        handoff = JSON.parse(handoffRaw) as HandoffReport;
      } catch {
        handoff = null;
      }
    }

    const local = buildStatusOverlayLocalObservation({
      snapshot,
      handoff,
      persistentWorkflowYaml: workflowYaml,
      currentMain: tip.sha,
      architectureRelevantChanges: handoff?.snapshot.architectureRelevantPaths ?? null,
    });

    const document = await runCycle({
      repository,
      client,
      local,
      now,
    });

    return jsonResponse(document, 200);
  } catch (error) {
    const reason = sanitizeUnavailableReason(
      error instanceof Error ? error.message : "STATUS-OVERLAY runtime failed",
    );
    return jsonResponse(statusOverlayRuntimeUnavailable(reason), 503);
  }
}
