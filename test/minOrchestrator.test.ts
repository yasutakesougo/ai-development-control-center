import { describe, expect, it, vi } from "vitest";
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
  MIN_ORCHESTRATOR_AGENT_RUNNER_IMPLEMENTED,
  MIN_ORCHESTRATOR_ACTION_GATEWAY_EXPANSION_IMPLEMENTED,
  MIN_ORCHESTRATOR_EXECUTION_IMPLEMENTED,
  MIN_ORCHESTRATOR_PUBLICATION_IMPLEMENTED,
  MIN_ORCHESTRATOR_RESULT_SCHEMA,
  MIN_ORCHESTRATOR_SUPPORTED_CAPABILITIES,
  MIN_ORCHESTRATOR_SUPPORTED_RISK_CLASSES,
  MIN_ORCHESTRATOR_SUPPORTED_STOP_AT,
  MIN_ORCHESTRATOR_VERSION,
  assertMinOrchestratorNotExecuting,
  orchestrateAgentTaskV1,
  parseMinOrchestratorInput,
} from "../src/domain/minOrchestrator";

const BASE = "bc8ed705f2b94a3938baed47df5a9a87095c6e08";
const OBSERVED_AT = "2026-08-12T10:37:00.000Z";
const REVALIDATED_AT = "2026-08-12T10:38:00.000Z";
const VALIDATED_AT = "2026-08-12T10:37:30.000Z";

function builtFromBuilder(
  overrides: {
    allowedCapabilities?: string[];
    riskClass?: AgentTaskV1["riskClass"];
    stopAt?: AgentTaskV1["stopAt"];
    allowedPaths?: string[];
    forbiddenPaths?: string[];
  } = {},
): AgentTaskBuilderResultV1 {
  return buildAgentTaskFromIssue(
    {
      repository: "yasutakesougo/ai-development-control-center",
      issueNumber: 47,
      baseRevision: BASE,
      issueTitle: "MIN-ORCHESTRATOR-V1 — dispatch decision from built AgentTaskV1",
      issueBody:
        "Orchestration decision only. No Agent execution or GitHub publication.",
      issueLabels: ["min-orchestrator"],
      observedAt: OBSERVED_AT,
      proposal: {
        allowedPaths: overrides.allowedPaths ?? [
          "docs/min-orchestrator/",
          "src/domain/minOrchestrator.ts",
          "test/minOrchestrator.test.ts",
        ],
        forbiddenPaths: overrides.forbiddenPaths ?? [
          ".github/workflows/",
          "migrations/",
        ],
        acceptanceCriteria: [
          "BUILT+VALID maps to DISPATCH_ELIGIBLE",
          "npm run verify passes",
          "No Agent execution or GitHub publication",
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
        stopAt: overrides.stopAt ?? "DRAFT_PR",
        constraints: {
          maxChangedFiles: 16,
          requireIndependentVerify: true,
        },
      },
    },
    { validatedAt: VALIDATED_AT },
  );
}

function orchestrate(
  builderResult: AgentTaskBuilderResultV1,
  attemptId?: string,
) {
  return orchestrateAgentTaskV1(
    {
      builderResult,
      observedAt: OBSERVED_AT,
      attemptId,
    },
    { revalidatedAt: REVALIDATED_AT },
  );
}

function validationStub(
  status: AgentTaskValidationResultV1["status"],
  taskId: string | null = null,
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

function syntheticBuilderResult(
  overrides: Partial<AgentTaskBuilderResultV1> &
    Pick<AgentTaskBuilderResultV1, "status">,
): AgentTaskBuilderResultV1 {
  return {
    schemaVersion: "AGENT-TASK-BUILDER-RESULT-V1",
    builderVersion: "AGENT-TASK-BUILDER-V1",
    task: null,
    validation: validationStub(
      overrides.status === "BUILT" ? "VALID" : "INVALID",
    ),
    reasonCode:
      overrides.status === "BUILT"
        ? "BUILT"
        : overrides.status === "HOLD"
          ? "HOLD_PATH_SCOPE_MISSING"
          : overrides.status === "UNKNOWN"
            ? "UNKNOWN_BUILDER_STATE"
            : "INVALID_INPUT",
    reasonMessage: `synthetic ${overrides.status}`,
    ...overrides,
  };
}

describe("MIN-ORCHESTRATOR-V1 non-goals", () => {
  it("keeps execution, publication, runner, and gateway expansion unimplemented", () => {
    expect(MIN_ORCHESTRATOR_EXECUTION_IMPLEMENTED).toBe(false);
    expect(MIN_ORCHESTRATOR_PUBLICATION_IMPLEMENTED).toBe(false);
    expect(MIN_ORCHESTRATOR_AGENT_RUNNER_IMPLEMENTED).toBe(false);
    expect(MIN_ORCHESTRATOR_ACTION_GATEWAY_EXPANSION_IMPLEMENTED).toBe(false);
    assertMinOrchestratorNotExecuting();
  });

  it("documents stage allowlists", () => {
    expect(MIN_ORCHESTRATOR_SUPPORTED_CAPABILITIES).toEqual([
      "workspace.read.v1",
    ]);
    expect(MIN_ORCHESTRATOR_SUPPORTED_RISK_CLASSES).toEqual(["R0", "R1", "R2"]);
    expect(MIN_ORCHESTRATOR_SUPPORTED_STOP_AT).toEqual([
      "AGENT_COMPLETE",
      "VERIFY_COMPLETE",
      "DRAFT_PR",
    ]);
  });
});

describe("MIN-ORCHESTRATOR-V1 positive path", () => {
  it("BUILT + VALID + valid task → DISPATCH_ELIGIBLE", () => {
    const built = builtFromBuilder();
    expect(built.status).toBe("BUILT");
    expect(built.validation.status).toBe("VALID");
    expect(built.task).not.toBeNull();

    const out = orchestrate(built, "attempt-47-1");
    expect(out.schemaVersion).toBe(MIN_ORCHESTRATOR_RESULT_SCHEMA);
    expect(out.orchestratorVersion).toBe(MIN_ORCHESTRATOR_VERSION);
    expect(out.decision).toBe("DISPATCH_ELIGIBLE");
    expect(out.reasonCode).toBe("DISPATCH_ELIGIBLE");
    expect(out.task).not.toBeNull();
    expect(out.metadata.dispatchEligible).toBe(true);
    expect(out.metadata.executionAuthorized).toBe(false);
    expect(out.metadata.actionGatewayAuthorized).toBe(false);
    expect(out.metadata.readyAuthorized).toBe(false);
    expect(out.metadata.mergeAuthorized).toBe(false);
    expect(out.metadata.githubMutationAuthorized).toBe(false);
    expect(out.metadata.attemptId).toBe("attempt-47-1");
  });

  it("is deterministic for the same input", () => {
    const built = builtFromBuilder();
    const a = orchestrate(built, "attempt-det");
    const b = orchestrate(built, "attempt-det");
    expect(a).toEqual(b);
  });
});

describe("MIN-ORCHESTRATOR-V1 builder status mapping", () => {
  it("builder HOLD → HOLD", () => {
    const hold = syntheticBuilderResult({
      status: "HOLD",
      reasonCode: "HOLD_PATH_SCOPE_MISSING",
      reasonMessage: "paths missing",
      validation: validationStub("HOLD"),
    });
    const out = orchestrate(hold);
    expect(out.decision).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_BUILDER");
    expect(out.metadata.dispatchEligible).toBe(false);
  });

  it("builder INVALID → REJECT", () => {
    const invalid = syntheticBuilderResult({
      status: "INVALID",
      reasonCode: "INVALID_REPOSITORY",
      reasonMessage: "bad repo",
      validation: validationStub("INVALID"),
    });
    const out = orchestrate(invalid);
    expect(out.decision).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_BUILDER_INVALID");
  });

  it("builder UNKNOWN → UNKNOWN", () => {
    const unknown = syntheticBuilderResult({
      status: "UNKNOWN",
      reasonCode: "UNKNOWN_BUILDER_STATE",
      reasonMessage: "unknown",
      validation: validationStub("UNKNOWN", null),
    });
    const out = orchestrate(unknown);
    expect(out.decision).toBe("UNKNOWN");
    expect(out.reasonCode).toBe("UNKNOWN_BUILDER");
  });
});

describe("MIN-ORCHESTRATOR-V1 BUILT inconsistency mapping", () => {
  it("BUILT + null task → REJECT", () => {
    const built = builtFromBuilder();
    const inconsistent = syntheticBuilderResult({
      status: "BUILT",
      task: null,
      validation: built.validation,
      reasonCode: "BUILT",
      reasonMessage: "claimed built without task",
    });
    const out = orchestrate(inconsistent);
    expect(out.decision).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_BUILT_NULL_TASK");
    expect(out.task).toBeNull();
  });

  it("BUILT + validation INVALID → REJECT", () => {
    const built = builtFromBuilder();
    const inconsistent = syntheticBuilderResult({
      status: "BUILT",
      task: built.task,
      validation: validationStub("INVALID", built.task!.taskId),
      reasonCode: "BUILT",
      reasonMessage: "claimed built with invalid validation",
    });
    const out = orchestrate(inconsistent);
    expect(out.decision).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_VALIDATION_INVALID");
  });

  it("BUILT + validation HOLD → HOLD", () => {
    const built = builtFromBuilder();
    const inconsistent = syntheticBuilderResult({
      status: "BUILT",
      task: built.task,
      validation: validationStub("HOLD", built.task!.taskId),
      reasonCode: "BUILT",
      reasonMessage: "claimed built with hold validation",
    });
    const out = orchestrate(inconsistent);
    expect(out.decision).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_VALIDATION");
  });

  it("BUILT + validation UNKNOWN → UNKNOWN", () => {
    const built = builtFromBuilder();
    const inconsistent = syntheticBuilderResult({
      status: "BUILT",
      task: built.task,
      validation: validationStub("UNKNOWN", built.task!.taskId),
      reasonCode: "BUILT",
      reasonMessage: "claimed built with unknown validation",
    });
    const out = orchestrate(inconsistent);
    expect(out.decision).toBe("UNKNOWN");
    expect(out.reasonCode).toBe("UNKNOWN_VALIDATION");
  });
});

describe("MIN-ORCHESTRATOR-V1 revalidation", () => {
  it("rejects malformed task on reparse", () => {
    const built = builtFromBuilder();
    const malformed = {
      ...built.task!,
      schemaVersion: "NOT-A-TASK",
    } as unknown as AgentTaskV1;
    const inconsistent = syntheticBuilderResult({
      status: "BUILT",
      task: malformed,
      validation: validationStub("VALID", "malformed"),
      reasonCode: "BUILT",
      reasonMessage: "claimed valid malformed",
    });
    const out = orchestrate(inconsistent);
    expect(out.decision).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_TASK_MALFORMED");
    expect(out.task).toBeNull();
  });

  it("rejects semantic invalidity when revalidation mismatches builder VALID", () => {
    const built = builtFromBuilder();
    const semanticBad: AgentTaskV1 = {
      ...built.task!,
      sourceIssue: {
        repository: "other-org/other-repo",
        number: built.task!.sourceIssue.number,
      },
    };
    const inconsistent = syntheticBuilderResult({
      status: "BUILT",
      task: semanticBad,
      validation: validationStub("VALID", semanticBad.taskId),
      reasonCode: "BUILT",
      reasonMessage: "claimed valid but semantics broken",
    });
    const out = orchestrate(inconsistent);
    expect(out.decision).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_REVALIDATION_MISMATCH");
    expect(out.validation?.status).toBe("INVALID");
  });

  it("rejects builder validation / revalidation mismatch (VALID vs HOLD)", () => {
    // Construct a BUILT+VALID claim around a prefix-overlapping task; revalidate
    // with treatPrefixOverlapAsHold → HOLD, which mismatches claimed VALID.
    const validBuilt = builtFromBuilder();
    const overlapping: AgentTaskV1 = {
      ...validBuilt.task!,
      allowedPaths: ["docs/"],
      forbiddenPaths: ["docs/secret/"],
    };
    const claimed = syntheticBuilderResult({
      status: "BUILT",
      task: overlapping,
      validation: validationStub("VALID", overlapping.taskId),
      reasonCode: "BUILT",
      reasonMessage: "claimed valid overlapping",
    });
    const out = orchestrateAgentTaskV1(
      { builderResult: claimed, observedAt: OBSERVED_AT },
      { revalidatedAt: REVALIDATED_AT, treatPrefixOverlapAsHold: true },
    );
    expect(out.decision).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_REVALIDATION_MISMATCH");
    expect(out.validation?.status).toBe("HOLD");
  });
});

describe("MIN-ORCHESTRATOR-V1 task preservation", () => {
  it("preserves repository, baseRevision, sourceIssue, paths, capabilities, risk, stopAt", () => {
    const built = builtFromBuilder({
      allowedCapabilities: ["workspace.read.v1"],
      riskClass: "R1",
      stopAt: "DRAFT_PR",
    });
    expect(built.status).toBe("BUILT");
    const out = orchestrate(built);
    expect(out.decision).toBe("DISPATCH_ELIGIBLE");
    expect(out.task).toBe(built.task);
    expect(out.task!.repository).toBe(
      "yasutakesougo/ai-development-control-center",
    );
    expect(out.task!.baseRevision).toBe(BASE);
    expect(out.task!.sourceIssue).toEqual({
      repository: "yasutakesougo/ai-development-control-center",
      number: 47,
    });
    expect(out.task!.allowedPaths).toEqual(built.task!.allowedPaths);
    expect(out.task!.forbiddenPaths).toEqual(built.task!.forbiddenPaths);
    expect(out.task!.allowedCapabilities).toEqual(["workspace.read.v1"]);
    expect(out.task!.riskClass).toBe("R1");
    expect(out.task!.stopAt).toBe("DRAFT_PR");
    expect(out.task!.objective).toBe(built.task!.objective);
    expect(out.task!.acceptanceCriteria).toEqual(built.task!.acceptanceCriteria);
    expect(out.task!.verificationCommands).toEqual(
      built.task!.verificationCommands,
    );
    expect(out.task!.schemaVersion).toBe(AGENT_TASK_SCHEMA);
  });

  it("does not widen allowedCapabilities or paths", () => {
    const built = builtFromBuilder({
      allowedCapabilities: [],
      allowedPaths: ["docs/min-orchestrator/"],
    });
    const out = orchestrate(built);
    expect(out.decision).toBe("DISPATCH_ELIGIBLE");
    expect(out.task!.allowedCapabilities).toEqual([]);
    expect(out.task!.allowedPaths).toEqual(["docs/min-orchestrator/"]);
    expect(out.task!.allowedPaths).not.toContain("src/");
  });
});

describe("MIN-ORCHESTRATOR-V1 stage rules", () => {
  it("HOLDs when stopAt=TASK_BUILT", () => {
    const built = builtFromBuilder({ stopAt: "TASK_BUILT" });
    expect(built.status).toBe("BUILT");
    const out = orchestrate(built);
    expect(out.decision).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_STOP_AT_TASK_BUILT");
    expect(out.task!.stopAt).toBe("TASK_BUILT");
  });

  it("HOLDs unsupported riskClass R3/R4/R5", () => {
    for (const riskClass of ["R3", "R4", "R5"] as const) {
      const built = builtFromBuilder({ riskClass });
      expect(built.status).toBe("BUILT");
      const out = orchestrate(built);
      expect(out.decision).toBe("HOLD");
      expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_RISK_CLASS");
      expect(out.task!.riskClass).toBe(riskClass);
    }
  });

  it("HOLDs unknown / unsupported capability", () => {
    const built = builtFromBuilder({
      allowedCapabilities: ["github.comment.create.v1"],
    });
    expect(built.status).toBe("BUILT");
    const out = orchestrate(built);
    expect(out.decision).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_CAPABILITY");
    expect(out.task!.allowedCapabilities).toEqual([
      "github.comment.create.v1",
    ]);
  });

  it("allows empty capabilities and supported stop/risk", () => {
    const built = builtFromBuilder({
      allowedCapabilities: [],
      riskClass: "R0",
      stopAt: "AGENT_COMPLETE",
    });
    expect(built.status).toBe("BUILT");
    const out = orchestrate(built);
    expect(out.decision).toBe("DISPATCH_ELIGIBLE");
  });
});

describe("MIN-ORCHESTRATOR-V1 input fail-closed", () => {
  it("rejects unknown input properties", () => {
    const built = builtFromBuilder();
    const parsed = parseMinOrchestratorInput({
      builderResult: built,
      observedAt: OBSERVED_AT,
      extra: true,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reasonCode).toBe("REJECT_INPUT");
    }

    const out = orchestrateAgentTaskV1(
      {
        builderResult: built,
        observedAt: OBSERVED_AT,
        unexpected: 1,
      },
      { revalidatedAt: REVALIDATED_AT },
    );
    expect(out.decision).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_INPUT");
  });

  it("rejects malformed builderResult", () => {
    const out = orchestrateAgentTaskV1(
      {
        builderResult: { not: "a builder result" },
        observedAt: OBSERVED_AT,
      },
      { revalidatedAt: REVALIDATED_AT },
    );
    expect(out.decision).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_INPUT");
  });
});

describe("MIN-ORCHESTRATOR-V1 side effects", () => {
  it("has no execution or GitHub mutation side effects", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch must not be called");
    });
    const built = builtFromBuilder();
    const out = orchestrate(built);
    expect(out.decision).toBe("DISPATCH_ELIGIBLE");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(MIN_ORCHESTRATOR_EXECUTION_IMPLEMENTED).toBe(false);
    expect(MIN_ORCHESTRATOR_PUBLICATION_IMPLEMENTED).toBe(false);
    fetchSpy.mockRestore();
  });
});
