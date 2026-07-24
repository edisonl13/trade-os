CREATE TABLE `account` (
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `providerAccountId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `csv_mapping` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`broker` text DEFAULT '' NOT NULL,
	`mapping` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`sessionToken` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6366F1',
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trade_screenshot` (
	`id` text PRIMARY KEY NOT NULL,
	`tradeId` text NOT NULL,
	`url` text NOT NULL,
	`extractedFields` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`tradeId`) REFERENCES `trade`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trade_tag` (
	`tradeId` text NOT NULL,
	`tagId` text NOT NULL,
	FOREIGN KEY (`tradeId`) REFERENCES `trade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tagId`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trade` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`tradingAccountId` text NOT NULL,
	`symbol` text NOT NULL,
	`direction` text NOT NULL,
	`entryPrice` real,
	`stopLoss` real,
	`targetPrice` real,
	`plannedRR` real,
	`actualEntry` real,
	`actualExit` real,
	`positionSize` real,
	`fees` real DEFAULT 0,
	`pnl` real,
	`actualR` real,
	`returnPercent` real,
	`tradedAt` integer NOT NULL,
	`closedAt` integer,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`weekDay` integer,
	`session` text,
	`strategy` text,
	`setup` text,
	`notes` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`importBatch` text,
	`idempotencyKey` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tradingAccountId`) REFERENCES `trading_account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trading_account` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`label` text DEFAULT 'Default' NOT NULL,
	`broker` text DEFAULT '',
	`currency` text DEFAULT 'USD' NOT NULL,
	`initialBalance` real DEFAULT 0 NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text NOT NULL,
	`emailVerified` integer,
	`image` text
);
--> statement-breakpoint
CREATE TABLE `verificationToken` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
