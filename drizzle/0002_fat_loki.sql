CREATE TABLE IF NOT EXISTS `login_code` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`usedAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `login_code_email_idx` ON `login_code` (`email`,`createdAt`);--> statement-breakpoint
ALTER TABLE `trade` ADD `sourceSymbol` text;--> statement-breakpoint
ALTER TABLE `trade` ADD `sourceTradeId` text;--> statement-breakpoint
ALTER TABLE `trade` ADD `initialRiskAmount` real;--> statement-breakpoint
ALTER TABLE `trade` ADD `commission` real;--> statement-breakpoint
ALTER TABLE `trade` ADD `swap` real;--> statement-breakpoint
ALTER TABLE `trade` ADD `otherFees` real;--> statement-breakpoint
ALTER TABLE `trade` ADD `grossPnl` real;--> statement-breakpoint
ALTER TABLE `trade` ADD `netPnl` real;--> statement-breakpoint
ALTER TABLE `trade` ADD `pnlMode` text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE `trade` ADD `sourceTimezone` text;--> statement-breakpoint
ALTER TABLE `trade` ADD `confirmedByUser` integer DEFAULT true NOT NULL;
