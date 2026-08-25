# AI-WORKER-REGISTRY-V1

**Status: IMPLEMENTATION SLICE · NO SERVICE INVOCATION · NO ROUTING · NO SPEND AUTHORITY**

AI-WORKER-REGISTRY-V1 is the canonical machine-readable declaration of AI worker identities used by the Control Center.

It records the maximum declared role, risk, capability, and integration-shape envelope for each worker.

It does not select workers, call external AI services, select models, execute commands, mutate GitHub, authorize Ready or Merge, deploy, change subscriptions, or spend budget.

## 1. Contracts

```ts
type AiWorkerRegistryV1 = {
  schemaVersion: "AI-WORKER-REGISTRY-V1";
  workers: WorkerAuthorityV1[];
};

type WorkerAuthorityV1 = {
  workerId: string;
  service: "CHATGPT" | "CURSOR" | "GITHUB_COPILOT" | "OPENCODE";
  enabled: boolean;
  roles: WorkerRoleV1[];
  maxRiskClass: AgentTaskRiskClass;
  allowedCapabilities: string[];
  executionMode: "ADVISORY_ONLY" | "LOCAL_TOOL" | "REMOTE_AGENT";
};

type WorkerObservationV1 = {
  schemaVersion: "AI-WORKER-OBSERVATION-V1";
  workerId: string;
  workerAuthorityFingerprint: string;
  serviceIntegrationState: "UNCONFIGURED" | "HOLD" | "AVAILABLE" | "UNKNOWN";
  observedAt: string;
  evidenceRefs: string[];
};
```

Unknown root, worker, and observation keys fail closed.

## 2. V1 vocabularies

Worker roles are:

```text
ORCHESTRATOR
PRIMARY_IMPLEMENTER
REPOSITORY_ASSISTANT
INDEPENDENT_REVIEWER
VERIFIER
```

Roles express routing intent only.

A role does not grant a capability, prove availability, or authorize execution.

Risk uses the existing `AgentTaskRiskClass` vocabulary exactly:

```text
R0 R1 R2 R3 R4 R5
```

Capability identifiers use the existing `AgentTaskV1` grammar through the exported `isAgentTaskCapabilityId()` predicate.

The Registry does not copy or redefine the capability regular expression.

## 3. V1 finite bounds

```text
workerId:
  1..128 characters
  ^[a-z][a-z0-9._-]{0,127}$

workers:
  1..32
  workerId unique

roles:
  1..5
  duplicate roles rejected

allowedCapabilities:
  0..32
  duplicate capabilities rejected
  every item must satisfy isAgentTaskCapabilityId()

workerAuthorityFingerprint:
  exactly 64 lowercase hexadecimal characters

evidenceRefs:
  0..32
  each item 1..2048 characters
  duplicate refs rejected

observedAt:
  1..64 characters
```

Parsing never silently truncates, deduplicates, case-normalizes, or repairs identifiers.

## 4. Worker authority fingerprint

Worker authority uses a separate fingerprint domain:

```ts
type WorkerAuthorityFingerprintFactsV1 = {
  schemaVersion: "AI-WORKER-AUTHORITY-V1";
  workerId: string;
  service: AiWorkerService;
  enabled: boolean;
  roles: WorkerRoleV1[];
  maxRiskClass: AgentTaskRiskClass;
  allowedCapabilities: string[];
  executionMode: AiWorkerExecutionMode;
};
```

Before hashing, `roles` and `allowedCapabilities` are sorted ascending.

Duplicates must already have been rejected during parsing.

The fingerprint is:

```text
canonicalJson(worker authority facts)
→ SHA-256
→ lowercase hexadecimal
→ 64 characters
```

The implementation reuses `canonicalJson` from `src/domain/decisionFingerprint.ts`.

Mutable observation data never participates in the worker authority fingerprint.

## 5. Registry authority fingerprint

Registry authority facts are:

```ts
type AiWorkerRegistryFingerprintFactsV1 = {
  schemaVersion: "AI-WORKER-REGISTRY-V1";
  workers: WorkerAuthorityFingerprintFactsV1[];
};
```

Workers are sorted ascending by `workerId` before hashing.

The same canonical JSON and SHA-256 lowercase-hex encoding is used.

Registry ordering therefore does not change registry authority identity.

A registry fingerprint and a worker fingerprint are different domains and are not interchangeable.

## 6. Observation binding

`WorkerObservationV1` is mutable evidence, not authority.

A future routing stage may consume an observation only when:

```text
observation.workerId exists in the current registry
AND
observation.workerAuthorityFingerprint
  == current exact worker authority fingerprint
```

Missing workers and mismatched authority fingerprints return HOLD.

`AVAILABLE` means only that an integration layer supplied evidence of availability.

`AVAILABLE` does not authorize routing, invocation, command execution, GitHub mutation, Ready, Merge, Deploy, or spending.

Freshness and TTL are deliberately deferred to WORKER-ROUTING-V1 or a later integration contract.

## 7. Capability intersection rule

The Registry declares a maximum worker capability envelope.

A future router must narrow capabilities through intersection or deny semantics:

```text
effectiveCapabilities
  ⊆ task.allowedCapabilities
  ∩ worker.allowedCapabilities
  ∩ repository/project policy
  ∩ actually implemented runner capability
```

No downstream component may widen this set.

Generic broad authority shortcuts remain forbidden:

```text
github.write
repo.write
shell
agent.execute
```

## 8. Initial planning identities

These identities are planning defaults only:

| Worker | Service | Primary intent |
|---|---|---|
| `chatgpt-default` | CHATGPT | ORCHESTRATOR / design / reconciliation |
| `cursor-primary` | CURSOR | PRIMARY_IMPLEMENTER |
| `github-copilot-repository` | GITHUB_COPILOT | REPOSITORY_ASSISTANT |
| `opencode-independent` | OPENCODE | INDEPENDENT_REVIEWER |

Actual task selection belongs to WORKER-ROUTING-V1.

## 9. Explicit non-authority boundary

This slice does not implement or authorize:

```text
ChatGPT / Cursor / GitHub Copilot / OpenCode invocation
underlying model selection
worker routing
shell or verification command execution
provider/service adapters
branch / commit / PR publication
Ready / Merge / Issue close
Deploy
subscription mutation
budget spending
secret persistence
```

No API token, PAT, OAuth secret, model key, billing credential, or session credential belongs in registry or observation records.

## 10. Relationship to existing components

```text
AgentTaskV1
  defines task risk / capability authority

AI-WORKER-REGISTRY-V1
  defines worker identity and maximum declared envelope

WORKER-ROUTING-V1
  future: combines task + worker + observation + policy

AGENT-RUNNER-V1
  provider/service integration remains separately gated

BUDGET-POLICY-V1
  future: evaluates subscriptions, reserve, and monthly cap
```

Repository Registry and AI Worker Registry remain separate authority domains.

## 11. Implementation boundary

The implementation is pure contract logic.

It may parse registry and observation records, compute fingerprints, and check observation-to-authority binding.

It must not perform external I/O or service invocation.
