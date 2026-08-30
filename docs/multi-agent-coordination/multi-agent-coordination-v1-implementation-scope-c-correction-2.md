# MULTI-AGENT-COORDINATION-V1
## Implementation Scope Definition — Slice C / Correction-2

Status: NORMATIVE AMENDMENT / IMPLEMENTATION NOT AUTHORIZED

This Correction-2 amends `multi-agent-coordination-v1-implementation-scope-c.md` only for the findings recorded in Independent Scope Review-1 after Correction-1.

Where this document conflicts with Correction-1, this document controls for MAC-IMPL-SLICE-C.

```text
Scope baseline:
main @ 27c31e7f690e13eddb7f7b00d83e013ba0851947

Prior scope PR head reviewed:
09483210977b9b24746a23491a9ea67b1678d4aa

Implementation Start:
NOT AUTHORIZED
```

## C2-1 — Human Gate waiting is not execution authorization

`WAITING_HUMAN_GATE` MUST NOT require or admit an `executionAuthorizationRef`.

The corrected lifecycle requirement is:

```text
WAITING_HUMAN_GATE:
  workerId: R
  workerAuthorityFingerprint: R
  routingDecisionFingerprint: R
  humanDecisionRef: O
  executionAuthorizationRef: N
  executionAttemptId: N
  executionOutcomeRef: N
  resultValidationRef: N
```

Slice C may add `humanDecisionRef: string | null` to `CoordinationTaskStateBindingV1` solely as a reference to the owning Human Gate decision record.

Rules:

```text
Human decision reference != Execution Authorization
Human GO != executionAuthorizationRef
WAITING_HUMAN_GATE + executionAuthorizationRef != coherent state
READY/RUNNING/NOT_EXECUTED/FAILED/SUCCEEDED may require executionAuthorizationRef only when the owning execution-authorization domain has separately established it
```

Slice C does not issue or consume Human GO and does not create execution authorization.

## C2-2 — Exact immutable snapshot identity

The phrase `immutable snapshot` requires a deterministic exact identity.

Slice C SHALL introduce:

```ts
type CoordinationSharedStateSnapshotV1 = {
  schemaVersion: "MULTI-AGENT-COORDINATION-SHARED-STATE-SNAPSHOT-V1";
  snapshotDigest: string;
  coordinationId: string;
  coordinationPlanFingerprint: string;
  taskStates: CoordinationTaskStateBindingV1[];
  coordinationEvidenceBindings: CoordinationEvidenceBindingV1[];
  auditBindings: CoordinationEvidenceBindingV1[];
};
```

`snapshotDigest` is computed from the complete admitted snapshot payload excluding the `snapshotDigest` field itself, using the repository's deterministic canonical JSON function and an explicit digest domain separator:

```text
MAC_SHARED_STATE_SNAPSHOT_V1\n<canonical-json>
```

The implementation must use the repository's existing cryptographic digest primitive where already established; introducing a new external dependency is prohibited.

Rules:

```text
same admitted payload -> same digest
any admitted field change -> different digest
no timestamps, environment data, conversation state, filesystem state, or mutable lookup participate implicitly
snapshotDigest mismatch -> REJECT
snapshotDigest != Authority
snapshotDigest != freshness proof
snapshotDigest != execution permission
```

This identity exists so later Durable Claim / PREINVOKE contracts can bind to an exact shared-state observation without treating it as Authority.

## C2-3 — Immutable Evidence identity

A mutable reference string is insufficient for canonical evidence binding.

`CoordinationEvidenceBindingV1` is corrected to include immutable evidence identity:

```ts
type CoordinationEvidenceBindingV1 = {
  ref: string;
  evidenceDigest: string;
  ownerScope: "COORDINATION" | "TASK";
  coordinationId: string;
  taskId: string | null;
  kind: "EVIDENCE" | "AUDIT";
  sourceId: string;
};
```

Rules:

```text
ref alone != immutable evidence identity
sourceId alone != immutable evidence identity
(ref, evidenceDigest) identifies the admitted evidence object
empty / missing evidenceDigest -> REJECT
same ref + different evidenceDigest within one snapshot -> REJECT as ambiguous mutable-reference collision
same evidenceDigest assigned to contradictory owner identity -> REJECT
Evidence identity != Authority
```

Slice C does not fetch evidence to recompute the digest.
It validates the explicit admitted immutable identity supplied by the owning evidence domain.

## C2-4 — Exact progression-decision binding

`coordinationProgressionStatus` MUST be bound to the exact Slice B progression decision that produced it.

`CoordinationTaskStateBindingV1` is corrected to include:

```ts
progressionDecisionRef: string;
progressionDecisionFingerprint: string;
```

Rules:

```text
progressionDecisionRef non-empty REQUIRED for every task state
progressionDecisionFingerprint non-empty REQUIRED for every task state
status is admitted only together with its exact decision identity
bare progression status != canonical progression evidence
Slice C does not re-run or reinterpret Slice B
Slice C does not manufacture READY/SUCCEEDED/FAILED
```

The owning Slice B decision identity must be supplied as explicit canonical input.
A mismatch between supplied task identity / coordination identity / progression status and the bound progression decision identity fails closed.

## C2-5 — Snapshot-wide duplicate and collision validation

Duplicate/collision validation is snapshot-global, not merely per array.

The validator MUST construct a validation-only global identity set across:

```text
all per-task evidenceBindings
coordinationEvidenceBindings
auditBindings
```

No input ordering is changed.
No deduplication is performed.

Reject at minimum:

```text
exact duplicate evidence binding tuple anywhere in the snapshot
same ref + different evidenceDigest anywhere in the snapshot
same immutable evidence identity assigned to contradictory owner identity
same audit identity repeated across task/top-level arrays
cross-task reuse that changes owner task identity
```

Validation may use internal sets/maps but must preserve all admitted array order in returned data.

## Corrected acceptance additions

Add at minimum:

```text
C25 WAITING_HUMAN_GATE with executionAuthorizationRef -> REJECT
C26 WAITING_HUMAN_GATE without executionAuthorizationRef -> accepted when other requirements hold
C27 humanDecisionRef never substitutes for executionAuthorizationRef
C28 valid exact snapshotDigest -> PASS
C29 snapshotDigest mismatch -> REJECT
C30 identical payload deterministically reproduces snapshotDigest
C31 evidence binding missing evidenceDigest -> REJECT
C32 same ref + conflicting evidenceDigest -> REJECT snapshot-wide
C33 progression status missing progressionDecisionRef/fingerprint -> REJECT
C34 progression binding identity mismatch -> REJECT
C35 duplicate evidence tuple across different arrays -> REJECT
C36 global collision validation preserves original order
```

## Authority boundary

```text
Correction-2 != Implementation Start GO
Scope Re-Review PASS != Implementation Start GO
snapshotDigest != Authority
Evidence Digest != Authority
progressionDecisionFingerprint != Authority
Human Decision != Execution Authorization

Repository implementation mutation:
NOT AUTHORIZED BY THIS CORRECTION

Persistence / Dispatch / Provider / Harness / Action Gateway:
NOT AUTHORIZED

Ready / Merge / Deploy / LIVE WRITE:
NOT AUTHORIZED
```

## Next Gate

```text
Independent Scope Re-Review-1
→ only if PASS, separate Human Implementation Start GO / HOLD
```
