<?php
// report_annual.php : ใช้กับ dashboard_report.html
// รายงานประจำปีงบประมาณ: สรุปทุกโมดูลรายปีงบ (ย้อนหลังถึงปัจจุบัน) + รายละเอียดของปีงบที่เลือกเทียบปีก่อน
//   ?fy=2569   ปีงบที่ต้องการ (ค่าเริ่มต้น = ปีงบที่จบแล้วล่าสุด)
require __DIR__ . '/report_common.php';

run(function () {
    $cur = current_fiscal_year();
    $slaF = (int)setting('sla_facility_workdays', 3);
    $slaR = (int)setting('sla_repair_workdays', 15);
    $approved = "f.item_status = 'อนุมัติ'";
    $snap = row("SELECT MAX(snapshot_date_key) AS k FROM fact_asset_inventory")['k'];

    // ---------- ตัวเลขรายปีงบของทุกโมดูล ----------
    $hist = [];
    $put = function (array $rows, string $mod) use (&$hist) {
        foreach ($rows as $r) {
            $fy = $r['fiscal_year'];
            unset($r['fiscal_year']);
            $hist[$fy][$mod] = $r;
        }
    };
    $put(rows("SELECT d.fiscal_year, COUNT(*) AS total, SUM(mt.type_name = 'งานระบบปรับอากาศ') AS aircon,
                      SUM(f.job_status IS NULL) AS legacy_form, SUM(f.job_status IS NOT NULL) AS new_system
               FROM fact_general_maintenance f
               JOIN dim_date d ON d.date_key = f.reported_date_key
               JOIN dim_maintenance_type mt ON mt.maintenance_type_key = f.maintenance_type_key
               GROUP BY d.fiscal_year"), 'facility');
    $put(rows("SELECT d.fiscal_year, COUNT(*) AS jobs, COUNT(DISTINCT f.asset_key) AS assets, SUM(f.is_followup_flag) AS followups,
                      COALESCE(SUM(f.total_repair_cost), 0) AS cost,
                      SUM(f.complete_date_key IS NOT NULL) AS done,
                      SUM(f.complete_date_key IS NOT NULL AND f.vendor_name IS NULL) AS in_house
               FROM fact_asset_maintenance f JOIN dim_date d ON d.date_key = f.repair_date_key
               GROUP BY d.fiscal_year"), 'repair');
    $put(rows("SELECT d.fiscal_year, SUM($approved) AS items, SUM(f.item_status <> 'อนุมัติ') AS rejected,
                      SUM($approved AND f.is_overdue_flag IS NOT NULL) AS due_items, SUM($approved AND f.is_overdue_flag = 1) AS overdue,
                      COUNT(DISTINCT f.borrower_user_key) AS borrowers, ROUND(AVG(IF($approved, f.borrow_duration_days, NULL)), 1) AS avg_days
               FROM fact_borrow_transaction f JOIN dim_date d ON d.date_key = f.borrow_date_key
               GROUP BY d.fiscal_year"), 'borrow');
    if ($snap) {
        $put(rows("SELECT d.fiscal_year, COUNT(*) AS acquired, SUM(f.is_below_threshold_flag) AS below_threshold
                   FROM fact_asset_inventory f JOIN dim_date d ON d.date_key = f.acquisition_date_key
                   WHERE f.snapshot_date_key = ? GROUP BY d.fiscal_year", [$snap]), 'inventory');
    }

    // ระยะเวลาปิดงาน (วันทำการ) ต้องคำนวณใน PHP เพราะไม่นับวันหยุด
    $speed = function (string $sql, string $mod, int $sla) use (&$hist) {
        $wd = [];
        foreach (rows($sql) as $r) {
            $wd[$r['fiscal_year']][] = workdays($r['opened'], $r['closed']);
        }
        foreach ($wd as $fy => $xs) {
            $hist[$fy][$mod]['median_workdays'] = median($xs);
            $hist[$fy][$mod]['within_sla'] = count(array_filter($xs, fn($x) => $x <= $sla));
            $hist[$fy][$mod]['timed'] = count($xs);
        }
    };
    $speed("SELECT d.fiscal_year, d.full_date AS opened, cd.full_date AS closed FROM fact_general_maintenance f
            JOIN dim_date d ON d.date_key = f.reported_date_key JOIN dim_date cd ON cd.date_key = f.completed_date_key", 'facility', $slaF);
    $speed("SELECT d.fiscal_year, d.full_date AS opened, cd.full_date AS closed FROM fact_asset_maintenance f
            JOIN dim_date d ON d.date_key = f.repair_date_key JOIN dim_date cd ON cd.date_key = f.complete_date_key", 'repair', $slaR);

    // ปีงบที่มีงานจริง (แจ้งซ่อม/ซ่อม/ยืม) ; ครุภัณฑ์ย้อนไปได้หลายสิบปีจึงไม่ใช้กำหนดช่วง
    $activity = array_keys(array_filter($hist, fn($h) => isset($h['facility']) || isset($h['repair']) || isset($h['borrow'])));
    sort($activity);
    $history = [];
    foreach ($activity ? range($activity[0], $cur) : [] as $fy) {
        $history[] = ['fiscal_year' => $fy, 'partial' => $fy >= $cur] + ($hist[$fy] ?? []);
    }
    $complete = array_values(array_filter(array_column($history, 'fiscal_year'), fn($y) => $y < $cur));
    $since = [
        'facility' => row("SELECT MIN(d.full_date) AS d FROM fact_general_maintenance f JOIN dim_date d ON d.date_key = f.reported_date_key")['d'],
        'repair' => row("SELECT MIN(d.full_date) AS d FROM fact_asset_maintenance f JOIN dim_date d ON d.date_key = f.repair_date_key")['d'],
        'borrow' => row("SELECT MIN(d.full_date) AS d FROM fact_borrow_transaction f JOIN dim_date d ON d.date_key = f.borrow_date_key")['d'],
    ];
    $base = ['current_fiscal_year' => $cur, 'today' => today(), 'years' => $complete, 'since' => $since,
             'sla' => ['facility' => $slaF, 'repair' => $slaR], 'history' => $history];
    if (!$complete) {
        return $base + ['fy' => null];
    }

    // ---------- รายละเอียดของปีงบที่เลือก เทียบปีก่อน ----------
    $fy = (int)($_GET['fy'] ?? end($complete));
    if (!in_array($fy, $complete, true)) {
        $fy = end($complete);
    }
    $pv = $fy - 1;
    $pair = [$pv, $fy, $pv, $fy];

    $monthly = [];
    $addM = function (array $rows, string $key) use (&$monthly) {
        foreach ($rows as $r) {
            $k = $r['fiscal_year'] . '-' . $r['month'];
            $monthly[$k] ??= ['fiscal_year' => $r['fiscal_year'], 'month' => $r['month'], 'facility' => 0, 'repair' => 0, 'borrow' => 0];
            $monthly[$k][$key] = $r['n'];
        }
    };
    $addM(rows("SELECT d.fiscal_year, d.month, COUNT(*) AS n FROM fact_general_maintenance f
                JOIN dim_date d ON d.date_key = f.reported_date_key WHERE d.fiscal_year IN (?, ?) GROUP BY d.fiscal_year, d.month", [$pv, $fy]), 'facility');
    $addM(rows("SELECT d.fiscal_year, d.month, COUNT(*) AS n FROM fact_asset_maintenance f
                JOIN dim_date d ON d.date_key = f.repair_date_key WHERE d.fiscal_year IN (?, ?) GROUP BY d.fiscal_year, d.month", [$pv, $fy]), 'repair');
    $addM(rows("SELECT d.fiscal_year, d.month, SUM($approved) AS n FROM fact_borrow_transaction f
                JOIN dim_date d ON d.date_key = f.borrow_date_key WHERE d.fiscal_year IN (?, ?) GROUP BY d.fiscal_year, d.month", [$pv, $fy]), 'borrow');

    return $base + [
        'fy' => $fy,
        'monthly' => array_values($monthly),
        'facility_types' => rows("SELECT mt.type_name AS name, SUM(d.fiscal_year = ?) AS prev, SUM(d.fiscal_year = ?) AS curr
                                  FROM fact_general_maintenance f
                                  JOIN dim_date d ON d.date_key = f.reported_date_key
                                  JOIN dim_maintenance_type mt ON mt.maintenance_type_key = f.maintenance_type_key
                                  WHERE d.fiscal_year IN (?, ?) GROUP BY mt.type_name ORDER BY curr DESC, prev DESC", $pair),
        'buildings' => rows("SELECT COALESCE(l.building, 'ไม่ระบุอาคาร') AS name, SUM(d.fiscal_year = ?) AS prev, SUM(d.fiscal_year = ?) AS curr
                             FROM fact_general_maintenance f
                             JOIN dim_date d ON d.date_key = f.reported_date_key
                             LEFT JOIN dim_location l ON l.location_key = f.location_key
                             WHERE d.fiscal_year IN (?, ?) GROUP BY COALESCE(l.building, 'ไม่ระบุอาคาร') ORDER BY curr DESC, prev DESC LIMIT 8", $pair),
        'repair_categories' => rows("SELECT COALESCE(c.category_name, 'ไม่ระบุหมวด') AS name, SUM(d.fiscal_year = ?) AS prev, SUM(d.fiscal_year = ?) AS curr
                                     FROM fact_asset_maintenance f
                                     JOIN dim_date d ON d.date_key = f.repair_date_key
                                     JOIN dim_asset a ON a.asset_key = f.asset_key
                                     LEFT JOIN dim_asset_category c ON c.category_key = a.category_key
                                     WHERE d.fiscal_year IN (?, ?) GROUP BY c.category_key, c.category_name ORDER BY curr DESC, prev DESC LIMIT 8", $pair),
        'repair_assets' => rows("SELECT a.asset_code, a.asset_name, COALESCE(c.category_name, 'ไม่ระบุหมวด') AS category_name,
                                        COUNT(*) AS repairs, SUM(f.is_followup_flag) AS followups
                                 FROM fact_asset_maintenance f
                                 JOIN dim_date d ON d.date_key = f.repair_date_key
                                 JOIN dim_asset a ON a.asset_key = f.asset_key
                                 LEFT JOIN dim_asset_category c ON c.category_key = a.category_key
                                 WHERE d.fiscal_year = ? GROUP BY a.asset_key, a.asset_code, a.asset_name, c.category_name
                                 HAVING COUNT(*) >= 2 ORDER BY repairs DESC, followups DESC LIMIT 10", [$fy]),
        'borrow_categories' => rows("SELECT COALESCE(c.category_name, 'ไม่ระบุหมวด') AS name,
                                            SUM($approved AND d.fiscal_year = ?) AS prev, SUM($approved AND d.fiscal_year = ?) AS curr
                                     FROM fact_borrow_transaction f
                                     JOIN dim_date d ON d.date_key = f.borrow_date_key
                                     JOIN dim_asset a ON a.asset_key = f.asset_key
                                     LEFT JOIN dim_asset_category c ON c.category_key = a.category_key
                                     WHERE d.fiscal_year IN (?, ?) GROUP BY c.category_key, c.category_name ORDER BY curr DESC, prev DESC LIMIT 8", $pair),
        'acquired_categories' => $snap ? rows("SELECT COALESCE(c.category_name, 'ไม่ระบุหมวด') AS name, COUNT(*) AS n,
                                                      SUM(f.is_below_threshold_flag) AS below_threshold
                                               FROM fact_asset_inventory f
                                               JOIN dim_date d ON d.date_key = f.acquisition_date_key
                                               LEFT JOIN dim_asset_category c ON c.category_key = f.category_key
                                               WHERE f.snapshot_date_key = ? AND d.fiscal_year = ?
                                               GROUP BY c.category_key, c.category_name ORDER BY n DESC", [$snap, $fy]) : [],
    ];
});
