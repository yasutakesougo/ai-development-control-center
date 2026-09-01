# Finding Disposition V1

## Purpose

Keep review severity separate from the decision about whether a finding belongs in the current Slice.

Every material finding records both:

```text
severity
disposition
```

## Required record

```text
findingId
severity = P0 | P1 | P2 when that scale is used
disposition = MUST_FIX | SHOULD_FIX | DEFER | REJECT
scopeRequirementOrEvidenceLink
rationale
followUpReference when DEFER applies
```

## Dispositions

### MUST_FIX

Use for a demonstrated current-Slice defect such as:

```text
locked requirement violation
incorrect behavior
security boundary violation
data corruption / loss risk
authority or mutation-boundary violation
acceptance criterion failure
```

A blocking MUST_FIX prevents review-clearance until corrected or the governing Definition is explicitly changed by Human authority.

### SHOULD_FIX

Use for a realistic current-Slice maintainability, usability, reliability, or clarity problem that is not a correctness or Authority blocker.

The reviewer must state why it belongs in the current Slice.

### DEFER

Use when the concern is plausible but does not need resolution in the current Slice.

DEFER does not block current review-clearance unless the governing Definition says otherwise.

The finding remains auditable and should include a concise reason and follow-up reference when useful.

### REJECT

Use when the proposed correction is speculative, duplicative, outside locked scope, or would add more complexity than the demonstrated risk justifies.

REJECT requires a concise rationale and must not erase the original finding.

## Reviewer burden of proof

A finding that forces current-Slice correction must identify at least one of:

```text
locked requirement affected
acceptance criterion affected
current implementation behavior affected
current realistic failure path
current authority/security boundary affected
```

A hypothetical future concern without one of these links defaults to DEFER or REJECT rather than automatic Correction.

This rule must not weaken security, data-integrity, or explicit Authority findings.

## Invariants

```text
severity != disposition
high severity alone does not invent current-Slice scope
DEFER / REJECT findings remain visible as evidence
reviewer recommendation != Human authority
```
