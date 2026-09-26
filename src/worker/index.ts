import { resolveHumanAction } from "../domain/humanActionResolver";
import { handleAuthStatus } from "./auth/authStatus";
import { handleChatReadbackMcp } from "./chatReadbackMcp";
import { observeRepository } from "./github/readOnlyAdapter";
import { handleLedgerRecordPost, handleLedgerRecordsGet, type LedgerApiEnv } from "./ledger/recordsApi";
import { handleRepositoryDetailGet, handleRepositoryOverviewGet } from "./repositoryOverviewApi";
import { buildStatusPayload } from "./statusApi";
import { handleStatusOverlayGet } from "./statusOverlayApi";

interface ServiceBinding {
  fetch(request: Request): Promise<Response>;
}

type Env = LedgerApiEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  GITHUB_TOKEN?: string;
  STATUS_OVERLAY_REPOSITORY?: string;
  STATUS_OVERLAY_RUNTIME_ENABLED?: string;

  /**
   * AC7 Authority services. These are service bindings only; the Main Worker
   * holds neither Authority D1 binding nor receipt signing/deploy credentials.
   */
  AUTHORITY_RECORDER?: ServiceBinding;
  AUTHORITY_EXECUTOR?: ServiceBinding;
};

const TARGET_REPOSITORY = "yasutakesougo/severe-behavior-support-spfx";

async function loadStatusPayload(env: Env): Promise<Record<string, unknown>> {
  const facts = await observeRepository(TARGET_REPOSITORY, env);
  const action = resolveHumanAction(facts);
  return buildStatusPayload(facts, action);
}

function unavailableService(name: string): Response {
  return Response.json(
    { error: "AUTHORITY_SERVICE_UNAVAILABLE", service: name },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/auth/status") {
      return handleAuthStatus(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/repositories/overview") {
      return handleRepositoryOverviewGet();
    }

    if (request.method === "GET" && url.pathname === "/api/repositories/detail") {
      return handleRepositoryDetailGet(request);
    }

    if (request.method === "GET" && url.pathname === "/api/status") {
      const payload = await loadStatusPayload(env);
      return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/mcp") {
      return handleChatReadbackMcp(request, {
        loadStatusPayload: () => loadStatusPayload(env),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/status-overlay") {
      return handleStatusOverlayGet(env);
    }

    if (url.pathname === "/api/authority/approvals") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      if (!env.AUTHORITY_RECORDER) return unavailableService("AUTHORITY_RECORDER");
      return env.AUTHORITY_RECORDER.fetch(request);
    }

    if (url.pathname === "/api/authority/execute") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      if (!env.AUTHORITY_EXECUTOR) return unavailableService("AUTHORITY_EXECUTOR");
      return env.AUTHORITY_EXECUTOR.fetch(request);
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
