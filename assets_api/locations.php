<?php
// ==============================================================================
// Endpoint: locations.php
// ดึงข้อมูลสถานที่จัดวางจากตาราง locations
// Format สำหรับ etl_warehouse.py -> dim_location
// ==============================================================================

require_once __DIR__ . '/db.php';

list($limit, $page, $offset) = getPaginationParams();

try {
    $countStmt = $pdo->query("SELECT COUNT(*) FROM `locations`");
    $total = (int)$countStmt->fetchColumn();

    $stmt = $pdo->prepare("
        SELECT 
            `location_id`,
            `location_name`,
            `building`,
            `floor`,
            `room_detail`,
            `remark`,
            `is_deleted`,
            `deleted_at`
        FROM `locations`
        ORDER BY `location_id` ASC
        LIMIT :limit OFFSET :offset
    ");

    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll();

    $data = array_map(function($row) {
        return [
            'location_id'   => (int)$row['location_id'],
            'location_name' => $row['location_name'],
            'building'      => $row['building'],
            'floor'         => $row['floor'],
            'room_detail'   => $row['room_detail'],
            'remark'        => $row['remark'],
            'is_deleted'    => (int)$row['is_deleted'],
            'deleted_at'    => $row['deleted_at'],
        ];
    }, $rows);

    sendJsonResponse(true, "เรียกดูรายการสถานที่สำเร็จ", $total, $data);

} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาด: " . $e->getMessage(), 0, [], 500);
}
