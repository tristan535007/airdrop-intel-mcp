PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_claimed_airdrops` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_slug` text NOT NULL,
	`tokens_received` text,
	`usd_value` real DEFAULT 0,
	`claimed_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_claimed_airdrops`("id", "user_id", "project_slug", "tokens_received", "usd_value", "claimed_at") SELECT "id", "user_id", "project_slug", "tokens_received", "usd_value", "claimed_at" FROM `claimed_airdrops`;--> statement-breakpoint
DROP TABLE `claimed_airdrops`;--> statement-breakpoint
ALTER TABLE `__new_claimed_airdrops` RENAME TO `claimed_airdrops`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_subscribed_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_slug` text NOT NULL,
	`project_name` text DEFAULT '' NOT NULL,
	`deadline` text,
	`joined_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_subscribed_projects`("id", "user_id", "project_slug", "project_name", "deadline", "joined_at") SELECT "id", "user_id", "project_slug", "project_name", "deadline", "joined_at" FROM `subscribed_projects`;--> statement-breakpoint
DROP TABLE `subscribed_projects`;--> statement-breakpoint
ALTER TABLE `__new_subscribed_projects` RENAME TO `subscribed_projects`;--> statement-breakpoint
CREATE TABLE `__new_task_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_slug` text NOT NULL,
	`task_id` text NOT NULL,
	`completed_at` text DEFAULT (datetime('now')) NOT NULL,
	`notes` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_task_completions`("id", "user_id", "project_slug", "task_id", "completed_at", "notes") SELECT "id", "user_id", "project_slug", "task_id", "completed_at", "notes" FROM `task_completions`;--> statement-breakpoint
DROP TABLE `task_completions`;--> statement-breakpoint
ALTER TABLE `__new_task_completions` RENAME TO `task_completions`;--> statement-breakpoint
CREATE UNIQUE INDEX `task_completions_user_project_task_uniq` ON `task_completions` (`user_id`,`project_slug`,`task_id`);--> statement-breakpoint
CREATE TABLE `__new_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`channel` text DEFAULT 'mcp' NOT NULL,
	`tool_name` text NOT NULL,
	`called_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tool_calls`("id", "user_id", "channel", "tool_name", "called_at") SELECT "id", "user_id", "channel", "tool_name", "called_at" FROM `tool_calls`;--> statement-breakpoint
DROP TABLE `tool_calls`;--> statement-breakpoint
ALTER TABLE `__new_tool_calls` RENAME TO `tool_calls`;--> statement-breakpoint
CREATE TABLE `__new_tracked_wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`wallet_address` text NOT NULL,
	`project_slug` text NOT NULL,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tracked_wallets`("id", "user_id", "wallet_address", "project_slug", "added_at") SELECT "id", "user_id", "wallet_address", "project_slug", "added_at" FROM `tracked_wallets`;--> statement-breakpoint
DROP TABLE `tracked_wallets`;--> statement-breakpoint
ALTER TABLE `__new_tracked_wallets` RENAME TO `tracked_wallets`;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`telegram_id` text,
	`mcpize_key` text,
	`tier` text DEFAULT 'free' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_active_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "telegram_id", "mcpize_key", "tier", "created_at", "last_active_at") SELECT "id", "telegram_id", "mcpize_key", "tier", "created_at", "last_active_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_telegram_id_unique` ON `users` (`telegram_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_mcpize_key_unique` ON `users` (`mcpize_key`);