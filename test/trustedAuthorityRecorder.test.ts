import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_APPROVAL_PAYLOAD_V1,
  verifyAuthorizationReceipt,
} from "../src/domain/authorityApproval";
import { D1ReceiptConsumptionStore } from "../src/worker/authority/authorityStore";
import {
  handleAuthorityApprovalPost,
  type AuthorityRecorderEnv,
} from "../src/worker/authority/trustedAuthorityRecorder";
import {
  createApprovalAuthorityTestDb,
  createReceiptConsumptionTestDb,
} from "./helpers/sqliteAuthorityDbs";

const ISSUER = "https://example.cloudflareaccess.com";
const AUDIENCE = "authority-test-audience";

type SyntheticKeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

async function humanToken(privateKey: SyntheticKeyPair["privateKey"], subject = "human-1") {
  return new SignJWT({ type: "app" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function serviceToken(privateKey: SyntheticKeyPair["privateKey"]) {
  return new SignJWT({ type: "app", common_name: "service-token-client" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject("service-principal")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function receiptKeys() {
  const keyPair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;

  const privatePkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  );
  return {
    keyPair,
    privateKeyBase64url: Buffer.from(privatePkcs8).toString("base64url"),
  };
}

function env(
  privateKeyBase64url: string,
  db = createApprovalAuthorityTestDb(),
): AuthorityRecorderEnv {
  return {
    ACCESS_TEAM_DOMAIN: ISSUER,
    ACCESS_AUD: AUDIENCE,
    AUTHORITY_AUTHZ_MODE: "access-policy",
    APPROVAL_DB: db,
    AUTHORIZATION_RECEIPT_SIGNING_KEY_PKCS8_B64: privateKeyBase64url,
  };
}

function body(operation = "deploy") {
  return {
    decision: "APPROVE",
    human_decision_ref: "human-decision-1",
    payload: {
      schema_version: CANONICAL_APPROVAL_PAYLOAD_V1,
      target: "cloudflare-worker:ai-development-control-center",
      operation,
      scope: { environment: "production" },
      artifact_digest: "a".repeat(64),
      evidence_digest: "b".repeat(64),
      authority_context: { authority: "HUMAN" },
    },
  };
}

function request(token: string | undefined, requestBody = body()) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Cf-Access-Jwt-Assertion"] = token;
  return new Request("https://example.test/api/authority/approvals", {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });
}

describe("Trusted Authority Recorder", () => {
  it("records authenticated Human APPROVE and returns a public-key-verifiable receipt without external effect", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const signing = await receiptKeys();
    const token = await humanToken(privateKey);
    const db = createApprovalAuthorityTestDb();

    const response = await handleAuthorityApprovalPost(
      request(token),
      env(signing.privateKeyBase64url, db),
      {
        keyResolver: publicKey,
        now: () => new Date("2026-09-26T01:00:00.000Z"),
        newApprovalRecordId: () => "approval-1",
        newReceiptId: () => "receipt-1",
      },
    );
    const result = (await response.json()) as any;

    expect(response.status).toBe(201);
    expect(result.recorded).toBe(true);
    expect(result.externalEffect).toBe(false);

    expect(
      await verifyAuthorizationReceipt(result.receipt, signing.keyPair.publicKey),
    ).toMatchObject({ ok: true });

    const stored = db.raw
      .prepare("SELECT approval_record_id, payload_digest FROM authority_approval_records")
      .get() as { approval_record_id: string; payload_digest: string };
    expect(stored.approval_record_id).toBe("approval-1");
    expect(stored.payload_digest).toBe(result.approval.payloadDigest);

    expect(() =>
      db.raw
        .prepare("UPDATE authority_approval_records SET human_decision_ref = 'changed'")
        .run(),
    ).toThrow(/append-only/);
    expect(() => db.raw.prepare("DELETE FROM authority_approval_records").run()).toThrow(/append-only/);
  });

  it("rejects missing Human authentication and Access service principals", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const signing = await receiptKeys();

    const missing = await handleAuthorityApprovalPost(
      request(undefined),
      env(signing.privateKeyBase64url),
      { keyResolver: publicKey },
    );
    expect(missing.status).toBe(401);

    const nonHuman = await handleAuthorityApprovalPost(
      request(await serviceToken(privateKey)),
      env(signing.privateKeyBase64url),
      { keyResolver: publicKey },
    );
    expect(nonHuman.status).toBe(401);
  });

  it("fails closed when authority policy, approval D1, or private signing key is unavailable", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const signing = await receiptKeys();
    const token = await humanToken(privateKey);
    const base = env(signing.privateKeyBase64url);

    const noPolicy = await handleAuthorityApprovalPost(
      request(token),
      { ...base, AUTHORITY_AUTHZ_MODE: undefined },
      { keyResolver: publicKey },
    );
    expect(noPolicy.status).toBe(403);

    const noDb = await handleAuthorityApprovalPost(
      request(token),
      { ...base, APPROVAL_DB: undefined },
      { keyResolver: publicKey },
    );
    expect(noDb.status).toBe(503);

    const noKey = await handleAuthorityApprovalPost(
      request(token),
      { ...base, AUTHORIZATION_RECEIPT_SIGNING_KEY_PKCS8_B64: undefined },
      { keyResolver: publicKey },
    );
    expect(noKey.status).toBe(503);
  });

  it("replays the same Human decision idempotently and rejects semantic conflict", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const signing = await receiptKeys();
    const token = await humanToken(privateKey);
    const testEnv = env(signing.privateKeyBase64url);
    const deps = {
      keyResolver: publicKey,
      now: () => new Date("2026-09-26T01:00:00.000Z"),
      newApprovalRecordId: () => "approval-1",
      newReceiptId: () => "receipt-1",
    };

    const first = await handleAuthorityApprovalPost(request(token), testEnv, deps);
    expect(first.status).toBe(201);

    const replay = await handleAuthorityApprovalPost(request(token), testEnv, deps);
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as any).replayed).toBe(true);

    const conflict = await handleAuthorityApprovalPost(request(token, body("publish")), testEnv, deps);
    expect(conflict.status).toBe(409);
    expect(((await conflict.json()) as any).error).toBe("HUMAN_DECISION_REF_CONFLICT");
  });

  it("consumption store is physically separate and enforces one-time append-only use", async () => {
    const db = createReceiptConsumptionTestDb();
    const store = new D1ReceiptConsumptionStore(db);
    const input = {
      receiptId: "receipt-once",
      approvalRecordId: "approval-once",
      payloadDigest: "a".repeat(64),
      consumedAt: "2026-09-26T01:00:00.000Z",
      executionRef: "execution-1",
    };

    expect(await store.consume(input)).toBe("CONSUMED");
    expect(await store.consume({ ...input, executionRef: "execution-2" })).toBe("REPLAYED");

    expect(() =>
      db.raw
        .prepare("UPDATE authority_receipt_consumptions SET execution_ref = 'changed'")
        .run(),
    ).toThrow(/append-only/);
    expect(() => db.raw.prepare("DELETE FROM authority_receipt_consumptions").run()).toThrow(/append-only/);
  });
});
