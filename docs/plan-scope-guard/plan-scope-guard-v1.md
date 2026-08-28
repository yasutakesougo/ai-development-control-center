# PLAN-SCOPE-GUARD-V1 — Slice A

## Status

- Definition: LOCKED
- Implementation Start: GO
- Slice: A — READ-ONLY / Shadow Evaluation
- Implementation Correction: Correction-2
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
→ verify canonical approval eligibility
→ bind Action / Plan / classification provenance
→ resolve canonical evidence
→ evaluate scope by fixed precedence
→ emit SHADOW evidence
```

A shadow result never grants or denies execution authority.

## Implementation Correction-2

Independent Implementation Re-Review-1 left three unresolved P1 concerns:

1. a canonical scope entry could exist without proving that the evaluated Action was the Action classified against that entry;
2. Necessary Dependency evidence references only needed to be non-empty, not resolvable from the canonical evidence set;
3. contradiction handling remained pairwise and Approval Resolution Evidence content was not bound to stale-decision reuse checks.

Correction-2 addresses these concerns without expanding the authorized Slice A write boundary.

## Classification provenance and Action binding

`ScopeEvidenceClassificationV1` remains evidence, not authority.

Every classification now carries `ScopeClassificationProvenanceV1`:

```text
producer
method
version
evidenceRefs
actionBinding
```

The `actionBinding` must match the actual Proposed Action across:

```text
proposedActionIdentity
actionType
description
affectedTargets
justification
actor
```

The producer must also be different from the Proposed Action actor.

Canonical rule:

```text
Classification Producer
!=
Proposed Action Actor
```

and:

```text
Scope Entry Exists
!=
Action Bound To Scope Entry
```

Classification and provenance evidence references must resolve against the canonical `ScopeEvaluationInputV1.evidenceRefs` set.

If provenance does not bind to the exact Action or its evidence cannot be resolved:

```text
UNKNOWN
CLASSIFICATION_PROVENANCE_INVALID
```

## Canonical source bindings

The evaluator continues to resolve semantic claims against canonical Plan / AgentTask facts:

```text
explicitIncluded
→ sourceBindings.explicitInScope
→ PlanScopeSnapshotV1.explicitInScope
```

```text
acceptanceRequired
→ sourceBindings.acceptanceCriteria
→ AgentTaskV1.acceptanceCriteria
```

```text
explicitExcluded
→ sourceBindings.explicitOutOfScope
→ PlanScopeSnapshotV1.explicitOutOfScope
```

A Necessary Dependency must additionally resolve:

```text
acceptanceCriterion
→ AgentTaskV1.acceptanceCriteria

technicalConstraintRef
→ ScopeEvaluationInputV1.evidenceRefs

requiredChangeRef
→ ScopeEvaluationInputV1.evidenceRefs
```

Non-empty references alone are insufficient.

Canonical rule:

```text
Evidence Ref Exists As String
!=
Evidence Resolved
```

Unresolved binding produces:

```text
UNKNOWN
CLASSIFICATION_BINDING_INVALID
```

## Runtime contract validation

`evaluatePlanScopeShadowV1` still accepts `unknown` and runs `parsePlanScopeGuardInputV1` before evaluation.

Validation includes strict root/nested keys, canonical `AgentTaskV1` parsing, identity/reference fields, enum values, bounded arrays, repository-relative target paths, strict timestamps, classification source bindings, provenance shape, and Action binding shape.

Malformed input returns:

```text
PLAN-SCOPE-GUARD-REJECTED-V1
REJECTED_CONTRACT
```

without fabricating a Scope Decision.

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

The following remain prohibited:

```text
Approval INVALID → OUT_OF_SCOPE
Approval UNKNOWN → Scope UNKNOWN
NOT_EVALUATED → fabricated Scope Decision
```

## Canonical scope-state precedence

Correction-2 replaces optimistic pairwise priority with an explicit precedence matrix.

After contract, approval, evidence-binding, provenance, and dependency validation:

```text
1. Explicit exclusion + inclusion/material extension
   → UNKNOWN / CONFLICTING_SCOPE

2. Contradictory semantic states
   → UNKNOWN / CONTRADICTORY_CLASSIFICATION

3. Explicit exclusion alone
   → OUT_OF_SCOPE

4. materialPlanChangeRequired
   → SCOPE_EXTENSION_REQUIRED

5. Outside allowed path without material extension
   → OUT_OF_SCOPE

6. Current-plan inclusion
   → IN_SCOPE

7. Opportunistic/generalization/future/unplanned work
   → OUT_OF_SCOPE

8. Otherwise
   → UNKNOWN
```

Important invariant:

```text
materialPlanChangeRequired = true
+
ordinary IN_SCOPE evidence
→ must not silently become IN_SCOPE
```

Therefore a Necessary Dependency that also requires a material Plan change is classified as `SCOPE_EXTENSION_REQUIRED`, not ordinary `IN_SCOPE`.

A material extension combined with opportunistic, unrequested-generalization, or future-only classification fails closed as `UNKNOWN / CONTRADICTORY_CLASSIFICATION`.

## Actual path boundary evaluation

The evaluator compares every `proposedAction.affectedTargets` value against `AgentTaskV1.allowedPaths` and `forbiddenPaths`.

```text
Forbidden target
+
canonical inclusion/material extension
→ UNKNOWN / CONFLICTING_SCOPE
```

```text
Outside allowed path
+
materialPlanChangeRequired
→ SCOPE_EXTENSION_REQUIRED / PATH_OUTSIDE_ALLOWED_SCOPE
```

```text
Outside allowed path
without material extension
→ OUT_OF_SCOPE / PATH_OUTSIDE_ALLOWED_SCOPE
```

Being inside an allowed path never proves semantic `IN_SCOPE` status by itself.

## Content-derived decision binding

The Scope Evaluation Record is bound to three canonical fingerprints:

```text
planScopeFingerprint
approvalResolutionFingerprint
proposedActionFingerprint
```

### Plan Scope fingerprint

Binds Task/Plan identity and content including objective, repository/base revision, path boundaries, acceptance criteria, constraints, Plan identity/version, Scope Snapshot identity, and explicit scope contents.

### Proposed Action fingerprint

Binds Proposed Action content, classification, source bindings, and classification provenance.

### Approval Resolution fingerprint

Binds:

```text
approvalResolutionEvidenceId
planIdentity
planVersion
canonicalApprovalContractRef
canonicalApprovalResolverRef
planApprovalDecisionRef
planApprovalAuthorityRef
approvalStateSemanticsRef
resolutionResult
reasonCode
resolvedAt
evidenceRefs
supersededBy
```

Reuse requires both Approval Evidence ID and Approval Evidence fingerprint equality.

Therefore:

```text
same Approval Evidence ID
+
VALID → INVALID
→ prior Scope Decision NOT REUSABLE
```

and:

```text
same Approval Evidence ID
+
supersededBy changes
→ prior Scope Decision NOT REUSABLE
```

## Synthetic fixture single source

`docs/plan-scope-guard/fixtures/fixture-set-v1.json` remains the canonical executable fixture registry.

Schema:

`PLAN-SCOPE-GUARD-SYNTHETIC-FIXTURE-SET-V3`

Current fixture baseline:

```text
Positive fixtures: 14
Negative / fail-open fixtures: 17
Total: 31
```

Correction-2 adds coverage for:

- stale Action provenance despite a valid scope-entry reference
- unresolved Necessary Dependency evidence refs
- material extension + unrequested generalization
- material extension + Necessary Dependency precedence
- Approval VALID → INVALID with stable evidence ID
- Approval supersession with stable evidence ID

Vitest loads the registry directly and executes all fixture patches and expected outcomes.

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

Correction-2 does not change these boundaries.

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

Correction-2 preparation established:

```text
Focused TypeScript structural compile: PASS
Synthetic canonical fixture harness: 31 / 31 PASS
```

These are focused correction evidence only. Repository-wide exact-head `npm run typecheck`, `npm test`, and `npm run build` still require repository/CI execution evidence before Slice A can be considered complete.

## Next gate

After exact-head identity is fixed:

```text
PLAN-SCOPE-GUARD-V1
Slice A
Independent Implementation Re-Review-2
```
