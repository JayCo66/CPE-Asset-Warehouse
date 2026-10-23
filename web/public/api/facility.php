<?php
// โมดูลแจ้งซ่อมอาคาร: fact_general_maintenance
// แถวที่ job_status เป็น NULL มาจากใบแจ้งซ่อม Excel เดิม (ETL ไม่มีสถานะงานให้) ที่เหลือมาจากระบบใหม่
require __DIR__ . '/db.php';

run(function () {
    $cur = current_fiscal_year();
    $y1 = $cur - 1;        // ปีงบที่ครบล่าสุด
    $y0 = $cur - 2;

    $monthly = rows("SELECT d.year, d.month, d.fiscal_year, COUNT(*) AS total,
                            SUM(f.job_status IS NULL) AS legacy_form, SUM(f.job_status IS NOT NULL) AS new_system,
                            SUM(mt.type_name = 'งานระบบปรับอากาศ') AS aircon
                     FROM fact_general_maintenance f
                     JOIN dim_date d ON d.date_key = f.reported_date_key
                     JOIN dim_maintenance_type mt ON mt.maintenance_type_key = f.maintenance_type_key
                     GROUP BY d.year, d.month, d.fiscal_year ORDER BY d.year, d.month");

    // ฤดูกาล: เฉลี่ยต่อเดือนจากใบแจ้งซ่อมจริง (Excel) เฉพาะปีงบที่มีข้อมูลครบทั้ง 12 เดือน
    $span = row("SELECT MIN(d.full_date) AS first, MAX(d.full_date) AS last FROM fact_general_maintenance f
                 JOIN dim_date d ON d.date_key = f.reported_date_key WHERE f.job_status IS NULL");
    $full = [];
    if ($span && $span['first']) {
        for ($fy = 2500; $fy <= $cur; $fy++) {
            $start = sprintf('%d-10-01', $fy - 544);
            $end = sprintf('%d-09-30', $fy - 543);
            if ($start >= $span['first'] && $end <= $span['last']) {
                $full[] = $fy;
            }
        }
    }
    $season = [];
    if ($full) {
        $in = implode(',', array_fill(0, count($full), '?'));
        $season = rows("SELECT d.month, SUM(mt.type_name = 'งานระบบปรับอากาศ') / ? AS aircon_avg,
                               SUM(mt.type_name <> 'งานระบบปรับอากาศ') / ? AS other_avg
                        FROM fact_general_maintenance f
                        JOIN dim_date d ON d.date_key = f.reported_date_key
                        JOIN dim_maintenance_type mt ON mt.maintenance_type_key = f.maintenance_type_key
                        WHERE f.job_status IS NULL AND d.fiscal_year IN ($in)
                        GROUP BY d.month", [count($full), count($full), ...$full]);
    }

    $years = range($cur - 5, $cur - 1);
    $buildings = rows("SELECT COALESCE(l.building, 'ไม่ระบุอาคาร') AS building, d.fiscal_year, COUNT(*) AS n
                       FROM fact_general_maintenance f
                       JOIN dim_date d ON d.date_key = f.reported_date_key
                       LEFT JOIN dim_location l ON l.location_key = f.location_key
                       WHERE d.fiscal_year BETWEEN ? AND ?
                       GROUP BY COALESCE(l.building, 'ไม่ระบุอาคาร'), d.fiscal_year", [$years[0], end($years)]);

    $types = rows("SELECT mt.type_name, SUM(d.fiscal_year = ?) AS prev, SUM(d.fiscal_year = ?) AS curr
                   FROM fact_general_maintenance f
                   JOIN dim_date d ON d.date_key = f.reported_date_key
                   JOIN dim_maintenance_type mt ON mt.maintenance_type_key = f.maintenance_type_key
                   WHERE d.fiscal_year IN (?, ?) GROUP BY mt.type_name ORDER BY curr DESC, prev DESC", [$y0, $y1, $y0, $y1]);

    $kpi = row("SELECT SUM(d.fiscal_year = ?) AS prev_total, SUM(d.fiscal_year = ?) AS curr_total
                FROM fact_general_maintenance f JOIN dim_date d ON d.date_key = f.reported_date_key", [$y0, $y1]);

    // งานที่แจ้งในปีงบล่าสุดและปิดแล้ว (มีเฉพาะระบบใหม่): ใช้กี่วันทำการ และเสร็จภายในเกณฑ์กี่ %
    $sla = (int)setting('sla_facility_workdays', 3);
    $done = rows("SELECT d.full_date AS reported, cd.full_date AS completed FROM fact_general_maintenance f
                  JOIN dim_date d ON d.date_key = f.reported_date_key JOIN dim_date cd ON cd.date_key = f.completed_date_key
                  WHERE d.fiscal_year = ?", [$y1]);
    $wd = array_map(fn($r) => workdays($r['reported'], $r['completed']), $done);
    $kpi['sla_workdays'] = $sla;
    $kpi['resolved_jobs'] = count($wd);
    $kpi['median_workdays'] = median($wd);
    $kpi['within_sla'] = count(array_filter($wd, fn($x) => $x <= $sla));

    return ['fiscal_years' => ['prev' => $y0, 'curr' => $y1, 'season_from' => $full, 'buildings' => $years],
            'kpi' => $kpi, 'monthly' => $monthly, 'season' => $season, 'buildings' => $buildings, 'types' => $types];
});
