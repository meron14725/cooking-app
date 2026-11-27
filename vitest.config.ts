import { defineConfig } from 'vitest/config'

// 単体テスト用。画面のテスト（*.test.tsx）はファイルの先頭で jsdom を指定する
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'seed/**/*.test.ts', 'container/src/**/*.test.ts'],
  },
})
