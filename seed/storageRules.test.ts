import { describe, expect, it } from 'vitest'
import { storageByRule } from '../src/shared/domain/storageRules'
import { ingredientInputSchema } from '../src/shared/schemas/ingredient'
import { ingredientSeeds } from './ingredients'

describe('保存日数の辞書と初期データ', () => {
  it('初期データの食材は、辞書で初期データと同じ日持ちになる（入れ直しても値が変わらない）', () => {
    for (const seed of ingredientSeeds) {
      const s = ingredientInputSchema.parse(seed)
      expect(storageByRule({ name: s.name, aliases: s.aliases, category: s.category }), s.name).toEqual({
        canFreeze: s.canFreeze,
        fridgeDays: s.fridgeDays,
        freezerDays: s.freezerDays,
        pantryDays: s.pantryDays,
        defaultLocation: s.defaultLocation,
        preppedFridgeDays: s.preppedFridgeDays,
        preppedFreezerDays: s.preppedFreezerDays,
      })
    }
  })
})
