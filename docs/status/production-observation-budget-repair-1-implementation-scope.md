# PRODUCTION-OBSERVATION-BUDGET-REPAIR-1
## Implementation Scope Definition — BOUNDED-GITHUB-OBSERVATION-V1

**Status: IMPLEMENTATION SCOPE DEFINED · IMPLEMENTATION START NOT AUTHORIZED**

Bound upstream:

```text
docs/status/production-observation-budget-repair-1-historical-failure.md
docs/status/production-observation-budget-repair-1.md
  Human Definition Lock GO: CONSUMED
  Independent Definition Review-1: REVIEW-CLEARED
docs/status/production-observation-budget-repair-1-failure-semantics.md
docs/status/production-observation-budget-repair-1-bounded-observation.md
PR #147 docs track
```

```text
Slice ID:
BOUNDED-GITHUB-OBSERVATION-V1

Purpose:
Replace repository-blinding budget ERROR with bounded detailed PR observation
and PARTIAL evidence + Human Gate fail-closed.

Authority granted by this document alone:
zero (Scope Definition only)
```

## 1. Objective

Implement PHASE 2 / PHASE 3 so that:

```text
Tier-0 (repo / main / Open PR list) always completes when GitHub allows it
detailed PR observation is capped at MAX_DETAILED_PRS = 14 under SAFE_BUDGET = 45
N ≥ 15 Open PRs → PARTIAL (not repository-wide ERROR)
PARTIAL → HumanAction UNKNOWN (no GO / ACTION_REQUIRED / WAIT / NO_ACTION)
actual GitHub subrequests ≤ SUBREQUEST_LIMIT (50)
```

## 2. Exact mutable files

Implementation mutation is limited to **exactly** these paths:

### Domain / observer core

```text
src/domain/observedFacts.ts
src/domain/humanActionResolver.ts
src/domain/approvalIntent.ts
src/domain/chatReadback.ts
src/domain/boundedGithubObservation.ts          # NEW — pure prioritizer + cost helpers
src/worker/github/readOnlyAdapter.ts
src/worker/statusApi.ts
src/worker/chatReadbackMcp.ts
```

### UI / readback projection

```text
src/ui/App.tsx
src/ui/humanGateViewModel.ts
src/ui/styles.css                               # only if PARTIAL badge/row needs existing CRT styles
```

### Tests (required)

```text
test/githubObservationSubrequestBudget.test.ts  # rewrite for PARTIAL / request-count bound
test/boundedGithubObservation.test.ts           # NEW — prioritizer determinism + admission
test/humanActionResolver.test.ts
test/approvalIntent.test.ts
test/chatReadback.test.ts
test/decisionFingerprint.test.ts                # PARTIAL must not mint fingerprint
test/statusApiBudgetRepair.test.ts              # NEW — openPrCount / PARTIAL payload projection
```

### Docs touch (gate sync only; optional in same PR as code)

```text
docs/status/production-observation-budget-repair-1.md
docs/status/production-observation-budget-repair-1-implementation-scope.md
docs/status/production-observation-budget-repair-1-issue-templates.md
```

If any other file becomes necessary, **STOP** and open Scope Correction-1.

## 3. Explicit non-changes (OUT OF SCOPE for this slice)

```text
src/observer/**                         # STATUS-OVERLAY separate observer
src/domain/statusOverlay*.ts
src/worker/github/publicRepositoryOverview.ts
src/ui/RepositoryOverviewPanel.tsx
src/worker/ledger/**
src/domain/handoff*.ts
src/domain/harnessMinimality.ts
GraphQL migration / caching / retry architecture
raising SUBREQUEST_LIMIT
wrangler / deploy automation
Ready / Merge / Deploy controls
```

Ledger remains fail-closed naturally: record paths already require `CONFIRMED`.
Do not expand ledger to accept `PARTIAL`.

## 4. Domain schema (locked)

### `EvidenceState`

```text
export type EvidenceState =
  | "CONFIRMED"
  | "PARTIAL"          # NEW
  | "MISSING"
  | "CONTRADICTORY"
  | "ERROR";
```

### `ObservedFacts` extensions

Add fields (names locked):

```text
openPullRequestCount: number | null
observedPullRequestCount: number | null
omittedPullRequestCount: number | null
warnings: string[]
observationBudget: {
  limit: number            # 50
  safeBudget: number       # 45
  estimatedUsed: number
  bounded: boolean
} | null
omittedPullRequests: Array<{
  number: number
  reason: "BUDGET_DETAIL_CAP" | "OPEN_PR_LIST_PAGE_TRUNCATED" | "DETAIL_FETCH_FAILED"
}> | null
```

Representation lock:

```text
openPullRequests     = detail-observed PRs only (Tier-1 successes + soft-failed
                       detail rows that still produced an ObservedPullRequest)
omittedPullRequests  = explicit audit list for non-detail-observed Open PRs
openPullRequestCount = Tier-0 list cardinality used for budget decisions
                       (see pagination rule below)
```

Existing fields `errors` / `sourceRefs` / `currentMain` / `relevantIssueStates`
remain. For V1, `relevantIssueStates` may stay `{}` as today when observation
succeeds.

### Constants (re-export from pure module; values locked in PHASE 3)

```text
SUBREQUEST_LIMIT = 50
SAFE_BUDGET = 45
BASE_COST = 3
PER_DETAILED_PR_COST = 3
MAX_DETAILED_PRS = 14
OPEN_PR_DETAIL_OBSERVATION_TRUNCATED = "OPEN_PR_DETAIL_OBSERVATION_TRUNCATED"
OPEN_PR_LIST_PAGE_TRUNCATED = "OPEN_PR_LIST_PAGE_TRUNCATED"
```

`GITHUB_SUBREQUEST_BUDGET_EXCEEDED` may remain exported for tests/history but
**must not** be emitted for successful-Tier-0 truncation (PHASE 2 forbid).

## 5. Observer algorithm (locked)

File: `src/worker/github/readOnlyAdapter.ts` + pure helpers in
`src/domain/boundedGithubObservation.ts`.

```text
1. Tier-0: repo → main SHA → open pulls list (per_page=30)
2. Pagination rule (V1):
     IF pulls.length === 30
       THEN listPageTruncated = true
       ELSE listPageTruncated = false
     (Do not require Link-header parsing in V1.)
3. ordered = prioritizeOpenPulls(pulls, { defaultBranch })
     Rank 1: list body yields Human-Decision REQUIRED via
             collectHumanDecisionEvidence(summary.body)
     Rank 2: V1 policy targetIssues = [] (no Rank-2 hits unless Scope later
             adds fixed policy inputs; empty set is intentional V1)
     Rank 3: draft === false AND base.ref === default_branch
     Rank 4/5 + tie-break: updated_at desc, then number asc
     (PHASE 3 total order)
4. selected = ordered.slice(0, MAX_DETAILED_PRS)
   omittedFromCap = ordered.slice(MAX_DETAILED_PRS)
5. For each selected PR: observePull (existing detail path)
     Per-PR throw/HTTP failure:
       → do NOT wipe Tier-0
       → emit ObservedPullRequest with ci/review/mergeState UNKNOWN
         (or minimal safe UNKNOWN row) + include in openPullRequests
       → record warning; do not invent PASS evidence
6. Build omittedPullRequests:
     - omittedFromCap → reason BUDGET_DETAIL_CAP
     - if listPageTruncated → also push warning OPEN_PR_LIST_PAGE_TRUNCATED
       (aggregate; optional synthetic omit entries not required)
7. evidenceState:
     Tier-0 fail → ERROR (currentMain null) [existing]
     else if listPageTruncated OR omittedFromCap.length > 0
       → PARTIAL
     else → CONFIRMED
8. observationBudget.estimatedUsed =
     BASE_COST + PER_DETAILED_PR_COST * selected.length
   bounded = true
9. Never issue detail fetches beyond selected.length
10. Assert runtime fetch count ≤ SUBREQUEST_LIMIT in tests (instrument fetch)
```

Remove the current preflight that returns `budgetExceeded()` ERROR nulling
`currentMain` after Open PR list fetch.

## 6. Human Gate / authority surfaces (locked)

| Surface | PARTIAL behavior |
|---|---|
| `resolveHumanAction` | First-class branch: `PARTIAL` → `UNKNOWN` with budget-omission reason (Japanese copy locked below) |
| `buildDecisionFacts` / fingerprint | Remains CONFIRMED-only; add regression that PARTIAL returns null |
| `isApprovalIntentUiAllowed` | Explicitly false for `PARTIAL` (CONFIRMED-only allowlist) |
| Ledger observe→record | Unchanged; PARTIAL cannot satisfy CONFIRMED requirement |

Locked HumanAction reason (PARTIAL):

```text
必要なPull Request evidenceの一部が観測予算上限により未確認です。
```

Title/instruction may keep existing UNKNOWN defaults:

```text
title: 判定できません
instruction: 安全のため判断を保留しています。
```

## 7. Status API / UI / chat readback (locked)

### `buildStatusPayload`

```text
developmentStatus.openPrCount = facts.openPullRequestCount
  (NOT facts.openPullRequests.length)
developmentStatus.evidenceState = facts.evidenceState  # may be PARTIAL
developmentStatus.observedPullRequestCount = facts.observedPullRequestCount
developmentStatus.omittedPullRequestCount = facts.omittedPullRequestCount
developmentStatus.observationBudget = facts.observationBudget
developmentStatus.warnings = facts.warnings
```

`evidence` array continues to map **detail-observed** PRs only.

### UI (`App.tsx` / Human Gate panel)

```text
- Evidence row must show PARTIAL when present (no remap to CONFIRMED)
- When PARTIAL: show observed/omitted counts if payload provides them
- Approval Intent UI stays hidden (approvalIntent already CONFIRMED-gated;
  add test for PARTIAL)
```

### Chat readback

```text
ChatReadbackEvidenceState includes PARTIAL
MCP schema enum includes PARTIAL
PARTIAL is valid success payload evidence (ok:true) with decisionCandidate NOT_PRESENT
```

## 8. Verification (Scope-required)

```text
npm run verify = required PASS
```

Mandatory automated cases:

| Case | Expected |
|---|---|
| N=0 | CONFIRMED; fetches = 3 |
| N=1 | CONFIRMED; fetches ≤ 6 |
| N=14 | CONFIRMED if details ok; fetches ≤ 45 |
| N=15 | PARTIAL; omitted=1; currentMain retained; fetches ≤ 45 |
| N=16 | PARTIAL; not ERROR; currentMain non-null |
| N=19 | PARTIAL; openPullRequestCount=19; observed≤14; HumanAction UNKNOWN |
| N=30 list length without “next” signal | if length==30 → PARTIAL + OPEN_PR_LIST_PAGE_TRUNCATED |
| N=100 synthetic | still ≤14 detailed; PARTIAL; fetch count ≤ 45 ≤ 50 |
| identical inputs | identical selected PR numbers |
| PARTIAL | resolveHumanAction UNKNOWN; no fingerprint; approval UI disallowed |
| detail mid-fail on selected PR | Tier-0 retained; no fabricated PASS |
| runtime fetch count | never > SUBREQUEST_LIMIT |

Manual post-deploy readback remains a **later** Human Deploy GO concern, not
part of Implementation Start.

## 9. Acceptance mapping

| ID | Criterion |
|---|---|
| AC-1 | Budget truncation after Tier-0 → PARTIAL, not ERROR |
| AC-2 | `currentMain` retained on PARTIAL |
| AC-3 | `openPullRequestCount` reflects Tier-0 list cardinality used for decisions |
| AC-4 | `omittedPullRequestCount ≥ 1` and warning `OPEN_PR_DETAIL_OBSERVATION_TRUNCATED` when capped |
| AC-5 | Actual fetches ≤ 50; planned detailed path ≤ SAFE_BUDGET |
| AC-6 | Prioritizer deterministic |
| AC-7 | PARTIAL → HumanAction UNKNOWN only |
| AC-8 | PARTIAL cannot create decision fingerprint / approval UI |
| AC-9 | Status payload `openPrCount` uses `openPullRequestCount` |
| AC-10 | Chat readback accepts PARTIAL |
| AC-11 | `npm run verify` PASS |
| AC-12 | Diff confined to Exact mutable files |

## 10. Delivery gate

```text
PHASE 4 Implementation Scope Definition = DEFINED (this document)
Independent Scope Review-1              = NOT STARTED / AWAITING
Scope Correction-1                      = NOT REQUIRED YET
Human Implementation Start GO           = NOT AUTHORIZED
Code mutation                           = NOT AUTHORIZED
Ready / Merge / Deploy                  = NOT AUTHORIZED
```

## 11. Next

```text
Independent Scope Review-1
  focus:
    - file allowlist sufficiency vs leakage
    - pagination length==30 rule
    - PARTIAL payload / openPrCount projection
    - Human Gate + approval/fingerprint fail-closed
    - request-count tests not formula-only
→ P0/P1 → Scope Correction-1 → re-review
→ P0/P1 none → Human Implementation Start GO
→ Minimal implementation on authorized files only
```

## 12. Authority boundary

```text
This document defines Implementation Scope only.
It does not consume Human Implementation Start GO.
It does not authorize coding, Ready, Merge, or Deploy.
```
