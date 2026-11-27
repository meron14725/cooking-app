DROP INDEX `meal_kits_plan_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `meal_kits_plan_recipe_unique` ON `meal_kits` (`plan_id`,`recipe_id`);