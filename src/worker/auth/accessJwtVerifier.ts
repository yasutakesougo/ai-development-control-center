import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

/**
 * Scoped Human principal after fail-closed Access JWT verification.
 * displayName / email are intentionally omitted from the trusted principal.
 */
export type AuthenticatedHumanPrincipal = {
  issuer: string;
  subjectId: string;
};

export type AccessVerifierConfig = {
  /** Exact expected JWT `iss` (e.g. https://<team>.cloudflareaccess.com). */
  expectedIssuer: string;
  /** Expected Access application audience (`aud`). */
  expectedAudience: string;
};

export type AccessVerifyFailureReason =
  | "MISSING_CONFIGURATION"
  | "MISSING_TOKEN"
  | "INVALID_SIGNATURE"
  | "UNEXPECTED_ISSUER"
  | "UNEXPECTED_AUDIENCE"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "MISSING_SUBJECT"
  | "NON_HUMAN_PRINCIPAL"
  | "INVALID_TOKEN";

export type AccessVerifyResult =
  | { ok: true; principal: AuthenticatedHumanPrincipal }
  | { ok: false; reason: AccessVerifyFailureReason };

export type AccessKeyResolver = JWTVerifyGetKey | CryptoKey | Uint8Array;

const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const ACCESS_SIGNING_ALGORITHMS = ["RS256"] as const;

/** Issuer-keyed cache so the same trusted issuer reuses one remote JWKS resolver. */
const jwksResolverByIssuer = new Map<string, JWTVerifyGetKey>();

/**
 * Extract Cloudflare Access JWT from the request.
 * Browser query/body identity fields are never consulted.
 */
export function extractAccessJwt(request: Request): string | null {
  const header = request.headers.get(ACCESS_JWT_HEADER);
  if (!header) return null;
  const token = header.trim();
  return token.length > 0 ? token : null;
}

export function isAccessVerifierConfigured(config: Partial<AccessVerifierConfig> | null | undefined): boolean {
  return Boolean(
    config?.expectedIssuer &&
      config.expectedIssuer.trim() &&
      config.expectedAudience &&
      config.expectedAudience.trim(),
  );
}

/**
 * Cloudflare Access service tokens carry a non-empty `common_name`.
 * `type: "app"` is NOT a discriminator — Human application JWTs also use it.
 */
export function isNonHumanAccessPrincipal(payload: JWTPayload): boolean {
  return typeof payload.common_name === "string" && payload.common_name.trim().length > 0;
}

function normalizeIssuer(issuer: string): string {
  return issuer.trim().replace(/\/$/, "");
}

function normalizeConfig(config: AccessVerifierConfig): AccessVerifierConfig | null {
  const expectedIssuer = config.expectedIssuer ? normalizeIssuer(config.expectedIssuer) : "";
  const expectedAudience = config.expectedAudience?.trim() ?? "";
  if (!expectedIssuer || !expectedAudience) return null;
  return { expectedIssuer, expectedAudience };
}

function mapVerifyError(error: unknown): AccessVerifyFailureReason {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  const message = error instanceof Error ? error.message : String(error);
  const claim =
    typeof error === "object" && error && "claim" in error
      ? String((error as { claim?: string }).claim)
      : "";

  if (code === "ERR_JWT_EXPIRED") return "EXPIRED";
  if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
    if (claim === "iss" || /"iss"|iss claim/i.test(message)) return "UNEXPECTED_ISSUER";
    if (claim === "aud" || /"aud"|aud claim/i.test(message)) return "UNEXPECTED_AUDIENCE";
    if (claim === "nbf" || /"nbf"|nbf claim|not[\s-]?yet/i.test(message)) return "NOT_YET_VALID";
    if (claim === "exp" || /"exp"|exp claim|timestamp check failed/i.test(message)) return "EXPIRED";
    if (claim === "sub" || /"sub"|sub claim/i.test(message)) return "MISSING_SUBJECT";
  }
  if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" || /signature verification failed/i.test(message)) {
    return "INVALID_SIGNATURE";
  }
  if (/"iss"|unexpected.*"iss"/i.test(message)) return "UNEXPECTED_ISSUER";
  if (/"aud"|unexpected.*"aud"/i.test(message)) return "UNEXPECTED_AUDIENCE";
  if (/"nbf"|not yet valid/i.test(message)) return "NOT_YET_VALID";
  if (/"exp"|jwt expired/i.test(message)) return "EXPIRED";
  return "INVALID_TOKEN";
}

/**
 * Fail-closed Cloudflare Access JWT verifier.
 *
 * Authentication only: a successful result means a Human principal was verified.
 * It does NOT grant ledger.write authorization.
 */
export async function verifyAccessHumanJwt(
  token: string | null | undefined,
  config: AccessVerifierConfig,
  keyResolver: AccessKeyResolver,
): Promise<AccessVerifyResult> {
  const normalized = normalizeConfig(config);
  if (!normalized) {
    return { ok: false, reason: "MISSING_CONFIGURATION" };
  }

  if (!token || !token.trim()) {
    return { ok: false, reason: "MISSING_TOKEN" };
  }

  try {
    const { payload } = await jwtVerify(token, keyResolver, {
      issuer: normalized.expectedIssuer,
      audience: normalized.expectedAudience,
      algorithms: [...ACCESS_SIGNING_ALGORITHMS],
      clockTolerance: 0,
    });

    const issuer = typeof payload.iss === "string" ? normalizeIssuer(payload.iss) : "";
    if (!issuer || issuer !== normalized.expectedIssuer) {
      return { ok: false, reason: "UNEXPECTED_ISSUER" };
    }

    const subjectId = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!subjectId) {
      return { ok: false, reason: "MISSING_SUBJECT" };
    }

    if (isNonHumanAccessPrincipal(payload)) {
      return { ok: false, reason: "NON_HUMAN_PRINCIPAL" };
    }

    return {
      ok: true,
      principal: {
        issuer,
        subjectId,
      },
    };
  } catch (error) {
    return { ok: false, reason: mapVerifyError(error) };
  }
}

/**
 * Return a cached remote JWKS resolver for the configured trusted issuer.
 * JWKS URL is derived only from configured issuer — never from untrusted JWT claims.
 */
export function getAccessJwksResolver(expectedIssuer: string): JWTVerifyGetKey {
  const issuer = normalizeIssuer(expectedIssuer);
  const cached = jwksResolverByIssuer.get(issuer);
  if (cached) return cached;

  const resolver = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  jwksResolverByIssuer.set(issuer, resolver);
  return resolver;
}

/** Test helper: clear issuer-keyed JWKS cache. */
export function clearAccessJwksResolverCache(): void {
  jwksResolverByIssuer.clear();
}

/** Test helper: inspect whether an issuer already has a cached resolver. */
export function hasCachedAccessJwksResolver(expectedIssuer: string): boolean {
  return jwksResolverByIssuer.has(normalizeIssuer(expectedIssuer));
}

export function accessVerifierConfigFromEnv(env: {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}): AccessVerifierConfig | null {
  const expectedIssuer = env.ACCESS_TEAM_DOMAIN?.trim();
  const expectedAudience = env.ACCESS_AUD?.trim();
  if (!expectedIssuer || !expectedAudience) return null;
  return {
    expectedIssuer: normalizeIssuer(expectedIssuer),
    expectedAudience,
  };
}
