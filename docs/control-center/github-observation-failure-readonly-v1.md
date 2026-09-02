# `/api/status` GitHub observation failure — READ-ONLY isolation

**Status: READ-ONLY DIAGNOSIS COMPLETE · H1 CONFIRMED · CREDENTIAL PROVISION NOT AUTHORIZED**

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
= GITHUB_TOKEN value read, display, rotate, or put
= substituting CLOUDFLARE_API_TOKEN for GITHUB_TOKEN
= widening CLOUDFLARE_API_TOKEN just to list Worker secret names
= curling with a Worker secret that cannot be re-displayed
= TARGET_REPOSITORY change
= observeRepository / resolver / payload-shape change
= exposing GitHub HTTP status or token presence on the public API
= mutating yasutakesougo/severe-behavior-support-spfx
= treating overview / overlay CONFIRMED as /api/status CONFIRMED
```

Canonical lock (Human Dashboard PHASE 1):

```text
PRODUCTION-DRIFT-CORRECTION = CLOSED / PASS
READ-ONLY ISOLATION         = PASS

GITHUB_TOKEN presence       = ABSENT
H1                          = CONFIRMED

H2/H3/H4                    = NOT APPLICABLE YET
Authenticated target GET    = NOT RUN

Code mutation               = HOLD
TARGET_REPOSITORY mutation  = HOLD
READ-ONLY diagnosis         = COMPLETE

NEXT
= separate Human Gate
  GITHUB-OBSERVATION-CREDENTIAL-V1
  Human Secret Provision GO
  (not consumed)
```

Causal chain (now closed as diagnosis):

```text
production Worker
ai-development-control-center

GITHUB_TOKEN
= NOT CONFIGURED

↓
private severe-behavior-support-spfx を認証付きでGETできない

↓
GitHub 404

↓
evidenceState = ERROR

↓
HumanAction = UNKNOWN
```

Credential put, PAT mint, code change, and redeploy are **out of this document**.
See `docs/control-center/github-observation-credential-v1.md`.

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

## 8. PHASE 1 result (Human Dashboard)

Human confirmed production Worker secret-name presence:

```text
Worker     = ai-development-control-center
surface    = Dashboard Secrets
GITHUB_TOKEN
           = NOT CONFIGURED / ABSENT
H1         = CONFIRMED
```

PHASE 1B and PHASE 2 are **not applicable**. There is no stored Worker
credential whose metadata or recovered PAT value could be inspected.

H2 / H3 / H4 remain unused until a credential exists and still fails.

Agent-side Cloudflare secrets-list 403 is historical only. It is not needed
once Dashboard PHASE 1 is recorded.

## 9. Hand-off (out of READ-ONLY)

This document does not authorize secret put.

```text
NEXT GATE
= GITHUB-OBSERVATION-CREDENTIAL-V1
= Human Secret Provision GO
= docs/control-center/github-observation-credential-v1.md
```

## 10. Result

```text
PRODUCTION-DRIFT-CORRECTION = CLOSED / PASS
READ-ONLY ISOLATION         = PASS

GITHUB_TOKEN presence       = ABSENT
H1                          = CONFIRMED

H2/H3/H4                    = NOT APPLICABLE YET
Authenticated target GET    = NOT RUN

Code mutation               = HOLD
TARGET_REPOSITORY mutation  = HOLD
READ-ONLY diagnosis         = COMPLETE
```


