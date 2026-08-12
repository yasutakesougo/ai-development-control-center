/**
 * INDEPENDENT-VERIFY-V1 adapter boundary.
 *
 * Provider-neutral independent verification interface. Domain verifier decides
 * whether evidence can produce VERIFIED. Adapters MUST NOT decide authority.
 *
 * V1 ships a fake/in-memory adapter only.
 * REAL COMMAND VERIFICATION = HOLD
 * PROVIDER / NETWORK / SECRETS / GITHUB MUTATION = NOT IMPLEMENTED
 */

import type { AgentTaskV1 } from "./agentTaskContract";
import type { AgentRunnerResultV1 } from "./agentRunner";

export const INDEPENDENT_VERIFY_ADAPTER_FAKE = "fake-in-memory" as const;
export const INDEPENDENT_VERIFY_PROVIDER_INTEGRATION_STATUS = "HOLD" as const;
export const INDEPENDENT_VERIFY_COMMAND_EXECUTION_IMPLEMENTED = false as const;
export const INDEPENDENT_VERIFY_GITHUB_PUBLICATION_IMPLEMENTED = false as const;
export const INDEPENDENT_VERIFY_REAL_COMMAND_VERIFICATION_IMPLEMENTED =
  false as const;

export type IndependentVerifyAdapterKindV1 =
  typeof INDEPENDENT_VERIFY_ADAPTER_FAKE;

export type IndependentVerifyAdapterPhaseFailure =
  | "observe"
  | "verify"
  | "collect"
  | "cleanup"
  | "timeout";

export interface IndependentVerifyAdapterContextV1 {
  verificationAttemptId: string;
  expectedTask: AgentTaskV1;
  /** Untrusted runner evidence — adapter must not treat it as authority. */
  runnerResult: AgentRunnerResultV1;
  observedAt: string;
}

export interface IndependentVerifyObserveResultV1 {
  ok: boolean;
  observationId: string | null;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface IndependentVerifyRunResultV1 {
  ok: boolean;
  timedOut?: boolean;
  reasonCode?: string;
  reasonMessage?: string;
}

/**
 * Independent evidence collected by the adapter.
 * Adapter reports its own observed changed paths — never copies runner claims
 * as independent observation.
 */
export interface IndependentVerifyEvidenceV1 {
  adapterKind: IndependentVerifyAdapterKindV1;
  observedChangedPaths: string[];
  commandExecutionImplemented: false;
  commandsExecuted: [];
  networkAccess: false;
  secretsRequired: false;
  githubMutationPerformed: false;
  productionMutationPerformed: false;
  evidencePassed: boolean;
  notes: string[];
}

export interface IndependentVerifyCollectResultV1 {
  ok: boolean;
  evidence: IndependentVerifyEvidenceV1;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface IndependentVerifyCleanupResultV1 {
  ok: boolean;
  cleaned: boolean;
  reasonCode?: string;
  reasonMessage?: string;
}

/**
 * Provider-neutral adapter. Domain verifier owns VERIFIED authority;
 * adapter only observes / collects fake-local evidence when invoked.
 */
export interface IndependentVerifyAdapterV1 {
  readonly kind: IndependentVerifyAdapterKindV1;
  observeWorkspace(
    ctx: IndependentVerifyAdapterContextV1,
  ): IndependentVerifyObserveResultV1;
  runVerification(
    ctx: IndependentVerifyAdapterContextV1,
  ): IndependentVerifyRunResultV1;
  collectEvidence(
    ctx: IndependentVerifyAdapterContextV1,
  ): IndependentVerifyCollectResultV1;
  cleanup(ctx: IndependentVerifyAdapterContextV1): IndependentVerifyCleanupResultV1;
}

export interface FakeIndependentVerifyAdapterOptionsV1 {
  /**
   * Deterministic independently observed changed paths.
   * Must NOT be silently derived from runnerResult.changedPaths by the
   * verifier — tests inject the independent observation explicitly.
   */
  observedChangedPaths?: string[];
  /** Force a phase failure for negative tests. */
  failAt?: IndependentVerifyAdapterPhaseFailure;
  /** When false, collectEvidence reports evidencePassed=false. Default true. */
  evidencePassed?: boolean;
  failureReasonCode?: string;
  failureReasonMessage?: string;
}

function holdEvidenceNotes(taskId: string): string[] {
  return [
    `Fake/local independent evidence for task ${taskId}.`,
    "REAL COMMAND VERIFICATION = HOLD in INDEPENDENT-VERIFY-V1.",
    "verificationCommands are not executed by the fake adapter.",
    "VERIFIED (when produced) means deterministic fake/local evidence PASS only — not real CI or shell verification.",
    "No filesystem, network, GitHub, or shell side effects.",
  ];
}

function emptyEvidence(
  observedChangedPaths: string[],
  evidencePassed: boolean,
  notes: string[],
): IndependentVerifyEvidenceV1 {
  return {
    adapterKind: INDEPENDENT_VERIFY_ADAPTER_FAKE,
    observedChangedPaths: [...observedChangedPaths],
    commandExecutionImplemented: false,
    commandsExecuted: [],
    networkAccess: false,
    secretsRequired: false,
    githubMutationPerformed: false,
    productionMutationPerformed: false,
    evidencePassed,
    notes,
  };
}

/**
 * Deterministic in-memory adapter for domain tests.
 * Performs no filesystem, network, GitHub, or shell activity.
 * Does not copy runner changedPaths as independent observation.
 */
export function createFakeIndependentVerifyAdapterV1(
  options: FakeIndependentVerifyAdapterOptionsV1 = {},
): IndependentVerifyAdapterV1 {
  const observedChangedPaths = options.observedChangedPaths ?? [];
  const failAt = options.failAt;
  const evidencePassedDefault = options.evidencePassed !== false;
  const failureReasonCode = options.failureReasonCode ?? "ADAPTER_FAILURE";
  const failureReasonMessage =
    options.failureReasonMessage ?? "Fake verify adapter forced failure.";

  let observationId: string | null = null;
  let observed = false;
  let verified = false;

  return {
    kind: INDEPENDENT_VERIFY_ADAPTER_FAKE,

    observeWorkspace(ctx) {
      if (failAt === "observe") {
        return {
          ok: false,
          observationId: null,
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      observationId = `fake-obs:${ctx.verificationAttemptId}`;
      observed = true;
      return { ok: true, observationId };
    },

    runVerification(_ctx) {
      if (failAt === "timeout") {
        return {
          ok: false,
          timedOut: true,
          reasonCode: "ADAPTER_TIMEOUT",
          reasonMessage: failureReasonMessage,
        };
      }
      if (failAt === "verify") {
        return {
          ok: false,
          timedOut: false,
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      verified = true;
      return { ok: true };
    },

    collectEvidence(ctx) {
      if (failAt === "collect") {
        return {
          ok: false,
          evidence: emptyEvidence([], false, [
            "Adapter collectEvidence failed before independent observation materialization.",
            "REAL COMMAND VERIFICATION = HOLD.",
          ]),
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      // Independent observation is injected — never copied from runnerResult.
      void observed;
      void verified;
      return {
        ok: true,
        evidence: emptyEvidence(
          observedChangedPaths,
          evidencePassedDefault,
          holdEvidenceNotes(ctx.expectedTask.taskId),
        ),
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
      const cleaned = observationId !== null;
      observationId = null;
      observed = false;
      verified = false;
      return { ok: true, cleaned };
    },
  };
}
