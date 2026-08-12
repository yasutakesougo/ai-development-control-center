import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACTION_GATEWAY_ALLOWED_CAPABILITIES,
  ACTION_GATEWAY_ALLOWED_REPOSITORIES,
  ACTION_GATEWAY_AUTHORIZATION_DEFAULT_TTL_MS,
  ACTION_GATEWAY_EXECUTION_IMPLEMENTED,
  GITHUB_COMMENT_ADAPTER_IMPLEMENTED,
  GITHUB_COMMENT_CREATE_CAPABILITY_ID,
  assertCommentResultInvariants,
  computeCommentRequestFingerprint,
  effectiveAuthorizationExpiryMs,
  evaluateCommentRequestPreWrite,
  reconcileUnknownCommentOutcome,
  type ActionGatewayCommentRequestV1,
  type ActionGatewayCommentResultV1,
  type ActionGatewayPreWriteOptions,
} from "../src/domain/actionGatewayCommentContract";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/action-gateway/fixtures",
);

const NOW = "2026-08-12T07:00:00.000Z";

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as T;
}

async function validRequest(): Promise<ActionGatewayCommentRequestV1> {
  const request = loadFixture<ActionGatewayCommentRequestV1>("request-valid.json");
  const fingerprint = await computeCommentRequestFingerprint({
    capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
    repository: request.repository,
    target: request.target,
    body: request.body,
    purpose: request.purpose,
  });
  return {
    ...request,
    humanAuthorization: {
      ...request.humanAuthorization,
      authorizedRequestFingerprint: fingerprint,
      authorizedIdempotencyKey: request.idempotencyKey,
      authorizedRequestedBy: { ...request.requestedBy },
    },
  };
}

function liveOpts(
  request: ActionGatewayCommentRequestV1,
  overrides: Partial<ActionGatewayPreWriteOptions> = {},
): ActionGatewayPreWriteOptions {
  return {
    nowIso: NOW,
    observedTargetExists: true,
    observedRepository: request.repository,
    observedTargetKind: request.target.kind,
    observedTargetNumber: request.target.number,
    ...overrides,
  };
}

describe("ACTION-GATEWAY github.comment.create.v1 design contract", () => {
  it("keeps execution and adapter unimplemented", () => {
    expect(ACTION_GATEWAY_EXECUTION_IMPLEMENTED).toBe(false);
    expect(GITHUB_COMMENT_ADAPTER_IMPLEMENTED).toBe(false);
  });

  it("allowlists exactly one capability and one repository", () => {
    expect(ACTION_GATEWAY_ALLOWED_CAPABILITIES).toEqual([
      "github.comment.create.v1",
    ]);
    expect(ACTION_GATEWAY_ALLOWED_REPOSITORIES).toEqual([
      "yasutakesougo/ai-development-control-center",
    ]);
  });

  it("fingerprint is stable for content facts", async () => {
    const base = await validRequest();
    const a = await computeCommentRequestFingerprint(base);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    const changedBody = await computeCommentRequestFingerprint({
      capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
      repository: base.repository,
      target: base.target,
      body: base.body + "\n",
      purpose: base.purpose,
    });
    expect(changedBody).not.toBe(a);
  });

  it("valid authorized request is ELIGIBLE but does not attempt write", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(request, liveOpts(request));
    expect(evaluation.status).toBe("ELIGIBLE_FOR_ADAPTER");
    expect(evaluation.writeAttempted).toBe(false);
    if (evaluation.status === "ELIGIBLE_FOR_ADAPTER") {
      expect(evaluation.executionImplemented).toBe(false);
    }
  });

  it("fail-closes malformed runtime JSON without throwing", async () => {
    await expect(evaluateCommentRequestPreWrite(null, liveOpts(await validRequest()))).resolves.toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_SCHEMA",
      writeAttempted: false,
    });
    await expect(evaluateCommentRequestPreWrite(await validRequest(), null)).resolves.toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_SCHEMA",
      writeAttempted: false,
    });
    await expect(
      evaluateCommentRequestPreWrite({ schemaVersion: "nope" }, { nowIso: NOW }),
    ).resolves.toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_SCHEMA",
      writeAttempted: false,
    });
  });

  it("STATUS-OVERLAY cannot authorize mutation", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      liveOpts(request, { overlayUsedAsAuthorization: true }),
    );
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_OVERLAY_NOT_AUTHORIZATION",
      writeAttempted: false,
    });
  });

  it("fingerprint mismatch fails closed before write", async () => {
    const request = await validRequest();
    request.humanAuthorization.authorizedRequestFingerprint = "0".repeat(64);
    const evaluation = await evaluateCommentRequestPreWrite(request, liveOpts(request));
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_FINGERPRINT_MISMATCH",
      writeAttempted: false,
    });
  });

  it("authorization for another issue number cannot be replayed", async () => {
    const request = await validRequest();
    request.humanAuthorization.authorizedTarget = { kind: "ISSUE", number: 1 };
    const evaluation = await evaluateCommentRequestPreWrite(request, liveOpts(request));
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_AUTHORIZATION_MISMATCH",
      writeAttempted: false,
    });
  });

  it("disallowed repository fails closed", async () => {
    const request = await validRequest();
    request.repository = "yasutakesougo/severe-behavior-support-spfx";
    request.humanAuthorization.authorizedRepository = request.repository;
    request.expectedObservations.repository = request.repository;
    request.humanAuthorization.authorizedRequestFingerprint =
      await computeCommentRequestFingerprint(request);
    const evaluation = await evaluateCommentRequestPreWrite(request, liveOpts(request));
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_REPOSITORY_NOT_ALLOWED",
      writeAttempted: false,
    });
  });

  it("requires an independent evaluation clock", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      liveOpts(request, { nowIso: "" }),
    );
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_EVALUATION_CLOCK_MISSING",
      writeAttempted: false,
    });
  });

  it("rejects evaluation before authorizedAt", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      liveOpts(request, { nowIso: "2026-08-12T06:00:00.000Z" }),
    );
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_AUTHORIZATION_NOT_YET_VALID",
      writeAttempted: false,
    });
  });

  it("applies default TTL when expiresAt is omitted", async () => {
    const request = await validRequest();
    delete request.humanAuthorization.expiresAt;
    const authorizedAtMs = Date.parse(request.humanAuthorization.authorizedAt);
    expect(effectiveAuthorizationExpiryMs(request.humanAuthorization.authorizedAt)).toBe(
      authorizedAtMs + ACTION_GATEWAY_AUTHORIZATION_DEFAULT_TTL_MS,
    );

    const withinTtl = await evaluateCommentRequestPreWrite(
      request,
      liveOpts(request, {
        nowIso: new Date(authorizedAtMs + 30 * 60 * 1000).toISOString(),
      }),
    );
    expect(withinTtl.status).toBe("ELIGIBLE_FOR_ADAPTER");

    const pastTtl = await evaluateCommentRequestPreWrite(
      request,
      liveOpts(request, {
        nowIso: new Date(
          authorizedAtMs + ACTION_GATEWAY_AUTHORIZATION_DEFAULT_TTL_MS + 1,
        ).toISOString(),
      }),
    );
    expect(pastTtl).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_AUTHORIZATION_EXPIRED",
      writeAttempted: false,
    });
  });

  it("expired explicit expiresAt fails closed", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      liveOpts(request, { nowIso: "2026-08-13T00:00:00.000Z" }),
    );
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_AUTHORIZATION_EXPIRED",
      writeAttempted: false,
    });
  });

  it("requires live target identity, not only exists=true", async () => {
    const request = await validRequest();
    const omittedIdentity = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
      observedTargetExists: true,
    });
    expect(omittedIdentity).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_OBSERVATION_MISSING",
      writeAttempted: false,
    });

    const mismatched = await evaluateCommentRequestPreWrite(
      request,
      liveOpts(request, { observedTargetNumber: 999 }),
    );
    expect(mismatched).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_TARGET_MISMATCH",
      writeAttempted: false,
    });
  });

  it("expected targetNodeId/title require live observed values", async () => {
    const request = await validRequest();
    request.expectedObservations.targetNodeId = "I_kwExampleNode";
    request.expectedObservations.targetTitle = "Example title";

    const missingLive = await evaluateCommentRequestPreWrite(request, liveOpts(request));
    expect(missingLive).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_OBSERVATION_MISSING",
      writeAttempted: false,
    });

    const matched = await evaluateCommentRequestPreWrite(
      request,
      liveOpts(request, {
        observedTargetNodeId: "I_kwExampleNode",
        observedTargetTitle: "Example title",
      }),
    );
    expect(matched.status).toBe("ELIGIBLE_FOR_ADAPTER");
  });

  it("rejects reusing Human authorization under a different idempotencyKey", async () => {
    const request = await validRequest();
    request.idempotencyKey = "agw-comment-41-different-key";
    const evaluation = await evaluateCommentRequestPreWrite(request, liveOpts(request));
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_IDEMPOTENCY_KEY_MISMATCH",
      writeAttempted: false,
    });
  });

  it("rejects reusing Human authorization under a different requestedBy", async () => {
    const request = await validRequest();
    request.requestedBy = {
      principalKind: "HUMAN",
      subjectId: "other-human-subject",
      issuer: request.requestedBy.issuer,
    };
    const evaluation = await evaluateCommentRequestPreWrite(request, liveOpts(request));
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_REQUESTER_MISMATCH",
      writeAttempted: false,
    });
  });

  it("UNKNOWN reconciliation prefers prior SUCCEEDED and never invents a write", () => {
    const prior = loadFixture<ActionGatewayCommentResultV1>("result-succeeded.json");
    expect(
      reconcileUnknownCommentOutcome({
        priorByIdempotencyKey: prior,
        markerMatch: null,
      }),
    ).toEqual({
      status: "SUCCEEDED",
      source: "PRIOR_RESULT",
      resultHint: prior.comment,
    });

    expect(
      reconcileUnknownCommentOutcome({
        priorByIdempotencyKey: "bad",
        markerMatch: { id: 42, url: "https://example.invalid/c/42" },
      }),
    ).toEqual({
      status: "SUCCEEDED",
      source: "MARKER",
      resultHint: { id: 42, url: "https://example.invalid/c/42" },
    });

    expect(
      reconcileUnknownCommentOutcome({
        priorByIdempotencyKey: loadFixture("result-unknown-timeout.json"),
        markerMatch: null,
      }),
    ).toEqual({ status: "UNKNOWN", source: "UNPROVEN" });
  });

  it("result invariants allow comment only on SUCCEEDED", () => {
    const succeeded = loadFixture<ActionGatewayCommentResultV1>("result-succeeded.json");
    const rejected = loadFixture<ActionGatewayCommentResultV1>(
      "result-rejected-auth-mismatch.json",
    );
    const failed = loadFixture<ActionGatewayCommentResultV1>("result-failed-github.json");
    const unknown = loadFixture<ActionGatewayCommentResultV1>(
      "result-unknown-timeout.json",
    );

    expect(assertCommentResultInvariants(succeeded)).toEqual([]);
    expect(assertCommentResultInvariants(rejected)).toEqual([]);
    expect(assertCommentResultInvariants(failed)).toEqual([]);
    expect(assertCommentResultInvariants(unknown)).toEqual([]);
    expect(assertCommentResultInvariants(null)).toEqual(["result_not_object"]);

    expect(
      assertCommentResultInvariants({
        ...failed,
        comment: { id: 1, url: "https://example.invalid/1" },
      }),
    ).toContain("FAILED_forbids_comment");
    expect(
      assertCommentResultInvariants({
        ...unknown,
        comment: { id: 1, url: "https://example.invalid/1" },
      }),
    ).toContain("UNKNOWN_forbids_comment");
  });
});
