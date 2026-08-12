# ROADMAP-CONTRACT-V1

**Status: DESIGNED · CONTRACT ONLY · NO PLANNER · NO ISSUE PROPOSAL · NO GITHUB ISSUE MUTATION · NO AGENT EXECUTION · NO SCHEDULER**

This document defines the machine-readable **Roadmap Contract** — a dependency-aware
DAG bound to an approved `ProjectContractV1`, suitable for later Issue decomposition.

```text
CONTRACT ONLY
PLANNER = NOT IMPLEMENTED
ISSUE PROPOSAL GENERATION = NOT IMPLEMENTED
GITHUB ISSUE MUTATION = NOT IMPLEMENTED
AGENT EXECUTION = NOT IMPLEMENTED
SCHEDULER / DISPATCH = NOT IMPLEMENTED
READY / MERGE / ISSUE CLOSE / DEPLOY = NOT AUTHORIZED BY THIS CONTRACT
```

Baseline at drafting:

```text
main = f77a5357c7a1c598943b5448bd5ab7c18a588097
PROJECT-CONTRACT-V1 / #60 = COMPLETE
Issue #61 = OPEN (this contract)
CHECKPOINT-2 = ACTIVE
```

---

## 1. Purpose

```text
validated ProjectContractV1
→ RoadmapContractV1
→ structural parse
→ semantic DAG validation
→ deterministic authority fingerprint
```

This slice covers **only** the roadmap contract foundation. It does not generate
IssueProposal records or mutate GitHub.

Core principle:

```text
Do not start from an LLM prompt.
The versioned machine-readable contract / JSON Schema is canonical.
No silent graph repair.
```

---

## 2. Relationship to other modules

| Module | Role vs Roadmap Contract |
|---|---|
| ProjectContractV1 | Upstream authority. Exact `projectId` + fingerprint binding required. |
| RoadmapContractV1 | DAG of bounded nodes. Validation ≠ Issue authority. |
| IssueProposal / Decomposer | Downstream (#62–#65). Not implemented here. |
| Issue Publisher | Downstream (#66). Not implemented here. |
| Scheduler / Autopilot | Later checkpoints. Not implemented here. |

Invariants:

```text
Roadmap validation ≠ Issue proposal authority
Roadmap validation ≠ GitHub Issue mutation authority
Roadmap validation ≠ Agent execution authority
Roadmap validation ≠ scheduler / dispatch authority
metadata / observedAt are audit-only and never silently become
  authority-bearing fingerprint input
node.status is mutable progress / observation and never silently becomes
  authority-bearing fingerprint input
```

---

## 3. Documents

| Artifact | Path |
|---|---|
| RoadmapContractV1 schema | `schemas/roadmap-contract-v1.schema.json` |
| RoadmapContractValidationResultV1 schema | `schemas/roadmap-contract-validation-result-v1.schema.json` |
| Valid fixture | `fixtures/roadmap-valid.json` |
| TypeScript contract | `src/domain/roadmapContract.ts` |
| Tests | `test/roadmapContract.test.ts` |

---

## 4. RoadmapContractV1 concepts

| Field | Role |
|---|---|
| `schemaVersion` | Fixed `ROADMAP-CONTRACT-V1` |
| `roadmapId` | Stable roadmap identity |
| `projectId` | Exact ProjectContractV1.projectId binding |
| `projectAuthorityFingerprint` | Exact ProjectContract authority fingerprint |
| `nodes[]` | DAG nodes with dependencies |
| `metadata` | Audit / provenance / observedAt (non-authority) |

### Node fields

| Field | Role | Authority fingerprint |
|---|---|---|
| `nodeId` | Stable node identity | yes |
| `title` / `objective` | Bounded intent | yes |
| `phase` | Phase label | yes |
| `dependsOn` | Explicit nodeId dependencies | yes |
| `completionCriteria` | Required non-empty completion conditions | yes |
| `estimatedComplexity` | `XS` / `S` / `M` / `L` / `XL` | yes |
| `repository` | Optional; must be within ProjectContract repositories | yes (when present) |
| `status` | Mutable progress / observation (`PLANNED` → `READY` → `IN_PROGRESS` → `COMPLETE`, etc.). Structurally validated; not plan authority. | **no** |

Authority vs progress:

```text
Authority = plan / DAG / scope / completion criteria / repository binding
Progress  = node.status transitions while the plan is unchanged
```

Ordinary progress transitions must not change the Roadmap authority identity.

---

## 5. DAG validation

Runtime semantic validation is deterministic and fail-closed:

- Duplicate `nodeId` → `REJECTED_DUPLICATE_NODE_ID`
- Missing dependency reference → `REJECTED_DEPENDENCY_MISSING`
- Self-dependency → `REJECTED_SELF_DEPENDENCY`
- Directed cycle → `REJECTED_CYCLE` (DAG only; no silent repair)
- Empty `completionCriteria` → `REJECTED_COMPLETION_CRITERIA`
- `projectId` / `projectAuthorityFingerprint` mismatch → `REJECTED_PROJECT_BINDING`
- Node `repository` outside ProjectContract repositories → `REJECTED_REPOSITORY_BINDING`
- Unknown properties / missing required fields → `REJECTED_SCHEMA`

Validation never invokes an LLM, generates IssueProposal records, mutates GitHub,
or dispatches Agents.

---

## 6. Authority fingerprint

Authority-bearing fields (hashed):

```text
schemaVersion, roadmapId, projectId, projectAuthorityFingerprint, nodes
```

Per-node authority facts (hashed):

```text
nodeId, title, objective, phase, dependsOn, completionCriteria,
estimatedComplexity, repository (when present)
```

Within nodes, fingerprint capture sorts by `nodeId` and sorts
`dependsOn` / `completionCriteria` so insertion order is non-semantic.

Excluded (not authority):

```text
node.status — mutable progress / observation
metadata.* including metadata.observedAt — audit only
validatedAt on validation results
```

Fingerprint algorithm:

```text
SHA-256 hex over deterministic canonical JSON
(canonicalJson from decisionFingerprint.ts — sorted object keys)
```

Same authority facts with different `node.status` ⇒ **same** fingerprint.

Same authority facts with different `metadata.observedAt` ⇒ **same** fingerprint.

Changes to `dependsOn`, `completionCriteria`, or `repository` ⇒ **different** fingerprint.

---

## 7. Validation result statuses

| Status | Meaning |
|---|---|
| `VALID` | Structural + DAG + ProjectContract binding passed |
| `INVALID` | Deterministic rejection |
| `HOLD` | Reserved for future ambiguous cases |
| `UNKNOWN` | Reserved for insufficient information |

`RoadmapContractValidationResultV1.roadmapId` and `projectId` are always required;
use `null` when unknown.

---

## 8. CHECKPOINT-2 context

```text
#60 PROJECT-CONTRACT-V1          COMPLETE
#61 ROADMAP-CONTRACT-V1          ← this slice
#62 ISSUE-DECOMPOSER-CONTRACT-V1
...
```

Delivery gate for this slice:

```text
Implementation → npm run verify → Draft PR → Fresh Review → STOP
```

Do not Ready / Merge / close #61 in the implementation run.
Do not start #62 until separate Human GO.
