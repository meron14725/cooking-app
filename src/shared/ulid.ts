// ULID（時刻順に並ぶ 26 文字の ID）。https://github.com/ulid/spec
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function ulid(now: number = Date.now()): string {
  let time = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    time = ENCODING[t % 32] + time
    t = Math.floor(t / 32)
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let random = ''
  for (const b of bytes) random += ENCODING[b % 32]
  return time + random
}
