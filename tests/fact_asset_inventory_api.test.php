<?php
declare(strict_types=1);

require_once __DIR__ . '/../assets_api/inventory_query.php';

$testCount = 0;

function expectSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . '\nExpected: ' . var_export($expected, true) . '\nActual: ' . var_export($actual, true));
    }
}

function expectTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function expectInvalidArgument(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException) {
        return;
    }

    throw new RuntimeException($message);
}

function runTest(string $name, callable $callback): void
{
    global $testCount;
    $callback();
    $testCount++;
    echo "✔ {$name}\n";
}

runTest('uses empty search and all filters by default', static function (): void {
    expectSame(
        ['search' => '', 'status' => 'all', 'type' => 'all'],
        warehouseInventoryParseFilters([]),
        'Default filters should not restrict the inventory.',
    );
});

runTest('trims query values while retaining Thai text', static function (): void {
    expectSame(
        ['search' => 'เครื่องมือ', 'status' => 'พร้อมใช้งาน', 'type' => 'all'],
        warehouseInventoryParseFilters([
            'q' => '  เครื่องมือ  ',
            'status' => ' พร้อมใช้งาน ',
        ]),
        'Filter parsing should trim values without altering Thai text.',
    );
});

runTest('rejects array, oversized, and invalid UTF-8 filter values', static function (): void {
    expectInvalidArgument(
        static fn() => warehouseInventoryParseFilters(['q' => ['unexpected']]),
        'Array query values must be rejected.',
    );
    expectInvalidArgument(
        static fn() => warehouseInventoryParseFilters(['q' => str_repeat('x', 201)]),
        'Search terms longer than 200 characters must be rejected.',
    );
    expectInvalidArgument(
        static fn() => warehouseInventoryParseFilters(['status' => str_repeat('x', 101)]),
        'Filter values longer than 100 characters must be rejected.',
    );
    expectInvalidArgument(
        static fn() => warehouseInventoryParseFilters(['q' => "\xFF"]),
        'Invalid UTF-8 must be rejected.',
    );
});

runTest('uses fixed search columns and bound parameters for filters', static function (): void {
    $filters = warehouseInventoryParseFilters([
        'q' => "A_%!'; DROP TABLE fact_asset_inventory;--",
        'status' => 'พร้อมใช้งาน',
        'type' => "' OR 1=1 --",
    ]);
    $where = warehouseInventoryBuildWhere($filters, 20261022);

    expectTrue(str_contains($where['sql'], 'ESCAPE'), 'Search must treat wildcard characters literally.');
    expectTrue(!str_contains($where['sql'], 'DROP TABLE'), 'User input must never be concatenated into SQL.');
    expectSame(20261022, $where['params']['snapshot_date_key'], 'Snapshot key should be bound as data.');
    expectSame("' OR 1=1 --", $where['params']['filter_type'], 'Type filters should remain bound values.');
    expectSame('พร้อมใช้งาน', $where['params']['filter_status'], 'Status filters should remain bound values.');
    expectSame(
        "%A!_!%!!'; DROP TABLE fact!_asset!_inventory;--%",
        $where['params']['search_0'],
        'LIKE wildcards and the escape marker must be escaped in the bound search value.',
    );
});

runTest('neutralizes CSV formulas and leaves normal Thai values intact', static function (): void {
    expectSame("'=1+1", warehouseInventorySanitizeCsvValue('=1+1'), 'Equals formulas must be neutralized.');
    expectSame("'\t@SUM(A1:A2)", warehouseInventorySanitizeCsvValue("\t@SUM(A1:A2)"), 'Whitespace-prefixed formulas must be neutralized.');
    expectSame('ชื่อสินทรัพย์', warehouseInventorySanitizeCsvValue('ชื่อสินทรัพย์'), 'Normal Thai values should be unchanged.');
    expectSame('', warehouseInventorySanitizeCsvValue(null), 'Null values should export as empty cells.');
});

runTest('writes escaped CSV cells with Thai content and formula protection', static function (): void {
    $stream = fopen('php://temp', 'w+b');
    expectTrue(is_resource($stream), 'A temporary stream should be available.');

    warehouseInventoryWriteCsvRow($stream, ['ชื่อสินทรัพย์', '=SUM(1,2)', 'ข้อความ "อ้างอิง"']);
    rewind($stream);
    $csvRow = stream_get_contents($stream);
    fclose($stream);

    expectSame("ชื่อสินทรัพย์,\"'=SUM(1,2)\",\"ข้อความ \"\"อ้างอิง\"\"\"\n", $csvRow, 'CSV cells should be quoted as needed and formula-safe.');
});

runTest('exports the established Thai inventory column headings and field order', static function (): void {
    expectSame(
        ['รหัสสินทรัพย์', 'ชื่อสินทรัพย์', 'ประเภท', 'ยี่ห้อ', 'สถานะ', 'ปีที่จัดซื้อ', 'หน่วยงาน', 'รหัสสถานที่', 'วันที่ข้อมูล'],
        warehouseInventoryCsvHeadings(),
        'All-match exports should keep the existing Thai CSV headings.',
    );
    expectSame(
        ['CPE-1', 'โต๊ะ', 'ครุภัณฑ์สำนักงาน', 'ยี่ห้อ', 'พร้อมใช้งาน', 2568, 'ภาควิชา', 4, '2026-10-22'],
        warehouseInventoryCsvRow([
            'asset_code' => 'CPE-1',
            'asset_name' => 'โต๊ะ',
            'type_name' => 'ครุภัณฑ์สำนักงาน',
            'brand' => 'ยี่ห้อ',
            'asset_status' => 'พร้อมใช้งาน',
            'year_purchase' => 2568,
            'department_name' => 'ภาควิชา',
            'location_id' => 4,
            'snapshot_date' => '2026-10-22',
        ]),
        'All-match export fields should stay aligned with current-page CSV exports.',
    );
});

echo "Passed {$testCount} PHP API regression tests.\n";
