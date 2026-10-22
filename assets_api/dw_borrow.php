<?php
// ==============================================================================
// Endpoint: dw_borrow.php
// ดึงข้อมูลวิเคราะห์เชิงลึกจากตาราง fact_borrow_transaction ใน Data Warehouse (cpe_warehouse)
// เชื่อมโยง Dimensions สำหรับ Dashboard แบบ Drill-Down และ Drill-Through
// ==============================================================================

require_once __DIR__ . '/db.php';

try {
    $sql = "
        SELECT 
            f.`borrow_fact_id`,
            f.`borrow_request_id`,
            f.`borrow_date_key`,
            f.`return_date_key`,
            f.`actual_return_date_key`,
            f.`borrow_duration_days`,
            f.`overdue_days`,
            f.`is_overdue_flag`,
            f.`is_replaced_flag`,
            f.`item_status`,
            f.`return_condition`,
            u.`user_key` AS borrower_user_key,
            u.`fullname` AS borrower_name,
            u.`role_status` AS borrower_role,
            appr.`fullname` AS approver_name,
            d.`department_key`,
            d.`department_name`,
            a.`asset_key`,
            a.`asset_id`,
            a.`asset_code`,
            a.`asset_name`,
            a.`brand`,
            typ.`type_name`,
            cat.`category_name`,
            b.`reason`
        FROM `cpe_warehouse`.`fact_borrow_transaction` f
        LEFT JOIN `cpe_warehouse`.`dim_user` u ON f.`borrower_user_key` = u.`user_key`
        LEFT JOIN `cpe_warehouse`.`dim_user` appr ON f.`approver_user_key` = appr.`user_key`
        LEFT JOIN `cpe_warehouse`.`dim_department` d ON f.`department_key` = d.`department_key`
        LEFT JOIN `cpe_warehouse`.`dim_asset` a ON f.`asset_key` = a.`asset_key`
        LEFT JOIN `cpe_warehouse`.`dim_asset_type` typ ON a.`type_key` = typ.`type_key`
        LEFT JOIN `cpe_warehouse`.`dim_asset_category` cat ON a.`category_key` = cat.`category_key`
        LEFT JOIN `cpeasset`.`borrow` b ON f.`borrow_request_id` = b.`id`
        ORDER BY f.`borrow_fact_id` ASC
    ";

    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll();

    function format_date_key($key) {
        if (!$key) return null;
        $s = (string)(int)$key;
        if (strlen($s) === 8) {
            return substr($s, 0, 4) . '-' . substr($s, 4, 2) . '-' . substr($s, 6, 2);
        }
        return $s;
    }

    $data = array_map(function($r) {
        return [
            'fact_id'            => (int)$r['borrow_fact_id'],
            'request_id'         => (int)$r['borrow_request_id'],
            'borrow_date'        => format_date_key($r['borrow_date_key']),
            'return_date'        => format_date_key($r['return_date_key']),
            'actual_return_date' => format_date_key($r['actual_return_date_key']),
            'duration_days'      => $r['borrow_duration_days'] !== null ? (int)$r['borrow_duration_days'] : null,
            'overdue_days'       => (int)($r['overdue_days'] ?? 0),
            'is_overdue'         => (int)($r['is_overdue_flag'] ?? 0),
            'is_replaced'        => (int)($r['is_replaced_flag'] ?? 0),
            'item_status'        => $r['item_status'] ?: 'อนุมัติ',
            'return_condition'   => $r['return_condition'] ?: 'รอตรวจคืน',
            'reason'             => $r['reason'] ?: 'ใช้ในกิจกรรมการเรียนการสอน/วิชาการ',
            'user' => [
                'key'  => $r['borrower_user_key'] !== null ? (int)$r['borrower_user_key'] : null,
                'name' => $r['borrower_name'] ?: 'ไม่ระบุ',
                'role' => $r['borrower_role'] ?: 'ไม่ระบุ',
                'dept' => $r['department_name'] ?: 'ไม่ระบุ'
            ],
            'approver' => [
                'name' => $r['approver_name'] ?: 'ไม่ระบุ'
            ],
            'dept_name' => $r['department_name'] ?: 'ไม่ระบุ',
            'asset' => [
                'key'           => $r['asset_key'] !== null ? (int)$r['asset_key'] : null,
                'id'            => $r['asset_id'] !== null ? (int)$r['asset_id'] : null,
                'code'          => $r['asset_code'] ?: 'ไม่ระบุ',
                'name'          => $r['asset_name'] ?: 'ไม่ระบุ',
                'brand'         => $r['brand'] ?: '-',
                'type_name'     => $r['type_name'] ?: 'ไม่ระบุ',
                'category_name' => $r['category_name'] ?: 'ไม่ระบุ'
            ]
        ];
    }, $rows);

    sendJsonResponse(true, "เรียกดูข้อมูลคลังข้อเท็จจริงการยืม-คืนสำเร็จ", count($data), $data);

} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาดในการดึงข้อมูล Data Warehouse: " . $e->getMessage(), 0, [], 500);
}
