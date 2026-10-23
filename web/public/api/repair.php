<?php
// โมดูลซ่อมครุภัณฑ์: fact_asset_maintenance
//   ?view=overview   ปริมาณงาน ค่าซ่อม ระยะเวลาซ่อม (วันทำการ) ตามช่วงเวลา
//   ?view=worth      ค่าซ่อมสะสมเทียบราคาซื้อ (จำลอง): ชิ้นไหนไม่คุ้มซ่อม ควรเสนอจำหน่าย
require __DIR__ . '/db.php';

run(function () {
    $cur = current_fiscal_year();
    $y1 = $cur - 1;
    $y0 = $cur - 2;
    $sla = (int)setting('sla_repair_workdays', 15);
    $view = $_GET['view'] ?? 'overview';

    if ($view === 'worth') {
        return repair_vs_price();
    }

    // ทุกงาน: คิดวันทำการที่ใช้ซ่อมจากวันแจ้งถึงวันเสร็จ
    $jobs = rows("SELECT d.full_date AS repair_date, cd.full_date AS complete_date, d.fiscal_year, d.year, d.month,
                         cd.year AS c_year, cd.month AS c_month, f.is_followup_flag, f.vendor_name, COALESCE(f.total_repair_cost, 0) AS cost,
                         COALESCE(c.category_name, 'ไม่ระบุหมวด') AS category
                  FROM fact_asset_maintenance f
                  JOIN dim_date d ON d.date_key = f.repair_date_key
                  LEFT JOIN dim_date cd ON cd.date_key = f.complete_date_key
                  JOIN dim_asset a ON a.asset_key = f.asset_key
                  LEFT JOIN dim_asset_category c ON c.category_key = a.category_key");
    $kpi = [];
    $fy = [$y0 => [], $y1 => []];
    $months = [];
    $cats = [];
    foreach ($jobs as $j) {
        $wd = $j['complete_date'] ? workdays($j['repair_date'], $j['complete_date']) : null;
        if (isset($fy[$j['fiscal_year']])) $fy[$j['fiscal_year']][] = $j + ['wd' => $wd];
        $mk = sprintf('%04d-%02d', $j['year'], $j['month']);
        $months[$mk] ??= ['year' => $j['year'], 'month' => $j['month'], 'fiscal_year' => $j['fiscal_year'], 'opened' => 0, 'completed' => 0, 'wd' => [], 'followups' => 0, 'cost' => 0];
        $months[$mk]['opened']++;
        $months[$mk]['cost'] += $j['cost'];
        $months[$mk]['followups'] += $j['is_followup_flag'];
        if ($j['complete_date']) {
            $ck = sprintf('%04d-%02d', $j['c_year'], $j['c_month']);
            $months[$ck] ??= ['year' => $j['c_year'], 'month' => $j['c_month'], 'fiscal_year' => $j['c_year'] + 543 + ($j['c_month'] >= 10 ? 1 : 0), 'opened' => 0, 'completed' => 0, 'wd' => [], 'followups' => 0, 'cost' => 0];
            $months[$ck]['completed']++;
            $months[$ck]['wd'][] = $wd;
        }
        if (isset($fy[$j['fiscal_year']])) {
            $cats[$j['category']] ??= ['name' => $j['category'], 'prev_jobs' => 0, 'curr_jobs' => 0, 'prev_cost' => 0, 'curr_cost' => 0, 'curr_wd' => []];
            $cats[$j['category']][$j['fiscal_year'] == $y1 ? 'curr_jobs' : 'prev_jobs']++;
            $cats[$j['category']][$j['fiscal_year'] == $y1 ? 'curr_cost' : 'prev_cost'] += $j['cost'];
            if ($j['fiscal_year'] == $y1 && $wd !== null) $cats[$j['category']]['curr_wd'][] = $wd;
        }
    }
    $sum = function ($list) use ($sla) {
        $done = array_values(array_filter($list, fn($j) => $j['wd'] !== null));
        return ['jobs' => count($list), 'done' => count($done),
                'median_workdays' => median(array_column($done, 'wd')),
                'within_sla' => count(array_filter($done, fn($j) => $j['wd'] <= $sla)),
                'followups' => array_sum(array_column($list, 'is_followup_flag')),
                'cost' => array_sum(array_column($list, 'cost')),
                'in_house' => count(array_filter($done, fn($j) => !$j['vendor_name']))];
    };
    ksort($months);
    $monthly = array_map(fn($m) => ['year' => $m['year'], 'month' => $m['month'], 'fiscal_year' => $m['fiscal_year'],
                                    'opened' => $m['opened'], 'completed' => $m['completed'], 'followups' => $m['followups'], 'cost' => $m['cost'],
                                    'median_workdays' => median($m['wd'])], array_values($months));
    $cats = array_map(fn($c) => ['name' => $c['name'], 'prev_jobs' => $c['prev_jobs'], 'curr_jobs' => $c['curr_jobs'],
                                 'prev_cost' => $c['prev_cost'], 'curr_cost' => $c['curr_cost'],
                                 'curr_median_workdays' => median($c['curr_wd'])], array_values($cats));
    usort($cats, fn($a, $b) => ($b['curr_cost'] + $b['prev_cost']) <=> ($a['curr_cost'] + $a['prev_cost']));
    $worth = repair_vs_price();

    return ['fiscal_years' => ['prev' => $y0, 'curr' => $y1], 'sla_workdays' => $sla,
            'kpi' => $kpi + ['prev' => $sum($fy[$y0]), 'curr' => $sum($fy[$y1])],
            'monthly' => $monthly, 'categories' => $cats,
            'worth' => ['thresholds' => $worth['thresholds'],
                        'dispose' => count(array_filter($worth['assets'], fn($a) => $a['verdict'] === 'dispose')),
                        'watch' => count(array_filter($worth['assets'], fn($a) => $a['verdict'] === 'watch'))]];
});
