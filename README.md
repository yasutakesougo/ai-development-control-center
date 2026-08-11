# AI Development Control Center

## Purpose

AI Development Control Center は、開発プロジェクトの状態を読み取り、Human が「今、自分が何をすればよいか」を短時間で判断するための独立した Web アプリです。

MVP-1 では `yasutakesougo/severe-behavior-support-spfx` を read-only で観測します。

このリポジトリは業務アプリ本体ではありません。

## Architecture

```text
Browser
  ↓
Cloudflare Worker + Static Assets
  ↓ GET only
GitHub API
  ↓
Observed Facts
  ↓
Human Action Resolver
  ↓
Human Action
  ↓
Mobile-first UI
```

Observed Facts と Human Action は分離しています。

Resolver は明示された規則だけを使います。

証拠不足、GitHub API 失敗、矛盾、未知の規則、Human Decision 不明の場合は `UNKNOWN` を返します。

## Human Action contract

```ts
type HumanActionStatus =
  | "ACTION_REQUIRED"
  | "WAIT"
  | "NO_ACTION"
  | "UNKNOWN";
```

`ACTION_REQUIRED` は、必要な証拠が確認でき、かつ Human Decision が明示的に必要と判定できた場合だけ返します。

MVP-1 の GitHub adapter では、PR 本文に次の明示マーカーがある場合だけ Human Decision を確定します。

```text
Human-Decision: REQUIRED
```

または、Human Decision 不要を明示する場合は次を使います。

```text
Human-Decision: NONE
```

マーカーがなく、別の一次情報から確定できない場合は推測せず `UNKNOWN` とします。

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

public repository の read-only API は認証なしでも取得できますが、GitHub API rate limit を避けるため Worker 側に token を設定できます。

ブラウザへ token は渡しません。

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

Resolver unit tests では最低限、次を確認します。

- Human action required
- CI pending -> `WAIT`
- No human action -> `NO_ACTION`
- Missing evidence -> `UNKNOWN`
- GitHub API failure -> `UNKNOWN`
- Contradictory evidence -> `UNKNOWN`
- Unknown rule -> `UNKNOWN`
- Insufficient evidence が `ACTION_REQUIRED` へ昇格しないこと

実行方法は次です。

```bash
npm test
```

## Deployment

MVP-1 は `workers.dev` での試験公開を前提とします。

Cloudflare Vite plugin が Worker と React SPA の build をまとめます。

```bash
npm install
npm run verify
npm run deploy
```

`npm run deploy` で Cloudflare login、account 選択、権限確認などの Human 操作が必要になった場合は、その場で停止してください。

勝手に有料サービスを契約しない方針です。

独自ドメインは MVP-1 では不要です。

## Security boundary

MVP-1 の境界は次です。

```text
Browser
  GitHub credential = 0
      ↓
Worker
  GITHUB_TOKEN = Secret only
  GitHub request = GET only
      ↓
yasutakesougo/severe-behavior-support-spfx
  mutation = 0
```

実装しない capability は次です。

- GitHub write
- Issue write
- PR write
- Merge
- Ready 化
- GitHub comment
- SharePoint write
- SharePoint schema 変更
- Cursor Agent 起動
- Codex Agent 起動
- 自動承認
- Action Gateway write

## Known limitations

MVP-1 は Human Action を AI の自由推論では決定しません。

GitHub 上に Human Decision の一次情報が存在しても、現在の adapter がその形式を認識できなければ `UNKNOWN` になります。

Review、CI、merge state は GitHub API で確認できた情報だけを正規化します。

取得不能な値を推測で補完しません。

Relevant Issue の高度な関連付けや Evidence 自動収集はまだ実装しません。

## Future phases

MVP-2 候補は Evidence 自動収集、複数 repository 対応、SharePoint read-only observation です。

MVP-3 候補は Human Approval UI です。

MVP-4 候補は Action Gateway integration と Cursor / Codex Agent execution です。

MVP-5 候補は Approved GitHub write です。

これらは MVP-1 では実装しません。
