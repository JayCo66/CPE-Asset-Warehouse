<?php
// ==============================================================================
// Endpoint: dw_borrow.php
// ดึงข้อมูลวิเคราะห์เชิงลึกจาก view_borrow_risk_radar ใน Data Warehouse (cpe_warehouse)
// พร้อมคำนวณ Anomaly & Risk Detection Flags สำหรับ Dashboard Drill-Through
// ==============================================================================

require_once __DIR__ . '/db.php';

try {
    $sql = "
        SELECT 
            `borrow_fact_id`,
            `borrow_request_id`,
            `borrow_date_key`,
            `return_date_key`,
            `actual_return_date_key`,
            `borrow_duration_days`,
            `overdue_days`,
            `is_overdue_flag`,
            `is_replaced_flag`,
            `item_status`,
            `return_condition`,
            `borrower_user_key`,
            `borrower_name`,
            `borrower_role`,
            `approver_name`,
            `department_key`,
            `department_name`,
            `asset_key`,
            `asset_id`,
            `asset_code`,
            `asset_name`,
            `brand`,
            `type_name`,
            `category_name`,
            `reason`,
            `repeat_asset_times`,
            `items_in_request`,
            `user_total_borrows`,
            `user_overdue_count`,
            `user_overdue_rate_pct`,
            `user_damage_count`,
            `is_repeat_asset_flag`,
            `is_mass_borrow_flag`,
            `is_chronic_overdue_flag`,
            `is_excessive_duration_flag`
        FROM `cpe_warehouse`.`view_borrow_risk_radar`
        ORDER BY `borrow_fact_id` ASC
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
        $anomalies = [];
        
        // 1. Repeat asset
        if ((int)$r['is_repeat_asset_flag'] === 1) {
            $anomalies[] = [
                'type' => 'REPEAT_ASSET',
                'severity' => 'MEDIUM',
                'title' => 'ผูกขาดอุปกรณ์ชิ้นเดิมซ้ำ',
                'detail' => 'ผู้ยืมรายนี้เคยยืมอุปกรณ์ชิ้นเดิมนี้ซ้ำแล้ว ' . $r['repeat_asset_times'] . ' ครั้ง'
            ];
        }

        // 2. Mass borrowing
        if ((int)$r['is_mass_borrow_flag'] === 1) {
            $anomalies[] = [
                'type' => 'MASS_BORROW',
                'severity' => 'MEDIUM',
                'title' => 'ยืมอุปกรณ์จำนวนมาก (Mass Borrow)',
                'detail' => 'คำขอนี้เบิกอุปกรณ์พร้อมกันถึง ' . $r['items_in_request'] . ' ชิ้นในคราวเดียว'
            ];
        }

        // 3. Chronic overdue
        if ((int)$r['is_chronic_overdue_flag'] === 1) {
            $anomalies[] = [
                'type' => 'CHRONIC_OVERDUE',
                'severity' => 'HIGH',
                'title' => 'ผู้ยืมมีประวัติคืนล่าช้าเรื้อรัง',
                'detail' => 'มีอัตราส่งคืนล่าช้าสูงถึง ' . $r['user_overdue_rate_pct'] . '% (เกินกำหนด ' . $r['user_overdue_count'] . ' จาก ' . $r['user_total_borrows'] . ' ครั้ง)'
            ];
        }

        // 4. Excessive duration
        if ((int)$r['is_excessive_duration_flag'] === 1) {
            $anomalies[] = [
                'type' => 'EXCESSIVE_DURATION',
                'severity' => 'MEDIUM',
                'title' => 'ถือครองยาวนานผิดปกติ',
                'detail' => 'ระยะเวลาใช้งาน ' . $r['borrow_duration_days'] . ' วัน (เกินเกณฑ์ 30 วัน)'
            ];
        }

        // 5. Replaced machine
        if ((int)$r['is_replaced_flag'] === 1) {
            $anomalies[] = [
                'type' => 'MACHINE_REPLACED',
                'severity' => 'LOW',
                'title' => 'มีการเปลี่ยนเครื่องทดแทน',
                'detail' => 'เครื่องเดิมมีปัญหาก่อนจ่ายของ เจ้าหน้าที่จึงเปลี่ยนเครื่องสำรองให้'
            ];
        }

        // 6. Damaged condition
        if ($r['return_condition'] === 'ชำรุด') {
            $anomalies[] = [
                'type' => 'DAMAGED_RETURN',
                'severity' => 'HIGH',
                'title' => 'ส่งคืนในสภาพชำรุดเสียหาย',
                'detail' => 'ครุภัณฑ์ได้รับความเสียหายหลังการใช้งาน ต้องส่งซ่อมบำรุง'
            ];
        }

        // Determine overall risk level
        $severities = array_column($anomalies, 'severity');
        if (in_array('HIGH', $severities) || count($anomalies) >= 2) {
            $risk_level = 'HIGH';
        } elseif (in_array('MEDIUM', $severities)) {
            $risk_level = 'MEDIUM';
        } elseif (count($anomalies) > 0) {
            $risk_level = 'LOW';
        } else {
            $risk_level = 'NORMAL';
        }

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
            
            // Risk & Anomaly Details
            'risk_level'         => $risk_level,
            'anomalies'          => $anomalies,
            'anomaly_metrics'    => [
                'repeat_asset_times'      => (int)$r['repeat_asset_times'],
                'items_in_request'        => (int)$r['items_in_request'],
                'user_total_borrows'      => (int)$r['user_total_borrows'],
                'user_overdue_count'      => (int)$r['user_overdue_count'],
                'user_overdue_rate_pct'   => (float)$r['user_overdue_rate_pct'],
                'user_damage_count'       => (int)$r['user_damage_count']
            ],

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

    sendJsonResponse(true, "เรียกดูข้อมูลคลังข้อเท็จจริงการยืม-คืนพร้อมเรดาร์ความเสี่ยงสำเร็จ", count($data), $data);

} catch (Exception $e) {
    sendJsonResponse(false, "เกิดข้อผิดพลาดในการดึงข้อมูล Data Warehouse: " . $e->getMessage(), 0, [], 500);
}
