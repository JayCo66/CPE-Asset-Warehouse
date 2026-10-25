<?php
declare(strict_types=1);

require_once __DIR__ . '/../assets_api/inventory_analytics.php';

function analyticsExpectSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . '\nExpected: ' . var_export($expected, true) . '\nActual: ' . var_export($actual, true));
    }
}

function analyticsExpectTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$state = warehouseInventoryAnalyticsCreate(10);
warehouseInventoryAnalyticsConsume($state, [
    'asset_count' => 2,
    'asset_key' => 1,
    'asset_code' => 'CPE-1',
    'asset_name' => 'เครื่องมือทดสอบ',
    'brand' => 'ยี่ห้อ',
    'model' => 'รุ่น',
    'year_purchase' => '2015',
    'year_fiscal' => '2558',
    'source' => 'เงินงบประมาณ',
    'asset_status' => 'พร้อมใช้งาน',
    'department_key' => 7,
    'department_name' => 'หน่วยงานทดสอบ',
    'category_key' => 3,
    'category_name' => 'หมวดทดสอบ',
    'type_key' => 2,
    'type_name' => 'ประเภททดสอบ',
    'location_key' => 1,
    'building' => 'อาคาร 8',
    'floor' => '3',
    'room' => '8302',
    'area_name' => null,
    'acquisition_year' => 2015,
    'acquisition_fiscal_year' => 2558,
    'asset_age_years' => 11,
    'is_available_flag' => 0,
    'is_damaged_flag' => 1,
    'has_location_flag' => 1,
]);
warehouseInventoryAnalyticsConsume($state, [
    'asset_count' => 3,
    'asset_key' => 2,
    'asset_code' => null,
    'asset_name' => 'รายการไม่มีรหัส',
    'brand' => null,
    'model' => null,
    'year_purchase' => null,
    'year_fiscal' => null,
    'source' => null,
    'asset_status' => null,
    'department_key' => null,
    'department_name' => null,
    'category_key' => null,
    'category_name' => null,
    'type_key' => null,
    'type_name' => null,
    'location_key' => null,
    'building' => null,
    'floor' => null,
    'room' => null,
    'area_name' => null,
    'acquisition_year' => null,
    'acquisition_fiscal_year' => null,
    'asset_age_years' => 5,
    'is_available_flag' => 1,
    'is_damaged_flag' => 0,
    'has_location_flag' => 0,
]);

$result = warehouseInventoryAnalyticsFinalize($state);
$overview = $result['overview'];
analyticsExpectSame(5, $overview['totalAssets'], 'Asset totals must sum asset_count.');
analyticsExpectSame(3, $overview['availableAssets'], 'Available assets must sum asset_count for flag one.');
analyticsExpectSame(2, $overview['unavailableAssets'], 'Unavailable assets must sum asset_count for flag zero.');
analyticsExpectSame(60.0, $overview['availabilityRate'], 'Availability rate must use the canonical asset total.');
analyticsExpectSame(2, $overview['damagedAssets'], 'Damaged assets must remain distinct from unavailable assets.');
analyticsExpectSame(3, $overview['missingLocationAssets'], 'Missing location must use the location flag.');
analyticsExpectSame(2, $overview['assetsOlderThanThreshold'], 'The configurable age rule uses a strict greater-than boundary.');
analyticsExpectSame(7.4, $overview['averageAssetAge'], 'Average age must be weighted by asset_count.');
analyticsExpectSame(0, $overview['locationDetailCompleteAssets'], 'Assigned locations with missing detail are not complete.');
analyticsExpectSame(2, $overview['locationDetailsIncompleteAssets'], 'Incomplete location detail is distinct from unassigned location.');
analyticsExpectSame(2, $result['aging']['ageDistribution']['11-15'], 'Age bands must aggregate weighted counts.');
analyticsExpectSame(3, $result['aging']['ageDistribution']['3-5'], 'Age bands must aggregate weighted counts.');
analyticsExpectSame(3, $result['governance']['qualityFields']['assetCode']['missingAssets'], 'Missing-field counts must use asset_count.');
analyticsExpectSame(3, $result['governance']['qualityFields']['department']['missingAssets'], 'Missing department is a critical metadata issue.');
analyticsExpectTrue($result['governance']['exceptionsTotal'] > 0, 'Management exceptions should be returned when rows need attention.');
$unknownStatus = array_values(array_filter(
    $result['overview']['statusDistribution'],
    static fn(array $status): bool => $status['label'] === 'ไม่ระบุสถานะ',
))[0] ?? null;
analyticsExpectSame('__missing__', $unknownStatus['key'] ?? null, 'Missing statuses should be distinguishable for working chart drill-down.');
$unknownDimensionCombo = array_values(array_filter(
    $result['portfolio']['departmentCategory'],
    static fn(array $combo): bool => $combo['first'] === 'ไม่ระบุหน่วยงาน' && $combo['second'] === 'ไม่ระบุหมวดหมู่',
))[0] ?? null;
analyticsExpectSame('__missing__', $unknownDimensionCombo['firstFilterValue'] ?? null, 'Unknown department combinations should retain a safe missing-value filter.');
analyticsExpectSame('__missing__', $unknownDimensionCombo['secondFilterValue'] ?? null, 'Unknown category combinations should retain a safe missing-value filter.');

$missingNameState = warehouseInventoryAnalyticsCreate(10);
$missingNameRow = [
    'asset_count' => 2,
    'asset_key' => 101,
    'asset_code' => 'MISSING-NAME-1',
    'asset_name' => 'Test item one',
    'asset_status' => 'Ready',
    'department_key' => 71,
    'department_name' => null,
    'category_key' => 81,
    'category_name' => ' ',
    'type_key' => 91,
    'type_name' => null,
    'location_key' => null,
    'building' => null,
    'floor' => null,
    'room' => null,
    'area_name' => null,
    'acquisition_year' => null,
    'acquisition_fiscal_year' => null,
    'asset_age_years' => 4,
    'is_available_flag' => 1,
    'is_damaged_flag' => 0,
    'has_location_flag' => 0,
];
warehouseInventoryAnalyticsConsume($missingNameState, $missingNameRow);
warehouseInventoryAnalyticsConsume($missingNameState, array_replace($missingNameRow, [
    'asset_count' => 3,
    'asset_key' => 102,
    'asset_code' => 'MISSING-NAME-2',
    'department_key' => 72,
    'category_key' => 82,
    'type_key' => 92,
    'department_name' => '',
    'category_name' => null,
    'type_name' => ' ',
]));
$missingNameResult = warehouseInventoryAnalyticsFinalize($missingNameState);
analyticsExpectSame(1, count($missingNameResult['departments']['rows']), 'Departments with missing names should merge into one unknown group.');
analyticsExpectSame('__missing__', $missingNameResult['departments']['rows'][0]['filterValue'], 'A missing department name should drill down using the missing-value filter.');
analyticsExpectSame(5, $missingNameResult['departments']['rows'][0]['totalAssets'], 'Unknown department groups should preserve weighted asset counts.');
analyticsExpectSame(1, count($missingNameResult['portfolio']['categories']), 'Categories with missing names should merge into one unknown group.');
analyticsExpectSame('__missing__', $missingNameResult['portfolio']['categories'][0]['filterValue'], 'A missing category name should drill down using the missing-value filter.');
analyticsExpectSame(1, count($missingNameResult['portfolio']['types']), 'Types with missing names should merge into one unknown group.');
analyticsExpectSame('__missing__', $missingNameResult['portfolio']['types'][0]['filterValue'], 'A missing type name should drill down using the missing-value filter.');
$missingNameCombo = $missingNameResult['portfolio']['departmentCategory'][0] ?? [];
analyticsExpectSame('__missing__', $missingNameCombo['firstFilterValue'] ?? null, 'Unknown-name department/category combinations should keep the missing department filter.');
analyticsExpectSame('__missing__', $missingNameCombo['secondFilterValue'] ?? null, 'Unknown-name department/category combinations should keep the missing category filter.');

$roomDrillState = warehouseInventoryAnalyticsCreate(10);
warehouseInventoryAnalyticsConsume($roomDrillState, [
    'asset_count' => 2,
    'asset_key' => 201,
    'asset_code' => 'ROOM-DRILL-1',
    'asset_name' => 'Room drill item',
    'department_key' => 7,
    'department_name' => 'Test department',
    'category_key' => 3,
    'category_name' => 'Test category',
    'type_key' => 2,
    'type_name' => 'Test type',
    'location_key' => 41,
    'building' => 'Building 8',
    'floor' => '3',
    'room' => null,
    'area_name' => 'Server room',
    'asset_age_years' => 4,
    'is_available_flag' => 1,
    'is_damaged_flag' => 0,
    'has_location_flag' => 1,
]);
$roomDrillResult = warehouseInventoryAnalyticsFinalize($roomDrillState);
analyticsExpectSame(
    ['building' => 'Building 8', 'floor' => '3', 'room' => '__missing__', 'area' => 'Server room'],
    $roomDrillResult['locations']['room'][0]['drillFilters'] ?? null,
    'Room chart drill-downs must preserve the full location path, including missing values.',
);

$negativeWeightState = warehouseInventoryAnalyticsCreate(10);
warehouseInventoryAnalyticsConsume($negativeWeightState, [
    'asset_count' => -2,
    'asset_key' => 301,
    'asset_code' => 'NEGATIVE-COUNT',
    'asset_name' => 'Negative-count row',
    'department_key' => 7,
    'department_name' => 'Test department',
    'category_key' => 3,
    'category_name' => 'Test category',
    'type_key' => 2,
    'type_name' => 'Test type',
    'is_available_flag' => 1,
    'is_damaged_flag' => 0,
    'has_location_flag' => 0,
]);
$negativeWeightResult = warehouseInventoryAnalyticsFinalize($negativeWeightState);
analyticsExpectSame(-2, $negativeWeightResult['overview']['totalAssets'], 'Analytics totals must match SUM(asset_count), including signed source values.');
analyticsExpectSame(-2, $negativeWeightResult['overview']['availableAssets'], 'Flag numerators must use the same canonical signed asset_count weight.');

$empty = warehouseInventoryAnalyticsFinalize(warehouseInventoryAnalyticsCreate(10));
analyticsExpectSame(0, $empty['overview']['totalAssets'], 'Empty filtered sets must have a zero total.');
analyticsExpectSame(null, $empty['overview']['availabilityRate'], 'Rates must be null when the denominator is zero.');
analyticsExpectSame(null, $empty['overview']['averageAssetAge'], 'Average age must be null when no age values exist.');

echo "Passed inventory analytics aggregation tests.\n";
