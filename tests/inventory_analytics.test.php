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
analyticsExpectSame(40.0, $overview['locationDetailsIncompleteRate'], 'Incomplete location rate uses the full asset denominator.');
analyticsExpectSame(2, $result['aging']['ageDistribution']['11-15'], 'Age bands must aggregate weighted counts.');
analyticsExpectSame(3, $result['aging']['ageDistribution']['3-5'], 'Age bands must aggregate weighted counts.');
analyticsExpectSame(3, $result['governance']['qualityFields']['assetCode']['missingAssets'], 'Missing-field counts must use asset_count.');
analyticsExpectSame(3, $result['governance']['qualityFields']['department']['missingAssets'], 'Missing department is a critical metadata issue.');
analyticsExpectSame(2, $result['governance']['assetsWithMissingInformation'], 'Portfolio missing-information count must count distinct fact assets once, not sum overlapping weighted field counts.');
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
$unknownMatrixCell = array_values(array_filter(
    $result['portfolio']['departmentCategoryMatrix'] ?? [],
    static fn(array $cell): bool => $cell['departmentKey'] === '__unknown__' && $cell['categoryKey'] === '__unknown__',
))[0] ?? null;
analyticsExpectSame(3, $unknownMatrixCell['assets'] ?? null, 'The complete matrix must preserve the unknown department/category cell.');
analyticsExpectSame('__missing__', $unknownMatrixCell['departmentFilterValue'] ?? null, 'Unknown matrix departments must retain their filter value.');
analyticsExpectSame('__missing__', $unknownMatrixCell['categoryFilterValue'] ?? null, 'Unknown matrix categories must retain their filter value.');

$acquisition = $result['acquisition'];
$knownYear = array_values(array_filter($acquisition['years'], static fn(array $row): bool => $row['label'] === '2015'))[0] ?? null;
$knownSource = array_values(array_filter($acquisition['sources'], static fn(array $row): bool => $row['filterValue'] === 'เงินงบประมาณ'))[0] ?? null;
analyticsExpectTrue($knownYear !== null && $knownSource !== null, 'Acquisition cohorts and funding sources should retain stable dimension keys.');
$knownYearSource = array_values(array_filter(
    $acquisition['bySource'],
    static fn(array $row): bool => $row['firstKey'] === $knownYear['key'] && $row['secondKey'] === $knownSource['key'],
))[0] ?? null;
analyticsExpectSame(2, $knownYearSource['totalAssets'] ?? null, 'The cohort heatmap should aggregate weighted assets by acquisition year and funding source.');
$knownYearDepartment = array_values(array_filter(
    $acquisition['cohortDetails']['year']['department'],
    static fn(array $row): bool => $row['cohortKey'] === $knownYear['key'] && $row['sourceKey'] === $knownSource['key'],
))[0] ?? null;
analyticsExpectSame(2, $knownYearDepartment['totalAssets'] ?? null, 'Funding-specific cohort details must use the true year/source/department intersection.');
$unknownYearSource = array_values(array_filter(
    $acquisition['bySource'],
    static fn(array $row): bool => $row['firstFilterValue'] === '__missing__' && $row['secondFilterValue'] === '__missing__',
))[0] ?? null;
analyticsExpectSame(3, $unknownYearSource['totalAssets'] ?? null, 'Missing acquisition years and funding sources must remain represented.');
analyticsExpectSame(2, count($acquisition['byFiscalSource']), 'Fiscal-year/source aggregation must use the stored fiscal-year field.');

$wideAcquisitionState = warehouseInventoryAnalyticsCreate(10);
for ($index = 1; $index <= 101; $index++) {
    warehouseInventoryAnalyticsConsume($wideAcquisitionState, [
        'asset_count' => 1,
        'asset_key' => $index,
        'asset_code' => 'WIDE-' . $index,
        'asset_name' => 'Wide acquisition test asset',
        'source' => 'Test source',
        'department_key' => $index,
        'department_name' => 'Test department ' . $index,
        'category_key' => 1,
        'category_name' => 'Test category',
        'type_key' => 1,
        'type_name' => 'Test type',
        'acquisition_year' => 2024,
        'acquisition_fiscal_year' => 2567,
        'asset_age_years' => 2,
        'is_available_flag' => 1,
        'is_damaged_flag' => 0,
        'has_location_flag' => 1,
    ]);
}
$wideAcquisition = warehouseInventoryAnalyticsFinalize($wideAcquisitionState)['acquisition'];
analyticsExpectSame(101, count($wideAcquisition['byDepartment']), 'Acquisition relationship aggregates must not truncate at the old 100-row cap.');
analyticsExpectSame(101, count($wideAcquisition['cohortDetails']['year']['department']), 'Cohort detail aggregates must retain all grouped rows for pagination.');

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

$locationState = warehouseInventoryAnalyticsCreate(10);
$locationBase = [
    'asset_key' => 501,
    'asset_code' => 'LOCATION-1',
    'asset_name' => 'Location test asset',
    'department_key' => 7,
    'department_name' => 'หน่วยงานสถานที่',
    'category_key' => 3,
    'category_name' => 'หมวดทดสอบ',
    'type_key' => 2,
    'type_name' => 'ประเภททดสอบ',
    'is_available_flag' => 1,
    'is_damaged_flag' => 0,
    'asset_age_years' => 5,
];
warehouseInventoryAnalyticsConsume($locationState, array_replace($locationBase, [
    'asset_count' => 2,
    'location_key' => 501,
    'building' => 'อาคาร A',
    'floor' => '1',
    'room' => '101',
    'area_name' => 'สำนักงาน',
    'has_location_flag' => 1,
]));
warehouseInventoryAnalyticsConsume($locationState, array_replace($locationBase, [
    'asset_count' => 3,
    'asset_key' => 502,
    'location_key' => 502,
    'building' => 'อาคาร A',
    'floor' => null,
    'room' => null,
    'area_name' => null,
    'has_location_flag' => 1,
]));
warehouseInventoryAnalyticsConsume($locationState, array_replace($locationBase, [
    'asset_count' => 5,
    'asset_key' => 503,
    'location_key' => null,
    'building' => null,
    'floor' => null,
    'room' => null,
    'area_name' => null,
    'has_location_flag' => 0,
]));
warehouseInventoryAnalyticsConsume($locationState, array_replace($locationBase, [
    'asset_count' => 7,
    'asset_key' => 504,
    'location_key' => 504,
    'building' => 'สถานะยังไม่ทราบ',
    'floor' => '2',
    'room' => '201',
    'area_name' => 'ห้องทดสอบ',
    'has_location_flag' => null,
]));
$locationResult = warehouseInventoryAnalyticsFinalize($locationState);
$locationSummary = $locationResult['overview'];
$locationCategories = [
    $locationSummary['locationDetailCompleteAssets'],
    $locationSummary['locationDetailsIncompleteAssets'],
    $locationSummary['missingLocationAssets'],
    $locationSummary['locationUnknownAssets'],
];
analyticsExpectSame($locationSummary['totalAssets'], array_sum($locationCategories), 'Location completeness categories must be mutually exclusive and exhaustive.');
analyticsExpectSame(17.6, $locationSummary['locationDetailsIncompleteRate'], 'Department and overview incomplete rates use total assets as denominator.');
$explorer = $locationResult['locations']['explorer'] ?? [];
analyticsExpectSame(5, $explorer['unassignedAssets'] ?? null, 'Unassigned assets must have a separate location-explorer state.');
analyticsExpectSame(7, $explorer['unknownStatusAssets'] ?? null, 'Unknown assignment flags must remain distinct.');
analyticsExpectSame(5, $explorer['assignedAssets'] ?? null, 'Only assets with the assigned flag enter the location hierarchy.');
analyticsExpectSame(1, count($explorer['buildings'] ?? []), 'Unassigned and unknown-flag records must not create physical building entries.');
analyticsExpectSame('อาคาร A', $explorer['buildings'][0]['label'] ?? null, 'Assigned hierarchy retains its actual building label.');
analyticsExpectSame(2, count($explorer['buildings'][0]['floors'] ?? []), 'Assigned assets with incomplete floor details remain visible as an unspecified floor group.');
analyticsExpectSame(
    ['building' => 'อาคาร A'],
    $explorer['buildings'][0]['drillFilters'] ?? null,
    'Building drill-down must include only the selected physical building.',
);
$missingFloor = array_values(array_filter(
    $explorer['buildings'][0]['floors'] ?? [],
    static fn(array $floor): bool => $floor['label'] === 'ไม่ระบุชั้น',
))[0] ?? null;
analyticsExpectSame(
    ['building' => 'อาคาร A', 'floor' => '__missing__'],
    $missingFloor['drillFilters'] ?? null,
    'An assigned record with an unspecified floor must retain its exact filter path.',
);
analyticsExpectSame(1, $locationResult['departments']['rows'][0]['representedFloors'] ?? null, 'Only known building/floor pairs count as represented floors.');

$wideLocationState = warehouseInventoryAnalyticsCreate(10);
for ($index = 1; $index <= 101; $index += 1) {
    warehouseInventoryAnalyticsConsume($wideLocationState, array_replace($locationBase, [
        'asset_count' => 1,
        'asset_key' => 600 + $index,
        'asset_code' => 'LOCATION-WIDE-' . $index,
        'category_key' => $index,
        'category_name' => 'หมวด ' . $index,
        'location_key' => 600 + $index,
        'building' => 'อาคาร ' . $index,
        'floor' => '1',
        'room' => '1',
        'area_name' => 'พื้นที่',
        'has_location_flag' => 1,
    ]));
}
$wideLocationResult = warehouseInventoryAnalyticsFinalize($wideLocationState);
analyticsExpectSame(100, count($wideLocationResult['locations']['categoryBuilding']), 'The legacy category/building payload retains its existing cap.');
analyticsExpectSame(101, count($wideLocationResult['locations']['categoryBuildingAll'] ?? []), 'The expanded location detail exposes every category/building combination.');

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

$agingStatusState = warehouseInventoryAnalyticsCreate(10);
$agingStatusBase = [
    'asset_key' => 901,
    'asset_code' => 'AGING-STATUS',
    'asset_name' => 'Threshold status test',
    'department_key' => 94,
    'department_name' => 'หน่วยงานวิเคราะห์อายุ',
    'category_key' => 93,
    'category_name' => 'หมวดวิเคราะห์อายุ',
    'type_key' => 92,
    'type_name' => 'ประเภทวิเคราะห์อายุ',
    'is_available_flag' => 1,
    'is_damaged_flag' => 0,
    'has_location_flag' => 1,
    'building' => 'อาคารทดสอบ',
    'floor' => '1',
    'room' => '101',
    'area_name' => 'พื้นที่ทดสอบ',
];
foreach ([
    ['asset_count' => 2, 'asset_age_years' => 11, 'is_available_flag' => 1, 'is_damaged_flag' => 0],
    ['asset_count' => 3, 'asset_age_years' => 14, 'is_available_flag' => 0, 'is_damaged_flag' => 1],
    ['asset_count' => 1, 'asset_age_years' => 11, 'is_available_flag' => null, 'is_damaged_flag' => null],
    ['asset_count' => 4, 'asset_age_years' => 10, 'is_available_flag' => 1, 'is_damaged_flag' => 0],
    ['asset_count' => 2, 'asset_age_years' => null, 'is_available_flag' => 0, 'is_damaged_flag' => 1],
] as $index => $agingRow) {
    warehouseInventoryAnalyticsConsume($agingStatusState, array_replace($agingStatusBase, $agingRow, [
        'asset_key' => 901 + $index,
        'asset_code' => 'AGING-STATUS-' . $index,
    ]));
}
$agingStatusResult = warehouseInventoryAnalyticsFinalize($agingStatusState);
$agingOverview = $agingStatusResult['overview'];
analyticsExpectSame(6, $agingOverview['assetsOlderThanThreshold'], 'Threshold analytics must use strict greater-than for the selected threshold.');
analyticsExpectSame(60.0, $agingOverview['oldAssetRate'], 'Threshold exposure keeps the known-age denominator.');
analyticsExpectSame(2, $agingOverview['oldAndAvailableAssets'], 'Above-threshold available counts use the selected threshold exactly.');
analyticsExpectSame(3, $agingOverview['oldAndUnavailableAssets'], 'Above-threshold unavailable counts use the selected threshold exactly.');
analyticsExpectSame(1, $agingOverview['oldAndAvailabilityUnknownAssets'], 'Unknown availability remains distinct for above-threshold assets.');
analyticsExpectSame(3, $agingOverview['oldAndDamagedAssets'], 'Above-threshold damaged counts remain distinct from availability.');
analyticsExpectSame(2, $agingOverview['oldAndNotDamagedAssets'], 'Above-threshold not-damaged counts preserve known false flags.');
analyticsExpectSame(1, $agingOverview['oldAndDamageUnknownAssets'], 'Unknown damage status remains distinct for above-threshold assets.');
$agingDepartment = $agingStatusResult['departments']['rows'][0];
analyticsExpectSame(2, $agingDepartment['assetsWithKnownAge'] === 10 ? $agingDepartment['totalAssets'] - $agingDepartment['assetsWithKnownAge'] : -1, 'Department unknown-age count can be derived without treating missing age as zero.');
analyticsExpectSame(2, $agingDepartment['oldAndAvailableAssets'], 'Department focus receives threshold-specific available counts.');
analyticsExpectSame('94', array_values(array_filter(
    $agingStatusResult['aging']['byDepartment'],
    static fn(array $row): bool => $row['dimension'] === 'หน่วยงานวิเคราะห์อายุ',
))[0]['dimensionKey'] ?? null, 'Age-band rows expose stable dimension keys for complete matrix joins.');

$wideMatrixState = warehouseInventoryAnalyticsCreate(10);
for ($index = 1; $index <= 101; $index += 1) {
    warehouseInventoryAnalyticsConsume($wideMatrixState, [
        'asset_count' => 1,
        'asset_key' => $index,
        'asset_code' => 'MATRIX-' . $index,
        'asset_name' => 'Matrix test asset',
        'department_key' => $index,
        'department_name' => 'Department ' . $index,
        'category_key' => 3,
        'category_name' => 'Test category',
        'type_key' => 2,
        'type_name' => 'Test type',
        'is_available_flag' => 1,
        'is_damaged_flag' => 0,
        'has_location_flag' => 1,
    ]);
}
$wideMatrixResult = warehouseInventoryAnalyticsFinalize($wideMatrixState);
analyticsExpectSame(100, count($wideMatrixResult['portfolio']['departmentCategory']), 'The legacy combo list keeps its existing response cap.');
analyticsExpectSame(101, count($wideMatrixResult['portfolio']['departmentCategoryMatrix']), 'The composition matrix must include combinations beyond the legacy cap.');
analyticsExpectSame(1, $wideMatrixResult['portfolio']['departmentCategoryMatrix'][100]['assets'], 'Complete matrix cells must retain canonical asset counts.');

$wideReviewState = warehouseInventoryAnalyticsCreate(10);
for ($index = 1; $index <= 12; $index += 1) {
    warehouseInventoryAnalyticsConsume($wideReviewState, [
        'asset_count' => 1,
        'asset_key' => 5000 + $index,
        'asset_id' => 5000 + $index,
        'asset_code' => sprintf('REVIEW-%02d', $index),
        'asset_name' => sprintf('Review item %02d', $index),
        'brand' => 'Test brand',
        'model' => 'Test model',
        'year_purchase' => '2022',
        'year_fiscal' => '2565',
        'source' => 'Test source',
        'asset_status' => 'ชำรุด',
        'department_key' => 9,
        'department_name' => 'Review department',
        'category_key' => 3,
        'category_name' => 'Review category',
        'type_key' => 2,
        'type_name' => 'Review type',
        'location_key' => 1,
        'building' => 'Building 1',
        'floor' => '1',
        'room' => '101',
        'area_name' => 'Area',
        'asset_age_years' => 5,
        'is_available_flag' => 1,
        'is_damaged_flag' => 1,
        'has_location_flag' => 1,
    ]);
}
$wideReviewResult = warehouseInventoryAnalyticsFinalize($wideReviewState, ['page' => 2, 'pageSize' => 5]);
analyticsExpectSame(12, $wideReviewResult['governance']['exceptionsTotal'], 'Review total must include all records beyond the legacy cap.');
analyticsExpectSame(5, count($wideReviewResult['governance']['exceptions']), 'A paged governance request should return only the requested rows.');
analyticsExpectSame(3, $wideReviewResult['governance']['exceptionsPage']['totalPages'], 'Review pagination metadata should use the full matching total.');
analyticsExpectSame('REVIEW-06', $wideReviewResult['governance']['exceptions'][0]['assetCode'], 'Review priority ordering must remain deterministic across pages.');
analyticsExpectSame(['ชำรุด'], $wideReviewResult['governance']['exceptions'][0]['attentionReasons'], 'Review rows should preserve each existing reason as an accessible list.');

$duplicateAssetState = warehouseInventoryAnalyticsCreate(10);
$duplicateAsset = [
    'asset_count' => 1,
    'asset_key' => 7001,
    'asset_id' => 7001,
    'asset_code' => null,
    'asset_name' => 'Repeated join row',
    'is_available_flag' => 1,
    'is_damaged_flag' => 0,
    'has_location_flag' => 1,
];
warehouseInventoryAnalyticsConsume($duplicateAssetState, $duplicateAsset);
warehouseInventoryAnalyticsConsume($duplicateAssetState, array_replace($duplicateAsset, ['asset_code' => 'NOW-PRESENT']));
$duplicateAssetResult = warehouseInventoryAnalyticsFinalize($duplicateAssetState);
analyticsExpectSame(1, $duplicateAssetResult['overview']['totalAssets'], 'Repeated dimension join rows must not duplicate fact totals.');
analyticsExpectSame(1, $duplicateAssetResult['governance']['assetsWithMissingInformation'], 'Missing-information summary must count a fact asset once after duplicate joins.');
analyticsExpectSame(1, $duplicateAssetResult['governance']['exceptionsTotal'], 'Review totals must count a fact asset once after duplicate joins.');

$empty = warehouseInventoryAnalyticsFinalize(warehouseInventoryAnalyticsCreate(10));
analyticsExpectSame(0, $empty['overview']['totalAssets'], 'Empty filtered sets must have a zero total.');
analyticsExpectSame(null, $empty['overview']['availabilityRate'], 'Rates must be null when the denominator is zero.');
analyticsExpectSame(null, $empty['overview']['averageAssetAge'], 'Average age must be null when no age values exist.');

echo "Passed inventory analytics aggregation tests.\n";
