CREATE TABLE `affiliate_attributions` (
	`id` text PRIMARY KEY NOT NULL,
	`affiliate_id` text NOT NULL,
	`link_id` text NOT NULL,
	`link_version` integer NOT NULL,
	`buyer_user_id` text NOT NULL,
	`polar_product_id` text NOT NULL,
	`source` text NOT NULL,
	`rules_version` integer NOT NULL,
	`level` text NOT NULL,
	`incentive_basis` text NOT NULL,
	`budget_bps` integer NOT NULL,
	`discount_bps` integer NOT NULL,
	`commission_bps` integer NOT NULL,
	`polar_discount_id` text,
	`polar_checkout_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `affiliate_attributions_buyer_idx` ON `affiliate_attributions` (`buyer_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `affiliate_conversions` (
	`id` text PRIMARY KEY NOT NULL,
	`attribution_id` text NOT NULL,
	`affiliate_id` text NOT NULL,
	`buyer_user_id` text NOT NULL,
	`polar_order_id` text NOT NULL,
	`polar_product_id` text NOT NULL,
	`currency` text NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`discount_minor` integer NOT NULL,
	`net_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`commission_bps` integer NOT NULL,
	`commission_minor` integer NOT NULL,
	`refunded_net_minor` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`hold_reason` text,
	`paid_at` integer NOT NULL,
	`matures_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_conversions_attribution_id_unique` ON `affiliate_conversions` (`attribution_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_conversions_buyer_user_id_unique` ON `affiliate_conversions` (`buyer_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_conversions_polar_order_id_unique` ON `affiliate_conversions` (`polar_order_id`);--> statement-breakpoint
CREATE INDEX `affiliate_conversions_affiliate_idx` ON `affiliate_conversions` (`affiliate_id`,`status`);--> statement-breakpoint
CREATE INDEX `affiliate_conversions_matures_idx` ON `affiliate_conversions` (`status`,`matures_at`);--> statement-breakpoint
CREATE TABLE `affiliate_link_clicks` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`day` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_link_clicks_unique` ON `affiliate_link_clicks` (`link_id`,`day`,`visitor_hash`);--> statement-breakpoint
CREATE TABLE `affiliate_links` (
	`id` text PRIMARY KEY NOT NULL,
	`affiliate_id` text NOT NULL,
	`code` text NOT NULL,
	`label` text,
	`discount_bps` integer DEFAULT 0 NOT NULL,
	`destination_path` text DEFAULT '/' NOT NULL,
	`utm_campaign` text,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_links_code_unique` ON `affiliate_links` (`code`);--> statement-breakpoint
CREATE INDEX `affiliate_links_affiliate_idx` ON `affiliate_links` (`affiliate_id`,`status`);--> statement-breakpoint
CREATE TABLE `affiliate_payout_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`currency` text NOT NULL,
	`rules_version` integer NOT NULL,
	`threshold_minor` integer NOT NULL,
	`created_by` text NOT NULL,
	`approved_by` text,
	`approval_id` text,
	`approved_at` integer,
	`cancelled_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_payout_batches_period_open` ON `affiliate_payout_batches` (`period`) WHERE "affiliate_payout_batches"."status" != 'cancelled';--> statement-breakpoint
CREATE TABLE `affiliate_payout_items` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`affiliate_id` text NOT NULL,
	`payout_method_id` text NOT NULL,
	`method_type` text NOT NULL,
	`gross_minor` integer NOT NULL,
	`service_fee_minor` integer NOT NULL,
	`withholding_minor` integer NOT NULL,
	`net_minor` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payout_currency` text,
	`fx_rate` text,
	`payout_amount_minor` integer,
	`provider_fee_minor` integer,
	`external_reference` text,
	`paid_by` text,
	`paid_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_payout_items_external_reference_unique` ON `affiliate_payout_items` (`external_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_payout_items_batch_affiliate` ON `affiliate_payout_items` (`batch_id`,`affiliate_id`);--> statement-breakpoint
CREATE TABLE `affiliate_payout_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`affiliate_id` text NOT NULL,
	`type` text NOT NULL,
	`sealed_details` text NOT NULL,
	`display_hint` text NOT NULL,
	`payee_type` text NOT NULL,
	`residency` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `affiliate_payout_methods_affiliate_idx` ON `affiliate_payout_methods` (`affiliate_id`,`status`);--> statement-breakpoint
CREATE TABLE `affiliate_polar_discounts` (
	`id` text PRIMARY KEY NOT NULL,
	`discount_bps` integer NOT NULL,
	`products_key` text NOT NULL,
	`polar_discount_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_polar_discounts_unique` ON `affiliate_polar_discounts` (`discount_bps`,`products_key`);--> statement-breakpoint
CREATE TABLE `affiliate_program_rules` (
	`version` integer PRIMARY KEY NOT NULL,
	`rules` text NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `affiliate_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`affiliate_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_reference` text NOT NULL,
	`status` text NOT NULL,
	`verified_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `affiliate_verifications_affiliate_idx` ON `affiliate_verifications` (`affiliate_id`,`status`);--> statement-breakpoint
CREATE TABLE `affiliates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`terms_version` text NOT NULL,
	`terms_accepted_at` integer NOT NULL,
	`suspended_reason` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliates_user_id_unique` ON `affiliates` (`user_id`);--> statement-breakpoint
CREATE TABLE `commission_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`affiliate_id` text NOT NULL,
	`conversion_id` text,
	`payout_item_id` text,
	`kind` text NOT NULL,
	`from_bucket` text,
	`to_bucket` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`actor_user_id` text,
	`reason` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commission_ledger_idempotency_key_unique` ON `commission_ledger` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `commission_ledger_affiliate_idx` ON `commission_ledger` (`affiliate_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `commission_ledger_conversion_idx` ON `commission_ledger` (`conversion_id`);--> statement-breakpoint
-- The commission ledger is append-only: corrections are new entries, never edits.
CREATE TRIGGER `commission_ledger_no_update` BEFORE UPDATE ON `commission_ledger` BEGIN SELECT RAISE(ABORT, 'commission_ledger is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `commission_ledger_no_delete` BEFORE DELETE ON `commission_ledger` BEGIN SELECT RAISE(ABORT, 'commission_ledger is append-only'); END;
