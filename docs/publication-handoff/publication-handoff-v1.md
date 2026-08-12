# RUNNER-PUBLISH-HANDOFF-V1

**Status: IMPLEMENTED · FAKE/LOCAL ONLY · REAL PROVIDER = HOLD · REAL GITHUB PUBLICATION = HOLD**

Explicit execution → publication authority transition. Resolves the
`RUNNER_PUBLISHER_AUTHORITY_INCOMPATIBLE` blocker discovered by
NO-PROMPT-PILOT-V1 **without** widening AGENT-RUNNER-V1 into R2 / GitHub
publication authority.

```text
ExecutionTask (R0/R1 + workspace.read.v1)
→ Runner
→ IndependentVerifyResultV1 = VERIFIED
→ PublicationHandoffV1
→ PublicationTask (R2 + github.draft-pr.publish.v1 + DRAFT_PR)
→ DRAFT-PUBLISH-V1 (future / follow-up pilot)
```

Baseline:

```text
main = 1a494780ffb92bc6b1e27c99fbb24b39dfc1af75
NO-PROMPT-PILOT-V1 = COMPLETE (PR #56 / Issue #55)
Issue #57 = OPEN (this slice)
```

---

## 1. Core rule

Do **not** mutate the original execution `AgentTaskV1`.

Forbidden:

```text
executionTask.riskClass = R2
executionTask.allowedCapabilities += github.draft-pr.publish.v1
executionTask.stopAt rewrite
generic github.write / repo.write / github.*
Action Gateway broadening
AGENT-RUNNER-V1 accepting R2 publication
```

Publication authority lives only in a **distinct** publication-scoped task.

---

## 2. Input (fail closed)

`PublicationHandoffInputV1` requires explicit:

```text
handoffId
sourceExecutionTask
independentVerifyResult
requestedPublicationCapability = github.draft-pr.publish.v1
requestedRiskClass = R2
requestedStopAt = DRAFT_PR
observedAt
```

Missing / undefined / wrong type → REJECT (never defaulted).

---

## 3. Eligibility

READY_FOR_PUBLICATION_TASK only when:

1. `independentVerifyResult.status === VERIFIED`
2. source execution task reparses + revalidates VALID
3. exact identity: taskId / repository / baseRevision
4. `verifiedChangedPaths` present, non-empty, duplicate-free, safe, within
   source allowedPaths, not forbidden
5. verifier auth flags exactly `false` (publication/ready/merge/githubMutation/deploy)
6. evidence: networkAccess / secretsRequired / githubMutationPerformed /
   productionMutationPerformed exactly `false`
7. requested publication authority exactly matches required constants
8. publication task validates as AgentTaskV1 VALID
9. publication taskId ≠ source taskId
10. publication `allowedPaths` exact set equals `verifiedChangedPaths`
11. publication capabilities exact set `["github.draft-pr.publish.v1"]`

Non-VERIFIED verifier statuses propagate: HOLD / REJECT / FAILED / UNKNOWN.

---

## 4. Publication task

Distinct `AgentTaskV1`:

| Field | Value |
|---|---|
| taskId | deterministic from handoff seed (≠ source) |
| repository / baseRevision / sourceIssue | exact copy from source |
| allowedPaths | exact `verifiedChangedPaths` |
| forbiddenPaths | source forbidden scope preserved |
| allowedCapabilities | `["github.draft-pr.publish.v1"]` only |
| riskClass | `R2` |
| stopAt | `DRAFT_PR` |

No `workspace.read.v1`. Provenance (`handoffId`, `sourceExecutionTaskId`,
`verificationAttemptId`) stays on the handoff / result — not abused into
unrelated AgentTask fields.

---

## 5. Idempotency / fingerprint

Authority fingerprint (no `observedAt`):

```text
handoffId, sourceExecutionTaskId, sourceIssue, repository, baseRevision,
verifiedChangedPaths (stable order), verificationAttemptId,
requestedPublicationCapability, requestedRiskClass, requestedStopAt
```

```text
same handoffId + same fingerprint → deterministic replay
same handoffId + different fingerprint → REJECT_HANDOFF_IDEMPOTENCY_CONFLICT
```

Registry is injected/local only. No external persistence in V1.

---

## 6. Authorization flags

Always false on every result:

```text
readyAuthorized
mergeAuthorized
issueCloseAuthorized
deployAuthorized
productionMutationAuthorized
realAgentProviderExecution
realGithubPublication
githubMutationPerformed
```

This slice never authorizes GitHub mutation.

---

## 7. Runner / publisher boundaries

```text
AGENT_RUNNER_SUPPORTED_RISK_CLASSES = {R0, R1}  — unchanged
AGENT_RUNNER_SUPPORTED_CAPABILITIES = {workspace.read.v1}  — unchanged
```

Do **not** call `runAgentTaskV1(publicationTask)`.

DRAFT-PUBLISH-V1 eligibility constants are satisfied by the publication task
shape; DRAFT-PUBLISH semantics are not altered. NO-PROMPT-PILOT-V1 is not
updated to PASS in this slice.

---

## 8. Artifacts

| Artifact | Path |
|---|---|
| Spec | `docs/publication-handoff/publication-handoff-v1.md` |
| Domain | `src/domain/publicationHandoff.ts` |
| Tests | `test/publicationHandoff.test.ts` |

---

## 9. Delivery gate

```text
Implementation → npm run verify → Draft PR → Fresh Review → STOP
```

Do not Ready / Merge / close Issue #57 / run follow-up pilot / enable real
provider or GitHub publication.
