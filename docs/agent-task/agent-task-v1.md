# AGENT-TASK-V1

**Status: DESIGNED · NOT IMPLEMENTED · NO AGENT EXECUTION · NO GITHUB PUBLICATION**

This document defines the machine-readable **Agent Task** contract — the canonical
source of truth that replaces manually written Agent instructions.

```text
CONTRACT ONLY
AGENT EXECUTION = NOT IMPLEMENTED
GITHUB PATCH PUBLICATION = NOT IMPLEMENTED
DRAFT PR AUTOMATION = NOT IMPLEMENTED
READY / MERGE = NOT AUTHORIZED
```

Baseline at drafting:

```text
main = c9c8fd838c3a11fa71f68d256f94b3fc54155ce1
ACTION-GATEWAY-V1 = MERGED (PR #42)
Issue #43 = OPEN (this contract)
```

---

## 1. Purpose

The first completion milestone is:

```text
Human selects an Issue
→ Control Center builds an AgentTaskV1 automatically
→ Agent executes in an isolated runner          (future — NOT IMPLEMENTED)
→ independent verification                      (future — NOT IMPLEMENTED)
→ Draft PR                                      (future — NOT IMPLEMENTED)
→ STOP for Human review
```

This slice covers **only the contract-first foundation**. Natural-language Agent
prompts may later be rendered from this contract, but are not authoritative.

Core principle:

```text
Do not start from an LLM prompt.
The versioned machine-readable contract / JSON Schema is canonical.
```

---

## 2. Relationship to other modules

| Module | Role vs Agent Task |
|---|---|
| AgentTaskV1 | Canonical task specification. Generation ≠ authorization. |
| STATUS-OVERLAY-V1 | Decision support only. Recommendation ≠ authorization. |
| Approval Ledger | Human intent / evidence. Record ≠ execution. |
| Action Gateway | External-mutation boundary. Agent tasks do not invoke Gateway in V1. |
| Agent runner | Separate, NOT IMPLEMENTED. |

Invariants:

```text
Agent task generation ≠ authorization
Orchestrator dispatch decision ≠ authorization
STATUS-OVERLAY recommendation ≠ authorization
Approval Ledger record ≠ execution
Action Gateway remains the external-mutation boundary
Contract validation does not execute commands, modify files, call Agents,
  publish branches, or mutate GitHub
```

Do **not** add `agent.execute` to ACTION-GATEWAY-V1 in this slice.
Do **not** reuse `github.comment.create.v1` as a generic Agent capability.

---

## 3. Documents

| Artifact | Path |
|---|---|
| AgentTaskV1 schema | `schemas/agent-task-v1.schema.json` |
| AgentTaskValidationResultV1 schema | `schemas/agent-task-validation-result-v1.schema.json` |
| Valid fixture | `fixtures/task-valid.json` |
| TypeScript contract | `src/domain/agentTaskContract.ts` |
| Tests | `test/agentTaskContract.test.ts` |

---

## 4. AgentTaskV1 concepts

| Field | Role |
|---|---|
| `schemaVersion` | Fixed `AGENT-TASK-V1` |
| `taskId` | Stable identifier for one task attempt |
| `repository` | Explicit `owner/repo` |
| `baseRevision` | Immutable Git SHA for the attempt |
| `sourceIssue` | Originating GitHub Issue |
| `objective` | Bounded, non-empty goal statement |
| `allowedPaths` | Explicit workspace write boundaries |
| `forbiddenPaths` | Explicit deny boundaries |
| `acceptanceCriteria` | Human-verifiable completion conditions |
| `verificationCommands` | Explicit data; not execution authority |
| `allowedCapabilities` | Default-deny capability allowlist |
| `riskClass` | Reserved R0–R5 classification |
| `stopAt` | Explicit non-publication or Draft-PR stop target |
| `constraints` | Optional bounded-work limits |
| `metadata` | Audit / provenance fields |

---

## 5. Risk classes (reserved, not authorized)

| Class | Meaning |
|---|---|
| R0 | Read-only research |
| R1 | Isolated workspace code/test activity |
| R2 | Bounded GitHub publication (branch / Draft PR) |
| R3 | Ready / Issue close / workflow dispatch |
| R4 | Merge / deploy / migration |
| R5 | Permission / secret / destructive operation |

This Issue does **not** authorize execution of any class.

---

## 6. stopAt values (V1)

| Value | Meaning |
|---|---|
| `TASK_BUILT` | Contract emitted; no runner activity |
| `AGENT_COMPLETE` | Agent finished locally; no publication |
| `VERIFY_COMPLETE` | Verification finished; no publication |
| `DRAFT_PR` | First milestone target — Draft PR then Human review |

Future publication slices may extend stopAt; V1 parser accepts only the values above.

---

## 7. Validation behavior

Runtime validation is deterministic and fail-closed:

- Malformed raw values return structured results; parsers never throw.
- Unknown root properties are rejected (`additionalProperties: false`).
- Path boundaries must not silently authorize paths outside `allowedPaths`.
- Path lists reject exact duplicates and duplicates after trailing-slash
  normalization (`docs/foo` ≡ `docs/foo/`).
- Absolute paths, empty segments (`//`), and `.` / `..` segments fail closed.
- Allowed/forbidden exact duplicates and deterministic prefix overlaps are rejected.
- `verificationCommands[].id` must be unique within one task; duplicate ids are
  `REJECTED_SCHEMA` (JSON Schema cannot express nested-property uniqueness, so
  runtime owns this rule and documents it on the schema).
- Semantic conflicts that cannot be resolved mechanically yield `HOLD` or `UNKNOWN`.
- Validation itself never executes `verificationCommands`.

Validation result statuses:

| Status | Meaning |
|---|---|
| `VALID` | Structural + semantic checks passed |
| `INVALID` | Deterministic rejection |
| `HOLD` | Ambiguous boundary conflict; Human resolution required |
| `UNKNOWN` | Insufficient information to decide safely |

### Schema / TypeScript / runtime parity

| Concern | Canonical rule |
|---|---|
| Root / nested keys | `additionalProperties: false` in schema; `hasOnlyKeys` in runtime |
| Path grammar | Shared pattern (no absolute / `//` / `.` / `..` segments) |
| Path uniqueness | Exact + trailing-slash-normalized uniqueness |
| Verification command ids | Unique within array (runtime-enforced; schema-documented) |
| Validation findings bounds | Schema maxLengths mirrored by runtime parsers |
| Capability ids | Default-deny; empty array authorizes nothing |

---

## 8. Slice 1 roadmap context

```text
1. AGENT-TASK-CONTRACT-V1          ← this slice
2. AGENT-TASK-BUILDER-V1
3. MIN-ORCHESTRATOR-V1
4. AGENT-RUNNER-V1
5. INDEPENDENT-VERIFY-V1
6. DRAFT-PUBLISH-V1
7. NO-PROMPT-PILOT-V1
```

MVP-1 KPI: **Manual Agent Prompt = 0**
