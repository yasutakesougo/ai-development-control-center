# PRODUCTION-OBSERVATION-BUDGET-REPAIR-1 — PHASE 2 Failure Semantics Definition

## Phase

```text
PHASE 2 — Failure Semantics Definition
```

## Status

```text
SEMANTICS DEFINED
Parent Definition Lock: CONSUMED
Human Definition Lock GO: CONSUMED (parent PHASE 1)
Implementation Start: NOT AUTHORIZED
Ready / Merge / Deploy: NOT AUTHORIZED
```

## Authority

Authorized by Human Definition Lock GO on
`docs/status/production-observation-budget-repair-1.md`
(PRODUCTION-OBSERVATION-BUDGET-REPAIR-1 / PR #147).

This document locks **evidence-state meanings** and **Human Gate behavior under
PARTIAL**. It does not authorize coding.

## Baseline (immutable)

```text
docs/status/production-observation-budget-repair-1-historical-failure.md

Open PR = 19 → requiredCost 60 > SUBREQUEST_LIMIT 50
→ GITHUB_SUBREQUEST_BUDGET_EXCEEDED
→ repository-wide ERROR (currentMain null, openPullRequests null)
Root Cause = SUBREQUEST_BUDGET_OVERFLOW / CONFIRMED
```

## Evidence states (locked)

Repository observation evidence for this repair program uses three primary
outcomes under budget / GitHub readability:

| State | Meaning (locked) |
|---|---|
| `CONFIRMED` | Tier-0 succeeded **and** detailed PR observation completed for the full Open PR set required by the observation contract (no budget-omitted Open PRs). |
| `PARTIAL` | Tier-0 succeeded (repository identity, `currentMain`, and Open PR list are trustworthy) **but** one or more Open PRs were **not** detail-observed because of the bounded observation budget. |
| `ERROR` | Tier-0 failed or repository / `currentMain` / Open PR list cannot be trusted (GitHub API failure, missing default branch, missing main SHA, PR list failure, etc.). |

### Relation to existing states

Current domain also has `MISSING` and `CONTRADICTORY`.

```text
MISSING / CONTRADICTORY = preserved for non-budget evidence gaps / conflicts
PARTIAL                 = NEW for budget-bounded incomplete detailed PR observation
```

V1 rule:

```text
Budget truncation after successful Tier-0  →  PARTIAL
Budget truncation must NEVER be encoded as CONFIRMED
Budget truncation must NEVER null Tier-0 results into repository-wide ERROR
```

The historical fail-closed path that set `evidenceState=ERROR` with
`currentMain=null` solely because `requiredCost(N) > SUBREQUEST_LIMIT` is
**rejected** by this semantics.

## Field obligations by state (locked)

### CONFIRMED

```text
currentMain:                 non-null SHA
openPullRequestCount:        known integer ≥ 0
openPullRequests:            non-null; detailed observation for all Open PRs
                             in the contract set
observedPullRequestCount:    == openPullRequestCount
omittedPullRequestCount:     0
observationBudget.bounded:   true (cost stayed within SAFE_BUDGET design)
errors:                      []
warnings:                    must NOT contain OPEN_PR_DETAIL_OBSERVATION_TRUNCATED
```

### PARTIAL

```text
currentMain:                 non-null SHA (Tier-0 retained)
openPullRequestCount:        known integer ≥ 1
openPullRequests:            non-null list of detail-observed PRs only
                             (or explicit dual listing — Scope may choose
                              representation; omission MUST remain explicit)
observedPullRequestCount:    count of detail-observed Open PRs
omittedPullRequestCount:     openPullRequestCount - observedPullRequestCount
                             and must be ≥ 1
observationBudget:           present; bounded=true; estimatedUsed ≤ SAFE_BUDGET
                             and ≤ SUBREQUEST_LIMIT
errors:                      must NOT use GITHUB_SUBREQUEST_BUDGET_EXCEEDED as a
                             repository-blinding ERROR for this case
warnings:                    MUST include OPEN_PR_DETAIL_OBSERVATION_TRUNCATED
omit reasons:                auditable per omitted PR (or aggregate reason code
                             plus deterministic selection metadata)
```

Illustrative payload shape (schema exactness finalized in Implementation Scope):

```json
{
  "evidenceState": "PARTIAL",
  "currentMain": "91b96b250658ab4c5eab81d13ad95392cd2a84b0",
  "openPullRequestCount": 19,
  "observedPullRequestCount": 14,
  "omittedPullRequestCount": 5,
  "observationBudget": {
    "limit": 50,
    "safeBudget": 45,
    "estimatedUsed": 45,
    "bounded": true
  },
  "errors": [],
  "warnings": ["OPEN_PR_DETAIL_OBSERVATION_TRUNCATED"]
}
```

### ERROR

```text
currentMain:                 null OR untrusted (do not present as confirmed)
openPullRequests:            null OR untrusted
openPullRequestCount:        null / unknown unless Scope explicitly allows a
                             degraded count that is marked untrusted
evidenceState:               ERROR
errors:                      non-empty reason codes
Human Gate:                  UNKNOWN (existing fail-closed)
```

Examples that remain ERROR:

```text
Repository GET failure
default branch missing
main commit SHA missing
Open PR list failure
unhandled GitHub API exception before Tier-0 completion
```

## Transition rules (locked)

```text
Tier-0 fail                         → ERROR
Tier-0 ok + no Open PRs             → CONFIRMED (empty detailed set)
Tier-0 ok + all Open PRs detailed   → CONFIRMED
Tier-0 ok + some Open PRs omitted
  under budget bound                → PARTIAL
Tier-0 ok + detail fetch fails for a
  selected PR mid-flight            → fail closed per Scope;
                                      must not silently mark that PR CONFIRMED;
                                      must not invent CI/review evidence
```

## Human Gate under PARTIAL (locked)

PHASE 1 Lock #5 is refined here as executable semantics:

```text
IF evidenceState == PARTIAL
THEN HumanAction.status MUST be UNKNOWN
AND  HumanAction MUST NOT be ACTION_REQUIRED
AND  HumanAction MUST NOT be WAIT
AND  HumanAction MUST NOT be NO_ACTION
AND  no Ready / Merge / Deploy GO candidate may be derived
```

Required reason direction (exact Japanese copy may be finalized in Scope/UI):

```text
必要な Pull Request evidence の一部が
観測予算上限により未確認です。
```

Additional hard rules:

```text
1. Observed subset looking “actionable” does NOT authorize ACTION_REQUIRED
   while omitted Open PRs exist.
2. PARTIAL ≠ CONFIRMED for every downstream consumer
   (status API, status-overlay, chat readback, UI).
3. UI / readback MUST surface PARTIAL (or equivalent operator-visible signal)
   and must not render as ordinary CONFIRMED success.
4. HOLD language is allowed in operator copy; machine status remains UNKNOWN
   unless a later Scope introduces an explicit HOLD status (out of V1 default).
```

## Human Gate under CONFIRMED / ERROR (unchanged intent)

```text
CONFIRMED → existing resolveHumanAction rules on fully detailed Open PRs
ERROR     → UNKNOWN (“GitHubの状態取得に失敗しました。” / equivalent)
MISSING / CONTRADICTORY → existing UNKNOWN fail-closed paths
```

## Forbidden encodings (locked)

```text
❌ PARTIAL encoded as CONFIRMED
❌ PARTIAL encoded as ERROR with currentMain = null after Tier-0 success
❌ omitted Open PRs absent from counts / warnings
❌ GO / ACTION_REQUIRED inferred from PARTIAL
❌ treating summary-only list rows as detail-confirmed CI/review evidence
```

## Warning / error codes (locked names)

| Code | Role |
|---|---|
| `OPEN_PR_DETAIL_OBSERVATION_TRUNCATED` | Required warning on PARTIAL budget truncation |
| `GITHUB_SUBREQUEST_BUDGET_EXCEEDED` | Retained only if Scope keeps it for non-PARTIAL emergency paths; must **not** be the sole encoding of successful-Tier-0 truncation |

## Downstream touchpoints (semantics obligation; not Scope file lock)

Consumers that project `evidenceState` / HumanAction must honor PARTIAL:

```text
src/domain/observedFacts.ts          (enum + fields — Implementation Scope)
src/domain/humanActionResolver.ts    (PARTIAL → UNKNOWN)
src/worker/github/readOnlyAdapter.ts (emit PARTIAL, retain Tier-0)
src/worker/statusApi.ts / overlay / UI / chat readback
tests covering PARTIAL ≠ CONFIRMED and no GO from PARTIAL
```

Exact file list is locked in PHASE 4 Implementation Scope Definition.

## Delivery gate

```text
PHASE 2 Failure Semantics Definition = DEFINED (this document)
PHASE 3 Bounded Observation Design   = NEXT
PHASE 4 Implementation Scope         = NOT STARTED
Human Implementation Start GO        = NOT AUTHORIZED
Ready / Merge / Deploy               = NOT AUTHORIZED
```

## Authority boundary

```text
Locks CONFIRMED / PARTIAL / ERROR meanings and PARTIAL Human Gate fail-closed.
Does not lock SAFE_BUDGET / prioritizer / Tier membership (PHASE 3).
Does not authorize implementation coding.
```
