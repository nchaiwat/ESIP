CREATE TABLE `admin_users` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'SYSTEM_ADMIN' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`confirmation_id` integer,
	`action` text NOT NULL,
	`actor_email` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `confirmations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`source_code` text NOT NULL,
	`subject` text NOT NULL,
	`candidate` text NOT NULL,
	`evidence` text NOT NULL,
	`priority` text NOT NULL,
	`affected_rows` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`approval_reference` text,
	`decided_by` text,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
