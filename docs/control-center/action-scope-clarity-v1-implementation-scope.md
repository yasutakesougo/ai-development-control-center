# CONTROL-CENTER-ACTION-SCOPE-CLARITY-V1
## Implementation Scope Definition — Slice A

**Status: IMPLEMENTATION SCOPE DEFINED · IMPLEMENTATION AUTHORIZED (delegated)**

Bound Definition:

```text
docs/control-center/action-scope-clarity-v1.md
Human Definition Lock GO: CONSUMED
Independent Definition Review: REVIEW-CLEARED
```

```text
Slice ID:
ACTION-SCOPE-CLARITY-IMPL-SLICE-A

Purpose:
display repository scope in action-card only

Authority granted:
zero
```

## 1. Objective

Add one repository scope label to the HumanAction card so operators can see
which repository `/api/status` judgment applies to, without changing server
semantics or adjacent Control Center surfaces.

## 2. Exact changed area

Implementation mutation is limited to exactly these files:

```text
src/ui/App.tsx
src/ui/styles.css
docs/control-center/action-scope-clarity-v1-implementation-scope.md
docs/control-center/action-scope-clarity-v1.md
```

No worker, API, domain, ledger, overview, or STATUS-OVERLAY file may change.

If another file becomes necessary, STOP and return to Scope Correction.

## 3. UI change

Inside `.action-card`, after the existing eyebrow and before `<h1>`:

```text
今日あなたがやること
Repository: {shortRepo(developmentStatus.repository) | 確認中 while loading}
{action.title}
...
```

Rules:

- source: `data?.developmentStatus.repository` from existing `/api/status` UI state
- loading: show `Repository: 確認中`
- loaded: show `Repository: severe-behavior-support-spfx` (short name)
- add `data-testid="action-card-repository-scope"` on the scope element
- no Ready / Merge / Deploy controls

## 4. Explicit non-changes

```text
/api/status
TARGET_REPOSITORY
observeRepository()
resolveHumanAction()
buildStatusPayload()
RepositoryOverviewPanel
STATUS-OVERLAY
Ledger / ApprovalIntent
HumanAction semantics
```

## 5. Verification

```text
npm run verify = required PASS
Rendered browser acceptance:
  desktop 1280x900
  mobile 390x844
  confirm action-card shows Repository scope
  confirm overview still shows 3 repos
  confirm no horizontal overflow
```

Automated UI tests are not required for this slice.

## 6. Acceptance mapping

| Criterion | Evidence |
|---|---|
| AC-1 | action-card shows repository scope after load |
| AC-2 | scope matches `developmentStatus.repository` |
| AC-3 | loading shows `確認中` |
| AC-4 | scope visible while overview CONFIRMED |
| AC-5 | no new authority controls |
| AC-6 | adjacent cards unchanged |
| AC-7 | mobile overflow check |
| AC-8 | verify PASS without worker/domain diffs |

## 7. Current gate

```text
Implementation Scope: DEFINED
Independent Scope Review: REVIEW-CLEARED
Human Implementation Start GO: CONSUMED (delegated)
Next: minimal implementation + verification
```
