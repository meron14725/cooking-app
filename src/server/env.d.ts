// Worker のバインディングと環境変数。wrangler.jsonc を変えたらここも合わせる
// （ランタイムの型だけ `npm run cf-typegen` で worker-configuration.d.ts に生成している）
interface Env {
  DB: D1Database
  ASSETS: Fetcher
  /** レシピ写真の R2 バケット（cooking-app-images）。キーは img/R4063.jpg の形。GET /api/images/* で返す */
  IMAGES: R2Bucket
  /** 例: example.cloudflareaccess.com（https:// は付けない） */
  ACCESS_TEAM_DOMAIN: string
  /** Cloudflare Access アプリケーションの AUD タグ */
  ACCESS_AUD: string
  /** ローカル開発のときだけ .dev.vars で "local" を入れる。本番では未設定 */
  ENVIRONMENT?: string
  /** AI プロバイダ: cursor（既定）/ gemini（予備）/ fake（テスト・ローカル用） */
  AI_PROVIDER?: string
  /** Cursor SDK を動かす Container（docs/design/08-agent.md） */
  AGENT?: DurableObjectNamespace<import('./agent/container').AgentContainer>
  /** Cursor の User API key（wrangler secret put CURSOR_API_KEY）。Container に環境変数で渡す */
  CURSOR_API_KEY?: string
  /** 使うモデル。空なら composer-2.5 */
  CURSOR_MODEL?: string
  /** Google AI Studio の API キー（wrangler secret put GEMINI_API_KEY） */
  GEMINI_API_KEY?: string
  /** 使うモデル。空なら src/server/ai/gemini.ts の既定 */
  GEMINI_MODEL?: string
}
