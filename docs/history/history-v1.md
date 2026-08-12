# HISTORY-V1

**Status: DESIGNED · NOT IMPLEMENTED · NO PERSISTENCE WRITER**

This document designs **HISTORY-V1**: an append-only, repository-native audit
of Architecture Snapshot maintenance and AUTO-REFRESH activity.

HISTORY-V1 is **audit/history only**. It is **not** an authorization mechanism.

Companion pure helpers (design contract only):
`src/domain/historyContract.ts`

---

## Objective

Reconstruct the lifecycle of Architecture Snapshots and refresh activity over
time, answering at least:

| Question | History field / event |
|---|---|
| Which main SHA a Snapshot represented | `snapshotGeneratedFrom` / `SNAPSHOT_GENERATED` |
| When it became stale | `occurredAt` on `SNAPSHOT_BECAME_STALE` |
| Why it became stale | `reason` + `architectureRelevantPaths` |
| Which refresh identity was evaluated | `refreshIdentity` |
| Whether refresh was required | `REFRESH_ELIGIBLE` vs `REFRESH_NOT_REQUIRED` |
| Whether a Draft PR was created | `REFRESH_DRAFT_CREATED` + `draftPr` |
| Which PR updated the Snapshot | `draftPr` / `REFRESH_MERGED` |
| Which commit merged that refresh | `mergeCommit` |
| Whether the lifecycle converged | `LIFECYCLE_CONVERGED` |
| Whether a step ended HOLD / UNKNOWN / OUTCOME_UNKNOWN | terminal event types + `evidenceConfidence` |

---

## Scope

HISTORY-V1 covers **Architecture Snapshot maintenance** only.

### Included event types

```
SNAPSHOT_GENERATED
SNAPSHOT_BECAME_STALE
REFRESH_EVALUATED
REFRESH_NOT_REQUIRED
REFRESH_ELIGIBLE
REFRESH_DRAFT_CREATED
REFRESH_REUSED_EXISTING
REFRESH_ABORTED_MAIN_MOVED
REFRESH_FAILED
REFRESH_OUTCOME_UNKNOWN
REFRESH_MERGED
LIFECYCLE_CONVERGED
HISTORY_CORRECTION
```

`HISTORY_CORRECTION` is the only allowed way to amend prior meaning: it appends
a new event that references `supersedesEventId`. Prior events are never rewritten.

### Explicitly out of scope

- Approval Ledger business decisions
- Ready / Merge automation authorization
- Action Gateway / Agent execution
- Cloudflare / SharePoint / SPFX mutations
- Full-repository archaeology beyond the bootstrap boundary

---

## Current state vs historical events

| Layer | Source of truth | Role |
|---|---|---|
| **Current state** | Live GitHub + git tip + current Snapshot | Classification for HANDOFF / AUTO-REFRESH **now** |
| **Historical events** | Append-only HISTORY store (designed) | What happened earlier |

**Live state always wins for current classification.**

Example:

- History says Draft PR #N was open
- GitHub now says #N is merged

→ Current classification uses GitHub live state (merged).  
→ History remains evidence of the earlier open observation.

HISTORY must never override live evidence when both are available.

---

## Append-only semantics

- No UPDATE of prior events
- No DELETE of prior events
- Corrections = new `HISTORY_CORRECTION` (or other typed event) with
  `supersedesEventId` pointing at the prior `eventId`
- Readers that need “effective” history apply the latest non-superseded event
  per logical key (see Idempotency)

### Event fields

| Field | Required | Notes |
|---|---|---|
| `eventId` | yes | Deterministic when possible (see below) |
| `schemaVersion` | yes | `"1.0"` |
| `eventType` | yes | From the set above |
| `repository` | yes | e.g. `yasutakesougo/ai-development-control-center` |
| `observedMain` | no | Main tip at observation / generation |
| `snapshotGeneratedFrom` | no | Snapshot source commit |
| `refreshIdentity` | no | AUTO-REFRESH identity string |
| `sourcePaths` | no | Observed changed paths |
| `architectureRelevantPaths` | no | Accepted relevance filter result |
| `status` | no | Terminal/maintenance status string |
| `reason` | no | Human-readable why |
| `draftPr` | no | `{ number, url?, headSha? }` |
| `prHead` | no | Feature-branch HEAD when Draft created |
| `mergeCommit` | no | Merge commit SHA on main |
| `workflowRunId` | no | GitHub Actions run id |
| `occurredAt` | yes | When the fact occurred (ISO-8601) |
| `recordedAt` | yes | When HISTORY recorded it (ISO-8601) |
| `supersedesEventId` | no | Prior event being corrected |
| `evidence` | yes | Trace references (not raw logs) |
| `evidenceConfidence` | yes | `CONFIRMED` \| `PARTIAL` \| `UNKNOWN` \| `OUTCOME_UNKNOWN` |

Not every optional field is populated for every event.

---

## Event identity / idempotency

Repeated observation of the **same fact** must not create duplicate entries.

### Deterministic `eventId` construction

```
history-v1::<repository>::<dedupeKey>
```

### Dedupe key preference (first match wins)

1. **Workflow run terminal event**  
   `workflowRunId=<id>::eventType=<TYPE>`  
   when `workflowRunId` is known

2. **Merged refresh**  
   `mergeCommit=<sha>::eventType=REFRESH_MERGED`  
   when `mergeCommit` is known

3. **Draft creation**  
   `draftPr=<number>::eventType=REFRESH_DRAFT_CREATED`  
   when Draft number is known

4. **Refresh identity + terminal status**  
   `refreshIdentity=<id>::eventType=<TYPE>::status=<status>`  
   for terminal evaluations without run/PR ids  
   (`REFRESH_NOT_REQUIRED`, `REFRESH_ELIGIBLE`, `REFRESH_FAILED`,
   `REFRESH_OUTCOME_UNKNOWN`, `REFRESH_ABORTED_MAIN_MOVED`,
   `REFRESH_REUSED_EXISTING`, `LIFECYCLE_CONVERGED`)

5. **Snapshot generation**  
   `snapshotGeneratedFrom=<sha>::eventType=SNAPSHOT_GENERATED`

6. **Corrections**  
   Always unique: include `supersedesEventId` + `recordedAt`  
   (corrections are never silently deduped against the superseded event)

Timestamps alone are **never** sufficient for uniqueness.

### Append behavior

Given candidate event `E` and existing store `S`:

- If `S` already contains `eventId === E.eventId` → **no-op** (reject duplicate)
- Else append `E`

This is a pure contract rule for a future writer. **No writer is implemented
in this design-only slice.**

---

## Evidence model

Each event carries `evidence`: small, traceable references.

Allowed examples:

- `commit:<sha>`
- `pr:<number>`
- `workflowRun:<id>`
- `snapshotGeneratedFrom:<sha>`
- `refreshIdentity:<id>`
- `path:<repo-relative-path>`

**Do not** store:

- large raw Actions logs
- secrets / tokens / auth headers
- Cloudflare secrets
- SharePoint payloads
- unnecessary actor PII beyond repository-visible GitHub usernames when needed

Prefer referencing GitHub URLs / SHAs / run IDs over embedding blobs.

---

## Unknown / partial evidence

| `evidenceConfidence` | Meaning |
|---|---|
| `CONFIRMED` | Direct repository/GitHub evidence for the claimed fact |
| `PARTIAL` | Some fields known; others unavailable |
| `UNKNOWN` | Observation incomplete; fail closed for claims |
| `OUTCOME_UNKNOWN` | Mutation/publication outcome ambiguous (mirrors AUTO-REFRESH) |

Rules:

- Unavailable evidence must **not** be upgraded to inferred success
- `OUTCOME_UNKNOWN` events must not authorize blind retry of publication
- Readers must preserve these classifications when projecting timelines

---

## Ordering

Canonical sort:

1. `occurredAt` ascending
2. `eventId` ascending (stable tie-break)

### Late-discovered events

When a fact is discovered after it occurred:

- `occurredAt` = actual occurrence time (best evidence)
- `recordedAt` = wall clock when HISTORY recorded it

Late events are inserted by `occurredAt` order, not by discovery order.

---

## Historical reconstruction

Group/filter by any of:

- `refreshIdentity`
- `snapshotGeneratedFrom`
- `draftPr.number`
- `workflowRunId`
- `mergeCommit`

Example lifecycle projection:

```
SNAPSHOT_GENERATED (generatedFrom=A)
→ SNAPSHOT_BECAME_STALE (main moved / relevant paths)
→ REFRESH_EVALUATED
→ REFRESH_ELIGIBLE | REFRESH_NOT_REQUIRED | …
→ REFRESH_DRAFT_CREATED | REFRESH_REUSED_EXISTING | REFRESH_ABORTED_MAIN_MOVED | …
→ REFRESH_MERGED (mergeCommit=M, Snapshot B)
→ LIFECYCLE_CONVERGED
```

Apply supersession: if event `C` has `supersedesEventId=P`, treat `P` as
superseded for “effective” projections while retaining `P` in the append-only
log.

---

## Relationship to HANDOFF

| Rule | Statement |
|---|---|
| Separation | HISTORY events ≠ HANDOFF `HumanAction` |
| Non-escalation | Presence of stale/refresh history **never** manufactures `ACTION_REQUIRED` |
| Live precedence | HANDOFF continues to use live GitHub + current Snapshot |

HISTORY-V1 does **not** change HANDOFF decision semantics.

---

## Relationship to AUTO-REFRESH

| Rule | Statement |
|---|---|
| Separation | HISTORY is observational/audit output only |
| Non-control | Refresh eligibility must not depend **solely** on HISTORY when live evidence exists |
| Future emission | A later implementation may *emit* HISTORY events from the persistent runner |
| No trigger change | HISTORY-V1 design does **not** alter workflow triggers or Draft-only guards |

---

## Storage design (proposed, not implemented)

Preferred path:

```
docs/history/architecture-history.jsonl
```

### Why JSONL

- Append-friendly (one event per line)
- Machine-readable
- Git-diff friendly
- Deterministic line order = canonical history order after sort-on-read if needed
- No external database
- No Cloudflare / SharePoint persistence

### Writer status

**NOT IMPLEMENTED** in this slice.

No production code may write `architecture-history.jsonl` until a separate
Human-authorized implementation PR lands.

Optional future companion (Human view) is out of scope for V1.

---

## Bootstrap boundary

HISTORY-V1 begins at **Persistent AUTO-REFRESH enablement completion**.

| Item | Value |
|---|---|
| Bootstrap event | Merge of enablement PR #28 |
| Bootstrap merge commit | `46fcbc3fe7d2c617fbad82a5585bb8313268574e` |
| Meaning | First main tip where push-to-main Persistent AUTO-REFRESH is ENABLED |

Older Architecture Snapshot / refresh activity remains **outside** HISTORY-V1
unless a later Human-authorized backfill slice explicitly imports it.

This design-only PR does **not** create bootstrap events on disk.

---

## Security / privacy

- No secrets, tokens, or auth headers
- No Cloudflare / SharePoint data
- GitHub usernames, commit SHAs, PR numbers, workflow run IDs are acceptable
  when already repository-visible

---

## Implementation status

| Item | State |
|---|---|
| Design document | this file |
| Pure contract helpers + tests | present |
| Persistence writer | **NOT IMPLEMENTED** |
| AUTO-REFRESH trigger change | **none** |
| Ready / Merge automation | **NOT ENABLED** |
| Approval Ledger integration | **NOT ENABLED** |
| Action Gateway / Agent execution | **NOT IMPLEMENTED** |

---

## Known unknowns

- Exact future wiring of runner → HISTORY emission (separate implementation PR)
- Whether a Human-readable history view is needed in V1.1
- Optional backfill of pre-bootstrap refresh PRs (#21–#27) — not authorized here
- Whether workflow artifact upload should complement JSONL references

---

## Forbidden capabilities (HISTORY-V1)

HISTORY-V1 must create **no** path to:

- Ready / Merge / auto-merge
- Approval Ledger writes
- Action Gateway / Agent execution
- Cloudflare / SharePoint / production deploy
- `severe-behavior-support-spfx` mutation
- rewriting or deleting prior history events
