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
    $filters = warehouseInventoryParseFilters([]);
    expectSame('', $filters['search'], 'Search should be empty by default.');
    foreach ([
        'status', 'type', 'department', 'category', 'building', 'source',
        'acquisitionYear', 'fiscalYear', 'ageBand', 'availability', 'damage',
        'locationStatus',
        'room', 'floor', 'area', 'acquisitionFiscalYear',
    ] as $name) {
        expectSame('all', $filters[$name], "{$name} should not restrict the inventory by default.");
    }
    expectSame('latest', $filters['snapshot'], 'The latest snapshot should be selected by default.');
    expectSame(10, $filters['ageThreshold'], 'The default analysis threshold should be ten years.');
});

runTest('trims query values while retaining Thai text', static function (): void {
    $filters = warehouseInventoryParseFilters([
        'q' => '  เครื่องมือ  ',
        'status' => ' พร้อมใช้งาน ',
    ]);
    expectSame('เครื่องมือ', $filters['search'], 'Search should be trimmed without altering Thai text.');
    expectSame('พร้อมใช้งาน', $filters['status'], 'Status should be trimmed without altering Thai text.');
    expectSame('all', $filters['type'], 'Unselected type should remain unrestricted.');
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

runTest('validates executive filters and age thresholds', static function (): void {
    $filters = warehouseInventoryParseFilters([
        'department' => 'ภาควิชาวิศวกรรมคอมพิวเตอร์',
        'category' => 'ครุภัณฑ์สำนักงาน',
        'building' => 'อาคาร 8',
        'source' => 'เงินงบประมาณ',
        'acquisitionYear' => '2024',
        'fiscalYear' => '2567',
        'acquisitionFiscalYear' => '2568',
        'room' => '8302',
        'floor' => '3',
        'area' => 'Server room',
        'ageBand' => '11-15',
        'availability' => 'unavailable',
        'damage' => 'damaged',
        'locationStatus' => 'incomplete',
        'snapshot' => '20261022',
        'ageThreshold' => '15',
    ]);

    expectSame('ภาควิชาวิศวกรรมคอมพิวเตอร์', $filters['department'], 'Thai department values should be retained.');
    expectSame('11-15', $filters['ageBand'], 'Supported age bands should be retained.');
    expectSame('8302', $filters['room'], 'Room filters should be retained.');
    expectSame('3', $filters['floor'], 'Floor filters should be retained.');
    expectSame('Server room', $filters['area'], 'Area filters should be retained.');
    expectSame('2567', $filters['fiscalYear'], 'Asset fiscal-year filters should use the asset dimension.');
    expectSame('2568', $filters['acquisitionFiscalYear'], 'Acquisition fiscal-year filters should remain distinct.');
    expectSame(15, $filters['ageThreshold'], 'Configured age thresholds should be parsed as integers.');

    expectInvalidArgument(
        static fn() => warehouseInventoryParseFilters(['ageBand' => 'future']),
        'Unknown age bands must be rejected.',
    );
    expectInvalidArgument(
        static fn() => warehouseInventoryParseFilters(['availability' => 'sometimes']),
        'Unknown availability states must be rejected.',
    );
    expectInvalidArgument(
        static fn() => warehouseInventoryParseFilters(['snapshot' => 'latest; DROP TABLE']),
        'Snapshot keys must not accept arbitrary query text.',
    );
    expectInvalidArgument(
        static fn() => warehouseInventoryParseFilters(['ageThreshold' => '0']),
        'Age thresholds below one year must be rejected.',
    );
    expectInvalidArgument(
        static fn() => warehouseInventoryParseFilters(['ageThreshold' => '51']),
        'Age thresholds above fifty years must be rejected.',
    );
});

runTest('accepts stable snapshot IDs while retaining date-based snapshot filters', static function (): void {
    $snapshotId = 'id:8d3b8504-c8f8-4e3a-a450-84776d8a121f';
    expectSame($snapshotId, warehouseInventoryParseFilters(['snapshot' => $snapshotId])['snapshot'], 'UUID snapshot selections should be preserved.');
    expectSame('20261025', warehouseInventoryParseFilters(['snapshot' => '20261025'])['snapshot'], 'Legacy date-based snapshot selections should remain valid.');
    expectInvalidArgument(
        static fn() => warehouseInventoryParseFilters(['snapshot' => 'id:not-a-uuid']),
        'Malformed snapshot IDs must be rejected.',
    );
});

runTest('builds dimension and flag filters with bound values', static function (): void {
    $filters = warehouseInventoryParseFilters([
        'department' => "Unit'; DROP TABLE dim_department;--",
        'category' => 'ครุภัณฑ์สำนักงาน',
        'building' => 'อาคาร 8',
        'source' => 'เงินงบประมาณ',
        'acquisitionYear' => '2024',
        'fiscalYear' => '2567',
        'acquisitionFiscalYear' => '2568',
        'room' => '8302',
        'floor' => '3',
        'area' => "Lab'; DROP TABLE dim_location;--",
        'ageBand' => '11-15',
        'availability' => 'unavailable',
        'damage' => 'damaged',
        'locationStatus' => 'incomplete',
    ]);
    $where = warehouseInventoryBuildWhere($filters, 20261022);

    expectTrue(str_contains($where['sql'], 'department.`department_name` = :filter_department'), 'Department should use its dimension name.');
    expectTrue(str_contains($where['sql'], 'asset_category.`category_name` = :filter_category'), 'Category should use its dimension name.');
    expectTrue(str_contains($where['sql'], 'acquisition_date.`year` = :filter_acquisition_year'), 'Acquisition year should use the acquisition date dimension.');
    expectTrue(str_contains($where['sql'], 'da.`year_fiscal` = :filter_fiscal_year'), 'Asset fiscal year should use the asset dimension.');
    expectTrue(str_contains($where['sql'], 'acquisition_date.`fiscal_year` = :filter_acquisition_fiscal_year'), 'Acquisition fiscal year should use the date dimension.');
    expectTrue(str_contains($where['sql'], 'location.`room` = :filter_room'), 'Room should be available as an inventory filter.');
    expectTrue(str_contains($where['sql'], 'location.`floor` = :filter_floor'), 'Floor should be available as an inventory filter.');
    expectTrue(str_contains($where['sql'], 'location.`area_name` = :filter_area'), 'Area should be available as an inventory filter.');
    expectTrue(str_contains($where['sql'], 'fai.`asset_age_years` BETWEEN 11 AND 15'), 'Age bands should map to fixed SQL.');
    expectTrue(str_contains($where['sql'], 'fai.`is_available_flag` = 0'), 'Unavailable means the availability flag is zero.');
    expectTrue(str_contains($where['sql'], 'fai.`is_damaged_flag` = 1'), 'Damaged means the damage flag is one.');
    expectTrue(str_contains($where['sql'], 'location.`area_name`'), 'Location detail completeness must include the area.');
    expectSame("Unit'; DROP TABLE dim_department;--", $where['params']['filter_department'], 'Dimension values must remain bound data.');
    expectSame('8302', $where['params']['filter_room'], 'Room values must remain bound data.');
    expectSame('3', $where['params']['filter_floor'], 'Floor values must remain bound data.');
    expectSame("Lab'; DROP TABLE dim_location;--", $where['params']['filter_area'], 'Area values must remain bound data.');
    expectSame('2567', $where['params']['filter_fiscal_year'], 'Asset fiscal years must remain bound data.');
    expectSame('2568', $where['params']['filter_acquisition_fiscal_year'], 'Acquisition fiscal years must remain bound data.');
    expectTrue(!str_contains($where['sql'], 'DROP TABLE'), 'User values must never be concatenated into SQL.');
});

runTest('filters inventory by snapshot ID instead of combining same-day snapshots', static function (): void {
    $snapshotId = '8d3b8504-c8f8-4e3a-a450-84776d8a121f';
    $where = warehouseInventoryBuildWhere(warehouseInventoryParseFilters([]), null, $snapshotId);
    expectTrue(str_contains($where['sql'], 'fai.`snapshot_id` = :snapshot_id'), 'A selected snapshot must constrain facts by snapshot identity.');
    expectTrue(!str_contains($where['sql'], 'snapshot_date_key'), 'Snapshot ID filtering must not include every snapshot on the same date.');
    expectSame($snapshotId, $where['params']['snapshot_id'], 'Snapshot identity must remain a bound value.');
});

runTest('filters missing dimension values explicitly without binding sentinels', static function (): void {
    $filters = warehouseInventoryParseFilters([
        'department' => '__missing__',
        'category' => '__missing__',
        'building' => '__missing__',
        'source' => '__missing__',
        'status' => '__missing__',
        'type' => '__missing__',
        'acquisitionYear' => '__missing__',
        'fiscalYear' => '__missing__',
        'acquisitionFiscalYear' => '__missing__',
        'room' => '__missing__',
        'floor' => '__missing__',
        'area' => '__missing__',
    ]);
    $where = warehouseInventoryBuildWhere($filters, 20261022);

    foreach ([
        'department.`department_name` IS NULL',
        'asset_category.`category_name` IS NULL',
        'location.`building` IS NULL',
        'da.`source` IS NULL',
        'da.`asset_status` IS NULL',
        'asset_type.`type_name` IS NULL',
        'acquisition_date.`year` IS NULL',
        'da.`year_fiscal` IS NULL',
        'acquisition_date.`fiscal_year` IS NULL',
        'location.`room` IS NULL',
        'location.`floor` IS NULL',
        'location.`area_name` IS NULL',
    ] as $condition) {
        expectTrue(str_contains($where['sql'], $condition), "Missing-value filter should include {$condition}.");
    }
    expectSame(['snapshot_date_key' => 20261022], $where['params'], 'Missing sentinels must not be interpolated as bound dimension values.');
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
