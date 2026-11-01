<?php
declare(strict_types=1);

require_once __DIR__ . '/../assets_api/snapshot_storage_guard.php';

function storageGuardExpectSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . '\nExpected: ' . var_export($expected, true) . '\nActual: ' . var_export($actual, true));
    }
}

$mib = 1024 * 1024;
$gib = 1024 * $mib;

$healthy = warehouseUniversityAssessSnapshotStorage(8 * $gib, 2 * $gib);
storageGuardExpectSame(true, $healthy['allowed'], 'Healthy capacity should allow a snapshot.');
storageGuardExpectSame(100 * $mib, $healthy['reserveBytes'], 'The guard should retain the temporary-write reserve.');

$atByteFloor = warehouseUniversityAssessSnapshotStorage(2 * $gib, 600 * $mib);
storageGuardExpectSame(true, $atByteFloor['allowed'], 'Capacity exactly at the free-space floor should pass when the percentage floor also passes.');

$belowByteFloor = warehouseUniversityAssessSnapshotStorage(2 * $gib, 580 * $mib);
storageGuardExpectSame(false, $belowByteFloor['allowed'], 'Capacity below the 500 MiB floor after reserve must be rejected.');
storageGuardExpectSame(
    true,
    warehouseUniversityAssessSnapshotStorage(2 * $gib, 900 * $mib)['allowed'],
    'A later capacity check should recover after free space is restored.',
);

$belowFreePercent = warehouseUniversityAssessSnapshotStorage(8 * $gib, 1100 * $mib);
storageGuardExpectSame(false, $belowFreePercent['allowed'], 'Capacity below 15% after reserve must be rejected.');

$belowBoth = warehouseUniversityAssessSnapshotStorage(8 * $gib, 400 * $mib);
storageGuardExpectSame(false, $belowBoth['allowed'], 'Capacity below both limits must be rejected.');

try {
    warehouseUniversityAssessSnapshotStorage(0, 1);
    throw new RuntimeException('An invalid filesystem capacity should be rejected.');
} catch (InvalidArgumentException) {
    // Expected: unusable capacity measurements must fail closed.
}

echo "Snapshot storage guard tests passed\n";
