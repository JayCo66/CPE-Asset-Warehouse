<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/assets_api/university_snapshot_job.php';

$archiveDirectory = warehouseUniversitySnapshotArchiveDirectory();
try {
    $capacity = warehouseUniversitySnapshotStorageStatus($archiveDirectory);
    $result = [
        'state' => $capacity['allowed'] ? 'ok' : 'warning',
        'checkedAt' => gmdate('Y-m-d H:i:s'),
        'archiveDirectory' => $archiveDirectory,
        'storage' => $capacity,
    ];
    echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
    exit($capacity['allowed'] ? 0 : 2);
} catch (Throwable) {
    echo json_encode([
        'state' => 'failed',
        'checkedAt' => gmdate('Y-m-d H:i:s'),
        'error' => 'storage_check_unavailable',
    ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
    exit(1);
}
