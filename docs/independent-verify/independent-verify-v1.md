# INDEPENDENT-VERIFY-V1

**Status: IMPLEMENTED (contract + deterministic verifier + fake/in-memory adapter) · REAL COMMAND VERIFICATION = HOLD · NO GITHUB PUBLICATION**

Smallest independent verification layer that consumes an `AgentRunnerResultV1`
and deterministically decides whether that runner outcome is independently
**VERIFIED**.

```text
INDEPENDENT VERIFICATION CONTRACT
FAKE / IN-MEMORY ADAPTER ONLY
REAL COMMAND VERIFICATION = HOLD
GITHUB PUBLICATION = NOT IMPLEMENTED
READY / MERGE / DEPLOY = NOT IMPLEMENTED
```

Baseline:

```text
main = 936c667fcc4f1e9accc86677d321e02881c4059e
AGENT-TASK-CONTRACT-V1 = COMPLETE (PR #44 / Issue #43)
AGENT-TASK-BUILDER-V1 = COMPLETE (PR #46 / Issue #45)
MIN-ORCHESTRATOR-V1 = COMPLETE (PR #48 / Issue #47)
AGENT-RUNNER-V1 = COMPLETE (PR #50 / Issue #49)
Issue #51 = OPEN (this verifier)
```

---

## 1. Purpose

```text
Human selects an Issue
→ Control Center builds AgentTaskV1 automatically
→ Orchestrator decides dispatch eligibility
→ Agent executes in an isolated runner
→ independent verification                            ← this slice
→ Draft PR                                           (future — NOT IMPLEMENTED)
→ STOP for Human review
```

Core rules:

```text
Runner COMPLETED = evidence only
Runner COMPLETED ≠ verification authority
VERIFIED ≠ publication authorization
VERIFIED ≠ Ready authorization
VERIFIED ≠ Merge authorization
VERIFIED ≠ GitHub mutation authorization
VERIFIED ≠ deploy authorization
VERIFIED (V1) ≠ real CI or shell verification
```

V1 `VERIFIED` means: deterministic verification of supplied **fake/local**
independent evidence for the exact bound task. It does **not** imply real
command execution happened.

---

## 2. Source of truth

Upstream contracts remain authoritative and are not weakened:

```text
src/domain/agentTaskContract.ts
src/domain/agentTaskBuilder.ts
src/domain/minOrchestrator.ts
src/domain/agentRunner.ts
src/domain/agentRunnerAdapter.ts
AgentTaskV1
AgentTaskValidationResultV1
AgentRunnerResultV1
parseAgentTaskV1()
validateAgentTaskV1()
evaluateChangedPathsPolicy()
runAgentTaskV1()
```

---

## 3. Input

`IndependentVerifyInputV1` (unknown root keys → `REJECT`):

| Field | Role |
|---|---|
| `runnerResult` | Untrusted `AgentRunnerResultV1` evidence |
| `expectedTask` | Exact `AgentTaskV1` to re-bind and revalidate |
| `verificationAttemptId` | Deterministic correlation id for this verify attempt |
| `observedAt` | Observation timestamp |

Natural-language notes are never authority.

---

## 4. Output

`IndependentVerifyResultV1`:

| Field | Meaning |
|---|---|
| `status` | `VERIFIED` \| `HOLD` \| `REJECT` \| `FAILED` \| `UNKNOWN` |
| `reasonCode` | Machine-stable code |
| `reasonMessage` | Human-readable summary |
| `verificationAttemptId` | Echo of attempt id |
| `taskId` / `repository` / `baseRevision` | Bound identity (nullable on early reject) |
| `verifiedChangedPaths` | Paths accepted after independent recheck |
| `verificationEvidence` | Adapter evidence (fake/local; commands not executed) |
| `taskValidation` | Independent expectedTask revalidation when available |
| `metadata` | Hard-false authorization flags |

`metadata` always sets:

```text
publicationAuthorized = false
readyAuthorized = false
mergeAuthorized = false
githubMutationAuthorized = false
deployAuthorized = false
commandExecutionImplemented = false
realCommandVerificationImplemented = false
providerIntegration = HOLD
verifiedMeansFakeLocalEvidenceOnly = true
```

---

## 5. State mapping

| Condition | Status |
|---|---|
| Runner `HOLD` | `HOLD` |
| Runner `REJECT` | `REJECT` |
| Runner `FAILED` | `FAILED` |
| Runner `UNKNOWN` | `UNKNOWN` |
| Malformed runner `schemaVersion` / `runnerVersion` / `status` | `REJECT` |
| `expectedTask` null / structural failure | `REJECT` |
| `expectedTask` semantic invalid | `REJECT` |
| `COMPLETED` + `taskId` mismatch | `REJECT` |
| `COMPLETED` + repository mismatch | `HOLD` |
| `COMPLETED` + baseRevision mismatch | `HOLD` |
| Runner validation schema / taskId / status ≠ VALID | `REJECT` |
| `executionInvoked=false` / `cleanupCompleted=false` | `REJECT` |
| Runner self-claims `independentVerificationComplete=true` | `REJECT` |
| Runner claims publication / Ready / Merge / GitHub auth | `REJECT` |
| `workspaceOutcome` present but missing / non-false network/secrets/GitHub/production flags | `REJECT` |
| `workspaceOutcome` present but `isolated !== true` | `REJECT` |
| `workspaceOutcome === null` | allowed (explicit no-outcome representation) |
| `workspaceOutcome` missing / `undefined` | `REJECT` |
| Unsafe / out-of-scope / forbidden changed path | `REJECT` / `FAILED` |
| Independent evidence path set mismatch | `REJECT` (`REJECT_EVIDENCE_CHANGED_PATH_MISMATCH`) |
| Duplicate path evidence | `REJECT` (`REJECT_CHANGED_PATH_DUPLICATE`) |
| Adapter observe / verify / timeout / collect / cleanup failure | `FAILED` |
| `COMPLETED` + exact binding + path policy PASS + evidence PASS | `VERIFIED` |

No upstream failure may be promoted to `VERIFIED`.
No silent repair.
No fetch-latest-main / rebase / base substitution.

---

## 6. Runner result is untrusted

Do not trust as authoritative merely because they came from AGENT-RUNNER-V1:

```text
runnerResult.status
runnerResult.changedPaths
runnerResult.validation
runnerResult.workspaceOutcome
runnerResult.verificationObservation
runnerResult.metadata
```

Re-bind identity and re-check evidence independently.

Only runner `COMPLETED` may enter the `VERIFIED` evaluation path.
Before that path: exact `schemaVersion` + `runnerVersion` + supported `status`.

---

## 7. Expected task revalidation

Before evaluating runner success:

```text
1. require expectedTask non-null
2. parseAgentTaskV1(expectedTask)
3. validateAgentTaskV1(expectedTask)
4. require validation.status === VALID
5. require validation.taskId === expectedTask.taskId
```

Do not repair invalid task state.
Do not widen `riskClass` / `stopAt` / `allowedCapabilities` / path lists.

---

## 8. Identity binding

Exact equality required:

```text
runnerResult.taskId === expectedTask.taskId
runnerResult.repository === expectedTask.repository
runnerResult.baseRevision === expectedTask.baseRevision
```

| Mismatch | Outcome |
|---|---|
| `taskId` | `REJECT` |
| `repository` | `HOLD` |
| `baseRevision` | `HOLD` |

---

## 9. Path enforcement

Independently re-evaluate `runnerResult.changedPaths` against `expectedTask`
via `evaluateChangedPathsPolicy()` (canonical path semantics).

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
normalization ambiguity
duplicate path evidence
out-of-scope path
forbidden path
```

Independent adapter must report its own `observedChangedPaths`.
Require **exact set equality** (normalized deterministic sets) between:

```text
runnerResult.changedPaths
independentEvidence.observedChangedPaths
```

Ordering differences alone are OK.
Mismatch (runner extra path, verifier extra path, or unequal sets) →
`REJECT_EVIDENCE_CHANGED_PATH_MISMATCH`.
Do not silently accept the smaller set.

---

## 10. Adapter contract

```text
IndependentVerifyAdapterV1
  observeWorkspace()
  runVerification()
  collectEvidence()
  cleanup()
```

Requirements:

- Verifier remains testable without GitHub / Codex / Cursor / network
- Fake/in-memory adapter is sufficient for V1
- Adapter does **not** decide authority
- Adapter must **not** trust runner `changedPaths` as independent observation
- Verifier decides whether evidence can produce `VERIFIED`
- Cleanup outcome is represented explicitly

Adapter failure / timeout → `FAILED` (never `VERIFIED`).

---

## 11. Verification evidence (V1)

Because real command execution remains HOLD:

```text
adapterKind
observedChangedPaths
commandExecutionImplemented = false
commandsExecuted = []
networkAccess = false
secretsRequired = false
githubMutationPerformed = false
productionMutationPerformed = false
evidencePassed = boolean
notes
```

```text
REAL COMMAND VERIFICATION = HOLD
```

`verificationCommands` are **not** executed.
Issue prose cannot become a command.
No `gh` / git publication / deploy / secret / production mutation.

---

## 12. Artifacts

| Artifact | Path |
|---|---|
| Spec | `docs/independent-verify/independent-verify-v1.md` |
| Domain verifier | `src/domain/independentVerify.ts` |
| Adapter | `src/domain/independentVerifyAdapter.ts` |
| Tests | `test/independentVerify.test.ts` |

---

## 13. Explicit NOT IMPLEMENTED

```text
REAL COMMAND VERIFICATION (shell / CI execution of verificationCommands)
DRAFT-PUBLISH-V1
product branch creation / commit / push
Draft PR creation as product capability
GitHub review mutation
Ready automation
Merge automation
Issue close automation
deploy / production mutation
secret provisioning
permission / token expansion
Action Gateway execution surface expansion
Real Codex / Cursor provider execution
NO-PROMPT-PILOT-V1
```

---

## 14. Delivery gate

```text
Implementation
→ npm run verify
→ Draft PR
→ Fresh Review
→ STOP
```

Do not Ready. Do not Merge. Do not close Issue #51 in the implementation run.
Do not start DRAFT-PUBLISH-V1.
