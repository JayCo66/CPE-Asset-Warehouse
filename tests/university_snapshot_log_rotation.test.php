<?php
declare(strict_types=1);

require_once __DIR__ . '/../assets_api/university_snapshot_job.php';

$directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'cpe-snapshot-log-' . bin2hex(random_bytes(8));
if (!mkdir($directory, 0700, true)) {
    throw new RuntimeException('Unable to create the temporary log test directory.');
}

$logPath = $directory . DIRECTORY_SEPARATOR . 'worker.log';
$previousPath = $logPath . '.1';
$largeContents = str_repeat('x', WAREHOUSE_SNAPSHOT_JOB_LOG_MAX_BYTES);

try {
    file_put_contents($logPath, $largeContents);
    file_put_contents($previousPath, 'older log generation');

    if (!warehouseUniversityRotateJobLog($logPath)) {
        throw new RuntimeException('A full worker log should rotate successfully.');
    }
    if (is_file($logPath) || file_get_contents($previousPath) !== $largeContents) {
        throw new RuntimeException('The completed log generation should be retained as .1.');
    }

    warehouseUniversityRecordJobState(null, ['state' => 'test'], $logPath);
    $newContents = file_get_contents($logPath);
    if (!is_string($newContents) || !str_contains($newContents, '"state":"test"')) {
        throw new RuntimeException('A new log should be created after rotation.');
    }

    echo "Snapshot worker log rotation tests passed\n";
} finally {
    @unlink($logPath);
    @unlink($previousPath);
    @rmdir($directory);
}
