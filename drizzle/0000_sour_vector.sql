CREATE TABLE `add_ons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`retreat_id` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`unit_price_pence` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`retreat_id`) REFERENCES `retreats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `add_ons_retreat_code_uq` ON `add_ons` (`retreat_id`,`code`);--> statement-breakpoint
CREATE INDEX `add_ons_retreat_idx` ON `add_ons` (`retreat_id`);--> statement-breakpoint
CREATE TABLE `booking_holds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hold_token` text NOT NULL,
	`retreat_id` integer NOT NULL,
	`room_type_id` integer NOT NULL,
	`occupancy` text NOT NULL,
	`email_hash` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`retreat_id`) REFERENCES `retreats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_holds_token_uq` ON `booking_holds` (`hold_token`);--> statement-breakpoint
CREATE INDEX `booking_holds_room_type_idx` ON `booking_holds` (`room_type_id`);--> statement-breakpoint
CREATE INDEX `booking_holds_expires_at_idx` ON `booking_holds` (`expires_at`);--> statement-breakpoint
CREATE TABLE `booking_lookup_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email_hash` text NOT NULL,
	`ip_hash` text NOT NULL,
	`success` integer DEFAULT false NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `booking_lookup_attempts_email_hash_idx` ON `booking_lookup_attempts` (`email_hash`);--> statement-breakpoint
CREATE INDEX `booking_lookup_attempts_ip_hash_idx` ON `booking_lookup_attempts` (`ip_hash`);--> statement-breakpoint
CREATE INDEX `booking_lookup_attempts_created_at_idx` ON `booking_lookup_attempts` (`created_at`);--> statement-breakpoint
CREATE TABLE `booking_lookup_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`requested_ip_hash` text,
	`consumed_ip_hash` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_lookup_tokens_hash_uq` ON `booking_lookup_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `booking_lookup_tokens_booking_idx` ON `booking_lookup_tokens` (`booking_id`);--> statement-breakpoint
CREATE INDEX `booking_lookup_tokens_expires_at_idx` ON `booking_lookup_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`confirmation_code` text NOT NULL,
	`retreat_id` integer NOT NULL,
	`room_type_id` integer NOT NULL,
	`occupancy` text NOT NULL,
	`guest_count` integer NOT NULL,
	`lead_first_name` text NOT NULL,
	`lead_last_name` text NOT NULL,
	`lead_email` text NOT NULL,
	`lead_phone` text,
	`guest2_first_name` text,
	`guest2_last_name` text,
	`guest2_email` text,
	`dietary_lead` text,
	`dietary_guest2` text,
	`addons` text DEFAULT (json_array()) NOT NULL,
	`notes` text,
	`subtotal_pence` integer NOT NULL,
	`addons_total_pence` integer DEFAULT 0 NOT NULL,
	`total_pence` integer NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_provider` text,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`payment_reference` text,
	`paid_at` integer,
	`marketing_opt_in` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`retreat_id`) REFERENCES `retreats`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_confirmation_code_uq` ON `bookings` (`confirmation_code`);--> statement-breakpoint
CREATE INDEX `bookings_retreat_idx` ON `bookings` (`retreat_id`);--> statement-breakpoint
CREATE INDEX `bookings_room_type_idx` ON `bookings` (`room_type_id`);--> statement-breakpoint
CREATE INDEX `bookings_lead_email_idx` ON `bookings` (`lead_email`);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`summary` text,
	`country` text,
	`region` text,
	`address` text,
	`tbc_address` integer DEFAULT false NOT NULL,
	`listing_url` text,
	`lat` real,
	`lng` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_slug_uq` ON `locations` (`slug`);--> statement-breakpoint
CREATE TABLE `newsletter_subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`source` text DEFAULT 'other' NOT NULL,
	`confirmed_at` integer,
	`unsubscribed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_email_uq` ON `newsletter_subscribers` (`email`);--> statement-breakpoint
CREATE INDEX `newsletter_source_idx` ON `newsletter_subscribers` (`source`);--> statement-breakpoint
CREATE TABLE `practitioners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`bio` text,
	`discipline` text,
	`instagram_url` text,
	`website_url` text,
	`image_url` text,
	`is_tbc` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practitioners_slug_uq` ON `practitioners` (`slug`);--> statement-breakpoint
CREATE TABLE `retreat_practitioners` (
	`retreat_id` integer NOT NULL,
	`practitioner_id` integer NOT NULL,
	`role` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`retreat_id`, `practitioner_id`),
	FOREIGN KEY (`retreat_id`) REFERENCES `retreats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`practitioner_id`) REFERENCES `practitioners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `retreat_practitioners_retreat_idx` ON `retreat_practitioners` (`retreat_id`);--> statement-breakpoint
CREATE INDEX `retreat_practitioners_practitioner_idx` ON `retreat_practitioners` (`practitioner_id`);--> statement-breakpoint
CREATE TABLE `retreats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`location_id` integer NOT NULL,
	`tagline` text,
	`description` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`timezone` text DEFAULT 'Europe/London' NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`is_sold_out` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `retreats_slug_uq` ON `retreats` (`slug`);--> statement-breakpoint
CREATE INDEX `retreats_starts_at_idx` ON `retreats` (`starts_at`);--> statement-breakpoint
CREATE INDEX `retreats_location_id_idx` ON `retreats` (`location_id`);--> statement-breakpoint
CREATE TABLE `room_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`retreat_id` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price_pair_pence` integer NOT NULL,
	`price_solo_pence` integer NOT NULL,
	`inventory_total` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`retreat_id`) REFERENCES `retreats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_types_retreat_code_uq` ON `room_types` (`retreat_id`,`code`);--> statement-breakpoint
CREATE INDEX `room_types_retreat_idx` ON `room_types` (`retreat_id`);--> statement-breakpoint
CREATE TABLE `waitlist_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`retreat_id` integer NOT NULL,
	`email` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`room_type_id_pref` integer,
	`occupancy_pref` text,
	`notes` text,
	`notified_at` integer,
	`converted_booking_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`retreat_id`) REFERENCES `retreats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_type_id_pref`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`converted_booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `waitlist_retreat_email_uq` ON `waitlist_entries` (`retreat_id`,`email`);--> statement-breakpoint
CREATE INDEX `waitlist_retreat_idx` ON `waitlist_entries` (`retreat_id`);--> statement-breakpoint
CREATE INDEX `waitlist_email_idx` ON `waitlist_entries` (`email`);