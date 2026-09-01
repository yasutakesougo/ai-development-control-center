# Human Understanding Check V1

## Purpose

Confirm that the Human operator can explain the current review-cleared Implementation Scope before implementation authority is granted.

This check does not itself authorize implementation.

```text
Human Understanding PASS != Human Implementation Start GO
```

## Required record

```text
unit
scopeReference
scopeHeadOrFingerprint
Q1 What will change?
Q2 Why is the change needed?
Q3 What is the exact boundary?
Q4 What intentionally will not change?
Q5 What observable result means success?
result = PASS | HOLD
checkedAt
Human authority reference when applicable
```

## Human-readable Plan

A compact plan may be derived from the reviewed Scope using only:

```text
Purpose
Current behavior
Behavior after change
Changed area
Explicit non-changes
Key design decisions and reasons
Primary Slice-relevant failure modes
Acceptance criteria
```

The plan must not add requirements absent from the reviewed Scope.

## PASS

```text
PASS
= the Human can answer Q1-Q5 from the current reviewed Scope without relying on "the AI says it passed" as the explanation.
```

## HOLD

```text
HOLD
= one or more answers are materially unclear, contradictory, or require unstated assumptions.
```

HOLD returns to Scope clarification and does not automatically require redesign.

## Scope-binding and stale evidence

Human Understanding evidence is bound to the exact reviewed Scope identified by:

```text
scopeReference
scopeHeadOrFingerprint
```

If that reviewed Scope changes materially after PASS:

```text
prior Human-readable Plan = STALE
prior Human Understanding PASS = STALE
STALE evidence must not satisfy the pre-Implementation-Start check
updated Scope must complete required Scope Review / Re-Review
Human-readable Plan must be regenerated or re-read from the updated review-cleared Scope
Q1-Q5 must be reconfirmed against that current Scope
```

A non-material metadata-only correction may preserve the prior check only when it does not change intended behavior, changed area, explicit non-changes, design decisions, failure modes, or acceptance criteria and the Scope reference/fingerprint semantics treat it as the same reviewed Scope.

## Authority boundary

```text
Understanding PASS != implementation authority
Understanding HOLD != architecture redesign requirement
AI-generated summary != Human GO
```
