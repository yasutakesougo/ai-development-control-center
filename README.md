# AI Development Control Center

## Status

```text
MVP-3-APPROVAL-INTENT-UI-V1 COMPLETE
```

MVP-1 / MVP-2 の fail-closed 観測・Evidence 契約を維持したまま、
`HumanAction = ACTION_REQUIRED` のときだけローカルで Approval Intent（承認案 / 却下案 / 保留）を選べる
presentation-only UI まで到達した状態を固定します。

これは実際の承認ではありません。選択は端末上の一時案のみで、外部へ送信・保存されません。

現在の production は Open PR が 0 件のため `HumanAction = NO_ACTION`、`evidence = []` です。
Approval Intent UI は表示されません（`ACTION_REQUIRED + CONFIRMED` のときのみ）。

## Purpose

AI Development Control Center は、開発プロジェクトの状態を読み取り、Human が「今、自分が何をすればよいか」を短時間で判断するための独立した Web アプリです。

観測対象は `yasutakesougo/severe-behavior-support-spfx`（read-only）です。

このリポジトリは業務アプリ本体ではありません。

## Production

| Item | Value |
| --- | --- |
| Production URL | https://ai-development-control-center.momosantanuki.workers.dev |
| Status API | https://ai-development-control-center.momosantanuki.workers.dev/api/status |
| Observed repository | `yasutakesougo/severe-behavior-support-spfx` (read-only) |
| Cloudflare Version ID | `d13218f0-f2ef-4f79-803c-ab4e310d2bde` |
| Baseline main | `a0735568180c6cd956f66a186a3efedcef1fc4b0` |
| Closeout evidence | `evidenceState = CONFIRMED`, `openPrCount = 0`, `HumanAction = NO_ACTION`, `evidence = []` |

### Current production（MVP-3 Approval Intent UI V1 closeout）

```text
Production deploy: SUCCESS
Cloudflare Version ID: d13218f0-f2ef-4f79-803c-ab4e310d2bde
npm run verify: 39 / 39 PASS
PR #9: MERGED (MVP-3-APPROVAL-INTENT-UI-V1)
merged HEAD: 924a9d815e6a756249a6ab20903ef1fed260fd4e
deployed runtime baseline: a0735568180c6cd956f66a186a3efedcef1fc4b0

/api/status:
  evidenceState = CONFIRMED
  openPrCount = 0
  HumanAction = NO_ACTION
  evidence = []

severe-behavior-support-spfx mutation = 0
GitHub write capability = 0
backend mutation API = 0
persistence = 0
SharePoint mutation = 0
Agent execution = 0
real approval execution = NOT AUTHORIZED
Automatic approval = 0
Secret exposure = 0
```

### Historical MVP-2 closeout evidence（not current production）

MVP-2 closeout 時点の観測（Version `61d4b9f6…`、main `08d5d73…`、28 PASS）は historical record です。current production と誤読しないでください。

```text
[historical MVP-2]
Production deploy: SUCCESS
Cloudflare Version ID: 61d4b9f6-783e-455e-897f-0fb079a1732a
npm run verify: 28 / 28 PASS
PR #6 / #8: MERGED
main: 08d5d73cf0810d58273d1b1ab6628e716328dadb
evidenceState = CONFIRMED
HumanAction = NO_ACTION
evidence = []
```

### Historical MVP-1 closeout evidence（not current production）

MVP-1 closeout 時点の観測（当時 `HumanAction = UNKNOWN`、source PR #245）は historical record です。current production と誤読しないでください。

```text
[historical MVP-1]
evidenceState = CONFIRMED
HumanAction = UNKNOWN
sourceRefs = severe-behavior-support-spfx PR #245
Resolver tests: 17 PASS
```

## Architecture

```text
Browser
  ↓
Cloudflare Worker + Static Assets
  ↓ GET only
GitHub API
  ↓
Observed Facts (+ per-PR Evidence)
  ↓
Human Action Resolver
  ↓
Human Action
  ↓
Mobile-first UI
  └─ Approval Intent UI（ACTION_REQUIRED のみ、local draft）
```

Observed Facts と Human Action は分離しています。

Resolver は明示された規則だけを使います。

証拠不足、GitHub API 失敗、矛盾、未知の規則、Human Decision 不明、projection mismatch の場合は `UNKNOWN` を返します。

## EVIDENCE-TRACE-V1 contract

MVP-2 で確定した Evidence 契約です。

### Recognized Human-Decision markers only

厳密に次の行マーカーだけを認識します。

```text
Human-Decision: REQUIRED
Human-Decision: NONE
```

- exact marker 以外は推測しません
- free-form の `HUMAN-ONLY` 文言は `humanDecision = UNRESOLVED`（推測しない）
- `REQUIRED` と `NONE` が同時に存在する場合は `CONTRADICTORY`（action escalation しない）
- structured evidence と `humanDecisionRequired` の projection mismatch は `HumanAction = UNKNOWN`
- PR detail `body === null` は権威ある「本文なし」。stale list `summary.body` の marker を復活させない（false `ACTION_REQUIRED` 禁止）
- Observed PR evidence UI は各 PR の `sourceRefs` を表示し、一次 source へ追跡可能にする

### `/api/status` evidence array

Open PR ごとに次を露出します。

```text
evidence: Array<{
  pr
  draft
  ci
  review
  mergeState
  humanDecision
  humanDecisionSource
  sourceRefs
}>
```

Open PR が 0 件のときは `evidence = []` です。

## Approval Intent contract（MVP-3-APPROVAL-INTENT-UI-V1）

```text
Approval Intent =
  LOCAL ONLY
  EPHEMERAL
  NOT SUBMITTED
  NOT PERSISTED
  NO EXTERNAL EFFECT
```

### Visibility

Approval Intent UI は次のときのみ表示します。

```text
action.status === "ACTION_REQUIRED"
AND evidenceState === "CONFIRMED"
```

次の場合は controls を出しません。

```text
WAIT / NO_ACTION / UNKNOWN
ERROR / MISSING / CONTRADICTORY evidence
```

### Choices

```ts
type ApprovalIntent = "APPROVE" | "REJECT" | "DEFER";
```

UI 文言は実行済み承認と誤解させないため次とします。

```text
承認案
却下案
保留
```

選択後は明示的に次を表示します。

```text
LOCAL DRAFT
NOT SUBMITTED
外部システムには反映されていません
```

「承認されました」「完了しました」「反映しました」等の表現は使いません。

### Stale protection

local Approval Intent draft は React runtime memory のみです。

次の fingerprint が変化した場合、既存 draft を破棄します。

```text
action.status
sourceRefs
observed evidence
observedAt
```

ページ reload 後に intent を復元しません（localStorage / sessionStorage / IndexedDB / cookie = 0）。

Human が APPROVE を選んでも外部 effect は 0 です。

```text
GitHub Ready / Merge / Comment = 0
SharePoint write = 0
Action Gateway = 0
Cursor / Codex Agent = 0
Worker mutation request = 0
```

## Human Action contract

```ts
type HumanActionStatus =
  | "ACTION_REQUIRED"
  | "WAIT"
  | "NO_ACTION"
  | "UNKNOWN";
```

`ACTION_REQUIRED` は、必要な証拠が確認でき、かつ Human Decision が明示的に必要と判定できた場合だけ返します。

GitHub adapter では、PR 本文に次の明示マーカーがある場合だけ Human Decision を確定します。

```text
Human-Decision: REQUIRED
```

または、Human Decision 不要を明示する場合は次を使います。

```text
Human-Decision: NONE
```

マーカーがなく、別の一次情報から確定できない場合は推測せず `UNKNOWN` / `UNRESOLVED` とします。

## Local development

前提として Node.js と npm が必要です。

```bash
npm install
npm run dev
```

型チェック、unit test、build をまとめて実行する場合は次を使います。

```bash
npm run verify
```

production build のローカル preview は次です。

```bash
npm run preview
```

## Environment variables / Secrets

private repository の観測には、Worker 側の `GITHUB_TOKEN`（fine-grained PAT）が必要です。

ブラウザへ token は渡しません。

### GITHUB_TOKEN 権限境界（MVP-1 確定 / MVP-2・MVP-3 維持）

対象 repository は `yasutakesougo/severe-behavior-support-spfx` のみです。

必須権限:

```text
Contents          Read-only
Pull requests     Read-only
Commit statuses   Read-only
Metadata          Read-only（GitHub 側の基本権限）
```

不要 / 使用しない権限:

```text
Checks            不要（fine-grained PAT で UI 設定できない場合がある）
Issues            不要
Contents Write    禁止
Pull requests Write 禁止
classic `repo`    不要
```

運用境界:

```text
GitHub request method = GET only
GitHub write capability = 0
Merge / Ready / Comment = 0
SharePoint mutation = 0
Automatic approval = 0
backend approval API = 0
```

Checks 権限は必須ではありません。Check Runs API が取得できない場合、adapter は Commit Status だけで CI を判定し、確定不能なら `CI = UNKNOWN` とします。repository 全体を `ERROR` にはしません。

ローカル開発では `.dev.vars` を使用できます。

```text
GITHUB_TOKEN=...
```

`.dev.vars`、`.env`、PAT、Cloudflare credential は commit しません。

Cloudflare へ secret を登録する場合は、Human が認証済み端末で次を実行します。

```bash
npx wrangler secret put GITHUB_TOKEN
```

token の値をチャットへ貼り付ける必要はありません。

## Testing

Resolver / Evidence / Approval Intent / CI normalizer unit tests:

```text
npm test → 39 PASS
```

内訳:

- `humanDecisionEvidence.test.ts` — 5
- `humanActionResolver.test.ts` — 11
- `normalizeCi.test.ts` — 8
- `selectAuthoritativePullBody.test.ts` — 4
- `approvalIntent.test.ts` — 11

最低限、次を確認します。

- Human action required
- CI pending -> `WAIT`
- No human action -> `NO_ACTION`
- Missing evidence -> `UNKNOWN`
- GitHub API failure -> `UNKNOWN`
- Contradictory evidence -> `UNKNOWN`
- Unknown rule -> `UNKNOWN`
- Insufficient evidence が `ACTION_REQUIRED` へ昇格しないこと
- Empty commit status (`total_count = 0`) -> `CI = UNKNOWN`（FALSE_WAIT 防止）
- PR A=PENDING + PR B=UNKNOWN -> `UNKNOWN`（WAIT より UNKNOWN を優先）
- strict `Human-Decision` marker のみ認識
- free-form `HUMAN-ONLY` を推測しない
- REQUIRED + NONE contradiction -> `CONTRADICTORY` / no escalation
- projection mismatch -> `UNKNOWN`
- detail `body = null` + stale summary REQUIRED -> `UNRESOLVED` / no `ACTION_REQUIRED`
- detail body missing (`undefined`) のときのみ summary へ fallback
- Approval Intent UI: ACTION_REQUIRED only / WAIT・NO_ACTION・UNKNOWN forbidden
- APPROVE / REJECT / DEFER = local draft only / externalEffect = false
- evidence/action fingerprint change clears stale local intent

実行方法は次です。

```bash
npm test
```

## Deployment

`workers.dev` での試験公開を前提とします。

Cloudflare Vite plugin が Worker と React SPA の build をまとめます。

```bash
npm install
npm run verify
npm run deploy
```

`npm run deploy` で Cloudflare login、account 選択、権限確認などの Human 操作が必要になった場合は、その場で停止してください。

勝手に有料サービスを契約しない方針です。

独自ドメインは現時点では不要です。

## Security boundary

境界は次です。

```text
Browser
  GitHub credential = 0
  Approval Intent = local ephemeral draft only
      ↓
Worker
  GITHUB_TOKEN = Secret only
  GitHub request = GET only
  approval mutation API = 0
      ↓
yasutakesougo/severe-behavior-support-spfx
  mutation = 0
```

### Implemented

- non-operative Approval Intent UI（MVP-3-APPROVAL-INTENT-UI-V1）

### Still FORBIDDEN / NOT AUTHORIZED

- real approval execution
- Approval Ledger persistence
- approver identity
- authentication / authorization
- backend approval API
- GitHub write
- Issue / PR / comment write
- Merge / Ready 化
- SharePoint write / schema 変更
- Action Gateway
- Cursor Agent 起動
- Codex Agent 起動
- 自動承認
- automatic Ready / Merge

## Known behavior

### FALSE_WAIT fix

GitHub Combined Commit Status は、status が 0 件でも `state=pending` を返すことがあります。

これを `CI = PENDING` と解釈すると、実際には待っていないのに `HumanAction = WAIT` になる（FALSE_WAIT）ため、次を契約とします。

```text
Check Runs あり
  → Check Runs で CI 判定

Check Runs なし / 空
  + commit status total_count > 0
  → commit status state で CI 判定

total_count = 0 または確認不能
  → CI = UNKNOWN
```

Resolver は、PR 内に UNKNOWN evidence がある場合、PENDING による `WAIT` より先に `UNKNOWN` を返します。

`/api/status` が `WAIT` から `UNKNOWN` に変わる場合、この情報条件では正しい安全側判定です。

### Fail-closed paths

原因が異なっても、誤った `ACTION_REQUIRED` は出しません。

```text
認証失敗 / API failure → evidenceState=ERROR → HumanAction=UNKNOWN
証拠不足（Human Decision 未確定など）→ evidenceState=CONFIRMED でも HumanAction=UNKNOWN
contradiction / projection mismatch → HumanAction=UNKNOWN
PR detail body が明示的 null → stale list marker を使わず UNRESOLVED（false ACTION_REQUIRED 禁止）
```

### Approval Intent local draft

`ACTION_REQUIRED` 以外では Approval Intent controls を表示しません。

選択結果は external system に反映されません。

## Known limitations

Human Action を AI の自由推論では決定しません。

GitHub 上に Human Decision の一次情報が存在しても、現在の adapter がその形式を認識できなければ `UNKNOWN` / `UNRESOLVED` になります。

Review、CI、merge state は GitHub API で確認できた情報だけを正規化します。

取得不能な値を推測で補完しません。

Relevant Issue の高度な関連付けはまだ実装しません。

Approval Intent は実承認・永続化・実行ゲートではありません。

## MVP-3 closeout record

| # | Item | Result |
| --- | --- | --- |
| 1 | PR #9 merge + production deploy SUCCESS を記録 | DONE |
| 2 | Cloudflare Version ID（post-#9）を記録 | DONE |
| 3 | `/api/status` current production を記録 | DONE |
| 4 | 39 tests PASS を記録 | DONE |
| 5 | Approval Intent contract を README へ固定 | DONE |
| 6 | stale protection / LOCAL ONLY を記録 | DONE |
| 7 | security boundary（real approval = NOT AUTHORIZED）を更新 | DONE |
| 8 | Future phases を current state と整合 | DONE |
| 9 | MVP-3-APPROVAL-INTENT-UI-V1 COMPLETE を固定 | DONE |

### PR disposition

| PR | Title | Disposition |
| --- | --- | --- |
| #1 | chore: add package-lock.json after Step 10 local verification | closeout で `package-lock.json` を本線へ取り込み。Draft PR は close |
| #2 | chore: Cloudflare agent skills and MCP setup | MVP-1 runtime 非依存のため Draft のまま close（将来 tooling 候補） |
| #3 | Checks API soft-fail with Commit Status CI fallback | merged / closed（本番反映済み） |
| #4 | FALSE_WAIT fail-closed fix | merged / closed（本番反映済み） |
| #5 | docs: MVP-1 COMPLETE closeout | merged / closed |
| #6 | feat(mvp2): add fail-closed PR evidence trace | merged / closed（本番反映済み） |
| #7 | docs: MVP-2 EVIDENCE-TRACE-V1 closeout | merged / closed |
| #8 | fix(mvp2): post-merge P2 — stale marker + sourceRefs UI | merged / closed（本番反映済み） |
| #9 | feat(mvp3): add non-operative approval intent UI | merged / closed（本番反映済み） |

## MVP-2 closeout record（historical）

| # | Item | Result |
| --- | --- | --- |
| 1 | PR #6 merge + production deploy SUCCESS を記録 | DONE |
| 2 | PR #8 post-merge P2 fix merge + redeploy SUCCESS を記録 | DONE |
| 3 | Cloudflare Version ID（post-#8）を記録 | DONE |
| 4 | `/api/status` current production を記録 | DONE |
| 5 | 28 tests PASS を記録 | DONE |
| 6 | EVIDENCE-TRACE-V1 契約を README へ固定 | DONE |
| 7 | historical MVP-1 UNKNOWN（PR #245）を誤読防止表記へ更新 | DONE |
| 8 | `severe-behavior-support-spfx` mutation = 0 を維持 | DONE |
| 9 | MVP-2 EVIDENCE-TRACE-V1 COMPLETE を固定 | DONE |

## MVP-1 closeout record（historical）

| # | Item | Result |
| --- | --- | --- |
| 1 | production URL を README へ記録 | DONE |
| 2 | 17 tests PASS を記録 | DONE |
| 3 | GITHUB_TOKEN の権限境界を記録 | DONE |
| 4 | FALSE_WAIT 修正を Known behavior へ記録 | DONE |
| 5 | 当時 UNKNOWN になる理由を Known limitation へ記録 | DONE |
| 6 | PR #1 / #2 を整理 | DONE |
| 7 | MVP-1 COMPLETE を固定 | DONE |

## Future phases

```text
MVP-3 Approval Intent UI V1 = COMPLETE
MVP-3 Approval Ledger CONTRACT-V1 = DESIGN ONLY
MVP-3 Approval Ledger IDENTITY-V1 = DESIGN ONLY
MVP-3 Approval Ledger AUTH-VERIFY-V1 = CODE PRESENT (not production-activated)
```

Ledger 契約ドラフト:

```text
docs/mvp-3-approval-ledger-contract-v1.md
docs/mvp-3-approval-ledger-identity-v1.md
```

契約上の追加 invariant:

```text
stable decision fingerprint（observedAt は audit metadata。canonical から分離）
append-only ledger（UPDATE / DELETE 禁止。correction は新 record）
idempotencyKey 必須（retry duplicate 禁止）
authenticated human principal required for future Ledger write
principal identity = issuer + subjectId（subjectId alone is not globally stable）
browser-supplied approverId/email/displayName must not establish identity
JWT fail-closed validation required before any future privileged Ledger write
displayName/email persistence NOT REQUIRED until PII retention is resolved
authenticated ≠ authorized to write Ledger
fingerprint canonicalization / idempotency / authorization allowlist = NOT AUTHORIZED
```

ただし:

```text
Ledger persistence Implementation Start = NOT AUTHORIZED
Cloudflare Access configuration = NOT AUTHORIZED
production auth boundary activation = NOT AUTHORIZED
authorization allowlist implementation = NOT AUTHORIZED
backend approval mutation API = NOT AUTHORIZED
real persistence / write = NOT AUTHORIZED
Action Gateway / Agent execution = NOT AUTHORIZED
```

その他の候補:

- 複数 repository 対応
- SharePoint read-only observation

MVP-4 候補は Action Gateway integration と Cursor / Codex Agent execution です。

MVP-5 候補は Approved GitHub write です。

これらは現時点では実装しません。
