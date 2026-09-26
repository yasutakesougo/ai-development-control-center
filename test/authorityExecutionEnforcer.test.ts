import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_RECEIPT_ALG,
  AUTHORIZATION_RECEIPT_V1,
  CANONICAL_APPROVAL_PAYLOAD_V1,
  computeCanonicalApprovalDigest,
  issueAuthorizationReceipt,
} from "../src/domain/authorityApproval";
import { GITHUB_ACTIONS_OIDC_ISSUER } from "../src/worker/execution/githubActionsOidc";
import {
  handleAuthorityExecutionPost,
  type AuthorityExecutionEnforcerEnv,
} from "../src/workers/authorityExecutionEnforcer";
import { createReceiptConsumptionTestDb } from "./helpers/sqliteAuthorityDbs";

const AUDIENCE = "loop-graph-authority-deploy-v1";
const REPOSITORY = "yasutakesougo/ai-development-control-center";
const ENVIRONMENT = "production";
const WORKFLOW =
  "yasutakesougo/ai-development-control-center/.github/workflows/main-deployment-gateway.yml@refs/heads/main";
const ARTIFACT_REF = "1".repeat(40);
const ARTIFACT_DIGEST = "a".repeat(64);

async function receiptKeys() {
  const keyPair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicSpki = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  return {
    keyPair,
    publicKeyBase64url: Buffer.from(publicSpki).toString("base64url"),
  };
}

async function oidcToken(privateKey: CryptoKey) {
  return new SignJWT({
    repository: REPOSITORY,
    environment: ENVIRONMENT,
    job_workflow_ref: WORKFLOW,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(GITHUB_ACTIONS_OIDC_ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(`repo:${REPOSITORY}:environment:${ENVIRONMENT}`)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("Authority Execution Enforcer", () => {
  it("verifies OIDC + Receipt in no-deploy mode without consuming or mutating", async () => {
    const oidcKeys = await generateKeyPair("RS256");
    const receipt = await receiptKeys();
    const db = createReceiptConsumptionTestDb();

    const payload = {
      schema_version: CANONICAL_APPROVAL_PAYLOAD_V1,
      target: "cloudflare-worker:ai-development-control-center",
      operation: "deploy",
      scope: { environment: "production" },
      artifact_digest: ARTIFACT_DIGEST,
      evidence_digest: "b".repeat(64),
      authority_context: { gate: "human-production-deploy" },
    };

    const authorizationReceipt = await issueAuthorizationReceipt(
      {
        schema_version: AUTHORIZATION_RECEIPT_V1,
        signature_alg: AUTHORIZATION_RECEIPT_ALG,
        receipt_id: "receipt-1",
        approval_record_id: "approval-1",
        payload_digest: await computeCanonicalApprovalDigest(payload),
        human_decision_ref: "decision-1",
        approver: { issuer: "https://example.cloudflareaccess.com", subject_id: "human-1" },
        issued_at: "2026-09-26T01:00:00.000Z",
        replay_mode: "SINGLE_USE",
      },
      receipt.keyPair.privateKey,
    );

    const env: AuthorityExecutionEnforcerEnv = {
      RECEIPT_CONSUMPTION_DB: db,
      AUTHORIZATION_RECEIPT_VERIFY_KEY_SPKI_B64: receipt.publicKeyBase64url,
      GITHUB_OIDC_AUDIENCE: AUDIENCE,
      GITHUB_OIDC_REPOSITORY: REPOSITORY,
      GITHUB_OIDC_ENVIRONMENT: ENVIRONMENT,
      GITHUB_OIDC_JOB_WORKFLOW_REF: WORKFLOW,
      EXECUTION_TARGET_IDENTITY: "cloudflare-worker:ai-development-control-center",
      EXECUTION_OPERATION: "deploy",
      PRODUCTION_EXECUTION_ENABLED: "false",
    };

    const request = new Request("https://main.example/api/authority/execute", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await oidcToken(oidcKeys.privateKey)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload,
        receipt: authorizationReceipt,
        artifact_ref: ARTIFACT_REF,
        artifact_digest: ARTIFACT_DIGEST,
      }),
    });

    const response = await handleAuthorityExecutionPost(request, env, {
      oidcKeyResolver: oidcKeys.publicKey,
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: "PRODUCTION_EXECUTION_NOT_PROVISIONED",
      oidcVerified: true,
      receiptVerified: true,
      receiptConsumed: false,
      productionMutation: false,
    });

    const count = db.raw
      .prepare("SELECT COUNT(*) AS count FROM authority_receipt_consumptions")
      .get() as { count: number };
    expect(count.count).toBe(0);
  });

  it("rejects an unbound GitHub workflow before Receipt evaluation", async () => {
    const oidcKeys = await generateKeyPair("RS256");
    const receipt = await receiptKeys();
    const db = createReceiptConsumptionTestDb();

    const badToken = await new SignJWT({
      repository: REPOSITORY,
      environment: ENVIRONMENT,
      job_workflow_ref: "yasutakesougo/ai-development-control-center/.github/workflows/other.yml@refs/heads/main",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(GITHUB_ACTIONS_OIDC_ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(`repo:${REPOSITORY}:environment:${ENVIRONMENT}`)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(oidcKeys.privateKey);

    const response = await handleAuthorityExecutionPost(
      new Request("https://main.example/api/authority/execute", {
        method: "POST",
        headers: { Authorization: `Bearer ${badToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      {
        RECEIPT_CONSUMPTION_DB: db,
        AUTHORIZATION_RECEIPT_VERIFY_KEY_SPKI_B64: receipt.publicKeyBase64url,
        GITHUB_OIDC_AUDIENCE: AUDIENCE,
        GITHUB_OIDC_REPOSITORY: REPOSITORY,
        GITHUB_OIDC_ENVIRONMENT: ENVIRONMENT,
        GITHUB_OIDC_JOB_WORKFLOW_REF: WORKFLOW,
      },
      { oidcKeyResolver: oidcKeys.publicKey },
    );

    expect(response.status).toBe(401);
    expect((await response.json()) as Record<string, unknown>).toMatchObject({
      error: "INVALID_GITHUB_OIDC",
      reason: "UNEXPECTED_WORKFLOW",
    });
  });
});
