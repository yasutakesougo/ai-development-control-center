import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_APPROVAL_PAYLOAD_V1,
  parseReceiptHmacKey,
  verifyAuthorizationReceipt,
} from "../src/domain/authorityApproval";
import { D1ReceiptConsumptionStore } from "../src/worker/authority/authorityStore";
import {
  handleAuthorityApprovalPost,
  type AuthorityRecorderEnv,
} from "../src/worker/authority/trustedAuthorityRecorder";
import { createLedgerTestDb } from "./helpers/sqliteLedgerDb";

const ISSUER = "https://example.cloudflareaccess.com";
const AUDIENCE = "authority-test-audience";
const RECEIPT_KEY_BYTES = new Uint8Array(32).fill(11);
const RECEIPT_KEY = Buffer.from(RECEIPT_KEY_BYTES).toString("base64url");

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

function env(db = createLedgerTestDb()): AuthorityRecorderEnv {
  return {
    ACCESS_TEAM_DOMAIN: ISSUER,
    ACCESS_AUD: AUDIENCE,
    AUTHORITY_AUTHZ_MODE: "access-policy",
    LEDGER_DB: db,
    AUTHORIZATION_RECEIPT_HMAC_KEY: RECEIPT_KEY,
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
  it("records authenticated Human APPROVE and returns a verifiable receipt without external effect", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await humanToken(privateKey);
    const db = createLedgerTestDb();

    const response = await handleAuthorityApprovalPost(request(token), env(db), {
      keyResolver: publicKey,
      now: () => new Date("2026-09-26T01:00:00.000Z"),
      newApprovalRecordId: () => "approval-1",
      newReceiptId: () => "receipt-1",
    });
    const result = (await response.json()) as any;

    expect(response.status).toBe(201);
    expect(result.recorded).toBe(true);
    expect(result.externalEffect).toBe(false);
    expect(result.approver).toBeUndefined();

    const key = parseReceiptHmacKey(RECEIPT_KEY);
    expect(key).not.toBeNull();
    expect(await verifyAuthorizationReceipt(result.receipt, key!)).toMatchObject({ ok: true });

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

    const missing = await handleAuthorityApprovalPost(request(undefined), env(), {
      keyResolver: publicKey,
    });
    expect(missing.status).toBe(401);

    const nonHuman = await handleAuthorityApprovalPost(
      request(await serviceToken(privateKey)),
      env(),
      { keyResolver: publicKey },
    );
    expect(nonHuman.status).toBe(401);
  });

  it("fails closed when authority policy, D1, or receipt key is unavailable", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await humanToken(privateKey);
    const base = env();

    const noPolicy = await handleAuthorityApprovalPost(
      request(token),
      { ...base, AUTHORITY_AUTHZ_MODE: undefined },
      { keyResolver: publicKey },
    );
    expect(noPolicy.status).toBe(403);

    const noDb = await handleAuthorityApprovalPost(
      request(token),
      { ...base, LEDGER_DB: undefined },
      { keyResolver: publicKey },
    );
    expect(noDb.status).toBe(503);

    const noKey = await handleAuthorityApprovalPost(
      request(token),
      { ...base, AUTHORIZATION_RECEIPT_HMAC_KEY: undefined },
      { keyResolver: publicKey },
    );
    expect(noKey.status).toBe(503);
  });

  it("replays the same Human decision idempotently and rejects semantic conflict", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await humanToken(privateKey);
    const testEnv = env();
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
  it("consumes a single-use receipt once in D1 and keeps consumption append-only", async () => {
    const db = createLedgerTestDb();
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
