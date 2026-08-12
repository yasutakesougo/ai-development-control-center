/**
 * AGENT-RUNNER-V1 adapter boundary.
 *
 * Provider-neutral isolated-workspace interface. Domain runner decides whether
 * any adapter method may be invoked. Adapters MUST NOT decide task authority.
 *
 * V1 ships a fake/in-memory adapter only.
 * PROVIDER INTEGRATION = HOLD (no Codex / Cursor remote / network / secrets).
 * COMMAND EXECUTION = HOLD (no arbitrary shell).
 */

import type { AgentTaskV1 } from "./agentTaskContract";

export const AGENT_RUNNER_ADAPTER_FAKE = "fake-in-memory" as const;
export const AGENT_RUNNER_PROVIDER_INTEGRATION_STATUS = "HOLD" as const;
export const AGENT_RUNNER_COMMAND_EXECUTION_IMPLEMENTED = false as const;
export const AGENT_RUNNER_GITHUB_PUBLICATION_IMPLEMENTED = false as const;
export const AGENT_RUNNER_REAL_WORKSPACE_EXECUTION_IMPLEMENTED = false as const;

export type AgentRunnerAdapterKindV1 = typeof AGENT_RUNNER_ADAPTER_FAKE;

export interface AgentRunnerWorkspaceBindingV1 {
  repository: string;
  baseRevision: string;
}

export interface AgentRunnerAdapterContextV1 {
  runnerAttemptId: string;
  task: AgentTaskV1;
  workspace: AgentRunnerWorkspaceBindingV1;
  observedAt: string;
}

export type AgentRunnerAdapterPhaseFailure =
  | "prepare"
  | "execute"
  | "collect"
  | "cleanup"
  | "timeout";

export interface AgentRunnerPrepareResultV1 {
  ok: boolean;
  workspaceId: string | null;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface AgentRunnerExecuteResultV1 {
  ok: boolean;
  timedOut?: boolean;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface AgentRunnerCollectResultV1 {
  ok: boolean;
  changedPaths: string[];
  /** When true, adapter asserts a symlink-based write was attempted. */
  symlinkWriteAttempted: boolean;
  workspaceOutcome: AgentRunnerWorkspaceOutcomeV1;
  verificationObservation: AgentRunnerVerificationObservationV1;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface AgentRunnerCleanupResultV1 {
  ok: boolean;
  cleaned: boolean;
  reasonCode?: string;
  reasonMessage?: string;
}

export interface AgentRunnerWorkspaceOutcomeV1 {
  adapterKind: AgentRunnerAdapterKindV1;
  workspaceId: string | null;
  prepared: boolean;
  executed: boolean;
  isolated: true;
  networkAccess: false;
  secretsRequired: false;
  githubMutationPerformed: false;
  productionMutationPerformed: false;
  notes: string[];
}

export interface AgentRunnerVerificationObservationV1 {
  /**
   * V1 does not execute verificationCommands.
   * Observation records that command execution remains HOLD.
   */
  commandExecutionImplemented: false;
  commandsObserved: [];
  notes: string[];
}

/**
 * Provider-neutral adapter. Domain layer owns authority; adapter only performs
 * isolated workspace activity when invoked.
 */
export interface AgentRunnerAdapterV1 {
  readonly kind: AgentRunnerAdapterKindV1;
  prepareWorkspace(
    ctx: AgentRunnerAdapterContextV1,
  ): AgentRunnerPrepareResultV1;
  executeTask(ctx: AgentRunnerAdapterContextV1): AgentRunnerExecuteResultV1;
  collectOutcome(ctx: AgentRunnerAdapterContextV1): AgentRunnerCollectResultV1;
  cleanupWorkspace(
    ctx: AgentRunnerAdapterContextV1,
  ): AgentRunnerCleanupResultV1;
}

export interface FakeAgentRunnerAdapterOptionsV1 {
  /** Deterministic changed paths reported by collectOutcome. */
  changedPaths?: string[];
  /** Force a phase failure for negative tests. */
  failAt?: AgentRunnerAdapterPhaseFailure;
  /** When true, collectOutcome reports a symlink write attempt. */
  symlinkWriteAttempted?: boolean;
  /** Optional failure messages. */
  failureReasonCode?: string;
  failureReasonMessage?: string;
}

/**
 * Deterministic in-memory adapter for domain tests.
 * Performs no filesystem, network, GitHub, or shell activity.
 */
export function createFakeAgentRunnerAdapterV1(
  options: FakeAgentRunnerAdapterOptionsV1 = {},
): AgentRunnerAdapterV1 {
  const changedPaths = options.changedPaths ?? [];
  const failAt = options.failAt;
  const symlinkWriteAttempted = options.symlinkWriteAttempted === true;
  const failureReasonCode = options.failureReasonCode ?? "ADAPTER_FAILURE";
  const failureReasonMessage =
    options.failureReasonMessage ?? "Fake adapter forced failure.";

  let workspaceId: string | null = null;
  let prepared = false;
  let executed = false;

  return {
    kind: AGENT_RUNNER_ADAPTER_FAKE,

    prepareWorkspace(ctx) {
      if (failAt === "prepare") {
        return {
          ok: false,
          workspaceId: null,
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      workspaceId = `fake-ws:${ctx.runnerAttemptId}`;
      prepared = true;
      return { ok: true, workspaceId };
    },

    executeTask(_ctx) {
      if (failAt === "timeout") {
        return {
          ok: false,
          timedOut: true,
          reasonCode: "ADAPTER_TIMEOUT",
          reasonMessage: failureReasonMessage,
        };
      }
      if (failAt === "execute") {
        return {
          ok: false,
          timedOut: false,
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      executed = true;
      return { ok: true };
    },

    collectOutcome(ctx) {
      if (failAt === "collect") {
        return {
          ok: false,
          changedPaths: [],
          symlinkWriteAttempted: false,
          workspaceOutcome: emptyWorkspaceOutcome(workspaceId, prepared, executed),
          verificationObservation: holdVerificationObservation(),
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      return {
        ok: true,
        changedPaths: [...changedPaths],
        symlinkWriteAttempted,
        workspaceOutcome: {
          adapterKind: AGENT_RUNNER_ADAPTER_FAKE,
          workspaceId,
          prepared,
          executed,
          isolated: true,
          networkAccess: false,
          secretsRequired: false,
          githubMutationPerformed: false,
          productionMutationPerformed: false,
          notes: [
            `Fake isolated activity for task ${ctx.task.taskId}.`,
            "No filesystem, network, GitHub, or shell side effects.",
          ],
        },
        verificationObservation: holdVerificationObservation(),
      };
    },

    cleanupWorkspace(_ctx) {
      if (failAt === "cleanup") {
        return {
          ok: false,
          cleaned: false,
          reasonCode: failureReasonCode,
          reasonMessage: failureReasonMessage,
        };
      }
      const cleaned = prepared;
      workspaceId = null;
      prepared = false;
      executed = false;
      return { ok: true, cleaned };
    },
  };
}

function emptyWorkspaceOutcome(
  workspaceId: string | null,
  prepared: boolean,
  executed: boolean,
): AgentRunnerWorkspaceOutcomeV1 {
  return {
    adapterKind: AGENT_RUNNER_ADAPTER_FAKE,
    workspaceId,
    prepared,
    executed,
    isolated: true,
    networkAccess: false,
    secretsRequired: false,
    githubMutationPerformed: false,
    productionMutationPerformed: false,
    notes: ["Adapter collect failed before outcome materialization."],
  };
}

function holdVerificationObservation(): AgentRunnerVerificationObservationV1 {
  return {
    commandExecutionImplemented: false,
    commandsObserved: [],
    notes: [
      "COMMAND EXECUTION = HOLD in AGENT-RUNNER-V1.",
      "verificationCommands are not executed by the fake adapter.",
    ],
  };
}
