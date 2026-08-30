# MULTI-AGENT-COORDINATION-V1

**Status: DESIGNED · DEFINITION CORRECTION-1 APPLIED · NO IMPLEMENTATION · NO PROVIDER INVOCATION · NO HARNESS INVOCATION · NO GITHUB MUTATION**

This document is the Definition Correction-1 record for Issue
[#111](https://github.com/yasutakesougo/ai-development-control-center/issues/111).

It does not authorize implementation, provider invocation, harness invocation,
GitHub mutation, Ready, Merge, or Deploy.

```text
CONTRACT / DEFINITION ONLY
IMPLEMENTATION = NOT AUTHORIZED
REAL MULTI-WORKER EXECUTION = HOLD
PROVIDER / HARNESS INVOCATION = NOT AUTHORIZED
EXTERNAL MUTATION = NOT AUTHORIZED
READY / MERGE / DEPLOY = NOT AUTHORIZED
DEFINITION LOCK = NOT AUTHORIZED
```

## Phase

Definition

## Status

DRAFT — DEFINITION CORRECTION-1 APPLIED / READY FOR INDEPENDENT DEFINITION RE-REVIEW-1

```text
Definition Correction-1: APPLIED
Definition Lock: NOT AUTHORIZED
Implementation Start: NOT AUTHORIZED
Real multi-worker execution: HOLD
Provider / Harness invocation: NOT AUTHORIZED
External mutation: NOT AUTHORIZED
```

## Baseline

Observed `main` at Definition start (unchanged by this Correction):

```text
c15dbd60fe51bcb894dc555fee5defb859d3df5f
```

Existing consumed contracts remain authoritative for their own locked or
implemented domains:

```text
AgentTaskV1
AI-WORKER-REGISTRY-V1 (#87)
WORKER-ROUTING-V1 (#91)
AGENT-RUNNER-V1
ACTION-GATEWAY-V1
```

Related but not treated as canonical locked dependencies of this Definition:

```text
RESOURCE-LOCK-V1 (#69) — consumed for parallel-safety evidence when available
DEPENDENCY-GRAPH-V1 (#68) — remains Issue/repository dependency authority
TOOL-EXECUTION-RELIABILITY-V1 (#110) — unlocked / not canonical here
EXECUTION-AUTHORIZATION-V1 (#108) — unlocked / not canonical here
MUNDER-DIFFLIN-MULTI-WORKER-PILOT-V1 (#103) — future harness consumer
```

Correction-1 (C1-5) forbids treating unlocked upstream Definitions as canonical:

```text
#111 Definition Lock != #108 Lock
#111 Definition Lock != #110 Lock
```

#111 depends on this abstract boundary:

```text
owning execution authorization / policy surface
```

The Coordination Plane consumes that surface's decisions. It does not redefine
them. Implementation or #103 harness integration may bind to #108 / #110
concrete types only after those contracts are independently LOCKED.

## Source Review

Independent Definition Review-1

```text
Verdict: CORRECTION REQUIRED
P0: 0
P1: 5
P2: 3
Definition Lock: HOLD
Implementation Start: NOT AUTHORIZED
Real multi-worker execution: HOLD
```

## Correction Objective

Keep the Coordination Plane's no-Authority-widening principle, and lock the
remaining machine-decision boundaries so implementers do not have to invent
them.

This Correction does not authorize implementation, provider invocation, GitHub
mutation, Ready, Merge, or Deploy.

```text
Implementation mutation: NONE
```

Mapping:

```text
P1-1 → C1-1 Child Task Authority Model
P1-2 → C1-2 Execution State Separation
P1-3 → C1-3 Dependency Graph Semantics
P1-4 → C1-4 CoordinationPlanV1 Identity
P1-5 → C1-5 Upstream Governance Dependency
P2-1 → C1-6 Shared-State Write Ownership
P2-2 → C1-7 Canonical taskRoutingFingerprint Reuse
P2-3 → C1-8 Conflict / Cancellation / Concurrency Ownership
```

## Objective

Define a vendor-neutral Coordination Plane for multiple AI workers without
creating a second Authority source.

The Coordination Plane may order already-established tasks, request worker
selection, combine evidence, and stop or hold work.

V1 does **not** perform Authority-bearing task decomposition inside the
Coordination Plane.

It must never inherit, create, transfer, or widen task/worker execution
Authority.

```text
Human / Project intent
        ↓
subtask proposal (Coordinator / Worker)
        ↓
canonical AgentTask authoring / validation path
        ↓
independent AgentTaskV1
        ↓
Coordination Plan (provenance / dependency only)
        ↓
WORKER-ROUTING-V1 per unit
        ↓
owning execution authorization / policy surface / Human Gate per attempt
        ↓
Runner / Action Gateway
        ↓
canonical execution outcome + result validation + evidence
        ↓
Coordination reconciliation
```

## Core separation

```text
Coordination != Authority
Delegation != Authority transfer
Task decomposition != capability expansion
parent Authority != child Authority
Worker message != approval
Shared state != Authority
Consensus != Human GO
Majority vote != authorization
Routing SELECTED != dispatch
Parallel-safe != execution-authorized
Successful child result != parent completion
policy DENY != execution FAILED
Human Gate waiting != execution FAILED
EXECUTION_UNKNOWN != FAILED
execution success != automatic coordination SUCCEEDED
taskRoutingFingerprint != Authority
cancellation != retry authorization
```

The Control Center remains the authority choke point between every executable
unit and every worker execution attempt.

## V1 design choice

V1 adopts:

```text
Orchestrator / Coordinator
+ bounded specialist workers
+ deterministic contracts
+ explicit shared state
+ fail-closed parallelism
+ independently established child tasks only
```

V1 does not adopt unrestricted peer-to-peer authority delegation.

V1 does not adopt Coordination-owned Authority-bearing decomposition.

Workers may propose follow-up work to the Coordinator.

A worker must never directly authorize another worker to execute.

A proposal must never become an executable child by parent inference.

---

## C1-1 / 1. Child Task Authority Model

V1 chooses Review-1 option **A**.

The Coordination Plane itself does not perform Authority-bearing task
decomposition.

```text
Coordinator / Worker
        ↓
subtask proposal
        ↓
canonical AgentTask authoring / validation path
        ↓
independent AgentTaskV1
        ↓
WORKER-ROUTING-V1
```

Parent/child is provenance / dependency evidence only. It is not Authority
transfer.

```text
parent Authority
!=
child Authority
```

The following never generate child Authority:

```text
parent task existence
parent task success
parent worker identity
conversation history
proposal text
MCP / A2A message
harness configuration
prior coordination success
```

The Coordination Plane may reference an executable child only when that child
already exists as an independently established `AgentTaskV1` from the canonical
authoring / validation path.

Conceptual coordination reference:

```ts
type CoordinationTaskRefV1 = {
  taskId: string;
  taskRoutingFingerprint: string;
  dependencyTaskIds: string[];
  coordinationMode: "SEQUENTIAL" | "PARALLEL_ELIGIBLE";
};
```

Rules:

- `taskId` and `taskRoutingFingerprint` identify existing independently
  established task evidence.
- Coordination metadata may narrow ordering or concurrency only.
- Coordination metadata must never change `allowedCapabilities`, `riskClass`,
  `allowedPaths`, `forbiddenPaths`, repository identity, base revision, or
  Human Gate semantics.
- A child task proposed by a worker or Coordinator is only a proposal until the
  canonical AgentTask authoring / validation path independently establishes an
  executable `AgentTaskV1`.
- `valid AgentTaskV1` is not equivalent to `attenuated child of this parent`.
  V1 does not infer attenuation from a parent envelope.

## C1-7 — Canonical taskRoutingFingerprint reuse

`taskRoutingFingerprint` must be obtained from the existing Worker Routing
task-binding implementation. The Coordination Plane must not copy fingerprint
domain, hash facts, sorting, or normalization.

Reuse exactly:

```text
captureWorkerRoutingTaskBindingFacts()
computeWorkerRoutingTaskFingerprint()
domain = WORKER-ROUTING-TASK-BINDING-V1
canonicalJson() from src/domain/decisionFingerprint.ts
```

```text
taskRoutingFingerprint = binding evidence
taskRoutingFingerprint != Authority
```

If a Coordination Plan is created before routing selection, the plan still uses
`computeWorkerRoutingTaskFingerprint(task)` on the independently established
`AgentTaskV1`. It must not invent a second task-binding hash.

If the canonical task-binding helper cannot be used, that task reference is
**not executable-ready**.

Possession of the fingerprint remains binding evidence only and grants zero
Authority.

---

## C1-2 / 2. Execution State Separation

`CoordinationTaskResultV1` must not collapse policy decision, execution
outcome, and result validation into one `status`.

It must independently refer to at least:

```text
executionAuthorizationRef
executionAttemptId
executionOutcomeRef
resultValidationRef
coordinationProgressionStatus
```

Conceptual result:

```ts
type CoordinationTaskResultV1 = {
  taskId: string;
  workerId: string;
  routingDecisionFingerprint: string | null;
  executionAuthorizationRef: string | null;
  executionAttemptId: string | null;
  executionOutcomeRef: string | null;
  resultValidationRef: string | null;
  coordinationProgressionStatus: CoordinationProgressionStatusV1;
  evidenceRefs: string[];
  proposedFollowUpTaskRefs: string[];
};
```

Locked inequalities:

```text
policy DENY
!= execution FAILED

Human Gate waiting
!= execution FAILED

EXECUTION_UNKNOWN
!= FAILED

execution success
!= automatic coordination SUCCEEDED
```

Coordination `SUCCEEDED` may be derived only when the required canonical
execution and result-validation evidence has already been established by the
owning surfaces.

The Coordination Plane must not rewrite canonical execution outcomes.

Additional rules:

- Follow-up work remains proposal-only.
- A result from one worker grants zero Authority to another worker.
- `UNKNOWN` remains distinct from `FAILED`.
- Missing required refs fail closed: do not invent `SUCCEEDED`.

---

## 3. Delegation Rule

Direct authority delegation is prohibited in V1.

Forbidden model:

```text
Worker A
  ↓ "you may execute"
Worker B
```

Required model:

```text
Worker A
  ↓ proposal / evidence
Coordinator
  ↓ canonical AgentTask authoring / validation path
  ↓ independent AgentTaskV1
WORKER-ROUTING-V1
  ↓ selected worker evidence
owning execution authorization / policy surface / Human Gate
  ↓
Worker B
```

Invariant:

```text
Delegated authority = NONE
```

If a worker proposes a subtask, the subtask must independently establish:

```text
valid AgentTaskV1 from the canonical authoring / validation path
worker eligibility via WORKER-ROUTING-V1
current worker/registry binding
resource-conflict eligibility
execution authorization from the owning policy surface
Human Gate evidence when required by that surface
execution-surface eligibility
```

No parent task, parent worker, conversation history, tool result, MCP response,
A2A message, external harness configuration, or prior success may substitute
for those checks.

---

## C1-4 / 4. CoordinationPlanV1 Identity

Immutable admitted-plan identity:

```ts
type CoordinationPlanV1 = {
  schemaVersion: "MULTI-AGENT-COORDINATION-PLAN-V1";
  coordinationId: string;
  taskRefs: CoordinationTaskRefV1[];
};
```

Unknown keys fail closed.

Fingerprint domain:

```text
MULTI-AGENT-COORDINATION-PLAN-FINGERPRINT-V1
```

Fingerprint facts include at least:

```ts
type CoordinationPlanFingerprintTaskRefFactsV1 = {
  taskId: string;
  taskRoutingFingerprint: string;
  dependencyTaskIds: string[];
  coordinationMode: "SEQUENTIAL" | "PARALLEL_ELIGIBLE";
};

type CoordinationPlanFingerprintFactsV1 = {
  schemaVersion: "MULTI-AGENT-COORDINATION-PLAN-FINGERPRINT-V1";
  coordinationId: string;
  taskRefs: CoordinationPlanFingerprintTaskRefFactsV1[];
};
```

Canonical serialization reuses the repository's existing `canonicalJson`. A
second canonicalization algorithm is forbidden.

```text
canonicalJson(CoordinationPlanFingerprintFactsV1)
→ SHA-256
→ lowercase hexadecimal
→ 64 characters
```

Ordering rule:

```text
admitted taskRefs order is part of plan identity
no silent sort, rewrite, dedupe, or repair before hashing
duplicate taskId is invalid before fingerprinting
```

Mutation / version rule:

```text
admitted plan = immutable
plan change = new plan revision / new fingerprint
old-fingerprint execution evidence must not be reused on a new plan
```

---

## C1-3 / 5. Dependency Graph Semantics

`dependencyTaskIds` are **intra-coordination** dependencies only.

```text
DEPENDENCY-GRAPH-V1 (#68)
  = repository / Issue dependency authority

Coordination dependencyTaskIds
  = intra-plan child-task edges only
  = must not overwrite #68 readiness
```

A plan is invalid when any of the following is true:

```text
self dependency
missing dependency target
duplicate dependency id
dependency cycle
unknown task reference
```

Invalid plans are not executable-ready.

V1 dependency satisfaction:

```text
required dependency coordinationProgressionStatus == SUCCEEDED
  → dependency satisfied

FAILED
UNKNOWN
CANCELLED
HOLD
NOT_EXECUTED
  → dependency not satisfied
```

If dependency state cannot be determined safely, progression is
`WAITING_DEPENDENCY` or `HOLD`. It must not be promoted to `READY`.

---

## C1-6 / 6. Shared-State Write Ownership

V1 uses explicit shared state rather than an unrestricted shared conversation
transcript.

| Store | Owner / mutation | Immutability |
| --- | --- | --- |
| Coordination Plan | Coordinator-owned immutable admitted plan | admitted plan immutable; change = new fingerprint |
| Task Ledger | canonical task references only | Worker rewrite prohibited |
| Decision Ledger | owning policy / router decision references | Worker rewrite prohibited |
| Evidence Store | Worker / Coordinator may append attributable evidence | admitted evidence immutable |
| Worker Observation State | owning worker-observation contract | Coordination must not rewrite worker authority |
| Audit Ledger | append-only audit records | Authority generation prohibited |

Rules:

- Workers may append evidence / proposals.
- Workers cannot overwrite canonical Task, Decision, Authority, or Audit
  records.
- Only the Coordinator may admit a new Coordination Plan revision.
- Coordination progression changes are Coordinator-owned and must be
  reconstructable from audit/evidence.
- Free-form messages are not shared-state mutation commands.
- Proposal / evidence provenance must be preserved.
- One record domain must not silently overwrite another domain's canonical
  state.

---

## 7. Parallelism Rule

Parallel execution is opt-in and narrowing-only.

A task marked `PARALLEL_ELIGIBLE` is not automatically parallel-safe.

Concurrency ceiling is a reviewed policy input and must be supplied explicitly.

```text
missing concurrency ceiling
  → unbounded parallelism forbidden
  → concurrent dispatch HOLD
```

The Coordination Plane does not invent a default ceiling.

Before concurrent execution, each candidate lane must prove:

```text
independent task authority
independent worker/routing binding
independent execution authorization from the owning policy surface
RESOURCE-LOCK-V1 compatibility when that evidence is required
non-conflicting repository/path scope
explicit bounded concurrency ceiling
independent evidence stream
failure/cancellation isolation
```

Rules:

```text
resource conflict      → HOLD
conflict UNKNOWN       → HOLD
missing lock evidence  → HOLD
same task double-run   → HOLD unless a separate idempotent/retry contract proves safety
```

Git worktree isolation by itself is not sufficient evidence of semantic
parallel safety.

---

## C1-8 / 8. Conflict / Cancellation / Concurrency Ownership

The Coordination Plane does not invent Authority-conflict conclusions.

```text
owning policy DENY
  → preserve DENY
  → coordination progression stops / HOLD

owning policy HOLD
  → preserve HOLD

owning policy UNKNOWN
  → HOLD
```

The Coordinator must not choose `DENY` vs `HOLD` by discretion when an owning
policy already decided.

Conflict classes remain:

```text
EVIDENCE_CONFLICT
RESULT_CONFLICT
RESOURCE_CONFLICT
AUTHORITY_CONFLICT
POLICY_CONFLICT
UNKNOWN_CONFLICT
```

Default coordination progression:

```text
RESOURCE_CONFLICT  → HOLD
AUTHORITY_CONFLICT → preserve owning-policy DENY or HOLD; never re-decide
POLICY_CONFLICT    → HOLD
UNKNOWN_CONFLICT   → HOLD
EVIDENCE_CONFLICT  → HOLD; Coordinator may request independent review task
RESULT_CONFLICT    → HOLD; Coordinator may request independent review task
```

A reviewer may recommend a decision but cannot create execution Authority.

Human review is required where the existing Human Gate or governing policy
requires it.

### Cancellation

Cancellation is accepted only as a canonical cancellation request that names
the target coordination / task / lane.

A Worker message or proposal cannot cancel another worker's lane.

```text
cancellation != retry authorization
cancellation != new task authority
cancellation != authority transfer
```

Cancellation of one lane must not silently cancel or authorize another lane.

If a side effect may already have occurred, cancellation must preserve the
owning execution surface's `UNKNOWN` / reconciliation semantics.

No automatic retry is introduced by this Definition.

Stop conditions remain at least:

```text
required task DENY from owning policy
required task UNKNOWN without safe reconciliation
resource conflict
invalid/stale routing binding
changed worker/registry authority
Human Gate required and absent
execution surface unavailable
canonical cancellation request
coordination deadline/budget ceiling reached under owning policy
required evidence missing
invalid plan / unsatisfied dependency
missing concurrency ceiling for concurrent dispatch
```

---

## 9. Audit Evidence

Every coordination decision that changes task progression must be
reconstructable.

Minimum coordination audit facts:

```text
coordinationId
coordinationPlanFingerprint
parent/child provenance (not authority)
taskRoutingFingerprint
workerId
workerAuthorityFingerprint
routingDecisionFingerprint
resource-lock decision reference
executionAuthorizationRef
executionAttemptId when present
executionOutcomeRef
resultValidationRef
coordinationProgressionStatus
evidence refs
conflict/hold reason
cancellation target when present
createdAt / decidedAt
```

Audit requirements:

- task progression is reconstructable without relying on hidden model
  reasoning;
- worker-to-worker proposals are attributable;
- HOLD / DENY / cancellation paths remain visible;
- audit records cannot authorize new work;
- prior successful coordination does not authorize a new coordination run;
- old-plan fingerprint evidence cannot satisfy a new-plan fingerprint.

---

## Coordination decision vocabulary

Initial V1 lifecycle vocabulary (`coordinationProgressionStatus`):

```text
PLANNED
READY
RUNNING
WAITING_DEPENDENCY
WAITING_RESOURCE
WAITING_HUMAN_GATE
HOLD
SUCCEEDED
FAILED
UNKNOWN
CANCELLED
NOT_EXECUTED
```

These are Coordination Plane states only.

They must not replace canonical task validation, routing, policy,
execution-outcome, or result-validation vocabularies.

`SUCCEEDED` is derived only from required canonical execution/result evidence.
It is never a rewrite of those surfaces.

---

## Required invariants

- [ ] M1. Coordination never creates or widens Authority.
- [ ] M2. Every executable child unit is an independently established
      AgentTaskV1; parent/child is provenance only.
- [ ] M3. Every worker assignment passes WORKER-ROUTING-V1 independently.
- [ ] M4. Worker-to-worker authority delegation is prohibited.
- [ ] M5. A worker proposal cannot directly become executable work.
- [ ] M6. Shared-state mutation ownership is explicit; Workers cannot rewrite
      Task / Decision / Authority / Audit records.
- [ ] M7. Parallel execution requires explicit concurrency ceiling,
      resource-lock compatibility, and independent authorization per lane.
- [ ] M8. UNKNOWN/conflicting parallel state fails closed.
- [ ] M9. Conflict resolution cannot use consensus/voting to create Authority,
      and cannot re-decide owning-policy DENY/HOLD.
- [ ] M10. Cancellation/failure of one lane does not widen or silently change
      another lane; cancellation requires an explicit canonical target.
- [ ] M11. Coordination audit is reconstructable and grants zero Authority.
- [ ] M12. External mutation remains behind ACTION-GATEWAY-V1.
- [ ] M13. Execution remains subject to the owning execution authorization /
      policy surface per attempt. #108 / #110 are not treated as locked
      canonical dependencies until independently LOCKED.
- [ ] M14. Coordination does not introduce automatic retry or fallback.
- [ ] M15. `taskRoutingFingerprint` reuses WORKER-ROUTING-TASK-BINDING-V1; no
      duplicated hash domain.
- [ ] M16. Admitted CoordinationPlanV1 is immutable; plan change requires a
      new fingerprint and forbids evidence reuse across fingerprints.

## Relationship to #103

`#103 MUNDER-DIFFLIN-MULTI-WORKER-PILOT-V1` is an execution-harness-specific
pilot.

This Issue is the vendor-neutral coordination contract that defines what a safe
multi-worker topology means before a real harness proves it.

```text
MULTI-AGENT-COORDINATION-V1
        ↓
reviewed coordination semantics
        ↓
#103 multi-worker harness pilot
```

The harness may implement messaging, process lifecycle, worktrees, or worker
concurrency.

The harness must not own Authority, routing semantics, conflict policy, or
Human Gate semantics.

#103 must not treat unlocked #108 / #110 semantics as if this Issue had locked
them.

## A2A / MCP boundary

Protocol implementation is intentionally deferred.

V1 treats protocol messages as transport/content, not Authority.

```text
MCP response != Authority
A2A task/message != Authority
Agent discovery != Authority
```

A future A2A adapter may carry reviewed Task/Result envelopes but must not
redefine them.

Free-form protocol messages are not shared-state mutation commands and cannot
cancel another lane.

## Explicit non-goals

```text
A2A implementation
MCP implementation changes
ARD implementation
provider/model selection
LLM debate framework
open-ended peer-to-peer negotiation
majority-vote authorization
automatic retry/fallback
Coordination-owned Authority-bearing decomposition
child-authority attenuation engine
new Worker Registry authority fields
new AgentTask authority fields
new Human Approval UX
new external mutation path
Agent Runner expansion
Action Gateway expansion
real multi-worker execution
GitHub mutation through product
Ready / Merge / Deploy automation
locking #108 / #110 by implication
second taskRoutingFingerprint implementation
second canonicalJson implementation
```

## Acceptance criteria

- [ ] AC-1. Task Contract reuses independently established AgentTaskV1;
      Coordination does not create child Authority from a parent.
- [ ] AC-2. Result Contract keeps policy / execution / result-validation
      states separate and preserves UNKNOWN handling.
- [ ] AC-3. Worker-to-worker delegation cannot transfer Authority.
- [ ] AC-4. Proposed subtasks must re-enter canonical AgentTask authoring /
      validation / routing / owning-policy authorization.
- [ ] AC-5. Shared-state write ownership is explicit and cannot overwrite
      canonical domains.
- [ ] AC-6. Parallelism is opt-in, requires an explicit concurrency ceiling,
      is resource-safe, independently authorized, and fail-closed.
- [ ] AC-7. Conflict classes preserve owning-policy DENY/HOLD and do not
      invent Authority outcomes.
- [ ] AC-8. Stop/cancellation requires an explicit canonical target and
      preserves execution UNKNOWN semantics.
- [ ] AC-9. CoordinationPlanV1 identity/fingerprint is exact, immutable after
      admission, and reconstructable without hidden reasoning.
- [ ] AC-10. Consensus, debate, messages, protocols, and harness behavior
      cannot create Authority.
- [ ] AC-11. #103 can consume this Definition without inventing separate
      coordination semantics or treating unlocked #108/#110 as locked.
- [ ] AC-12. A2A/MCP remain transport/integration concerns, not Authority
      sources.
- [ ] AC-13. No external write can bypass ACTION-GATEWAY-V1.
- [ ] AC-14. No executable attempt can bypass the owning execution-policy /
      Human-Gate boundary.
- [ ] AC-15. Intra-coordination dependency graphs are deterministic,
      cycle-safe, and do not override DEPENDENCY-GRAPH-V1.
- [ ] AC-16. `taskRoutingFingerprint` reuses WORKER-ROUTING-TASK-BINDING-V1
      helpers; missing helper ⇒ not executable-ready.

## Required Re-Review Assertions

Independent Definition Re-Review-1 must confirm at least:

```text
R1  child task Authority is independently established
R2  policy / execution / result states remain separated
R3  dependency graph is deterministic and cycle-safe
R4  plan identity and fingerprint are exact
R5  unlocked upstream Definitions are not treated as canonical
R6  shared-state mutation ownership is explicit
R7  taskRoutingFingerprint implementation is reused
R8  conflict/cancellation/concurrency ownership is deterministic
R9  no correction creates new execution Authority
R10 external mutation remains behind ACTION-GATEWAY-V1
```

## Proposed implementation sequence — NOT YET AUTHORIZED

After Independent Definition Re-Review-1, Human Definition ACCEPT / LOCK, and
explicit Human Implementation Start GO:

```text
Slice A — coordination contract types / parser / validator
Slice B — deterministic coordination state transition evaluator
Slice C — shared-state / evidence binding
Slice D — fake two-worker coordination simulation
Slice E — integration contract for #103
```

Exact changed-area must be defined after Definition ACCEPT / LOCK.

No real provider/harness invocation is authorized by this Issue.

## Delivery gate

```text
Definition
→ Independent Definition Review-1
→ Definition Correction-1
→ Independent Definition Re-Review-1
→ Human Definition ACCEPT / LOCK
→ Human Implementation Start GO
→ exact implementation slice
→ verify
→ Draft PR
→ Independent Implementation Review
→ STOP for Human Ready GO
```

## Current gate

```text
MULTI-AGENT-COORDINATION-V1: DEFINITION CORRECTION-1 APPLIED
Definition Lock: NOT AUTHORIZED
Implementation Start: NOT AUTHORIZED
Real multi-worker execution: HOLD
Provider / Harness invocation: NOT AUTHORIZED
External mutation: NOT AUTHORIZED
A2A integration: NOT AUTHORIZED
Ready / Merge / Deploy: NOT AUTHORIZED

Next:
MULTI-AGENT-COORDINATION-V1
Independent Definition Re-Review-1
```
