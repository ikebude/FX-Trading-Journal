CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`broker` text,
	`account_currency` text DEFAULT 'USD' NOT NULL,
	`initial_balance` real DEFAULT 0 NOT NULL,
	`account_type` text DEFAULT 'LIVE' NOT NULL,
	`display_color` text DEFAULT '#3b82f6' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`opened_at_utc` text,
	`prop_daily_loss_limit` real,
	`prop_daily_loss_pct` real,
	`prop_max_drawdown` real,
	`prop_max_drawdown_pct` real,
	`prop_drawdown_type` text,
	`prop_profit_target` real,
	`prop_profit_target_pct` real,
	`prop_phase` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_name_unique` ON `accounts` (`name`);--> statement-breakpoint
CREATE INDEX `idx_accounts_active` ON `accounts` (`is_active`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`trade_id` text,
	`action` text NOT NULL,
	`changed_fields` text,
	`actor` text DEFAULT 'user' NOT NULL,
	`timestamp_utc` text NOT NULL,
	FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_audit_trade` ON `audit_log` (`trade_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_time` ON `audit_log` (`timestamp_utc`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`timestamp_utc` text NOT NULL,
	`balance` real NOT NULL,
	`equity` real,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`notes` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_balance_account_time` ON `balance_snapshots` (`account_id`,`timestamp_utc`);--> statement-breakpoint
CREATE TABLE `bridge_files` (
	`filename` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`account_id` text,
	`trade_id` text,
	`error_message` text,
	`processed_at_utc` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `import_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_filename` text NOT NULL,
	`stored_path` text NOT NULL,
	`account_id` text NOT NULL,
	`rows_total` integer NOT NULL,
	`rows_imported` integer NOT NULL,
	`rows_duplicate` integer NOT NULL,
	`rows_merged` integer DEFAULT 0 NOT NULL,
	`rows_failed` integer NOT NULL,
	`failed_report` text,
	`created_at_utc` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_import_runs_account` ON `import_runs` (`account_id`,`created_at_utc`);--> statement-breakpoint
CREATE TABLE `instruments` (
	`symbol` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`asset_class` text DEFAULT 'FOREX' NOT NULL,
	`base_currency` text,
	`quote_currency` text,
	`pip_size` real NOT NULL,
	`contract_size` real DEFAULT 100000 NOT NULL,
	`digits` integer DEFAULT 5 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `news_events` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp_utc` text NOT NULL,
	`currency` text NOT NULL,
	`impact` text NOT NULL,
	`title` text NOT NULL,
	`forecast` text,
	`previous` text,
	`actual` text,
	`source` text DEFAULT 'FOREXFACTORY_CSV' NOT NULL,
	`imported_at_utc` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_news_time` ON `news_events` (`timestamp_utc`);--> statement-breakpoint
CREATE INDEX `idx_news_currency` ON `news_events` (`currency`);--> statement-breakpoint
CREATE INDEX `idx_news_impact` ON `news_events` (`impact`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_news_event` ON `news_events` (`timestamp_utc`,`currency`,`title`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`period_start_utc` text NOT NULL,
	`period_end_utc` text NOT NULL,
	`followed_plan` text,
	`biggest_win` text,
	`biggest_mistake` text,
	`improvement` text,
	`pattern_winners` text,
	`pattern_losers` text,
	`strategy_adjust` text,
	`mood_score` integer,
	`discipline_score` integer,
	`energy_score` integer,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reviews_account_kind_period` ON `reviews` (`account_id`,`kind`,`period_start_utc`);--> statement-breakpoint
CREATE TABLE `screenshots` (
	`id` text PRIMARY KEY NOT NULL,
	`trade_id` text NOT NULL,
	`kind` text DEFAULT 'ENTRY' NOT NULL,
	`file_path` text NOT NULL,
	`caption` text,
	`width_px` integer,
	`height_px` integer,
	`byte_size` integer,
	`created_at_utc` text NOT NULL,
	FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_screenshots_trade` ON `screenshots` (`trade_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `setups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `setups_name_unique` ON `setups` (`name`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`color` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tags_name_category` ON `tags` (`name`,`category`);--> statement-breakpoint
CREATE TABLE `trade_legs` (
	`id` text PRIMARY KEY NOT NULL,
	`trade_id` text NOT NULL,
	`leg_type` text NOT NULL,
	`timestamp_utc` text NOT NULL,
	`price` real NOT NULL,
	`volume_lots` real NOT NULL,
	`commission` real DEFAULT 0 NOT NULL,
	`swap` real DEFAULT 0 NOT NULL,
	`broker_profit` real,
	`external_deal_id` text,
	`notes` text,
	`created_at_utc` text NOT NULL,
	FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_legs_trade` ON `trade_legs` (`trade_id`);--> statement-breakpoint
CREATE INDEX `idx_legs_time` ON `trade_legs` (`timestamp_utc`);--> statement-breakpoint
CREATE TABLE `trade_news_events` (
	`trade_id` text NOT NULL,
	`news_event_id` text NOT NULL,
	`minutes_offset` integer NOT NULL,
	PRIMARY KEY(`trade_id`, `news_event_id`),
	FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`news_event_id`) REFERENCES `news_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trade_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`trade_id` text NOT NULL,
	`body_md` text NOT NULL,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	`deleted_at_utc` text,
	FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notes_trade` ON `trade_notes` (`trade_id`);--> statement-breakpoint
CREATE INDEX `idx_notes_time` ON `trade_notes` (`created_at_utc`);--> statement-breakpoint
CREATE TABLE `trade_tags` (
	`trade_id` text NOT NULL,
	`tag_id` integer NOT NULL,
	`created_at_utc` text NOT NULL,
	PRIMARY KEY(`trade_id`, `tag_id`),
	FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`symbol` text NOT NULL,
	`direction` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`initial_stop_price` real,
	`initial_target_price` real,
	`planned_rr` real,
	`planned_risk_amount` real,
	`planned_risk_pct` real,
	`setup_name` text,
	`session` text,
	`market_condition` text,
	`entry_model` text,
	`confidence` integer,
	`pre_trade_emotion` text,
	`post_trade_emotion` text,
	`opened_at_utc` text,
	`closed_at_utc` text,
	`net_pnl` real,
	`net_pips` real,
	`r_multiple` real,
	`total_commission` real DEFAULT 0 NOT NULL,
	`total_swap` real DEFAULT 0 NOT NULL,
	`weighted_avg_entry` real,
	`weighted_avg_exit` real,
	`total_entry_volume` real DEFAULT 0 NOT NULL,
	`total_exit_volume` real DEFAULT 0 NOT NULL,
	`external_ticket` text,
	`external_position_id` text,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`deleted_at_utc` text,
	`is_sample` integer DEFAULT false NOT NULL,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`symbol`) REFERENCES `instruments`(`symbol`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_trades_account` ON `trades` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_trades_account_status` ON `trades` (`account_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_trades_symbol` ON `trades` (`symbol`);--> statement-breakpoint
CREATE INDEX `idx_trades_opened` ON `trades` (`opened_at_utc`);--> statement-breakpoint
CREATE INDEX `idx_trades_closed` ON `trades` (`closed_at_utc`);--> statement-breakpoint
CREATE INDEX `idx_trades_deleted` ON `trades` (`deleted_at_utc`);--> statement-breakpoint
CREATE INDEX `idx_trades_sample` ON `trades` (`is_sample`);--> statement-breakpoint
CREATE INDEX `idx_trades_setup` ON `trades` (`setup_name`);