<?php
declare(strict_types=1);

final class WarehouseUniversitySnapshotBusyException extends RuntimeException
{
}

function warehouseUniversitySnapshotArchiveDirectory(): string
{
    $configured = trim((string)(getenv('CPE_SNAPSHOT_ARCHIVE_DIR') ?: ''));
    $path = $configured !== '' ? $configured : dirname(__DIR__) . '/output/history';
    $isAbsolute = str_starts_with($path, '/') || preg_match('/\A[A-Za-z]:[\\\\\/]/', $path) === 1;
    return $isAbsolute ? $path : dirname(__DIR__) . DIRECTORY_SEPARATOR . $path;
}

function warehouseUniversitySnapshotCache(): ?RedisCache
{
    $library = getenv('REDIS_CACHE_LIBRARY') ?: dirname(__DIR__) . '/lib/RedisCache.php';
    if (is_readable($library)) {
        require_once $library;
    }
    return class_exists(RedisCache::class) ? RedisCache::fromEnvironment() : null;
}

function warehouseUniversityAcquireImportLock(PDO $pdo, string $archiveDirectory, ?RedisCache $cache, string $owner, int $ttl): array
{
    if (!is_dir($archiveDirectory) && !mkdir($archiveDirectory, 0770, true) && !is_dir($archiveDirectory)) {
        throw new RuntimeException('The snapshot archive directory is unavailable.');
    }

    $fileHandle = fopen($archiveDirectory . DIRECTORY_SEPARATOR . '.university-import.lock', 'c');
    if ($fileHandle === false || !flock($fileHandle, LOCK_EX | LOCK_NB)) {
        if (is_resource($fileHandle)) {
            fclose($fileHandle);
        }
        throw new WarehouseUniversitySnapshotBusyException('Another university snapshot import is running.');
    }

    $mysqlLocked = false;
    $redisLocked = false;
    try {
        $statement = $pdo->prepare('SELECT GET_LOCK(:lock_name, 0)');
        $statement->execute(['lock_name' => 'cpe-warehouse:university-snapshot-import']);
        if ((int)$statement->fetchColumn() !== 1) {
            throw new WarehouseUniversitySnapshotBusyException('Another university snapshot import is running.');
        }
        $mysqlLocked = true;

        if ($cache !== null) {
            $redisResult = $cache->acquireLock('snapshot:daily:lock', $owner, $ttl);
            if ($redisResult === false) {
                throw new WarehouseUniversitySnapshotBusyException('Another university snapshot import is running.');
            }
            $redisLocked = $redisResult === true;
        }

        return [
            'file' => $fileHandle,
            'mysql' => $mysqlLocked,
            'redis' => $redisLocked,
        ];
    } catch (Throwable $error) {
        if ($redisLocked && $cache !== null) {
            $cache->releaseLock('snapshot:daily:lock', $owner);
        }
        if ($mysqlLocked) {
            $pdo->query("SELECT RELEASE_LOCK('cpe-warehouse:university-snapshot-import')");
        }
        flock($fileHandle, LOCK_UN);
        fclose($fileHandle);
        throw $error;
    }
}

function warehouseUniversityReleaseImportLock(PDO $pdo, array $lock, ?RedisCache $cache, string $owner): void
{
    if (($lock['redis'] ?? false) && $cache !== null) {
        $cache->releaseLock('snapshot:daily:lock', $owner);
    }
    if ($lock['mysql'] ?? false) {
        try {
            $pdo->query("SELECT RELEASE_LOCK('cpe-warehouse:university-snapshot-import')");
        } catch (Throwable) {
            // Closing the PDO connection releases the advisory lock if release fails.
        }
    }
    if (is_resource($lock['file'] ?? null)) {
        flock($lock['file'], LOCK_UN);
        fclose($lock['file']);
    }
}

function warehouseUniversityHeartbeatImportLock(?RedisCache $cache, string $owner, int $ttl): void
{
    if ($cache === null) {
        return;
    }
    if ($cache->renewLock('snapshot:daily:lock', $owner, $ttl) === false) {
        throw new RuntimeException('The Redis import lease is no longer owned by this worker.');
    }
}

function warehouseUniversityHasScheduledSnapshot(PDO $pdo, DateTimeImmutable $date): bool
{
    $statement = $pdo->prepare(
        'SELECT 1 FROM `dim_inventory_snapshot`
         WHERE `source_system` = :source_system AND `snapshot_label` LIKE :label_prefix
         LIMIT 1'
    );
    $statement->execute([
        'source_system' => 'university_api',
        'label_prefix' => warehouseUniversityScheduledSnapshotLabelPrefix($date) . '%',
    ]);
    return $statement->fetchColumn() !== false;
}

function warehouseUniversityRecordJobState(?RedisCache $cache, array $state, ?string $logPath = null): void
{
    $cache?->setJsonMetadata('snapshot:daily:status', $state, 2592000);
    if ($logPath !== null) {
        $json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        if (is_string($json)) {
            @file_put_contents($logPath, $json . PHP_EOL, FILE_APPEND | LOCK_EX);
        }
    }
}

function warehouseUniversityRecordJobFailure(?RedisCache $cache, array $state): void
{
    $cache?->setJsonMetadata('snapshot:daily:last_failure', $state, 2592000);
}

function warehouseUniversityWarmDashboardCache(string $snapshotId): bool
{
    $script = dirname(__DIR__) . '/scripts/warm_asset_inventory_cache.php';
    if (!is_file($script) || !function_exists('proc_open')) {
        return false;
    }

    $nullDevice = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $process = proc_open(
        [PHP_BINARY, $script, $snapshotId],
        [
            0 => ['file', $nullDevice, 'r'],
            1 => ['file', $nullDevice, 'w'],
            2 => ['file', $nullDevice, 'w'],
        ],
        $pipes,
        dirname(__DIR__),
    );
    if (!is_resource($process)) {
        return false;
    }
    return proc_close($process) === 0;
}

function warehouseUniversityRunSnapshotJob(PDO $pdo, string $archiveDirectory, array $options = []): array
{
    $scheduled = (bool)($options['scheduled'] ?? false);
    $dryRun = (bool)($options['dry_run'] ?? false);
    $warmCache = (bool)($options['warm_cache'] ?? false);
    $ttl = max(60, min(3600, (int)($options['lock_ttl_seconds'] ?? 600)));
    $attemptLimit = max(1, min(5, (int)($options['attempts'] ?? ($scheduled ? 3 : 1))));
    $retryBase = max(1, min(30, (int)($options['retry_base_seconds'] ?? 2)));
    $lockWaitSeconds = $scheduled ? max(0, min(1800, (int)($options['lock_wait_seconds'] ?? 600))) : 0;
    $date = new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok'));
    $startedAt = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
    $owner = bin2hex(random_bytes(16));
    $cache = warehouseUniversitySnapshotCache();
    $logPath = $archiveDirectory . DIRECTORY_SEPARATOR . '.university-snapshot-worker.log';
    $lockDeadline = microtime(true) + $lockWaitSeconds;
    while (true) {
        try {
            $lock = warehouseUniversityAcquireImportLock($pdo, $archiveDirectory, $cache, $owner, $ttl);
            break;
        } catch (WarehouseUniversitySnapshotBusyException $error) {
            if (!$scheduled || microtime(true) >= $lockDeadline) {
                throw $error;
            }
            sleep(min(5, max(1, (int)ceil($lockDeadline - microtime(true)))));
        }
    }

    try {
        if ($scheduled && !$dryRun && warehouseUniversityHasScheduledSnapshot($pdo, $date)) {
            $result = ['state' => 'skipped', 'date' => $date->format('Y-m-d'), 'reason' => 'already_imported'];
            warehouseUniversityRecordJobState($cache, $result + ['finishedAt' => gmdate('Y-m-d H:i:s')], $logPath);
            return $result;
        }

        warehouseUniversityRecordJobState($cache, [
            'state' => 'running',
            'mode' => $scheduled ? 'scheduled' : 'manual',
            'date' => $date->format('Y-m-d'),
            'startedAt' => $startedAt,
            'attempt' => 1,
        ], $logPath);

        for ($attempt = 1; $attempt <= $attemptLimit; $attempt++) {
            try {
                if ($scheduled && !$dryRun && warehouseUniversityHasScheduledSnapshot($pdo, $date)) {
                    $result = ['state' => 'skipped', 'date' => $date->format('Y-m-d'), 'reason' => 'already_imported'];
                    warehouseUniversityRecordJobState($cache, $result + ['finishedAt' => gmdate('Y-m-d H:i:s')], $logPath);
                    return $result;
                }

                $heartbeat = static function () use ($cache, $owner, $ttl): void {
                    warehouseUniversityHeartbeatImportLock($cache, $owner, $ttl);
                };
                $result = warehouseUniversityCreateSnapshot($pdo, $archiveDirectory, $scheduled, $date, $heartbeat, $dryRun);
                if ($dryRun) {
                    $state = ['state' => 'dry_run', 'date' => $date->format('Y-m-d'), 'snapshot' => $result['snapshot']];
                    warehouseUniversityRecordJobState($cache, $state + ['finishedAt' => gmdate('Y-m-d H:i:s')], $logPath);
                    return $state;
                }

                $cache?->invalidateWarehouse();
                $warmed = $scheduled && $warmCache
                    ? warehouseUniversityWarmDashboardCache($result['snapshot']['snapshotId'])
                    : false;
                $state = [
                    'state' => 'succeeded',
                    'mode' => $scheduled ? 'scheduled' : 'manual',
                    'date' => $date->format('Y-m-d'),
                    'finishedAt' => gmdate('Y-m-d H:i:s'),
                    'snapshot' => $result['snapshot'],
                    'cacheWarmed' => $warmed,
                ];
                if ($scheduled) {
                    $cache?->setJsonMetadata('snapshot:daily:last_success', $state['snapshot'], 2592000);
                }
                warehouseUniversityRecordJobState($cache, $state, $logPath);
                return $result + ['state' => 'succeeded', 'cacheWarmed' => $warmed];
            } catch (WarehouseUniversityTransientException $error) {
                if ($attempt >= $attemptLimit) {
                    throw $error;
                }
                $delay = min(30, $retryBase * (2 ** ($attempt - 1)));
                warehouseUniversityRecordJobState($cache, [
                    'state' => 'retry_wait',
                    'mode' => $scheduled ? 'scheduled' : 'manual',
                    'date' => $date->format('Y-m-d'),
                    'attempt' => $attempt,
                    'retryAt' => gmdate('Y-m-d H:i:s', time() + $delay),
                ], $logPath);
                sleep($delay);
            }
        }
    } catch (WarehouseUniversitySnapshotBusyException $error) {
        warehouseUniversityRecordJobState($cache, [
            'state' => 'busy',
            'mode' => $scheduled ? 'scheduled' : 'manual',
            'date' => $date->format('Y-m-d'),
            'finishedAt' => gmdate('Y-m-d H:i:s'),
        ], $logPath);
        throw $error;
    } catch (Throwable $error) {
        $failure = [
            'state' => 'failed',
            'mode' => $scheduled ? 'scheduled' : 'manual',
            'date' => $date->format('Y-m-d'),
            'failedAt' => gmdate('Y-m-d H:i:s'),
            'error' => $error instanceof WarehouseUniversityTransientException ? 'university_api_unavailable' : 'snapshot_import_failed',
        ];
        warehouseUniversityRecordJobState($cache, $failure, $logPath);
        warehouseUniversityRecordJobFailure($cache, $failure);
        throw $error;
    } finally {
        warehouseUniversityReleaseImportLock($pdo, $lock, $cache, $owner);
    }

    throw new LogicException('The university snapshot worker exited without a result.');
}
