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

  /** 本文をそのまま extractRecipe と同じ読み方で読む（1 行目をタイトル、「- 」の行を材料） */
  async draftFromText(input: Parameters<AiProvider['draftFromText']>[0]): Promise<RecipeDraftRaw> {
    const draft = await this.extractRecipe({ url: '', text: input.text, ingredients: input.ingredients })
    return { ...draft, warnings: [...draft.warnings, 'これはテスト用の下書きです'] }
  }

  /** 余りをそのまま材料にした下書きを返す。タイトルは「<先頭の余り>の煮物」 */
  async suggestRecipe(input: Parameters<AiProvider['suggestRecipe']>[0]): Promise<RecipeDraftRaw> {
    return {
      title: `${input.leftovers[0]?.name ?? '余り'}の煮物`,
      servings: 1,
      caloriesKcal: 600,
      hotcookMode: '手動 > 煮物を作る > まぜない > 15分',
      maxServings1_6l: 4,
      ingredients: [
        ...input.leftovers.map((l) => ({
          displayText: `${l.name} ${l.quantity}${l.unit}`,
          name: l.name,
          quantity: l.quantity,
          unit: l.unit,
          cutStyle: 'ひと口大',
        })),
        { displayText: 'しょうゆ 大さじ1', name: 'しょうゆ', quantity: 15, unit: 'ml', cutStyle: null },
      ],
      steps: [
        { phase: 'prep', text: '材料をひと口大に切る' },
        { phase: 'cook', text: '内鍋に入れて加熱する' },
      ],
      warnings: ['これはテスト用の下書きです'],
    }
  }

  async estimateCalories(input: Parameters<AiProvider['estimateCalories']>[0]) {
    return { caloriesKcal: Math.round((input.ingredients.length * 150) / input.servings) }
  }

  /** 名前に「肉」があれば meat、ほかは other。重さは needsGrams のときだけ 100g */
  async classifyIngredients(items: Parameters<AiProvider['classifyIngredients']>[0]) {
    return {
      items: items.map((i) => ({
        key: i.key,
        category: i.name.includes('肉') ? ('meat' as const) : ('other' as const),
        gramsPerUnit: i.needsGrams ? 100 : null,
      })),
    }
  }

  /** 名前に「汁」があれば汁物、ほかは副菜。系統は和 */
  async classifyRecipes(items: Parameters<AiProvider['classifyRecipes']>[0]) {
    return {
      items: items.map((i) => ({
        key: i.key,
        dishType: i.title.includes('汁') ? ('soup' as const) : ('side' as const),
        cuisine: 'japanese' as const,
      })),
    }
  }
}
