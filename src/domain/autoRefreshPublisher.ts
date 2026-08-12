/**
 * AUTO-REFRESH-PILOT-V1 Draft-only publisher capabilities.
 *
 * Explicitly does NOT implement Ready, Merge, or PR/issue close.
 */

export const AUTO_REFRESH_PILOT_PUBLISHER = {
  canCreateFeatureBranch: true,
  canCommitSnapshotArtifacts: true,
  canPushFeatureBranch: true,
  canCreateDraftPullRequest: true,
  /** Forbidden in pilot. */
  canMarkReady: false,
  /** Forbidden in pilot. */
  canMerge: false,
  /** Forbidden in pilot. */
  canClosePullRequest: false,
  /** Forbidden in pilot. */
  canCloseIssue: false,
  /** Forbidden in pilot. */
  canInvokeActionGateway: false,
  /** Forbidden in pilot. */
  canExecuteAgent: false,
} as const;

export type AutoRefreshPilotPublisher = typeof AUTO_REFRESH_PILOT_PUBLISHER;

export function assertPilotPublisherCannotReadyOrMerge(
  publisher: AutoRefreshPilotPublisher = AUTO_REFRESH_PILOT_PUBLISHER,
): void {
  if (publisher.canMarkReady) {
    throw new Error("AUTO-REFRESH-PILOT-V1 must not authorize Ready");
  }
  if (publisher.canMerge) {
    throw new Error("AUTO-REFRESH-PILOT-V1 must not authorize Merge");
  }
  if (publisher.canClosePullRequest) {
    throw new Error("AUTO-REFRESH-PILOT-V1 must not authorize closing PRs");
  }
  if (publisher.canCloseIssue) {
    throw new Error("AUTO-REFRESH-PILOT-V1 must not authorize closing issues");
  }
  if (publisher.canInvokeActionGateway) {
    throw new Error("AUTO-REFRESH-PILOT-V1 must not invoke Action Gateway");
  }
  if (publisher.canExecuteAgent) {
    throw new Error("AUTO-REFRESH-PILOT-V1 must not execute Agents");
  }
}

export interface GitHubPullSummary {
  number: number;
  title: string;
  draft: boolean;
  body: string | null;
  htmlUrl: string;
  headRef: string;
  headSha: string;
}

/**
 * Create a Draft PR only. Ready/Merge endpoints are intentionally absent.
 */
export async function createDraftPullRequest(input: {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  token: string;
}): Promise<{ number: number; htmlUrl: string; draft: true }> {
  assertPilotPublisherCannotReadyOrMerge();
  if (!AUTO_REFRESH_PILOT_PUBLISHER.canCreateDraftPullRequest) {
    throw new Error("Draft PR creation disabled");
  }

  const response = await fetch(`https://api.github.com/repos/${input.owner}/${input.repo}/pulls`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${input.token}`,
      "User-Agent": "ai-development-control-center-auto-refresh-pilot-v1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
      draft: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub create Draft PR failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as {
    number: number;
    html_url: string;
    draft?: boolean;
  };

  if (json.draft !== true) {
    throw new Error("GitHub returned a non-draft PR; refusing to continue");
  }

  return { number: json.number, htmlUrl: json.html_url, draft: true };
}

export async function listOpenPullRequests(input: {
  owner: string;
  repo: string;
  token?: string;
}): Promise<GitHubPullSummary[]> {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "ai-development-control-center-auto-refresh-pilot-v1",
  });
  if (input.token) headers.set("Authorization", `Bearer ${input.token}`);

  const response = await fetch(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls?state=open&per_page=50`,
    { method: "GET", headers },
  );
  if (!response.ok) {
    throw new Error(`GitHub list PRs failed: ${response.status}`);
  }

  const json = (await response.json()) as Array<{
    number: number;
    title: string;
    draft?: boolean;
    body?: string | null;
    html_url: string;
    head?: { ref?: string; sha?: string };
  }>;

  return json.map((pr) => ({
    number: pr.number,
    title: pr.title,
    draft: Boolean(pr.draft),
    body: pr.body ?? null,
    htmlUrl: pr.html_url,
    headRef: pr.head?.ref ?? "",
    headSha: pr.head?.sha ?? "",
  }));
}
