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
    },
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

  it("fingerprint is stable for content facts and ignores attempt key differences", async () => {
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
    const evaluation = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
      observedTargetExists: true,
    });
    expect(evaluation.status).toBe("ELIGIBLE_FOR_ADAPTER");
    expect(evaluation.writeAttempted).toBe(false);
    if (evaluation.status === "ELIGIBLE_FOR_ADAPTER") {
      expect(evaluation.executionImplemented).toBe(false);
      expect(evaluation.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("STATUS-OVERLAY cannot authorize mutation", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
      observedTargetExists: true,
      overlayUsedAsAuthorization: true,
    });
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_OVERLAY_NOT_AUTHORIZATION",
      writeAttempted: false,
    });
  });

  it("fingerprint mismatch fails closed before write", async () => {
    const request = await validRequest();
    request.humanAuthorization.authorizedRequestFingerprint = "0".repeat(64);
    const evaluation = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
      observedTargetExists: true,
    });
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_FINGERPRINT_MISMATCH",
      writeAttempted: false,
    });
  });

  it("authorization for another issue number cannot be replayed", async () => {
    const request = await validRequest();
    request.humanAuthorization.authorizedTarget = { kind: "ISSUE", number: 1 };
    const evaluation = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
      observedTargetExists: true,
    });
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
    const fingerprint = await computeCommentRequestFingerprint(request);
    request.humanAuthorization.authorizedRequestFingerprint = fingerprint;
    const evaluation = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
      observedTargetExists: true,
    });
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_REPOSITORY_NOT_ALLOWED",
      writeAttempted: false,
    });
  });

  it("missing idempotency key fails closed", async () => {
    const request = await validRequest();
    request.idempotencyKey = "";
    const evaluation = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
      observedTargetExists: true,
    });
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_IDEMPOTENCY_KEY_MISSING",
      writeAttempted: false,
    });
  });

  it("requires an independent evaluation clock (never authorizedAt-as-now)", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(request, {
      nowIso: "",
      observedTargetExists: true,
    });
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_EVALUATION_CLOCK_MISSING",
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

    const withinTtl = await evaluateCommentRequestPreWrite(request, {
      nowIso: new Date(authorizedAtMs + 30 * 60 * 1000).toISOString(),
      observedTargetExists: true,
    });
    expect(withinTtl.status).toBe("ELIGIBLE_FOR_ADAPTER");

    const pastTtl = await evaluateCommentRequestPreWrite(request, {
      nowIso: new Date(authorizedAtMs + ACTION_GATEWAY_AUTHORIZATION_DEFAULT_TTL_MS + 1).toISOString(),
      observedTargetExists: true,
    });
    expect(pastTtl).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_AUTHORIZATION_EXPIRED",
      writeAttempted: false,
    });
  });

  it("expired explicit expiresAt fails closed with independent nowIso", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(request, {
      nowIso: "2026-08-13T00:00:00.000Z",
      observedTargetExists: true,
    });
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_AUTHORIZATION_EXPIRED",
      writeAttempted: false,
    });
  });

  it("requires live target re-observation (omitted fails closed)", async () => {
    const request = await validRequest();
    const omitted = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
    });
    expect(omitted).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_OBSERVATION_MISSING",
      writeAttempted: false,
    });

    const absent = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
      observedTargetExists: false,
    });
    expect(absent).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_TARGET_NOT_FOUND",
      writeAttempted: false,
    });
  });

  it("expected targetNodeId/title require live observed values", async () => {
    const request = await validRequest();
    request.expectedObservations.targetNodeId = "I_kwExampleNode";
    request.expectedObservations.targetTitle = "Example title";

    const missingLive = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
      observedTargetExists: true,
    });
    expect(missingLive).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_OBSERVATION_MISSING",
      writeAttempted: false,
    });

    const matched = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
      observedTargetExists: true,
      observedTargetNodeId: "I_kwExampleNode",
      observedTargetTitle: "Example title",
    });
    expect(matched.status).toBe("ELIGIBLE_FOR_ADAPTER");
  });

  it("rejects reusing Human authorization under a different idempotencyKey", async () => {
    const request = await validRequest();
    request.idempotencyKey = "agw-comment-41-different-key";
    // authorizedIdempotencyKey remains the original fixture key
    const evaluation = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
      observedTargetExists: true,
    });
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_IDEMPOTENCY_KEY_MISMATCH",
      writeAttempted: false,
    });
  });

  it("UNKNOWN reconciliation prefers prior SUCCEEDED and never invents a write", () => {
    const prior = loadFixture<ActionGatewayCommentResultV1>("result-succeeded.json");
    const fromPrior = reconcileUnknownCommentOutcome({
      priorByIdempotencyKey: prior,
      markerMatch: null,
    });
    expect(fromPrior).toEqual({
      status: "SUCCEEDED",
      source: "PRIOR_RESULT",
      resultHint: prior.comment,
    });

    const fromMarker = reconcileUnknownCommentOutcome({
      priorByIdempotencyKey: null,
      markerMatch: { id: 42, url: "https://example.invalid/c/42" },
    });
    expect(fromMarker.status).toBe("SUCCEEDED");
    expect(fromMarker.source).toBe("MARKER");

    const unproven = reconcileUnknownCommentOutcome({
      priorByIdempotencyKey: loadFixture("result-unknown-timeout.json"),
      markerMatch: null,
    });
    expect(unproven).toEqual({ status: "UNKNOWN", source: "UNPROVEN" });
  });

  it("result fixtures obey SUCCEEDED/REJECTED/FAILED/UNKNOWN shape invariants", () => {
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

    expect(rejected.comment).toBeUndefined();
    expect(rejected.timestamps.attemptedAt).toBeUndefined();
    expect(failed.timestamps.attemptedAt).toBeTruthy();
    expect(unknown.timestamps.attemptedAt).toBeTruthy();
    expect(succeeded.comment?.id).toBeTypeOf("number");
  });
});
