# 01. アーキテクチャ

## 技術スタック

| 領域 | 採用 | 理由 |
|---|---|---|
| 言語 | TypeScript | 画面とAPIで型（スキーマ）を共有できる |
| 画面 | React + Vite（SPA） | Workers の静的アセット配信にそのまま載る。Next.js は Workers 上だと OpenNext 経由になり手間が増える |
| ルーティング | React Router | 画面数が 10 程度なので十分 |
| データ取得 | TanStack Query | キャッシュと再取得、楽観的更新（買い物チェック）に使う |
| スタイル | Tailwind CSS | スマホ前提の画面を早く作れる |
| API | Hono（Cloudflare Workers） | Workers 向けで軽量。zod でリクエスト検証 |
| DB | Cloudflare D1（SQLite） | 無料枠で足りる。Time Travel で 30 日分巻き戻せる |
| ORM / マイグレーション | Drizzle ORM + drizzle-kit | 型安全。SQLite/Postgres 両対応なので将来の移行も楽 |
| 検証 | zod | API入出力と AI の出力検証で共通利用 |
| テスト | Vitest（ロジック）、@cloudflare/vitest-pool-workers（API） | レコメンドなど純粋関数を厚めにテスト |
| CI | GitHub Actions | lint / typecheck / test |
| デプロイ | wrangler（GitHub Actions から main マージ時） | |

## 全体構成

```
スマホのブラウザ
   │  https://<app>.<account>.workers.dev（またはカスタムドメイン）
   ▼
Cloudflare Access ── 自分のメールにワンタイムコードでログイン
   ▼
Cloudflare Worker（1つ）
   ├─ /assets, /*      … React SPA の静的ファイル（Workers Static Assets）
   └─ /api/*           … Hono の API
          ├─ D1（データ）
          └─ AIプロバイダ（外部API。URL取り込みと補完提案のときだけ）
```

画面と API を 1 つの Worker にまとめるので、CORS もデプロイ先も 1 つで済みます。

## ディレクトリ構成

```
cooking-app/
├─ src/
│  ├─ client/          # React（画面）
│  │  ├─ routes/       # 画面ごと
│  │  ├─ components/
│  │  └─ api/          # API クライアント（TanStack Query のフック）
│  ├─ server/          # Hono（API）
│  │  ├─ routes/       # エンドポイントごと
│  │  ├─ services/     # 業務ロジック（DBアクセスを含む）
│  │  ├─ ai/           # AIプロバイダのインターフェースと実装
│  │  └─ db/           # Drizzle スキーマ
│  └─ shared/          # 画面とAPIで共有
│     ├─ schemas/      # zod スキーマ（API入出力）
│     └─ domain/       # 純粋関数（レコメンド、販売単位計算、期限計算、下ごしらえ集約）
├─ migrations/         # drizzle-kit が生成する SQL
├─ seed/               # 食材マスタの初期データ
├─ docs/design/
└─ wrangler.jsonc
```

レコメンドや期限計算などのロジックは `shared/domain` に DB に依存しない純粋関数として置き、単体テストしやすくします。

## 認証

Cloudflare Access（Zero Trust の無料枠）で Worker の前に認証をかけます。

- ポリシー: 自分のメールアドレス 1 件だけ許可。ログインはメールのワンタイムコード
- アプリ側はログイン画面やユーザー管理を持たない

### Worker 側での JWT 検証

Access を経由しない経路から偽のヘッダで API を叩かれないよう、Worker のミドルウェアで `Cf-Access-Jwt-Assertion` を検証します。ヘッダの有無だけでは判定しません。

- 署名を `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` の公開鍵で検証する（`jose` の `createRemoteJWKSet` + `jwtVerify`）
- `aud`（Access アプリの AUD タグ）、`iss`（`https://<team>.cloudflareaccess.com`）、有効期限を確認する
- `<team>` と AUD は Worker の環境変数で渡す
- 検証に失敗したら 401。画面（静的アセット）も含めて全リクエストに適用する

### 入口を 1 つにする

- カスタムドメインを使う場合: `wrangler.jsonc` で `workers_dev: false`、`preview_urls: false` にし、Access をかけたドメインだけを入口にする
- `*.workers.dev` で使う場合: Access のアプリに workers.dev のホスト名とプレビュー URL（`*-<worker>.<account>.workers.dev`）の両方を含める
- MVP は workers.dev で始める（`workers_dev: true`、`preview_urls: false`）。手順は [docs/deploy.md](../deploy.md)

### ローカル開発

検証のスキップはホスト名ではなく、明示的な変数 `ENVIRONMENT=local`（`.dev.vars` にだけ書く）で判定します。本番の設定に `ENVIRONMENT` を書かないので、本番で誤って無効になりません。

### 将来

複数人対応（将来）になったら、各テーブルに `user_id` を足して Access の JWT の email で引く形に拡張します。

## データの守り

| 手段 | 内容 |
|---|---|
| D1 Time Travel | 過去 30 日の任意の時点に戻せる（標準機能、設定不要）。ただし DB 自体を消すと使えない |
| デプロイ前のエクスポート | デプロイのたびに `wrangler d1 export --remote` で SQL を書き出し、GitHub Actions の artifact に残す |
| 定期エクスポート | 週 1 回 Cron Trigger で全テーブルを JSON にして R2 に保存（あるとよい、MVP後） |
| 論理削除 | レシピと食材マスタは `archived_at` で論理削除し、誤削除を防ぐ |

## 環境

| 環境 | DB | 用途 |
|---|---|---|
| local | `wrangler dev` のローカル D1 | 開発 |
| production | D1 本番 | 本人が使う |

自分専用なので staging は置きません。

## デプロイとマイグレーション

main へのマージで GitHub Actions が次の順に実行します。

1. lint / typecheck / test
2. `wrangler d1 export <DB> --remote` で本番 DB を書き出し、artifact に保存
3. `wrangler d1 migrations apply <DB> --remote`
4. `wrangler deploy`

マイグレーションは**列やテーブルの追加だけ**にします。削除・名前の変更は、古いコードが使わなくなったことを確認した後の PR で行います。こうすると 3 と 4 の間の数秒、古いコードが新しいスキーマで動いても壊れません。

## シークレット

AI の API キーは `wrangler secret put` で Worker のシークレットに入れます。リポジトリには置きません。
