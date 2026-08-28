# PLAN-SCOPE-GUARD-V1 — Slice A

## Status

- Definition: LOCKED
- Implementation Start: GO
- Slice: A — READ-ONLY / Shadow Evaluation
- Repository baseline: `c15dbd60fe51bcb894dc555fee5defb859d3df5f`
- Runtime Enforcement: NOT AUTHORIZED
- Worker Intervention: NOT AUTHORIZED
- Plan Mutation: NOT AUTHORIZED
- GitHub Mutation: NOT AUTHORIZED
- Ready / Merge / Deploy: NOT AUTHORIZED

## Purpose

Slice A evaluates whether a proposed implementation action remains within an approved plan without changing the worker execution path.

The component is observation/evaluation only:

```text
READ
→ normalize evidence
→ check canonical approval eligibility
→ evaluate scope
→ emit SHADOW evidence
```

A shadow result never grants or denies execution authority.

## Existing contract reuse

`AgentTaskV1` remains the task contract. The guard reuses its objective, path boundaries, acceptance criteria, constraints, and repository binding instead of creating a second task model.

Slice A adds only the scope-control facts not owned by `AgentTaskV1`:

- immutable Plan identity/version and Scope Snapshot identity
- Canonical Approval Resolution Evidence
- Proposed Action identity and evidence classification
- Shadow Scope Evaluation Record

## State separation

Approval Resolution and Scope Decision are distinct state spaces.

```text
Approval VALID
→ Scope Evaluation eligible

Approval INVALID
→ NOT_EVALUATED
→ PLAN_NOT_APPROVED

Approval UNKNOWN
→ NOT_EVALUATED
→ APPROVAL_RESOLUTION_REQUIRED
```

The following conversions are prohibited:

```text
Approval INVALID → OUT_OF_SCOPE
Approval UNKNOWN → Scope UNKNOWN
NOT_EVALUATED → fabricated Scope Decision
```

Scope decisions, when evaluation is eligible, are:

- `IN_SCOPE`
- `SCOPE_EXTENSION_REQUIRED`
- `OUT_OF_SCOPE`
- `UNKNOWN`

## Evidence classification boundary

`ScopeEvidenceClassificationV1` is input evidence, not authority. Slice A intentionally does not infer final scope from keywords in worker prose.

Final decision resolution is deterministic over the evidence flags. A future classifier may produce candidate evidence, but it does not acquire execution or scope-approval authority by doing so.

The guard requires fail-closed behavior when evidence is insufficient.

## Necessary dependency

A necessary dependency may support `IN_SCOPE` only when its dependency chain is established. An incomplete chain produces `UNKNOWN / INSUFFICIENT_EVIDENCE`.

If a necessary or acceptance-required action also conflicts with an explicit exclusion, the result is:

```text
UNKNOWN
CONFLICTING_SCOPE
```

The explicit exclusion is not silently overridden.

## Scope extension

A material plan change that is reasonably required but not approved in the current plan produces a shadow `SCOPE_EXTENSION_REQUIRED` decision.

Slice A does not create an amendment request and does not mutate the plan.

## Identity binding and reuse

A prior decision is reusable only when all of the following still match:

- evaluator version
- task identity
- plan identity
- plan version
- scope snapshot identity
- approval resolution evidence identity
- proposed action identity

A changed plan, scope snapshot, approval evidence, or proposed action requires a new evaluation.

## Disabled capability evidence

Slice A exports explicit `false` constants for prohibited surfaces:

- runtime enforcement
- worker stop
- plan mutation
- GitHub mutation
- Ready
- Merge
- Deploy

Tests assert these values remain disabled.

## Synthetic acceptance fixtures

Synthetic fixtures are stored in `docs/plan-scope-guard/fixtures/fixture-set-v1.json`.

The baseline set contains:

```text
Positive fixtures: 14
Negative fail-open fixtures: 6
Total: 20
```

No customer production data, credentials, or personal information are used.

Positive scenarios cover:

1. explicit in-scope
2. acceptance-required action
3. verified necessary dependency
4. explicit exclusion
5. necessary dependency vs explicit exclusion conflict
6. opportunistic fix
7. unrequested generalization
8. rational scope extension
9. insufficient evidence
10. approval INVALID
11. approval UNKNOWN
12. changed action identity
13. changed plan identity
14. changed scope snapshot identity

Negative scenarios cover prohibited fail-open conversions and stale decision reuse.

## Implementation files

```text
src/domain/planScopeGuard.ts
test/planScopeGuard.test.ts
docs/plan-scope-guard/plan-scope-guard-v1.md
docs/plan-scope-guard/fixtures/fixture-set-v1.json
```

No Slice A change is required under:

```text
src/worker/**
src/runtime/**
src/ui/**
migrations/**
.github/workflows/**
```

## Acceptance target

The Slice A acceptance target is:

```text
FX-001..FX-014: expected behavior confirmed
NG-001..NG-006: fail-open behavior rejected
Total: 20 / 20
```

Test success is implementation evidence only. It does not authorize Ready, Merge, Deploy, Runtime Enforcement, or Worker Intervention.

## Next gate

After exact-head implementation evidence is available:

```text
PLAN-SCOPE-GUARD-V1
Slice A
Independent Implementation Review-1
```
