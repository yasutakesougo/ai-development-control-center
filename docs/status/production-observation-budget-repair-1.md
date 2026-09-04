# PRODUCTION-OBSERVATION-BUDGET-REPAIR-1

## Phase

```text
PHASE 1 — Definition (LOCKED)
PHASE 2 — Failure Semantics Definition (DEFINED)
PHASE 3 — Bounded Observation Design (DEFINED)
PHASE 4 — Implementation Scope Definition (DEFINED)
```

## Status

```text
DEFINITION LOCKED
Independent Definition Review-1: REVIEW-CLEARED
Human Definition Lock GO: CONSUMED
PHASE 2 Failure Semantics: DEFINED
  docs/status/production-observation-budget-repair-1-failure-semantics.md
PHASE 3 Bounded Observation Design: DEFINED
  docs/status/production-observation-budget-repair-1-bounded-observation.md
PHASE 4 Implementation Scope: DEFINED
  docs/status/production-observation-budget-repair-1-implementation-scope.md
Independent Scope Review-1: REVIEW-CLEARED @ ebdb3d2
Human Implementation Start GO: CONSUMED
Implementation Start: CONSUMED / APPLIED
Ready / Merge / Deploy: NOT AUTHORIZED
Mutation: 0 (docs-only; Scope Review recorded; code not authorized)
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

PR #147 Definition HEAD at Independent Definition Review-1:

```text
base SHA = 91b96b250658ab4c5eab81d13ad95392cd2a84b0
(review applies to Definition content; subsequent clarification commit may advance HEAD)
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

## PHASE 1 Lock boundary (explicit)

Human Definition Lock GO, when consumed, locks **only** the items below.
It does **not** lock PHASE 2/3 numeric budgets, prioritizer order, or Tier
membership rules.

### LOCK (PHASE 1)

| # | Lock item |
|---|---|
| 1 | Observation cost must be bounded |
| 2 | Open PR count must not blind repository / main observation |
| 3 | `PARTIAL` ≠ `CONFIRMED` |
| 4 | Unobserved PRs must be explicit |
| 5 | `PARTIAL` must fail closed for Human Gate (no GO candidates from PARTIAL) |
| 6 | Selection must be deterministic |
| 7 | Why observed / omitted must be auditable |

Also locked with Definition:

| Item | Content |
|---|---|
| Historical failure classification | Architecture defect remains despite PR-count recovery |
| Objective | As stated above |
| Non-goals / rejects | As stated below |
| Parent / child structure | Parent repair program + `BOUNDED-GITHUB-OBSERVATION-V1` implementation child |
| Next phase after Lock | PHASE 2 Failure Semantics Definition (**not** coding) |

### Deferred at PHASE 1 Lock; now defined in later phases

| Item | Where defined |
|---|---|
| `CONFIRMED` / `PARTIAL` / `ERROR` meanings | PHASE 2 — DEFINED |
| PARTIAL Human Gate fail-closed rules | PHASE 2 — DEFINED |
| `SAFE_BUDGET` / `MAX_DETAILED_PRS` | PHASE 3 — DEFINED (`45` / `14`) |
| Exact prioritizer order + Tier membership | PHASE 3 — DEFINED |
| Exact TypeScript field / file Scope | PHASE 4 — DEFINED |
| Exact UI/readback copy | PARTIAL reason copy locked in Scope; broader UI polish deferred |

PHASE 1 no longer leaves these as open design intent once PHASE 2/3 docs exist.
Pre-Lock “example only” numbers in older sections are superseded by PHASE 3.
## Principles (map to LOCK items)

| Principle | LOCK # | Content |
|---|---|---|
| Budget is a safety boundary | 1 | Do not simply raise the limit above the Cloudflare constraint |
| Do not lose repo evidence | 2 | Open PR pressure must not force whole-repository `ERROR` when Tier-0 succeeded |
| Cost bounded | 1 | No unbounded fan-out against Open PR count |
| Partial ≠ Confirmed | 3, 4 | Unobserved PRs must not be treated as fully observed; omissions explicit |
| Human Gate fail-closed | 5 | Do not infer GO / actionable Human decisions from incomplete evidence |
| Deterministic | 6 | Which PRs receive detailed observation must be deterministic |
| Auditability | 7 | Persist why a PR was observed vs omitted |

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
         CONFIRMED | PARTIAL | ERROR  (exact semantics / fields)
PHASE 3  Bounded Observation Design
         Tier model, prioritizer, SAFE_BUDGET / MAX_DETAILED_PRS
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

PHASE 2–4 details below are **design intent for review**, not PHASE 1 Lock and
not Implementation authorization.

### PHASE 2 intent — Failure semantics (not locked)

Separate (exact field names / enum migration deferred to PHASE 2):

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

PHASE 1 Lock #5 already requires: **PARTIAL must not create GO candidates**.
PHASE 2 defines the precise semantics / payload shape.

### PHASE 3 intent — Bounded observation (not locked)

Illustrative Tier sketch only:

```text
Tier 0  Repository GET + default-branch HEAD + Open PR list
        → always (supports LOCK #2)
Tier 1  Human-Gate-relevant PRs → detailed observation (bounded)
Tier 2  Remaining Open PRs → summary only
```

Illustrative prioritizer sketch only (exact order = DO NOT LOCK YET):

```text
example candidates:
  Human Decision marker PRs
  Target Issue / gate-packet related PRs
  non-draft + current base main
  recently updated PRs
  else summary-only
```

Illustrative cost headroom only (exact values = DO NOT LOCK YET):

```text
example only:
  SAFE_BUDGET = 45
  MAX_DETAILED_PRS = floor((45 - 3) / 3) = 14
```

Hard Cloudflare `SUBREQUEST_LIMIT = 50` remains a safety boundary (LOCK #1).
Exact SAFE_BUDGET / MAX_DETAILED_PRS / prioritizer / Tier membership are locked
in PHASE 3 (and Scope), not here.

### PHASE 4 — Implementation Scope (DEFINED)

Superseded as sketch. Authoritative Scope:

```text
docs/status/production-observation-budget-repair-1-implementation-scope.md
```

## Acceptance direction (locked later in Scope / Verification)

Minimum boundary matrix intent (exact N set deferred; invariant is PHASE 1):

```text
example N set: {0, 1, 14, 15, 16, 19, 30, 100}
```

Critical acceptance invariant (PHASE 1 aligned):

```text
budget pressure / large Open PR count
  ⇒ repository observation ≠ ERROR when Tier-0 succeeded
omitted PRs ⇒ Human GO inference prohibited
actual GitHub requests never exceed SUBREQUEST_LIMIT
selection deterministic for identical inputs
observed / omitted reasons auditable
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

## Target architecture (Definition intent; not numeric lock)

```text
GitHub
  ↓
Repository / main
  → always observed first
  ↓
Open PR list
  ↓
Deterministic Prioritizer   ← algorithm locked in PHASE 3
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

## Independent Definition Review-1

```text
Subject:     PR #147 / PRODUCTION-OBSERVATION-BUDGET-REPAIR-1 PHASE 1 Definition
Base:        main @ 91b96b250658ab4c5eab81d13ad95392cd2a84b0
Reviewed:    exact Definition re-read + Lock-boundary clarification
VERDICT:     REVIEW-CLEARED
P0:          0
P1:          0
P2:          0 (clarity note applied: PHASE 1 Lock vs PHASE 2/3 design intent)
```

| Focus check | Result | Disposition |
|---|---|---|
| PARTIAL semantics direction (`PARTIAL` ≠ `CONFIRMED`; no GO from PARTIAL) | PASS | CLOSED — LOCK #3/#5 |
| Tier 0 preservation (repo/main not blinded by PR fan-out) | PASS | CLOSED — LOCK #2 |
| Human Gate fail-closed under incomplete PR detail | PASS | CLOSED — LOCK #5 |
| Bounded cost invariant (no unbounded fan-out; no limit raise-as-fix) | PASS | CLOSED — LOCK #1 + rejects |
| Deterministic selection required | PASS | CLOSED — LOCK #6; exact order deferred |
| Auditability of observed / omitted | PASS | CLOSED — LOCK #7 |
| PHASE 1 Lock content vs PHASE 2/3 design intent separation | PASS after clarification | CLOSED — explicit LOCK / DO NOT LOCK sections |

```text
Correction-1 required for P0/P1: NO
Human Definition Lock GO: later CONSUMED by explicit Human authorization
Implementation Start: NO
Ready / Merge / Deploy: NO
```

## Delivery gate (current)

```text
PHASE 0 Historical Failure Fixation     = FIXED
PHASE 1 Definition                      = LOCKED
Independent Definition Review-1         = REVIEW-CLEARED
Human Definition Lock GO                = CONSUMED
PHASE 2 Failure Semantics Definition    = DEFINED
PHASE 3 Bounded Observation Design      = DEFINED
PHASE 4 Implementation Scope Definition = DEFINED
Independent Scope Review                = REVIEW-CLEARED @ ebdb3d2
Human Implementation Start GO           = CONSUMED
BOUNDED-GITHUB-OBSERVATION-V1 code      = APPLIED (allowlist)
Ready / Merge / Deploy                  = NOT AUTHORIZED
```

## Human Definition Lock GO

```text
Human Definition Lock GO: CONSUMED
Consumed on: Human authorization to proceed
  Human Definition Lock GO
  → PHASE 2 Failure Semantics Definition
  → PHASE 3 Bounded Observation Design
Locked content: PHASE 1 Lock items 1–7 + Objective / rejects / parent-child
Next: Human Implementation Start GO
  (Independent Scope Review-1 = REVIEW-CLEARED @ ebdb3d2)
```

## Authority boundary

```text
Definition is locked. PHASE 2 semantics, PHASE 3 bounded design, and PHASE 4
Implementation Scope are defined.
Independent Scope Review-1 = REVIEW-CLEARED @ ebdb3d2.
Human Implementation Start GO = CONSUMED.
Minimal implementation authorized on Scope allowlist only.
Ready / Merge / Deploy remain NOT AUTHORIZED.
```