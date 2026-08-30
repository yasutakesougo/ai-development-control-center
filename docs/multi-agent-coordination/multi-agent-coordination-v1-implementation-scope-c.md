# MULTI-AGENT-COORDINATION-V1
## Implementation Scope Definition — Slice C / Correction-1

**Status: IMPLEMENTATION SCOPE CORRECTION-1 APPLIED · IMPLEMENTATION NOT YET AUTHORIZED**

This scope is bound to the locked `MULTI-AGENT-COORDINATION-V1` Definition and the reconciled Slice B main state.

```text
Definition lock target:
3902b24985b9965d8b0042b1146bbfa85c491dc2

Slice B integration:
PR #116
merge commit: 27c31e7f690e13eddb7f7b00d83e013ba0851947

Scope baseline:
main @ 27c31e7f690e13eddb7f7b00d83e013ba0851947
```

```text
Slice ID:
MAC-IMPL-SLICE-C

Purpose:
pure shared-state / evidence binding contracts and deterministic validation

Persistence / external execution:
NOT IN SCOPE
```

Slice C does not add a database, ledger writer, worker dispatch path, Provider/Harness invocation, GitHub mutation path, or real multi-worker execution.

---

## 1. Objective

Implement the smallest deterministic contract layer needed to bind already-established coordination evidence into one immutable, reconstructable coordination-state snapshot without creating or widening Authority.

Locked separation:

```text
Shared state != Authority
Evidence != Authority
Audit != Authority
Reference validity != execution authorization
Coordination progression != external mutation
Worker observation != worker Authority
```

Slice C consumes explicit facts supplied to the pure validator.
It does not manufacture, look up, persist, or mutate canonical facts.

---

## 2. Exact changed area

Implementation mutation is limited to exactly:

```text
src/domain/multiAgentCoordination.ts
test/multiAgentCoordination.test.ts
```

This scope artifact may be updated only for implementation evidence or typo-level synchronization that does not change semantics:

```text
docs/multi-agent-coordination/multi-agent-coordination-v1-implementation-scope-c.md
```

No other source, test, script, config, UI, Worker route, workflow, package, persistence, or deployment file may change in Slice C.

If another file becomes necessary, STOP and return to Scope Correction / Independent Scope Re-Review before changing it.

---

## 3. Existing code reused without semantic widening

Slice C builds on Slice A and Slice B contracts already present in `src/domain/multiAgentCoordination.ts`.

Preserve and reuse:

```text
CoordinationPlanV1 identity / fingerprint semantics
CoordinationTaskRefV1 semantics
Coordination progression vocabulary
Slice B evaluateCoordinationProgressionV1 semantics
Worker Routing task-binding fingerprint reuse
canonicalJson reuse
UNKNOWN != FAILED
```

Slice C must not change Slice A/B parser or evaluator outcomes for existing callers.

---

## 4. Shared-state binding contract

Slice C may introduce one closed, pure FULL snapshot envelope.

```ts
type CoordinationEvidenceBindingV1 = {
  ref: string;
  ownerScope: "COORDINATION" | "TASK";
  coordinationId: string;
  taskId: string | null;
  kind: "EVIDENCE" | "AUDIT";
  sourceId: string;
};

type CoordinationTaskStateBindingV1 = {
  taskId: string;
  taskRoutingFingerprint: string;
  workerId: string | null;
  workerAuthorityFingerprint: string | null;
  routingDecisionFingerprint: string | null;
  executionAuthorizationRef: string | null;
  executionAttemptId: string | null;
  executionOutcomeRef: string | null;
  resultValidationRef: string | null;
  resourceLockDecisionRef: string | null;
  coordinationProgressionStatus: CoordinationProgressionStatusV1;
  evidenceBindings: CoordinationEvidenceBindingV1[];
};

type CoordinationSharedStateSnapshotV1 = {
  schemaVersion: "MULTI-AGENT-COORDINATION-SHARED-STATE-SNAPSHOT-V1";
  coordinationId: string;
  coordinationPlanFingerprint: string;
  taskStates: CoordinationTaskStateBindingV1[];
  coordinationEvidenceBindings: CoordinationEvidenceBindingV1[];
  auditBindings: CoordinationEvidenceBindingV1[];
};
```

Unknown keys fail closed.

Evidence attribution model for V1 is fixed to bounded evidence binding records.
No network/database lookup is permitted or required.

```text
bare string ref alone != attributable evidence binding
```

For `ownerScope = TASK`:

```text
taskId MUST be non-null
coordinationId MUST equal snapshot coordinationId
```

For `ownerScope = COORDINATION`:

```text
taskId MUST be null
coordinationId MUST equal snapshot coordinationId
```

`sourceId` is attribution/provenance identity only.
It grants zero Authority.

---

## 5. FULL snapshot coverage semantics

Slice C V1 uses FULL snapshots only.

```text
taskStates taskId set
==
admitted plan taskId set
```

Therefore:

```text
missing admitted plan task -> REJECT
unknown task -> REJECT
duplicate task -> REJECT
partial snapshot -> REJECT
```

Omission never means `UNKNOWN`.
A future partial-snapshot model requires separate reviewed scope.

Each admitted plan task appears exactly once in `taskStates`.

---

## 6. Deterministic binding rules

Required checks:

```text
snapshot coordinationId == admitted plan coordinationId
snapshot coordinationPlanFingerprint == admitted plan fingerprint
FULL task coverage
one task-state binding per admitted taskId
no duplicate taskId binding
no unknown taskId
binding taskRoutingFingerprint == admitted task ref taskRoutingFingerprint
all evidence binding coordinationId values == snapshot coordinationId
TASK evidence binding taskId == containing task state taskId
COORDINATION evidence binding taskId == null
no cross-task evidence reuse by owner identity
no silent sorting, dedupe, repair, defaulting, or identity rewrite
```

Missing data must never be filled from conversation history, another task, prior successful coordination, or inferred defaults.

```text
missing != inferred
unknown != failed
reference present != reference authoritative
```

Slice C preserves owning-domain values exactly.
It does not reinterpret policy, execution, result validation, routing, resource lock, or worker authority outcomes.

---

## 7. Closed lifecycle-to-reference requirement matrix

Reference requirement values are exactly:

```text
R = REQUIRED non-null / non-empty as applicable
O = OPTIONAL; null/empty or explicit supplied canonical fact accepted
N = MUST_BE_NULL / MUST_BE_EMPTY
```

The validator does not derive or synthesize any missing reference from progression status.
A contradiction against this table fails closed.

| Progression | workerId | workerAuthorityFingerprint | routingDecisionFingerprint | executionAuthorizationRef | executionAttemptId | executionOutcomeRef | resultValidationRef | resourceLockDecisionRef | task evidenceBindings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PLANNED | N | N | N | N | N | N | N | N | O |
| WAITING_DEPENDENCY | O | O | O | N | N | N | N | O | O |
| WAITING_RESOURCE | R | R | R | N | N | N | N | R | O |
| WAITING_HUMAN_GATE | R | R | R | R | N | N | N | O | O |
| READY | R | R | R | R | N | N | N | O | O |
| RUNNING | R | R | R | R | R | O | N | O | O |
| HOLD | O | O | O | O | N | N | N | O | O |
| NOT_EXECUTED | O | O | O | R | N | N | N | O | O |
| CANCELLED | O | O | O | O | N | N | N | O | O |
| FAILED | R | R | R | R | R | R | O | O | R |
| SUCCEEDED | R | R | R | R | R | R | R | O | R |
| UNKNOWN | O | O | O | O | O | O | O | O | O |

Additional closed rules:

```text
workerId null <=> workerAuthorityFingerprint null AND routingDecisionFingerprint null
workerId non-null -> workerAuthorityFingerprint and routingDecisionFingerprint REQUIRED
executionAttemptId non-null -> executionAuthorizationRef REQUIRED
executionOutcomeRef non-null -> executionAttemptId REQUIRED
resultValidationRef non-null -> executionOutcomeRef REQUIRED
SUCCEEDED -> executionOutcomeRef + resultValidationRef + at least one task evidence binding REQUIRED
FAILED -> executionOutcomeRef + at least one task evidence binding REQUIRED
RUNNING -> resultValidationRef MUST_BE_NULL
NOT_EXECUTED -> executionAttemptId/executionOutcomeRef/resultValidationRef MUST_BE_NULL
PLANNED -> all worker/routing/execution/resource refs MUST_BE_NULL
```

This matrix validates snapshot coherence only.
It does not claim that the listed references are authoritative, current, or execution-authorizing.

Where Slice B emits a status from canonical execution/result inputs, Slice C only checks that the snapshot references do not contradict the claimed lifecycle shape.
It does not re-run or replace Slice B progression semantics.

---

## 8. Array ordering and duplicate semantics

All Slice C arrays are **order-significant admitted data**.

This applies to:

```text
taskStates
coordinationEvidenceBindings
auditBindings
per-task evidenceBindings
```

Rules:

```text
preserve input order exactly
no sorting
no dedupe
no canonical reordering
```

Duplicates are not normalized.
They are validated as follows:

```text
duplicate taskId in taskStates -> REJECT
duplicate evidence binding exact identity tuple -> REJECT
duplicate audit binding exact identity tuple -> REJECT
```

Evidence binding exact identity tuple is:

```text
(ref, ownerScope, coordinationId, taskId, kind, sourceId)
```

Two different tuples may refer to the same `ref` only when their entire attribution tuple is not contradictory.
A single bare `ref` cannot be used to prove cross-owner equivalence.

No Slice C snapshot hash domain is introduced.
Array order is therefore validation/reconstructability data, not a new Authority-bearing fingerprint.

---

## 9. Evidence provenance rules

Required invariants:

```text
one worker's evidence cannot authorize another worker
one task's evidence cannot silently satisfy another task's identity binding
free-form message != canonical evidence mutation
prior coordination evidence != authority for a new coordination run
Audit evidence grants zero Authority
```

For every per-task evidence binding:

```text
ownerScope == TASK
taskId == containing taskState.taskId
coordinationId == snapshot.coordinationId
kind == EVIDENCE
```

For top-level coordination evidence:

```text
ownerScope == COORDINATION
taskId == null
coordinationId == snapshot.coordinationId
kind == EVIDENCE
```

For audit bindings:

```text
coordinationId == snapshot.coordinationId
kind == AUDIT
ownerScope may be COORDINATION or TASK
TASK -> taskId must exist in admitted plan
COORDINATION -> taskId must be null
```

No external lookup is permitted.
Attribution is proven only from explicit binding records supplied to the pure validator.

---

## 10. Shared-state ownership enforcement

```text
Coordination Plan:
Coordinator-owned immutable admitted plan

Task Ledger:
canonical task references only
worker rewrite prohibited

Decision Ledger:
owning policy / router decision references
worker rewrite prohibited

Evidence Store:
attributable append evidence
admitted evidence immutable

Worker Observation State:
owning worker-observation contract
Coordination cannot rewrite worker Authority

Audit Ledger:
append-only evidence
Authority generation prohibited
```

Slice C implements validation/binding only.
It implements no writer for these stores.

No exported API may append, update, delete, persist, dispatch, approve, invoke, merge, deploy, or perform external mutation.

---

## 11. Progression coherence

Slice C does not re-run or redefine the Slice B state machine.

It validates that supplied progression evidence is bound to the same:

```text
coordinationId
coordinationPlanFingerprint
taskId
```

as the task state binding.

If identity or lifecycle/reference coherence conflicts:

```text
validation = FAIL / contradiction
no repair
no promotion to READY
no promotion to SUCCEEDED
no external execution
```

A contradiction is not converted into execution `FAILED` unless the owning execution/result domain already established that outcome.

---

## 12. Explicitly prohibited in Slice C

```text
D1 / database schema changes
persistent Task Ledger writer
persistent Decision Ledger writer
persistent Evidence Store writer
persistent Audit Ledger writer
Worker Observation writer
shared conversation memory as canonical state
CoordinationConcurrencyPolicyInputV1 evaluator
resource-lock acquisition
worker dispatch / parallel dispatch
Provider invocation
Harness invocation
Agent Runner invocation
Action Gateway invocation
GitHub mutation by product
branch / commit / PR automation by product
Ready automation
Merge automation
Deploy automation
UI changes
Cloudflare Worker route changes
workflow changes
package dependency changes
automatic retry / fallback
real multi-worker execution
Slice D fake two-worker simulation
Slice E #103 integration contract
```

This slice creates no new execution Authority.

---

## 13. Capability boundary

Slice C may expose only pure parser / validator / binding functions required for the FULL shared-state snapshot contract.

Any Slice C capability indicator means only:

```text
pure shared-state binding validation implemented
```

It must not imply persistence, dispatch, execution, external mutation, Ready, Merge, Deploy, or real coordination runtime availability.

All existing execution/provider/harness/GitHub/Ready/Merge/Deploy capability flags remain false.

---

## 14. Test scope

`test/multiAgentCoordination.test.ts` uses synthetic records only.
Preserve all Slice A/B tests.

Add focused Slice C coverage at minimum:

```text
C01 valid FULL snapshot bound to exact plan identity -> PASS
C02 coordinationId mismatch -> fail closed
C03 plan fingerprint mismatch -> fail closed
C04 unknown taskId -> fail closed
C05 duplicate task binding -> fail closed
C06 taskRoutingFingerprint mismatch -> fail closed
C07 lifecycle matrix accepts OPTIONAL null refs
C08 lifecycle matrix rejects missing REQUIRED ref
C09 lifecycle matrix rejects MUST_BE_NULL contradiction
C10 partial snapshot -> reject
C11 task evidence owner mismatch -> reject
C12 coordination evidence with task owner -> reject
C13 audit binding unknown task -> reject
C14 duplicate evidence identity tuple -> reject
C15 array order preserved; no sort/dedupe/repair
C16 bare ref cannot substitute for bounded attribution record
C17 progression identity mismatch -> fail closed
C18 snapshot validation changes no canonical execution/routing/policy result
C19 no exported persistence / dispatch / invoke / approve / merge / deploy API
C20 existing Slice B progression evaluator behavior unchanged
C21 SUCCEEDED missing resultValidationRef -> reject
C22 FAILED missing executionOutcomeRef/evidence -> reject
C23 NOT_EXECUTED with executionAttemptId -> reject
C24 PLANNED with routing/execution/resource ref -> reject
```

Tests contact no external service and write no persistent state.

---

## 15. Verification gate

Before implementation review:

```text
npm run verify
= npm run typecheck && npm test && npm run build
```

Targeted tests may be additional only.
Exact implementation HEAD must be fixed before Independent Implementation Review.

---

## 16. Delivery sequence

```text
Implementation Scope Definition — Slice C
→ Independent Scope Review-1
→ Implementation Scope Correction-1
→ Independent Scope Re-Review-1
→ separate Human Implementation Start GO / HOLD
→ implement Slice C only
→ npm run verify
→ exact diff inspection
→ Draft implementation PR
→ Independent Implementation Review
→ separate Human Ready GO / HOLD
→ separate Merge GO / HOLD
→ Post-Merge Reconciliation
```

This Scope Correction grants none of those later authorities.

---

## 17. Correction-1 closure mapping

```text
Review-1 P1-1 lifecycle/reference matrix
-> Section 7 CLOSED

Review-1 P1-2 evidence attribution model
-> Sections 4 and 9 CLOSED

Review-1 P2-1 snapshot coverage
-> Section 5 FULL snapshot CLOSED

Review-1 P2-2 array order/normalization
-> Section 8 order-significant / no normalization CLOSED
```

---

## Current gate

```text
MAC-IMPL-SLICE-B:
COMPLETE / MERGED / RECONCILED

MAC-IMPL-SLICE-C:
IMPLEMENTATION SCOPE CORRECTION-1 APPLIED

Implementation Start:
NOT AUTHORIZED BY THIS CORRECTION

Provider / Harness invocation:
NOT AUTHORIZED

External mutation by product:
NOT AUTHORIZED

Real multi-worker execution:
HOLD

Ready / Merge / Deploy:
NOT AUTHORIZED

Next:
Slice C Independent Scope Re-Review-1
```
