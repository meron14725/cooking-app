import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { z } from 'zod'
import { ApiError } from './errors'

/** zod で検証し、失敗したら共通のエラー形式（400 VALIDATION_ERROR）で返す */
export function validate<T extends z.ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        result.error.issues[0]?.message ?? '入力内容を確認してください',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      )
    }
  })
}
