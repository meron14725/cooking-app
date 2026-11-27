import { defineConfig } from 'vitest/config'

// ロジック（shared/domain）の単体テスト用。Workers を使う結合テストは後の PR で追加する
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'seed/**/*.test.ts', 'container/src/**/*.test.ts'],
  },
})
