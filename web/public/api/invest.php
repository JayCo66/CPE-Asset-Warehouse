<?php
// ขอเงินลงทุน: ครุภัณฑ์ (หมวดที่ขึ้นต้นด้วย "ครุภัณฑ์") จาก snapshot ล่าสุด
//   อายุ = ปีงบ - ปีงบที่ได้มา (จากรหัส) ; เกินอายุการใช้งานเมื่ออายุ >= อายุการใช้งานของหมวด (settings.useful_life_years)
//   history    สัดส่วนที่เกินอายุการใช้งานของแต่ละปีงบที่ผ่านมา (นับเฉพาะชิ้นที่ยังอยู่ในระบบ)
//   projection ปีงบถัดไป N ปี: ถ้าไม่ทดแทนเลย เทียบกับทำตามแผน
//   plan       ปีแรกทดแทนรายการซ่อมไม่คุ้มทันที + ทยอยทดแทนที่เกินอายุค้างสะสม (เก่าสุดก่อน) เท่า ๆ กันทุกปี
//              + ทดแทนชิ้นที่ครบอายุในปีนั้น ; ราคาทดแทนประมาณจากราคาซื้อ (จำลอง)
require __DIR__ . '/db.php';

run(function () {
    $cur = current_fiscal_year();
    $years = (int)setting('replacement_plan_years', 5);
    $snap = row("SELECT MAX(snapshot_date_key) AS k FROM fact_asset_inventory")['k'];
    if (!$snap) {
        return ['empty' => true];
    }
    $rows = rows("SELECT a.asset_code, COALESCE(c.category_name, 'ไม่ระบุหมวด') AS category_name,
                         f.is_below_threshold_flag AS below_threshold, d.fiscal_year AS acq_fy
                  FROM fact_asset_inventory f
                  JOIN dim_asset a ON a.asset_key = f.asset_key
                  LEFT JOIN dim_asset_category c ON c.category_key = f.category_key
                  JOIN dim_date d ON d.date_key = f.acquisition_date_key
                  WHERE f.snapshot_date_key = ? AND c.category_name LIKE 'ครุภัณฑ์%'", [$snap]);

    $assets = [];
    foreach ($rows as $r) {
        $life = useful_life($r['category_name']);
        $assets[$r['asset_code']] = $r + ['life' => $life, 'eol' => $r['acq_fy'] + $life,
            'price' => mock_purchase_price($r['asset_code'], $r['category_name'], (bool)$r['below_threshold'])];
    }
    $pastShare = function (int $y) use ($assets) {
        $n = $past = 0;
        foreach ($assets as $a) {
            if ($a['acq_fy'] <= $y) {
                $n++;
                $past += $a['eol'] <= $y;
            }
        }
        return ['n' => $n, 'past' => $past];
    };

    // ซ่อมไม่คุ้ม + เกินครึ่งอายุ -> ทดแทนปีแรก
    $immediate = array_values(array_filter(repair_vs_price()['assets'],
        fn($r) => $r['verdict'] === 'dispose' && isset($assets[$r['asset_code']])));
    $now = array_flip(array_column($immediate, 'asset_code'));

    // เกินอายุค้างสะสม ณ ปีงบปัจจุบัน เรียงจากเกินมานานที่สุด
    $backlog = array_values(array_filter($assets, fn($a) => $a['eol'] <= $cur && !isset($now[$a['asset_code']])));
    usort($backlog, fn($a, $b) => $a['eol'] <=> $b['eol']);
    $chunk = (int)ceil(count($backlog) / max(1, $years));

    $plan = [];
    $projection = [];
    $total = $pastShare($cur)['n'];
    $remaining = count($backlog);
    for ($k = 1; $k <= $years; $k++) {
        $y = $cur + $k;
        $slice = array_slice($backlog, ($k - 1) * $chunk, $chunk);
        $eol = array_filter($assets, fn($a) => $a['eol'] === $y && !isset($now[$a['asset_code']]));
        $first = $k === 1 ? $immediate : [];
        $plan[] = ['fiscal_year' => $y,
                   'immediate_n' => count($first), 'immediate_cost' => array_sum(array_column($first, 'price')),
                   'backlog_n' => count($slice), 'backlog_cost' => array_sum(array_column($slice, 'price')),
                   'eol_n' => count($eol), 'eol_cost' => array_sum(array_column($eol, 'price'))];
        $remaining -= count($slice);
        $s = $pastShare($y);
        $projection[] = ['fiscal_year' => $y, 'no_invest' => $total ? $s['past'] / $total : null,
                         'with_plan' => $total ? $remaining / $total : null];
    }

    $history = [];
    for ($y = $cur - 10; $y <= $cur; $y++) {
        $s = $pastShare($y);
        $history[] = ['fiscal_year' => $y, 'n' => $s['n'], 'past' => $s['past'], 'share' => $s['n'] ? $s['past'] / $s['n'] : null];
    }

    $cats = [];
    foreach ($assets as $a) {
        $c = &$cats[$a['category_name']];
        $c ??= ['name' => $a['category_name'], 'life' => $a['life'], 'assets' => 0, 'past' => 0, 'due' => 0, 'cost' => 0];
        $c['assets']++;
        if ($a['eol'] <= $cur) {
            $c['past']++;
        } elseif ($a['eol'] <= $cur + $years) {
            $c['due']++;
        }
        if ($a['eol'] <= $cur + $years || isset($now[$a['asset_code']])) {
            $c['cost'] += $a['price'];
        }
        unset($c);
    }
    $cats = array_values($cats);
    usort($cats, fn($a, $b) => $b['cost'] <=> $a['cost']);

    return [
        'current_fiscal_year' => $cur,
        'plan_years' => [$cur + 1, $cur + $years],
        'thresholds' => ['repair_ratio' => (float)setting('repair_cost_ratio_dispose', 0.5),
                         'life_share' => (float)setting('replace_min_life_share', 0.5)],
        'keep_up_per_year' => round(array_sum(array_map(fn($a) => $a['price'] / $a['life'], $assets)), -3),
        'history' => $history,
        'projection' => $projection,
        'plan' => $plan,
        'categories' => $cats,
        'immediate' => array_map(fn($r) => array_intersect_key($r, array_flip(['asset_code', 'asset_name', 'category_name', 'repairs', 'repair_cost', 'price', 'ratio', 'age_years', 'life_years'])), $immediate),
    ];
});
