import {
  parseCanonicalApprovalPayload,
  parseReceiptVerificationKeySpki,
  type AuthorizationReceiptV1,
} from "../../domain/authorityApproval";
import { D1ReceiptConsumptionStore } from "../../worker/authority/authorityStore";
import {
  verifyAuthorizedExecution,
  type VerifiedExecutionObject,
} from "../../worker/execution/executionEnforcement";
import {
  extractBearerToken,
  githubActionsOidcConfigFromEnv,
  verifyGithubActionsOidc,
  type GithubActionsOidcConfig,
} from "../../worker/execution/githubActionsOidc";
import type { D1DatabaseLike } from "../../worker/ledger/ledgerStore";

export type AuthorityExecutionEnforcerEnv = {
  RECEIPT_CONSUMPTION_DB?: D1DatabaseLike;
  AUTHORIZATION_RECEIPT_VERIFY_KEY_SPKI_B64?: string;

  GITHUB_OIDC_AUDIENCE?: string;
  GITHUB_OIDC_REPOSITORY?: string;
  GITHUB_OIDC_ENVIRONMENT?: string;
  GITHUB_OIDC_JOB_WORKFLOW_REF?: string;

  EXECUTION_TARGET_IDENTITY?: string;
  EXECUTION_OPERATION?: string;

  /**
   * Kept false until separate Production Deploy authorization and live
   * infrastructure evidence exist. No request can enable this flag.
   */
  PRODUCTION_EXECUTION_ENABLED?: string;

  /**
   * Reserved steady-state capability. Provision only on this Worker with an
   * Individual Worker Editor token scoped to the target Worker.
   * It is intentionally unused while production execution remains disabled.
   */
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  TARGET_WORKER_NAME?: string;
};

type ExecutionRequest = {
  payload: ReturnType<typeof parseCanonicalApprovalPayload> extends infer T
    ? Exclude<T, null>
    : never;
  receipt: AuthorizationReceiptV1;
  artifactRef: string;
  artifactDigest: string;
};

function noStoreJson(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function parseExecutionRequest(raw: unknown): ExecutionRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const payload = parseCanonicalApprovalPayload(value.payload);
  if (!payload) return null;

  const receipt = value.receipt;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return null;

  const artifactRef =
    typeof value.artifact_ref === "string" ? value.artifact_ref.trim().toLowerCase() : "";
  const artifactDigest =
    typeof value.artifact_digest === "string" ? value.artifact_digest.trim().toLowerCase() : "";

  if (!/^[0-9a-f]{40}$/.test(artifactRef)) return null;
  if (!/^[0-9a-f]{64}$/.test(artifactDigest)) return null;

  return {
    payload,
    receipt: receipt as AuthorizationReceiptV1,
    artifactRef,
    artifactDigest,
  };
}

function parseOidcConfig(env: AuthorityExecutionEnforcerEnv): GithubActionsOidcConfig | null {
  return githubActionsOidcConfigFromEnv(env);
}

/**
 * Read-only/no-deploy integration point for the designated GitHub deployment
 * gateway. It verifies GitHub OIDC identity and the Human-bound Receipt without
 * consuming the Receipt. Production execution remains fail-closed.
 */
export async function handleAuthorityExecutionPost(
  request: Request,
  env: AuthorityExecutionEnforcerEnv,
): Promise<Response> {
  const oidcConfig = parseOidcConfig(env);
  const verificationKey = parseReceiptVerificationKeySpki(
    env.AUTHORIZATION_RECEIPT_VERIFY_KEY_SPKI_B64,
  );
  const consumptionDb = env.RECEIPT_CONSUMPTION_DB;

  if (!oidcConfig || !verificationKey || !consumptionDb) {
    return noStoreJson(503, { error: "EXECUTION_ENFORCER_UNAVAILABLE" });
  }

  const oidc = await verifyGithubActionsOidc(extractBearerToken(request), oidcConfig);
  if (!oidc.ok) {
    return noStoreJson(401, { error: "INVALID_GITHUB_OIDC", reason: oidc.reason });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return noStoreJson(400, { error: "INVALID_REQUEST_BODY" });
  }
  const body = parseExecutionRequest(rawBody);
  if (!body) return noStoreJson(400, { error: "INVALID_REQUEST_BODY" });

  const expectedTarget = env.EXECUTION_TARGET_IDENTITY?.trim() ?? "";
  const expectedOperation = env.EXECUTION_OPERATION?.trim() ?? "";
  if (!expectedTarget || !expectedOperation) {
    return noStoreJson(503, { error: "EXECUTION_POLICY_UNAVAILABLE" });
  }
  if (body.payload.target !== expectedTarget || body.payload.operation !== expectedOperation) {
    return noStoreJson(403, { error: "EXECUTION_SCOPE_MISMATCH" });
  }

  const verifiedObject: VerifiedExecutionObject<{ gitCommit: string }> = {
    immutableRef: `git:${body.artifactRef}`,
    digest: body.artifactDigest,
    value: { gitCommit: body.artifactRef },
  };

  const preflight = await verifyAuthorizedExecution({
    payload: body.payload,
    receipt: body.receipt,
    receiptVerificationKey: verificationKey,
    verifiedObject,
  });
  if (!preflight.ok) {
    return noStoreJson(403, { error: "EXECUTION_AUTHORIZATION_REJECTED", reason: preflight.reason });
  }

  // Instantiating the store here proves this Worker owns only the consumption
  // capability. Preflight deliberately does not consume the Receipt.
  void new D1ReceiptConsumptionStore(consumptionDb);

  if (env.PRODUCTION_EXECUTION_ENABLED !== "true") {
    return noStoreJson(503, {
      error: "PRODUCTION_EXECUTION_NOT_PROVISIONED",
      oidcVerified: true,
      receiptVerified: true,
      receiptConsumed: false,
      productionMutation: false,
    });
  }

  // No production executor is implemented under the current no-deploy authority.
  // This remains fail-closed even if the flag is accidentally enabled.
  return noStoreJson(503, {
    error: "PRODUCTION_EXECUTOR_NOT_AUTHORIZED",
    receiptConsumed: false,
    productionMutation: false,
  });
}

export default {
  async fetch(request: Request, env: AuthorityExecutionEnforcerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/authority/execute") {
      return handleAuthorityExecutionPost(request, env);
    }
    return new Response("Not Found", { status: 404 });
  },
};
