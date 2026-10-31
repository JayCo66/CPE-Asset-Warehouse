<?php
// โมดูลครุภัณฑ์: fact_asset_inventory (periodic snapshot)
// ครุภัณฑ์ที่มีอยู่ใน snapshot ล่าสุด มองย้อนตามปีงบที่ได้มา + ประวัติ snapshot แต่ละรอบ
require __DIR__ . '/db.php';

$snapshot = latest_inventory_snapshot();
run_cached(function () use ($snapshot) {
    $snaps = rows("SELECT DISTINCT f.snapshot_date_key AS date_key, d.full_date
                   FROM fact_asset_inventory f JOIN dim_date d ON d.date_key = f.snapshot_date_key
                   ORDER BY f.snapshot_date_key");
    if (!$snaps) {
        return ['snapshots' => [], 'empty' => true];
    }
    $latest = $snapshot['snapshot_id'] ?? null;
    $cur = current_fiscal_year();

    return [
        'fiscal_years' => ['prev' => $cur - 2, 'curr' => $cur - 1],
        'latest' => ['date' => $snapshot['full_date'] ?? null] + row(
            "SELECT COUNT(*) AS total, SUM(is_damaged_flag) AS damaged, SUM(is_below_threshold_flag) AS below_threshold,
                    ROUND(AVG(asset_age_years), 1) AS avg_age, SUM(asset_age_years >= 10) AS age_10_plus
             FROM fact_asset_inventory WHERE snapshot_id = ?", [$latest]),
        // ครุภัณฑ์ที่ยังอยู่ แยกตามปีงบที่ได้มา: เห็นว่าซื้อเข้ามาปีไหนเท่าไร และอายุของครุภัณฑ์ที่มีอยู่
        'acquisitions' => rows("SELECT d.fiscal_year, COUNT(*) AS assets, SUM(f.is_below_threshold_flag) AS below_threshold
                                FROM fact_asset_inventory f JOIN dim_date d ON d.date_key = f.acquisition_date_key
                                WHERE f.snapshot_id = ? GROUP BY d.fiscal_year ORDER BY d.fiscal_year", [$latest]),
        'categories' => rows("SELECT COALESCE(c.category_name, 'ไม่ระบุหมวด') AS name, COUNT(*) AS assets,
                                     SUM(f.is_damaged_flag) AS damaged, ROUND(AVG(f.asset_age_years), 1) AS avg_age,
                                     SUM(f.asset_age_years >= 10) AS age_10_plus, MIN(d.fiscal_year) AS first_fy, MAX(d.fiscal_year) AS last_fy
                              FROM fact_asset_inventory f
                              LEFT JOIN dim_asset_category c ON c.category_key = f.category_key
                              LEFT JOIN dim_date d ON d.date_key = f.acquisition_date_key
                              WHERE f.snapshot_id = ? GROUP BY c.category_key, c.category_name ORDER BY assets DESC", [$latest]),
        'trend' => rows("SELECT snapshot_date.full_date AS date, COUNT(*) AS assets,
                                SUM(f.is_available_flag) AS available,
                                SUM(f.is_damaged_flag) AS damaged, SUM(f.has_location_flag) AS has_location
                         FROM fact_asset_inventory f
                         JOIN dim_inventory_snapshot snapshot ON snapshot.snapshot_id = f.snapshot_id
                         JOIN dim_date snapshot_date ON snapshot_date.date_key = snapshot.snapshot_date_key
                         WHERE NOT EXISTS (
                             SELECT 1 FROM dim_inventory_snapshot newer
                             WHERE newer.snapshot_date_key = snapshot.snapshot_date_key
                               AND (
                                   (newer.source_system = 'university_api' AND snapshot.source_system <> 'university_api')
                                   OR (newer.source_system = snapshot.source_system AND (
                                       newer.imported_at > snapshot.imported_at
                                       OR (newer.imported_at = snapshot.imported_at AND newer.snapshot_id > snapshot.snapshot_id)
                                   ))
                               )
                         )
                         GROUP BY snapshot.snapshot_id, snapshot.snapshot_date_key, snapshot_date.full_date
                         ORDER BY snapshot.snapshot_date_key"),
    ];
}, cache_ttl('asset_summary', 900), true, ['snapshot_id' => $snapshot['snapshot_id'] ?? null]);
