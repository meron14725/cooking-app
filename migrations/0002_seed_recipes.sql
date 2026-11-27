-- 基本レシピの初期データ（scripts/generate-recipe-seed-sql.ts で生成。設定やカロリーは目安なので画面で直す）
-- id は固定。すでにあれば何もしない（削除済みのものも戻さない）
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-nikujaga', '肉じゃが', 3, 380, 1, '手動 > 煮物を作る > まぜる > 25分', 4, 0, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-nikujaga-i1', 'seed-recipe-nikujaga', ingredients.id, 3, 'じゃがいも 3個', '4等分', 1, 0 FROM ingredients WHERE ingredients.name = 'じゃがいも' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-nikujaga-i2', 'seed-recipe-nikujaga', ingredients.id, 1, 'にんじん 1本', '乱切り', 1, 1 FROM ingredients WHERE ingredients.name = 'にんじん' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-nikujaga-i3', 'seed-recipe-nikujaga', ingredients.id, 1, '玉ねぎ 1個', 'くし形切り', 1, 2 FROM ingredients WHERE ingredients.name = '玉ねぎ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-nikujaga-i4', 'seed-recipe-nikujaga', ingredients.id, 150, '豚こま切れ肉 150g', NULL, 2, 3 FROM ingredients WHERE ingredients.name = '豚こま切れ肉' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-nikujaga-i5', 'seed-recipe-nikujaga', ingredients.id, 30, 'しょうゆ 大さじ2', NULL, 3, 4 FROM ingredients WHERE ingredients.name = 'しょうゆ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-nikujaga-i6', 'seed-recipe-nikujaga', ingredients.id, 30, 'みりん 大さじ2', NULL, 3, 5 FROM ingredients WHERE ingredients.name = 'みりん' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-nikujaga-i7', 'seed-recipe-nikujaga', ingredients.id, 15, '酒 大さじ1', NULL, 3, 6 FROM ingredients WHERE ingredients.name = '酒' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-nikujaga-i8', 'seed-recipe-nikujaga', ingredients.id, 9, '砂糖 大さじ1', NULL, 3, 7 FROM ingredients WHERE ingredients.name = '砂糖' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-nikujaga-s1', 'seed-recipe-nikujaga', 1, 'prep', 'じゃがいもは皮をむいて 4 等分、にんじんは乱切り、玉ねぎはくし形に切る') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-nikujaga-s2', 'seed-recipe-nikujaga', 2, 'cook', '内鍋に野菜、豚肉の順に入れ、調味料と水 50ml を回しかける') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-nikujaga-s3', 'seed-recipe-nikujaga', 3, 'cook', 'まぜ技ユニットを付けて加熱する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-nikujaga-s4', 'seed-recipe-nikujaga', 4, 'cook', '加熱後、味がなじむまで 10 分ほど保温する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-chicken-daikon', '鶏もも肉と大根の煮物', 2, 400, 1, '手動 > 煮物を作る > まぜない > 30分', 4, 0, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-daikon-i1', 'seed-recipe-chicken-daikon', ingredients.id, 0.3, '大根 1/3本', '半月切り（2cm）', 1, 0 FROM ingredients WHERE ingredients.name = '大根' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-daikon-i2', 'seed-recipe-chicken-daikon', ingredients.id, 1, '鶏もも肉 1枚', 'ひと口大', 2, 1 FROM ingredients WHERE ingredients.name = '鶏もも肉' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-daikon-i3', 'seed-recipe-chicken-daikon', ingredients.id, 10, 'しょうが 1かけ', '薄切り', 2, 2 FROM ingredients WHERE ingredients.name = 'しょうが' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-daikon-i4', 'seed-recipe-chicken-daikon', ingredients.id, 30, 'しょうゆ 大さじ2', NULL, 3, 3 FROM ingredients WHERE ingredients.name = 'しょうゆ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-daikon-i5', 'seed-recipe-chicken-daikon', ingredients.id, 30, 'みりん 大さじ2', NULL, 3, 4 FROM ingredients WHERE ingredients.name = 'みりん' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-daikon-i6', 'seed-recipe-chicken-daikon', ingredients.id, 30, '酒 大さじ2', NULL, 3, 5 FROM ingredients WHERE ingredients.name = '酒' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-daikon-i7', 'seed-recipe-chicken-daikon', ingredients.id, 6, '砂糖 小さじ2', NULL, 3, 6 FROM ingredients WHERE ingredients.name = '砂糖' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-chicken-daikon-s1', 'seed-recipe-chicken-daikon', 1, 'prep', '大根は皮をむいて 2cm の半月切り、鶏肉はひと口大、しょうがは薄切りにする') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-chicken-daikon-s2', 'seed-recipe-chicken-daikon', 2, 'cook', '内鍋に大根を敷き、鶏肉としょうがをのせる') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-chicken-daikon-s3', 'seed-recipe-chicken-daikon', 3, 'cook', '調味料と水 100ml を入れて加熱する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-pork-curry', 'ポークカレー', 4, 600, 1, '手動 > 煮物を作る > まぜる > 15分', 4, 0, 'seed', NULL, 'ごはんは別に炊く。カロリーはごはん 200g 込みの目安') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-pork-curry-i1', 'seed-recipe-pork-curry', ingredients.id, 2, '玉ねぎ 2個', 'くし形切り', 1, 0 FROM ingredients WHERE ingredients.name = '玉ねぎ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-pork-curry-i2', 'seed-recipe-pork-curry', ingredients.id, 2, 'じゃがいも 2個', 'ひと口大', 1, 1 FROM ingredients WHERE ingredients.name = 'じゃがいも' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-pork-curry-i3', 'seed-recipe-pork-curry', ingredients.id, 1, 'にんじん 1本', '乱切り', 1, 2 FROM ingredients WHERE ingredients.name = 'にんじん' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-pork-curry-i4', 'seed-recipe-pork-curry', ingredients.id, 200, '豚こま切れ肉 200g', NULL, 2, 3 FROM ingredients WHERE ingredients.name = '豚こま切れ肉' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-pork-curry-i5', 'seed-recipe-pork-curry', ingredients.id, 4, 'カレールウ 4皿分', NULL, 3, 4 FROM ingredients WHERE ingredients.name = 'カレールウ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-pork-curry-s1', 'seed-recipe-pork-curry', 1, 'prep', '玉ねぎはくし形、じゃがいもはひと口大、にんじんは乱切りにする') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-pork-curry-s2', 'seed-recipe-pork-curry', 2, 'cook', '内鍋に野菜、豚肉の順に入れ、水 400ml を注ぐ') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-pork-curry-s3', 'seed-recipe-pork-curry', 3, 'cook', 'まぜ技ユニットを付けて加熱する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-pork-curry-s4', 'seed-recipe-pork-curry', 4, 'cook', '加熱後にルウを割り入れ、まぜる 5 分を追加する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-minestrone', 'ミネストローネ', 3, 150, 1, '手動 > スープを作る > まぜる > 20分', 4, 0, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-minestrone-i1', 'seed-recipe-minestrone', ingredients.id, 1, '玉ねぎ 1個', '1cm角', 1, 0 FROM ingredients WHERE ingredients.name = '玉ねぎ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-minestrone-i2', 'seed-recipe-minestrone', ingredients.id, 0.5, 'にんじん 1/2本', '1cm角', 1, 1 FROM ingredients WHERE ingredients.name = 'にんじん' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-minestrone-i3', 'seed-recipe-minestrone', ingredients.id, 0.15, 'キャベツ 2〜3枚', '1cm角', 1, 2 FROM ingredients WHERE ingredients.name = 'キャベツ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-minestrone-i4', 'seed-recipe-minestrone', ingredients.id, 70, 'ベーコン 1パック', '1cm幅', 2, 3 FROM ingredients WHERE ingredients.name = 'ベーコン' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-minestrone-i5', 'seed-recipe-minestrone', ingredients.id, 1, 'カットトマト缶 1缶', NULL, 3, 4 FROM ingredients WHERE ingredients.name = 'カットトマト缶' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-minestrone-i6', 'seed-recipe-minestrone', ingredients.id, 6, '顆粒コンソメ 小さじ2', NULL, 3, 5 FROM ingredients WHERE ingredients.name = '顆粒コンソメ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-minestrone-i7', 'seed-recipe-minestrone', ingredients.id, 2, '塩 少々（味を見て）', NULL, 3, 6 FROM ingredients WHERE ingredients.name = '塩' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-minestrone-s1', 'seed-recipe-minestrone', 1, 'prep', '玉ねぎ、にんじん、キャベツは 1cm 角、ベーコンは 1cm 幅に切る') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-minestrone-s2', 'seed-recipe-minestrone', 2, 'cook', '内鍋に材料をすべて入れ、水 200ml を加えて加熱する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-minestrone-s3', 'seed-recipe-minestrone', 3, 'cook', '味を見て塩で整える') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-tonjiru', '豚汁', 3, 220, 1, '手動 > スープを作る > まぜない > 20分', 4, 0, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tonjiru-i1', 'seed-recipe-tonjiru', ingredients.id, 0.15, '大根 5cm', 'いちょう切り', 1, 0 FROM ingredients WHERE ingredients.name = '大根' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tonjiru-i2', 'seed-recipe-tonjiru', ingredients.id, 0.5, 'にんじん 1/2本', 'いちょう切り', 1, 1 FROM ingredients WHERE ingredients.name = 'にんじん' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tonjiru-i3', 'seed-recipe-tonjiru', ingredients.id, 0.5, 'ごぼう 1/2本', 'ささがき', 1, 2 FROM ingredients WHERE ingredients.name = 'ごぼう' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tonjiru-i4', 'seed-recipe-tonjiru', ingredients.id, 100, '豚バラ薄切り肉 100g', '3cm幅', 2, 3 FROM ingredients WHERE ingredients.name = '豚バラ薄切り肉' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tonjiru-i5', 'seed-recipe-tonjiru', ingredients.id, 0.5, '長ねぎ 1/2本', '小口切り', 0, 4 FROM ingredients WHERE ingredients.name = '長ねぎ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tonjiru-i6', 'seed-recipe-tonjiru', ingredients.id, 3, '顆粒だし 小さじ1', NULL, 3, 5 FROM ingredients WHERE ingredients.name = '顆粒だし' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tonjiru-i7', 'seed-recipe-tonjiru', ingredients.id, 45, '味噌 大さじ2と1/2', NULL, 0, 6 FROM ingredients WHERE ingredients.name = '味噌' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-tonjiru-s1', 'seed-recipe-tonjiru', 1, 'prep', '大根とにんじんはいちょう切り、ごぼうはささがき、豚肉は 3cm 幅、長ねぎは小口切りにする') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-tonjiru-s2', 'seed-recipe-tonjiru', 2, 'cook', '内鍋に根菜、豚肉、顆粒だしを入れ、水 600ml を注いで加熱する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-tonjiru-s3', 'seed-recipe-tonjiru', 3, 'cook', '加熱後に味噌を溶き入れ、長ねぎを散らす') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-salmon-cabbage-butter', '鮭とキャベツのバター蒸し', 2, 300, 1, '手動 > 煮物を作る > まぜない > 10分', 3, 0, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-salmon-cabbage-butter-i1', 'seed-recipe-salmon-cabbage-butter', ingredients.id, 0.2, 'キャベツ 1/5個', 'ざく切り', 1, 0 FROM ingredients WHERE ingredients.name = 'キャベツ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-salmon-cabbage-butter-i2', 'seed-recipe-salmon-cabbage-butter', ingredients.id, 1, 'しめじ 1パック', '石づきを取ってほぐす', 1, 1 FROM ingredients WHERE ingredients.name = 'しめじ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-salmon-cabbage-butter-i3', 'seed-recipe-salmon-cabbage-butter', ingredients.id, 2, '生鮭 2切れ', NULL, 2, 2 FROM ingredients WHERE ingredients.name = '鮭（切り身）' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-salmon-cabbage-butter-i4', 'seed-recipe-salmon-cabbage-butter', ingredients.id, 15, '酒 大さじ1', NULL, 3, 3 FROM ingredients WHERE ingredients.name = '酒' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-salmon-cabbage-butter-i5', 'seed-recipe-salmon-cabbage-butter', ingredients.id, 15, 'しょうゆ 大さじ1', NULL, 0, 4 FROM ingredients WHERE ingredients.name = 'しょうゆ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-salmon-cabbage-butter-i6', 'seed-recipe-salmon-cabbage-butter', ingredients.id, 20, 'バター 20g', NULL, 3, 5 FROM ingredients WHERE ingredients.name = 'バター' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-salmon-cabbage-butter-i7', 'seed-recipe-salmon-cabbage-butter', ingredients.id, NULL, 'こしょう 少々', NULL, 3, 6 FROM ingredients WHERE ingredients.name = 'こしょう' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-salmon-cabbage-butter-s1', 'seed-recipe-salmon-cabbage-butter', 1, 'prep', 'キャベツはざく切り、しめじはほぐす。鮭は水気をふいてこしょうをふる') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-salmon-cabbage-butter-s2', 'seed-recipe-salmon-cabbage-butter', 2, 'cook', '内鍋にキャベツとしめじを敷き、鮭をのせて酒をふり、バターをのせる') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-salmon-cabbage-butter-s3', 'seed-recipe-salmon-cabbage-butter', 3, 'cook', '加熱後、しょうゆを回しかける') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-chicken-tomato', '鶏むね肉のトマト煮', 3, 280, 1, '手動 > 煮物を作る > まぜる > 15分', 4, 1, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-tomato-i1', 'seed-recipe-chicken-tomato', ingredients.id, 1, '玉ねぎ 1個', '薄切り', 1, 0 FROM ingredients WHERE ingredients.name = '玉ねぎ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-tomato-i2', 'seed-recipe-chicken-tomato', ingredients.id, 1, 'しめじ 1パック', 'ほぐす', 1, 1 FROM ingredients WHERE ingredients.name = 'しめじ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-tomato-i3', 'seed-recipe-chicken-tomato', ingredients.id, 1, '鶏むね肉 1枚', 'そぎ切り', 2, 2 FROM ingredients WHERE ingredients.name = '鶏むね肉' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-tomato-i4', 'seed-recipe-chicken-tomato', ingredients.id, 1, 'にんにく 1片', 'みじん切り', 2, 3 FROM ingredients WHERE ingredients.name = 'にんにく' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-tomato-i5', 'seed-recipe-chicken-tomato', ingredients.id, 1, 'カットトマト缶 1缶', NULL, 3, 4 FROM ingredients WHERE ingredients.name = 'カットトマト缶' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-tomato-i6', 'seed-recipe-chicken-tomato', ingredients.id, 4, '顆粒コンソメ 小さじ1強', NULL, 3, 5 FROM ingredients WHERE ingredients.name = '顆粒コンソメ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-tomato-i7', 'seed-recipe-chicken-tomato', ingredients.id, 15, 'ケチャップ 大さじ1', NULL, 3, 6 FROM ingredients WHERE ingredients.name = 'ケチャップ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chicken-tomato-i8', 'seed-recipe-chicken-tomato', ingredients.id, 3, '砂糖 小さじ1', NULL, 3, 7 FROM ingredients WHERE ingredients.name = '砂糖' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-chicken-tomato-s1', 'seed-recipe-chicken-tomato', 1, 'prep', '玉ねぎは薄切り、しめじはほぐす。鶏むね肉はそぎ切り、にんにくはみじん切りにする') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-chicken-tomato-s2', 'seed-recipe-chicken-tomato', 2, 'cook', '内鍋に材料をすべて入れて加熱する（水は入れない）') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-kabocha-nimono', 'かぼちゃの煮物', 3, 150, 1, '手動 > 煮物を作る > まぜない > 15分', 6, 0, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-kabocha-nimono-i1', 'seed-recipe-kabocha-nimono', ingredients.id, 0.25, 'かぼちゃ 1/4個', 'ひと口大', 1, 0 FROM ingredients WHERE ingredients.name = 'かぼちゃ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-kabocha-nimono-i2', 'seed-recipe-kabocha-nimono', ingredients.id, 15, 'しょうゆ 大さじ1', NULL, 2, 1 FROM ingredients WHERE ingredients.name = 'しょうゆ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-kabocha-nimono-i3', 'seed-recipe-kabocha-nimono', ingredients.id, 15, 'みりん 大さじ1', NULL, 2, 2 FROM ingredients WHERE ingredients.name = 'みりん' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-kabocha-nimono-i4', 'seed-recipe-kabocha-nimono', ingredients.id, 9, '砂糖 大さじ1', NULL, 2, 3 FROM ingredients WHERE ingredients.name = '砂糖' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-kabocha-nimono-i5', 'seed-recipe-kabocha-nimono', ingredients.id, 2, '顆粒だし 小さじ1/2強', NULL, 2, 4 FROM ingredients WHERE ingredients.name = '顆粒だし' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-kabocha-nimono-s1', 'seed-recipe-kabocha-nimono', 1, 'prep', 'かぼちゃは種とわたを取り、ひと口大に切る') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-kabocha-nimono-s2', 'seed-recipe-kabocha-nimono', 2, 'cook', '内鍋にかぼちゃを皮を下にして並べ、調味料と水 100ml を入れて加熱する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-mapo-tofu', '麻婆豆腐', 2, 420, 1, '手動 > 煮物を作る > まぜる > 10分', 3, 0, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-mapo-tofu-i1', 'seed-recipe-mapo-tofu', ingredients.id, 150, '豚ひき肉 150g', NULL, 1, 0 FROM ingredients WHERE ingredients.name = '豚ひき肉' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-mapo-tofu-i2', 'seed-recipe-mapo-tofu', ingredients.id, 0.5, '長ねぎ 1/2本', 'みじん切り', 1, 1 FROM ingredients WHERE ingredients.name = '長ねぎ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-mapo-tofu-i3', 'seed-recipe-mapo-tofu', ingredients.id, 1, 'にんにく 1片', 'みじん切り', 1, 2 FROM ingredients WHERE ingredients.name = 'にんにく' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-mapo-tofu-i4', 'seed-recipe-mapo-tofu', ingredients.id, 5, 'しょうが 1/2かけ', 'みじん切り', 1, 3 FROM ingredients WHERE ingredients.name = 'しょうが' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-mapo-tofu-i5', 'seed-recipe-mapo-tofu', ingredients.id, 18, '味噌 大さじ1', NULL, 2, 4 FROM ingredients WHERE ingredients.name = '味噌' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-mapo-tofu-i6', 'seed-recipe-mapo-tofu', ingredients.id, 15, 'しょうゆ 大さじ1', NULL, 2, 5 FROM ingredients WHERE ingredients.name = 'しょうゆ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-mapo-tofu-i7', 'seed-recipe-mapo-tofu', ingredients.id, 9, 'オイスターソース 大さじ1/2', NULL, 2, 6 FROM ingredients WHERE ingredients.name = 'オイスターソース' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-mapo-tofu-i8', 'seed-recipe-mapo-tofu', ingredients.id, 5, '砂糖 小さじ1と1/2', NULL, 2, 7 FROM ingredients WHERE ingredients.name = '砂糖' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-mapo-tofu-i9', 'seed-recipe-mapo-tofu', ingredients.id, 3, '鶏がらスープの素 小さじ1', NULL, 2, 8 FROM ingredients WHERE ingredients.name = '鶏がらスープの素' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-mapo-tofu-i10', 'seed-recipe-mapo-tofu', ingredients.id, 1, '木綿豆腐 1丁', '2cm角', 3, 9 FROM ingredients WHERE ingredients.name = '木綿豆腐' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-mapo-tofu-i11', 'seed-recipe-mapo-tofu', ingredients.id, 9, '片栗粉 大さじ1（水大さじ2で溶く）', NULL, 0, 10 FROM ingredients WHERE ingredients.name = '片栗粉' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-mapo-tofu-i12', 'seed-recipe-mapo-tofu', ingredients.id, 5, 'ごま油 小さじ1', NULL, 0, 11 FROM ingredients WHERE ingredients.name = 'ごま油' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-mapo-tofu-s1', 'seed-recipe-mapo-tofu', 1, 'prep', '長ねぎ、にんにく、しょうがはみじん切り、豆腐は 2cm 角に切る') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-mapo-tofu-s2', 'seed-recipe-mapo-tofu', 2, 'cook', '内鍋にひき肉、香味野菜、調味料、水 150ml を入れてよくまぜ、豆腐をのせる') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-mapo-tofu-s3', 'seed-recipe-mapo-tofu', 3, 'cook', 'まぜ技ユニットを付けて加熱する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-mapo-tofu-s4', 'seed-recipe-mapo-tofu', 4, 'cook', '水溶き片栗粉を回し入れ、まぜる 3 分を追加する。仕上げにごま油') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-hakusai-porkbelly', '白菜と豚バラの重ね煮', 2, 450, 1, '手動 > 煮物を作る > まぜない > 20分', 3, 1, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-hakusai-porkbelly-i1', 'seed-recipe-hakusai-porkbelly', ingredients.id, 0.25, '白菜 1/4個', '5cm幅', 1, 0 FROM ingredients WHERE ingredients.name = '白菜' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-hakusai-porkbelly-i2', 'seed-recipe-hakusai-porkbelly', ingredients.id, 200, '豚バラ薄切り肉 200g', '5cm幅', 1, 1 FROM ingredients WHERE ingredients.name = '豚バラ薄切り肉' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-hakusai-porkbelly-i3', 'seed-recipe-hakusai-porkbelly', ingredients.id, 10, 'しょうが 1かけ', '千切り', 1, 2 FROM ingredients WHERE ingredients.name = 'しょうが' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-hakusai-porkbelly-i4', 'seed-recipe-hakusai-porkbelly', ingredients.id, 6, '鶏がらスープの素 小さじ2', NULL, 2, 3 FROM ingredients WHERE ingredients.name = '鶏がらスープの素' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-hakusai-porkbelly-i5', 'seed-recipe-hakusai-porkbelly', ingredients.id, 30, '酒 大さじ2', NULL, 2, 4 FROM ingredients WHERE ingredients.name = '酒' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-hakusai-porkbelly-i6', 'seed-recipe-hakusai-porkbelly', ingredients.id, 5, 'ごま油 小さじ1', NULL, 0, 5 FROM ingredients WHERE ingredients.name = 'ごま油' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-hakusai-porkbelly-s1', 'seed-recipe-hakusai-porkbelly', 1, 'prep', '白菜と豚肉は 5cm 幅、しょうがは千切りにする') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-hakusai-porkbelly-s2', 'seed-recipe-hakusai-porkbelly', 2, 'cook', '内鍋に白菜と豚肉を交互に重ね、しょうがを散らす') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-hakusai-porkbelly-s3', 'seed-recipe-hakusai-porkbelly', 3, 'cook', '鶏がらスープの素、酒、水 100ml を入れて加熱する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-hakusai-porkbelly-s4', 'seed-recipe-hakusai-porkbelly', 4, 'cook', '仕上げにごま油をたらす') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-tebamoto-sappari', '手羽元のさっぱり煮', 2, 350, 1, '手動 > 煮物を作る > まぜない > 30分', 3, 1, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tebamoto-sappari-i1', 'seed-recipe-tebamoto-sappari', ingredients.id, 6, '手羽元 6本', NULL, 1, 0 FROM ingredients WHERE ingredients.name = '手羽元' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tebamoto-sappari-i2', 'seed-recipe-tebamoto-sappari', ingredients.id, 1, 'にんにく 1片', '包丁の腹でつぶす', 1, 1 FROM ingredients WHERE ingredients.name = 'にんにく' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tebamoto-sappari-i3', 'seed-recipe-tebamoto-sappari', ingredients.id, 10, 'しょうが 1かけ', '薄切り', 1, 2 FROM ingredients WHERE ingredients.name = 'しょうが' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tebamoto-sappari-i4', 'seed-recipe-tebamoto-sappari', ingredients.id, 50, '酢 50ml', NULL, 2, 3 FROM ingredients WHERE ingredients.name = '酢' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tebamoto-sappari-i5', 'seed-recipe-tebamoto-sappari', ingredients.id, 50, 'しょうゆ 50ml', NULL, 2, 4 FROM ingredients WHERE ingredients.name = 'しょうゆ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tebamoto-sappari-i6', 'seed-recipe-tebamoto-sappari', ingredients.id, 18, '砂糖 大さじ2', NULL, 2, 5 FROM ingredients WHERE ingredients.name = '砂糖' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-tebamoto-sappari-i7', 'seed-recipe-tebamoto-sappari', ingredients.id, 30, '酒 大さじ2', NULL, 2, 6 FROM ingredients WHERE ingredients.name = '酒' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-tebamoto-sappari-s1', 'seed-recipe-tebamoto-sappari', 1, 'prep', '手羽元は骨に沿って切り込みを入れる。しょうがは薄切り、にんにくはつぶす') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-tebamoto-sappari-s2', 'seed-recipe-tebamoto-sappari', 2, 'cook', '内鍋に材料をすべて入れ、水 50ml を加えて加熱する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-saba-miso', 'さばの味噌煮', 2, 320, 1, '手動 > 煮物を作る > まぜない > 15分', 4, 1, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-saba-miso-i1', 'seed-recipe-saba-miso', ingredients.id, 0.5, '長ねぎ 1/2本', '4cm長さ', 1, 0 FROM ingredients WHERE ingredients.name = '長ねぎ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-saba-miso-i2', 'seed-recipe-saba-miso', ingredients.id, 2, 'さば 2切れ', '皮に切り込み', 2, 1 FROM ingredients WHERE ingredients.name = 'さば（切り身）' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-saba-miso-i3', 'seed-recipe-saba-miso', ingredients.id, 10, 'しょうが 1かけ', '薄切り', 2, 2 FROM ingredients WHERE ingredients.name = 'しょうが' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-saba-miso-i4', 'seed-recipe-saba-miso', ingredients.id, 36, '味噌 大さじ2', NULL, 3, 3 FROM ingredients WHERE ingredients.name = '味噌' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-saba-miso-i5', 'seed-recipe-saba-miso', ingredients.id, 9, '砂糖 大さじ1', NULL, 3, 4 FROM ingredients WHERE ingredients.name = '砂糖' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-saba-miso-i6', 'seed-recipe-saba-miso', ingredients.id, 30, '酒 大さじ2', NULL, 3, 5 FROM ingredients WHERE ingredients.name = '酒' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-saba-miso-i7', 'seed-recipe-saba-miso', ingredients.id, 15, 'みりん 大さじ1', NULL, 3, 6 FROM ingredients WHERE ingredients.name = 'みりん' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-saba-miso-s1', 'seed-recipe-saba-miso', 1, 'prep', 'さばは皮に切り込みを入れる。長ねぎは 4cm、しょうがは薄切りにする') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-saba-miso-s2', 'seed-recipe-saba-miso', 2, 'cook', '味噌、砂糖、酒、みりん、水 100ml をまぜておく') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-saba-miso-s3', 'seed-recipe-saba-miso', 3, 'cook', '内鍋に長ねぎを敷き、さばを皮を上にして並べ、しょうがをのせて合わせ調味料をかけて加熱する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-harusame-soup', '春雨と卵の中華スープ', 2, 120, 1, '手動 > スープを作る > まぜない > 10分', 4, 0, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-harusame-soup-i1', 'seed-recipe-harusame-soup', ingredients.id, 0.5, 'えのき 1/2パック', '3等分', 1, 0 FROM ingredients WHERE ingredients.name = 'えのき' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-harusame-soup-i2', 'seed-recipe-harusame-soup', ingredients.id, 0.3, '長ねぎ 1/3本', '斜め薄切り', 1, 1 FROM ingredients WHERE ingredients.name = '長ねぎ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-harusame-soup-i3', 'seed-recipe-harusame-soup', ingredients.id, 20, '春雨 20g', NULL, 2, 2 FROM ingredients WHERE ingredients.name = '春雨' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-harusame-soup-i4', 'seed-recipe-harusame-soup', ingredients.id, 6, '鶏がらスープの素 小さじ2', NULL, 2, 3 FROM ingredients WHERE ingredients.name = '鶏がらスープの素' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-harusame-soup-i5', 'seed-recipe-harusame-soup', ingredients.id, 5, 'しょうゆ 小さじ1', NULL, 2, 4 FROM ingredients WHERE ingredients.name = 'しょうゆ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-harusame-soup-i6', 'seed-recipe-harusame-soup', ingredients.id, 1, '卵 1個', NULL, 0, 5 FROM ingredients WHERE ingredients.name = '卵' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-harusame-soup-i7', 'seed-recipe-harusame-soup', ingredients.id, 5, 'ごま油 小さじ1', NULL, 0, 6 FROM ingredients WHERE ingredients.name = 'ごま油' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-harusame-soup-s1', 'seed-recipe-harusame-soup', 1, 'prep', 'えのきは 3 等分、長ねぎは斜め薄切りにする') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-harusame-soup-s2', 'seed-recipe-harusame-soup', 2, 'cook', '内鍋にえのき、長ねぎ、春雨（乾燥のまま）、調味料と水 500ml を入れて加熱する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-harusame-soup-s3', 'seed-recipe-harusame-soup', 3, 'cook', '加熱後、溶き卵を回し入れて 1 分ほど保温し、ごま油をたらす') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-ratatouille', 'ラタトゥイユ', 3, 130, 1, '手動 > 煮物を作る > まぜる > 15分', 5, 0, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-ratatouille-i1', 'seed-recipe-ratatouille', ingredients.id, 2, 'なす 2本', '乱切り', 1, 0 FROM ingredients WHERE ingredients.name = 'なす' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-ratatouille-i2', 'seed-recipe-ratatouille', ingredients.id, 2, 'ピーマン 2個', '乱切り', 1, 1 FROM ingredients WHERE ingredients.name = 'ピーマン' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-ratatouille-i3', 'seed-recipe-ratatouille', ingredients.id, 1, '玉ねぎ 1個', 'くし形切り', 1, 2 FROM ingredients WHERE ingredients.name = '玉ねぎ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-ratatouille-i4', 'seed-recipe-ratatouille', ingredients.id, 1, 'にんにく 1片', 'みじん切り', 1, 3 FROM ingredients WHERE ingredients.name = 'にんにく' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-ratatouille-i5', 'seed-recipe-ratatouille', ingredients.id, 1, 'カットトマト缶 1缶', NULL, 2, 4 FROM ingredients WHERE ingredients.name = 'カットトマト缶' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-ratatouille-i6', 'seed-recipe-ratatouille', ingredients.id, 4, '顆粒コンソメ 小さじ1強', NULL, 2, 5 FROM ingredients WHERE ingredients.name = '顆粒コンソメ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-ratatouille-i7', 'seed-recipe-ratatouille', ingredients.id, 2, '塩 少々', NULL, 2, 6 FROM ingredients WHERE ingredients.name = '塩' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-ratatouille-i8', 'seed-recipe-ratatouille', ingredients.id, 15, 'オリーブオイル 大さじ1', NULL, 2, 7 FROM ingredients WHERE ingredients.name = 'サラダ油' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-ratatouille-s1', 'seed-recipe-ratatouille', 1, 'prep', 'なす、ピーマンは乱切り、玉ねぎはくし形、にんにくはみじん切りにする') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-ratatouille-s2', 'seed-recipe-ratatouille', 2, 'cook', '内鍋に材料をすべて入れて加熱する（水は入れない）') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-chikuzenni', '筑前煮', 3, 300, 1, '手動 > 煮物を作る > まぜる > 20分', 4, 0, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chikuzenni-i1', 'seed-recipe-chikuzenni', ingredients.id, 0.5, 'ごぼう 1/2本', '乱切り', 1, 0 FROM ingredients WHERE ingredients.name = 'ごぼう' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chikuzenni-i2', 'seed-recipe-chikuzenni', ingredients.id, 150, 'れんこん 150g', '乱切り', 1, 1 FROM ingredients WHERE ingredients.name = 'れんこん' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chikuzenni-i3', 'seed-recipe-chikuzenni', ingredients.id, 1, 'にんじん 1本', '乱切り', 1, 2 FROM ingredients WHERE ingredients.name = 'にんじん' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chikuzenni-i4', 'seed-recipe-chikuzenni', ingredients.id, 1, 'まいたけ 1パック', 'ほぐす', 1, 3 FROM ingredients WHERE ingredients.name = 'まいたけ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chikuzenni-i5', 'seed-recipe-chikuzenni', ingredients.id, 1, '鶏もも肉 1枚', 'ひと口大', 2, 4 FROM ingredients WHERE ingredients.name = '鶏もも肉' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chikuzenni-i6', 'seed-recipe-chikuzenni', ingredients.id, 30, 'しょうゆ 大さじ2', NULL, 3, 5 FROM ingredients WHERE ingredients.name = 'しょうゆ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chikuzenni-i7', 'seed-recipe-chikuzenni', ingredients.id, 30, 'みりん 大さじ2', NULL, 3, 6 FROM ingredients WHERE ingredients.name = 'みりん' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chikuzenni-i8', 'seed-recipe-chikuzenni', ingredients.id, 9, '砂糖 大さじ1', NULL, 3, 7 FROM ingredients WHERE ingredients.name = '砂糖' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chikuzenni-i9', 'seed-recipe-chikuzenni', ingredients.id, 15, '酒 大さじ1', NULL, 3, 8 FROM ingredients WHERE ingredients.name = '酒' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-chikuzenni-i10', 'seed-recipe-chikuzenni', ingredients.id, 3, '顆粒だし 小さじ1', NULL, 3, 9 FROM ingredients WHERE ingredients.name = '顆粒だし' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-chikuzenni-s1', 'seed-recipe-chikuzenni', 1, 'prep', 'ごぼう、れんこん、にんじんは乱切り（ごぼうとれんこんは水にさらす）、まいたけはほぐす') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-chikuzenni-s2', 'seed-recipe-chikuzenni', 2, 'prep', '鶏肉はひと口大に切る') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-chikuzenni-s3', 'seed-recipe-chikuzenni', 3, 'cook', '内鍋に野菜、鶏肉の順に入れ、調味料と水 100ml を加えて加熱する') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES ('seed-recipe-spinach-aburaage', 'ほうれん草と油揚げの煮びたし', 2, 80, 1, '手動 > 煮物を作る > まぜない > 5分', 4, 0, 'seed', NULL, NULL) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-spinach-aburaage-i1', 'seed-recipe-spinach-aburaage', ingredients.id, 1, '油揚げ 1枚', '短冊切り', 1, 0 FROM ingredients WHERE ingredients.name = '油揚げ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-spinach-aburaage-i2', 'seed-recipe-spinach-aburaage', ingredients.id, 1, 'ほうれん草 1袋', '4cm長さ', 2, 1 FROM ingredients WHERE ingredients.name = 'ほうれん草' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT 'seed-recipe-spinach-aburaage-i3', 'seed-recipe-spinach-aburaage', ingredients.id, 30, 'めんつゆ（3倍濃縮）大さじ2', NULL, 3, 2 FROM ingredients WHERE ingredients.name = 'めんつゆ' ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-spinach-aburaage-s1', 'seed-recipe-spinach-aburaage', 1, 'prep', 'ほうれん草は 4cm 長さ、油揚げは短冊に切る') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('seed-recipe-spinach-aburaage-s2', 'seed-recipe-spinach-aburaage', 2, 'cook', '内鍋に油揚げ、ほうれん草の順に入れ、めんつゆと水 100ml を加えて加熱する') ON CONFLICT (id) DO NOTHING;
