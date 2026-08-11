import { generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { describe, expect, it } from "vitest";
import {
  accessVerifierConfigFromEnv,
  clearAccessJwksResolverCache,
  getAccessJwksResolver,
  hasCachedAccessJwksResolver,
  isAccessVerifierConfigured,
  isNonHumanAccessPrincipal,
  verifyAccessHumanJwt,
  type AccessVerifierConfig,
} from "../src/worker/auth/accessJwtVerifier";
import { handleAuthStatus } from "../src/worker/auth/authStatus";

const ISSUER = "https://example.cloudflareaccess.com";
const AUDIENCE = "test-access-aud-tag";

const config: AccessVerifierConfig = {
  expectedIssuer: ISSUER,
  expectedAudience: AUDIENCE,
};

type SyntheticKeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

async function makeKeys(alg: "RS256" | "ES256" = "RS256"): Promise<SyntheticKeyPair> {
  return generateKeyPair(alg);
}

async function signToken(
  privateKey: SyntheticKeyPair["privateKey"],
  claims: JWTPayload,
  options?: {
    alg?: "RS256" | "ES256";
    exp?: string | number | Date;
    nbf?: string | number | Date;
    audience?: string | string[];
    issuer?: string;
    includeSubjectClaim?: boolean;
  },
): Promise<string> {
  const alg = options?.alg ?? "RS256";
  const includeSubject = options?.includeSubjectClaim !== false;
  let builder = new SignJWT(claims)
    .setProtectedHeader({ alg })
    .setIssuer(options?.issuer ?? ISSUER)
    .setAudience(options?.audience ?? AUDIENCE)
    .setIssuedAt();

  if (includeSubject) {
    builder = builder.setSubject(typeof claims.sub === "string" ? claims.sub : "human-subject-1");
  }

  if (options?.exp !== undefined) builder = builder.setExpirationTime(options.exp);
  else builder = builder.setExpirationTime("5m");

  if (options?.nbf !== undefined) builder = builder.setNotBefore(options.nbf);

  return builder.sign(privateKey);
}

describe("verifyAccessHumanJwt", () => {
  it("accepts a valid Human application JWT with type=app", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, {
      type: "app",
      sub: "human-subject-1",
      email: "human@example.com",
    });

    const result = await verifyAccessHumanJwt(token, config, publicKey);

    expect(result).toEqual({
      ok: true,
      principal: { issuer: ISSUER, subjectId: "human-subject-1" },
    });
    expect(isNonHumanAccessPrincipal({ type: "app", sub: "human-subject-1" })).toBe(false);
  });

  it("denies a missing token", async () => {
    const { publicKey } = await makeKeys();
    const result = await verifyAccessHumanJwt(null, config, publicKey);
    expect(result).toEqual({ ok: false, reason: "MISSING_TOKEN" });
  });

  it("denies an invalid signature", async () => {
    const { privateKey } = await makeKeys();
    const other = await makeKeys();
    const token = await signToken(privateKey, { type: "app", sub: "human-subject-1" });

    const result = await verifyAccessHumanJwt(token, config, other.publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INVALID_SIGNATURE");
  });

  it("denies an unexpected issuer", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(
      privateKey,
      { type: "app", sub: "human-subject-1" },
      { issuer: "https://other.cloudflareaccess.com" },
    );

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("UNEXPECTED_ISSUER");
  });

  it("denies an unexpected audience", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(
      privateKey,
      { type: "app", sub: "human-subject-1" },
      { audience: "wrong-aud" },
    );

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("UNEXPECTED_AUDIENCE");
  });

  it("denies an expired token", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(
      privateKey,
      { type: "app", sub: "human-subject-1" },
      { exp: "-1s" },
    );

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("EXPIRED");
  });

  it("denies a not-yet-valid token", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(
      privateKey,
      { type: "app", sub: "human-subject-1" },
      { nbf: "1h" },
    );

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NOT_YET_VALID");
  });

  it("denies a missing subject", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, { type: "app" }, { includeSubjectClaim: false });

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MISSING_SUBJECT");
  });

  it("denies an empty subject", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, { type: "app", sub: "" });

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MISSING_SUBJECT");
  });

  it("denies a documented service-token shape even when type=app", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, {
      type: "app",
      common_name: "service-client-id.access",
      sub: "",
    });

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["MISSING_SUBJECT", "NON_HUMAN_PRINCIPAL"]).toContain(result.reason);
    }
    expect(isNonHumanAccessPrincipal({ type: "app", common_name: "service-client-id.access", sub: "" })).toBe(
      true,
    );
    expect(isNonHumanAccessPrincipal({ type: "app", sub: "human-subject-1" })).toBe(false);
  });

  it("denies a service-token with common_name even if sub is present", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, {
      type: "app",
      common_name: "service-client-id.access",
      sub: "service-client-id",
    });

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result).toEqual({ ok: false, reason: "NON_HUMAN_PRINCIPAL" });
  });

  it("denies a non-RS256 algorithm even when otherwise well-formed", async () => {
    const { privateKey, publicKey } = await makeKeys("ES256");
    const token = await signToken(
      privateKey,
      { type: "app", sub: "human-subject-1", email: "human@example.com" },
      { alg: "ES256" },
    );

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
  });

  it("denies missing verifier configuration", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, { type: "app", sub: "human-subject-1" });

    const result = await verifyAccessHumanJwt(
      token,
      {
        expectedIssuer: "",
        expectedAudience: AUDIENCE,
      },
      publicKey,
    );

    expect(result).toEqual({ ok: false, reason: "MISSING_CONFIGURATION" });
    expect(isAccessVerifierConfigured({ expectedIssuer: "", expectedAudience: AUDIENCE })).toBe(false);
    expect(accessVerifierConfigFromEnv({})).toBeNull();
  });

  it("reuses the remote JWKS resolver for the same trusted issuer", () => {
    clearAccessJwksResolverCache();
    const first = getAccessJwksResolver(ISSUER);
    const second = getAccessJwksResolver(`${ISSUER}/`);
    const other = getAccessJwksResolver("https://other.cloudflareaccess.com");

    expect(first).toBe(second);
    expect(other).not.toBe(first);
    expect(hasCachedAccessJwksResolver(ISSUER)).toBe(true);
    expect(hasCachedAccessJwksResolver("https://other.cloudflareaccess.com")).toBe(true);
    clearAccessJwksResolverCache();
  });
});

describe("GET /api/auth/status probe", () => {
  it("returns 401 when configuration is missing", async () => {
    const response = await handleAuthStatus(new Request("https://example.test/api/auth/status"), {});
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({ authenticated: false });
    expect(body).not.toHaveProperty("issuer");
    expect(body).not.toHaveProperty("subjectId");
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("displayName");
  });

  it("returns 401 for an invalid token", async () => {
    const { publicKey } = await makeKeys();
    const response = await handleAuthStatus(
      new Request("https://example.test/api/auth/status", {
        headers: { "Cf-Access-Jwt-Assertion": "not-a-jwt" },
      }),
      { ACCESS_TEAM_DOMAIN: ISSUER, ACCESS_AUD: AUDIENCE },
      publicKey,
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({ authenticated: false });
  });

  it("returns 200 for a valid Human token without identity fields", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, {
      type: "app",
      sub: "human-subject-1",
      email: "human@example.com",
    });

    const response = await handleAuthStatus(
      new Request("https://example.test/api/auth/status", {
        headers: { "Cf-Access-Jwt-Assertion": token },
      }),
      { ACCESS_TEAM_DOMAIN: ISSUER, ACCESS_AUD: AUDIENCE },
      publicKey,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({ authenticated: true });
    expect(Object.keys(body as object).sort()).toEqual(["authenticated"]);
  });
});
