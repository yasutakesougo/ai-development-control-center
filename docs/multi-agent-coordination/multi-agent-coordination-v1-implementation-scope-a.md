# MULTI-AGENT-COORDINATION-V1
## Implementation Scope Definition — Slice A

**Status: IMPLEMENTATION SCOPE DEFINED · IMPLEMENTATION NOT YET AUTHORIZED**

This scope is bound to the locked Definition candidate:

```text
Definition commit:
3902b24985b9965d8b0042b1146bbfa85c491dc2

Definition artifacts:
docs/multi-agent-coordination/multi-agent-coordination-v1.md
docs/multi-agent-coordination/multi-agent-coordination-v1-correction-2.md
docs/multi-agent-coordination/multi-agent-coordination-v1-correction-3.md
docs/multi-agent-coordination/multi-agent-coordination-v1-correction-4.md
```

This document defines only the first implementation slice.

```text
Slice ID:
MAC-IMPL-SLICE-A

Purpose:
contract types / parser / structural validator / fingerprint binding

Execution:
NOT IN SCOPE
```

## 1. Objective

Implement the closed machine-readable coordination contract surface required by the locked Definition without implementing coordination execution or state progression.

Slice A establishes deterministic parsing and validation for coordination-owned records so later slices do not invent contract semantics.

Slice A grants zero execution Authority.

## 2. Exact changed area

Implementation mutation is limited to exactly these two source/test files:

```text
src/domain/multiAgentCoordination.ts
test/multiAgentCoordination.test.ts
```

The following Definition artifact may be updated only for implementation evidence or typo-level synchronization that does not change semantics:

```text
docs/multi-agent-coordination/multi-agent-coordination-v1-implementation-scope-a.md
```

No other source, test, script, configuration, UI, Worker, or deployment file may change in Slice A.

If another file becomes necessary, STOP and return to Scope Correction / Independent Scope Re-Review before changing it.

## 3. Existing code reused without modification

Slice A must import and reuse existing canonical helpers.

```text
src/domain/workerRouting.ts
  captureWorkerRoutingTaskBindingFacts()
  computeWorkerRoutingTaskFingerprint()

src/domain/decisionFingerprint.ts
  canonicalJson()

src/domain/agentTaskContract.ts
  canonical AgentTaskV1 taskId / task contract semantics as needed
```

These files are READ / IMPORT ONLY for Slice A.

Slice A must not copy their hashing, canonicalization, AgentTask parsing, capability, risk, or routing semantics into a second implementation.

## 4. Contracts implemented in Slice A

`src/domain/multiAgentCoordination.ts` may define and implement only the following coordination contract families and directly supporting constants/types.

### 4.1 Coordination plan

```text
CoordinationTaskRefV1
CoordinationPlanV1
CoordinationPlanFingerprintTaskRefFactsV1
CoordinationPlanFingerprintFactsV1
```

Required behavior:

- exact root/nested keys;
- Correction-2 finite bounds;
- duplicate rejection;
- self/missing/cyclic dependency rejection;
- intra-coordination dependency semantics only;
- exact taskRoutingFingerprint format;
- `taskRoutingFingerprint` computation/reuse through existing Worker Routing helper only;
- exact closed plan fingerprint fact set;
- admitted taskRefs order and dependencyTaskIds order retained as identity;
- canonical JSON reuse;
- SHA-256 lowercase 64-character fingerprint;
- no silent trim, sort, dedupe, normalization, repair, or defaulting unless the locked Definition explicitly requires it.

### 4.2 Cancellation request

```text
CoordinationCancellationRequestV1
```

Slice A may parse and structurally validate the closed envelope and exact target bindings that can be proven from the supplied CoordinationPlanV1.

Slice A must not create cancellation Authority or validate an owning Human/policy authorization beyond structural/reference presence required by the Definition.

### 4.3 Concurrency ceiling references

```text
CoordinationConcurrencyCeilingRefV1
```

Slice A may parse/validate bounded ceiling records and expose a pure helper that computes the effective ceiling as the minimum of valid applicable supplied records.

```text
zero records -> HOLD-equivalent validation result / no concurrent eligibility
one record   -> that ceiling
many records -> minimum ceiling
invalid/unknown record -> fail closed
```

The helper does not dispatch work.

### 4.4 Progression evaluator envelopes — contract only

Slice A may define and parse the closed input/output contract types introduced by Correction-4:

```text
CoordinationAuthorizationObservationV1
CoordinationExecutionObservationV1
CoordinationResultValidationObservationV1
CoordinationDependencyEvaluationV1
CoordinationResourceConcurrencyEvaluationV1
CoordinationProgressionStatusV1
CoordinationProgressionReasonV1
CoordinationProgressionInputV1
CoordinationProgressionDecisionV1
```

Slice A may validate structural shape, bounds, closed enums, exact keys, and Definition-fixed nullability/reference consistency.

Slice A must NOT implement the Stage-B progression/state derivation evaluator.

That belongs to Slice B.

## 5. Explicitly prohibited in Slice A

```text
coordination progression evaluator / state transition execution
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
Human approval creation or consumption for execution
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
```

## 6. Authority invariants

Implementation must preserve:

```text
Coordination != Authority
plan valid != execution authorized
fingerprint valid != execution authorized
cancellation request valid != cancellation authorized
concurrency-safe != execution authorized
progression envelope valid != execution authorized
Worker message != approval
Routing SELECTED != dispatch
```

The module must export no `execute`, `dispatch`, `invoke`, `approve`, `merge`, `deploy`, or equivalent side-effecting API.

## 7. Parser behavior

All parsers/validators are pure with respect to external systems.

They must:

- reject unknown keys;
- reject missing required keys;
- reject wrong types;
- enforce exact enum values;
- enforce locked finite bounds;
- reject duplicates where Definition requires uniqueness;
- reject malformed 64-character lowercase SHA-256 fingerprints;
- preserve input ordering where ordering is identity-bearing;
- fail closed on unknown/contradictory contract state;
- never use current time as a default;
- never call network, filesystem, GitHub, Provider, Harness, or Worker APIs.

## 8. Fingerprint implementation boundary

Plan fingerprint implementation must use the existing `canonicalJson()` helper.

Task routing fingerprints must reuse the existing `computeWorkerRoutingTaskFingerprint()` helper.

Slice A may add its own plan SHA-256 helper only for the new `MULTI-AGENT-COORDINATION-PLAN-FINGERPRINT-V1` domain.

It must not introduce a new canonical JSON function.

## 9. Test scope

`test/multiAgentCoordination.test.ts` must use synthetic records only.

Minimum coverage:

```text
A01 valid minimal plan parses
A02 unknown root key rejects
A03 malformed coordinationId rejects
A04 duplicate taskId rejects
A05 duplicate dependencyTaskId rejects
A06 self dependency rejects
A07 missing dependency target rejects
A08 dependency cycle rejects
A09 taskRefs > max rejects
A10 dependencyTaskIds > max rejects
A11 malformed taskRoutingFingerprint rejects
A12 taskRoutingFingerprint helper reuse produces expected binding
A13 plan fingerprint is deterministic
A14 plan fingerprint changes when identity-bearing task order changes
A15 plan fingerprint changes when dependency order changes
A16 plan fingerprint changes when any exact fact changes
A17 no extra field participates in fingerprint facts
A18 cancellation envelope exact keys/bounds
A19 cancellation target mismatch rejects
A20 worker/protocol message cannot satisfy cancellation envelope
A21 zero concurrency ceilings fail closed for concurrent eligibility
A22 multiple ceilings choose minimum
A23 invalid ceiling rejects
A24 progression input unknown key rejects
A25 progression input plan/task binding mismatch rejects
A26 authorization ref nullability matrix
A27 execution attempt/outcome ref nullability matrix
A28 result-validation ref nullability matrix including NOT_REQUIRED
A29 partial readiness pair rejects
A30 invalid cancellation binding in progression input rejects
A31 progression decision contract contains no execution Authority field
A32 no exported side-effecting execution/dispatch API
```

Tests must not contact external services.

## 10. Verification gate

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

A targeted test command may be run additionally, but does not replace `npm run verify`.

## 11. Delivery sequence

```text
Human Implementation Start GO
→ create implementation branch from exact authorized Definition/scope lineage
→ implement only MAC-IMPL-SLICE-A
→ npm run verify
→ inspect exact diff
→ Draft PR
→ Independent Implementation Review
→ STOP for Human Ready GO
```

No automatic Ready, Merge, or Deploy is authorized.

## 12. Slice exit criteria

Slice A is complete only when:

- changed source/test area is exactly within the authorized list;
- parsers/validators implement the locked contract without widening semantics;
- canonical helpers are reused rather than copied;
- all synthetic contract tests PASS;
- full `npm run verify` PASS;
- no runtime execution/provider/harness/mutation integration was added;
- Draft PR remains non-Ready until independent review and Human Ready GO.

## 13. Current gate

```text
Implementation Scope Definition:
COMPLETE

Scope:
MAC-IMPL-SLICE-A

Implementation Start:
NOT AUTHORIZED BY THIS DOCUMENT

Next:
MULTI-AGENT-COORDINATION-V1
Slice A Independent Scope Review-1
```
