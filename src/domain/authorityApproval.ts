import { canonicalJson } from "./decisionFingerprint";

export const CANONICAL_APPROVAL_PAYLOAD_V1 = "CANONICAL-APPROVAL-PAYLOAD-V1" as const;
export const AUTHORIZATION_RECEIPT_V1 = "AUTHORIZATION-RECEIPT-V1" as const;
export const AUTHORIZATION_RECEIPT_ALG = "ECDSA-P256-SHA256" as const;

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

export interface CanonicalApprovalPayloadV1 {
  schema_version: typeof CANONICAL_APPROVAL_PAYLOAD_V1;
  target: string;
  operation: string;
  scope: CanonicalJsonValue;
  artifact_digest: string;
  evidence_digest: string;
  authority_context: CanonicalJsonValue;
}

export interface AuthorizationReceiptBodyV1 {
  schema_version: typeof AUTHORIZATION_RECEIPT_V1;
  signature_alg: typeof AUTHORIZATION_RECEIPT_ALG;
  receipt_id: string;
  approval_record_id: string;
  payload_digest: string;
  human_decision_ref: string;
  approver: {
    issuer: string;
    subject_id: string;
  };
  issued_at: string;
  replay_mode: "SINGLE_USE";
}

export interface AuthorizationReceiptV1 extends AuthorizationReceiptBodyV1 {
  signature: string;
}

export type ReceiptSigningKey = CryptoKey | Uint8Array;
export type ReceiptVerificationKey = CryptoKey | Uint8Array;

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeSha256(value: unknown): string | null {
  const normalized = normalizeNonEmptyString(value)?.toLowerCase() ?? "";
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeCanonicalJsonValue(value: unknown): CanonicalJsonValue | null {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  if (Array.isArray(value)) {
    const normalized: CanonicalJsonValue[] = [];
    for (const item of value) {
      const next = normalizeCanonicalJsonValue(item);
      if (item !== null && next === null) return null;
      normalized.push(next);
    }
    return normalized;
  }

  if (typeof value === "object" && isPlainObject(value)) {
    const normalized: Record<string, CanonicalJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) return null;
      const next = normalizeCanonicalJsonValue(item);
      if (item !== null && next === null) return null;
      normalized[key] = next;
    }
    return normalized;
  }

  return null;
}

export function parseCanonicalApprovalPayload(raw: unknown): CanonicalApprovalPayloadV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;

  const target = normalizeNonEmptyString(value.target);
  const operation = normalizeNonEmptyString(value.operation);
  const artifactDigest = normalizeSha256(value.artifact_digest);
  const evidenceDigest = normalizeSha256(value.evidence_digest);
  const scope = normalizeCanonicalJsonValue(value.scope);
  const authorityContext = normalizeCanonicalJsonValue(value.authority_context);

  if (
    value.schema_version !== CANONICAL_APPROVAL_PAYLOAD_V1 ||
    !target ||
    !operation ||
    !artifactDigest ||
    !evidenceDigest ||
    scope === null ||
    authorityContext === null
  ) {
    return null;
  }

  return {
    schema_version: CANONICAL_APPROVAL_PAYLOAD_V1,
    target,
    operation,
    scope,
    artifact_digest: artifactDigest,
    evidence_digest: evidenceDigest,
    authority_context: authorityContext,
  };
}

export function canonicalApprovalPayloadJson(payload: CanonicalApprovalPayloadV1): string {
  return canonicalJson(payload);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function computeCanonicalApprovalDigest(
  payload: CanonicalApprovalPayloadV1,
): Promise<string> {
  return sha256Hex(canonicalApprovalPayloadJson(payload));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function parseReceiptSigningKeyPkcs8(encoded: string | null | undefined): Uint8Array | null {
  if (!encoded) return null;
  const bytes = base64UrlToBytes(encoded.trim());
  return bytes && bytes.byteLength > 0 ? bytes : null;
}

export function parseReceiptVerificationKeySpki(encoded: string | null | undefined): Uint8Array | null {
  if (!encoded) return null;
  const bytes = base64UrlToBytes(encoded.trim());
  return bytes && bytes.byteLength > 0 ? bytes : null;
}

async function resolveSigningKey(key: ReceiptSigningKey): Promise<CryptoKey> {
  if (key instanceof CryptoKey) return key;
  return crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(key).buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function resolveVerificationKey(key: ReceiptVerificationKey): Promise<CryptoKey> {
  if (key instanceof CryptoKey) return key;
  return crypto.subtle.importKey(
    "spki",
    Uint8Array.from(key).buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

export async function issueAuthorizationReceipt(
  body: AuthorizationReceiptBodyV1,
  privateSigningKey: ReceiptSigningKey,
): Promise<AuthorizationReceiptV1> {
  const cryptoKey = await resolveSigningKey(privateSigningKey);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(canonicalJson(body)),
  );
  return {
    ...body,
    signature: bytesToBase64Url(new Uint8Array(signature)),
  };
}

export type ReceiptVerificationResult =
  | { ok: true; body: AuthorizationReceiptBodyV1 }
  | {
      ok: false;
      reason:
        | "MALFORMED_RECEIPT"
        | "UNSUPPORTED_ALGORITHM"
        | "INVALID_PAYLOAD_DIGEST"
        | "INVALID_SIGNATURE";
    };

export async function verifyAuthorizationReceipt(
  receipt: AuthorizationReceiptV1,
  publicVerificationKey: ReceiptVerificationKey,
): Promise<ReceiptVerificationResult> {
  if (
    !receipt ||
    receipt.schema_version !== AUTHORIZATION_RECEIPT_V1 ||
    receipt.replay_mode !== "SINGLE_USE" ||
    !normalizeNonEmptyString(receipt.receipt_id) ||
    !normalizeNonEmptyString(receipt.approval_record_id) ||
    !normalizeNonEmptyString(receipt.human_decision_ref) ||
    !normalizeNonEmptyString(receipt.approver?.issuer) ||
    !normalizeNonEmptyString(receipt.approver?.subject_id) ||
    !normalizeNonEmptyString(receipt.issued_at) ||
    !normalizeNonEmptyString(receipt.signature)
  ) {
    return { ok: false, reason: "MALFORMED_RECEIPT" };
  }

  if (receipt.signature_alg !== AUTHORIZATION_RECEIPT_ALG) {
    return { ok: false, reason: "UNSUPPORTED_ALGORITHM" };
  }
  if (!normalizeSha256(receipt.payload_digest)) {
    return { ok: false, reason: "INVALID_PAYLOAD_DIGEST" };
  }

  const signature = base64UrlToBytes(receipt.signature);
  if (!signature) return { ok: false, reason: "INVALID_SIGNATURE" };

  const { signature: _signature, ...body } = receipt;
  const cryptoKey = await resolveVerificationKey(publicVerificationKey);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    Uint8Array.from(signature).buffer,
    new TextEncoder().encode(canonicalJson(body)),
  );

  return valid
    ? { ok: true, body: body as AuthorizationReceiptBodyV1 }
    : { ok: false, reason: "INVALID_SIGNATURE" };
}
