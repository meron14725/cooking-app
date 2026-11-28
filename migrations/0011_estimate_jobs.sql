CREATE TABLE `estimate_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`refresh_stale_prices` integer DEFAULT false NOT NULL,
	`progress` text NOT NULL,
	`rounds` integer DEFAULT 0 NOT NULL,
	`error` text,
	`finished_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "estimate_jobs_status_check" CHECK(status IN ('running', 'done', 'stopped', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `estimate_jobs_one_running` ON `estimate_jobs` (`status`) WHERE status = 'running';--> statement-breakpoint
CREATE INDEX `estimate_jobs_created_idx` ON `estimate_jobs` (`created_at`);