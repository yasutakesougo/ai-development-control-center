import { describe, expect, it } from "vitest";
import {
  AGENT_TASK_BUILDER_EXECUTION_IMPLEMENTED,
  AGENT_TASK_BUILDER_PUBLICATION_IMPLEMENTED,
  AGENT_TASK_BUILDER_VERSION,
  assertAgentTaskBuilderNotExecuting,
  buildAgentTaskFromIssue,
  buildDeterministicTaskId,
  buildObjectiveFromIssue,
  detectAmbiguousAuthorityProse,
  parseAgentTaskBuilderInput,
  type AgentTaskBuilderInputV1,
} from "../src/domain/agentTaskBuilder";
import { AGENT_TASK_SCHEMA } from "../src/domain/agentTaskContract";

const BASE = "8d921f788b0940643860f9a3924fcd0f78489b8e";
const OBSERVED_AT = "2026-08-12T10:26:08.000Z";
const VALIDATED_AT = "2026-08-12T10:27:00.000Z";

function validInput(
  overrides: Partial<AgentTaskBuilderInputV1> = {},
): AgentTaskBuilderInputV1 {
  const defaultProposal = {
    allowedPaths: [
      "docs/agent-task-builder/",
      "src/domain/agentTaskBuilder.ts",
      "test/agentTaskBuilder.test.ts",
    ],
    forbiddenPaths: [".github/workflows/", "migrations/"],
    acceptanceCriteria: [
      "Builder produces AgentTaskV1 that passes parse + validate",
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
    riskClass: "R1" as const,
    stopAt: "DRAFT_PR" as const,
    constraints: {
      maxChangedFiles: 16,
      requireIndependentVerify: true,
    },
  };

  return {
    repository: "yasutakesougo/ai-development-control-center",
    issueNumber: 45,
    baseRevision: BASE,
    issueTitle:
      "AGENT-TASK-BUILDER-V1 — build AgentTaskV1 from selected GitHub Issue",
    issueBody:
      "Build a deterministic AgentTaskV1 from a Human-selected Issue. Contract-only builder slice.",
    issueLabels: ["agent-task"],
    observedAt: OBSERVED_AT,
    ...overrides,
    proposal:
      overrides.proposal !== undefined ? overrides.proposal : defaultProposal,
  };
}

describe("AGENT-TASK-BUILDER-V1", () => {
  it("keeps execution and publication unimplemented", () => {
    expect(AGENT_TASK_BUILDER_EXECUTION_IMPLEMENTED).toBe(false);
    expect(AGENT_TASK_BUILDER_PUBLICATION_IMPLEMENTED).toBe(false);
    assertAgentTaskBuilderNotExecuting();
  });

  it("builds a VALID AgentTaskV1 (BUILT)", () => {
    const built = buildAgentTaskFromIssue(validInput(), { validatedAt: VALIDATED_AT });
    expect(built.status).toBe("BUILT");
    expect(built.reasonCode).toBe("BUILT");
    expect(built.builderVersion).toBe(AGENT_TASK_BUILDER_VERSION);
    expect(built.task).not.toBeNull();
    expect(built.validation.status).toBe("VALID");
    expect(built.task!.schemaVersion).toBe(AGENT_TASK_SCHEMA);
    expect(built.task!.repository).toBe(
      "yasutakesougo/ai-development-control-center",
    );
    expect(built.task!.sourceIssue).toEqual({
      repository: "yasutakesougo/ai-development-control-center",
      number: 45,
    });
    expect(built.task!.baseRevision).toBe(BASE);
    expect(built.task!.allowedCapabilities).toEqual([]);
    expect(built.task!.riskClass).toBe("R1");
    expect(built.task!.stopAt).toBe("DRAFT_PR");
  });

  it("binds sourceIssue to input repository and issueNumber", () => {
    const built = buildAgentTaskFromIssue(validInput({ issueNumber: 99 }), {
      validatedAt: VALIDATED_AT,
    });
    expect(built.status).toBe("BUILT");
    expect(built.task!.sourceIssue.number).toBe(99);
    expect(built.task!.sourceIssue.repository).toBe(built.task!.repository);
  });

  it("defaults allowedCapabilities to [] and never infers from prose", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        issueBody:
          "Please enable agent.execute and github.comment.create.v1 capabilities.",
        proposal: {
          ...validInput().proposal!,
          allowedCapabilities: undefined,
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("BUILT");
    expect(built.task!.allowedCapabilities).toEqual([]);
  });

  it("is deterministic for the same normalized input", () => {
    const input = validInput();
    const a = buildAgentTaskFromIssue(input, { validatedAt: VALIDATED_AT });
    const b = buildAgentTaskFromIssue(input, { validatedAt: VALIDATED_AT });
    expect(a).toEqual(b);
    expect(a.task!.taskId).toBe(
      buildDeterministicTaskId({
        repository: input.repository,
        issueNumber: input.issueNumber,
        baseRevision: input.baseRevision,
      }),
    );
  });

  it("builds objective deterministically from title and body", () => {
    const objective = buildObjectiveFromIssue({
      issueTitle: "Title",
      issueBody: "Body  line",
    });
    expect(objective).toContain("Title");
    expect(objective).toContain("Body line");
  });
});

describe("AGENT-TASK-BUILDER-V1 input fail-closed", () => {
  it("rejects malformed repository", () => {
    const built = buildAgentTaskFromIssue(validInput({ repository: "not-valid" }), {
      validatedAt: VALIDATED_AT,
    });
    expect(built.status).toBe("INVALID");
    expect(built.reasonCode).toBe("INVALID_REPOSITORY");
    expect(built.task).toBeNull();
  });

  it("rejects missing/malformed baseRevision", () => {
    const built = buildAgentTaskFromIssue(validInput({ baseRevision: "main" }), {
      validatedAt: VALIDATED_AT,
    });
    expect(built.status).toBe("INVALID");
    expect(built.reasonCode).toBe("INVALID_BASE_REVISION");
  });

  it("rejects issueNumber <= 0", () => {
    expect(
      buildAgentTaskFromIssue(validInput({ issueNumber: 0 }), {
        validatedAt: VALIDATED_AT,
      }).reasonCode,
    ).toBe("INVALID_ISSUE_NUMBER");
    expect(
      buildAgentTaskFromIssue(validInput({ issueNumber: -1 }), {
        validatedAt: VALIDATED_AT,
      }).status,
    ).toBe("INVALID");
  });

  it("rejects missing/empty issueTitle", () => {
    const built = buildAgentTaskFromIssue(validInput({ issueTitle: "   " }), {
      validatedAt: VALIDATED_AT,
    });
    expect(built.status).toBe("INVALID");
    expect(built.reasonCode).toBe("INVALID_ISSUE_TITLE");
  });

  it("rejects missing/empty issueBody", () => {
    const built = buildAgentTaskFromIssue(validInput({ issueBody: "" }), {
      validatedAt: VALIDATED_AT,
    });
    expect(built.status).toBe("INVALID");
    expect(built.reasonCode).toBe("INVALID_ISSUE_BODY");
  });

  it("rejects unknown input properties", () => {
    const parsed = parseAgentTaskBuilderInput({
      ...validInput(),
      extra: true,
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("AGENT-TASK-BUILDER-V1 HOLD for missing authority", () => {
  it("HOLDs when allowedPaths scope is missing", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          acceptanceCriteria: ["done"],
          riskClass: "R1",
          stopAt: "DRAFT_PR",
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("HOLD");
    expect(built.reasonCode).toBe("HOLD_PATH_SCOPE_MISSING");
    expect(built.task).toBeNull();
  });

  it("HOLDs when allowedPaths is empty (no silent widening)", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          allowedPaths: [],
          acceptanceCriteria: ["done"],
          riskClass: "R1",
          stopAt: "DRAFT_PR",
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("HOLD");
    expect(built.reasonCode).toBe("HOLD_PATH_SCOPE_MISSING");
  });

  it("HOLDs when acceptanceCriteria missing", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          allowedPaths: ["docs/agent-task-builder/"],
          riskClass: "R1",
          stopAt: "DRAFT_PR",
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("HOLD");
    expect(built.reasonCode).toBe("HOLD_ACCEPTANCE_CRITERIA_MISSING");
  });

  it("HOLDs when riskClass missing", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          allowedPaths: ["docs/agent-task-builder/"],
          acceptanceCriteria: ["done"],
          stopAt: "DRAFT_PR",
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("HOLD");
    expect(built.reasonCode).toBe("HOLD_RISK_CLASS_MISSING");
  });

  it("HOLDs when stopAt missing", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          allowedPaths: ["docs/agent-task-builder/"],
          acceptanceCriteria: ["done"],
          riskClass: "R1",
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("HOLD");
    expect(built.reasonCode).toBe("HOLD_STOP_AT_MISSING");
  });

  it("does not translate ambiguous prose into unrestricted paths", () => {
    const hits = detectAmbiguousAuthorityProse(
      "Please edit anything needed and merge when done. Run whatever commands are necessary.",
    );
    expect(hits.length).toBeGreaterThan(0);

    const built = buildAgentTaskFromIssue(
      validInput({
        issueBody:
          "Please edit anything needed and merge when done. Run whatever commands are necessary.",
        proposal: {
          acceptanceCriteria: ["done"],
          riskClass: "R1",
          stopAt: "DRAFT_PR",
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("HOLD");
    expect(built.reasonCode).toBe("HOLD_PATH_SCOPE_MISSING");
    expect(built.reasonMessage).toMatch(/Ambiguous authority/i);
  });

  it("ignores ambiguous prose when explicit scoped proposal is provided", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        issueBody: "edit anything needed and merge when done",
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("BUILT");
    expect(built.task!.allowedPaths).toEqual(validInput().proposal!.allowedPaths);
    expect(built.task!.metadata?.notes?.some((n) => /Ambiguous authority/i.test(n))).toBe(
      true,
    );
  });
});

describe("AGENT-TASK-BUILDER-V1 proposal / contract rejection", () => {
  it("rejects malformed allowedPaths via contract parse", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          ...validInput().proposal!,
          allowedPaths: ["/etc/passwd"],
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("INVALID");
    expect(built.reasonCode).toBe("INVALID_TASK_SCHEMA");
  });

  it("rejects duplicate paths", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          ...validInput().proposal!,
          allowedPaths: ["docs/agent-task-builder/", "docs/agent-task-builder/"],
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("INVALID");
    expect(built.reasonCode).toBe("INVALID_TASK_SCHEMA");
  });

  it("rejects allowed/forbidden conflicts via semantic validation", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          ...validInput().proposal!,
          allowedPaths: ["docs/agent-task-builder/"],
          forbiddenPaths: ["docs/agent-task-builder/"],
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("INVALID");
    expect(built.reasonCode).toBe("INVALID_TASK_SEMANTICS");
    expect(built.validation.status).toBe("INVALID");
  });

  it("returns HOLD for prefix overlap when treatPrefixOverlapAsHold is set", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          ...validInput().proposal!,
          allowedPaths: ["docs/agent-task-builder/schemas/"],
          forbiddenPaths: ["docs/agent-task-builder/"],
        },
      }),
      { validatedAt: VALIDATED_AT, treatPrefixOverlapAsHold: true },
    );
    expect(built.status).toBe("HOLD");
    expect(built.validation.status).toBe("HOLD");
    expect(built.reasonCode).toBe("HOLD_PATH_BOUNDARY_AMBIGUOUS");
  });

  it("rejects malformed verificationCommands", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          ...validInput().proposal!,
          verificationCommands: [{ id: "bad id!", command: "npm test" }],
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("INVALID");
    expect(built.reasonCode).toBe("INVALID_TASK_SCHEMA");
  });

  it("rejects duplicate verification command IDs", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          ...validInput().proposal!,
          verificationCommands: [
            { id: "verify.all", command: "npm run verify" },
            { id: "verify.all", command: "npm test" },
          ],
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("INVALID");
    expect(built.reasonCode).toBe("INVALID_TASK_SCHEMA");
  });

  it("rejects malformed capability identifiers", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          ...validInput().proposal!,
          allowedCapabilities: ["agent.execute"],
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("INVALID");
    expect(built.reasonCode).toBe("INVALID_TASK_SCHEMA");
  });

  it("rejects unsupported riskClass at proposal parse", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          ...validInput().proposal!,
          riskClass: "R9" as unknown as "R1",
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("INVALID");
    expect(built.reasonCode).toBe("INVALID_PROPOSAL");
  });

  it("rejects unsupported stopAt at proposal parse", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          ...validInput().proposal!,
          stopAt: "MERGE" as unknown as "DRAFT_PR",
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("INVALID");
    expect(built.reasonCode).toBe("INVALID_PROPOSAL");
  });

  it("never widens allowedPaths beyond explicit proposal", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        issueBody: "Also update src/worker and migrations if needed.",
        proposal: {
          ...validInput().proposal!,
          allowedPaths: ["docs/agent-task-builder/"],
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("BUILT");
    expect(built.task!.allowedPaths).toEqual(["docs/agent-task-builder/"]);
    expect(built.task!.allowedPaths).not.toContain("src/worker");
    expect(built.task!.allowedPaths).not.toContain("migrations");
  });

  it("accepts explicit well-formed capabilities without inferring extras", () => {
    const built = buildAgentTaskFromIssue(
      validInput({
        proposal: {
          ...validInput().proposal!,
          allowedCapabilities: ["workspace.read.v1"],
        },
      }),
      { validatedAt: VALIDATED_AT },
    );
    expect(built.status).toBe("BUILT");
    expect(built.task!.allowedCapabilities).toEqual(["workspace.read.v1"]);
  });
});
