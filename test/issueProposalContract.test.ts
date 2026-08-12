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
  computeRoadmapContractAuthorityFingerprint,
  parseRoadmapContractV1,
  type RoadmapContractV1,
} from "../src/domain/roadmapContract";
import {
  ISSUE_PROPOSAL_AGENT_EXECUTION_IMPLEMENTED,
  ISSUE_PROPOSAL_AUTHORITY_FINGERPRINT_KEYS,
  ISSUE_PROPOSAL_GITHUB_ISSUE_MUTATION_IMPLEMENTED,
  ISSUE_PROPOSAL_METADATA_KEYS,
  ISSUE_PROPOSAL_PLANNER_IMPLEMENTED,
  ISSUE_PROPOSAL_PUBLISHER_IMPLEMENTED,
  ISSUE_PROPOSAL_RISK_CLASSES,
  ISSUE_PROPOSAL_ROOT_KEYS,
  ISSUE_PROPOSAL_SCHEDULER_IMPLEMENTED,
  ISSUE_PROPOSAL_SCHEMA,
  ISSUE_PROPOSAL_SPLITTER_IMPLEMENTED,
  ISSUE_PROPOSAL_STOP_AT_VALUES,
  ISSUE_PROPOSAL_VALIDATION_RESULT_ROOT_KEYS,
  ISSUE_PROPOSAL_VALIDATION_RESULT_SCHEMA,
  ISSUE_PROPOSAL_VALIDATOR_V1_IMPLEMENTED,
  assertIssueProposalSurfacesNotImplemented,
  captureIssueProposalAuthorityFacts,
  computeIssueProposalAuthorityFingerprint,
  issueProposalAuthorityFingerprintsEqual,
  parseAndValidateIssueProposalV1,
  parseIssueProposalJsonBody,
  parseIssueProposalV1,
  parseIssueProposalValidationResult,
  validateIssueProposalV1,
  type IssueProposalV1,
} from "../src/domain/issueProposalContract";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/issue-proposal/fixtures",
);
const schemasDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/issue-proposal/schemas",
);
const projectFixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/project-contract/fixtures",
);
const roadmapFixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/roadmap-contract/fixtures",
);

const VALIDATED_AT = "2026-08-12T22:18:00.000Z";

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
  const parsed = parseRoadmapContractV1(
    loadFixture<RoadmapContractV1>(roadmapFixturesDir, "roadmap-valid.json"),
  );
  if (!parsed.ok) throw new Error(parsed.reasonMessage);
  return parsed.roadmap;
}

function validProposal(): IssueProposalV1 {
  return loadFixture<IssueProposalV1>(fixturesDir, "issue-proposal-valid.json");
}

describe("ISSUE-PROPOSAL-V1 / ISSUE-DECOMPOSER-CONTRACT-V1", () => {
  it("keeps planner / validator / publisher / agent / scheduler surfaces unimplemented", () => {
    expect(ISSUE_PROPOSAL_PLANNER_IMPLEMENTED).toBe(false);
    expect(ISSUE_PROPOSAL_VALIDATOR_V1_IMPLEMENTED).toBe(false);
    expect(ISSUE_PROPOSAL_SPLITTER_IMPLEMENTED).toBe(false);
    expect(ISSUE_PROPOSAL_GITHUB_ISSUE_MUTATION_IMPLEMENTED).toBe(false);
    expect(ISSUE_PROPOSAL_PUBLISHER_IMPLEMENTED).toBe(false);
    expect(ISSUE_PROPOSAL_AGENT_EXECUTION_IMPLEMENTED).toBe(false);
    expect(ISSUE_PROPOSAL_SCHEDULER_IMPLEMENTED).toBe(false);
    assertIssueProposalSurfacesNotImplemented();
  });

  it("reserves risk and stopAt enums", () => {
    expect(ISSUE_PROPOSAL_RISK_CLASSES).toEqual([
      "R0",
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
    ]);
    expect(ISSUE_PROPOSAL_STOP_AT_VALUES).toEqual([
      "TASK_BUILT",
      "AGENT_COMPLETE",
      "VERIFY_COMPLETE",
      "DRAFT_PR",
    ]);
  });

  it("parses the valid fixture", () => {
    expect(parseIssueProposalV1(validProposal()).ok).toBe(true);
  });

  it("valid fixture provenance fingerprint matches RoadmapContract fixture", async () => {
    const roadmap = validRoadmap();
    const proposal = validProposal();
    const fp = await computeRoadmapContractAuthorityFingerprint(roadmap);
    expect(proposal.provenance.roadmapId).toBe(roadmap.roadmapId);
    expect(proposal.provenance.roadmapAuthorityFingerprint).toBe(fp);
  });

  it("validates the valid fixture as VALID with fingerprint", async () => {
    const proposal = validProposal();
    const parsed = parseIssueProposalV1(proposal);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await validateIssueProposalV1(parsed.proposal, {
      roadmapContract: validRoadmap(),
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(result.status).toBe("VALID");
    expect(result.schemaVersion).toBe(ISSUE_PROPOSAL_VALIDATION_RESULT_SCHEMA);
    expect(result.proposalId).toBe(proposal.proposalId);
    expect(result.roadmapNodeId).toBe(proposal.roadmapNodeId);
    expect(result.authorityFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.reasonMessage).toContain("does not grant GitHub Issue mutation");
  });

  it("parseAndValidateIssueProposalV1 succeeds for valid fixture", async () => {
    const outcome = await parseAndValidateIssueProposalV1(validProposal(), {
      roadmapContract: validRoadmap(),
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.validation.status).toBe("VALID");
  });

  it("rejects malformed JSON syntax without throwing", () => {
    expect(parseIssueProposalJsonBody("{")).toEqual({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Issue proposal body is not valid JSON syntax.",
    });
  });

  it("rejects non-string JSON body input without throwing", () => {
    expect(parseIssueProposalJsonBody({})).toEqual({
      ok: false,
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "Issue proposal body must be a UTF-8 JSON string.",
    });
  });

  it("rejects unknown root properties (additionalProperties:false)", () => {
    const proposal = { ...validProposal(), extraField: true };
    const parsed = parseIssueProposalV1(proposal);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonCode).toBe("REJECTED_SCHEMA");
    expect(parsed.reasonMessage).toContain("unknown properties");
  });

  it("rejects missing required fields", () => {
    const proposal = validProposal();
    const { acceptanceCriteria: _removed, ...incomplete } = proposal;
    expect(parseIssueProposalV1(incomplete).ok).toBe(false);
  });

  it("rejects wrong schemaVersion", () => {
    const proposal = {
      ...validProposal(),
      schemaVersion: "ISSUE-PROPOSAL-V0",
    };
    const parsed = parseIssueProposalV1(proposal);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("ISSUE-PROPOSAL-V1");
  });

  it("rejects empty acceptanceCriteria at structural parse", () => {
    const proposal = { ...validProposal(), acceptanceCriteria: [] };
    const parsed = parseIssueProposalV1(proposal);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("acceptanceCriteria");
  });

  it("rejects duplicate path entries after trailing-slash normalization", () => {
    const proposal = {
      ...validProposal(),
      allowedPaths: ["docs/issue-proposal", "docs/issue-proposal/"],
    };
    const parsed = parseIssueProposalV1(proposal);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reasonMessage).toContain("duplicate");
  });

  it("rejects duplicate capability entries", () => {
    const proposal = {
      ...validProposal(),
      allowedCapabilities: ["workspace.read.v1", "workspace.read.v1"],
    };
    expect(parseIssueProposalV1(proposal).ok).toBe(false);
  });

  it("rejects malformed repository / capability / risk / stopAt", () => {
    expect(
      parseIssueProposalV1({
        ...validProposal(),
        repository: "not-a-repo",
      }).ok,
    ).toBe(false);
    expect(
      parseIssueProposalV1({
        ...validProposal(),
        allowedCapabilities: ["github.write"],
      }).ok,
    ).toBe(false);
    expect(
      parseIssueProposalV1({
        ...validProposal(),
        riskClass: "R9",
      }).ok,
    ).toBe(false);
    expect(
      parseIssueProposalV1({
        ...validProposal(),
        stopAt: "MERGE",
      }).ok,
    ).toBe(false);
  });

  it("rejects overlapping allowedPaths / forbiddenPaths", async () => {
    const proposal = {
      ...validProposal(),
      allowedPaths: ["docs/issue-proposal/"],
      forbiddenPaths: ["docs/issue-proposal/secrets/"],
    };
    const outcome = await parseAndValidateIssueProposalV1(proposal, {
      roadmapContract: validRoadmap(),
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_PATH_CONFLICT");
  });

  it("rejects exact path conflict between allowed and forbidden", async () => {
    const proposal = {
      ...validProposal(),
      allowedPaths: ["docs/issue-proposal/"],
      forbiddenPaths: ["docs/issue-proposal"],
    };
    const outcome = await parseAndValidateIssueProposalV1(proposal, {
      roadmapContract: validRoadmap(),
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_PATH_CONFLICT");
  });

  it("rejects self-dependency", async () => {
    const proposal = validProposal();
    const outcome = await parseAndValidateIssueProposalV1(
      { ...proposal, dependsOn: [proposal.proposalId] },
      {
        roadmapContract: validRoadmap(),
        projectContract: validProject(),
        validatedAt: VALIDATED_AT,
      },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_DEPENDENCY");
  });

  it("rejects missing roadmapNodeId binding", async () => {
    const proposal = {
      ...validProposal(),
      roadmapNodeId: "node-does-not-exist",
    };
    const outcome = await parseAndValidateIssueProposalV1(proposal, {
      roadmapContract: validRoadmap(),
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe(
      "REJECTED_ROADMAP_NODE_BINDING",
    );
  });

  it("rejects stale roadmapAuthorityFingerprint", async () => {
    const proposal = {
      ...validProposal(),
      provenance: {
        ...validProposal().provenance,
        roadmapAuthorityFingerprint:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    };
    const outcome = await parseAndValidateIssueProposalV1(proposal, {
      roadmapContract: validRoadmap(),
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_ROADMAP_BINDING");
    expect(outcome.validation.reasonMessage).toContain(
      "roadmapAuthorityFingerprint",
    );
  });

  it("rejects repository outside ProjectContract authority", async () => {
    const proposal = {
      ...validProposal(),
      repository: "yasutakesougo/not-in-project",
    };
    const outcome = await parseAndValidateIssueProposalV1(proposal, {
      roadmapContract: validRoadmap(),
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_REPOSITORY_BINDING");
  });

  it("rejects repository mismatch against bound RoadmapNode.repository", async () => {
    const project = validProject();
    // Add a second repository to Project so repository authority alone would pass.
    const widenedProject: ProjectContractV1 = {
      ...project,
      repositories: [
        ...project.repositories,
        {
          repository: "yasutakesougo/other-bound-repository",
          role: "SECONDARY",
        },
      ],
    };
    const projectFp =
      await computeProjectContractAuthorityFingerprint(widenedProject);
    const roadmap: RoadmapContractV1 = {
      ...validRoadmap(),
      projectAuthorityFingerprint: projectFp,
    };
    const roadmapFp = await computeRoadmapContractAuthorityFingerprint(roadmap);
    const proposal = {
      ...validProposal(),
      repository: "yasutakesougo/other-bound-repository",
      provenance: {
        roadmapId: roadmap.roadmapId,
        roadmapAuthorityFingerprint: roadmapFp,
      },
    };
    const outcome = await parseAndValidateIssueProposalV1(proposal, {
      roadmapContract: roadmap,
      projectContract: widenedProject,
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_REPOSITORY_BINDING");
    expect(outcome.validation.reasonMessage).toContain("RoadmapNode.repository");
  });

  it("rejects ProjectContract prohibitedCapabilities", async () => {
    const proposal = {
      ...validProposal(),
      allowedCapabilities: ["github.issue.create.v1"],
    };
    const outcome = await parseAndValidateIssueProposalV1(proposal, {
      roadmapContract: validRoadmap(),
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_CAPABILITY");
    expect(outcome.validation.reasonMessage).toContain(
      "github.issue.create.v1",
    );
  });

  it("rejects riskClass above ProjectContract maxRiskClass", async () => {
    const proposal = { ...validProposal(), riskClass: "R2" as const };
    const outcome = await parseAndValidateIssueProposalV1(proposal, {
      roadmapContract: validRoadmap(),
      projectContract: validProject(),
      validatedAt: VALIDATED_AT,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.validation.reasonCode).toBe("REJECTED_RISK_CLASS");
  });

  it("authority fingerprint ignores metadata.observedAt", async () => {
    const a = validProposal();
    const b: IssueProposalV1 = {
      ...validProposal(),
      metadata: {
        ...validProposal().metadata,
        observedAt: "2099-01-01T00:00:00.000Z",
        notes: ["different audit note"],
      },
    };
    const fpA = await computeIssueProposalAuthorityFingerprint(a);
    const fpB = await computeIssueProposalAuthorityFingerprint(b);
    expect(fpA).toBe(fpB);
    expect(issueProposalAuthorityFingerprintsEqual(fpA, fpB)).toBe(true);
  });

  it("authority fingerprint changes when objective changes", async () => {
    const a = validProposal();
    const b: IssueProposalV1 = {
      ...validProposal(),
      objective: "Different objective changes authority fingerprint",
    };
    const fpA = await computeIssueProposalAuthorityFingerprint(a);
    const fpB = await computeIssueProposalAuthorityFingerprint(b);
    expect(fpA).not.toBe(fpB);
  });

  it("authority fingerprint changes when acceptanceCriteria change", async () => {
    const a = validProposal();
    const b: IssueProposalV1 = {
      ...a,
      acceptanceCriteria: [
        ...a.acceptanceCriteria,
        "Additional authority-bearing acceptance criterion",
      ],
    };
    const fpA = await computeIssueProposalAuthorityFingerprint(a);
    const fpB = await computeIssueProposalAuthorityFingerprint(b);
    expect(fpA).not.toBe(fpB);
  });

  it("authority fingerprint changes when roadmap provenance changes", async () => {
    const a = validProposal();
    const b: IssueProposalV1 = {
      ...a,
      provenance: {
        ...a.provenance,
        roadmapAuthorityFingerprint:
          "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
    };
    const fpA = await computeIssueProposalAuthorityFingerprint(a);
    const fpB = await computeIssueProposalAuthorityFingerprint(b);
    expect(fpA).not.toBe(fpB);
  });

  it("captureIssueProposalAuthorityFacts excludes metadata and sorts lists", () => {
    const facts = captureIssueProposalAuthorityFacts(validProposal());
    expect(Object.keys(facts).sort()).toEqual(
      [...ISSUE_PROPOSAL_AUTHORITY_FINGERPRINT_KEYS].sort(),
    );
    expect(Object.prototype.hasOwnProperty.call(facts, "metadata")).toBe(false);
    expect(ISSUE_PROPOSAL_METADATA_KEYS).toContain("observedAt");
    expect(facts.dependsOn).toEqual([...facts.dependsOn].sort());
    expect(facts.allowedCapabilities).toEqual(
      [...facts.allowedCapabilities].sort(),
    );
    expect(facts.acceptanceCriteria).toEqual(
      [...facts.acceptanceCriteria].sort(),
    );
    const commandIds = facts.verificationCommands.map((command) => command.id);
    expect(commandIds).toEqual([...commandIds].sort());
  });

  it("authority fingerprint is stable across key and list insertion order", async () => {
    const proposal = validProposal();
    const shuffled: IssueProposalV1 = {
      metadata: proposal.metadata,
      provenance: {
        roadmapAuthorityFingerprint:
          proposal.provenance.roadmapAuthorityFingerprint,
        roadmapId: proposal.provenance.roadmapId,
      },
      estimatedChangedFiles: proposal.estimatedChangedFiles,
      stopAt: proposal.stopAt,
      riskClass: proposal.riskClass,
      allowedCapabilities: [...proposal.allowedCapabilities].reverse(),
      verificationCommands: [...proposal.verificationCommands].reverse(),
      acceptanceCriteria: [...proposal.acceptanceCriteria].reverse(),
      forbiddenPaths: [...proposal.forbiddenPaths].reverse(),
      allowedPaths: [...proposal.allowedPaths].reverse(),
      dependsOn: [...proposal.dependsOn].reverse(),
      objective: proposal.objective,
      title: proposal.title,
      repository: proposal.repository,
      roadmapNodeId: proposal.roadmapNodeId,
      proposalId: proposal.proposalId,
      schemaVersion: proposal.schemaVersion,
    };
    const fpA = await computeIssueProposalAuthorityFingerprint(proposal);
    const fpB = await computeIssueProposalAuthorityFingerprint(shuffled);
    expect(fpA).toBe(fpB);
  });

  it("parseAndValidate returns INVALID without fingerprint when structural parse fails", async () => {
    const outcome = await parseAndValidateIssueProposalV1(
      { schemaVersion: "ISSUE-PROPOSAL-V1" },
      {
        roadmapContract: validRoadmap(),
        projectContract: validProject(),
        validatedAt: VALIDATED_AT,
      },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.proposal).toBeNull();
    expect(outcome.validation.authorityFingerprint).toBeUndefined();
    expect(outcome.validation.reasonCode).toBe("REJECTED_SCHEMA");
  });

  it("parses a VALID validation result document", () => {
    const result = {
      schemaVersion: ISSUE_PROPOSAL_VALIDATION_RESULT_SCHEMA,
      proposalId: "proposal-62-issue-decomposer-contract-v1",
      roadmapNodeId: "node-issue-decomposer-contract",
      status: "VALID",
      reasonCode: "VALID",
      reasonMessage: "ok",
      authorityFingerprint:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      validatedAt: VALIDATED_AT,
    };
    expect(parseIssueProposalValidationResult(result).ok).toBe(true);
  });

  it("rejects validation results with unknown properties", () => {
    const parsed = parseIssueProposalValidationResult({
      schemaVersion: ISSUE_PROPOSAL_VALIDATION_RESULT_SCHEMA,
      proposalId: null,
      roadmapNodeId: null,
      status: "INVALID",
      reasonCode: "REJECTED_SCHEMA",
      reasonMessage: "bad",
      validatedAt: VALIDATED_AT,
      extra: true,
    });
    expect(parsed.ok).toBe(false);
  });

  it("schema required keys align with runtime root keys", () => {
    const schema = loadSchema("issue-proposal-v1.schema.json");
    const required = schema.required as string[];
    for (const key of required) {
      expect(ISSUE_PROPOSAL_ROOT_KEYS).toContain(key);
    }
    expect(ISSUE_PROPOSAL_ROOT_KEYS).toContain("metadata");
  });

  it("validation-result schema required keys align with runtime", () => {
    const schema = loadSchema(
      "issue-proposal-validation-result-v1.schema.json",
    );
    const required = schema.required as string[];
    for (const key of required) {
      expect(ISSUE_PROPOSAL_VALIDATION_RESULT_ROOT_KEYS).toContain(key);
    }
    expect(schema.properties).toHaveProperty("authorityFingerprint");
  });

  it("schemaVersion constants match schema const values", () => {
    const contractSchema = loadSchema("issue-proposal-v1.schema.json");
    const resultSchema = loadSchema(
      "issue-proposal-validation-result-v1.schema.json",
    );
    const contractProps = contractSchema.properties as Record<
      string,
      { const?: string }
    >;
    const resultProps = resultSchema.properties as Record<
      string,
      { const?: string }
    >;
    expect(contractProps.schemaVersion.const).toBe(ISSUE_PROPOSAL_SCHEMA);
    expect(resultProps.schemaVersion.const).toBe(
      ISSUE_PROPOSAL_VALIDATION_RESULT_SCHEMA,
    );
  });
});
