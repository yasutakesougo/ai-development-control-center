import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_RECEIPT_ALG,
  AUTHORIZATION_RECEIPT_V1,
  CANONICAL_APPROVAL_PAYLOAD_V1,
  computeCanonicalApprovalDigest,
  issueAuthorizationReceipt,
  parseCanonicalApprovalPayload,
  verifyAuthorizationReceipt,
  type CanonicalApprovalPayloadV1,
} from "../src/domain/authorityApproval";

const ARTIFACT = "a".repeat(64);
const EVIDENCE = "b".repeat(64);

async function receiptKeys(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as Promise<CryptoKeyPair>;
}

function payload(overrides: Partial<CanonicalApprovalPayloadV1> = {}): CanonicalApprovalPayloadV1 {
  return {
    schema_version: CANONICAL_APPROVAL_PAYLOAD_V1,
    target: "github:yasutakesougo/ai-development-control-center",
    operation: "deploy",
    scope: { environment: "staging", components: ["worker", "assets"] },
    artifact_digest: ARTIFACT,
    evidence_digest: EVIDENCE,
    authority_context: { authority: "HUMAN", gate: "production-deploy" },
    ...overrides,
  };
}

async function receiptBody(boundPayload: CanonicalApprovalPayloadV1) {
  return {
    schema_version: AUTHORIZATION_RECEIPT_V1,
    signature_alg: AUTHORIZATION_RECEIPT_ALG,
    receipt_id: "receipt-1",
    approval_record_id: "approval-1",
    payload_digest: await computeCanonicalApprovalDigest(boundPayload),
    human_decision_ref: "human-decision-1",
    approver: { issuer: "https://example.cloudflareaccess.com", subject_id: "human-1" },
    issued_at: "2026-09-26T01:00:00.000Z",
    replay_mode: "SINGLE_USE" as const,
  };
}

describe("canonical approval payload", () => {
  it("same semantic object with different object key order produces the same digest", async () => {
    const a = payload({
      scope: { environment: "staging", components: ["worker", "assets"] },
      authority_context: { authority: "HUMAN", gate: "production-deploy" },
    });
    const b = payload({
      scope: { components: ["worker", "assets"], environment: "staging" },
      authority_context: { gate: "production-deploy", authority: "HUMAN" },
    });

    expect(await computeCanonicalApprovalDigest(a)).toBe(await computeCanonicalApprovalDigest(b));
  });

  it("normalizes digest case and surrounding identifier whitespace before hashing", () => {
    const parsed = parseCanonicalApprovalPayload({
      ...payload(),
      target: "  github:yasutakesougo/ai-development-control-center  ",
      artifact_digest: ARTIFACT.toUpperCase(),
      evidence_digest: EVIDENCE.toUpperCase(),
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.target).toBe("github:yasutakesougo/ai-development-control-center");
    expect(parsed!.artifact_digest).toBe(ARTIFACT);
    expect(parsed!.evidence_digest).toBe(EVIDENCE);
  });

  it("any bound semantic field change changes the payload digest", async () => {
    const baseline = await computeCanonicalApprovalDigest(payload());
    for (const changed of [
      payload({ target: "github:yasutakesougo/other" }),
      payload({ operation: "publish" }),
      payload({ scope: { environment: "production" } }),
      payload({ artifact_digest: "c".repeat(64) }),
      payload({ evidence_digest: "d".repeat(64) }),
      payload({ authority_context: { authority: "HUMAN", gate: "other" } }),
    ]) {
      expect(await computeCanonicalApprovalDigest(changed)).not.toBe(baseline);
    }
  });
});

describe("asymmetric authorization receipt", () => {
  it("private key signs and public key verifies the bound receipt", async () => {
    const keys = await receiptKeys();
    const receipt = await issueAuthorizationReceipt(await receiptBody(payload()), keys.privateKey);

    const result = await verifyAuthorizationReceipt(receipt, keys.publicKey);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.signature_alg).toBe("ECDSA-P256-SHA256");
    }
  });

  it("rejects a tampered receipt", async () => {
    const keys = await receiptKeys();
    const receipt = await issueAuthorizationReceipt(await receiptBody(payload()), keys.privateKey);

    const result = await verifyAuthorizationReceipt(
      { ...receipt, approval_record_id: "approval-tampered" },
      keys.publicKey,
    );
    expect(result).toEqual({ ok: false, reason: "INVALID_SIGNATURE" });
  });

  it("public verification key cannot mint a receipt", async () => {
    const keys = await receiptKeys();
    await expect(
      issueAuthorizationReceipt(await receiptBody(payload()), keys.publicKey),
    ).rejects.toThrow();
  });
});
