import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AGENT_EXECUTION_IMPLEMENTED,
  AGENT_TASK_GITHUB_PUBLICATION_IMPLEMENTED,
  AGENT_TASK_RISK_CLASSES,
  AGENT_TASK_SCHEMA,
  AGENT_TASK_STOP_AT_VALUES,
  AGENT_TASK_VALIDATION_RESULT_SCHEMA,
  DRAFT_PR_AUTOMATION_IMPLEMENTED,
  MERGE_AUTOMATION_IMPLEMENTED,
  READY_AUTOMATION_IMPLEMENTED,
  assertAgentExecutionNotImplemented,
  evaluatePathBoundary,
  parseAgentTaskJsonBody,
  parseAgentTaskValidationResult,
  parseAgentTaskV1,
  parseAndValidateAgentTaskV1,
  validateAgentTaskV1,
  type AgentTaskV1,
} from "../src/domain/agentTaskContract";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/agent-task/fixtures",
);

const VALIDATED_AT = "2026-08-12T09:00:00.000Z";

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as T;
}

function validTask(): AgentTaskV1 {
  return loadFixture<AgentTaskV1>("task-valid.json");
}

describe("AGENT-TASK-V1 contract", () => {
  it("keeps execution and publication surfaces unimplemented", () => {
    expect(AGENT_EXECUTION_IMPLEMENTED).toBe(false);
    expect(AGENT_TASK_GITHUB_PUBLICATION_IMPLEMENTED).toBe(false);
    expect(DRAFT_PR_AUTOMATION_IMPLEMENTED).toBe(false);
    expect(READY_AUTOMATION_IMPLEMENTED).toBe(false);
    expect(MERGE_AUTOMATION_IMPLEMENTED).toBe(false);
    assertAgentExecutionNotImplemented();
  });

  it("reserves risk classes R0–R5 and V1 stopAt values", () => {
    expect(AGENT_TASK_RISK_CLASSES).toEqual(["R0", "R1", "R2", "R3", "R4", "R5"]);
    expect(AGENT_TASK_STOP_AT_VALUES).toEqual([
      "TASK_BUILT",
      "AGENT_COMPLETE",
      "VERIFY_COMPLETE",
      "DRAFT_PR",
    ]);
  });

  it("parses the valid fixture", () => {
    const task = validTask();
    expect(parseAgentTaskV1(task).ok).toBe(true);
  });

  it("validates the valid fixture as VALID", () => {
    const task = validTask();
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateAgentTaskV1(parsed.task, { validatedAt: VALIDATED_AT });
    expect(result.status).toBe("VALID");
    expect(result.schemaVersion).toBe(AGENT_TASK_VALIDATION_RESULT_SCHEMA);
    expect(result.taskId).toBe(task.taskId);
  });

  it("parseAndValidateAgentTaskV1 succeeds for valid fixture", () => {
    const outcome = parseAndValidateAgentTaskV1(validTask(), {
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.validation.status).toBe("VALID");
  });

  it("rejects malformed JSON syntax without throwing", () => {
    expect(parseAgentTaskJsonBody("{")).toEqual({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Agent task body is not valid JSON syntax.",
    });
  });

  it("rejects non-string JSON body input without throwing", () => {
    expect(parseAgentTaskJsonBody({})).toEqual({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Agent task body must be a UTF-8 JSON string.",
    });
  });

  it("rejects unknown root properties (additionalProperties:false)", () => {
    const task = { ...validTask(), extraField: true };
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonCode).toBe("REJECTED_SCHEMA");
    expect(parsed.reasonMessage).toContain("unknown properties");
  });

  it("rejects missing required fields", () => {
    const task = validTask();
    const { objective: _removed, ...incomplete } = task;
    const parsed = parseAgentTaskV1(incomplete);
    expect(parsed.ok).toBe(false);
  });

  it("rejects malformed repository", () => {
    const task = { ...validTask(), repository: "not-a-valid-repo" };
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("repository");
  });

  it("rejects malformed baseRevision (non-SHA)", () => {
    const task = { ...validTask(), baseRevision: "main" };
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("baseRevision");
  });

  it("rejects uppercase baseRevision SHA", () => {
    const task = {
      ...validTask(),
      baseRevision: "C9C8FD838C3A11FA71F68D256F94B3FC54155CE1",
    };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects empty objective", () => {
    const task = { ...validTask(), objective: "" };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects empty allowedPaths", () => {
    const task = { ...validTask(), allowedPaths: [] };
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("allowedPaths");
  });

  it("rejects duplicate allowedPaths", () => {
    const task = {
      ...validTask(),
      allowedPaths: ["src/domain/", "src/domain/"],
    };
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("duplicate");
  });

  it("rejects absolute paths", () => {
    const task = { ...validTask(), allowedPaths: ["/etc/passwd"] };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects path traversal segments", () => {
    const task = { ...validTask(), allowedPaths: ["src/../secrets"] };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects duplicate forbiddenPaths", () => {
    const task = {
      ...validTask(),
      forbiddenPaths: [".github/workflows/", ".github/workflows/"],
    };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects empty acceptanceCriteria", () => {
    const task = { ...validTask(), acceptanceCriteria: [] };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects malformed verificationCommands", () => {
    const task = {
      ...validTask(),
      verificationCommands: [{ id: "bad id!", command: "npm test" }],
    };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects duplicate verification command ids", () => {
    const task = {
      ...validTask(),
      verificationCommands: [
        { id: "verify.all", command: "npm run verify" },
        { id: "verify.all", command: "npm test" },
      ],
    };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects malformed capability identifiers", () => {
    const task = {
      ...validTask(),
      allowedCapabilities: ["agent.execute"],
    };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("accepts empty allowedCapabilities (default deny)", () => {
    const task = { ...validTask(), allowedCapabilities: [] };
    expect(parseAgentTaskV1(task).ok).toBe(true);
  });

  it("accepts well-formed capability identifiers when present", () => {
    const task = {
      ...validTask(),
      allowedCapabilities: ["workspace.read.v1", "workspace.write.v1"],
    };
    expect(parseAgentTaskV1(task).ok).toBe(true);
  });

  it("rejects unsupported riskClass", () => {
    const task = { ...validTask(), riskClass: "R9" };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects unsupported stopAt", () => {
    const task = { ...validTask(), stopAt: "MERGE" };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects sourceIssue.repository mismatch semantically", () => {
    const task = validTask();
    const parsed = parseAgentTaskV1({
      ...task,
      sourceIssue: {
        repository: "other-org/other-repo",
        number: 43,
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateAgentTaskV1(parsed.task, { validatedAt: VALIDATED_AT });
    expect(result.status).toBe("INVALID");
    expect(result.reasonCode).toBe("REJECTED_SOURCE_ISSUE");
  });

  it("rejects exact allowed/forbidden path conflict", () => {
    const task = validTask();
    const parsed = parseAgentTaskV1({
      ...task,
      forbiddenPaths: [...task.forbiddenPaths, "docs/agent-task/"],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateAgentTaskV1(parsed.task, { validatedAt: VALIDATED_AT });
    expect(result.status).toBe("INVALID");
    expect(result.reasonCode).toBe("REJECTED_PATH_CONFLICT");
  });

  it("rejects prefix allowed/forbidden path overlap by default", () => {
    const task = validTask();
    const parsed = parseAgentTaskV1({
      ...task,
      allowedPaths: ["docs/agent-task/schemas/"],
      forbiddenPaths: ["docs/agent-task/"],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateAgentTaskV1(parsed.task, { validatedAt: VALIDATED_AT });
    expect(result.status).toBe("INVALID");
    expect(result.reasonCode).toBe("REJECTED_PATH_CONFLICT");
  });

  it("returns HOLD for prefix overlap when treatPrefixOverlapAsHold is set", () => {
    const task = validTask();
    const parsed = parseAgentTaskV1({
      ...task,
      allowedPaths: ["docs/agent-task/schemas/"],
      forbiddenPaths: ["docs/agent-task/"],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateAgentTaskV1(parsed.task, {
      validatedAt: VALIDATED_AT,
      treatPrefixOverlapAsHold: true,
    });
    expect(result.status).toBe("HOLD");
    expect(result.reasonCode).toBe("HOLD_PATH_BOUNDARY_AMBIGUOUS");
  });

  it("evaluatePathBoundary does not silently authorize outside allowedPaths", () => {
    const task = validTask();
    expect(evaluatePathBoundary(task, "src/worker/index.ts")).toBe("UNKNOWN");
    expect(evaluatePathBoundary(task, "docs/agent-task/agent-task-v1.md")).toBe(
      "ALLOWED",
    );
    expect(evaluatePathBoundary(task, ".github/workflows/ci.yml")).toBe("FORBIDDEN");
  });

  it("does not throw on completely malformed raw values", () => {
    expect(() => parseAgentTaskV1(null)).not.toThrow();
    expect(() => parseAgentTaskV1("string")).not.toThrow();
    expect(() => parseAndValidateAgentTaskV1(undefined)).not.toThrow();
  });

  it("parseAndValidateAgentTaskV1 returns structured INVALID for schema failures", () => {
    const outcome = parseAndValidateAgentTaskV1(null, { validatedAt: VALIDATED_AT });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.status).toBe("INVALID");
    expect(outcome.validation.reasonCode).toBe("REJECTED_SCHEMA");
  });

  it("parses AgentTaskValidationResultV1 documents", () => {
    const result = {
      schemaVersion: AGENT_TASK_VALIDATION_RESULT_SCHEMA,
      taskId: "agent-task-43-contract-v1-2026-08-12",
      status: "VALID" as const,
      reasonCode: "VALID",
      reasonMessage: "ok",
      validatedAt: VALIDATED_AT,
    };
    expect(parseAgentTaskValidationResult(result).ok).toBe(true);
  });

  it("rejects validation result with unknown properties", () => {
    const result = {
      schemaVersion: AGENT_TASK_VALIDATION_RESULT_SCHEMA,
      taskId: null,
      status: "VALID",
      reasonCode: "VALID",
      reasonMessage: "ok",
      validatedAt: VALIDATED_AT,
      extra: true,
    };
    expect(parseAgentTaskValidationResult(result).ok).toBe(false);
  });

  it("rejects wrong schemaVersion on task document", () => {
    const task = { ...validTask(), schemaVersion: "AGENT-TASK-V0" };
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain(AGENT_TASK_SCHEMA);
  });

  it("rejects unknown properties on nested verification command", () => {
    const task = {
      ...validTask(),
      verificationCommands: [
        { id: "verify.all", command: "npm run verify", execute: true },
      ],
    };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects unknown properties on constraints", () => {
    const task = {
      ...validTask(),
      constraints: { maxChangedFiles: 10, allowSecrets: true },
    };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects unknown properties on metadata", () => {
    const task = {
      ...validTask(),
      metadata: {
        createdAt: "2026-08-12T09:36:30.000Z",
        secretToken: "must-not-appear",
      },
    };
    expect(parseAgentTaskV1(task).ok).toBe(false);
  });

  it("rejects unknown properties on sourceIssue", () => {
    const task = validTask();
    const parsed = parseAgentTaskV1({
      ...task,
      sourceIssue: {
        repository: task.repository,
        number: 43,
        url: "https://github.com/example/issues/43",
      },
    });
    expect(parsed.ok).toBe(false);
  });

  it("round-trips validation output through parseAgentTaskValidationResult", () => {
    const task = validTask();
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const validation = validateAgentTaskV1(parsed.task, { validatedAt: VALIDATED_AT });
    const reparsed = parseAgentTaskValidationResult(validation);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.result).toEqual(validation);
  });
});
