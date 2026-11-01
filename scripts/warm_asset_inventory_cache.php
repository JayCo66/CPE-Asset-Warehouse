<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

function warehouseUniversitySnapshotWarmParameters(string $snapshotId): array
{
    return [
        'snapshot' => 'id:' . $snapshotId,
        'view' => 'overview',
    ];
}

if (defined('WAREHOUSE_UNIVERSITY_CACHE_WARM_LIBRARY_ONLY')) {
    return;
}

$snapshotId = strtolower((string)($argv[1] ?? ''));
if (preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/D', $snapshotId) !== 1) {
    fwrite(STDERR, "A valid snapshot ID is required.\n");
    exit(2);
}

$library = getenv('REDIS_CACHE_LIBRARY') ?: dirname(__DIR__) . '/lib/RedisCache.php';
if (is_readable($library)) {
    require_once $library;
}
if (!class_exists(RedisCache::class) || !RedisCache::fromEnvironment()->ping()) {
    fwrite(STDERR, "Redis is unavailable; dashboard cache was not warmed.\n");
    exit(1);
}

$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SCRIPT_NAME'] = '/assets_api/asset_inventory_dashboard.php';
$_GET = warehouseUniversitySnapshotWarmParameters($snapshotId);
require dirname(__DIR__) . '/assets_api/asset_inventory_dashboard.php';
