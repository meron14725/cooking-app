/**
 * 食材マスタの分類（category）を名前から AI を使わずに決める（docs/design/09-recommendation-v2.md
 * 「食材マスタの手直し」）。COCORO の取り込みで判定できなかった食材が vegetable になっているので、
 * vegetable の行だけを直す。決められなければ null を返し、AI に回す。
 */
import type { Category } from '../schemas/ingredient'

const norm = (s: string) => s.normalize('NFKC')

/** 上から順に見る（「油揚げ」「塩さば」を調味料の「油」「塩」より先に判定するため） */
const RULES: { category: Category; pattern: RegExp }[] = [
  {
    category: 'tofu_egg_dairy',
    pattern: /豆腐|厚揚げ|油揚げ|がんも|卵|たまご|玉子|牛乳|チーズ|バター|ヨーグルト|生クリーム|豆乳|納豆|おから/,
  },
  {
    category: 'fish',
    pattern:
      /鮭|サーモン|さば|鯖|たら(?!こ)|鱈|ぶり|鰤|あじ|鯵|いわし|鰯|さんま|秋刀魚|えび|海老|エビ|(?<!す)いか|イカ|たこ|タコ|ほたて|帆立|あさり|しじみ|かに|カニ|ツナ|しらす|ちりめん|たらこ|明太|かまぼこ|ちくわ|はんぺん|かじき|まぐろ|鯛/,
  },
  {
    category: 'meat',
    pattern:
      /肉|ひき肉|挽肉|ミンチ|ベーコン|ハム|ソーセージ|ウインナー|ウィンナー|手羽|ささみ|レバー|砂肝|鶏もも|鶏むね|豚バラ|ロース/,
  },
  {
    category: 'seasoning',
    pattern:
      /砂糖|グラニュー糖|きび糖|三温糖|塩|しょうゆ|醤油|みりん|酢|味噌|みそ|酒|こしょう|胡椒|ソース|ケチャップ|マヨネーズ|だし|コンソメ|ブイヨン|鶏がら|ガラスープ|顆粒|オイスター|豆板醤|甜麺醤|コチュジャン|ナンプラー|カレー粉|油|オイル|香料|バニラ|エッセンス|片栗粉|小麦粉|薄力粉|強力粉|米粉|ベーキングパウダー|はちみつ|蜂蜜|めんつゆ|ポン酢|わさび|からし|辛子|スパイス|パウダー|ハーブ|ローリエ|シナモン|ナツメグ|クミン|ターメリック|ガラムマサラ|一味|七味|ラー油|ゼラチン|水あめ|メープル|ジャム|もとの素|の素/,
  },
  {
    category: 'dry',
    pattern:
      /かつお節|かつおぶし|削り節|昆布|干し椎茸|干ししいたけ|ひじき|わかめ|春雨|はるさめ|切り干し|高野豆腐|のり|海苔|ごま|胡麻|麩|寒天|乾燥/,
  },
  {
    category: 'other',
    pattern:
      /りんご|林檎|バナナ|レモン|みかん|オレンジ|いちご|苺|ぶどう|葡萄|桃|梨|キウイ|パイナップル|すいか|スイカ|西瓜|メロン|ゆず|柚子|ナッツ|アーモンド|くるみ|胡桃|ピーナッツ|カシューナッツ|レーズン|プルーン|栗|米$|^米|ごはん|ご飯|もち|餅|パスタ|スパゲ|うどん|そば|マカロニ|パン|カレールウ|ルウ|ルー|こんにゃく|しらたき|^水$|^お?湯$|ワイン|ビール/,
  },
  {
    category: 'vegetable',
    pattern:
      /玉ねぎ|たまねぎ|にんじん|人参|じゃがいも|さつまいも|かぼちゃ|キャベツ|白菜|大根|ねぎ|ネギ|ブロッコリー|ほうれん草|小松菜|チンゲン菜|もやし|なす|茄子|ピーマン|パプリカ|トマト|ごぼう|れんこん|しめじ|えのき|まいたけ|舞茸|しいたけ|椎茸|エリンギ|マッシュルーム|きのこ|しょうが|生姜|にんにく|きゅうり|ズッキーニ|オクラ|アスパラ|セロリ|レタス|水菜|春菊|ニラ|にら|かぶ|里芋|さといも|長芋|山芋|枝豆|いんげん|そら豆|グリーンピース|とうもろこし|コーン|カリフラワー|貝割れ|かいわれ|豆苗|みょうが|大葉|しそ|三つ葉|パセリ|ゴーヤ|冬瓜|たけのこ|筍|ルッコラ|クレソン|モロヘイヤ|菜の花|ビーツ|ラディッシュ/,
  },
]

/** 名前から分類を決める。どれにも当たらなければ null */
export function categoryByName(name: string): Category | null {
  const n = norm(name)
  return RULES.find((r) => r.pattern.test(n))?.category ?? null
}

export type IngredientAttributeInput = {
  name: string
  category: Category
  unit: string
  gramsPerUnit: number | null
}

export type IngredientAttributeResult = {
  category: Category
  gramsPerUnit: number | null
  /** ルールで決めきれず、AI に聞く必要があるか */
  needsAi: boolean
}

/**
 * ルールで直す。vegetable 以外は登録したときに分類を選んでいるので、そのまま残す。
 * vegetable は名前から決め直し、名前で決まらなければ AI に回す。
 * g・ml 以外の単位で 1 つあたりの重さがなければ、重さも AI に回す
 */
export function fixIngredientByRule(i: IngredientAttributeInput): IngredientAttributeResult {
  let category = i.category
  let needsAi = false
  if (i.category === 'vegetable') {
    const byName = categoryByName(i.name)
    if (byName) category = byName
    else needsAi = true
  }
  const needsGrams = i.unit !== 'g' && i.unit !== 'ml' && i.gramsPerUnit === null
  return { category, gramsPerUnit: i.gramsPerUnit, needsAi: needsAi || needsGrams }
}
