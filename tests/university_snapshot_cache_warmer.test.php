<?php
declare(strict_types=1);

$snapshotId = 'f6d1ce63-710b-4706-9a61-b20f15e0964b';
define('WAREHOUSE_UNIVERSITY_CACHE_WARM_LIBRARY_ONLY', true);
require_once __DIR__ . '/../scripts/warm_asset_inventory_cache.php';

$actual = warehouseUniversitySnapshotWarmParameters($snapshotId);
$expected = [
    'snapshot' => 'id:' . $snapshotId,
    'view' => 'overview',
];

if ($actual !== $expected) {
    throw new RuntimeException('The cache warmer must target the exact snapshot Overview view.');
}

echo "Snapshot cache warmer tests passed\n";
