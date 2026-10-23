<?php
// ==============================================================================
// helper กลางของ dashboard_report.html (report_*.php) : อ่านอย่างเดียวจาก Data Warehouse
// เชื่อมต่อด้วย WAREHOUSE_DB_* (ค่าเริ่มต้นแบบ XAMPP: localhost, root, ไม่มีรหัสผ่าน, cpe_warehouse เหมือน dw_borrow.php)
// เกณฑ์ต่าง ๆ อยู่ใน report_config.json
// ==============================================================================
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');
date_default_timezone_set('Asia/Bangkok');

function respond($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function fail(string $message, int $status = 500): void
{
    respond(['error' => $message], $status);
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $env = fn(string $name, string $default) => ($v = getenv($name)) === false ? $default : $v;
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $env('WAREHOUSE_DB_HOST', 'localhost'), $env('WAREHOUSE_DB_PORT', '3306'), $env('WAREHOUSE_DB_NAME', 'cpe_warehouse'));
    try {
        $pdo = new PDO($dsn, $env('WAREHOUSE_DB_USER', 'root'), $env('WAREHOUSE_DB_PASS', ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
    } catch (PDOException $e) {
        fail('เชื่อมต่อ Data Warehouse ไม่ได้ ตรวจค่า WAREHOUSE_DB_* และว่าโหลด warehouse_load.sql แล้ว', 503);
    }
    return $pdo;
}

/** query -> rows; ตัวเลขจาก SUM/AVG ของ MySQL มาเป็น string จึงแปลงเป็น number ให้ */
function rows(string $sql, array $params = []): array
{
    $st = db()->prepare($sql);
    foreach (array_values($params) as $i => $v) {
        $st->bindValue($i + 1, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }
    $st->execute();
    return array_map(function ($r) {
        foreach ($r as $k => $v) {
            if (is_string($v) && is_numeric($v) && !preg_match('/^0\d/', $v)) {
                $r[$k] = $v + 0;
            }
        }
        return $r;
    }, $st->fetchAll());
}

function row(string $sql, array $params = []): ?array
{
    return rows($sql, $params)[0] ?? null;
}

/** ปีงบประมาณ พ.ศ. (เริ่ม 1 ต.ค.) ของวันนี้ ; ปีงบที่ครบแล้วล่าสุด = ปีนี้ - 1 */
function current_fiscal_year(): int
{
    $y = (int)date('Y');
    return $y + 543 + ((int)date('n') >= 10 ? 1 : 0);
}

/** report_config.json : settings = เกณฑ์ที่หน่วยงานกำหนด */
function app_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $cfg = json_decode((string)@file_get_contents(__DIR__ . '/report_config.json'), true) ?: [];
    }
    return $cfg;
}

function setting(string $key, $default = null)
{
    return app_config()['settings'][$key] ?? $default;
}

/** จำนวนวันทำการที่ผ่านไปจาก $from ถึง $to (ไม่นับวัน $from, ไม่นับเสาร์-อาทิตย์และวันหยุดใน settings.holidays) */
function workdays(?string $from, ?string $to): ?int
{
    if (!$from || !$to) {
        return null;
    }
    static $holidays = null;
    $holidays ??= array_flip(setting('holidays', []));
    $d = new DateTime(substr($from, 0, 10));
    $end = new DateTime(substr($to, 0, 10));
    $n = 0;
    while ($d < $end) {
        $d->modify('+1 day');
        if ((int)$d->format('N') <= 5 && !isset($holidays[$d->format('Y-m-d')])) {
            $n++;
        }
    }
    return $n;
}

/** วันที่หลังจาก $from ไป $n วันทำการ */
function add_workdays(string $from, int $n): string
{
    $holidays = array_flip(setting('holidays', []));
    $d = new DateTime($from);
    while ($n > 0) {
        $d->modify('+1 day');
        if ((int)$d->format('N') <= 5 && !isset($holidays[$d->format('Y-m-d')])) {
            $n--;
        }
    }
    return $d->format('Y-m-d');
}

function median(array $xs): ?float
{
    $xs = array_values(array_filter($xs, fn($x) => $x !== null));
    if (!$xs) {
        return null;
    }
    sort($xs);
    $m = intdiv(count($xs), 2);
    return count($xs) % 2 ? (float)$xs[$m] : ($xs[$m - 1] + $xs[$m]) / 2;
}

/**
 * ราคาซื้อ (บาท) ของครุภัณฑ์ — ระบบครุภัณฑ์ยังไม่มี purchase_price จึงจำลองให้ได้ค่าเดิมทุกครั้งจากรหัสครุภัณฑ์
 * ช่วงราคาตามหมวด (จับคู่จากต้นชื่อหมวด) และสอดคล้องกับธงต่ำกว่าเกณฑ์ 5,000 บาท ; เมื่อ warehouse มีราคาจริงให้ใช้ค่านั้นแทนฟังก์ชันนี้
 */
function mock_purchase_price(string $code, ?string $category, bool $belowThreshold): float
{
    static $range = [
        'ครุภัณฑ์คอมพิวเตอร์' => [12000, 45000],
        'ครุภัณฑ์สำนักงาน' => [5500, 25000],
        'ครุภัณฑ์ไฟฟ้าและวิทยุ' => [6000, 35000],
        'ครุภัณฑ์วิทยาศาสตร์หรือการแพทย์' => [15000, 150000],
        'ครุภัณฑ์โฆษณาและเผยแพร่' => [8000, 60000],
        'ครุภัณฑ์ยานพาหนะ' => [300000, 1500000],
        'ครุภัณฑ์โรงงาน (เครื่องจักร)' => [50000, 400000],
        'ครุภัณฑ์ก่อสร้าง (เครื่องจักร)' => [50000, 500000],
        'ครุภัณฑ์การเกษตร (เครื่องจักร)' => [30000, 300000],
        'ครุภัณฑ์ไฟฟ้า (เครื่องกำเนิดไฟฟ้า)' => [20000, 300000],
    ];
    $h = crc32($code) / 4294967295;
    if ($belowThreshold) {
        return round(1500 + $h * 3400, -2);
    }
    [$lo, $hi] = [6000, 40000];
    foreach ($range as $prefix => $r) {
        if ($category !== null && str_starts_with($category, $prefix)) {
            [$lo, $hi] = $r;
            break;
        }
    }
    return round($lo + $h * ($hi - $lo), -2);
}

/** อายุการใช้งาน (ปี) ตามหมวด จาก settings.useful_life_years (จับคู่จากต้นชื่อหมวด ไม่พบใช้ default) */
function useful_life(?string $category): int
{
    $table = setting('useful_life_years', []);
    foreach ($table as $prefix => $years) {
        if ($prefix[0] !== '_' && $prefix !== 'default' && $category !== null && str_starts_with($category, $prefix)) {
            return (int)$years;
        }
    }
    return (int)($table['default'] ?? 8);
}

/**
 * ครุภัณฑ์ทุกชิ้นที่เคยส่งซ่อม: ค่าซ่อมสะสมเทียบราคาซื้อ (จำลอง) และอายุเทียบอายุการใช้งาน
 * verdict: dispose = ค่าซ่อม >= เกณฑ์ และใช้งานเกินครึ่งอายุ (ควรทดแทน)
 *          review  = ค่าซ่อม >= เกณฑ์ แต่ยังใหม่ (ตรวจสาเหตุ/ประกันก่อนตัดสิน)
 *          watch   = ค่าซ่อมถึงเกณฑ์เฝ้าระวัง ; ok = ซ่อมต่อได้
 */
function repair_vs_price(): array
{
    $dispose = (float)setting('repair_cost_ratio_dispose', 0.5);
    $watch = (float)setting('repair_cost_ratio_watch', 0.3);
    $lifeShare = (float)setting('replace_min_life_share', 0.5);
    $snap = row("SELECT MAX(snapshot_date_key) AS k FROM fact_asset_inventory")['k'];
    $rows = rows("SELECT a.asset_code, a.asset_name, COALESCE(c.category_name, 'ไม่ระบุหมวด') AS category_name, a.asset_status,
                         COUNT(*) AS repairs, COALESCE(SUM(f.total_repair_cost), 0) AS repair_cost,
                         MAX(d.full_date) AS last_repair, MAX(inv.asset_age_years) AS age_years,
                         COALESCE(MAX(inv.is_below_threshold_flag), 0) AS below_threshold
                  FROM fact_asset_maintenance f
                  JOIN dim_asset a ON a.asset_key = f.asset_key
                  LEFT JOIN dim_asset_category c ON c.category_key = a.category_key
                  JOIN dim_date d ON d.date_key = f.repair_date_key
                  LEFT JOIN fact_asset_inventory inv ON inv.asset_key = f.asset_key AND inv.snapshot_date_key = ?
                  GROUP BY a.asset_key, a.asset_code, a.asset_name, c.category_name, a.asset_status", [$snap]);
    foreach ($rows as &$r) {
        $r['price'] = mock_purchase_price($r['asset_code'], $r['category_name'], (bool)$r['below_threshold']);
        $r['ratio'] = $r['price'] ? round($r['repair_cost'] / $r['price'], 3) : null;
        $r['life_years'] = useful_life($r['category_name']);
        $old = $r['age_years'] !== null && $r['age_years'] >= $r['life_years'] * $lifeShare;
        $r['verdict'] = $r['ratio'] >= $dispose ? ($old ? 'dispose' : 'review') : ($r['ratio'] >= $watch ? 'watch' : 'ok');
    }
    usort($rows, fn($a, $b) => $b['ratio'] <=> $a['ratio']);
    return ['thresholds' => ['dispose' => $dispose, 'watch' => $watch, 'life_share' => $lifeShare], 'assets' => $rows];
}

function today(): string
{
    return date('Y-m-d');
}

/** อาคาร ชั้น ห้อง ชื่อพื้นที่ -> ข้อความเดียว */
function place_text(array $r): string
{
    $parts = array_filter([$r['building'] ?? null, isset($r['floor']) && $r['floor'] !== null ? 'ชั้น ' . $r['floor'] : null,
                           isset($r['room']) && $r['room'] !== null ? 'ห้อง ' . $r['room'] : null, $r['area_name'] ?? null]);
    return $parts ? implode(' ', $parts) : 'ไม่ระบุสถานที่';
}

function run(callable $fn): void
{
    try {
        respond($fn());
    } catch (PDOException $e) {
        fail('อ่านข้อมูลจาก warehouse ไม่สำเร็จ: ' . $e->getMessage());
    }
}
