<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/inventory_query.php';
require_once __DIR__ . '/inventory_analytics.php';

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
    $statement = $pdo->query(
        'SELECT
            fai.`snapshot_date_key` AS `key`,
            snapshot_date.`full_date` AS `date`,
            SUM(COALESCE(fai.`asset_count`, 0)) AS `assets`
        FROM `fact_asset_inventory` fai
        LEFT JOIN `dim_date` snapshot_date
            ON snapshot_date.`date_key` = fai.`snapshot_date_key`
        GROUP BY fai.`snapshot_date_key`, snapshot_date.`full_date`
        ORDER BY fai.`snapshot_date_key` DESC'
    );
    return array_map(static fn(array $row): array => [
        'key' => (int)$row['key'],
        'date' => $row['date'],
        'assets' => (int)$row['assets'],
    ], $statement->fetchAll(PDO::FETCH_ASSOC));
}

function warehouseDashboardFilterOptions(PDO $pdo, int $snapshotDateKey): array
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
            WHERE fai.`snapshot_date_key` = :snapshot_date_key
            ORDER BY `value`'
        );
        $statement->bindValue(':snapshot_date_key', $snapshotDateKey, PDO::PARAM_INT);
        $statement->execute();
        $options[$name] = array_map(
            static fn(mixed $value): string => (string)$value,
            $statement->fetchAll(PDO::FETCH_COLUMN),
        );
    }

    $options['ageBands'] = ['0-2', '3-5', '6-10', '11-15', '16-20', 'over-20', 'unknown'];
    return $options;
}

function warehouseDashboardFetchAnalytics(PDO $pdo, array $filters, int $snapshotDateKey): array
{
    $where = warehouseInventoryBuildWhere($filters, $snapshotDateKey);
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

function warehouseDashboardHistory(PDO $pdo, array $filters, array $snapshotOptions, int $selectedSnapshot): array
{
    $keys = array_values(array_map(
        static fn(array $option): int => $option['key'],
        array_filter($snapshotOptions, static fn(array $option): bool => $option['key'] <= $selectedSnapshot),
    ));
    $keys = array_slice($keys, 0, 24);
    $selectedIndex = array_search($selectedSnapshot, $keys, true);
    $previousSnapshot = $selectedIndex === false ? null : ($keys[$selectedIndex + 1] ?? null);

    if (count($keys) < 2) {
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
    foreach ($keys as $index => $key) {
        $name = 'history_snapshot_' . $index;
        $placeholders[] = ':' . $name;
        $parameters[$name] = $key;
    }
    $conditions = $where['sql'] === '' ? [] : [preg_replace('/^WHERE\s+/i', '', $where['sql'])];
    $conditions[] = 'fai.`snapshot_date_key` IN (' . implode(', ', $placeholders) . ')';
    $statement = $pdo->prepare(
        'SELECT
            fai.`snapshot_date_key`,
            snapshot_date.`full_date` AS `snapshot_date`,
            SUM(COALESCE(fai.`asset_count`, 0)) AS `total_assets`,
            SUM(CASE WHEN fai.`is_available_flag` = 1 THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `available_assets`,
            SUM(CASE WHEN fai.`is_damaged_flag` = 1 THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `damaged_assets`,
            SUM(CASE WHEN fai.`has_location_flag` = 0 THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `missing_location_assets`,
            SUM(CASE WHEN fai.`asset_age_years` > :history_age_threshold THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `old_assets`
        ' . warehouseInventoryFromSql() . '
        WHERE ' . implode(' AND ', $conditions) . '
        GROUP BY fai.`snapshot_date_key`, snapshot_date.`full_date`
        ORDER BY fai.`snapshot_date_key` DESC'
    );
    $parameters['history_age_threshold'] = $filters['ageThreshold'];
    warehouseDashboardBind($statement, $parameters);
    $statement->execute();

    $series = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $total = (int)$row['total_assets'];
        $series[(int)$row['snapshot_date_key']] = [
            'snapshotDateKey' => (int)$row['snapshot_date_key'],
            'snapshotDate' => $row['snapshot_date'],
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

    $current = $series[$selectedSnapshot] ?? null;
    $previous = $previousSnapshot === null ? null : ($series[$previousSnapshot] ?? null);
    $comparison = $current === null || $previous === null ? null : [
        'currentSnapshot' => $current['snapshotDate'],
        'previousSnapshot' => $previous['snapshotDate'],
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
        'available' => count($series) >= 2,
        'series' => array_values($series),
        'previousSnapshot' => $previousSnapshot,
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
        warehouseDashboardRespond(true, 'ยังไม่มีข้อมูล snapshot ในคลังสินทรัพย์', [
            'snapshot' => null,
            'snapshotOptions' => [],
            'filterOptions' => [],
            'selectedFilters' => $filters,
            ...$emptyAnalytics,
            'history' => ['available' => false, 'series' => [], 'previousSnapshot' => null, 'comparison' => null],
        ]);
    }

    $latestSnapshot = $snapshotOptions[0]['key'];
    $selectedSnapshot = $filters['snapshot'] === 'latest' ? $latestSnapshot : (int)$filters['snapshot'];
    $knownSnapshots = array_column($snapshotOptions, 'key');
    if (!in_array($selectedSnapshot, $knownSnapshots, true)) {
        warehouseDashboardRespond(false, 'ไม่พบชุดข้อมูล snapshot ที่เลือก', [], 400);
    }

    $analytics = warehouseDashboardFetchAnalytics($warehousePdo, $filters, $selectedSnapshot);
    $snapshot = null;
    foreach ($snapshotOptions as $option) {
        if ($option['key'] === $selectedSnapshot) {
            $snapshot = $option;
            break;
        }
    }

    $history = warehouseDashboardHistory($warehousePdo, $filters, $snapshotOptions, $selectedSnapshot);
    warehouseDashboardRespond(true, 'โหลดข้อมูลวิเคราะห์สินทรัพย์สำเร็จ', [
        'snapshot' => $snapshot,
        'snapshotOptions' => $snapshotOptions,
        'filterOptions' => warehouseDashboardFilterOptions($warehousePdo, $selectedSnapshot),
        'selectedFilters' => [...$filters, 'snapshot' => (string)$selectedSnapshot],
        ...$analytics,
        'history' => $history,
    ]);
} catch (Throwable $error) {
    error_log('Asset inventory dashboard API failed: ' . $error->getMessage());
    warehouseDashboardRespond(false, 'ไม่สามารถอ่านข้อมูลวิเคราะห์สินทรัพย์จากคลังได้', [], 500);
}
