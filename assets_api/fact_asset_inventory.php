<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function sendWarehouseInventoryResponse(bool $success, string $message, int $total, array $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'total' => $total,
        'data' => $data,
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

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    sendWarehouseInventoryResponse(false, 'รองรับเฉพาะคำขอแบบ GET', 0, [], 405);
}

$limit = warehouseInventoryQueryInt('limit', 10, 1, 100);
$page = warehouseInventoryQueryInt('page', 1, 1, PHP_INT_MAX);

if ($limit === null || $page === null || ($page - 1) > intdiv(PHP_INT_MAX, $limit)) {
    sendWarehouseInventoryResponse(false, 'ค่า page หรือ limit ไม่ถูกต้อง (limit ต้องอยู่ระหว่าง 1 ถึง 100)', 0, [], 400);
}

$offset = ($page - 1) * $limit;

try {
    define('WAREHOUSE_INVENTORY_API_REQUEST', true);
    require __DIR__ . '/warehouse_db.php';

    $latestSnapshotStmt = $warehousePdo->query(
        'SELECT MAX(`snapshot_date_key`) FROM `fact_asset_inventory`'
    );
    $latestSnapshotDateKey = $latestSnapshotStmt->fetchColumn();

    if ($latestSnapshotDateKey === false || $latestSnapshotDateKey === null) {
        sendWarehouseInventoryResponse(true, 'ยังไม่มีข้อมูล snapshot ในคลังสินทรัพย์', 0, []);
    }

    $latestSnapshotDateKey = (int)$latestSnapshotDateKey;
    $countStmt = $warehousePdo->prepare(
        'SELECT COUNT(*) FROM `fact_asset_inventory` WHERE `snapshot_date_key` = :snapshot_date_key'
    );
    $countStmt->bindValue(':snapshot_date_key', $latestSnapshotDateKey, PDO::PARAM_INT);
    $countStmt->execute();
    $total = (int)$countStmt->fetchColumn();

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
            fai.`is_below_threshold_flag`,
            fai.`has_location_flag`,
            fai.`asset_age_years`
        FROM `fact_asset_inventory` fai
        LEFT JOIN `dim_date` snapshot_date
            ON snapshot_date.`date_key` = fai.`snapshot_date_key`
        LEFT JOIN `dim_date` acquisition_date
            ON acquisition_date.`date_key` = fai.`acquisition_date_key`
        LEFT JOIN `dim_asset` da
            ON da.`asset_key` = fai.`asset_key`
        LEFT JOIN `dim_asset_type` asset_type
            ON asset_type.`type_key` = fai.`type_key`
        LEFT JOIN `dim_asset_category` asset_category
            ON asset_category.`category_key` = fai.`category_key`
        LEFT JOIN `dim_department` department
            ON department.`department_key` = fai.`department_key`
        LEFT JOIN `dim_location` location
            ON location.`location_key` = fai.`location_key`
        WHERE fai.`snapshot_date_key` = :snapshot_date_key
        ORDER BY da.`asset_id` ASC, fai.`asset_fact_id` ASC
        LIMIT :limit OFFSET :offset'
    );
    $inventoryStmt->bindValue(':snapshot_date_key', $latestSnapshotDateKey, PDO::PARAM_INT);
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
            'is_below_threshold_flag' => warehouseInventoryNullableInt($row['is_below_threshold_flag']),
            'has_location_flag' => warehouseInventoryNullableInt($row['has_location_flag']),
            'asset_age_years' => warehouseInventoryNullableInt($row['asset_age_years']),
        ];
    }, $rows);

    sendWarehouseInventoryResponse(true, 'เรียกดูรายการสินทรัพย์จากคลังข้อมูลสำเร็จ', $total, $data);
} catch (Throwable $error) {
    error_log('Warehouse inventory API failed: ' . $error->getMessage());
    sendWarehouseInventoryResponse(false, 'ไม่สามารถอ่านข้อมูลจากคลังสินทรัพย์ได้', 0, [], 500);
}
