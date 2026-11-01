CREATE TABLE `affiliate_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`affiliate_id` text NOT NULL,
	`device_hash` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_devices_affiliate_device` ON `affiliate_devices` (`affiliate_id`,`device_hash`);--> statement-breakpoint
CREATE INDEX `affiliate_devices_device_idx` ON `affiliate_devices` (`device_hash`);--> statement-breakpoint
ALTER TABLE `affiliate_attributions` ADD `device_hash` text;--> statement-breakpoint
CREATE INDEX `affiliate_attributions_device_idx` ON `affiliate_attributions` (`affiliate_id`,`device_hash`);--> statement-breakpoint
ALTER TABLE `affiliate_payout_items` ADD `service_fee_bps` integer;--> statement-breakpoint
ALTER TABLE `affiliate_payout_items` ADD `withholding_bps` integer;--> statement-breakpoint
ALTER TABLE `affiliate_payout_methods` ADD `instrument_hash` text;--> statement-breakpoint
CREATE INDEX `affiliate_payout_methods_instrument_idx` ON `affiliate_payout_methods` (`instrument_hash`);--> statement-breakpoint
ALTER TABLE `affiliate_verifications` ADD `status_detail` text;--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_verifications_affiliate_provider` ON `affiliate_verifications` (`affiliate_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_verifications_provider_reference` ON `affiliate_verifications` (`provider`,`provider_reference`);