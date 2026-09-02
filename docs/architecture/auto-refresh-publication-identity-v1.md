# AUTO-REFRESH-PUBLICATION-IDENTITY-V1
## Minimal Correction Definition

**Status: MINIMAL CORRECTION DEFINED · IMPLEMENTATION NOT AUTHORIZED**

```text
Workstream
= B. Persistent Auto Refresh publication identity

READ-ONLY isolation of run 33598079334
= COMPLETE / PASS

This document
= PHASE 1 Minimal Correction Definition
  + PHASE 2 Exact Implementation Scope (proposed, one file)

Human Implementation Start GO = NOT GRANTED
Human Ready GO               = NOT GRANTED
Human Merge GO               = NOT GRANTED
Workflow Re-run GO           = NOT GRANTED
PR #133 Close GO             = NOT GRANTED
Secret Mutation GO           = NOT GRANTED
Deploy GO                    = NOT GRANTED
```

This is **not** an `/api/status` GitHub observation correction.
This is **not** PR #133 closeout.

---

## 0. Current-Main Rebaseline

```text
Repository = yasutakesougo/ai-development-control-center
main       = 4b47b5a3576564aebbe3f20d15c7807b89618243
subject    = Merge pull request #139 from yasutakesougo/feat/chat-readback-v1-mcp
```

Do not treat PR #133 HEAD (`ca53e53fd4d6bf76bd9c03a650ee91e392e0489e`) or
PR #133 base (`abac2ff1b3f704bf4cdb59e1bfaf3c148a8a19a0`) as this correction's
base.

---

## 1. Isolated workstreams

```text
A. PR #133
   /api/status GitHub credential observation failure
   → historical
   → current production GET /api/status = PASS
     evidenceState = CONFIRMED
     main          = Observed
     openPrCount   = 11
   → original H1 NOT REPRODUCED
   → Close disposition candidate
   → OUT OF THIS DOCUMENT

B. run 33598079334
   Persistent AUTO-REFRESH publication failure
   → current
   → git author identity unset
   → THIS DOCUMENT
```

Mixing A into B is forbidden. Mixing B into A is forbidden.

Adjacent planes already separated by the closed READ-ONLY review:

```text
OBSERVATION PLANE  = PASS
SNAPSHOT PLANE     = PASS
PUBLICATION PLANE  = FAIL
```

---

## 2. Confirmed defect

GitHub Actions run `33598079334`:

```text
workflow     = architecture-auto-refresh
trigger      = push to main
HEAD         = 4b47b5a3576564aebbe3f20d15c7807b89618243
job          = refresh
failed step  = Evaluate + regenerate + verify + Draft-only publish capability
```

First causal error (not the trailing `exit code 1`):

```text
Switched to a new branch 'auto-refresh/persistent-4b47b5a35765'
Author identity unknown
fatal: empty ident name ...
status: HOLD
reason: branch/commit/push failed; no Draft publication
verification: {"architectureSnapshot":"PASS","handoff":"PASS","verify":"PASS"}
publicationOutcome: HOLD
draftPr: null
```

Sequence:

```text
git checkout -B auto-refresh/persistent-4b47b5a35765   = PASS (local only)
git commit                                             = FAIL (empty ident)
git push                                               = NOT REACHED
Draft PR create                                        = NOT REACHED
remote branch auto-refresh/persistent-4b47b5a35765     = 404
```

Same first causal error on earlier runs `33583139163` and `33583986145`.
This is a publication-identity class failure, not a snapshot or observation
class failure.

Causal site in current main:

```text
scripts/run-persistent-auto-refresh.ts
  git(["commit", "-m", "docs(architecture): persistent auto-refresh Snapshot (...)"])
```

`.github/workflows/architecture-auto-refresh.yml` does not set `user.name` /
`user.email`. The runner does not inherit a usable ident. The publisher does
not pass process-local author/committer identity into that `git commit`.

Actions `GITHUB_TOKEN` was present in the failed step. This is **not** the
Worker secret named `GITHUB_TOKEN`. Missing-token publication HOLD
(`GITHUB_TOKEN missing; cannot publish Draft PR`) did not occur.

---

## 3. Minimal correction

Correct **only** Draft publication `git commit` identity.

```text
IN SCOPE
= non-empty process-local or repo-local git author/committer
  for the persistent auto-refresh Snapshot commit

OUT OF SCOPE
= global git config
= Worker GITHUB_TOKEN
= Cloudflare secrets
= GET /api/status payload / observer / TARGET_REPOSITORY
= Human Gate semantics (Ready / Merge / Close / Deploy)
= snapshot generator logic
= eligibility / anti-loop / duplicate-PR contract
= Draft-only publisher capability flags
= workflow re-run
= PR #133 edit / merge / close
```

Identity must be:

```text
repo-local  (git config without --global)
     OR
process-local (git -c user.* ... / GIT_AUTHOR_* + GIT_COMMITTER_*)

global git config = FORBIDDEN
secret values     = NOT REQUIRED
```

Expected identity (default, unless Independent Scope Review names another
non-empty bot ident):

```text
name  = github-actions[bot]
email = 41898282+github-actions[bot]@users.noreply.github.com
```

This ident is documentation of the intended commit author, not a secret.

---

## 4. Exact Implementation Scope (proposed)

Prefer **one** file. Do not change both unless Independent Scope Review
proves one file is insufficient.

### Preferred surface (one file)

```text
scripts/run-persistent-auto-refresh.ts
```

Why this file:

```text
1. First causal error is the git commit in this script.
2. One change covers Actions and CLI --publish.
3. Process-local identity can be applied only to that commit
   (git -c user.name=... -c user.email=... commit ...).
4. Workflow YAML stays an orchestration wrapper.
```

Proposed mutation (not implemented in this PR):

```text
Keep git(["checkout", "-B", branch]) and git(["add", ...]) unchanged.

Change only the commit invocation to pass process-local identity, e.g.

  git([
    "-c", "user.name=github-actions[bot]",
    "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit",
    "-m", `docs(architecture): persistent auto-refresh Snapshot (${startMain.slice(0, 7)})`,
  ])

Do not call git config --global.
Do not persist identity for later unrelated git commands unless a later
scope review requires repo-local config for committer consistency.
```

Optional focused test (only after Human Implementation Start GO): assert the
commit path supplies non-empty ident, or a dry helper around the commit argv.
Do not add Worker / `/api/status` tests for this slice.

### Rejected-for-now alternative (do not also take)

```text
.github/workflows/architecture-auto-refresh.yml
```

A repo-local `git config user.name` / `user.email` step (no `--global`)
would fix hosted Actions only. CLI `--publish` would still fail without
ident. Use this file only if Independent Scope Review rejects the script
surface.

### Files that must not change in the implementation slice

```text
src/worker/**
src/observer/**
src/domain/persistentAutoRefreshContract.ts
src/domain/autoRefreshPublisher.ts
docs/architecture/architecture.json
docs/architecture/architecture.html
wrangler.jsonc
PR #133 files
```

If another file becomes necessary, STOP and return to Scope Correction.
Do not expand into observation, secrets, or Human Gate automation.

---

## 5. Explicit non-changes

```text
/api/status                    = unchanged
Worker GITHUB_TOKEN            = untouched
Cloudflare secret              = untouched
Human Gate semantics           = unchanged
Ready / Merge / Close / Deploy = still Human-only
TARGET_REPOSITORY              = unchanged
snapshot generation algorithm  = unchanged
Draft-only publication bound   = unchanged (stop at Draft)
```

---

## 6. Acceptance (implementation slice, later)

Green Actions alone is **not** acceptance.

After Human Implementation Start GO, implementation, Independent
Implementation Review, Human Ready GO, Human Merge GO, and Human
Post-Merge Workflow Re-run GO:

```text
architectureSnapshot = PASS
handoff              = PASS
verify               = PASS

git commit           = PASS
git push             = PASS
Draft publication    = expected result for that run
                       (PUBLISH_DRAFT or legitimate REUSED_EXISTING /
                        NO_PUBLICATION — not ident HOLD)

Author identity unknown = NOT PRESENT
publicationOutcome      != HOLD caused by git ident
```

And still:

```text
/api/status           = unchanged class (observation remains a different plane)
Worker GITHUB_TOKEN   = untouched
Cloudflare secret     = untouched
Human Gate semantics  = unchanged
```

Do not treat a later `HOLD` from main-moved, duplicate, or publish-rejected
as this identity defect.

---

## 7. Authorized process

```text
PHASE 0   Current-Main Rebaseline          = THIS DOCUMENT (4b47b5a)
PHASE 1   Minimal Correction Definition    = THIS DOCUMENT
PHASE 2   Exact Implementation Scope       = THIS DOCUMENT (proposed)
PHASE 3   Independent Scope Review         = NEXT
PHASE 4   Human Implementation Start GO    = NOT GRANTED
PHASE 5   Minimal Implementation           = NOT AUTHORIZED
PHASE 6   Focused Verification             = NOT AUTHORIZED
PHASE 7   Exact HEAD Fixation              = NOT AUTHORIZED
PHASE 8   Independent Implementation Review= NOT AUTHORIZED
PHASE 9   Human Ready GO                   = NOT GRANTED
PHASE 10  Human Merge GO                   = NOT GRANTED
PHASE 11  Post-Merge Workflow Re-run GO    = NOT GRANTED
PHASE 12  Publication Acceptance           = NOT AUTHORIZED
```

`git config user.name` / `user.email` (or equivalent process-local ident)
must not be applied until PHASE 4 is granted.

---

## 8. PR #133 (separate)

```text
PR #133
= docs: READ-ONLY isolation of /api/status GitHub observation failure
= docs-only, base abac2ff1 (stale vs current main)
= original H1 = production Worker GITHUB_TOKEN absent
= current production /api/status closeout = PASS / NOT REPRODUCED

Disposition candidate
= Close after Exact Closeout Readback + Human Close GO
= do not merge into this publication-identity correction
= do not retarget this definition onto #133
```

This document does not close, comment on, or edit PR #133.

---

## 9. Current gate

```text
READ-ONLY ISOLATION                         = COMPLETE / PASS
AUTO-REFRESH-PUBLICATION-IDENTITY-V1
  Minimal Correction Definition             = DEFINED
  Exact Implementation Scope                = PROPOSED
  Independent Scope Review                  = PENDING
  Human Implementation Start GO             = NOT GRANTED
  Implementation                            = NOT AUTHORIZED

PR #133 CLOSE                               = NOT YET AUTHORIZED
WORKFLOW RE-RUN                             = NOT YET AUTHORIZED
READY / MERGE / DEPLOY                      = NOT AUTHORIZED
SECRET CORRECTION                           = NOT REQUIRED
```

```text
NEXT
= Independent Scope Review of the one-file proposal
  (scripts/run-persistent-auto-refresh.ts, process-local git -c ident)
= then Human Implementation Start GO
= then minimal implementation on a later commit
```
