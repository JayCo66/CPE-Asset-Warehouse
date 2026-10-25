<?php
declare(strict_types=1);

require_once __DIR__ . '/../assets_api/inventory_disposal.php';

$rows = [
    [
        'asset_code' => 'CPE-OLD-HIGH-REPAIR',
        'category_name' => 'ครุภัณฑ์คอมพิวเตอร์',
        'below_threshold' => false,
        'repair_cost' => 100000,
        'asset_age_years' => 3,
        'asset_count' => 2,
    ],
    [
        'asset_code' => 'CPE-YOUNG-HIGH-REPAIR',
        'category_name' => 'ครุภัณฑ์คอมพิวเตอร์',
        'below_threshold' => false,
        'repair_cost' => 100000,
        'asset_age_years' => 2,
        'asset_count' => 5,
    ],
    [
        'asset_code' => 'CPE-OLD-LOW-REPAIR',
        'category_name' => 'ครุภัณฑ์คอมพิวเตอร์',
        'below_threshold' => false,
        'repair_cost' => 1,
        'asset_age_years' => 3,
        'asset_count' => 1,
    ],
    [
        'asset_code' => 'CPE-OLD-BELOW-THRESHOLD',
        'category_name' => 'ครุภัณฑ์คอมพิวเตอร์',
        'below_threshold' => true,
        'repair_cost' => 3000,
        'asset_age_years' => 3,
        'asset_count' => 1,
    ],
    [
        'asset_code' => 'CPE-OLD-REGULAR-PRICE',
        'category_name' => 'ครุภัณฑ์คอมพิวเตอร์',
        'below_threshold' => false,
        'repair_cost' => 3000,
        'asset_age_years' => 3,
        'asset_count' => 1,
    ],
    [
        'asset_code' => 'CPE-UNKNOWN-AGE',
        'category_name' => 'ครุภัณฑ์คอมพิวเตอร์',
        'below_threshold' => false,
        'repair_cost' => 100000,
        'asset_age_years' => null,
        'asset_count' => 1,
    ],
];

$actual = warehouseInventoryDisposalCandidateCount($rows, 0.5, 0.5);
if ($actual !== 3) {
    throw new RuntimeException("Expected 3 estimated candidates counted by asset_count; received {$actual}.");
}

echo "Disposal estimate logic passed.\n";
