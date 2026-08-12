<!--
Title: MULTI-REPO-SCHEDULER-V1 — repository-isolated parallel scheduling across projects
Action: UPDATE GitHub Issue #74
-->

# MULTI-REPO-SCHEDULER-V1

## Objective

Integrate single-repo Dependency Scheduler with Repository Registry and
Repository Policy so Control Center can schedule across multiple registered
repositories while preserving isolation and safety boundaries.

```text
Dependency Scheduler (#70)
+ Repository Registry (#72)
+ Repository Policy (#73)
→ Multi-Repo Scheduler (#74)
```

## Dependencies

Depends on #70 DEPENDENCY-SCHEDULER-V1, #72 REPOSITORY-REGISTRY-V1, and
#73 REPOSITORY-POLICY-V1.

## Requirements

- global concurrency limit
- per-repository concurrency limit (policy-driven; supersedes #70 fixed local default where policy exists)
- independent repository queues
- no cross-repository lock/state leakage
- repository policy evaluated before dispatch
- deterministic fairness/tie-break behavior
- conflicting tasks in same repo WAIT_RESOURCE_CONFLICT
- non-conflicting tasks in different repos may run concurrently
- no execution authority beyond downstream AgentTask/Orchestrator contracts

## Acceptance

Control Center can select safe work from at least two repositories concurrently
while preserving exact repository/task/policy identity.

## Delivery gate

Implementation → verify → Draft PR → Fresh Review → STOP.
