# PLAN-SCOPE-GUARD-V1 — Slice A

## Status

- Definition: LOCKED
- Implementation Start: GO
- Slice: A — READ-ONLY / Shadow Evaluation
- Implementation Correction: Correction-1
- Repository baseline: `c15dbd60fe51bcb894dc555fee5defb859d3df5f`
- Runtime Enforcement: NOT AUTHORIZED
- Worker Intervention: NOT AUTHORIZED
- Plan Mutation: NOT AUTHORIZED
- GitHub Mutation: NOT AUTHORIZED
- Ready / Merge / Deploy: NOT AUTHORIZED

## Purpose

Slice A evaluates whether a proposed implementation action remains within an approved plan without changing the worker execution path.

```text
READ
→ validate contracts
→ verify approval eligibility
→ bind Plan / Task / Action evidence
→ evaluate scope
→ emit SHADOW evidence
```

A shadow result never grants or denies execution authority.

## Implementation Correction-1

Independent Implementation Review-1 identified four issues:

1. final decisions relied too heavily on caller-provided classification flags;
2. reuse checks bound identity strings but not underlying Plan / Action content;
3. the public evaluation path lacked strict runtime contract validation and contradiction fail-closed behavior;
4. the JSON fixture registry and executable Vitest cases were separately maintained.

Correction-1 addresses each issue without expanding the authorized Slice A write boundary.

## Existing contract reuse

`AgentTaskV1` remains the canonical task contract. The Scope Guard uses the existing task parser and reuses:

- objective
- allowedPaths
- forbiddenPaths
- acceptanceCriteria
- constraints
- repository/base revision binding

The Scope Guard adds only facts not owned by `AgentTaskV1`:

- immutable Plan identity/version and Scope Snapshot identity
- Canonical Approval Resolution Evidence
- Proposed Action identity/content
- evidence classifications with canonical source bindings
- Shadow Scope Evaluation Record

## Runtime contract validation

`evaluatePlanScopeShadowV1` accepts an unknown runtime value and resolves it through `parsePlanScopeGuardInputV1` before evaluation.

Validation is fail-closed and includes:

- strict root/nested keys
- AgentTaskV1 parsing
- required identity/reference fields
- enum values
- bounded arrays
- repository-relative affected target paths
- strict timestamps
- classification shape
- source-binding shape

Malformed input returns `PLAN-SCOPE-GUARD-REJECTED-V1 / REJECTED_CONTRACT` and does not fabricate a Scope Decision.

## Approval / Scope state separation

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

Prohibited conversions remain:

```text
Approval INVALID → OUT_OF_SCOPE
Approval UNKNOWN → Scope UNKNOWN
NOT_EVALUATED → fabricated Scope Decision
```

## Scope evidence binding

`ScopeEvidenceClassificationV1` is evidence, not authority.

A classification that claims canonical inclusion/exclusion must bind to the actual canonical source:

```text
explicitIncluded
→ sourceBindings.explicitInScope
→ must resolve to PlanScopeSnapshotV1.explicitInScope
```

```text
acceptanceRequired
→ sourceBindings.acceptanceCriteria
→ must resolve to AgentTaskV1.acceptanceCriteria
```

```text
explicitExcluded
→ sourceBindings.explicitOutOfScope
→ must resolve to PlanScopeSnapshotV1.explicitOutOfScope
```

A necessary-dependency claim must bind to an existing Acceptance Criterion and carry technical-constraint and required-change evidence references.

Unresolved classification binding produces:

```text
UNKNOWN
CLASSIFICATION_BINDING_INVALID
```

Worker justification by itself never creates canonical inclusion.

## Actual path boundary evaluation

The evaluator compares every `proposedAction.affectedTargets` value against existing `AgentTaskV1.allowedPaths` and `forbiddenPaths`.

```text
Target intersects forbiddenPaths
+
canonical inclusion claim
→ UNKNOWN / CONFLICTING_SCOPE
```

```text
Target outside allowedPaths
+
materialPlanChangeRequired
→ SCOPE_EXTENSION_REQUIRED / PATH_OUTSIDE_ALLOWED_SCOPE
```

```text
Target outside allowedPaths
without approved extension evidence
→ OUT_OF_SCOPE / PATH_OUTSIDE_ALLOWED_SCOPE
```

Being inside an allowed path is only a boundary condition. It does not by itself prove semantic IN_SCOPE status.

## Contradiction fail-closed

Contradictory evidence is not resolved by priority order into an optimistic state.

Examples:

```text
explicitIncluded
+
unrequestedGeneralization
→ UNKNOWN / CONTRADICTORY_CLASSIFICATION
```

```text
materialPlanChangeRequired
+
opportunisticWork
→ UNKNOWN / CONTRADICTORY_CLASSIFICATION
```

## Content-derived decision binding

Correction-1 adds deterministic SHA-256 fingerprints over canonical JSON facts.

`planScopeFingerprint` binds the Scope Decision to:

- task identity/repository/base revision
- objective
- allowed/forbidden paths
- acceptance criteria
- task constraints
- Plan identity/version
- Scope Snapshot identity
- explicit in-scope/out-of-scope contents

`proposedActionFingerprint` binds the decision to:

- Proposed Action identity
- action type
- description
- affected targets
- justification
- actor
- classification values
- classification evidence references
- classification source bindings

A prior decision is reusable only when both identity bindings and content-derived fingerprints still match.

Therefore:

```text
Action content changed
+
Action Identity unchanged
→ prior decision NOT REUSABLE
```

and:

```text
Plan scope content changed
+
Scope Snapshot Identity unchanged
→ prior decision NOT REUSABLE
```

## Synthetic fixture single source

`docs/plan-scope-guard/fixtures/fixture-set-v1.json` is the canonical executable fixture registry.

The file uses schema:

`PLAN-SCOPE-GUARD-SYNTHETIC-FIXTURE-SET-V2`

Vitest loads this registry directly and executes its patches/expected outcomes instead of maintaining a duplicate hand-written scenario list.

Current fixture baseline:

```text
Positive fixtures: 14
Negative / fail-open fixtures: 11
Total: 25
```

Correction-specific coverage includes:

- forbidden target plus caller inclusion claim
- Action content change with stable identity
- Plan scope content change with stable snapshot identity
- contradictory inclusion/generalization
- contradictory extension/opportunistic work
- malformed Approval evidence contract

All fixtures are synthetic. No customer production data, credentials, or personal information are used.

## Disabled capability evidence

Slice A continues to export explicit `false` constants for:

- runtime enforcement
- worker stop
- plan mutation
- GitHub mutation
- Ready
- Merge
- Deploy

Correction-1 does not change those boundaries.

## Implementation files

```text
src/domain/planScopeGuard.ts
test/planScopeGuard.test.ts
docs/plan-scope-guard/plan-scope-guard-v1.md
docs/plan-scope-guard/fixtures/fixture-set-v1.json
```

No Slice A change is authorized or required under:

```text
src/worker/**
src/runtime/**
src/ui/**
migrations/**
.github/workflows/**
```

## Verification state

Local isolated verification performed while preparing Correction-1 established:

```text
TypeScript structural check of corrected component/test shape: PASS
Synthetic fixture logic: 25 / 25 expected behavior confirmed
```

These results are implementation-preparation evidence only. Exact-head repository `npm run typecheck`, `npm test`, and `npm run build` still require repository/CI execution evidence before Independent Implementation Re-Review can declare the implementation complete.

## Next gate

After exact-head identity and repository verification evidence are established:

```text
PLAN-SCOPE-GUARD-V1
Slice A
Independent Implementation Re-Review-1
```
