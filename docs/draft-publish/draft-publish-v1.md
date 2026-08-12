# DRAFT-PUBLISH-V1

**Status: IMPLEMENTED (contract + deterministic publication policy + fake/in-memory adapter) · REAL GITHUB PUBLICATION = HOLD · NO READY/MERGE/ISSUE-CLOSE/DEPLOY**

Smallest bounded Draft publication layer that consumes an
`IndependentVerifyResultV1` plus an exact `AgentTaskV1` and deterministically
decides whether **one** Draft PR publication attempt is eligible.

```text
BOUNDED DRAFT PUBLICATION CONTRACT
FAKE / IN-MEMORY ADAPTER ONLY
REAL GITHUB PUBLICATION = HOLD
READY / MERGE / ISSUE CLOSE / DEPLOY = NOT IMPLEMENTED
```

Baseline:

```text
main = be468cdcf7c1fbc17488461083d57afe783506d4
AGENT-TASK-CONTRACT-V1 = COMPLETE
AGENT-TASK-BUILDER-V1 = COMPLETE
MIN-ORCHESTRATOR-V1 = COMPLETE
AGENT-RUNNER-V1 = COMPLETE
INDEPENDENT-VERIFY-V1 = COMPLETE (PR #52 / Issue #51)
Issue #53 = OPEN (this publisher)
```

---

## 1. Purpose

```text
Human selects an Issue
→ Control Center builds AgentTaskV1 automatically
→ Orchestrator decides dispatch eligibility
→ Agent executes in an isolated runner
→ independent verification
→ Draft PR publication                              ← this slice
→ STOP for Human review
```

Core rules:

```text
VERIFIED = necessary but not publication authority
PUBLISHED_DRAFT ≠ Ready
PUBLISHED_DRAFT ≠ Merge
PUBLISHED_DRAFT ≠ Issue Close
PUBLISHED_DRAFT ≠ Deploy
PUBLISHED_DRAFT (V1) ≠ real GitHub Draft PR creation
```

V1 `PUBLISHED_DRAFT` means: deterministic **fake/local** publication simulation
for the exact bound task. It does **not** imply an actual GitHub Draft PR.

---

## 2. Source of truth

Upstream contracts remain authoritative and are not weakened:

```text
AgentTaskV1
AgentRunnerResultV1
IndependentVerifyResultV1
parseAgentTaskV1()
validateAgentTaskV1()
verifyAgentRunnerResultV1()
evaluateChangedPathsPolicy()
```

---

## 3. Input

`DraftPublishInputV1` (unknown root keys → `REJECT`):

| Field | Role |
|---|---|
| `verifiedResult` | Untrusted `IndependentVerifyResultV1` evidence |
| `expectedTask` | Exact `AgentTaskV1` to re-bind and revalidate |
| `publicationAttemptId` | Bounded idempotency / attempt id |
| `observedAt` | Observation timestamp |
| `sourceArtifact` | `{ repository, baseRevision, baseBranch, headRevision, branchName, changedPaths }` |
| `proposedDraftPr` | `{ title, body, baseBranch, headBranch, draft }` |

Natural-language notes are never authority.

`proposedDraftPr.draft` must be **exactly** `true`.

Branch identity binding (required):

```text
proposedDraftPr.headBranch === sourceArtifact.branchName
proposedDraftPr.baseBranch === sourceArtifact.baseBranch
```

Adapter evidence is untrusted and revalidated before `PUBLISHED_DRAFT`.
Each phase `ok=true` payload is also revalidated, then evidence must match
those phase payloads exactly:

```text
prepareBranch.branchPrepared === true
writeVerifiedChanges.verifiedPathsWritten == exact set sourceArtifact.changedPaths
createCommit.commitCreated === true
createCommit.headRevision === sourceArtifact.headRevision
publishDraftPr.draft === true
publishDraftPr.draftPrNumber = valid positive integer
publishDraftPr.draftPrUrl = non-empty bounded string

evidence.observedBaseRevision === expectedTask.baseRevision
evidence.branchPrepared === prepareBranch.branchPrepared
evidence.verifiedPathsWritten === writeVerifiedChanges.verifiedPathsWritten
evidence.commitCreated === createCommit.commitCreated
evidence.headRevision === createCommit.headRevision
evidence.draftPrNumber === publishDraftPr.draftPrNumber
evidence.draftPrUrl === publishDraftPr.draftPrUrl
evidence.draft === publishDraftPr.draft
```
Verifier metadata requires exact `false` for:

```text
publicationAuthorized
readyAuthorized
mergeAuthorized
githubMutationAuthorized
deployAuthorized
```
---

## 4. Output

`DraftPublishResultV1`:

| Field | Meaning |
|---|---|
| `status` | `PUBLISHED_DRAFT` \| `HOLD` \| `REJECT` \| `FAILED` \| `UNKNOWN` |
| `reasonCode` | Machine-stable code |
| `reasonMessage` | Human-readable summary |
| `publicationAttemptId` | Echo of attempt id |
| `taskId` / `repository` / `baseRevision` | Bound identity |
| `headRevision` / `branchName` | Source artifact identity when available |
| `draftPrNumber` / `draftPrUrl` | Fake/local publication identity when published |
| `publicationEvidence` | Adapter evidence |
| `taskValidation` | Independent expectedTask revalidation when available |
| `metadata` | Hard-false authorization flags |

`metadata` always sets:

```text
readyAuthorized = false
mergeAuthorized = false
issueCloseAuthorized = false
deployAuthorized = false
productionMutationAuthorized = false
realGithubPublicationImplemented = false
githubMutationPerformed = false
providerIntegration = HOLD
publishedMeansFakeLocalSimulationOnly = true
```

---

## 5. Capability / risk / stopAt policy

| Gate | Requirement |
|---|---|
| Capability | exact `github.draft-pr.publish.v1` present in `allowedCapabilities` |
| Risk | exact `R2` |
| stopAt | exact `DRAFT_PR` |

```text
missing capability → HOLD
R0 / R1 / R3 / R4 / R5 → HOLD
TASK_BUILT / AGENT_COMPLETE / VERIFY_COMPLETE → HOLD
unknown/future stopAt → HOLD
```

No silent capability insertion. No silent R1→R2 upgrade. No stopAt rewrite.

Capability id grammar was extended minimally to allow hyphenated segments
(e.g. `draft-pr`) so this narrow capability remains expressible without adding
generic `github.write` / `repo.write`.

---

## 6. State mapping

| Condition | Status |
|---|---|
| Verifier `HOLD` / `REJECT` / `FAILED` / `UNKNOWN` | same status |
| Foreign verifier schema/version | `REJECT` |
| `VERIFIED` + exact identity + R2 + capability + `DRAFT_PR` + draft=true + base exact + adapter success | `PUBLISHED_DRAFT` |
| taskId mismatch | `REJECT` |
| repository mismatch | `HOLD` |
| baseRevision mismatch | `HOLD` |
| path set mismatch / unsafe / forbidden / duplicate | `REJECT` / `FAILED` |
| missing capability | `HOLD` |
| wrong risk / early stopAt | `HOLD` |
| observed base moved | `HOLD_BASE_MOVED` |
| same attempt + same fingerprint | deterministic replay |
| same attempt + different fingerprint | `REJECT_IDEMPOTENCY_CONFLICT` |
| draft ≠ true (proposed or evidence) | `REJECT` |
| adapter failure / timeout / cleanup | `FAILED` |

No upstream non-VERIFIED state may become `PUBLISHED_DRAFT`.

---

## 7. Verifier metadata boundary

```text
verifiedResult.metadata.publicationAuthorized === false
```

is **expected**. The independent verifier never grants publication authority.
Publication eligibility comes only from DRAFT-PUBLISH-V1 policy.

However, contradictory upstream claims fail closed:

```text
readyAuthorized = true → REJECT
mergeAuthorized = true → REJECT
githubMutationAuthorized = true → REJECT
deployAuthorized = true → REJECT
```

---

## 8. Path binding

Require exact set equality (normalized deterministic sets) between:

```text
verifiedResult.verifiedChangedPaths
sourceArtifact.changedPaths
```

Every path must independently pass `evaluateChangedPathsPolicy()`.
`forbiddenPaths` always wins. Do not silently accept the smaller set.

---

## 9. Idempotency

`publicationAttemptId` is required and bounded.

Fingerprint covers at least:

```text
taskId
repository
baseRevision
source headRevision
source branchName
source baseBranch
source changedPaths
proposed Draft PR metadata (title/body/baseBranch/headBranch/draft)
```

| Case | Behavior |
|---|---|
| same attemptId + same fingerprint | return/reconcile same publication (`replayed=true`) |
| same attemptId + different fingerprint | `REJECT_IDEMPOTENCY_CONFLICT` |
| new attemptId | independently evaluated |

Do not use PR title alone as idempotency identity.

---

## 10. Adapter contract

```text
DraftPublishAdapterV1
  observeBase()
  prepareBranch()
  writeVerifiedChanges()
  createCommit()
  publishDraftPr()
  collectPublicationEvidence()
  cleanup()
```

Fake/in-memory only in V1. Adapter does not decide authority.
`observeBase` must report exact `expectedTask.baseRevision` or domain returns
`HOLD_BASE_MOVED`.

---

## 11. Real GitHub publication

```text
REAL GITHUB PUBLICATION = HOLD
```

No branch create/push, no real Draft PR, no token expansion, no Action Gateway
mutation expansion in this slice.

---

## 12. Artifacts

| Artifact | Path |
|---|---|
| Spec | `docs/draft-publish/draft-publish-v1.md` |
| Domain publisher | `src/domain/draftPublish.ts` |
| Adapter | `src/domain/draftPublishAdapter.ts` |
| Tests | `test/draftPublish.test.ts` |

Capability grammar support (hyphenated segments):

```text
src/domain/agentTaskContract.ts
docs/agent-task/schemas/agent-task-v1.schema.json
```

---

## 13. Explicit NOT IMPLEMENTED

```text
REAL GITHUB PUBLICATION
Ready automation
Merge automation
Issue close automation
PR approval/review automation
deployment / production mutation
secret provisioning
permission / token expansion
generic github.write / repo.write
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

Do not Ready. Do not Merge. Do not close Issue #53 in the implementation run.
Do not start NO-PROMPT-PILOT-V1.
