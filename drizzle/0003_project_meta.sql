ALTER TABLE `subscribed_projects` ADD COLUMN `project_name` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `subscribed_projects` ADD COLUMN `deadline` text;
