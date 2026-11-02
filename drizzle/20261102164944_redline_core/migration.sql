CREATE TABLE `activity` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`review_id` text NOT NULL,
	`asset_id` text,
	`version_number` integer,
	`comment_id` text,
	`kind` text NOT NULL,
	`decision` text,
	`actor_name` text NOT NULL,
	`excerpt` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_activity_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_activity_review_id_reviews_id_fk` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_activity_asset_id_assets_id_fk` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_activity_comment_id_comments_id_fk` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `activity_reads` (
	`activity_id` text NOT NULL,
	`user_id` text NOT NULL,
	`read_at` integer NOT NULL,
	CONSTRAINT `activity_reads_pk` PRIMARY KEY(`activity_id`, `user_id`),
	CONSTRAINT `fk_activity_reads_activity_id_activity_id_fk` FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_activity_reads_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `app_secrets` (
	`name` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`review_id` text NOT NULL,
	`name` text NOT NULL,
	`current_version_id` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_assets_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_assets_review_id_reviews_id_fk` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`review_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`version_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`parent_id` text,
	`pin_number` integer,
	`x` real,
	`y` real,
	`body` text NOT NULL,
	`author_kind` text NOT NULL,
	`author_user_id` text,
	`guest_id` text,
	`author_name` text NOT NULL,
	`internal` integer DEFAULT false NOT NULL,
	`resolved_at` integer,
	`resolved_by_name` text,
	`from_version_number` integer,
	`source_comment_id` text,
	`deleted_at` integer,
	`edited_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_comments_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_comments_review_id_reviews_id_fk` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_comments_asset_id_assets_id_fk` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_comments_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_comments_parent_id_comments_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `comments`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_comments_author_user_id_user_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_comments_guest_id_guests_id_fk` FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`review_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`version_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`decision` text NOT NULL,
	`guest_id` text,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_decisions_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_decisions_review_id_reviews_id_fk` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_decisions_asset_id_assets_id_fk` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_decisions_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_decisions_guest_id_guests_id_fk` FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `email_log` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`review_id` text,
	`kind` text NOT NULL,
	`recipient` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_email_log_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_email_log_review_id_reviews_id_fk` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `email_throttles` (
	`key` text PRIMARY KEY,
	`last_sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY,
	`review_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`last_feedback_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_guests_review_id_reviews_id_fk` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`version_id` text NOT NULL,
	`number` integer NOT NULL,
	`preview_key` text NOT NULL,
	`preview_size` integer NOT NULL,
	`content_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	CONSTRAINT `fk_pages_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_pages_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY,
	`review_id` text,
	`workspace_id` text,
	`token` text NOT NULL,
	`reason` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_reports_review_id_reviews_id_fk` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_reports_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `review_links` (
	`review_id` text PRIMARY KEY,
	`token` text NOT NULL UNIQUE,
	`password_hash` text,
	`password_version` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`allow_downloads` integer DEFAULT false NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_review_links_review_id_reviews_id_fk` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `review_recipients` (
	`id` text PRIMARY KEY,
	`review_id` text NOT NULL,
	`email` text NOT NULL,
	`added_by_id` text,
	`last_sent_at` integer,
	`last_status` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_review_recipients_review_id_reviews_id_fk` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_review_recipients_added_by_id_user_id_fk` FOREIGN KEY (`added_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`client_name` text NOT NULL,
	`created_by_id` text,
	`last_activity_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_reviews_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_reviews_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`review_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`number` integer NOT NULL,
	`kind` text NOT NULL,
	`original_key` text NOT NULL,
	`original_name` text NOT NULL,
	`original_size` integer NOT NULL,
	`content_type` text NOT NULL,
	`page_count` integer NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`upload_id` text,
	`copy_from_version_id` text,
	`notified_at` integer,
	`created_by_id` text,
	`created_by_name` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_versions_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_versions_review_id_reviews_id_fk` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_versions_asset_id_assets_id_fk` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_versions_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_invites` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`email` text,
	`created_by_id` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by_id` text,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_workspace_invites_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_workspace_invites_created_by_id_user_id_fk` FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_workspace_invites_accepted_by_id_user_id_fk` FOREIGN KEY (`accepted_by_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`last_active_at` integer NOT NULL,
	`inbox_seen_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `workspace_members_pk` PRIMARY KEY(`workspace_id`, `user_id`),
	CONSTRAINT `fk_workspace_members_workspace_id_workspaces_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_workspace_members_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`accent_color` text NOT NULL,
	`logo_key` text,
	`logo_size` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_workspace_idx` ON `activity` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `assets_review_idx` ON `assets` (`review_id`);--> statement-breakpoint
CREATE INDEX `comments_review_idx` ON `comments` (`review_id`,`internal`);--> statement-breakpoint
CREATE INDEX `comments_version_idx` ON `comments` (`version_id`);--> statement-breakpoint
CREATE INDEX `comments_parent_idx` ON `comments` (`parent_id`);--> statement-breakpoint
CREATE INDEX `comments_guest_idx` ON `comments` (`guest_id`);--> statement-breakpoint
CREATE INDEX `decisions_asset_idx` ON `decisions` (`asset_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `decisions_review_idx` ON `decisions` (`review_id`);--> statement-breakpoint
CREATE INDEX `email_log_workspace_idx` ON `email_log` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `guests_review_idx` ON `guests` (`review_id`);--> statement-breakpoint
CREATE INDEX `pages_workspace_idx` ON `pages` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pages_version_number_unique` ON `pages` (`version_id`,`number`);--> statement-breakpoint
CREATE INDEX `reports_created_idx` ON `reports` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_recipients_unique` ON `review_recipients` (`review_id`,`email`);--> statement-breakpoint
CREATE INDEX `reviews_workspace_idx` ON `reviews` (`workspace_id`,`last_activity_at`);--> statement-breakpoint
CREATE INDEX `versions_workspace_idx` ON `versions` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `versions_asset_number_unique` ON `versions` (`asset_id`,`number`);--> statement-breakpoint
CREATE INDEX `workspace_invites_workspace_idx` ON `workspace_invites` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `workspace_members_user_idx` ON `workspace_members` (`user_id`);