-- Add stable snapshot identities without replacing existing inventory facts.
-- Run against cpe_warehouse after confirming the expected local archive rows.
DELIMITER //
DROP PROCEDURE IF EXISTS `migrate_inventory_snapshot_identity`//
CREATE PROCEDURE `migrate_inventory_snapshot_identity`()
BEGIN
  DECLARE oct22_rows INT DEFAULT 0;
  DECLARE oct22_assets BIGINT DEFAULT 0;
  DECLARE oct25_rows INT DEFAULT 0;
  DECLARE oct25_assets BIGINT DEFAULT 0;
  DECLARE duplicate_facts INT DEFAULT 0;
  DECLARE unexpected_rows INT DEFAULT 0;
  DECLARE snapshot_table_exists INT DEFAULT 0;
  DECLARE snapshot_column_exists INT DEFAULT 0;
  DECLARE baseline_oct22_rows INT DEFAULT 0;
  DECLARE baseline_oct25_rows INT DEFAULT 0;
  DECLARE unassigned_facts INT DEFAULT 0;
  DECLARE migration_complete INT DEFAULT 0;

  SELECT COUNT(*) INTO snapshot_table_exists
    FROM `information_schema`.`TABLES`
    WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'dim_inventory_snapshot';
  SELECT COUNT(*) INTO snapshot_column_exists
    FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'fact_asset_inventory'
      AND `COLUMN_NAME` = 'snapshot_id';

  IF snapshot_table_exists = 1 AND snapshot_column_exists = 1 THEN
    SELECT COUNT(*) INTO baseline_oct22_rows FROM `fact_asset_inventory`
      WHERE `snapshot_id` = 'be5166d5-2bc0-5ecc-8176-54a6260df3f4';
    SELECT COUNT(*) INTO baseline_oct25_rows FROM `fact_asset_inventory`
      WHERE `snapshot_id` = '7691a4ef-74df-5c9f-8995-44137312ad5b';
    SELECT COUNT(*) INTO unassigned_facts FROM `fact_asset_inventory`
      WHERE `snapshot_id` IS NULL OR `snapshot_id` = '';
    IF baseline_oct22_rows = 4324 AND baseline_oct25_rows = 4424 AND unassigned_facts = 0 THEN
      SET migration_complete = 1;
    END IF;
  END IF;

  IF migration_complete = 0 THEN
    SELECT COUNT(*), COALESCE(SUM(`asset_count`), 0)
      INTO oct22_rows, oct22_assets
      FROM `fact_asset_inventory` WHERE `snapshot_date_key` = 20261022;
    SELECT COUNT(*), COALESCE(SUM(`asset_count`), 0)
      INTO oct25_rows, oct25_assets
      FROM `fact_asset_inventory` WHERE `snapshot_date_key` = 20261025;
    SELECT COUNT(*) INTO duplicate_facts FROM (
      SELECT `snapshot_date_key`, `asset_key`
      FROM `fact_asset_inventory`
      GROUP BY `snapshot_date_key`, `asset_key`
      HAVING `asset_key` IS NOT NULL AND COUNT(*) > 1
    ) AS duplicated;
    SELECT COUNT(*) INTO unexpected_rows
      FROM `fact_asset_inventory`
      WHERE `snapshot_date_key` IS NULL OR `snapshot_date_key` NOT IN (20261022, 20261025);

    IF oct22_rows <> 4324 OR oct22_assets <> 4324
       OR oct25_rows <> 4424 OR oct25_assets <> 4424
       OR duplicate_facts <> 0 OR unexpected_rows <> 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Snapshot migration stopped: local dates/counts or fact uniqueness differ from the verified baseline.';
    END IF;
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

  IF NOT EXISTS (
    SELECT 1 FROM `information_schema`.`COLUMNS`
    WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'fact_asset_inventory'
      AND `COLUMN_NAME` = 'snapshot_id'
  ) THEN
    ALTER TABLE `fact_asset_inventory`
      ADD COLUMN `snapshot_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL
      COMMENT 'FK เชื่อม snapshot identity ที่แยกแต่ละชุดข้อมูล' AFTER `snapshot_date_key`;
  END IF;

  INSERT INTO `dim_inventory_snapshot`
    (`snapshot_id`, `snapshot_date_key`, `snapshot_label`, `source_system`, `imported_at`, `asset_count`, `archive_key`)
  SELECT 'be5166d5-2bc0-5ecc-8176-54a6260df3f4', 20261022, '2026-10-22', 'legacy_warehouse', NULL,
         COALESCE(
           (SELECT SUM(`asset_count`) FROM `fact_asset_inventory` WHERE `snapshot_id` = 'be5166d5-2bc0-5ecc-8176-54a6260df3f4'),
           (SELECT SUM(`asset_count`) FROM `fact_asset_inventory` WHERE `snapshot_date_key` = 20261022 AND `snapshot_id` IS NULL),
           0
         ), 'assets_20261022.json'
  ON DUPLICATE KEY UPDATE
    `snapshot_label` = VALUES(`snapshot_label`), `source_system` = VALUES(`source_system`),
    `asset_count` = VALUES(`asset_count`), `archive_key` = VALUES(`archive_key`);

  INSERT INTO `dim_inventory_snapshot`
    (`snapshot_id`, `snapshot_date_key`, `snapshot_label`, `source_system`, `imported_at`, `asset_count`, `archive_key`)
  SELECT '7691a4ef-74df-5c9f-8995-44137312ad5b', 20261025, 'DEMO-2026-10-25', 'demo_seed', NULL,
         COALESCE(
           (SELECT SUM(`asset_count`) FROM `fact_asset_inventory` WHERE `snapshot_id` = '7691a4ef-74df-5c9f-8995-44137312ad5b'),
           (SELECT SUM(`asset_count`) FROM `fact_asset_inventory` WHERE `snapshot_date_key` = 20261025 AND `snapshot_id` IS NULL),
           0
         ), 'assets_20261025.json'
  ON DUPLICATE KEY UPDATE
    `snapshot_label` = VALUES(`snapshot_label`), `source_system` = VALUES(`source_system`),
    `asset_count` = VALUES(`asset_count`), `archive_key` = VALUES(`archive_key`);

  UPDATE `fact_asset_inventory` SET `snapshot_id` = 'be5166d5-2bc0-5ecc-8176-54a6260df3f4'
    WHERE `snapshot_date_key` = 20261022 AND (`snapshot_id` IS NULL OR `snapshot_id` = '');
  UPDATE `fact_asset_inventory` SET `snapshot_id` = '7691a4ef-74df-5c9f-8995-44137312ad5b'
    WHERE `snapshot_date_key` = 20261025 AND (`snapshot_id` IS NULL OR `snapshot_id` = '');

  IF EXISTS (SELECT 1 FROM `fact_asset_inventory` WHERE `snapshot_id` IS NULL OR `snapshot_id` = '') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Snapshot migration stopped: facts contain dates outside the verified backfill mapping.';
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
    COMMENT 'FK เชื่อม snapshot identity ที่แยกแต่ละชุดข้อมูล';
END//
CALL `migrate_inventory_snapshot_identity`()//
DROP PROCEDURE `migrate_inventory_snapshot_identity`//
DELIMITER ;
