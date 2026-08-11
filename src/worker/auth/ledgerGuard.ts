import {
  accessVerifierConfigFromEnv,
  extractAccessJwt,
  getAccessJwksResolver,
  verifyAccessHumanJwt,
  type AccessKeyResolver,
  type AccessVerifyFailureReason,
  type AuthenticatedHumanPrincipal,
} from "./accessJwtVerifier";
import {
  ledgerAuthorizerFromEnv,
  type LedgerAuthzDecision,
  type LedgerAuthzDenyReason,
  type LedgerAuthzEnv,
  type LedgerCapability,
} from "./ledgerAuthorizer";

export type LedgerGuardEnv = LedgerAuthzEnv & {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
};

export type LedgerGuardResult =
  | {
      ok: true;
      principal: AuthenticatedHumanPrincipal;
      decision: Extract<LedgerAuthzDecision, { allowed: true }>;
    }
  | {
      ok: false;
      /** 401 = not authenticated, 403 = authenticated but not authorized. */
      status: 401 | 403;
      code: "UNAUTHENTICATED" | "FORBIDDEN";
      reason: AccessVerifyFailureReason | LedgerAuthzDenyReason;
    };

/**
 * Fail-closed authenticate → authorize gate for privileged Ledger requests.
 *
 * 1. Verify the Cloudflare Access JWT (issuer + audience + signature + Human).
 * 2. Resolve the configured LedgerAuthorizer; missing policy denies (deny-by-default).
 * 3. Ask the authorizer whether this scoped principal may use the capability.
 *
 * `keyResolver` is injectable for tests; production uses the cached Access JWKS.
 */
export async function requireLedgerCapability(
  request: Request,
  env: LedgerGuardEnv,
  capability: LedgerCapability,
  keyResolver?: AccessKeyResolver,
): Promise<LedgerGuardResult> {
  const config = accessVerifierConfigFromEnv(env);
  if (!config) {
    return { ok: false, status: 401, code: "UNAUTHENTICATED", reason: "MISSING_CONFIGURATION" };
  }

  const token = extractAccessJwt(request);
  const resolver = keyResolver ?? getAccessJwksResolver(config.expectedIssuer);
  const verified = await verifyAccessHumanJwt(token, config, resolver);
  if (!verified.ok) {
    return { ok: false, status: 401, code: "UNAUTHENTICATED", reason: verified.reason };
  }

  const authorizer = ledgerAuthorizerFromEnv(env);
  if (!authorizer) {
    return { ok: false, status: 403, code: "FORBIDDEN", reason: "AUTHZ_UNAVAILABLE" };
  }

  const decision = await authorizer.authorize(verified.principal, capability);
  if (!decision.allowed) {
    return { ok: false, status: 403, code: "FORBIDDEN", reason: decision.reason };
  }

  return { ok: true, principal: verified.principal, decision };
}

/**
 * Uniform denial response. Never leaks principal identity fields, and keeps
 * granular verification failure reasons server-side only.
 */
export function ledgerGuardDenialResponse(
  result: Extract<LedgerGuardResult, { ok: false }>,
): Response {
  return Response.json(
    { error: result.code },
    { status: result.status, headers: { "Cache-Control": "no-store" } },
  );
}
