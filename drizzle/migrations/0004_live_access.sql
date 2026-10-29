CREATE TABLE `live_attendance` (
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`),
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `live_attendee_registrations` (
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`provider_registrant_id` text,
	`join_url_ciphertext` text,
	`status` text NOT NULL,
	`last_error` text,
	`cancel_attempts` integer DEFAULT 0 NOT NULL,
	`next_cancel_attempt_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`),
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `live_events` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title_en` text NOT NULL,
	`title_vi` text NOT NULL,
	`description_en` text DEFAULT '' NOT NULL,
	`description_vi` text DEFAULT '' NOT NULL,
	`topic_id` text,
	`poll_round_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`timezone` text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	`host_name` text NOT NULL,
	`capacity` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`polar_product_id` text,
	`premium_discount_id` text,
	`vip_discount_id` text,
	`meeting_provider` text DEFAULT 'zoom' NOT NULL,
	`refund_policy_en` text DEFAULT '' NOT NULL,
	`refund_policy_vi` text DEFAULT '' NOT NULL,
	`recording_notice_en` text DEFAULT '' NOT NULL,
	`recording_notice_vi` text DEFAULT '' NOT NULL,
	`course_video_id` text,
	`cancelled_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `live_topics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`poll_round_id`) REFERENCES `live_poll_rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_events_slug_unique` ON `live_events` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `live_events_polar_product_id_unique` ON `live_events` (`polar_product_id`);--> statement-breakpoint
CREATE INDEX `live_events_status_starts_idx` ON `live_events` (`status`,`starts_at`);--> statement-breakpoint
CREATE TABLE `live_meetings` (
	`event_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_meeting_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `live_poll_round_topics` (
	`round_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`round_id`, `topic_id`),
	FOREIGN KEY (`round_id`) REFERENCES `live_poll_rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `live_topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `live_poll_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title_en` text NOT NULL,
	`title_vi` text NOT NULL,
	`opens_at` integer NOT NULL,
	`closes_at` integer NOT NULL,
	`timezone` text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`result_snapshot` text,
	`winner_topic_id` text,
	`finalized_at` integer,
	`override_reason` text,
	`override_approval_id` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_poll_rounds_slug_unique` ON `live_poll_rounds` (`slug`);--> statement-breakpoint
CREATE INDEX `live_poll_rounds_window_idx` ON `live_poll_rounds` (`opens_at`,`closes_at`);--> statement-breakpoint
CREATE TABLE `live_seats` (
	`event_id` text NOT NULL,
	`seat_no` integer NOT NULL,
	`state` text DEFAULT 'free' NOT NULL,
	`holder_user_id` text,
	`reservation_id` text,
	`ticket_id` text,
	`expires_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`event_id`, `seat_no`),
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `live_seats_state_idx` ON `live_seats` (`event_id`,`state`);--> statement-breakpoint
CREATE TABLE `live_ticket_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`seat_no` integer NOT NULL,
	`status` text DEFAULT 'held' NOT NULL,
	`expires_at` integer NOT NULL,
	`polar_checkout_id` text,
	`recording_consent_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `live_reservations_user_idx` ON `live_ticket_reservations` (`event_id`,`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `live_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text,
	`polar_order_id` text NOT NULL,
	`reservation_id` text,
	`seat_no` integer,
	`status` text NOT NULL,
	`exception_reason` text,
	`recording_consent_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `live_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_tickets_polar_order_id_unique` ON `live_tickets` (`polar_order_id`);--> statement-breakpoint
CREATE INDEX `live_tickets_event_user_idx` ON `live_tickets` (`event_id`,`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `live_topic_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title_en` text NOT NULL,
	`title_vi` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_topic_groups_slug_unique` ON `live_topic_groups` (`slug`);--> statement-breakpoint
CREATE TABLE `live_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`slug` text NOT NULL,
	`title_en` text NOT NULL,
	`title_vi` text NOT NULL,
	`summary_en` text DEFAULT '' NOT NULL,
	`summary_vi` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `live_topic_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `live_topics_slug_unique` ON `live_topics` (`slug`);--> statement-breakpoint
CREATE INDEX `live_topics_group_idx` ON `live_topics` (`group_id`,`status`);--> statement-breakpoint
CREATE TABLE `live_votes` (
	`round_id` text NOT NULL,
	`user_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`round_id`, `user_id`),
	FOREIGN KEY (`round_id`) REFERENCES `live_poll_rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `live_topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `live_votes_topic_idx` ON `live_votes` (`round_id`,`topic_id`);--> statement-breakpoint
CREATE TABLE `operator_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`args_hash` text NOT NULL,
	`args` text,
	`reason` text NOT NULL,
	`requested_by` text NOT NULL,
	`decided_by` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`decided_at` integer,
	`consumed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operator_approvals_status_idx` ON `operator_approvals` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `operator_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`actor_auth_type` text NOT NULL,
	`client_id` text,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text,
	`args_hash` text,
	`approval_id` text,
	`details` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operator_audit_logs_resource_idx` ON `operator_audit_logs` (`resource`,`created_at`);--> statement-breakpoint
CREATE INDEX `operator_audit_logs_actor_idx` ON `operator_audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `platform_operators` (
	`user_id` text PRIMARY KEY NOT NULL,
	`capabilities` text NOT NULL,
	`granted_by` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`revoked_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
