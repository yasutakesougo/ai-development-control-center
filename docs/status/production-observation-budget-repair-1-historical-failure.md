# PRODUCTION-OBSERVATION-BUDGET-REPAIR-1 — PHASE 0 Historical Failure Fixation

## Phase

```text
PHASE 0 — Historical Failure Fixation
```

## Status

```text
FIXED / IMMUTABLE BASELINE
Mutation: 0
```

## Purpose

This document freezes the production observation failure that motivated
`PRODUCTION-OBSERVATION-BUDGET-REPAIR-1`.

It is an immutable reference point. Later recovery of production behavior by
Open-PR-count reduction must not be misread as an architecture repair.

## Historical failure (immutable)

```text
Program:                 PRODUCTION-OBSERVATION-FAILURE-INVESTIGATION-1
Root Cause Candidate:    A. SUBREQUEST_BUDGET_OVERFLOW
Root Cause Status:       CONFIRMED
Investigation PHASE 5:   Active production commit equivalent to
                         91b96b250658ab4c5eab81d13ad95392cd2a84b0
                         (asset fingerprint byte-identical;
                          Cloudflare Version ID still UNKNOWN via API)
```

### Failure measurements

| Field | Value |
|---|---|
| Open PR count | **19** |
| Cost model | `requiredCost(N) = 3 + 3N` |
| Required cost | **60** (`3 + 3 × 19`) |
| `SUBREQUEST_LIMIT` | **50** |
| Predicate | `requiredCost(pulls.length) > 50` → fail-closed |
| Error code | `GITHUB_SUBREQUEST_BUDGET_EXCEEDED` |
| Production observation | **3/3 ERROR** (same failure path) |
| Lost fields under current fail-closed path | `currentMain = null`, `openPullRequests = null`, repository-level evidence discarded after base fetches |

### Observer code path (then-current)

After Open PR list fetch:

```text
if (requiredCost(pulls.length) > SUBREQUEST_LIMIT)
  → evidenceState = ERROR
  → currentMain = null
  → openPullRequests = null
  → errors = [GITHUB_SUBREQUEST_BUDGET_EXCEEDED]
```

Budget guard introduction:

```text
Commit: 2453162654338ea671a8a35b7da3f0736fd6895d
PR:     #136 GITHUB-OBSERVATION-SUBREQUEST-BUDGET-V1 Slice A
```

That Slice A correctly prevented Cloudflare subrequest overrun. It also made
repository observation wholly ERROR when Open PR count pushed modeled cost over
50 — discarding already-fetched repository/main evidence.

## Current recovery (not a repair)

Observed after investigation closeout (2026-09-03):

| Field | Value |
|---|---|
| Open PR count | **2** |
| Required cost | **9** (`3 + 3 × 2`) |
| Production `/api/status-overlay` | ERROR **not reproduced** (3/3 usable responses) |
| Production asset fingerprint vs `91b96b2` | MATCH |

```text
IMPORTANT:
Recovery was caused by PR-count reduction.
Architecture itself is not repaired.

Open PR count returning above the modeled budget threshold will recreate the
same repository-wide ERROR path.
```

## Misread prohibition

The following conclusions are forbidden from this baseline:

```text
❌ "Production works now, so no repair is needed"
❌ "Raising SUBREQUEST_LIMIT alone closes the incident"
❌ "Keeping Open PR count low is an acceptable architecture"
❌ "ERROR may be treated as CONFIRMED because main is known from elsewhere"
```

## Authority boundary

```text
This fixation authorizes nothing.
It does not authorize Definition Lock, Implementation, Ready, Merge, or Deploy.
```

## Next

```text
→ PHASE 1 Definition
→ Human Definition Lock GO
```
