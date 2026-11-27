/** テスト用のメモリ上の R2 バケット（get と put だけ） */
export function createTestR2() {
  const objects = new Map<string, { body: Uint8Array; contentType?: string }>()

  const bucket = {
    async put(key: string, body: string | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, {
        body: typeof body === 'string' ? new TextEncoder().encode(body) : body,
        contentType: opts?.httpMetadata?.contentType,
      })
    },
    async get(key: string) {
      const o = objects.get(key)
      if (!o) return null
      return {
        key,
        body: new Response(o.body).body,
        httpEtag: `"${key}"`,
        writeHttpMetadata(headers: Headers) {
          if (o.contentType) headers.set('Content-Type', o.contentType)
        },
      }
    },
  }
  return bucket as unknown as R2Bucket & typeof bucket
}
