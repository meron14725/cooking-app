# cooking-app

ホットクックで「1回の買い出しと1回の下ごしらえで約3日分・3品」を回すための、自分専用のスマホ向け Web アプリです。

設計は [docs/design](./docs/design/README.md) にあります。

## 構成

- 画面: React + Vite（`src/client`）
- API: Hono on Cloudflare Workers（`src/server`）
- 共有ロジック・型: `src/shared`（レコメンドなどの純粋関数は `src/shared/domain`）
- DB: Cloudflare D1（Drizzle ORM）

## 開発

Node.js 22 を使います。

```sh
npm install
cp .dev.vars.example .dev.vars   # ローカルでは認証をスキップ
npm run dev                      # http://localhost:5173 （画面と /api の両方）
```

| コマンド | 内容 |
|---|---|
| `npm run lint` | Biome で lint とフォーマットの確認（`npm run format` で自動修正） |
| `npm run typecheck` | TypeScript の型チェック |
| `npm test` | Vitest |
| `npm run build` | 本番ビルド |
| `npm run cf-typegen` | Workers ランタイムの型を作り直す（`Env` は `src/server/env.d.ts` に手で書く） |

## デプロイ

main にマージすると GitHub Actions が本番 D1 の書き出し → マイグレーション → デプロイを行います。初回の設定は [docs/deploy.md](./docs/deploy.md) を見てください。
