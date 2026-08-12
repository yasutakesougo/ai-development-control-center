# STATUS-OVERLAY-V1 Read-only Pilot Enablement / Smoke Validation

**Issue:** [#39](https://github.com/yasutakesougo/ai-development-control-center/issues/39)  
**PR:** [#40](https://github.com/yasutakesougo/ai-development-control-center/pull/40) (Draft)  
**Verdict: HOLD / production tip not observed**  
**Stop:** production smoke re-run recorded after Human deploy comment; pilot remains HOLD (no Ready / no Merge / no Fresh Review)

```text
Human deploy report (comment 5262885245) = RECEIVED
Production smoke re-run (authoritative behavior) = FAIL
Authorized tip asset / route presence on production = NOT OBSERVED
Write mutations performed = 0
```

Human deploy report source:
[Issue #39 comment 5262885245](https://github.com/yasutakesougo/ai-development-control-center/issues/39#issuecomment-5262885245)

Human deploy gate source (exact steps):
[Issue #39 comment 5262856051](https://github.com/yasutakesougo/ai-development-control-center/issues/39#issuecomment-5262856051)

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

## Human deploy report (received)

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

Agent cannot independently confirm Version ID via Cloudflare Workers Scripts API (`CLOUDFLARE_API_TOKEN` verify=active; Scripts/deployments/versions APIs still **403 Authentication error**).

---

## Production smoke re-run (authoritative)

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

### Response samples

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

### Asset drift vs prior HOLD probe

| When | Production assets |
|---|---|
| Prior HOLD evidence | `/assets/index-C4Vzo5Yb.js` , `/assets/index-C6aIaSYs.css` |
| After Human deploy comment | `/assets/index-Bo9GFqfm.js` , `/assets/index-D8mEp3RE.css` |
| Authorized tip build | `/assets/index-BpbrbWum.js` , `/assets/index-B_OiJpPm.css` |

Assets changed after the Human deploy report, but the served Worker/UI still does **not** match the authorized tip overlay revision.

### UI screenshots (agent artifacts)

- `/opt/cursor/artifacts/status-overlay-pilot/prod-app-viewport.webp` — legacy app loads; no overlay sections
- `/opt/cursor/artifacts/status-overlay-pilot/prod-app-expanded.webp` — PR evidence / Ledger 履歴
- `/opt/cursor/artifacts/status-overlay-pilot/production-smoke-rerun.txt` — probe summary

### Note on Human 119-test report

Human pre-deploy verify reported **119 tests / 11 files**. Authorized tip currently runs **291 tests / 24 files**. Repository history shows ~119 `it(` across 11 `test/*.test.ts` files around the MVP-3 staging / architecture-snapshot era (pre-STATUS-OVERLAY merge). This is recorded as a consistency warning only; **PASS/FAIL is decided by production behavior above**, not by test-count matching.

---

## Agent deploy capability (unchanged)

```text
CLOUDFLARE_API_TOKEN verify        = success / status=active
Workers Scripts API                = Authentication error [code: 10000] / 403
Deployments / versions APIs        = 403
```

Agent still cannot publish or inspect Version ID `8967d27c-…` directly.

---

## Supplemental local tip smoke (not sufficient for PASS)

Unchanged from prior evidence: local `wrangler dev --local` on tip returned overlay **200** with canonical schema/repository/`authorizesMutation=false`/no secrets/`observedAt`, and UI sections rendered. That remains supplemental only.

---

## Smoke gate scorecard (production re-run)

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

**Pilot PASS is not met.** Fresh Review is **not** opened.

---

## Verdict

```text
VERDICT = HOLD / production tip not observed
REASON  = After Human deploy comment 5262885245, production still lacks
          GET /api/status-overlay (plain 404) and tip overlay assets/UI.
          Observed production assets != authorized tip build assets.
NEXT HUMAN GATE = confirm Cloudflare dashboard Version ID / deployed source
                  for Worker ai-development-control-center is exactly
                  6a055e1a63a42c1f8a58208be9223390c76dbfa0
                  (or re-run: git checkout 6a055e1… && npm ci && npm run verify
                  && npm run deploy from that revision), then request
                  production smoke re-run again.
```

Do not Ready. Do not Merge. Do not expand write capabilities. Do not set `STATUS_OVERLAY_REPOSITORY` away from the canonical public repository. Keep PR #40 Draft / HOLD.
