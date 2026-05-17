CREATE TABLE `methodologies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `methodologies_name_unique` ON `methodologies` (`name`);--> statement-breakpoint
CREATE TABLE `prop_firm_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`max_drawdown_pct` real,
	`max_daily_loss_pct` real,
	`max_drawdown_amount` real,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prop_firm_presets_name_unique` ON `prop_firm_presets` (`name`);--> statement-breakpoint
ALTER TABLE `trades` ADD `methodology_id` text REFERENCES methodologies(id);--> statement-breakpoint
ALTER TABLE `trades` ADD `mae_pips` real;--> statement-breakpoint
ALTER TABLE `trades` ADD `mfe_pips` real;