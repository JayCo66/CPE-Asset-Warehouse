<?php
// โมดูลยืม-คืน: fact_borrow_transaction (1 แถว = ครุภัณฑ์ 1 ชิ้นในใบยืม)
require __DIR__ . '/db.php';

run_cached(function () {
    $cur = current_fiscal_year();
    $y1 = $cur - 1;
    $y0 = $cur - 2;
    $approved = "f.item_status = 'อนุมัติ'";

    return [
        'fiscal_years' => ['prev' => $y0, 'curr' => $y1],
        'kpi' => row("SELECT SUM($approved AND d.fiscal_year = ?) AS prev_items, SUM($approved AND d.fiscal_year = ?) AS curr_items,
                             SUM($approved AND d.fiscal_year = ? AND f.is_overdue_flag = 1) AS prev_overdue,
                             SUM($approved AND d.fiscal_year = ? AND f.is_overdue_flag = 1) AS curr_overdue,
                             ROUND(AVG(IF($approved AND d.fiscal_year = ?, f.borrow_duration_days, NULL)), 1) AS prev_avg_days,
                             ROUND(AVG(IF($approved AND d.fiscal_year = ?, f.borrow_duration_days, NULL)), 1) AS curr_avg_days,
                             COUNT(DISTINCT IF(d.fiscal_year = ?, f.borrower_user_key, NULL)) AS prev_borrowers,
                             COUNT(DISTINCT IF(d.fiscal_year = ?, f.borrower_user_key, NULL)) AS curr_borrowers
                      FROM fact_borrow_transaction f JOIN dim_date d ON d.date_key = f.borrow_date_key",
                     [$y0, $y1, $y0, $y1, $y0, $y1, $y0, $y1]),
        'monthly' => rows("SELECT d.year, d.month, d.fiscal_year, SUM($approved) AS items,
                                  SUM($approved AND f.is_overdue_flag = 1) AS overdue, SUM(f.item_status <> 'อนุมัติ') AS rejected
                           FROM fact_borrow_transaction f JOIN dim_date d ON d.date_key = f.borrow_date_key
                           GROUP BY d.year, d.month, d.fiscal_year ORDER BY d.year, d.month"),
        // ไตรมาสของปีงบ: Q1 = ต.ค.-ธ.ค.
        'quarterly' => rows("SELECT d.fiscal_year, FLOOR(MOD(d.month + 2, 12) / 3) + 1 AS quarter,
                                    SUM($approved AND f.is_overdue_flag IS NOT NULL) AS due_items,
                                    SUM($approved AND f.is_overdue_flag = 1) AS overdue,
                                    ROUND(AVG(IF(f.is_overdue_flag = 1, f.overdue_days, NULL)), 1) AS avg_overdue_days
                             FROM fact_borrow_transaction f JOIN dim_date d ON d.date_key = f.borrow_date_key
                             GROUP BY d.fiscal_year, FLOOR(MOD(d.month + 2, 12) / 3) + 1 ORDER BY d.fiscal_year, quarter"),
        'categories' => rows("SELECT COALESCE(c.category_name, 'ไม่ระบุหมวด') AS name,
                                     SUM($approved AND d.fiscal_year = ?) AS prev_items, SUM($approved AND d.fiscal_year = ?) AS curr_items
                              FROM fact_borrow_transaction f
                              JOIN dim_asset a ON a.asset_key = f.asset_key
                              LEFT JOIN dim_asset_category c ON c.category_key = a.category_key
                              JOIN dim_date d ON d.date_key = f.borrow_date_key
                              WHERE d.fiscal_year IN (?, ?) GROUP BY c.category_key, c.category_name
                              ORDER BY curr_items + prev_items DESC", [$y0, $y1, $y0, $y1]),
    ];
}, cache_ttl('borrowing', 120));
