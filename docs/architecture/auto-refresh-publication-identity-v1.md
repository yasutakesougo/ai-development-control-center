# AUTO-REFRESH-PUBLICATION-IDENTITY-V1
## Minimal Correction Definition

**Status: IMPLEMENTATION HEAD FIXED · INDEPENDENT IMPLEMENTATION REVIEW-CLEARED · WAITING HUMAN READY GO**

```text
Workstream
= B. Persistent Auto Refresh publication identity

READ-ONLY isolation of run 33598079334
= COMPLETE / PASS

This document
= PHASE 1 Minimal Correction Definition
  + PHASE 2 Exact Implementation Scope (LOCKED, one file)
  + PHASE 3 Independent Scope Review (REVIEW-CLEARED)
  + PHASE 4 Human Implementation Start GO (CONSUMED)
  + PHASE 5 Minimal Implementation (script commit argv)
  + PHASE 6 Focused Verification (PASS)
  + PHASE 7 Exact Implementation HEAD Fixation
  + PHASE 8 Independent Implementation Review (REVIEW-CLEARED)

Human Implementation Start GO = CONSUMED
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
= non-empty process-local git author/committer
  for the persistent auto-refresh Snapshot commit only

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
process-local only
= git -c user.name=... -c user.email=... on the commit argv

git config --global = FORBIDDEN
git config --local  = FORBIDDEN in this slice
GIT_AUTHOR_* extra  = NOT REQUIRED (duplicative of -c)
secret values       = NOT REQUIRED
```

Locked identity:

```text
name  = github-actions[bot]
email = 41898282+github-actions[bot]@users.noreply.github.com
```

This ident is documentation of the intended commit author, not a secret.

---

## 4. Exact Implementation Scope (LOCKED)

Independent Scope Review locked **one** file. Do not change the workflow
unless a later Scope Correction proves this file is insufficient.

### Locked surface (one file)

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

Locked mutation (implemented after Human Implementation Start GO):

```text
Keep git(["checkout", "-B", branch]) and git(["add", ...]) unchanged.

Change only the commit invocation to pass process-local identity, e.g.

  git([
    "-c", "user.name=github-actions[bot]",
    "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit",
    "-m", `docs(architecture): persistent auto-refresh Snapshot (${startMain.slice(0, 7)})`,
  ])

Do not call git config --global or git config --local.
Do not persist identity for later git commands.
```

Focused test file: **not in this slice** (Independent Scope Review DEFER).
PHASE 6 evidence is: exact diff of the commit argv, existing `npm run verify`,
and (only after Post-Merge Workflow Re-run GO) Actions logs showing
`Author identity unknown = NOT PRESENT`. Do not add Worker / `/api/status`
tests.

### Rejected alternative (do not take)

```text
.github/workflows/architecture-auto-refresh.yml
```

A repo-local `git config user.name` / `user.email` step (no `--global`)
would fix hosted Actions only. CLI `--publish` would still fail without
ident. Independent Scope Review rejected this alternative.

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
PHASE 2   Exact Implementation Scope       = THIS DOCUMENT (LOCKED)
PHASE 3   Independent Scope Review         = REVIEW-CLEARED
PHASE 4   Human Implementation Start GO    = CONSUMED
PHASE 5   Minimal Implementation           = APPLIED
PHASE 6   Focused Verification             = PASS
PHASE 7   Exact HEAD Fixation              = 8cffd55d8bcaf5c1073221c375ed9ad8149c6ef5
PHASE 8   Independent Implementation Review= REVIEW-CLEARED
PHASE 9   Human Ready GO                   = NOT GRANTED
PHASE 10  Human Merge GO                   = NOT GRANTED
PHASE 11  Post-Merge Workflow Re-run GO    = NOT GRANTED
PHASE 12  Publication Acceptance           = NOT AUTHORIZED
```

`git config user.name` / `user.email` remain forbidden. Identity is
process-local `git -c` on the Snapshot commit only.

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

## 9. Independent Scope Review

```text
REVIEW ID     = AUTO-REFRESH-PUBLICATION-IDENTITY-V1 Independent Scope Review-1
REVIEWED HEAD = b4b0551 (definition commit on this branch; rebaseline main 4b47b5a)
MODE          = READ-ONLY evaluation (no script / workflow / ident mutation)
VERDICT       = REVIEW-CLEARED
P0 MUST_FIX   = 0
P1 MUST_FIX   = 0
```

### Locks applied by this review

```text
LOCKED SURFACE    = scripts/run-persistent-auto-refresh.ts
LOCKED CALL SITE  = the existing git(["commit", "-m", ...]) only
LOCKED MECHANISM  = process-local git -c user.name=... -c user.email=...
                    as argv immediately before the commit subcommand
LOCKED IDENT      = name  github-actions[bot]
                    email 41898282+github-actions[bot]@users.noreply.github.com

NOT THIS SLICE    = .github/workflows/architecture-auto-refresh.yml
NOT THIS SLICE    = git config --global
NOT THIS SLICE    = git config --local / repo-local persist
NOT THIS SLICE    = GIT_AUTHOR_* / GIT_COMMITTER_* extra env (duplicative)
NOT THIS SLICE    = new test file
NOT THIS SLICE    = PR #133
NOT THIS SLICE    = /api/status, Worker GITHUB_TOKEN, Cloudflare, Human Gates
```

`git()` is `execFileSync("git", args)`. The locked argv is therefore a real
git process-local `-c` pair, not a shell string. Isolated reproduction
(empty HOME, no gitconfig) matched the Actions class:

```text
without -c  → exit 128, Author identity unknown
with    -c  → commit PASS
author      = github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>
committer   = same
repo-local user.name / user.email remained unset
```

Workflow YAML is unnecessary for this defect. Taking it would expand to two
files and leave CLI `--publish` unfixed. Identity is required only at
`commit`; `checkout -B`, `add`, and `push` do not need ident.

### Findings

| findingId | severity | disposition | rationale |
|---|---|---|---|
| ISR-1 | P0 | CLOSED | Causal site is the script `git commit`; one-file script change is sufficient. |
| ISR-2 | P1 | REJECT | Also changing the workflow YAML is not required and would violate one-file preference. |
| ISR-3 | P1 | CLOSED | Mechanism locked to process-local `git -c` only; `git config` (global or local) is out. |
| ISR-4 | P2 | REJECT | Extra `GIT_AUTHOR_*` env on top of `-c` is duplicative. |
| ISR-5 | P2 | REJECT | `GITHUB_ACTIONS`-conditional ident is extra branching; Actions bot ident is enough. |
| ISR-6 | P2 | DEFER | Split `commit` vs `push` HOLD reasons. Existing catch-all is not this defect. |
| ISR-7 | P2 | DEFER | New unit test file for commit argv. PHASE 6 uses diff + existing verify + later run logs. |
| ISR-8 | P0 | CLOSED | No leakage into `/api/status`, Worker secrets, Cloudflare, or Human Gate semantics. |

No MUST_FIX remains. Scope Correction is **not** required.

Human Implementation Start GO was **not** granted by this review. A later
Human Implementation Start GO was consumed; implementation is a later commit.

```text
Human Understanding Check = not performed here
Human Implementation Start GO at review time = NOT GRANTED
```

---

## 10. Current gate

```text
READ-ONLY ISOLATION                         = COMPLETE / PASS
AUTO-REFRESH-PUBLICATION-IDENTITY-V1
  Minimal Correction Definition             = DEFINED
  Exact Implementation Scope                = LOCKED
  Independent Scope Review                  = REVIEW-CLEARED
  Human Implementation Start GO             = CONSUMED
  Implementation                            = APPLIED
  Exact Implementation HEAD                 = 8cffd55d8bcaf5c1073221c375ed9ad8149c6ef5
  Focused Verification                      = PASS
  Independent Implementation Review         = REVIEW-CLEARED
  Human Ready GO                            = NOT GRANTED

PR #133 CLOSE                               = NOT YET AUTHORIZED
WORKFLOW RE-RUN                             = NOT YET AUTHORIZED
READY / MERGE / DEPLOY                      = NOT AUTHORIZED
SECRET CORRECTION                           = NOT REQUIRED
```

```text
NEXT
= Human Ready GO
= then Human Merge GO
= then Post-Merge Workflow Re-run GO
```

---

## 11. Focused Verification + Exact HEAD Fixation

```text
Implementation HEAD = 8cffd55d8bcaf5c1073221c375ed9ad8149c6ef5
files               = scripts/run-persistent-auto-refresh.ts only
base main           = 4b47b5a3576564aebbe3f20d15c7807b89618243
```

```text
identity present (isolated empty-HOME git, same argv) = PASS
  author    = github-actions[bot]
  email     = 41898282+github-actions[bot]@users.noreply.github.com
  committer = same
  repo-local user.name / user.email = unset
  Author identity unknown = NOT PRESENT

commit creation path (process-local -c commit) = PASS
npm run verify = PASS
  typecheck PASS
  tests     974 passed / 47 files
  build     PASS

observation/snapshot regression:
  workflow YAML vs main           = unchanged
  src/worker, src/observer, wrangler.jsonc vs main = unchanged
  no new test file
```

Publication acceptance (`git push` / Draft PR / live Actions logs) remains
**not** this phase. That waits for Human Ready GO, Human Merge GO, and
Post-Merge Workflow Re-run GO.

---

## 12. Independent Implementation Review

```text
REVIEW ID     = AUTO-REFRESH-PUBLICATION-IDENTITY-V1 Independent Implementation Review-1
REVIEWED HEAD = 8cffd55d8bcaf5c1073221c375ed9ad8149c6ef5
VERDICT       = REVIEW-CLEARED
P0 MUST_FIX   = 0
P1 MUST_FIX   = 0
```

Exact diff is one hunk: the Snapshot `git commit` argv gained process-local
`-c user.name=github-actions[bot]` and
`-c user.email=41898282+github-actions[bot]@users.noreply.github.com`.
`checkout -B`, `add`, and `push` are unchanged. No `git config`. No workflow
file. No Worker / `/api/status` / secret / Human Gate change.

| findingId | severity | disposition | rationale |
|---|---|---|---|
| IIR-1 | P0 | CLOSED | Diff matches locked surface, call site, mechanism, and ident. |
| IIR-2 | P0 | CLOSED | Non-changes held: workflow, git config, secrets, /api/status, PR #133. |
| IIR-3 | P2 | DEFER | Live Actions publication still needs Post-Merge Workflow Re-run GO. |

```text
Human Ready GO  = NOT GRANTED by this review
Human Merge GO  = NOT GRANTED
Workflow Re-run = NOT AUTHORIZED
```
