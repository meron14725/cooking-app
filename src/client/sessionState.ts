import { useEffect, useState } from 'react'

/**
 * このタブの間だけ覚えておく値（sessionStorage）。レシピを見に行って戻ってきても、途中の選択を残すのに使う。
 * 読めない・形が違う値は捨てて初期値にする。sessionStorage が使えなくても画面は動く
 */
export function readSession<T>(key: string, isValid: (v: unknown) => v is T): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (raw === null) return null
    const v: unknown = JSON.parse(raw)
    return isValid(v) ? v : null
  } catch {
    return null
  }
}

/** null で消す */
export function writeSession(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 覚えられなくても操作はできる
  }
}

/** useState と同じ使い方で、値を sessionStorage にも書く */
export function useSessionState<T>(key: string, initial: T, isValid: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => readSession(key, isValid) ?? initial)
  useEffect(() => writeSession(key, value), [key, value])
  return [value, setValue] as const
}

export const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/** 値がすべて choices のどれかの文字列になっているオブジェクト */
export const isRecordOf =
  <C extends string>(choices: readonly C[]) =>
  (v: unknown): v is Record<string, C> =>
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v).every((x) => typeof x === 'string' && (choices as readonly string[]).includes(x))
