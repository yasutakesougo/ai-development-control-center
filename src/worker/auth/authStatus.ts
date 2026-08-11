import {
  accessVerifierConfigFromEnv,
  extractAccessJwt,
  getAccessJwksResolver,
  verifyAccessHumanJwt,
  type AccessKeyResolver,
} from "./accessJwtVerifier";

export type AuthStatusEnv = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
};

function unauthorizedAuthStatus(): Response {
  return Response.json(
    { authenticated: false },
    {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/**
 * READ-ONLY auth probe.
 * Authentication verification only — never grants ledger.write authorization.
 *
 * `keyResolver` is injectable for tests; production uses cached Access JWKS.
 */
export async function handleAuthStatus(
  request: Request,
  env: AuthStatusEnv,
  keyResolver?: AccessKeyResolver,
): Promise<Response> {
  const config = accessVerifierConfigFromEnv(env);
  if (!config) return unauthorizedAuthStatus();

  const token = extractAccessJwt(request);
  const resolver = keyResolver ?? getAccessJwksResolver(config.expectedIssuer);
  const result = await verifyAccessHumanJwt(token, config, resolver);

  if (!result.ok) return unauthorizedAuthStatus();

  // Do not expose issuer/subjectId/email/displayName on this probe.
  return Response.json(
    { authenticated: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
