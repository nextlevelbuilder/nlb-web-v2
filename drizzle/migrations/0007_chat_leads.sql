CREATE TABLE `chat_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`need` text NOT NULL,
	`interest` text,
	`wants_human` integer DEFAULT false NOT NULL,
	`locale` text NOT NULL,
	`page_path` text,
	`user_id` text,
	`ip_hash` text,
	`status` text DEFAULT 'new' NOT NULL,
	`consented_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_leads_created_idx` ON `chat_leads` (`created_at`);--> statement-breakpoint
CREATE INDEX `chat_leads_ip_created_idx` ON `chat_leads` (`ip_hash`,`created_at`);