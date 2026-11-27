import { createServer } from 'node:http'
import { handleAgent, handleStructured, type Reply } from './app.ts'
import { cursorRunner } from './cursor.ts'

const apiKey = process.env.CURSOR_API_KEY ?? ''
const model = process.env.CURSOR_MODEL || 'composer-2.5'
const runAgent = cursorRunner({ apiKey, model, stateDir: '/tmp/cursor-agent' })
const MAX_BODY = 1_000_000

async function readJson(req: import('node:http').IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('本文が大きすぎます')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = createServer(async (req, res) => {
  const send = ({ status, body }: Reply) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }
  try {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/ping')) {
      return send({ status: 200, body: { ok: true, model, hasKey: apiKey !== '' } })
    }
    if (req.method === 'POST' && req.url === '/structured') {
      if (!apiKey)
        return send({
          status: 503,
          body: { error: { code: 'AI_NOT_CONFIGURED', message: 'CURSOR_API_KEY がありません' } },
        })
      return send(await handleStructured(await readJson(req), runAgent))
    }
    if (req.method === 'POST' && req.url === '/agent') {
      if (!apiKey)
        return send({
          status: 503,
          body: { error: { code: 'AI_NOT_CONFIGURED', message: 'CURSOR_API_KEY がありません' } },
        })
      return send(await handleAgent(await readJson(req), runAgent))
    }
    send({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'not found' } } })
  } catch (err) {
    send({
      status: 400,
      body: { error: { code: 'BAD_REQUEST', message: err instanceof Error ? err.message : String(err) } },
    })
  }
})

server.listen(8080, () => console.log(`agent server listening on 8080 (model: ${model})`))
