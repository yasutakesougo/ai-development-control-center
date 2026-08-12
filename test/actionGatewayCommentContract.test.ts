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
  evaluateIdempotencyConflict,
  parseActionGatewayCommentRequest,
  parseGatewayJsonBody,
  reconcileUnknownCommentOutcome,
  type ActionGatewayCommentRequestV1,
  type ActionGatewayCommentResultV1,
  type ActionGatewayPreWriteOptions,
  type TrustedAuthorizationLookup,
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

function verifiedLookup(
  request: ActionGatewayCommentRequestV1,
  fingerprint: string,
): TrustedAuthorizationLookup {
  return {
    status: "VERIFIED",
    artifactId: request.humanAuthorization.authorizationArtifact.artifactId,
    boundCapabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
    boundRepository: request.repository,
    boundTarget: request.target,
    boundRequestFingerprint: fingerprint,
    boundIdempotencyKey: request.idempotencyKey,
    boundRequestedBy: { ...request.requestedBy },
    boundAuthorizedAt: request.humanAuthorization.authorizedAt,
    boundExpiresAt: request.humanAuthorization.expiresAt,
  };
}

async function liveOpts(
  request: ActionGatewayCommentRequestV1,
  overrides: Partial<ActionGatewayPreWriteOptions> = {},
): Promise<ActionGatewayPreWriteOptions> {
  const fingerprint = await computeCommentRequestFingerprint(request);
  return {
    nowIso: NOW,
    authenticatedPrincipal: { ...request.requestedBy },
    trustedAuthorizationLookup: verifiedLookup(request, fingerprint),
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

  it("valid authorized request is ELIGIBLE but does not attempt write", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request),
    );
    expect(evaluation.status).toBe("ELIGIBLE_FOR_ADAPTER");
    expect(evaluation.writeAttempted).toBe(false);
  });

  it("requires trusted authorization artifact re-verification", async () => {
    const request = await validRequest();
    const missing = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, {
        trustedAuthorizationLookup: {
          status: "MISSING",
          artifactId: request.humanAuthorization.authorizationArtifact.artifactId,
        },
      }),
    );
    expect(missing).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_AUTHORIZATION_ARTIFACT",
      writeAttempted: false,
    });
  });

  it("binds authenticatedPrincipal to requestedBy and authorizedRequestedBy", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, {
        authenticatedPrincipal: {
          principalKind: "HUMAN",
          subjectId: "other-caller",
          issuer: request.requestedBy.issuer,
        },
      }),
    );
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_AUTHENTICATED_PRINCIPAL_MISMATCH",
      writeAttempted: false,
    });
  });

  it("rejects unknown request properties to match JSON Schema", async () => {
    const request = await validRequest();
    const parsed = parseActionGatewayCommentRequest({
      ...request,
      operation: "some-future-operation",
    });
    expect(parsed).toMatchObject({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
    });
  });

  it("enforces evidenceRefs schema limits in the runtime parser", async () => {
    const request = await validRequest();
    request.humanAuthorization.evidenceRefs = Array.from({ length: 17 }, (_, i) => `ref-${i}`);
    expect(parseActionGatewayCommentRequest(request)).toMatchObject({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
    });
  });

  it("maps JSON syntax errors to REJECTED_SCHEMA without throwing", () => {
    expect(parseGatewayJsonBody('{"schemaVersion":')).toMatchObject({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
    });
    expect(parseGatewayJsonBody(null)).toMatchObject({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
    });
    expect(parseGatewayJsonBody("{}")).toEqual({ ok: true, value: {} });
  });

  it("fail-closes malformed runtime objects without throwing", async () => {
    await expect(
      evaluateCommentRequestPreWrite(null, await liveOpts(await validRequest())),
    ).resolves.toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_SCHEMA",
      writeAttempted: false,
    });
  });

  it("rejects evaluation before authorizedAt", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, { nowIso: "2026-08-12T06:00:00.000Z" }),
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
    const pastTtl = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, {
        nowIso: new Date(
          authorizedAtMs + ACTION_GATEWAY_AUTHORIZATION_DEFAULT_TTL_MS + 1,
        ).toISOString(),
        trustedAuthorizationLookup: verifiedLookup(
          request,
          await computeCommentRequestFingerprint(request),
        ),
      }),
    );
    expect(pastTtl).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_AUTHORIZATION_EXPIRED",
    });
  });

  it("requires live target identity match", async () => {
    const request = await validRequest();
    const mismatched = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, { observedTargetNumber: 999 }),
    );
    expect(mismatched).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_TARGET_MISMATCH",
    });
  });

  it("rejects idempotency key reuse across different request fingerprints", async () => {
    const request = await validRequest();
    const fingerprint = await computeCommentRequestFingerprint(request);
    const conflict = evaluateIdempotencyConflict({
      existing: {
        capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
        repository: request.repository,
        target: { kind: "ISSUE", number: 99 },
        requestFingerprint: "0".repeat(64),
        idempotencyKey: request.idempotencyKey,
        requestedBy: request.requestedBy,
        result: loadFixture("result-succeeded.json"),
      },
      current: {
        capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
        repository: request.repository,
        target: request.target,
        requestFingerprint: fingerprint,
        idempotencyKey: request.idempotencyKey,
        requestedBy: request.requestedBy,
      },
    });
    expect(conflict).toEqual({
      outcome: "CONFLICT",
      reasonCode: "REJECTED_IDEMPOTENCY_CONFLICT",
    });

    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, {
        existingIdempotencyRecord: {
          capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
          repository: request.repository,
          target: { kind: "ISSUE", number: 99 },
          requestFingerprint: "0".repeat(64),
          idempotencyKey: request.idempotencyKey,
          requestedBy: request.requestedBy,
          result: loadFixture("result-succeeded.json"),
        },
      }),
    );
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_IDEMPOTENCY_CONFLICT",
      writeAttempted: false,
    });
  });

  it("rejects reusing Human authorization under a different idempotencyKey", async () => {
    const request = await validRequest();
    request.idempotencyKey = "agw-comment-41-different-key";
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request),
    );
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_IDEMPOTENCY_KEY_MISMATCH",
    });
  });

  it("rejects reusing Human authorization under a different requestedBy", async () => {
    const request = await validRequest();
    request.requestedBy = {
      principalKind: "HUMAN",
      subjectId: "other-human-subject",
      issuer: request.requestedBy.issuer,
    };
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, {
        authenticatedPrincipal: { ...request.requestedBy },
      }),
    );
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_REQUESTER_MISMATCH",
    });
  });

  it("UNKNOWN reconciliation requires full identity proof", async () => {
    const succeeded = loadFixture<ActionGatewayCommentResultV1>("result-succeeded.json");
    const current = {
      repository: succeeded.repository,
      target: succeeded.target,
      idempotencyKey: succeeded.idempotencyKey,
      requestFingerprint: succeeded.requestFingerprint,
    };

    expect(
      reconcileUnknownCommentOutcome({
        current,
        priorByIdempotencyKey: succeeded,
        markerMatch: null,
      }),
    ).toEqual({
      status: "SUCCEEDED",
      source: "PRIOR_RESULT",
      resultHint: succeeded.comment,
    });

    expect(
      reconcileUnknownCommentOutcome({
        current,
        priorByIdempotencyKey: {
          ...succeeded,
          target: { kind: "ISSUE", number: 99 },
        },
        markerMatch: null,
      }),
    ).toEqual({ status: "UNKNOWN", source: "UNPROVEN" });

    expect(
      reconcileUnknownCommentOutcome({
        current,
        priorByIdempotencyKey: null,
        markerMatch: {
          id: 42,
          url: "https://example.invalid/c/42",
          // key-only style marker — insufficient
          idempotencyKey: current.idempotencyKey,
        },
      }),
    ).toEqual({ status: "UNKNOWN", source: "UNPROVEN" });

    expect(
      reconcileUnknownCommentOutcome({
        current,
        priorByIdempotencyKey: null,
        markerMatch: {
          id: 42,
          url: "https://example.invalid/c/42",
          repository: current.repository,
          target: current.target,
          idempotencyKey: current.idempotencyKey,
          requestFingerprint: current.requestFingerprint,
        },
      }),
    ).toEqual({
      status: "SUCCEEDED",
      source: "MARKER",
      resultHint: { id: 42, url: "https://example.invalid/c/42" },
    });
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
    expect(
      assertCommentResultInvariants({
        ...failed,
        comment: { id: 1, url: "https://example.invalid/1" },
      }),
    ).toContain("FAILED_forbids_comment");
  });
});
