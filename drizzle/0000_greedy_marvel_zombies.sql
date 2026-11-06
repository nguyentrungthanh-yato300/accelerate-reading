CREATE TABLE `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`source_url` text,
	`language` text NOT NULL,
	`word_count` integer NOT NULL,
	`quiz` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer NOT NULL,
	`status` text DEFAULT 'reading' NOT NULL,
	`mode` text NOT NULL,
	`purpose` text,
	`prediction` text,
	`preview_ms` integer,
	`read_ms` integer,
	`pacer_wpm` integer,
	`wpm` real,
	`summary` text,
	`summary_score` real,
	`summary_feedback` text,
	`quiz_answers` text,
	`quiz_score` real,
	`effective_wpm` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
