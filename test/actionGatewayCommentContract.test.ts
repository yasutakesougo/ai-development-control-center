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
  parseActionGatewayIdempotencyRecord,
  parseActionGatewayPreWriteOptions,
  parseGatewayJsonBody,
  parseTrustedAuthorizationLookup,
  reconcileUnknownCommentOutcome,
  type ActionGatewayCommentRequestV1,
  type ActionGatewayCommentResultV1,
  type ActionGatewayIdempotencyRecord,
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

async function sameIdentityRecord(
  request: ActionGatewayCommentRequestV1,
  result: ActionGatewayCommentResultV1,
): Promise<ActionGatewayIdempotencyRecord> {
  const fingerprint = await computeCommentRequestFingerprint(request);
  return {
    capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
    repository: request.repository,
    target: request.target,
    requestFingerprint: fingerprint,
    idempotencyKey: request.idempotencyKey,
    requestedBy: { ...request.requestedBy },
    result: {
      ...result,
      repository: request.repository,
      target: request.target,
      requestFingerprint: fingerprint,
      idempotencyKey: request.idempotencyKey,
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

  it("parses the valid fixture once fingerprint is bound", async () => {
    const request = await validRequest();
    expect(parseActionGatewayCommentRequest(request).ok).toBe(true);
  });

  it("rejects malformed JSON syntax as REJECTED_SCHEMA without throwing", () => {
    expect(parseGatewayJsonBody("{")).toEqual({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Gateway body is not valid JSON syntax.",
    });
  });

  it("rejects unknown request properties (additionalProperties:false)", async () => {
    const request = await validRequest();
    const parsed = parseActionGatewayCommentRequest({
      ...request,
      extraField: true,
    });
    expect(parsed).toMatchObject({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
    });
  });

  it("rejects empty expectedObservations.targetNodeId/targetTitle", async () => {
    const request = await validRequest();
    expect(
      parseActionGatewayCommentRequest({
        ...request,
        expectedObservations: {
          ...request.expectedObservations,
          targetNodeId: "",
        },
      }),
    ).toMatchObject({ ok: false, reasonCode: "REJECTED_SCHEMA" });
    expect(
      parseActionGatewayCommentRequest({
        ...request,
        expectedObservations: {
          ...request.expectedObservations,
          targetTitle: "",
        },
      }),
    ).toMatchObject({ ok: false, reasonCode: "REJECTED_SCHEMA" });

    const withValues = parseActionGatewayCommentRequest({
      ...request,
      expectedObservations: {
        ...request.expectedObservations,
        targetNodeId: "I_kwDOExample",
        targetTitle: "Design issue",
      },
    });
    expect(withValues.ok).toBe(true);
  });

  it("rejects oversized evidenceRefs", async () => {
    const request = await validRequest();
    const parsed = parseActionGatewayCommentRequest({
      ...request,
      humanAuthorization: {
        ...request.humanAuthorization,
        evidenceRefs: Array.from({ length: 17 }, (_, i) => `https://example.invalid/${i}`),
      },
    });
    expect(parsed).toMatchObject({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
    });
  });

  it("default auth TTL is authorizedAt + 1h", () => {
    const authorizedAt = "2026-08-12T06:30:00.000Z";
    expect(effectiveAuthorizationExpiryMs(authorizedAt)).toBe(
      Date.parse(authorizedAt) + ACTION_GATEWAY_AUTHORIZATION_DEFAULT_TTL_MS,
    );
  });

  it("accepts a fully authorized request as ELIGIBLE_FOR_ADAPTER only (no write)", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request),
    );
    expect(evaluation).toMatchObject({
      status: "ELIGIBLE_FOR_ADAPTER",
      reasonCode: "ELIGIBLE",
      writeAttempted: false,
      executionImplemented: false,
    });
  });

  it("binds authenticatedPrincipal to requestedBy and authorizedRequestedBy", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, {
        authenticatedPrincipal: {
          principalKind: "HUMAN",
          subjectId: "other-subject",
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

  it("requires trusted VERIFIED authorization artifact lookup", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, {
        trustedAuthorizationLookup: {
          status: "MISSING",
          artifactId: request.humanAuthorization.authorizationArtifact.artifactId,
        },
      }),
    );
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_AUTHORIZATION_ARTIFACT",
      writeAttempted: false,
    });
  });

  it("rejects STATUS-OVERLAY used as authorization", async () => {
    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, { overlayUsedAsAuthorization: true }),
    );
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_OVERLAY_NOT_AUTHORIZATION",
      writeAttempted: false,
    });
  });

  it("requires independent nowIso and rejects future-dated authorization", async () => {
    const request = await validRequest();
    const early = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, { nowIso: "2026-08-12T06:00:00.000Z" }),
    );
    expect(early).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_AUTHORIZATION_NOT_YET_VALID",
    });

    const expired = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, { nowIso: "2026-08-13T00:00:00.000Z" }),
    );
    expect(expired).toMatchObject({
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

  it("terminal-replays same-identity SUCCEEDED/REJECTED/FAILED and never becomes ELIGIBLE", async () => {
    const request = await validRequest();
    const cases: Array<{
      label: string;
      fixture: string;
      status: ActionGatewayCommentResultV1["status"];
    }> = [
      { label: "SUCCEEDED", fixture: "result-succeeded.json", status: "SUCCEEDED" },
      {
        label: "REJECTED",
        fixture: "result-rejected-auth-mismatch.json",
        status: "REJECTED",
      },
      { label: "FAILED", fixture: "result-failed-github.json", status: "FAILED" },
    ];

    for (const c of cases) {
      const prior = loadFixture<ActionGatewayCommentResultV1>(c.fixture);
      const record = await sameIdentityRecord(request, prior);
      const evaluation = await evaluateCommentRequestPreWrite(
        request,
        await liveOpts(request, { existingIdempotencyRecord: record }),
      );
      expect(evaluation, c.label).toMatchObject({
        status: "REPLAY_EXISTING_RESULT",
        reasonCode: "IDEMPOTENT_REPLAY",
        writeAttempted: false,
        adapterInvocationAllowed: false,
      });
      if (evaluation.status !== "REPLAY_EXISTING_RESULT") {
        throw new Error(`expected replay for ${c.label}`);
      }
      expect(evaluation.existingResult.status).toBe(c.status);
      expect(evaluation.status).not.toBe("ELIGIBLE_FOR_ADAPTER");
    }
  });

  it("same-identity UNKNOWN replay is reconciliation-only and not ELIGIBLE", async () => {
    const request = await validRequest();
    const unknown = loadFixture<ActionGatewayCommentResultV1>("result-unknown-timeout.json");
    const record = await sameIdentityRecord(request, unknown);
    const evaluation = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, { existingIdempotencyRecord: record }),
    );
    expect(evaluation).toMatchObject({
      status: "REPLAY_EXISTING_RESULT",
      reasonCode: "IDEMPOTENT_REPLAY",
      writeAttempted: false,
      adapterInvocationAllowed: false,
    });
    if (evaluation.status !== "REPLAY_EXISTING_RESULT") {
      throw new Error("expected UNKNOWN replay");
    }
    expect(evaluation.existingResult.status).toBe("UNKNOWN");
    expect(evaluation.reasonMessage).toMatch(/reconciliation only/i);
    expect(evaluation.status).not.toBe("ELIGIBLE_FOR_ADAPTER");
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

  it("UNKNOWN reconciliation requires full identity proof including requestedBy", async () => {
    const succeeded = loadFixture<ActionGatewayCommentResultV1>("result-succeeded.json");
    const requestedBy = {
      principalKind: "HUMAN" as const,
      subjectId: "example-human-subject",
      issuer: "https://example.invalid/issuer",
    };
    const current = {
      repository: succeeded.repository,
      target: succeeded.target,
      idempotencyKey: succeeded.idempotencyKey,
      requestFingerprint: succeeded.requestFingerprint,
      requestedBy,
    };
    const priorWithRequester = { ...succeeded, requestedBy };

    expect(
      reconcileUnknownCommentOutcome({
        current,
        priorByIdempotencyKey: priorWithRequester,
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
          ...priorWithRequester,
          requestedBy: {
            principalKind: "HUMAN",
            subjectId: "other-human-subject",
            issuer: requestedBy.issuer,
          },
        },
        markerMatch: null,
      }),
    ).toEqual({ status: "UNKNOWN", source: "UNPROVEN" });

    expect(
      reconcileUnknownCommentOutcome({
        current,
        priorByIdempotencyKey: {
          ...succeeded,
          target: { kind: "ISSUE", number: 99 },
          requestedBy,
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
          // missing requestedBy
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
          requestedBy: {
            principalKind: "HUMAN",
            subjectId: "wrong-subject",
            issuer: requestedBy.issuer,
          },
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
          requestedBy,
        },
      }),
    ).toEqual({
      status: "SUCCEEDED",
      source: "MARKER",
      resultHint: { id: 42, url: "https://example.invalid/c/42" },
    });
  });

  it("fail-closes malformed trusted lookup and idempotency records as REJECTED_SCHEMA", async () => {
    expect(() =>
      parseTrustedAuthorizationLookup({
        status: "VERIFIED",
        artifactId: "a1",
      }),
    ).not.toThrow();
    expect(
      parseTrustedAuthorizationLookup({
        status: "VERIFIED",
        artifactId: "a1",
      }),
    ).toMatchObject({ ok: false, reasonCode: "REJECTED_SCHEMA" });

    expect(
      parseTrustedAuthorizationLookup({
        status: "NOT_A_REAL_STATUS",
        artifactId: "a1",
      }),
    ).toMatchObject({ ok: false, reasonCode: "REJECTED_SCHEMA" });

    expect(
      parseActionGatewayIdempotencyRecord({
        capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
        repository: "yasutakesougo/ai-development-control-center",
      }),
    ).toMatchObject({ ok: false, reasonCode: "REJECTED_SCHEMA" });

    const request = await validRequest();
    const evaluation = await evaluateCommentRequestPreWrite(request, {
      nowIso: NOW,
      authenticatedPrincipal: { ...request.requestedBy },
      trustedAuthorizationLookup: {
        status: "VERIFIED",
        artifactId: "incomplete",
      } as unknown as TrustedAuthorizationLookup,
      observedTargetExists: true,
      observedRepository: request.repository,
      observedTargetKind: request.target.kind,
      observedTargetNumber: request.target.number,
    });
    expect(evaluation).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_SCHEMA",
      writeAttempted: false,
    });

    const malformedRecordEval = await evaluateCommentRequestPreWrite(
      request,
      await liveOpts(request, {
        existingIdempotencyRecord: {
          capabilityId: GITHUB_COMMENT_CREATE_CAPABILITY_ID,
        } as unknown as ActionGatewayIdempotencyRecord,
      }),
    );
    expect(malformedRecordEval).toMatchObject({
      status: "REJECTED",
      reasonCode: "REJECTED_SCHEMA",
      writeAttempted: false,
    });

    expect(
      parseActionGatewayPreWriteOptions({
        nowIso: NOW,
        authenticatedPrincipal: { ...request.requestedBy },
        trustedAuthorizationLookup: { status: "BOGUS", artifactId: "x" },
      }),
    ).toMatchObject({ ok: false, reasonCode: "REJECTED_SCHEMA" });
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
