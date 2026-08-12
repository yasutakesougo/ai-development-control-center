# HANDOFF-V1

Repository-native context reconciliation for a fresh Agent.

## Purpose

HANDOFF-V1 answers:

- What commit generated `docs/architecture/architecture.json`?
- Is that snapshot stale relative to current `main`?
- Which facts remain confirmed, assumed, or unknown?
- What live GitHub differences exist?
- Which Human Gates / HOLDs / forbidden capabilities apply?
- What next action is proven (`NO_ACTION` | `ACTION_REQUIRED` | `UNKNOWN`)?

It is decision-support only. It does not execute, merge, deploy, or write the Approval Ledger.

## Inputs

1. `docs/architecture/architecture.json`
2. Current `main` SHA from git (`origin/main` preferred)
3. Read-only GitHub live state for this repository

## Run

```bash
npm run handoff
```

Optional flags:

```bash
npm run handoff -- --skip-live
npm run handoff -- --out-dir docs/handoff
```

Writes:

- `docs/handoff/handoff.json` — machine-readable report
- `docs/handoff/handoff.md` — Human-readable summary

`evaluatedAt` is volatile. For the same inputs, the structural projection is otherwise stable.

## Staleness

If `generatedFrom.commit == currentMain`, classification is `current`.

If they differ, HANDOFF compares the changed-path set and classifies:

- `stale_no_architecture_impact`
- `stale_architecture_affecting`
- `UNKNOWN` when the path set or current main cannot be determined safely

Architecture-relevant paths follow the Snapshot `staleIndicators`:

- `src/worker/**`
- `wrangler.jsonc`
- `migrations/**`
- `package.json`
- `scripts/generate-architecture-snapshot.mjs`
- `scripts/run-handoff.ts`
- HANDOFF domain modules under `src/domain/` (`handoffEvaluator.ts`, `observeHandoffLiveState.ts`, `formatHandoffReport.ts`, `handoffReport.ts`, `architectureSnapshot.ts`)

HANDOFF-V1 does not regenerate the Architecture Snapshot.

AUTO-REFRESH-V1 is **designed** with a **manual** pilot
(`npm run auto-refresh:pilot`) that may open a Draft refresh PR only.
Persistent AUTO-REFRESH is **ENABLED** for push-to-main via
`.github/workflows/architecture-auto-refresh.yml` (`docs/architecture/persistent-auto-refresh-v1.md`)
and still stops at Draft PR (no Ready/Merge automation). Snapshot staleness is
maintenance evidence only and must never be upgraded into HANDOFF / Approval
Ledger `ACTION_REQUIRED`.

HISTORY-V1 (append-only Snapshot/refresh audit) is **designed** and **not
implemented** — see [`../history/history-v1.md`](../history/history-v1.md).
Historical events must not change HANDOFF decision semantics or manufacture
`ACTION_REQUIRED`.

STATUS-OVERLAY-V1 (current-state projection) is **designed** and **not
implemented** — see [`../status/status-overlay-v1.md`](../status/status-overlay-v1.md).
Overlay consumes HANDOFF output and must not redefine HANDOFF rules.

## Next action

Fail closed:

- live observation failure → `UNKNOWN`
- ordinary open/Draft PRs → live differences only, not `ACTION_REQUIRED`
- `ACTION_REQUIRED` only for an explicit `Human-Decision: REQUIRED` marker with CI and Review confirmed `PASS`

## Forbidden

HANDOFF-V1 never authorizes:

- GitHub mutation (Issue/PR/Ready/Merge/branch)
- Cloudflare mutation
- SharePoint mutation
- Approval Ledger write
- Action Gateway invocation
- Agent execution
- production deploy
- `severe-behavior-support-spfx` mutation
