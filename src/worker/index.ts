import { resolveHumanAction } from "../domain/humanActionResolver";
import { handleAuthStatus } from "./auth/authStatus";
import { observeRepository } from "./github/readOnlyAdapter";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  GITHUB_TOKEN?: string;
  /** Cloudflare Access team domain / JWT issuer. Optional until Access is configured. */
  ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access application audience tag. Optional until Access is configured. */
  ACCESS_AUD?: string;
}

const TARGET_REPOSITORY = "yasutakesougo/severe-behavior-support-spfx";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/auth/status") {
      return handleAuthStatus(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/status") {
      const facts = await observeRepository(TARGET_REPOSITORY, env);
      const action = resolveHumanAction(facts);

      return Response.json(
        {
          action,
          developmentStatus: {
            repository: facts.repository,
            main: facts.currentMain ? "Observed" : "Unknown",
            openPrCount: facts.openPullRequests?.length ?? null,
            evidenceState: facts.evidenceState,
          },
          evidence:
            facts.openPullRequests?.map((pr) => ({
              pr: pr.number,
              draft: pr.draft,
              ci: pr.ci,
              review: pr.review,
              mergeState: pr.mergeState,
              humanDecision: pr.humanDecisionEvidence.state,
              humanDecisionSource: pr.humanDecisionEvidence.source,
              sourceRefs: pr.sourceRefs,
            })) ?? null,
          observedAt: facts.observedAt,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not Found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
