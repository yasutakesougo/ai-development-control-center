# MULTI-AGENT-COORDINATION-V1
## Implementation Scope Definition — Slice C

**Status: IMPLEMENTATION SCOPE DEFINED · IMPLEMENTATION NOT YET AUTHORIZED**

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

This document defines only the third implementation slice.

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

Implement the smallest deterministic contract layer needed to bind already-established coordination evidence into an immutable, reconstructable coordination-state snapshot without creating or widening Authority.

The slice may validate references to:

```text
Coordination Plan
Task Ledger facts
Decision Ledger references
Evidence Store references
Worker Observation references
Audit facts
```

The slice must not own or mutate the canonical domains behind those references.

Locked separation:

```text
Shared state != Authority
Evidence != Authority
Audit != Authority
Reference validity != execution authorization
Coordination progression != external mutation
Worker observation != worker Authority
```

Slice C consumes authoritative facts; it does not manufacture them.

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

Reuse existing canonical helpers and identities rather than introducing alternate normalization, hashing, or state vocabularies.

At minimum preserve:

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

Slice C may introduce one closed, pure snapshot envelope representing references to already-established facts.

Conceptual shape:

```ts
type CoordinationSharedStateSnapshotV1 = {
  schemaVersion: "MULTI-AGENT-COORDINATION-SHARED-STATE-SNAPSHOT-V1";
  coordinationId: string;
  coordinationPlanFingerprint: string;
  taskStates: CoordinationTaskStateBindingV1[];
  evidenceRefs: string[];
  auditRefs: string[];
};
```

Each task-state binding must be identity-bound to one task in the admitted plan.

Conceptual minimum:

```ts
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
  evidenceRefs: string[];
};
```

The exact implementation names may differ only if the Independent Scope Review finds a repository naming conflict. The semantics above are normative for this scope.

Unknown keys fail closed.

---

## 5. Deterministic binding rules

The validator must reject or fail closed on any material identity contradiction.

Required checks:

```text
snapshot coordinationId == admitted plan coordinationId
snapshot coordinationPlanFingerprint == admitted plan fingerprint
one task-state binding per referenced taskId
no duplicate taskId binding
no unknown taskId
binding taskRoutingFingerprint == admitted task ref taskRoutingFingerprint
no silent sorting, dedupe, repair, or identity rewrite
```

A worker/routing/execution/evidence reference may be absent only where the locked lifecycle permits absence.

Missing data must never be filled from conversation history, another task, prior successful coordination, or inferred defaults.

```text
missing != inferred
unknown != failed
reference present != reference authoritative
```

Slice C must preserve the owning domain's exact value when one is supplied.

It must not reinterpret a policy decision, execution outcome, result-validation outcome, routing decision, resource-lock decision, or worker-authority record.

---

## 6. Shared-state ownership enforcement

The Definition's ownership boundary remains normative:

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

It does not implement any writer for these logical stores.

No exported API may perform append, update, delete, persist, dispatch, approve, invoke, merge, deploy, or external mutation.

---

## 7. Evidence provenance rules

Every evidence reference admitted into the snapshot must remain attributable to the task or coordination record that supplied it.

Required invariants:

```text
one worker's evidence cannot authorize another worker
one task's evidence cannot silently satisfy another task's identity binding
free-form message != canonical evidence mutation
prior coordination evidence != authority for a new coordination run
Audit evidence grants zero Authority
```

Array ordering must be deterministic.

If arrays are part of the snapshot identity, their admitted order is preserved.

If they are set-like validation inputs, normalization must be explicitly defined and tested before implementation; silent implementation-time normalization is prohibited.

Slice C must not create a new hash domain unless the locked Definition already requires one and the Independent Scope Review explicitly confirms it.

---

## 8. Progression coherence

Slice C does not re-run or redefine the Slice B state machine.

It validates that a supplied coordination progression record is bound to the same:

```text
coordinationId
coordinationPlanFingerprint
taskId
```

as the shared-state task binding.

If progression evidence and snapshot identity conflict:

```text
validation = FAIL / contradiction
no repair
no promotion to READY
no promotion to SUCCEEDED
no external execution
```

Slice C must not convert a contradiction into `FAILED` unless the owning execution/result domain already established that outcome.

---

## 9. Explicitly prohibited in Slice C

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

## 10. Capability boundary

Slice C may expose only pure parser / validator / binding functions required for the shared-state snapshot contract.

Any new capability indicator introduced for Slice C must mean only:

```text
pure shared-state binding validation implemented
```

It must not imply persistence, dispatch, execution, external mutation, Ready, Merge, Deploy, or real coordination runtime availability.

All existing execution/provider/harness/GitHub/Ready/Merge/Deploy capability flags must remain false.

---

## 11. Test scope

`test/multiAgentCoordination.test.ts` must use synthetic records only.

Preserve all Slice A/B tests.

Add focused Slice C coverage at minimum:

```text
C01 valid snapshot bound to exact plan identity -> PASS
C02 coordinationId mismatch -> fail closed
C03 plan fingerprint mismatch -> fail closed
C04 unknown taskId -> fail closed
C05 duplicate task binding -> fail closed
C06 taskRoutingFingerprint mismatch -> fail closed
C07 missing optional refs in a lifecycle-permitted state -> accepted
C08 missing required ref for claimed terminal/progression state -> fail closed
C09 progression identity mismatch -> fail closed
C10 evidence from task A cannot satisfy task B binding
C11 unknown keys -> fail closed
C12 input order handling is deterministic
C13 no silent dedupe / repair / identity rewrite
C14 snapshot validation changes no canonical execution/routing/policy result
C15 no exported persistence / dispatch / invoke / approve / merge / deploy API
C16 existing Slice B progression evaluator behavior unchanged
```

Tests must not contact external services or write persistent state.

---

## 12. Verification gate

Before implementation review, run the repository's full verification contract:

```text
npm run verify
= npm run typecheck && npm test && npm run build
```

Targeted tests may be run additionally but do not replace full verification.

Exact implementation HEAD must be fixed before Independent Implementation Review.

---

## 13. Delivery sequence

```text
Implementation Scope Definition — Slice C
→ Independent Scope Review-1
→ Scope Correction if required
→ Independent Scope Re-Review
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

This Scope Definition itself grants none of those later authorities.

---

## 14. Slice exit criteria

Slice C is complete only when:

```text
shared-state snapshot identity is deterministic
plan/task bindings are exact
canonical domain references remain domain-owned
no worker/evidence/audit record can create Authority
no silent repair or cross-task evidence reuse exists
Slice B progression semantics remain unchanged
no persistence or external side-effect path is introduced
full npm run verify PASS is evidenced
Independent Implementation Review passes
separate Human Ready and Merge gates complete
post-merge main reconciliation passes
```

---

## Current gate

```text
MAC-IMPL-SLICE-B:
COMPLETE / MERGED / RECONCILED

MAC-IMPL-SLICE-C:
IMPLEMENTATION SCOPE DEFINED

Implementation Start:
NOT AUTHORIZED

Provider / Harness invocation:
NOT AUTHORIZED

External mutation by product:
NOT AUTHORIZED

Real multi-worker execution:
HOLD

Ready / Merge / Deploy:
NOT AUTHORIZED

Next:
Slice C Independent Scope Review-1
```
