-- Preserve the three verified legacy inventory captures currently in EC2.
-- This migration is date/count guarded and safe to rerun.
DELIMITER //
DROP PROCEDURE IF EXISTS `migrate_ec2_legacy_inventory_snapshots`//
CREATE PROCEDURE `migrate_ec2_legacy_inventory_snapshots`()
BEGIN
  DECLARE snapshot_table_exists INT DEFAULT 0;
  DECLARE snapshot_column_exists INT DEFAULT 0;
  DECLARE date_21_rows BIGINT DEFAULT 0;
  DECLARE date_21_assets BIGINT DEFAULT 0;
  DECLARE date_22_rows BIGINT DEFAULT 0;
  DECLARE date_22_assets BIGINT DEFAULT 0;
  DECLARE date_23_rows BIGINT DEFAULT 0;
  DECLARE date_23_assets BIGINT DEFAULT 0;
  DECLARE unexpected_rows BIGINT DEFAULT 0;
  DECLARE duplicate_groups BIGINT DEFAULT 0;
  DECLARE invalid_asset_rows BIGINT DEFAULT 0;
  DECLARE date_dimension_rows BIGINT DEFAULT 0;
  DECLARE conflicting_snapshots BIGINT DEFAULT 0;
  DECLARE conflicting_fact_ids BIGINT DEFAULT 0;
  DECLARE unassigned_rows BIGINT DEFAULT 0;
  DECLARE assigned_21_rows BIGINT DEFAULT 0;
  DECLARE assigned_22_rows BIGINT DEFAULT 0;
  DECLARE assigned_23_rows BIGINT DEFAULT 0;

  SELECT COUNT(*) INTO snapshot_table_exists
    FROM `information_schema`.`TABLES`
    WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'dim_inventory_snapshot';
  SELECT COUNT(*) INTO snapshot_column_exists
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'fact_asset_inventory'
      AND `COLUMN_NAME` = 'snapshot_id';

  SELECT COUNT(*), COALESCE(SUM(`asset_count`), 0)
    INTO date_21_rows, date_21_assets
    FROM `fact_asset_inventory` WHERE `snapshot_date_key` = 20261021;
  SELECT COUNT(*), COALESCE(SUM(`asset_count`), 0)
    INTO date_22_rows, date_22_assets
    FROM `fact_asset_inventory` WHERE `snapshot_date_key` = 20261022;
  SELECT COUNT(*), COALESCE(SUM(`asset_count`), 0)
    INTO date_23_rows, date_23_assets
    FROM `fact_asset_inventory` WHERE `snapshot_date_key` = 20261023;
  SELECT COUNT(*) INTO unexpected_rows FROM `fact_asset_inventory`
    WHERE `snapshot_date_key` IS NULL
       OR `snapshot_date_key` NOT IN (20261021, 20261022, 20261023);
  SELECT COUNT(*) INTO duplicate_groups FROM (
    SELECT `snapshot_date_key`, `asset_key`
      FROM `fact_asset_inventory`
      GROUP BY `snapshot_date_key`, `asset_key`
      HAVING `asset_key` IS NULL OR COUNT(*) > 1
  ) AS `duplicates`;
  SELECT COUNT(*) INTO invalid_asset_rows FROM `fact_asset_inventory`
    WHERE `asset_count` IS NULL OR `asset_count` <> 1 OR `asset_key` IS NULL;
  SELECT COUNT(*) INTO date_dimension_rows FROM `dim_date`
    WHERE `date_key` IN (20261021, 20261022, 20261023);

  IF snapshot_column_exists = 1 THEN
    SELECT COUNT(*) INTO conflicting_fact_ids FROM `fact_asset_inventory`
      WHERE (`snapshot_date_key` = 20261021 AND `snapshot_id` IS NOT NULL AND `snapshot_id` NOT IN ('', 'fd150057-10d7-4635-9d87-a807cd4721a6'))
         OR (`snapshot_date_key` = 20261022 AND `snapshot_id` IS NOT NULL AND `snapshot_id` NOT IN ('', '379cf335-e90a-4e00-986c-a6e8624ca4c0'))
         OR (`snapshot_date_key` = 20261023 AND `snapshot_id` IS NOT NULL AND `snapshot_id` NOT IN ('', '7dca40c9-0a37-46ba-914d-a039a93ba8d3'));
  END IF;

  IF snapshot_table_exists = 1 THEN
    SELECT COUNT(*) INTO conflicting_snapshots FROM `dim_inventory_snapshot`
      WHERE (`snapshot_id` = 'fd150057-10d7-4635-9d87-a807cd4721a6'
             AND NOT (`snapshot_date_key` = 20261021 AND `snapshot_label` = 'EC2-LEGACY-2026-10-21'
                      AND `source_system` = 'legacy_warehouse' AND `imported_at` IS NULL
                      AND `asset_count` = 4324 AND `archive_key` = 'assets_20261021__fd150057-10d7-4635-9d87-a807cd4721a6.json'))
         OR (`snapshot_id` = '379cf335-e90a-4e00-986c-a6e8624ca4c0'
             AND NOT (`snapshot_date_key` = 20261022 AND `snapshot_label` = 'EC2-LEGACY-2026-10-22'
                      AND `source_system` = 'legacy_warehouse' AND `imported_at` IS NULL
                      AND `asset_count` = 4336 AND `archive_key` = 'assets_20261022__379cf335-e90a-4e00-986c-a6e8624ca4c0.json'))
         OR (`snapshot_id` = '7dca40c9-0a37-46ba-914d-a039a93ba8d3'
             AND NOT (`snapshot_date_key` = 20261023 AND `snapshot_label` = 'EC2-LEGACY-2026-10-23'
                      AND `source_system` = 'legacy_warehouse' AND `imported_at` IS NULL
                      AND `asset_count` = 4336 AND `archive_key` = 'assets_20261023__7dca40c9-0a37-46ba-914d-a039a93ba8d3.json'))
         OR (`snapshot_label` = 'EC2-LEGACY-2026-10-21' AND `snapshot_id` <> 'fd150057-10d7-4635-9d87-a807cd4721a6')
         OR (`snapshot_label` = 'EC2-LEGACY-2026-10-22' AND `snapshot_id` <> '379cf335-e90a-4e00-986c-a6e8624ca4c0')
         OR (`snapshot_label` = 'EC2-LEGACY-2026-10-23' AND `snapshot_id` <> '7dca40c9-0a37-46ba-914d-a039a93ba8d3')
         OR (`archive_key` = 'assets_20261021__fd150057-10d7-4635-9d87-a807cd4721a6.json' AND `snapshot_id` <> 'fd150057-10d7-4635-9d87-a807cd4721a6')
         OR (`archive_key` = 'assets_20261022__379cf335-e90a-4e00-986c-a6e8624ca4c0.json' AND `snapshot_id` <> '379cf335-e90a-4e00-986c-a6e8624ca4c0')
         OR (`archive_key` = 'assets_20261023__7dca40c9-0a37-46ba-914d-a039a93ba8d3.json' AND `snapshot_id` <> '7dca40c9-0a37-46ba-914d-a039a93ba8d3');
  END IF;

  IF date_21_rows <> 4324 OR date_21_assets <> 4324
     OR date_22_rows <> 4336 OR date_22_assets <> 4336
     OR date_23_rows <> 4336 OR date_23_assets <> 4336
     OR unexpected_rows <> 0 OR duplicate_groups <> 0 OR invalid_asset_rows <> 0
     OR date_dimension_rows <> 3 OR conflicting_snapshots <> 0 OR conflicting_fact_ids <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'EC2 snapshot migration stopped: live captures differ from the verified baseline.';
  END IF;

  CREATE TABLE IF NOT EXISTS `dim_inventory_snapshot` (
    `snapshot_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `snapshot_date_key` INT NOT NULL,
    `snapshot_label` VARCHAR(120) NOT NULL,
    `source_system` VARCHAR(40) NOT NULL,
    `imported_at` DATETIME NULL COMMENT 'UTC server import time; NULL for legacy snapshots',
    `asset_count` INT UNSIGNED NOT NULL DEFAULT 0,
    `archive_key` VARCHAR(255) NULL,
    PRIMARY KEY (`snapshot_id`),
    UNIQUE KEY `uq_dim_inventory_snapshot_label` (`snapshot_label`),
    UNIQUE KEY `uq_dim_inventory_snapshot_archive` (`archive_key`),
    KEY `idx_dim_inventory_snapshot_date` (`snapshot_date_key`, `imported_at`),
    CONSTRAINT `fk_dim_inventory_snapshot_date`
      FOREIGN KEY (`snapshot_date_key`) REFERENCES `dim_date` (`date_key`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  IF snapshot_column_exists = 0 THEN
    ALTER TABLE `fact_asset_inventory`
      ADD COLUMN `snapshot_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL
      COMMENT 'Stable identity for an inventory snapshot' AFTER `snapshot_date_key`;
  END IF;

  INSERT INTO `dim_inventory_snapshot`
    (`snapshot_id`, `snapshot_date_key`, `snapshot_label`, `source_system`, `imported_at`, `asset_count`, `archive_key`)
  SELECT 'fd150057-10d7-4635-9d87-a807cd4721a6', 20261021, 'EC2-LEGACY-2026-10-21', 'legacy_warehouse', NULL, 4324,
         'assets_20261021__fd150057-10d7-4635-9d87-a807cd4721a6.json'
    WHERE NOT EXISTS (SELECT 1 FROM `dim_inventory_snapshot` WHERE `snapshot_id` = 'fd150057-10d7-4635-9d87-a807cd4721a6');
  INSERT INTO `dim_inventory_snapshot`
    (`snapshot_id`, `snapshot_date_key`, `snapshot_label`, `source_system`, `imported_at`, `asset_count`, `archive_key`)
  SELECT '379cf335-e90a-4e00-986c-a6e8624ca4c0', 20261022, 'EC2-LEGACY-2026-10-22', 'legacy_warehouse', NULL, 4336,
         'assets_20261022__379cf335-e90a-4e00-986c-a6e8624ca4c0.json'
    WHERE NOT EXISTS (SELECT 1 FROM `dim_inventory_snapshot` WHERE `snapshot_id` = '379cf335-e90a-4e00-986c-a6e8624ca4c0');
  INSERT INTO `dim_inventory_snapshot`
    (`snapshot_id`, `snapshot_date_key`, `snapshot_label`, `source_system`, `imported_at`, `asset_count`, `archive_key`)
  SELECT '7dca40c9-0a37-46ba-914d-a039a93ba8d3', 20261023, 'EC2-LEGACY-2026-10-23', 'legacy_warehouse', NULL, 4336,
         'assets_20261023__7dca40c9-0a37-46ba-914d-a039a93ba8d3.json'
    WHERE NOT EXISTS (SELECT 1 FROM `dim_inventory_snapshot` WHERE `snapshot_id` = '7dca40c9-0a37-46ba-914d-a039a93ba8d3');

  UPDATE `fact_asset_inventory` SET `snapshot_id` = 'fd150057-10d7-4635-9d87-a807cd4721a6'
    WHERE `snapshot_date_key` = 20261021 AND (`snapshot_id` IS NULL OR `snapshot_id` = '');
  UPDATE `fact_asset_inventory` SET `snapshot_id` = '379cf335-e90a-4e00-986c-a6e8624ca4c0'
    WHERE `snapshot_date_key` = 20261022 AND (`snapshot_id` IS NULL OR `snapshot_id` = '');
  UPDATE `fact_asset_inventory` SET `snapshot_id` = '7dca40c9-0a37-46ba-914d-a039a93ba8d3'
    WHERE `snapshot_date_key` = 20261023 AND (`snapshot_id` IS NULL OR `snapshot_id` = '');

  SELECT COUNT(*) INTO assigned_21_rows FROM `fact_asset_inventory`
    WHERE `snapshot_date_key` = 20261021 AND `snapshot_id` = 'fd150057-10d7-4635-9d87-a807cd4721a6';
  SELECT COUNT(*) INTO assigned_22_rows FROM `fact_asset_inventory`
    WHERE `snapshot_date_key` = 20261022 AND `snapshot_id` = '379cf335-e90a-4e00-986c-a6e8624ca4c0';
  SELECT COUNT(*) INTO assigned_23_rows FROM `fact_asset_inventory`
    WHERE `snapshot_date_key` = 20261023 AND `snapshot_id` = '7dca40c9-0a37-46ba-914d-a039a93ba8d3';
  SELECT COUNT(*) INTO unassigned_rows FROM `fact_asset_inventory`
    WHERE `snapshot_id` IS NULL OR `snapshot_id` = '';
  IF assigned_21_rows <> 4324 OR assigned_22_rows <> 4336 OR assigned_23_rows <> 4336 OR unassigned_rows <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'EC2 snapshot migration stopped: fact rows were not fully assigned.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM `information_schema`.`STATISTICS`
    WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'fact_asset_inventory'
      AND `INDEX_NAME` = 'uq_fact_inventory_snapshot_asset'
  ) THEN
    ALTER TABLE `fact_asset_inventory`
      ADD UNIQUE KEY `uq_fact_inventory_snapshot_asset` (`snapshot_id`, `asset_key`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM `information_schema`.`KEY_COLUMN_USAGE`
    WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'fact_asset_inventory'
      AND `COLUMN_NAME` = 'snapshot_id' AND `REFERENCED_TABLE_NAME` = 'dim_inventory_snapshot'
  ) THEN
    ALTER TABLE `fact_asset_inventory`
      ADD CONSTRAINT `fk_fact_inventory_snapshot`
      FOREIGN KEY (`snapshot_id`) REFERENCES `dim_inventory_snapshot` (`snapshot_id`);
  END IF;

  ALTER TABLE `fact_asset_inventory` MODIFY COLUMN `snapshot_id`
    CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
    COMMENT 'Stable identity for an inventory snapshot';
END//
CALL `migrate_ec2_legacy_inventory_snapshots`()//
DROP PROCEDURE `migrate_ec2_legacy_inventory_snapshots`//
DELIMITER ;
