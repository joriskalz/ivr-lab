CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_provider_account_idx` ON `account` (`providerId`,`accountId`);--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE TABLE `admin_softphone_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clientEntryId` text NOT NULL,
	`sessionId` text,
	`correlationCode` text,
	`callIdentifier` text,
	`profileId` text,
	`profileName` text,
	`profileSnapshot` text,
	`operatorUserId` text,
	`operatorName` text,
	`operatorEmail` text,
	`operatorImage` text,
	`operatorRole` text,
	`startedAt` text NOT NULL,
	`endedAt` text NOT NULL,
	`finalCallState` text,
	`totalDurationMs` integer DEFAULT 0 NOT NULL,
	`totalDurationWithoutInitMs` integer DEFAULT 0 NOT NULL,
	`callPayload` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`operatorUserId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_softphone_calls_clientEntryId_unique` ON `admin_softphone_calls` (`clientEntryId`);--> statement-breakpoint
CREATE INDEX `admin_softphone_calls_ended_at_idx` ON `admin_softphone_calls` (`endedAt`);--> statement-breakpoint
CREATE INDEX `admin_softphone_calls_operator_email_idx` ON `admin_softphone_calls` (`operatorEmail`);--> statement-breakpoint
CREATE INDEX `admin_softphone_calls_profile_id_idx` ON `admin_softphone_calls` (`profileId`);--> statement-breakpoint
CREATE INDEX `admin_softphone_calls_session_id_idx` ON `admin_softphone_calls` (`sessionId`);--> statement-breakpoint
CREATE TABLE `admin_softphone_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`callId` integer NOT NULL,
	`sentiment` text,
	`phaseGroup` text,
	`severityRating` integer,
	`submittedAt` text,
	`feedbackPayload` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`callId`) REFERENCES `admin_softphone_calls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_softphone_feedback_callId_unique` ON `admin_softphone_feedback` (`callId`);--> statement-breakpoint
CREATE INDEX `admin_softphone_feedback_sentiment_idx` ON `admin_softphone_feedback` (`sentiment`);--> statement-breakpoint
CREATE INDEX `admin_softphone_feedback_submitted_at_idx` ON `admin_softphone_feedback` (`submittedAt`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`userId`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);