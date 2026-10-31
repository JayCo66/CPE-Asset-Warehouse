<?php
declare(strict_types=1);

date_default_timezone_set('Asia/Bangkok');
set_time_limit(1800);

$projectRoot = dirname(__DIR__);
$allowedEnvironment = array_fill_keys([
    'APP_ENV', 'REDIS_ENABLED', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB', 'REDIS_KEY_PREFIX',
    'REDIS_CONNECT_TIMEOUT', 'REDIS_READ_TIMEOUT', 'REDIS_MAX_ENTRY_BYTES', 'REDIS_CACHE_LIBRARY',
    'COMPOSER_AUTOLOAD', 'WAREHOUSE_DB_HOST', 'WAREHOUSE_DB_PORT', 'WAREHOUSE_DB_USER', 'WAREHOUSE_DB_PASS',
    'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME', 'CPE_SNAPSHOT_ARCHIVE_DIR',
    'CPE_SNAPSHOT_LOCK_TTL', 'CPE_SNAPSHOT_MAX_ATTEMPTS', 'CPE_SNAPSHOT_RETRY_BASE_SECONDS',
    'CPE_SNAPSHOT_LOCK_WAIT_SECONDS',
], true);
$environmentFile = getenv('CPE_SNAPSHOT_ENV_FILE') ?: $projectRoot . DIRECTORY_SEPARATOR . '.env';
if (is_file($environmentFile) && is_readable($environmentFile)) {
    foreach (file($environmentFile, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$name, $value] = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);
        if (!isset($allowedEnvironment[$name]) || getenv($name) !== false) {
            continue;
        }
        if (strlen($value) >= 2 && (($value[0] === '"' && str_ends_with($value, '"')) || ($value[0] === "'" && str_ends_with($value, "'")))) {
            $value = substr($value, 1, -1);
        }
        putenv($name . '=' . $value);
        $_ENV[$name] = $value;
    }
}

if (getenv('APP_ENV') === false) {
    putenv('APP_ENV=local');
}
if ((getenv('APP_ENV') ?: 'local') === 'local') {
    foreach ([
        'REDIS_ENABLED' => 'true',
        'REDIS_HOST' => '127.0.0.1',
        'REDIS_PORT' => '6380',
        'REDIS_KEY_PREFIX' => 'cpe:local:',
    ] as $name => $value) {
        if (getenv($name) === false) {
            putenv($name . '=' . $value);
        }
    }
}
if (getenv('CPE_SNAPSHOT_ARCHIVE_DIR') === false || trim((string)getenv('CPE_SNAPSHOT_ARCHIVE_DIR')) === '') {
    putenv('CPE_SNAPSHOT_ARCHIVE_DIR=' . $projectRoot . DIRECTORY_SEPARATOR . 'output' . DIRECTORY_SEPARATOR . 'history');
}

define('WAREHOUSE_UNIVERSITY_IMPORT_LIBRARY_ONLY', true);
require_once $projectRoot . '/assets_api/import_university_snapshot.php';

function warehouseUniversityWorkerWriteResult(array $result): void
{
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . PHP_EOL;
}

function warehouseUniversityWorkerRecordEarlyFailure(?RedisCache $cache, string $archiveDirectory, string $mode, string $code): void
{
    $state = [
        'state' => 'failed',
        'mode' => $mode,
        'failedAt' => gmdate('Y-m-d H:i:s'),
        'error' => $code,
    ];
    warehouseUniversityRecordJobState($cache, $state, $archiveDirectory . DIRECTORY_SEPARATOR . '.university-snapshot-worker.log');
    warehouseUniversityRecordJobFailure($cache, $state);
}

$arguments = array_slice($argv, 1);
$dryRun = in_array('--dry-run', $arguments, true);
$scheduled = in_array('--scheduled', $arguments, true) || in_array('--retry', $arguments, true);
$manual = in_array('--manual', $arguments, true);
$unknownArguments = array_diff($arguments, ['--dry-run', '--scheduled', '--retry', '--manual']);
if ($unknownArguments !== [] || $scheduled === $manual) {
    fwrite(STDERR, "Usage: php scripts/sync_university_snapshot.php --scheduled|--retry|--manual [--dry-run]\n");
    exit(2);
}

$archiveDirectory = warehouseUniversitySnapshotArchiveDirectory();
try {
    define('WAREHOUSE_INVENTORY_API_REQUEST', true);
    require $projectRoot . '/assets_api/warehouse_db.php';
    $attempts = $scheduled
        ? max(1, min(5, (int)(getenv('CPE_SNAPSHOT_MAX_ATTEMPTS') ?: 3)))
        : 1;
    $retryBase = max(1, min(30, (int)(getenv('CPE_SNAPSHOT_RETRY_BASE_SECONDS') ?: 2)));
    $lockTtl = max(60, min(3600, (int)(getenv('CPE_SNAPSHOT_LOCK_TTL') ?: 600)));
    $lockWait = max(0, min(1800, (int)(getenv('CPE_SNAPSHOT_LOCK_WAIT_SECONDS') ?: 600)));
    $result = warehouseUniversityRunSnapshotJob($warehousePdo, $archiveDirectory, [
        'scheduled' => $scheduled,
        'dry_run' => $dryRun,
        'attempts' => $attempts,
        'retry_base_seconds' => $retryBase,
        'lock_ttl_seconds' => $lockTtl,
        'lock_wait_seconds' => $lockWait,
        'warm_cache' => $scheduled && !$dryRun,
    ]);
    warehouseUniversityWorkerWriteResult($result);
    exit(0);
} catch (WarehouseUniversitySnapshotBusyException) {
    warehouseUniversityWorkerWriteResult(['state' => 'busy']);
    exit(0);
} catch (Throwable $error) {
    if (!$error instanceof WarehouseUniversityTransientException) {
        warehouseUniversityWorkerRecordEarlyFailure(
            warehouseUniversitySnapshotCache(),
            $archiveDirectory,
            $scheduled ? 'scheduled' : 'manual',
            'snapshot_import_failed',
        );
    }
    fwrite(STDERR, $error instanceof WarehouseUniversityTransientException
        ? "University API import failed after the configured retries.\n"
        : "Snapshot worker failed before publication.\n");
    exit(1);
}
