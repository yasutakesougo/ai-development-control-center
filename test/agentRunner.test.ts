import { describe, expect, it } from "vitest";
import {
  buildAgentTaskFromIssue,
  type AgentTaskBuilderResultV1,
} from "../src/domain/agentTaskBuilder";
import {
  AGENT_TASK_SCHEMA,
  AGENT_TASK_VALIDATION_RESULT_SCHEMA,
  type AgentTaskV1,
  type AgentTaskValidationResultV1,
} from "../src/domain/agentTaskContract";
import {
  AGENT_RUNNER_COMMAND_EXECUTION_IMPLEMENTED,
  AGENT_RUNNER_GITHUB_PUBLICATION_IMPLEMENTED,
  AGENT_RUNNER_PROVIDER_INTEGRATION_STATUS,
  AGENT_RUNNER_REAL_WORKSPACE_EXECUTION_IMPLEMENTED,
  AGENT_RUNNER_RESULT_SCHEMA,
  AGENT_RUNNER_SUPPORTED_CAPABILITIES,
  AGENT_RUNNER_SUPPORTED_RISK_CLASSES,
  AGENT_RUNNER_SUPPORTED_STOP_AT,
  AGENT_RUNNER_VERSION,
  assertAgentRunnerBoundaries,
  createFakeAgentRunnerAdapterV1,
  evaluateChangedPathsPolicy,
  parseAgentRunnerInput,
  runAgentTaskV1,
} from "../src/domain/agentRunner";
import {
  orchestrateAgentTaskV1,
  type MinOrchestratorResultV1,
} from "../src/domain/minOrchestrator";

const BASE = "032bd6e88d4cd6f62d4621a840bcd2b3d37cd82e";
const OTHER_BASE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OBSERVED_AT = "2026-08-12T11:21:00.000Z";
const VALIDATED_AT = "2026-08-12T11:21:30.000Z";
const REVALIDATED_AT = "2026-08-12T11:22:00.000Z";
const REPO = "yasutakesougo/ai-development-control-center";
const ATTEMPT = "runner-attempt-49-1";

const ALLOWED_DOC = "docs/agent-runner/agent-runner-v1.md";
const ALLOWED_SRC = "src/domain/agentRunner.ts";
const ALLOWED_TEST = "test/agentRunner.test.ts";

function builtFromBuilder(
  overrides: {
    allowedCapabilities?: string[];
    riskClass?: AgentTaskV1["riskClass"];
    stopAt?: AgentTaskV1["stopAt"];
    allowedPaths?: string[];
    forbiddenPaths?: string[];
    baseRevision?: string;
    repository?: string;
  } = {},
): AgentTaskBuilderResultV1 {
  return buildAgentTaskFromIssue(
    {
      repository: overrides.repository ?? REPO,
      issueNumber: 49,
      baseRevision: overrides.baseRevision ?? BASE,
      issueTitle:
        "AGENT-RUNNER-V1 — isolated execution contract and bounded runner interface",
      issueBody:
        "Isolated runner contract + fake adapter only. No GitHub publication.",
      issueLabels: ["agent-runner"],
      observedAt: OBSERVED_AT,
      proposal: {
        allowedPaths: overrides.allowedPaths ?? [
          "docs/agent-runner/",
          "src/domain/agentRunner.ts",
          "src/domain/agentRunnerAdapter.ts",
          "test/agentRunner.test.ts",
        ],
        forbiddenPaths: overrides.forbiddenPaths ?? [
          ".github/workflows/",
          "migrations/",
        ],
        acceptanceCriteria: [
          "DISPATCH_ELIGIBLE R1 can COMPLETE via fake adapter",
          "npm run verify passes",
          "No GitHub publication or provider remote execution",
        ],
        verificationCommands: [
          {
            id: "verify.all",
            command: "npm run verify",
            description: "Typecheck, test, and build",
          },
        ],
        allowedCapabilities: overrides.allowedCapabilities,
        riskClass: overrides.riskClass ?? "R1",
        stopAt: overrides.stopAt ?? "AGENT_COMPLETE",
        constraints: {
          maxChangedFiles: 16,
          requireIndependentVerify: true,
        },
      },
    },
    { validatedAt: VALIDATED_AT },
  );
}

function dispatchEligible(
  overrides: Parameters<typeof builtFromBuilder>[0] = {},
): MinOrchestratorResultV1 {
  const built = builtFromBuilder(overrides);
  const out = orchestrateAgentTaskV1(
    {
      builderResult: built,
      observedAt: OBSERVED_AT,
      attemptId: "orch-49",
    },
    { revalidatedAt: REVALIDATED_AT },
  );
  expect(out.decision).toBe("DISPATCH_ELIGIBLE");
  return out;
}

function runnerInput(
  orchestratorResult: MinOrchestratorResultV1,
  workspace: { repository?: string; baseRevision?: string } = {},
) {
  return {
    orchestratorResult,
    runnerAttemptId: ATTEMPT,
    observedAt: OBSERVED_AT,
    workspace: {
      repository: workspace.repository ?? REPO,
      baseRevision: workspace.baseRevision ?? BASE,
    },
  };
}

function run(
  orchestratorResult: MinOrchestratorResultV1,
  opts: {
    workspace?: { repository?: string; baseRevision?: string };
    adapter?: ReturnType<typeof createFakeAgentRunnerAdapterV1>;
  } = {},
) {
  return runAgentTaskV1(runnerInput(orchestratorResult, opts.workspace), {
    adapter: opts.adapter,
    validatedAt: REVALIDATED_AT,
  });
}

function syntheticOrchestrator(
  overrides: Partial<MinOrchestratorResultV1> &
    Pick<MinOrchestratorResultV1, "decision">,
): MinOrchestratorResultV1 {
  const base = dispatchEligible();
  return {
    ...base,
    ...overrides,
    metadata: {
      ...base.metadata,
      ...(overrides.metadata ?? {}),
    },
  };
}

function validationStub(
  status: AgentTaskValidationResultV1["status"],
  taskId: string | null,
): AgentTaskValidationResultV1 {
  return {
    schemaVersion: AGENT_TASK_VALIDATION_RESULT_SCHEMA,
    taskId,
    status,
    reasonCode: status,
    reasonMessage: `stub ${status}`,
    validatedAt: VALIDATED_AT,
  };
}

describe("AGENT-RUNNER-V1 non-goals / boundaries", () => {
  it("keeps command execution, real workspace, GitHub publication, and provider remote HOLD", () => {
    expect(AGENT_RUNNER_COMMAND_EXECUTION_IMPLEMENTED).toBe(false);
    expect(AGENT_RUNNER_REAL_WORKSPACE_EXECUTION_IMPLEMENTED).toBe(false);
    expect(AGENT_RUNNER_GITHUB_PUBLICATION_IMPLEMENTED).toBe(false);
    expect(AGENT_RUNNER_PROVIDER_INTEGRATION_STATUS).toBe("HOLD");
    assertAgentRunnerBoundaries();
  });

  it("documents runner allowlists", () => {
    expect(AGENT_RUNNER_SUPPORTED_CAPABILITIES).toEqual(["workspace.read.v1"]);
    expect(AGENT_RUNNER_SUPPORTED_RISK_CLASSES).toEqual(["R0", "R1"]);
    expect(AGENT_RUNNER_SUPPORTED_STOP_AT).toEqual([
      "AGENT_COMPLETE",
      "VERIFY_COMPLETE",
      "DRAFT_PR",
    ]);
  });

  it("30. core tests require no production/network (fake adapter only)", () => {
    const adapter = createFakeAgentRunnerAdapterV1({
      changedPaths: [ALLOWED_DOC],
    });
    const out = run(dispatchEligible(), { adapter });
    expect(out.status).toBe("COMPLETED");
    expect(out.workspaceOutcome?.networkAccess).toBe(false);
    expect(out.workspaceOutcome?.secretsRequired).toBe(false);
    expect(out.workspaceOutcome?.githubMutationPerformed).toBe(false);
    expect(out.workspaceOutcome?.productionMutationPerformed).toBe(false);
    expect(out.metadata.providerIntegration).toBe("HOLD");
  });
});

describe("AGENT-RUNNER-V1 positive path", () => {
  it("1. valid DISPATCH_ELIGIBLE R1 input → COMPLETED", () => {
    const adapter = createFakeAgentRunnerAdapterV1({
      changedPaths: [ALLOWED_DOC, ALLOWED_SRC],
    });
    const out = run(dispatchEligible(), { adapter });
    expect(out.schemaVersion).toBe(AGENT_RUNNER_RESULT_SCHEMA);
    expect(out.runnerVersion).toBe(AGENT_RUNNER_VERSION);
    expect(out.status).toBe("COMPLETED");
    expect(out.reasonCode).toBe("COMPLETED");
    expect(out.runnerAttemptId).toBe(ATTEMPT);
    expect(out.taskId).not.toBeNull();
    expect(out.repository).toBe(REPO);
    expect(out.baseRevision).toBe(BASE);
    expect(out.changedPaths).toEqual([ALLOWED_DOC, ALLOWED_SRC]);
    expect(out.metadata.executionInvoked).toBe(true);
    expect(out.metadata.cleanupCompleted).toBe(true);
    expect(out.metadata.independentVerificationComplete).toBe(false);
    expect(out.metadata.publicationAuthorized).toBe(false);
    expect(out.metadata.readyAuthorized).toBe(false);
    expect(out.metadata.mergeAuthorized).toBe(false);
    expect(out.metadata.githubMutationAuthorized).toBe(false);
    expect(out.verificationObservation?.commandExecutionImplemented).toBe(
      false,
    );
  });

  it("16. supported capability workspace.read.v1 → COMPLETED", () => {
    const orch = dispatchEligible({
      allowedCapabilities: ["workspace.read.v1"],
    });
    const adapter = createFakeAgentRunnerAdapterV1({
      changedPaths: [ALLOWED_TEST],
    });
    const out = run(orch, { adapter });
    expect(out.status).toBe("COMPLETED");
    expect(out.changedPaths).toEqual([ALLOWED_TEST]);
  });

  it("18. allowed changed path → COMPLETED", () => {
    const adapter = createFakeAgentRunnerAdapterV1({
      changedPaths: ["docs/agent-runner/notes.md"],
    });
    const out = run(dispatchEligible(), { adapter });
    expect(out.status).toBe("COMPLETED");
  });

  it("27. deterministic output for same input", () => {
    const orch = dispatchEligible();
    const adapterOpts = { changedPaths: [ALLOWED_DOC] };
    const a = run(orch, {
      adapter: createFakeAgentRunnerAdapterV1(adapterOpts),
    });
    const b = run(orch, {
      adapter: createFakeAgentRunnerAdapterV1(adapterOpts),
    });
    expect(a).toEqual(b);
  });

  it("28. changedPaths capture", () => {
    const paths = [ALLOWED_DOC, ALLOWED_SRC, ALLOWED_TEST];
    const out = run(dispatchEligible(), {
      adapter: createFakeAgentRunnerAdapterV1({ changedPaths: paths }),
    });
    expect(out.status).toBe("COMPLETED");
    expect(out.changedPaths).toEqual(paths);
  });

  it("R0 read-only path may COMPLETE", () => {
    const orch = dispatchEligible({ riskClass: "R0" });
    const out = run(orch, {
      adapter: createFakeAgentRunnerAdapterV1({ changedPaths: [] }),
    });
    expect(out.status).toBe("COMPLETED");
  });
});

describe("AGENT-RUNNER-V1 orchestrator propagation", () => {
  it("2. orchestrator HOLD → HOLD", () => {
    const hold = syntheticOrchestrator({
      decision: "HOLD",
      reasonCode: "HOLD_BUILDER",
      reasonMessage: "builder held",
      metadata: {
        ...dispatchEligible().metadata,
        dispatchEligible: false,
      },
    });
    const out = run(hold);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_ORCHESTRATOR");
    expect(out.metadata.executionInvoked).toBe(false);
  });

  it("3. orchestrator REJECT → REJECT", () => {
    const reject = syntheticOrchestrator({
      decision: "REJECT",
      reasonCode: "REJECT_BUILDER_INVALID",
      reasonMessage: "builder invalid",
      metadata: {
        ...dispatchEligible().metadata,
        dispatchEligible: false,
      },
    });
    const out = run(reject);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_ORCHESTRATOR");
  });

  it("4. orchestrator UNKNOWN → UNKNOWN", () => {
    const unknown = syntheticOrchestrator({
      decision: "UNKNOWN",
      reasonCode: "UNKNOWN_BUILDER",
      reasonMessage: "builder unknown",
      metadata: {
        ...dispatchEligible().metadata,
        dispatchEligible: false,
      },
    });
    const out = run(unknown);
    expect(out.status).toBe("UNKNOWN");
    expect(out.reasonCode).toBe("UNKNOWN_ORCHESTRATOR");
  });

  it("5. DISPATCH_ELIGIBLE + null task → REJECT", () => {
    const bad = syntheticOrchestrator({
      decision: "DISPATCH_ELIGIBLE",
      task: null,
    });
    const out = run(bad);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_DISPATCH_NULL_TASK");
  });

  it("6. dispatchEligible metadata mismatch → REJECT", () => {
    const bad = syntheticOrchestrator({
      decision: "DISPATCH_ELIGIBLE",
      metadata: {
        ...dispatchEligible().metadata,
        dispatchEligible: false,
      },
    });
    const out = run(bad);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_DISPATCH_METADATA_INCONSISTENT");
  });
});

describe("AGENT-RUNNER-V1 task revalidation", () => {
  it("7. task reparse failure → REJECT", () => {
    const orch = dispatchEligible();
    const malformed = {
      ...orch,
      task: {
        ...orch.task!,
        schemaVersion: "NOT-A-TASK",
      } as unknown as AgentTaskV1,
    };
    const out = run(malformed);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_TASK_MALFORMED");
  });

  it("8. task semantic validation failure → REJECT", () => {
    const orch = dispatchEligible();
    const semanticBad: AgentTaskV1 = {
      ...orch.task!,
      sourceIssue: {
        repository: "other-owner/other-repo",
        number: orch.task!.sourceIssue.number,
      },
    };
    const out = run({ ...orch, task: semanticBad });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_TASK_SEMANTICS");
  });

  it("9. taskId binding mismatch → REJECT", () => {
    const orch = dispatchEligible();
    const mismatched = {
      ...orch,
      validation: validationStub("VALID", "foreign-task-id"),
    };
    const out = run(mismatched);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_REVALIDATION_MISMATCH");
  });
});

describe("AGENT-RUNNER-V1 identity binding", () => {
  it("10. repository mismatch → HOLD", () => {
    const out = run(dispatchEligible(), {
      workspace: { repository: "other-owner/other-repo", baseRevision: BASE },
    });
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_REPOSITORY_MISMATCH");
    expect(out.metadata.executionInvoked).toBe(false);
  });

  it("11. baseRevision mismatch → HOLD", () => {
    const out = run(dispatchEligible(), {
      workspace: { repository: REPO, baseRevision: OTHER_BASE },
    });
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_BASE_REVISION_MISMATCH");
    expect(out.metadata.executionInvoked).toBe(false);
  });
});

describe("AGENT-RUNNER-V1 stopAt policy (independent of orchestrator)", () => {
  it("forged DISPATCH_ELIGIBLE + stopAt=TASK_BUILT → HOLD, adapter not invoked", () => {
    const orch = dispatchEligible();
    const forged = syntheticOrchestrator({
      decision: "DISPATCH_ELIGIBLE",
      task: { ...orch.task!, stopAt: "TASK_BUILT", riskClass: "R1" },
      metadata: {
        ...orch.metadata,
        dispatchEligible: true,
        executionAuthorized: false,
      },
    });
    expect(forged.decision).toBe("DISPATCH_ELIGIBLE");
    expect(forged.metadata.dispatchEligible).toBe(true);
    expect(forged.task!.stopAt).toBe("TASK_BUILT");

    const out = run(forged, {
      adapter: createFakeAgentRunnerAdapterV1({
        changedPaths: [ALLOWED_DOC],
      }),
    });
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_STOP_AT_TASK_BUILT");
    expect(out.metadata.executionInvoked).toBe(false);
  });

  it("supported stopAt=AGENT_COMPLETE → existing positive path", () => {
    const orch = dispatchEligible({ stopAt: "AGENT_COMPLETE" });
    expect(orch.task!.stopAt).toBe("AGENT_COMPLETE");
    const out = run(orch, {
      adapter: createFakeAgentRunnerAdapterV1({
        changedPaths: [ALLOWED_DOC],
      }),
    });
    expect(out.status).toBe("COMPLETED");
    expect(out.metadata.executionInvoked).toBe(true);
  });

  it("supported stopAt=VERIFY_COMPLETE may COMPLETE without claiming verification", () => {
    const orch = dispatchEligible();
    const forged = syntheticOrchestrator({
      decision: "DISPATCH_ELIGIBLE",
      task: { ...orch.task!, stopAt: "VERIFY_COMPLETE", riskClass: "R1" },
    });
    const out = run(forged, {
      adapter: createFakeAgentRunnerAdapterV1({
        changedPaths: [ALLOWED_SRC],
      }),
    });
    expect(out.status).toBe("COMPLETED");
    expect(out.metadata.independentVerificationComplete).toBe(false);
    expect(out.metadata.publicationAuthorized).toBe(false);
  });

  it("supported stopAt=DRAFT_PR may COMPLETE without claiming publication", () => {
    const orch = dispatchEligible();
    const forged = syntheticOrchestrator({
      decision: "DISPATCH_ELIGIBLE",
      task: { ...orch.task!, stopAt: "DRAFT_PR", riskClass: "R1" },
    });
    const out = run(forged, {
      adapter: createFakeAgentRunnerAdapterV1({
        changedPaths: [ALLOWED_TEST],
      }),
    });
    expect(out.status).toBe("COMPLETED");
    expect(out.metadata.independentVerificationComplete).toBe(false);
    expect(out.metadata.publicationAuthorized).toBe(false);
    expect(out.metadata.githubMutationAuthorized).toBe(false);
  });
});

describe("AGENT-RUNNER-V1 risk class policy", () => {
  it("12. R2 → HOLD", () => {
    // Orchestrator allows R2 as DISPATCH_ELIGIBLE; runner must HOLD.
    const orch = dispatchEligible({ riskClass: "R2" });
    expect(orch.decision).toBe("DISPATCH_ELIGIBLE");
    const out = run(orch);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_RISK_CLASS");
  });

  it("13. R3 → HOLD", () => {
    const orch = dispatchEligible();
    const r3 = syntheticOrchestrator({
      decision: "DISPATCH_ELIGIBLE",
      task: { ...orch.task!, riskClass: "R3" },
    });
    const out = run(r3);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_RISK_CLASS");
  });

  it("14. R4 → HOLD", () => {
    const orch = dispatchEligible();
    const r4 = syntheticOrchestrator({
      decision: "DISPATCH_ELIGIBLE",
      task: { ...orch.task!, riskClass: "R4" },
    });
    const out = run(r4);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_RISK_CLASS");
  });

  it("15. R5 → HOLD", () => {
    const orch = dispatchEligible();
    const r5 = syntheticOrchestrator({
      decision: "DISPATCH_ELIGIBLE",
      task: { ...orch.task!, riskClass: "R5" },
    });
    const out = run(r5);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_RISK_CLASS");
  });
});

describe("AGENT-RUNNER-V1 capability policy", () => {
  it("17. unsupported capability → HOLD", () => {
    const orch = dispatchEligible();
    const withWrite = syntheticOrchestrator({
      decision: "DISPATCH_ELIGIBLE",
      task: {
        ...orch.task!,
        allowedCapabilities: ["workspace.write.v1"],
      },
    });
    const out = run(withWrite);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_CAPABILITY");
  });

  it("unsupported command.execute.v1 → HOLD", () => {
    const orch = dispatchEligible();
    const withCmd = syntheticOrchestrator({
      decision: "DISPATCH_ELIGIBLE",
      task: {
        ...orch.task!,
        allowedCapabilities: ["command.execute.v1"],
      },
    });
    const out = run(withCmd);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_CAPABILITY");
  });
});

describe("AGENT-RUNNER-V1 path enforcement", () => {
  it("19. changed path outside allowedPaths → FAILED", () => {
    const out = run(dispatchEligible(), {
      adapter: createFakeAgentRunnerAdapterV1({
        changedPaths: ["src/unrelated/secret.ts"],
      }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_CHANGED_PATH_OUT_OF_SCOPE");
  });

  it("20. forbiddenPaths override → FAILED", () => {
    const orch = dispatchEligible({
      allowedPaths: [
        "docs/agent-runner/",
        "src/domain/agentRunner.ts",
        "test/agentRunner.test.ts",
      ],
      forbiddenPaths: [".github/workflows/", "migrations/"],
    });
    const out = run(orch, {
      adapter: createFakeAgentRunnerAdapterV1({
        changedPaths: [".github/workflows/ci.yml"],
      }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_FORBIDDEN_PATH");
  });

  it("21. ../ traversal → REJECT", () => {
    const out = run(dispatchEligible(), {
      adapter: createFakeAgentRunnerAdapterV1({
        changedPaths: ["docs/agent-runner/../../etc/passwd"],
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_CHANGED_PATH_UNSAFE");
  });

  it("22. backslash bypass → REJECT", () => {
    const out = run(dispatchEligible(), {
      adapter: createFakeAgentRunnerAdapterV1({
        changedPaths: ["docs\\agent-runner\\agent-runner-v1.md"],
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_CHANGED_PATH_UNSAFE");
  });

  it("23. absolute path → REJECT", () => {
    const out = run(dispatchEligible(), {
      adapter: createFakeAgentRunnerAdapterV1({
        changedPaths: ["/etc/passwd"],
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_CHANGED_PATH_UNSAFE");
  });

  it("24. symlink escape behavior → REJECT", () => {
    const out = run(dispatchEligible(), {
      adapter: createFakeAgentRunnerAdapterV1({
        changedPaths: [ALLOWED_DOC],
        symlinkWriteAttempted: true,
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_SYMLINK_WRITE");
  });

  it("evaluateChangedPathsPolicy unit: empty path unsafe", () => {
    const task = dispatchEligible().task!;
    const result = evaluateChangedPathsPolicy(task, [""]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe("REJECT_CHANGED_PATH_UNSAFE");
    }
  });
});

describe("AGENT-RUNNER-V1 adapter failures", () => {
  it("25. adapter failure → FAILED", () => {
    const out = run(dispatchEligible(), {
      adapter: createFakeAgentRunnerAdapterV1({
        failAt: "execute",
        failureReasonMessage: "boom",
      }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER");
    expect(out.reasonMessage).toContain("boom");
    expect(out.metadata.executionInvoked).toBe(true);
  });

  it("26. timeout → FAILED", () => {
    const out = run(dispatchEligible(), {
      adapter: createFakeAgentRunnerAdapterV1({ failAt: "timeout" }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_TIMEOUT");
  });

  it("prepare failure → FAILED without claiming full execution success", () => {
    const out = run(dispatchEligible(), {
      adapter: createFakeAgentRunnerAdapterV1({ failAt: "prepare" }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER");
    expect(out.metadata.executionInvoked).toBe(false);
  });
});

describe("AGENT-RUNNER-V1 side-effect boundary", () => {
  it("29. no GitHub mutation authorization or performance", () => {
    const out = run(dispatchEligible(), {
      adapter: createFakeAgentRunnerAdapterV1({
        changedPaths: [ALLOWED_DOC],
      }),
    });
    expect(out.status).toBe("COMPLETED");
    expect(out.metadata.githubMutationAuthorized).toBe(false);
    expect(out.metadata.publicationAuthorized).toBe(false);
    expect(out.workspaceOutcome?.githubMutationPerformed).toBe(false);
  });

  it("rejects unknown input root properties", () => {
    const parsed = parseAgentRunnerInput({
      ...runnerInput(dispatchEligible()),
      extra: true,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reasonCode).toBe("REJECT_INPUT");
    }
  });

  it("COMPLETED does not authorize Ready/Merge/verify", () => {
    const out = run(dispatchEligible(), {
      adapter: createFakeAgentRunnerAdapterV1({ changedPaths: [] }),
    });
    expect(out.status).toBe("COMPLETED");
    expect(out.metadata.readyAuthorized).toBe(false);
    expect(out.metadata.mergeAuthorized).toBe(false);
    expect(out.metadata.independentVerificationComplete).toBe(false);
  });
});

describe("AGENT-RUNNER-V1 schema constants", () => {
  it("uses AGENT-TASK-V1 schema on completed task identity", () => {
    const orch = dispatchEligible();
    expect(orch.task!.schemaVersion).toBe(AGENT_TASK_SCHEMA);
    const out = run(orch, {
      adapter: createFakeAgentRunnerAdapterV1({ changedPaths: [] }),
    });
    expect(out.taskId).toBe(orch.task!.taskId);
  });
});
