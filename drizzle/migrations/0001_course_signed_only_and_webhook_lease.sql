ALTER TABLE `course_videos` ADD `stream_signed_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `webhook_events` ADD `locked_until` integer;