# MULTI-AGENT-COORDINATION-V1
## Definition Correction-4

**Status: DEFINITION CORRECTION-4 APPLIED · NO IMPLEMENTATION · NO PROVIDER/HARNESS INVOCATION · NO EXTERNAL MUTATION**

This document is a normative Definition delta for Issue #111.

Correction-4 closes Independent Definition Re-Review-3 findings only.

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
Independent Definition Re-Review-3

Verdict: CORRECTION REQUIRED
P0: 0
P1: 1
P2: 1
```

Correction mapping:

```text
Re-Review-3 P1-1 → C4-1 NOT_REQUIRED result-validation evidence binding
Re-Review-3 P2-1 → C4-2 exact progression evaluator input/output envelope
```

---

# C4-1 — `NOT_REQUIRED` result-validation evidence is mandatory

Correction-3 permits this success derivation:

```text
EXECUTION_SUCCEEDED
+ resultValidationObservation == NOT_REQUIRED
→ SUCCEEDED / EXECUTION_VALIDATION_NOT_REQUIRED
```

Correction-4 fixes the evidence requirement.

## C4-1.1 Exact result-validation evidence rules

```text
resultValidationObservation == NOT_EVALUATED
→ resultValidationRef MUST be null

resultValidationObservation == NOT_REQUIRED
→ resultValidationRef MUST be non-null
→ ref MUST bind to owning-surface evidence explicitly establishing
  that result validation is not required for this exact task / attempt

resultValidationObservation == RESULT_VALID
→ resultValidationRef MUST be non-null

resultValidationObservation == RESULT_INVALID
→ resultValidationRef MUST be non-null

resultValidationObservation == RESULT_UNKNOWN
→ resultValidationRef MUST be non-null
```

A `NOT_REQUIRED` enum value alone is insufficient evidence.

The Coordinator must not infer `NOT_REQUIRED` from:

```text
missing validator
missing validation output
provider behavior
worker claim
model output
execution success
previous task behavior
protocol message
harness configuration
```

## C4-1.2 Binding failure

If `NOT_REQUIRED` is present without exact owning evidence, or if the evidence is stale/mismatched/unattributable under the owning surface:

```text
Stage A = INVALID
coordinationProgressionStatus = UNKNOWN
coordinationProgressionReason = OBSERVATION_CONTRADICTION
```

Therefore `SUCCEEDED / EXECUTION_VALIDATION_NOT_REQUIRED` is reachable only when the owning surface has explicitly and evidentially established `NOT_REQUIRED` for the exact task/attempt.

---

# C4-2 — Exact progression evaluator envelope

Slice B must not invent the state-evaluator input/output contract.

V1 uses the following closed coordination-owned evaluator envelope.

## C4-2.1 Supporting closed enums

```ts
type CoordinationDependencyEvaluationV1 =
  | "SATISFIED"
  | "PENDING"
  | "BLOCKED";

type CoordinationResourceConcurrencyEvaluationV1 =
  | "PASS"
  | "WAIT";
```

Their semantics remain those fixed by Correction-2/3.

## C4-2.2 Exact input

```ts
type CoordinationProgressionInputV1 = {
  schemaVersion: "MULTI-AGENT-COORDINATION-PROGRESSION-INPUT-V1";
  coordinationId: string;
  coordinationPlanFingerprint: string;
  taskId: string;

  authorizationObservation: CoordinationAuthorizationObservationV1;
  executionObservation: CoordinationExecutionObservationV1;
  resultValidationObservation: CoordinationResultValidationObservationV1;

  executionAuthorizationRef: string | null;
  executionAttemptId: string | null;
  executionOutcomeRef: string | null;
  resultValidationRef: string | null;

  dependencyEvaluation: CoordinationDependencyEvaluationV1 | null;
  resourceConcurrencyEvaluation: CoordinationResourceConcurrencyEvaluationV1 | null;

  acceptedCancellationRequest: CoordinationCancellationRequestV1 | null;
};
```

These are the exact V1 input keys.

No additional input key participates in V1 progression evaluation.

Unknown keys fail closed.

No input field may be inferred from conversation text, hidden reasoning, current clock time, provider output, or harness state outside a reviewed bound record.

## C4-2.3 Exact nullability and binding rules

### Plan/task identity

```text
coordinationId
→ MUST match current admitted CoordinationPlanV1

coordinationPlanFingerprint
→ MUST match exact current admitted plan fingerprint

taskId
→ MUST identify exactly one task in that admitted plan
```

Mismatch:

```text
→ progression input invalid
→ UNKNOWN / OBSERVATION_CONTRADICTION
```

### Authorization reference

```text
authorizationObservation == NOT_EVALUATED
→ executionAuthorizationRef MUST be null

authorizationObservation != NOT_EVALUATED
→ executionAuthorizationRef MUST be non-null
```

A non-null authorization ref must be attributable to the owning authorization/policy surface for this exact task/attempt context.

### Execution attempt / outcome references

```text
executionObservation == NOT_INVOKED
→ executionAttemptId MUST be null
→ executionOutcomeRef MUST be null

executionObservation == RUNNING
→ executionAttemptId MUST be non-null
→ executionOutcomeRef MUST be null

executionObservation in
  EXECUTION_SUCCEEDED | EXECUTION_FAILED | EXECUTION_UNKNOWN
→ executionAttemptId MUST be non-null
→ executionOutcomeRef MUST be non-null
```

### Result-validation reference

Use C4-1 exactly:

```text
NOT_EVALUATED → resultValidationRef == null
NOT_REQUIRED  → resultValidationRef != null
RESULT_VALID  → resultValidationRef != null
RESULT_INVALID → resultValidationRef != null
RESULT_UNKNOWN → resultValidationRef != null
```

### Dependency/resource evaluation nullability

Before readiness evaluation has started for a newly admitted task:

```text
dependencyEvaluation = null
resourceConcurrencyEvaluation = null
→ PLANNED may be derived only if Stage-A observation matrices otherwise pass
```

After readiness evaluation begins:

```text
dependencyEvaluation MUST be non-null
resourceConcurrencyEvaluation MUST be non-null before READY / WAITING_RESOURCE / WAITING_HUMAN_GATE / authorization progression can be derived
```

A partial readiness pair is invalid:

```text
one null + one non-null
→ UNKNOWN / OBSERVATION_CONTRADICTION
```

### Cancellation request

```text
acceptedCancellationRequest == null
→ no cancellation branch

acceptedCancellationRequest != null
→ request MUST independently pass C2-4 / C3 binding rules
→ coordinationId / plan fingerprint / target MUST bind to this exact input task or coordination scope
```

Invalid cancellation binding:

```text
→ UNKNOWN / OBSERVATION_CONTRADICTION
```

## C4-2.4 Exact output

```ts
type CoordinationProgressionDecisionV1 = {
  schemaVersion: "MULTI-AGENT-COORDINATION-PROGRESSION-DECISION-V1";
  coordinationId: string;
  coordinationPlanFingerprint: string;
  taskId: string;
  coordinationProgressionStatus: CoordinationProgressionStatusV1;
  coordinationProgressionReason: CoordinationProgressionReasonV1;
};
```

These are the exact V1 decision keys.

Unknown output fields are not part of the canonical V1 decision identity.

The decision contains no execution Authority flag.

```text
coordinationProgressionStatus != execution authorization
coordinationProgressionReason != execution authorization
```

## C4-2.5 Evaluation algorithm

The evaluator must execute exactly:

```text
1. parse exact CoordinationProgressionInputV1
2. validate plan/task identity binding
3. validate exact nullability/reference rules
4. validate C3 authorization × execution matrix
5. validate C3 execution × result-validation matrix
6. validate accepted cancellation binding if present
7. if any validation fails:
     UNKNOWN / OBSERVATION_CONTRADICTION
8. otherwise apply C3 total first-match Stage-B progression table
9. emit CoordinationProgressionDecisionV1
```

No caller-selected precedence is allowed.

No implicit retry, fallback, provider invocation, execution, mutation, or Human approval occurs in this evaluator.

## C4-2.6 V1 bounds reused

```text
coordinationId
→ Correction-2 local identifier grammar

coordinationPlanFingerprint
→ ^[a-f0-9]{64}$

taskId
→ canonical AgentTask taskId grammar

opaque non-null refs
→ 1..2048 chars unless owning contract is stricter
```

No trimming, normalization, repair, defaulting, or deduplication is allowed.

---

# Correction-4 invariants

```text
C4-M1  NOT_REQUIRED cannot produce SUCCEEDED without owning evidence.
C4-M2  Missing/mismatched NOT_REQUIRED evidence derives UNKNOWN.
C4-M3  Slice B receives one exact closed progression input contract.
C4-M4  Slice B emits one exact closed progression decision contract.
C4-M5  Nullability/reference semantics are deterministic.
C4-M6  Plan/task/cancellation bindings are rechecked before state derivation.
C4-M7  No caller-selected precedence exists.
C4-M8  Progression decision contains zero execution Authority.
C4-M9  No correction introduces provider, harness, GitHub, Ready, Merge, or Deploy authority.
C4-M10 External mutation remains behind ACTION-GATEWAY-V1.
```

# Re-Review-4 assertions

```text
RR4-1  NOT_REQUIRED requires exact result-validation evidence.
RR4-2  all result-validation states have exact ref nullability.
RR4-3  progression evaluator input keys are closed.
RR4-4  progression evaluator output keys are closed.
RR4-5  all observation/ref nullability combinations are deterministic.
RR4-6  readiness nullability cannot fall through accidentally.
RR4-7  cancellation binding is revalidated against exact input identity.
RR4-8  evaluator algorithm order is exact.
RR4-9  no state output grants execution Authority.
RR4-10 prior Review/Re-Review findings remain closed.
```

# Gate

```text
MULTI-AGENT-COORDINATION-V1
Definition Correction-4: APPLIED

Definition Lock: NOT AUTHORIZED
Implementation Start: NOT AUTHORIZED
Real multi-worker execution: HOLD
Provider / Harness invocation: NOT AUTHORIZED
External mutation: NOT AUTHORIZED
Ready / Merge / Deploy: NOT AUTHORIZED

Next:
MULTI-AGENT-COORDINATION-V1
Independent Definition Re-Review-4
```
