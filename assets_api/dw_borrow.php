<?php
// ==============================================================================
// Endpoint: dw_borrow.php
// ดึงข้อมูลวิเคราะห์เชิงลึกจาก view_borrow_risk_radar ใน Data Warehouse
// พร้อมคำนวณ Anomaly & Risk Detection Flags สำหรับ Dashboard Drill-Through
// รองรับ Auto-Detection ฐานข้อมูล และ Auto-Create View หากยังไม่ได้สร้าง
// ==============================================================================

require_once __DIR__ . '/db.php';

const CREATE_VIEW_SQL = "
CREATE OR REPLACE VIEW `view_borrow_risk_radar` AS
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
    u.`user_key` AS `borrower_user_key`,
    u.`fullname` AS `borrower_name`,
    u.`role_status` AS `borrower_role`,
    appr.`fullname` AS `approver_name`,
    d.`department_key`,
    d.`department_name`,
    a.`asset_key`,
    a.`asset_id`,
    a.`asset_code`,
    a.`asset_name`,
    a.`brand`,
    typ.`type_name`,
    cat.`category_name`,
    COUNT(*) OVER (PARTITION BY f.`borrower_user_key`, f.`asset_key`) AS `repeat_asset_times`,
    COUNT(*) OVER (PARTITION BY f.`borrow_request_id`) AS `items_in_request`,
    COUNT(*) OVER (PARTITION BY f.`borrower_user_key`) AS `user_total_borrows`,
    SUM(f.`is_overdue_flag`) OVER (PARTITION BY f.`borrower_user_key`) AS `user_overdue_count`,
    ROUND(SUM(f.`is_overdue_flag`) OVER (PARTITION BY f.`borrower_user_key`) * 100.0 / NULLIF(COUNT(*) OVER (PARTITION BY f.`borrower_user_key`), 0), 1) AS `user_overdue_rate_pct`,
    SUM(CASE WHEN f.`return_condition` = 'ชำรุด' THEN 1 ELSE 0 END) OVER (PARTITION BY f.`borrower_user_key`) AS `user_damage_count`,
    CASE WHEN COUNT(*) OVER (PARTITION BY f.`borrower_user_key`, f.`asset_key`) >= 2 THEN 1 ELSE 0 END AS `is_repeat_asset_flag`,
    CASE WHEN COUNT(*) OVER (PARTITION BY f.`borrow_request_id`) >= 3 THEN 1 ELSE 0 END AS `is_mass_borrow_flag`,
    CASE WHEN (SUM(f.`is_overdue_flag`) OVER (PARTITION BY f.`borrower_user_key`) * 100.0 / NULLIF(COUNT(*) OVER (PARTITION BY f.`borrower_user_key`), 0)) >= 50.0 
              AND COUNT(*) OVER (PARTITION BY f.`borrower_user_key`) >= 3 THEN 1 ELSE 0 END AS `is_chronic_overdue_flag`,
    CASE WHEN f.`borrow_duration_days` >= 30 THEN 1 ELSE 0 END AS `is_excessive_duration_flag`
FROM `fact_borrow_transaction` f
LEFT JOIN `dim_user` u ON f.`borrower_user_key` = u.`user_key`
LEFT JOIN `dim_user` appr ON f.`approver_user_key` = appr.`user_key`
LEFT JOIN `dim_department` d ON f.`department_key` = d.`department_key`
LEFT JOIN `dim_asset` a ON f.`asset_key` = a.`asset_key`
LEFT JOIN `dim_asset_type` typ ON a.`type_key` = typ.`type_key`
LEFT JOIN `dim_asset_category` cat ON a.`category_key` = cat.`category_key`;
";

function getWarehouseConnection() {
    $host = getenv('WAREHOUSE_DB_HOST') ?: (getenv('DB_HOST') ?: 'localhost');
    $port = getenv('WAREHOUSE_DB_PORT') ?: (getenv('DB_PORT') ?: '3306');
    $user = getenv('WAREHOUSE_DB_USER') ?: (getenv('DB_USER') ?: 'root');
    $pass = getenv('WAREHOUSE_DB_PASS');
    if ($pass === false) $pass = getenv('DB_PASS');
    if ($pass === false) $pass = '';

    // Candidates for Data Warehouse database name
    $candidates = array_unique(array_filter([
        getenv('WAREHOUSE_DB_NAME'),
        getenv('DB_NAME'),
        'cpe_warehouse',
        'warehouse',
        'cpeasset_warehouse'
    ]));

    $lastEx = null;
    foreach ($candidates as $dbname) {
        try {
            $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";
            $pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::ATTR_STRINGIFY_FETCHES  => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
            ]);
            $chk = $pdo->query("SHOW TABLES LIKE 'fact_borrow_transaction'")->fetch();
            if ($chk) {
                return $pdo;
            }
        } catch (Exception $e) {
            $lastEx = $e;
        }
    }

    if ($lastEx) throw $lastEx;
    throw new Exception("ไม่พบตาราง fact_borrow_transaction ใน Data Warehouse (ตรวจทาน cpe_warehouse / warehouse)");
}

try {
    $pdoWh = getWarehouseConnection();

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
        FROM `view_borrow_risk_radar`
        ORDER BY `borrow_fact_id` ASC
    ";

    try {
        $stmt = $pdoWh->query($sql);
    } catch (PDOException $e) {
        // หากยังไม่ได้สร้าง View (Error 1146 / 42S02) ให้ Auto-Create ทันที
        if ($e->getCode() === '42S02' || strpos($e->getMessage(), "doesn't exist") !== false) {
            $pdoWh->exec(CREATE_VIEW_SQL);
            $stmt = $pdoWh->query($sql);
        } else {
            throw $e;
        }
    }

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
                'title' => 'ผูกขาดเครื่องเดิมซ้ำ',
                'severity' => 'HIGH',
                'detail' => "ผู้ใช้ยืมครุภัณฑ์ชิ้นนี้ซ้ำรวม {$r['repeat_asset_times']} ครั้ง"
            ];
        }

        // 2. Mass borrow
        if ((int)$r['is_mass_borrow_flag'] === 1) {
            $anomalies[] = [
                'type' => 'MASS_BORROW',
                'title' => 'ยืมอุปกรณ์จำนวนมากพร้อมกัน',
                'severity' => 'MEDIUM',
                'detail' => "คำขอนี้มีการขอยืมครุภัณฑ์พร้อมกัน {$r['items_in_request']} ชิ้น"
            ];
        }

        // 3. Chronic overdue
        if ((int)$r['is_chronic_overdue_flag'] === 1) {
            $anomalies[] = [
                'type' => 'CHRONIC_OVERDUE',
                'title' => 'ประวัติคืนล่าช้าเรื้อรัง',
                'severity' => 'HIGH',
                'detail' => "ผู้ยืมมีประวัติคืนเกินกำหนดสะสม {$r['user_overdue_rate_pct']}% (เกิน {$r['user_overdue_count']} จาก {$r['user_total_borrows']} ครั้ง)"
            ];
        }

        // 4. Excessive duration
        if ((int)$r['is_excessive_duration_flag'] === 1) {
            $anomalies[] = [
                'type' => 'EXCESSIVE_DURATION',
                'title' => 'ระยะเวลาถือครองยาวนานผิดปกติ',
                'severity' => 'MEDIUM',
                'detail' => "ถือครองอุปกรณ์ยาวนาน {$r['borrow_duration_days']} วัน (เกิน 30 วัน)"
            ];
        }

        // 5. Machine replaced
        if ((int)$r['is_replaced_flag'] === 1) {
            $anomalies[] = [
                'type' => 'MACHINE_REPLACED',
                'title' => 'มีการเปลี่ยนเครื่องทดแทน',
                'severity' => 'LOW',
                'detail' => 'พบการสลับเปลี่ยนเครื่องเนื่องจากอุปกรณ์ขัดข้องระหว่างใช้งาน'
            ];
        }

        // 6. Damaged return
        if ($r['return_condition'] === 'ชำรุด') {
            $anomalies[] = [
                'type' => 'DAMAGED_RETURN',
                'title' => 'ส่งคืนในสภาพชำรุด',
                'severity' => 'HIGH',
                'detail' => 'ตรวจพบความเสียหายตอนตรวจรับคืน ต้องส่งตรวจซ่อมบำรุง'
            ];
        }

        // Risk Level Overall
        $risk_level = 'NORMAL';
        if (array_filter($anomalies, fn($a) => $a['severity'] === 'HIGH')) {
            $risk_level = 'HIGH';
        } elseif (array_filter($anomalies, fn($a) => $a['severity'] === 'MEDIUM')) {
            $risk_level = 'MEDIUM';
        } elseif (!empty($anomalies)) {
            $risk_level = 'LOW';
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
            'reason'             => 'ใช้ในกิจกรรมการเรียนการสอน/วิชาการ',
            
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
