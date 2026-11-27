CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`category` text NOT NULL,
	`unit` text NOT NULL,
	`grams_per_unit` real,
	`can_freeze` integer NOT NULL,
	`fridge_days` integer NOT NULL,
	`freezer_days` integer,
	`pantry_days` integer,
	`prepped_fridge_days` integer,
	`prepped_freezer_days` integer,
	`default_location` text NOT NULL,
	`before_cook_task` text,
	`frozen_cook_note` text,
	`is_staple` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "ingredients_category_check" CHECK(category IN ('vegetable', 'meat', 'fish', 'tofu_egg_dairy', 'seasoning', 'dry', 'other')),
	CONSTRAINT "ingredients_default_location_check" CHECK(default_location IN ('fridge', 'freezer', 'pantry')),
	CONSTRAINT "ingredients_fridge_days_check" CHECK("ingredients"."fridge_days" >= 0),
	CONSTRAINT "ingredients_freezer_days_check" CHECK("ingredients"."can_freeze" = 1 OR "ingredients"."freezer_days" IS NULL),
	CONSTRAINT "ingredients_grams_per_unit_check" CHECK("ingredients"."grams_per_unit" IS NULL OR "ingredients"."grams_per_unit" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredients_name_unique` ON `ingredients` (`name`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` real NOT NULL,
	`location` text NOT NULL,
	`purchased_on` text NOT NULL,
	`expires_on` text NOT NULL,
	`source` text NOT NULL,
	`shopping_item_id` text,
	`used_up_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shopping_item_id`) REFERENCES `shopping_items`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "inventory_items_quantity_check" CHECK("inventory_items"."quantity" >= 0),
	CONSTRAINT "inventory_items_location_check" CHECK(location IN ('fridge', 'freezer', 'pantry')),
	CONSTRAINT "inventory_items_source_check" CHECK(source IN ('shopping', 'leftover', 'manual'))
);
--> statement-breakpoint
CREATE INDEX `inventory_items_ingredient_idx` ON `inventory_items` (`ingredient_id`,`expires_on`);--> statement-breakpoint
CREATE INDEX `inventory_items_shopping_item_idx` ON `inventory_items` (`shopping_item_id`);--> statement-breakpoint
CREATE TABLE `meal_kit_items` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_kit_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` real,
	`state` text NOT NULL,
	`before_cook_task` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`meal_kit_id`) REFERENCES `meal_kits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "meal_kit_items_state_check" CHECK(state IN ('packed', 'before_cook', 'seasoning_packed'))
);
--> statement-breakpoint
CREATE INDEX `meal_kit_items_kit_idx` ON `meal_kit_items` (`meal_kit_id`);--> statement-breakpoint
CREATE INDEX `meal_kit_items_ingredient_idx` ON `meal_kit_items` (`ingredient_id`,`state`);--> statement-breakpoint
CREATE TABLE `meal_kits` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`servings` real NOT NULL,
	`location` text NOT NULL,
	`packed_on` text NOT NULL,
	`planned_on` text NOT NULL,
	`use_by` text NOT NULL,
	`status` text DEFAULT 'stored' NOT NULL,
	`cooked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "meal_kits_location_check" CHECK(location IN ('fridge', 'freezer')),
	CONSTRAINT "meal_kits_status_check" CHECK(status IN ('stored', 'cooked', 'discarded'))
);
--> statement-breakpoint
CREATE INDEX `meal_kits_plan_idx` ON `meal_kits` (`plan_id`);--> statement-breakpoint
CREATE INDEX `meal_kits_status_idx` ON `meal_kits` (`status`,`planned_on`);--> statement-breakpoint
CREATE TABLE `package_units` (
	`id` text PRIMARY KEY NOT NULL,
	`ingredient_id` text NOT NULL,
	`label` text NOT NULL,
	`quantity` real NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "package_units_quantity_check" CHECK("package_units"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `package_units_ingredient_idx` ON `package_units` (`ingredient_id`);--> statement-breakpoint
CREATE TABLE `plan_recipes` (
	`plan_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`role` text NOT NULL,
	`servings` real DEFAULT 1 NOT NULL,
	`day_index` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`plan_id`, `recipe_id`),
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "plan_recipes_role_check" CHECK(role IN ('anchor', 'added')),
	CONSTRAINT "plan_recipes_servings_check" CHECK("plan_recipes"."servings" > 0),
	CONSTRAINT "plan_recipes_day_index_check" CHECK("plan_recipes"."day_index" >= 1)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`starts_on` text,
	`confirmed_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "plans_status_check" CHECK(status IN ('draft', 'shopping', 'prepping', 'stored', 'done'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_one_in_progress` ON `plans` ((1)) WHERE status IN ('draft', 'shopping', 'prepping');--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` real,
	`display_text` text NOT NULL,
	`cut_style` text,
	`add_order` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recipe_ingredients_quantity_check" CHECK("recipe_ingredients"."quantity" IS NULL OR "recipe_ingredients"."quantity" >= 0)
);
--> statement-breakpoint
CREATE INDEX `recipe_ingredients_recipe_idx` ON `recipe_ingredients` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `recipe_ingredients_ingredient_idx` ON `recipe_ingredients` (`ingredient_id`);--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`step_no` integer NOT NULL,
	`phase` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recipe_steps_phase_check" CHECK(phase IN ('prep', 'cook'))
);
--> statement-breakpoint
CREATE INDEX `recipe_steps_recipe_idx` ON `recipe_steps` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`servings` real NOT NULL,
	`calories_kcal` integer,
	`calories_estimated` integer DEFAULT false NOT NULL,
	`hotcook_mode` text,
	`max_servings_1_6l` real,
	`pack_seasonings` integer DEFAULT false NOT NULL,
	`source_type` text NOT NULL,
	`source_url` text,
	`notes` text,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "recipes_servings_check" CHECK("recipes"."servings" > 0),
	CONSTRAINT "recipes_source_type_check" CHECK(source_type IN ('manual', 'url', 'ai', 'seed'))
);
--> statement-breakpoint
CREATE TABLE `shopping_items` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`need_quantity` real NOT NULL,
	`package_unit_id` text,
	`package_count` integer DEFAULT 1 NOT NULL,
	`buy_quantity` real NOT NULL,
	`checked_at` text,
	`is_manual` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_unit_id`) REFERENCES `package_units`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "shopping_items_quantities_check" CHECK("shopping_items"."need_quantity" >= 0 AND "shopping_items"."buy_quantity" >= 0),
	CONSTRAINT "shopping_items_package_count_check" CHECK("shopping_items"."package_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `shopping_items_plan_idx` ON `shopping_items` (`plan_id`);