<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/university_snapshot_import_lib.php';

function warehouseUniversityImportRespond(bool $success, string $message, array $data = [], int $status = 200): never
{
    http_response_code($status);
    echo json_encode(
        ['success' => $success, 'message' => $message, 'data' => $data],
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE,
    );
    exit;
}

function warehouseUniversityEnsureDate(PDO $pdo, DateTimeImmutable $date, array &$knownDates): int
{
    $dateKey = (int)$date->format('Ymd');
    if (isset($knownDates[$dateKey])) {
        return $dateKey;
    }

    $thaiDays = [1 => 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
    $thaiMonths = [1 => 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    $year = (int)$date->format('Y');
    $month = (int)$date->format('n');
    $fiscalYear = $year + ($month >= 10 ? 1 : 0) + 543;
    $statement = $pdo->prepare(
        'INSERT IGNORE INTO `dim_date`
            (`date_key`, `full_date`, `day_of_week`, `month`, `month_name`, `quarter`, `year`, `fiscal_year`)
        VALUES (:date_key, :full_date, :day_of_week, :month, :month_name, :quarter, :year, :fiscal_year)'
    );
    $statement->execute([
        'date_key' => $dateKey,
        'full_date' => $date->format('Y-m-d'),
        'day_of_week' => $thaiDays[(int)$date->format('N')],
        'month' => $month,
        'month_name' => $thaiMonths[$month],
        'quarter' => (int)ceil($month / 3),
        'year' => $year,
        'fiscal_year' => $fiscalYear,
    ]);
    $knownDates[$dateKey] = true;
    return $dateKey;
}

function warehouseUniversityDimensionKey(PDO $pdo, string $dimension, ?int $originalId, array $values, array &$cache): ?int
{
    if ($originalId === null) {
        return null;
    }
    if (isset($cache[$dimension][$originalId])) {
        return $cache[$dimension][$originalId];
    }

    $definitions = [
        'department' => ['table' => 'dim_department', 'key' => 'department_key', 'id' => 'department_id'],
        'type' => ['table' => 'dim_asset_type', 'key' => 'type_key', 'id' => 'type_id'],
        'category' => ['table' => 'dim_asset_category', 'key' => 'category_key', 'id' => 'category_id'],
        'location' => ['table' => 'dim_location', 'key' => 'location_key', 'id' => 'location_id'],
    ];
    if (!isset($definitions[$dimension])) {
        throw new LogicException('Unknown inventory dimension.');
    }
    $definition = $definitions[$dimension];
    $select = $pdo->prepare(
        'SELECT `' . $definition['key'] . '` FROM `' . $definition['table'] . '`'
        . ' WHERE `' . $definition['id'] . '` = :original_id ORDER BY `' . $definition['key'] . '` ASC LIMIT 1'
    );
    $select->bindValue(':original_id', $originalId, PDO::PARAM_INT);
    $select->execute();
    $existingKey = $select->fetchColumn();

    $usableValues = array_filter($values, static fn(mixed $value): bool => $value !== null);
    if ($existingKey !== false) {
        $key = (int)$existingKey;
        if ($usableValues !== []) {
            $assignments = [];
            foreach (array_keys($usableValues) as $column) {
                $assignments[] = '`' . $column . '` = :' . $column;
            }
            $update = $pdo->prepare(
                'UPDATE `' . $definition['table'] . '` SET ' . implode(', ', $assignments)
                . ' WHERE `' . $definition['key'] . '` = :dimension_key'
            );
            foreach ($usableValues as $column => $value) {
                $update->bindValue(':' . $column, $value, PDO::PARAM_STR);
            }
            $update->bindValue(':dimension_key', $key, PDO::PARAM_INT);
            $update->execute();
        }
    } else {
        $columns = [$definition['id'], ...array_keys($values)];
        $parameters = ['original_id'];
        foreach (array_keys($values) as $column) {
            $parameters[] = $column;
        }
        $insert = $pdo->prepare(
            'INSERT INTO `' . $definition['table'] . '` (`' . implode('`, `', $columns) . '`) VALUES (:'
            . implode(', :', $parameters) . ')'
        );
        $insert->bindValue(':original_id', $originalId, PDO::PARAM_INT);
        foreach ($values as $column => $value) {
            $insert->bindValue(':' . $column, $value, $value === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
        }
        $insert->execute();
        $key = (int)$pdo->lastInsertId();
    }

    $cache[$dimension][$originalId] = $key;
    return $key;
}

function warehouseUniversityNormalizeSource(?string $source): ?string
{
    if ($source === null) {
        return null;
    }
    return [
        'รายได้' => 'เงินรายได้',
        'เงินรายได้ภาคฯ' => 'เงินรายได้',
        'เงินรายได้โครงการฯ' => 'เงินรายได้',
        'งบประมาณ' => 'เงินงบประมาณ',
    ][$source] ?? $source;
}

function warehouseUniversityPersistSnapshot(
    PDO $pdo,
    array $snapshot,
    array $typeCodeById,
    array $resolvedCategoryByAssetId,
    ?callable $heartbeat = null,
): void
{
    $snapshotDate = new DateTimeImmutable($snapshot['snapshot_date'], new DateTimeZone('Asia/Bangkok'));
    $dateCache = [];
    $snapshotDateKey = warehouseUniversityEnsureDate($pdo, $snapshotDate, $dateCache);

    $snapshotInsert = $pdo->prepare(
        'INSERT INTO `dim_inventory_snapshot`
            (`snapshot_id`, `snapshot_date_key`, `snapshot_label`, `source_system`, `imported_at`, `asset_count`, `archive_key`)
        VALUES (:snapshot_id, :snapshot_date_key, :snapshot_label, :source_system, :imported_at, :asset_count, :archive_key)'
    );
    $snapshotInsert->execute([
        'snapshot_id' => $snapshot['snapshot_id'],
        'snapshot_date_key' => $snapshotDateKey,
        'snapshot_label' => $snapshot['snapshot_label'],
        'source_system' => $snapshot['source_system'],
        'imported_at' => $snapshot['imported_at'],
        'asset_count' => $snapshot['asset_count'],
        'archive_key' => $snapshot['archive_key'],
    ]);

    $assetSelect = $pdo->prepare('SELECT `asset_key`, `model` FROM `dim_asset` WHERE `asset_id` = :asset_id ORDER BY `asset_key` ASC LIMIT 1');
    $assetInsert = $pdo->prepare(
        'INSERT INTO `dim_asset`
            (`asset_id`, `asset_code`, `asset_name`, `brand`, `model`, `year_purchase`, `year_fiscal`, `source`, `asset_status`, `category_key`, `type_key`, `location_key`)
        VALUES (:asset_id, :asset_code, :asset_name, :brand, NULL, :year_purchase, :year_fiscal, :source, :asset_status, :category_key, :type_key, :location_key)'
    );
    $assetUpdate = $pdo->prepare(
        'UPDATE `dim_asset` SET
            `asset_code` = :asset_code, `asset_name` = :asset_name, `brand` = :brand,
            `year_purchase` = :year_purchase, `year_fiscal` = :year_fiscal, `source` = :source,
            `asset_status` = :asset_status, `category_key` = :category_key, `type_key` = :type_key,
            `location_key` = :location_key
        WHERE `asset_key` = :asset_key'
    );
    $factInsert = $pdo->prepare(
        'INSERT INTO `fact_asset_inventory`
            (`snapshot_date_key`, `snapshot_id`, `acquisition_date_key`, `asset_key`, `department_key`, `type_key`,
             `category_key`, `location_key`, `asset_count`, `is_available_flag`, `is_damaged_flag`, `has_location_flag`, `asset_age_years`)
        VALUES (:snapshot_date_key, :snapshot_id, :acquisition_date_key, :asset_key, :department_key, :type_key,
             :category_key, :location_key, 1, :is_available_flag, :is_damaged_flag, :has_location_flag, :asset_age_years)'
    );

    $dimensionCache = [];
    foreach ($snapshot['data'] as $assetIndex => $asset) {
        if ($heartbeat !== null && $assetIndex % 100 === 0) {
            $heartbeat();
        }
        $departmentName = warehouseUniversityNormalizeText($asset['department_name']);
        $departmentKey = warehouseUniversityDimensionKey($pdo, 'department', $asset['department_id'], [
            'department_name' => $departmentName,
        ], $dimensionCache);

        $typeCode = warehouseUniversityNormalizeText($asset['type_code']);
        if ($typeCode === null && $asset['type_id'] !== null) {
            $typeCode = $typeCodeById[$asset['type_id']] ?? null;
        }
        $typeName = warehouseUniversityNormalizeText($asset['type_name']);
        $typeKey = warehouseUniversityDimensionKey($pdo, 'type', $asset['type_id'], [
            'type_code' => $typeCode,
            'type_name' => $typeName,
        ], $dimensionCache);

        $resolvedCategory = $resolvedCategoryByAssetId[$asset['asset_id']] ?? null;
        if (!is_array($resolvedCategory) || !is_int($resolvedCategory['category_id'] ?? null)) {
            throw new LogicException('An asset category was not resolved before persistence.');
        }
        $categoryKey = warehouseUniversityDimensionKey($pdo, 'category', $resolvedCategory['category_id'], [
            'category_name' => $resolvedCategory['category_name'],
        ], $dimensionCache);
        $locationKey = warehouseUniversityDimensionKey($pdo, 'location', $asset['location_id'], [
            'building' => null,
            'floor' => null,
            'room' => null,
            'area_name' => null,
        ], $dimensionCache);

        $assetCode = warehouseUniversityNormalizeText($asset['asset_code']);
        $assetName = warehouseUniversityNormalizeText($asset['asset_name']);
        $yearPurchase = warehouseUniversityNormalizeText($asset['year_purchase']);
        $yearFiscal = warehouseUniversityNormalizeText($asset['year_fiscal']);
        if ($yearFiscal === null) {
            $yearFromCode = warehouseUniversityFiscalYearFromCode($assetCode);
            $yearFiscal = $yearFromCode === null ? null : (string)$yearFromCode;
        }
        $source = warehouseUniversityNormalizeSource(warehouseUniversityNormalizeText($asset['source']));
        $status = warehouseUniversityNormalizeText($asset['asset_status']);
        $brand = warehouseUniversityNormalizeText($asset['brand']);

        $assetSelect->execute(['asset_id' => $asset['asset_id']]);
        $existingAsset = $assetSelect->fetch(PDO::FETCH_ASSOC);
        if (is_array($existingAsset)) {
            $assetKey = (int)$existingAsset['asset_key'];
            $assetUpdate->execute([
                'asset_code' => $assetCode,
                'asset_name' => $assetName,
                'brand' => $brand,
                'year_purchase' => $yearPurchase,
                'year_fiscal' => $yearFiscal,
                'source' => $source,
                'asset_status' => $status,
                'category_key' => $categoryKey,
                'type_key' => $typeKey,
                'location_key' => $locationKey,
                'asset_key' => $assetKey,
            ]);
        } else {
            $assetInsert->execute([
                'asset_id' => $asset['asset_id'],
                'asset_code' => $assetCode,
                'asset_name' => $assetName,
                'brand' => $brand,
                'year_purchase' => $yearPurchase,
                'year_fiscal' => $yearFiscal,
                'source' => $source,
                'asset_status' => $status,
                'category_key' => $categoryKey,
                'type_key' => $typeKey,
                'location_key' => $locationKey,
            ]);
            $assetKey = (int)$pdo->lastInsertId();
        }

        $acquisitionDate = warehouseUniversityAcquisitionDate($asset);
        $acquisitionDateKey = $acquisitionDate === null
            ? null
            : warehouseUniversityEnsureDate($pdo, $acquisitionDate, $dateCache);
        $ageYears = null;
        if ($acquisitionDate !== null) {
            $days = (int)$acquisitionDate->diff($snapshotDate)->format('%r%a');
            $ageYears = max(0, (int)floor($days / 365.25));
        }

        $factInsert->execute([
            'snapshot_date_key' => $snapshotDateKey,
            'snapshot_id' => $snapshot['snapshot_id'],
            'acquisition_date_key' => $acquisitionDateKey,
            'asset_key' => $assetKey,
            'department_key' => $departmentKey,
            'type_key' => $typeKey,
            'category_key' => $categoryKey,
            'location_key' => $locationKey,
            'is_available_flag' => $status === 'พร้อมใช้งาน' ? 1 : 0,
            'is_damaged_flag' => in_array($status, ['ชำรุด', 'ส่งซ่อม'], true) ? 1 : 0,
            'has_location_flag' => $locationKey === null ? 0 : 1,
            'asset_age_years' => $ageYears,
        ]);
    }
}

require_once __DIR__ . '/university_snapshot_job.php';

function warehouseUniversityCreateSnapshot(
    PDO $pdo,
    string $archiveDirectory,
    bool $scheduled,
    DateTimeImmutable $snapshotDate,
    ?callable $heartbeat = null,
    bool $dryRun = false,
): array {
    $snapshotDate = $snapshotDate->setTimezone(new DateTimeZone('Asia/Bangkok'));
    $assets = warehouseUniversityCollectAssets(
        'warehouseUniversityFetchPage',
        WAREHOUSE_UNIVERSITY_MAX_PAGES,
        WAREHOUSE_UNIVERSITY_MAX_RECORDS,
        300,
        $heartbeat,
    );
    $typeRows = warehouseUniversityLoadReferenceRows('types', $heartbeat);
    $categoryRows = warehouseUniversityLoadReferenceRows('categories', $heartbeat);
    $typeCodeById = warehouseUniversityBuildTypeCodeMap($typeRows);
    [$categoryById, $categoryByCode] = warehouseUniversityBuildCategoryMaps($categoryRows);
    $resolvedCategoryByAssetId = [];
    foreach ($assets as $index => $asset) {
        if ($heartbeat !== null && $index % 100 === 0) {
            $heartbeat();
        }
        $resolvedCategoryByAssetId[$asset['asset_id']] = warehouseUniversityResolveCategory(
            $asset,
            $typeCodeById,
            $categoryById,
            $categoryByCode,
        );
    }

    $importedAt = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $snapshotId = warehouseUniversityUuidV4();
    $snapshotDateText = $snapshotDate->format('Y-m-d');
    $archiveKey = 'assets_' . $snapshotDate->format('Ymd') . '__' . $snapshotId . '.json';
    $snapshot = [
        'snapshot_id' => $snapshotId,
        'snapshot_date' => $snapshotDateText,
        'snapshot_label' => warehouseUniversitySnapshotLabel($snapshotDate, $snapshotId, $scheduled),
        'source_system' => 'university_api',
        'imported_at' => $importedAt->format('Y-m-d H:i:s'),
        'asset_count' => count($assets),
        'archive_key' => $archiveKey,
        'data' => $assets,
    ];
    $summary = [
        'key' => 'id:' . $snapshotId,
        'snapshotId' => $snapshotId,
        'dateKey' => (int)$snapshotDate->format('Ymd'),
        'date' => $snapshotDateText,
        'label' => $snapshot['snapshot_label'],
        'sourceSystem' => 'university_api',
        'importedAt' => $snapshot['imported_at'],
        'assets' => count($assets),
    ];

    if ($dryRun) {
        return ['importedCount' => count($assets), 'snapshot' => $summary, 'dryRun' => true];
    }

    $archivePath = null;
    $temporaryPath = $archiveDirectory . DIRECTORY_SEPARATOR . $archiveKey . '.tmp';
    try {
        if ($heartbeat !== null) {
            $heartbeat();
        }
        $pdo->beginTransaction();
        warehouseUniversityPersistSnapshot($pdo, $snapshot, $typeCodeById, $resolvedCategoryByAssetId, $heartbeat);
        $archivePath = $archiveDirectory . DIRECTORY_SEPARATOR . warehouseUniversityWriteArchive($archiveDirectory, $snapshot);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ($archivePath !== null && is_file($archivePath)) {
            @unlink($archivePath);
        }
        if (is_file($temporaryPath)) {
            @unlink($temporaryPath);
        }
        throw $error;
    }

    return ['importedCount' => count($assets), 'snapshot' => $summary];
}

if (defined('WAREHOUSE_UNIVERSITY_IMPORT_LIBRARY_ONLY')) {
    return;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    warehouseUniversityImportRespond(false, 'Only POST requests are supported.', [], 405);
}

if (!warehouseUniversitySameOriginRequestAllowed($_SERVER)) {
    warehouseUniversityImportRespond(false, 'The request must originate from this dashboard.', [], 403);
}

set_time_limit(660);
ignore_user_abort(true);
$archiveDirectory = warehouseUniversitySnapshotArchiveDirectory();

define('WAREHOUSE_INVENTORY_API_REQUEST', true);
require __DIR__ . '/warehouse_db.php';
try {
    $result = warehouseUniversityRunSnapshotJob($warehousePdo, $archiveDirectory, [
        'scheduled' => false,
        'attempts' => 1,
        'warm_cache' => false,
    ]);
    warehouseUniversityImportRespond(true, 'Snapshot imported successfully.', [
        'importedCount' => $result['importedCount'],
        'snapshot' => $result['snapshot'],
    ]);
} catch (WarehouseUniversitySnapshotBusyException $error) {
    warehouseUniversityImportRespond(false, 'A snapshot import is already running. Try again later.', [], 409);
} catch (Throwable $error) {
    error_log('University asset snapshot import failed: ' . $error->getMessage());
    warehouseUniversityImportRespond(false, 'Snapshot import failed. The previous snapshot remains available.', [], 500);
}
