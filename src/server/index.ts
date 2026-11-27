import { app } from './app'

export { AgentContainer } from './agent/container'

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>
