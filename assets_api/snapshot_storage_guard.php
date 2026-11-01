<?php
declare(strict_types=1);

const WAREHOUSE_SNAPSHOT_MIN_FREE_BYTES = 524288000;
const WAREHOUSE_SNAPSHOT_MIN_FREE_PERCENT = 15.0;
const WAREHOUSE_SNAPSHOT_STORAGE_RESERVE_BYTES = 104857600;

final class WarehouseUniversityStorageGuardException extends RuntimeException
{
    public function __construct(public readonly array $capacity)
    {
        parent::__construct('Snapshot storage is below the configured capacity guard.');
    }
}

function warehouseUniversityAssessSnapshotStorage(
    int $totalBytes,
    int $availableBytes,
    int $reserveBytes = WAREHOUSE_SNAPSHOT_STORAGE_RESERVE_BYTES,
    int $minimumFreeBytes = WAREHOUSE_SNAPSHOT_MIN_FREE_BYTES,
    float $minimumFreePercent = WAREHOUSE_SNAPSHOT_MIN_FREE_PERCENT,
): array {
    if ($totalBytes <= 0
        || $availableBytes < 0
        || $reserveBytes < 0
        || $minimumFreeBytes < 0
        || $minimumFreePercent < 0
        || $minimumFreePercent > 100) {
        throw new InvalidArgumentException('Snapshot storage capacity values are invalid.');
    }

    $afterReserveBytes = max(0, $availableBytes - $reserveBytes);
    $freePercentAfterReserve = ($afterReserveBytes / $totalBytes) * 100;

    return [
        'allowed' => $afterReserveBytes >= $minimumFreeBytes
            && $freePercentAfterReserve >= $minimumFreePercent,
        'totalBytes' => $totalBytes,
        'availableBytes' => $availableBytes,
        'reserveBytes' => $reserveBytes,
        'afterReserveBytes' => $afterReserveBytes,
        'freePercentAfterReserve' => round($freePercentAfterReserve, 2),
        'minimumFreeBytes' => $minimumFreeBytes,
        'minimumFreePercent' => $minimumFreePercent,
    ];
}

function warehouseUniversitySnapshotStorageStatus(string $directory): array
{
    if (!is_dir($directory)) {
        throw new RuntimeException('The snapshot archive directory is unavailable.');
    }

    $totalBytes = @disk_total_space($directory);
    $availableBytes = @disk_free_space($directory);
    if (!is_float($totalBytes) && !is_int($totalBytes)) {
        throw new RuntimeException('Unable to read snapshot filesystem capacity.');
    }
    if (!is_float($availableBytes) && !is_int($availableBytes)) {
        throw new RuntimeException('Unable to read snapshot filesystem availability.');
    }

    return warehouseUniversityAssessSnapshotStorage((int)$totalBytes, (int)$availableBytes);
}

function warehouseUniversityRequireSnapshotStorage(string $directory): array
{
    $capacity = warehouseUniversitySnapshotStorageStatus($directory);
    if (!$capacity['allowed']) {
        throw new WarehouseUniversityStorageGuardException($capacity);
    }

    return $capacity;
}
