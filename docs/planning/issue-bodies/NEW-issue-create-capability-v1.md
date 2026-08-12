<!--
Title: ISSUE-CREATE-CAPABILITY-V1 — github.issue.create.v1 mutation authority boundary
Action: CREATE new GitHub Issue
-->

# ISSUE-CREATE-CAPABILITY-V1

## Objective

Define and register the narrow GitHub Issue creation capability so that VALID
IssueProposalV1 never becomes GitHub write authorization by itself.

Capability ID:

```text
github.issue.create.v1
```

This slice is the **mutation authority boundary** between planning/validation and
ISSUE-PUBLISHER-V1 (#66).

## Dependencies

Depends on Action Gateway capability model (`github.comment.create.v1` pattern /
#41 design lineage). Independent of #63/#64 planner-validator work; consumed by #66.

## Placement in the planning chain

```text
#63 ISSUE-VALIDATOR-V1 ────────┐
#64 ISSUE-DECOMPOSER-V1 ───────┼→ #66 ISSUE-PUBLISHER-V1
ISSUE-CREATE-CAPABILITY-V1 ────┘
```

Invariant preserved:

```text
proposal ≠ mutation authority
VALID ≠ GitHub write authorization
```

## Scope

- Capability Registry registration for `github.issue.create.v1` only
- exact proposal fingerprint binding (capability + repository + proposal identity + request fingerprint)
- idempotency key required; duplicate retry must not create duplicate Issues
- Approval / policy boundary before any adapter call
- Action Gateway 経由 only (no direct planner/validator GitHub write)
- generic `github.write` / `repo.write` forbidden

## Explicitly out of scope

- ISSUE-PUBLISHER-V1 implementation (#66)
- generic comment/PR/file/workflow mutations
- Issue close/reopen, labels, assignees
- Ready / Merge / Deploy / Agent execution authority
- RepositoryPolicyV1 / multi-repo publication policy (#73+)

## Rules

1. STATUS-OVERLAY / planner / validator output alone never authorizes Issue creation.
2. Authorization must bind to exact `github.issue.create.v1` + repository + proposal fingerprint + idempotency key.
3. Missing / malformed / stale / mismatched authorization fails closed before adapter invoke.
4. Authorization for comment create cannot authorize issue create, and vice versa.
5. DENY / unknown capability registration fails closed.
6. Secrets / tokens must never appear in request/result documents, UI, logs, or persisted evidence.

## Call path

```text
VALID IssueProposalV1
→ GitHub mutation authorization (this capability)
→ Action Gateway
→ github.issue.create.v1 adapter
→ Issue creation evidence
```

## Acceptance

`github.issue.create.v1` is registered as a narrow allowlisted capability with
exact fingerprint binding, idempotency, Approval/policy checks, and Action
Gateway-only execution. Publisher (#66) can depend on it without inventing write
authority.

## Delivery gate

Implementation → verify → Draft PR → Fresh Review → STOP.
