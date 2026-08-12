/**
 * DRAFT-PUBLISH-V1 adapter boundary.
 *
 * Provider-neutral Draft PR publication interface. Domain publisher decides
 * eligibility; adapters MUST NOT decide authority.
 *
 * V1 ships a fake/in-memory adapter only.
 * REAL GITHUB PUBLICATION = HOLD
 * No filesystem / network / secrets / production mutation.
 */

import type { AgentTaskV1 } from "./agentTaskContract";

export const DRAFT_PUBLISH_ADAPTER_FAKE = "fake-in-memory" as const;
export const DRAFT_PUBLISH_PROVIDER_INTEGRATION_STATUS = "HOLD" as const;
export const DRAFT_PUBLISH_REAL_GITHUB_PUBLICATION_IMPLEMENTED = false as const;
export const DRAFT_PUBLISH_GITHUB_MUTATION_PERFORMED = false as const;

export type DraftPublishAdapterKindV1 = typeof DRAFT_PUBLISH_ADAPTER_FAKE;

export type DraftPublishAdapterPhaseFailure =
  | "observeBase"
  | "prepareBranch"
  | "writeVerifiedChanges"
  | "createCommit"
  | "publishDraftPr"
  | "collectPublicationEvidence"
  | "cleanup"
  | "timeout";

export interface DraftPublishSourceArtifactV1 {
  repository: string;
  baseRevision: string;
  headRevision: string;
  branchName: string;
  changedPaths: string[];
}

export interface DraftPublishProposedDraftPrV1 {
  title: string;
  body: string;
  baseBranch: string;
  headBranch: string;
  draft: true;
}

export interface DraftPublishAdapterContextV1 {
  publicationAttemptId: string;
  expectedTask: AgentTaskV1;
  sourceArtifact: DraftPublishSourceArtifactV1;
  proposedDraftPr: DraftPublishProposedDraftPrV1;
  /** Deterministic payload fingerprint for idempotency. */
  payloadFingerprint: string;
  observedAt: string;
}

export interface DraftPublishObserveBaseResultV1 {
  ok: boolean;
  observedBaseRevision: string | null;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface DraftPublishPrepareBranchResultV1 {
  ok: boolean;
  branchPrepared: boolean;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface DraftPublishWriteResultV1 {
  ok: boolean;
  verifiedPathsWritten: string[];
  reasonCode?: string;
  reasonMessage?: string;
}

export interface DraftPublishCommitResultV1 {
  ok: boolean;
  commitCreated: boolean;
  headRevision: string | null;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface DraftPublishPublishResultV1 {
  ok: boolean;
  draftPrNumber: number | null;
  draftPrUrl: string | null;
  draft: boolean;
  timedOut?: boolean;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface DraftPublishEvidenceV1 {
  adapterKind: DraftPublishAdapterKindV1;
  observedBaseRevision: string;
  branchPrepared: boolean;
  verifiedPathsWritten: string[];
  commitCreated: boolean;
  headRevision: string;
  draftPrNumber: number | null;
  draftPrUrl: string | null;
  draft: boolean;
  githubMutationPerformed: false;
  networkAccess: false;
  secretsRequired: false;
  productionMutationPerformed: false;
  replayed: boolean;
  notes: string[];
}

export interface DraftPublishCollectResultV1 {
  ok: boolean;
  evidence: DraftPublishEvidenceV1;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface DraftPublishCleanupResultV1 {
  ok: boolean;
  cleaned: boolean;
  reasonCode?: string;
  reasonMessage?: string;
}

/**
 * Provider-neutral adapter. Domain owns authority; adapter only performs
 * fake/local publication simulation when invoked.
 */
export interface DraftPublishAdapterV1 {
  readonly kind: DraftPublishAdapterKindV1;
  observeBase(
    ctx: DraftPublishAdapterContextV1,
  ): DraftPublishObserveBaseResultV1;
  prepareBranch(
    ctx: DraftPublishAdapterContextV1,
  ): DraftPublishPrepareBranchResultV1;
  writeVerifiedChanges(
    ctx: DraftPublishAdapterContextV1,
  ): DraftPublishWriteResultV1;
  createCommit(ctx: DraftPublishAdapterContextV1): DraftPublishCommitResultV1;
  publishDraftPr(ctx: DraftPublishAdapterContextV1): DraftPublishPublishResultV1;
  collectPublicationEvidence(
    ctx: DraftPublishAdapterContextV1,
  ): DraftPublishCollectResultV1;
  cleanup(ctx: DraftPublishAdapterContextV1): DraftPublishCleanupResultV1;
}

export interface FakeDraftPublishAdapterOptionsV1 {
  /** Independently observed base revision (must equal task.baseRevision for PASS). */
  observedBaseRevision?: string;
  /** Force a phase failure for negative tests. */
  failAt?: DraftPublishAdapterPhaseFailure;
  /** When true, publish evidence reports draft=false (fail closed upstream). */
  forceDraftFalse?: boolean;
  failureReasonCode?: string;
  failureReasonMessage?: string;
  /**
   * Shared attempt registry for idempotency across adapter instances when tests
   * inject the same Map. Default is adapter-local.
   */
  attemptRegistry?: Map<string, FakeDraftPublishAttemptRecordV1>;
}

export interface FakeDraftPublishAttemptRecordV1 {
  payloadFingerprint: string;
  draftPrNumber: number;
  draftPrUrl: string;
  headRevision: string;
  verifiedPathsWritten: string[];
  observedBaseRevision: string;
}

let fakeDraftPrCounter = 1000;

function nextFakeDraftPrNumber(): number {
  fakeDraftPrCounter += 1;
  return fakeDraftPrCounter;
}

function holdNotes(taskId: string, replayed: boolean): string[] {
  return [
    `Fake/local Draft PR publication simulation for task ${taskId}.`,
    "REAL GITHUB PUBLICATION = HOLD in DRAFT-PUBLISH-V1.",
    "PUBLISHED_DRAFT means deterministic fake/local simulation only — not an actual GitHub Draft PR.",
    replayed
      ? "Idempotent replay of the same publicationAttemptId + fingerprint."
      : "Fresh publication attempt simulation.",
    "No filesystem, network, GitHub, or shell side effects.",
  ];
}

/**
 * Deterministic in-memory publication adapter.
 * Models attempt registry for idempotent replay without GitHub mutation.
 */
export function createFakeDraftPublishAdapterV1(
  options: FakeDraftPublishAdapterOptionsV1 = {},
): DraftPublishAdapterV1 {
  const failAt = options.failAt;
  const forceDraftFalse = options.forceDraftFalse === true;
  const failureReasonCode = options.failureReasonCode ?? "ADAPTER_FAILURE";
  const failureReasonMessage =
    options.failureReasonMessage ?? "Fake draft-publish adapter forced failure.";
  const registry =
    options.attemptRegistry ??
    new Map<string, FakeDraftPublishAttemptRecordV1>();

  let observedBaseRevision: string | null = null;
  let branchPrepared = false;
  let verifiedPathsWritten: string[] = [];
  let commitCreated = false;
  let headRevision: string | null = null;
  let draftPrNumber: number | null = null;
  let draftPrUrl: string | null = null;
  let draftFlag = true;
  let replayed = false;

  return {
    kind: DRAFT_PUBLISH_ADAPTER_FAKE,

    observeBase(ctx) {
      if (failAt === "observeBase") {
        return {
          ok: false,
          observedBaseRevision: null,
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      observedBaseRevision =
        options.observedBaseRevision ?? ctx.sourceArtifact.baseRevision;
      return { ok: true, observedBaseRevision };
    },

    prepareBranch(_ctx) {
      if (failAt === "prepareBranch") {
        return {
          ok: false,
          branchPrepared: false,
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      branchPrepared = true;
      return { ok: true, branchPrepared: true };
    },

    writeVerifiedChanges(ctx) {
      if (failAt === "writeVerifiedChanges") {
        return {
          ok: false,
          verifiedPathsWritten: [],
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      // Write only the verified source paths — never invent additional paths.
      verifiedPathsWritten = [...ctx.sourceArtifact.changedPaths];
      return { ok: true, verifiedPathsWritten: [...verifiedPathsWritten] };
    },

    createCommit(ctx) {
      if (failAt === "createCommit") {
        return {
          ok: false,
          commitCreated: false,
          headRevision: null,
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      commitCreated = true;
      headRevision = ctx.sourceArtifact.headRevision;
      return { ok: true, commitCreated: true, headRevision };
    },

    publishDraftPr(ctx) {
      if (failAt === "timeout") {
        return {
          ok: false,
          draftPrNumber: null,
          draftPrUrl: null,
          draft: false,
          timedOut: true,
          reasonCode: "ADAPTER_TIMEOUT",
          reasonMessage: failureReasonMessage,
        };
      }
      if (failAt === "publishDraftPr") {
        return {
          ok: false,
          draftPrNumber: null,
          draftPrUrl: null,
          draft: false,
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }

      const existing = registry.get(ctx.publicationAttemptId);
      if (existing) {
        // Domain layer checks fingerprint conflict before invoke; adapter
        // reconciles same fingerprint by returning the prior publication.
        draftPrNumber = existing.draftPrNumber;
        draftPrUrl = existing.draftPrUrl;
        headRevision = existing.headRevision;
        verifiedPathsWritten = [...existing.verifiedPathsWritten];
        observedBaseRevision = existing.observedBaseRevision;
        replayed = true;
        draftFlag = !forceDraftFalse;
        return {
          ok: true,
          draftPrNumber,
          draftPrUrl,
          draft: draftFlag,
        };
      }

      const number = nextFakeDraftPrNumber();
      const url = `https://example.invalid/${ctx.sourceArtifact.repository}/pull/${number}`;
      draftPrNumber = number;
      draftPrUrl = url;
      draftFlag = !forceDraftFalse;
      replayed = false;
      registry.set(ctx.publicationAttemptId, {
        payloadFingerprint: ctx.payloadFingerprint,
        draftPrNumber: number,
        draftPrUrl: url,
        headRevision: headRevision ?? ctx.sourceArtifact.headRevision,
        verifiedPathsWritten: [...verifiedPathsWritten],
        observedBaseRevision:
          observedBaseRevision ?? ctx.sourceArtifact.baseRevision,
      });
      return {
        ok: true,
        draftPrNumber,
        draftPrUrl,
        draft: draftFlag,
      };
    },

    collectPublicationEvidence(ctx) {
      if (failAt === "collectPublicationEvidence") {
        return {
          ok: false,
          evidence: {
            adapterKind: DRAFT_PUBLISH_ADAPTER_FAKE,
            observedBaseRevision: observedBaseRevision ?? "",
            branchPrepared,
            verifiedPathsWritten: [...verifiedPathsWritten],
            commitCreated,
            headRevision: headRevision ?? "",
            draftPrNumber,
            draftPrUrl,
            draft: draftFlag,
            githubMutationPerformed: false,
            networkAccess: false,
            secretsRequired: false,
            productionMutationPerformed: false,
            replayed,
            notes: ["collectPublicationEvidence failed before materialization."],
          },
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      return {
        ok: true,
        evidence: {
          adapterKind: DRAFT_PUBLISH_ADAPTER_FAKE,
          observedBaseRevision: observedBaseRevision ?? "",
          branchPrepared,
          verifiedPathsWritten: [...verifiedPathsWritten],
          commitCreated,
          headRevision: headRevision ?? ctx.sourceArtifact.headRevision,
          draftPrNumber,
          draftPrUrl,
          draft: draftFlag,
          githubMutationPerformed: false,
          networkAccess: false,
          secretsRequired: false,
          productionMutationPerformed: false,
          replayed,
          notes: holdNotes(ctx.expectedTask.taskId, replayed),
        },
      };
    },

    cleanup(_ctx) {
      if (failAt === "cleanup") {
        return {
          ok: false,
          cleaned: false,
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      const cleaned = branchPrepared || commitCreated || draftPrNumber !== null;
      return { ok: true, cleaned };
    },
  };
}

/** Test helper: reset fake PR number counter for deterministic suites. */
export function resetFakeDraftPublishCounterForTests(startAt = 1000): void {
  fakeDraftPrCounter = startAt;
}
