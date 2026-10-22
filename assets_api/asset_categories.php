<?php
// Endpoint: asset_categories.php
require_once __DIR__ . '/db.php';
list($limit, $page, $offset) = getPaginationParams();

try {
    $countStmt = $pdo->query("SELECT COUNT(*) FROM `asset_categories`");
    $total = (int)$countStmt->fetchColumn();

    $stmt = $pdo->prepare("
        SELECT * FROM `asset_categories`
        ORDER BY `category_id` ASC
        LIMIT :limit OFFSET :offset
    ");
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll();
    $data = array_map(function($r) {
        return [
            'category_id'      => (int)$r['category_id'],
            'category_code'    => $r['category_code'],
            'category_name_th' => $r['category_name_th'],
            'category_name_en' => $r['category_name_en'],
            'description'      => $r['description'],
            'status'           => $r['status'],
            'created_at'       => $r['created_at'],
            'updated_at'       => $r['updated_at'],
        ];
    }, $rows);

    sendJsonResponse(true, "เรียกดูหมวดหมู่ครุภัณฑ์สำเร็จ", $total, $data);
} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาด: " . $e->getMessage(), 0, [], 500);
}
