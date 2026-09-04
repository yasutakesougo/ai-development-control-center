import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { computeRecordableDecision } from "../src/domain/decisionFingerprint";
import type { HumanAction } from "../src/domain/humanAction";
import { resolveHumanAction } from "../src/domain/humanActionResolver";
import type { ObservedFacts, ObservedPullRequest } from "../src/domain/observedFacts";
import {
  handleLedgerRecordPost,
  handleLedgerRecordsGet,
  type LedgerApiEnv,
} from "../src/worker/ledger/recordsApi";
import { buildStatusPayload } from "../src/worker/statusApi";
import { createLedgerTestDb } from "./helpers/sqliteLedgerDb";

const ISSUER = "https://example.cloudflareaccess.com";
const AUDIENCE = "test-access-aud-tag";

type SyntheticKeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

async function makeKeys(): Promise<SyntheticKeyPair> {
  return generateKeyPair("RS256");
}

async function signHumanToken(
  privateKey: SyntheticKeyPair["privateKey"],
  sub = "human-subject-1",
): Promise<string> {
  return new SignJWT({ type: "app", sub })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setSubject(sub)
    .setExpirationTime("5m")
    .sign(privateKey);
}

function makePr(overrides: Partial<ObservedPullRequest> = {}): ObservedPullRequest {
  return {
    number: 7,
    title: "feat: something",
    draft: false,
    ci: "PASS",
    review: "PASS",
    mergeState: "CLEAN",
    humanDecisionRequired: true,
    humanDecisionEvidence: {
      state: "REQUIRED",
      source: "PR_BODY_MARKER",
      matchedMarkers: ["Human-Decision: REQUIRED"],
    },
    sourceRefs: ["https://github.com/o/r/pull/7"],
    ...overrides,
  };
}

function makeFacts(overrides: Partial<ObservedFacts> = {}): ObservedFacts {
  return {
    repository: "yasutakesougo/severe-behavior-support-spfx",
    observedAt: "2026-08-11T10:00:00.000Z",
    evidenceState: "CONFIRMED",
    currentMain: "abc123",
    openPullRequests: [makePr()],
    relevantIssueStates: {},
    errors: [],
    sourceRefs: ["github:repo:yasutakesougo/severe-behavior-support-spfx"],
    openPullRequestCount: null,
    observedPullRequestCount: null,
    omittedPullRequestCount: null,
    warnings: [],
    observationBudget: null,
    omittedPullRequests: null,
    ...overrides,
  };
}

async function currentFingerprint(facts: ObservedFacts): Promise<string> {
  const decision = await computeRecordableDecision(facts, resolveHumanAction(facts));
  expect(decision).not.toBeNull();
  return decision!.decisionFingerprint;
}

function makeEnv(db = createLedgerTestDb()): LedgerApiEnv & { LEDGER_DB: ReturnType<typeof createLedgerTestDb> } {
  return {
    ACCESS_TEAM_DOMAIN: ISSUER,
    ACCESS_AUD: AUDIENCE,
    LEDGER_AUTHZ_MODE: "access-policy",
    LEDGER_DB: db,
  };
}

function postRequest(options: {
  token?: string;
  idempotencyKey?: string;
  body?: unknown;
}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers["Cf-Access-Jwt-Assertion"] = options.token;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  return new Request("https://example.test/api/ledger/records", {
    method: "POST",
    headers,
    body: JSON.stringify(options.body ?? {}),
  });
}

describe("POST /api/ledger/records", () => {
  it("appends one immutable record for a valid current decision", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signHumanToken(privateKey);
    const env = makeEnv();
    const facts = makeFacts();
    const fingerprint = await currentFingerprint(facts);

    const response = await handleLedgerRecordPost(
      postRequest({
        token,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        body: { intent: "APPROVE", expectedDecisionFingerprint: fingerprint },
      }),
      env,
      { observe: async () => facts, keyResolver: publicKey },
    );
    const body = (await response.json()) as Record<string, unknown>;
    const record = body.record as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(body.recorded).toBe(true);
    expect(body.replayed).toBe(false);
    expect(record.intent).toBe("APPROVE");
    expect(record.decisionFingerprint).toBe(fingerprint);
    expect(record.submissionState).toBe("RECORDED");
    expect(record.externalEffect).toBe(false);
    expect(record.humanActionStatus).toBe("ACTION_REQUIRED");
    expect(record.evidenceState).toBe("CONFIRMED");
    expect(record.approver).toEqual({ issuer: ISSUER, subjectId: "human-subject-1" });
  });

  it("denies unauthenticated and unauthorized requests without writing", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const env = makeEnv();
    const facts = makeFacts();
    const fingerprint = await currentFingerprint(facts);
    const deps = { observe: async () => facts, keyResolver: publicKey };
    const body = { intent: "APPROVE", expectedDecisionFingerprint: fingerprint };

    const unauthenticated = await handleLedgerRecordPost(
      postRequest({ idempotencyKey: "k-1", body }),
      env,
      deps,
    );
    expect(unauthenticated.status).toBe(401);

    const token = await signHumanToken(privateKey);
    const noAuthz = await handleLedgerRecordPost(
      postRequest({ token, idempotencyKey: "k-2", body }),
      { ...env, LEDGER_AUTHZ_MODE: undefined },
      deps,
    );
    expect(noAuthz.status).toBe(403);

    const list = await handleLedgerRecordsGet(
      new Request("https://example.test/api/ledger/records", {
        headers: { "Cf-Access-Jwt-Assertion": token },
      }),
      env,
      { keyResolver: publicKey },
    );
    const listBody = (await list.json()) as { records: unknown[] };
    expect(listBody.records).toHaveLength(0);
  });

  it("requires an Idempotency-Key header", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signHumanToken(privateKey);
    const facts = makeFacts();
    const fingerprint = await currentFingerprint(facts);

    const response = await handleLedgerRecordPost(
      postRequest({ token, body: { intent: "APPROVE", expectedDecisionFingerprint: fingerprint } }),
      makeEnv(),
      { observe: async () => facts, keyResolver: publicKey },
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe("MISSING_IDEMPOTENCY_KEY");
  });

  it("rejects invalid intents and missing fingerprints", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signHumanToken(privateKey);
    const facts = makeFacts();
    const deps = { observe: async () => facts, keyResolver: publicKey };
    const env = makeEnv();

    for (const body of [
      { intent: "MERGE", expectedDecisionFingerprint: "x" },
      { intent: "APPROVE" },
      { intent: "APPROVE", expectedDecisionFingerprint: "" },
      "not-an-object",
    ]) {
      const response = await handleLedgerRecordPost(
        postRequest({ token, idempotencyKey: "k-1", body }),
        env,
        deps,
      );
      expect(response.status).toBe(400);
    }
  });

  it("409 STALE_DECISION when the expected fingerprint no longer matches; nothing recorded", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signHumanToken(privateKey);
    const env = makeEnv();
    const staleFingerprint = await currentFingerprint(makeFacts());
    // Live re-observation sees changed decision facts (CI now FAIL ⇒ different candidate).
    const liveFacts = makeFacts({
      openPullRequests: [makePr({ sourceRefs: ["https://github.com/o/r/pull/9"], number: 9 })],
    });

    const response = await handleLedgerRecordPost(
      postRequest({
        token,
        idempotencyKey: "k-1",
        body: { intent: "APPROVE", expectedDecisionFingerprint: staleFingerprint },
      }),
      env,
      { observe: async () => liveFacts, keyResolver: publicKey },
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(body.error).toBe("STALE_DECISION");
    expect(body.recorded).toBe(false);

    const list = await handleLedgerRecordsGet(
      new Request("https://example.test/api/ledger/records", {
        headers: { "Cf-Access-Jwt-Assertion": token },
      }),
      env,
      { keyResolver: publicKey },
    );
    expect(((await list.json()) as { records: unknown[] }).records).toHaveLength(0);
  });

  it("409 NO_RECORDABLE_DECISION when live observation is not ACTION_REQUIRED + CONFIRMED", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signHumanToken(privateKey);
    const env = makeEnv();
    const fingerprint = await currentFingerprint(makeFacts());

    for (const liveFacts of [
      makeFacts({ openPullRequests: [] }), // NO_ACTION
      makeFacts({ evidenceState: "ERROR", currentMain: null, openPullRequests: null }), // UNKNOWN
      makeFacts({ openPullRequests: [makePr({ ci: "PENDING" })] }), // WAIT
    ]) {
      const response = await handleLedgerRecordPost(
        postRequest({
          token,
          idempotencyKey: crypto.randomUUID(),
          body: { intent: "APPROVE", expectedDecisionFingerprint: fingerprint },
        }),
        env,
        { observe: async () => liveFacts, keyResolver: publicKey },
      );
      expect(response.status).toBe(409);
      expect(((await response.json()) as { error: string }).error).toBe("NO_RECORDABLE_DECISION");
    }
  });

  it("identical retry with the same idempotency key returns the existing record, no duplicate", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signHumanToken(privateKey);
    const env = makeEnv();
    const facts = makeFacts();
    const fingerprint = await currentFingerprint(facts);
    const key = "22222222-2222-4222-8222-222222222222";
    const deps = { observe: async () => facts, keyResolver: publicKey };
    const body = { intent: "REJECT", expectedDecisionFingerprint: fingerprint };

    const first = await handleLedgerRecordPost(postRequest({ token, idempotencyKey: key, body }), env, deps);
    expect(first.status).toBe(201);
    const firstRecord = ((await first.json()) as { record: { recordId: string } }).record;

    const retry = await handleLedgerRecordPost(postRequest({ token, idempotencyKey: key, body }), env, deps);
    const retryBody = (await retry.json()) as {
      recorded: boolean;
      replayed: boolean;
      record: { recordId: string };
    };

    expect(retry.status).toBe(200);
    expect(retryBody.replayed).toBe(true);
    expect(retryBody.record.recordId).toBe(firstRecord.recordId);

    const list = await handleLedgerRecordsGet(
      new Request("https://example.test/api/ledger/records", {
        headers: { "Cf-Access-Jwt-Assertion": token },
      }),
      env,
      { keyResolver: publicKey },
    );
    expect(((await list.json()) as { records: unknown[] }).records).toHaveLength(1);
  });

  it("retry works even after the live decision changed (record already durable)", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signHumanToken(privateKey);
    const env = makeEnv();
    const facts = makeFacts();
    const fingerprint = await currentFingerprint(facts);
    const key = "33333333-3333-4333-8333-333333333333";
    const body = { intent: "APPROVE", expectedDecisionFingerprint: fingerprint };

    const first = await handleLedgerRecordPost(postRequest({ token, idempotencyKey: key, body }), env, {
      observe: async () => facts,
      keyResolver: publicKey,
    });
    expect(first.status).toBe(201);

    // Same request retried while live facts changed: still replays the durable record.
    const retry = await handleLedgerRecordPost(postRequest({ token, idempotencyKey: key, body }), env, {
      observe: async () => makeFacts({ openPullRequests: [] }),
      keyResolver: publicKey,
    });
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as { replayed: boolean }).replayed).toBe(true);
  });

  it("409 IDEMPOTENCY_CONFLICT for the same key with a different semantic payload", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signHumanToken(privateKey);
    const env = makeEnv();
    const facts = makeFacts();
    const fingerprint = await currentFingerprint(facts);
    const key = "44444444-4444-4444-8444-444444444444";
    const deps = { observe: async () => facts, keyResolver: publicKey };

    const first = await handleLedgerRecordPost(
      postRequest({ token, idempotencyKey: key, body: { intent: "APPROVE", expectedDecisionFingerprint: fingerprint } }),
      env,
      deps,
    );
    expect(first.status).toBe(201);

    const conflicting = await handleLedgerRecordPost(
      postRequest({ token, idempotencyKey: key, body: { intent: "REJECT", expectedDecisionFingerprint: fingerprint } }),
      env,
      deps,
    );
    expect(conflicting.status).toBe(409);
    expect(((await conflicting.json()) as { error: string }).error).toBe("IDEMPOTENCY_CONFLICT");

    const list = await handleLedgerRecordsGet(
      new Request("https://example.test/api/ledger/records", {
        headers: { "Cf-Access-Jwt-Assertion": token },
      }),
      env,
      { keyResolver: publicKey },
    );
    expect(((await list.json()) as { records: unknown[] }).records).toHaveLength(1);
  });

  it("client-supplied idempotency key never overrides the verified principal scope", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const env = makeEnv();
    const facts = makeFacts();
    const fingerprint = await currentFingerprint(facts);
    const key = "55555555-5555-4555-8555-555555555555";
    const deps = { observe: async () => facts, keyResolver: publicKey };
    const body = { intent: "APPROVE", expectedDecisionFingerprint: fingerprint };

    const tokenA = await signHumanToken(privateKey, "human-subject-1");
    const tokenB = await signHumanToken(privateKey, "human-subject-2");

    const first = await handleLedgerRecordPost(postRequest({ token: tokenA, idempotencyKey: key, body }), env, deps);
    const second = await handleLedgerRecordPost(postRequest({ token: tokenB, idempotencyKey: key, body }), env, deps);

    expect(first.status).toBe(201);
    // Different Human, same key ⇒ distinct record, not a replay of Human A's record.
    expect(second.status).toBe(201);

    const list = await handleLedgerRecordsGet(
      new Request("https://example.test/api/ledger/records", {
        headers: { "Cf-Access-Jwt-Assertion": tokenA },
      }),
      env,
      { keyResolver: publicKey },
    );
    expect(((await list.json()) as { records: unknown[] }).records).toHaveLength(2);
  });

  it("503 LEDGER_UNAVAILABLE when no D1 binding is configured", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signHumanToken(privateKey);
    const facts = makeFacts();
    const fingerprint = await currentFingerprint(facts);
    const env = makeEnv();

    const response = await handleLedgerRecordPost(
      postRequest({
        token,
        idempotencyKey: "k-1",
        body: { intent: "APPROVE", expectedDecisionFingerprint: fingerprint },
      }),
      { ...env, LEDGER_DB: undefined },
      { observe: async () => facts, keyResolver: publicKey },
    );
    expect(response.status).toBe(503);
  });
});

describe("GET /api/ledger/records", () => {
  it("requires authentication and authorization", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const env = makeEnv();

    const unauthenticated = await handleLedgerRecordsGet(
      new Request("https://example.test/api/ledger/records"),
      env,
      { keyResolver: publicKey },
    );
    expect(unauthenticated.status).toBe(401);

    const token = await signHumanToken(privateKey);
    const noAuthz = await handleLedgerRecordsGet(
      new Request("https://example.test/api/ledger/records", {
        headers: { "Cf-Access-Jwt-Assertion": token },
      }),
      { ...env, LEDGER_AUTHZ_MODE: undefined },
      { keyResolver: publicKey },
    );
    expect(noAuthz.status).toBe(403);
  });

  it("returns newest-first audit fields without secrets", async () => {
    const { privateKey, publicKey } = await makeKeys();
    const token = await signHumanToken(privateKey);
    const env = makeEnv();
    const facts = makeFacts();
    const fingerprint = await currentFingerprint(facts);
    const deps = { observe: async () => facts, keyResolver: publicKey };

    let tick = 0;
    for (const intent of ["APPROVE", "DEFER"] as const) {
      const response = await handleLedgerRecordPost(
        postRequest({
          token,
          idempotencyKey: `key-${intent}`,
          body: { intent, expectedDecisionFingerprint: fingerprint },
        }),
        env,
        { ...deps, now: () => new Date(Date.UTC(2026, 7, 11, 10, tick++)) },
      );
      expect(response.status).toBe(201);
    }

    const list = await handleLedgerRecordsGet(
      new Request("https://example.test/api/ledger/records", {
        headers: { "Cf-Access-Jwt-Assertion": token },
      }),
      env,
      { keyResolver: publicKey },
    );
    const body = (await list.json()) as { records: Array<Record<string, unknown>> };

    expect(list.status).toBe(200);
    expect(body.records).toHaveLength(2);
    expect(body.records[0].intent).toBe("DEFER");
    expect(body.records[1].intent).toBe("APPROVE");
    for (const record of body.records) {
      expect(record.externalEffect).toBe(false);
      expect(record.submissionState).toBe("RECORDED");
      expect(record).not.toHaveProperty("idempotencyKey");
      expect(record).not.toHaveProperty("decisionFactsJson");
    }
  });
});

describe("GET /api/status decision fingerprint exposure", () => {
  it("exposes the server-computed fingerprint only for a recordable decision", async () => {
    const recordable = makeFacts();
    const payload = await buildStatusPayload(recordable, resolveHumanAction(recordable));
    expect(payload.decisionFingerprint).toMatch(/^[0-9a-f]{64}$/);

    const notRecordable = makeFacts({ openPullRequests: [] });
    const noAction = await buildStatusPayload(notRecordable, resolveHumanAction(notRecordable));
    expect(noAction).not.toHaveProperty("decisionFingerprint");

    const error = makeFacts({ evidenceState: "ERROR", currentMain: null, openPullRequests: null });
    const errorPayload = await buildStatusPayload(error, resolveHumanAction(error));
    expect(errorPayload).not.toHaveProperty("decisionFingerprint");
  });
});
