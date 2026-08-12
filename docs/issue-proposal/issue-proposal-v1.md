# ISSUE-PROPOSAL-V1 / ISSUE-DECOMPOSER-CONTRACT-V1

**Status: DESIGNED · CONTRACT ONLY · NO PLANNER · NO ISSUE-VALIDATOR-V1 · NO GITHUB ISSUE MUTATION · NO AGENT EXECUTION · NO SCHEDULER**

This document defines the machine-readable **Issue Proposal Contract** — a
bounded `IssueProposalV1` record derived from a validated `RoadmapNodeV1`,
suitable for later ISSUE-VALIDATOR / Planner / Publisher slices.

```text
CONTRACT ONLY
PLANNER / LLM DECOMPOSER = NOT IMPLEMENTED
ISSUE-VALIDATOR-V1 = NOT IMPLEMENTED
ISSUE SPLITTING = NOT IMPLEMENTED
GITHUB ISSUE MUTATION = NOT IMPLEMENTED
ISSUE-PUBLISHER-V1 = NOT IMPLEMENTED
AGENT EXECUTION = NOT IMPLEMENTED
SCHEDULER / DISPATCH = NOT IMPLEMENTED
READY / MERGE / ISSUE CLOSE / DEPLOY = NOT AUTHORIZED BY THIS CONTRACT
```

Baseline at drafting:

```text
main = f1963021b51d09b73f4cb8f74864a18f513df552
ROADMAP-CONTRACT-V1 / #61 = COMPLETE
Issue #62 = OPEN (this contract)
CHECKPOINT-2 = ACTIVE
```

---

## 1. Purpose

```text
validated RoadmapContractV1 / RoadmapNodeV1
→ IssueProposalV1
→ structural parse
→ deterministic semantic validation
→ deterministic authority fingerprint
```

This slice covers **only** the IssueProposal contract foundation. It does not
generate proposals via Planner/LLM, validate batches beyond proposal-local
invariants, or mutate GitHub.

Core principle:

```text
Do not start from an LLM prompt.
The versioned machine-readable contract / JSON Schema is canonical.
No silent repair of invalid proposal fields.
```

---

## 2. Relationship to other modules

| Module | Role vs Issue Proposal |
|---|---|
| ProjectContractV1 | Upstream governance. Repository / risk / prohibited capability binding. |
| RoadmapContractV1 / RoadmapNodeV1 | Upstream DAG node authority. Exact fingerprint + nodeId binding required. |
| IssueProposalV1 | This slice. Proposal ≠ Issue authority ≠ execution authority. |
| ISSUE-VALIDATOR-V1 | Downstream (#63). Not implemented here. |
| ISSUE-DECOMPOSER-V1 / Planner | Downstream (#64). Not implemented here. |
| ISSUE-SPLITTER-V1 | Downstream (#65). Not implemented here. |
| ISSUE-PUBLISHER-V1 | Downstream (#66). Not implemented here. |
| AgentTaskV1 | Later execution contract. Not generated here. |

Invariants:

```text
IssueProposal validation ≠ GitHub Issue mutation authority
IssueProposal validation ≠ Agent execution authority
IssueProposal validation ≠ scheduler / dispatch authority
metadata / observedAt are audit-only and never silently become
  authority-bearing fingerprint input
allowedCapabilities are proposal data only; validation never grants them
```

---

## 3. Documents

| Artifact | Path |
|---|---|
| IssueProposalV1 schema | `schemas/issue-proposal-v1.schema.json` |
| IssueProposalValidationResultV1 schema | `schemas/issue-proposal-validation-result-v1.schema.json` |
| Valid fixture | `fixtures/issue-proposal-valid.json` |
| TypeScript contract | `src/domain/issueProposalContract.ts` |
| Tests | `test/issueProposalContract.test.ts` |

---

## 4. IssueProposalV1 concepts

| Field | Role | Authority fingerprint |
|---|---|---|
| `schemaVersion` | Fixed `ISSUE-PROPOSAL-V1` | yes |
| `proposalId` | Stable proposal identity | yes |
| `roadmapNodeId` | Exact RoadmapNode binding | yes |
| `repository` | Required repository binding | yes |
| `title` / `objective` | Bounded intent | yes |
| `dependsOn` | Explicit proposalId dependencies | yes |
| `allowedPaths` / `forbiddenPaths` | Path scope boundaries | yes |
| `acceptanceCriteria` | Required non-empty acceptance conditions | yes |
| `verificationCommands` | Required non-empty verification commands | yes |
| `allowedCapabilities` | Capability ids as proposal data | yes |
| `riskClass` | `R0`…`R5` | yes |
| `stopAt` | Explicit stop boundary | yes |
| `estimatedChangedFiles` | Integer change budget | yes |
| `provenance` | Exact RoadmapContract authority binding | yes |
| `metadata` | Audit / observedAt (non-authority) | **no** |

### Provenance

| Field | Role |
|---|---|
| `roadmapId` | Exact RoadmapContractV1.roadmapId |
| `roadmapAuthorityFingerprint` | Exact RoadmapContract authority fingerprint |

---

## 5. Semantic validation

Runtime semantic validation is deterministic and fail-closed:

- Unknown properties / missing required fields → `REJECTED_SCHEMA`
- Empty `acceptanceCriteria` → `REJECTED_ACCEPTANCE_CRITERIA` / structural reject
- Overlapping `allowedPaths` / `forbiddenPaths` → `REJECTED_PATH_CONFLICT`
- Duplicate path / capability / dependency entries → `REJECTED_SCHEMA`
- Self-dependency in `dependsOn` → `REJECTED_DEPENDENCY`
- Malformed repository / capability / risk / stopAt → `REJECTED_SCHEMA`
- `roadmapNodeId` missing from supplied RoadmapContract → `REJECTED_ROADMAP_NODE_BINDING`
- `provenance.roadmapId` / fingerprint mismatch → `REJECTED_ROADMAP_BINDING`
- `repository` outside ProjectContract repositories → `REJECTED_REPOSITORY_BINDING`
- `repository` ≠ bound RoadmapNode.repository (when present) → `REJECTED_REPOSITORY_BINDING`
- Capability prohibited by ProjectContract → `REJECTED_CAPABILITY`
- `riskClass` above ProjectContract `maxRiskClass` → `REJECTED_RISK_CLASS`

Validation never invokes an LLM, mutates GitHub, or dispatches Agents.

A `VALID` result means the proposal document is structurally and semantically
well-formed under the supplied Roadmap/Project authority. It does **not**
authorize `github.issue.create.v1`, ISSUE-PUBLISHER-V1, or Agent execution.

---

## 6. Authority fingerprint

Authority-bearing fields (hashed):

```text
schemaVersion, proposalId, roadmapNodeId, repository, title, objective,
dependsOn, allowedPaths, forbiddenPaths, acceptanceCriteria,
verificationCommands, allowedCapabilities, riskClass, stopAt,
estimatedChangedFiles, provenance
```

Within lists, fingerprint capture sorts `dependsOn`, normalized paths,
`acceptanceCriteria`, `allowedCapabilities`, and `verificationCommands` by `id`
so insertion order is non-semantic.

Excluded (not authority):

```text
metadata.* including metadata.observedAt — audit only
validatedAt on validation results
```

Fingerprint algorithm:

```text
SHA-256 hex over deterministic canonical JSON
(canonicalJson from decisionFingerprint.ts — sorted object keys)
```

Same authority facts with different `metadata.observedAt` ⇒ **same** fingerprint.

Changes to scope, acceptance, verification, capability, risk, stopAt, or
Roadmap provenance ⇒ **different** fingerprint.

---

## 7. Validation result statuses

| Status | Meaning |
|---|---|
| `VALID` | Structural + proposal-local + Roadmap/Project binding passed |
| `INVALID` | Deterministic rejection |
| `HOLD` | Reserved for future ambiguous cases |
| `UNKNOWN` | Reserved for insufficient information |

`IssueProposalValidationResultV1.proposalId` and `roadmapNodeId` are always
required; use `null` when unknown.

---

## 8. CHECKPOINT-2 context

```text
#60 PROJECT-CONTRACT-V1          COMPLETE
#61 ROADMAP-CONTRACT-V1          COMPLETE
#62 ISSUE-DECOMPOSER-CONTRACT-V1 ← this slice
#63 ISSUE-VALIDATOR-V1
#64 ISSUE-DECOMPOSER-V1
...
```

Delivery gate for this slice:

```text
Implementation → npm run verify → Draft PR → Fresh Review → STOP
```

Do not Ready / Merge / close #62 in the implementation run.
Do not start #63 / #64 until separate Human GO.
