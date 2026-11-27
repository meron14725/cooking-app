import type { RecipeDraftRaw } from '../../shared/schemas/recipeDraft'
import type { AiProvider } from './provider'

/**
 * テストとローカル開発用。本文の 1 行目をタイトルにし、マスタの先頭 2 つを材料にした下書きを返す。
 * 本文に「材料:」の行があれば、その後ろの「名前 量単位」を材料として読む。
 */
export class FakeProvider implements AiProvider {
  async extractRecipe(input: Parameters<AiProvider['extractRecipe']>[0]): Promise<RecipeDraftRaw> {
    const lines = input.text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const title = (lines[0] ?? '取り込んだレシピ').replace(/^タイトル:\s*/, '').slice(0, 100)
    const ingredientLines = lines.filter((l) => l.startsWith('- '))
    const ingredients =
      ingredientLines.length > 0
        ? ingredientLines.map((l) => {
            const text = l.slice(2)
            const m = text.match(/^(.+?)\s+([\d.]+)\s*(\S+)$/)
            return {
              displayText: text,
              name: m?.[1] ?? text,
              quantity: m ? Number(m[2]) : null,
              unit: m?.[3] ?? null,
              cutStyle: null,
            }
          })
        : input.ingredients.slice(0, 2).map((i) => ({
            displayText: `${i.name} 1${i.unit}`,
            name: i.name,
            quantity: 1,
            unit: i.unit,
            cutStyle: null,
          }))
    return {
      title,
      servings: 2,
      caloriesKcal: null,
      hotcookMode: '手動 > 煮物を作る > まぜる > 20分',
      maxServings1_6l: 4,
      ingredients:
        ingredients.length > 0
          ? ingredients
          : [{ displayText: '水 200ml', name: '水', quantity: 200, unit: 'ml', cutStyle: null }],
      steps: [
        { phase: 'prep', text: '材料を切る' },
        { phase: 'cook', text: '内鍋に入れて加熱する' },
      ],
      warnings: ['これはテスト用の下書きです'],
    }
  }

  async estimateCalories(input: Parameters<AiProvider['estimateCalories']>[0]) {
    return { caloriesKcal: Math.round((input.ingredients.length * 150) / input.servings) }
  }
}
