import { type RecipeInputParsed, type RecipeSourceType, recipeInputSchema } from '../src/shared/schemas/recipe'
import type { RecipeSeed } from './recipes'

export function recipeSeedId(seed: RecipeSeed): string {
  return `seed-recipe-${seed.key}`
}

/** seed を API と同じ入力の形にして検証する。食材 id は resolve で名前から引く */
export function recipeSeedToInput(
  seed: RecipeSeed,
  resolve: (name: string) => string,
): Omit<RecipeInputParsed, 'sourceType'> & { sourceType: RecipeSourceType } {
  // API からは seed を作れないので、検証は manual として通してから seed に差し替える
  const parsed = recipeInputSchema.parse({
    title: seed.title,
    servings: seed.servings,
    caloriesKcal: seed.caloriesKcal,
    caloriesEstimated: true,
    hotcookMode: seed.hotcookMode,
    maxServings1_6l: seed.maxServings1_6l,
    packSeasonings: seed.packSeasonings ?? false,
    notes: seed.notes,
    ingredients: seed.ingredients.map((i) => ({
      ingredientId: resolve(i.name),
      quantity: i.quantity,
      displayText: i.displayText,
      cutStyle: i.cutStyle,
      addOrder: i.addOrder ?? 0,
    })),
    steps: [
      ...seed.prep.map((text) => ({ phase: 'prep' as const, text })),
      ...seed.cook.map((text) => ({ phase: 'cook' as const, text })),
    ],
  })
  return { ...parsed, sourceType: 'seed' }
}
