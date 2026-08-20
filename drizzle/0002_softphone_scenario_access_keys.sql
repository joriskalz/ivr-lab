ALTER TABLE `softphone_test_scenarios`
ADD COLUMN `accessKey` text NOT NULL DEFAULT '00000';

UPDATE `softphone_test_scenarios`
SET `accessKey` = printf('%05d', abs(random()) % 100000)
WHERE `accessKey` = '00000';

CREATE INDEX `softphone_test_scenarios_access_key_idx`
ON `softphone_test_scenarios` (`accessKey`);
