# PRODUCTION-OBSERVATION-BUDGET-REPAIR-1 — PHASE 3 Bounded Observation Design

## Phase

```text
PHASE 3 — Bounded Observation Design
```

## Status

```text
BOUNDED OBSERVATION DESIGN DEFINED
Depends on: PHASE 1 Definition Lock CONSUMED
            PHASE 2 Failure Semantics DEFINED
Implementation Start: NOT AUTHORIZED
Ready / Merge / Deploy: NOT AUTHORIZED
```

## Authority

Authorized only to **design-lock** bounded observation after Human Definition
Lock GO and PHASE 2 semantics. Does not authorize coding.

Parent:

```text
docs/status/production-observation-budget-repair-1.md
docs/status/production-observation-budget-repair-1-failure-semantics.md
```

## Design goal

```text
Always complete Tier-0 (repository / main / Open PR list).
Detail-observe only a deterministic, budget-bounded PR subset.
Emit PARTIAL when omissions exist; never blind Tier-0 into ERROR.
Keep actual GitHub subrequests ≤ SUBREQUEST_LIMIT.
```

## Cost model (locked)

```text
SUBREQUEST_LIMIT        = 50     # hard Cloudflare Workers Free boundary
SAFE_BUDGET             = 45     # design headroom under the hard limit
BASE_COST               = 3      # Tier-0: repo + default-branch HEAD + Open PR list
PER_DETAILED_PR_COST    = 3      # worst-case detail path per selected PR
MAX_DETAILED_PRS        = floor((SAFE_BUDGET - BASE_COST) / PER_DETAILED_PR_COST)
                        = floor((45 - 3) / 3)
                        = 14
```

Invariants:

```text
1. Actual request count MUST be ≤ SUBREQUEST_LIMIT (hard)
2. Planned/estimated detailed observation MUST target ≤ SAFE_BUDGET
3. Do NOT raise SUBREQUEST_LIMIT as the repair
4. worst-case detailed cost model remains 3 subrequests / selected PR
   unless Implementation Scope proves a cheaper short-path and still
   budgets against the worst case for admission control
```

Admission control before Tier-1 fan-out:

```text
detailedSlots = min(openPullRequestCount, MAX_DETAILED_PRS)
estimatedUsed = BASE_COST + PER_DETAILED_PR_COST * detailedSlots
assert estimatedUsed ≤ SAFE_BUDGET ≤ SUBREQUEST_LIMIT
```

## Tier model (locked)

### Tier 0 — always

```text
1. GET /repos/{owner}/{repo}
2. GET /repos/{owner}/{repo}/commits/{default_branch}
3. GET /repos/{owner}/{repo}/pulls?state=open&per_page=30
```

Notes:

```text
- Tier-0 always runs first.
- Tier-0 failure → evidenceState ERROR (PHASE 2).
- Open PR list is authoritative for openPullRequestCount.
- per_page=30 remains V1 list window; if GitHub returns a truncated page,
  Scope must fail closed or document explicit pagination rules.
  V1 default: treat returned list length as openPullRequestCount only when
  page is complete; if truncation is detected (e.g. length==30 and Link next),
  mark PARTIAL or ERROR per Scope — must not silently assume “only 30 Open PRs”.
```

Pagination note is a known V1 edge; Implementation Scope must choose
fail-closed handling. Design default recommendation:

```text
If Open PR list is page-truncated, evidenceState MUST NOT be CONFIRMED.
Prefer PARTIAL with warning OPEN_PR_LIST_PAGE_TRUNCATED, or ERROR if count
cannot be trusted — exact choice locked in Scope.
```

### Tier 1 — bounded detailed observation

For at most `MAX_DETAILED_PRS` selected Open PRs, perform the existing
worst-case detail path (modeled cost 3 each), e.g.:

```text
GET /pulls/{n}
GET /pulls/{n}/reviews
GET /commits/{sha}/status
```

(Short-circuit when detail `head.sha` missing remains allowed; admission
control still uses worst-case PER_DETAILED_PR_COST.)

### Tier 2 — summary only

Open PRs not selected for Tier-1:

```text
- counted in openPullRequestCount
- NOT detail-fetched
- MUST appear as omitted (or summary-only) with auditable reason
- MUST NOT synthesize CI/review/merge/humanDecision as confirmed detail
```

## Deterministic prioritizer (locked)

Selection MUST be a pure function of Tier-0 evidence (+ fixed policy inputs).
Identical inputs ⇒ identical selected set / order.

### Priority classes (descending)

| Rank | Class | Predicate (V1) |
|---|---|---|
| 1 | Human Decision marker | List/summary body contains Human Decision required marker evidence collectible without Tier-1 **or** an explicit summary flag already present. If marker requires body detail not in list payload, PR is still eligible via Rank 3/4 until detail proves otherwise — do not skip Rank 1 when list body already yields REQUIRED. |
| 2 | Gate-packet / target-issue related | PR body/title references a configured target issue number or gate-packet id from fixed observer policy inputs (empty policy ⇒ no Rank 2 hits). |
| 3 | Non-draft + base is current default branch | `draft == false` and `base.ref == default_branch`. |
| 4 | Recently updated | Higher `updated_at` first. |
| 5 | Remainder | All other Open PRs. |

### Total order (tie-break; locked)

Within the same Rank:

```text
1. updated_at descending (ISO-8601 / GitHub timestamp order)
2. PR number ascending
```

Across ranks: stable merge — class Rank 1 before 2 before 3 before 4 before 5,
then apply tie-break inside the concatenated sequence.

### Selection

```text
ordered = stable_sort(openPulls, prioritizer_total_order)
selected = ordered[0 : MAX_DETAILED_PRS]
omitted  = ordered[MAX_DETAILED_PRS :]
```

If `openPullRequestCount ≤ MAX_DETAILED_PRS`, select all → candidate CONFIRMED
(after successful detail observation).

If omitted non-empty after selection → PARTIAL (PHASE 2), even if selected
details all succeed.

## Omit reason codes (locked)

| Code | When |
|---|---|
| `BUDGET_DETAIL_CAP` | PR not selected because `MAX_DETAILED_PRS` filled by higher-priority PRs |
| `NOT_SELECTED_LOWER_PRIORITY` | Optional alias/detail under `BUDGET_DETAIL_CAP` for audit text |
| `OPEN_PR_LIST_PAGE_TRUNCATED` | List pagination edge (if Scope adopts PARTIAL path) |

Every omitted PR must be reconstructible from:

```text
openPullRequestCount
selected PR numbers (deterministic)
omit reason code(s)
SAFE_BUDGET / MAX_DETAILED_PRS policy fingerprint or literal constants
```

## Evidence aggregation mapping

```text
Tier-0 fail                         → ERROR
Tier-0 ok, selected all, details ok → CONFIRMED
Tier-0 ok, omitted ≥ 1              → PARTIAL
                                      warnings += OPEN_PR_DETAIL_OBSERVATION_TRUNCATED
Tier-0 ok, selected detail fails    → Scope fail-closed:
                                      must not mark that PR’s CI/review CONFIRMED;
                                      repository may remain PARTIAL/ERROR per Scope
                                      without nulling currentMain if Tier-0 stood
```

## Worked examples (normative)

### N = 2 (current recovery shape)

```text
BASE_COST + 3*2 = 9 ≤ 45
selected = all
evidenceState = CONFIRMED (if details succeed)
```

### N = 14

```text
BASE_COST + 3*14 = 45 ≤ 45
selected = all
evidenceState = CONFIRMED (if details succeed)
```

### N = 15

```text
detailedSlots = 14
estimatedUsed = 45
omitted = 1
evidenceState = PARTIAL
HumanAction = UNKNOWN
```

### N = 19 (historical failure shape)

```text
detailedSlots = 14
omitted = 5
evidenceState = PARTIAL
currentMain retained
openPullRequestCount = 19
HumanAction = UNKNOWN
NOT repository-wide ERROR
```

### N = 100

```text
still detailedSlots = 14
PARTIAL, bounded
actual requests ≤ SAFE_BUDGET ≤ SUBREQUEST_LIMIT
```

## Non-goals preserved

```text
❌ raise SUBREQUEST_LIMIT
❌ newest-15-only without deterministic multi-class priority
❌ detail-observe zero PRs always
❌ GraphQL / caching / distributed observer in this design lock
```

## Next

```text
PHASE 4 Implementation Scope Definition
→ Independent Scope Review-1
→ Human Implementation Start GO
→ BOUNDED-GITHUB-OBSERVATION-V1 minimal implementation
```

## Authority boundary

```text
Locks SAFE_BUDGET, MAX_DETAILED_PRS, Tier model, prioritizer total order,
and omit reason direction.
Does not authorize Implementation Scope completion or coding.
Ready / Merge / Deploy remain NOT AUTHORIZED.
```
