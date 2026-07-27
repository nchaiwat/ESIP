PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_admin_users` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'ADMINISTRATOR' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_admin_users`("email", "role", "created_at") SELECT "email", "role", "created_at" FROM `admin_users`;--> statement-breakpoint
DROP TABLE `admin_users`;--> statement-breakpoint
ALTER TABLE `__new_admin_users` RENAME TO `admin_users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `confirmations` ADD `apply_status` text DEFAULT 'NOT_APPLIED' NOT NULL;--> statement-breakpoint
ALTER TABLE `confirmations` ADD `apply_message` text;--> statement-breakpoint
ALTER TABLE `confirmations` ADD `applied_at` text;