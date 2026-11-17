CREATE TABLE `sepay_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_code` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`product_kind` text NOT NULL,
	`product_ref` text NOT NULL,
	`product_name` text NOT NULL,
	`period_months` integer,
	`amount_vnd` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`locale` text,
	`sepay_transaction_id` text,
	`received_amount_vnd` integer,
	`valid_from` integer,
	`valid_until` integer,
	`paid_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sepay_orders_order_code_unique` ON `sepay_orders` (`order_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `sepay_orders_sepay_transaction_id_unique` ON `sepay_orders` (`sepay_transaction_id`);--> statement-breakpoint
CREATE INDEX `sepay_orders_user_status_idx` ON `sepay_orders` (`user_id`,`status`);