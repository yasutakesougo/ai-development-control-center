import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AGENT_EXECUTION_IMPLEMENTED,
  AGENT_TASK_FINDING_CODE_MAX,
  AGENT_TASK_FINDING_MESSAGE_MAX,
  AGENT_TASK_FINDING_PATH_MAX,
  AGENT_TASK_GITHUB_PUBLICATION_IMPLEMENTED,
  AGENT_TASK_PATH_UNIQUENESS_NORMALIZES_TRAILING_SLASH,
  AGENT_TASK_RISK_CLASSES,
  AGENT_TASK_ROOT_KEYS,
  AGENT_TASK_SCHEMA,
  AGENT_TASK_STOP_AT_VALUES,
  AGENT_TASK_VALIDATION_RESULT_ROOT_KEYS,
  AGENT_TASK_VALIDATION_RESULT_SCHEMA,
  AGENT_TASK_VERIFICATION_COMMAND_IDS_MUST_BE_UNIQUE,
  DRAFT_PR_AUTOMATION_IMPLEMENTED,
  MERGE_AUTOMATION_IMPLEMENTED,
  READY_AUTOMATION_IMPLEMENTED,
  assertAgentExecutionNotImplemented,
  evaluatePathBoundary,
  isPathExplicitlyAllowed,
  isPathExplicitlyForbidden,
  isRepoRelativePath,
  normalizeRepoPath,
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
const schemasDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/agent-task/schemas",
);

const VALIDATED_AT = "2026-08-12T09:00:00.000Z";

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as T;
}

function loadSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(schemasDir, name), "utf8")) as Record<
    string,
    unknown
  >;
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

  it("rejects empty path segments and dot segments", () => {
    expect(parseAgentTaskV1({ ...validTask(), allowedPaths: ["src//domain"] }).ok).toBe(
      false,
    );
    expect(parseAgentTaskV1({ ...validTask(), allowedPaths: ["."] }).ok).toBe(false);
    expect(parseAgentTaskV1({ ...validTask(), allowedPaths: ["src/./x"] }).ok).toBe(
      false,
    );
    expect(parseAgentTaskV1({ ...validTask(), allowedPaths: ["foo/.."] }).ok).toBe(
      false,
    );
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
    expect(AGENT_TASK_VERIFICATION_COMMAND_IDS_MUST_BE_UNIQUE).toBe(true);
    const task = {
      ...validTask(),
      verificationCommands: [
        { id: "verify.all", command: "npm run verify" },
        { id: "verify.all", command: "npm test" },
      ],
    };
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonCode).toBe("REJECTED_SCHEMA");
    expect(parsed.reasonMessage).toContain("duplicate ids");
    expect(parsed.reasonMessage).toContain("must be unique");
  });

  it("accepts distinct verification command ids", () => {
    const task = {
      ...validTask(),
      verificationCommands: [
        { id: "verify.typecheck", command: "npm run typecheck" },
        { id: "verify.test", command: "npm test" },
      ],
    };
    expect(parseAgentTaskV1(task).ok).toBe(true);
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

describe("AGENT-TASK-V1 path boundary regressions", () => {
  it("enables trailing-slash uniqueness normalization", () => {
    expect(AGENT_TASK_PATH_UNIQUENESS_NORMALIZES_TRAILING_SLASH).toBe(true);
  });

  it("normalizeRepoPath strips trailing slashes only", () => {
    expect(normalizeRepoPath("docs/agent-task/")).toBe("docs/agent-task");
    expect(normalizeRepoPath("docs/agent-task///")).toBe("docs/agent-task");
    expect(normalizeRepoPath("src/domain/agentTaskContract.ts")).toBe(
      "src/domain/agentTaskContract.ts",
    );
  });

  it("rejects allowedPaths that differ only by trailing slash", () => {
    const parsed = parseAgentTaskV1({
      ...validTask(),
      allowedPaths: ["docs/agent-task", "docs/agent-task/"],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("trailing-slash normalization");
  });

  it("rejects forbiddenPaths that differ only by trailing slash", () => {
    const parsed = parseAgentTaskV1({
      ...validTask(),
      forbiddenPaths: ["migrations", "migrations/"],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("trailing-slash normalization");
  });

  it("treats trailing-slash variance as exact allowed/forbidden conflict", () => {
    const task = validTask();
    const parsed = parseAgentTaskV1({
      ...task,
      allowedPaths: ["docs/agent-task/"],
      forbiddenPaths: ["docs/agent-task"],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = validateAgentTaskV1(parsed.task, { validatedAt: VALIDATED_AT });
    expect(result.status).toBe("INVALID");
    expect(result.reasonCode).toBe("REJECTED_PATH_CONFLICT");
  });

  it("matches directory prefixes with or without trailing slash", () => {
    const task = {
      ...validTask(),
      allowedPaths: ["docs/agent-task/"],
      forbiddenPaths: [".github/workflows"],
    };
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(evaluatePathBoundary(parsed.task, "docs/agent-task/agent-task-v1.md")).toBe(
      "ALLOWED",
    );
    expect(evaluatePathBoundary(parsed.task, "docs/agent-task")).toBe("ALLOWED");
    expect(evaluatePathBoundary(parsed.task, ".github/workflows/ci.yml")).toBe(
      "FORBIDDEN",
    );
  });

  it("does not treat sibling path prefixes as matches", () => {
    const task = {
      ...validTask(),
      allowedPaths: ["src/foo"],
      forbiddenPaths: ["src/bar"],
    };
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(evaluatePathBoundary(parsed.task, "src/foobar/x.ts")).toBe("UNKNOWN");
    expect(evaluatePathBoundary(parsed.task, "src/foo/x.ts")).toBe("ALLOWED");
    expect(evaluatePathBoundary(parsed.task, "src/bar/x.ts")).toBe("FORBIDDEN");
  });

  it("prefers forbidden over allowed when both would match", () => {
    const task = {
      ...validTask(),
      allowedPaths: ["docs/"],
      forbiddenPaths: ["docs/secrets/"],
    };
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Semantic prefix overlap is INVALID by default; path helper still fail-closes.
    const validation = validateAgentTaskV1(parsed.task, { validatedAt: VALIDATED_AT });
    expect(validation.status).toBe("INVALID");
    expect(evaluatePathBoundary(parsed.task, "docs/secrets/token.txt")).toBe(
      "FORBIDDEN",
    );
  });
});

describe("AGENT-TASK-V1 candidate path fail-closed regressions", () => {
  it("rejects backslash separators in task path lists", () => {
    expect(
      parseAgentTaskV1({
        ...validTask(),
        allowedPaths: ["src\\domain\\agentTaskContract.ts"],
      }).ok,
    ).toBe(false);
    expect(
      parseAgentTaskV1({
        ...validTask(),
        forbiddenPaths: ["migrations\\legacy"],
      }).ok,
    ).toBe(false);
    expect(
      parseAgentTaskV1({
        ...validTask(),
        verificationCommands: [
          {
            id: "verify.all",
            command: "npm run verify",
            workingDirectory: "scripts\\ci",
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it("isRepoRelativePath rejects traversal and separator attacks", () => {
    expect(isRepoRelativePath("docs/agent-task/agent-task-v1.md")).toBe(true);
    expect(isRepoRelativePath("../secrets")).toBe(false);
    expect(isRepoRelativePath("docs/../../etc/passwd")).toBe(false);
    expect(isRepoRelativePath("docs/foo/../../../etc/passwd")).toBe(false);
    expect(isRepoRelativePath("foo/..")).toBe(false);
    expect(isRepoRelativePath("foo/../bar")).toBe(false);
    expect(isRepoRelativePath("..\\secrets")).toBe(false);
    expect(isRepoRelativePath("docs\\agent-task\\x.md")).toBe(false);
    expect(isRepoRelativePath("C:\\Windows\\System32")).toBe(false);
    expect(isRepoRelativePath("/etc/passwd")).toBe(false);
    expect(isRepoRelativePath("")).toBe(false);
    expect(isRepoRelativePath(".")).toBe(false);
  });

  it("evaluatePathBoundary returns UNKNOWN for malformed candidates", () => {
    const task = validTask();
    const attacks = [
      "../secrets",
      "docs/../../etc/passwd",
      "docs\\agent-task\\agent-task-v1.md",
      "..\\secrets",
      "/etc/passwd",
      "docs/agent-task/../../../.env",
      "src/domain/..\\worker",
    ];
    for (const candidate of attacks) {
      expect(isRepoRelativePath(candidate)).toBe(false);
      expect(evaluatePathBoundary(task, candidate)).toBe("UNKNOWN");
      expect(isPathExplicitlyAllowed(task, candidate)).toBe(false);
      expect(isPathExplicitlyForbidden(task, candidate)).toBe(false);
    }
  });

  it("does not treat backslash candidates as matching allowedPrefixes", () => {
    const task = validTask();
    // Even though the string starts with an allowed prefix textually with /,
    // a backslash form must never become ALLOWED.
    expect(evaluatePathBoundary(task, "docs/agent-task\\agent-task-v1.md")).toBe(
      "UNKNOWN",
    );
  });
});

describe("AGENT-TASK-V1 schema / TypeScript / runtime parity", () => {
  it("mirrors AgentTaskV1 schema root keys and required fields", () => {
    const schema = loadSchema("agent-task-v1.schema.json");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties).toBeTypeOf("object");
    const properties = schema.properties as Record<string, unknown>;
    expect(Object.keys(properties).sort()).toEqual([...AGENT_TASK_ROOT_KEYS].sort());
    expect(schema.required).toEqual([
      "schemaVersion",
      "taskId",
      "repository",
      "baseRevision",
      "sourceIssue",
      "objective",
      "allowedPaths",
      "forbiddenPaths",
      "acceptanceCriteria",
      "verificationCommands",
      "allowedCapabilities",
      "riskClass",
      "stopAt",
    ]);
    expect((properties.schemaVersion as { const: string }).const).toBe(
      AGENT_TASK_SCHEMA,
    );
  });

  it("documents verification command id uniqueness on the schema", () => {
    const schema = loadSchema("agent-task-v1.schema.json");
    const properties = schema.properties as Record<string, { description?: string }>;
    expect(properties.verificationCommands.description).toMatch(/unique/i);
    expect(AGENT_TASK_VERIFICATION_COMMAND_IDS_MUST_BE_UNIQUE).toBe(true);
  });

  it("schema path patterns reject backslash separators", () => {
    const schema = loadSchema("agent-task-v1.schema.json");
    const properties = schema.properties as Record<
      string,
      { items?: { pattern?: string }; description?: string }
    >;
    const allowedPattern = properties.allowedPaths.items?.pattern ?? "";
    const forbiddenPattern = properties.forbiddenPaths.items?.pattern ?? "";
    expect(allowedPattern).toContain("\\\\");
    expect(forbiddenPattern).toContain("\\\\");
    expect(properties.allowedPaths.description).toMatch(/backslash/i);
    // Runtime mirrors the same rejection.
    expect(isRepoRelativePath("src\\domain")).toBe(false);
  });

  it("mirrors validation-result schema root keys and bounds", () => {
    const schema = loadSchema("agent-task-validation-result-v1.schema.json");
    expect(schema.additionalProperties).toBe(false);
    const properties = schema.properties as Record<string, unknown>;
    expect(Object.keys(properties).sort()).toEqual(
      [...AGENT_TASK_VALIDATION_RESULT_ROOT_KEYS].sort(),
    );
    expect((properties.schemaVersion as { const: string }).const).toBe(
      AGENT_TASK_VALIDATION_RESULT_SCHEMA,
    );
    expect(schema.required).toEqual([
      "schemaVersion",
      "taskId",
      "status",
      "reasonCode",
      "reasonMessage",
      "validatedAt",
    ]);
    const taskId = properties.taskId as {
      type: unknown;
      pattern?: string;
      maxLength?: number;
    };
    expect(taskId.type).toEqual(["string", "null"]);
    expect(taskId.pattern).toBe("^[\\x20-\\x7E]+$");
    expect(taskId.maxLength).toBe(128);
    const findings = properties.findings as {
      maxItems: number;
      items: {
        properties: {
          path: { maxLength: number };
          code: { maxLength: number };
          message: { maxLength: number };
        };
      };
    };
    expect(findings.maxItems).toBe(64);
    expect(findings.items.properties.path.maxLength).toBe(AGENT_TASK_FINDING_PATH_MAX);
    expect(findings.items.properties.code.maxLength).toBe(AGENT_TASK_FINDING_CODE_MAX);
    expect(findings.items.properties.message.maxLength).toBe(
      AGENT_TASK_FINDING_MESSAGE_MAX,
    );
  });

  it("requires ValidationResult.taskId (null allowed; omission rejected)", () => {
    const withNull = {
      schemaVersion: AGENT_TASK_VALIDATION_RESULT_SCHEMA,
      taskId: null,
      status: "INVALID",
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "ok",
      validatedAt: VALIDATED_AT,
    };
    expect(parseAgentTaskValidationResult(withNull).ok).toBe(true);

    const omitted = {
      schemaVersion: AGENT_TASK_VALIDATION_RESULT_SCHEMA,
      status: "INVALID",
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "ok",
      validatedAt: VALIDATED_AT,
    };
    const parsed = parseAgentTaskValidationResult(omitted);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("taskId is required");
  });

  it("rejects validation findings that exceed schema maxLengths", () => {
    const result = {
      schemaVersion: AGENT_TASK_VALIDATION_RESULT_SCHEMA,
      taskId: null,
      status: "INVALID",
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "ok",
      validatedAt: VALIDATED_AT,
      findings: [
        {
          path: "x".repeat(AGENT_TASK_FINDING_PATH_MAX + 1),
          code: "REJECTED_SCHEMA",
          message: "too long path",
          severity: "ERROR",
        },
      ],
    };
    expect(parseAgentTaskValidationResult(result).ok).toBe(false);
  });

  it("rejects validation result taskId that violates printable ASCII pattern", () => {
    const result = {
      schemaVersion: AGENT_TASK_VALIDATION_RESULT_SCHEMA,
      taskId: "bad\nid",
      status: "VALID",
      reasonCode: "VALID",
      reasonMessage: "ok",
      validatedAt: VALIDATED_AT,
    };
    expect(parseAgentTaskValidationResult(result).ok).toBe(false);
  });
});
