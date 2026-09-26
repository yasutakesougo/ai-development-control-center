import {
  computeCanonicalApprovalDigest,
  verifyAuthorizationReceipt,
  type AuthorizationReceiptV1,
  type CanonicalApprovalPayloadV1,
} from "../domain/authorityApproval";

export interface ReceiptConsumptionStore {
  consume(args: {
    receiptId: string;
    approvalRecordId: string;
    payloadDigest: string;
    consumedAt: string;
    executionRef: string;
  }): Promise<"CONSUMED" | "REPLAYED">;
}

export interface VerifiedExecutionObject<T> {
  /** Immutable/content-addressed reference (for example commit SHA or object digest URI). */
  immutableRef: string;
  /** SHA-256 digest of the exact object represented by value. */
  digest: string;
  /** Exact verified object handed to the executor after verification. */
  value: T;
}

export type ExecutionEnforcementFailure =
  | "INVALID_RECEIPT"
  | "PAYLOAD_MUTATED"
  | "ARTIFACT_MISMATCH"
  | "MUTABLE_REFERENCE"
  | "REPLAYED_RECEIPT";

export type ExecutionEnforcementResult<T> =
  | { ok: true; result: T }
  | { ok: false; reason: ExecutionEnforcementFailure };

function isImmutableReference(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  return (
    /^sha256:[0-9a-f]{64}$/i.test(normalized) ||
    /^git:[0-9a-f]{40,64}$/i.test(normalized) ||
    /^urn:sha256:[0-9a-f]{64}$/i.test(normalized)
  );
}

/**
 * Single authoritative execution boundary.
 *
 * Verification and execution are deliberately composed in one function so the
 * executor receives the same VerifiedExecutionObject instance that was checked.
 * Callers cannot substitute a later mutable artifact reference between VERIFY
 * and EXECUTE.
 */
export async function enforceAuthorizedExecution<TObject, TResult>(args: {
  payload: CanonicalApprovalPayloadV1;
  receipt: AuthorizationReceiptV1;
  receiptHmacKey: Uint8Array;
  verifiedObject: VerifiedExecutionObject<TObject>;
  consumptionStore: ReceiptConsumptionStore;
  executionRef: string;
  now?: () => Date;
  execute: (context: {
    payload: CanonicalApprovalPayloadV1;
    verifiedObject: VerifiedExecutionObject<TObject>;
    receipt: AuthorizationReceiptV1;
  }) => Promise<TResult>;
}): Promise<ExecutionEnforcementResult<TResult>> {
  const verifiedReceipt = await verifyAuthorizationReceipt(args.receipt, args.receiptHmacKey);
  if (!verifiedReceipt.ok) return { ok: false, reason: "INVALID_RECEIPT" };

  const currentPayloadDigest = await computeCanonicalApprovalDigest(args.payload);
  if (currentPayloadDigest !== verifiedReceipt.body.payload_digest) {
    return { ok: false, reason: "PAYLOAD_MUTATED" };
  }

  if (args.verifiedObject.digest.toLowerCase() !== args.payload.artifact_digest.toLowerCase()) {
    return { ok: false, reason: "ARTIFACT_MISMATCH" };
  }

  if (!isImmutableReference(args.verifiedObject.immutableRef)) {
    return { ok: false, reason: "MUTABLE_REFERENCE" };
  }

  const consumed = await args.consumptionStore.consume({
    receiptId: verifiedReceipt.body.receipt_id,
    approvalRecordId: verifiedReceipt.body.approval_record_id,
    payloadDigest: verifiedReceipt.body.payload_digest,
    consumedAt: (args.now?.() ?? new Date()).toISOString(),
    executionRef: args.executionRef,
  });
  if (consumed === "REPLAYED") {
    return { ok: false, reason: "REPLAYED_RECEIPT" };
  }

  const result = await args.execute({
    payload: args.payload,
    verifiedObject: args.verifiedObject,
    receipt: args.receipt,
  });
  return { ok: true, result };
}
