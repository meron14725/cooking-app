import { Container } from '@cloudflare/containers'

/**
 * Cursor SDK を動かす Container（docs/design/08-agent.md）。Worker からだけ呼ぶ（公開の入口はない）。
 * 自分専用なのでインスタンスは 1 つ。使わなければ 10 分で止まる
 */
export class AgentContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'

  constructor(ctx: DurableObjectState<object>, env: Env) {
    super(ctx, env)
    // API キーは Worker のシークレットから、起動するときに環境変数で渡す
    this.envVars = {
      CURSOR_API_KEY: env.CURSOR_API_KEY ?? '',
      CURSOR_MODEL: env.CURSOR_MODEL ?? '',
    }
  }
}
