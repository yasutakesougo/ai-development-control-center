# NO-PROMPT-PILOT-V1

**Status: IMPLEMENTED (composition harness) · POSITIVE PATH = BLOCKED_BY_EXISTING_CONTRACT · REAL PROVIDER = HOLD · REAL GITHUB PUBLICATION = HOLD**

First end-to-end composition harness that proves the Control Center can take one
Human-selected Issue through the existing machine-readable pipeline **without**
a manually authored Agent execution prompt.

```text
Manual Agent Prompt = 0
REAL CODE AGENT PROVIDER EXECUTION = HOLD
REAL GITHUB DRAFT PUBLICATION = HOLD
READY / MERGE / ISSUE CLOSE / DEPLOY = HOLD
```

Baseline:

```text
main = 4f087076bf1f95566ef23866dd27c2976b9ec97e
AGENT-TASK-CONTRACT-V1 … DRAFT-PUBLISH-V1 = COMPLETE
Issue #55 = OPEN (this pilot)
```

---

## 1. Purpose

```text
Human selects one pilot Issue
→ AGENT-TASK-BUILDER-V1
→ MIN-ORCHESTRATOR-V1
→ AGENT-RUNNER-V1 (fake/isolated)
→ INDEPENDENT-VERIFY-V1
→ DRAFT-PUBLISH-V1 (fake/local)
→ STOP
```

The pilot **composes** existing modules. It does not reimplement them.
No stage repairs or widens authority from a prior stage.

---

## 2. Positive path status

```text
PILOT POSITIVE PATH = BLOCKED_BY_EXISTING_CONTRACT
blockerCode = RUNNER_PUBLISHER_AUTHORITY_INCOMPATIBLE
```

| Stage | Authority requirement |
|---|---|
| AGENT-RUNNER-V1 | risk ∈ {R0,R1}; capabilities ⊆ {workspace.read.v1} |
| DRAFT-PUBLISH-V1 | risk = R2; capability = github.draft-pr.publish.v1; stopAt = DRAFT_PR |

A **single** `AgentTaskV1` cannot legitimately satisfy both without widening
either contract (MIN-ORCHESTRATOR also only allowlists `workspace.read.v1`).

**Next contract slice required:** coordinated expansion of
MIN-ORCHESTRATOR-V1 + AGENT-RUNNER-V1 to accept R2 +
`github.draft-pr.publish.v1`, or an explicit dual-stage task handoff.

The pilot does **not** silently widen contracts to force `PASS`.

Canonical synthetic Issue uses runner-compatible authority
(`R1` + `workspace.read.v1` + `stopAt=DRAFT_PR`) so
builder → orchestrator → runner → verifier execute for real.
Publisher then returns `HOLD` (missing R2 / publish capability), and the
pilot finalizes as:

```text
finalStatus = HOLD
reasonCode = HOLD_CONTRACT_INCOMPATIBILITY
```

---

## 3. KPI / executionAccounting

KPI zeros and intervention flags are **never inferred from absence**.

Pilot input **must** include explicit machine-readable `executionAccounting`:

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
Do not invent manualAgentPromptCount = 0 merely because the field was absent
```

Use `createExplicitZeroInterventionAccounting()` in tests/harness callers to
supply observed zeros — that helper is an explicit observation, not a default
inside the parser.

Implementation PR Fresh Review / Ready / Merge gates are not Agent execution
prompts.

Forbidden for PASS/KPI:

```text
Human Agent execution prompt
Human task repairs after generation
Human capability / risk / stopAt changes
Human runner / verifier / publisher evidence injection
```

---

## 4. Evidence packet

`NoPromptPilotEvidenceV1` includes at minimum:

```text
schemaVersion
pilotVersion
pilotId
selectedIssue
observedMainSha
builderResult
agentTask
orchestratorResult
runnerResult
independentVerifyResult
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
positivePathStatus = BLOCKED_BY_EXISTING_CONTRACT
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

## 5. Stage binding

Downstream inputs are derived only from actual upstream outputs.

Forbidden:

```text
manually constructing runnerResult / VERIFIED / PUBLISHED_DRAFT
editing capability / risk / stopAt between stages
replacing baseRevision with latest main
replacing changedPaths with a preferred set
```

Authority fingerprint (taskId, repository, baseRevision, sourceIssue,
paths, capabilities, riskClass, stopAt, constraints) is captured after
build and checked for drift.

Stage outcome → pilot result mapping is centralized in
`mapUpstreamStageToPilotResult` so HOLD / REJECT / FAILED / UNKNOWN
propagation is unit-tested even when a status is unreachable under current
runner↔publisher authority (without widening domain contracts).

---

## 6. Artifacts

| Artifact | Path |
|---|---|
| Spec | `docs/no-prompt-pilot/no-prompt-pilot-v1.md` |
| Harness | `src/domain/noPromptPilot.ts` |
| Tests | `test/noPromptPilot.test.ts` |

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
contract widening to force PASS
```

---

## 8. Delivery gate

```text
Implementation → npm run verify → Draft PR → Fresh Review → STOP
```

Do not Ready. Do not Merge. Do not close Issue #55 in the implementation run.
Do not enable real provider execution or real GitHub publication.
