CREATE TABLE `softphone_scenario_managers` (
  `scenarioId` text NOT NULL,
  `userId` text NOT NULL,
  `createdAt` integer NOT NULL,
  FOREIGN KEY (`scenarioId`) REFERENCES `softphone_test_scenarios`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  PRIMARY KEY(`scenarioId`, `userId`)
);

CREATE INDEX `softphone_scenario_managers_scenario_id_idx`
ON `softphone_scenario_managers` (`scenarioId`);

CREATE INDEX `softphone_scenario_managers_user_id_idx`
ON `softphone_scenario_managers` (`userId`);
