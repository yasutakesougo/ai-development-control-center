# PRODUCTION-OBSERVATION-BUDGET-REPAIR-1

## Phase

```text
PHASE 1 — Definition
```

## Status

```text
DEFINITION DRAFTED
Human Definition Lock GO: NOT CONSUMED / AWAITING
Implementation Start: NOT AUTHORIZED
Ready / Merge / Deploy: NOT AUTHORIZED
Mutation: 0 (docs-only Definition track)
```

## Parent / child structure

```text
Parent
PRODUCTION-OBSERVATION-BUDGET-REPAIR-1
│
├─ Definition / Semantics / Scope   ← this document + PHASE 0 fixation
│
└─ Implementation
   BOUNDED-GITHUB-OBSERVATION-V1    ← separate issue; not started
```

Issue creation from this agent connection was blocked (`403` on Issues write).
Use the templates in
`docs/status/production-observation-budget-repair-1-issue-templates.md`
to open the parent + child Issues after Definition Lock if they do not yet exist.
## Baseline

Historical failure fixation (immutable):

```text
docs/status/production-observation-budget-repair-1-historical-failure.md
```

```text
Open PR = 19
required cost = 60
SUBREQUEST_LIMIT = 50
Production = 3/3 ERROR
Root Cause = SUBREQUEST_BUDGET_OVERFLOW / CONFIRMED
```

Current recovery (not architecture repair):

```text
Open PR = 2
required cost = 9
Production ERROR = not reproduced
Cause of recovery = PR-count reduction only
```

Observed `main` at Definition drafting:

```text
91b96b250658ab4c5eab81d13ad95392cd2a84b0
```

Predecessor (kept; insufficient alone):

```text
GITHUB-OBSERVATION-SUBREQUEST-BUDGET-V1 Slice A (#136 / 2453162)
= fail-closed before unbounded fan-out
≠ preserve repository-level evidence under budget pressure
```

## Problem

When Open PR count pushes modeled observation cost above the Cloudflare
Workers subrequest safety boundary, the current observer returns repository-wide
`ERROR` and nulls `currentMain` / `openPullRequests`.

That makes the Control Center observationally blind even though Tier-0
repository / default-branch / Open-PR-list data were already fetchable.

Raising `SUBREQUEST_LIMIT`, keeping Open PR count artificially low, or treating
`ERROR` as `CONFIRMED` does not repair the unbounded fan-out structure.

## Objective

```text
Open Pull Request 数が増えても、
Repository-level observation 全体を ERROR にしない。

Observation cost は bounded でなければならない。

未観測の PR が存在する場合は、
その事実を明示して fail-closed に扱う。

観測できていない情報を
観測済みとして扱ってはならない。
```

This Objective is **not** “change 50 → 100”.

## Principles (Definition Lock candidates)

| Principle | Content |
|---|---|
| Budget is a safety boundary | Do not simply raise the limit above the Cloudflare constraint |
| Do not lose repo evidence | One / many PRs must not force whole-repository `ERROR` when Tier-0 succeeded |
| Cost bounded | No unbounded fan-out against Open PR count |
| Partial ≠ Confirmed | Unobserved PRs must not be treated as fully observed |
| Human Gate fail-closed | Do not infer GO / actionable Human decisions from incomplete evidence |
| Deterministic | Which PRs receive detailed observation must be deterministic |
| Auditability | Persist why a PR was observed vs omitted |

## Non-goals (explicit rejects)

```text
❌ SUBREQUEST_LIMIT = 100
❌ Operational rule “keep Open PRs ≤ 15”
❌ Swallow ERROR and emit CONFIRMED
❌ Stop reading PR details entirely
❌ Immediate full GraphQL migration
❌ Solve by retry alone
❌ Caching / distributed observer / deploy automation in V1
❌ Automatic PR close
❌ GitHub App permission redesign
```

## Recommended subsequent phases (not locked by this Definition)

After **Human Definition Lock GO**, the program continues:

```text
PHASE 2  Failure Semantics Definition
         CONFIRMED | PARTIAL | ERROR
PHASE 3  Bounded Observation Design
         Tier-0 always / Tier-1 bounded detail / Tier-2 summary-only
         Deterministic prioritizer
         SAFE_BUDGET headroom (example only until Semantics/Scope lock:
           SAFE_BUDGET = 45, MAX_DETAILED_PRS = floor((45-3)/3) = 14)
PHASE 4  Implementation Scope Definition
         → Independent Scope Review-1
         → Scope Correction if needed
         → Human Implementation Start GO
PHASE 5  Minimal Implementation (BOUNDED-GITHUB-OBSERVATION-V1)
PHASE 6  Focused Verification + boundary matrix
         → Exact Implementation HEAD Fixation
         → Independent Implementation Review-1
         → Human Ready GO
         → Human Merge GO
         → separate Human Deploy GO
         → Post-Deploy Production Readback
         → Closure
```

PHASE 2–4 details below are **design intent for review**, not Implementation
authorization.

### PHASE 2 intent — Failure semantics

Separate:

| State | Meaning |
|---|---|
| `CONFIRMED` | Required observation range fully obtained |
| `PARTIAL` | Repository / main confirmed; detailed PR observation incomplete under budget |
| `ERROR` | GitHub API / repository / main themselves untrustworthy |

Under the historical 19-PR condition, target shape is approximately:

```text
main = confirmed
openPrCount = 19
detailedPrObservation = PARTIAL
Human Action = UNKNOWN / HOLD
(not repository-wide ERROR)
```

V1 strongly recommends: **PARTIAL must not create GO candidates**.

### PHASE 3 intent — Bounded observation

```text
Tier 0  Repository GET + default-branch HEAD + Open PR list
        → always
Tier 1  Human-Gate-relevant PRs → detailed observation (bounded)
Tier 2  Remaining Open PRs → summary only
```

Deterministic priority (no “newest 15” as sole rule):

```text
1. Human Decision marker PRs
2. Target Issue / gate-packet related PRs
3. non-draft + current base main
4. recently updated PRs
else summary-only
```

Cost remains modeled against the Cloudflare boundary with **safety headroom**.
Exact `SAFE_BUDGET` / `MAX_DETAILED_PRS` are locked in Semantics / Scope, not by
raising the hard Cloudflare limit.

### PHASE 4 intent — Implementation scope sketch

**IN SCOPE (V1)**

- bounded detailed PR observation
- deterministic PR prioritization
- `PARTIAL` evidence semantics
- observed / omitted counts
- budget metadata
- Human Gate fail-closed handling for PARTIAL
- tests (including real request-count bound, not formula-only)
- UI / readback PARTIAL display

**OUT OF SCOPE (V1)**

- GitHub GraphQL migration
- request batching platform
- caching
- distributed observer
- Cloudflare limit change
- automatic PR close
- GitHub App permission redesign
- retry architecture
- deployment automation

## Acceptance direction (locked later in Scope / Verification)

Minimum boundary matrix intent:

```text
N ∈ {0, 1, 14, 15, 16, 19, 30, 100}
```

Critical acceptance:

```text
N ≥ 16  ⇒  repository observation ≠ ERROR
omitted PRs ⇒ Human GO inference prohibited
actual GitHub requests never exceed SUBREQUEST_LIMIT
selection deterministic for identical inputs
```

Post-deploy readback (after separate Human Deploy GO):

```text
1. /api/status ×3
2. /api/status-overlay ×3
3. openPrCount
4. evidenceState
5. Human Action
6. observed / omitted counts
7. no ERROR recurrence under budget pressure
```

Do not mass-create disposable PRs solely for testing.

## Target architecture (Definition intent)

```text
GitHub
  ↓
Repository / main
  → always observed first
  ↓
Open PR list
  ↓
Deterministic Prioritizer
  ↓
Bounded Detailed Observer
  ├─ observed PRs
  └─ omitted PRs
        ↓
Evidence Aggregator
  ├─ CONFIRMED
  ├─ PARTIAL
  └─ ERROR
        ↓
Human Gate
  ↓
Fail-Closed Decision
```

## Delivery gate (current)

```text
PHASE 0 Historical Failure Fixation     = FIXED
PHASE 1 Definition                      = DRAFTED (this document)
Human Definition Lock GO                = AWAITING
PHASE 2 Failure Semantics Definition    = NOT STARTED
PHASE 3 Bounded Observation Design      = NOT STARTED
PHASE 4 Implementation Scope Definition = NOT STARTED
Independent Scope Review                = NOT STARTED
Human Implementation Start GO           = NOT AUTHORIZED
BOUNDED-GITHUB-OBSERVATION-V1 code      = NOT AUTHORIZED
Ready / Merge / Deploy                  = NOT AUTHORIZED
```

## Human Definition Lock GO

Lock this Definition only by explicit Human GO.

Locking means agreement on:

1. Historical failure remains an architecture defect despite current PR-count recovery
2. Objective above (bounded observation; no whole-repo ERROR solely from PR fan-out)
3. Principles table
4. Non-goals / rejects
5. Parent/child issue structure
6. Next phase after Lock = PHASE 2 Failure Semantics Definition (not coding)

```text
Human Definition Lock GO: NOT CONSUMED
```

## Authority boundary

```text
This document authorizes Definition review and Human Definition Lock only.
It does not authorize Implementation Scope Start as complete,
Implementation coding, Ready, Merge, or Deploy.
```
