<?php
// Endpoint: asset_types.php
require_once __DIR__ . '/db.php';
list($limit, $page, $offset) = getPaginationParams();

try {
    $countStmt = $pdo->query("SELECT COUNT(*) FROM `asset_types`");
    $total = (int)$countStmt->fetchColumn();

    $stmt = $pdo->prepare("
        SELECT * FROM `asset_types`
        ORDER BY `type_id` ASC
        LIMIT :limit OFFSET :offset
    ");
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll();
    $data = array_map(function($r) {
        return [
            'type_id'     => (int)$r['type_id'],
            'type_code'   => $r['type_code'],
            'type_name'   => $r['type_name'],
            'description' => $r['description'],
            'is_deleted'  => (int)$r['is_deleted'],
            'deleted_at'  => $r['deleted_at'],
        ];
    }, $rows);

    sendJsonResponse(true, "เรียกดูประเภทครุภัณฑ์สำเร็จ", $total, $data);
} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาด: " . $e->getMessage(), 0, [], 500);
}
