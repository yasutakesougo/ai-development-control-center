import type {
  AuthorizationReceiptV1,
  CanonicalApprovalPayloadV1,
} from "../../domain/authorityApproval";
import type { D1DatabaseLike } from "../ledger/ledgerStore";
import type { ReceiptConsumptionStore } from "../execution/executionEnforcement";

export interface AuthorityApprovalRecord {
  approvalRecordId: string;
  payload: CanonicalApprovalPayloadV1;
  payloadDigest: string;
  humanDecisionRef: string;
  approverIssuer: string;
  approverSubjectId: string;
  issuedAt: string;
  receipt: AuthorizationReceiptV1;
}

export interface NewAuthorityApprovalRecordInput extends AuthorityApprovalRecord {}

type AuthorityApprovalRow = {
  approval_record_id: string;
  payload_json: string;
  payload_digest: string;
  human_decision_ref: string;
  approver_issuer: string;
  approver_subject_id: string;
  issued_at: string;
  receipt_json: string;
};

function rowToRecord(row: AuthorityApprovalRow): AuthorityApprovalRecord {
  return {
    approvalRecordId: row.approval_record_id,
    payload: JSON.parse(row.payload_json) as CanonicalApprovalPayloadV1,
    payloadDigest: row.payload_digest,
    humanDecisionRef: row.human_decision_ref,
    approverIssuer: row.approver_issuer,
    approverSubjectId: row.approver_subject_id,
    issuedAt: row.issued_at,
    receipt: JSON.parse(row.receipt_json) as AuthorizationReceiptV1,
  };
}

export async function findAuthorityApprovalByDecisionRef(
  db: D1DatabaseLike,
  approverIssuer: string,
  approverSubjectId: string,
  humanDecisionRef: string,
): Promise<AuthorityApprovalRecord | null> {
  const row = await db
    .prepare(
      `SELECT approval_record_id, payload_json, payload_digest, human_decision_ref,
              approver_issuer, approver_subject_id, issued_at, receipt_json
         FROM authority_approval_records
        WHERE approver_issuer = ?
          AND approver_subject_id = ?
          AND human_decision_ref = ?`,
    )
    .bind(approverIssuer, approverSubjectId, humanDecisionRef)
    .first<AuthorityApprovalRow>();
  return row ? rowToRecord(row) : null;
}

export type AppendAuthorityApprovalResult =
  | { outcome: "RECORDED"; record: AuthorityApprovalRecord }
  | { outcome: "REPLAYED"; record: AuthorityApprovalRecord }
  | { outcome: "DECISION_REF_CONFLICT" };

export async function appendAuthorityApprovalRecord(
  db: D1DatabaseLike,
  input: NewAuthorityApprovalRecordInput,
): Promise<AppendAuthorityApprovalResult> {
  const existing = await findAuthorityApprovalByDecisionRef(
    db,
    input.approverIssuer,
    input.approverSubjectId,
    input.humanDecisionRef,
  );
  if (existing) {
    return existing.payloadDigest === input.payloadDigest
      ? { outcome: "REPLAYED", record: existing }
      : { outcome: "DECISION_REF_CONFLICT" };
  }

  try {
    await db
      .prepare(
        `INSERT INTO authority_approval_records (
           approval_record_id, schema_version, payload_json, payload_digest,
           human_decision_ref, approver_issuer, approver_subject_id, issued_at,
           receipt_json
         ) VALUES (?, 'AUTHORITY-APPROVAL-RECORD-V1', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.approvalRecordId,
        JSON.stringify(input.payload),
        input.payloadDigest,
        input.humanDecisionRef,
        input.approverIssuer,
        input.approverSubjectId,
        input.issuedAt,
        JSON.stringify(input.receipt),
      )
      .run();
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await findAuthorityApprovalByDecisionRef(
      db,
      input.approverIssuer,
      input.approverSubjectId,
      input.humanDecisionRef,
    );
    if (!raced) throw error;
    return raced.payloadDigest === input.payloadDigest
      ? { outcome: "REPLAYED", record: raced }
      : { outcome: "DECISION_REF_CONFLICT" };
  }

  const record = await findAuthorityApprovalByDecisionRef(
    db,
    input.approverIssuer,
    input.approverSubjectId,
    input.humanDecisionRef,
  );
  if (!record) throw new Error("authority approval record not found after append");
  return { outcome: "RECORDED", record };
}

export class D1ReceiptConsumptionStore implements ReceiptConsumptionStore {
  constructor(private readonly db: D1DatabaseLike) {}

  async consume(args: {
    receiptId: string;
    approvalRecordId: string;
    payloadDigest: string;
    consumedAt: string;
    executionRef: string;
  }): Promise<"CONSUMED" | "REPLAYED"> {
    try {
      await this.db
        .prepare(
          `INSERT INTO authority_receipt_consumptions (
             receipt_id, approval_record_id, payload_digest, consumed_at, execution_ref
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          args.receiptId,
          args.approvalRecordId,
          args.payloadDigest,
          args.consumedAt,
          args.executionRef,
        )
        .run();
      return "CONSUMED";
    } catch (error) {
      if (isUniqueConstraintError(error)) return "REPLAYED";
      throw error;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(message);
}
