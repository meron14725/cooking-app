ALTER TABLE `ingredients` ADD `attributes_source` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `target_meals` integer;--> statement-breakpoint
ALTER TABLE `recipes` ADD `dish_type` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `cuisine` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `uses_mixing_unit` integer;--> statement-breakpoint
ALTER TABLE `recipes` ADD `cook_minutes` integer;--> statement-breakpoint
ALTER TABLE `recipes` ADD `attributes_source` text;