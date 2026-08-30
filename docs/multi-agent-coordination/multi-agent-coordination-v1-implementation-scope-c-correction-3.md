# MULTI-AGENT-COORDINATION-V1
## Implementation Scope Definition — Slice C / Correction-3

Status: NORMATIVE AMENDMENT / PRE-IMPLEMENTATION P1 CLOSURE

Target:
MAC-IMPL-SLICE-C

Prior exact scope head:
`a36d4f77514948dce0b3aa7d590ecb98fe0bbff4`

Trigger:
Pre-implementation findings recorded after Independent Scope Re-Review-1.

Findings:
1. Slice B progression input validation and existing B26 test admit `WAITING_HUMAN_GATE` only with a non-null `executionAuthorizationRef`, while Slice C Correction-2 requires the shared-state snapshot representation of `WAITING_HUMAN_GATE` to have `executionAuthorizationRef = null`.
2. Correction-2 requires progression status / task / coordination mismatches against the exact progression decision identity to fail closed, but `progressionDecisionRef + progressionDecisionFingerprint` alone does not provide enough local material to verify semantic correspondence when external lookup is prohibited.

This document resolves both conflicts without changing Slice A/B parser or evaluator behavior.

## C3-1 — Separate observation input from shared-state snapshot semantics

Slice B and Slice C represent different contract layers.

```text
Slice B CoordinationProgressionInputV1
= observation/evaluation input envelope

Slice B CoordinationProgressionDecisionV1
= canonical progression decision output

Slice C CoordinationSharedStateSnapshotV1
= immutable shared-state binding snapshot
```

The three contracts MUST NOT be treated as field-for-field mirrors.

In particular:

```text
Slice B input executionAuthorizationRef
!= automatically admitted Slice C snapshot executionAuthorizationRef
```

A reference present in a Slice B observation input proves only that the input carried that reference under the Slice B contract. It does not by itself prove that an execution authorization exists in the Slice C shared-state representation.

## C3-2 — Preserve Slice B behavior exactly

Slice C implementation MUST NOT modify existing Slice A/B parser or evaluator outcomes solely to satisfy Slice C snapshot semantics.

Therefore the following existing behavior remains unchanged in this slice:

```text
refsAreConsistent behavior
WAITING_HUMAN_GATE progression evaluation behavior
existing B26 test expectation
existing CoordinationProgressionInputV1 schema
existing CoordinationProgressionDecisionV1 schema
```

Any future semantic revision to Slice B requires a separately reviewed Slice B correction and is out of scope for MAC-IMPL-SLICE-C.

## C3-3 — Canonical Slice C rule for WAITING_HUMAN_GATE

Correction-2 remains controlling for the Slice C snapshot contract.

For a `CoordinationTaskStateBindingV1` whose `coordinationProgressionStatus` is `WAITING_HUMAN_GATE`:

```text
workerId: REQUIRED
workerAuthorityFingerprint: REQUIRED
routingDecisionFingerprint: REQUIRED
humanDecisionRef: OPTIONAL
executionAuthorizationRef: MUST_BE_NULL
executionAttemptId: MUST_BE_NULL
executionOutcomeRef: MUST_BE_NULL
resultValidationRef: MUST_BE_NULL
```

A Slice C snapshot carrying `WAITING_HUMAN_GATE` plus a non-null `executionAuthorizationRef` MUST be rejected as incoherent.

## C3-4 — Progression binding is by exact decision identity, not raw input copying

Slice C binds progression using:

```text
progressionDecisionRef
progressionDecisionFingerprint
progressionDecision
coordinationProgressionStatus
```

The canonical status is admitted from the exact bound Slice B progression decision identity.

Slice C does not copy every raw field from the Slice B progression input envelope into the shared-state snapshot.

Therefore a valid Slice B evaluation path may have historically consumed an input reference while the resulting Slice C `WAITING_HUMAN_GATE` snapshot still correctly records:

```text
executionAuthorizationRef = null
```

This is not data repair or semantic rewriting because the two fields belong to different contracts and have different admission meanings.

## C3-5 — No authority laundering

The following remain invariants:

```text
Human Decision != Execution Authorization
Human GO != executionAuthorizationRef
Observation reference != execution authorization
Progression decision != execution authorization
snapshotDigest != Authority
Evidence Digest != Authority
progressionDecisionFingerprint != Authority
```

Slice C MUST NOT infer, manufacture, promote, or preserve an execution authorization merely because an observation input contained a similarly named reference.

## C3-6 — Implementation acceptance additions

Add or preserve focused tests proving:

```text
C37 existing Slice B B26 behavior remains unchanged
C38 Slice C WAITING_HUMAN_GATE with executionAuthorizationRef != null -> REJECT
C39 Slice C WAITING_HUMAN_GATE with executionAuthorizationRef == null -> PASS when all other requirements hold
C40 Slice B input reference is not automatically copied into Slice C snapshot
C41 humanDecisionRef does not substitute for executionAuthorizationRef in READY/RUNNING/FAILED/SUCCEEDED states
C42 bound progression decision identity is required independently of snapshot executionAuthorizationRef
C43 progressionDecisionFingerprint mismatch against supplied progressionDecision -> REJECT
C44 progressionDecision taskId mismatch -> REJECT
C45 progressionDecision coordinationId mismatch -> REJECT
C46 progressionDecision coordinationPlanFingerprint mismatch -> REJECT
C47 progressionDecision status mismatch -> REJECT
```

## C3-7 — Changed-area boundary

Correction-3 does not widen implementation mutation scope.

Implementation mutation remains limited to exactly:

```text
src/domain/multiAgentCoordination.ts
test/multiAgentCoordination.test.ts
```

No persistence, dispatch, Provider, Harness, Runner, Action Gateway, GitHub product mutation, Ready, Merge, Deploy, or LIVE WRITE capability is authorized.

## C3-8 — Exact local progression-decision verification material

Because Slice C is prohibited from performing network/database lookup, exact progression binding MUST be verifiable from material present in the snapshot itself.

`CoordinationTaskStateBindingV1` SHALL therefore include the complete canonical Slice B decision object:

```ts
progressionDecision: CoordinationProgressionDecisionV1;
progressionDecisionRef: string;
progressionDecisionFingerprint: string;
```

`progressionDecisionRef` remains provenance only.

`progressionDecisionFingerprint` is computed deterministically from the complete canonical `CoordinationProgressionDecisionV1` object using:

```text
MAC_PROGRESSION_DECISION_V1\n<canonical-json>
```

with SHA-256 and the repository's existing canonical JSON / cryptographic primitive.

The Slice C validator MUST verify all of the following without external lookup:

```text
progressionDecision parses under existing Slice B decision contract
progressionDecision.coordinationId == snapshot.coordinationId
progressionDecision.coordinationPlanFingerprint == snapshot.coordinationPlanFingerprint
progressionDecision.taskId == taskState.taskId
progressionDecision.coordinationProgressionStatus == taskState.coordinationProgressionStatus
computed progression decision fingerprint == progressionDecisionFingerprint
progressionDecisionRef is non-empty
```

Any mismatch MUST be rejected.

This embedded decision object is validation material only.
It does not create Authority and does not re-run or reinterpret Slice B.

## Gate effect

```text
Prior Human Implementation Start GO:
SUSPENDED pending Independent Scope Re-Review-2

Correction-3:
APPLIED

Repository implementation mutation:
NOT AUTHORIZED UNTIL RE-REVIEW-2 PASS + exact-head Human Implementation Start GO revalidation

Ready / Merge / Deploy / LIVE WRITE:
NOT AUTHORIZED
```

## Next Gate

```text
Independent Scope Re-Review-2
→ if PASS, exact corrected HEAD fixation
→ Human Implementation Start GO revalidation against that exact HEAD
→ implementation
→ npm run verify
```
