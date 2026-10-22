<?php
// ==============================================================================
// Endpoint: maintenance_general.php
// ดึงข้อมูลการแจ้งซ่อมทั่วไป/อาคารสถานที่จากตาราง maintenance_general
// Format สำหรับ etl_warehouse.py -> fact_general_maintenance
// ==============================================================================

require_once __DIR__ . '/db.php';

list($limit, $page, $offset) = getPaginationParams();

try {
    // นับจำนวนทั้งหมด
    $countStmt = $pdo->query("SELECT COUNT(*) FROM `maintenance_general`");
    $total = (int)$countStmt->fetchColumn();

    // ดึงข้อมูลตาม pagination
    $stmt = $pdo->prepare("
        SELECT 
            `id`,
            `department_id`,
            `reporter_status`,
            `maintenance_type_id`,
            `problem_location`,
            `problem_detail`,
            `reported_at`,
            `additional_detail`,
            `status`,
            `staff_id`,
            `completed_at`,
            `created_at`,
            `updated_at`
        FROM `maintenance_general`
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
            'id'                  => (int)$row['id'],
            'department_id'       => $row['department_id'] !== null ? (int)$row['department_id'] : null,
            'reporter_status'     => $row['reporter_status'],
            'maintenance_type_id' => $row['maintenance_type_id'] !== null ? (int)$row['maintenance_type_id'] : null,
            'problem_location'    => $row['problem_location'],
            'problem_detail'      => $row['problem_detail'],
            'reported_at'         => $row['reported_at'] ?: null,
            'additional_detail'   => $row['additional_detail'],
            'status'              => $row['status'],
            'staff_id'            => $row['staff_id'] !== null ? (int)$row['staff_id'] : null,
            'completed_at'        => $row['completed_at'] ?: null,
            'created_at'          => $row['created_at'] ?: null,
            'updated_at'          => $row['updated_at'] ?: null,
        ];
    }, $rows);

    sendJsonResponse(true, "เรียกดูรายการแจ้งซ่อมทั่วไปสำเร็จ", $total, $data);

} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาด: " . $e->getMessage(), 0, [], 500);
}
