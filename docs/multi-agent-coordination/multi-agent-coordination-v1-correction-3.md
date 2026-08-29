# MULTI-AGENT-COORDINATION-V1
## Definition Correction-3

**Status: DEFINITION CORRECTION-3 APPLIED · NO IMPLEMENTATION · NO PROVIDER/HARNESS INVOCATION · NO EXTERNAL MUTATION**

This document is a normative Definition delta for Issue #111.

It is read with the prior Definition artifacts at the same branch history.

Correction-3 supersedes only the corrected C2-1 progression rules and C2-4 concurrency-ceiling applicability rules.

It does not authorize Definition Lock, Implementation Start, Provider/Harness invocation, external mutation, Ready, Merge, or Deploy.

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
Independent Definition Re-Review-2

Verdict: CORRECTION REQUIRED
P0: 0
P1: 2
P2: 0
```

Correction mapping:

```text
Re-Review-2 P1-1 → C3-1 Closed observation-validity matrices + total progression mapping
Re-Review-2 P1-2 → C3-2 Exact current-plan concurrency policy source-set binding
```

---

# C3-1 — Closed observation validity and total progression mapping

Coordination progression is evaluated in two stages.

```text
Stage A: validate observation combination
Stage B: derive progression by exact first-match precedence
```

Stage B must never run on an invalid Stage-A combination.

An invalid observation combination derives exactly:

```text
UNKNOWN / OBSERVATION_CONTRADICTION
```

This is a Coordination-plane reconciliation state only.

It does not rewrite the owning authorization, execution, or result-validation evidence.

## C3-1.1 Added progression reasons

Correction-3 adds these reason codes:

```text
OBSERVATION_CONTRADICTION
RESULT_VALIDATION_PENDING
AUTHORIZED_NOT_INVOKED
```

The complete relevant reason vocabulary is therefore the Correction-2 vocabulary plus these values.

## C3-1.2 Authorization × execution validity matrix

Exact validity matrix:

| Authorization observation | NOT_INVOKED | RUNNING | EXECUTION_SUCCEEDED | EXECUTION_FAILED | EXECUTION_UNKNOWN |
| --- | --- | --- | --- | --- | --- |
| NOT_EVALUATED | VALID | INVALID | INVALID | INVALID | INVALID |
| AUTHORIZED | VALID | VALID | VALID | VALID | VALID |
| DENIED | VALID | INVALID | INVALID | INVALID | INVALID |
| WAITING_HUMAN_GATE | VALID | INVALID | INVALID | INVALID | INVALID |
| HOLD | VALID | INVALID | INVALID | INVALID | INVALID |
| UNKNOWN | VALID | INVALID | INVALID | INVALID | INVALID |

Any `INVALID` cell:

```text
→ UNKNOWN / OBSERVATION_CONTRADICTION
```

Coordination must not infer that execution was authorized merely because execution evidence exists.

Contradictory evidence requires reconciliation.

## C3-1.3 Execution × result-validation validity matrix

Exact validity matrix:

| Execution observation | NOT_REQUIRED | NOT_EVALUATED | RESULT_VALID | RESULT_INVALID | RESULT_UNKNOWN |
| --- | --- | --- | --- | --- | --- |
| NOT_INVOKED | VALID | VALID | INVALID | INVALID | INVALID |
| RUNNING | VALID | VALID | INVALID | INVALID | INVALID |
| EXECUTION_SUCCEEDED | VALID | VALID | VALID | VALID | VALID |
| EXECUTION_FAILED | VALID | VALID | INVALID | INVALID | INVALID |
| EXECUTION_UNKNOWN | VALID | VALID | INVALID | INVALID | VALID |

Any `INVALID` cell:

```text
→ UNKNOWN / OBSERVATION_CONTRADICTION
```

`RESULT_UNKNOWN` with `EXECUTION_UNKNOWN` remains valid uncertainty and still derives Coordination `UNKNOWN`.

## C3-1.4 Stage-A validation order

Stage A applies this order:

```text
1. authorization × execution matrix
2. execution × result-validation matrix
3. evidence-reference presence/binding checks required by the observed non-default state
4. accepted-cancellation binding checks when cancellation is present
```

Failure of any Stage-A check:

```text
→ UNKNOWN / OBSERVATION_CONTRADICTION
→ no later progression rule is evaluated
```

No impossible combination may fall through to dependency, resource, Human Gate, or readiness logic.

## C3-1.5 Total Stage-B progression precedence

After Stage A passes, apply the following exact first-match order.

```text
1. execution == EXECUTION_UNKNOWN
   → UNKNOWN / EXECUTION_UNKNOWN

2. execution == EXECUTION_SUCCEEDED
   AND resultValidation == RESULT_UNKNOWN
   → UNKNOWN / RESULT_UNKNOWN

3. execution == EXECUTION_FAILED
   → FAILED / EXECUTION_FAILED

4. execution == EXECUTION_SUCCEEDED
   AND resultValidation == RESULT_INVALID
   → FAILED / RESULT_INVALID

5. execution == EXECUTION_SUCCEEDED
   AND resultValidation == RESULT_VALID
   → SUCCEEDED / EXECUTION_AND_RESULT_VALID

6. execution == EXECUTION_SUCCEEDED
   AND resultValidation == NOT_REQUIRED
   → SUCCEEDED / EXECUTION_VALIDATION_NOT_REQUIRED

7. execution == EXECUTION_SUCCEEDED
   AND resultValidation == NOT_EVALUATED
   → RUNNING / RESULT_VALIDATION_PENDING

8. execution == RUNNING
   → RUNNING / EXECUTION_RUNNING

9. authorization == DENIED
   AND execution == NOT_INVOKED
   → NOT_EXECUTED / AUTHORIZATION_DENIED

10. accepted cancellation
    AND execution == NOT_INVOKED
    → CANCELLED / CANCELLATION_ACCEPTED

11. dependency evaluation == BLOCKED
    → HOLD / DEPENDENCY_BLOCKED

12. authorization == HOLD
    AND execution == NOT_INVOKED
    → HOLD / AUTHORIZATION_HOLD

13. authorization == UNKNOWN
    AND execution == NOT_INVOKED
    → HOLD / AUTHORIZATION_UNKNOWN

14. dependency evaluation == PENDING
    → WAITING_DEPENDENCY / DEPENDENCY_PENDING

15. resource/concurrency evaluation == WAIT
    → WAITING_RESOURCE / RESOURCE_WAIT

16. authorization == WAITING_HUMAN_GATE
    AND execution == NOT_INVOKED
    → WAITING_HUMAN_GATE / HUMAN_GATE_WAIT

17. authorization == AUTHORIZED
    AND execution == NOT_INVOKED
    AND dependency evaluation == SATISFIED
    AND resource/concurrency evaluation == PASS
    → READY / AUTHORIZED_NOT_INVOKED

18. authorization == NOT_EVALUATED
    AND execution == NOT_INVOKED
    AND dependency evaluation == SATISFIED
    AND resource/concurrency evaluation == PASS
    → READY / READY_FOR_AUTHORIZATION

19. newly admitted task before dependency/resource evaluation exists
    → PLANNED / PLAN_ADMITTED
```

No other Stage-B output is permitted in V1.

## C3-1.6 Cancellation interaction is exact

Cancellation does not overwrite owning execution outcomes.

```text
accepted cancellation + NOT_INVOKED + authorization != DENIED
→ CANCELLED / CANCELLATION_ACCEPTED

accepted cancellation + NOT_INVOKED + authorization == DENIED
→ NOT_EXECUTED / AUTHORIZATION_DENIED

accepted cancellation + RUNNING
→ RUNNING / EXECUTION_RUNNING
→ cancellation request remains audit evidence
→ interruption/reconciliation remains owned by execution surface

accepted cancellation + EXECUTION_SUCCEEDED
→ terminal result mapping wins

accepted cancellation + EXECUTION_FAILED
→ FAILED / EXECUTION_FAILED

accepted cancellation + EXECUTION_UNKNOWN
→ UNKNOWN / EXECUTION_UNKNOWN
```

This ordering preserves policy denial and canonical execution evidence.

## C3-1.7 Evidence-reference presence rules

A non-default observation requires its owning evidence reference.

At minimum:

```text
authorization != NOT_EVALUATED
→ executionAuthorizationRef MUST be non-null

execution != NOT_INVOKED
→ executionAttemptId MUST be non-null
→ executionOutcomeRef MUST be non-null for terminal/UNKNOWN outcome

resultValidation in RESULT_VALID | RESULT_INVALID | RESULT_UNKNOWN
→ resultValidationRef MUST be non-null
```

Missing required evidence is a Stage-A contradiction:

```text
→ UNKNOWN / OBSERVATION_CONTRADICTION
```

No reference may be synthesized by Coordination.

---

# C3-2 — Exact concurrency policy source-set binding

Correction-2 defined `minimum(all applicable ceilings)`.

Correction-3 removes caller discretion around `applicable` and closes stale-plan / omitted-policy-source reuse.

Concurrent dispatch requires one exact concurrency-policy input bound to the current immutable Coordination Plan.

## C3-2.1 Exact input

```ts
type CoordinationConcurrencyCeilingRefV1 = {
  sourceId: string;
  coordinationId: string;
  coordinationPlanFingerprint: string;
  ceiling: number;
  evidenceRef: string;
};

type CoordinationConcurrencyPolicyInputV1 = {
  schemaVersion: "MULTI-AGENT-COORDINATION-CONCURRENCY-POLICY-V1";
  coordinationId: string;
  coordinationPlanFingerprint: string;
  requiredSourceIds: string[];
  requiredSourceSetEvidenceRef: string;
  ceilingRefs: CoordinationConcurrencyCeilingRefV1[];
  requestedConcurrentCount: number;
};
```

This contract is coordination-side binding evidence only.

It does not create policy Authority.

`requiredSourceIds` must be supplied by attributable reviewed repository/project policy evidence represented by `requiredSourceSetEvidenceRef`.

Coordination must not invent or silently reduce the required source set.

If that owning source-set evidence cannot be proven, concurrent dispatch is `WAIT` / fail closed.

## C3-2.2 Exact source-set validation

For a concurrent-dispatch request, all conditions must pass:

```text
input.coordinationId == current admitted plan.coordinationId
input.coordinationPlanFingerprint == current admitted plan fingerprint
requiredSourceSetEvidenceRef is present and attributable to owning reviewed policy evidence
requiredSourceIds count >= 1
requiredSourceIds are unique
ceilingRefs count == requiredSourceIds count
set(ceilingRefs.sourceId) == set(requiredSourceIds)
each ceilingRef.sourceId is unique
each ceilingRef.coordinationId == input.coordinationId
each ceilingRef.coordinationPlanFingerprint == input.coordinationPlanFingerprint
each ceilingRef.evidenceRef is present and attributable to that source
each ceiling is an integer within V1 bounds
requestedConcurrentCount is an integer within V1 bounds
```

Any failure:

```text
resource/concurrency evaluation = WAIT
coordination progression = WAITING_RESOURCE / RESOURCE_WAIT
```

No missing required source is ignored.

No extra/unrecognized source is ignored.

No stale-plan ceiling record is accepted.

## C3-2.3 Exact effective ceiling

After all source-set validation passes:

```text
effectiveConcurrencyCeiling
= minimum(ceilingRefs[*].ceiling)
```

Then:

```text
requestedConcurrentCount <= effectiveConcurrencyCeiling
→ concurrency ceiling check = PASS

requestedConcurrentCount > effectiveConcurrencyCeiling
→ resource/concurrency evaluation = WAIT
```

A higher ceiling never overrides a lower applicable required ceiling.

## C3-2.4 Sequential behavior

```text
requestedConcurrentCount == 1
→ sequential path
→ concurrency source-set input is not required by #111
```

This does not bypass other resource-lock, authorization, Human Gate, or execution-surface requirements.

```text
requestedConcurrentCount >= 2
→ concurrent path
→ CoordinationConcurrencyPolicyInputV1 REQUIRED
```

## C3-2.5 Exact bounds

```text
requiredSourceIds:
  minItems = 1
  maxItems = 16
  duplicates = REJECT
  each sourceId minLength = 1
  each sourceId maxLength = 128

requiredSourceSetEvidenceRef:
  minLength = 1
  maxLength = 2048

ceilingRefs:
  minItems = 1
  maxItems = 16
  unique by sourceId

ceiling:
  integer
  minimum = 1
  maximum = 32

requestedConcurrentCount:
  integer
  minimum = 1
  maximum = 32

coordinationPlanFingerprint:
  exact pattern = ^[a-f0-9]{64}$
```

Unknown keys fail closed.

No trimming, normalization, deduplication, defaulting, or clamping is allowed.

---

# Correction-3 invariants

```text
C3-M1  Invalid observation combinations are detected before progression mapping.
C3-M2  Every valid AUTHORIZATION × EXECUTION combination has deterministic treatment.
C3-M3  Every valid EXECUTION × RESULT combination has deterministic treatment.
C3-M4  AUTHORIZED + NOT_INVOKED has an exact READY mapping.
C3-M5  EXECUTION_SUCCEEDED + NOT_EVALUATED result has an exact pending-validation mapping.
C3-M6  Policy DENY is never converted to execution FAILED or cancellation.
C3-M7  Required evidence references cannot be synthesized.
C3-M8  Concurrent dispatch is bound to exact current plan identity.
C3-M9  Required concurrency policy source set is externally evidenced and cannot be silently reduced.
C3-M10 Missing/extra/stale/mismatched concurrency sources fail closed.
C3-M11 Effective ceiling is always the minimum of the complete required source set.
C3-M12 Coordination still creates zero execution or external-mutation Authority.
```

# Re-Review-3 assertions

```text
RR3-1  Stage-A validity matrices are closed and evaluated before Stage B.
RR3-2  no valid observation combination falls through progression mapping.
RR3-3  contradictory authorization/execution/result evidence derives UNKNOWN only.
RR3-4  AUTHORIZED+NOT_INVOKED and result-validation-pending are exact.
RR3-5  cancellation cannot overwrite DENY or canonical terminal/UNKNOWN execution evidence.
RR3-6  concurrency source-set completeness is machine-checkable.
RR3-7  current-plan fingerprint binding prevents stale ceiling reuse.
RR3-8  effective ceiling is narrowing-only minimum.
RR3-9  missing policy-source evidence cannot permit parallel dispatch.
RR3-10 no new execution/mutation Authority is introduced.
```

# Gate

```text
MULTI-AGENT-COORDINATION-V1
Definition Correction-3: APPLIED

Definition Lock: NOT AUTHORIZED
Implementation Start: NOT AUTHORIZED
Real multi-worker execution: HOLD
Provider / Harness invocation: NOT AUTHORIZED
External mutation: NOT AUTHORIZED
Ready / Merge / Deploy: NOT AUTHORIZED

Next:
MULTI-AGENT-COORDINATION-V1
Independent Definition Re-Review-3
```
