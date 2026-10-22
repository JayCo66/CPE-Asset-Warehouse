<?php
// ==============================================================================
// Endpoint: departments.php
// ดึงข้อมูลรายชื่อหน่วยงานจากตาราง departments
// Format สำหรับ etl_warehouse.py -> dim_department
// ==============================================================================

require_once __DIR__ . '/db.php';

list($limit, $page, $offset) = getPaginationParams();

try {
    $countStmt = $pdo->query("SELECT COUNT(*) FROM `departments`");
    $total = (int)$countStmt->fetchColumn();

    $stmt = $pdo->prepare("
        SELECT 
            `department_id`,
            `department_name`,
            `shortname`,
            `is_deleted`,
            `deleted_at`
        FROM `departments`
        ORDER BY `department_id` ASC
        LIMIT :limit OFFSET :offset
    ");

    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll();

    $data = array_map(function($row) {
        return [
            'department_id'   => (int)$row['department_id'],
            'department_name' => $row['department_name'],
            'shortname'       => $row['shortname'] ?? null,
            'is_deleted'      => (int)($row['is_deleted'] ?? 0),
            'deleted_at'      => $row['deleted_at'] ?? null,
        ];
    }, $rows);

    sendJsonResponse(true, "เรียกดูรายการหน่วยงานสำเร็จ", $total, $data);

} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาด: " . $e->getMessage(), 0, [], 500);
}
