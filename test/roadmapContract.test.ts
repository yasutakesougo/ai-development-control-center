import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  computeProjectContractAuthorityFingerprint,
  parseProjectContractV1,
  type ProjectContractV1,
} from "../src/domain/projectContract";
import {
  ROADMAP_AGENT_EXECUTION_IMPLEMENTED,
  ROADMAP_CONTRACT_AUTHORITY_FINGERPRINT_KEYS,
  ROADMAP_CONTRACT_METADATA_KEYS,
  ROADMAP_CONTRACT_ROOT_KEYS,
  ROADMAP_CONTRACT_SCHEMA,
  ROADMAP_CONTRACT_VALIDATION_RESULT_ROOT_KEYS,
  ROADMAP_CONTRACT_VALIDATION_RESULT_SCHEMA,
  ROADMAP_GITHUB_ISSUE_MUTATION_IMPLEMENTED,
  ROADMAP_ISSUE_PROPOSAL_GENERATION_IMPLEMENTED,
  ROADMAP_NODE_COMPLEXITY_VALUES,
  ROADMAP_NODE_STATUS_VALUES,
  ROADMAP_PLANNER_IMPLEMENTED,
  ROADMAP_SCHEDULER_IMPLEMENTED,
  assertRoadmapPlanningSurfacesNotImplemented,
  captureRoadmapContractAuthorityFacts,
  computeRoadmapContractAuthorityFingerprint,
  findRoadmapCycle,
  parseAndValidateRoadmapContractV1,
  parseRoadmapContractJsonBody,
  parseRoadmapContractV1,
  parseRoadmapContractValidationResult,
  roadmapContractAuthorityFingerprintsEqual,
  validateRoadmapContractV1,
  type RoadmapContractV1,
  type RoadmapNodeV1,
} from "../src/domain/roadmapContract";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/roadmap-contract/fixtures",
);
const schemasDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/roadmap-contract/schemas",
);
const projectFixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/project-contract/fixtures",
);

const VALIDATED_AT = "2026-08-12T15:34:00.000Z";

function loadFixture<T>(dir: string, name: string): T {
  return JSON.parse(readFileSync(join(dir, name), "utf8")) as T;
}

function loadSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(schemasDir, name), "utf8")) as Record<
    string,
    unknown
  >;
}

function validProject(): ProjectContractV1 {
  const parsed = parseProjectContractV1(
    loadFixture<ProjectContractV1>(projectFixturesDir, "project-valid.json"),
  );
  if (!parsed.ok) throw new Error(parsed.reasonMessage);
  return parsed.contract;
}

function validRoadmap(): RoadmapContractV1 {
  return loadFixture<RoadmapContractV1>(fixturesDir, "roadmap-valid.json");
}

function cloneNode(
  node: RoadmapNodeV1,
  overrides: Partial<RoadmapNodeV1> = {},
): RoadmapNodeV1 {
  return {
    ...node,
    dependsOn: [...(overrides.dependsOn ?? node.dependsOn)],
    completionCriteria: [
      ...(overrides.completionCriteria ?? node.completionCriteria),
    ],
    ...overrides,
  };
}

describe("ROADMAP-CONTRACT-V1 contract", () => {
  it("keeps planner / issue / agent / scheduler surfaces unimplemented", () => {
    expect(ROADMAP_PLANNER_IMPLEMENTED).toBe(false);
    expect(ROADMAP_ISSUE_PROPOSAL_GENERATION_IMPLEMENTED).toBe(false);
    expect(ROADMAP_GITHUB_ISSUE_MUTATION_IMPLEMENTED).toBe(false);
    expect(ROADMAP_AGENT_EXECUTION_IMPLEMENTED).toBe(false);
    expect(ROADMAP_SCHEDULER_IMPLEMENTED).toBe(false);
    assertRoadmapPlanningSurfacesNotImplemented();
  });

  it("reserves complexity and status enums", () => {
    expect(ROADMAP_NODE_COMPLEXITY_VALUES).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(ROADMAP_NODE_STATUS_VALUES).toEqual([
      "PLANNED",
      "READY",
      "IN_PROGRESS",
      "BLOCKED",
      "COMPLETE",
      "HOLD",
      "UNKNOWN",
    ]);
  });

  it("parses the valid fixture", () => {
    expect(parseRoadmapContractV1(validRoadmap()).ok).toBe(true);
  });

  it("valid fixture projectAuthorityFingerprint matches ProjectContract fixture", async () => {
    const project = validProject();
    const roadmap = validRoadmap();
    const fp = await computeProjectContractAuthorityFingerprint(project);
    expect(roadmap.projectId).toBe(project.projectId);
    expect(roadmap.projectAuthorityFingerprint).toBe(fp);
  });

  it("validates the valid fixture as VALID with fingerprint", async () => {
    const roadmap = validRoadmap();
    const parsed = parseRoadmapContractV1(roadmap);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await validateRoadmapContractV1(parsed.roadmap, {
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(result.status).toBe("VALID");
    expect(result.schemaVersion).toBe(ROADMAP_CONTRACT_VALIDATION_RESULT_SCHEMA);
    expect(result.roadmapId).toBe(roadmap.roadmapId);
    expect(result.projectId).toBe(roadmap.projectId);
    expect(result.authorityFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("parseAndValidateRoadmapContractV1 succeeds for valid fixture", async () => {
    const outcome = await parseAndValidateRoadmapContractV1(validRoadmap(), {
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.validation.status).toBe("VALID");
  });

  it("rejects malformed JSON syntax without throwing", () => {
    expect(parseRoadmapContractJsonBody("{")).toEqual({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Roadmap contract body is not valid JSON syntax.",
    });
  });

  it("rejects non-string JSON body input without throwing", () => {
    expect(parseRoadmapContractJsonBody({})).toEqual({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Roadmap contract body must be a UTF-8 JSON string.",
    });
  });

  it("rejects unknown root properties (additionalProperties:false)", () => {
    const roadmap = { ...validRoadmap(), extraField: true };
    const parsed = parseRoadmapContractV1(roadmap);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonCode).toBe("REJECTED_SCHEMA");
    expect(parsed.reasonMessage).toContain("unknown properties");
  });

  it("rejects missing required fields", () => {
    const roadmap = validRoadmap();
    const { nodes: _removed, ...incomplete } = roadmap;
    expect(parseRoadmapContractV1(incomplete).ok).toBe(false);
  });

  it("rejects wrong schemaVersion", () => {
    const roadmap = { ...validRoadmap(), schemaVersion: "ROADMAP-CONTRACT-V0" };
    const parsed = parseRoadmapContractV1(roadmap);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("ROADMAP-CONTRACT-V1");
  });

  it("rejects malformed projectAuthorityFingerprint", () => {
    const roadmap = {
      ...validRoadmap(),
      projectAuthorityFingerprint: "not-a-sha",
    };
    const parsed = parseRoadmapContractV1(roadmap);
    expect(parsed.ok).toBe(false);
  });

  it("rejects unknown node properties", () => {
    const roadmap = validRoadmap();
    const nodes = roadmap.nodes.map((node, index) =>
      index === 0 ? { ...node, plannerHint: "widen" } : node,
    );
    const parsed = parseRoadmapContractV1({ ...roadmap, nodes });
    expect(parsed.ok).toBe(false);
  });

  it("rejects empty completionCriteria at structural parse", () => {
    const roadmap = validRoadmap();
    const nodes = [
      cloneNode(roadmap.nodes[0]!, { completionCriteria: [] }),
      ...roadmap.nodes.slice(1),
    ];
    const parsed = parseRoadmapContractV1({ ...roadmap, nodes });
    expect(parsed.ok).toBe(false);
  });

  it("rejects projectId mismatch against ProjectContract", async () => {
    const roadmap = { ...validRoadmap(), projectId: "other-project-id" };
    const outcome = await parseAndValidateRoadmapContractV1(roadmap, {
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_PROJECT_BINDING");
  });

  it("rejects stale projectAuthorityFingerprint", async () => {
    const roadmap = {
      ...validRoadmap(),
      projectAuthorityFingerprint:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    const outcome = await parseAndValidateRoadmapContractV1(roadmap, {
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_PROJECT_BINDING");
    expect(outcome.validation.reasonMessage).toContain(
      "projectAuthorityFingerprint",
    );
  });

  it("rejects duplicate node IDs", async () => {
    const roadmap = validRoadmap();
    const nodes = [
      ...roadmap.nodes,
      cloneNode(roadmap.nodes[0]!, {
        title: "duplicate",
        dependsOn: [],
      }),
    ];
    const outcome = await parseAndValidateRoadmapContractV1(
      { ...roadmap, nodes },
      { projectContract: validProject(), validatedAt: VALIDATED_AT },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_DUPLICATE_NODE_ID");
  });

  it("rejects missing dependency references", async () => {
    const roadmap = validRoadmap();
    const nodes = [
      cloneNode(roadmap.nodes[0]!, { dependsOn: ["missing-node"] }),
      ...roadmap.nodes.slice(1),
    ];
    const outcome = await parseAndValidateRoadmapContractV1(
      { ...roadmap, nodes },
      { projectContract: validProject(), validatedAt: VALIDATED_AT },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_DEPENDENCY_MISSING");
  });

  it("rejects self-dependency", async () => {
    const roadmap = validRoadmap();
    const nodeId = roadmap.nodes[0]!.nodeId;
    const nodes = [
      cloneNode(roadmap.nodes[0]!, { dependsOn: [nodeId] }),
      ...roadmap.nodes.slice(1),
    ];
    const outcome = await parseAndValidateRoadmapContractV1(
      { ...roadmap, nodes },
      { projectContract: validProject(), validatedAt: VALIDATED_AT },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_SELF_DEPENDENCY");
  });

  it("rejects cycles (DAG only, no silent repair)", async () => {
    const roadmap = validRoadmap();
    const a = roadmap.nodes[0]!.nodeId;
    const b = roadmap.nodes[1]!.nodeId;
    const nodes = [
      cloneNode(roadmap.nodes[0]!, { dependsOn: [b] }),
      cloneNode(roadmap.nodes[1]!, { dependsOn: [a] }),
      ...roadmap.nodes.slice(2),
    ];
    expect(findRoadmapCycle(nodes)).not.toBeNull();
    const outcome = await parseAndValidateRoadmapContractV1(
      { ...roadmap, nodes },
      { projectContract: validProject(), validatedAt: VALIDATED_AT },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_CYCLE");
    expect(outcome.validation.reasonMessage).toContain("cycle");
  });

  it("findRoadmapCycle returns null for a valid DAG", () => {
    expect(findRoadmapCycle(validRoadmap().nodes)).toBeNull();
  });

  it("rejects repository binding outside ProjectContract authority", async () => {
    const roadmap = validRoadmap();
    const nodes = [
      cloneNode(roadmap.nodes[0]!, {
        repository: "yasutakesougo/not-in-project",
      }),
      ...roadmap.nodes.slice(1),
    ];
    const outcome = await parseAndValidateRoadmapContractV1(
      { ...roadmap, nodes },
      { projectContract: validProject(), validatedAt: VALIDATED_AT },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_REPOSITORY_BINDING");
  });

  it("allows nodes without repository binding", async () => {
    const roadmap = validRoadmap();
    const nodes = roadmap.nodes.map((node) => {
      const { repository: _removed, ...rest } = node;
      return rest;
    });
    const outcome = await parseAndValidateRoadmapContractV1(
      { ...roadmap, nodes },
      { projectContract: validProject(), validatedAt: VALIDATED_AT },
    );
    expect(outcome.ok).toBe(true);
  });

  it("authority fingerprint ignores metadata.observedAt", async () => {
    const a = validRoadmap();
    const b: RoadmapContractV1 = {
      ...validRoadmap(),
      metadata: {
        ...validRoadmap().metadata,
        observedAt: "2099-01-01T00:00:00.000Z",
        notes: ["different audit note"],
      },
    };
    const fpA = await computeRoadmapContractAuthorityFingerprint(a);
    const fpB = await computeRoadmapContractAuthorityFingerprint(b);
    expect(fpA).toBe(fpB);
    expect(roadmapContractAuthorityFingerprintsEqual(fpA, fpB)).toBe(true);
  });

  it("authority fingerprint changes when node objective changes", async () => {
    const a = validRoadmap();
    const b: RoadmapContractV1 = {
      ...validRoadmap(),
      nodes: [
        cloneNode(validRoadmap().nodes[0]!, {
          objective: "Different objective changes authority fingerprint",
        }),
        ...validRoadmap().nodes.slice(1),
      ],
    };
    const fpA = await computeRoadmapContractAuthorityFingerprint(a);
    const fpB = await computeRoadmapContractAuthorityFingerprint(b);
    expect(fpA).not.toBe(fpB);
  });

  it("captureRoadmapContractAuthorityFacts excludes metadata and sorts nodes", () => {
    const facts = captureRoadmapContractAuthorityFacts(validRoadmap());
    expect(Object.keys(facts).sort()).toEqual(
      [...ROADMAP_CONTRACT_AUTHORITY_FINGERPRINT_KEYS].sort(),
    );
    expect(Object.prototype.hasOwnProperty.call(facts, "metadata")).toBe(false);
    expect(ROADMAP_CONTRACT_METADATA_KEYS).toContain("observedAt");
    const ids = facts.nodes.map((node) => node.nodeId);
    expect(ids).toEqual([...ids].sort());
  });

  it("authority fingerprint is stable across node and key insertion order", async () => {
    const roadmap = validRoadmap();
    const shuffled: RoadmapContractV1 = {
      metadata: roadmap.metadata,
      nodes: [...roadmap.nodes].reverse().map((node) => ({
        status: node.status,
        estimatedComplexity: node.estimatedComplexity,
        completionCriteria: [...node.completionCriteria].reverse(),
        dependsOn: [...node.dependsOn].reverse(),
        phase: node.phase,
        objective: node.objective,
        title: node.title,
        nodeId: node.nodeId,
        ...(node.repository !== undefined
          ? { repository: node.repository }
          : {}),
      })),
      projectAuthorityFingerprint: roadmap.projectAuthorityFingerprint,
      projectId: roadmap.projectId,
      roadmapId: roadmap.roadmapId,
      schemaVersion: roadmap.schemaVersion,
    };
    const fpA = await computeRoadmapContractAuthorityFingerprint(roadmap);
    const fpB = await computeRoadmapContractAuthorityFingerprint(shuffled);
    expect(fpA).toBe(fpB);
  });

  it("parseAndValidate returns INVALID without fingerprint when structural parse fails", async () => {
    const outcome = await parseAndValidateRoadmapContractV1(
      { schemaVersion: "ROADMAP-CONTRACT-V1" },
      { projectContract: validProject(), validatedAt: VALIDATED_AT },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.roadmap).toBeNull();
    expect(outcome.validation.authorityFingerprint).toBeUndefined();
    expect(outcome.validation.reasonCode).toBe("REJECTED_SCHEMA");
  });

  it("parses a VALID validation result document", () => {
    const result = {
      schemaVersion: ROADMAP_CONTRACT_VALIDATION_RESULT_SCHEMA,
      roadmapId: "roadmap-61-v1-2026-08-12",
      projectId: "project-contract-60-v1-2026-08-12",
      status: "VALID",
      reasonCode: "VALID",
      reasonMessage: "ok",
      authorityFingerprint:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      validatedAt: VALIDATED_AT,
    };
    expect(parseRoadmapContractValidationResult(result).ok).toBe(true);
  });

  it("rejects validation results with unknown properties", () => {
    const parsed = parseRoadmapContractValidationResult({
      schemaVersion: ROADMAP_CONTRACT_VALIDATION_RESULT_SCHEMA,
      roadmapId: null,
      projectId: null,
      status: "INVALID",
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "bad",
      validatedAt: VALIDATED_AT,
      extra: true,
    });
    expect(parsed.ok).toBe(false);
  });

  it("schema required keys align with runtime root keys", () => {
    const schema = loadSchema("roadmap-contract-v1.schema.json");
    const required = schema.required as string[];
    for (const key of required) {
      expect(ROADMAP_CONTRACT_ROOT_KEYS).toContain(key);
    }
    expect(ROADMAP_CONTRACT_ROOT_KEYS).toContain("metadata");
  });

  it("validation-result schema required keys align with runtime", () => {
    const schema = loadSchema(
      "roadmap-contract-validation-result-v1.schema.json",
    );
    const required = schema.required as string[];
    for (const key of required) {
      expect(ROADMAP_CONTRACT_VALIDATION_RESULT_ROOT_KEYS).toContain(key);
    }
    expect(schema.properties).toHaveProperty("authorityFingerprint");
  });

  it("schemaVersion constants match schema const values", () => {
    const contractSchema = loadSchema("roadmap-contract-v1.schema.json");
    const resultSchema = loadSchema(
      "roadmap-contract-validation-result-v1.schema.json",
    );
    const contractProps = contractSchema.properties as Record<
      string,
      { const?: string }
    >;
    const resultProps = resultSchema.properties as Record<
      string,
      { const?: string }
    >;
    expect(contractProps.schemaVersion.const).toBe(ROADMAP_CONTRACT_SCHEMA);
    expect(resultProps.schemaVersion.const).toBe(
      ROADMAP_CONTRACT_VALIDATION_RESULT_SCHEMA,
    );
  });
});
