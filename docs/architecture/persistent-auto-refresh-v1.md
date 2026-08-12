# PERSISTENT-AUTO-REFRESH-V1

**Status: DESIGNED · NOT ENABLED · NO ACTIVE TRIGGER · NO SCHEDULER**

This document designs the minimum safe **persistent** Architecture Snapshot
refresh mechanism. It builds on:

- `docs/architecture/auto-refresh-v1.md` (eligibility / anti-loop / identity)
- AUTO-REFRESH-PILOT-V1 (`npm run auto-refresh:pilot`) — manual proof path

This design-only slice does **not** enable any always-on mutation path.

Companion pure helpers: `src/domain/persistentAutoRefreshContract.ts`  
Example (non-active) workflow sketch:
`docs/architecture/persistent-auto-refresh-workflow.example.yml`

---

## Objective

Eventually allow:

```
main changes
  → evaluate architecture relevance
  → regenerate Snapshot if eligible
  → verify
  → create/reuse one Draft PR
  → STOP
```

Human **Ready** and Human **Merge** remain unchanged.

---

## Trigger (designed; not enabled)

### Preferred order

1. **GitHub Actions `push` to `main`** (primary)
2. **`workflow_dispatch`** (manual fallback)
3. **Scheduler / cron** — only if event-driven coverage is proven insufficient
   (not selected for V1)

### Event filter

- Branch: `main` only (never arbitrary feature branches)
- First-line Actions filter (optional, belt-and-suspenders):

  - `paths-ignore`:
    - `docs/architecture/architecture.json`
    - `docs/architecture/architecture.html`

  so generated-only merges do not even start the workflow.

- Always apply repository-native contract evaluation when the workflow runs.
  Generic HEAD change alone is never sufficient for publication.

### Explicit non-enablement

Until an accepted **implementation** slice lands:

- no file under `.github/workflows/` may actively trigger AUTO-REFRESH
- the example YAML in `docs/architecture/` is documentation only
- Persistent AUTO-REFRESH remains **NOT ENABLED**

---

## Source vs generated (anti-loop)

Reuse AUTO-REFRESH-V1:

| Class | Examples | May publish Draft? |
|---|---|---|
| ARCHITECTURE_RELEVANT_SOURCE | `src/worker/**`, `package.json`, generator, HANDOFF modules listed by relevance | Yes, if other gates pass |
| GENERATED_ARTIFACT | `architecture.json`, `architecture.html` | Never alone |
| NON_ARCHITECTURE | docs (non-generated), tests, deferred modules | No |

Decision:

1. Compute changed paths `generatedFrom..observedMain`
2. Exclude generated artifacts
3. Filter with `isArchitectureRelevantPath`
4. If remaining source set empty → `NOT_REQUIRED` / no publication
5. Else continue eligibility / generation / verify / Draft

A merge containing **only** generated Snapshot artifacts must not cause another
publication (Actions `paths-ignore` + contract filter).

If generated artifacts accompany other files, evaluate those other files
independently under the same relevance rules.

---

## Concurrency (resolves pilot check-then-act race)

Pilot duplicate detection is check-then-act. Persistent mode must not rely on
that alone.

### Required controls

1. **GitHub Actions concurrency group**

   ```yaml
   concurrency:
     group: architecture-auto-refresh-${{ github.repository }}-main
     cancel-in-progress: true
   ```

   - Key: repository + default branch (`main`)
   - `cancel-in-progress: true` so rapid A→B pushes cancel obsolete runs

2. **Deterministic refresh identity** (existing)

   ```
   repository + snapshotGeneratedFrom + targetMainSha + generatorVersion
   ```

3. **Second duplicate check immediately before Draft publication**
   (re-list open refresh PRs after verify / main recheck)

### Rapid A→B behavior

| Situation | Behavior |
|---|---|
| Run for A still evaluating; B pushed | concurrency cancels A; B evaluates |
| Run for A generated artifacts; B appears before publish | main recheck → `ABORTED_MAIN_MOVED`; B run evaluates |
| Two runs somehow both reach publish for same identity | second pre-publish duplicate check → `REUSED_EXISTING` |

Persistent mode must keep **≤1** Draft for a given refresh identity.

---

## Main movement

If run starts at main=`A` and main becomes `B` before publication:

- **Do not** publish A-targeted artifacts as current for B
- **Do not** silently retarget `generatedFrom`
- Status: `ABORTED_MAIN_MOVED`
- Preferred: allow/requeue evaluation for `B` via the newer Actions run
  (concurrency cancel + push event)

---

## Existing Draft behavior (non-mutating)

Do **not** automatically close, Ready, or Merge an old Draft.

| Condition | Outcome |
|---|---|
| Open Draft/Ready with **same** refresh identity | `REUSE` |
| Open Draft/Ready targets different `targetMainSha` | `SUPERSEDED_CANDIDATE` (report only; **no close**) |
| Eligible for new identity and no equivalent open Draft | `NEW_DRAFT_REQUIRED` |
| Not eligible | `NO_ACTION` |

Any future close/supersede mutation requires a **separate Human authorization**.

---

## Failure semantics

| Failure | Classification | Publication |
|---|---|---|
| GitHub API unavailable (read) | `OUTCOME_UNKNOWN` or `SAFE_RETRY` (transient) | No Draft |
| Changed-path comparison unavailable | `HOLD` | No Draft |
| Generator failure | `HOLD` | No Draft |
| HANDOFF / test / build failure | `HOLD` | No Draft |
| Main recheck unavailable | `HOLD` | No Draft |
| Duplicate-check unavailable before publish | `HOLD` | No Draft |
| Branch / Draft creation transport error after unknown server result | `OUTCOME_UNKNOWN` | **No blind retry** |
| Draft creation confirmed failure (4xx clear) | `SAFE_RETRY` only if identity still absent | Else HOLD |

Rules:

- No retry may create duplicate PRs blindly
- `OUTCOME_UNKNOWN` → stop; require Human/operator inspection before re-run
- `SAFE_RETRY` → only after re-observing identity absence + main tip

---

## Permissions (designed minimum)

GitHub Actions `permissions:` for a future enablement PR:

```yaml
permissions:
  contents: write      # create/update refresh feature branch + commit Snapshot
  pull-requests: write # create Draft PR; read open PRs
```

Must **not** grant:

- `issues: write`
- deployment / environment write
- packages / other unrelated scopes
- any token with Cloudflare / SharePoint / Ledger / SPFX powers

`GITHUB_TOKEN` must never be used to:

- mark Ready
- merge
- enable auto-merge
- close issues/PRs

Publisher capability flags remain:

`canMarkReady=false`, `canMerge=false`, `canClosePullRequest=false`,
`canCloseIssue=false`, `canInvokeActionGateway=false`, `canExecuteAgent=false`

---

## Human gates

Persistent AUTO-REFRESH stops at:

**Draft PR created** (or reused)

Never:

- mark Ready
- approve review
- merge
- enable auto-merge

Human path remains:

```
Draft Review → Human Ready → Human Merge
```

---

## HANDOFF / Approval separation

| State family | Meaning |
|---|---|
| Persistent refresh statuses | system maintenance |
| HANDOFF `HumanAction` / Approval Ledger | business approval |

`REFRESH_ELIGIBLE` / Draft publication **≠** approval `ACTION_REQUIRED`.

No Approval Ledger write is authorized by AUTO-REFRESH maintenance.

---

## Persistent workflow status model

```
IDLE
EVALUATING
NOT_REQUIRED
ELIGIBLE
GENERATING
VERIFYING
DRAFT_PUBLISHING
DRAFT_OPEN
REUSED_EXISTING
ABORTED_MAIN_MOVED
FAILED
OUTCOME_UNKNOWN
HOLD
```

Mapped from existing pilot/contract outcomes where possible
(`NOT_REQUIRED` ← `NO_REFRESH` / `CURRENT`, `ELIGIBLE` ← `REFRESH_ELIGIBLE`, etc.).

---

## Observability

Each run must log / emit a repository-native report answering:

- triggering main SHA
- observed Snapshot `generatedFrom`
- changed paths + architecture-relevant source paths
- eligibility reason
- refresh identity
- verification result
- duplicate state
- main recheck
- Draft PR result / mutation occurred?

Storage for V1: Actions logs + optional gitignored report artifact
(same pattern as pilot). **No new persistence backend.**

---

## Security boundary

Persistent AUTO-REFRESH must create **no** path to:

- Cloudflare mutation
- SharePoint mutation
- Approval Ledger write
- Action Gateway
- Agent execution
- production deploy
- `severe-behavior-support-spfx` mutation

No shared broad PAT. Prefer default `GITHUB_TOKEN` with the minimum permissions
above.

---

## Proposed implementation artifacts (future enablement)

| Artifact | Role |
|---|---|
| `.github/workflows/architecture-auto-refresh.yml` | **Future** active wiring (not in this design-only PR) |
| `docs/architecture/persistent-auto-refresh-workflow.example.yml` | Non-active example |
| `scripts/run-auto-refresh-pilot.ts` | Reuse as runner core |
| `src/domain/autoRefreshContract.ts` | Eligibility / anti-loop / identity |
| `src/domain/autoRefreshPilot.ts` | Publication decision helpers |
| `src/domain/autoRefreshPublisher.ts` | Draft-only publisher caps |
| `src/domain/persistentAutoRefreshContract.ts` | Concurrency / failure / draft disposition |

Enablement requires a **separate Human-authorized** PR that moves the example
into `.github/workflows/` with the designed filters and permissions.

---

## Implementation status

| Item | State |
|---|---|
| Persistent design | this document |
| Pure contract helpers + tests | present |
| Example workflow YAML | docs only (non-triggering) |
| Active `.github/workflows` AUTO-REFRESH | **NOT ENABLED** |
| cron / webhook mutation | **NOT ENABLED** |
| Ready / Merge automation | **NOT ENABLED** |
| Action Gateway / Agent execution | **NOT IMPLEMENTED** |
