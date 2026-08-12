import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PROJECT_AGENT_EXECUTION_IMPLEMENTED,
  PROJECT_CONTRACT_AUTHORITY_FINGERPRINT_KEYS,
  PROJECT_CONTRACT_HUMAN_GATE_POLICY_KEYS,
  PROJECT_CONTRACT_METADATA_KEYS,
  PROJECT_CONTRACT_RISK_CLASSES,
  PROJECT_CONTRACT_ROOT_KEYS,
  PROJECT_CONTRACT_SCHEMA,
  PROJECT_CONTRACT_VALIDATION_RESULT_ROOT_KEYS,
  PROJECT_CONTRACT_VALIDATION_RESULT_SCHEMA,
  PROJECT_GITHUB_ISSUE_MUTATION_IMPLEMENTED,
  PROJECT_ISSUE_PROPOSAL_GENERATION_IMPLEMENTED,
  PROJECT_PLANNER_IMPLEMENTED,
  PROJECT_REPOSITORY_ROLES,
  PROJECT_ROADMAP_GENERATION_IMPLEMENTED,
  assertProjectPlanningSurfacesNotImplemented,
  captureProjectContractAuthorityFacts,
  computeProjectContractAuthorityFingerprint,
  parseAndValidateProjectContractV1,
  parseProjectContractJsonBody,
  parseProjectContractV1,
  parseProjectContractValidationResult,
  projectContractAuthorityFingerprintsEqual,
  validateProjectContractV1,
  type ProjectContractV1,
} from "../src/domain/projectContract";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/project-contract/fixtures",
);
const schemasDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/project-contract/schemas",
);

const VALIDATED_AT = "2026-08-12T15:20:00.000Z";

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as T;
}

function loadSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(schemasDir, name), "utf8")) as Record<
    string,
    unknown
  >;
}

function validContract(): ProjectContractV1 {
  return loadFixture<ProjectContractV1>("project-valid.json");
}

describe("PROJECT-CONTRACT-V1 contract", () => {
  it("keeps planner / roadmap / issue / agent surfaces unimplemented", () => {
    expect(PROJECT_PLANNER_IMPLEMENTED).toBe(false);
    expect(PROJECT_ROADMAP_GENERATION_IMPLEMENTED).toBe(false);
    expect(PROJECT_ISSUE_PROPOSAL_GENERATION_IMPLEMENTED).toBe(false);
    expect(PROJECT_GITHUB_ISSUE_MUTATION_IMPLEMENTED).toBe(false);
    expect(PROJECT_AGENT_EXECUTION_IMPLEMENTED).toBe(false);
    assertProjectPlanningSurfacesNotImplemented();
  });

  it("reserves risk classes R0–R5 and repository roles", () => {
    expect(PROJECT_CONTRACT_RISK_CLASSES).toEqual([
      "R0",
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
    ]);
    expect(PROJECT_REPOSITORY_ROLES).toEqual([
      "PRIMARY",
      "SECONDARY",
      "OBSERVED",
    ]);
  });

  it("parses the valid fixture", () => {
    const contract = validContract();
    expect(parseProjectContractV1(contract).ok).toBe(true);
  });

  it("validates the valid fixture as VALID with fingerprint", async () => {
    const contract = validContract();
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await validateProjectContractV1(parsed.contract, {
      validatedAt: VALIDATED_AT,
    });
    expect(result.status).toBe("VALID");
    expect(result.schemaVersion).toBe(PROJECT_CONTRACT_VALIDATION_RESULT_SCHEMA);
    expect(result.projectId).toBe(contract.projectId);
    expect(result.authorityFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("parseAndValidateProjectContractV1 succeeds for valid fixture", async () => {
    const outcome = await parseAndValidateProjectContractV1(validContract(), {
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.validation.status).toBe("VALID");
  });

  it("rejects malformed JSON syntax without throwing", () => {
    expect(parseProjectContractJsonBody("{")).toEqual({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Project contract body is not valid JSON syntax.",
    });
  });

  it("rejects non-string JSON body input without throwing", () => {
    expect(parseProjectContractJsonBody({})).toEqual({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Project contract body must be a UTF-8 JSON string.",
    });
  });

  it("rejects unknown root properties (additionalProperties:false)", () => {
    const contract = { ...validContract(), extraField: true };
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonCode).toBe("REJECTED_SCHEMA");
    expect(parsed.reasonMessage).toContain("unknown properties");
  });

  it("rejects missing required fields", () => {
    const contract = validContract();
    const { objective: _removed, ...incomplete } = contract;
    const parsed = parseProjectContractV1(incomplete);
    expect(parsed.ok).toBe(false);
  });

  it("rejects wrong schemaVersion", () => {
    const contract = { ...validContract(), schemaVersion: "PROJECT-CONTRACT-V0" };
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("PROJECT-CONTRACT-V1");
  });

  it("rejects malformed projectId", () => {
    const contract = { ...validContract(), projectId: " bad id " };
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(false);
  });

  it("rejects empty users", () => {
    const contract = { ...validContract(), users: [] };
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("users");
  });

  it("rejects duplicate users", () => {
    const contract = {
      ...validContract(),
      users: ["operator", "operator"],
    };
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("duplicate");
  });

  it("rejects empty successCriteria", () => {
    const contract = { ...validContract(), successCriteria: [] };
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(false);
  });

  it("rejects empty inScope / outOfScope", () => {
    expect(parseProjectContractV1({ ...validContract(), inScope: [] }).ok).toBe(
      false,
    );
    expect(
      parseProjectContractV1({ ...validContract(), outOfScope: [] }).ok,
    ).toBe(false);
  });

  it("rejects unknown constraints keys", () => {
    const contract = {
      ...validContract(),
      constraints: { ...validContract().constraints, silentWiden: true },
    };
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(false);
  });

  it("rejects malformed prohibitedCapabilities", () => {
    const contract = {
      ...validContract(),
      constraints: {
        ...validContract().constraints,
        prohibitedCapabilities: ["github.write"],
      },
    };
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(false);
  });

  it("rejects malformed repository refs", () => {
    const contract = {
      ...validContract(),
      repositories: [
        {
          repository: "not-a-repo",
          role: "PRIMARY",
        },
      ],
    };
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(false);
  });

  it("rejects unknown repository roles", () => {
    const contract = {
      ...validContract(),
      repositories: [
        {
          repository: "yasutakesougo/ai-development-control-center",
          role: "OWNER",
        },
      ],
    };
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(false);
  });

  it("rejects unknown humanGatePolicy keys", () => {
    const contract = {
      ...validContract(),
      humanGatePolicy: {
        ...validContract().humanGatePolicy,
        autoMerge: true,
      },
    };
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(false);
  });

  it("rejects unknown metadata keys including authority smuggling", () => {
    const contract = {
      ...validContract(),
      metadata: {
        ...validContract().metadata,
        authorityOverride: true,
      },
    };
    const parsed = parseProjectContractV1(contract);
    expect(parsed.ok).toBe(false);
  });

  it("rejects inScope / outOfScope exact overlap", async () => {
    const contract = {
      ...validContract(),
      inScope: ["Planner implementation", "Contract schema"],
      outOfScope: ["Planner implementation", "Agent execution"],
    };
    const outcome = await parseAndValidateProjectContractV1(contract, {
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.status).toBe("INVALID");
    expect(outcome.validation.reasonCode).toBe("REJECTED_SCOPE_CONFLICT");
  });

  it("rejects duplicate repository references", async () => {
    const contract = {
      ...validContract(),
      repositories: [
        {
          repository: "yasutakesougo/ai-development-control-center",
          role: "PRIMARY" as const,
          defaultBranch: "main",
        },
        {
          repository: "yasutakesougo/ai-development-control-center",
          role: "SECONDARY" as const,
        },
      ],
      constraints: {
        ...validContract().constraints,
        maxRepositories: 2,
      },
    };
    const outcome = await parseAndValidateProjectContractV1(contract, {
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_REPOSITORIES");
    expect(outcome.validation.reasonMessage).toContain("more than once");
  });

  it("rejects missing PRIMARY repository", async () => {
    const contract = {
      ...validContract(),
      repositories: [
        {
          repository: "yasutakesougo/ai-development-control-center",
          role: "OBSERVED" as const,
        },
      ],
    };
    const outcome = await parseAndValidateProjectContractV1(contract, {
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_REPOSITORIES");
    expect(outcome.validation.reasonMessage).toContain("PRIMARY");
  });

  it("rejects multiple PRIMARY repositories", async () => {
    const contract = {
      ...validContract(),
      repositories: [
        {
          repository: "yasutakesougo/ai-development-control-center",
          role: "PRIMARY" as const,
        },
        {
          repository: "yasutakesougo/other-repo",
          role: "PRIMARY" as const,
        },
      ],
      constraints: {
        ...validContract().constraints,
        maxRepositories: 2,
      },
    };
    const outcome = await parseAndValidateProjectContractV1(contract, {
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_REPOSITORIES");
  });

  it("rejects repositories exceeding maxRepositories", async () => {
    const contract = {
      ...validContract(),
      repositories: [
        {
          repository: "yasutakesougo/ai-development-control-center",
          role: "PRIMARY" as const,
        },
        {
          repository: "yasutakesougo/other-repo",
          role: "SECONDARY" as const,
        },
      ],
      constraints: {
        ...validContract().constraints,
        maxRepositories: 1,
      },
    };
    const outcome = await parseAndValidateProjectContractV1(contract, {
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_CONSTRAINTS");
  });

  it("rejects weakened Human gate policy", async () => {
    const contract = {
      ...validContract(),
      humanGatePolicy: {
        readyRequiresHuman: true,
        mergeRequiresHuman: false,
        issueCloseRequiresHuman: true,
        deployRequiresHuman: true,
      },
    };
    const outcome = await parseAndValidateProjectContractV1(contract, {
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_HUMAN_GATE_POLICY");
    expect(outcome.validation.reasonMessage).toContain("mergeRequiresHuman");
  });

  it("authority fingerprint ignores metadata.observedAt", async () => {
    const a = validContract();
    const b: ProjectContractV1 = {
      ...validContract(),
      metadata: {
        ...validContract().metadata,
        observedAt: "2099-01-01T00:00:00.000Z",
        notes: ["different audit note"],
      },
    };
    const fpA = await computeProjectContractAuthorityFingerprint(a);
    const fpB = await computeProjectContractAuthorityFingerprint(b);
    expect(fpA).toBe(fpB);
    expect(projectContractAuthorityFingerprintsEqual(fpA, fpB)).toBe(true);
  });

  it("authority fingerprint changes when governance fields change", async () => {
    const a = validContract();
    const b: ProjectContractV1 = {
      ...validContract(),
      objective: "Different objective changes authority fingerprint",
    };
    const fpA = await computeProjectContractAuthorityFingerprint(a);
    const fpB = await computeProjectContractAuthorityFingerprint(b);
    expect(fpA).not.toBe(fpB);
  });

  it("captureProjectContractAuthorityFacts excludes metadata", () => {
    const facts = captureProjectContractAuthorityFacts(validContract());
    expect(Object.keys(facts).sort()).toEqual(
      [...PROJECT_CONTRACT_AUTHORITY_FINGERPRINT_KEYS].sort(),
    );
    expect(
      Object.prototype.hasOwnProperty.call(facts, "metadata"),
    ).toBe(false);
    expect(PROJECT_CONTRACT_METADATA_KEYS).toContain("observedAt");
  });

  it("authority fingerprint is stable across key insertion order", async () => {
    const contract = validContract();
    // Rebuild with shuffled object key insertion order; array order unchanged.
    const shuffled: ProjectContractV1 = {
      humanGatePolicy: {
        deployRequiresHuman: contract.humanGatePolicy.deployRequiresHuman,
        issueCloseRequiresHuman:
          contract.humanGatePolicy.issueCloseRequiresHuman,
        mergeRequiresHuman: contract.humanGatePolicy.mergeRequiresHuman,
        readyRequiresHuman: contract.humanGatePolicy.readyRequiresHuman,
      },
      repositories: contract.repositories.map((ref) => ({
        defaultBranch: ref.defaultBranch,
        role: ref.role,
        repository: ref.repository,
      })),
      constraints: {
        notes: contract.constraints.notes,
        requireIndependentVerify: contract.constraints.requireIndependentVerify,
        maxRepositories: contract.constraints.maxRepositories,
        prohibitedCapabilities: contract.constraints.prohibitedCapabilities,
        maxRiskClass: contract.constraints.maxRiskClass,
      },
      outOfScope: [...contract.outOfScope],
      inScope: [...contract.inScope],
      successCriteria: [...contract.successCriteria],
      users: [...contract.users],
      problemStatement: contract.problemStatement,
      objective: contract.objective,
      name: contract.name,
      projectId: contract.projectId,
      schemaVersion: contract.schemaVersion,
      metadata: contract.metadata,
    };
    const fpA = await computeProjectContractAuthorityFingerprint(contract);
    const fpB = await computeProjectContractAuthorityFingerprint(shuffled);
    expect(fpA).toBe(fpB);
  });

  it("parseAndValidate returns INVALID without fingerprint when structural parse fails", async () => {
    const outcome = await parseAndValidateProjectContractV1(
      { schemaVersion: "PROJECT-CONTRACT-V1" },
      { validatedAt: VALIDATED_AT },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.contract).toBeNull();
    expect(outcome.validation.authorityFingerprint).toBeUndefined();
    expect(outcome.validation.reasonCode).toBe("REJECTED_SCHEMA");
  });

  it("parses a VALID validation result document", () => {
    const result = {
      schemaVersion: PROJECT_CONTRACT_VALIDATION_RESULT_SCHEMA,
      projectId: "project-contract-60-v1-2026-08-12",
      status: "VALID",
      reasonCode: "VALID",
      reasonMessage: "ok",
      authorityFingerprint:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      validatedAt: VALIDATED_AT,
    };
    const parsed = parseProjectContractValidationResult(result);
    expect(parsed.ok).toBe(true);
  });

  it("rejects validation results with unknown properties", () => {
    const parsed = parseProjectContractValidationResult({
      schemaVersion: PROJECT_CONTRACT_VALIDATION_RESULT_SCHEMA,
      projectId: null,
      status: "INVALID",
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "bad",
      validatedAt: VALIDATED_AT,
      extra: true,
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects malformed authorityFingerprint on validation results", () => {
    const parsed = parseProjectContractValidationResult({
      schemaVersion: PROJECT_CONTRACT_VALIDATION_RESULT_SCHEMA,
      projectId: null,
      status: "INVALID",
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "bad",
      authorityFingerprint: "not-a-sha",
      validatedAt: VALIDATED_AT,
    });
    expect(parsed.ok).toBe(false);
  });

  it("schema required keys align with runtime root keys", () => {
    const schema = loadSchema("project-contract-v1.schema.json");
    const required = schema.required as string[];
    for (const key of required) {
      expect(PROJECT_CONTRACT_ROOT_KEYS).toContain(key);
    }
    expect(PROJECT_CONTRACT_ROOT_KEYS).toContain("metadata");
    expect(PROJECT_CONTRACT_HUMAN_GATE_POLICY_KEYS).toEqual([
      "readyRequiresHuman",
      "mergeRequiresHuman",
      "issueCloseRequiresHuman",
      "deployRequiresHuman",
    ]);
  });

  it("validation-result schema required keys align with runtime", () => {
    const schema = loadSchema(
      "project-contract-validation-result-v1.schema.json",
    );
    const required = schema.required as string[];
    for (const key of required) {
      expect(PROJECT_CONTRACT_VALIDATION_RESULT_ROOT_KEYS).toContain(key);
    }
    expect(schema.properties).toHaveProperty("authorityFingerprint");
  });

  it("schemaVersion constants match schema const values", () => {
    const contractSchema = loadSchema("project-contract-v1.schema.json");
    const resultSchema = loadSchema(
      "project-contract-validation-result-v1.schema.json",
    );
    const contractProps = contractSchema.properties as Record<
      string,
      { const?: string }
    >;
    const resultProps = resultSchema.properties as Record<
      string,
      { const?: string }
    >;
    expect(contractProps.schemaVersion.const).toBe(PROJECT_CONTRACT_SCHEMA);
    expect(resultProps.schemaVersion.const).toBe(
      PROJECT_CONTRACT_VALIDATION_RESULT_SCHEMA,
    );
  });
});
