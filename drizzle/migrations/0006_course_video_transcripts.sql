CREATE TABLE `course_video_transcripts` (
	`video_id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `course_videos`(`id`) ON UPDATE no action ON DELETE cascade
);
