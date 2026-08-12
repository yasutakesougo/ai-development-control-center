# AGENT-RUNNER-V1

**Status: IMPLEMENTED (contract + fake/in-memory adapter) · PROVIDER INTEGRATION = HOLD · COMMAND EXECUTION = HOLD · NO GITHUB PUBLICATION**

Smallest bounded runner layer that consumes a `MinOrchestratorResultV1` and may
perform **isolated workspace activity only** under explicit `AgentTaskV1`
authority, after independent revalidation.

```text
ISOLATED WORKSPACE RUNNER CONTRACT
FAKE / IN-MEMORY ADAPTER ONLY
PROVIDER INTEGRATION = HOLD
COMMAND EXECUTION = HOLD
GITHUB PUBLICATION = NOT IMPLEMENTED
READY / MERGE / DEPLOY = NOT IMPLEMENTED
INDEPENDENT VERIFICATION = NOT IMPLEMENTED
```

Baseline:

```text
main = 032bd6e88d4cd6f62d4621a840bcd2b3d37cd82e
AGENT-TASK-CONTRACT-V1 = COMPLETE (PR #44 / Issue #43)
AGENT-TASK-BUILDER-V1 = COMPLETE (PR #46 / Issue #45)
MIN-ORCHESTRATOR-V1 = COMPLETE (PR #48 / Issue #47)
Issue #49 = OPEN (this runner)
```

---

## 1. Purpose

```text
Human selects an Issue
→ Control Center builds AgentTaskV1 automatically
→ Orchestrator decides dispatch eligibility
→ Agent executes in an isolated runner               ← this slice
→ independent verification                           (future — NOT IMPLEMENTED)
→ Draft PR                                           (future — NOT IMPLEMENTED)
→ STOP for Human review
```

Core rules:

```text
DISPATCH_ELIGIBLE ≠ runner execution authorization by itself
Runner COMPLETED ≠ independent verification
Runner COMPLETED ≠ publication authorization
Runner COMPLETED ≠ Ready authorization
Runner COMPLETED ≠ Merge authorization
Runner COMPLETED ≠ GitHub mutation authorization
```

---

## 2. Source of truth

Upstream contracts remain authoritative and are not weakened:

```text
src/domain/agentTaskContract.ts
src/domain/agentTaskBuilder.ts
src/domain/minOrchestrator.ts
AgentTaskV1
AgentTaskValidationResultV1
MinOrchestratorResultV1
parseAgentTaskV1()
validateAgentTaskV1()
orchestrateAgentTaskV1()
```

---

## 3. Input

`AgentRunnerInputV1` (unknown root keys → `REJECT`):

| Field | Role |
|---|---|
| `orchestratorResult` | `MinOrchestratorResultV1` from MIN-ORCHESTRATOR-V1 |
| `runnerAttemptId` | Deterministic correlation id for this runner attempt |
| `observedAt` | Observation timestamp |
| `workspace` | Exact binding: `{ repository, baseRevision }` |

Preconditions before any adapter invocation:

```text
orchestratorResult.decision === DISPATCH_ELIGIBLE
orchestratorResult.metadata.dispatchEligible === true
orchestratorResult.metadata.executionAuthorized === false
orchestratorResult.task !== null
```

Then the runner **independently** re-parses and re-validates the task, checks
identity bindings, risk class, capabilities, and path policy.

---

## 4. Output

`AgentRunnerResultV1`:

| Field | Meaning |
|---|---|
| `status` | `COMPLETED` \| `HOLD` \| `REJECT` \| `FAILED` \| `UNKNOWN` |
| `reasonCode` | Machine-stable code |
| `reasonMessage` | Human-readable summary |
| `runnerAttemptId` | Echo of attempt id |
| `taskId` / `repository` / `baseRevision` | Bound identity (nullable on early reject) |
| `changedPaths` | Paths reported by adapter after collect |
| `workspaceOutcome` | Isolated adapter outcome metadata |
| `verificationObservation` | Command-execution HOLD observation |
| `validation` | Independent revalidation result when available |
| `metadata` | Hard-false authorization flags |

`metadata` always sets:

```text
independentVerificationComplete = false
publicationAuthorized = false
readyAuthorized = false
mergeAuthorized = false
githubMutationAuthorized = false
commandExecutionImplemented = false
providerIntegration = HOLD
realWorkspaceExecutionImplemented = false
```

---

## 5. State mapping

| Condition | Status |
|---|---|
| Orchestrator `HOLD` | `HOLD` |
| Orchestrator `REJECT` | `REJECT` |
| Orchestrator `UNKNOWN` | `UNKNOWN` |
| `DISPATCH_ELIGIBLE` + null task | `REJECT` |
| `DISPATCH_ELIGIBLE` + inconsistent metadata | `REJECT` |
| Task structural reparse failure | `REJECT` |
| Task semantic validation failure | `REJECT` |
| `validation.taskId` / orchestrator taskId binding mismatch | `REJECT` |
| `workspace.repository !== task.repository` | `HOLD` |
| `workspace.baseRevision !== task.baseRevision` | `HOLD` |
| `riskClass` ∈ {R2, R3, R4, R5} | `HOLD` |
| Unsupported capability (incl. `workspace.write.v1`, `command.execute.v1`) | `HOLD` |
| Adapter prepare/execute/collect error | `FAILED` |
| Adapter timeout | `FAILED` |
| Changed path outside `allowedPaths` | `FAILED` |
| Changed path in `forbiddenPaths` | `FAILED` |
| Unsafe path (`../`, absolute, `\`, malformed) | `REJECT` |
| Symlink write attempted | `REJECT` |
| Valid R0/R1 + supported caps + exact binding + path policy PASS | `COMPLETED` |

No silent repair of inconsistent upstream state.
No fetch-latest-main / rebase / base substitution.

---

## 6. Execution policy V1

| Risk | Policy |
|---|---|
| R0 | Supported as read-only isolated observation via fake adapter |
| R1 | Supported as isolated workspace code/test activity via fake adapter |
| R2 | `HOLD` |
| R3 | `HOLD` |
| R4 | `HOLD` |
| R5 | `HOLD` |

No automatic escalation.

---

## 7. Capability policy

Runner allowlist (inspect-only; empty allowlist OK / default-deny):

```text
workspace.read.v1
```

**HOLD (not added in this slice):**

```text
workspace.write.v1
command.execute.v1
```

Rationale: adding write/command capabilities would be a material authority
expansion relative to MIN-ORCHESTRATOR-V1's allowlist and would require
coordinated upstream stage changes. The fake adapter records deterministic
isolated outcomes without requiring those capabilities.

**Never added:**

```text
agent.execute
repo.write (generic)
github.* mutation
generic shell
Action Gateway generic execution
```

---

## 8. Adapter contract

```text
AgentRunnerAdapterV1
  prepareWorkspace()
  executeTask()
  collectOutcome()
  cleanupWorkspace()
```

Requirements:

- Domain runner decides whether the adapter may be invoked
- Adapter does **not** decide task authority
- Cleanup is always represented explicitly
- Adapter failures map deterministically to `FAILED` / timeout
- Core tests use `createFakeAgentRunnerAdapterV1()` (no network / secrets / GitHub)

Provider integration (Codex / Cursor remote) = **HOLD**.

---

## 9. Path enforcement

Before accepting `COMPLETED`:

```text
all changedPaths ⊆ allowedPaths
all changedPaths ∩ forbiddenPaths = ∅
```

`forbiddenPaths` always wins.

Fail closed for:

```text
../ traversal
absolute paths
backslash separator bypass
empty / malformed paths
path normalization ambiguity
symlink-based writes (rejected entirely in V1)
```

Unsafe paths are not silently normalized into allowed ones.

---

## 10. Command policy

```text
COMMAND EXECUTION = HOLD
```

`verificationCommands` are **not** executed. Issue prose cannot become a
command. No `gh` / git publication / deploy / secret / production curl.

---

## 11. Artifacts

| Artifact | Path |
|---|---|
| Spec | `docs/agent-runner/agent-runner-v1.md` |
| Domain runner | `src/domain/agentRunner.ts` |
| Adapter | `src/domain/agentRunnerAdapter.ts` |
| Tests | `test/agentRunner.test.ts` |

---

## 12. Explicit NOT IMPLEMENTED

```text
INDEPENDENT-VERIFY-V1
Real Codex / Cursor remote provider execution
Real filesystem workspace execution
verificationCommands shell execution
workspace.write.v1 capability authorization
command.execute.v1 capability authorization
GitHub branch / commit / push / Draft PR (product capability)
Ready automation
Merge automation
Issue close automation
deploy / production mutation
secret provisioning
permission / token expansion
Action Gateway execution surface expansion
```

---

## 13. Delivery gate

```text
Implementation
→ npm run verify
→ Draft PR
→ Fresh Review
→ STOP
```

Do not Ready. Do not Merge. Do not close Issue #49 in the implementation run.
Do not start INDEPENDENT-VERIFY-V1.
