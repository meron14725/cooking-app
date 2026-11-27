/** LIKE の % と _ をそのままの文字として扱う（ESCAPE '\' と組で使う） */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}
