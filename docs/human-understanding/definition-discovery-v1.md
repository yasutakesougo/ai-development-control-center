# Definition Discovery / Grilling V1

## Purpose

Provide an optional preparatory pattern for materially ambiguous work before finalizing the existing Issue / Definition authority surface.

Definition Discovery is not an authorization Gate and does not create a second specification source.

```text
Discovery output -> existing Issue / Definition authority surface
Discovery COMPLETE != Definition Lock
Discovery COMPLETE != implementation authority
```

## When to use

Use when one or more are true:

```text
materially ambiguous Human intent
unsettled domain terminology
multiple reasonable product behaviors
material or hard-to-reverse Human trade-off
repository evidence conflicts with requested behavior
```

`NOT_REQUIRED` is valid for work such as:

```text
trivial typo/docs-only correction
formatter-only correction
already-locked mechanical implementation
small deterministic maintenance with no unresolved Human decision
```

## Evidence-first classification

Inspect available repository evidence before asking the Human.

Classify unresolved items as:

```text
FACT
= repository/evidence can establish the answer

DECISION
= multiple acceptable choices exist and Human intent is required

UNKNOWN
= evidence is insufficient and no authorized decision has resolved it
```

Do not ask the Human for facts that can be established from repository evidence with reasonable confidence.

`UNKNOWN` must remain UNKNOWN until evidence or Human authority resolves it.

## Questioning behavior

Ask unresolved Human decisions incrementally and in dependency order.

A question may include:

```text
question
recommended answer
reason for recommendation
material alternatives
consequence of each alternative when relevant
```

A recommendation is advisory only and must not be recorded as the Human decision until accepted.

## Artifact ownership boundary

```text
Issue / Definition
= requirements and current work authority source

CONTEXT.md, when present
= glossary/domain terminology only
= no current Gate state
= no implementation specification
= no current authority

ADR, when present
= durable hard decision with material trade-off or reversal cost
= not Slice-local implementation detail

conversation-only decision
= allowed when it has no durable project significance
```

A Discovery artifact must not compete with the reviewed Definition as the requirement source of truth.

## Minimum record

```text
unit
repositoryEvidenceReferences
resolvedFacts
HumanDecisions
preservedUnknowns
explicitNonGoals
result = COMPLETE | HOLD | NOT_REQUIRED
```

Discovery is complete when the future Definition can distinguish resolved facts, Human decisions, preserved UNKNOWNs, and explicit non-goals.

Discovery does not require every future implementation detail to be known.
