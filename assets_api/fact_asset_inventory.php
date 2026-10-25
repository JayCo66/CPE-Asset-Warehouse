<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/inventory_query.php';

function sendWarehouseInventoryResponse(
    bool $success,
    string $message,
    int $total,
    array $data,
    int $statusCode = 200,
    ?array $summary = null,
    ?int $matchedTotal = null,
    ?array $filterOptions = null,
    ?int $page = null
): void
{
    http_response_code($statusCode);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'total' => $total,
        'matchedTotal' => $matchedTotal ?? $total,
        'page' => $page,
        'data' => $data,
        'summary' => $summary ?? ['current' => null, 'previous' => null],
        'filterOptions' => $filterOptions ?? ['statuses' => [], 'types' => []],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function warehouseInventoryQueryInt(string $name, int $default, int $minimum, int $maximum): ?int
{
    if (!array_key_exists($name, $_GET)) {
        return $default;
    }

    $value = $_GET[$name];
    if (!is_string($value) || !ctype_digit($value)) {
        return null;
    }

    $validated = filter_var($value, FILTER_VALIDATE_INT, [
        'options' => ['min_range' => $minimum, 'max_range' => $maximum],
    ]);

    return $validated === false ? null : (int)$validated;
}

function warehouseInventoryNullableInt($value): ?int
{
    return $value === null ? null : (int)$value;
}

function warehouseInventoryBindParameters(PDOStatement $statement, array $parameters): void
{
    foreach ($parameters as $name => $value) {
        $parameterType = is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR;
        $statement->bindValue(':' . $name, $value, $parameterType);
    }
}

function warehouseInventoryFetchFilterOptions(PDO $pdo, int $snapshotDateKey): array
{
    $statusStatement = $pdo->prepare(
        'SELECT DISTINCT da.`asset_status`
        FROM `fact_asset_inventory` fai
        LEFT JOIN `dim_asset` da
            ON da.`asset_key` = fai.`asset_key`
        WHERE fai.`snapshot_date_key` = :snapshot_date_key
            AND da.`asset_status` IS NOT NULL
            AND da.`asset_status` <> \'\'
        ORDER BY da.`asset_status`'
    );
    $statusStatement->bindValue(':snapshot_date_key', $snapshotDateKey, PDO::PARAM_INT);
    $statusStatement->execute();

    $typeStatement = $pdo->prepare(
        'SELECT DISTINCT asset_type.`type_name`
        FROM `fact_asset_inventory` fai
        LEFT JOIN `dim_asset_type` asset_type
            ON asset_type.`type_key` = fai.`type_key`
        WHERE fai.`snapshot_date_key` = :snapshot_date_key
            AND asset_type.`type_name` IS NOT NULL
            AND asset_type.`type_name` <> \'\'
        ORDER BY asset_type.`type_name`'
    );
    $typeStatement->bindValue(':snapshot_date_key', $snapshotDateKey, PDO::PARAM_INT);
    $typeStatement->execute();

    return [
        'statuses' => array_values($statusStatement->fetchAll(PDO::FETCH_COLUMN)),
        'types' => array_values($typeStatement->fetchAll(PDO::FETCH_COLUMN)),
    ];
}

function warehouseInventorySendCsv(PDO $pdo, array $filter): void
{
    $stream = fopen('php://temp/maxmemory:2097152', 'w+b');
    if (!is_resource($stream)) {
        throw new RuntimeException('Unable to create temporary CSV stream.');
    }

    try {
        if (fwrite($stream, "\xEF\xBB\xBF") !== 3) {
            throw new RuntimeException('Unable to write CSV byte-order mark.');
        }
        if (!warehouseInventoryWriteCsvRow($stream, warehouseInventoryCsvHeadings())) {
            throw new RuntimeException('Unable to write CSV headings.');
        }

        $lastAssetFactId = 0;
        $batchSize = 500;
        $query = 'SELECT
                fai.`asset_fact_id`,
                snapshot_date.`full_date` AS `snapshot_date`,
                da.`asset_code`,
                da.`asset_name`,
                asset_type.`type_name`,
                da.`brand`,
                da.`asset_status`,
                da.`year_purchase`,
                department.`department_name`,
                location.`location_id`
            ' . warehouseInventoryFromSql() . '
            ' . $filter['sql'] . '
                AND fai.`asset_fact_id` > :after_asset_fact_id
            ORDER BY fai.`asset_fact_id` ASC
            LIMIT :batch_limit';
        $statement = $pdo->prepare($query);

        do {
            warehouseInventoryBindParameters($statement, $filter['params']);
            $statement->bindValue(':after_asset_fact_id', $lastAssetFactId, PDO::PARAM_INT);
            $statement->bindValue(':batch_limit', $batchSize, PDO::PARAM_INT);
            $statement->execute();
            $rows = $statement->fetchAll();

            foreach ($rows as $row) {
                if (!warehouseInventoryWriteCsvRow($stream, warehouseInventoryCsvRow($row))) {
                    throw new RuntimeException('Unable to write CSV data.');
                }
                $lastAssetFactId = (int)$row['asset_fact_id'];
            }
        } while (count($rows) === $batchSize);

        rewind($stream);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="asset-inventory.csv"; filename*=UTF-8\'\'' . rawurlencode('ทะเบียนสินทรัพย์.csv'));
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('X-Accel-Buffering: no');
        fpassthru($stream);
    } finally {
        fclose($stream);
    }

    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    sendWarehouseInventoryResponse(false, 'รองรับเฉพาะคำขอแบบ GET', 0, [], 405);
}

$filters = null;
$format = null;
$scope = null;
try {
    $filters = warehouseInventoryParseFilters($_GET);
    $format = warehouseInventoryReadQueryString($_GET, 'format', 'json', 10);
    $scope = warehouseInventoryReadQueryString($_GET, 'scope', '', 10);
} catch (InvalidArgumentException $error) {
    sendWarehouseInventoryResponse(false, 'คำค้นหาหรือตัวกรองไม่ถูกต้อง', 0, [], 400);
}

if (!in_array($format, ['json', 'csv'], true)) {
    sendWarehouseInventoryResponse(false, 'รูปแบบผลลัพธ์ไม่รองรับ', 0, [], 400);
}

if (($format === 'csv' && $scope !== 'all') || ($format === 'json' && $scope !== '')) {
    sendWarehouseInventoryResponse(false, 'ขอบเขตการส่งออกไม่ถูกต้อง', 0, [], 400);
}

$limit = $format === 'json' ? warehouseInventoryQueryInt('limit', 10, 1, 100) : 10;
$page = $format === 'json' ? warehouseInventoryQueryInt('page', 1, 1, PHP_INT_MAX) : 1;

if ($limit === null || $page === null || ($page - 1) > intdiv(PHP_INT_MAX, $limit)) {
    sendWarehouseInventoryResponse(false, 'ค่า page หรือ limit ไม่ถูกต้อง (limit ต้องอยู่ระหว่าง 1 ถึง 100)', 0, [], 400);
}

try {
    define('WAREHOUSE_INVENTORY_API_REQUEST', true);
    require __DIR__ . '/warehouse_db.php';

    $latestSnapshotStmt = $warehousePdo->query(
        'SELECT MAX(`snapshot_date_key`) FROM `fact_asset_inventory`'
    );
    $latestSnapshotDateKey = $latestSnapshotStmt->fetchColumn();

    if ($latestSnapshotDateKey === false || $latestSnapshotDateKey === null) {
        if ($format === 'csv') {
            warehouseInventorySendCsv($warehousePdo, warehouseInventoryBuildWhere($filters, 0));
        }
        sendWarehouseInventoryResponse(true, 'ยังไม่มีข้อมูล snapshot ในคลังสินทรัพย์', 0, [], 200, null, 0);
    }

    $latestSnapshotDateKey = (int)$latestSnapshotDateKey;
    $selectedSnapshotDateKey = $latestSnapshotDateKey;
    if ($filters['snapshot'] !== 'latest') {
        $selectedSnapshotDateKey = (int)$filters['snapshot'];
        $selectedSnapshotStmt = $warehousePdo->prepare(
            'SELECT 1 FROM `fact_asset_inventory`
            WHERE `snapshot_date_key` = :snapshot_date_key LIMIT 1'
        );
        $selectedSnapshotStmt->bindValue(':snapshot_date_key', $selectedSnapshotDateKey, PDO::PARAM_INT);
        $selectedSnapshotStmt->execute();
        if ($selectedSnapshotStmt->fetchColumn() === false) {
            sendWarehouseInventoryResponse(false, 'ไม่พบชุดข้อมูล snapshot ที่เลือก', 0, [], 400);
        }
    }

    if ($format === 'csv') {
        warehouseInventorySendCsv(
            $warehousePdo,
            warehouseInventoryBuildWhere($filters, $selectedSnapshotDateKey),
        );
    }

    $snapshotKeysStmt = $warehousePdo->prepare(
        'SELECT DISTINCT `snapshot_date_key`
        FROM `fact_asset_inventory`
        WHERE `snapshot_date_key` <= :snapshot_date_key
        ORDER BY `snapshot_date_key` DESC
        LIMIT 2'
    );
    $snapshotKeysStmt->bindValue(':snapshot_date_key', $selectedSnapshotDateKey, PDO::PARAM_INT);
    $snapshotKeysStmt->execute();
    $snapshotDateKeys = array_map('intval', $snapshotKeysStmt->fetchAll(PDO::FETCH_COLUMN));
    $summary = ['current' => null, 'previous' => null];

    if ($snapshotDateKeys !== []) {
        $snapshotPlaceholders = implode(', ', array_fill(0, count($snapshotDateKeys), '?'));
        $summaryStmt = $warehousePdo->prepare(
            'SELECT
                fai.`snapshot_date_key`,
                snapshot_date.`full_date` AS `snapshot_date`,
                SUM(COALESCE(fai.`asset_count`, 0)) AS `total`,
                SUM(CASE WHEN fai.`is_available_flag` = 1 THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `ready`,
                SUM(CASE WHEN fai.`has_location_flag` = 0 THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `missing_location`,
                SUM(CASE WHEN fai.`asset_age_years` BETWEEN 0 AND 2 THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `age_zero_to_two`,
                SUM(CASE WHEN fai.`asset_age_years` BETWEEN 3 AND 5 THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `age_three_to_five`,
                SUM(CASE WHEN fai.`asset_age_years` BETWEEN 6 AND 8 THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `age_six_to_eight`,
                SUM(CASE WHEN fai.`asset_age_years` >= 9 THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `age_nine_plus`,
                SUM(CASE WHEN fai.`asset_age_years` IS NULL THEN COALESCE(fai.`asset_count`, 0) ELSE 0 END) AS `age_unknown`
            FROM `fact_asset_inventory` fai
            LEFT JOIN `dim_date` snapshot_date
                ON snapshot_date.`date_key` = fai.`snapshot_date_key`
            WHERE fai.`snapshot_date_key` IN (' . $snapshotPlaceholders . ')
            GROUP BY fai.`snapshot_date_key`, snapshot_date.`full_date`
            ORDER BY fai.`snapshot_date_key` DESC'
        );
        foreach ($snapshotDateKeys as $index => $snapshotDateKey) {
            $summaryStmt->bindValue($index + 1, $snapshotDateKey, PDO::PARAM_INT);
        }
        $summaryStmt->execute();

        $summaries = array_map(static function (array $row): array {
            return [
                'snapshotDateKey' => (int)$row['snapshot_date_key'],
                'snapshotDate' => $row['snapshot_date'],
                'total' => (int)$row['total'],
                'ready' => (int)$row['ready'],
                'missingLocation' => (int)$row['missing_location'],
                'ageBands' => [
                    'zeroToTwo' => (int)$row['age_zero_to_two'],
                    'threeToFive' => (int)$row['age_three_to_five'],
                    'sixToEight' => (int)$row['age_six_to_eight'],
                    'ninePlus' => (int)$row['age_nine_plus'],
                    'unknown' => (int)$row['age_unknown'],
                ],
            ];
        }, $summaryStmt->fetchAll());

        $summary['current'] = $summaries[0] ?? null;
        $summary['previous'] = $summaries[1] ?? null;
    }

    $countStmt = $warehousePdo->prepare(
        'SELECT COUNT(*) FROM `fact_asset_inventory` WHERE `snapshot_date_key` = :snapshot_date_key'
    );
    $countStmt->bindValue(':snapshot_date_key', $selectedSnapshotDateKey, PDO::PARAM_INT);
    $countStmt->execute();
    $total = (int)$countStmt->fetchColumn();

    $filter = warehouseInventoryBuildWhere($filters, $selectedSnapshotDateKey);

    $matchedCountStmt = $warehousePdo->prepare(
        'SELECT COUNT(*) ' . warehouseInventoryFromSql() . ' ' . $filter['sql']
    );
    warehouseInventoryBindParameters($matchedCountStmt, $filter['params']);
    $matchedCountStmt->execute();
    $matchedTotal = (int)$matchedCountStmt->fetchColumn();
    $page = min($page, max(1, (int)ceil($matchedTotal / $limit)));
    $offset = ($page - 1) * $limit;
    $filterOptions = warehouseInventoryFetchFilterOptions($warehousePdo, $selectedSnapshotDateKey);

    $inventoryStmt = $warehousePdo->prepare(
        'SELECT
            fai.`asset_fact_id`,
            fai.`snapshot_date_key`,
            snapshot_date.`full_date` AS `snapshot_date`,
            snapshot_date.`full_date` AS `update_date`,
            fai.`acquisition_date_key`,
            acquisition_date.`full_date` AS `acquisition_date`,
            fai.`asset_key`,
            da.`asset_id`,
            da.`asset_code`,
            da.`asset_name`,
            fai.`type_key`,
            asset_type.`type_id`,
            asset_type.`type_code`,
            asset_type.`type_name`,
            fai.`category_key`,
            asset_category.`category_id`,
            asset_category.`category_name`,
            da.`brand`,
            da.`model`,
            da.`year_purchase`,
            da.`year_fiscal`,
            da.`source`,
            da.`asset_status`,
            fai.`department_key`,
            department.`department_id`,
            department.`department_name`,
            fai.`location_key`,
            location.`location_id`,
            location.`building`,
            location.`floor`,
            location.`room`,
            location.`area_name`,
            fai.`asset_count`,
            fai.`is_available_flag`,
            fai.`is_damaged_flag`,
            fai.`has_location_flag`,
            fai.`asset_age_years`
        ' . warehouseInventoryFromSql() . '
        ' . $filter['sql'] . '
        ORDER BY da.`asset_id` ASC, fai.`asset_fact_id` ASC
        LIMIT :limit OFFSET :offset'
    );
    warehouseInventoryBindParameters($inventoryStmt, $filter['params']);
    $inventoryStmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $inventoryStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $inventoryStmt->execute();
    $rows = $inventoryStmt->fetchAll();

    $data = array_map(static function (array $row): array {
        return [
            'asset_fact_id' => (int)$row['asset_fact_id'],
            'snapshot_date_key' => warehouseInventoryNullableInt($row['snapshot_date_key']),
            'snapshot_date' => $row['snapshot_date'],
            'update_date' => $row['update_date'],
            'acquisition_date_key' => warehouseInventoryNullableInt($row['acquisition_date_key']),
            'acquisition_date' => $row['acquisition_date'],
            'asset_key' => warehouseInventoryNullableInt($row['asset_key']),
            'asset_id' => warehouseInventoryNullableInt($row['asset_id']),
            'asset_code' => $row['asset_code'],
            'asset_name' => $row['asset_name'],
            'type_key' => warehouseInventoryNullableInt($row['type_key']),
            'type_id' => warehouseInventoryNullableInt($row['type_id']),
            'type_code' => $row['type_code'],
            'type_name' => $row['type_name'],
            'category_key' => warehouseInventoryNullableInt($row['category_key']),
            'category_id' => warehouseInventoryNullableInt($row['category_id']),
            'category_name' => $row['category_name'],
            'brand' => $row['brand'],
            'model' => $row['model'],
            'year_purchase' => $row['year_purchase'],
            'year_fiscal' => $row['year_fiscal'],
            'source' => $row['source'],
            'asset_status' => $row['asset_status'],
            'department_key' => warehouseInventoryNullableInt($row['department_key']),
            'department_id' => warehouseInventoryNullableInt($row['department_id']),
            'department_name' => $row['department_name'],
            'location_key' => warehouseInventoryNullableInt($row['location_key']),
            'location_id' => warehouseInventoryNullableInt($row['location_id']),
            'building' => $row['building'],
            'floor' => $row['floor'],
            'room' => $row['room'],
            'area_name' => $row['area_name'],
            'asset_count' => warehouseInventoryNullableInt($row['asset_count']),
            'is_available_flag' => warehouseInventoryNullableInt($row['is_available_flag']),
            'is_damaged_flag' => warehouseInventoryNullableInt($row['is_damaged_flag']),
            'has_location_flag' => warehouseInventoryNullableInt($row['has_location_flag']),
            'asset_age_years' => warehouseInventoryNullableInt($row['asset_age_years']),
        ];
    }, $rows);

    sendWarehouseInventoryResponse(
        true,
        'เรียกดูรายการสินทรัพย์จากคลังข้อมูลสำเร็จ',
        $total,
        $data,
        200,
        $summary,
        $matchedTotal,
        $filterOptions,
        $page,
    );
} catch (Throwable $error) {
    error_log('Warehouse inventory API failed: ' . $error->getMessage());
    sendWarehouseInventoryResponse(false, 'ไม่สามารถอ่านข้อมูลจากคลังสินทรัพย์ได้', 0, [], 500);
}
