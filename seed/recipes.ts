// 基本レシピの初期データ。自分で書いたもので、ホットクックの設定・カロリー・作れる人数はどれも目安。
// 量は食材マスタ（seed/ingredients.ts）の基準単位。調味料の換算は 大さじ1 = しょうゆ・みりん・酒・酢 15ml、
// 砂糖 9g、味噌 18g、片栗粉 9g、ケチャップ 15g、オイスターソース 18g、小さじ1 = 顆粒だし・コンソメ・鶏がら 3g、塩 6g。
// 水はマスタに入れていないので、手順の中に書く。
// 変えたら `npm run seed:recipes-sql` でマイグレーション SQL を作り直す（新しいマイグレーションとして追加する）。

export type RecipeSeedIngredient = {
  /** 食材マスタの名前 */
  name: string
  /** 基準単位。null = 少々・適量 */
  quantity: number | null
  displayText: string
  cutStyle?: string
  /** ホットクックに入れる順（0 = 指定なし） */
  addOrder?: number
}

export type RecipeSeed = {
  /** 固定の id に使う（英小文字とハイフン）。一度入れたら変えない */
  key: string
  title: string
  servings: number
  caloriesKcal: number
  hotcookMode: string
  maxServings1_6l: number
  packSeasonings?: boolean
  notes?: string
  ingredients: RecipeSeedIngredient[]
  prep: string[]
  cook: string[]
}

const i = (
  name: string,
  quantity: number | null,
  displayText: string,
  opts: { cut?: string; order?: number } = {},
): RecipeSeedIngredient => ({ name, quantity, displayText, cutStyle: opts.cut, addOrder: opts.order })

export const recipeSeeds: RecipeSeed[] = [
  {
    key: 'nikujaga',
    title: '肉じゃが',
    servings: 3,
    caloriesKcal: 380,
    hotcookMode: '手動 > 煮物を作る > まぜる > 25分',
    maxServings1_6l: 4,
    ingredients: [
      i('じゃがいも', 3, 'じゃがいも 3個', { cut: '4等分', order: 1 }),
      i('にんじん', 1, 'にんじん 1本', { cut: '乱切り', order: 1 }),
      i('玉ねぎ', 1, '玉ねぎ 1個', { cut: 'くし形切り', order: 1 }),
      i('豚こま切れ肉', 150, '豚こま切れ肉 150g', { order: 2 }),
      i('しょうゆ', 30, 'しょうゆ 大さじ2', { order: 3 }),
      i('みりん', 30, 'みりん 大さじ2', { order: 3 }),
      i('酒', 15, '酒 大さじ1', { order: 3 }),
      i('砂糖', 9, '砂糖 大さじ1', { order: 3 }),
    ],
    prep: ['じゃがいもは皮をむいて 4 等分、にんじんは乱切り、玉ねぎはくし形に切る'],
    cook: [
      '内鍋に野菜、豚肉の順に入れ、調味料と水 50ml を回しかける',
      'まぜ技ユニットを付けて加熱する',
      '加熱後、味がなじむまで 10 分ほど保温する',
    ],
  },
  {
    key: 'chicken-daikon',
    title: '鶏もも肉と大根の煮物',
    servings: 2,
    caloriesKcal: 400,
    hotcookMode: '手動 > 煮物を作る > まぜない > 30分',
    maxServings1_6l: 4,
    ingredients: [
      i('大根', 0.3, '大根 1/3本', { cut: '半月切り（2cm）', order: 1 }),
      i('鶏もも肉', 1, '鶏もも肉 1枚', { cut: 'ひと口大', order: 2 }),
      i('しょうが', 10, 'しょうが 1かけ', { cut: '薄切り', order: 2 }),
      i('しょうゆ', 30, 'しょうゆ 大さじ2', { order: 3 }),
      i('みりん', 30, 'みりん 大さじ2', { order: 3 }),
      i('酒', 30, '酒 大さじ2', { order: 3 }),
      i('砂糖', 6, '砂糖 小さじ2', { order: 3 }),
    ],
    prep: ['大根は皮をむいて 2cm の半月切り、鶏肉はひと口大、しょうがは薄切りにする'],
    cook: ['内鍋に大根を敷き、鶏肉としょうがをのせる', '調味料と水 100ml を入れて加熱する'],
  },
  {
    key: 'pork-curry',
    title: 'ポークカレー',
    servings: 4,
    caloriesKcal: 600,
    hotcookMode: '手動 > 煮物を作る > まぜる > 15分',
    maxServings1_6l: 4,
    notes: 'ごはんは別に炊く。カロリーはごはん 200g 込みの目安',
    ingredients: [
      i('玉ねぎ', 2, '玉ねぎ 2個', { cut: 'くし形切り', order: 1 }),
      i('じゃがいも', 2, 'じゃがいも 2個', { cut: 'ひと口大', order: 1 }),
      i('にんじん', 1, 'にんじん 1本', { cut: '乱切り', order: 1 }),
      i('豚こま切れ肉', 200, '豚こま切れ肉 200g', { order: 2 }),
      i('カレールウ', 4, 'カレールウ 4皿分', { order: 3 }),
    ],
    prep: ['玉ねぎはくし形、じゃがいもはひと口大、にんじんは乱切りにする'],
    cook: [
      '内鍋に野菜、豚肉の順に入れ、水 400ml を注ぐ',
      'まぜ技ユニットを付けて加熱する',
      '加熱後にルウを割り入れ、まぜる 5 分を追加する',
    ],
  },
  {
    key: 'minestrone',
    title: 'ミネストローネ',
    servings: 3,
    caloriesKcal: 150,
    hotcookMode: '手動 > スープを作る > まぜる > 20分',
    maxServings1_6l: 4,
    ingredients: [
      i('玉ねぎ', 1, '玉ねぎ 1個', { cut: '1cm角', order: 1 }),
      i('にんじん', 0.5, 'にんじん 1/2本', { cut: '1cm角', order: 1 }),
      i('キャベツ', 0.15, 'キャベツ 2〜3枚', { cut: '1cm角', order: 1 }),
      i('ベーコン', 70, 'ベーコン 1パック', { cut: '1cm幅', order: 2 }),
      i('カットトマト缶', 1, 'カットトマト缶 1缶', { order: 3 }),
      i('顆粒コンソメ', 6, '顆粒コンソメ 小さじ2', { order: 3 }),
      i('塩', 2, '塩 少々（味を見て）', { order: 3 }),
    ],
    prep: ['玉ねぎ、にんじん、キャベツは 1cm 角、ベーコンは 1cm 幅に切る'],
    cook: ['内鍋に材料をすべて入れ、水 200ml を加えて加熱する', '味を見て塩で整える'],
  },
  {
    key: 'tonjiru',
    title: '豚汁',
    servings: 3,
    caloriesKcal: 220,
    hotcookMode: '手動 > スープを作る > まぜない > 20分',
    maxServings1_6l: 4,
    ingredients: [
      i('大根', 0.15, '大根 5cm', { cut: 'いちょう切り', order: 1 }),
      i('にんじん', 0.5, 'にんじん 1/2本', { cut: 'いちょう切り', order: 1 }),
      i('ごぼう', 0.5, 'ごぼう 1/2本', { cut: 'ささがき', order: 1 }),
      i('豚バラ薄切り肉', 100, '豚バラ薄切り肉 100g', { cut: '3cm幅', order: 2 }),
      i('長ねぎ', 0.5, '長ねぎ 1/2本', { cut: '小口切り', order: 0 }),
      i('顆粒だし', 3, '顆粒だし 小さじ1', { order: 3 }),
      i('味噌', 45, '味噌 大さじ2と1/2', { order: 0 }),
    ],
    prep: ['大根とにんじんはいちょう切り、ごぼうはささがき、豚肉は 3cm 幅、長ねぎは小口切りにする'],
    cook: ['内鍋に根菜、豚肉、顆粒だしを入れ、水 600ml を注いで加熱する', '加熱後に味噌を溶き入れ、長ねぎを散らす'],
  },
  {
    key: 'salmon-cabbage-butter',
    title: '鮭とキャベツのバター蒸し',
    servings: 2,
    caloriesKcal: 300,
    hotcookMode: '手動 > 煮物を作る > まぜない > 10分',
    maxServings1_6l: 3,
    ingredients: [
      i('キャベツ', 0.2, 'キャベツ 1/5個', { cut: 'ざく切り', order: 1 }),
      i('しめじ', 1, 'しめじ 1パック', { cut: '石づきを取ってほぐす', order: 1 }),
      i('鮭（切り身）', 2, '生鮭 2切れ', { order: 2 }),
      i('酒', 15, '酒 大さじ1', { order: 3 }),
      i('しょうゆ', 15, 'しょうゆ 大さじ1', { order: 0 }),
      i('バター', 20, 'バター 20g', { order: 3 }),
      i('こしょう', null, 'こしょう 少々', { order: 3 }),
    ],
    prep: ['キャベツはざく切り、しめじはほぐす。鮭は水気をふいてこしょうをふる'],
    cook: ['内鍋にキャベツとしめじを敷き、鮭をのせて酒をふり、バターをのせる', '加熱後、しょうゆを回しかける'],
  },
  {
    key: 'chicken-tomato',
    title: '鶏むね肉のトマト煮',
    servings: 3,
    caloriesKcal: 280,
    hotcookMode: '手動 > 煮物を作る > まぜる > 15分',
    maxServings1_6l: 4,
    packSeasonings: true,
    ingredients: [
      i('玉ねぎ', 1, '玉ねぎ 1個', { cut: '薄切り', order: 1 }),
      i('しめじ', 1, 'しめじ 1パック', { cut: 'ほぐす', order: 1 }),
      i('鶏むね肉', 1, '鶏むね肉 1枚', { cut: 'そぎ切り', order: 2 }),
      i('にんにく', 1, 'にんにく 1片', { cut: 'みじん切り', order: 2 }),
      i('カットトマト缶', 1, 'カットトマト缶 1缶', { order: 3 }),
      i('顆粒コンソメ', 4, '顆粒コンソメ 小さじ1強', { order: 3 }),
      i('ケチャップ', 15, 'ケチャップ 大さじ1', { order: 3 }),
      i('砂糖', 3, '砂糖 小さじ1', { order: 3 }),
    ],
    prep: ['玉ねぎは薄切り、しめじはほぐす。鶏むね肉はそぎ切り、にんにくはみじん切りにする'],
    cook: ['内鍋に材料をすべて入れて加熱する（水は入れない）'],
  },
  {
    key: 'kabocha-nimono',
    title: 'かぼちゃの煮物',
    servings: 3,
    caloriesKcal: 150,
    hotcookMode: '手動 > 煮物を作る > まぜない > 15分',
    maxServings1_6l: 6,
    ingredients: [
      i('かぼちゃ', 0.25, 'かぼちゃ 1/4個', { cut: 'ひと口大', order: 1 }),
      i('しょうゆ', 15, 'しょうゆ 大さじ1', { order: 2 }),
      i('みりん', 15, 'みりん 大さじ1', { order: 2 }),
      i('砂糖', 9, '砂糖 大さじ1', { order: 2 }),
      i('顆粒だし', 2, '顆粒だし 小さじ1/2強', { order: 2 }),
    ],
    prep: ['かぼちゃは種とわたを取り、ひと口大に切る'],
    cook: ['内鍋にかぼちゃを皮を下にして並べ、調味料と水 100ml を入れて加熱する'],
  },
  {
    key: 'mapo-tofu',
    title: '麻婆豆腐',
    servings: 2,
    caloriesKcal: 420,
    hotcookMode: '手動 > 煮物を作る > まぜる > 10分',
    maxServings1_6l: 3,
    ingredients: [
      i('豚ひき肉', 150, '豚ひき肉 150g', { order: 1 }),
      i('長ねぎ', 0.5, '長ねぎ 1/2本', { cut: 'みじん切り', order: 1 }),
      i('にんにく', 1, 'にんにく 1片', { cut: 'みじん切り', order: 1 }),
      i('しょうが', 5, 'しょうが 1/2かけ', { cut: 'みじん切り', order: 1 }),
      i('味噌', 18, '味噌 大さじ1', { order: 2 }),
      i('しょうゆ', 15, 'しょうゆ 大さじ1', { order: 2 }),
      i('オイスターソース', 9, 'オイスターソース 大さじ1/2', { order: 2 }),
      i('砂糖', 5, '砂糖 小さじ1と1/2', { order: 2 }),
      i('鶏がらスープの素', 3, '鶏がらスープの素 小さじ1', { order: 2 }),
      i('木綿豆腐', 1, '木綿豆腐 1丁', { cut: '2cm角', order: 3 }),
      i('片栗粉', 9, '片栗粉 大さじ1（水大さじ2で溶く）', { order: 0 }),
      i('ごま油', 5, 'ごま油 小さじ1', { order: 0 }),
    ],
    prep: ['長ねぎ、にんにく、しょうがはみじん切り、豆腐は 2cm 角に切る'],
    cook: [
      '内鍋にひき肉、香味野菜、調味料、水 150ml を入れてよくまぜ、豆腐をのせる',
      'まぜ技ユニットを付けて加熱する',
      '水溶き片栗粉を回し入れ、まぜる 3 分を追加する。仕上げにごま油',
    ],
  },
  {
    key: 'hakusai-porkbelly',
    title: '白菜と豚バラの重ね煮',
    servings: 2,
    caloriesKcal: 450,
    hotcookMode: '手動 > 煮物を作る > まぜない > 20分',
    maxServings1_6l: 3,
    packSeasonings: true,
    ingredients: [
      i('白菜', 0.25, '白菜 1/4個', { cut: '5cm幅', order: 1 }),
      i('豚バラ薄切り肉', 200, '豚バラ薄切り肉 200g', { cut: '5cm幅', order: 1 }),
      i('しょうが', 10, 'しょうが 1かけ', { cut: '千切り', order: 1 }),
      i('鶏がらスープの素', 6, '鶏がらスープの素 小さじ2', { order: 2 }),
      i('酒', 30, '酒 大さじ2', { order: 2 }),
      i('ごま油', 5, 'ごま油 小さじ1', { order: 0 }),
    ],
    prep: ['白菜と豚肉は 5cm 幅、しょうがは千切りにする'],
    cook: [
      '内鍋に白菜と豚肉を交互に重ね、しょうがを散らす',
      '鶏がらスープの素、酒、水 100ml を入れて加熱する',
      '仕上げにごま油をたらす',
    ],
  },
  {
    key: 'tebamoto-sappari',
    title: '手羽元のさっぱり煮',
    servings: 2,
    caloriesKcal: 350,
    hotcookMode: '手動 > 煮物を作る > まぜない > 30分',
    maxServings1_6l: 3,
    packSeasonings: true,
    ingredients: [
      i('手羽元', 6, '手羽元 6本', { order: 1 }),
      i('にんにく', 1, 'にんにく 1片', { cut: '包丁の腹でつぶす', order: 1 }),
      i('しょうが', 10, 'しょうが 1かけ', { cut: '薄切り', order: 1 }),
      i('酢', 50, '酢 50ml', { order: 2 }),
      i('しょうゆ', 50, 'しょうゆ 50ml', { order: 2 }),
      i('砂糖', 18, '砂糖 大さじ2', { order: 2 }),
      i('酒', 30, '酒 大さじ2', { order: 2 }),
    ],
    prep: ['手羽元は骨に沿って切り込みを入れる。しょうがは薄切り、にんにくはつぶす'],
    cook: ['内鍋に材料をすべて入れ、水 50ml を加えて加熱する'],
  },
  {
    key: 'saba-miso',
    title: 'さばの味噌煮',
    servings: 2,
    caloriesKcal: 320,
    hotcookMode: '手動 > 煮物を作る > まぜない > 15分',
    maxServings1_6l: 4,
    packSeasonings: true,
    ingredients: [
      i('長ねぎ', 0.5, '長ねぎ 1/2本', { cut: '4cm長さ', order: 1 }),
      i('さば（切り身）', 2, 'さば 2切れ', { cut: '皮に切り込み', order: 2 }),
      i('しょうが', 10, 'しょうが 1かけ', { cut: '薄切り', order: 2 }),
      i('味噌', 36, '味噌 大さじ2', { order: 3 }),
      i('砂糖', 9, '砂糖 大さじ1', { order: 3 }),
      i('酒', 30, '酒 大さじ2', { order: 3 }),
      i('みりん', 15, 'みりん 大さじ1', { order: 3 }),
    ],
    prep: ['さばは皮に切り込みを入れる。長ねぎは 4cm、しょうがは薄切りにする'],
    cook: [
      '味噌、砂糖、酒、みりん、水 100ml をまぜておく',
      '内鍋に長ねぎを敷き、さばを皮を上にして並べ、しょうがをのせて合わせ調味料をかけて加熱する',
    ],
  },
  {
    key: 'harusame-soup',
    title: '春雨と卵の中華スープ',
    servings: 2,
    caloriesKcal: 120,
    hotcookMode: '手動 > スープを作る > まぜない > 10分',
    maxServings1_6l: 4,
    ingredients: [
      i('えのき', 0.5, 'えのき 1/2パック', { cut: '3等分', order: 1 }),
      i('長ねぎ', 0.3, '長ねぎ 1/3本', { cut: '斜め薄切り', order: 1 }),
      i('春雨', 20, '春雨 20g', { order: 2 }),
      i('鶏がらスープの素', 6, '鶏がらスープの素 小さじ2', { order: 2 }),
      i('しょうゆ', 5, 'しょうゆ 小さじ1', { order: 2 }),
      i('卵', 1, '卵 1個', { order: 0 }),
      i('ごま油', 5, 'ごま油 小さじ1', { order: 0 }),
    ],
    prep: ['えのきは 3 等分、長ねぎは斜め薄切りにする'],
    cook: [
      '内鍋にえのき、長ねぎ、春雨（乾燥のまま）、調味料と水 500ml を入れて加熱する',
      '加熱後、溶き卵を回し入れて 1 分ほど保温し、ごま油をたらす',
    ],
  },
  {
    key: 'ratatouille',
    title: 'ラタトゥイユ',
    servings: 3,
    caloriesKcal: 130,
    hotcookMode: '手動 > 煮物を作る > まぜる > 15分',
    maxServings1_6l: 5,
    ingredients: [
      i('なす', 2, 'なす 2本', { cut: '乱切り', order: 1 }),
      i('ピーマン', 2, 'ピーマン 2個', { cut: '乱切り', order: 1 }),
      i('玉ねぎ', 1, '玉ねぎ 1個', { cut: 'くし形切り', order: 1 }),
      i('にんにく', 1, 'にんにく 1片', { cut: 'みじん切り', order: 1 }),
      i('カットトマト缶', 1, 'カットトマト缶 1缶', { order: 2 }),
      i('顆粒コンソメ', 4, '顆粒コンソメ 小さじ1強', { order: 2 }),
      i('塩', 2, '塩 少々', { order: 2 }),
      i('サラダ油', 15, 'オリーブオイル 大さじ1', { order: 2 }),
    ],
    prep: ['なす、ピーマンは乱切り、玉ねぎはくし形、にんにくはみじん切りにする'],
    cook: ['内鍋に材料をすべて入れて加熱する（水は入れない）'],
  },
  {
    key: 'chikuzenni',
    title: '筑前煮',
    servings: 3,
    caloriesKcal: 300,
    hotcookMode: '手動 > 煮物を作る > まぜる > 20分',
    maxServings1_6l: 4,
    ingredients: [
      i('ごぼう', 0.5, 'ごぼう 1/2本', { cut: '乱切り', order: 1 }),
      i('れんこん', 150, 'れんこん 150g', { cut: '乱切り', order: 1 }),
      i('にんじん', 1, 'にんじん 1本', { cut: '乱切り', order: 1 }),
      i('まいたけ', 1, 'まいたけ 1パック', { cut: 'ほぐす', order: 1 }),
      i('鶏もも肉', 1, '鶏もも肉 1枚', { cut: 'ひと口大', order: 2 }),
      i('しょうゆ', 30, 'しょうゆ 大さじ2', { order: 3 }),
      i('みりん', 30, 'みりん 大さじ2', { order: 3 }),
      i('砂糖', 9, '砂糖 大さじ1', { order: 3 }),
      i('酒', 15, '酒 大さじ1', { order: 3 }),
      i('顆粒だし', 3, '顆粒だし 小さじ1', { order: 3 }),
    ],
    prep: [
      'ごぼう、れんこん、にんじんは乱切り（ごぼうとれんこんは水にさらす）、まいたけはほぐす',
      '鶏肉はひと口大に切る',
    ],
    cook: ['内鍋に野菜、鶏肉の順に入れ、調味料と水 100ml を加えて加熱する'],
  },
  {
    key: 'spinach-aburaage',
    title: 'ほうれん草と油揚げの煮びたし',
    servings: 2,
    caloriesKcal: 80,
    hotcookMode: '手動 > 煮物を作る > まぜない > 5分',
    maxServings1_6l: 4,
    ingredients: [
      i('油揚げ', 1, '油揚げ 1枚', { cut: '短冊切り', order: 1 }),
      i('ほうれん草', 1, 'ほうれん草 1袋', { cut: '4cm長さ', order: 2 }),
      i('めんつゆ', 30, 'めんつゆ（3倍濃縮）大さじ2', { order: 3 }),
    ],
    prep: ['ほうれん草は 4cm 長さ、油揚げは短冊に切る'],
    cook: ['内鍋に油揚げ、ほうれん草の順に入れ、めんつゆと水 100ml を加えて加熱する'],
  },
]
