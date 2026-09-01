# `/api/status` GitHub observation failure — READ-ONLY isolation

**Status: READ-ONLY TRIAGE LOCKED · NO IMPLEMENTATION AUTHORIZED**

This note isolates the remaining HumanAction copy:

```text
判定できません
GitHubの状態取得に失敗しました。
```

It is **not** a production-deploy diagnosis. Production drift correction remains closed.

```text
PRODUCTION-DRIFT-CORRECTION
Exact deploy HEAD     = abac2ff1b3f704bf4cdb59e1bfaf3c148a8a19a0
verify                = PASS / 952 tests
Cloudflare Version ID = 4f8d9bac-4c23-4bb6-a21d-d41b056d1221
/api/repositories/overview = 200
Action-card repository scope = PASS
Rendered Browser Acceptance = PASS
RESULT                = CLOSED / PASS
```

## 1. What this slice is / is not

```text
IN SCOPE
= read-only isolation of GET /api/status GitHub observation fail-closed

OUT OF SCOPE / NOT AUTHORIZED
= GITHUB_TOKEN inspect, rotate, or put
= TARGET_REPOSITORY change
= observeRepository / resolver / payload-shape change
= exposing GitHub HTTP status or token presence on the public API
= mutating yasutakesougo/severe-behavior-support-spfx
= treating overview / overlay CONFIRMED as /api/status CONFIRMED
```

## 2. Live production observation (2026-09-01)

`GET https://ai-development-control-center.momosantanuki.workers.dev/api/status`

```text
HTTP                = 200
Cache-Control       = no-store
action.status       = UNKNOWN
action.title        = 判定できません
action.reason       = GitHubの状態取得に失敗しました。
action.sourceRefs   = github:repo:yasutakesougo/severe-behavior-support-spfx
developmentStatus.repository   = yasutakesougo/severe-behavior-support-spfx
developmentStatus.main         = Unknown
developmentStatus.openPrCount  = null
developmentStatus.evidenceState = ERROR
evidence            = null
decisionFingerprint = ABSENT
```

The UI copy is the resolver mapping for `evidenceState === "ERROR"`. The Worker
route itself is healthy. This is **not** an `/api/status` HTTP failure and
**not** the client fallback (`状態をまだ取得できていません。`).

## 3. Exact fail-closed path

```text
GET /api/status
→ TARGET_REPOSITORY = yasutakesougo/severe-behavior-support-spfx   (src/worker/index.ts)
→ observeRepository(TARGET_REPOSITORY, env)                       (src/worker/github/readOnlyAdapter.ts)
→ githubGet GET /repos/{TARGET_REPOSITORY}
   optional Authorization: Bearer env.GITHUB_TOKEN
→ any non-OK or thrown fetch
   → evidenceState = ERROR
   → errors        = ["GitHub API request failed"]   (internal only)
   → currentMain   = null
   → openPullRequests = null
→ resolveHumanAction
   → UNKNOWN / 判定できません / GitHubの状態取得に失敗しました。
→ buildStatusPayload
   → public JSON above (errors[] is not exposed)
```

The adapter's first required hop is `GET /repos/{repository}`. Later hops
(default-branch commit, open pulls, per-PR detail) never run if that hop fails.

`errors[]` and the GitHub HTTP status are intentionally not part of the public
`/api/status` body. Public evidence therefore proves **fail-closed ERROR**, not
**which GitHub status** caused it.

## 4. Adjacent surfaces (different authority)

Same production Worker, same window:

| Surface | Repository | Auth mode | Result |
|---|---|---|---|
| `GET /api/status` | `yasutakesougo/severe-behavior-support-spfx` | Worker `GITHUB_TOKEN` if present | `evidenceState=ERROR` |
| `GET /api/repositories/overview` | 3 public repos | `PUBLIC_UNAUTHENTICATED` | all `CONFIRMED` |
| `GET /api/status-overlay` | `yasutakesougo/ai-development-control-center` | overlay observer | `200`, `main.sha=abac2ff1…` |

Overview allow-list (`PUBLIC_OVERVIEW_REPOSITORIES`) does **not** include
`severe-behavior-support-spfx`. `isPublicOverviewRepository(...)` is false for
that name. Overview CONFIRMED cannot rescue `/api/status`.

This matches CONTROL-CENTER-ACTION-SCOPE-CLARITY-V1: the action-card judges
one private target; the fleet card judges three public repos.

## 5. Unauthenticated GitHub probes (this environment)

No Worker secret was read. Probes used the public GitHub REST API only.

```text
GET /repos/yasutakesougo/severe-behavior-support-spfx
  → 404 {"message":"Not Found"}

GET /repos/yasutakesougo/severe-behavior-support-spfx/commits/main
  → 404

GET /repos/yasutakesougo/severe-behavior-support-spfx/pulls?state=open&per_page=1
  → 404

GET /repos/yasutakesougo/ai-development-control-center
  → 200  private=false  visibility=public  default_branch=main
```

GitHub returns **404** for both missing and private-without-access repositories.
Unauthenticated 404 is therefore consistent with:

```text
A. repository is private and this caller has no grant
B. repository does not exist / was renamed
```

It is **not** consistent with “GitHub.com is down” or “the Worker cannot reach
api.github.com at all”: the same network successfully observed the public
Control Center repository and served overview + overlay CONFIRMED.

README already states that private-repo observation requires a Worker
`GITHUB_TOKEN` (fine-grained PAT, GET-only, Contents / Pull requests /
Commit statuses / Metadata read). Without a valid grant, `observeRepository`
must fail closed.

Staging historically showed the same public shape when no staging token was
configured (`docs/mvp-3-approval-ledger-staging-pilot-v1.md`). That is the
same fail-closed class, not proof of current production secret state.

## 6. Remaining hypotheses (cannot distinguish from public evidence)

These are ordered by how far public evidence can go. None is confirmed.

| ID | Hypothesis | Public evidence | What would confirm it (Human-only) |
|---|---|---|---|
| H1 | Production `GITHUB_TOKEN` absent | Compatible with unauth 404 + ERROR | Cloudflare / `wrangler secret` **presence** check. Do not paste the value. |
| H2 | Token present but expired / revoked / malformed | Compatible | Authenticated `GET /repos/yasutakesougo/severe-behavior-support-spfx` → 401 |
| H3 | Token valid but no access to this private repo | Compatible | Same authenticated GET → 404 |
| H4 | Repo renamed or deleted | Compatible with 404 | Same authenticated GET → 404 **and** Human confirms the repo identity |
| H5 | First hop succeeds; later required hop fails | **Not** favored: public payload has `main=Unknown` and `openPrCount=null`, which is the catch-all before any PR loop | Authenticated GET repo = 200, then check commits/pulls |
| H6 | Transient GitHub / Worker egress | **Not** favored: repeated `/api/status` ERROR plus stable unauth 404 | Would need a later CONFIRMED sample without secret change |

H1–H4 collapse to one operational class until a Human inspects token **presence**
and one authenticated GET against the target repository:

```text
CLASS
= authenticated observation of a non-public TARGET_REPOSITORY is not succeeding
```

This environment must not perform that authenticated GET. Doing so would
require reading or supplying `GITHUB_TOKEN`.

## 7. What is already ruled out

```text
Cloudflare deploy drift          = ruled out (HEAD abac2ff1 locked, Version 4f8d9bac…)
/api/status route broken         = ruled out (HTTP 200 JSON)
UI mis-binding of overlay/overview into HumanAction
                                 = ruled out (sourceRefs + repository = TARGET_REPOSITORY)
Resolver defect for ERROR        = ruled out (explicit mapping, unit-covered)
Public GitHub / Worker egress    = ruled out (overview + overlay CONFIRMED)
Action-card scope misread        = already corrected; not this failure
```

## 8. Next authorized step (Human)

Read-only, no chat paste of secrets:

```text
1. Confirm whether production Worker secret GITHUB_TOKEN exists
   (Dashboard or `wrangler secret list` — name only).

2. From a Human-authenticated terminal, GET
   https://api.github.com/repos/yasutakesougo/severe-behavior-support-spfx
   with that token. Record only the HTTP status (200 / 401 / 403 / 404).

3. Map:
   missing secret     → H1
   401 / 403          → H2 (or insufficient fine-grained permissions)
   404                → H3 or H4
   200                → reopen H5; do not guess

4. Do not rotate, broaden, or put a token unless separately authorized.
5. Do not change /api/status semantics to paper over ERROR.
```

## 9. Suggested follow-up slices (not started)

Only if separately defined and authorized:

```text
SLICE-DIAG-AUTH   Human records token presence + authenticated GET status
SLICE-OBSERVE-ERR optional: persist GitHub HTTP class (404/401/403/5xx) in
                  internal errors without leaking token or widening authority
SLICE-TOKEN-FIX   Human secret put / rotation, same README permission boundary
```

No implementation slice is opened by this document.

## 10. Result

```text
READ-ONLY ISOLATION
= PASS

FAILURE SITE
= observeRepository(yasutakesougo/severe-behavior-support-spfx)
= GitHub GET fail-closed
= evidenceState=ERROR
= HumanAction=UNKNOWN

NOT
= production drift
= /api/status HTTP failure
= overview / overlay observation failure

OPEN
= which of H1–H4 (token absence / invalid / no-grant / missing repo)
= requires Human secret-presence + authenticated GET

IMPLEMENTATION
= NOT AUTHORIZED
```
