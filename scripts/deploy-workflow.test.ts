import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// リポジトリは公開なので、本番 D1 の書き出しを Actions の成果物（artifact）やログに出さない（docs/deploy.md「本番 DB のバックアップ」）
const workflowsDir = join(import.meta.dirname, '..', '.github', 'workflows')
const workflowFiles = readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
const read = (file: string) => readFileSync(join(workflowsDir, file), 'utf8')
// コメントは説明に「upload-artifact」と書いてもよいので外して調べる
const withoutComments = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')

const deploy = withoutComments(read('deploy.yml'))

describe('GitHub Actions のワークフロー', () => {
  it('ワークフローがある', () => {
    expect(workflowFiles).toContain('deploy.yml')
  })

  it.each(workflowFiles)('%s は成果物（upload-artifact）を上げない', (file) => {
    expect(withoutComments(read(file))).not.toMatch(/upload-artifact/)
  })
})

describe('deploy.yml の本番 D1 バックアップ', () => {
  it('書き出しは runner の一時ディレクトリに置き、標準出力を捨てる', () => {
    expect(deploy).toMatch(/wrangler d1 export "\$DB_NAME" --remote --output "\$file" > \/dev\/null/)
    expect(deploy).toMatch(/file="\$RUNNER_TEMP\//)
  })

  it('書き出した SQL の中身をログに出さない', () => {
    expect(deploy).not.toMatch(/\b(cat|head|tail|less|more)\b[^\n]*(\$file|\.sql)/)
  })

  it('非公開の R2 バケット cooking-app-backups に保存する', () => {
    expect(deploy).toMatch(/BACKUP_BUCKET: cooking-app-backups/)
    expect(deploy).toMatch(/wrangler r2 object put "\$BACKUP_BUCKET\/\$key" --file "\$file" --remote/)
  })

  it('保存はマイグレーションより前', () => {
    const put = deploy.indexOf('wrangler r2 object put')
    const migrate = deploy.indexOf('wrangler d1 migrations apply')
    expect(put).toBeGreaterThan(-1)
    expect(migrate).toBeGreaterThan(put)
  })

  it('保存に失敗したら止まる（pipefail）', () => {
    const step = deploy.slice(
      deploy.indexOf('本番 D1 を書き出して R2 に保存'),
      deploy.indexOf('- name: マイグレーション'),
    )
    expect(step).toMatch(/set -euo pipefail/)
    expect(step).toMatch(/exit 1/)
  })
})
