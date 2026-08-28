# PLAN-SCOPE-GUARD-V1 — Slice A

## Status

- Definition: LOCKED
- Implementation Start: GO
- Slice: A — READ-ONLY / Shadow Evaluation
- Repository baseline: `c15dbd60fe51bcb894dc555fee5defb859d3df5f`
- Implementation Correction: Correction-3
- Runtime Enforcement: NOT AUTHORIZED
- Worker Intervention: NOT AUTHORIZED
- Plan Mutation: NOT AUTHORIZED
- GitHub Mutation: NOT AUTHORIZED
- Ready / Merge / Deploy: NOT AUTHORIZED

## Purpose

Slice A observes a Proposed Action and emits a deterministic Shadow Scope Evaluation without modifying the worker execution path.

```text
READ
→ validate contracts
→ verify approval eligibility
→ bind Task / Plan / Approval / Action
→ verify canonical Action-to-Scope relation
→ evaluate scope
→ emit immutable SHADOW evidence
```

A Shadow Scope Decision is evidence only. It is not execution authority.

## Correction history

### Independent Implementation Review-1

Found:

- caller-provided classification could dominate the final decision;
- Plan / Action reuse was identity-only;
- runtime contract validation and contradiction handling were insufficient;
- synthetic fixtures were duplicated between JSON and Vitest.

Correction-1 added strict parsing, path-boundary checks, Plan/Action content fingerprints, contradiction fail-closed handling, and a canonical JSON fixture source.

### Independent Implementation Re-Review-1

Remaining / new findings:

- Action provenance was bound to the Action, but the semantic relationship to the referenced scope entry remained weak;
- Necessary Dependency refs were not resolved against canonical evidence;
- contradiction precedence remained incomplete;
- Approval Resolution Evidence content was not bound to decision reuse.

Correction-2 added exact Action provenance, canonical evidence resolution, deterministic precedence, and `approvalResolutionFingerprint`.

### Independent Implementation Re-Review-2

Remaining findings:

1. a caller could still provide an internally consistent semantic classification that referenced a real scope entry without proving that the Action belonged to that entry;
2. `scopeEvaluationId` did not include `planScopeFingerprint`, so materially different Plan content could produce an identical evaluation identity.

Correction-3 addresses exactly those two findings.

## Correction-3 — Canonical Action-to-Scope relation

Correction-3 adds `ScopeRelationRuleV1` to the approved Plan Scope Snapshot.

A rule is canonical Plan data and contains:

```text
ruleId
relationKind
sourceValue
actionTypes
affectedPathPrefixes
actionDescriptions
```

Supported relation kinds:

```text
EXPLICIT_IN_SCOPE
AC_REQUIRED
EXPLICIT_OUT_OF_SCOPE
NECESSARY_DEPENDENCY
```

The rule is content-bound into `planScopeFingerprint`.

A semantic classification flag can contribute to an `IN_SCOPE`, `OUT_OF_SCOPE`, or dependency decision only when the evaluated Action deterministically matches a canonical rule for the referenced Plan/Acceptance entry.

Matching requires:

```text
relation kind matches
+
source value matches
+
action type matches
+
action description matches an approved exact description
+
every affected target is within an approved rule path prefix
```

Therefore:

```text
Scope Entry Exists
!=
Action Belongs To Scope Entry
```

and:

```text
Action provenance valid
+
Scope entry exists
+
NO matching canonical relation rule
→ UNKNOWN / SCOPE_RELATION_UNRESOLVED
```

This closes the previous path where an unrelated Action inside an allowed repository path could be declared `explicitIncluded=true` merely by referencing an existing textual scope entry.

## Relation rules are Plan evidence, not worker authority

`ScopeRelationRuleV1` is part of `PlanScopeSnapshotV1` and therefore participates in the Plan Scope fingerprint.

The Implementation Worker does not gain authority to create or modify relation rules through Slice A.

```text
Scope Relation Rule Exists
!=
Execution Authority
```

Plan mutation remains outside Slice A.

## Classification provenance

Correction-2 provenance rules remain in force.

A classification carries:

```text
producer
method
version
evidenceRefs
actionBinding
```

The Action binding must exactly match:

```text
proposedActionIdentity
actionType
description
affectedTargets
justification
actor
```

and the producer must differ from the implementation actor.

Classification and provenance evidence refs must resolve against the canonical input evidence-ref set.

## Necessary Dependency

A Necessary Dependency requires:

```text
Acceptance Criterion
↓
Technical Constraint Evidence Ref
↓
Required Change Evidence Ref
↓
Canonical NECESSARY_DEPENDENCY relation rule
↓
Actual Proposed Action
```

The two evidence refs must occur in the canonical input evidence set.

A non-empty string is not sufficient evidence resolution.

## Canonical precedence

After contract, approval, source-binding, provenance, canonical relation, and evidence checks:

```text
1. explicit exclusion + inclusion/material extension
   → UNKNOWN / CONFLICTING_SCOPE

2. contradictory semantic states
   → UNKNOWN / CONTRADICTORY_CLASSIFICATION

3. explicit exclusion alone
   → OUT_OF_SCOPE

4. material plan change required
   → SCOPE_EXTENSION_REQUIRED

5. outside allowed path without material extension
   → OUT_OF_SCOPE

6. canonical current-plan inclusion
   → IN_SCOPE

7. opportunistic/generalization/future-only/unplanned work
   → OUT_OF_SCOPE

8. otherwise
   → UNKNOWN
```

## Content-derived fingerprints

Slice A now binds evaluation evidence to three independently changing fact sets:

```text
planScopeFingerprint
approvalResolutionFingerprint
proposedActionFingerprint
```

`planScopeFingerprint` includes:

- AgentTask identity/repository/base revision/objective;
- allowed and forbidden paths;
- acceptance criteria and constraints;
- Plan identity/version;
- Scope Snapshot identity;
- explicit in-scope/out-of-scope values;
- canonical `scopeRelationRules`.

`approvalResolutionFingerprint` includes all canonical Approval Resolution facts, including resolution state and supersession.

`proposedActionFingerprint` includes Action content, classification, evidence references, provenance, and exact Action binding.

## Correction-3 — Evaluation identity

`scopeEvaluationId` is now derived from:

```text
Evaluator Version
+
planScopeFingerprint
+
approvalResolutionFingerprint
+
proposedActionFingerprint
```

This means:

```text
Plan scope content changes
+
Plan Identity remains the same
+
Scope Snapshot Identity remains the same
→ prior decision NOT REUSABLE
→ new scopeEvaluationId MUST differ
```

Evaluation identity and evaluation reuse are therefore consistent with the immutable evidence model.

## Runtime validation

`evaluatePlanScopeShadowV1` accepts `unknown` and performs strict runtime parsing before evaluation.

Validation includes:

- strict root/nested keys;
- `AgentTaskV1` parsing;
- Plan and canonical relation-rule parsing;
- Approval Resolution contract parsing;
- Proposed Action and provenance parsing;
- repository-relative paths;
- strict timestamps with no silent calendar repair;
- bounded arrays and unique relation rule IDs.

Malformed input produces:

```text
PLAN-SCOPE-GUARD-REJECTED-V1
REJECTED_CONTRACT
```

No Scope Decision is fabricated.

## Approval / Scope separation

```text
Approval VALID
→ Scope Evaluation eligible

Approval INVALID
→ NOT_EVALUATED / PLAN_NOT_APPROVED

Approval UNKNOWN or superseded
→ NOT_EVALUATED / APPROVAL_RESOLUTION_REQUIRED
```

`NOT_EVALUATED` never carries a fabricated Scope Decision.

## Synthetic fixture single source

Canonical registry:

`docs/plan-scope-guard/fixtures/fixture-set-v1.json`

Schema:

`PLAN-SCOPE-GUARD-SYNTHETIC-FIXTURE-SET-V4`

Current baseline:

```text
Positive: 14
Negative / fail-open: 19
Total: 33
```

Correction-3 adds:

```text
NG-018
Unrelated Action
+ exact Action provenance
+ valid textual in-scope entry
+ no canonical relation rule for that Action
→ UNKNOWN / SCOPE_RELATION_UNRESOLVED
→ must not become IN_SCOPE
```

```text
NG-019
same Plan Identity
same Scope Snapshot Identity
same Approval
same Action
but Plan scope content changes
→ prior evaluation NOT REUSABLE
→ new scopeEvaluationId differs
```

Vitest loads the JSON registry directly; the scenario registry is not duplicated in a hand-written test list.

## Disabled capability evidence

Slice A continues to export explicit `false` constants for:

- runtime enforcement;
- worker stop;
- plan mutation;
- GitHub mutation;
- Ready;
- Merge;
- Deploy.

Correction-3 does not alter these boundaries.

## Implementation files

Authorized and changed area remains:

```text
src/domain/planScopeGuard.ts
test/planScopeGuard.test.ts
docs/plan-scope-guard/plan-scope-guard-v1.md
docs/plan-scope-guard/fixtures/fixture-set-v1.json
```

No Slice A change is authorized under:

```text
src/worker/**
src/runtime/**
src/ui/**
migrations/**
.github/workflows/**
```

## Verification boundary

Source/fixture inspection and focused structural verification may establish Correction implementation evidence, but they are not substitutes for repository-wide exact-head verification.

Until exact-head repository verification evidence exists:

```text
npm run typecheck: NOT ESTABLISHED
npm test: NOT ESTABLISHED
npm run build: NOT ESTABLISHED
npm run verify: NOT ESTABLISHED
```

## Next gate

After Correction-3 exact HEAD is frozen:

```text
PLAN-SCOPE-GUARD-V1
Slice A
Independent Implementation Re-Review-3
```
