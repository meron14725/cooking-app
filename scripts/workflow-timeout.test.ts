import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 止まったジョブが既定の 6 時間まで動き続けないよう、全ジョブに timeout-minutes を付ける
const workflowsDir = join(import.meta.dirname, '..', '.github', 'workflows')
const workflowFiles = readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
const read = (file: string) => readFileSync(join(workflowsDir, file), 'utf8')
// コメントは説明に「timeout-minutes」と書いてもよいので外して調べる
const withoutComments = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')

// jobs: の下の 2 字下げのキーをジョブとみなし、ジョブ名 → ジョブの中身（4 字下げ以上の行）に分ける
function jobsOf(text: string): Map<string, string> {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line))
  const jobs = new Map<string, string[]>()
  if (start < 0) return new Map()
  let current: string[] | undefined
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break
    const name = /^ {2}([\w-]+):\s*$/.exec(line)?.[1]
    if (name) {
      current = []
      jobs.set(name, current)
    } else {
      current?.push(line)
    }
  }
  return new Map([...jobs].map(([name, body]) => [name, body.join('\n')]))
}

const jobs = workflowFiles.flatMap((file) =>
  [...jobsOf(withoutComments(read(file)))].map(([name, body]) => ({ file, name, body })),
)

describe('GitHub Actions のジョブのタイムアウト', () => {
  it('CI と Deploy のジョブがある', () => {
    expect(jobs.map((j) => `${j.file}:${j.name}`)).toEqual(
      expect.arrayContaining(['ci.yml:check', 'deploy.yml:deploy']),
    )
  })

  it.each(workflowFiles)('%s にジョブがある', (file) => {
    expect(jobs.filter((j) => j.file === file).length).toBeGreaterThan(0)
  })

  it.each(jobs.map((j) => [j.file, j.name, j.body] as const))(
    '%s の %s に timeout-minutes: 5 が付いている',
    (_file, _name, body) => {
      expect(body).toMatch(/^ {4}timeout-minutes: 5\s*$/m)
    },
  )
})
