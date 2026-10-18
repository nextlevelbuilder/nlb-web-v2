CREATE TABLE `activity_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text,
	`event_type` text NOT NULL,
	`stage` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`occurred_at` integer NOT NULL,
	`links` text DEFAULT '[]' NOT NULL,
	`private_object_keys` text DEFAULT '[]' NOT NULL,
	`counterparty_user_id` text,
	`counterparty_confirmed_at` integer,
	`status` text DEFAULT 'submitted' NOT NULL,
	`source` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`client_key` text NOT NULL,
	`decision_reason` text,
	`decided_by` text,
	`decided_at` integer,
	`event_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `builder_projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activity_evidence_status_created_idx` ON `activity_evidence` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_evidence_user_occurred_idx` ON `activity_evidence` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activity_evidence_counterparty_idx` ON `activity_evidence` (`counterparty_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `activity_evidence_user_client_key_unique` ON `activity_evidence` (`user_id`,`client_key`);--> statement-breakpoint
CREATE TABLE `badge_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`badge_key` text NOT NULL,
	`season_key` text DEFAULT '' NOT NULL,
	`event_ids` text DEFAULT '[]' NOT NULL,
	`awarded_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`revoked_at` integer,
	`revoke_reason` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `badge_awards_user_badge_season_unique` ON `badge_awards` (`user_id`,`badge_key`,`season_key`);--> statement-breakpoint
CREATE TABLE `builder_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject_user_id` text NOT NULL,
	`actor_user_id` text,
	`actor_role` text NOT NULL,
	`project_id` text,
	`stage` text NOT NULL,
	`event_type` text NOT NULL,
	`source` text NOT NULL,
	`external_event_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`received_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`ruleset_version` text NOT NULL,
	`verification` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`evidence_id` text,
	`supersedes_event_id` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`provenance` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `builder_events_event_id_unique` ON `builder_events` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `builder_events_dedupe_key_unique` ON `builder_events` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `builder_events_subject_occurred_idx` ON `builder_events` (`subject_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `builder_events_occurred_idx` ON `builder_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `builder_events_type_source_external_idx` ON `builder_events` (`event_type`,`source`,`external_event_id`);--> statement-breakpoint
CREATE TABLE `builder_moderation_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`reason_codes` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `builder_moderation_actions_target_idx` ON `builder_moderation_actions` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `builder_pilot_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`added_by` text NOT NULL,
	`note` text,
	`added_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `builder_privacy` (
	`user_id` text PRIMARY KEY NOT NULL,
	`leaderboard_public` integer DEFAULT false NOT NULL,
	`passport_public` integer DEFAULT false NOT NULL,
	`wrapped_public` integer DEFAULT false NOT NULL,
	`peer_mentions_ok` integer DEFAULT false NOT NULL,
	`backfill_opt_in` integer DEFAULT false NOT NULL,
	`redact_financials` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `builder_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`stage` text DEFAULT 'validate' NOT NULL,
	`product_id` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `builder_projects_owner_slug_unique` ON `builder_projects` (`owner_user_id`,`slug`);--> statement-breakpoint
CREATE TABLE `builder_share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`year` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `builder_share_links_token_hash_unique` ON `builder_share_links` (`token_hash`);--> statement-breakpoint
CREATE TABLE `community_wrapped_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'provisional' NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_wrapped_snapshots_year_version_unique` ON `community_wrapped_snapshots` (`year`,`version`);--> statement-breakpoint
CREATE TABLE `evidence_appeals` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`resolved_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`evidence_id`) REFERENCES `activity_evidence`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `league_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`board` text NOT NULL,
	`period_type` text NOT NULL,
	`period_key` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'provisional' NOT NULL,
	`ruleset_version` text NOT NULL,
	`watermark_at` integer NOT NULL,
	`event_hash` text NOT NULL,
	`entries` text DEFAULT '[]' NOT NULL,
	`supersedes_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `league_snapshots_board_period_revision_unique` ON `league_snapshots` (`board`,`period_type`,`period_key`,`revision`);--> statement-breakpoint
CREATE TABLE `mentor_nominations` (
	`id` text PRIMARY KEY NOT NULL,
	`nominee_user_id` text NOT NULL,
	`mentor_user_id` text NOT NULL,
	`rank` text NOT NULL,
	`year` integer NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`nominee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mentor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mentor_nominations_unique` ON `mentor_nominations` (`nominee_user_id`,`mentor_user_id`,`rank`,`year`);--> statement-breakpoint
CREATE TABLE `rank_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`rank` text NOT NULL,
	`ruleset_version` text NOT NULL,
	`checklist` text DEFAULT '{}' NOT NULL,
	`awarded_by` text,
	`event_id` text,
	`awarded_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`frozen_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rank_awards_user_idx` ON `rank_awards` (`user_id`,`awarded_at`);--> statement-breakpoint
CREATE TABLE `render_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`year` integer NOT NULL,
	`snapshot_id` text NOT NULL,
	`format` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`output_key` text,
	`error` text,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `render_jobs_dedupe_key_unique` ON `render_jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `render_jobs_status_idx` ON `render_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `reward_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`reward_id` text NOT NULL,
	`user_id` text NOT NULL,
	`period_key` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`note` text,
	`decided_by` text,
	`decided_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`reward_id`) REFERENCES `reward_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reward_claims_reward_user_period_unique` ON `reward_claims` (`reward_id`,`user_id`,`period_key`);--> statement-breakpoint
CREATE TABLE `reward_items` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`eligibility` text DEFAULT '{}' NOT NULL,
	`inventory` integer,
	`budget_note` text,
	`available_from` integer,
	`available_until` integer,
	`active` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reward_items_key_unique` ON `reward_items` (`key`);--> statement-breakpoint
CREATE TABLE `score_cap_slots` (
	`slot_key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `score_cap_slots_user_idx` ON `score_cap_slots` (`user_id`);--> statement-breakpoint
CREATE INDEX `score_cap_slots_entry_idx` ON `score_cap_slots` (`entry_id`);--> statement-breakpoint
CREATE TABLE `score_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`award_type` text NOT NULL,
	`stage` text NOT NULL,
	`rp` integer NOT NULL,
	`ruleset_version` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`reverses_entry_id` text,
	`reason` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `score_ledger_dedupe_key_unique` ON `score_ledger` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `score_ledger_user_occurred_idx` ON `score_ledger` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `score_ledger_occurred_idx` ON `score_ledger` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `score_rulesets` (
	`version` text PRIMARY KEY NOT NULL,
	`effective_from` integer NOT NULL,
	`checksum` text NOT NULL,
	`definition` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `season_enrollments` (
	`user_id` text NOT NULL,
	`season_key` text NOT NULL,
	`track` text NOT NULL,
	`goal` text,
	`joined_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `season_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `share_attributions` (
	`id` text PRIMARY KEY NOT NULL,
	`share_link_id` text NOT NULL,
	`kind` text NOT NULL,
	`user_id` text,
	`utm` text DEFAULT '{}' NOT NULL,
	`visitor_hash` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`share_link_id`) REFERENCES `builder_share_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `share_attributions_link_idx` ON `share_attributions` (`share_link_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `share_attributions_user_idx` ON `share_attributions` (`user_id`);--> statement-breakpoint
CREATE TABLE `time_capsule_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`year` integer NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `time_capsule_entries_user_year_kind_version_unique` ON `time_capsule_entries` (`user_id`,`year`,`kind`,`version`);--> statement-breakpoint
CREATE TABLE `yearly_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`year` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'provisional' NOT NULL,
	`ruleset_version` text NOT NULL,
	`data` text NOT NULL,
	`provenance` text DEFAULT '{}' NOT NULL,
	`hidden_scenes` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `yearly_snapshots_user_year_version_unique` ON `yearly_snapshots` (`user_id`,`year`,`version`);
--> statement-breakpoint
-- Seed the published rulesets. Checksums are sha256 of the canonical definition JSON (effectiveFrom excluded); tests assert they match the code.
INSERT INTO `score_rulesets` (`version`, `effective_from`, `checksum`, `definition`, `created_at`) VALUES ('v1', 1735664400000, '79f26e402e1796f1ba8c6f7ac2c4fd4695315bc312188a91812d9e0e806efea1', '{"events":{"contribute_contributor_work":{"caps":[{"max":1,"per":"user","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":false,"minSummaryLength":0},"key":"contribute_contributor_work","requiredVerification":"moderator_verified","rp":15,"stage":"contribute"},"contribute_discord_active":{"caps":[{"max":1,"per":"user","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":false,"minSummaryLength":0},"key":"contribute_discord_active","requiredVerification":"system_verified","rp":3,"stage":"contribute"},"contribute_featured":{"caps":[{"max":2,"per":"user","window":"month"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":false,"minSummaryLength":0},"key":"contribute_featured","requiredVerification":"moderator_verified","rp":50,"stage":"contribute"},"contribute_peer_help":{"caps":[{"max":5,"per":"user","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":true,"linkRequired":false,"minSummaryLength":0},"key":"contribute_peer_help","requiredVerification":"peer_confirmed","rp":8,"stage":"contribute"},"contribute_weekly_feedback":{"caps":[{"max":1,"per":"user","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":false,"minSummaryLength":0},"key":"contribute_weekly_feedback","requiredVerification":"system_verified","rp":5,"stage":"contribute"},"ship_highlighted_post":{"caps":[{"max":2,"per":"user","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":0},"key":"ship_highlighted_post","requiredVerification":"moderator_verified","rp":25,"stage":"ship"},"ship_product_launch":{"caps":[{"max":1,"per":"project","window":"lifetime"}],"dedupeScope":"project","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":0},"key":"ship_product_launch","requiredVerification":"moderator_verified","rp":100,"stage":"ship"},"ship_public_post":{"caps":[{"max":4,"per":"user","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":0},"key":"ship_public_post","requiredVerification":"moderator_verified","rp":10,"stage":"ship"}},"league":{"componentCaps":{"month":{"build":400,"contribute":160,"ship":600,"validate":480},"season":{"build":800,"contribute":320,"ship":1200,"validate":960},"week":{"build":100,"contribute":40,"ship":150,"validate":120},"year":{"build":4000,"contribute":1600,"ship":6000,"validate":4800}},"weights":{"build":0.2,"contribute":0.1,"ship":0.35,"validate":0.35}},"level":{"base":50,"exponent":1.6,"maxLevel":100},"noAutoDowngrade":true,"ranks":[{"contributorWeeksAlternative":null,"maxShareOfMembers":null,"minFeedbackRate":0,"minHighlightedPosts":0,"minMentorNominations":0,"minPeopleHelped":0,"minRp":0,"minShipCount":0,"minTenureDays":0,"minWeeklyCheckIns":0,"rank":"apprentice","requiresFeaturedOrContributor":false},{"contributorWeeksAlternative":null,"maxShareOfMembers":null,"minFeedbackRate":0.8,"minHighlightedPosts":0,"minMentorNominations":0,"minPeopleHelped":0,"minRp":100,"minShipCount":8,"minTenureDays":45,"minWeeklyCheckIns":4,"rank":"builder","requiresFeaturedOrContributor":false},{"contributorWeeksAlternative":null,"maxShareOfMembers":null,"minFeedbackRate":0.9,"minHighlightedPosts":2,"minMentorNominations":0,"minPeopleHelped":5,"minRp":300,"minShipCount":20,"minTenureDays":90,"minWeeklyCheckIns":0,"rank":"architect","requiresFeaturedOrContributor":false},{"contributorWeeksAlternative":null,"maxShareOfMembers":null,"minFeedbackRate":0.95,"minHighlightedPosts":0,"minMentorNominations":0,"minPeopleHelped":0,"minRp":800,"minShipCount":50,"minTenureDays":180,"minWeeklyCheckIns":0,"rank":"master","requiresFeaturedOrContributor":true},{"contributorWeeksAlternative":null,"maxShareOfMembers":0.05,"minFeedbackRate":0,"minHighlightedPosts":0,"minMentorNominations":2,"minPeopleHelped":0,"minRp":2000,"minShipCount":100,"minTenureDays":365,"minWeeklyCheckIns":0,"rank":"legend","requiresFeaturedOrContributor":false}],"seasonEpoch":"2026-10-19T00:00:00+07:00","seasonWeeks":8,"version":"v1"}', 1792195200000);
--> statement-breakpoint
INSERT INTO `score_rulesets` (`version`, `effective_from`, `checksum`, `definition`, `created_at`) VALUES ('v2', 1792170000000, '99ab6e84ec47bba9dd92d7b903bd35127196763d383c010c0943ce022e66cfc2', '{"events":{"build_feedback_improvement":{"caps":[{"max":1,"per":"user","window":"week"},{"max":2,"per":"project","window":"month"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":150},"key":"build_feedback_improvement","requiredVerification":"moderator_verified","rp":25,"stage":"build"},"build_first_real_user":{"caps":[{"max":1,"per":"project","window":"lifetime"},{"max":2,"per":"user","window":"month"}],"dedupeScope":"project","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":120},"key":"build_first_real_user","requiredVerification":"moderator_verified","rp":50,"stage":"build"},"build_mvp":{"caps":[{"max":1,"per":"project","window":"lifetime"},{"max":2,"per":"user","window":"month"}],"dedupeScope":"project","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":120},"key":"build_mvp","requiredVerification":"moderator_verified","rp":30,"stage":"build"},"build_scope_cut":{"caps":[{"max":1,"per":"user","window":"week"},{"max":1,"per":"project","window":"month"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":false,"minSummaryLength":200},"key":"build_scope_cut","requiredVerification":"moderator_verified","rp":20,"stage":"build"},"contribute_contributor_work":{"caps":[{"max":1,"per":"user","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":false,"minSummaryLength":120},"key":"contribute_contributor_work","requiredVerification":"moderator_verified","rp":15,"stage":"contribute"},"contribute_discord_active":{"caps":[{"max":1,"per":"user","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":false,"minSummaryLength":0},"key":"contribute_discord_active","requiredVerification":"system_verified","rp":3,"stage":"contribute"},"contribute_featured":{"caps":[{"max":1,"per":"user","window":"month"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":0},"key":"contribute_featured","requiredVerification":"moderator_verified","rp":50,"stage":"contribute"},"contribute_peer_help":{"caps":[{"max":3,"per":"user","window":"week"},{"max":1,"per":"counterparty","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":true,"linkRequired":false,"minSummaryLength":80},"key":"contribute_peer_help","requiredVerification":"peer_confirmed","rp":8,"stage":"contribute"},"contribute_weekly_feedback":{"caps":[{"max":1,"per":"user","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":false,"minSummaryLength":0},"key":"contribute_weekly_feedback","requiredVerification":"system_verified","rp":5,"stage":"contribute"},"ship_distribution_case_study":{"caps":[{"max":2,"per":"user","window":"month"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":300},"key":"ship_distribution_case_study","requiredVerification":"moderator_verified","rp":35,"stage":"ship"},"ship_first_payment":{"caps":[{"max":1,"per":"project","window":"lifetime"},{"max":4,"per":"user","window":"year"}],"dedupeScope":"project","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":80},"key":"ship_first_payment","requiredVerification":"moderator_verified","rp":100,"stage":"ship"},"ship_highlighted_post":{"caps":[{"max":1,"per":"user","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":0},"key":"ship_highlighted_post","requiredVerification":"moderator_verified","rp":25,"stage":"ship"},"ship_product_launch":{"caps":[{"max":1,"per":"project","window":"lifetime"},{"max":4,"per":"user","window":"year"}],"dedupeScope":"project","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":120},"key":"ship_product_launch","requiredVerification":"moderator_verified","rp":100,"stage":"ship"},"ship_public_post":{"caps":[{"max":4,"per":"user","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":0},"key":"ship_public_post","requiredVerification":"moderator_verified","rp":10,"stage":"ship"},"validate_interviews":{"caps":[{"max":2,"per":"user","window":"week"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":false,"minSummaryLength":400},"key":"validate_interviews","requiredVerification":"moderator_verified","rp":30,"stage":"validate"},"validate_problem_signal":{"caps":[{"max":3,"per":"user","window":"week"},{"max":2,"per":"project","window":"month"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":false,"minSummaryLength":200},"key":"validate_problem_signal","requiredVerification":"moderator_verified","rp":10,"stage":"validate"},"validate_stop_pivot":{"caps":[{"max":1,"per":"user","window":"month"},{"max":2,"per":"project","window":"lifetime"}],"dedupeScope":"event","evidence":{"counterpartyConfirmation":false,"linkRequired":false,"minSummaryLength":300},"key":"validate_stop_pivot","requiredVerification":"moderator_verified","rp":40,"stage":"validate"},"validate_waitlist":{"caps":[{"max":1,"per":"project","window":"lifetime"},{"max":2,"per":"user","window":"month"}],"dedupeScope":"project","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":120},"key":"validate_waitlist","requiredVerification":"moderator_verified","rp":25,"stage":"validate"},"validate_wtp_commitment":{"caps":[{"max":1,"per":"project","window":"lifetime"},{"max":6,"per":"user","window":"year"}],"dedupeScope":"project","evidence":{"counterpartyConfirmation":false,"linkRequired":true,"minSummaryLength":200},"key":"validate_wtp_commitment","requiredVerification":"moderator_verified","rp":60,"stage":"validate"}},"league":{"componentCaps":{"month":{"build":400,"contribute":160,"ship":600,"validate":480},"season":{"build":800,"contribute":320,"ship":1200,"validate":960},"week":{"build":100,"contribute":40,"ship":150,"validate":120},"year":{"build":4000,"contribute":1600,"ship":6000,"validate":4800}},"weights":{"build":0.2,"contribute":0.1,"ship":0.35,"validate":0.35}},"level":{"base":50,"exponent":1.6,"maxLevel":100},"noAutoDowngrade":true,"ranks":[{"contributorWeeksAlternative":null,"maxShareOfMembers":null,"minFeedbackRate":0,"minHighlightedPosts":0,"minMentorNominations":0,"minPeopleHelped":0,"minRp":0,"minShipCount":0,"minTenureDays":0,"minWeeklyCheckIns":0,"rank":"apprentice","requiresFeaturedOrContributor":false},{"contributorWeeksAlternative":8,"maxShareOfMembers":null,"minFeedbackRate":0.8,"minHighlightedPosts":0,"minMentorNominations":0,"minPeopleHelped":0,"minRp":100,"minShipCount":8,"minTenureDays":45,"minWeeklyCheckIns":4,"rank":"builder","requiresFeaturedOrContributor":false},{"contributorWeeksAlternative":20,"maxShareOfMembers":null,"minFeedbackRate":0.9,"minHighlightedPosts":2,"minMentorNominations":0,"minPeopleHelped":5,"minRp":300,"minShipCount":20,"minTenureDays":90,"minWeeklyCheckIns":0,"rank":"architect","requiresFeaturedOrContributor":false},{"contributorWeeksAlternative":40,"maxShareOfMembers":null,"minFeedbackRate":0.95,"minHighlightedPosts":0,"minMentorNominations":0,"minPeopleHelped":0,"minRp":800,"minShipCount":50,"minTenureDays":180,"minWeeklyCheckIns":0,"rank":"master","requiresFeaturedOrContributor":true},{"contributorWeeksAlternative":80,"maxShareOfMembers":0.05,"minFeedbackRate":0,"minHighlightedPosts":0,"minMentorNominations":2,"minPeopleHelped":0,"minRp":2000,"minShipCount":100,"minTenureDays":365,"minWeeklyCheckIns":0,"rank":"legend","requiresFeaturedOrContributor":false}],"seasonEpoch":"2026-10-19T00:00:00+07:00","seasonWeeks":8,"version":"v2"}', 1792195200000);
