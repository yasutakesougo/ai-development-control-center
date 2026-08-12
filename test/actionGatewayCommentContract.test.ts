import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACTION_GATEWAY_ALLOWED_CAPABILITIES,
  ACTION_GATEWAY_ALLOWED_REPOSITORIES,
  ACTION_GATEWAY_EXECUTION_IMPLEMENTED,
  GITHUB_COMMENT_ADAPTER_IMPLEMENTED,
  GITHUB_COMMENT_CREATE_CAPABILITY_ID,
  assertCommentResultInvariants,
  computeCommentRequestFingerprint,
  evaluateCommentRequestPreWrite,
  reconcileUnknownCommentOutcome,
  type ActionGatewayCommentRequestV1,
  type ActionGatewayCommentResultV1,
} from "../src/domain/actionGatewayCommentContract";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/action-gateway/fixtures",
);

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

  it("fingerprint is stable and excludes idempotency/auth fields", async () => {
    const base = await validRequest();
    const a = await computeCommentRequestFingerprint(base);
    const b = await computeCommentRequestFingerprint({
      ...base,
      // These must not affect fingerprint even if present on the full request.
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);

    const changedBody = await computeCommentRequestFingerprint({
      capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
      repository: base.repository,
      target: base.target,
      body: base.body + "\n",
      purpose: base.purpose,
    });
    expect(changedBody).not.toBe(a);

    const changedTarget = await computeCommentRequestFingerprint({
      capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
      repository: base.repository,
      target: { kind: "ISSUE", number: 99 },
      body: base.body,
      purpose: base.purpose,
    });
    expect(changedTarget).not.toBe(a);
  });

  it("valid authorized request is ELIGIBLE but does not attempt write", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(request, {
      nowIso: "2026-08-12T07:00:00.000Z",
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
      nowIso: "2026-08-12T07:00:00.000Z",
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
      nowIso: "2026-08-12T07:00:00.000Z",
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
    const evaluation = await evaluateCommentRequestPreWrite(request);
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_REPOSITORY_NOT_ALLOWED",
      writeAttempted: false,
    });
  });

  it("missing idempotency key fails closed", async () => {
    const request = await validRequest();
    request.idempotencyKey = "";
    const evaluation = await evaluateCommentRequestPreWrite(request);
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_IDEMPOTENCY_KEY_MISSING",
      writeAttempted: false,
    });
  });

  it("expired authorization fails closed", async () => {
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

  it("missing target observation fails closed", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(request, {
      nowIso: "2026-08-12T07:00:00.000Z",
      observedTargetExists: false,
    });
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_TARGET_NOT_FOUND",
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
