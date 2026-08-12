# STATUS-OVERLAY-V1 Read-only Pilot Enablement / Smoke Validation

**Issue:** [#39](https://github.com/yasutakesougo/ai-development-control-center/issues/39)  
**Verdict: HOLD**  
**Stop:** pilot safely attempted + smoke evidence recorded + PASS/HOLD (no Ready / no Merge)

```text
Pilot enablement in the real deployed production Worker = BLOCKED
Local tip path smoke (wrangler --local) = PASS (supplemental only; not production)
Write mutations performed = 0
```

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

**Conclusion:** authorized tip cannot be published to the pilot Worker from this environment. Production remains on a pre-STATUS-OVERLAY revision. Overlay was **not** enabled in the real deployed environment.

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
VERDICT = HOLD
REASON  = Cloudflare Workers deploy credentials lack Workers Scripts permission;
          production Worker still serves pre-overlay revision (/api/status-overlay = 404).
NEXT HUMAN GATE = grant Workers Scripts Edit on CLOUDFLARE_API_TOKEN
                   OR Human `npm run deploy` of main 6a055e1…,
                   then re-run Issue #39 production smoke.
```

Do not Ready. Do not Merge. Do not expand write capabilities. Do not set `STATUS_OVERLAY_REPOSITORY` away from the canonical public repository.
