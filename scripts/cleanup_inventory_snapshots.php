<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

const WAREHOUSE_SNAPSHOT_CLEANUP_AUDIT_MAX_BYTES = 1048576;

function warehouseSnapshotCleanupLoadEnvironment(string $path): void
{
    $allowed = array_fill_keys([
        'APP_ENV', 'REDIS_ENABLED', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB', 'REDIS_KEY_PREFIX',
        'REDIS_CONNECT_TIMEOUT', 'REDIS_READ_TIMEOUT', 'REDIS_MAX_ENTRY_BYTES', 'COMPOSER_AUTOLOAD',
        'CPE_SNAPSHOT_ARCHIVE_DIR',
    ], true);
    if (is_file($path) && !is_readable($path)) {
        throw new RuntimeException('The snapshot environment file is not readable.');
    }
    foreach (is_file($path) ? (file($path, FILE_IGNORE_NEW_LINES) ?: []) : [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$name, $value] = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);
        if (!isset($allowed[$name]) || getenv($name) !== false) {
            continue;
        }
        if (strlen($value) >= 2 && (($value[0] === '"' && str_ends_with($value, '"')) || ($value[0] === "'" && str_ends_with($value, "'")))) {
            $value = substr($value, 1, -1);
        }
        putenv($name . '=' . $value);
        $_ENV[$name] = $value;
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
}

function warehouseSnapshotCleanupParseArguments(array $arguments): array
{
    $options = [
        'apply' => false,
        'dry_run' => false,
        'ack_history' => false,
        'retain' => 3,
        'snapshot_ids' => [],
        'manifest_hash' => null,
        'backup_hash' => null,
        'backup_reference' => null,
        'manifest_out' => null,
    ];
    foreach ($arguments as $argument) {
        if ($argument === '--apply') {
            $options['apply'] = true;
            continue;
        }
        if ($argument === '--ack-history-removal') {
            $options['ack_history'] = true;
            continue;
        }
        if ($argument === '--dry-run') {
            $options['dry_run'] = true;
            continue;
        }
        if (preg_match('/\A--retain=(\d+)\z/D', $argument, $match) === 1) {
            $options['retain'] = (int)$match[1];
            continue;
        }
        if (preg_match('/\A--snapshot-id=(.+)\z/D', $argument, $match) === 1) {
            $options['snapshot_ids'][] = $match[1];
            continue;
        }
        foreach ([
            '--manifest-sha256=' => 'manifest_hash',
            '--backup-bundle-sha256=' => 'backup_hash',
            '--backup-reference=' => 'backup_reference',
            '--manifest-out=' => 'manifest_out',
        ] as $prefix => $name) {
            if (str_starts_with($argument, $prefix)) {
                $options[$name] = substr($argument, strlen($prefix));
                continue 2;
            }
        }
        throw new InvalidArgumentException('Unknown cleanup option.');
    }

    if ($options['retain'] < 1 || $options['retain'] > 1000) {
        throw new InvalidArgumentException('Retention count must be between 1 and 1000.');
    }
    if ($options['apply'] && $options['dry_run']) {
        throw new InvalidArgumentException('Apply and dry-run modes cannot be combined.');
    }
    if ($options['manifest_out'] !== null && $options['apply']) {
        throw new InvalidArgumentException('Manifest output is only available in dry-run mode.');
    }
    return $options;
}

function warehouseSnapshotCleanupFactDigests(PDO $pdo, ?array $snapshotIds = null): array
{
    $sql = 'SELECT * FROM `fact_asset_inventory`';
    $parameters = [];
    if ($snapshotIds !== null) {
        if ($snapshotIds === []) {
            return [];
        }
        $sql .= ' WHERE `snapshot_id` IN (' . implode(', ', array_fill(0, count($snapshotIds), '?')) . ')';
        $parameters = $snapshotIds;
    }
    $sql .= ' ORDER BY `snapshot_id`, `asset_fact_id`' . ($snapshotIds !== null && $pdo->inTransaction() ? ' FOR UPDATE' : '');
    $statement = $pdo->prepare($sql);
    $statement->execute($parameters);
    $hashes = [];
    $counts = [];
    while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
        $id = strtolower((string)$row['snapshot_id']);
        if (!isset($hashes[$id])) {
            $hashes[$id] = hash_init('sha256');
            $counts[$id] = 0;
        }
        hash_update($hashes[$id], json_encode(
            array_values($row),
            JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR,
        ) . "\n");
        $counts[$id]++;
    }

    $digests = [];
    foreach ($hashes as $id => $context) {
        $digests[$id] = ['count' => $counts[$id], 'sha256' => hash_final($context)];
    }
    return $digests;
}

function warehouseSnapshotCleanupInspectArchive(string $archiveDirectory, array $snapshot): array
{
    $result = [
        'archive_key' => $snapshot['archive_key'],
        'archive_path' => null,
        'archive_bytes' => null,
        'archive_sha256' => null,
        'archive_verified' => false,
    ];
    $key = $snapshot['archive_key'];
    if (!is_string($key) || $key === '') {
        return $result;
    }
    $expected = 'assets_' . str_replace('-', '', (string)$snapshot['snapshot_date']) . '__' . $snapshot['snapshot_id'] . '.json';
    if ($key !== $expected || basename($key) !== $key) {
        return $result;
    }
    $root = realpath($archiveDirectory);
    $path = $archiveDirectory . DIRECTORY_SEPARATOR . $key;
    if ($root === false || is_link($path)) {
        return $result;
    }
    $realPath = realpath($path);
    if ($realPath === false || dirname($realPath) !== $root || !is_file($realPath) || !is_readable($realPath)) {
        return $result;
    }

    $bytes = filesize($realPath);
    $sha256 = hash_file('sha256', $realPath);
    $json = file_get_contents($realPath);
    if (!is_int($bytes) || !is_string($sha256) || !is_string($json)) {
        return $result;
    }
    try {
        $archive = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        return $result;
    }
    $data = is_array($archive) ? ($archive['data'] ?? null) : null;
    $verified = is_array($archive)
        && is_array($data)
        && (string)($archive['snapshot_id'] ?? '') === $snapshot['snapshot_id']
        && (string)($archive['archive_key'] ?? '') === $key
        && (string)($archive['snapshot_date'] ?? '') === (string)$snapshot['snapshot_date']
        && (string)($archive['source_system'] ?? '') === $snapshot['source_system']
        && (int)($archive['asset_count'] ?? -1) === (int)$snapshot['asset_count']
        && count($data) === (int)$snapshot['asset_count']
        && (int)$snapshot['fact_count'] === (int)$snapshot['asset_count'];

    return [
        'archive_key' => $key,
        'archive_path' => $realPath,
        'archive_bytes' => $bytes,
        'archive_sha256' => $sha256,
        'archive_verified' => $verified,
    ];
}

function warehouseSnapshotCleanupReadInventory(PDO $pdo, string $archiveDirectory): array
{
    $statement = $pdo->query(
        'SELECT snapshot.`snapshot_id`, snapshot.`snapshot_date_key`, snapshot_date.`full_date` AS `snapshot_date`,
                snapshot.`source_system`, snapshot.`imported_at`, snapshot.`asset_count`, snapshot.`archive_key`,
                COUNT(fact.`asset_fact_id`) AS `fact_count`
         FROM `dim_inventory_snapshot` snapshot
         LEFT JOIN `dim_date` snapshot_date ON snapshot_date.`date_key` = snapshot.`snapshot_date_key`
         LEFT JOIN `fact_asset_inventory` fact ON fact.`snapshot_id` = snapshot.`snapshot_id`
         GROUP BY snapshot.`snapshot_id`, snapshot.`snapshot_date_key`, snapshot_date.`full_date`,
                  snapshot.`source_system`, snapshot.`imported_at`, snapshot.`asset_count`, snapshot.`archive_key`
         ORDER BY snapshot.`snapshot_date_key` DESC, snapshot.`imported_at` DESC, snapshot.`snapshot_id` DESC'
    );
    $snapshots = $statement->fetchAll(PDO::FETCH_ASSOC);
    $factDigests = warehouseSnapshotCleanupFactDigests($pdo);
    foreach ($snapshots as &$snapshot) {
        $id = strtolower((string)$snapshot['snapshot_id']);
        $snapshot['snapshot_id'] = $id;
        $snapshot['snapshot_date_key'] = (int)$snapshot['snapshot_date_key'];
        $snapshot['asset_count'] = (int)$snapshot['asset_count'];
        $snapshot['fact_count'] = (int)$snapshot['fact_count'];
        $snapshot['imported_at'] = $snapshot['imported_at'] === null ? null : (string)$snapshot['imported_at'];
        $snapshot['dashboard_exposed'] = true;
        $digest = $factDigests[$id] ?? ['count' => 0, 'sha256' => hash('sha256', '')];
        if ($digest['count'] !== $snapshot['fact_count']) {
            throw new RuntimeException('Snapshot fact count changed during the read.');
        }
        $snapshot['facts_sha256'] = $digest['sha256'];
        $snapshot = array_merge($snapshot, warehouseSnapshotCleanupInspectArchive($archiveDirectory, $snapshot));
    }
    unset($snapshot);
    return $snapshots;
}

function warehouseSnapshotCleanupSafeArchivePath(string $archiveDirectory, array $snapshot): string
{
    $key = (string)($snapshot['archive_key'] ?? '');
    if (!$snapshot['archive_verified'] || $key === '' || basename($key) !== $key) {
        throw new RuntimeException('A target archive is not verified.');
    }
    $root = realpath($archiveDirectory);
    $path = $archiveDirectory . DIRECTORY_SEPARATOR . $key;
    if ($root === false || is_link($path)) {
        throw new RuntimeException('A target archive path is unsafe.');
    }
    $realPath = realpath($path);
    if ($realPath === false || dirname($realPath) !== $root || !is_file($realPath)) {
        throw new RuntimeException('A target archive is unavailable.');
    }
    return $realPath;
}

function warehouseSnapshotCleanupAppendAudit(string $archiveDirectory, array $record): void
{
    $path = $archiveDirectory . DIRECTORY_SEPARATOR . '.snapshot-cleanup-audit.jsonl';
    $rotated = $path . '.1';
    $json = json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
    clearstatcache(true, $path);
    $size = is_file($path) ? filesize($path) : 0;
    if (!is_int($size)) {
        throw new RuntimeException('Cleanup audit log cannot be inspected.');
    }
    if ($size + strlen($json) > WAREHOUSE_SNAPSHOT_CLEANUP_AUDIT_MAX_BYTES) {
        if (is_file($rotated) || !@rename($path, $rotated)) {
            throw new RuntimeException('Cleanup audit log reached its size limit.');
        }
    }
    $handle = fopen($path, 'ab');
    if ($handle === false) {
        throw new RuntimeException('Cleanup audit log cannot be opened.');
    }
    try {
        if (!flock($handle, LOCK_EX) || fwrite($handle, $json) !== strlen($json) || !fflush($handle)) {
            throw new RuntimeException('Cleanup audit log could not be written.');
        }
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function warehouseSnapshotCleanupWriteManifest(string $path, array $manifest): void
{
    if ($path === '' || is_link($path) || (file_exists($path) && !is_file($path))) {
        throw new InvalidArgumentException('Manifest output path is not a regular file.');
    }
    $directory = dirname($path);
    if (!is_dir($directory) || !is_writable($directory)) {
        throw new InvalidArgumentException('Manifest output directory is not writable.');
    }
    $json = json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
    $temporary = $path . '.' . bin2hex(random_bytes(8)) . '.tmp';
    if (file_put_contents($temporary, $json, LOCK_EX) !== strlen($json) || !rename($temporary, $path)) {
        @unlink($temporary);
        throw new RuntimeException('Manifest output could not be written atomically.');
    }
}

function warehouseSnapshotCleanupFail(string $code, int $exitCode = 1): never
{
    global $pdo, $cache, $lock, $owner;
    if (($pdo ?? null) instanceof PDO && is_array($lock ?? null)) {
        warehouseUniversityReleaseImportLock($pdo, $lock, $cache, $owner);
        $lock = null;
    }
    fwrite(STDERR, json_encode(['state' => 'failed', 'error' => $code], JSON_UNESCAPED_SLASHES) . PHP_EOL);
    exit($exitCode);
}

$projectRoot = getenv('CPE_PROJECT_ROOT') ?: dirname(__DIR__);
$archiveDirectory = '';
$pdo = null;
$cache = null;
$lock = null;
$owner = bin2hex(random_bytes(16));
$committed = false;
$cacheInvalidated = false;
$removedArchives = [];

try {
    $options = warehouseSnapshotCleanupParseArguments(array_slice($argv, 1));
    $environmentFile = getenv('CPE_SNAPSHOT_ENV_FILE') ?: $projectRoot . DIRECTORY_SEPARATOR . '.env';
    warehouseSnapshotCleanupLoadEnvironment($environmentFile);
    $archiveDirectory = getenv('CPE_SNAPSHOT_ARCHIVE_DIR') ?: $projectRoot . DIRECTORY_SEPARATOR . 'output' . DIRECTORY_SEPARATOR . 'history';
    if (!is_dir($archiveDirectory) || !is_readable($archiveDirectory)) {
        throw new RuntimeException('Snapshot archive directory is unavailable.');
    }

    if (!function_exists('warehouseSnapshotCleanupBuildPlan')) {
        require_once $projectRoot . '/assets_api/snapshot_retention.php';
    }
    require_once $projectRoot . '/lib/RedisCache.php';
    require_once $projectRoot . '/assets_api/university_snapshot_job.php';
    define('WAREHOUSE_INVENTORY_API_REQUEST', true);
    require $projectRoot . '/assets_api/warehouse_db.php';
    $pdo = $warehousePdo;
    $cache = warehouseUniversitySnapshotCache();

    if ($options['apply']) {
        if ((getenv('APP_ENV') ?: '') !== 'production') {
            throw new InvalidArgumentException('Apply is only allowed with APP_ENV=production.');
        }
        if (filter_var(getenv('REDIS_ENABLED') ?: 'false', FILTER_VALIDATE_BOOLEAN) !== true
            || !str_starts_with((string)getenv('REDIS_KEY_PREFIX'), 'cpe:production:')
            || $cache === null
            || !$cache->ping()) {
            throw new RuntimeException('Production Redis is not ready for safe cleanup.');
        }
        foreach (['manifest_hash', 'backup_hash'] as $name) {
            if (!is_string($options[$name]) || preg_match('/\A[0-9a-f]{64}\z/iD', $options[$name]) !== 1) {
                throw new InvalidArgumentException('Apply requires the approved manifest and off-host backup SHA-256 values.');
            }
        }
        if (!is_string($options['backup_reference']) || trim($options['backup_reference']) === '' || preg_match('/[\r\n\x00]/', $options['backup_reference']) === 1) {
            throw new InvalidArgumentException('Apply requires a backup reference.');
        }
        if (!is_writable($archiveDirectory)) {
            throw new RuntimeException('Snapshot archive directory is not writable by the cleanup user.');
        }
        $lock = warehouseUniversityAcquireImportLock($pdo, $archiveDirectory, $cache, $owner, 900);
        if (($lock['redis'] ?? false) !== true) {
            throw new RuntimeException('Production Redis import lock was not acquired.');
        }
    }

    $inventory = warehouseSnapshotCleanupReadInventory($pdo, $archiveDirectory);
    $plan = warehouseSnapshotCleanupBuildPlan($inventory, $options['retain']);
    $manifest = warehouseSnapshotCleanupCreateManifest($plan);
    $manifestHash = warehouseSnapshotCleanupManifestHash($manifest);
    $targets = $options['snapshot_ids'] === []
        ? []
        : warehouseSnapshotCleanupValidateTargets($plan, $options['snapshot_ids']);

    if (!$options['apply']) {
        if ($options['manifest_out'] !== null) {
            warehouseSnapshotCleanupWriteManifest($options['manifest_out'], [
                'approval_sha256' => $manifestHash,
                'manifest' => $manifest,
            ]);
        }
        $candidateFactRows = array_sum(array_map(static fn(array $candidate): int => (int)$candidate['fact_count'], $plan['candidates']));
        $candidateArchiveBytes = array_sum(array_map(static fn(array $candidate): int => (int)$candidate['archive_bytes'], $plan['candidates']));
        echo json_encode([
            'state' => 'dry_run',
            'retention_count' => $options['retain'],
            'manifest_sha256' => $manifestHash,
            'requested_target_ids' => $targets,
            'candidate_fact_rows' => $candidateFactRows,
            'candidate_archive_bytes' => $candidateArchiveBytes,
            'manifest' => $manifest,
            'redis_ping' => $cache?->ping() ?? false,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
        exit(0);
    }

    if (!hash_equals($manifestHash, strtolower((string)$options['manifest_hash']))) {
        throw new InvalidArgumentException('Live snapshot inventory no longer matches the approved manifest.');
    }
    if ($targets === []) {
        throw new InvalidArgumentException('Apply requires exact candidate snapshot IDs.');
    }
    warehouseSnapshotCleanupRequireHistoryAcknowledgement($targets, $options['ack_history']);
    $candidateById = [];
    foreach ($plan['candidates'] as $candidate) {
        $candidateById[$candidate['snapshot_id']] = $candidate;
    }
    foreach ($targets as $id) {
        $path = warehouseSnapshotCleanupSafeArchivePath($archiveDirectory, $candidateById[$id]);
        if (!hash_equals($candidateById[$id]['archive_sha256'], (string)hash_file('sha256', $path))) {
            throw new RuntimeException('A target archive changed after approval.');
        }
    }

    warehouseSnapshotCleanupAppendAudit($archiveDirectory, [
        'event' => 'cleanup_started',
        'at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'manifest_sha256' => $manifestHash,
        'snapshot_ids' => $targets,
        'backup_bundle_sha256' => strtolower((string)$options['backup_hash']),
        'backup_reference' => trim($options['backup_reference']),
    ]);

    $placeholders = implode(', ', array_fill(0, count($targets), '?'));
    $pdo->beginTransaction();
    $lockSnapshots = $pdo->prepare(
        'SELECT `snapshot_id`, `snapshot_date_key`, `source_system`, `imported_at`, `asset_count`, `archive_key`
         FROM `dim_inventory_snapshot` WHERE `snapshot_id` IN (' . $placeholders . ') FOR UPDATE'
    );
    $lockSnapshots->execute($targets);
    $lockedRows = $lockSnapshots->fetchAll(PDO::FETCH_ASSOC);
    if (count($lockedRows) !== count($targets)) {
        throw new RuntimeException('Snapshot rows changed after approval.');
    }
    $lockedById = [];
    foreach ($lockedRows as $row) {
        $lockedById[strtolower((string)$row['snapshot_id'])] = $row;
    }
    foreach ($targets as $id) {
        $expected = $candidateById[$id];
        $actual = $lockedById[$id] ?? null;
        if (!is_array($actual)
            || (int)$actual['snapshot_date_key'] !== $expected['snapshot_date_key']
            || (string)$actual['source_system'] !== $expected['source_system']
            || (($actual['imported_at'] === null ? null : (string)$actual['imported_at']) !== $expected['imported_at'])
            || (int)$actual['asset_count'] !== $expected['asset_count']
            || (($actual['archive_key'] === null ? null : (string)$actual['archive_key']) !== $expected['archive_key'])) {
            throw new RuntimeException('Snapshot metadata changed after approval.');
        }
    }
    $lockedFactDigests = warehouseSnapshotCleanupFactDigests($pdo, $targets);
    foreach ($targets as $id) {
        $expected = $candidateById[$id];
        $actualDigest = $lockedFactDigests[$id] ?? ['count' => 0, 'sha256' => hash('sha256', '')];
        if ($actualDigest['count'] !== $expected['fact_count'] || !hash_equals($expected['facts_sha256'], $actualDigest['sha256'])) {
            throw new RuntimeException('Snapshot facts changed after approval.');
        }
    }
    foreach ($targets as $id) {
        $expected = $candidateById[$id];
        $deleteFacts = $pdo->prepare('DELETE FROM `fact_asset_inventory` WHERE `snapshot_id` = ?');
        $deleteFacts->execute([$id]);
        if ($deleteFacts->rowCount() !== $expected['fact_count']) {
            throw new RuntimeException('Snapshot fact deletion count did not match the manifest.');
        }
        $deleteSnapshot = $pdo->prepare('DELETE FROM `dim_inventory_snapshot` WHERE `snapshot_id` = ?');
        $deleteSnapshot->execute([$id]);
        if ($deleteSnapshot->rowCount() !== 1) {
            throw new RuntimeException('Snapshot metadata deletion count did not match the manifest.');
        }
    }
    $pdo->commit();
    $committed = true;
    $cacheInvalidated = $cache->invalidateWarehouse();

    warehouseSnapshotCleanupAppendAudit($archiveDirectory, [
        'event' => 'database_rows_deleted',
        'at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'snapshot_ids' => $targets,
        'fact_rows' => array_sum(array_map(static fn(string $id): int => (int)$candidateById[$id]['fact_count'], $targets)),
        'cache_invalidated' => $cacheInvalidated,
    ]);
    if (!$cacheInvalidated) {
        throw new RuntimeException('Redis cache invalidation failed after database commit.');
    }

    $archiveBytesRemoved = 0;
    foreach ($targets as $id) {
        $candidate = $candidateById[$id];
        $path = warehouseSnapshotCleanupSafeArchivePath($archiveDirectory, $candidate);
        if (!hash_equals($candidate['archive_sha256'], (string)hash_file('sha256', $path))) {
            throw new RuntimeException('A target archive changed after database commit.');
        }
        if (!unlink($path)) {
            throw new RuntimeException('A target archive could not be removed after database commit.');
        }
        $removedArchives[] = $candidate['archive_key'];
        $archiveBytesRemoved += (int)$candidate['archive_bytes'];
    }

    warehouseSnapshotCleanupAppendAudit($archiveDirectory, [
        'event' => 'cleanup_completed',
        'at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'snapshot_ids' => $targets,
        'archive_keys' => $removedArchives,
        'archive_bytes_removed' => $archiveBytesRemoved,
        'cache_invalidated' => true,
    ]);
    echo json_encode([
        'state' => 'succeeded',
        'snapshot_ids' => $targets,
        'deleted_fact_rows' => array_sum(array_map(static fn(string $id): int => (int)$candidateById[$id]['fact_count'], $targets)),
        'deleted_snapshot_rows' => count($targets),
        'removed_archive_keys' => $removedArchives,
        'archive_bytes_removed' => $archiveBytesRemoved,
        'manifest_sha256' => $manifestHash,
        'cache_invalidated' => true,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
} catch (Throwable $error) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($committed && $archiveDirectory !== '') {
        try {
            warehouseSnapshotCleanupAppendAudit($archiveDirectory, [
                'event' => 'cleanup_partial_failure',
                'at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
                'snapshot_ids' => $targets ?? [],
                'removed_archive_keys' => $removedArchives,
                'cache_invalidated' => $cacheInvalidated,
                'error_code' => 'post_commit_step_failed',
            ]);
        } catch (Throwable) {
            // The initial audit record remains the durable intent record.
        }
        warehouseSnapshotCleanupFail('post_commit_step_failed');
    }
    if ($error instanceof InvalidArgumentException) {
        warehouseSnapshotCleanupFail('invalid_request', 2);
    }
    if ($error instanceof WarehouseUniversitySnapshotBusyException) {
        warehouseSnapshotCleanupFail('import_lock_busy', 75);
    }
    warehouseSnapshotCleanupFail('cleanup_preflight_failed');
} finally {
    if ($pdo instanceof PDO && is_array($lock)) {
        warehouseUniversityReleaseImportLock($pdo, $lock, $cache, $owner);
    }
}
