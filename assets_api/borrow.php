<?php
// ==============================================================================
// Endpoint: borrow.php
// ดึงข้อมูลรายการใบคำขอยืมจากตาราง borrow
// Format สำหรับ etl_warehouse.py -> fact_borrow_transaction
// ==============================================================================

require_once __DIR__ . '/db.php';

list($limit, $page, $offset) = getPaginationParams();

try {
    // นับจำนวนทั้งหมด (ไม่รวมรายการที่ถูก soft delete)
    $countStmt = $pdo->query("SELECT COUNT(*) FROM `borrow` WHERE `deleted_at` IS NULL");
    $total = (int)$countStmt->fetchColumn();

    // ดึงข้อมูลตาม pagination
    $stmt = $pdo->prepare("
        SELECT 
            `id`,
            `user_id`,
            `teacher_id`,
            `borrow_date`,
            `return_date`,
            `reason`,
            `status`,
            `created_at`,
            `return_by`,
            `actual_return_date`,
            `return_condition`,
            `return_note`,
            `deleted_at`,
            `phone`,
            `department_id`,
            `deleted_by`,
            `updated_by`,
            `is_overdue`,
            `approved_by`,
            `updated_at`
        FROM `borrow`
        WHERE `deleted_at` IS NULL
        ORDER BY `id` ASC
        LIMIT :limit OFFSET :offset
    ");

    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll();

    // ปรับ Data Types ให้ตรงตาม Specification
    $data = array_map(function($row) {
        return [
            'id'                 => (int)$row['id'],
            'user_id'            => $row['user_id'] !== null ? (int)$row['user_id'] : null,
            'teacher_id'         => $row['teacher_id'] !== null ? (int)$row['teacher_id'] : null,
            'borrow_date'        => $row['borrow_date'] ?: null,
            'return_date'        => $row['return_date'] ?: null,
            'reason'             => $row['reason'],
            'status'             => $row['status'],
            'created_at'         => $row['created_at'] ?: null,
            'return_by'          => $row['return_by'] !== null ? (int)$row['return_by'] : null,
            'actual_return_date' => $row['actual_return_date'] ?: null,
            'return_condition'   => $row['return_condition'],
            'return_note'        => $row['return_note'],
            'deleted_at'         => $row['deleted_at'] ?: null,
            'phone'              => $row['phone'],
            'department_id'      => $row['department_id'] !== null ? (int)$row['department_id'] : null,
            'deleted_by'         => $row['deleted_by'] !== null ? (int)$row['deleted_by'] : null,
            'updated_by'         => $row['updated_by'] !== null ? (int)$row['updated_by'] : null,
            'is_overdue'         => $row['is_overdue'] !== null ? (int)$row['is_overdue'] : 0,
            'approved_by'        => $row['approved_by'] !== null ? (int)$row['approved_by'] : null,
            'updated_at'         => $row['updated_at'] ?: null,
        ];
    }, $rows);

    sendJsonResponse(true, "เรียกดูรายการยืมสำเร็จ", $total, $data);

} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาด: " . $e->getMessage(), 0, [], 500);
}
