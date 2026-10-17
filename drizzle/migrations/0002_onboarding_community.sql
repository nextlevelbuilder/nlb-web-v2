CREATE TABLE `community_access_state` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target` text NOT NULL,
	`desired_tier` text DEFAULT 'none' NOT NULL,
	`applied_tier` text DEFAULT 'none' NOT NULL,
	`status` text DEFAULT 'not_connected' NOT NULL,
	`error_code` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_access_state_user_target_unique` ON `community_access_state` (`user_id`,`target`);--> statement-breakpoint
CREATE TABLE `community_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_user_id` text NOT NULL,
	`display_name` text,
	`access_token_enc` text,
	`refresh_token_enc` text,
	`token_expires_at` integer,
	`linked_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_connections_provider_external_unique` ON `community_connections` (`provider`,`external_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `community_connections_user_provider_unique` ON `community_connections` (`user_id`,`provider`);--> statement-breakpoint
CREATE TABLE `onboarding_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_run_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`locked_until` integer,
	`last_error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_jobs_dedupe_key_unique` ON `onboarding_jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `onboarding_jobs_due_idx` ON `onboarding_jobs` (`status`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `onboarding_nonces` (
	`nonce_hash` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`user_id` text NOT NULL,
	`payload_enc` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `onboarding_nonces_expires_idx` ON `onboarding_nonces` (`expires_at`);--> statement-breakpoint
CREATE TABLE `onboarding_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`goal` text,
	`profile_links` text,
	`skills` text,
	`phone` text,
	`commitment_accepted_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `user_id` text;--> statement-breakpoint
CREATE INDEX `customers_user_id_idx` ON `customers` (`user_id`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `past_due_since` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `ended_at` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `polar_modified_at` integer;