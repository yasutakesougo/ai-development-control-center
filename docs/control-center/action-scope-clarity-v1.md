# CONTROL-CENTER-ACTION-SCOPE-CLARITY-V1

## Phase

Definition

## Status

DEFINITION REVIEW-CLEARED · LOCKED

## Baseline

Observed `main` at Definition start:

```text
2aa4b4074749883421e7601957296f8320c5f41c
```

Post-merge context:

```text
Issue #126 MULTI-REPOSITORY-OVERVIEW-V1 = CLOSED / COMPLETED
PR #127 = MERGED / CLOSED
Post-Merge Screen Value Check @ 2aa4b40 = PASS
```

Current Control Center layout after #127:

```text
action-card          ← HumanAction from /api/status
RepositoryOverviewPanel ← PUBLIC fleet overview (3 repos)
status-card          ← developmentStatus from /api/status
STATUS-OVERLAY       ← separate read-only projection
Ledger / Approval UI ← unchanged authority surface
```

Current `/api/status` behavior:

```text
GET /api/status
→ TARGET_REPOSITORY = yasutakesougo/severe-behavior-support-spfx
→ observeRepository(TARGET_REPOSITORY)
→ resolveHumanAction(facts)
→ buildStatusPayload(facts, action)
```

The action-card currently renders only:

```text
今日あなたがやること
{action.title}
{action.instruction}
{action.reason}
```

The repository identity is available in the same payload as
`developmentStatus.repository`, but it appears only in the lower
`Development Status` card. The action-card itself does not state which
repository the HumanAction applies to.

## Problem

After #127, the Control Center can simultaneously show:

```text
action-card: UNKNOWN / 判定できません
overview: 3 repositories CONFIRMED
```

This is technically consistent because the cards observe different
repository scopes. For a human operator, however, the top card reads like a
Control Center-wide judgment failure rather than a single-repository
`/api/status` result.

This slice addresses **scope misread**, not HumanAction correctness.

## Objective

Make the HumanAction card's repository scope explicit so an operator can tell
at a glance which repository the top action judgment applies to.

This is a display-scope clarification only. It must not change what the
Control Center decides, authorizes, or observes.

## Must establish

- action-card repository scope is explicit in the UI
- repository label comes from the same `/api/status` evidence already loaded
  by the UI (`developmentStatus.repository`)
- repository scope display grants no authority
- HumanAction semantics remain unchanged
- UNKNOWN / ERROR semantics remain unchanged
- multi-repository overview semantics remain unchanged

## Preferred UI

Primary recommendation:

```text
今日あなたがやること
Repository: severe-behavior-support-spfx
{action.title}
{action.instruction}
{action.reason}
```

Alternative acceptable form:

```text
severe-behavior-support-spfx であなたがやること
{action.title}
{action.instruction}
{action.reason}
```

Implementation Scope should prefer the `Repository:` line because it keeps
action judgment and target repository visually separate and remains stable if
the HumanAction target repository changes later.

Display rules:

- show the short repository name by default (`owner/name` → repo slug), matching
  existing `shortRepo()` presentation elsewhere in `App.tsx`
- when `/api/status` has not yet loaded, show a neutral loading label such as
  `確認中`; do not invent a repository name
- when `/api/status` fails closed to fallback payload, show the fallback
  repository identity already returned by the server/UI fallback path
- the scope label must not imply fleet-wide authority, Ready, Merge, Deploy,
  or multi-repository execution

## Explicitly unchanged

```text
/api/status route behavior
TARGET_REPOSITORY selection
observeRepository()
resolveHumanAction()
buildStatusPayload()
HumanAction resolver semantics
Ledger submission / ApprovalIntent semantics
STATUS-OVERLAY contract and rendering
RepositoryOverviewPanel / fleet overview API
repository switching in overview detail
private repository access
Ready / Merge / Deploy authority
multi-repository authorization
GitHub mutation
```

## Relationship to adjacent surfaces

```text
action-card scope label
= HumanAction target repository only

RepositoryOverviewPanel
= separate PUBLIC fleet overview (#126)

Development Status card
= same /api/status payload, lower on page

STATUS-OVERLAY
= separate read-only projection
```

The scope label must not collapse these surfaces into one authority domain.

## Safety invariants

- [ ] S1. Display-only change; no new server authority.
- [ ] S2. Repository label is sourced from existing `/api/status` UI state only.
- [ ] S3. No new API route, env var, or repository selector.
- [ ] S4. No change to HumanAction status/title/instruction/reason semantics.
- [ ] S5. No change to UNKNOWN / ERROR / ACTION_REQUIRED meaning.
- [ ] S6. No change to multi-repository overview behavior.
- [ ] S7. No Ready / Merge / Deploy controls added.
- [ ] S8. No private repository metadata exposure beyond current `/api/status`.
- [ ] S9. Scope label cannot be mistaken for fleet-wide Control Center state.
- [ ] S10. Ledger / ApprovalIntent authority remains bound to existing semantics.

## Acceptance criteria

- [ ] AC-1. After `/api/status` loads, the action-card shows which repository
  the HumanAction applies to.
- [ ] AC-2. The displayed repository matches
  `developmentStatus.repository` from the same loaded status payload.
- [ ] AC-3. While status is loading, the action-card shows a neutral loading
  scope state and does not invent repository identity.
- [ ] AC-4. When overview repositories are CONFIRMED and action-card status
  is UNKNOWN/ERROR, an operator can still tell the action judgment is scoped
  to the single `/api/status` repository rather than the whole Control Center.
- [ ] AC-5. No new Ready / Merge / Deploy UI appears in the action-card.
- [ ] AC-6. Existing Development Status, overview, STATUS-OVERLAY, and Ledger
  sections remain present and semantically unchanged.
- [ ] AC-7. Mobile layout remains usable without horizontal overflow introduced
  by the scope label.
- [ ] AC-8. Focused verification proves no change to `/api/status` payload shape
  or HumanAction resolver behavior.

## Out of scope

```text
changing HumanAction logic
changing /api/status observation
changing TARGET_REPOSITORY
adding repository switching to HumanAction
generalizing HumanAction to multi-repository authority
private repository overview
Repository Registry (#72)
STATUS-OVERLAY changes
multi-repo execution / scheduling
Deploy
Ready / Merge automation
design polish beyond scope clarity
```

## Proposed implementation sequence — NOT YET AUTHORIZED

After Definition review and explicit Human Implementation Start GO:

```text
Slice A — action-card repository scope label in App.tsx
Slice B — focused UI/regression verification
Slice C — rendered browser acceptance
```

Expected mutation surface:

```text
src/ui/App.tsx
src/ui/App.css or existing stylesheet (presentation only, if needed)
focused UI test(s) only if Implementation Scope authorizes them
```

Exact changed files must be locked in Implementation Scope Definition.

## Delivery gate

```text
Definition
→ Independent Definition Review
→ Human Definition Lock GO
→ Implementation Scope Definition
→ Independent Scope Review
→ Human Implementation Start GO
→ Minimal implementation
→ Focused Verification
→ Rendered Browser Acceptance
→ Exact Implementation HEAD Fixation
→ Independent Implementation Review
→ Human Ready GO
→ separate Human Merge GO
→ Post-Merge screen value check
```

## Independent Definition Review

```text
VERDICT = REVIEW-CLEARED
P0 = 0
P1 = 0
P2 = 0
```

| Finding | Disposition |
|---|---|
| Scope narrow enough for display-only UX fix | CLOSED |
| Repository label bound to existing `/api/status` UI state | CLOSED |
| No authority / semantics expansion | CLOSED |
| Preferred UI (`Repository:` line) explicit | CLOSED |
| Adjacent #127 overview boundary preserved | CLOSED |

Human Definition Lock GO: **CONSUMED** (delegated)

## Current gate

```text
CONTROL-CENTER-ACTION-SCOPE-CLARITY-V1: DEFINITION LOCKED
Implementation Scope: DEFINED
Human Implementation Start GO: CONSUMED (delegated)
/api/status change: NOT AUTHORIZED
HumanAction semantic change: NOT AUTHORIZED
Multi-repository authority expansion: NOT AUTHORIZED
Ready / Merge / Deploy: NOT AUTHORIZED

Next:
Minimal implementation + focused verification + rendered browser acceptance
```
