/**
 * Worker handler: read-only STATUS-OVERLAY runtime endpoint.
 *
 * GET /api/status-overlay → StatusOverlayDocument
 * Uses only GET GitHub APIs via createStatusOverlayGithubHttpClient.
 */

import { PERSISTENT_WORKFLOW_PATH } from "../domain/persistentAutoRefreshContract";
import type { HandoffReport } from "../domain/handoffReport";
import { createStatusOverlayGithubHttpClient } from "../observer/statusOverlayGithubObserver";
import {
  STATUS_OVERLAY_DEFAULT_REPOSITORY,
  buildStatusOverlayLocalObservation,
  parseArchitectureSnapshotJson,
  runStatusOverlayCycle,
  statusOverlayRuntimeUnavailable,
} from "../runtime/statusOverlayRuntime";

export interface StatusOverlayApiEnv {
  GITHUB_TOKEN?: string;
  /** Optional override; defaults to ai-development-control-center. */
  STATUS_OVERLAY_REPOSITORY?: string;
  /** Set to "false" to disable the endpoint. */
  STATUS_OVERLAY_RUNTIME_ENABLED?: string;
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

export async function handleStatusOverlayGet(
  env: StatusOverlayApiEnv,
): Promise<Response> {
  if (env.STATUS_OVERLAY_RUNTIME_ENABLED === "false") {
    return Response.json(
      statusOverlayRuntimeUnavailable("STATUS-OVERLAY runtime disabled"),
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const repository =
    env.STATUS_OVERLAY_REPOSITORY?.trim() || STATUS_OVERLAY_DEFAULT_REPOSITORY;

  try {
    const client = createStatusOverlayGithubHttpClient({
      GITHUB_TOKEN: env.GITHUB_TOKEN,
    });
    const tip = await client.getDefaultBranchTip(repository);

    const [snapshotRaw, workflowYaml, handoffRaw] = await Promise.all([
      githubGetTextFile(repository, "docs/architecture/architecture.json", env.GITHUB_TOKEN),
      githubGetTextFile(repository, PERSISTENT_WORKFLOW_PATH, env.GITHUB_TOKEN),
      githubGetTextFile(repository, "docs/handoff/handoff.json", env.GITHUB_TOKEN),
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

    const document = await runStatusOverlayCycle({
      repository,
      client,
      local,
      now: () => new Date().toISOString(),
    });

    return Response.json(document, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "STATUS-OVERLAY runtime failed";
    return Response.json(statusOverlayRuntimeUnavailable(reason), {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
