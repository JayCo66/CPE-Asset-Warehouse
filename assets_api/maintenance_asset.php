<?php
// ==============================================================================
// Endpoint: maintenance_asset.php
// ดึงข้อมูลการแจ้งซ่อมครุภัณฑ์จากตาราง maintenance_asset
// Format สำหรับ etl_warehouse.py -> fact_asset_maintenance
// ==============================================================================

require_once __DIR__ . '/db.php';

list($limit, $page, $offset) = getPaginationParams();

try {
    // นับจำนวนทั้งหมด (ไม่รวมรายการที่ถูก soft delete)
    $countStmt = $pdo->query("SELECT COUNT(*) FROM `maintenance_asset` WHERE `deleted_at` IS NULL");
    $total = (int)$countStmt->fetchColumn();

    // ดึงข้อมูลตาม pagination
    $stmt = $pdo->prepare("
        SELECT 
            `id`,
            `asset_id`,
            `reporter_name`,
            `repair_date`,
            `detail`,
            `repair_image`,
            `cost`,
            `vendor`,
            `status`,
            `executive_note`,
            `executive_by`,
            `executive_at`,
            `staff_note`,
            `staff_note_by`,
            `staff_note_at`,
            `complete_date`,
            `deleted_at`,
            `deleted_by`,
            `updated_by`,
            `approved_by`,
            `updated_at`,
            `created_at`,
            `repair_total_day`,
            `parent_maintenance_id`,
            `is_followup`,
            `followup_no`,
            `followup_cost`
        FROM `maintenance_asset`
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
            'id'                    => (int)$row['id'],
            'asset_id'              => (int)$row['asset_id'],
            'reporter_name'         => $row['reporter_name'],
            'repair_date'           => $row['repair_date'] ?: null,
            'detail'                => $row['detail'],
            'repair_image'          => $row['repair_image'],
            'cost'                  => $row['cost'] !== null ? (float)$row['cost'] : null,
            'vendor'                => $row['vendor'],
            'status'                => $row['status'],
            'executive_note'        => $row['executive_note'],
            'executive_by'          => $row['executive_by'] !== null ? (int)$row['executive_by'] : null,
            'executive_at'          => $row['executive_at'] ?: null,
            'staff_note'            => $row['staff_note'],
            'staff_note_by'         => $row['staff_note_by'] !== null ? (int)$row['staff_note_by'] : null,
            'staff_note_at'         => $row['staff_note_at'] ?: null,
            'complete_date'         => $row['complete_date'] ?: null,
            'deleted_at'            => $row['deleted_at'] ?: null,
            'deleted_by'            => $row['deleted_by'] !== null ? (int)$row['deleted_by'] : null,
            'updated_by'            => $row['updated_by'] !== null ? (int)$row['updated_by'] : null,
            'approved_by'           => $row['approved_by'] !== null ? (int)$row['approved_by'] : null,
            'updated_at'            => $row['updated_at'] ?: null,
            'created_at'            => $row['created_at'] ?: null,
            'repair_total_day'      => $row['repair_total_day'] !== null ? (int)$row['repair_total_day'] : null,
            'parent_maintenance_id' => $row['parent_maintenance_id'] !== null ? (int)$row['parent_maintenance_id'] : null,
            'is_followup'           => $row['is_followup'] !== null ? (int)$row['is_followup'] : 0,
            'followup_no'           => $row['followup_no'] !== null ? (int)$row['followup_no'] : 0,
            'followup_cost'         => $row['followup_cost'] !== null ? (float)$row['followup_cost'] : null,
        ];
    }, $rows);

    sendJsonResponse(true, "เรียกดูรายการซ่อมครุภัณฑ์สำเร็จ", $total, $data);

} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาด: " . $e->getMessage(), 0, [], 500);
}
