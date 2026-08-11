# MVP-3-APPROVAL-LEDGER-CONTRACT-V1

Status:

```text
DESIGN ONLY
NOT IMPLEMENTED
PERSISTENCE = NOT AUTHORIZED
```

Baseline at drafting:

```text
main = 413cb3e283457363a9a74d1d4ab0f8e9f1e31392
MVP-3-APPROVAL-INTENT-UI-V1 = COMPLETE
```

This document defines the Approval Ledger contract only.
It does **not** authorize implementation of persistence, auth, identity,
backend mutation, GitHub write, Action Gateway, or Agent execution.

---

## 1. Purpose

Approval Ledger は、将来 Human の承認判断を **durable / auditable** に残すための契約候補です。

現在の Approval Intent UI（V1）は次に限定されています。

```text
LOCAL ONLY
EPHEMERAL
NOT SUBMITTED
NOT PERSISTED
NO EXTERNAL EFFECT
```

Ledger は Intent の置き換えではありません。

```text
Approval Intent  = 端末上の一時案（現行実装）
Approval Ledger  = 将来の永続記録契約（本ドキュメント）
Action Gateway   = さらに後続の実行ゲート（未認可）
```

---

## 2. Non-goals for this slice

本 slice（CONTRACT-V1）で実施してよいのは design/docs のみです。

実施しない / FORBIDDEN:

```text
persistence implementation
Cloudflare KV / D1 / Durable Objects / R2
localStorage / sessionStorage / IndexedDB / cookie persistence
authentication / authorization
approver identity binding
backend approval API (POST/PUT/PATCH/DELETE)
GitHub write / Ready / Merge / Comment
SharePoint mutation
Action Gateway
Cursor / Codex Agent execution
automatic approval
severe-behavior-support-spfx mutation
GITHUB_TOKEN scope change
Cloudflare secret / permission change
```

If any of the above appears required to proceed, STOP and return to Human gate.

---

## 3. Relationship to Approval Intent V1

| Concern | Approval Intent V1 (implemented) | Approval Ledger (contract only) |
| --- | --- | --- |
| Visibility | `ACTION_REQUIRED` + `CONFIRMED` only | Same precondition required before any future ledger write candidate |
| Choices | `APPROVE` / `REJECT` / `DEFER` | Same intent vocabulary |
| Storage | React memory only | Future durable store (NOT AUTHORIZED) |
| External effect | always `false` | Still must not imply GitHub/SharePoint/Agent effect by itself |
| Stale handling | fingerprint mismatch clears draft | Future write must refuse stale fingerprint |
| Reload | no restore | Future restore only after authorized persistence slice |

Invariant:

```text
Approval Intent draft ≠ Ledger record
Ledger record ≠ executed action
executed action requires a later authorized Action Gateway slice
```

---

## 4. Proposed ledger record shape (design)

TypeScript-shaped contract for future implementation. **Not wired to runtime.**

```ts
type ApprovalIntent = "APPROVE" | "REJECT" | "DEFER";

type ApprovalLedgerRecordV1 = {
  // Identity of the observed decision target (not an approver login yet)
  subject: {
    repository: string;
    sourceRefs: string[];
    evidenceFingerprint: string;
    observedAt: string;
    humanActionStatus: "ACTION_REQUIRED";
    evidenceState: "CONFIRMED";
  };

  // Local intent vocabulary reused from Approval Intent UI
  intent: ApprovalIntent;

  // Ledger metadata — future slice must define how these are obtained
  recordedAt: string; // ISO timestamp
  recordId: string;   // opaque id; generation strategy NOT AUTHORIZED yet

  // Explicit non-execution markers
  submissionState: "RECORDED"; // not "EXECUTED"
  externalEffect: false;

  // Approver identity is intentionally absent in V1 contract
  // approverId: FORBIDDEN in this contract version
};
```

Notes:

- `approverId` / auth subject は本契約に含めない（identity slice が別途必要）。
- `submissionState = "RECORDED"` は「実行済み」を意味しない。
- `externalEffect` は常に `false` を契約する。実行は Action Gateway 以降。

---

## 5. Preconditions (fail-closed)

将来の Ledger write candidate は、少なくとも次をすべて満たす場合にのみ検討できる。

```text
1. humanActionStatus === "ACTION_REQUIRED"
2. evidenceState === "CONFIRMED"
3. evidenceFingerprint matches current observation
4. intent ∈ { APPROVE, REJECT, DEFER }
5. authorized persistence + identity slices are COMPLETE
```

いずれか欠ける場合:

```text
refuse write
do not invent approver
do not fall back to stale Intent draft
do not escalate to GitHub / SharePoint / Agent effects
```

Insufficient / contradictory / ERROR evidence:

```text
Ledger write = forbidden
```

---

## 6. Stale / replay protection (contract)

Future ledger write MUST reject when:

```text
- action.status changed
- sourceRefs changed
- observed evidence changed
- observedAt / fingerprint changed
- Intent draft fingerprint ≠ current observation fingerprint
```

Replay of an old Intent draft after observation change is forbidden.

---

## 7. Explicit non-effects

Even after a future Ledger record exists, the following remain unauthorized unless a later slice explicitly authorizes them:

```text
GitHub Ready = 0
GitHub Merge = 0
GitHub Comment / Review / Issue write = 0
SharePoint write = 0
Action Gateway invoke = 0
Agent execution = 0
automatic approval = 0
```

Wording rule for any future UI:

```text
allowed: 「記録案」「Ledger 未実装」「NOT EXECUTED」
forbidden: 「承認されました」「反映しました」「完了しました」（execution implication）
```

---

## 8. Storage decision = HOLD

Storage technology is **not chosen** in CONTRACT-V1.

Candidates remain undecided on purpose:

```text
KV / D1 / Durable Objects / R2 / external store
```

Choosing a store implies persistence Implementation Start, which is NOT AUTHORIZED here.

---

## 9. Auth / identity decision = HOLD

```text
authenticated approver identity = NOT AUTHORIZED
login / authorization framework = NOT AUTHORIZED
multi-user approval = NOT AUTHORIZED
```

Ledger without identity is incomplete for audit-grade use.
This contract records that gap instead of inventing an identity model.

---

## 10. Suggested future slice sequence (not authorized)

```text
A. MVP-3-APPROVAL-LEDGER-CONTRACT-V1   ← this document (design-only)
B. MVP-3-APPROVAL-LEDGER-IDENTITY-V1  (auth/approver model) — NOT AUTHORIZED
C. MVP-3-APPROVAL-LEDGER-PERSIST-V1   (durable write/read) — NOT AUTHORIZED
D. MVP-4 Action Gateway               (execution) — NOT AUTHORIZED
E. MVP-5 Approved GitHub write        — NOT AUTHORIZED
```

No slice after A starts without a separate Human GO.

---

## 11. Acceptance for this design slice

This CONTRACT-V1 slice is accepted when:

```text
- design document exists in-repo
- README Future phases points to Ledger contract design
- no runtime persistence/API/auth/write capability added
- npm run verify remains PASS on docs-only change
- Draft PR reviewed by Human
```

Out of acceptance:

```text
any working ledger storage
any backend mutation endpoint
any GitHub/SharePoint/Agent effect
```

---

## 12. Current capability board

```text
Approval Intent UI        = IMPLEMENTED (local ephemeral)
Approval Ledger contract  = DESIGN ONLY (this doc)
Approval Ledger persist   = 0
Approver identity         = 0
Backend approval API      = 0
GitHub write              = 0
SharePoint mutation       = 0
Action Gateway            = 0
Agent execution           = 0
real approval execution   = NOT AUTHORIZED
```
