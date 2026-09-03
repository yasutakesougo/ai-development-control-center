# PRODUCTION-OBSERVATION-BUDGET-REPAIR-1 — Issue templates

Copy/paste templates for GitHub Issues. Agent Issue write was unavailable
(`403 Resource not accessible by personal access token`) at Definition drafting.

Do not treat template presence as Issue creation, Definition Lock, or
Implementation Start.

---

## Parent Issue

**Title**

```text
PRODUCTION-OBSERVATION-BUDGET-REPAIR-1 — bounded observation so Open PR count cannot blind the Control Center
```

**Body**

```markdown
# PRODUCTION-OBSERVATION-BUDGET-REPAIR-1

## Current gate

```text
PHASE 0 Historical Failure Fixation = FIXED
PHASE 1 Definition                  = REVIEW-CLEARED
Independent Definition Review-1     = REVIEW-CLEARED
Human Definition Lock GO            = AWAITING
Implementation Start                = NOT AUTHORIZED
Ready / Merge / Deploy              = NOT AUTHORIZED
```

PHASE 1 locks only the seven invariants (bounded cost; do not blind repo/main;
PARTIAL ≠ CONFIRMED; omitted PRs explicit; PARTIAL fail-closed for Human Gate;
deterministic selection; auditability). It does **not** lock SAFE_BUDGET,
MAX_DETAILED_PRS, exact prioritizer order, or Tier membership rules.

## Docs

- `docs/status/production-observation-budget-repair-1-historical-failure.md`
- `docs/status/production-observation-budget-repair-1.md`

## Historical failure (immutable)

```text
Open PR = 19
required cost = 60
SUBREQUEST_LIMIT = 50
Production = 3/3 ERROR
Root Cause = SUBREQUEST_BUDGET_OVERFLOW / CONFIRMED
```

Current recovery (`Open PR = 2`, ERROR not reproduced) was caused by **PR-count reduction**. Architecture is **not** repaired.

## Objective

Open Pull Request count must not force whole-repository observation into `ERROR`.
Observation cost must stay bounded. Unobserved PRs must be explicit and fail-closed. Unobserved data must never be treated as observed.

This is **not** `SUBREQUEST_LIMIT = 100`.

## Child structure

```text
Parent  PRODUCTION-OBSERVATION-BUDGET-REPAIR-1   ← this issue
└─ Implementation  BOUNDED-GITHUB-OBSERVATION-V1
```

## Next

```text
Human Definition Lock GO
→ PHASE 2 Failure Semantics Definition
→ PHASE 3 Bounded Observation Design
→ PHASE 4 Implementation Scope Definition
→ …
→ BOUNDED-GITHUB-OBSERVATION-V1 implementation (separate Human Implementation Start GO)
```

## Authority boundary

No Implementation coding, Ready, Merge, or Deploy from this parent until the locked gate sequence completes.
```

---

## Child Issue (create after parent; link as sub-issue if available)

**Title**

```text
BOUNDED-GITHUB-OBSERVATION-V1 — implement bounded detailed PR observation + PARTIAL semantics
```

**Body**

```markdown
# BOUNDED-GITHUB-OBSERVATION-V1

Parent: PRODUCTION-OBSERVATION-BUDGET-REPAIR-1

## Current gate

```text
Human Definition Lock GO:            AWAITING / NOT CONSUMED on parent
Failure Semantics Definition:        NOT STARTED
Implementation Scope Definition:     NOT STARTED
Human Implementation Start GO:       NOT AUTHORIZED
Code / tests:                        NOT AUTHORIZED
Ready / Merge / Deploy:              NOT AUTHORIZED
```

## Intent (not scope-locked yet)

Replace whole-repository `ERROR` on budget overflow with bounded detailed PR observation and explicit `PARTIAL` evidence when some Open PRs are omitted under budget.

Keep Cloudflare `SUBREQUEST_LIMIT = 50` as a hard safety boundary; use SAFE_BUDGET headroom instead of raising the limit.

## Depends on

1. Parent Definition Lock
2. PHASE 2 Failure Semantics Definition
3. PHASE 3 Bounded Observation Design
4. PHASE 4 Implementation Scope Definition + Independent Scope Review
5. Human Implementation Start GO

## Authority boundary

This Issue does not authorize coding until Human Implementation Start GO after Scope Review.
```
