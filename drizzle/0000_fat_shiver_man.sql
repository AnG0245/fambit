CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`license_id` text NOT NULL,
	`device_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text,
	`token_expires` integer DEFAULT 0 NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`license_id`) REFERENCES `licenses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_devices_license_device` ON `devices` (`license_id`,`device_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_devices_token` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `families` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`revit` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`object_key` text NOT NULL,
	`thumbnail_key` text,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`published` integer DEFAULT 1 NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_families_owner_category` ON `families` (`owner`,`category`);--> statement-breakpoint
CREATE TABLE `licenses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_suffix` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires` integer NOT NULL,
	`max_devices` integer DEFAULT 1 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_licenses_key` ON `licenses` (`key_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_licenses_owner_email` ON `licenses` (`owner`,`email`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`version` text NOT NULL,
	`url` text NOT NULL,
	`sha256` text NOT NULL,
	`notes` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_releases_owner_created` ON `releases` (`owner`,`created`);