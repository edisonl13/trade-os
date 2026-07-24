CREATE TABLE `user_settings` (
	`userId` text NOT NULL,
	`locale` text DEFAULT 'en-US',
	`billingEmail` text,
	`subscriptionPlan` text DEFAULT 'Free',
	`twoFactorEnabled` integer DEFAULT 0,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `trading_account` ADD `monthlyProfitTarget` real DEFAULT 0;