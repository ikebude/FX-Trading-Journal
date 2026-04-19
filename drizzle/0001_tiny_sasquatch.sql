-- T1.3 (v1.1): balance_operations ledger + accounts broker metadata.
--
-- Surface:
--   1. CREATE TABLE balance_operations + indexes (fully additive).
--   2. Rebuild audit_log to extend the entity_type + action CHECK constraints
--      with BALANCE_OP / BALANCE_OP_* values. SQLite has no ALTER CHECK, so
--      the standard CREATE-new / INSERT-SELECT / DROP-old / RENAME pattern
--      inside a transaction is the only lossless path. This rebuild also
--      brings the FK onDelete (set null) into sync with runtime migration 002.
--   3. ALTER TABLE accounts ADD COLUMN … for 6 broker-metadata columns
--      (additive only — forward-compat with v1.0.x DBs).
--
-- All nullable columns stay nullable on ADD so existing rows don't require backfill.
--> statement-breakpoint
CREATE TABLE `balance_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`op_type` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`occurred_at_utc` text NOT NULL,
	`recorded_at_utc` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`external_ticket` text,
	`related_trade_id` text,
	`note` text,
	`tags` text,
	`deleted_at_utc` text,
	`created_at_utc` text NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE set null,
	-- T1.3 manual: CHECK constraints for op_type + source enums.
	CHECK(`op_type` IN ('DEPOSIT','WITHDRAWAL','BONUS','CREDIT','CHARGE','CORRECTION','COMMISSION','INTEREST','PAYOUT','OTHER')),
	CHECK(`source` IN ('MANUAL','BRIDGE','IMPORT','MT4_HTML','MT5_HTML','CSV','BROKER_PDF','RECONCILIATION'))
);
--> statement-breakpoint
CREATE INDEX `idx_balance_ops_account_occurred` ON `balance_operations` (`account_id`,`occurred_at_utc`);--> statement-breakpoint
CREATE INDEX `idx_balance_ops_soft_delete` ON `balance_operations` (`deleted_at_utc`);--> statement-breakpoint
CREATE INDEX `idx_balance_ops_type` ON `balance_operations` (`op_type`);--> statement-breakpoint
-- T1.3 manual: partial unique index for broker-sourced op dedup (soft-delete-aware).
CREATE UNIQUE INDEX `idx_balance_ops_external` ON `balance_operations` (`account_id`,`source`,`external_id`)
	WHERE `external_id` IS NOT NULL AND `deleted_at_utc` IS NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`trade_id` text,
	`action` text NOT NULL,
	`changed_fields` text,
	`actor` text DEFAULT 'user' NOT NULL,
	`timestamp_utc` text NOT NULL,
	FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE set null,
	-- T1.3 manual: CHECK constraints extended with BALANCE_OP entity + BALANCE_OP_* actions.
	CHECK(`entity_type` IN ('TRADE','LEG','SCREENSHOT','NOTE','TAG_LINK','TRADE_TAGS','REVIEW','ACCOUNT','BALANCE_OP')),
	CHECK(`action` IN ('CREATE','UPDATE','DELETE','RESTORE','MERGE','BULK_UPDATE','HARD_DELETE',
	                   'BALANCE_OP_CREATE','BALANCE_OP_UPDATE','BALANCE_OP_DELETE','BALANCE_OP_RESTORE'))
);
--> statement-breakpoint
INSERT INTO `__new_audit_log`("id", "entity_type", "entity_id", "trade_id", "action", "changed_fields", "actor", "timestamp_utc") SELECT "id", "entity_type", "entity_id", "trade_id", "action", "changed_fields", "actor", "timestamp_utc" FROM `audit_log`;--> statement-breakpoint
DROP TABLE `audit_log`;--> statement-breakpoint
ALTER TABLE `__new_audit_log` RENAME TO `audit_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_audit_trade` ON `audit_log` (`trade_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_time` ON `audit_log` (`timestamp_utc`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `server` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `platform` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `leverage` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `timezone` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `login` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `broker_type` text;--> statement-breakpoint
-- T1.3 manual: partial unique index enforcing one broker login per FXLedger account.
-- Excludes rows where any of (platform, server, login) is NULL — legacy accounts
-- without broker metadata are never blocked.
CREATE UNIQUE INDEX `idx_accounts_login` ON `accounts` (`platform`,`server`,`login`)
	WHERE `login` IS NOT NULL AND `platform` IS NOT NULL AND `server` IS NOT NULL;
