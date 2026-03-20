PRAGMA foreign_keys = OFF;
--> statement-breakpoint
DROP TABLE IF EXISTS `task_completions`;
--> statement-breakpoint
DROP TABLE IF EXISTS `subscribed_projects`;
--> statement-breakpoint
DROP TABLE IF EXISTS `tool_calls`;
--> statement-breakpoint
DROP TABLE IF EXISTS `claimed_airdrops`;
--> statement-breakpoint
DROP TABLE IF EXISTS `tracked_wallets`;
--> statement-breakpoint
DROP TABLE IF EXISTS `users`;
--> statement-breakpoint
CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `telegram_id` text UNIQUE,
  `mcpize_key` text UNIQUE,
  `tier` text NOT NULL DEFAULT 'free',
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `last_active_at` text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `tracked_wallets` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `wallet_address` text NOT NULL,
  `project_slug` text NOT NULL,
  `added_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `claimed_airdrops` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `project_slug` text NOT NULL,
  `tokens_received` text,
  `usd_value` real DEFAULT 0,
  `claimed_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `tool_calls` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `channel` text NOT NULL DEFAULT 'mcp',
  `tool_name` text NOT NULL,
  `called_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscribed_projects` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `project_slug` text NOT NULL,
  `joined_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `task_completions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `project_slug` text NOT NULL,
  `task_id` text NOT NULL,
  `completed_at` text NOT NULL DEFAULT (datetime('now')),
  `notes` text,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
PRAGMA foreign_keys = ON;
