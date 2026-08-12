import { describe, expect, it } from "vitest";
import {
  buildAgentTaskFromIssue,
  type AgentTaskBuilderResultV1,
} from "../src/domain/agentTaskBuilder";
import {
  type AgentTaskV1,
} from "../src/domain/agentTaskContract";
import {
  AGENT_RUNNER_SUPPORTED_CAPABILITIES,
  AGENT_RUNNER_SUPPORTED_RISK_CLASSES,
  createFakeAgentRunnerAdapterV1,
  runAgentTaskV1,
  type AgentRunnerResultV1,
} from "../src/domain/agentRunner";
import {
  orchestrateAgentTaskV1,
  type MinOrchestratorResultV1,
} from "../src/domain/minOrchestrator";
import {
  createFakeIndependentVerifyAdapterV1,
  verifyAgentRunnerResultV1,
  type IndependentVerifyResultV1,
} from "../src/domain/independentVerify";
import {
  DRAFT_PUBLISH_REQUIRED_CAPABILITY,
  DRAFT_PUBLISH_REQUIRED_RISK_CLASS,
  DRAFT_PUBLISH_REQUIRED_STOP_AT,
} from "../src/domain/draftPublish";
import {
  PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
  PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS,
  PUBLICATION_HANDOFF_REQUIRED_STOP_AT,
  PUBLICATION_HANDOFF_RESULT_SCHEMA,
  PUBLICATION_HANDOFF_RUNNER_CAPABILITIES_SNAPSHOT,
  PUBLICATION_HANDOFF_RUNNER_RISK_CLASSES_SNAPSHOT,
  PUBLICATION_HANDOFF_VERSION,
  assertPublicationHandoffBoundaries,
  authorityFingerprintsEqual,
  buildDeterministicPublicationTaskId,
  capturePublicationHandoffAuthorityFingerprint,
  createPublicationHandoffV1,
  publicationTaskIsRunnerDispatchable,
  publicationTaskMeetsDraftPublishAuthority,
  serializeAuthorityFingerprint,
  type PublicationHandoffAttemptRecordV1,
} from "../src/domain/publicationHandoff";

const BASE = "1a494780ffb92bc6b1e27c99fbb24b39dfc1af75";
const OTHER_BASE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OBSERVED_AT = "2026-08-12T13:40:00.000Z";
const VALIDATED_AT = "2026-08-12T13:40:30.000Z";
const REVALIDATED_AT = "2026-08-12T13:41:00.000Z";
const REPO = "yasutakesougo/ai-development-control-center";
const HANDOFF_ID = "handoff-57-1";
const ATTEMPT = "verify-attempt-57-1";
const RUNNER_ATTEMPT = "runner-attempt-57-1";

const ALLOWED_DOC = "docs/publication-handoff/publication-handoff-v1.md";
const ALLOWED_SRC = "src/domain/publicationHandoff.ts";
const ALLOWED_TEST = "test/publicationHandoff.test.ts";

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
      issueNumber: 57,
      baseRevision: overrides.baseRevision ?? BASE,
      issueTitle:
        "RUNNER-PUBLISH-HANDOFF-V1 — explicit execution-to-publication authority transition",
      issueBody:
        "Handoff contract only. No real GitHub publication. No runner widening.",
      issueLabels: ["publication-handoff"],
      observedAt: OBSERVED_AT,
      proposal: {
        allowedPaths: overrides.allowedPaths ?? [
          "docs/publication-handoff/",
          "src/domain/publicationHandoff.ts",
          "test/publicationHandoff.test.ts",
        ],
        forbiddenPaths: overrides.forbiddenPaths ?? [
          ".github/workflows/",
          "migrations/",
        ],
        acceptanceCriteria: [
          "VERIFIED R1 execution yields READY_FOR_PUBLICATION_TASK",
          "publication task distinct R2 + github.draft-pr.publish.v1",
          "source execution task unchanged",
        ],
        verificationCommands: [
          {
            id: "verify.all",
            command: "npm run verify",
            description: "Typecheck, test, and build",
          },
        ],
        allowedCapabilities: overrides.allowedCapabilities ?? [
          "workspace.read.v1",
        ],
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
      attemptId: "orch-57",
    },
    { revalidatedAt: REVALIDATED_AT },
  );
  expect(out.decision).toBe("DISPATCH_ELIGIBLE");
  return out;
}

function completedRunner(
  overrides: {
    changedPaths?: string[];
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
        repository: REPO,
        baseRevision: overrides.taskOverrides?.baseRevision ?? BASE,
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

function realVerified(
  overrides: {
    changedPaths?: string[];
    taskOverrides?: Parameters<typeof builtFromBuilder>[0];
  } = {},
): {
  sourceExecutionTask: AgentTaskV1;
  independentVerifyResult: IndependentVerifyResultV1;
  sourceSnapshot: string;
} {
  const { runnerResult, expectedTask } = completedRunner(overrides);
  const independentVerifyResult = verifyAgentRunnerResultV1(
    {
      runnerResult,
      expectedTask,
      verificationAttemptId: ATTEMPT,
      observedAt: OBSERVED_AT,
    },
    {
      adapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: runnerResult.changedPaths,
      }),
      validatedAt: REVALIDATED_AT,
    },
  );
  expect(independentVerifyResult.status).toBe("VERIFIED");
  expect(independentVerifyResult.verificationEvidence).not.toBeNull();
  return {
    sourceExecutionTask: expectedTask,
    independentVerifyResult,
    sourceSnapshot: JSON.stringify(expectedTask),
  };
}

function handoffInput(
  sourceExecutionTask: AgentTaskV1,
  independentVerifyResult: IndependentVerifyResultV1,
  overrides: Record<string, unknown> = {},
) {
  return {
    handoffId: HANDOFF_ID,
    sourceExecutionTask,
    independentVerifyResult,
    requestedPublicationCapability: PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
    requestedRiskClass: PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS,
    requestedStopAt: PUBLICATION_HANDOFF_REQUIRED_STOP_AT,
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

function runHandoff(
  sourceExecutionTask: AgentTaskV1,
  independentVerifyResult: IndependentVerifyResultV1,
  overrides: Record<string, unknown> = {},
  options: {
    attemptRegistry?: Map<string, PublicationHandoffAttemptRecordV1>;
  } = {},
) {
  return createPublicationHandoffV1(
    handoffInput(sourceExecutionTask, independentVerifyResult, overrides),
    {
      validatedAt: VALIDATED_AT,
      attemptRegistry: options.attemptRegistry,
    },
  );
}

describe("RUNNER-PUBLISH-HANDOFF-V1 boundaries", () => {
  it("44-45. runner supported risk/capabilities unchanged", () => {
    expect([...AGENT_RUNNER_SUPPORTED_RISK_CLASSES]).toEqual([
      ...PUBLICATION_HANDOFF_RUNNER_RISK_CLASSES_SNAPSHOT,
    ]);
    expect([...AGENT_RUNNER_SUPPORTED_CAPABILITIES]).toEqual([
      ...PUBLICATION_HANDOFF_RUNNER_CAPABILITIES_SNAPSHOT,
    ]);
    expect(AGENT_RUNNER_SUPPORTED_RISK_CLASSES).not.toContain("R2");
    expect(AGENT_RUNNER_SUPPORTED_CAPABILITIES).not.toContain(
      DRAFT_PUBLISH_REQUIRED_CAPABILITY,
    );
    assertPublicationHandoffBoundaries();
  });

  it("aligns with DRAFT-PUBLISH required constants", () => {
    expect(PUBLICATION_HANDOFF_REQUIRED_CAPABILITY).toBe(
      DRAFT_PUBLISH_REQUIRED_CAPABILITY,
    );
    expect(PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS).toBe(
      DRAFT_PUBLISH_REQUIRED_RISK_CLASS,
    );
    expect(PUBLICATION_HANDOFF_REQUIRED_STOP_AT).toBe(
      DRAFT_PUBLISH_REQUIRED_STOP_AT,
    );
  });
});

describe("RUNNER-PUBLISH-HANDOFF-V1 positive path (real VERIFIED)", () => {
  it("1-14. VERIFIED exact execution → READY_FOR_PUBLICATION_TASK with distinct publication task", () => {
    const { sourceExecutionTask, independentVerifyResult, sourceSnapshot } =
      realVerified();
    const sourceCaps = [...sourceExecutionTask.allowedCapabilities];
    const sourceRisk = sourceExecutionTask.riskClass;
    const sourceStop = sourceExecutionTask.stopAt;

    const out = runHandoff(sourceExecutionTask, independentVerifyResult);

    expect(out.schemaVersion).toBe(PUBLICATION_HANDOFF_RESULT_SCHEMA);
    expect(out.handoffVersion).toBe(PUBLICATION_HANDOFF_VERSION);
    expect(out.status).toBe("READY_FOR_PUBLICATION_TASK");
    expect(out.reasonCode).toBe("READY_FOR_PUBLICATION_TASK");
    expect(out.publicationTask).not.toBeNull();
    expect(out.handoff).not.toBeNull();

    // 2. distinct taskId
    expect(out.publicationTaskId).not.toBe(sourceExecutionTask.taskId);
    expect(out.publicationTask!.taskId).not.toBe(sourceExecutionTask.taskId);

    // 3-6. source unchanged
    expect(JSON.stringify(sourceExecutionTask)).toBe(sourceSnapshot);
    expect(sourceExecutionTask.riskClass).toBe(sourceRisk);
    expect(["R0", "R1"]).toContain(sourceExecutionTask.riskClass);
    expect(sourceExecutionTask.allowedCapabilities).toEqual(sourceCaps);
    expect(sourceExecutionTask.stopAt).toBe(sourceStop);

    // 7-10. publication authority
    expect(out.publicationTask!.riskClass).toBe("R2");
    expect(out.publicationTask!.allowedCapabilities).toEqual([
      "github.draft-pr.publish.v1",
    ]);
    expect(out.publicationTask!.stopAt).toBe("DRAFT_PR");
    expect(out.publicationTask!.allowedPaths).toEqual(
      independentVerifyResult.verifiedChangedPaths,
    );
    expect(
      publicationTaskMeetsDraftPublishAuthority(out.publicationTask!),
    ).toBe(true);

    // 11-14. bindings
    expect(out.repository).toBe(sourceExecutionTask.repository);
    expect(out.baseRevision).toBe(sourceExecutionTask.baseRevision);
    expect(out.handoff!.sourceIssue).toEqual(sourceExecutionTask.sourceIssue);
    expect(out.handoff!.verificationAttemptId).toBe(ATTEMPT);
    expect(out.handoff!.handoffId).toBe(HANDOFF_ID);
    expect(out.sourceExecutionTaskId).toBe(sourceExecutionTask.taskId);
  });

  it("43. original AgentTask object not mutated", () => {
    const { sourceExecutionTask, independentVerifyResult, sourceSnapshot } =
      realVerified();
    runHandoff(sourceExecutionTask, independentVerifyResult);
    expect(JSON.stringify(sourceExecutionTask)).toBe(sourceSnapshot);
  });

  it("46. publication task is never run through AgentRunner", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();
    const out = runHandoff(sourceExecutionTask, independentVerifyResult);
    expect(out.metadata.publicationTaskDispatchedToRunner).toBe(false);
    expect(publicationTaskIsRunnerDispatchable(out.publicationTask!)).toBe(
      false,
    );
    // Structural: handoff module must not import runAgentTaskV1 for publication.
    // Guaranteed by publicationTaskIsRunnerDispatchable + metadata flag.
  });

  it("47-52. authorization / mutation flags remain false", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();
    const out = runHandoff(sourceExecutionTask, independentVerifyResult);
    expect(out.metadata.readyAuthorized).toBe(false);
    expect(out.metadata.mergeAuthorized).toBe(false);
    expect(out.metadata.issueCloseAuthorized).toBe(false);
    expect(out.metadata.deployAuthorized).toBe(false);
    expect(out.metadata.realGithubPublication).toBe(false);
    expect(out.metadata.githubMutationPerformed).toBe(false);
    expect(out.metadata.productionMutationPerformed).toBe(false);
    expect(out.metadata.productionMutationAuthorized).toBe(false);
    expect(out.metadata.realAgentProviderExecution).toBe(false);
    expect(out.metadata.runnerAuthorityExpanded).toBe(false);
    expect(out.metadata.draftPublishAuthorityExpanded).toBe(false);
    expect(out.metadata.sourceExecutionTaskMutated).toBe(false);
  });

  it("28-32. verifier auth flags and evidence safety exact false", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();
    expect(independentVerifyResult.metadata.publicationAuthorized).toBe(false);
    expect(independentVerifyResult.metadata.readyAuthorized).toBe(false);
    expect(independentVerifyResult.metadata.mergeAuthorized).toBe(false);
    expect(independentVerifyResult.metadata.githubMutationAuthorized).toBe(
      false,
    );
    expect(independentVerifyResult.metadata.deployAuthorized).toBe(false);
    expect(
      independentVerifyResult.verificationEvidence!.networkAccess,
    ).toBe(false);
    expect(
      independentVerifyResult.verificationEvidence!.secretsRequired,
    ).toBe(false);
    expect(
      independentVerifyResult.verificationEvidence!.githubMutationPerformed,
    ).toBe(false);
    expect(
      independentVerifyResult.verificationEvidence!
        .productionMutationPerformed,
    ).toBe(false);
    const out = runHandoff(sourceExecutionTask, independentVerifyResult);
    expect(out.status).toBe("READY_FOR_PUBLICATION_TASK");
  });

  it("53. deterministic repeatability", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();
    const a = runHandoff(sourceExecutionTask, independentVerifyResult);
    const b = runHandoff(sourceExecutionTask, independentVerifyResult);
    expect(a.status).toBe(b.status);
    expect(a.publicationTaskId).toBe(b.publicationTaskId);
    expect(a.authorityFingerprint).toBe(b.authorityFingerprint);
    expect(a.publicationTask).toEqual(b.publicationTask);
  });
});

describe("RUNNER-PUBLISH-HANDOFF-V1 input / authority fail-closed", () => {
  it("15-16. handoffId required; missing fails closed", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();
    const missing = createPublicationHandoffV1(
      {
        sourceExecutionTask,
        independentVerifyResult,
        requestedPublicationCapability: PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
        requestedRiskClass: PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS,
        requestedStopAt: PUBLICATION_HANDOFF_REQUIRED_STOP_AT,
        observedAt: OBSERVED_AT,
      },
      { validatedAt: VALIDATED_AT },
    );
    expect(missing.status).toBe("REJECT");
    expect(missing.reasonCode).toBe("REJECT_INPUT");
    expect(missing.reasonMessage).toMatch(/handoffId/);
  });

  it("33-36. wrong / missing / generic github capability reject", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();

    const wrong = runHandoff(sourceExecutionTask, independentVerifyResult, {
      requestedPublicationCapability: "workspace.read.v1",
    });
    expect(wrong.status).toBe("REJECT");
    expect(wrong.reasonCode).toBe("REJECT_PUBLICATION_CAPABILITY");

    const missing = createPublicationHandoffV1(
      {
        handoffId: HANDOFF_ID,
        sourceExecutionTask,
        independentVerifyResult,
        requestedRiskClass: PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS,
        requestedStopAt: PUBLICATION_HANDOFF_REQUIRED_STOP_AT,
        observedAt: OBSERVED_AT,
      },
      { validatedAt: VALIDATED_AT },
    );
    expect(missing.status).toBe("REJECT");
    expect(missing.reasonCode).toBe("REJECT_INPUT");

    const genericWrite = runHandoff(
      sourceExecutionTask,
      independentVerifyResult,
      { requestedPublicationCapability: "github.write" },
    );
    expect(genericWrite.status).toBe("REJECT");
    expect(genericWrite.reasonCode).toBe("REJECT_PUBLICATION_CAPABILITY");

    const wildcard = runHandoff(sourceExecutionTask, independentVerifyResult, {
      requestedPublicationCapability: "github.*",
    });
    expect(wildcard.status).toBe("REJECT");
    expect(wildcard.reasonCode).toBe("REJECT_PUBLICATION_CAPABILITY");
  });

  it("37-38. risk != R2 / stopAt != DRAFT_PR fail closed", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();
    const risk = runHandoff(sourceExecutionTask, independentVerifyResult, {
      requestedRiskClass: "R1",
    });
    expect(risk.status).toBe("REJECT");
    expect(risk.reasonCode).toBe("REJECT_PUBLICATION_RISK");

    const stop = runHandoff(sourceExecutionTask, independentVerifyResult, {
      requestedStopAt: "VERIFY_COMPLETE",
    });
    expect(stop.status).toBe("REJECT");
    expect(stop.reasonCode).toBe("REJECT_PUBLICATION_STOP_AT");
  });
});

describe("RUNNER-PUBLISH-HANDOFF-V1 verifier propagation", () => {
  it("17-20. verifier HOLD/REJECT/FAILED/UNKNOWN propagate", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();

    for (const [status, reasonCode] of [
      ["HOLD", "HOLD_VERIFIER"],
      ["REJECT", "REJECT_VERIFIER"],
      ["FAILED", "FAILED_VERIFIER"],
      ["UNKNOWN", "UNKNOWN_VERIFIER"],
    ] as const) {
      const patched: IndependentVerifyResultV1 = {
        ...independentVerifyResult,
        status,
        reasonCode: status === "HOLD" ? "HOLD_RUNNER" : "REJECT_RUNNER",
        reasonMessage: `synthetic ${status}`,
      };
      const out = runHandoff(sourceExecutionTask, patched);
      expect(out.status).toBe(status === "HOLD" ? "HOLD" : status);
      expect(out.reasonCode).toBe(reasonCode);
      expect(out.publicationTask).toBeNull();
    }
  });
});

describe("RUNNER-PUBLISH-HANDOFF-V1 identity / path fail-closed", () => {
  it("21-23. taskId / repository / baseRevision mismatch reject", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();

    const taskMismatch = runHandoff(sourceExecutionTask, {
      ...independentVerifyResult,
      taskId: "other-task-id",
    });
    expect(taskMismatch.status).toBe("REJECT");
    expect(taskMismatch.reasonCode).toBe("REJECT_IDENTITY_TASK_ID");

    const repoMismatch = runHandoff(sourceExecutionTask, {
      ...independentVerifyResult,
      repository: "other-org/other-repo",
    });
    expect(repoMismatch.status).toBe("REJECT");
    expect(repoMismatch.reasonCode).toBe("REJECT_IDENTITY_REPOSITORY");

    const baseMismatch = runHandoff(sourceExecutionTask, {
      ...independentVerifyResult,
      baseRevision: OTHER_BASE,
    });
    expect(baseMismatch.status).toBe("REJECT");
    expect(baseMismatch.reasonCode).toBe("REJECT_IDENTITY_BASE_REVISION");
  });

  it("24-27. duplicate / unsafe / forbidden / empty paths fail closed", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();

    const dup = runHandoff(sourceExecutionTask, {
      ...independentVerifyResult,
      verifiedChangedPaths: [ALLOWED_DOC, ALLOWED_DOC],
    });
    expect(dup.status).toBe("REJECT");
    expect(dup.reasonCode).toBe("REJECT_CHANGED_PATH_DUPLICATE");

    const unsafe = runHandoff(sourceExecutionTask, {
      ...independentVerifyResult,
      verifiedChangedPaths: ["../secret.env"],
    });
    expect(unsafe.status).toBe("REJECT");
    expect(unsafe.reasonCode).toBe("REJECT_CHANGED_PATH_UNSAFE");

    const forbidden = runHandoff(sourceExecutionTask, {
      ...independentVerifyResult,
      verifiedChangedPaths: [".github/workflows/ci.yml"],
    });
    expect(forbidden.status).toBe("FAILED");
    expect(forbidden.reasonCode).toBe("FAILED_FORBIDDEN_PATH");

    const empty = runHandoff(sourceExecutionTask, {
      ...independentVerifyResult,
      verifiedChangedPaths: [],
    });
    expect(empty.status).toBe("REJECT");
    expect(empty.reasonCode).toBe("REJECT_VERIFIED_PATHS");

    const outOfScope = runHandoff(sourceExecutionTask, {
      ...independentVerifyResult,
      verifiedChangedPaths: ["docs/other/not-allowed.md"],
    });
    expect(outOfScope.status).toBe("FAILED");
    expect(outOfScope.reasonCode).toBe("FAILED_CHANGED_PATH_OUT_OF_SCOPE");
  });

  it("28b. verifier auth flag not exactly false → REJECT", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();
    const bad = runHandoff(sourceExecutionTask, {
      ...independentVerifyResult,
      metadata: {
        ...independentVerifyResult.metadata,
        publicationAuthorized: true as unknown as false,
      },
    });
    expect(bad.status).toBe("REJECT");
    expect(bad.reasonCode).toBe("REJECT_VERIFIER_METADATA");
  });

  it("29b. missing verificationEvidence → REJECT", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();
    const bad = runHandoff(sourceExecutionTask, {
      ...independentVerifyResult,
      verificationEvidence: null,
    });
    expect(bad.status).toBe("REJECT");
    expect(bad.reasonCode).toBe("REJECT_VERIFIER_EVIDENCE");
  });
});

describe("RUNNER-PUBLISH-HANDOFF-V1 idempotency / fingerprint", () => {
  it("39-40. same handoff + same fingerprint replay; different fingerprint conflict", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();
    const registry = new Map<string, PublicationHandoffAttemptRecordV1>();

    const first = runHandoff(
      sourceExecutionTask,
      independentVerifyResult,
      {},
      { attemptRegistry: registry },
    );
    expect(first.status).toBe("READY_FOR_PUBLICATION_TASK");

    const replay = runHandoff(
      sourceExecutionTask,
      independentVerifyResult,
      { observedAt: "2026-08-12T99:00:00.000Z" },
      { attemptRegistry: registry },
    );
    expect(replay.status).toBe("READY_FOR_PUBLICATION_TASK");
    expect(replay.publicationTaskId).toBe(first.publicationTaskId);
    expect(replay.authorityFingerprint).toBe(first.authorityFingerprint);

    const conflict = runHandoff(
      sourceExecutionTask,
      {
        ...independentVerifyResult,
        verifiedChangedPaths: [ALLOWED_DOC, ALLOWED_SRC, ALLOWED_TEST],
      },
      {},
      { attemptRegistry: registry },
    );
    expect(conflict.status).toBe("REJECT");
    expect(conflict.reasonCode).toBe("REJECT_HANDOFF_IDEMPOTENCY_CONFLICT");
  });

  it("41-42. authority fingerprint deterministic; observedAt excluded", () => {
    const { sourceExecutionTask, independentVerifyResult } = realVerified();
    const a = capturePublicationHandoffAuthorityFingerprint({
      handoffId: HANDOFF_ID,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      sourceIssue: sourceExecutionTask.sourceIssue,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths: independentVerifyResult.verifiedChangedPaths,
      verificationAttemptId: ATTEMPT,
      requestedPublicationCapability: PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
      requestedRiskClass: PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS,
      requestedStopAt: PUBLICATION_HANDOFF_REQUIRED_STOP_AT,
    });
    const b = capturePublicationHandoffAuthorityFingerprint({
      ...a,
      verifiedChangedPaths: [
        ...independentVerifyResult.verifiedChangedPaths,
      ].reverse(),
    });
    expect(authorityFingerprintsEqual(a, b)).toBe(true);
    expect(serializeAuthorityFingerprint(a)).not.toMatch(/observedAt/);

    const idA = buildDeterministicPublicationTaskId({
      handoffId: HANDOFF_ID,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths: independentVerifyResult.verifiedChangedPaths,
      requestedPublicationCapability: PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
      requestedRiskClass: PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS,
      requestedStopAt: PUBLICATION_HANDOFF_REQUIRED_STOP_AT,
    });
    const idB = buildDeterministicPublicationTaskId({
      handoffId: HANDOFF_ID,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: sourceExecutionTask.baseRevision,
      verifiedChangedPaths: [
        ...independentVerifyResult.verifiedChangedPaths,
      ].reverse(),
      requestedPublicationCapability: PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
      requestedRiskClass: PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS,
      requestedStopAt: PUBLICATION_HANDOFF_REQUIRED_STOP_AT,
    });
    expect(idA).toBe(idB);

    const idDifferent = buildDeterministicPublicationTaskId({
      handoffId: HANDOFF_ID,
      sourceExecutionTaskId: sourceExecutionTask.taskId,
      repository: sourceExecutionTask.repository,
      baseRevision: OTHER_BASE,
      verifiedChangedPaths: independentVerifyResult.verifiedChangedPaths,
      requestedPublicationCapability: PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
      requestedRiskClass: PUBLICATION_HANDOFF_REQUIRED_RISK_CLASS,
      requestedStopAt: PUBLICATION_HANDOFF_REQUIRED_STOP_AT,
    });
    expect(idDifferent).not.toBe(idA);
  });
});
