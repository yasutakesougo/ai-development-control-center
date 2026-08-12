<!--
Title: DEPENDENCY-SCHEDULER-V1 — single-repo ready Issue selection under dependency and lock constraints
Action: UPDATE GitHub Issue #70
-->

# DEPENDENCY-SCHEDULER-V1

## Objective

Select which validated implementation Issues may be dispatched **now** inside a
**single repository**, based on dependency readiness, RESOURCE-LOCK-V1, Human
gates, and fixed local concurrency.

This is the single-repo scheduler. It does **not** evaluate RepositoryPolicyV1.

## Dependencies

Depends on #68 DEPENDENCY-GRAPH-V1 and #69 RESOURCE-LOCK-V1.

## Decision inputs (IN)

- dependency
- resource lock
- Human gate
- fixed local concurrency

## Explicitly out (OUT)

```text
RepositoryPolicyV1 = OUT
Repository Registry = OUT
cross-repository fairness / global concurrency = OUT
```

Multi-repo integration happens in #74:

```text
Dependency Scheduler
+ Repository Registry
+ Repository Policy
→ Multi-Repo Scheduler
```

## Decisions

```text
READY_TO_DISPATCH
WAIT_DEPENDENCY
WAIT_RESOURCE_CONFLICT
WAIT_HUMAN_GATE
HOLD
REJECT
UNKNOWN
```

## Rules

- scheduler does not write code
- scheduler does not modify Issue authority fields
- UNKNOWN never promotes to READY
- dependency completion must be observed, not inferred
- lock must be acquired before READY_TO_DISPATCH
- deterministic priority/tie-break rules
- initial per-repository mutation concurrency defaults to 1 (fixed local default; not policy-driven)
- no repository-policy lookup in this slice

## Acceptance

Given several Issues in one repository, the scheduler deterministically chooses
safe ready work and leaves blocked/conflicting/Human-gated work waiting — without
consulting RepositoryPolicyV1.

## Delivery gate

Implementation → verify → Draft PR → Fresh Review → STOP.
