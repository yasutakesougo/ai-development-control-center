/**
 * Shared canonical derivation for RUNNER-PUBLISH-HANDOFF-V1 /
 * DRAFT-PUBLISH-V1 A→B binding.
 *
 * Pure helpers only — no I/O, no adapters, no mutation.
 * DRAFT-PUBLISH must recompute these independently; self-asserted
 * handoff objects are not trusted.
 */

import { normalizeRepoPath } from "./agentTaskContract";

export const PUBLICATION_HANDOFF_CANONICAL_SCHEMA =
  "PUBLICATION-HANDOFF-V1" as const;

export const PUBLICATION_HANDOFF_CANONICAL_CAPABILITY =
  "github.draft-pr.publish.v1" as const;
export const PUBLICATION_HANDOFF_CANONICAL_RISK_CLASS = "R2" as const;
export const PUBLICATION_HANDOFF_CANONICAL_STOP_AT = "DRAFT_PR" as const;

export interface PublicationHandoffAuthoritySeedV1 {
  handoffId: string;
  sourceExecutionTaskId: string;
  sourceIssue: { repository: string; number: number };
  repository: string;
  baseRevision: string;
  verifiedChangedPaths: string[];
  verificationAttemptId: string;
  requestedPublicationCapability: string;
  requestedRiskClass: string;
  requestedStopAt: string;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function sortPublicationHandoffPathsStable(paths: string[]): string[] {
  return [...paths]
    .map((p) => normalizeRepoPath(p))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Deterministic 40-hex token from seed (not cryptographic security). */
export function deterministicHexFromSeed(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0xabcdef;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + 1), 0x01000193);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const out = `${hex(h1)}${hex(h2)}${hex(h1 ^ h2)}${hex(~h1)}${hex(h1 + h2)}`;
  return out.slice(0, 40);
}

export function computeVerificationFingerprint(input: {
  verificationAttemptId: string;
  taskId: string;
  repository: string;
  baseRevision: string;
  verifiedChangedPaths: string[];
  status: string;
}): string {
  const paths = sortPublicationHandoffPathsStable(input.verifiedChangedPaths);
  return `vf:v1:${stableJson({
    verificationAttemptId: input.verificationAttemptId,
    taskId: input.taskId,
    repository: input.repository,
    baseRevision: input.baseRevision,
    verifiedChangedPaths: paths,
    status: input.status,
  })}`;
}

export function capturePublicationHandoffAuthorityFingerprint(
  input: PublicationHandoffAuthoritySeedV1,
): PublicationHandoffAuthoritySeedV1 {
  return {
    handoffId: input.handoffId,
    sourceExecutionTaskId: input.sourceExecutionTaskId,
    sourceIssue: {
      repository: input.sourceIssue.repository,
      number: input.sourceIssue.number,
    },
    repository: input.repository,
    baseRevision: input.baseRevision,
    verifiedChangedPaths: sortPublicationHandoffPathsStable(
      input.verifiedChangedPaths,
    ),
    verificationAttemptId: input.verificationAttemptId,
    requestedPublicationCapability: input.requestedPublicationCapability,
    requestedRiskClass: input.requestedRiskClass,
    requestedStopAt: input.requestedStopAt,
  };
}

export function serializeAuthorityFingerprint(
  fp: PublicationHandoffAuthoritySeedV1,
): string {
  return `ah:v1:${stableJson(capturePublicationHandoffAuthorityFingerprint(fp))}`;
}

export function authorityFingerprintsEqual(
  a: PublicationHandoffAuthoritySeedV1,
  b: PublicationHandoffAuthoritySeedV1,
): boolean {
  return (
    serializeAuthorityFingerprint(a) === serializeAuthorityFingerprint(b)
  );
}

/**
 * Deterministic publication taskId. Seed includes handoff + source identity +
 * verified paths + requested publication authority.
 */
export function buildDeterministicPublicationTaskId(input: {
  handoffId: string;
  sourceExecutionTaskId: string;
  repository: string;
  baseRevision: string;
  verifiedChangedPaths: string[];
  requestedPublicationCapability: string;
  requestedRiskClass: string;
  requestedStopAt: string;
}): string {
  const seed = stableJson({
    handoffId: input.handoffId,
    sourceExecutionTaskId: input.sourceExecutionTaskId,
    repository: input.repository,
    baseRevision: input.baseRevision,
    verifiedChangedPaths: sortPublicationHandoffPathsStable(
      input.verifiedChangedPaths,
    ),
    requestedPublicationCapability: input.requestedPublicationCapability,
    requestedRiskClass: input.requestedRiskClass,
    requestedStopAt: input.requestedStopAt,
  });
  const hex = deterministicHexFromSeed(seed);
  return `pub-handoff-${hex}`.slice(0, 128);
}

/**
 * Independently derive canonical A→B identities from authority-bearing fields.
 * Callers must not trust self-asserted publicationTaskId / fingerprints.
 */
export function deriveCanonicalPublicationHandoffIdentities(
  seed: PublicationHandoffAuthoritySeedV1,
  verifiedBinding: {
    verificationAttemptId: string;
    sourceExecutionTaskId: string;
    repository: string;
    baseRevision: string;
    verifiedChangedPaths: string[];
  },
): {
  publicationTaskId: string;
  authorityFingerprint: string;
  verificationFingerprint: string;
  authoritySeed: PublicationHandoffAuthoritySeedV1;
} {
  const authoritySeed = capturePublicationHandoffAuthorityFingerprint(seed);
  const publicationTaskId = buildDeterministicPublicationTaskId({
    handoffId: authoritySeed.handoffId,
    sourceExecutionTaskId: authoritySeed.sourceExecutionTaskId,
    repository: authoritySeed.repository,
    baseRevision: authoritySeed.baseRevision,
    verifiedChangedPaths: authoritySeed.verifiedChangedPaths,
    requestedPublicationCapability:
      authoritySeed.requestedPublicationCapability,
    requestedRiskClass: authoritySeed.requestedRiskClass,
    requestedStopAt: authoritySeed.requestedStopAt,
  });
  const authorityFingerprint = serializeAuthorityFingerprint(authoritySeed);
  const verificationFingerprint = computeVerificationFingerprint({
    verificationAttemptId: verifiedBinding.verificationAttemptId,
    taskId: verifiedBinding.sourceExecutionTaskId,
    repository: verifiedBinding.repository,
    baseRevision: verifiedBinding.baseRevision,
    verifiedChangedPaths: verifiedBinding.verifiedChangedPaths,
    status: "VERIFIED",
  });
  return {
    publicationTaskId,
    authorityFingerprint,
    verificationFingerprint,
    authoritySeed,
  };
}
