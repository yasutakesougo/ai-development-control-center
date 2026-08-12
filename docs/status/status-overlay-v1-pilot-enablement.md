# STATUS-OVERLAY-V1 Read-only Pilot Enablement / Smoke Validation

**Issue:** [#39](https://github.com/yasutakesougo/ai-development-control-center/issues/39)  
**PR:** [#40](https://github.com/yasutakesougo/ai-development-control-center/pull/40) (Draft)  
**Verdict: PASS / production tip + rendered STATUS-OVERLAY panel observed**  
**Stop:** evidence updated to PASS after authorized redeploy + API smoke + rendered production UI smoke. Keep Draft. Fresh Review next. Do not Ready / do not Merge.

```text
Authorized redeploy HEAD                 = 6a055e1a63a42c1f8a58208be9223390c76dbfa0
Production Version ID (active)           = af7f2e52-6d8f-46a1-bb7f-63e8ff544f26
Production assets                        = index-BpbrbWum.js / index-B_OiJpPm.css
GET /api/status-overlay                  = 200 STATUS-OVERLAY-V1
Rendered panel sections                  = CURRENT/GATE/NEXT/AUTOMATION/HOLDS/UNKNOWNS/PRS
authorizesMutation visible               = false
Existing app still renders               = PASS
Write mutations performed                = 0
```

Instruction lock: [PR #40 comment 5263006055](https://github.com/yasutakesougo/ai-development-control-center/pull/40#issuecomment-5263006055)

---

## Baseline at authorization

| Item | Value |
|---|---|
| Authorized `main` | `6a055e1a63a42c1f8a58208be9223390c76dbfa0` |
| Observed GitHub `main` tip | `6a055e1a63a42c1f8a58208be9223390c76dbfa0` (MATCH) |
| Runtime Generator / Observer / UI / Wiring | COMPLETE (merged via PR #38) |
| Repository / HISTORY writers | NOT IMPLEMENTED |
| Action Gateway / Approval Ledger / Agent | NOT IMPLEMENTED |
| `npm run verify` on authorized tip (this agent) | PASS — **291 tests / 24 files** / typecheck / build |
| Human pre-deploy verify (comment 5262885245) | reported **119 tests / 11 files** / build PASS |

Test-count equivalence is **not** used as PASS evidence. Production behavior is authoritative.

---

## Historical evidence — Human deploy report (received; later superseded)

From comment `5262885245`:

| Field | Reported value |
|---|---|
| Revision | `6a055e1a63a42c1f8a58208be9223390c76dbfa0` |
| Worker | `ai-development-control-center` |
| URL | `https://ai-development-control-center.momosantanuki.workers.dev` |
| Wrangler | `4.120.1` |
| Version ID | `8967d27c-67c0-476d-b723-a2652da5d7ff` |
| Asset upload | SUCCESS |
| Worker deploy | SUCCESS |

Human deploy report source:
[Issue #39 comment 5262885245](https://github.com/yasutakesougo/ai-development-control-center/issues/39#issuecomment-5262885245)

Human deploy gate source (exact steps):
[Issue #39 comment 5262856051](https://github.com/yasutakesougo/ai-development-control-center/issues/39#issuecomment-5262856051)

Agent could not independently confirm Version ID `8967d27c…` source provenance via Cloudflare Workers Scripts API at that time.

---

## Historical evidence — Production smoke FAIL after Human deploy (preserved)

Probe time (UTC): **2026-08-12T05:50:58Z** (API) / UI screenshots ~05:51Z  
Production URL: `https://ai-development-control-center.momosantanuki.workers.dev`

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Deployed revision corresponds to authorized tip | **FAIL** | Tip build assets = `/assets/index-BpbrbWum.js` + `/assets/index-B_OiJpPm.css`. Production serves `/assets/index-Bo9GFqfm.js` + `/assets/index-D8mEp3RE.css`. Tip asset URLs on production return SPA shell (464 B), not tip bundles. |
| 2 | `GET /api/status-overlay` = 200 | **FAIL** | HTTP **404**, `content-type: text/plain`, body `Not Found` (route catch-all). Not the runtime-disabled JSON 404 shape from `handleStatusOverlayGet`. |
| 3 | `schemaVersion = STATUS-OVERLAY-V1` | **FAIL** | No JSON body |
| 4 | `repository = yasutakesougo/ai-development-control-center` | **FAIL** | No overlay document. Legacy `GET /api/status` still targets `yasutakesougo/severe-behavior-support-spfx`. |
| 5 | `recommendedNextAction.authorizesMutation === false` | **FAIL** | Endpoint absent |
| 6 | No token/secret material in overlay response | **N/A → treated FAIL for pilot PASS** | Overlay response is plain `Not Found` only; no secret leakage observed in that body |
| 7 | `observedAt` present on overlay | **FAIL** | Endpoint absent (`/api/status` has its own `observedAt`, not overlay) |
| 8 | UI sections CURRENT / GATE / NEXT / AUTOMATION / HOLDS / UNKNOWNS / PRS | **FAIL** | Production client bundle contains **zero** `status-overlay` / `STATUS-OVERLAY` / `/api/status-overlay` strings. UI shows legacy HumanAction + Ledger 履歴 only. |
| 9 | UNKNOWN/HOLD/FAILED/OUTCOME_UNKNOWN visibly distinct | **FAIL** | Overlay panel not present |
| 10 | Existing app still loads | **PASS** | `GET /` = **200**; UI renders Development Status / Ledger 履歴 |
| 11 | Alternate-repository fail-closed preserved | not safely testable on prod (endpoint absent; no env mutation) | Unit tests in `test/statusOverlayApiAuth.test.ts` remain the coverage |
| 12 | Write mutations = 0 | **PASS** | Smoke was read-only; no GitHub / HISTORY / Gateway / Ledger / Agent / SharePoint writes |

### Response samples (FAIL era)

```text
GET /api/status-overlay
HTTP/2 404
content-type: text/plain;charset=UTF-8
Not Found
```

```text
GET /
HTTP/2 200
assets: /assets/index-Bo9GFqfm.js , /assets/index-D8mEp3RE.css
```

```text
Authorized tip local build (npm run build @ docs branch on tip)
assets: /assets/index-BpbrbWum.js , /assets/index-B_OiJpPm.css
worker bundle contains STATUS-OVERLAY-V1 route + sanitizers
```

### Asset drift vs prior HOLD probe (FAIL era)

| When | Production assets |
|---|---|
| Prior HOLD evidence | `/assets/index-C4Vzo5Yb.js` , `/assets/index-C6aIaSYs.css` |
| After Human deploy comment | `/assets/index-Bo9GFqfm.js` , `/assets/index-D8mEp3RE.css` |
| Authorized tip build | `/assets/index-BpbrbWum.js` , `/assets/index-B_OiJpPm.css` |

Assets changed after the Human deploy report, but the served Worker/UI still did **not** match the authorized tip overlay revision at that time.

### UI screenshots (FAIL-era agent artifacts)

- `/opt/cursor/artifacts/status-overlay-pilot/prod-app-viewport.webp` — legacy app loads; no overlay sections
- `/opt/cursor/artifacts/status-overlay-pilot/prod-app-expanded.webp` — PR evidence / Ledger 履歴
- `/opt/cursor/artifacts/status-overlay-pilot/production-smoke-rerun.txt` — probe summary

### Note on Human 119-test report

Human pre-deploy verify reported **119 tests / 11 files**. Authorized tip currently runs **291 tests / 24 files**. Repository history shows ~119 `it(` across 11 `test/*.test.ts` files around the MVP-3 staging / architecture-snapshot era (pre-STATUS-OVERLAY merge). This is recorded as a consistency warning only; **PASS/FAIL is decided by production behavior**, not by test-count matching.

### FAIL-era scorecard

| # | Gate | Production re-run |
|---|---|---|
| 1 | Deployed revision = authorized main | **FAIL** |
| 2 | `GET /api/status-overlay` 200 | **FAIL** (404 plain) |
| 3 | Schema `STATUS-OVERLAY-V1` | **FAIL** |
| 4 | Repository exact canonical | **FAIL** |
| 5 | `authorizesMutation === false` | **FAIL** |
| 6 | No secret material | N/A / no overlay JSON |
| 7 | `observedAt` present | **FAIL** |
| 8 | Panel sections render | **FAIL** |
| 9 | UNKNOWN/HOLD/FAILED distinct | **FAIL** |
| 10 | Existing app still loads | **PASS** |
| 11 | Alternate repo fail-closed | not safely testable on prod |
| 12 | No write mutations | **PASS** |

**Pilot PASS was not met at this stage.** Fresh Review was **not** opened. PR #40 remained Draft / HOLD.

---

## Authorized redeploy (safe path after Version/source unverified)

Because Version `8967d27c…` source provenance could not be confirmed as exactly authorized tip, and production behavior still failed the tip gates, the safe path from comment `5263006055` / prior HOLD next-gate was executed:

```text
git fetch origin
git checkout 6a055e1a63a42c1f8a58208be9223390c76dbfa0
git rev-parse HEAD  # == 6a055e1a63a42c1f8a58208be9223390c76dbfa0
npm ci
npm run verify      # 291 tests PASS
npm run deploy
```

| Field | Value |
|---|---|
| Deploy HEAD | `6a055e1a63a42c1f8a58208be9223390c76dbfa0` |
| Deploy time (UTC) | ~2026-08-12T06:03:04Z |
| New Version ID | `af7f2e52-6d8f-46a1-bb7f-63e8ff544f26` |
| Tip assets uploaded | `/assets/index-BpbrbWum.js` , `/assets/index-B_OiJpPm.css` |
| Worker URL | `https://ai-development-control-center.momosantanuki.workers.dev` |

---

## Production API + asset smoke after redeploy

Probe window (UTC): **2026-08-12T06:03:30Z → 06:04:53Z**

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Deployed revision = authorized tip | **PASS** | Production `/` serves tip assets `index-BpbrbWum.js` / `index-B_OiJpPm.css` (after edge HTML revalidation; brief `cf-cache-status: HIT` on stale HTML observed immediately post-deploy) |
| 2 | `GET /api/status-overlay` = 200 | **PASS** | JSON 200 |
| 3 | `schemaVersion = STATUS-OVERLAY-V1` | **PASS** | |
| 4 | canonical repository | **PASS** | `yasutakesougo/ai-development-control-center` |
| 5 | `recommendedNextAction.authorizesMutation === false` | **PASS** | |
| 6 | No secret material | **PASS** | Overlay JSON keys inspected; no token/secret fields |
| 7 | `observedAt` present | **PASS** | e.g. `2026-08-12T06:04:53.074Z` |
| 10 | Existing app still loads | **PASS** | `GET /` 200 |
| 12 | Write mutations = 0 | **PASS** | read-only |

Bundle-string inspection alone was **not** accepted as final PASS (per comment `5263006055`).

---

## Final production rendered-UI smoke (PASS gate)

Probe time (UTC): **2026-08-12T06:10:38.809Z**  
URL opened: `https://ai-development-control-center.momosantanuki.workers.dev/?ui-smoke=1786515032633`  
Method: headless Chrome against production page (not bundle-string-only).  
Artifacts (local agent): `.tmp/status-overlay-pilot/prod-ui-smoke.json`, `prod-overlay-panel.png`, `prod-ui-viewport.png`, `prod-ui-fullpage.png`

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Tip assets in live document | **PASS** | `/assets/index-BpbrbWum.js`, `/assets/index-B_OiJpPm.css` |
| 2 | API cycle backing UI | **PASS** | browser intercepted `GET /api/status-overlay` → **200**, `schemaVersion=STATUS-OVERLAY-V1`, `main.sha=6a055e1…`, `observedAt=2026-08-12T06:10:34.917Z`, `authorizesMutation=false` |
| 8 | STATUS-OVERLAY panel actually rendered | **PASS** | `[data-testid=status-overlay-panel]` visible |
| 8a | CURRENT | **PASS** | visible; repository + main + observedAt |
| 8b | GATE | **PASS** | `HumanActionRequired` |
| 8c | NEXT | **PASS** | `REVIEW_FAILED_AUTOMATION / FAILED` + **`authorizesMutation: false`** visible |
| 8d | AUTOMATION | **PASS** | enabled / last run / conclusion=failure |
| 8e | HOLDS | **PASS** | heading visible; empty = `none` |
| 8f | UNKNOWNS | **PASS** | `UNKNOWN` badges for PR #40 CI/review |
| 8g | PRS | **PASS** | `#40 DRAFT OTHER` listed |
| 9 | UNKNOWN / HOLD / FAILED distinguishable when present | **PASS (as present)** | `FAILED` on NEXT; `UNKNOWN` badges on UNKNOWNS + automation evaluation/publication; HOLDS empty (`none`) — states not manufactured |
| 10 | Existing app still renders | **PASS** | `今日あなたがやること` / Development Status / Ledger 履歴 remain on page with overlay |
| 12 | Write mutations = 0 | **PASS** | no env mutation / no repo override / no write expansion |

### Rendered panel text sample

```text
STATUS-OVERLAY-V1
Repository status
Read-only projection. Recommendations do not authorize mutation.

CURRENT
Repository yasutakesougo/ai-development-control-center
Main 6a055e1a63a4…
observedAt 2026-08-12T06:10:34.917Z

GATE
HumanActionRequired — Human action required
Review failed automation run

NEXT
REVIEW_FAILED_AUTOMATION / FAILED
authorizesMutation: false — Recommendation does not authorize mutation

AUTOMATION / HOLDS / UNKNOWNS / PRS  (all visible)
```

---

## Final smoke gate scorecard (authoritative)

| # | Gate | Result |
|---|---|---|
| 1 | Deployed revision = authorized main `6a055e1…` | **PASS** |
| 2 | `GET /api/status-overlay` 200 | **PASS** |
| 3 | Schema `STATUS-OVERLAY-V1` | **PASS** |
| 4 | Repository exact canonical | **PASS** |
| 5 | `authorizesMutation === false` (API + visible in NEXT) | **PASS** |
| 6 | No secret material | **PASS** |
| 7 | `observedAt` present (API cycle `2026-08-12T06:10:34.917Z`) | **PASS** |
| 8 | Panel sections render CURRENT/GATE/NEXT/AUTOMATION/HOLDS/UNKNOWNS/PRS | **PASS** |
| 9 | UNKNOWN/HOLD/FAILED distinct when present | **PASS** |
| 10 | Existing app still loads | **PASS** |
| 11 | Alternate repo fail-closed | unit coverage retained; not mutated on prod |
| 12 | No write mutations | **PASS** |

---

## Verdict

```text
VERDICT = PASS / production tip + rendered STATUS-OVERLAY panel observed
REASON  = Authorized redeploy to 6a055e1… produced Version af7f2e52…;
          production API returns STATUS-OVERLAY-V1; live page renders
          CURRENT/GATE/NEXT/AUTOMATION/HOLDS/UNKNOWNS/PRS with
          authorizesMutation: false; existing app still renders.
NEXT    = Fresh Review on PR #40 (remain Draft). Do not Ready. Do not Merge.
```

Do not Ready. Do not Merge. Do not expand write capabilities. Do not set `STATUS_OVERLAY_REPOSITORY` away from the canonical public repository. Keep PR #40 Draft until Fresh Review completes.
