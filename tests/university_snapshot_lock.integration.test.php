<?php
declare(strict_types=1);

if ((getenv('APP_ENV') ?: 'local') !== 'local') {
    throw new RuntimeException('This integration test is restricted to the local environment.');
}

putenv('REDIS_ENABLED=true');
putenv('REDIS_HOST=127.0.0.1');
putenv('REDIS_PORT=6380');
putenv('REDIS_KEY_PREFIX=cpe:test:snapshot-lock:' . bin2hex(random_bytes(8)) . ':');
define('WAREHOUSE_UNIVERSITY_IMPORT_LIBRARY_ONLY', true);
require_once __DIR__ . '/../assets_api/import_university_snapshot.php';
define('WAREHOUSE_INVENTORY_API_REQUEST', true);
require __DIR__ . '/../assets_api/warehouse_db.php';

$temporaryRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'cpe-snapshot-lock-' . bin2hex(random_bytes(8));
$directoryOne = $temporaryRoot . DIRECTORY_SEPARATOR . 'one';
$directoryTwo = $temporaryRoot . DIRECTORY_SEPARATOR . 'two';
mkdir($directoryOne, 0700, true);
mkdir($directoryTwo, 0700, true);

$pdoTwo = new PDO($warehouseDsn, $warehouseDbUser, $warehouseDbPass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$cache = warehouseUniversitySnapshotCache();
$ownerOne = bin2hex(random_bytes(16));
$ownerTwo = bin2hex(random_bytes(16));
$lockOne = null;
$lockTwo = null;

try {
    $lockOne = warehouseUniversityAcquireImportLock($warehousePdo, $directoryOne, $cache, $ownerOne, 60);
    try {
        $lockTwo = warehouseUniversityAcquireImportLock($pdoTwo, $directoryTwo, $cache, $ownerTwo, 60);
        throw new RuntimeException('A second connection acquired an active import lock.');
    } catch (WarehouseUniversitySnapshotBusyException) {
        // Expected: the MySQL advisory lock prevents a second worker from entering.
    }
    warehouseUniversityReleaseImportLock($warehousePdo, $lockOne, $cache, $ownerOne);
    $lockOne = null;

    $lockTwo = warehouseUniversityAcquireImportLock($pdoTwo, $directoryTwo, $cache, $ownerTwo, 60);
    warehouseUniversityReleaseImportLock($pdoTwo, $lockTwo, $cache, $ownerTwo);
    $lockTwo = null;

    $snapshotDateRow = $warehousePdo->query(
        'SELECT s.`snapshot_date_key`, d.`full_date`
         FROM `dim_inventory_snapshot` s
         JOIN `dim_date` d ON d.`date_key` = s.`snapshot_date_key`
         ORDER BY s.`imported_at` DESC, s.`snapshot_id` DESC LIMIT 1'
    )->fetch(PDO::FETCH_ASSOC);
    if (!is_array($snapshotDateRow)) {
        throw new RuntimeException('The local warehouse has no snapshot date for the daily-marker test.');
    }

    $testDate = new DateTimeImmutable((string)$snapshotDateRow['full_date'], new DateTimeZone('Asia/Bangkok'));
    $temporaryId = warehouseUniversityUuidV4();
    $warehousePdo->beginTransaction();
    try {
        $insert = $warehousePdo->prepare(
            'INSERT INTO `dim_inventory_snapshot`
                (`snapshot_id`, `snapshot_date_key`, `snapshot_label`, `source_system`, `imported_at`, `asset_count`, `archive_key`)
             VALUES (:snapshot_id, :snapshot_date_key, :snapshot_label, :source_system, UTC_TIMESTAMP(), 0, NULL)'
        );
        $insert->execute([
            'snapshot_id' => $temporaryId,
            'snapshot_date_key' => (int)$snapshotDateRow['snapshot_date_key'],
            'snapshot_label' => warehouseUniversityScheduledSnapshotLabelPrefix($testDate) . 'TEST-' . strtoupper(substr($temporaryId, 0, 8)),
            'source_system' => 'university_api',
        ]);
        if (!warehouseUniversityHasScheduledSnapshot($warehousePdo, $testDate)) {
            throw new RuntimeException('The durable automatic-snapshot marker was not detected.');
        }
    } finally {
        if ($warehousePdo->inTransaction()) {
            $warehousePdo->rollBack();
        }
    }

    echo "University snapshot lock integration tests passed\n";
} finally {
    if (is_array($lockOne)) {
        warehouseUniversityReleaseImportLock($warehousePdo, $lockOne, $cache, $ownerOne);
    }
    if (is_array($lockTwo)) {
        warehouseUniversityReleaseImportLock($pdoTwo, $lockTwo, $cache, $ownerTwo);
    }
    $pdoTwo = null;
    $warehousePdo = null;
    @unlink($directoryOne . DIRECTORY_SEPARATOR . '.university-import.lock');
    @unlink($directoryTwo . DIRECTORY_SEPARATOR . '.university-import.lock');
    @rmdir($directoryOne);
    @rmdir($directoryTwo);
    @rmdir($temporaryRoot);
}
