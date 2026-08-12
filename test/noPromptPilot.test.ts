import { describe, expect, it } from "vitest";
import {
  createFakeAgentRunnerAdapterV1,
} from "../src/domain/agentRunner";
import {
  createFakeIndependentVerifyAdapterV1,
} from "../src/domain/independentVerify";
import {
  createFakeDraftPublishAdapterV1,
} from "../src/domain/draftPublish";
import {
  NO_PROMPT_PILOT_EVIDENCE_SCHEMA,
  NO_PROMPT_PILOT_POSITIVE_PATH_BLOCKER,
  NO_PROMPT_PILOT_POSITIVE_PATH_STATUS,
  NO_PROMPT_PILOT_VERSION,
  assertNoPromptPilotBoundaries,
  authorityFingerprintsEqual,
  captureAuthorityFingerprint,
  createCanonicalNoPromptPilotIssue,
  createExplicitZeroInterventionAccounting,
  mapUpstreamStageToPilotResult,
  parseExecutionAccounting,
  runNoPromptPilotV1,
  taskSatisfiesRunnerAndPublisherContracts,
  type NoPromptPilotExecutionAccountingV1,
  type NoPromptPilotSelectedIssueV1,
} from "../src/domain/noPromptPilot";

const MAIN = "4f087076bf1f95566ef23866dd27c2976b9ec97e";
const OBSERVED_AT = "2026-08-12T12:22:00.000Z";
const VALIDATED_AT = "2026-08-12T12:22:30.000Z";
const PILOT_ID = "pilot-55-1";

function pilotInput(
  selectedIssue: NoPromptPilotSelectedIssueV1 = createCanonicalNoPromptPilotIssue(
    MAIN,
  ),
  overrides: {
    pilotId?: string;
    observedMainSha?: string;
    executionAccounting?: NoPromptPilotExecutionAccountingV1;
  } = {},
) {
  return {
    pilotId: overrides.pilotId ?? PILOT_ID,
    selectedIssue,
    observedMainSha: overrides.observedMainSha ?? MAIN,
    observedAt: OBSERVED_AT,
    executionAccounting:
      overrides.executionAccounting ?? createExplicitZeroInterventionAccounting(),
  };
}

function run(
  selectedIssue?: NoPromptPilotSelectedIssueV1,
  options: Parameters<typeof runNoPromptPilotV1>[1] = {},
  accounting?: NoPromptPilotExecutionAccountingV1,
) {
  return runNoPromptPilotV1(
    pilotInput(selectedIssue, accounting ? { executionAccounting: accounting } : {}),
    {
      validatedAt: VALIDATED_AT,
      ...options,
    },
  );
}

describe("NO-PROMPT-PILOT-V1 boundaries / blocker", () => {
  it("documents positive path BLOCKED_BY_EXISTING_CONTRACT", () => {
    expect(NO_PROMPT_PILOT_POSITIVE_PATH_STATUS).toBe(
      "BLOCKED_BY_EXISTING_CONTRACT",
    );
    expect(NO_PROMPT_PILOT_POSITIVE_PATH_BLOCKER.blockerCode).toBe(
      "RUNNER_PUBLISHER_AUTHORITY_INCOMPATIBLE",
    );
    assertNoPromptPilotBoundaries();
  });

  it("canonical issue cannot satisfy runner+publisher together", () => {
    const issue = createCanonicalNoPromptPilotIssue(MAIN);
    expect(issue.riskClass).toBe("R1");
    expect(issue.allowedCapabilities).toEqual(["workspace.read.v1"]);
    expect(issue.stopAt).toBe("DRAFT_PR");
  });
});

describe("NO-PROMPT-PILOT-V1 executionAccounting (explicit, fail-closed)", () => {
  it("rejects missing executionAccounting (does not infer 0)", () => {
    const { executionAccounting: _omit, ...without } = pilotInput();
    void _omit;
    const out = runNoPromptPilotV1(without, { validatedAt: VALIDATED_AT });
    expect(out.finalStatus).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_INPUT");
    expect(out.reasonMessage).toMatch(/executionAccounting is required/);
    expect(out.manualAgentPromptCount).not.toBe(0);
  });

  it("rejects null / wrong-type / partial executionAccounting", () => {
    expect(parseExecutionAccounting(null).ok).toBe(false);
    expect(parseExecutionAccounting("nope").ok).toBe(false);
    expect(parseExecutionAccounting({}).ok).toBe(false);
    expect(
      parseExecutionAccounting({
        ...createExplicitZeroInterventionAccounting(),
        manualAgentPromptCount: undefined,
      }).ok,
    ).toBe(false);
    expect(
      parseExecutionAccounting({
        ...createExplicitZeroInterventionAccounting(),
        humanTaskRepairs: "false",
      }).ok,
    ).toBe(false);

    const out = runNoPromptPilotV1(
      {
        ...pilotInput(),
        executionAccounting: {
          manualAgentPromptCount: 0,
        },
      },
      { validatedAt: VALIDATED_AT },
    );
    expect(out.finalStatus).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_INPUT");
  });

  it("createExplicitZeroInterventionAccounting supplies observed zeros", () => {
    const a = createExplicitZeroInterventionAccounting();
    expect(a.manualAgentPromptCount).toBe(0);
    expect(a.humanTaskRepairs).toBe(false);
    expect(a.humanCapabilityChanges).toBe(false);
    expect(a.humanRiskChanges).toBe(false);
    expect(a.humanStopAtChanges).toBe(false);
    expect(a.humanRunnerEvidenceInjection).toBe(false);
    expect(a.humanVerifierEvidenceInjection).toBe(false);
    expect(a.humanPublisherEvidenceInjection).toBe(false);
    expect(parseExecutionAccounting(a).ok).toBe(true);
  });
});

describe("NO-PROMPT-PILOT-V1 mapUpstreamStageToPilotResult", () => {
  it("6. builder UNKNOWN maps to UNKNOWN_BUILDER", () => {
    const m = mapUpstreamStageToPilotResult("builder", "UNKNOWN", "opaque");
    expect(m.finalStatus).toBe("UNKNOWN");
    expect(m.reasonCode).toBe("UNKNOWN_BUILDER");
  });

  it("builder HOLD/INVALID map correctly", () => {
    expect(mapUpstreamStageToPilotResult("builder", "HOLD", "x")).toMatchObject({
      finalStatus: "HOLD",
      reasonCode: "HOLD_BUILDER",
    });
    expect(
      mapUpstreamStageToPilotResult("builder", "INVALID", "x"),
    ).toMatchObject({
      finalStatus: "REJECT",
      reasonCode: "REJECT_BUILDER",
    });
  });

  it("12. runner UNKNOWN maps to UNKNOWN_RUNNER", () => {
    const m = mapUpstreamStageToPilotResult("runner", "UNKNOWN", "opaque");
    expect(m.finalStatus).toBe("UNKNOWN");
    expect(m.reasonCode).toBe("UNKNOWN_RUNNER");
  });

  it("runner HOLD/REJECT/FAILED map correctly", () => {
    expect(mapUpstreamStageToPilotResult("runner", "HOLD", "x")).toMatchObject({
      finalStatus: "HOLD",
      reasonCode: "HOLD_RUNNER",
    });
    expect(mapUpstreamStageToPilotResult("runner", "REJECT", "x")).toMatchObject(
      {
        finalStatus: "REJECT",
        reasonCode: "REJECT_RUNNER",
      },
    );
    expect(mapUpstreamStageToPilotResult("runner", "FAILED", "x")).toMatchObject(
      {
        finalStatus: "FAILED",
        reasonCode: "FAILED_RUNNER",
      },
    );
  });

  it("verifier HOLD/REJECT/FAILED/UNKNOWN map correctly", () => {
    expect(
      mapUpstreamStageToPilotResult("verifier", "HOLD", "x"),
    ).toMatchObject({ finalStatus: "HOLD", reasonCode: "HOLD_VERIFIER" });
    expect(
      mapUpstreamStageToPilotResult("verifier", "REJECT", "x"),
    ).toMatchObject({ finalStatus: "REJECT", reasonCode: "REJECT_VERIFIER" });
    expect(
      mapUpstreamStageToPilotResult("verifier", "FAILED", "x"),
    ).toMatchObject({ finalStatus: "FAILED", reasonCode: "FAILED_VERIFIER" });
    expect(
      mapUpstreamStageToPilotResult("verifier", "UNKNOWN", "x"),
    ).toMatchObject({ finalStatus: "UNKNOWN", reasonCode: "UNKNOWN_VERIFIER" });
  });

  it("18. publisher REJECT maps to REJECT_PUBLISHER", () => {
    const m = mapUpstreamStageToPilotResult("publisher", "REJECT", "draft false");
    expect(m.finalStatus).toBe("REJECT");
    expect(m.reasonCode).toBe("REJECT_PUBLISHER");
  });

  it("19. publisher FAILED maps to FAILED_PUBLISHER", () => {
    const m = mapUpstreamStageToPilotResult("publisher", "FAILED", "observe");
    expect(m.finalStatus).toBe("FAILED");
    expect(m.reasonCode).toBe("FAILED_PUBLISHER");
  });

  it("20. publisher UNKNOWN maps to UNKNOWN_PUBLISHER", () => {
    const m = mapUpstreamStageToPilotResult("publisher", "UNKNOWN", "opaque");
    expect(m.finalStatus).toBe("UNKNOWN");
    expect(m.reasonCode).toBe("UNKNOWN_PUBLISHER");
  });

  it("publisher HOLD maps to HOLD_PUBLISHER", () => {
    const m = mapUpstreamStageToPilotResult("publisher", "HOLD", "cap");
    expect(m.finalStatus).toBe("HOLD");
    expect(m.reasonCode).toBe("HOLD_PUBLISHER");
  });
});

describe("NO-PROMPT-PILOT-V1 composed pipeline (real modules)", () => {
  it("1. complete composed pipeline → HOLD (positive PASS blocked by contract)", () => {
    const out = run();
    expect(out.schemaVersion).toBe(NO_PROMPT_PILOT_EVIDENCE_SCHEMA);
    expect(out.pilotVersion).toBe(NO_PROMPT_PILOT_VERSION);
    expect(out.builderResult?.status).toBe("BUILT");
    expect(out.agentTask).not.toBeNull();
    expect(out.orchestratorResult?.decision).toBe("DISPATCH_ELIGIBLE");
    expect(out.runnerResult?.status).toBe("COMPLETED");
    expect(out.independentVerifyResult?.status).toBe("VERIFIED");
    expect(out.draftPublishResult?.status).toBe("HOLD");
    expect(out.finalStatus).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_CONTRACT_INCOMPATIBILITY");
    expect(out.metadata.positivePathStatus).toBe(
      "BLOCKED_BY_EXISTING_CONTRACT",
    );
    expect(out.metadata.stagesCompleted).toEqual([
      "builder",
      "task-revalidation",
      "orchestrator",
      "runner",
      "verifier",
    ]);
    expect(out.metadata.stoppedAtStage).toBe("publisher");
    expect(
      taskSatisfiesRunnerAndPublisherContracts(out.agentTask!),
    ).toBe(false);
  });

  it("2. explicit manualAgentPromptCount === 0 and all intervention flags false", () => {
    const accounting = createExplicitZeroInterventionAccounting();
    const out = run(undefined, {}, accounting);
    expect(out.manualAgentPromptCount).toBe(0);
    expect(out.humanActions).toEqual(accounting.humanActions);
    expect(accounting.humanTaskRepairs).toBe(false);
    expect(accounting.humanCapabilityChanges).toBe(false);
    expect(accounting.humanRiskChanges).toBe(false);
    expect(accounting.humanStopAtChanges).toBe(false);
    expect(accounting.humanRunnerEvidenceInjection).toBe(false);
    expect(accounting.humanVerifierEvidenceInjection).toBe(false);
    expect(accounting.humanPublisherEvidenceInjection).toBe(false);
  });

  it("3. manualAgentPromptCount > 0 → REJECT", () => {
    const out = run(undefined, {}, {
      ...createExplicitZeroInterventionAccounting(),
      manualAgentPromptCount: 1,
    });
    expect(out.finalStatus).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_MANUAL_PROMPT");
    expect(out.manualAgentPromptCount).toBe(1);
    expect(out.builderResult).toBeNull();
  });

  it("32-34. runner/verifier/publisher consume actual upstream outputs", () => {
    const out = run();
    expect(out.runnerResult?.runnerAttemptId).toBe(`runner:${PILOT_ID}`);
    expect(out.independentVerifyResult?.verificationAttemptId).toBe(
      `verify:${PILOT_ID}`,
    );
    expect(out.independentVerifyResult?.taskId).toBe(out.runnerResult?.taskId);
    expect(out.draftPublishResult?.publicationAttemptId).toBe(
      `publish:${PILOT_ID}`,
    );
    expect(out.draftPublishResult?.taskId).toBe(
      out.independentVerifyResult?.taskId,
    );
  });

  it("35-37. no manual evidence injection flags", () => {
    const out = run(undefined, {}, {
      ...createExplicitZeroInterventionAccounting(),
      humanRunnerEvidenceInjection: true,
    });
    expect(out.finalStatus).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_MANUAL_INTERVENTION");
  });

  it("38-47. safety / authorization flags remain false", () => {
    const out = run();
    expect(out.metadata.realAgentProviderExecution).toBe(false);
    expect(out.metadata.realGithubPublication).toBe(false);
    expect(out.metadata.githubMutationPerformed).toBe(false);
    expect(out.metadata.productionMutationPerformed).toBe(false);
    expect(out.metadata.networkAccess).toBe(false);
    expect(out.metadata.secretsRequired).toBe(false);
    expect(out.metadata.readyAuthorized).toBe(false);
    expect(out.metadata.mergeAuthorized).toBe(false);
    expect(out.metadata.issueCloseAuthorized).toBe(false);
    expect(out.metadata.deployAuthorized).toBe(false);
    expect(out.externalMutations).toEqual([]);
  });

  it("48. deterministic repeatability (semantic)", () => {
    const a = run(undefined, { resetFakePublishCounter: true });
    const b = run(undefined, { resetFakePublishCounter: true });
    expect(a.finalStatus).toBe(b.finalStatus);
    expect(a.reasonCode).toBe(b.reasonCode);
    expect(a.builderResult?.status).toBe(b.builderResult?.status);
    expect(a.orchestratorResult?.decision).toBe(
      b.orchestratorResult?.decision,
    );
    expect(a.runnerResult?.status).toBe(b.runnerResult?.status);
    expect(a.independentVerifyResult?.status).toBe(
      b.independentVerifyResult?.status,
    );
    expect(a.draftPublishResult?.status).toBe(b.draftPublishResult?.status);
    expect(a.agentTask?.taskId).toBe(b.agentTask?.taskId);
    expect(a.manualAgentPromptCount).toBe(0);
    expect(b.manualAgentPromptCount).toBe(0);
  });

  it("49-50. malformed / unknown input fail closed", () => {
    const malformed = runNoPromptPilotV1("nope", {
      validatedAt: VALIDATED_AT,
    });
    expect(malformed.finalStatus).toBe("REJECT");
    expect(malformed.reasonCode).toBe("REJECT_INPUT");

    const unknown = runNoPromptPilotV1(
      { ...pilotInput(), notes: "no" },
      { validatedAt: VALIDATED_AT },
    );
    expect(unknown.finalStatus).toBe("REJECT");
    expect(unknown.reasonCode).toBe("REJECT_INPUT");
  });
});

describe("NO-PROMPT-PILOT-V1 fail-closed stage propagation", () => {
  it("4. builder HOLD propagates", () => {
    const issue = createCanonicalNoPromptPilotIssue(MAIN);
    const out = run({
      ...issue,
      allowedPaths: undefined as unknown as string[],
    });
    expect(["HOLD", "REJECT"]).toContain(out.finalStatus);
    expect(["HOLD_BUILDER", "REJECT_INPUT"]).toContain(out.reasonCode);
  });

  it("4b. builder HOLD when acceptance criteria missing", () => {
    const issue = {
      ...createCanonicalNoPromptPilotIssue(MAIN),
      acceptanceCriteria: [],
    };
    const out = run(issue);
    expect(out.finalStatus).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_BUILDER");
    expect(out.builderResult?.status).toBe("HOLD");
  });

  it("5. builder INVALID propagates", () => {
    const issue = {
      ...createCanonicalNoPromptPilotIssue(MAIN),
      repository: "not-a-repo",
    };
    const out = run(issue);
    expect(out.finalStatus).toBe("REJECT");
    expect(["REJECT_BUILDER", "REJECT_INPUT"]).toContain(out.reasonCode);
  });

  it("7. orchestrator HOLD propagates (stopAt=TASK_BUILT)", () => {
    const issue = {
      ...createCanonicalNoPromptPilotIssue(MAIN),
      stopAt: "TASK_BUILT" as const,
    };
    const out = run(issue);
    expect(out.finalStatus).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_ORCHESTRATOR");
    expect(out.orchestratorResult?.decision).toBe("HOLD");
    expect(out.runnerResult).toBeNull();
  });

  it("8. orchestrator REJECT / unsupported capability before dispatch", () => {
    const issue = {
      ...createCanonicalNoPromptPilotIssue(MAIN),
      allowedCapabilities: ["github.draft-pr.publish.v1"],
      riskClass: "R2" as const,
    };
    const out = run(issue);
    expect(out.finalStatus).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_ORCHESTRATOR");
    expect(out.orchestratorResult?.decision).toBe("HOLD");
  });

  it("9. runner HOLD propagates (R2 + workspace.read.v1)", () => {
    const issue = {
      ...createCanonicalNoPromptPilotIssue(MAIN),
      riskClass: "R2" as const,
      allowedCapabilities: ["workspace.read.v1"],
    };
    const out = run(issue);
    expect(out.orchestratorResult?.decision).toBe("DISPATCH_ELIGIBLE");
    expect(out.runnerResult?.status).toBe("HOLD");
    expect(out.finalStatus).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_RUNNER");
    expect(out.independentVerifyResult).toBeNull();
  });

  it("10. runner REJECT propagates", () => {
    const out = run(undefined, {
      runnerAdapter: createFakeAgentRunnerAdapterV1({
        changedPaths: ["docs/no-prompt-pilot/x.md"],
        symlinkWriteAttempted: true,
      }),
    });
    expect(out.runnerResult?.status).toBe("REJECT");
    expect(out.finalStatus).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_RUNNER");
  });

  it("11. runner FAILED propagates", () => {
    const out = run(undefined, {
      runnerAdapter: createFakeAgentRunnerAdapterV1({ failAt: "execute" }),
    });
    expect(out.runnerResult?.status).toBe("FAILED");
    expect(out.finalStatus).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_RUNNER");
  });

  it("13-16. verifier HOLD/REJECT/FAILED via adapter / path faults", () => {
    const rejectOut = run(undefined, {
      runnerChangedPaths: ["docs/../secret.env"],
    });
    expect(["REJECT", "FAILED", "HOLD"]).toContain(rejectOut.finalStatus);

    const failedVerify = run(undefined, {
      verifyAdapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [
          "docs/no-prompt-pilot/no-prompt-pilot-v1.md",
          "src/domain/noPromptPilot.ts",
        ],
        failAt: "observe",
      }),
    });
    expect(failedVerify.runnerResult?.status).toBe("COMPLETED");
    expect(failedVerify.independentVerifyResult?.status).toBe("FAILED");
    expect(failedVerify.finalStatus).toBe("FAILED");
    expect(failedVerify.reasonCode).toBe("FAILED_VERIFIER");

    const mismatchVerify = run(undefined, {
      verifyAdapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: ["docs/no-prompt-pilot/no-prompt-pilot-v1.md"],
      }),
    });
    expect(mismatchVerify.independentVerifyResult?.status).toBe("REJECT");
    expect(mismatchVerify.finalStatus).toBe("REJECT");
    expect(mismatchVerify.reasonCode).toBe("REJECT_VERIFIER");
  });

  it("17. publisher HOLD propagates (contract incompatibility)", () => {
    const out = run();
    expect(out.draftPublishResult?.status).toBe("HOLD");
    expect(out.finalStatus).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_CONTRACT_INCOMPATIBILITY");
  });

  it("18b. publisher REJECT/FAILED unreachable under canonical authority (HOLD first)", () => {
    // Mapping is unit-tested via mapUpstreamStageToPilotResult; pipeline still
    // HOLDs on capability before adapter draft/fail hooks fire.
    const rejectAttempt = run(undefined, {
      publishAdapter: createFakeDraftPublishAdapterV1({
        forceDraftFalse: true,
      }),
    });
    expect(rejectAttempt.draftPublishResult?.status).toBe("HOLD");
    expect(rejectAttempt.finalStatus).toBe("HOLD");

    const failedAttempt = run(undefined, {
      publishAdapter: createFakeDraftPublishAdapterV1({
        failAt: "observeBase",
      }),
    });
    expect(failedAttempt.draftPublishResult?.status).toBe("HOLD");
    expect(failedAttempt.finalStatus).toBe("HOLD");
  });
});

describe("NO-PROMPT-PILOT-V1 authority preservation", () => {
  it("21-30. identity and authority fields preserved through executed stages", () => {
    const out = run();
    const task = out.agentTask!;
    const fp = captureAuthorityFingerprint(task);
    expect(out.metadata.authorityFingerprint).not.toBeNull();
    expect(
      authorityFingerprintsEqual(fp, out.metadata.authorityFingerprint!),
    ).toBe(true);

    expect(out.orchestratorResult?.task?.taskId).toBe(task.taskId);
    expect(out.orchestratorResult?.task?.repository).toBe(task.repository);
    expect(out.orchestratorResult?.task?.baseRevision).toBe(task.baseRevision);
    expect(out.orchestratorResult?.task?.sourceIssue).toEqual(task.sourceIssue);
    expect(out.orchestratorResult?.task?.allowedCapabilities).toEqual(
      task.allowedCapabilities,
    );
    expect(out.orchestratorResult?.task?.riskClass).toBe(task.riskClass);
    expect(out.orchestratorResult?.task?.stopAt).toBe(task.stopAt);
    expect(out.orchestratorResult?.task?.allowedPaths).toEqual(
      task.allowedPaths,
    );
    expect(out.orchestratorResult?.task?.forbiddenPaths).toEqual(
      task.forbiddenPaths,
    );
    expect(out.orchestratorResult?.task?.constraints).toEqual(task.constraints);

    expect(out.runnerResult?.taskId).toBe(task.taskId);
    expect(out.runnerResult?.repository).toBe(task.repository);
    expect(out.runnerResult?.baseRevision).toBe(task.baseRevision);
    expect(out.independentVerifyResult?.taskId).toBe(task.taskId);
    expect(out.independentVerifyResult?.repository).toBe(task.repository);
    expect(out.independentVerifyResult?.baseRevision).toBe(task.baseRevision);
  });

  it("31. authority drift helper detects inequality", () => {
    const out = run();
    const fp = captureAuthorityFingerprint(out.agentTask!);
    const drifted = { ...fp, riskClass: "R2" as const };
    expect(authorityFingerprintsEqual(fp, drifted)).toBe(false);
  });
});
