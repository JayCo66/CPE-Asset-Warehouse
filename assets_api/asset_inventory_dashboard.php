<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/inventory_query.php';
require_once __DIR__ . '/inventory_analytics.php';
require_once __DIR__ . '/inventory_disposal.php';

function warehouseDashboardRespond(bool $success, string $message, array $data = [], int $status = 200): never
{
    http_response_code($status);
    echo json_encode(
        ['success' => $success, 'message' => $message, 'data' => $data],
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE,
    );
    exit;
}

function warehouseDashboardBind(PDOStatement $statement, array $parameters): void
{
    foreach ($parameters as $name => $value) {
        $type = is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR;
        $statement->bindValue(':' . $name, $value, $type);
    }
}

function warehouseDashboardSnapshotOptions(PDO $pdo): array
{
    return warehouseInventorySnapshotOptions($pdo);
}

function warehouseDashboardFilterOptions(PDO $pdo, string $snapshotId): array
{
    $optionDefinitions = [
        'departments' => ['department.`department_name`', '(department.`department_name` IS NULL OR TRIM(department.`department_name`) = \'\')'],
        'categories' => ['asset_category.`category_name`', '(asset_category.`category_name` IS NULL OR TRIM(asset_category.`category_name`) = \'\')'],
        'types' => ['asset_type.`type_name`', '(asset_type.`type_name` IS NULL OR TRIM(asset_type.`type_name`) = \'\')'],
        'buildings' => ['location.`building`', '(location.`building` IS NULL OR TRIM(location.`building`) = \'\')'],
        'floors' => ['location.`floor`', '(location.`floor` IS NULL OR TRIM(location.`floor`) = \'\')'],
        'rooms' => ['location.`room`', '(location.`room` IS NULL OR TRIM(location.`room`) = \'\')'],
        'areas' => ['location.`area_name`', '(location.`area_name` IS NULL OR TRIM(location.`area_name`) = \'\')'],
        'sources' => ['da.`source`', '(da.`source` IS NULL OR TRIM(da.`source`) = \'\')'],
        'statuses' => ['da.`asset_status`', '(da.`asset_status` IS NULL OR TRIM(da.`asset_status`) = \'\')'],
        'acquisitionYears' => ['acquisition_date.`year`', 'acquisition_date.`year` IS NULL'],
        'fiscalYears' => ['da.`year_fiscal`', '(da.`year_fiscal` IS NULL OR TRIM(da.`year_fiscal`) = \'\')'],
        'acquisitionFiscalYears' => ['acquisition_date.`fiscal_year`', 'acquisition_date.`fiscal_year` IS NULL'],
    ];
    $options = [];
    foreach ($optionDefinitions as $name => [$expression, $missingCondition]) {
        $statement = $pdo->prepare(
            'SELECT DISTINCT CASE WHEN ' . $missingCondition . '
                THEN \'__missing__\' ELSE CAST(' . $expression . ' AS CHAR) END AS `value` ' . warehouseInventoryFromSql() . '
            WHERE fai.`snapshot_id` = :snapshot_id
            ORDER BY `value`'
        );
        $statement->bindValue(':snapshot_id', $snapshotId, PDO::PARAM_STR);
        $statement->execute();
        $options[$name] = array_map(
            static fn(mixed $value): string => (string)$value,
            $statement->fetchAll(PDO::FETCH_COLUMN),
        );
    }

    $options['ageBands'] = ['0-2', '3-5', '6-10', '11-15', '16-20', 'over-20', 'unknown'];
    return $options;
}

function warehouseDashboardFetchAnalytics(PDO $pdo, array $filters, string $snapshotId): array
{
    $where = warehouseInventoryBuildWhere($filters, null, $snapshotId);
    $statement = $pdo->prepare(
        'SELECT
            fai.`asset_count`,
            fai.`asset_age_years`,
            fai.`is_available_flag`,
            fai.`is_damaged_flag`,
            fai.`has_location_flag`,
            fai.`asset_key`,
            fai.`department_key`,
            fai.`category_key`,
            fai.`type_key`,
            fai.`location_key`,
            da.`asset_id`,
            da.`asset_code`,
            da.`asset_name`,
            da.`brand`,
            da.`model`,
            da.`year_purchase`,
            da.`year_fiscal`,
            da.`source`,
            da.`asset_status`,
            department.`department_name`,
            asset_category.`category_name`,
            asset_type.`type_name`,
            location.`building`,
            location.`floor`,
            location.`room`,
            location.`area_name`,
            acquisition_date.`year` AS `acquisition_year`,
            acquisition_date.`fiscal_year` AS `acquisition_fiscal_year`,
            snapshot_date.`full_date` AS `snapshot_date`
        ' . warehouseInventoryFromSql() . '
        ' . $where['sql'] . '
        ORDER BY fai.`asset_fact_id` ASC'
    );
    warehouseDashboardBind($statement, $where['params']);
    $statement->execute();

    $analytics = warehouseInventoryAnalyticsCreate($filters['ageThreshold']);
    while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
        warehouseInventoryAnalyticsConsume($analytics, $row);
    }
    return warehouseInventoryAnalyticsFinalize($analytics);
}

function warehouseDashboardHistory(PDO $pdo, array $filters, array $snapshotOptions, string $selectedSnapshotId): array
{
    $snapshotIds = array_column($snapshotOptions, 'snapshotId');
    $selectedIndex = array_search($selectedSnapshotId, $snapshotIds, true);
    if ($selectedIndex === false) {
        return ['available' => false, 'series' => [], 'previousSnapshot' => null, 'comparison' => null];
    }
    $historyOptions = array_slice($snapshotOptions, $selectedIndex, 24);
    $snapshotIds = array_column($historyOptions, 'snapshotId');
    $previousSnapshot = $historyOptions[1] ?? null;

    if (count($snapshotIds) < 2) {
        return [
            'available' => false,
            'series' => [],
            'previousSnapshot' => null,
            'comparison' => null,
        ];
    }

    $where = warehouseInventoryBuildWhere($filters, null);
    $placeholders = [];
    $parameters = $where['params'];
    foreach ($snapshotIds as $index => $snapshotId) {
        $name = 'history_snapshot_' . $index;
        $placeholders[] = ':' . $name;
        $parameters[$name] = $snapshotId;
    }
    $conditions = $where['sql'] === '' ? [] : [preg_replace('/^WHERE\s+/i', '', $where['sql'])];
    $conditions[] = 'fai.`snapshot_id` IN (' . implode(', ', $placeholders) . ')';
    $statement = $pdo->prepare(
        'SELECT
            snapshot.`snapshot_id`,
            fai.`snapshot_date_key`,
            snapshot_date.`full_date` AS `snapshot_date`,
            snapshot.`snapshot_label`,
            SUM(COALESCE(fai.`asset_count`, 0)) AS `total_assets`,
            SUM(CASE WHEN fai.`is_available_flag` = 1 THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `available_assets`,
            SUM(CASE WHEN fai.`is_damaged_flag` = 1 THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `damaged_assets`,
            SUM(CASE WHEN fai.`has_location_flag` = 0 THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `missing_location_assets`,
            SUM(CASE WHEN fai.`asset_age_years` > :history_age_threshold THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `old_assets`
        ' . warehouseInventoryFromSql() . '
        LEFT JOIN `dim_inventory_snapshot` snapshot
            ON snapshot.`snapshot_id` = fai.`snapshot_id`
        WHERE ' . implode(' AND ', $conditions) . '
        GROUP BY snapshot.`snapshot_id`, fai.`snapshot_date_key`, snapshot_date.`full_date`, snapshot.`snapshot_label`
        ORDER BY fai.`snapshot_date_key` DESC, snapshot.`imported_at` DESC, snapshot.`snapshot_id` DESC'
    );
    $parameters['history_age_threshold'] = $filters['ageThreshold'];
    warehouseDashboardBind($statement, $parameters);
    $statement->execute();

    $series = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $total = (int)$row['total_assets'];
        $series[(string)$row['snapshot_id']] = [
            'snapshotId' => (string)$row['snapshot_id'],
            'snapshotDateKey' => (int)$row['snapshot_date_key'],
            'snapshotDate' => $row['snapshot_date'],
            'snapshotLabel' => $row['snapshot_label'],
            'totalAssets' => $total,
            'availableAssets' => (int)$row['available_assets'],
            'availabilityRate' => warehouseInventoryAnalyticsRate((int)$row['available_assets'], $total),
            'damagedAssets' => (int)$row['damaged_assets'],
            'damageRate' => warehouseInventoryAnalyticsRate((int)$row['damaged_assets'], $total),
            'missingLocationAssets' => (int)$row['missing_location_assets'],
            'missingLocationRate' => warehouseInventoryAnalyticsRate((int)$row['missing_location_assets'], $total),
            'assetsOlderThanThreshold' => (int)$row['old_assets'],
        ];
    }

    if ($series === []) {
        return ['available' => false, 'series' => [], 'previousSnapshot' => null, 'comparison' => null];
    }

    foreach ($historyOptions as $option) {
        if (!isset($series[$option['snapshotId']])) {
            $series[$option['snapshotId']] = [
                'snapshotId' => $option['snapshotId'],
                'snapshotDateKey' => $option['dateKey'],
                'snapshotDate' => $option['date'],
                'snapshotLabel' => $option['label'],
                'totalAssets' => 0,
                'availableAssets' => 0,
                'availabilityRate' => null,
                'damagedAssets' => 0,
                'damageRate' => null,
                'missingLocationAssets' => 0,
                'missingLocationRate' => null,
                'assetsOlderThanThreshold' => 0,
            ];
        }
    }
    $orderedSeries = array_map(
        static fn(array $option): array => $series[$option['snapshotId']],
        $historyOptions,
    );
    $current = $series[$selectedSnapshotId] ?? null;
    $previous = $previousSnapshot === null ? null : ($series[$previousSnapshot['snapshotId']] ?? null);
    $comparison = $current === null || $previous === null ? null : [
        'currentSnapshot' => $current['snapshotDate'],
        'previousSnapshot' => $previous['snapshotDate'],
        'currentLabel' => $current['snapshotLabel'],
        'previousLabel' => $previous['snapshotLabel'],
        'totalAssets' => $current['totalAssets'] - $previous['totalAssets'],
        'availableAssets' => $current['availableAssets'] - $previous['availableAssets'],
        'availabilityRatePoints' => $current['availabilityRate'] === null || $previous['availabilityRate'] === null
            ? null
            : round($current['availabilityRate'] - $previous['availabilityRate'], 1),
        'damagedAssets' => $current['damagedAssets'] - $previous['damagedAssets'],
        'damageRatePoints' => $current['damageRate'] === null || $previous['damageRate'] === null
            ? null
            : round($current['damageRate'] - $previous['damageRate'], 1),
        'missingLocationAssets' => $current['missingLocationAssets'] - $previous['missingLocationAssets'],
        'missingLocationRatePoints' => $current['missingLocationRate'] === null || $previous['missingLocationRate'] === null
            ? null
            : round($current['missingLocationRate'] - $previous['missingLocationRate'], 1),
        'assetsOlderThanThreshold' => $current['assetsOlderThanThreshold'] - $previous['assetsOlderThanThreshold'],
    ];

    return [
        'available' => count($historyOptions) >= 2,
        'series' => $orderedSeries,
        'previousSnapshot' => $previousSnapshot['key'] ?? null,
        'comparison' => $comparison,
    ];
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    warehouseDashboardRespond(false, 'รองรับเฉพาะคำขอแบบ GET', [], 405);
}

try {
    $filters = warehouseInventoryParseFilters($_GET);
} catch (InvalidArgumentException $error) {
    warehouseDashboardRespond(false, 'ตัวกรองหรือพารามิเตอร์ไม่ถูกต้อง', [], 400);
}

try {
    define('WAREHOUSE_INVENTORY_API_REQUEST', true);
    require __DIR__ . '/warehouse_db.php';

    $snapshotOptions = warehouseDashboardSnapshotOptions($warehousePdo);
    if ($snapshotOptions === []) {
        $emptyAnalytics = warehouseInventoryAnalyticsFinalize(warehouseInventoryAnalyticsCreate($filters['ageThreshold']));
        $emptyAnalytics['overview']['disposalEstimate'] = warehouseDashboardUnavailableDisposalEstimate();
        warehouseDashboardRespond(true, 'ยังไม่มีข้อมูล snapshot ในคลังสินทรัพย์', [
            'snapshot' => null,
            'snapshotOptions' => [],
            'filterOptions' => [],
            'selectedFilters' => $filters,
            ...$emptyAnalytics,
            'history' => ['available' => false, 'series' => [], 'previousSnapshot' => null, 'comparison' => null],
        ]);
    }

    $snapshot = warehouseInventoryResolveSnapshot($warehousePdo, $filters['snapshot']);
    if ($snapshot === null) {
        warehouseDashboardRespond(false, 'ไม่พบชุดข้อมูล snapshot ที่เลือก', [], 400);
    }

    $selectedSnapshotId = $snapshot['snapshotId'];
    $filters['snapshot'] = $snapshot['key'];
    $analytics = warehouseDashboardFetchAnalytics($warehousePdo, $filters, $selectedSnapshotId);
    $analytics['overview']['disposalEstimate'] = warehouseDashboardDisposalEstimate(
        $warehousePdo,
        $filters,
        $selectedSnapshotId,
    );

    $history = warehouseDashboardHistory($warehousePdo, $filters, $snapshotOptions, $selectedSnapshotId);
    warehouseDashboardRespond(true, 'โหลดข้อมูลวิเคราะห์สินทรัพย์สำเร็จ', [
        'snapshot' => $snapshot,
        'snapshotOptions' => $snapshotOptions,
        'filterOptions' => warehouseDashboardFilterOptions($warehousePdo, $selectedSnapshotId),
        'selectedFilters' => $filters,
        ...$analytics,
        'history' => $history,
    ]);
} catch (Throwable $error) {
    error_log('Asset inventory dashboard API failed: ' . $error->getMessage());
    warehouseDashboardRespond(false, 'ไม่สามารถอ่านข้อมูลวิเคราะห์สินทรัพย์จากคลังได้', [], 500);
}
