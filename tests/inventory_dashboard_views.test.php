<?php
declare(strict_types=1);

require_once __DIR__ . '/../assets_api/inventory_dashboard_views.php';
require_once __DIR__ . '/../assets_api/inventory_acquisition_details.php';
require_once __DIR__ . '/../assets_api/inventory_analytics.php';

function dashboardViewExpectSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . '\nExpected: ' . var_export($expected, true) . '\nActual: ' . var_export($actual, true));
    }
}

function dashboardViewExpectThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException) {
        return;
    }
    throw new RuntimeException($message);
}

$analytics = [
    'overview' => ['totalAssets' => 12, 'availabilityRate' => 75.0, 'disposalEstimate' => ['assets' => 2]],
    'portfolio' => ['categories' => [['label' => 'Laptop']], 'departmentCategoryMatrix' => [['assets' => 12]]],
    'departments' => ['rows' => [['label' => 'Engineering']], 'extraDetail' => ['large' => str_repeat('x', 1000)]],
    'locations' => ['building' => [['label' => 'Building 1']]],
    'aging' => ['ageDistribution' => ['0-2' => 5], 'byDepartment' => [['label' => 'Engineering']]],
    'acquisition' => ['years' => [['label' => '2026']], 'cohortDetails' => ['year' => ['department' => [['assets' => 12]]]]],
    'governance' => ['qualityFields' => ['assetCode' => ['assets' => 12]]],
];

dashboardViewExpectSame(null, warehouseInventoryDashboardNormalizeView(null), 'Missing view keeps the legacy request mode.');
dashboardViewExpectSame(null, warehouseInventoryDashboardNormalizeView(''), 'An empty view keeps the legacy request mode.');
dashboardViewExpectSame('overview', warehouseInventoryDashboardNormalizeView('overview'), 'Supported views are normalized without changing identity.');
dashboardViewExpectThrows(
    static fn() => warehouseInventoryDashboardNormalizeView(['overview']),
    'Array-valued views must fail validation.',
);
dashboardViewExpectThrows(
    static fn() => warehouseInventoryDashboardNormalizeView('unknown'),
    'Unknown view names must fail validation.',
);

$overview = warehouseInventoryDashboardSectionData($analytics, 'overview');
dashboardViewExpectSame($analytics['overview'], $overview['overview'], 'Overview keeps its complete metrics.');
dashboardViewExpectSame(['rows' => $analytics['departments']['rows']], $overview['departments'], 'Overview keeps only the department rows used by its heatmap.');
dashboardViewExpectSame(['ageDistribution' => $analytics['aging']['ageDistribution']], $overview['aging'], 'Overview keeps only the age distribution used by its treemap.');
dashboardViewExpectSame(false, array_key_exists('acquisition', $overview), 'Overview omits inactive acquisition data.');

foreach ([
    'portfolio' => [['totalAssets' => 12], ['departments', 'portfolio']],
    'departments' => [['totalAssets' => 12], ['departments']],
    'locations' => [$analytics['overview'], ['departments', 'locations']],
    'aging' => [$analytics['overview'], ['aging', 'departments']],
    'acquisition' => [['totalAssets' => 12], ['acquisition']],
    'governance' => [['totalAssets' => 12], ['governance']],
] as $view => $expectedKeys) {
    $payload = warehouseInventoryDashboardSectionData($analytics, $view);
    dashboardViewExpectSame($expectedKeys[0], $payload['overview'], $view . ' keeps the shared summary fields.');
    $actualKeys = array_values(array_diff(array_keys($payload), ['overview']));
    sort($actualKeys);
    sort($expectedKeys[1]);
    dashboardViewExpectSame($expectedKeys[1], $actualKeys, $view . ' includes only its needed section data.');
}

dashboardViewExpectSame(
    ['rows' => $analytics['departments']['rows']],
    warehouseInventoryDashboardSectionData($analytics, 'portfolio')['departments'],
    'Portfolio receives the department rows needed to build its matrix.',
);
dashboardViewExpectThrows(
    static fn() => warehouseInventoryDashboardSectionData($analytics, 'unrecognized'),
    'Unknown views must fail validation.',
);

$analyticsRows = [
    [
        'asset_count' => 3, 'asset_key' => 'a-1', 'asset_id' => 1, 'asset_age_years' => 2,
        'is_available_flag' => 1, 'is_damaged_flag' => 0, 'has_location_flag' => 1,
        'asset_status' => 'พร้อมใช้งาน', 'department_key' => 1, 'department_name' => 'Engineering',
        'category_key' => 10, 'category_name' => 'Laptop', 'type_key' => 20, 'type_name' => 'Computer',
        'building' => 'A', 'floor' => '1', 'room' => '101', 'area_name' => 'North',
        'asset_code' => 'A-1', 'asset_name' => 'Laptop 1', 'year_purchase' => 2024, 'year_fiscal' => 2025,
        'source' => 'Budget', 'brand' => 'Brand', 'model' => 'Model', 'location_key' => 1,
        'acquisition_year' => 2024, 'acquisition_fiscal_year' => 2025,
    ],
    [
        'asset_count' => 2, 'asset_key' => 'a-2', 'asset_id' => 2, 'asset_age_years' => 12,
        'is_available_flag' => 0, 'is_damaged_flag' => 1, 'has_location_flag' => 0,
        'asset_status' => 'ชำรุด', 'department_key' => 1, 'department_name' => 'Engineering',
        'category_key' => 11, 'category_name' => 'Monitor', 'type_key' => 21, 'type_name' => 'Display',
        'building' => null, 'floor' => null, 'room' => null, 'area_name' => null,
        'asset_code' => null, 'asset_name' => 'Monitor', 'year_purchase' => null, 'year_fiscal' => null,
        'source' => null, 'brand' => null, 'model' => null, 'location_key' => null,
        'acquisition_year' => null, 'acquisition_fiscal_year' => null,
    ],
    [
        'asset_count' => 1, 'asset_key' => 'a-3', 'asset_id' => 3, 'asset_age_years' => null,
        'is_available_flag' => null, 'is_damaged_flag' => null, 'has_location_flag' => null,
        'asset_status' => null, 'department_key' => null, 'department_name' => null,
        'category_key' => null, 'category_name' => null, 'type_key' => null, 'type_name' => null,
        'building' => null, 'floor' => null, 'room' => null, 'area_name' => null,
        'asset_code' => null, 'asset_name' => null, 'year_purchase' => null, 'year_fiscal' => null,
        'source' => null, 'brand' => null, 'model' => null, 'location_key' => null,
        'acquisition_year' => null, 'acquisition_fiscal_year' => null,
    ],
    [
        'asset_count' => 99, 'asset_key' => 'a-1', 'asset_id' => 1, 'asset_age_years' => 30,
        'is_available_flag' => 0, 'is_damaged_flag' => 1, 'has_location_flag' => 0,
        'asset_status' => 'duplicate join row', 'department_key' => 1, 'department_name' => 'Engineering',
        'category_key' => 10, 'category_name' => 'Laptop', 'type_key' => 20, 'type_name' => 'Computer',
        'building' => null, 'floor' => null, 'room' => null, 'area_name' => null,
        'asset_code' => null, 'asset_name' => null, 'year_purchase' => null, 'year_fiscal' => null,
        'source' => null, 'brand' => null, 'model' => null, 'location_key' => null,
        'acquisition_year' => null, 'acquisition_fiscal_year' => null,
    ],
];
$legacyAnalyticsState = warehouseInventoryAnalyticsCreate(10);
foreach ($analyticsRows as $row) {
    warehouseInventoryAnalyticsConsume($legacyAnalyticsState, $row);
}
$legacyAnalytics = warehouseInventoryAnalyticsFinalize($legacyAnalyticsState);
foreach (['overview', 'departments'] as $view) {
    $viewAnalyticsState = warehouseInventoryAnalyticsCreate(10, $view);
    foreach ($analyticsRows as $row) {
        warehouseInventoryAnalyticsConsume($viewAnalyticsState, $row);
    }
    $viewAnalytics = warehouseInventoryAnalyticsFinalize($viewAnalyticsState);
    dashboardViewExpectSame(
        warehouseInventoryDashboardSectionData($legacyAnalytics, $view),
        warehouseInventoryDashboardSectionData($viewAnalytics, $view),
        $view . ' analytics must keep legacy output values.',
    );
    dashboardViewExpectSame([], $viewAnalyticsState['groups']['categories'], $view . ' should not build unused category aggregates.');
    dashboardViewExpectSame([], $viewAnalyticsState['groups']['cohortDetails']['year']['department'], $view . ' should not build unused acquisition details.');
}

$acquisitionState = warehouseInventoryAnalyticsCreate(10, 'acquisition');
foreach ($analyticsRows as $row) {
    warehouseInventoryAnalyticsConsume($acquisitionState, $row);
}
$acquisitionAnalytics = warehouseInventoryAnalyticsFinalize($acquisitionState);
$legacyAcquisition = warehouseInventoryDashboardSectionData($legacyAnalytics, 'acquisition');
$optimizedAcquisition = warehouseInventoryDashboardSectionData($acquisitionAnalytics, 'acquisition', true);
dashboardViewExpectSame(
    $legacyAnalytics['acquisition'],
    $legacyAcquisition['acquisition'],
    'Existing acquisition view requests must retain the complete response contract unless summary=1 is requested.',
);
foreach (['totalAssets', 'assetsOlderThanThreshold', 'assetsWithKnownAge', 'oldAssetRate'] as $metric) {
    dashboardViewExpectSame(
        $legacyAcquisition['overview'][$metric],
        $optimizedAcquisition['overview'][$metric],
        'Acquisition summary metric ' . $metric . ' must match the legacy calculation.',
    );
}
dashboardViewExpectSame(
    warehouseInventoryDashboardAcquisitionSummary($legacyAcquisition['acquisition']),
    $optimizedAcquisition['acquisition'],
    'Acquisition summary values must match the legacy calculation while omitting unused metric fields.',
);
$acquisitionKeys = array_values(array_diff(array_keys($optimizedAcquisition['acquisition']), ['detail']));
sort($acquisitionKeys);
dashboardViewExpectSame(
    ['byFiscalSource', 'bySource', 'fiscalYears', 'sources', 'years'],
    $acquisitionKeys,
    'Acquisition summary must omit unopened drill-down datasets.',
);
dashboardViewExpectSame([], $acquisitionState['groups']['categories'], 'Acquisition summary must not build category dashboard aggregates.');
dashboardViewExpectSame([], $acquisitionState['groups']['cohortDetails']['year']['department'], 'Acquisition summary must not build cohort detail aggregates.');

$cohortDetailRequest = warehouseDashboardParseAcquisitionDetailRequest([
    'detail' => 'cohort', 'cohortDimension' => 'year', 'cohortValue' => '2024',
    'dimension' => 'department', 'page' => '2', 'limit' => '25', 'sort' => 'totalAssets', 'direction' => 'asc',
]);
dashboardViewExpectSame([
    'kind' => 'cohort', 'cohortDimension' => 'year', 'cohortValue' => '2024',
    'dimension' => 'department', 'relation' => null, 'page' => 2, 'limit' => 25,
    'sort' => 'totalAssets', 'direction' => 'asc',
], $cohortDetailRequest, 'Cohort details must validate and normalize bounded pagination and sort values.');
$crossDetailRequest = warehouseDashboardParseAcquisitionDetailRequest([
    'detail' => 'cross', 'relation' => 'yearDepartment', 'page' => '1', 'limit' => '100',
]);
dashboardViewExpectSame('cross', $crossDetailRequest['kind'], 'Cross details must be a supported request kind.');
dashboardViewExpectSame(100, $crossDetailRequest['limit'], 'Cross details must allow a bounded page size.');
dashboardViewExpectThrows(
    static fn() => warehouseDashboardParseAcquisitionDetailRequest(['detail' => 'cross', 'relation' => 'unknown']),
    'Unknown acquisition relations must be rejected.',
);
dashboardViewExpectThrows(
    static fn() => warehouseDashboardParseAcquisitionDetailRequest([
        'detail' => 'cohort', 'cohortDimension' => 'year', 'cohortValue' => 'all', 'dimension' => 'department',
    ]),
    'Unbounded cohort selectors must be rejected.',
);

echo "inventory_dashboard_views.test.php passed\n";
