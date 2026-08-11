import { generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { describe, expect, it } from "vitest";
import {
  AccessPolicyLedgerAuthorizer,
  ledgerAuthorizerFromEnv,
} from "../src/worker/auth/ledgerAuthorizer";
import {
  ledgerGuardDenialResponse,
  requireLedgerCapability,
  type LedgerGuardEnv,
} from "../src/worker/auth/ledgerGuard";

const ISSUER = "https://example.cloudflareaccess.com";
const AUDIENCE = "test-access-aud-tag";

const authzEnv: LedgerGuardEnv = {
  ACCESS_TEAM_DOMAIN: ISSUER,
  ACCESS_AUD: AUDIENCE,
  LEDGER_AUTHZ_MODE: "access-policy",
};

type SyntheticKeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

async function makeKeys(): Promise<SyntheticKeyPair> {
  return generateKeyPair("RS256");
}

async function signToken(
  privateKey: SyntheticKeyPair["privateKey"],
  claims: JWTPayload,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

function requestWithToken(token?: string): Request {
  return new Request("https://example.test/api/ledger/records", {
    method: "POST",
    headers: token ? { "Cf-Access-Jwt-Assertion": token } : undefined,
  });
}

describe("requireLedgerCapability (authenticate → authorize)", () => {
  it("DENY: unauthenticated request (no token)", async () => {
    const { publicKey } = await makeKeys();
    const result = await requireLedgerCapability(requestWithToken(), authzEnv, "ledger.record", publicKey);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.code).toBe("UNAUTHENTICATED");
      expect(result.reason).toBe("MISSING_TOKEN");
    }
  });

  it("DENY: invalid token (bad signature)", async () => {
    const { privateKey } = await makeKeys();
    const other = await makeKeys();
    const token = await signToken(privateKey, { type: "app", sub: "human-subject-1" });

    const result = await requireLedgerCapability(
      requestWithToken(token),
      authzEnv,
      "ledger.record",
      other.publicKey,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.reason).toBe("INVALID_SIGNATURE");
    }
  });

  it("DENY: service principal (Access service token shape)", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, {
      type: "app",
      common_name: "service-client-id.access",
      sub: "service-client-id",
    });

    const result = await requireLedgerCapability(requestWithToken(token), authzEnv, "ledger.record", publicKey);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.reason).toBe("NON_HUMAN_PRINCIPAL");
    }
  });

  it("DENY: authentication valid but authorization unavailable (no LEDGER_AUTHZ_MODE)", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, { type: "app", sub: "human-subject-1" });

    const result = await requireLedgerCapability(
      requestWithToken(token),
      { ACCESS_TEAM_DOMAIN: ISSUER, ACCESS_AUD: AUDIENCE },
      "ledger.record",
      publicKey,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("FORBIDDEN");
      expect(result.reason).toBe("AUTHZ_UNAVAILABLE");
    }
  });

  it("DENY: unrecognized LEDGER_AUTHZ_MODE stays deny-by-default", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, { type: "app", sub: "human-subject-1" });

    const result = await requireLedgerCapability(
      requestWithToken(token),
      { ...authzEnv, LEDGER_AUTHZ_MODE: "allow-everyone" },
      "ledger.record",
      publicKey,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.reason).toBe("AUTHZ_UNAVAILABLE");
    }
  });

  it("ALLOW: authorized Human gets ledger.record with scoped principal", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, {
      type: "app",
      sub: "human-subject-1",
      email: "human@example.com",
    });

    const result = await requireLedgerCapability(requestWithToken(token), authzEnv, "ledger.record", publicKey);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.principal).toEqual({ issuer: ISSUER, subjectId: "human-subject-1" });
      expect(result.decision).toEqual({
        allowed: true,
        capability: "ledger.record",
        policy: "access-policy",
      });
    }
  });

  it("denial response exposes only the coarse code, never identity or granular reason", async () => {
    const { publicKey } = await makeKeys();
    const result = await requireLedgerCapability(requestWithToken(), authzEnv, "ledger.record", publicKey);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    const response = ledgerGuardDenialResponse(result);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({ error: "UNAUTHENTICATED" });
    expect(body).not.toHaveProperty("issuer");
    expect(body).not.toHaveProperty("subjectId");
    expect(body).not.toHaveProperty("reason");
  });
});

describe("LedgerAuthorizer policy layer", () => {
  it("browser-supplied identity fields are never consulted for authorization", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signToken(privateKey, { type: "app", sub: "human-subject-1" });

    const request = new Request(
      "https://example.test/api/ledger/records?approver=attacker@example.com&subjectId=fake",
      {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": token,
          "X-Approver-Email": "attacker@example.com",
        },
        body: JSON.stringify({ approver: { issuer: "https://evil.test", subjectId: "fake" } }),
      },
    );

    const result = await requireLedgerCapability(request, authzEnv, "ledger.record", publicKey);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Principal comes only from the verified JWT, never from the request surface.
      expect(result.principal).toEqual({ issuer: ISSUER, subjectId: "human-subject-1" });
    }
  });

  it("denies a principal from a different issuer even when policy is enabled", async () => {
    const authorizer = new AccessPolicyLedgerAuthorizer(ISSUER);
    const decision = await authorizer.authorize(
      { issuer: "https://other.cloudflareaccess.com", subjectId: "human-subject-1" },
      "ledger.record",
    );
    expect(decision).toEqual({ allowed: false, reason: "PRINCIPAL_NOT_AUTHORIZED" });
  });

  it("denies an empty subjectId", async () => {
    const authorizer = new AccessPolicyLedgerAuthorizer(ISSUER);
    const decision = await authorizer.authorize({ issuer: ISSUER, subjectId: "" }, "ledger.record");
    expect(decision).toEqual({ allowed: false, reason: "PRINCIPAL_NOT_AUTHORIZED" });
  });

  it("authorizes ledger.read under the same coarse Access policy", async () => {
    const authorizer = new AccessPolicyLedgerAuthorizer(ISSUER);
    const decision = await authorizer.authorize(
      { issuer: ISSUER, subjectId: "human-subject-1" },
      "ledger.read",
    );
    expect(decision).toEqual({ allowed: true, capability: "ledger.read", policy: "access-policy" });
  });

  it("ledgerAuthorizerFromEnv returns null unless mode and issuer are both configured", () => {
    expect(ledgerAuthorizerFromEnv({})).toBeNull();
    expect(ledgerAuthorizerFromEnv({ LEDGER_AUTHZ_MODE: "access-policy" })).toBeNull();
    expect(ledgerAuthorizerFromEnv({ ACCESS_TEAM_DOMAIN: ISSUER })).toBeNull();
    expect(
      ledgerAuthorizerFromEnv({ LEDGER_AUTHZ_MODE: "access-policy", ACCESS_TEAM_DOMAIN: ISSUER }),
    ).not.toBeNull();
  });
});
