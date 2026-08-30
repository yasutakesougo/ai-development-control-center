# MULTI-AGENT-COORDINATION-V1
## Definition Correction-2

**Status: DEFINITION CORRECTION-2 APPLIED · NO IMPLEMENTATION · NO PROVIDER/HARNESS INVOCATION · NO EXTERNAL MUTATION**

This document is a normative Definition delta for Issue #111.

It is read together with:

```text
docs/multi-agent-coordination/multi-agent-coordination-v1.md
```

Where this Correction-2 conflicts with Correction-1 wording, Correction-2 is authoritative for the corrected clauses only.

This document does not authorize implementation, Provider invocation, Harness invocation, GitHub mutation by the product, Ready, Merge, or Deploy.

```text
Definition Lock: NOT AUTHORIZED
Implementation Start: NOT AUTHORIZED
Real multi-worker execution: HOLD
Provider / Harness invocation: NOT AUTHORIZED
External mutation: NOT AUTHORIZED
Ready / Merge / Deploy: NOT AUTHORIZED
```

## Source Review

```text
MULTI-AGENT-COORDINATION-V1
Independent Definition Re-Review-1

Verdict: CORRECTION REQUIRED
P0: 0
P1: 3
P2: 2
```

Correction mapping:

```text
Re-Review P1-1 → C2-1 Exact coordination progression derivation
Re-Review P1-2 → C2-2 Exact dependency-readiness mapping
Re-Review P1-3 → C2-3 Exact CoordinationPlan fingerprint facts
Re-Review P2-1 → C2-4 Exact cancellation / concurrency ownership
Re-Review P2-2 → C2-5 Exact V1 parser bounds
```

---

# C2-1 — Exact coordination progression derivation

Correction-1 separated policy decision, execution outcome, result validation, and coordination progression.

Correction-2 fixes the exact derivation and precedence rules.

Coordination never re-decides the owning authorization, execution, or result-validation surfaces.

It consumes bound observations of those surfaces and derives coordination progression only.

## C2-1.1 Normalized observation categories

These categories are coordination-side observations.

They do not create Authority and do not replace future locked #108 / #110 vocabularies.

A future adapter may map a locked owning contract into these categories only when the mapping is exact.

If the mapping cannot be proven, use the corresponding `UNKNOWN` / fail-closed category.

```ts
type CoordinationAuthorizationObservationV1 =
  | "NOT_EVALUATED"
  | "AUTHORIZED"
  | "DENIED"
  | "WAITING_HUMAN_GATE"
  | "HOLD"
  | "UNKNOWN";

type CoordinationExecutionObservationV1 =
  | "NOT_INVOKED"
  | "RUNNING"
  | "EXECUTION_SUCCEEDED"
  | "EXECUTION_FAILED"
  | "EXECUTION_UNKNOWN";

type CoordinationResultValidationObservationV1 =
  | "NOT_REQUIRED"
  | "NOT_EVALUATED"
  | "RESULT_VALID"
  | "RESULT_INVALID"
  | "RESULT_UNKNOWN";
```

These observations require attributable evidence references from the owning surfaces.

Observation categories grant zero execution Authority.

## C2-1.2 Progression reason vocabulary

```ts
type CoordinationProgressionReasonV1 =
  | "PLAN_ADMITTED"
  | "DEPENDENCY_PENDING"
  | "DEPENDENCY_BLOCKED"
  | "RESOURCE_WAIT"
  | "READY_FOR_AUTHORIZATION"
  | "AUTHORIZATION_DENIED"
  | "AUTHORIZATION_HOLD"
  | "AUTHORIZATION_UNKNOWN"
  | "HUMAN_GATE_WAIT"
  | "EXECUTION_RUNNING"
  | "EXECUTION_FAILED"
  | "EXECUTION_UNKNOWN"
  | "RESULT_INVALID"
  | "RESULT_UNKNOWN"
  | "EXECUTION_AND_RESULT_VALID"
  | "EXECUTION_VALIDATION_NOT_REQUIRED"
  | "CANCELLATION_ACCEPTED";
```

`coordinationProgressionStatus` and `coordinationProgressionReason` are always emitted together after progression evaluation.

The reason preserves why a derived state was selected.

## C2-1.3 Exact precedence

The evaluator applies the following first-match precedence.

No Coordinator discretion may reorder these rules.

```text
1. invalid plan
   → no executable progression decision
   → plan validation failure / fail closed

2. execution observation == EXECUTION_UNKNOWN
   → UNKNOWN / EXECUTION_UNKNOWN

3. result validation observation == RESULT_UNKNOWN
   AND execution observation == EXECUTION_SUCCEEDED
   → UNKNOWN / RESULT_UNKNOWN

4. accepted canonical cancellation request
   AND execution observation == NOT_INVOKED
   → CANCELLED / CANCELLATION_ACCEPTED

5. execution observation == EXECUTION_FAILED
   → FAILED / EXECUTION_FAILED

6. execution observation == EXECUTION_SUCCEEDED
   AND result validation observation == RESULT_INVALID
   → FAILED / RESULT_INVALID

7. execution observation == EXECUTION_SUCCEEDED
   AND result validation observation == RESULT_VALID
   → SUCCEEDED / EXECUTION_AND_RESULT_VALID

8. execution observation == EXECUTION_SUCCEEDED
   AND result validation observation == NOT_REQUIRED
   → SUCCEEDED / EXECUTION_VALIDATION_NOT_REQUIRED

9. execution observation == RUNNING
   → RUNNING / EXECUTION_RUNNING

10. authorization observation == DENIED
    AND execution observation == NOT_INVOKED
    → NOT_EXECUTED / AUTHORIZATION_DENIED

11. authorization observation == WAITING_HUMAN_GATE
    AND execution observation == NOT_INVOKED
    → WAITING_HUMAN_GATE / HUMAN_GATE_WAIT

12. authorization observation == HOLD
    AND execution observation == NOT_INVOKED
    → HOLD / AUTHORIZATION_HOLD

13. authorization observation == UNKNOWN
    AND execution observation == NOT_INVOKED
    → HOLD / AUTHORIZATION_UNKNOWN

14. dependency evaluation == BLOCKED
    → HOLD / DEPENDENCY_BLOCKED

15. dependency evaluation == PENDING
    → WAITING_DEPENDENCY / DEPENDENCY_PENDING

16. resource/concurrency evaluation == WAIT
    → WAITING_RESOURCE / RESOURCE_WAIT

17. all readiness prerequisites pass
    AND authorization observation == NOT_EVALUATED
    AND execution observation == NOT_INVOKED
    → READY / READY_FOR_AUTHORIZATION

18. newly admitted plan/task before readiness evaluation
    → PLANNED / PLAN_ADMITTED
```

No other mapping is permitted in V1.

## C2-1.4 Missing / contradictory evidence

The following must fail closed:

```text
AUTHORIZED + NOT_INVOKED + missing execution-start evidence
→ READY only if all other readiness prerequisites still pass

DENIED + RUNNING
→ UNKNOWN

DENIED + EXECUTION_SUCCEEDED
→ UNKNOWN

WAITING_HUMAN_GATE + RUNNING
→ UNKNOWN

RESULT_VALID + execution != EXECUTION_SUCCEEDED
→ UNKNOWN

RESULT_INVALID + execution != EXECUTION_SUCCEEDED
→ UNKNOWN

accepted cancellation + EXECUTION_UNKNOWN
→ UNKNOWN
```

Contradictory owning-surface observations must not be repaired by Coordination.

## C2-1.5 Terminality and dependency satisfaction

```text
SUCCEEDED     → terminal / dependency-satisfying
FAILED        → terminal / not dependency-satisfying
UNKNOWN       → terminal-for-automatic-progression / not dependency-satisfying
CANCELLED     → terminal / not dependency-satisfying
NOT_EXECUTED  → terminal / not dependency-satisfying
HOLD          → non-progressing / not dependency-satisfying

PLANNED
READY
RUNNING
WAITING_DEPENDENCY
WAITING_RESOURCE
WAITING_HUMAN_GATE
→ non-terminal / not dependency-satisfying
```

`UNKNOWN` requires reconciliation before any new execution attempt is considered.

Correction-2 introduces no retry authority.

---

# C2-2 — Exact dependency-readiness mapping

Correction-1 defined graph validity.

Correction-2 defines the exact edge-state mapping and downstream decision.

## C2-2.1 Edge classification

Every dependency edge is classified from the dependency task's current `coordinationProgressionStatus`.

```text
SUCCEEDED
→ SATISFIED

PLANNED
READY
RUNNING
WAITING_DEPENDENCY
WAITING_RESOURCE
WAITING_HUMAN_GATE
→ PENDING

FAILED
CANCELLED
NOT_EXECUTED
→ BLOCKED

UNKNOWN
HOLD
→ UNCERTAIN
```

No lifecycle state is omitted.

## C2-2.2 Aggregate dependency decision

For a task with zero dependencies:

```text
dependency evaluation = SATISFIED
```

For a task with one or more dependencies, apply this precedence:

```text
if any dependency == UNCERTAIN
→ dependency evaluation = BLOCKED
→ downstream coordination progression = HOLD / DEPENDENCY_BLOCKED

else if any dependency == BLOCKED
→ dependency evaluation = BLOCKED
→ downstream coordination progression = HOLD / DEPENDENCY_BLOCKED

else if any dependency == PENDING
→ dependency evaluation = PENDING
→ downstream coordination progression = WAITING_DEPENDENCY / DEPENDENCY_PENDING

else
→ every dependency == SATISFIED
→ dependency evaluation = SATISFIED
→ dependency gate passes
```

The previous Correction-1 wording `WAITING_DEPENDENCY or HOLD` is superseded by this exact mapping.

## C2-2.3 Graph validity remains fail-closed

The following remain invalid plan conditions:

```text
self dependency
missing dependency target
duplicate dependency id
dependency cycle
unknown task reference
```

An invalid plan does not produce `READY`.

`dependencyTaskIds` remain intra-coordination only and must not overwrite `DEPENDENCY-GRAPH-V1` (#68).

---

# C2-3 — Exact CoordinationPlan fingerprint facts

Correction-1 used the phrase `include at least` for fingerprint facts.

That phrase is superseded.

V1 uses one closed fingerprint fact set.

## C2-3.1 Exact fingerprint facts

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

These are the exact V1 fingerprint facts.

No additional field may participate in V1 fingerprint computation.

No field listed above may be omitted.

## C2-3.2 Canonical computation

```text
capture exact facts
→ canonicalJson() from src/domain/decisionFingerprint.ts
→ SHA-256
→ lowercase hexadecimal
→ exactly 64 characters
```

No second canonical JSON implementation is permitted.

No silent sorting, trimming, deduplication, normalization, or repair is permitted before fingerprinting except behavior explicitly owned by reused canonical helpers.

`taskRefs` order is part of plan identity.

`dependencyTaskIds` order is part of plan identity.

Duplicate task IDs and duplicate dependency IDs are rejected before hashing.

## C2-3.3 Plan change / revision behavior

V1 introduces no separate `revisionId` field.

```text
same coordinationId + identical exact facts
→ same fingerprint

same coordinationId + any changed exact fact
→ different fingerprint

new coordinationId
→ different fingerprint
```

An admitted plan is immutable.

A changed plan is admitted as a new immutable plan identity with a new fingerprint.

Evidence bound to an old plan fingerprint must not satisfy a new plan fingerprint.

---

# C2-4 — Exact cancellation and concurrency ownership

## C2-4.1 Cancellation is an input binding, not Authority

Coordination does not create cancellation Authority.

V1 accepts a cancellation only through this bounded coordination-side envelope:

```ts
type CoordinationCancellationRequestV1 = {
  schemaVersion: "MULTI-AGENT-COORDINATION-CANCELLATION-V1";
  cancellationRequestId: string;
  source: "HUMAN_CONTROL_SURFACE" | "OWNING_POLICY_SURFACE";
  coordinationId: string;
  coordinationPlanFingerprint: string;
  targetScope: "COORDINATION" | "TASK";
  targetTaskId: string | null;
  authorizationRef: string;
  requestedAt: string;
};
```

V1 does not introduce a separate `laneId`.

Within a coordination plan, a task lane is identified by `taskId`.

Exact target rules:

```text
targetScope == COORDINATION
→ targetTaskId MUST be null

targetScope == TASK
→ targetTaskId MUST identify exactly one task in the bound plan
```

A Worker message, proposal, model output, protocol message, harness message, or prior audit record cannot create this request.

## C2-4.2 Cancellation validation owner

The Coordinator may validate structure and bindings only.

The Coordinator does not decide whether cancellation is authorized.

Acceptance requires all of:

```text
schema valid
exact current coordinationId match
exact current coordinationPlanFingerprint match
exact target match
authorizationRef present and attributable to source
source is HUMAN_CONTROL_SURFACE or OWNING_POLICY_SURFACE
owning source evidence is current enough under that source's own policy
no contradictory execution state that requires UNKNOWN reconciliation
```

If the Coordinator cannot prove the owning source evidence, cancellation is not accepted.

This Definition does not define or widen the Human-control or owning-policy Authority that produces `authorizationRef`.

## C2-4.3 Cancellation outcome precedence

```text
accepted cancellation + NOT_INVOKED
→ CANCELLED

accepted cancellation + RUNNING
→ cancellation request recorded
→ owning execution surface controls interruption/reconciliation
→ Coordination must not fabricate CANCELLED

accepted cancellation + EXECUTION_UNKNOWN
→ UNKNOWN

accepted cancellation after terminal SUCCEEDED / FAILED
→ does not rewrite prior terminal evidence
```

Cancellation creates no retry authority and no child-task Authority.

## C2-4.4 Concurrency ceiling inputs

Concurrent dispatch uses only explicit reviewed ceiling records.

```ts
type CoordinationConcurrencyCeilingRefV1 = {
  sourceId: string;
  ceiling: number;
  evidenceRef: string;
};
```

For concurrent dispatch:

```text
zero applicable valid ceiling records
→ HOLD

one applicable valid ceiling record
→ effective ceiling = that ceiling

multiple applicable valid ceiling records
→ effective ceiling = minimum(all applicable ceilings)
```

This is narrowing-only.

No larger ceiling may override a smaller applicable ceiling.

Missing, stale, malformed, contradictory, or un-attributable ceiling evidence causes concurrent dispatch `HOLD`.

Sequential execution does not require a concurrency ceiling greater than one.

---

# C2-5 — Exact V1 parser bounds

V1 uses finite bounds.

No silent truncation, trimming, case normalization, deduplication, repair, defaulting, or inferred value insertion is allowed.

Unknown keys fail closed for every contract object defined by #111.

## C2-5.1 coordinationId / local identifiers

`coordinationId` and `cancellationRequestId`:

```text
minLength = 1
maxLength = 128
pattern = ^[a-z][a-z0-9._-]{0,127}$
```

`sourceId`:

```text
minLength = 1
maxLength = 128
```

No normalization is performed.

## C2-5.2 Plan bounds

`CoordinationPlanV1.taskRefs`:

```text
minItems = 1
maxItems = 32
unique by taskId
```

Each `dependencyTaskIds`:

```text
minItems = 0
maxItems = 31
duplicate task IDs = REJECT
self dependency = REJECT
all targets must exist in same admitted plan
```

`taskId` grammar is not redefined by Coordination.

It must be accepted by the canonical AgentTask contract used to establish that task.

## C2-5.3 Fingerprint bounds

All Coordination / Worker Routing fingerprints consumed by #111:

```text
exact pattern = ^[a-f0-9]{64}$
exact length = 64
```

`taskRoutingFingerprint` must be computed by the existing `computeWorkerRoutingTaskFingerprint()` path.

No second hash domain is introduced.

## C2-5.4 Evidence/reference bounds

Unless a referenced owning contract has a stricter bound, opaque evidence/reference strings defined by this Coordination contract use:

```text
minLength = 1
maxLength = 2048
```

This applies to:

```text
executionAuthorizationRef
executionOutcomeRef
resultValidationRef
evidenceRefs[]
proposedFollowUpTaskRefs[]
authorizationRef
CoordinationConcurrencyCeilingRefV1.evidenceRef
```

Arrays:

```text
evidenceRefs:
  minItems = 0
  maxItems = 32
  duplicate refs = REJECT

proposedFollowUpTaskRefs:
  minItems = 0
  maxItems = 32
  duplicate refs = REJECT

concurrencyCeilingRefs:
  minItems = 0
  maxItems = 16
  duplicate sourceId = REJECT
```

## C2-5.5 Concurrency numeric bounds

Each `CoordinationConcurrencyCeilingRefV1.ceiling`:

```text
integer
minimum = 1
maximum = 32
```

A value above 32 is rejected rather than clamped.

A missing list permits sequential planning but does not permit concurrent dispatch.

## C2-5.6 Cancellation bounds

`CoordinationCancellationRequestV1`:

```text
unknown keys = REJECT
cancellationRequestId = exact local-id grammar
authorizationRef = 1..2048 chars
coordinationPlanFingerprint = exact 64 lowercase-hex
targetScope = COORDINATION | TASK
targetTaskId = canonical taskId or null according to targetScope
requestedAt = non-empty, maxLength 64
```

Timestamp freshness/grammar remains owned by the future reviewed owning cancellation/authorization surface.

Coordination must not invent current time or repair a timestamp.

## C2-5.7 Result bounds

`CoordinationTaskResultV1` remains bounded:

```text
workerId
  → reuse canonical Worker Registry workerId grammar

routingDecisionFingerprint
  → null or exact 64 lowercase-hex

executionAttemptId
  → null or opaque reference 1..2048 chars

executionAuthorizationRef
executionOutcomeRef
resultValidationRef
  → null or opaque reference 1..2048 chars

evidenceRefs
  → 0..32 unique refs

proposedFollowUpTaskRefs
  → 0..32 unique refs
```

A missing required canonical reference must never be synthesized.

---

# Correction-2 invariants

```text
C2-M1  Coordination progression is derived by one fixed precedence table.
C2-M2  Policy DENY never becomes execution FAILED.
C2-M3  EXECUTION_UNKNOWN has higher precedence than cancellation.
C2-M4  Every dependency lifecycle state maps to one edge class.
C2-M5  Dependency aggregate output is deterministic.
C2-M6  CoordinationPlan fingerprint facts are exact and closed.
C2-M7  Plan changes require a new fingerprint; old-bound evidence is not reusable.
C2-M8  Cancellation Authority is not created by Coordination.
C2-M9  Worker/model/protocol messages cannot cancel work.
C2-M10 Effective concurrency ceiling is narrowing-only minimum of applicable ceilings.
C2-M11 Missing/unknown concurrency evidence cannot permit parallel dispatch.
C2-M12 All V1 coordination-owned arrays and identifiers have finite parser bounds.
C2-M13 Unknown keys and duplicates fail closed.
C2-M14 No correction grants Provider/Harness/GitHub mutation authority.
C2-M15 External mutation remains behind ACTION-GATEWAY-V1.
```

# Re-Review-2 assertions

Independent Definition Re-Review-2 must verify at least:

```text
RR2-1  every coordination progression state has an exact derivation path
RR2-2  contradictory execution/authorization/result observations fail closed
RR2-3  dependency mapping covers every lifecycle state with no OR ambiguity
RR2-4  fingerprint fact set is exact; no "at least" extension remains normative
RR2-5  plan mutation cannot reuse prior fingerprint-bound evidence
RR2-6  cancellation has exact source, binding, target, validation-owner semantics
RR2-7  cancellation cannot overwrite EXECUTION_UNKNOWN or prior terminal evidence
RR2-8  concurrency precedence is minimum/applicable and missing evidence HOLDs
RR2-9  parser bounds are finite and duplicate/unknown-key behavior is closed
RR2-10 no new execution or mutation Authority is introduced
```

# Gate

```text
MULTI-AGENT-COORDINATION-V1
Definition Correction-2: APPLIED

Definition Lock: NOT AUTHORIZED
Implementation Start: NOT AUTHORIZED
Real multi-worker execution: HOLD
Provider / Harness invocation: NOT AUTHORIZED
External mutation: NOT AUTHORIZED
A2A integration: NOT AUTHORIZED
Ready / Merge / Deploy: NOT AUTHORIZED

Next:
MULTI-AGENT-COORDINATION-V1
Independent Definition Re-Review-2
```
