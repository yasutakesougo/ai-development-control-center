# Consistency repair before #66 / #70

**Status:** DESIGN / ISSUE-GRAPH REPAIR · NO IMPLEMENTATION  
**Judgment:** MOSTLY CONSISTENT / REPAIR BEFORE #66/#70  
**Counts:** P0 = 0 · P1 = 2 · P2 = 1

This document is the repaired canonical planning chain for Issues #57–#76.
GitHub Issue bodies should be updated to match the proposed texts under
`docs/planning/issue-bodies/` before implementation starts on #66 or #70.

Invariant preserved by this repair:

```text
proposal ≠ mutation authority
VALID ≠ GitHub write authorization
single-repo scheduler ≠ repository policy / multi-repo scheduling
```

---

## Findings

### P1-1 — #70 circular design dependency on Repository Policy

`DEPENDENCY-SCHEDULER-V1` (#70) said selection is based on repository policy, but
its declared dependencies are only #68 / #69. Repository Policy is #73, which sits
*after* #70 → #71 → #72 in the chain. Treating #73 as required by #70 creates a
cycle.

**Repair:** #70 is a **single-repo** scheduler. Decision inputs are dependency,
resource lock, Human gate, and fixed local concurrency. `RepositoryPolicyV1 = OUT`.
#74 is the first slice that integrates:

```text
Dependency Scheduler
+ Repository Registry
+ Repository Policy
→ Multi-Repo Scheduler
```

### P1-2 — #66 missing GitHub Issue creation authority slice

#66 is designed around `github.issue.create.v1`, but depended only on #63 / #64.
That skips the mutation authority boundary:

```text
VALID proposal
→ GitHub mutation authorization
→ Action Gateway
→ Issue creation
```

Planner/Validator must not write GitHub directly.

**Repair:** add `ISSUE-CREATE-CAPABILITY-V1` and wire:

```text
#63 Validator ────────┐
#64 Decomposer ───────┼→ ISSUE-PUBLISHER-V1
ISSUE-CREATE-CAPABILITY-V1 ┘
```

### P2 — #67 pilot path must include the new capability

#67 correctly pilots Project → Roadmap → Decomposer → Validator → Publisher →
GitHub Issue(s). Once `ISSUE-CREATE-CAPABILITY-V1` exists, #67 must depend on it
and show the authority boundary in the pilot path.

---

## Repaired canonical sequence

```text
#57  Runner-Publish Handoff
 ↓
#59  No-Prompt Pilot V2
 ↓
#60  Project Contract
 ↓
#61  Roadmap Contract
 ↓
#62  Issue Decomposer Contract
 ↓
#63  Issue Validator
 ├────────→ #65 Issue Splitter
 ↓
#64  Issue Decomposer
 ↓
NEW  ISSUE-CREATE-CAPABILITY-V1
 ↓
#66  Issue Publisher
 ↓
#67  Roadmap-to-Issue Pilot
 ↓
#68  Dependency Graph
 ↓
#69  Resource Lock
 ↓
#70  Single-Repo Dependency Scheduler
 ↓
#71  Auto-Dispatch Pilot
 ↓
#72  Repository Registry
 ↓
#73  Repository Policy
 ↓
#74  Multi-Repo Scheduler
 ↓
#75  Multi-Repo Pilot
 ↓
#76  Project Autopilot
```

Unchanged and still consistent:

- #59 closes the existing execution engine as V2 after #57.
- #60 is contract-first Project truth before Planner.
- Project → Roadmap → Issue Proposal → Validator → Decomposer order remains
  contract-before-prompt.

---

## Apply checklist (GitHub Issues)

| Step | Action | Source body |
|---|---|---|
| 1 | **Create** `ISSUE-CREATE-CAPABILITY-V1` | [`issue-bodies/NEW-issue-create-capability-v1.md`](./issue-bodies/NEW-issue-create-capability-v1.md) |
| 2 | Note the new GitHub number; substitute into #66/#67 | — |
| 3 | **Update** #66 | [`issue-bodies/66-issue-publisher-v1.md`](./issue-bodies/66-issue-publisher-v1.md) |
| 4 | **Update** #67 | [`issue-bodies/67-roadmap-to-issue-pilot-v1.md`](./issue-bodies/67-roadmap-to-issue-pilot-v1.md) |
| 5 | **Update** #70 (single-repo; RepositoryPolicy OUT) | [`issue-bodies/70-dependency-scheduler-v1.md`](./issue-bodies/70-dependency-scheduler-v1.md) |
| 6 | **Update** #74 (Scheduler + Registry + Policy) | [`issue-bodies/74-multi-repo-scheduler-v1.md`](./issue-bodies/74-multi-repo-scheduler-v1.md) |

Suggested titles are the first heading / filename convention in each body file’s YAML-less header line.

---

## Notes for implementers

- Do **not** start #66 until ISSUE-CREATE-CAPABILITY-V1 exists and #66 depends on it.
- Do **not** start #70 with RepositoryPolicyV1 inputs; keep policy in #73/#74.
- After GitHub Issues are updated, substitute the real NEW issue number into #66/#67
  dependency lines (`ISSUE-CREATE-CAPABILITY-V1` / `NEW` placeholders).
