import { generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { describe, expect, it } from "vitest";
import {
  accessVerifierConfigFromEnv,
  isAccessVerifierConfigured,
  isNonHumanAccessPrincipal,
  verifyAccessHumanJwt,
  type AccessVerifierConfig,
} from "../src/worker/auth/accessJwtVerifier";

const ISSUER = "https://example.cloudflareaccess.com";
const AUDIENCE = "test-access-aud-tag";

const config: AccessVerifierConfig = {
  expectedIssuer: ISSUER,
  expectedAudience: AUDIENCE,
};

type SyntheticKeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

async function makeKeys(): Promise<SyntheticKeyPair> {
  return generateKeyPair("RS256");
}

async function signToken(
  privateKey: SyntheticKeyPair["privateKey"],
  claims: JWTPayload,
  options?: { exp?: string | number | Date; nbf?: string | number | Date; audience?: string | string[] },
): Promise<string> {
  let builder = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(ISSUER)
    .setAudience(options?.audience ?? AUDIENCE)
    .setSubject(typeof claims.sub === "string" ? claims.sub : "human-subject-1")
    .setIssuedAt();

  if (options?.exp !== undefined) builder = builder.setExpirationTime(options.exp);
  else builder = builder.setExpirationTime("5m");

  if (options?.nbf !== undefined) builder = builder.setNotBefore(options.nbf);

  return builder.sign(privateKey);
}

describe("verifyAccessHumanJwt", () => {
  it("accepts a valid Human JWT and returns issuer + subjectId", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, { sub: "human-subject-1", email: "human@example.com" });

    const result = await verifyAccessHumanJwt(token, config, publicKey);

    expect(result).toEqual({
      ok: true,
      principal: { issuer: ISSUER, subjectId: "human-subject-1" },
    });
  });

  it("denies a missing token", async () => {
    const { publicKey } = await makeKeys();
    const result = await verifyAccessHumanJwt(null, config, publicKey);
    expect(result).toEqual({ ok: false, reason: "MISSING_TOKEN" });
  });

  it("denies an invalid signature", async () => {
    const { privateKey } = await makeKeys();
    const other = await makeKeys();
    const token = await signToken(privateKey, { sub: "human-subject-1" });

    const result = await verifyAccessHumanJwt(token, config, other.publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INVALID_SIGNATURE");
  });

  it("denies an unexpected issuer", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await new SignJWT({ sub: "human-subject-1" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://other.cloudflareaccess.com")
      .setAudience(AUDIENCE)
      .setSubject("human-subject-1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("UNEXPECTED_ISSUER");
  });

  it("denies an unexpected audience", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, { sub: "human-subject-1" }, { audience: "wrong-aud" });

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("UNEXPECTED_AUDIENCE");
  });

  it("denies an expired token", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, { sub: "human-subject-1" }, { exp: "-1s" });

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("EXPIRED");
  });

  it("denies a not-yet-valid token", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, { sub: "human-subject-1" }, { nbf: "1h" });

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NOT_YET_VALID");
  });

  it("denies a missing subject", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MISSING_SUBJECT");
  });

  it("denies an empty subject", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await new SignJWT({ sub: "   " })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject("   ")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MISSING_SUBJECT");
  });

  it("denies a service-token / non-Human principal", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, {
      sub: "service-client-id",
      common_name: "ci-service-token",
    });

    const result = await verifyAccessHumanJwt(token, config, publicKey);
    expect(result).toEqual({ ok: false, reason: "NON_HUMAN_PRINCIPAL" });
    expect(isNonHumanAccessPrincipal({ common_name: "ci-service-token" })).toBe(true);
  });

  it("denies missing verifier configuration", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, { sub: "human-subject-1" });

    const result = await verifyAccessHumanJwt(token, {
      expectedIssuer: "",
      expectedAudience: AUDIENCE,
    }, publicKey);

    expect(result).toEqual({ ok: false, reason: "MISSING_CONFIGURATION" });
    expect(isAccessVerifierConfigured({ expectedIssuer: "", expectedAudience: AUDIENCE })).toBe(false);
    expect(accessVerifierConfigFromEnv({})).toBeNull();
  });
});
