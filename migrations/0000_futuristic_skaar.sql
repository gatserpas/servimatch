CREATE TABLE `professionals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`service` text NOT NULL,
	`price` integer NOT NULL,
	`bio` text NOT NULL,
	`available` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `professionals_user_id_unique` ON `professionals` (`user_id`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`pro` integer,
	`suggested_pro` integer,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pro`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`suggested_pro`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`role` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth_id_unique` ON `users` (`auth_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);