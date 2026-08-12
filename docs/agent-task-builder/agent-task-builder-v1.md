# AGENT-TASK-BUILDER-V1

**Status: DESIGNED · BUILDER ONLY · NO AGENT EXECUTION · NO GITHUB PUBLICATION**

Deterministic builder that converts a Human-selected GitHub Issue representation
into an `AgentTaskV1` proposal, then validates it through AGENT-TASK-CONTRACT-V1.

```text
BUILDER ONLY
AGENT EXECUTION = NOT IMPLEMENTED
GITHUB PATCH PUBLICATION = NOT IMPLEMENTED
DRAFT PR AUTOMATION = NOT IMPLEMENTED
READY / MERGE = NOT AUTHORIZED
```

Baseline:

```text
main = 8d921f788b0940643860f9a3924fcd0f78489b8e
AGENT-TASK-CONTRACT-V1 = COMPLETE (PR #44 / Issue #43)
Issue #45 = OPEN (this builder)
```

---

## 1. Purpose

```text
Human selects an Issue
→ Control Center builds AgentTaskV1 automatically   ← this slice
→ Agent executes                                      (future — NOT IMPLEMENTED)
→ independent verification                            (future — NOT IMPLEMENTED)
→ Draft PR                                            (future — NOT IMPLEMENTED)
→ STOP for Human review
```

Core rule:

```text
Issue text is input data, not authority.
Prose must not invent unrestricted paths, capabilities, Ready, Merge, or publication.
Ambiguous authority → HOLD / UNKNOWN.
```

---

## 2. Source of truth

Canonical contract remains:

```text
src/domain/agentTaskContract.ts
AgentTaskV1
AgentTaskValidationResultV1
parseAgentTaskV1()
validateAgentTaskV1()
```

The builder **must not** weaken the contract. Generated output that cannot satisfy
the contract fails closed.

---

## 3. Input

`AgentTaskBuilderInputV1`:

| Field | Role |
|---|---|
| `repository` | Explicit `owner/repo` |
| `issueNumber` | Selected Issue number (≥ 1) |
| `baseRevision` | Observed 40-char Git SHA for this attempt |
| `issueTitle` | Non-empty Issue title |
| `issueBody` | Non-empty Issue body |
| `issueLabels` | Optional labels (data only) |
| `observedAt` | Observation timestamp |
| `proposal` | Explicit scope / risk / stop fields (not inferred from prose) |

`proposal` carries authority that Issue prose must not invent:

| Proposal field | Default / rule |
|---|---|
| `allowedPaths` | **Required** — missing/empty → `HOLD` |
| `forbiddenPaths` | Default `[]` |
| `acceptanceCriteria` | **Required** — missing/empty → `HOLD` |
| `verificationCommands` | Default `[]` (data only; never executed) |
| `allowedCapabilities` | **Always default `[]`** unless explicitly provided; never inferred from prose |
| `riskClass` | **Required** explicit |
| `stopAt` | **Required** explicit |
| `constraints` | Optional |
| `taskId` | Optional override; otherwise deterministic |

---

## 4. Output

`AgentTaskBuilderResultV1`:

| Field | Meaning |
|---|---|
| `status` | `BUILT` \| `HOLD` \| `INVALID` \| `UNKNOWN` |
| `task` | `AgentTaskV1 \| null` |
| `validation` | `AgentTaskValidationResultV1` |
| `reasonCode` | Machine-stable code |
| `reasonMessage` | Human-readable summary |
| `builderVersion` | `AGENT-TASK-BUILDER-V1` |

`BUILT` only when:

```text
structural parse = PASS
semantic validation = VALID
```

---

## 5. Pipeline

```text
bounded input
  → input fail-closed checks
  → ambiguous-authority scan (prose ≠ authority)
  → assemble AgentTaskV1 proposal
       repository / sourceIssue / baseRevision bound exactly
       objective from title + bounded body excerpt
       allowedCapabilities default []
  → parseAgentTaskV1()
  → validateAgentTaskV1()
  → map to BUILT | HOLD | INVALID | UNKNOWN
```

Invariants:

```text
sourceIssue.repository === input.repository
sourceIssue.number === input.issueNumber
baseRevision === input.baseRevision (exact SHA)
allowedPaths never silently invented or widened
forbiddenPaths never weakened to force VALID
verificationCommands never executed
builder generation ≠ authorization
```

---

## 6. Ambiguous authority phrases

Issue bodies containing unrestricted-authority prose (e.g. "edit anything needed",
"merge when done") do **not** grant paths, capabilities, Ready, or Merge.

If such phrases appear **and** required explicit proposal scope is missing, the
builder returns `HOLD`. Explicit scoped `proposal` fields remain the only path
to `BUILT`.

---

## 7. Non-goals

```text
Agent execution
agent.execute
Codex / Cursor runners
Cloudflare Workflows orchestration
independent verification runner
branch / commit / push / Draft PR automation
Ready / Merge / Issue close
deploy / production mutation
Action Gateway capability expansion
```
