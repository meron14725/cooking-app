import type { EstimateCaloriesInput } from '../../shared/schemas/recipeDraft'
import type { MasterRef } from './provider'

export const EXTRACT_SYSTEM = `あなたはホットクック（シャープの自動調理鍋、内鍋 1.6L）向けにレシピを整理するアシスタントです。
与えられたレシピページの内容から、指定の JSON 形式で 1 品分の下書きを作ってください。

- 材料の name は「食材マスタ」の名前に寄せる（例: たまねぎ → 玉ねぎ）。マスタにない食材は一般的な名前を新しく付ける。水は材料に入れず手順に書く
- 量はマスタの基準単位に直す。「1/2個」→ 0.5、マスタに 1 単位あたりの重さ（g）があれば「玉ねぎ 150g」→ 0.75（個）。大さじ 1 = 15ml、小さじ 1 = 5ml。直せなければ元の量と単位のまま返す。少々・適量は quantity と unit を null
- displayText は元の表記を短く（例: 玉ねぎ 1/2個）
- 手順は下ごしらえ（prep: 切る・下味など、調理の前日までにできること）と調理（cook: 内鍋に入れてから）に分け、短い文にする
- 元が鍋やフライパンのレシピなら、ホットクックの手順と設定（hotcookMode。例: 手動 > 煮物を作る > まぜる > 20分）に直し、直したことを warnings に書く
- maxServings1_6l は 1.6L の内鍋で一度に作れる最大の人数分の推定
- servings は材料の量が何人前か。書いていなければ推定して warnings に書く
- 揚げ物・焼き目が必要なものなどホットクックに向かない場合も、近い作り方にして warnings に書く
- 元のページにない情報を作り話で足さない。分からない値は null`

export function extractPrompt(input: { url: string; text: string; ingredients: MasterRef[] }): string {
  const masters = input.ingredients
    .map((m) => `${m.name}（${m.unit}${m.gramsPerUnit ? `、1${m.unit}≒${m.gramsPerUnit}g` : ''}）`)
    .join('、')
  return `## 食材マスタ（名前と基準単位）
${masters}

## レシピページ（${input.url}）
${input.text}`
}

export const CALORIE_SYSTEM = `あなたは管理栄養士です。材料と人数から 1 人前のカロリー（kcal、整数）を推定してください。
ごはんなど材料にないものは含めません。量が「少々」「適量」のものは一般的な量で見積もります。`

export function caloriePrompt(input: EstimateCaloriesInput): string {
  return `${input.servings} 人前の材料:
${input.ingredients.map((i) => `- ${i.displayText}`).join('\n')}`
}
