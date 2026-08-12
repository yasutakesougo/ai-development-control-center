# PROJECT-CONTRACT-V1

**Status: DESIGNED · CONTRACT ONLY · NO PLANNER · NO ROADMAP · NO ISSUE PROPOSAL · NO GITHUB ISSUE MUTATION · NO AGENT EXECUTION**

This document defines the machine-readable **Project Contract** — the canonical
project intent and governance source of truth before roadmap or Issue generation.

```text
CONTRACT ONLY
PLANNER = NOT IMPLEMENTED
ROADMAP GENERATION = NOT IMPLEMENTED
ISSUE PROPOSAL GENERATION = NOT IMPLEMENTED
GITHUB ISSUE MUTATION = NOT IMPLEMENTED
AGENT EXECUTION = NOT IMPLEMENTED
READY / MERGE / ISSUE CLOSE / DEPLOY = NOT AUTHORIZED BY THIS CONTRACT
```

Baseline at drafting:

```text
main = 26fad59703a76d07ba1d3314659ff634e8e6d78d
CHECKPOINT-1 = COMPLETE (#59 / PR #78)
Issue #60 = OPEN (this contract)
CHECKPOINT-2 = ACTIVE
```

---

## 1. Purpose

CHECKPOINT-2 begins with a versioned project source of truth:

```text
ProjectContractV1
→ (later) RoadmapContractV1
→ (later) IssueProposalV1
→ (later) validated GitHub Issues
```

This slice covers **only** ProjectContractV1 parse / validate / fingerprint.

Core principle:

```text
Do not start from an LLM prompt.
The versioned machine-readable contract / JSON Schema is canonical.
```

---

## 2. Relationship to other modules

| Module | Role vs Project Contract |
|---|---|
| ProjectContractV1 | Canonical project intent + governance. Validation ≠ authorization. |
| RoadmapContractV1 | Downstream (#61). Not implemented here. |
| IssueProposal / Decomposer | Downstream (#62–#65). Not implemented here. |
| Issue Publisher | Downstream (#66). Not implemented here. |
| AgentTaskV1 | Execution contract for later Issues. Not generated here. |
| Action Gateway | External-mutation boundary. Project contract does not invoke it. |

Invariants:

```text
Project contract validation ≠ roadmap generation
Project contract validation ≠ Issue proposal generation
Project contract validation ≠ GitHub Issue mutation
Project contract validation ≠ Agent execution
Human-gate policy fields are data; the contract never grants
  Ready / Merge / IssueClose / Deploy authority
observedAt / metadata are audit-only and never silently become
  authority-bearing fingerprint input
```

---

## 3. Documents

| Artifact | Path |
|---|---|
| ProjectContractV1 schema | `schemas/project-contract-v1.schema.json` |
| ProjectContractValidationResultV1 schema | `schemas/project-contract-validation-result-v1.schema.json` |
| Valid fixture | `fixtures/project-valid.json` |
| TypeScript contract | `src/domain/projectContract.ts` |
| Tests | `test/projectContract.test.ts` |

---

## 4. ProjectContractV1 concepts

| Field | Role |
|---|---|
| `schemaVersion` | Fixed `PROJECT-CONTRACT-V1` |
| `projectId` | Stable project identity |
| `name` | Human-readable project name |
| `objective` | Bounded goal statement |
| `problemStatement` | Why the project exists |
| `users` | Actors / user roles |
| `successCriteria` | Human-verifiable completion conditions |
| `inScope` | Explicit inclusions |
| `outOfScope` | Explicit exclusions |
| `constraints` | Risk / capability / repository bounds |
| `repositories` | Repository references with role |
| `humanGatePolicy` | Explicit Ready/Merge/IssueClose/Deploy Human gates |
| `metadata` | Audit / provenance / observedAt (non-authority) |

---

## 5. Human gate policy

| Field | V1 rule |
|---|---|
| `readyRequiresHuman` | Required `true` |
| `mergeRequiresHuman` | Required `true` |
| `issueCloseRequiresHuman` | Required `true` |
| `deployRequiresHuman` | Required `true` |

Weakening any gate to `false` is `REJECTED_HUMAN_GATE_POLICY`.

The presence of this policy object is **not** authorization to automate those
actions. It records that Human gates remain mandatory for V1.

---

## 6. Authority fingerprint

Authority-bearing fields (hashed):

```text
schemaVersion, projectId, name, objective, problemStatement,
users, successCriteria, inScope, outOfScope, constraints,
repositories, humanGatePolicy
```

Excluded (audit only):

```text
metadata.* including metadata.observedAt
validatedAt on validation results
```

Fingerprint algorithm:

```text
SHA-256 hex over deterministic canonical JSON
(canonicalJson from decisionFingerprint.ts — sorted object keys)
```

Same authority facts with different `metadata.observedAt` ⇒ **same** fingerprint.

---

## 7. Validation behavior

Runtime validation is deterministic and fail-closed:

- Malformed raw values return structured results; parsers never throw.
- Unknown root / nested properties are rejected (`additionalProperties: false`).
- Missing required fields fail closed.
- Duplicate `users` / `successCriteria` / `inScope` / `outOfScope` entries reject.
- Exact overlap between `inScope` and `outOfScope` rejects (`REJECTED_SCOPE_CONFLICT`).
- Duplicate repository refs reject.
- Exactly one `PRIMARY` repository is required.
- `constraints.maxRepositories` cannot be exceeded by `repositories.length`.
- Human-gate weakening rejects.
- Validation never invokes an LLM, generates roadmaps/issues, or mutates GitHub.

Validation result statuses:

| Status | Meaning |
|---|---|
| `VALID` | Structural + semantic checks passed |
| `INVALID` | Deterministic rejection |
| `HOLD` | Reserved for future ambiguous cases |
| `UNKNOWN` | Reserved for insufficient information |

### Schema / TypeScript / runtime parity

| Concern | Canonical rule |
|---|---|
| Root / nested keys | `additionalProperties: false` in schema; `hasOnlyKeys` in runtime |
| Authority fingerprint keys | Explicit allowlist; metadata excluded |
| ValidationResult.projectId | Required; `string \| null` (null = unknown) |
| Human gates | All four required booleans; V1 requires `true` |

---

## 8. CHECKPOINT-2 context

```text
#60 PROJECT-CONTRACT-V1          ← this slice
#61 ROADMAP-CONTRACT-V1
#62 ISSUE-DECOMPOSER-CONTRACT-V1
#63 ISSUE-VALIDATOR-V1
#64 ISSUE-DECOMPOSER-V1
#65 ISSUE-SPLITTER-V1 (when needed)
#66 ISSUE-PUBLISHER-V1
#67 ROADMAP-TO-ISSUE-PILOT-V1
```

Delivery gate for this slice:

```text
Implementation → npm run verify → Draft PR → Fresh Review → STOP
```

Do not Ready / Merge / close #60 in the implementation run.
