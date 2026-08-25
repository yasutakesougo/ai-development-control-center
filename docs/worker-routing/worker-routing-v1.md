# WORKER-ROUTING-V1

Status: implementation candidate for Issue #91.

Baseline:

```text
main: 0d596eb57a200f622cb139d5754fba8a5a434ebd
AI-WORKER-REGISTRY-V1: MERGED / CONSUMED
Definition Re-Review-2: PASS
```

## Purpose

`WORKER-ROUTING-V1` deterministically selects at most one registered AI worker for one exact `AgentTaskV1`.

```text
AgentTaskV1
+ AiWorkerRegistryV1
+ WorkerObservationV1[]
+ explicit routing intent
        ↓
WORKER-ROUTING-V1
        ↓
SELECTED / HOLD / REJECT
```

Routing is selection only.

```text
SELECTED != execution authorization
SELECTED != provider invocation
SELECTED != Human GO
SELECTED != GitHub mutation
SELECTED != Ready / Merge / Deploy
```

## Canonical reuse

Routing reuses existing contracts and functions.

```text
parseAgentTaskV1()
validateAgentTaskV1()
parseAiWorkerRegistryV1()
parseWorkerObservationV1()
computeAiWorkerRegistryAuthorityFingerprint()
computeWorkerAuthorityFingerprint()
validateWorkerObservationBinding()
canonicalJson()
```

No AgentTask, Registry, Observation, capability, risk, or canonical-JSON rules are copied into a second authority source.

## Input

```ts
type WorkerRoutingInputV1 = {
  schemaVersion: "WORKER-ROUTING-INPUT-V1";
  task: AgentTaskV1;
  registry: AiWorkerRegistryV1;
  observations: WorkerObservationV1[];
  intent: {
    requiredRole: WorkerRoleV1;
    requiredExecutionMode: AiWorkerExecutionMode;
  };
  expectedRegistryAuthorityFingerprint: string;
  evaluatedAt: string;
  maxObservationAgeSeconds: number;
};
```

Unknown or missing routing-root / intent keys fail closed.

Bounds:

```text
observations: 0..32, unique by workerId
expectedRegistryAuthorityFingerprint: ^[a-f0-9]{64}$
maxObservationAgeSeconds: integer 1..86400
evaluatedAt: strict routing timestamp, max 64 chars
```

## Processing order

```text
1. validate routing root / intent / fingerprint / TTL / evaluatedAt
2. parse AgentTaskV1
3. validate AgentTaskV1 with:
     validatedAt = evaluatedAt
     treatPrefixOverlapAsHold = true
4. parse AiWorkerRegistryV1
5. parse WorkerObservationV1 entries and reject duplicate workerId
6. compute registry authority fingerprint and compare expected value
7. evaluate each registry worker
8. rank eligible workers
9. emit decision
10. for SELECTED, compute routing decision fingerprint
```

Task validation mapping:

```text
structural failure -> REJECT / REJECTED_TASK_SCHEMA
INVALID            -> REJECT / REJECTED_TASK_INVALID
HOLD               -> HOLD / HOLD_TASK_VALIDATION
UNKNOWN            -> HOLD / HOLD_TASK_VALIDATION_UNKNOWN
VALID              -> continue
```

## Strict timestamp / freshness

Accepted shape:

```text
YYYY-MM-DDTHH:mm:ss[.fraction](Z|+HH:MM|-HH:MM)
```

Rules:

```text
year 0001..9999
valid Gregorian month/day
hour 00..23
minute / second 00..59
fraction optional, 1..3 digits
offset hour 00..23
offset minute 00..59
uppercase T / Z only
no leap second 60
no impossible calendar dates
no silent repair or current-time substitution
```

After validation, freshness uses epoch milliseconds.

```text
observedAt > evaluatedAt
  -> INELIGIBLE_OBSERVATION_FROM_FUTURE

age > maxObservationAgeSeconds * 1000
  -> INELIGIBLE_OBSERVATION_STALE

age == TTL boundary
  -> fresh
```

## Eligibility

A registry worker is eligible only when all conditions pass.

```text
worker.enabled == true
requiredRole in worker.roles
worker.executionMode == requiredExecutionMode
task.riskClass <= worker.maxRiskClass
task.allowedCapabilities subset-of worker.allowedCapabilities
one observation exists
observation binds to current worker authority fingerprint
serviceIntegrationState == AVAILABLE
observation timestamp is valid
observation is not future-dated
observation is fresh
```

`AVAILABLE` is evidence only and never grants execution authority.

## Candidate reasons

Closed V1 ineligibility reasons:

```text
INELIGIBLE_DISABLED
INELIGIBLE_ROLE_MISMATCH
INELIGIBLE_EXECUTION_MODE_MISMATCH
INELIGIBLE_RISK_EXCEEDED
INELIGIBLE_CAPABILITY_MISMATCH
INELIGIBLE_OBSERVATION_MISSING
INELIGIBLE_OBSERVATION_AUTHORITY_MISMATCH
INELIGIBLE_OBSERVATION_NOT_AVAILABLE
INELIGIBLE_OBSERVATION_TIMESTAMP_INVALID
INELIGIBLE_OBSERVATION_FROM_FUTURE
INELIGIBLE_OBSERVATION_STALE
```

Candidate artifacts are emitted by direct lexical `workerId` order.

No `localeCompare` or locale-dependent collation is used.

## Ranking

Multiple eligible workers are ranked by:

```text
1. smallest risk headroom
2. smallest capability surplus
3. direct lexical workerId ascending
```

Budget, cost, quota, speed, model preference, and subjective quality are excluded from V1.

A future policy may only narrow or rank an already-eligible set.

## Task binding fingerprint

Domain:

```text
WORKER-ROUTING-TASK-BINDING-V1
```

Facts include the exact parsed task authority fields and exclude `metadata`.

Arrays preserve parsed order.

Encoding:

```text
canonicalJson
→ SHA-256
→ lowercase 64-character hex
```

## Decision

```ts
type WorkerRoutingDecisionV1 = {
  schemaVersion: "WORKER-ROUTING-DECISION-V1";
  status: "SELECTED" | "HOLD" | "REJECT";
  reasonCode: WorkerRoutingReasonCodeV1;
  taskId: string | null;
  taskRoutingFingerprint: string | null;
  taskValidation: AgentTaskValidationResultV1 | null;
  registryAuthorityFingerprint: string | null;
  requiredRole: WorkerRoleV1 | null;
  requiredExecutionMode: AiWorkerExecutionMode | null;
  maxObservationAgeSeconds: number | null;
  selectedWorkerId: string | null;
  selectedWorkerAuthorityFingerprint: string | null;
  selectedObservation: WorkerObservationV1 | null;
  routingDecisionFingerprint: string | null;
  candidateEvaluations: WorkerRoutingCandidateEvaluationV1[];
  evaluatedAt: string | null;
};
```

If `evaluatedAt` cannot be strictly validated, output uses `null`.

No system time is invented.

## Selected-decision fingerprint

Domain:

```text
WORKER-ROUTING-DECISION-FINGERPRINT-V1
```

Facts:

```text
taskRoutingFingerprint
registryAuthorityFingerprint
requiredRole
requiredExecutionMode
maxObservationAgeSeconds
evaluatedAt
selectedWorkerId
selectedWorkerAuthorityFingerprint
exact selected WorkerObservationV1
```

The selected observation in the fingerprint is the same parsed observation emitted by the decision.

The fingerprint is evidence/binding only.

Possessing it grants zero execution authority.

## Root reasons

```text
SELECTED
REJECTED_SCHEMA
REJECTED_TASK_SCHEMA
REJECTED_TASK_INVALID
REJECTED_REGISTRY_SCHEMA
REJECTED_OBSERVATION_SCHEMA
HOLD_TASK_VALIDATION
HOLD_TASK_VALIDATION_UNKNOWN
HOLD_REGISTRY_AUTHORITY_MISMATCH
HOLD_NO_ELIGIBLE_WORKER
```

No UNKNOWN state promotes to SELECTED.

## Non-goals / authority boundary

Not implemented by this slice:

```text
ChatGPT / Cursor / GitHub Copilot / OpenCode invocation
provider/service adapter changes
model selection
prompt execution
Agent Runner expansion
Action Gateway expansion
shell execution
GitHub mutation
Issue close
PR Ready
PR Merge
Deploy
Human approval execution
external send
secret access
Budget Policy
budget spend
subscription mutation
multi-agent delegation
parallel dispatch
UI
```

Implementation flags for provider invocation, GitHub mutation, Ready, Merge, Deploy, and Budget Policy remain `false`.

## Changed area

Authorized first implementation slice:

```text
docs/worker-routing/worker-routing-v1.md
src/domain/workerRouting.ts
test/workerRouting.test.ts
```

Existing imported contract files remain unchanged.

## Delivery gate

```text
Implementation
→ npm run verify
→ Draft PR
→ Independent Implementation Review
→ STOP for Human Ready GO
```
