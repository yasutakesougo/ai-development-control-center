import { resolveHumanAction } from "../domain/humanActionResolver";
import { handleAuthStatus } from "./auth/authStatus";
import { observeRepository } from "./github/readOnlyAdapter";
import { handleLedgerRecordPost, handleLedgerRecordsGet, type LedgerApiEnv } from "./ledger/recordsApi";
import { buildStatusPayload } from "./statusApi";

interface Env extends LedgerApiEnv {
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
      const payload = await buildStatusPayload(facts, action);
      return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/api/ledger/records") {
      if (request.method === "POST") {
        return handleLedgerRecordPost(request, env, {
          observe: () => observeRepository(TARGET_REPOSITORY, env),
        });
      }
      if (request.method === "GET") return handleLedgerRecordsGet(request, env);
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not Found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
