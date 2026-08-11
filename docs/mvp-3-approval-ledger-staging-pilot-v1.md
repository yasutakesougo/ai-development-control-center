# MVP-3-APPROVAL-LEDGER-STAGING-PILOT-V1

Status:

```text
PARTIALLY DEPLOYED
STAGING WORKER = LIVE (fail-closed)
STAGING D1 = BLOCKED (API token permission)
STAGING ACCESS = BLOCKED (API token permission)
STOP = EXTERNAL_HUMAN_INPUT_REQUIRED
```

Baseline at execution:

```text
main = d604ec73f4c01c66f21c644e453cfcb886f934e3
MVP-3-APPROVAL-LEDGER-AUTHZ-V1 = MERGED (PR #14)
MVP-3-APPROVAL-LEDGER-CORE-V1  = MERGED (PR #15)
MVP-3-APPROVAL-LEDGER-UI-V1    = MERGED (PR #16)
npm run verify = PASS (119 tests)
```

---

## 1. What exists now

Isolated staging Worker (production untouched):

```text
URL        = https://ai-development-control-center-staging.momosantanuki.workers.dev
Worker     = ai-development-control-center-staging
Version ID = 2e63dfc1-7956-4353-9b9d-3d3bbf8ad067
Config     = wrangler.jsonc env.staging
Deploy     = CLOUDFLARE_ENV=staging vite build
             && wrangler deploy -c dist/ai_development_control_center/wrangler.json
Vars       = LEDGER_AUTHZ_MODE=access-policy
Bindings   = ASSETS only (no D1 yet, no secrets)
```

Verified fail-closed smoke (real requests against the staging URL):

```text
GET  /                        => 200 (UI serves)
GET  /api/status              => 200, evidenceState=ERROR (private repo, no token),
                                 HumanAction=UNKNOWN, decisionFingerprint ABSENT
GET  /api/ledger/records      => 401 UNAUTHENTICATED
POST /api/ledger/records      => 401 UNAUTHENTICATED
POST with forged Cf-Access-Jwt-Assertion => 401 (signature verification fails closed)
PUT  /api/ledger/records      => 405
GET  /api/auth/status         => 401
```

Ledger write on staging is therefore impossible today (not "publicly usable"):
no Access is configured, so no valid Access JWT can exist, and the Worker
denies everything without one. Additionally no D1 binding exists (would be
503 LEDGER_UNAVAILABLE even after auth).

---

## 2. What is blocked, and why

The injected `CLOUDFLARE_API_TOKEN` can:

```text
Workers scripts   = deploy OK (staging Worker deployed)
Workers subdomain = read OK
Access apps       = read OK (list works, 0 apps exist)
```

It cannot:

```text
D1 (list/create/query)      => code 10000 Authentication error
Access apps write            => code 1010 auth.forbidden
Access organizations read    => code 10000 Authentication error
```

Blocked required steps:

```text
1. create separate staging D1 database
   (suggested name: ai-development-control-center-ledger-staging)
2. apply migrations/0001_approval_ledger.sql to staging D1
3. bind staging-only LEDGER_DB in env.staging
4. create Access application for the staging host
   with allow policy = account owner email (momosantanuki@gmail.com,
   taken from the authenticated Cloudflare context)
5. set staging ACCESS_TEAM_DOMAIN / ACCESS_AUD vars and redeploy
6. real staging read/write Ledger smoke
```

No production resource was modified. No Access policy was weakened.
No policy value was invented.

---

## 3. Exact remaining Human action

Extend the Cloudflare API token used by the agent (Cursor Cloud Agents →
Secrets → `CLOUDFLARE_API_TOKEN`) with these account-scoped permissions:

```text
Account | D1                                                | Edit
Account | Access: Apps and Policies                         | Edit
Account | Access: Organizations, Identity Providers, Groups | Read
```

If the account has never enabled Zero Trust, one-time Zero Trust onboarding
(team name selection) must also be completed by the Human in the dashboard —
the agent must not invent a team name.

---

## 4. Completion runbook (once permissions exist)

```text
1. npx wrangler d1 create ai-development-control-center-ledger-staging
2. add env.staging.d1_databases binding (binding=LEDGER_DB, database_id=<new>)
3. npx wrangler d1 migrations apply ai-development-control-center-ledger-staging \
     --remote --env staging
4. POST /accounts/{account}/access/apps
     domain = ai-development-control-center-staging.momosantanuki.workers.dev
     type = self_hosted, policy allow email = momosantanuki@gmail.com
5. set env.staging vars ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com,
   ACCESS_AUD=<app aud tag>
6. CLOUDFLARE_ENV=staging vite build
   && wrangler deploy -c dist/ai_development_control_center/wrangler.json
7. smoke:
   unauthenticated => Access login redirect (no Ledger access)
   Access service token => Worker 401 NON_HUMAN_PRINCIPAL (fail-closed)
   authorized Human browser => auth PASS, Ledger UI + history visible
   synthetic write path remains covered by the test suite
   (current observed repository shows HumanAction=NO_ACTION —
    do NOT manufacture an ACTION_REQUIRED fact;
    never mutate severe-behavior-support-spfx for test evidence)
```

Optional (Human decision): a staging `GITHUB_TOKEN` secret is required for
staging to observe the private repository; without it staging /api/status
stays fail-closed at evidenceState=ERROR, which is safe but not informative.

---

## 5. Non-effects confirmation

```text
production Worker (ai-development-control-center.momosantanuki.workers.dev)
  = untouched (settings verified unchanged; still serving)
production Access / routes / D1 / secrets / permissions = untouched
severe-behavior-support-spfx = 0 mutations (read-only GETs only)
SharePoint = 0
Action Gateway = 0
Agent execution from Ledger = 0
GitHub write from Control Center runtime = 0
```
