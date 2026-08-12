# NO-PROMPT-PILOT-V2

**Status: IMPLEMENTED (composition harness) · POSITIVE PATH = UNBLOCKED_VIA_PUBLICATION_HANDOFF · REAL PROVIDER = HOLD · REAL GITHUB PUBLICATION = HOLD**

Closes the execution-engine milestone after RUNNER-PUBLISH-HANDOFF-V1 (#57)
by proving the full bounded fake/local path with **zero** manual Agent prompts.

```text
Manual Agent Prompt = 0
REAL CODE AGENT PROVIDER EXECUTION = HOLD
REAL GITHUB DRAFT PUBLICATION = HOLD
READY / MERGE / ISSUE CLOSE / DEPLOY = HOLD
```

Baseline (Implementation Start GO):

```text
main = 265d5d8500b4c17d9c09df76c2d8e78d21f58c57
RUNNER-PUBLISH-HANDOFF-V1 = COMPLETE (PR #58 / Issue #57 closed)
Issue #59 = OPEN (this pilot)
```

---

## 1. Purpose

```text
Human selects Issue
→ AgentTaskV1 R1
→ Orchestrator
→ Runner
→ Independent Verify = VERIFIED
→ PublicationHandoffV1
→ PublicationTask R2
→ DRAFT-PUBLISH-V1
→ PUBLISHED_DRAFT (fake/local)
→ STOP
```

Required KPI:

```text
manualAgentPromptCount = 0
```

The pilot **composes** existing modules. It does not reimplement them.
No stage repairs or widens authority from a prior stage.

---

## 2. Relationship to V1

NO-PROMPT-PILOT-V1 discovered:

```text
blockerCode = RUNNER_PUBLISHER_AUTHORITY_INCOMPATIBLE
```

| Stage | Authority |
|---|---|
| AGENT-RUNNER-V1 | risk ∈ {R0,R1}; capabilities ⊆ {workspace.read.v1} |
| DRAFT-PUBLISH-V1 | risk = R2; capability = github.draft-pr.publish.v1; stopAt = DRAFT_PR |

V2 does **not** widen either contract. It uses RUNNER-PUBLISH-HANDOFF-V1:

```text
ExecutionTask (R0/R1) unchanged
→ VERIFIED
→ PublicationHandoffV1
→ distinct PublicationTask (R2 + github.draft-pr.publish.v1 + DRAFT_PR)
→ DRAFT-PUBLISH-V1 (authorizedPublicationHandoff)
→ PUBLISHED_DRAFT (fake/local)
```

```text
positivePathStatus = UNBLOCKED_VIA_PUBLICATION_HANDOFF
```

---

## 3. KPI / executionAccounting

Same fail-closed rule as V1: KPI zeros are **never inferred from absence**.

Pilot input **must** include explicit `executionAccounting`:

```text
executionAccounting: {
  manualAgentPromptCount: 0,
  humanActions: ["SELECT_PILOT_ISSUE", "IMPLEMENTATION_START_GO"],
  humanTaskRepairs: false,
  humanCapabilityChanges: false,
  humanRiskChanges: false,
  humanStopAtChanges: false,
  humanRunnerEvidenceInjection: false,
  humanVerifierEvidenceInjection: false,
  humanPublisherEvidenceInjection: false
}
```

```text
missing / undefined / null / wrong type → REJECT_INPUT (fail closed)
```

---

## 4. Evidence packet

`NoPromptPilotV2EvidenceV1` includes at minimum:

```text
schemaVersion
pilotVersion
pilotId
selectedIssue
observedMainSha
builderResult
executionTask
orchestratorResult
runnerResult
independentVerifyResult
publicationHandoffResult
publicationTask
draftPublishResult
manualAgentPromptCount
humanActions
externalMutations = []
finalStatus
reasonCode
reasonMessage
metadata
observedAt
```

`metadata` always records:

```text
positivePathStatus = UNBLOCKED_VIA_PUBLICATION_HANDOFF
baselineMain = 265d5d8500b4c17d9c09df76c2d8e78d21f58c57
sourceExecutionTaskMutated = false
runnerAuthorityExpanded = false
realAgentProviderExecution = false
realGithubPublication = false
githubMutationPerformed = false
networkAccess = false
secretsRequired = false
productionMutationPerformed = false
readyAuthorized = false
mergeAuthorized = false
issueCloseAuthorized = false
deployAuthorized = false
```

---

## 5. Authority non-escalation

Forbidden:

```text
executionTask.riskClass rewrite / silent R1→R2
executionTask.allowedCapabilities rewrite
executionTask.stopAt rewrite
AGENT-RUNNER-V1 accepting R2 / github.draft-pr.publish.v1
generic github.write / repo.write
real provider execution
real GitHub publication
Ready / Merge / IssueClose / Deploy
```

---

## 6. Artifacts

| Artifact | Path |
|---|---|
| Spec | `docs/no-prompt-pilot/no-prompt-pilot-v2.md` |
| Harness | `src/domain/noPromptPilotV2.ts` |
| Tests | `test/noPromptPilotV2.test.ts` |

---

## 7. Explicit NOT IMPLEMENTED

```text
real Codex / Cursor execution
real GitHub branch / commit / push / Draft PR
Ready / Merge / Issue close automation
deploy / production mutation
secrets / token expansion
generic github.write / repo.write
Action Gateway expansion
```

---

## 8. Delivery gate

```text
Implementation → npm run verify → Draft PR → Fresh Review → STOP
```

Do not Ready. Do not Merge. Do not close Issue #59 in the implementation run.
Do not enable real provider execution or real GitHub publication.
