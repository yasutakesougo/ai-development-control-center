# MULTI-AGENT-COORDINATION-V1
## Implementation Scope Definition — Slice B

**Status: IMPLEMENTATION SCOPE DEFINED · IMPLEMENTATION NOT YET AUTHORIZED**

This scope is bound to the locked Definition and the merged Slice A contracts:

```text
Definition commit:
3902b24985b9965d8b0042b1146bbfa85c491dc2

Definition artifacts:
docs/multi-agent-coordination/multi-agent-coordination-v1.md
docs/multi-agent-coordination/multi-agent-coordination-v1-correction-2.md
docs/multi-agent-coordination/multi-agent-coordination-v1-correction-3.md
docs/multi-agent-coordination/multi-agent-coordination-v1-correction-4.md

Slice A merge:
PR #113
merge commit: f7c526a36fef489ec4cce899fd5ef166315adece
```

This document defines only the second implementation slice.

```text
Slice ID:
MAC-IMPL-SLICE-B

Purpose:
deterministic coordination progression / state-transition evaluator

Execution:
NOT IN SCOPE
```

Correction-3 supersedes Correction-2 C2-1 progression precedence.
Slice B implements Correction-3 Stage A/B plus Correction-4 envelope algorithm.
It must not implement superseded C2-1.3 order.

## 1. Objective

Implement one pure evaluator that consumes a closed `CoordinationProgressionInputV1`
and an admitted `CoordinationPlanBindingV1`, then emits exactly one
`CoordinationProgressionDecisionV1`.

Slice B derives Coordination-plane progression only.

```text
plan valid != execution authorized
progression READY != dispatch
progression decision != Human GO
UNKNOWN != FAILED
```

Slice B grants zero execution Authority.

## 2. Exact changed area

Implementation mutation is limited to exactly these two source/test files:

```text
src/domain/multiAgentCoordination.ts
test/multiAgentCoordination.test.ts
```

The following artifact may be updated only for implementation evidence or
typo-level synchronization that does not change semantics:

```text
docs/multi-agent-coordination/multi-agent-coordination-v1-implementation-scope-b.md
```

No other source, test, script, configuration, UI, Worker, or deployment file
may change in Slice B.

If another file becomes necessary, STOP and return to Scope Correction /
Independent Scope Re-Review before changing it.

## 3. Existing code reused without modification

Slice B must reuse Slice A parsers/helpers rather than copying matrices or
fingerprint logic.

```text
parseCoordinationPlanV1()
captureCoordinationPlanFingerprintFacts()
computeCoordinationPlanFingerprint()
parseCoordinationCancellationRequestV1()
parseCoordinationProgressionInputV1()
parseCoordinationProgressionDecisionV1()
```

READ / IMPORT ONLY outside the two authorized files:

```text
src/domain/workerRouting.ts
src/domain/decisionFingerprint.ts
src/domain/agentTaskContract.ts
```

Slice B must not add a second canonical JSON, task-fingerprint, or observation
vocabulary implementation.

Slice A public parser semantics remain:

```text
schema/type/key failures → REJECTED_SCHEMA
plan/task/cancellation identity mismatch → REJECTED_BINDING
Stage-A matrix / nullability contradiction → REJECTED_CONTRADICTION
```

The new evaluator maps Stage-A / binding failures onto a progression decision.
It must not silently change those parser result codes for existing callers.

## 4. Contract implemented in Slice B

`src/domain/multiAgentCoordination.ts` may add exactly one evaluator API and
directly supporting private helpers.

### 4.1 Required API

```ts
evaluateCoordinationProgressionV1(
  raw: unknown,
  binding: CoordinationPlanBindingV1,
):
  | { ok: true; decision: CoordinationProgressionDecisionV1 }
  | { ok: false; reason: "REJECTED_SCHEMA" }
```

`binding` is required.

No optional nowIso, caller precedence, retry, or defaulting argument is allowed.

### 4.2 Evaluation algorithm

The evaluator must execute Correction-4 C4-2.5 exactly:

```text
1. parse exact CoordinationProgressionInputV1
2. validate plan/task identity binding
3. validate exact nullability/reference rules
4. validate C3 authorization × execution matrix
5. validate C3 execution × result-validation matrix
6. validate accepted cancellation binding if present
7. if any validation in 2–6 fails:
     emit UNKNOWN / OBSERVATION_CONTRADICTION
8. otherwise apply C3-1.5 total first-match Stage-B table
   as constrained by C3-1.6 cancellation interaction
9. emit CoordinationProgressionDecisionV1
```

`REJECTED_SCHEMA` is allowed only when a decision cannot be identity-bound
because the input is not a structurally parseable progression envelope
(unknown keys, wrong types, invalid enums, malformed ids/fingerprints,
malformed nested cancellation schema).

When identity fields parse and a decision can name
`coordinationId / coordinationPlanFingerprint / taskId` from the input,
Stage-A / binding failures MUST emit:

```text
ok: true
decision.coordinationProgressionStatus = UNKNOWN
decision.coordinationProgressionReason = OBSERVATION_CONTRADICTION
```

The decision identity fields are the input's claimed identity.
They must not be rewritten to the admitted plan identity.

No caller-selected precedence is allowed.

### 4.3 Stage-B table

After Stage A passes, apply C3-1.5 first-match order with no additions:

```text
1.  EXECUTION_UNKNOWN
    → UNKNOWN / EXECUTION_UNKNOWN
2.  EXECUTION_SUCCEEDED + RESULT_UNKNOWN
    → UNKNOWN / RESULT_UNKNOWN
3.  EXECUTION_FAILED
    → FAILED / EXECUTION_FAILED
4.  EXECUTION_SUCCEEDED + RESULT_INVALID
    → FAILED / RESULT_INVALID
5.  EXECUTION_SUCCEEDED + RESULT_VALID
    → SUCCEEDED / EXECUTION_AND_RESULT_VALID
6.  EXECUTION_SUCCEEDED + NOT_REQUIRED
    → SUCCEEDED / EXECUTION_VALIDATION_NOT_REQUIRED
7.  EXECUTION_SUCCEEDED + NOT_EVALUATED
    → RUNNING / RESULT_VALIDATION_PENDING
8.  RUNNING
    → RUNNING / EXECUTION_RUNNING
9.  DENIED + NOT_INVOKED
    → NOT_EXECUTED / AUTHORIZATION_DENIED
10. accepted cancellation + NOT_INVOKED
    → CANCELLED / CANCELLATION_ACCEPTED
11. dependency == BLOCKED
    → HOLD / DEPENDENCY_BLOCKED
12. HOLD + NOT_INVOKED
    → HOLD / AUTHORIZATION_HOLD
13. authorization UNKNOWN + NOT_INVOKED
    → HOLD / AUTHORIZATION_UNKNOWN
14. dependency == PENDING
    → WAITING_DEPENDENCY / DEPENDENCY_PENDING
15. resource/concurrency == WAIT
    → WAITING_RESOURCE / RESOURCE_WAIT
16. WAITING_HUMAN_GATE + NOT_INVOKED
    → WAITING_HUMAN_GATE / HUMAN_GATE_WAIT
17. AUTHORIZED + NOT_INVOKED + SATISFIED + PASS
    → READY / AUTHORIZED_NOT_INVOKED
18. NOT_EVALUATED + NOT_INVOKED + SATISFIED + PASS
    → READY / READY_FOR_AUTHORIZATION
19. newly admitted task before dependency/resource evaluation
    (dependencyEvaluation == null AND resourceConcurrencyEvaluation == null)
    → PLANNED / PLAN_ADMITTED
```

No other Stage-B output is permitted.

If a Stage-A-valid input matches no rule, fail closed as:

```text
UNKNOWN / OBSERVATION_CONTRADICTION
```

That safety net is not an authorized additional semantic state.
Tests must prove all 19 rules are reachable so fall-through is not the intended path.

### 4.4 Cancellation interaction

C3-1.6 is a constraint on the table, not a second precedence list.

Preserve:

```text
DENIED + NOT_INVOKED
→ NOT_EXECUTED / AUTHORIZATION_DENIED
(even if accepted cancellation is present)

accepted cancellation + NOT_INVOKED + authorization != DENIED
→ CANCELLED / CANCELLATION_ACCEPTED

accepted cancellation + RUNNING
→ RUNNING / EXECUTION_RUNNING

accepted cancellation + EXECUTION_SUCCEEDED
→ terminal result mapping wins (rules 2, 4, 5, 6, 7)

accepted cancellation + EXECUTION_FAILED
→ FAILED / EXECUTION_FAILED

accepted cancellation + EXECUTION_UNKNOWN
→ UNKNOWN / EXECUTION_UNKNOWN
```

Cancellation does not create cancellation Authority.
Slice A cancellation envelope validation remains structural/binding only.

### 4.5 Readiness nullability

Reuse Correction-4 C4-2.3:

```text
dependencyEvaluation and resourceConcurrencyEvaluation are both null
→ PLANNED is reachable only after Stage A passes and earlier rules do not match

one null + one non-null
→ UNKNOWN / OBSERVATION_CONTRADICTION

both non-null
→ later READY / WAITING_* / authorization rules may match
```

Rule 17/18 MUST NOT fire when either readiness field is null.

### 4.6 Capability flags

Slice B MUST set:

```text
MULTI_AGENT_COORDINATION_PROGRESSION_EVALUATOR_IMPLEMENTED = true
```

Slice B MUST keep all of the following `false`:

```text
MULTI_AGENT_COORDINATION_EXECUTION_IMPLEMENTED
MULTI_AGENT_COORDINATION_PROVIDER_INVOCATION_IMPLEMENTED
MULTI_AGENT_COORDINATION_HARNESS_INVOCATION_IMPLEMENTED
MULTI_AGENT_COORDINATION_GITHUB_MUTATION_IMPLEMENTED
MULTI_AGENT_COORDINATION_READY_IMPLEMENTED
MULTI_AGENT_COORDINATION_MERGE_IMPLEMENTED
MULTI_AGENT_COORDINATION_DEPLOY_IMPLEMENTED
```

`READY_IMPLEMENTED` remains GitHub Ready automation, not Coordination `READY`.

## 5. Explicitly prohibited in Slice B

```text
CoordinationConcurrencyPolicyInputV1 parser / concurrent-dispatch policy evaluator
shared-state / evidence store / Task Ledger / Decision Ledger / Audit Ledger writers
deriving dependencyEvaluation or resourceConcurrencyEvaluation from live GitHub/workflow/D1
worker dispatch
parallel dispatch
Agent Runner invocation
Provider invocation
Harness invocation
Munder Difflin integration
A2A implementation
MCP implementation
Worker-to-worker messaging runtime
resource lock acquisition runtime
Human approval creation or consumption
execution authorization decision
Tool execution
Action Gateway invocation
GitHub mutation by product
branch / commit / PR automation by product
Ready automation
Merge automation
Deploy automation
UI changes
Cloudflare Worker route changes
D1 schema or persistence changes
new package dependency
package.json changes
wrangler configuration changes
workflow changes
automatic retry / fallback
Slice C / D / E work
```

Slice B consumes `dependencyEvaluation` and `resourceConcurrencyEvaluation`
as already-derived closed inputs. It does not compute them.

## 6. Authority invariants

Implementation must preserve:

```text
Coordination != Authority
evaluator READY != dispatch
evaluator SUCCEEDED != parent completion
evaluator UNKNOWN != FAILED
cancellation request valid != cancellation authorized
progression envelope valid != execution authorized
Worker message != approval
Routing SELECTED != dispatch
```

The module must still export no `execute`, `dispatch`, `invoke`, `approve`,
`merge`, `deploy`, or equivalent side-effecting API.

The evaluator must never call network, filesystem, GitHub, Provider, Harness,
Worker, clock, or random APIs.

## 7. Test scope

`test/multiAgentCoordination.test.ts` must use synthetic records only.

Preserve all Slice A tests.

Add focused Slice B coverage at least:

```text
B01 PROGRESSION_EVALUATOR_IMPLEMENTED = true; other capability flags remain false
B02 schema-unparseable input → ok:false REJECTED_SCHEMA; no decision
B03 plan fingerprint mismatch → UNKNOWN / OBSERVATION_CONTRADICTION
B04 unknown taskId → UNKNOWN / OBSERVATION_CONTRADICTION
B05 INVALID authorization×execution cell → UNKNOWN / OBSERVATION_CONTRADICTION
B06 INVALID execution×result cell → UNKNOWN / OBSERVATION_CONTRADICTION
B07 partial readiness pair → UNKNOWN / OBSERVATION_CONTRADICTION
B08 NOT_REQUIRED missing resultValidationRef → UNKNOWN / OBSERVATION_CONTRADICTION
B09 invalid cancellation binding → UNKNOWN / OBSERVATION_CONTRADICTION
B10 rule 1 EXECUTION_UNKNOWN
B11 rule 2 SUCCEEDED + RESULT_UNKNOWN
B12 rule 3 EXECUTION_FAILED
B13 rule 4 SUCCEEDED + RESULT_INVALID
B14 rule 5 SUCCEEDED + RESULT_VALID
B15 rule 6 SUCCEEDED + NOT_REQUIRED with evidence ref
B16 rule 7 SUCCEEDED + NOT_EVALUATED → RESULT_VALIDATION_PENDING
B17 rule 8 RUNNING
B18 rule 9 DENIED + NOT_INVOKED
B19 rule 9 beats accepted cancellation
B20 rule 10 accepted cancellation + NOT_INVOKED + not DENIED
B21 rule 11 DEPENDENCY_BLOCKED
B22 rule 12 AUTHORIZATION_HOLD
B23 rule 13 AUTHORIZATION_UNKNOWN
B24 rule 14 DEPENDENCY_PENDING
B25 rule 15 RESOURCE_WAIT
B26 rule 16 HUMAN_GATE_WAIT
B27 rule 17 AUTHORIZED_NOT_INVOKED
B28 rule 18 READY_FOR_AUTHORIZATION
B29 rule 19 PLANNED when both readiness fields are null
B30 AUTHORIZED + NOT_INVOKED + both readiness null → PLANNED, not READY
B31 cancellation + RUNNING remains EXECUTION_RUNNING
B32 cancellation + EXECUTION_SUCCEEDED uses terminal result mapping
B33 decision contains no execution Authority field
B34 no exported side-effecting execution/dispatch API
B35 existing Slice A parser contradiction tests remain REJECTED_CONTRADICTION
```

Tests must not contact external services.

## 8. Verification gate

Before Draft PR publication, the implementation must run:

```text
npm run verify
```

Repository scripts currently define this as:

```text
npm run typecheck
npm test
npm run build
```

All must PASS.

A targeted test command may be run additionally, but does not replace
`npm run verify`.

## 9. Delivery sequence

```text
Human Implementation Start GO
→ create implementation branch from exact authorized main / scope lineage
→ implement only MAC-IMPL-SLICE-B
→ npm run verify
→ inspect exact diff
→ Draft PR
→ Independent Implementation Review
→ STOP for Human Ready GO
```

No automatic Ready, Merge, or Deploy is authorized.

## 10. Slice exit criteria

Slice B is complete only when:

- changed source/test area is exactly within the authorized list;
- evaluator implements C4-2.5 + C3-1.5 + C3-1.6 without widening semantics;
- all 19 Stage-B rules are proven reachable;
- Stage-A failures emit UNKNOWN / OBSERVATION_CONTRADICTION when identity-bound;
- Slice A parser result codes are preserved;
- `PROGRESSION_EVALUATOR_IMPLEMENTED = true` and all other capability flags remain false;
- no runtime execution/provider/harness/mutation integration was added;
- full `npm run verify` PASS;
- Draft PR remains non-Ready until independent review and Human Ready GO.

## 11. Current gate

```text
Implementation Scope Definition:
COMPLETE

Scope:
MAC-IMPL-SLICE-B

Implementation Start:
NOT AUTHORIZED BY THIS DOCUMENT

Real multi-worker execution: HOLD
Provider / Harness invocation: NOT AUTHORIZED
Action Gateway invocation: NOT AUTHORIZED
External mutation: NOT AUTHORIZED
Ready / Merge / Deploy: NOT AUTHORIZED

Next:
MULTI-AGENT-COORDINATION-V1
Slice B Independent Scope Review-1
```
