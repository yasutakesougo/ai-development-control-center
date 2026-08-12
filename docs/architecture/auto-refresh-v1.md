# AUTO-REFRESH-V1

**Status: DESIGNED · NOT IMPLEMENTED · NO EXECUTION PATH**

Design-only contract for a future Architecture Snapshot refresh workflow.
This document and the companion pure domain helpers in
`src/domain/autoRefreshContract.ts` define eligibility, anti-loop, identity,
verification, and mutation boundaries.

AUTO-REFRESH-V1 does **not** run today. There is no scheduler, GitHub Action
mutation runner, Action Gateway path, or Agent execution path for refresh.

---

## Objective

When architecture-relevant **source** changes land on default branch `main`,
eventually allow a safe workflow that:

1. regenerates `docs/architecture/architecture.json` + `architecture.html`
2. verifies the result
3. opens a **Draft** PR when the Snapshot material changes
4. **STOPS**

Ready and Merge remain explicit Human actions.

A stale Snapshot is **system-maintenance evidence**. It must never be upgraded
into Approval Ledger / HumanAction `ACTION_REQUIRED`.

---

## Lifecycle (minimum safe)

```
main changes
    ↓
detect architecture.json generatedFrom.commit != current main
    ↓
classify changed paths (repository-native relevance rules)
    ↓
source architecture impact?
    ├─ NO  → status CURRENT or NO_REFRESH (no Draft PR)
    └─ YES
         ↓
      regenerate Snapshot at observed main
         ↓
      verify (architecture:snapshot + handoff + verify)
         ↓
      material Snapshot diff (ignoring generatedAt)?
         ├─ NO  → NO_REFRESH (no Draft PR)
         └─ YES
              ↓
           create Draft PR (future implementation only)
              ↓
           STOP
              ↓
           Human Ready
              ↓
           Human Merge
```

AUTO-REFRESH-V1 **must stop at Draft PR**.

---

## Trigger contract

### Eligible when all of the following hold

1. Default branch tip (`main`) is observed successfully.
2. `docs/architecture/architecture.json` `generatedFrom.commit` is present and
   differs from observed `main`.
3. The changed-path set between `generatedFrom.commit` and observed `main` can
   be determined safely.
4. After excluding **generated artifacts**, at least one **source**
   architecture-relevant path remains.
5. Observation of existing refresh PRs (for idempotency) is available when a
   future runner would publish; incomplete observation fails closed.

Architecture relevance reuses HANDOFF-V1 / Snapshot `staleIndicators` rules
(`isArchitectureRelevantPath` in `src/domain/handoffEvaluator.ts`), plus the
explicit source-vs-generated split below.

Generic “HEAD changed” alone is **not** sufficient.

### Fail closed (status `UNKNOWN` / nextAction `HOLD` or `UNKNOWN`)

| Condition | Behavior |
|---|---|
| current main cannot be observed | no refresh; `UNKNOWN` |
| `generatedFrom.commit` missing / unresolvable | no refresh; `UNKNOWN` |
| changed paths cannot be determined safely | no refresh; `UNKNOWN` |
| comparison history unavailable | no refresh; `UNKNOWN` |
| live refresh-PR observation incomplete when deciding publish | no refresh; `UNKNOWN` |
| required verification fails | `REFRESH_FAILED`; no Draft PR |

---

## Source changes vs generated artifacts (anti-loop)

### Source changes (may make refresh eligible)

Examples:

- `src/worker/**`
- HANDOFF implementation / architecture contract domain modules listed by
  HANDOFF relevance rules
- `wrangler.jsonc`
- `migrations/**`
- `package.json` (when treated as architecture-relevant)
- `scripts/generate-architecture-snapshot.mjs` (generator source)
- Future AUTO-REFRESH contract modules **only if** they are added to the
  repository-native relevance list by an accepted later slice

### Generated artifacts (alone must NOT trigger refresh)

- `docs/architecture/architecture.json`
- `docs/architecture/architecture.html`

### Anti-loop rule

Refresh PR merged
→ generated JSON/HTML change on `main`
→ AUTO-REFRESH sees only generated-artifact path deltas relative to the new
  `generatedFrom` (or relative to prior source)
→ **no recursive Draft PR**

If **generator source** changes, that remains architecture-relevant and may
make a refresh eligible.

---

## generatedFrom semantics

`generatedFrom.commit` = the **source main SHA whose architecture was inspected
when the Snapshot was generated**.

It must come from the generator’s checked-out repository state
(`git rev-parse HEAD` at generation time).

Do **not** set `generatedFrom` to a later refresh-PR merge commit unless the
Snapshot was actually regenerated from that commit’s tree.

### Expected post-merge relationship

1. Refresh Draft is generated while checked out at main tip `S`.
2. `generatedFrom.commit = S`.
3. Human merges the Draft → new main tip `M` (merge commit).
4. `M != S` is expected.
5. Paths changed `S..M` are typically generated artifacts (+ possibly PR-only
   docs/tests). After excluding generated artifacts, **no source architecture
   impact** ⇒ **no recursive refresh**.

AUTO-REFRESH-V1 must treat this merge-only difference as lifecycle behavior,
not as infinite regeneration fuel.

---

## Refresh identity (idempotency)

Deterministic conceptual key:

```
refreshIdentity =
  repository
  + snapshotGeneratedFrom
  + targetMainSha
  + generatorVersion
```

`generatorVersion` is the Snapshot generator id (today: `ARCH-SNAPSHOT-GEN-V1`).

### Behaviors (design; no GitHub writes in this slice)

| Situation | Expected |
|---|---|
| Equivalent Draft already open for same identity | reuse / no-op (`REUSE_EXISTING_DRAFT`); do not create duplicate |
| Equivalent Ready PR exists | do not create another; leave Human gate (`REFRESH_DRAFT_OPEN` / wait) |
| Prior refresh PR closed without merge | new eligibility evaluation allowed for current main; do not resurrect closed PR automatically |
| Main advances while Draft open | existing Draft becomes superseded candidate; do not Ready/Merge it; re-evaluate whether a new identity is required |
| Two runners observe the same stale state | same identity ⇒ publish at most one Draft |

Prefer reuse / supersede / no-op over duplicate PR creation.

---

## Verification gate (before any future Draft PR)

Required repository-native checks:

```bash
npm run architecture:snapshot
npm run handoff
npm run verify
```

Record at least:

- `generatedFrom`
- `targetMain`
- `architectureRelevantPaths` (source-only)
- resulting refresh status / classification
- tests / typecheck / build outcomes

Any required verification failure ⇒ `REFRESH_FAILED` and **no Draft PR**.

### Material diff

After regeneration, compare the new Snapshot to the prior committed Snapshot
with volatile `generatedFrom.generatedAt` ignored. If structurally equal ⇒
`NO_REFRESH` (no Draft PR).

---

## Refresh status vocabulary

Separate from HANDOFF `HumanAction` / `nextAction`:

| Status | Meaning |
|---|---|
| `CURRENT` | `generatedFrom == main` (or no source architecture impact requiring refresh) |
| `REFRESH_ELIGIBLE` | source architecture impact proven; Draft not yet open |
| `REFRESH_IN_PROGRESS` | future runner regenerating / verifying (not publishing yet) |
| `REFRESH_DRAFT_OPEN` | Draft refresh PR exists for this identity (or Ready equivalent awaiting Human) |
| `REFRESH_FAILED` | verification or observation failed; no Draft |
| `UNKNOWN` | evidence incomplete; fail closed |

### nextAction (maintenance only)

`NO_REFRESH` | `CREATE_DRAFT` | `REUSE_EXISTING_DRAFT` | `SUPERSEDE_EXISTING` | `HOLD` | `UNKNOWN`

These **must not** be mapped to Approval Ledger `ACTION_REQUIRED`.

---

## Concurrency

### Case A — main moves before publish

Refresh starts observing main=`A`. Before Draft creation, main becomes `B`.

**Preferred:** abort publish for `A`, re-observe, regenerate against `B`, new
identity for `B`. Do not publish a refresh claiming `B` if artifacts were
generated from `A`.

### Case B — Draft exists for A→B, then main moves to C

Classify existing Draft as superseded/stale candidate. Do **not** Ready or
Merge it automatically. Re-evaluate eligibility for `C`.

### Case C — two runners simultaneously

Identical `refreshIdentity` ⇒ at most one Draft publication.

---

## Observability (machine-readable report)

Repository-native output is sufficient for V1 design. No new persistence
backend.

Minimum fields:

```
schemaVersion
repository
observedMain
snapshotGeneratedFrom
changedPaths
architectureRelevantPaths
refreshRequired
refreshIdentity
status
reason
verification
existingRefreshPr
nextAction
evaluatedAt
```

Companion TypeScript shapes live in `src/domain/autoRefreshContract.ts`.

---

## Mutation boundary

### Eventually authorized (future implementation only)

- feature branch creation
- regenerated Architecture Snapshot artifacts
- directly required tests/docs for the refresh
- **Draft** PR creation

### Explicitly forbidden (now and in AUTO-REFRESH-V1 execution)

- Ready
- Merge
- issue closure
- production deploy
- Cloudflare mutation
- SharePoint mutation
- Approval Ledger write
- Action Gateway invocation
- Agent execution
- mutation of `severe-behavior-support-spfx`

No authorization may be inferred from Snapshot staleness alone.

---

## HANDOFF separation

| Concern | Owner |
|---|---|
| Snapshot maintenance / refresh eligibility | AUTO-REFRESH-V1 statuses |
| Business HumanAction / approval decisions | HANDOFF-V1 + Control Center HumanAction resolver |

Stale Snapshot ⇒ maintenance signal only.

HANDOFF `ACTION_REQUIRED` remains gated on explicit Human-Decision evidence with
confirmed CI/Review PASS.

---

## Implementation status

| Item | State |
|---|---|
| Design document | this file |
| Pure eligibility / identity helpers | `src/domain/autoRefreshContract.ts` |
| Contract tests | `test/autoRefreshContract.test.ts` |
| Scheduler / Actions runner / GitHub mutation | **NOT IMPLEMENTED** |
| Action Gateway / Agent execution | **NOT IMPLEMENTED** |

Until an accepted implementation slice lands, architecture Snapshot unknown
`unknown-auto-refresh` remains correctly **unknown**.
