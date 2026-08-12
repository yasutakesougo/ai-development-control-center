# MIN-ORCHESTRATOR-V1

**Status: DESIGNED · ORCHESTRATION DECISION ONLY · NO AGENT EXECUTION · NO GITHUB PUBLICATION**

Smallest deterministic orchestration layer that consumes `AgentTaskBuilderResultV1`
and produces an explicit dispatch decision.

```text
ORCHESTRATION DECISION ONLY
AGENT EXECUTION = NOT IMPLEMENTED
AGENT RUNNER = NOT IMPLEMENTED
GITHUB PUBLICATION = NOT IMPLEMENTED
ACTION GATEWAY EXPANSION = NOT IMPLEMENTED
DRAFT PR / READY / MERGE AUTOMATION = NOT IMPLEMENTED
```

Baseline:

```text
main = bc8ed705f2b94a3938baed47df5a9a87095c6e08
AGENT-TASK-CONTRACT-V1 = COMPLETE (PR #44 / Issue #43)
AGENT-TASK-BUILDER-V1 = COMPLETE (PR #46 / Issue #45)
Issue #47 = OPEN (this orchestrator)
```

---

## 1. Purpose

```text
Human selects an Issue
→ Control Center builds AgentTaskV1 automatically
→ Orchestrator decides whether dispatch is eligible   ← this slice
→ Agent executes in an isolated runner               (future — NOT IMPLEMENTED)
→ independent verification                           (future — NOT IMPLEMENTED)
→ Draft PR                                           (future — NOT IMPLEMENTED)
→ STOP for Human review
```

Core rule:

```text
DISPATCH_ELIGIBLE ≠ Agent execution authorization
DISPATCH_ELIGIBLE ≠ Action Gateway authorization
DISPATCH_ELIGIBLE ≠ Ready / Merge authorization
DISPATCH_ELIGIBLE ≠ GitHub mutation authorization
```

---

## 2. Source of truth

Upstream contracts remain authoritative:

```text
src/domain/agentTaskContract.ts
src/domain/agentTaskBuilder.ts
AgentTaskV1
AgentTaskValidationResultV1
AgentTaskBuilderResultV1
parseAgentTaskV1()
validateAgentTaskV1()
buildAgentTaskFromIssue()
```

This slice **must not** weaken or bypass builder / contract validation.

---

## 3. Input

`MinOrchestratorInputV1` (unknown root keys → REJECT):

| Field | Role |
|---|---|
| `builderResult` | `AgentTaskBuilderResultV1` from AGENT-TASK-BUILDER-V1 |
| `observedAt` | Observation timestamp for this orchestration attempt |
| `attemptId` | Optional deterministic correlation id |

---

## 4. Output

`MinOrchestratorResultV1`:

| Field | Meaning |
|---|---|
| `decision` | `DISPATCH_ELIGIBLE` \| `HOLD` \| `REJECT` \| `UNKNOWN` |
| `reasonCode` | Machine-stable code |
| `reasonMessage` | Human-readable summary |
| `task` | Upstream `AgentTaskV1 \| null` (never rewritten / widened) |
| `builderStatus` | Echo of builder status (or null on input reject) |
| `validation` | Builder or revalidation result |
| `metadata` | Includes hard-false authorization flags |

`metadata` always sets:

```text
executionAuthorized = false
actionGatewayAuthorized = false
readyAuthorized = false
mergeAuthorized = false
githubMutationAuthorized = false
dispatchEligible = (decision === DISPATCH_ELIGIBLE)
```

---

## 5. Decision mapping

| Builder / validation condition | Decision |
|---|---|
| `status=BUILT` + `validation=VALID` + non-null task + structural parse PASS + semantic revalidation VALID + stage rules PASS | `DISPATCH_ELIGIBLE` |
| `status=HOLD` | `HOLD` |
| `status=INVALID` | `REJECT` |
| `status=UNKNOWN` | `UNKNOWN` |
| `BUILT` + null task | `REJECT` |
| `BUILT` + validation `INVALID` | `REJECT` |
| `BUILT` + validation `HOLD` | `HOLD` |
| `BUILT` + validation `UNKNOWN` | `UNKNOWN` |
| Malformed task on reparse | `REJECT` |
| Revalidation status ≠ builder validation status | `REJECT` |
| Internally inconsistent combination | fail closed (`REJECT` / `UNKNOWN`) |

---

## 6. Revalidation (BUILT path)

Do **not** trust `builderResult.status` alone. For purported `BUILT`:

1. Require non-null `task`
2. Run `parseAgentTaskV1(task)`
3. Run `validateAgentTaskV1(task)`
4. Require revalidation status to match `builderResult.validation.status`
5. Only then evaluate stage rules and possibly emit `DISPATCH_ELIGIBLE`

No silent repair of inconsistent upstream state.

---

## 7. Stage rules (capability / risk / stopAt)

Orchestrator may **inspect** but never **add or modify**:

```text
allowedCapabilities
riskClass
stopAt
```

Exact V1 rules (deterministic, fail closed):

| Check | Rule | Decision |
|---|---|---|
| `stopAt = TASK_BUILT` | Contract-only; no runner activity | `HOLD` (`HOLD_STOP_AT_TASK_BUILT`) |
| `stopAt ∈ {AGENT_COMPLETE, VERIFY_COMPLETE, DRAFT_PR}` | Supported for dispatch eligibility | continue |
| Other `stopAt` | Unsupported at this stage | `HOLD` (`HOLD_UNSUPPORTED_STOP_AT`) |
| `riskClass ∈ {R0, R1, R2}` | Supported for this stage | continue |
| `riskClass ∈ {R3, R4, R5}` | Future mutation / auth stages | `HOLD` (`HOLD_UNSUPPORTED_RISK_CLASS`) |
| `allowedCapabilities` empty | Default-deny; OK | continue |
| Each capability ∈ `{workspace.read.v1}` | Known inspect-only | continue |
| Any other capability | Unknown / unsupported | `HOLD` (`HOLD_UNSUPPORTED_CAPABILITY`) |

---

## 8. Task immutability

Returned `task` is the upstream validated task. Orchestrator must not rewrite or widen:

```text
repository
baseRevision
sourceIssue
objective
allowedPaths
forbiddenPaths
acceptanceCriteria
verificationCommands
allowedCapabilities
riskClass
stopAt
constraints
```

---

## 9. Artifacts

| Artifact | Path |
|---|---|
| Spec | `docs/min-orchestrator/min-orchestrator-v1.md` |
| Implementation | `src/domain/minOrchestrator.ts` |
| Tests | `test/minOrchestrator.test.ts` |

---

## 10. Explicitly NOT IMPLEMENTED

```text
Agent execution
agent.execute capability
Agent runner
Codex SDK execution
Cursor Agent execution
Cloudflare Workflows execution
GitHub Actions Agent runner
branch creation automation
commit automation
push automation
Draft PR creation automation
independent verification runner
Ready automation
Merge automation
Issue close automation
deploy
production mutation
permission/token scope expansion
new Action Gateway capability
```

---

## 11. Pipeline context

```text
1. AGENT-TASK-CONTRACT-V1 = COMPLETE
2. AGENT-TASK-BUILDER-V1 = COMPLETE
3. MIN-ORCHESTRATOR-V1 = THIS SLICE
4. AGENT-RUNNER-V1
5. INDEPENDENT-VERIFY-V1
6. DRAFT-PUBLISH-V1
7. NO-PROMPT-PILOT-V1
```
