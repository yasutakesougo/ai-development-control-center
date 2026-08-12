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
  AGENT_RUNNER_RESULT_SCHEMA,
  AGENT_RUNNER_VERSION,
  createFakeAgentRunnerAdapterV1,
  runAgentTaskV1,
  type AgentRunnerResultV1,
} from "../src/domain/agentRunner";
import {
  orchestrateAgentTaskV1,
  type MinOrchestratorResultV1,
} from "../src/domain/minOrchestrator";
import {
  INDEPENDENT_VERIFY_COMMAND_EXECUTION_IMPLEMENTED,
  INDEPENDENT_VERIFY_GITHUB_PUBLICATION_IMPLEMENTED,
  INDEPENDENT_VERIFY_PROVIDER_INTEGRATION_STATUS,
  INDEPENDENT_VERIFY_REAL_COMMAND_VERIFICATION_IMPLEMENTED,
  INDEPENDENT_VERIFY_RESULT_SCHEMA,
  INDEPENDENT_VERIFY_VERSION,
  assertIndependentVerifyBoundaries,
  changedPathSetsEqual,
  createFakeIndependentVerifyAdapterV1,
  findDuplicateChangedPaths,
  parseAgentRunnerResultStructural,
  parseIndependentVerifyInput,
  verifyAgentRunnerResultV1,
} from "../src/domain/independentVerify";

const BASE = "936c667fcc4f1e9accc86677d321e02881c4059e";
const OTHER_BASE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OBSERVED_AT = "2026-08-12T11:35:00.000Z";
const VALIDATED_AT = "2026-08-12T11:35:30.000Z";
const REVALIDATED_AT = "2026-08-12T11:36:00.000Z";
const REPO = "yasutakesougo/ai-development-control-center";
const ATTEMPT = "verify-attempt-51-1";
const RUNNER_ATTEMPT = "runner-attempt-51-1";

const ALLOWED_DOC = "docs/independent-verify/independent-verify-v1.md";
const ALLOWED_SRC = "src/domain/independentVerify.ts";
const ALLOWED_ADAPTER = "src/domain/independentVerifyAdapter.ts";
const ALLOWED_TEST = "test/independentVerify.test.ts";

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
      issueNumber: 51,
      baseRevision: overrides.baseRevision ?? BASE,
      issueTitle:
        "INDEPENDENT-VERIFY-V1 — deterministic verification of runner outcomes",
      issueBody:
        "Independent verifier contract + fake adapter only. No GitHub publication.",
      issueLabels: ["independent-verify"],
      observedAt: OBSERVED_AT,
      proposal: {
        allowedPaths: overrides.allowedPaths ?? [
          "docs/independent-verify/",
          "src/domain/independentVerify.ts",
          "src/domain/independentVerifyAdapter.ts",
          "test/independentVerify.test.ts",
        ],
        forbiddenPaths: overrides.forbiddenPaths ?? [
          ".github/workflows/",
          "migrations/",
        ],
        acceptanceCriteria: [
          "COMPLETED runner can VERIFIED via fake adapter",
          "npm run verify passes",
          "No GitHub publication or real command verification",
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
        stopAt: overrides.stopAt ?? "VERIFY_COMPLETE",
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
      attemptId: "orch-51",
    },
    { revalidatedAt: REVALIDATED_AT },
  );
  expect(out.decision).toBe("DISPATCH_ELIGIBLE");
  return out;
}

function completedRunner(
  overrides: {
    changedPaths?: string[];
    workspace?: { repository?: string; baseRevision?: string };
    taskOverrides?: Parameters<typeof builtFromBuilder>[0];
  } = {},
): { runnerResult: AgentRunnerResultV1; expectedTask: AgentTaskV1 } {
  const orch = dispatchEligible(overrides.taskOverrides);
  const changedPaths = overrides.changedPaths ?? [ALLOWED_DOC, ALLOWED_SRC];
  const runnerResult = runAgentTaskV1(
    {
      orchestratorResult: orch,
      runnerAttemptId: RUNNER_ATTEMPT,
      observedAt: OBSERVED_AT,
      workspace: {
        repository: overrides.workspace?.repository ?? REPO,
        baseRevision: overrides.workspace?.baseRevision ?? BASE,
      },
    },
    {
      adapter: createFakeAgentRunnerAdapterV1({ changedPaths }),
      validatedAt: REVALIDATED_AT,
    },
  );
  expect(runnerResult.status).toBe("COMPLETED");
  expect(orch.task).not.toBeNull();
  return { runnerResult, expectedTask: orch.task! };
}

function verifyInput(
  runnerResult: AgentRunnerResultV1,
  expectedTask: AgentTaskV1,
) {
  return {
    runnerResult,
    expectedTask,
    verificationAttemptId: ATTEMPT,
    observedAt: OBSERVED_AT,
  };
}

function verify(
  runnerResult: AgentRunnerResultV1,
  expectedTask: AgentTaskV1,
  opts: {
    adapter?: ReturnType<typeof createFakeIndependentVerifyAdapterV1>;
  } = {},
) {
  const changedPaths = runnerResult.changedPaths;
  return verifyAgentRunnerResultV1(verifyInput(runnerResult, expectedTask), {
    adapter:
      opts.adapter ??
      createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: changedPaths,
      }),
    validatedAt: REVALIDATED_AT,
  });
}

function cloneRunner(
  runnerResult: AgentRunnerResultV1,
  patch: Record<string, unknown>,
): AgentRunnerResultV1 {
  return {
    ...runnerResult,
    ...patch,
    metadata: {
      ...runnerResult.metadata,
      ...((patch.metadata as Record<string, unknown> | undefined) ?? {}),
    },
  } as AgentRunnerResultV1;
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

describe("INDEPENDENT-VERIFY-V1 non-goals / boundaries", () => {
  it("49-50. keeps real command / GitHub / provider HOLD; no network/secret requirement", () => {
    expect(INDEPENDENT_VERIFY_COMMAND_EXECUTION_IMPLEMENTED).toBe(false);
    expect(INDEPENDENT_VERIFY_REAL_COMMAND_VERIFICATION_IMPLEMENTED).toBe(
      false,
    );
    expect(INDEPENDENT_VERIFY_GITHUB_PUBLICATION_IMPLEMENTED).toBe(false);
    expect(INDEPENDENT_VERIFY_PROVIDER_INTEGRATION_STATUS).toBe("HOLD");
    assertIndependentVerifyBoundaries();

    const { runnerResult, expectedTask } = completedRunner();
    const out = verify(runnerResult, expectedTask);
    expect(out.status).toBe("VERIFIED");
    expect(out.verificationEvidence?.networkAccess).toBe(false);
    expect(out.verificationEvidence?.secretsRequired).toBe(false);
    expect(out.verificationEvidence?.githubMutationPerformed).toBe(false);
    expect(out.verificationEvidence?.productionMutationPerformed).toBe(false);
    expect(out.verificationEvidence?.commandExecutionImplemented).toBe(false);
    expect(out.verificationEvidence?.commandsExecuted).toEqual([]);
    expect(out.metadata.verifiedMeansFakeLocalEvidenceOnly).toBe(true);
  });
});

describe("INDEPENDENT-VERIFY-V1 positive + runner status propagation", () => {
  it("1. COMPLETED positive → VERIFIED", () => {
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: [ALLOWED_DOC, ALLOWED_SRC, ALLOWED_ADAPTER],
    });
    const out = verify(runnerResult, expectedTask);
    expect(out.schemaVersion).toBe(INDEPENDENT_VERIFY_RESULT_SCHEMA);
    expect(out.verifierVersion).toBe(INDEPENDENT_VERIFY_VERSION);
    expect(out.status).toBe("VERIFIED");
    expect(out.reasonCode).toBe("VERIFIED");
    expect(out.verificationAttemptId).toBe(ATTEMPT);
    expect(out.taskId).toBe(expectedTask.taskId);
    expect(out.repository).toBe(REPO);
    expect(out.baseRevision).toBe(BASE);
    expect(out.verifiedChangedPaths).toEqual([
      ALLOWED_DOC,
      ALLOWED_SRC,
      ALLOWED_ADAPTER,
    ]);
    expect(out.taskValidation?.status).toBe("VALID");
    expect(out.metadata.cleanupCompleted).toBe(true);
    expect(out.metadata.adapterKind).toBe("fake-in-memory");
  });

  it("2. runner HOLD → HOLD", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const hold = cloneRunner(runnerResult, {
      status: "HOLD",
      reasonCode: "HOLD_ORCHESTRATOR",
      reasonMessage: "held upstream",
      metadata: {
        ...runnerResult.metadata,
        executionInvoked: false,
        cleanupCompleted: false,
      },
    });
    const out = verify(hold, expectedTask);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_RUNNER");
  });

  it("3. runner REJECT → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const reject = cloneRunner(runnerResult, {
      status: "REJECT",
      reasonCode: "REJECT_INPUT",
      reasonMessage: "rejected upstream",
    });
    const out = verify(reject, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_RUNNER");
  });

  it("4. runner FAILED → FAILED", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const failed = cloneRunner(runnerResult, {
      status: "FAILED",
      reasonCode: "FAILED_ADAPTER",
      reasonMessage: "failed upstream",
    });
    const out = verify(failed, expectedTask);
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_RUNNER");
  });

  it("5. runner UNKNOWN → UNKNOWN", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const unknown = cloneRunner(runnerResult, {
      status: "UNKNOWN",
      reasonCode: "UNKNOWN_RUNNER_STATE",
      reasonMessage: "unknown upstream",
    });
    const out = verify(unknown, expectedTask);
    expect(out.status).toBe("UNKNOWN");
    expect(out.reasonCode).toBe("UNKNOWN_RUNNER");
  });

  it("44. deterministic repeatability", () => {
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: [ALLOWED_DOC],
    });
    const a = verify(runnerResult, expectedTask);
    const b = verify(runnerResult, expectedTask);
    expect(a).toEqual(b);
  });

  it("45-48. VERIFIED keeps authorization flags false", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const out = verify(runnerResult, expectedTask);
    expect(out.status).toBe("VERIFIED");
    expect(out.metadata.publicationAuthorized).toBe(false);
    expect(out.metadata.readyAuthorized).toBe(false);
    expect(out.metadata.mergeAuthorized).toBe(false);
    expect(out.metadata.githubMutationAuthorized).toBe(false);
    expect(out.metadata.deployAuthorized).toBe(false);
  });
});

describe("INDEPENDENT-VERIFY-V1 runner contract / task revalidation", () => {
  it("6. malformed runner schemaVersion", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = { ...runnerResult, schemaVersion: "FOREIGN-SCHEMA" };
    const out = verifyAgentRunnerResultV1(verifyInput(bad as AgentRunnerResultV1, expectedTask), {
      validatedAt: REVALIDATED_AT,
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_RUNNER_SCHEMA");
  });

  it("7. malformed runnerVersion", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = { ...runnerResult, runnerVersion: "FOREIGN-RUNNER" };
    const out = verifyAgentRunnerResultV1(verifyInput(bad as AgentRunnerResultV1, expectedTask), {
      validatedAt: REVALIDATED_AT,
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_RUNNER_VERSION");
  });

  it("8. expectedTask structural failure", () => {
    const { runnerResult } = completedRunner();
    const malformed = {
      schemaVersion: AGENT_TASK_SCHEMA,
      taskId: "x",
      // missing required fields
    };
    const out = verifyAgentRunnerResultV1(
      {
        runnerResult,
        expectedTask: malformed as unknown as AgentTaskV1,
        verificationAttemptId: ATTEMPT,
        observedAt: OBSERVED_AT,
      },
      { validatedAt: REVALIDATED_AT },
    );
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_TASK_MALFORMED");
  });

  it("9. expectedTask semantic invalid", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const invalid = {
      ...expectedTask,
      riskClass: "R99" as AgentTaskV1["riskClass"],
    };
    // Structural parse may fail first depending on riskClass enum check.
    const out = verifyAgentRunnerResultV1(verifyInput(runnerResult, invalid), {
      validatedAt: REVALIDATED_AT,
    });
    expect(out.status).toBe("REJECT");
    expect(["REJECT_TASK_MALFORMED", "REJECT_TASK_SEMANTICS"]).toContain(
      out.reasonCode,
    );
  });

  it("10. runner taskId mismatch → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, { taskId: "other-task-id" });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_TASK_ID_MISMATCH");
  });

  it("11. repository mismatch → HOLD", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      repository: "other-org/other-repo",
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_REPOSITORY_MISMATCH");
  });

  it("12. baseRevision mismatch → HOLD", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, { baseRevision: OTHER_BASE });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_BASE_REVISION_MISMATCH");
  });

  it("13. runner validation schema mismatch", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      validation: {
        ...validationStub("VALID", expectedTask.taskId),
        schemaVersion: "FOREIGN-VALIDATION",
      } as unknown as AgentTaskValidationResultV1,
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_VALIDATION_SCHEMA");
  });

  it("14. runner validation taskId mismatch", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      validation: validationStub("VALID", "other-task"),
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_VALIDATION_TASK_BINDING");
  });

  it("15. runner validation status != VALID", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      validation: validationStub("INVALID", expectedTask.taskId),
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_VALIDATION_STATUS");
  });
});

describe("INDEPENDENT-VERIFY-V1 metadata / workspace boundaries", () => {
  it("16. COMPLETED + executionInvoked=false → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      metadata: { ...runnerResult.metadata, executionInvoked: false },
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EXECUTION_NOT_INVOKED");
  });

  it("17. COMPLETED + cleanupCompleted=false → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      metadata: { ...runnerResult.metadata, cleanupCompleted: false },
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_CLEANUP_INCOMPLETE");
  });

  it("18. independentVerificationComplete=true → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      metadata: {
        ...runnerResult.metadata,
        independentVerificationComplete: true,
      },
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_RUNNER_SELF_VERIFICATION");
  });

  it("19. publicationAuthorized=true → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      metadata: { ...runnerResult.metadata, publicationAuthorized: true },
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_PUBLICATION_AUTHORIZED");
  });

  it("20. readyAuthorized=true → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      metadata: { ...runnerResult.metadata, readyAuthorized: true },
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_READY_AUTHORIZED");
  });

  it("21. mergeAuthorized=true → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      metadata: { ...runnerResult.metadata, mergeAuthorized: true },
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_MERGE_AUTHORIZED");
  });

  it("22. githubMutationAuthorized=true → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      metadata: { ...runnerResult.metadata, githubMutationAuthorized: true },
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_GITHUB_MUTATION_AUTHORIZED");
  });

  it("23. workspaceOutcome networkAccess=true → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      workspaceOutcome: {
        ...runnerResult.workspaceOutcome!,
        networkAccess: true,
      },
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_WORKSPACE_NETWORK");
  });

  it("24. workspaceOutcome secretsRequired=true → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      workspaceOutcome: {
        ...runnerResult.workspaceOutcome!,
        secretsRequired: true,
      },
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_WORKSPACE_SECRETS");
  });

  it("25. workspaceOutcome githubMutationPerformed=true → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      workspaceOutcome: {
        ...runnerResult.workspaceOutcome!,
        githubMutationPerformed: true,
      },
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_WORKSPACE_GITHUB_MUTATION");
  });

  it("26. workspaceOutcome productionMutationPerformed=true → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      workspaceOutcome: {
        ...runnerResult.workspaceOutcome!,
        productionMutationPerformed: true,
      },
    });
    const out = verify(bad, expectedTask);
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_WORKSPACE_PRODUCTION_MUTATION");
  });
});

describe("INDEPENDENT-VERIFY-V1 changed path re-verification", () => {
  it("27. allowed changed path → VERIFIED", () => {
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: [ALLOWED_TEST],
    });
    const out = verify(runnerResult, expectedTask);
    expect(out.status).toBe("VERIFIED");
    expect(out.verifiedChangedPaths).toEqual([ALLOWED_TEST]);
  });

  it("28. out-of-scope changed path → FAILED", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      changedPaths: ["src/worker/index.ts"],
    });
    const out = verify(bad, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: ["src/worker/index.ts"],
      }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_CHANGED_PATH_OUT_OF_SCOPE");
  });

  it("29. forbidden path override → FAILED", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      changedPaths: [".github/workflows/ci.yml"],
    });
    const out = verify(bad, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [".github/workflows/ci.yml"],
      }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_FORBIDDEN_PATH");
  });

  it("30. ../ traversal → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      changedPaths: ["docs/../secrets.env"],
    });
    const out = verify(bad, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: ["docs/../secrets.env"],
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_CHANGED_PATH_UNSAFE");
  });

  it("31. backslash bypass → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      changedPaths: ["docs\\independent-verify\\x.md"],
    });
    const out = verify(bad, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: ["docs\\independent-verify\\x.md"],
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_CHANGED_PATH_UNSAFE");
  });

  it("32. absolute path → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      changedPaths: ["/etc/passwd"],
    });
    const out = verify(bad, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: ["/etc/passwd"],
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_CHANGED_PATH_UNSAFE");
  });

  it("33. malformed/empty path → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, { changedPaths: [""] });
    const out = verify(bad, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [""],
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(["REJECT_CHANGED_PATH_UNSAFE", "REJECT_CHANGED_PATH_DUPLICATE"]).toContain(
      out.reasonCode,
    );
  });
});

describe("INDEPENDENT-VERIFY-V1 independent evidence path equality", () => {
  it("34. independent evidence exact path match → VERIFIED", () => {
    const paths = [ALLOWED_DOC, ALLOWED_SRC];
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: paths,
    });
    const out = verify(runnerResult, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: paths,
      }),
    });
    expect(out.status).toBe("VERIFIED");
    expect(out.verificationEvidence?.observedChangedPaths).toEqual(paths);
  });

  it("35. runner has extra path → REJECT_EVIDENCE_CHANGED_PATH_MISMATCH", () => {
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: [ALLOWED_DOC, ALLOWED_SRC],
    });
    const out = verify(runnerResult, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [ALLOWED_DOC],
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_CHANGED_PATH_MISMATCH");
  });

  it("36. verifier has extra path → REJECT_EVIDENCE_CHANGED_PATH_MISMATCH", () => {
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: [ALLOWED_DOC],
    });
    const out = verify(runnerResult, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [ALLOWED_DOC, ALLOWED_SRC],
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_CHANGED_PATH_MISMATCH");
  });

  it("37. ordering difference only → deterministic equality → VERIFIED", () => {
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: [ALLOWED_DOC, ALLOWED_SRC, ALLOWED_TEST],
    });
    expect(
      changedPathSetsEqual(
        [ALLOWED_DOC, ALLOWED_SRC, ALLOWED_TEST],
        [ALLOWED_TEST, ALLOWED_DOC, ALLOWED_SRC],
      ),
    ).toBe(true);
    const out = verify(runnerResult, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [ALLOWED_TEST, ALLOWED_DOC, ALLOWED_SRC],
      }),
    });
    expect(out.status).toBe("VERIFIED");
  });

  it("38. duplicate path evidence → fail closed (REJECT_CHANGED_PATH_DUPLICATE)", () => {
    expect(findDuplicateChangedPaths([ALLOWED_DOC, ALLOWED_DOC])).toBe(
      ALLOWED_DOC,
    );
    const { runnerResult, expectedTask } = completedRunner();
    const bad = cloneRunner(runnerResult, {
      changedPaths: [ALLOWED_DOC, ALLOWED_DOC],
    });
    const out = verify(bad, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [ALLOWED_DOC, ALLOWED_DOC],
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_CHANGED_PATH_DUPLICATE");
  });
});

describe("INDEPENDENT-VERIFY-V1 adapter failures", () => {
  it("39. adapter observe failure → FAILED", () => {
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: [ALLOWED_DOC],
    });
    const out = verify(runnerResult, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [ALLOWED_DOC],
        failAt: "observe",
      }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER_OBSERVE");
  });

  it("40. adapter verify failure → FAILED", () => {
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: [ALLOWED_DOC],
    });
    const out = verify(runnerResult, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [ALLOWED_DOC],
        failAt: "verify",
      }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER_VERIFY");
  });

  it("41. timeout → FAILED", () => {
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: [ALLOWED_DOC],
    });
    const out = verify(runnerResult, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [ALLOWED_DOC],
        failAt: "timeout",
      }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER_TIMEOUT");
  });

  it("42. collect failure → FAILED", () => {
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: [ALLOWED_DOC],
    });
    const out = verify(runnerResult, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [ALLOWED_DOC],
        failAt: "collect",
      }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER_COLLECT");
  });

  it("43. cleanup failure → FAILED", () => {
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: [ALLOWED_DOC],
    });
    const out = verify(runnerResult, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [ALLOWED_DOC],
        failAt: "cleanup",
      }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_CLEANUP");
  });
});

describe("INDEPENDENT-VERIFY-V1 input parsing helpers", () => {
  it("unknown root properties fail closed", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const out = verifyAgentRunnerResultV1(
      {
        ...verifyInput(runnerResult, expectedTask),
        notes: "do not trust me",
      },
      { validatedAt: REVALIDATED_AT },
    );
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_INPUT");
  });

  it("parseIndependentVerifyInput accepts valid input", () => {
    const { runnerResult, expectedTask } = completedRunner();
    const parsed = parseIndependentVerifyInput(
      verifyInput(runnerResult, expectedTask),
    );
    expect(parsed.ok).toBe(true);
  });

  it("parseAgentRunnerResultStructural rejects foreign status", () => {
    const { runnerResult } = completedRunner();
    const parsed = parseAgentRunnerResultStructural({
      ...runnerResult,
      status: "SUCCESS",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reasonCode).toBe("REJECT_RUNNER_STATUS");
    }
  });

  it("evidencePassed=false → REJECT", () => {
    const { runnerResult, expectedTask } = completedRunner({
      changedPaths: [ALLOWED_DOC],
    });
    const out = verify(runnerResult, expectedTask, {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [ALLOWED_DOC],
        evidencePassed: false,
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_FAILED");
  });

  it("null expectedTask → REJECT_TASK_NULL", () => {
    const { runnerResult } = completedRunner();
    const out = verifyAgentRunnerResultV1(
      {
        runnerResult,
        expectedTask: null as unknown as AgentTaskV1,
        verificationAttemptId: ATTEMPT,
        observedAt: OBSERVED_AT,
      },
      { validatedAt: REVALIDATED_AT },
    );
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_TASK_NULL");
  });
});
