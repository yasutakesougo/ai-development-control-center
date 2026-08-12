<!--
Title: ISSUE-PUBLISHER-V1 — publish only validated IssueProposalV1 to GitHub Issues
Action: UPDATE GitHub Issue #66
Replace ISSUE-CREATE-CAPABILITY-V1 with the real issue number after create.
-->

# ISSUE-PUBLISHER-V1

## Objective

Create GitHub Issues only from exact VALID IssueProposalV1 records under the
narrow `github.issue.create.v1` capability boundary.

Publisher consumes mutation authority; it does not invent it.

## Dependencies

Depends on:

- #63 ISSUE-VALIDATOR-V1
- #64 ISSUE-DECOMPOSER-V1
- ISSUE-CREATE-CAPABILITY-V1 (`github.issue.create.v1`)

```text
#63 Validator ────────┐
#64 Decomposer ───────┼→ ISSUE-PUBLISHER-V1
ISSUE-CREATE-CAPABILITY-V1 ┘
```

## Capability

Only:

```text
github.issue.create.v1
```

No generic github.write/repo.write.

## Authority boundary

```text
VALID IssueProposalV1
→ GitHub mutation authorization (ISSUE-CREATE-CAPABILITY-V1)
→ Action Gateway
→ Issue creation
```

```text
proposal ≠ mutation authority
VALID ≠ GitHub write authorization
```

## Rules

- exact proposal fingerprint binding
- idempotency key required
- duplicate retry must not create duplicate Issues
- proposal VALID evidence required
- capability authorization evidence required
- title/body/dependency/scope/risk/capability/verification fields preserved
- no Agent execution authority
- no Ready/Merge/IssueClose/Deploy authority
- no direct GitHub write outside Action Gateway

## Acceptance

A VALID proposal with matching `github.issue.create.v1` authorization can create
exactly one GitHub Issue; stale/invalid/mutated/unauthorized proposals fail closed.

## Delivery gate

Implementation → verify → Draft PR → Fresh Review → STOP.
