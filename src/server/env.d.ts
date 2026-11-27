// Worker のバインディングと環境変数。wrangler.jsonc を変えたらここも合わせる
// （ランタイムの型だけ `npm run cf-typegen` で worker-configuration.d.ts に生成している）
interface Env {
  DB: D1Database
  ASSETS: Fetcher
  /** 例: example.cloudflareaccess.com（https:// は付けない） */
  ACCESS_TEAM_DOMAIN: string
  /** Cloudflare Access アプリケーションの AUD タグ */
  ACCESS_AUD: string
  /** ローカル開発のときだけ .dev.vars で "local" を入れる。本番では未設定 */
  ENVIRONMENT?: string
  /** AI プロバイダ: gemini（既定）/ fake（テスト・ローカル用） */
  AI_PROVIDER?: string
  /** Google AI Studio の API キー（wrangler secret put GEMINI_API_KEY） */
  GEMINI_API_KEY?: string
  /** 使うモデル。空なら src/server/ai/gemini.ts の既定 */
  GEMINI_MODEL?: string
}
