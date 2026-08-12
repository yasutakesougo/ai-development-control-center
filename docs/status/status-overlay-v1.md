# STATUS-OVERLAY-V1

**Status: DESIGNED · runtime generator IMPLEMENTED · GitHub/workflow observer IMPLEMENTED · UI IMPLEMENTED (read-only) · runtime wiring MERGED · production pilot PASS / tip + rendered panel observed (see `status-overlay-v1-pilot-enablement.md`)**

This document designs **STATUS-OVERLAY-V1**: a replaceable **current-state
projection** that answers:

- What is the repository doing now?
- What is stale?
- What is blocked?
- What is waiting on Human?
- What is safe to do next?

Companion modules:

- Contract helpers: `src/domain/statusOverlayContract.ts`
- Runtime generator (pure): `src/domain/statusOverlayGenerator.ts`
- Read-only observer: `src/observer/statusOverlayGithubObserver.ts`
- Read-only UI: `src/ui/statusOverlayViewModel.ts`, `src/ui/StatusOverlayPanel.tsx`
- Read-only runtime wiring: `src/runtime/statusOverlayRuntime.ts`,
  `src/ui/StatusOverlayRuntimeContainer.tsx`, `GET /api/status-overlay`

STATUS-OVERLAY is **decision-support only**. It does **not** authorize
mutation, Ready, Merge, Action Gateway, Agent execution, or Ledger writes.

Observation / projection flow:

```
read-only GitHub/workflow observer
  → explicit StatusOverlayGeneratorInput
  → generateStatusOverlay()
  → StatusOverlayDocument
  → UI projection (read-only)
```

Runtime wiring orchestrates the same flow into `App(statusOverlay)` without
adding writers or mutation controls.

---

## Objective

Produce one machine-readable current projection (and optional compact Markdown)
from **live repository evidence**, with HISTORY-V1 as optional context that
**never overrides** live state.

---

## Baseline (reconciled at design time)

| Item | Value |
|---|---|
| Expected main | `7c33aac9bfea64b5ccbbc92c2c855e91d9f5779d` |
| Observed main | `7c33aac9bfea64b5ccbbc92c2c855e91d9f5779d` (MATCH) |
| Snapshot `generatedFrom` | `78a72b13965d7b4fc4ce021d0aaa08a40eb17aa0` |
| Staleness (paths) | `stale_no_architecture_impact` (no architecture-relevant source paths) |
| Persistent AUTO-REFRESH | ENABLED (`push` + `workflow_dispatch`) |
| Last refresh run | `31562991156` SUCCESS · `REFRESH_NOT_REQUIRED` · `NO_PUBLICATION` |
| Open PRs | none |
| HISTORY-V1 | DESIGNED · writer NOT IMPLEMENTED |
| Ready / Merge automation | NOT ENABLED |
| Action Gateway / Agent | NOT IMPLEMENTED |

---

## Scope

STATUS-OVERLAY-V1 summarizes repository maintenance / control-plane status only.

### Included top-level fields

```
repository
main
snapshot
handoff
autoRefresh
history
pullRequests
humanGates
holds
unknowns
recommendedNextAction
observedAt
```

### Explicitly out of scope

- Business Approval Ledger decision content beyond gate markers already
  exposed by HANDOFF
- Cloudflare / SharePoint / SPFX operational telemetry
- Agent session transcripts
- Decorative dashboards / metric strips that do not change decisions

---

## Live-state precedence (strict)

```
live GitHub / git evidence
  > generated Snapshot current-state fields
  > HANDOFF projection
  > HISTORY-V1 historical context
```

Rules:

1. If live GitHub and HISTORY disagree about a PR, **live wins** for current
   classification. HISTORY retains the earlier event.
2. If main tip moved after the last successful AUTO-REFRESH run, that run is
   **not** proof of current freshness — re-evaluate against current main.
3. Overlay must never invent PASS/READY from missing CI or review evidence.
4. HISTORY unavailable (`DESIGNED_NOT_IMPLEMENTED`) must not break current
   projection.

---

## Status vocabulary

Stable tokens only — do not invent synonyms:

| Token | Meaning |
|---|---|
| `CURRENT` | Live tip matches required freshness / no outstanding maintenance |
| `STALE` | Snapshot (or related maintenance state) is behind live main |
| `READY` | Open PR is Ready (not Draft) for Human merge decision |
| `HOLD` | Explicit safety/process hold |
| `ACTION_REQUIRED` | Explicit Human decision gate (HANDOFF sense; not mere staleness) |
| `NO_ACTION` | Nothing required now |
| `UNKNOWN` | Evidence missing; cannot classify safely |
| `FAILED` | Automation/verification failed with confirmed failure |
| `OUTCOME_UNKNOWN` | Automation finished without a trustworthy outcome |

---

## Human gate model

Overlay classifies **who/what must act** separately from HANDOFF
`ACTION_REQUIRED`:

| Kind | When |
|---|---|
| `HumanActionRequired` | Draft/Ready PR awaiting Human review or merge; explicit HANDOFF `ACTION_REQUIRED`; confirmed failed automation needing Human |
| `SystemMaintenanceRequired` | Architecture-affecting stale Snapshot **without** active refresh coverage (no open Draft / no enabled automation handling it) |
| `NoAction` | No stale maintenance needing Human, no open relevant PR, no hold |
| `Unknown` | Live observation failed or required evidence is UNKNOWN |

Examples:

- Snapshot stale + AUTO-REFRESH already opened Draft → **not**
  `SystemMaintenanceRequired`; treat as Draft review (`HumanActionRequired`)
- Snapshot stale + no automation coverage → `SystemMaintenanceRequired`
- Draft PR awaiting review → `HumanActionRequired`
- No stale state / no PR → `NoAction`
- GitHub unreadable → `Unknown`

**Do not** map all maintenance state to HANDOFF `ACTION_REQUIRED`.

---

## Recommended next action

Exactly **one** primary action. Optional secondary context may be listed but
must not compete as a second primary.

### Priority order (first match wins)

1. `OUTCOME_UNKNOWN` / safety `HOLD`
2. Blocking Human gate (HANDOFF `ACTION_REQUIRED` with confirmed evidence)
3. Failed automation requiring Human review (`FAILED`)
4. Stale maintenance **not** already covered by active automation / open Draft
5. Draft PR review (or Ready PR merge decision)
6. `NO_ACTION`

### Primary action shape

```json
{
  "code": "REVIEW_DRAFT_PR",
  "status": "ACTION_REQUIRED",
  "gateKind": "HumanActionRequired",
  "summary": "Review Draft refresh PR #N",
  "authorizesMutation": false,
  "targets": { "pullRequest": 30 }
}
```

`authorizesMutation` is **always false** in STATUS-OVERLAY-V1.
`recommendedNextAction` ≠ authorization.

### Selected action codes (stable)

| Code | Typical gateKind |
|---|---|
| `RESOLVE_OUTCOME_UNKNOWN` | `HumanActionRequired` |
| `RESOLVE_HOLD` | `HumanActionRequired` |
| `HANDOFF_ACTION_REQUIRED` | `HumanActionRequired` |
| `REVIEW_FAILED_AUTOMATION` | `HumanActionRequired` |
| `MAINTAIN_STALE_SNAPSHOT` | `SystemMaintenanceRequired` |
| `REVIEW_DRAFT_PR` | `HumanActionRequired` |
| `DECIDE_MERGE_READY_PR` | `HumanActionRequired` |
| `NO_ACTION` | `NoAction` |
| `UNKNOWN` | `Unknown` |

---

## Open PR projection

For each relevant open PR:

| Field | Notes |
|---|---|
| `number` | required |
| `title` | required |
| `draft` | boolean from live GitHub |
| `mergeable` | live value or `UNKNOWN` |
| `head` / `base` | SHAs / refs |
| `reviewState` | live or `UNKNOWN` — never invent |
| `ciState` | live or `UNKNOWN` — never invent PASS |
| `classification` | e.g. `REFRESH_DRAFT`, `DESIGN`, `OTHER` |
| `humanAction` | `REVIEW_DRAFT` \| `DECIDE_MERGE` \| `NONE` \| `UNKNOWN` |

---

## Snapshot projection

| Field | Notes |
|---|---|
| `generatedFrom` | Snapshot source commit |
| `currentMain` | Live main tip |
| `stale` | boolean \| null |
| `staleClassification` | HANDOFF classification tokens |
| `architectureRelevantChanges` | path list from live/git range |
| `autoRefreshCoverage` | `COVERED_BY_DRAFT` \| `COVERED_BY_ENABLED_AUTOMATION_IDLE` \| `NOT_COVERED` \| `UNKNOWN` |

If AUTO-REFRESH already created a Draft for the stale state, overlay must show
that coverage and recommend Draft review — **not** a second refresh.

---

## AUTO-REFRESH projection

| Field | Notes |
|---|---|
| `enabled` | boolean |
| `trigger` | e.g. `push_main+workflow_dispatch` |
| `lastRunId` | string \| null |
| `lastRunConclusion` | live Actions conclusion or `UNKNOWN` |
| `lastEvaluation` | e.g. `NOT_REQUIRED` / `ELIGIBLE` / `UNKNOWN` |
| `lastPublicationOutcome` | e.g. `NO_PUBLICATION` / `DRAFT_CREATED` |
| `activeRefreshPr` | number \| null from **live** open PRs |

Last successful run is insufficient if `main` changed afterward — callers must
supply current main and re-derive freshness.

---

## HISTORY projection

Until a writer exists:

```json
{
  "status": "DESIGNED_NOT_IMPLEMENTED",
  "writerImplemented": false,
  "lastEvent": null,
  "lastConvergedAt": null,
  "refreshLifecycleSummary": null
}
```

Later (out of scope for this slice), overlay may include last event /
convergence summary. HISTORY remains append-only past evidence; overlay remains
replaceable current projection.

---

## Unknown semantics

Missing evidence stays explicit:

- `ciState = UNKNOWN`
- `reviewState = UNKNOWN`
- `workflowOutcome = UNKNOWN`

Never convert unavailable evidence into `PASS`, `READY`, or `NO_ACTION` when
the decision depends on that evidence.

---

## Machine-readable schema

```json
{
  "schemaVersion": "STATUS-OVERLAY-V1",
  "repository": "yasutakesougo/ai-development-control-center",
  "observedAt": "2026-08-12T00:00:00.000Z",
  "main": { "sha": "…" },
  "snapshot": {},
  "handoff": {},
  "autoRefresh": {},
  "history": {
    "status": "DESIGNED_NOT_IMPLEMENTED",
    "writerImplemented": false
  },
  "pullRequests": [],
  "humanGates": [],
  "holds": [],
  "unknowns": [],
  "recommendedNextAction": {
    "code": "NO_ACTION",
    "status": "NO_ACTION",
    "gateKind": "NoAction",
    "summary": "No repository action required",
    "authorizesMutation": false
  }
}
```

Runtime generation is implemented as a pure function:

```ts
generateStatusOverlay(input) → StatusOverlayDocument
```

The generator accepts already-observed inputs, preserves caller-supplied
`observedAt` exactly, and reuses contract helpers for coverage / gates /
next-action selection. It does **not** observe GitHub, write files, or
create timestamps.

---

## Human-readable rendering

Compact sections (UI projection):

```
CURRENT
GATE
NEXT
AUTOMATION
HOLDS
UNKNOWNS
PRS
```

Pure view-model: `buildStatusOverlayViewModel(document)`  
Deterministic Markdown: `renderStatusOverlayMarkdown(document)`  
React panel: `<StatusOverlayPanel document={document} />`

No decorative metric strips. No write buttons. `authorizesMutation` remains
false and is shown explicitly.

---

## Relationship to HANDOFF

- HANDOFF owns handoff-specific classification and `nextAction` rules.
- Overlay **consumes** HANDOFF output; it does **not** redefine HANDOFF rules.
- `overlay ≠ handoff evaluator`

---

## Relationship to HISTORY

| HISTORY-V1 | STATUS-OVERLAY-V1 |
|---|---|
| Append-only past evidence | Replaceable current projection |
| What happened | What is true now |
| Must not override live state | Derives current state from live evidence |

---

## Relationship to Action Gateway

- Overlay never executes actions.
- It may later supply **input** to Action Gateway.
- `recommendedNextAction` ≠ authorization.
- No mutation is authorized merely because overlay recommends it.

---

## Storage / runtime

- Pure in-memory generator: `generateStatusOverlay`.
- No new Cloudflare / SharePoint persistence.
- No production repository-file writer for overlay artifacts in this slice.
- Future optional emit path (not implemented): e.g. `docs/status/status-overlay.json`
  generated on demand (replaceable), never treated as authorization.

---

## Known unknowns

- Exact future wiring of workflow-run log parsing into overlay fields
- Whether overlay artifacts should be committed or ephemeral CI uploads
- Multi-PR priority when several Ready PRs exist (V1: lowest PR number among
  same priority class, documented in contract helper)

---

## Implementation status

| Item | Status |
|---|---|
| STATUS-OVERLAY-V1 | **DESIGNED** |
| Runtime generator | **IMPLEMENTED** (`statusOverlayGenerator.ts`) |
| GitHub / workflow observer | **IMPLEMENTED** (`statusOverlayGithubObserver.ts`, read-only) |
| Repository-file writer | **NOT IMPLEMENTED** |
| HISTORY writer | **NOT IMPLEMENTED** |
| UI | **IMPLEMENTED** (read-only view-model + panel) |
| Runtime wiring | **IMPLEMENTED** (`statusOverlayRuntime.ts` + `/api/status-overlay`) |
| Action Gateway binding | **NOT IMPLEMENTED** |
| Approval Ledger / Agent execution | **NOT IMPLEMENTED** |
