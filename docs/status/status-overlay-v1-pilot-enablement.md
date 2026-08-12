# STATUS-OVERLAY-V1 Read-only Pilot Enablement / Smoke Validation

**Issue:** [#39](https://github.com/yasutakesougo/ai-development-control-center/issues/39)  
**PR:** [#40](https://github.com/yasutakesougo/ai-development-control-center/pull/40) (Draft)  
**Verdict: HOLD / Human deploy required**  
**Stop:** pilot safely attempted + smoke evidence recorded + PASS/HOLD (no Ready / no Merge)

```text
Pilot enablement in the real deployed production Worker = BLOCKED
Local tip path smoke (wrangler --local) = PASS (supplemental only; not production)
Write mutations performed = 0
Human deploy gate (exact steps) = DOCUMENTED — awaiting Human execution
```

Human deploy instructions source:
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
| `npm run verify` on tip | PASS — 291 tests / 24 files / typecheck / build |

---

## What was attempted

1. Probe production workers.dev for `GET /api/status-overlay`
2. Probe staging workers.dev (Access-gated)
3. Attempt production deploy of authorized tip via established `npm run deploy` / `wrangler deploy`
4. Supplemental local smoke of the same tip with `wrangler dev --local` (code-path evidence only)

No `STATUS_OVERLAY_REPOSITORY` override was set. No GitHub / HISTORY / Gateway / Ledger / Agent / SharePoint writes were performed.

---

## Deployed environment evidence (authoritative for pilot PASS)

Production URL: `https://ai-development-control-center.momosantanuki.workers.dev`

| Probe | Result |
|---|---|
| `GET /` | **200** — legacy SPA loads (`/assets/index-C4Vzo5Yb.js`) |
| `GET /api/status` | **200** — legacy HumanAction path; repo `yasutakesougo/severe-behavior-support-spfx` |
| `GET /api/status-overlay` | **404** plain `Not Found` — route **not present** on deployed Worker |

Observed production client assets **do not** match tip build assets:

```text
production assets = /assets/index-C4Vzo5Yb.js , /assets/index-C6aIaSYs.css
tip build assets  = /assets/index-BpbrbWum.js , /assets/index-B_OiJpPm.css
```

Staging `…-staging…/api/status-overlay` redirects to Cloudflare Access login (unauthenticated smoke not available).

### Deploy attempt

```text
CLOUDFLARE_API_TOKEN verify        = success / status=active
Workers Scripts API                = Authentication error [code: 10000] / 403
Account resource                   = 403 Unauthorized
D1 database list                   = 200 (token has partial account access)
wrangler secret list / deploy list = Authentication error
wrangler login (interactive)       = STOP per README (Human operation required)
```

**Conclusion:** authorized tip cannot be published to the pilot Worker from this agent environment. Production remains on a pre-STATUS-OVERLAY revision. Overlay was **not** enabled in the real deployed environment.

### Re-check after Human deploy comment (2026-08-12)

| Check | Result |
|---|---|
| `CLOUDFLARE_API_TOKEN` verify | still `active` |
| Workers Scripts API | still **403** Authentication error |
| Production `GET /api/status-overlay` | still **404** |

Agent cannot complete `npm run deploy` until Workers Scripts Edit is granted or Human deploys interactively.

---

## Human deploy gate — exact execution

Authorized revision:

`6a055e1a63a42c1f8a58208be9223390c76dbfa0`

From that exact revision, use the repository's established deploy script:

```bash
git checkout 6a055e1a63a42c1f8a58208be9223390c76dbfa0
npm ci
npm run verify
npm run deploy
```

`npm run deploy` is defined in `package.json` as `npm run build && wrangler deploy`.

Before deploy, either:

- grant the existing `CLOUDFLARE_API_TOKEN` permission sufficient for Workers Scripts edit/deploy, or
- perform the deploy interactively as Human with authorized Cloudflare credentials.

Do **not**:

- set `STATUS_OVERLAY_REPOSITORY` away from `yasutakesougo/ai-development-control-center`
- add GitHub mutation / repository writer / HISTORY writer / Action Gateway / Ledger / Agent / SharePoint capabilities

### After deploy — production smoke (all required for PASS)

1. deployed revision / asset revision corresponds to the authorized tip  
2. `GET /api/status-overlay` = 200  
3. `schemaVersion = STATUS-OVERLAY-V1`  
4. `repository = yasutakesougo/ai-development-control-center`  
5. `recommendedNextAction.authorizesMutation = false`  
6. no token/secret material in response  
7. `observedAt` present  
8. UI renders CURRENT / GATE / NEXT / AUTOMATION / HOLDS / UNKNOWNS / PRS  
9. UNKNOWN/HOLD/FAILED/OUTCOME_UNKNOWN remain visibly distinct when present  
10. existing app still loads  
11. alternate-repository fail-closed remains preserved  
12. write mutations = 0  

If any production gate fails → keep Issue #39 / PR #40 at **HOLD** and stop.  
If all pass → update this evidence + PR #40, keep **Draft**, stop for **Fresh Review**.

---

## Supplemental local tip smoke (not sufficient for PASS)

Command:

```bash
npm run verify
npx wrangler dev -c dist/ai_development_control_center/wrangler.json \
  --ip 127.0.0.1 --port 8787 --local
```

### `GET http://127.0.0.1:8787/api/status-overlay`

| Gate | Result |
|---|---|
| HTTP | **200** |
| `schemaVersion` | `STATUS-OVERLAY-V1` |
| `repository` | `yasutakesougo/ai-development-control-center` |
| `recommendedNextAction.authorizesMutation` | `false` |
| Secret material (`ghp_`, `github_pat_`, `Bearer`, `cfut_`) | **absent** |
| `observedAt` | present (`2026-08-12T05:29:55.906Z` on API probe; UI cycle `…05:31:43.266Z`) |
| `main.sha` | `6a055e1a63a42c1f8a58208be9223390c76dbfa0` |

Observed projection (local): `recommendedNextAction.code=REVIEW_FAILED_AUTOMATION`, `status=FAILED`, automation last run `31566418653` conclusion `failure`. HISTORY remains `DESIGNED_NOT_IMPLEMENTED`.

### UI panel (`http://127.0.0.1:8787/`)

STATUS-OVERLAY-V1 panel rendered with sections:

`CURRENT` · `GATE` · `NEXT` · `AUTOMATION` · `HOLDS` · `UNKNOWNS` · `PRS`

Distinct tokens visible: `FAILED`, `UNKNOWN`, `failure`, `HumanActionRequired`.  
Legacy App / HumanAction UI still loaded above the overlay.  
`authorizesMutation: false` shown in NEXT.

Screenshots (agent artifacts):

- `/opt/cursor/artifacts/status-overlay-pilot/91354.webp`
- `/opt/cursor/artifacts/status-overlay-pilot/11f58.webp`
- `/opt/cursor/artifacts/status-overlay-pilot/e55b3.webp`

JSON summary: `/opt/cursor/artifacts/status-overlay-pilot/local-overlay-summary.json`

### Alternate-repository fail-closed (gate 11)

Not re-probed against production (endpoint absent; no env mutation). Covered by existing unit tests in `test/statusOverlayApiAuth.test.ts` (non-canonical `STATUS_OVERLAY_REPOSITORY` → **403** before token-backed GitHub reads).

---

## Smoke gate scorecard

| # | Gate | Production | Local tip (supplemental) |
|---|---|---|---|
| 1 | Deployed revision = authorized main | **FAIL** (stale assets; overlay 404) | N/A (local) |
| 2 | `GET /api/status-overlay` 200 | **FAIL** (404) | PASS |
| 3 | Schema `STATUS-OVERLAY-V1` | — | PASS |
| 4 | Repository exact canonical | — | PASS |
| 5 | `authorizesMutation === false` | — | PASS |
| 6 | No secret material | — | PASS |
| 7 | `observedAt` present | — | PASS |
| 8 | Panel sections render | — | PASS |
| 9 | UNKNOWN/HOLD/FAILED distinct | — | PASS |
| 10 | Existing app still loads | PASS (legacy) | PASS |
| 11 | Alternate repo fail-closed | not safely testable on prod | unit tests PASS |
| 12 | No write mutations | PASS | PASS |

**Pilot PASS requires production (or equivalently reachable deployed) gates 1–12.** Local-only success does **not** authorize PASS.

---

## Verdict

```text
VERDICT = HOLD / Human deploy required
REASON  = Cloudflare Workers deploy credentials lack Workers Scripts permission;
          production Worker still serves pre-overlay revision (/api/status-overlay = 404).
NEXT HUMAN GATE = execute Human deploy gate above on revision
                   6a055e1a63a42c1f8a58208be9223390c76dbfa0
                   (grant Workers Scripts Edit OR interactive Human deploy),
                   then re-run Issue #39 production smoke 1–12.
```

Do not Ready. Do not Merge. Do not expand write capabilities. Do not set `STATUS_OVERLAY_REPOSITORY` away from the canonical public repository.
