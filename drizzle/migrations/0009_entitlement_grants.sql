CREATE TABLE `entitlement_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`feature_key` text NOT NULL,
	`reason` text NOT NULL,
	`granted_by` text NOT NULL,
	`approval_id` text NOT NULL,
	`valid_until` integer,
	`revoked_at` integer,
	`revoked_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entitlement_grants_live_unique` ON `entitlement_grants` (`user_id`,`feature_key`) WHERE "entitlement_grants"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX `entitlement_grants_user_idx` ON `entitlement_grants` (`user_id`,`created_at`);