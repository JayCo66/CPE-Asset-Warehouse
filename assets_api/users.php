<?php
// ==============================================================================
// Endpoint: users.php
// ดึงข้อมูลผู้ใช้งานจากตาราง users
// Format สำหรับ etl_warehouse.py -> dim_user
// ==============================================================================

require_once __DIR__ . '/db.php';

list($limit, $page, $offset) = getPaginationParams();

try {
    $countStmt = $pdo->query("SELECT COUNT(*) FROM `users`");
    $total = (int)$countStmt->fetchColumn();

    $stmt = $pdo->prepare("
        SELECT 
            `user_id`,
            `fullname`,
            `role_status`,
            `department_id`
        FROM `users`
        ORDER BY `user_id` ASC
        LIMIT :limit OFFSET :offset
    ");

    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll();

    $data = array_map(function($row) {
        return [
            'user_id'       => (int)$row['user_id'],
            'fullname'      => $row['fullname'],
            'role_status'   => $row['role_status'],
            'department_id' => $row['department_id'] !== null ? (int)$row['department_id'] : null,
        ];
    }, $rows);

    sendJsonResponse(true, "เรียกดูรายการผู้ใช้สำเร็จ", $total, $data);

} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาด: " . $e->getMessage(), 0, [], 500);
}
