import { describe, expect, it } from "vitest";
import {
  AGENT_RUNNER_SUPPORTED_CAPABILITIES,
  AGENT_RUNNER_SUPPORTED_RISK_CLASSES,
  createFakeAgentRunnerAdapterV1,
} from "../src/domain/agentRunner";
import { createFakeIndependentVerifyAdapterV1 } from "../src/domain/independentVerify";
import { createFakeDraftPublishAdapterV1 } from "../src/domain/draftPublish";
import { PUBLICATION_HANDOFF_REQUIRED_CAPABILITY } from "../src/domain/publicationHandoff";
import {
  createExplicitZeroInterventionAccounting,
  parseExecutionAccounting,
  type NoPromptPilotExecutionAccountingV1,
  type NoPromptPilotSelectedIssueV1,
} from "../src/domain/noPromptPilot";
import {
  NO_PROMPT_PILOT_V2_BASELINE_MAIN,
  NO_PROMPT_PILOT_V2_EVIDENCE_SCHEMA,
  NO_PROMPT_PILOT_V2_POSITIVE_PATH_STATUS,
  NO_PROMPT_PILOT_V2_VERSION,
  assertNoPromptPilotV2Boundaries,
  createCanonicalNoPromptPilotV2Issue,
  mapV2UpstreamStageToPilotResult,
  runNoPromptPilotV2,
} from "../src/domain/noPromptPilotV2";

const MAIN = NO_PROMPT_PILOT_V2_BASELINE_MAIN;
const OBSERVED_AT = "2026-08-12T14:55:54.000Z";
const VALIDATED_AT = "2026-08-12T14:56:30.000Z";
const PILOT_ID = "pilot-59-1";

function pilotInput(
  selectedIssue: NoPromptPilotSelectedIssueV1 = createCanonicalNoPromptPilotV2Issue(
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
  options: Parameters<typeof runNoPromptPilotV2>[1] = {},
  accounting?: NoPromptPilotExecutionAccountingV1,
) {
  return runNoPromptPilotV2(
    pilotInput(selectedIssue, accounting ? { executionAccounting: accounting } : {}),
    {
      validatedAt: VALIDATED_AT,
      ...options,
    },
  );
}

describe("NO-PROMPT-PILOT-V2 boundaries", () => {
  it("positive path unblocked via publication handoff; runner not widened", () => {
    expect(NO_PROMPT_PILOT_V2_POSITIVE_PATH_STATUS).toBe(
      "UNBLOCKED_VIA_PUBLICATION_HANDOFF",
    );
    expect([...AGENT_RUNNER_SUPPORTED_RISK_CLASSES]).not.toContain("R2");
    expect([...AGENT_RUNNER_SUPPORTED_CAPABILITIES]).not.toContain(
      PUBLICATION_HANDOFF_REQUIRED_CAPABILITY,
    );
    assertNoPromptPilotV2Boundaries();
  });

  it("canonical issue is execution-authority only (R1 + workspace.read.v1)", () => {
    const issue = createCanonicalNoPromptPilotV2Issue(MAIN);
    expect(issue.riskClass).toBe("R1");
    expect(issue.allowedCapabilities).toEqual(["workspace.read.v1"]);
    expect(issue.stopAt).toBe("DRAFT_PR");
    expect(issue.issueNumber).toBe(59);
  });
});

describe("NO-PROMPT-PILOT-V2 executionAccounting (explicit, fail-closed)", () => {
  it("rejects missing executionAccounting (does not infer 0)", () => {
    const { executionAccounting: _omit, ...without } = pilotInput();
    void _omit;
    const out = runNoPromptPilotV2(without, { validatedAt: VALIDATED_AT });
    expect(out.finalStatus).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_INPUT");
    expect(out.reasonMessage).toMatch(/executionAccounting is required/);
    expect(out.manualAgentPromptCount).not.toBe(0);
  });

  it("rejects null / wrong-type / partial executionAccounting", () => {
    expect(parseExecutionAccounting(null).ok).toBe(false);
    expect(parseExecutionAccounting("nope").ok).toBe(false);
    expect(
      parseExecutionAccounting({
        manualAgentPromptCount: undefined,
      }).ok,
    ).toBe(false);
  });

  it("manualAgentPromptCount > 0 → REJECT", () => {
    const out = run(undefined, {}, {
      ...createExplicitZeroInterventionAccounting(),
      manualAgentPromptCount: 1,
    });
    expect(out.finalStatus).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_MANUAL_PROMPT");
    expect(out.manualAgentPromptCount).toBe(1);
  });
});

describe("NO-PROMPT-PILOT-V2 mapV2UpstreamStageToPilotResult", () => {
  it("maps handoff HOLD/REJECT/FAILED/UNKNOWN", () => {
    expect(mapV2UpstreamStageToPilotResult("handoff", "HOLD", "x").reasonCode).toBe(
      "HOLD_HANDOFF",
    );
    expect(
      mapV2UpstreamStageToPilotResult("handoff", "REJECT", "x").reasonCode,
    ).toBe("REJECT_HANDOFF");
    expect(
      mapV2UpstreamStageToPilotResult("handoff", "FAILED", "x").reasonCode,
    ).toBe("FAILED_HANDOFF");
    expect(
      mapV2UpstreamStageToPilotResult("handoff", "UNKNOWN", "x").reasonCode,
    ).toBe("UNKNOWN_HANDOFF");
  });

  it("reuses V1 mapper for publisher HOLD", () => {
    const m = mapV2UpstreamStageToPilotResult("publisher", "HOLD", "cap");
    expect(m.finalStatus).toBe("HOLD");
    expect(m.reasonCode).toBe("HOLD_PUBLISHER");
  });
});

describe("NO-PROMPT-PILOT-V2 composed pipeline (PASS)", () => {
  it("full path → PUBLISHED_DRAFT with manualAgentPromptCount = 0", () => {
    const out = run();
    expect(out.schemaVersion).toBe(NO_PROMPT_PILOT_V2_EVIDENCE_SCHEMA);
    expect(out.pilotVersion).toBe(NO_PROMPT_PILOT_V2_VERSION);
    expect(out.observedMainSha).toBe(MAIN);
    expect(out.metadata.baselineMain).toBe(MAIN);
    expect(out.metadata.positivePathStatus).toBe(
      "UNBLOCKED_VIA_PUBLICATION_HANDOFF",
    );

    expect(out.builderResult?.status).toBe("BUILT");
    expect(out.executionTask).not.toBeNull();
    expect(out.orchestratorResult?.decision).toBe("DISPATCH_ELIGIBLE");
    expect(out.runnerResult?.status).toBe("COMPLETED");
    expect(out.independentVerifyResult?.status).toBe("VERIFIED");
    expect(out.publicationHandoffResult?.status).toBe(
      "READY_FOR_PUBLICATION_TASK",
    );
    expect(out.publicationTask).not.toBeNull();
    expect(out.draftPublishResult?.status).toBe("PUBLISHED_DRAFT");
    expect(out.finalStatus).toBe("PASS");
    expect(out.reasonCode).toBe("PASS");
    expect(out.manualAgentPromptCount).toBe(0);

    expect(out.metadata.stagesCompleted).toEqual([
      "builder",
      "task-revalidation",
      "orchestrator",
      "runner",
      "verifier",
      "handoff",
      "publisher",
    ]);
    expect(out.metadata.stoppedAtStage).toBeNull();
  });

  it("source execution task remains R1 + workspace.read.v1 and unchanged vs publication task", () => {
    const out = run();
    const exec = out.executionTask!;
    const pub = out.publicationTask!;

    expect(exec.riskClass).toBe("R1");
    expect(exec.allowedCapabilities).toEqual(["workspace.read.v1"]);
    expect(exec.stopAt).toBe("DRAFT_PR");

    expect(pub.taskId).not.toBe(exec.taskId);
    expect(pub.riskClass).toBe("R2");
    expect(pub.allowedCapabilities).toEqual([
      "github.draft-pr.publish.v1",
    ]);
    expect(pub.stopAt).toBe("DRAFT_PR");
    expect(pub.allowedPaths).toEqual(
      out.independentVerifyResult!.verifiedChangedPaths,
    );

    expect(out.metadata.sourceExecutionTaskMutated).toBe(false);
    expect(out.metadata.runnerAuthorityExpanded).toBe(false);
    expect(out.draftPublishResult!.taskId).toBe(pub.taskId);
    expect(out.independentVerifyResult!.taskId).toBe(exec.taskId);
  });

  it("exact repository/base/sourceIssue bindings preserved", () => {
    const out = run();
    const exec = out.executionTask!;
    expect(out.runnerResult?.repository).toBe(exec.repository);
    expect(out.runnerResult?.baseRevision).toBe(exec.baseRevision);
    expect(out.independentVerifyResult?.repository).toBe(exec.repository);
    expect(out.independentVerifyResult?.baseRevision).toBe(exec.baseRevision);
    expect(out.publicationTask?.repository).toBe(exec.repository);
    expect(out.publicationTask?.baseRevision).toBe(exec.baseRevision);
    expect(out.publicationTask?.sourceIssue).toEqual(exec.sourceIssue);
    expect(out.draftPublishResult?.repository).toBe(exec.repository);
    expect(out.draftPublishResult?.baseRevision).toBe(exec.baseRevision);
  });

  it("safety / authorization flags remain false", () => {
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
    expect(out.draftPublishResult!.metadata.githubMutationPerformed).toBe(false);
    expect(out.draftPublishResult!.metadata.realGithubPublicationImplemented).toBe(
      false,
    );
    expect(out.draftPublishResult!.metadata.publishedMeansFakeLocalSimulationOnly).toBe(
      true,
    );
  });

  it("deterministic repeatability", () => {
    const a = run(undefined, { resetFakePublishCounter: true });
    const b = run(undefined, { resetFakePublishCounter: true });
    expect(a.finalStatus).toBe("PASS");
    expect(b.finalStatus).toBe("PASS");
    expect(a.executionTask?.taskId).toBe(b.executionTask?.taskId);
    expect(a.publicationTask?.taskId).toBe(b.publicationTask?.taskId);
    expect(a.draftPublishResult?.status).toBe(b.draftPublishResult?.status);
    expect(a.manualAgentPromptCount).toBe(0);
    expect(b.manualAgentPromptCount).toBe(0);
  });
});

describe("NO-PROMPT-PILOT-V2 fail-closed stage propagation", () => {
  it("rejects malformed / unknown input", () => {
    const malformed = runNoPromptPilotV2("nope", { validatedAt: VALIDATED_AT });
    expect(malformed.finalStatus).toBe("REJECT");
    expect(malformed.reasonCode).toBe("REJECT_INPUT");

    const unknown = runNoPromptPilotV2(
      { ...pilotInput(), notes: "no" },
      { validatedAt: VALIDATED_AT },
    );
    expect(unknown.finalStatus).toBe("REJECT");
    expect(unknown.reasonCode).toBe("REJECT_INPUT");
  });

  it("builder HOLD propagates", () => {
    const issue = {
      ...createCanonicalNoPromptPilotV2Issue(MAIN),
      acceptanceCriteria: [],
    };
    const out = run(issue);
    expect(out.finalStatus).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_BUILDER");
    expect(out.publicationHandoffResult).toBeNull();
    expect(out.draftPublishResult).toBeNull();
  });

  it("orchestrator HOLD propagates (stopAt=TASK_BUILT)", () => {
    const issue = {
      ...createCanonicalNoPromptPilotV2Issue(MAIN),
      stopAt: "TASK_BUILT" as const,
    };
    const out = run(issue);
    expect(out.finalStatus).toBe("HOLD");
    expect(out.reasonCode).toBe("HOLD_ORCHESTRATOR");
    expect(out.runnerResult).toBeNull();
  });

  it("runner REJECT propagates", () => {
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

  it("runner FAILED propagates", () => {
    const out = run(undefined, {
      runnerAdapter: createFakeAgentRunnerAdapterV1({ failAt: "execute" }),
    });
    expect(out.runnerResult?.status).toBe("FAILED");
    expect(out.finalStatus).toBe("FAILED");
    expect(out.reasonCode).toBe("FAILED_RUNNER");
  });

  it("verifier FAILED / REJECT propagate", () => {
    const failedVerify = run(undefined, {
      verifyAdapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: [
          "docs/no-prompt-pilot/no-prompt-pilot-v2.md",
          "src/domain/noPromptPilotV2.ts",
        ],
        failAt: "observe",
      }),
    });
    expect(failedVerify.independentVerifyResult?.status).toBe("FAILED");
    expect(failedVerify.finalStatus).toBe("FAILED");
    expect(failedVerify.reasonCode).toBe("FAILED_VERIFIER");

    const mismatchVerify = run(undefined, {
      verifyAdapter: createFakeIndependentVerifyAdapterV1({
        observedChangedPaths: ["docs/no-prompt-pilot/no-prompt-pilot-v2.md"],
      }),
    });
    expect(mismatchVerify.independentVerifyResult?.status).toBe("REJECT");
    expect(mismatchVerify.finalStatus).toBe("REJECT");
    expect(mismatchVerify.reasonCode).toBe("REJECT_VERIFIER");
  });

  it("publisher REJECT propagates when adapter forbids draft", () => {
    const out = run(undefined, {
      publishAdapter: createFakeDraftPublishAdapterV1({
        forceDraftFalse: true,
      }),
    });
    expect(out.publicationHandoffResult?.status).toBe(
      "READY_FOR_PUBLICATION_TASK",
    );
    expect(["REJECT", "FAILED", "HOLD"]).toContain(out.finalStatus);
    expect(out.finalStatus).not.toBe("PASS");
    expect(out.draftPublishResult?.status).not.toBe("PUBLISHED_DRAFT");
  });

  it("manual intervention flags reject", () => {
    const out = run(undefined, {}, {
      ...createExplicitZeroInterventionAccounting(),
      humanPublisherEvidenceInjection: true,
    });
    expect(out.finalStatus).toBe("REJECT");
    expect(out.reasonCode).toBe("REJECT_MANUAL_INTERVENTION");
  });
});
