CREATE TABLE `softphone_test_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `softphone_test_scenarios_name_idx` ON `softphone_test_scenarios` (`name`);
