<?php
// ==============================================================================
// Endpoint: borrow_request_items.php
// ดึงข้อมูลรายการครุภัณฑ์แต่ละชิ้นในใบยืมจากตาราง borrow_request_items
// Format สำหรับ etl_warehouse.py -> fact_borrow_transaction
// ==============================================================================

require_once __DIR__ . '/db.php';

list($limit, $page, $offset) = getPaginationParams();

try {
    // นับจำนวนทั้งหมด (ไม่รวมรายการที่ถูก soft delete)
    $countStmt = $pdo->query("SELECT COUNT(*) FROM `borrow_request_items` WHERE `deleted_at` IS NULL");
    $total = (int)$countStmt->fetchColumn();

    // ดึงข้อมูลตาม pagination
    $stmt = $pdo->prepare("
        SELECT 
            `id`,
            `request_id`,
            `asset_id`,
            `item_status`,
            `replace_asset_id`,
            `staff_note`,
            `checked_by`,
            `checked_at`,
            `return_status`,
            `return_note`,
            `returned_by`,
            `returned_at`,
            `deleted_at`,
            `deleted_by`
        FROM `borrow_request_items`
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
            'id'               => (int)$row['id'],
            'request_id'       => (int)$row['request_id'],
            'asset_id'         => (int)$row['asset_id'],
            'item_status'      => $row['item_status'],
            'replace_asset_id' => $row['replace_asset_id'] !== null ? (int)$row['replace_asset_id'] : null,
            'staff_note'       => $row['staff_note'],
            'checked_by'       => $row['checked_by'] !== null ? (int)$row['checked_by'] : null,
            'checked_at'       => $row['checked_at'] ?: null,
            'return_status'    => $row['return_status'],
            'return_note'      => $row['return_note'],
            'returned_by'      => $row['returned_by'] !== null ? (int)$row['returned_by'] : null,
            'returned_at'      => $row['returned_at'] ?: null,
            'deleted_at'       => $row['deleted_at'] ?: null,
            'deleted_by'       => $row['deleted_by'] !== null ? (int)$row['deleted_by'] : null,
        ];
    }, $rows);

    sendJsonResponse(true, "เรียกดูรายการครุภัณฑ์ในใบยืมสำเร็จ", $total, $data);

} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาด: " . $e->getMessage(), 0, [], 500);
}
