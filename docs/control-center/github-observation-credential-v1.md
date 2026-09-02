# GITHUB-OBSERVATION-CREDENTIAL-V1

## Phase

Human Secret Provision

## Status

DEFINED · Human Secret Provision GO **NOT CONSUMED**

Prerequisite (closed):

```text
docs/control-center/github-observation-failure-readonly-v1.md
READ-ONLY diagnosis = COMPLETE
H1                  = CONFIRMED
GITHUB_TOKEN        = NOT CONFIGURED on production Worker
```

This gate is **credential provisioning**, not further investigation.

```text
Code mutation              = NOT REQUIRED
Worker redeploy            = NOT REQUIRED
TARGET_REPOSITORY mutation = FORBIDDEN
CLOUDFLARE_API_TOKEN use   = FORBIDDEN as GitHub credential
Secret value in chat       = FORBIDDEN
```

Existing `observeRepository()` already sends `Authorization: Bearer` when
`env.GITHUB_TOKEN` is set. Adding the production secret is sufficient.

## Objective

Restore authenticated, read-only GitHub observation of

```text
yasutakesougo/severe-behavior-support-spfx
```

so production `GET /api/status` can leave `evidenceState=ERROR`.

## Bound permission (README, unchanged)

Fine-grained PAT. Repository access = that repository **only**.

Required:

```text
Contents          Read-only
Pull requests     Read-only
Commit statuses   Read-only
Metadata          Read-only
```

Forbidden / unused:

```text
Checks                 不要
Issues                 不要
Contents Write         禁止
Pull requests Write    禁止
classic repo scope     不要
GitHub write / merge   禁止
```

Do not reuse or overwrite `CLOUDFLARE_API_TOKEN`. That token is Cloudflare
deploy auth only.

## After Human Secret Provision GO (minimal change)

Human-authenticated terminal / GitHub + Cloudflare Dashboard only. Do not
paste the PAT into chat, commits, or screenshots.

1. Create a fine-grained PAT with the bound permissions above.
2. Register it on production Worker `ai-development-control-center` as secret
   name `GITHUB_TOKEN` only:

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   ```

   or Dashboard → Workers → `ai-development-control-center` → Secrets →
   add `GITHUB_TOKEN`.

3. Do not change application code. Do not `wrangler deploy` unless a later
   Human separately authorizes it. Secret put updates the running Worker
   binding without a new Version for this purpose.

4. Do not grant the PAT to overview/public repos. Do not add it to staging
   unless a later gate says so.

## Closeout readback (after put)

Public `GET /api/status` only. Do not print the PAT.

```text
GET https://ai-development-control-center.momosantanuki.workers.dev/api/status
```

Pass:

```text
HTTP                  = 200
evidenceState         = CONFIRMED
developmentStatus.main ≠ Unknown
  (SHA observed; payload field is "Observed" when currentMain is set)
openPrCount           = number (including 0)
```

HumanAction may still be `UNKNOWN` for PR-level evidence reasons. That is a
**different** class and does **not** reopen H1.

Fail (stay on this gate; do not widen scopes blindly):

```text
still evidenceState=ERROR
→ H2/H3/H4 become applicable
→ inspect PAT expiry and Repository access
→ do not mint a second token until that check
```

## Non-effects

```text
severe-behavior-support-spfx mutation = 0
GitHub write                          = 0
application source change             = 0
production Version ID change          = not required
overview / overlay authority          = unchanged
CLOUDFLARE_API_TOKEN                  = unchanged
```

## Current gate

```text
GITHUB-OBSERVATION-CREDENTIAL-V1
Human Secret Provision GO = NOT CONSUMED

NEXT
= Human GO, then PAT create + production secret put + /api/status readback
```
