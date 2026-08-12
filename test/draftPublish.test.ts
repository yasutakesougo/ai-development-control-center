import { describe, expect, it, beforeEach } from "vitest";
import {
  buildAgentTaskFromIssue,
  type AgentTaskBuilderResultV1,
} from "../src/domain/agentTaskBuilder";
import {
  AGENT_TASK_SCHEMA,
  parseAgentTaskV1,
  type AgentTaskV1,
  type AgentTaskValidationResultV1,
} from "../src/domain/agentTaskContract";
import {
  INDEPENDENT_VERIFY_RESULT_SCHEMA,
  INDEPENDENT_VERIFY_VERSION,
  type IndependentVerifyResultV1,
} from "../src/domain/independentVerify";
import {
  DRAFT_PUBLISH_REAL_GITHUB_PUBLICATION_IMPLEMENTED,
  DRAFT_PUBLISH_GITHUB_MUTATION_PERFORMED,
  DRAFT_PUBLISH_PROVIDER_INTEGRATION_STATUS,
  DRAFT_PUBLISH_REQUIRED_CAPABILITY,
  DRAFT_PUBLISH_REQUIRED_RISK_CLASS,
  DRAFT_PUBLISH_REQUIRED_STOP_AT,
  DRAFT_PUBLISH_RESULT_SCHEMA,
  DRAFT_PUBLISH_VERSION,
  assertDraftPublishBoundaries,
  computeDraftPublishPayloadFingerprint,
  createFakeDraftPublishAdapterV1,
  publishDraftPrV1,
  type DraftPublishAttemptRecordV1,
} from "../src/domain/draftPublish";
import { resetFakeDraftPublishCounterForTests } from "../src/domain/draftPublishAdapter";

const BASE = "be468cdcf7c1fbc17488461083d57afe783506d4";
const HEAD = "cccccccccccccccccccccccccccccccccccccccc";
const OTHER_BASE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_HEAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const OBSERVED_AT = "2026-08-12T11:55:00.000Z";
const VALIDATED_AT = "2026-08-12T11:55:30.000Z";
const REPO = "yasutakesougo/ai-development-control-center";
const ATTEMPT = "publish-attempt-53-1";
const BRANCH = "cursor/draft-publish-v1-3c54";

const ALLOWED_DOC = "docs/draft-publish/draft-publish-v1.md";
const ALLOWED_SRC = "src/domain/draftPublish.ts";
const ALLOWED_ADAPTER = "src/domain/draftPublishAdapter.ts";
const ALLOWED_TEST = "test/draftPublish.test.ts";

function builtTask(
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
      issueNumber: 53,
      baseRevision: overrides.baseRevision ?? BASE,
      issueTitle:
        "DRAFT-PUBLISH-V1 — bounded GitHub Draft PR publication from verified task",
      issueBody: "Draft publish contract + fake adapter only.",
      issueLabels: ["draft-publish"],
      observedAt: OBSERVED_AT,
      proposal: {
        allowedPaths: overrides.allowedPaths ?? [
          "docs/draft-publish/",
          "src/domain/draftPublish.ts",
          "src/domain/draftPublishAdapter.ts",
          "test/draftPublish.test.ts",
          "src/domain/agentTaskContract.ts",
          "docs/agent-task/schemas/agent-task-v1.schema.json",
        ],
        forbiddenPaths: overrides.forbiddenPaths ?? [
          ".github/workflows/",
          "migrations/",
        ],
        acceptanceCriteria: [
          "VERIFIED R2 DRAFT_PR can PUBLISHED_DRAFT via fake adapter",
          "npm run verify passes",
          "No real GitHub publication",
        ],
        verificationCommands: [
          {
            id: "verify.all",
            command: "npm run verify",
            description: "Typecheck, test, and build",
          },
        ],
        allowedCapabilities: overrides.allowedCapabilities ?? [
          DRAFT_PUBLISH_REQUIRED_CAPABILITY,
        ],
        riskClass: overrides.riskClass ?? "R2",
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

function eligibleTask(
  overrides: Parameters<typeof builtTask>[0] = {},
): AgentTaskV1 {
  const built = builtTask(overrides);
  expect(built.status).toBe("BUILT");
  expect(built.task).not.toBeNull();
  const parsed = parseAgentTaskV1(built.task!);
  expect(parsed.ok).toBe(true);
  return built.task!;
}

function verifiedStub(
  task: AgentTaskV1,
  overrides: Partial<IndependentVerifyResultV1> & {
    metadataPatch?: Record<string, unknown>;
  } = {},
): IndependentVerifyResultV1 {
  const { metadataPatch, ...rest } = overrides;
  return {
    schemaVersion: INDEPENDENT_VERIFY_RESULT_SCHEMA,
    verifierVersion: INDEPENDENT_VERIFY_VERSION,
    status: "VERIFIED",
    reasonCode: "VERIFIED",
    reasonMessage: "stub verified",
    verificationAttemptId: "verify-53",
    taskId: task.taskId,
    repository: task.repository,
    baseRevision: task.baseRevision,
    verifiedChangedPaths: [ALLOWED_DOC, ALLOWED_SRC],
    verificationEvidence: null,
    taskValidation: null,
    metadata: {
      observedAt: OBSERVED_AT,
      verificationAttemptId: "verify-53",
      adapterKind: "fake-in-memory",
      cleanupCompleted: true,
      publicationAuthorized: false,
      readyAuthorized: false,
      mergeAuthorized: false,
      githubMutationAuthorized: false,
      deployAuthorized: false,
      commandExecutionImplemented: false,
      realCommandVerificationImplemented: false,
      providerIntegration: "HOLD",
      verifiedMeansFakeLocalEvidenceOnly: true,
      ...(metadataPatch ?? {}),
    },
    ...rest,
  } as IndependentVerifyResultV1;
}

function sourceArtifact(
  task: AgentTaskV1,
  overrides: {
    changedPaths?: string[];
    headRevision?: string;
    branchName?: string;
    baseBranch?: string;
    repository?: string;
    baseRevision?: string;
  } = {},
) {
  return {
    repository: overrides.repository ?? task.repository,
    baseRevision: overrides.baseRevision ?? task.baseRevision,
    baseBranch: overrides.baseBranch ?? "main",
    headRevision: overrides.headRevision ?? HEAD,
    branchName: overrides.branchName ?? BRANCH,
    changedPaths: overrides.changedPaths ?? [ALLOWED_DOC, ALLOWED_SRC],
  };
}

function proposedDraftPr(
  overrides: {
    draft?: unknown;
    title?: string;
    body?: string;
    baseBranch?: string;
    headBranch?: string;
    omitDraft?: boolean;
    setDraftUndefined?: boolean;
  } = {},
) {
  const base = {
    title: overrides.title ?? "DRAFT-PUBLISH-V1 implementation",
    body: overrides.body ?? "Bounded fake/local Draft publication.",
    baseBranch: overrides.baseBranch ?? "main",
    headBranch: overrides.headBranch ?? BRANCH,
  };
  if (overrides.omitDraft) return base;
  if (overrides.setDraftUndefined) return { ...base, draft: undefined };
  return {
    ...base,
    draft: Object.prototype.hasOwnProperty.call(overrides, "draft")
      ? overrides.draft
      : true,
  };
}

function publishInput(
  task: AgentTaskV1,
  overrides: {
    verified?: IndependentVerifyResultV1;
    source?: ReturnType<typeof sourceArtifact>;
    proposed?: ReturnType<typeof proposedDraftPr>;
    attemptId?: string;
  } = {},
) {
  return {
    verifiedResult: overrides.verified ?? verifiedStub(task),
    expectedTask: task,
    publicationAttemptId: overrides.attemptId ?? ATTEMPT,
    observedAt: OBSERVED_AT,
    sourceArtifact: overrides.source ?? sourceArtifact(task),
    proposedDraftPr: overrides.proposed ?? proposedDraftPr(),
  };
}

function publish(
  task: AgentTaskV1,
  opts: {
    verified?: IndependentVerifyResultV1;
    source?: ReturnType<typeof sourceArtifact>;
    proposed?: ReturnType<typeof proposedDraftPr>;
    attemptId?: string;
    adapter?: ReturnType<typeof createFakeDraftPublishAdapterV1>;
    attemptRegistry?: Map<string, DraftPublishAttemptRecordV1>;
  } = {},
) {
  return publishDraftPrV1(publishInput(task, opts), {
    adapter: opts.adapter,
    validatedAt: VALIDATED_AT,
    attemptRegistry: opts.attemptRegistry,
  });
}

beforeEach(() => {
  resetFakeDraftPublishCounterForTests(1000);
});

describe("DRAFT-PUBLISH-V1 non-goals / boundaries", () => {
  it("57-58. keeps real GitHub publication HOLD; no network/secret/production mutation", () => {
    expect(DRAFT_PUBLISH_REAL_GITHUB_PUBLICATION_IMPLEMENTED).toBe(false);
    expect(DRAFT_PUBLISH_GITHUB_MUTATION_PERFORMED).toBe(false);
    expect(DRAFT_PUBLISH_PROVIDER_INTEGRATION_STATUS).toBe("HOLD");
    expect(DRAFT_PUBLISH_REQUIRED_CAPABILITY).toBe("github.draft-pr.publish.v1");
    expect(DRAFT_PUBLISH_REQUIRED_RISK_CLASS).toBe("R2");
    expect(DRAFT_PUBLISH_REQUIRED_STOP_AT).toBe("DRAFT_PR");
    assertDraftPublishBoundaries();

    const task = eligibleTask();
    const out = publish(task);
    expect(out.status).toBe("PUBLISHED_DRAFT");
    expect(out.publicationEvidence?.networkAccess).toBe(false);
    expect(out.publicationEvidence?.secretsRequired).toBe(false);
    expect(out.publicationEvidence?.githubMutationPerformed).toBe(false);
    expect(out.publicationEvidence?.productionMutationPerformed).toBe(false);
    expect(out.metadata.publishedMeansFakeLocalSimulationOnly).toBe(true);
  });

  it("accepts hyphenated capability github.draft-pr.publish.v1 in AgentTaskV1", () => {
    const task = eligibleTask();
    expect(task.allowedCapabilities).toContain("github.draft-pr.publish.v1");
    const parsed = parseAgentTaskV1(task);
    expect(parsed.ok).toBe(true);
  });
});

describe("DRAFT-PUBLISH-V1 positive + verified status propagation", () => {
  it("1/26/33/38. positive fake/local R2 DRAFT_PR draft=true → PUBLISHED_DRAFT", () => {
    const task = eligibleTask();
    const out = publish(task);
    expect(out.schemaVersion).toBe(DRAFT_PUBLISH_RESULT_SCHEMA);
    expect(out.publisherVersion).toBe(DRAFT_PUBLISH_VERSION);
    expect(out.status).toBe("PUBLISHED_DRAFT");
    expect(out.reasonCode).toBe("PUBLISHED_DRAFT");
    expect(out.publicationAttemptId).toBe(ATTEMPT);
    expect(out.taskId).toBe(task.taskId);
    expect(out.repository).toBe(REPO);
    expect(out.baseRevision).toBe(BASE);
    expect(out.headRevision).toBe(HEAD);
    expect(out.branchName).toBe(BRANCH);
    expect(out.draftPrNumber).not.toBeNull();
    expect(out.draftPrUrl).toContain("/pull/");
    expect(out.publicationEvidence?.draft).toBe(true);
    expect(out.metadata.cleanupCompleted).toBe(true);
  });

  it("2. verified HOLD → HOLD", () => {
    const task = eligibleTask();
    const verified = verifiedStub(task, {
      status: "HOLD",
      reasonCode: "HOLD_RUNNER",
      reasonMessage: "held",
    });
    const out = publish(task, { verified });
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_VERIFIED");
  });

  it("3. verified REJECT → REJECT", () => {
    const task = eligibleTask();
    const verified = verifiedStub(task, {
      status: "REJECT",
      reasonCode: "REJECT_RUNNER",
      reasonMessage: "rejected",
    });
    const out = publish(task, { verified });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_VERIFIED");
  });

  it("4. verified FAILED → FAILED", () => {
    const task = eligibleTask();
    const verified = verifiedStub(task, {
      status: "FAILED",
      reasonCode: "FAILED_RUNNER",
      reasonMessage: "failed",
    });
    const out = publish(task, { verified });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_VERIFIED");
  });

  it("5. verified UNKNOWN → UNKNOWN", () => {
    const task = eligibleTask();
    const verified = verifiedStub(task, {
      status: "UNKNOWN",
      reasonCode: "UNKNOWN_RUNNER",
      reasonMessage: "unknown",
    });
    const out = publish(task, { verified });
    expect(out.status).toBe("UNKNOWN");
    expect(out.reasonCode).toBe("UNKNOWN_VERIFIED");
  });

  it("53-56. PUBLISHED_DRAFT keeps Ready/Merge/IssueClose/Deploy unauthorized", () => {
    const task = eligibleTask();
    const out = publish(task);
    expect(out.status).toBe("PUBLISHED_DRAFT");
    expect(out.metadata.readyAuthorized).toBe(false);
    expect(out.metadata.mergeAuthorized).toBe(false);
    expect(out.metadata.issueCloseAuthorized).toBe(false);
    expect(out.metadata.deployAuthorized).toBe(false);
    expect(out.metadata.productionMutationAuthorized).toBe(false);
  });

  it("59. deterministic repeatability", () => {
    const task = eligibleTask();
    const registryA = new Map<string, DraftPublishAttemptRecordV1>();
    const registryB = new Map<string, DraftPublishAttemptRecordV1>();
    const a = publish(task, {
      attemptId: "det-a",
      attemptRegistry: registryA,
      adapter: createFakeDraftPublishAdapterV1(),
    });
    resetFakeDraftPublishCounterForTests(1000);
    const b = publish(task, {
      attemptId: "det-b",
      attemptRegistry: registryB,
      adapter: createFakeDraftPublishAdapterV1(),
    });
    expect(a.status).toBe("PUBLISHED_DRAFT");
    expect(b.status).toBe("PUBLISHED_DRAFT");
    expect(a.draftPrNumber).toBe(b.draftPrNumber);
    expect(a.reasonCode).toBe(b.reasonCode);
  });
});

describe("DRAFT-PUBLISH-V1 verifier / task identity", () => {
  it("6. foreign verifier schema → REJECT", () => {
    const task = eligibleTask();
    const verified = {
      ...verifiedStub(task),
      schemaVersion: "FOREIGN",
    } as unknown as IndependentVerifyResultV1;
    const out = publish(task, { verified });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_VERIFIER_SCHEMA");
  });

  it("7. foreign verifier version → REJECT", () => {
    const task = eligibleTask();
    const verified = {
      ...verifiedStub(task),
      verifierVersion: "FOREIGN",
    } as unknown as IndependentVerifyResultV1;
    const out = publish(task, { verified });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_VERIFIER_VERSION");
  });

  it("8. malformed expectedTask → REJECT", () => {
    const task = eligibleTask();
    const out = publishDraftPrV1(
      {
        ...publishInput(task),
        expectedTask: { schemaVersion: AGENT_TASK_SCHEMA, taskId: "x" },
      },
      { validatedAt: VALIDATED_AT },
    );
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_TASK_MALFORMED");
  });

  it("9. invalid expectedTask → REJECT", () => {
    const task = eligibleTask();
    const invalid = {
      ...task,
      riskClass: "R99" as AgentTaskV1["riskClass"],
    };
    const out = publishDraftPrV1(
      { ...publishInput(task), expectedTask: invalid },
      { validatedAt: VALIDATED_AT },
    );
    expect(out.status).toBe("REJECT");
    expect(["REJECT_TASK_MALFORMED", "REJECT_TASK_SEMANTICS"]).toContain(
      out.reasonCode,
    );
  });

  it("10. taskId mismatch without authorized handoff → REJECT", () => {
    const task = eligibleTask();
    const verified = verifiedStub(task, { taskId: "other-task" });
    const out = publish(task, { verified });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_PUBLICATION_HANDOFF_REQUIRED");
  });

  it("11. repository mismatch → HOLD", () => {
    const task = eligibleTask();
    const verified = verifiedStub(task, { repository: "other-org/other-repo" });
    const out = publish(task, { verified });
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_REPOSITORY_MISMATCH");
  });

  it("12. baseRevision mismatch → HOLD", () => {
    const task = eligibleTask();
    const verified = verifiedStub(task, { baseRevision: OTHER_BASE });
    const out = publish(task, { verified });
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_BASE_REVISION_MISMATCH");
  });
});

describe("DRAFT-PUBLISH-V1 path binding", () => {
  it("13. verified changedPaths exact match → PUBLISHED_DRAFT", () => {
    const paths = [ALLOWED_DOC, ALLOWED_ADAPTER, ALLOWED_TEST];
    const task = eligibleTask();
    const verified = verifiedStub(task, { verifiedChangedPaths: paths });
    const out = publish(task, {
      verified,
      source: sourceArtifact(task, { changedPaths: paths }),
    });
    expect(out.status).toBe("PUBLISHED_DRAFT");
  });

  it("14. verified extra path mismatch → REJECT", () => {
    const task = eligibleTask();
    const verified = verifiedStub(task, {
      verifiedChangedPaths: [ALLOWED_DOC, ALLOWED_SRC],
    });
    const out = publish(task, {
      verified,
      source: sourceArtifact(task, { changedPaths: [ALLOWED_DOC] }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_PATH_MISMATCH");
  });

  it("15. source artifact extra path mismatch → REJECT", () => {
    const task = eligibleTask();
    const verified = verifiedStub(task, {
      verifiedChangedPaths: [ALLOWED_DOC],
    });
    const out = publish(task, {
      verified,
      source: sourceArtifact(task, {
        changedPaths: [ALLOWED_DOC, ALLOWED_SRC],
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_PATH_MISMATCH");
  });

  it("16. forbidden path → FAILED", () => {
    const task = eligibleTask();
    const paths = [".github/workflows/ci.yml"];
    const verified = verifiedStub(task, { verifiedChangedPaths: paths });
    const out = publish(task, {
      verified,
      source: sourceArtifact(task, { changedPaths: paths }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_FORBIDDEN_PATH");
  });

  it("17. out-of-scope path → FAILED", () => {
    const task = eligibleTask();
    const paths = ["src/worker/index.ts"];
    const verified = verifiedStub(task, { verifiedChangedPaths: paths });
    const out = publish(task, {
      verified,
      source: sourceArtifact(task, { changedPaths: paths }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_CHANGED_PATH_OUT_OF_SCOPE");
  });

  it("18. traversal → REJECT", () => {
    const task = eligibleTask();
    const paths = ["docs/../secrets.env"];
    const verified = verifiedStub(task, { verifiedChangedPaths: paths });
    const out = publish(task, {
      verified,
      source: sourceArtifact(task, { changedPaths: paths }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_CHANGED_PATH_UNSAFE");
  });

  it("19. backslash → REJECT", () => {
    const task = eligibleTask();
    const paths = ["docs\\draft-publish\\x.md"];
    const verified = verifiedStub(task, { verifiedChangedPaths: paths });
    const out = publish(task, {
      verified,
      source: sourceArtifact(task, { changedPaths: paths }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_CHANGED_PATH_UNSAFE");
  });

  it("20. absolute path → REJECT", () => {
    const task = eligibleTask();
    const paths = ["/etc/passwd"];
    const verified = verifiedStub(task, { verifiedChangedPaths: paths });
    const out = publish(task, {
      verified,
      source: sourceArtifact(task, { changedPaths: paths }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_CHANGED_PATH_UNSAFE");
  });

  it("21. duplicate path → REJECT", () => {
    const task = eligibleTask();
    const paths = [ALLOWED_DOC, ALLOWED_DOC];
    const verified = verifiedStub(task, { verifiedChangedPaths: paths });
    const out = publish(task, {
      verified,
      source: sourceArtifact(task, { changedPaths: paths }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_CHANGED_PATH_DUPLICATE");
  });

  it("22. malformed/empty path → REJECT", () => {
    const task = eligibleTask();
    const paths = [""];
    const verified = verifiedStub(task, { verifiedChangedPaths: paths });
    const out = publish(task, {
      verified,
      source: sourceArtifact(task, { changedPaths: paths }),
    });
    expect(out.status).toBe("REJECT");
    expect([
      "REJECT_CHANGED_PATH_UNSAFE",
      "REJECT_CHANGED_PATH_DUPLICATE",
    ]).toContain(out.reasonCode);
  });
});

describe("DRAFT-PUBLISH-V1 capability / risk / stopAt", () => {
  it("23. missing github.draft-pr.publish.v1 → HOLD", () => {
    const task = eligibleTask({ allowedCapabilities: ["workspace.read.v1"] });
    const out = publish(task);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_MISSING_CAPABILITY");
  });

  it("24. R0 → HOLD", () => {
    const task = eligibleTask({ riskClass: "R0" });
    const out = publish(task);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_RISK_CLASS");
  });

  it("25. R1 → HOLD", () => {
    const task = eligibleTask({ riskClass: "R1" });
    const out = publish(task);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_RISK_CLASS");
  });

  it("27. R3 → HOLD (fail closed)", () => {
    const task = eligibleTask({ riskClass: "R3" });
    const out = publish(task);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_RISK_CLASS");
  });

  it("28. R4 → HOLD (fail closed)", () => {
    const task = eligibleTask({ riskClass: "R4" });
    const out = publish(task);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_RISK_CLASS");
  });

  it("29. R5 → HOLD (fail closed)", () => {
    const task = eligibleTask({ riskClass: "R5" });
    const out = publish(task);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_UNSUPPORTED_RISK_CLASS");
  });

  it("30. TASK_BUILT → HOLD", () => {
    const task = eligibleTask({ stopAt: "TASK_BUILT" });
    const out = publish(task);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_STOP_AT");
  });

  it("31. AGENT_COMPLETE → HOLD", () => {
    const task = eligibleTask({ stopAt: "AGENT_COMPLETE" });
    const out = publish(task);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_STOP_AT");
  });

  it("32. VERIFY_COMPLETE → HOLD", () => {
    const task = eligibleTask({ stopAt: "VERIFY_COMPLETE" });
    const out = publish(task);
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_STOP_AT");
  });

  it("34. unknown stopAt → fail closed", () => {
    const task = eligibleTask();
    const forged = {
      ...task,
      stopAt: "FUTURE_STOP" as AgentTaskV1["stopAt"],
    };
    const out = publishDraftPrV1(
      { ...publishInput(task), expectedTask: forged },
      { validatedAt: VALIDATED_AT },
    );
    expect(out.status).toBe("REJECT");
    expect(["REJECT_TASK_MALFORMED", "HOLD_UNSUPPORTED_STOP_AT"]).toContain(
      out.reasonCode,
    );
  });
});

describe("DRAFT-PUBLISH-V1 draft-only invariant", () => {
  it("35. proposedDraftPr.draft missing → REJECT", () => {
    const task = eligibleTask();
    const out = publish(task, { proposed: proposedDraftPr({ omitDraft: true }) });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_DRAFT_FLAG");
  });

  it("36. draft undefined → REJECT", () => {
    const task = eligibleTask();
    const out = publish(task, {
      proposed: proposedDraftPr({ setDraftUndefined: true }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_DRAFT_FLAG");
  });

  it("37. draft false → REJECT", () => {
    const task = eligibleTask();
    const out = publish(task, { proposed: proposedDraftPr({ draft: false }) });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_DRAFT_FLAG");
  });

  it("52. provider evidence draft=false → fail closed", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({ forceDraftFalse: true }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_DRAFT_FALSE");
  });
});

describe("DRAFT-PUBLISH-V1 base observation + idempotency", () => {
  it("39. observed base exact → pass", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        observedBaseRevision: BASE,
      }),
    });
    expect(out.status).toBe("PUBLISHED_DRAFT");
  });

  it("40. observed base moved → HOLD_BASE_MOVED", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        observedBaseRevision: OTHER_BASE,
      }),
    });
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_BASE_MOVED");
  });

  it("41. same attempt/same payload → replay same publication", () => {
    const task = eligibleTask();
    const registry = new Map<string, DraftPublishAttemptRecordV1>();
    const adapterRegistry = new Map();
    const adapter = createFakeDraftPublishAdapterV1({
      attemptRegistry: adapterRegistry,
    });
    const first = publish(task, {
      attemptId: "idem-1",
      attemptRegistry: registry,
      adapter,
    });
    const second = publish(task, {
      attemptId: "idem-1",
      attemptRegistry: registry,
      adapter,
    });
    expect(first.status).toBe("PUBLISHED_DRAFT");
    expect(second.status).toBe("PUBLISHED_DRAFT");
    expect(second.draftPrNumber).toBe(first.draftPrNumber);
    expect(second.draftPrUrl).toBe(first.draftPrUrl);
    expect(second.metadata.replayed).toBe(true);
  });

  it("42. same attempt/different payload → REJECT", () => {
    const task = eligibleTask();
    const registry = new Map<string, DraftPublishAttemptRecordV1>();
    const first = publish(task, {
      attemptId: "idem-2",
      attemptRegistry: registry,
    });
    expect(first.status).toBe("PUBLISHED_DRAFT");
    const second = publish(task, {
      attemptId: "idem-2",
      attemptRegistry: registry,
      source: sourceArtifact(task, { headRevision: OTHER_HEAD }),
      verified: verifiedStub(task),
    });
    expect(second.status).toBe("REJECT");
    expect(second.reasonCode).toBe("REJECT_IDEMPOTENCY_CONFLICT");
  });

  it("43. new attempt → new independent evaluation", () => {
    const task = eligibleTask();
    const registry = new Map<string, DraftPublishAttemptRecordV1>();
    const adapterRegistry = new Map();
    const adapter = createFakeDraftPublishAdapterV1({
      attemptRegistry: adapterRegistry,
    });
    const a = publish(task, {
      attemptId: "new-a",
      attemptRegistry: registry,
      adapter,
    });
    const b = publish(task, {
      attemptId: "new-b",
      attemptRegistry: registry,
      adapter,
    });
    expect(a.status).toBe("PUBLISHED_DRAFT");
    expect(b.status).toBe("PUBLISHED_DRAFT");
    expect(a.draftPrNumber).not.toBe(b.draftPrNumber);
    expect(b.metadata.replayed).toBe(false);
  });

  it("fingerprint ignores path ordering", () => {
    const task = eligibleTask();
    const a = computeDraftPublishPayloadFingerprint({
      taskId: task.taskId,
      repository: task.repository,
      baseRevision: task.baseRevision,
      headRevision: HEAD,
      branchName: BRANCH,
      baseBranch: "main",
      changedPaths: [ALLOWED_DOC, ALLOWED_SRC],
      proposedDraftPr: proposedDraftPr() as {
        title: string;
        body: string;
        baseBranch: string;
        headBranch: string;
        draft: true;
      },
    });
    const b = computeDraftPublishPayloadFingerprint({
      taskId: task.taskId,
      repository: task.repository,
      baseRevision: task.baseRevision,
      headRevision: HEAD,
      branchName: BRANCH,
      baseBranch: "main",
      changedPaths: [ALLOWED_SRC, ALLOWED_DOC],
      proposedDraftPr: proposedDraftPr() as {
        title: string;
        body: string;
        baseBranch: string;
        headBranch: string;
        draft: true;
      },
    });
    expect(a).toBe(b);
  });
});

describe("DRAFT-PUBLISH-V1 adapter failures", () => {
  it("44. adapter observe failure → FAILED", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({ failAt: "observeBase" }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER_OBSERVE");
  });

  it("45. prepare failure → FAILED", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({ failAt: "prepareBranch" }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER_PREPARE");
  });

  it("46. write failure → FAILED", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        failAt: "writeVerifiedChanges",
      }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER_WRITE");
  });

  it("47. commit failure → FAILED", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({ failAt: "createCommit" }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER_COMMIT");
  });

  it("48. publish failure → FAILED", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({ failAt: "publishDraftPr" }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER_PUBLISH");
  });

  it("49. collect failure → FAILED", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        failAt: "collectPublicationEvidence",
      }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER_COLLECT");
  });

  it("50. timeout → FAILED", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({ failAt: "timeout" }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_ADAPTER_TIMEOUT");
  });

  it("51. cleanup failure → FAILED", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({ failAt: "cleanup" }),
    });
    expect(out.status).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_CLEANUP");
  });
});

describe("DRAFT-PUBLISH-V1 verifier metadata + input", () => {
  it("publicationAuthorized=false is expected and does not block", () => {
    const task = eligibleTask();
    const verified = verifiedStub(task, {
      metadataPatch: { publicationAuthorized: false },
    });
    const out = publish(task, { verified });
    expect(out.status).toBe("PUBLISHED_DRAFT");
  });

  it("readyAuthorized=true → REJECT", () => {
    const task = eligibleTask();
    const verified = verifiedStub(task, {
      metadataPatch: { readyAuthorized: true },
    });
    const out = publish(task, { verified });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_READY_AUTHORIZED");
  });

  it("readyAuthorized missing → REJECT", () => {
    const task = eligibleTask();
    const verified = verifiedStub(task);
    const { readyAuthorized: _omit, ...metaRest } = verified.metadata as unknown as Record<
      string,
      unknown
    > & { readyAuthorized: boolean };
    void _omit;
    const out = publish(task, {
      verified: {
        ...verified,
        metadata: metaRest,
      } as unknown as IndependentVerifyResultV1,
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_READY_AUTHORIZED");
  });

  it("unknown root properties fail closed", () => {
    const task = eligibleTask();
    const out = publishDraftPrV1(
      { ...publishInput(task), notes: "no authority" },
      { validatedAt: VALIDATED_AT },
    );
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_INPUT");
  });
});

describe("DRAFT-PUBLISH-V1 P1 evidence revalidation + branch binding", () => {
  it("P1-2. headBranch !== source branchName → REJECT", () => {
    const task = eligibleTask();
    const out = publish(task, {
      proposed: proposedDraftPr({ headBranch: "other-branch" }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_BRANCH_MISMATCH");
  });

  it("P1-2. baseBranch !== source baseBranch → REJECT", () => {
    const task = eligibleTask();
    const out = publish(task, {
      proposed: proposedDraftPr({ baseBranch: "develop" }),
      source: sourceArtifact(task, { baseBranch: "main" }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_BASE_BRANCH_MISMATCH");
  });

  it("P1-1. branchPrepared=false → REJECT", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        evidenceOverrides: { branchPrepared: false },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_BRANCH_NOT_PREPARED");
  });

  it("P1-1. commitCreated=false → REJECT", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        evidenceOverrides: { commitCreated: false },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_COMMIT_NOT_CREATED");
  });

  it("P1-1. written path missing → REJECT", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        evidenceOverrides: { verifiedPathsWritten: [ALLOWED_DOC] },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_PATH_MISMATCH");
  });

  it("P1-1. written extra path → REJECT", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        evidenceOverrides: {
          verifiedPathsWritten: [ALLOWED_DOC, ALLOWED_SRC, ALLOWED_ADAPTER],
        },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_PATH_MISMATCH");
  });

  it("P1-1. headRevision mismatch → REJECT", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        evidenceOverrides: { headRevision: OTHER_HEAD },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_HEAD_MISMATCH");
  });

  it("P1-1. observedBaseRevision mismatch → HOLD", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        evidenceOverrides: { observedBaseRevision: OTHER_BASE },
      }),
    });
    expect(out.status).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_EVIDENCE_BASE_MISMATCH");
  });

  it("P1-1. draftPrNumber missing/invalid → fail closed", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        evidenceOverrides: { draftPrNumber: null },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_PR_NUMBER");
  });

  it("P1-1. draftPrUrl missing → fail closed", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        evidenceOverrides: { draftPrUrl: "" },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_PR_URL");
  });

  it("P1. prepare ok=true + branchPrepared=false → fail closed", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        phaseOverrides: { prepare: { branchPrepared: false } },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_PHASE_BRANCH_NOT_PREPARED");
  });

  it("P1. write ok=true + wrong written paths → fail closed", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        phaseOverrides: {
          write: { verifiedPathsWritten: [ALLOWED_DOC] },
        },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_PHASE_PATH_MISMATCH");
  });

  it("P1. commit ok=true + commitCreated=false → fail closed", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        phaseOverrides: { commit: { commitCreated: false } },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_PHASE_COMMIT_NOT_CREATED");
  });

  it("P1. commit headRevision mismatch → fail closed", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        phaseOverrides: { commit: { headRevision: OTHER_HEAD } },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_PHASE_HEAD_MISMATCH");
  });

  it("P1. publish PR number != collected PR number → fail closed", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        evidenceOverrides: { draftPrNumber: 9999 },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_PHASE_MISMATCH");
  });

  it("P1. publish PR URL != collected PR URL → fail closed", () => {
    const task = eligibleTask();
    const out = publish(task, {
      adapter: createFakeDraftPublishAdapterV1({
        evidenceOverrides: {
          draftPrUrl: "https://example.invalid/other/pull/1",
        },
      }),
    });
    expect(out.status).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_EVIDENCE_PHASE_MISMATCH");
  });
});
