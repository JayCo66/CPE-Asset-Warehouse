<?php
// ==============================================================================
// Endpoint: assets.php
// ดึงข้อมูลรายการครุภัณฑ์จากตาราง asset
// Format สำหรับ etl_warehouse.py -> dim_asset, dim_asset_type, dim_asset_category
// ==============================================================================

require_once __DIR__ . '/db.php';

list($limit, $page, $offset) = getPaginationParams();

try {
    // นับจำนวนทั้งหมด
    $countStmt = $pdo->query("SELECT COUNT(*) FROM `asset` WHERE `is_deleted` IS NULL OR `is_deleted` = 0");
    $total = (int)$countStmt->fetchColumn();

    // ดึงข้อมูลตาม pagination พร้อมชื่อหน่วยงาน และชื่อประเภท (ตาราง asset ไม่มี type_name ต้อง join asset_types)
    $stmt = $pdo->prepare("
        SELECT
            a.`asset_id`,
            a.`asset_code`,
            a.`asset_name`,
            a.`type_id`,
            t.`type_name`,
            a.`type_code`,
            a.`category_id`,
            a.`brand`,
            a.`year_purchase`,
            a.`year_fiscal`,
            a.`source`,
            a.`asset_status`,
            a.`location_id`,
            a.`department_id`,
            d.`department_name`,
            a.`update_date`
        FROM `asset` a
        LEFT JOIN `departments` d ON a.`department_id` = d.`department_id`
        LEFT JOIN `asset_types` t ON a.`type_id` = t.`type_id`
        WHERE a.`is_deleted` IS NULL OR a.`is_deleted` = 0
        ORDER BY a.`asset_id` ASC
        LIMIT :limit OFFSET :offset
    ");

    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll();

    $data = array_map(function($row) {
        return [
            'asset_id'        => (int)$row['asset_id'],
            'asset_code'      => $row['asset_code'],
            'asset_name'      => $row['asset_name'],
            'type_id'         => $row['type_id'] !== null ? (int)$row['type_id'] : null,
            'type_name'       => $row['type_name'] ?? null,
            'type_code'       => $row['type_code'],
            'category_id'     => $row['category_id'] !== null ? (int)$row['category_id'] : null,
            'brand'           => $row['brand'],
            'year_purchase'   => $row['year_purchase'],
            'year_fiscal'     => $row['year_fiscal'],
            'source'          => $row['source'],
            'asset_status'    => $row['asset_status'],
            'location_id'     => $row['location_id'] !== null ? (int)$row['location_id'] : null,
            'department_id'   => $row['department_id'] !== null ? (int)$row['department_id'] : null,
            'department_name' => $row['department_name'] ?? null,
            'update_date'     => $row['update_date'],
        ];
    }, $rows);

    sendJsonResponse(true, "เรียกดูรายการครุภัณฑ์สำเร็จ", $total, $data);

} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาด: " . $e->getMessage(), 0, [], 500);
}
