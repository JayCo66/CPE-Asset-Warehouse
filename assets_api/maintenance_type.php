<?php
// ==============================================================================
// Endpoint: maintenance_type.php
// ดึงข้อมูลประเภทงานซ่อมบำรุงจากตาราง maintenance_type
// Format สำหรับ etl_warehouse.py -> dim_maintenance_type
// ==============================================================================

require_once __DIR__ . '/db.php';

list($limit, $page, $offset) = getPaginationParams();

try {
    $countStmt = $pdo->query("SELECT COUNT(*) FROM `maintenance_type`");
    $total = (int)$countStmt->fetchColumn();

    $stmt = $pdo->prepare("
        SELECT `type_id`, `type_name`
        FROM `maintenance_type`
        ORDER BY `type_id` ASC
        LIMIT :limit OFFSET :offset
    ");

    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll();

    $data = array_map(function($row) {
        return [
            'type_id'   => (int)$row['type_id'],
            'type_name' => $row['type_name']
        ];
    }, $rows);

    sendJsonResponse(true, "เรียกดูประเภทงานซ่อมบำรุงสำเร็จ", $total, $data);

} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาด: " . $e->getMessage(), 0, [], 500);
}
