<?php
// ขอเงินลงทุน: ครุภัณฑ์ (หมวดที่ขึ้นต้นด้วย "ครุภัณฑ์") จาก snapshot ล่าสุด
//   อายุ = ปีงบ - ปีงบที่ได้มา (จากรหัส) ; เกินอายุการใช้งานเมื่ออายุ >= อายุการใช้งานของหมวด (settings.useful_life_years)
//   history    สัดส่วนที่เกินอายุการใช้งานของแต่ละปีงบที่ผ่านมา (นับเฉพาะชิ้นที่ยังอยู่ในระบบ)
//   groups     [หมวด, ปีงบที่ครบอายุ, จำนวน, ราคารวม] ให้หน้าเว็บจำลอง "ถ้าได้งบปีละเท่าไร" เอง (ราคาทดแทนประมาณจากราคาซื้อจำลอง)
//   immediate  ซ่อมไม่คุ้ม + ใช้งานเกินครึ่งอายุ: ทดแทนก่อนรายการอื่น (แยกออกจาก groups)
require __DIR__ . '/db.php';

$snapshot = latest_inventory_snapshot();
run_cached(function () use ($snapshot) {
    $cur = current_fiscal_year();
    $years = (int)setting('replacement_plan_years', 5);
    $snap = $snapshot['snapshot_id'] ?? null;
    if (!$snap) {
        return ['empty' => true];
    }
    $rows = rows("SELECT a.asset_code, COALESCE(c.category_name, 'ไม่ระบุหมวด') AS category_name,
                         f.is_below_threshold_flag AS below_threshold, d.fiscal_year AS acq_fy
                  FROM fact_asset_inventory f
                  JOIN dim_asset a ON a.asset_key = f.asset_key
                  LEFT JOIN dim_asset_category c ON c.category_key = f.category_key
                  JOIN dim_date d ON d.date_key = f.acquisition_date_key
                  WHERE f.snapshot_id = ? AND c.category_name LIKE 'ครุภัณฑ์%'", [$snap]);

    $assets = [];
    foreach ($rows as $r) {
        $life = useful_life($r['category_name']);
        $assets[$r['asset_code']] = $r + ['life' => $life, 'eol' => $r['acq_fy'] + $life,
            'price' => mock_purchase_price($r['asset_code'], $r['category_name'], (bool)$r['below_threshold'])];
    }

    $immediate = array_values(array_filter(repair_vs_price()['assets'],
        fn($r) => $r['verdict'] === 'dispose' && isset($assets[$r['asset_code']])));
    $now = array_flip(array_column($immediate, 'asset_code'));

    // หมวด -> index (ส่งเป็นตัวเลขให้ JSON เล็ก)
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
    $idx = array_flip(array_column($cats, 'name'));

    $groups = [];
    $urgent = [];
    foreach ($assets as $code => $a) {
        $key = $idx[$a['category_name']] . ':' . $a['eol'];
        if (isset($now[$code])) {
            $g = &$urgent[$key];
        } else {
            $g = &$groups[$key];
        }
        $g ??= [$idx[$a['category_name']], $a['eol'], 0, 0];
        $g[2]++;
        $g[3] += $a['price'];
        unset($g);
    }

    $history = [];
    for ($y = $cur - 10; $y <= $cur; $y++) {
        $n = $past = 0;
        foreach ($assets as $a) {
            if ($a['acq_fy'] <= $y) {
                $n++;
                $past += $a['eol'] <= $y;
            }
        }
        $history[] = ['fiscal_year' => $y, 'n' => $n, 'past' => $past, 'share' => $n ? $past / $n : null];
    }

    return [
        'current_fiscal_year' => $cur,
        'plan_years' => [$cur + 1, $cur + $years],
        'thresholds' => ['repair_ratio' => (float)setting('repair_cost_ratio_dispose', 0.5),
                         'life_share' => (float)setting('replace_min_life_share', 0.5)],
        'keep_up_per_year' => round(array_sum(array_map(fn($a) => $a['price'] / $a['life'], $assets)), -3),
        'total_assets' => count($assets),
        'history' => $history,
        'categories' => $cats,
        'groups' => array_values($groups),
        'urgent_groups' => array_values($urgent),
        'immediate' => array_map(fn($r) => array_intersect_key($r, array_flip(
            ['asset_code', 'asset_name', 'category_name', 'repairs', 'repair_cost', 'price', 'ratio', 'age_years', 'life_years'])), $immediate),
    ];
}, cache_ttl('asset_summary', 900), true, ['snapshot_id' => $snapshot['snapshot_id'] ?? null]);
