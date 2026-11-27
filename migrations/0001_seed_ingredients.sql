-- 食材マスタの初期データ（scripts/generate-seed-sql.ts で生成。値は目安なので画面で直す）
-- 同じ名前の食材がすでにあれば何もしない
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JJD608EATBWFHHVV0F', '玉ねぎ', '["たまねぎ","タマネギ"]', 'vegetable', '個', 200, 1, 60, 30, 30, NULL, NULL, 'pantry', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JK6CA53XE1AA9H6MNG', id, '3個入り', 3, 1 FROM ingredients WHERE name = '玉ねぎ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '3個入り');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JKWDJS8MNTJCE0Y8DD', id, '1個', 1, 0 FROM ingredients WHERE name = '玉ねぎ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1個');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JKX11CE2ZZ8M450CPP', 'にんじん', '["人参","ニンジン"]', 'vegetable', '本', 150, 1, 21, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JK3FMGR5ABKV18VK7G', id, '3本入り', 3, 1 FROM ingredients WHERE name = 'にんじん' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '3本入り');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JKTNDRRMT4HE4VN7QG', id, '1本', 1, 0 FROM ingredients WHERE name = 'にんじん' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1本');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JK9P8YPYP8TV5GQNZG', 'じゃがいも', '["ジャガイモ","じゃが芋","馬鈴薯"]', 'vegetable', '個', 150, 0, 30, NULL, 30, NULL, NULL, 'pantry', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JK8A8W8JBJF9Y2ZW8B', id, '4個入り', 4, 1 FROM ingredients WHERE name = 'じゃがいも' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '4個入り');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JKRTT6R1D310209WCE', id, '1個', 1, 0 FROM ingredients WHERE name = 'じゃがいも' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1個');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JMWVHSYDHPEWDW3R5V', 'さつまいも', '["さつま芋","サツマイモ"]', 'vegetable', '本', 250, 1, 14, 30, 30, NULL, NULL, 'pantry', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JM49X6SM3TEVVAKASW', id, '1本', 1, 1 FROM ingredients WHERE name = 'さつまいも' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1本');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JM04FECTF31RKSEPDE', 'かぼちゃ', '["南瓜","カボチャ"]', 'vegetable', '個', 1200, 1, 5, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JMFB53KJJK4MY9EB9Z', id, '1/4個', 0.25, 1 FROM ingredients WHERE name = 'かぼちゃ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1/4個');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JMK5R4YQ36P4REWNTW', id, '1/2個', 0.5, 0 FROM ingredients WHERE name = 'かぼちゃ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1/2個');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JM7D7Z4G8WCNEMCRBY', 'キャベツ', '["きゃべつ"]', 'vegetable', '個', 1000, 1, 14, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JM0RREQFG7GV8YTKKQ', id, '1/2個', 0.5, 1 FROM ingredients WHERE name = 'キャベツ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1/2個');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JMWR71KYSQD0KF5M0H', id, '1個', 1, 0 FROM ingredients WHERE name = 'キャベツ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1個');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JMFH6D17XGN7V3R070', id, '1/4個', 0.25, 0 FROM ingredients WHERE name = 'キャベツ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1/4個');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JM8EMEEJ8Z3C70X74W', '白菜', '["はくさい","ハクサイ"]', 'vegetable', '個', 2000, 1, 14, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JMWPDVN5SEJX3FJNA7', id, '1/4個', 0.25, 1 FROM ingredients WHERE name = '白菜' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1/4個');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JM9Y1PEKFCFVG94SHS', id, '1/2個', 0.5, 0 FROM ingredients WHERE name = '白菜' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1/2個');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JM904287YKFYFNYZ3S', '大根', '["だいこん","ダイコン"]', 'vegetable', '本', 1000, 1, 10, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JM4J40MH9M1GTF5F5D', id, '1/2本', 0.5, 1 FROM ingredients WHERE name = '大根' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1/2本');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JMMFH3P0F8KHJ1WB83', id, '1本', 1, 0 FROM ingredients WHERE name = '大根' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1本');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JMZ4Q718HMVBK0DXBH', '長ねぎ', '["ねぎ","ネギ","白ねぎ","長ネギ"]', 'vegetable', '本', 100, 1, 10, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JM1YZZHQDAVP5Y295Q', id, '3本入り', 3, 1 FROM ingredients WHERE name = '長ねぎ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '3本入り');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JM4M67973T18QF313B', id, '1本', 1, 0 FROM ingredients WHERE name = '長ねぎ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1本');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JMZPDQKJ9H3PKZQT0E', 'ブロッコリー', '["ぶろっこりー"]', 'vegetable', '個', 300, 1, 5, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JMMEJSGP5W8MV74W5Z', id, '1個', 1, 1 FROM ingredients WHERE name = 'ブロッコリー' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1個');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JMPVR0ZJ4ED3F65CCY', 'ほうれん草', '["ほうれんそう","ホウレンソウ"]', 'vegetable', '袋', 200, 1, 3, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JMZT1DAZN9H2SE9QQT', id, '1袋', 1, 1 FROM ingredients WHERE name = 'ほうれん草' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1袋');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JMA66AZKGR067AYSSJ', '小松菜', '["こまつな","コマツナ"]', 'vegetable', '袋', 200, 1, 3, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JMF007Z7HYAR25BHHQ', id, '1袋', 1, 1 FROM ingredients WHERE name = '小松菜' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1袋');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JMK9KN3XM2Y3BSXNXS', 'チンゲン菜', '["青梗菜","ちんげんさい"]', 'vegetable', '株', 100, 1, 4, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JMBR549HYRM7PQY81C', id, '2株入り', 2, 1 FROM ingredients WHERE name = 'チンゲン菜' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '2株入り');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNNGBFFKEQTJ74PM8M', 'もやし', '["モヤシ"]', 'vegetable', '袋', 200, 1, 2, 21, NULL, 1, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JN5CHKVA478P2NSPG8', id, '1袋', 1, 1 FROM ingredients WHERE name = 'もやし' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1袋');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNM7DMHH18GJ3T08SG', 'なす', '["茄子","ナス"]', 'vegetable', '本', 80, 1, 5, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNXZN44X6Q8M0HQ2JD', id, '3本入り', 3, 1 FROM ingredients WHERE name = 'なす' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '3本入り');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNA3AV42SWEFNW0B8T', id, '1本', 1, 0 FROM ingredients WHERE name = 'なす' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1本');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JN998209MMS5NC175Y', 'ピーマン', '["ぴーまん"]', 'vegetable', '個', 35, 1, 10, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNT8JCK8SS0G9Y2J3J', id, '5個入り', 5, 1 FROM ingredients WHERE name = 'ピーマン' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '5個入り');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNE5N3PBNC5VE8378C', 'トマト', '["とまと"]', 'vegetable', '個', 150, 1, 7, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JN50RDT63WJMWCE12R', id, '3個入り', 3, 1 FROM ingredients WHERE name = 'トマト' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '3個入り');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNASPPFPT0HC522EFK', id, '1個', 1, 0 FROM ingredients WHERE name = 'トマト' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1個');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNA6RK63AG67M7A6BE', 'ごぼう', '["牛蒡","ゴボウ"]', 'vegetable', '本', 150, 1, 7, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNSREWVBWAJ2KB62D6', id, '1本', 1, 1 FROM ingredients WHERE name = 'ごぼう' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1本');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNAFHG4DYNYW03VED7', 'れんこん', '["蓮根","レンコン"]', 'vegetable', 'g', NULL, 1, 7, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JN7356K8D8CX7SY61T', id, '1節 約200g', 200, 1 FROM ingredients WHERE name = 'れんこん' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1節 約200g');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JN6R7D54786NV23A8G', 'しめじ', '["ぶなしめじ","シメジ"]', 'vegetable', 'パック', 100, 1, 5, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNCA5BHVBGQCHXRHZM', id, '1パック', 1, 1 FROM ingredients WHERE name = 'しめじ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1パック');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNMWDEQZZ3STM1TPTC', 'えのき', '["えのきだけ","エノキ"]', 'vegetable', 'パック', 200, 1, 5, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNA5C2187QVCY7Z51W', id, '1パック', 1, 1 FROM ingredients WHERE name = 'えのき' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1パック');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JN21KW1XS86BBXBPCT', 'まいたけ', '["舞茸","マイタケ"]', 'vegetable', 'パック', 100, 1, 4, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNV2JQJV3945QD6EGK', id, '1パック', 1, 1 FROM ingredients WHERE name = 'まいたけ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1パック');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNHF02CHBAPQ82AEQH', 'しょうが', '["生姜","ショウガ"]', 'vegetable', 'g', NULL, 1, 14, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNQCETKMMN4FVQVPRK', 'にんにく', '["ニンニク","大蒜"]', 'vegetable', '片', 5, 1, 30, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JN4THPK0QSAM90JAYG', '鶏もも肉', '["鶏もも","鶏モモ肉","とりもも肉"]', 'meat', '枚', 300, 1, 2, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JN9BK4YNDJEKNSFB0B', id, '1枚', 1, 1 FROM ingredients WHERE name = '鶏もも肉' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1枚');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNHHW3X17RDS0SDNFX', id, '2枚入り', 2, 0 FROM ingredients WHERE name = '鶏もも肉' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '2枚入り');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNTZXXAMDFW2SGDYTG', '鶏むね肉', '["鶏むね","鶏胸肉","とりむね肉"]', 'meat', '枚', 300, 1, 2, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNC3QRSH2TN6WQNE24', id, '1枚', 1, 1 FROM ingredients WHERE name = '鶏むね肉' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1枚');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNR1TQQTFVFJZZYZQQ', id, '2枚入り', 2, 0 FROM ingredients WHERE name = '鶏むね肉' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '2枚入り');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNR1AYSH2RYEFMKTZF', '手羽元', '["鶏手羽元"]', 'meat', '本', 60, 1, 2, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JN545J63PRY4GNK1RF', id, '6本入り', 6, 1 FROM ingredients WHERE name = '手羽元' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '6本入り');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNPDGTZ9Z116S0R0S7', '鶏ひき肉', '["鶏挽き肉","鶏ミンチ"]', 'meat', 'g', NULL, 1, 1, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNNDSR7MSNSD53VJ7D', id, '200g', 200, 1 FROM ingredients WHERE name = '鶏ひき肉' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '200g');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNYV4FZ9868NBP3ZBR', id, '300g', 300, 0 FROM ingredients WHERE name = '鶏ひき肉' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '300g');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNV35RR2ESV6FSYVFP', '豚こま切れ肉', '["豚こま","豚小間切れ肉","豚こま肉"]', 'meat', 'g', NULL, 1, 2, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNM8RZY9MVRWQ23CJE', id, '200g', 200, 1 FROM ingredients WHERE name = '豚こま切れ肉' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '200g');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNRQWWB7V1PFGA6Z8N', id, '300g', 300, 0 FROM ingredients WHERE name = '豚こま切れ肉' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '300g');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNTJH7JJG4Z37HNEQZ', '豚バラ薄切り肉', '["豚バラ","豚バラ肉","豚ばら薄切り"]', 'meat', 'g', NULL, 1, 2, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNH0VH8RQX0H1S92V5', id, '200g', 200, 1 FROM ingredients WHERE name = '豚バラ薄切り肉' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '200g');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JN8RK4D7YZ2FH0CG60', '豚ひき肉', '["豚挽き肉","豚ミンチ"]', 'meat', 'g', NULL, 1, 1, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNK2VV1TP8GMWN5ZGR', id, '200g', 200, 1 FROM ingredients WHERE name = '豚ひき肉' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '200g');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNV3HAWP6MBYN4FW0C', '合いびき肉', '["合挽き肉","合い挽き肉","あいびき肉"]', 'meat', 'g', NULL, 1, 1, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNYB35Q533RMDKJ71W', id, '250g', 250, 1 FROM ingredients WHERE name = '合いびき肉' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '250g');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNY7SM6N5W04AZMVTZ', '牛こま切れ肉', '["牛こま","牛小間切れ肉","牛薄切り肉"]', 'meat', 'g', NULL, 1, 2, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNGQ1D3FMCNHP5AYBB', id, '200g', 200, 1 FROM ingredients WHERE name = '牛こま切れ肉' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '200g');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JN241DDDTDYE361SMZ', 'ベーコン', '[]', 'meat', 'g', NULL, 1, 7, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JN9VSVN7JR0HC27HNY', id, '1パック 70g', 70, 1 FROM ingredients WHERE name = 'ベーコン' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1パック 70g');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNDDN804H2T8C1JYK5', 'ウインナー', '["ウィンナー","ソーセージ"]', 'meat', '本', 20, 1, 10, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JN1WGRZYTND6B437S5', id, '8本入り', 8, 1 FROM ingredients WHERE name = 'ウインナー' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '8本入り');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNNM31VNNWB4DE46ZZ', '鮭（切り身）', '["鮭","生鮭","さけ","サーモン"]', 'fish', '切れ', 80, 1, 2, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNQ8H1GSGWKMBATY2K', id, '2切れ', 2, 1 FROM ingredients WHERE name = '鮭（切り身）' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '2切れ');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JN5QSZ02WRD709W564', id, '3切れ', 3, 0 FROM ingredients WHERE name = '鮭（切り身）' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '3切れ');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNV5ZTVCZ0NC9W7V9G', 'さば（切り身）', '["さば","鯖","サバ"]', 'fish', '切れ', 80, 1, 2, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JNZ0ASH4CFY4ZPXP83', id, '2切れ', 2, 1 FROM ingredients WHERE name = 'さば（切り身）' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '2切れ');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JNQVCHJCEW1E16F5FD', 'たら（切り身）', '["たら","鱈","タラ"]', 'fish', '切れ', 80, 1, 2, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JP1QGAVSHT6S7PDZYQ', id, '2切れ', 2, 1 FROM ingredients WHERE name = 'たら（切り身）' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '2切れ');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JP5P616F2FMGMJ2H6M', 'むきえび', '["えび","海老","エビ"]', 'fish', 'g', NULL, 1, 2, 30, NULL, NULL, NULL, 'fridge', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JPPZQSJABHJY99N8P4', id, '150g', 150, 1 FROM ingredients WHERE name = 'むきえび' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '150g');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPA8SSN6PNJQH5D1KV', 'シーフードミックス', '[]', 'fish', 'g', NULL, 1, 1, 30, NULL, NULL, NULL, 'freezer', NULL, '冷凍のまま入れると加熱時間が延びることがある。前日に冷蔵庫へ移して解凍する', 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JPSZZ35HS0GDNA4HWX', id, '300g', 300, 1 FROM ingredients WHERE name = 'シーフードミックス' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '300g');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JP8BBFEG0JGYR1KR6G', '木綿豆腐', '["豆腐","もめん豆腐"]', 'tofu_egg_dairy', '丁', 300, 0, 5, NULL, NULL, NULL, NULL, 'fridge', '入れる直前に切る', NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JP6MPBHC6CEVRWCHCA', id, '1丁', 1, 1 FROM ingredients WHERE name = '木綿豆腐' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1丁');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPENAN9AG9W2F2W9C3', '絹ごし豆腐', '["絹豆腐","きぬ豆腐"]', 'tofu_egg_dairy', '丁', 300, 0, 5, NULL, NULL, NULL, NULL, 'fridge', '入れる直前に切る', NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JPCAXHM4FCH2J9JS93', id, '1丁', 1, 1 FROM ingredients WHERE name = '絹ごし豆腐' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1丁');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JP99BCSW3ZZGF1N3SA', '厚揚げ', '["生揚げ"]', 'tofu_egg_dairy', '枚', 150, 1, 4, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JPWXJ61BCYESMVPEAY', id, '2枚入り', 2, 1 FROM ingredients WHERE name = '厚揚げ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '2枚入り');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPA7BBTPPM9NN47BBK', '油揚げ', '["あぶらあげ","お揚げ"]', 'tofu_egg_dairy', '枚', 30, 1, 4, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JPRJ92P9AT0VMAKB4N', id, '2枚入り', 2, 1 FROM ingredients WHERE name = '油揚げ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '2枚入り');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JPM862FEXA82REMQZT', id, '3枚入り', 3, 0 FROM ingredients WHERE name = '油揚げ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '3枚入り');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPJA3DQGV05WKTNGQZ', '卵', '["たまご","玉子","鶏卵"]', 'tofu_egg_dairy', '個', 60, 0, 14, NULL, NULL, NULL, NULL, 'fridge', '入れる直前に割る', NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JPEXQ3PC6SPZ6QVCR1', id, '10個入り', 10, 1 FROM ingredients WHERE name = '卵' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '10個入り');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JP4SQ2TN5R0VCJ2MHM', id, '6個入り', 6, 0 FROM ingredients WHERE name = '卵' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '6個入り');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPAW0SYPPJEPPGZKXB', '牛乳', '["ミルク"]', 'tofu_egg_dairy', 'ml', NULL, 0, 7, NULL, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JP4Z3YW6T8TM5BWJBA', id, '1000ml', 1000, 1 FROM ingredients WHERE name = '牛乳' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1000ml');
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JPG7MRXMWG77MZW34Y', id, '500ml', 500, 0 FROM ingredients WHERE name = '牛乳' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '500ml');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPDA3C9F06NMHPDHPP', 'ピザ用チーズ', '["とろけるチーズ","シュレッドチーズ"]', 'tofu_egg_dairy', 'g', NULL, 1, 14, 30, NULL, NULL, NULL, 'fridge', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JPZCWTTKXQP39PA6GG', id, '200g', 200, 1 FROM ingredients WHERE name = 'ピザ用チーズ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '200g');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JP51PJ5S0AWRBBYQDF', 'カットトマト缶', '["トマト缶","ホールトマト缶","トマト水煮缶"]', 'dry', '缶', 400, 1, 365, 30, 365, 3, NULL, 'pantry', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JPNK7RN095F6GDFW93', id, '1缶', 1, 1 FROM ingredients WHERE name = 'カットトマト缶' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1缶');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JP46HY6G7B8HY5QTKF', 'カレールウ', '["カレールー","カレーのルウ"]', 'dry', '皿分', NULL, 0, 365, NULL, 365, NULL, NULL, 'pantry', NULL, NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JP9KAS7QMZBNY48XBC', id, '1箱（8皿分）', 8, 1 FROM ingredients WHERE name = 'カレールウ' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '1箱（8皿分）');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPA1A493HBTX9YSE7F', '春雨', '["はるさめ"]', 'dry', 'g', NULL, 0, 365, NULL, 365, NULL, NULL, 'pantry', '乾いたまま入れる（水で戻さない）', NULL, 0) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT '01M8DVZ2JPR9X5F15G2XX1SAFW', id, '100g', 100, 1 FROM ingredients WHERE name = '春雨' AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = '100g');
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPRFGRNSVGX34QAY8M', 'しょうゆ', '["醤油","濃口醤油"]', 'seasoning', 'ml', NULL, 0, 180, NULL, 180, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPXWKFH9Z2Q9EGPT01', 'みりん', '["本みりん"]', 'seasoning', 'ml', NULL, 0, 180, NULL, 180, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPQK006DRMWTDPE63D', '酒', '["料理酒","日本酒"]', 'seasoning', 'ml', NULL, 0, 180, NULL, 180, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPYW25B3CW9YEVQ7RM', '砂糖', '["上白糖","さとう"]', 'seasoning', 'g', NULL, 0, 3650, NULL, 3650, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPEGE25AFJCFTX9ATY', '塩', '["食塩","しお"]', 'seasoning', 'g', NULL, 0, 3650, NULL, 3650, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JP6NF91QA7J9P9RH7S', 'こしょう', '["胡椒","コショウ","塩こしょう"]', 'seasoning', 'g', NULL, 0, 180, NULL, 180, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JP5VNDSTSBBF6K68CZ', '味噌', '["みそ"]', 'seasoning', 'g', NULL, 0, 180, NULL, NULL, NULL, NULL, 'fridge', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JP7P1SK7NMMWNTF0M9', '酢', '["穀物酢","米酢"]', 'seasoning', 'ml', NULL, 0, 180, NULL, 180, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPKN0FMRY0R4CYASB6', 'ごま油', '["胡麻油"]', 'seasoning', 'ml', NULL, 0, 180, NULL, 180, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPMSWJJ5VEGZCC87FW', 'サラダ油', '["油","オリーブオイル"]', 'seasoning', 'ml', NULL, 0, 180, NULL, 180, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPP0SSXY9QPWJW50PY', 'バター', '[]', 'seasoning', 'g', NULL, 1, 180, 90, NULL, NULL, NULL, 'fridge', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JP9W6WEMJX2H7SY4DX', 'ケチャップ', '["トマトケチャップ"]', 'seasoning', 'g', NULL, 0, 180, NULL, NULL, NULL, NULL, 'fridge', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPTH69TSB92XV0QEQ4', 'オイスターソース', '[]', 'seasoning', 'g', NULL, 0, 180, NULL, NULL, NULL, NULL, 'fridge', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPNTN4DT3K6QXBBFJ5', '顆粒コンソメ', '["コンソメ","コンソメキューブ"]', 'seasoning', 'g', NULL, 0, 180, NULL, 180, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPNNGYJ6PWVYSKPC8Y', '鶏がらスープの素', '["鶏ガラスープの素","中華スープの素"]', 'seasoning', 'g', NULL, 0, 180, NULL, 180, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPCNGY1RETKNGH4NS9', '顆粒だし', '["和風だし","だしの素","ほんだし"]', 'seasoning', 'g', NULL, 0, 180, NULL, 180, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPWVEMJBCCD77FA0DG', 'めんつゆ', '["麺つゆ"]', 'seasoning', 'ml', NULL, 0, 180, NULL, NULL, NULL, NULL, 'fridge', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JPGDZMFASVRB5JXWEZ', '片栗粉', '["かたくり粉"]', 'seasoning', 'g', NULL, 0, 180, NULL, 180, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES ('01M8DVZ2JP5YEFVSF9C6YGBEEH', '小麦粉', '["薄力粉"]', 'seasoning', 'g', NULL, 0, 180, NULL, 180, NULL, NULL, 'pantry', NULL, NULL, 1) ON CONFLICT (name) DO NOTHING;
