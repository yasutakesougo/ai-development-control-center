import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_RECEIPT_ALG,
  AUTHORIZATION_RECEIPT_V1,
  CANONICAL_APPROVAL_PAYLOAD_V1,
  computeCanonicalApprovalDigest,
  issueAuthorizationReceipt,
  type CanonicalApprovalPayloadV1,
} from "../src/domain/authorityApproval";
import {
  enforceAuthorizedExecution,
  type ReceiptConsumptionStore,
} from "../src/worker/execution/executionEnforcement";

const ARTIFACT = "a".repeat(64);
const EVIDENCE = "b".repeat(64);
const KEY = new Uint8Array(32).fill(9);

function payload(overrides: Partial<CanonicalApprovalPayloadV1> = {}): CanonicalApprovalPayloadV1 {
  return {
    schema_version: CANONICAL_APPROVAL_PAYLOAD_V1,
    target: "cloudflare-worker:ai-development-control-center",
    operation: "deploy",
    scope: { environment: "production" },
    artifact_digest: ARTIFACT,
    evidence_digest: EVIDENCE,
    authority_context: { gate: "human-production-deploy" },
    ...overrides,
  };
}

class MemoryConsumptionStore implements ReceiptConsumptionStore {
  readonly seen = new Set<string>();

  async consume(args: {
    receiptId: string;
    approvalRecordId: string;
    payloadDigest: string;
    consumedAt: string;
    executionRef: string;
  }): Promise<"CONSUMED" | "REPLAYED"> {
    if (this.seen.has(args.receiptId)) return "REPLAYED";
    this.seen.add(args.receiptId);
    return "CONSUMED";
  }
}

async function receiptFor(boundPayload: CanonicalApprovalPayloadV1) {
  return issueAuthorizationReceipt(
    {
      schema_version: AUTHORIZATION_RECEIPT_V1,
      signature_alg: AUTHORIZATION_RECEIPT_ALG,
      receipt_id: "receipt-1",
      approval_record_id: "approval-1",
      payload_digest: await computeCanonicalApprovalDigest(boundPayload),
      human_decision_ref: "decision-1",
      approver: { issuer: "https://example.cloudflareaccess.com", subject_id: "human-1" },
      issued_at: "2026-09-26T01:00:00.000Z",
      replay_mode: "SINGLE_USE",
    },
    KEY,
  );
}

describe("execution enforcement", () => {
  it("executes exactly the verified immutable object once", async () => {
    const boundPayload = payload();
    const receipt = await receiptFor(boundPayload);
    const consumptionStore = new MemoryConsumptionStore();
    const verifiedObject = {
      immutableRef: `sha256:${ARTIFACT}`,
      digest: ARTIFACT,
      value: { artifact: "exact-object" },
    };
    let invoked = 0;

    const first = await enforceAuthorizedExecution({
      payload: boundPayload,
      receipt,
      receiptHmacKey: KEY,
      verifiedObject,
      consumptionStore,
      executionRef: "execution-1",
      execute: async (context) => {
        invoked += 1;
        expect(context.verifiedObject).toBe(verifiedObject);
        return "EXECUTED";
      },
    });
    expect(first).toEqual({ ok: true, result: "EXECUTED" });
    expect(invoked).toBe(1);

    const replay = await enforceAuthorizedExecution({
      payload: boundPayload,
      receipt,
      receiptHmacKey: KEY,
      verifiedObject,
      consumptionStore,
      executionRef: "execution-2",
      execute: async () => {
        invoked += 1;
        return "SHOULD_NOT_RUN";
      },
    });
    expect(replay).toEqual({ ok: false, reason: "REPLAYED_RECEIPT" });
    expect(invoked).toBe(1);
  });

  it("rejects a mutated canonical payload before execution", async () => {
    const original = payload();
    const receipt = await receiptFor(original);
    let invoked = false;

    const result = await enforceAuthorizedExecution({
      payload: payload({ operation: "publish" }),
      receipt,
      receiptHmacKey: KEY,
      verifiedObject: {
        immutableRef: `sha256:${ARTIFACT}`,
        digest: ARTIFACT,
        value: {},
      },
      consumptionStore: new MemoryConsumptionStore(),
      executionRef: "execution-1",
      execute: async () => {
        invoked = true;
      },
    });

    expect(result).toEqual({ ok: false, reason: "PAYLOAD_MUTATED" });
    expect(invoked).toBe(false);
  });

  it("rejects an artifact mismatch or mutable reference", async () => {
    const boundPayload = payload();
    const receipt = await receiptFor(boundPayload);

    const mismatch = await enforceAuthorizedExecution({
      payload: boundPayload,
      receipt,
      receiptHmacKey: KEY,
      verifiedObject: {
        immutableRef: `sha256:${"c".repeat(64)}`,
        digest: "c".repeat(64),
        value: {},
      },
      consumptionStore: new MemoryConsumptionStore(),
      executionRef: "execution-1",
      execute: async () => "NO",
    });
    expect(mismatch).toEqual({ ok: false, reason: "ARTIFACT_MISMATCH" });

    const mutable = await enforceAuthorizedExecution({
      payload: boundPayload,
      receipt,
      receiptHmacKey: KEY,
      verifiedObject: {
        immutableRef: "main",
        digest: ARTIFACT,
        value: {},
      },
      consumptionStore: new MemoryConsumptionStore(),
      executionRef: "execution-2",
      execute: async () => "NO",
    });
    expect(mutable).toEqual({ ok: false, reason: "MUTABLE_REFERENCE" });
  });
});
