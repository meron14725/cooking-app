/**
 * 提案 v2 のテストと調整のスクリプト（npm run rec:try）で使う、架空の献立データ。
 * 公式レシピの本文やデータは使わない（料理名と材料の組み合わせは一般的なもの）
 */
import type { RecIngredient, RecRecipe } from '../recommend'

const pkg = (id: string, label: string, quantity: number) => [{ id, label, quantity, isDefault: true }]

type IngSpec = [
  id: string,
  name: string,
  category: string,
  unit: string,
  grams: number | null,
  pack: number,
  opts?: Partial<RecIngredient>,
]

const ING: IngSpec[] = [
  ['onion', '玉ねぎ', 'vegetable', '個', 200, 3, { pantryDays: 30 }],
  ['carrot', 'にんじん', 'vegetable', '本', 150, 3, { pantryDays: 30 }],
  ['potato', 'じゃがいも', 'vegetable', '個', 150, 4, { pantryDays: 30 }],
  ['cabbage', 'キャベツ', 'vegetable', 'g', null, 1000],
  ['spinach', 'ほうれん草', 'vegetable', '袋', 200, 1, { canFreeze: false, preppedFridgeDays: 2 }],
  ['daikon', '大根', 'vegetable', 'g', null, 1000],
  ['eggplant', 'なす', 'vegetable', '本', 80, 3],
  ['broccoli', 'ブロッコリー', 'vegetable', '株', 250, 1],
  ['tomato', 'トマト', 'vegetable', '個', 150, 3, { canFreeze: false }],
  ['shimeji', 'しめじ', 'vegetable', 'g', null, 100],
  ['pumpkin', 'かぼちゃ', 'vegetable', 'g', null, 400],
  ['chicken', '鶏もも肉', 'meat', 'g', null, 300],
  ['pork', '豚こま切れ肉', 'meat', 'g', null, 300],
  ['beef', '牛こま切れ肉', 'meat', 'g', null, 250],
  ['minced', '合いびき肉', 'meat', 'g', null, 300],
  ['salmon', '鮭（切り身）', 'fish', '切れ', 80, 2],
  ['mackerel', 'さば（切り身）', 'fish', '切れ', 90, 2],
  ['tofu', '木綿豆腐', 'tofu_egg_dairy', '丁', 300, 1, { canFreeze: false, preppedFridgeDays: 1 }],
  ['egg', '卵', 'tofu_egg_dairy', '個', 60, 6],
  ['milk', '牛乳', 'tofu_egg_dairy', 'ml', null, 1000, { canFreeze: false }],
  ['curryRoux', 'カレールウ', 'other', 'g', null, 200, { pantryDays: 365 }],
  ['soy', 'しょうゆ', 'seasoning', 'ml', null, 1000, { isStaple: true }],
  ['miso', '味噌', 'seasoning', 'g', null, 750, { isStaple: true }],
]

export const fixtureIngredients = new Map<string, RecIngredient>(
  ING.map(([id, name, category, unit, grams, pack, opts]) => [
    id,
    {
      id,
      name,
      unit,
      category,
      gramsPerUnit: grams,
      isStaple: false,
      canFreeze: true,
      pantryDays: null,
      preppedFridgeDays: 3,
      packageUnits: pkg(`${id}-pack`, `${pack}${unit}入り`, pack),
      ...opts,
    },
  ]),
)

type RecipeSpec = Omit<RecRecipe, 'ingredients' | 'servings' | 'maxServings1_6l'> & {
  parts: [string, number][]
  servings?: number
  maxServings1_6l?: number | null
}

const R = (spec: RecipeSpec): RecRecipe => {
  const { parts, ...rest } = spec
  return {
    servings: 2,
    maxServings1_6l: 4,
    ingredients: parts.map(([ingredientId, quantity]) => ({ ingredientId, quantity })),
    ...rest,
  }
}

/** 架空のレシピ 24 件（2 人前の量） */
export const fixtureCatalog: RecRecipe[] = [
  R({
    id: 'curry',
    title: 'ポークカレー',
    dishType: 'main',
    cuisine: 'western',
    caloriesKcal: 650,
    cookMinutes: 40,
    favoriteCount: 900,
    cookCount: 5000,
    parts: [
      ['pork', 200],
      ['onion', 1],
      ['carrot', 1],
      ['potato', 2],
      ['curryRoux', 60],
    ],
  }),
  R({
    id: 'nikujaga',
    title: '肉じゃが',
    dishType: 'main',
    cuisine: 'japanese',
    caloriesKcal: 420,
    cookMinutes: 35,
    favoriteCount: 1200,
    cookCount: 8000,
    parts: [
      ['beef', 150],
      ['onion', 1],
      ['potato', 3],
      ['carrot', 1],
    ],
  }),
  R({
    id: 'chickenDaikon',
    title: '鶏と大根の煮物',
    dishType: 'main',
    cuisine: 'japanese',
    caloriesKcal: 380,
    cookMinutes: 40,
    favoriteCount: 300,
    cookCount: 1500,
    parts: [
      ['chicken', 250],
      ['daikon', 400],
    ],
  }),
  R({
    id: 'cabbageRoll',
    title: 'ロールキャベツ',
    dishType: 'main',
    cuisine: 'western',
    caloriesKcal: 450,
    cookMinutes: 50,
    favoriteCount: 500,
    cookCount: 2000,
    parts: [
      ['minced', 200],
      ['cabbage', 400],
      ['onion', 0.5],
    ],
  }),
  R({
    id: 'mapo',
    title: '麻婆豆腐',
    dishType: 'main',
    cuisine: 'chinese',
    caloriesKcal: 400,
    cookMinutes: 25,
    favoriteCount: 700,
    cookCount: 4000,
    parts: [
      ['tofu', 1],
      ['minced', 100],
    ],
  }),
  R({
    id: 'salmonMiso',
    title: '鮭のみそ煮',
    dishType: 'main',
    cuisine: 'japanese',
    caloriesKcal: 300,
    cookMinutes: 25,
    favoriteCount: 150,
    cookCount: 600,
    parts: [
      ['salmon', 2],
      ['shimeji', 100],
      ['miso', 30],
    ],
  }),
  R({
    id: 'sabaMiso',
    title: 'さばのみそ煮',
    dishType: 'main',
    cuisine: 'japanese',
    caloriesKcal: 350,
    cookMinutes: 30,
    favoriteCount: 600,
    cookCount: 3000,
    parts: [
      ['mackerel', 2],
      ['miso', 30],
    ],
  }),
  R({
    id: 'chickenTomato',
    title: '鶏のトマト煮',
    dishType: 'main',
    cuisine: 'western',
    caloriesKcal: 420,
    cookMinutes: 35,
    favoriteCount: 400,
    cookCount: 1800,
    parts: [
      ['chicken', 300],
      ['tomato', 2],
      ['onion', 1],
      ['shimeji', 100],
    ],
  }),
  R({
    id: 'stew',
    title: 'クリームシチュー',
    dishType: 'main',
    cuisine: 'western',
    caloriesKcal: 500,
    cookMinutes: 45,
    favoriteCount: 800,
    cookCount: 3500,
    parts: [
      ['chicken', 200],
      ['onion', 1],
      ['carrot', 1],
      ['potato', 2],
      ['milk', 400],
      ['broccoli', 0.5],
    ],
  }),
  R({
    id: 'eggplantMince',
    title: 'なすのひき肉炒め煮',
    dishType: 'main',
    cuisine: 'chinese',
    caloriesKcal: 380,
    cookMinutes: 25,
    favoriteCount: 250,
    cookCount: 900,
    parts: [
      ['eggplant', 3],
      ['minced', 150],
    ],
  }),
  R({
    id: 'spinachOhitashi',
    title: 'ほうれん草のおひたし',
    dishType: 'side',
    cuisine: 'japanese',
    caloriesKcal: 40,
    cookMinutes: 15,
    favoriteCount: 200,
    cookCount: 2000,
    parts: [['spinach', 1]],
  }),
  R({
    id: 'pumpkinNimono',
    title: 'かぼちゃの煮物',
    dishType: 'side',
    cuisine: 'japanese',
    caloriesKcal: 150,
    cookMinutes: 25,
    favoriteCount: 900,
    cookCount: 6000,
    parts: [['pumpkin', 400]],
  }),
  R({
    id: 'carrotKinpira',
    title: 'にんじんのきんぴら',
    dishType: 'side',
    cuisine: 'japanese',
    caloriesKcal: 90,
    cookMinutes: 20,
    favoriteCount: 100,
    cookCount: 400,
    parts: [['carrot', 2]],
  }),
  R({
    id: 'broccoliSteam',
    title: 'ブロッコリーの蒸し物',
    dishType: 'side',
    cuisine: 'western',
    caloriesKcal: 60,
    cookMinutes: 15,
    favoriteCount: 120,
    cookCount: 700,
    parts: [['broccoli', 1]],
  }),
  R({
    id: 'ratatouille',
    title: 'ラタトゥイユ',
    dishType: 'side',
    cuisine: 'western',
    caloriesKcal: 120,
    cookMinutes: 35,
    favoriteCount: 350,
    cookCount: 1600,
    parts: [
      ['eggplant', 2],
      ['tomato', 2],
      ['onion', 0.5],
    ],
  }),
  R({
    id: 'cabbageSteam',
    title: 'キャベツの蒸し煮',
    dishType: 'side',
    cuisine: 'western',
    caloriesKcal: 70,
    cookMinutes: 20,
    favoriteCount: 80,
    cookCount: 300,
    parts: [['cabbage', 300]],
  }),
  R({
    id: 'daikonSalad',
    title: '大根のさっと煮',
    dishType: 'side',
    cuisine: 'japanese',
    caloriesKcal: 60,
    cookMinutes: 20,
    favoriteCount: 60,
    cookCount: 200,
    parts: [['daikon', 300]],
  }),
  R({
    id: 'potatoSalad',
    title: '蒸しじゃがのサラダ',
    dishType: 'side',
    cuisine: 'western',
    caloriesKcal: 180,
    cookMinutes: 25,
    favoriteCount: 400,
    cookCount: 2200,
    parts: [
      ['potato', 2],
      ['onion', 0.5],
      ['egg', 1],
    ],
  }),
  R({
    id: 'misoSoup',
    title: '豆腐とほうれん草のみそ汁',
    dishType: 'soup',
    cuisine: 'japanese',
    caloriesKcal: 80,
    cookMinutes: 15,
    favoriteCount: 300,
    cookCount: 2500,
    parts: [
      ['tofu', 0.5],
      ['spinach', 0.5],
      ['miso', 30],
    ],
  }),
  R({
    id: 'tonjiru',
    title: '豚汁',
    dishType: 'soup',
    cuisine: 'japanese',
    caloriesKcal: 200,
    cookMinutes: 30,
    favoriteCount: 1000,
    cookCount: 7000,
    parts: [
      ['pork', 100],
      ['daikon', 200],
      ['carrot', 0.5],
      ['miso', 40],
    ],
  }),
  R({
    id: 'minestrone',
    title: 'ミネストローネ',
    dishType: 'soup',
    cuisine: 'western',
    caloriesKcal: 150,
    cookMinutes: 30,
    favoriteCount: 450,
    cookCount: 2400,
    parts: [
      ['tomato', 2],
      ['onion', 0.5],
      ['carrot', 0.5],
      ['cabbage', 150],
    ],
  }),
  R({
    id: 'pumpkinPotage',
    title: 'かぼちゃのポタージュ',
    dishType: 'soup',
    cuisine: 'western',
    caloriesKcal: 180,
    cookMinutes: 30,
    favoriteCount: 550,
    cookCount: 2600,
    parts: [
      ['pumpkin', 300],
      ['onion', 0.5],
      ['milk', 300],
    ],
  }),
  R({
    id: 'eggSoup',
    title: '中華風たまごスープ',
    dishType: 'soup',
    cuisine: 'chinese',
    caloriesKcal: 90,
    cookMinutes: 10,
    favoriteCount: 200,
    cookCount: 1200,
    parts: [
      ['egg', 2],
      ['shimeji', 50],
    ],
  }),
  R({
    id: 'oyakodon',
    title: '親子丼の具',
    dishType: 'other',
    cuisine: 'japanese',
    caloriesKcal: 550,
    cookMinutes: 20,
    favoriteCount: 650,
    cookCount: 3000,
    parts: [
      ['chicken', 200],
      ['egg', 3],
      ['onion', 1],
    ],
  }),
]

/**
 * 計算量の確認用に、架空のレシピを n 件作る（材料は fixtureIngredients から順に 4〜6 個）
 */
export function syntheticCatalog(n: number): RecRecipe[] {
  const ids = [...fixtureIngredients.keys()].filter((id) => !fixtureIngredients.get(id)?.isStaple)
  const types = ['main', 'side', 'soup', 'other'] as const
  const cuisines = ['japanese', 'western', 'chinese', 'ethnic'] as const
  return Array.from({ length: n }, (_, i) => {
    const count = 4 + (i % 3)
    return R({
      id: `syn${i}`,
      title: `架空の料理${i}`,
      dishType: types[i % 4],
      cuisine: cuisines[(i >> 2) % 4],
      caloriesKcal: 100 + ((i * 37) % 600),
      cookMinutes: 15 + ((i * 7) % 40),
      favoriteCount: (i * 53) % 1000,
      cookCount: (i * 97) % 5000,
      parts: Array.from({ length: count }, (_, k) => [ids[(i * 5 + k * 3) % ids.length] as string, 50 + k * 30]),
    })
  })
}
