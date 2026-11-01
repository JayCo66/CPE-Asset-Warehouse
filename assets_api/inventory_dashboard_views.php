<?php
declare(strict_types=1);

const WAREHOUSE_INVENTORY_DASHBOARD_VIEWS = [
    'overview',
    'portfolio',
    'departments',
    'locations',
    'aging',
    'acquisition',
    'governance',
];

function warehouseInventoryDashboardNormalizeView(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_string($value) || !in_array($value, WAREHOUSE_INVENTORY_DASHBOARD_VIEWS, true)) {
        throw new InvalidArgumentException('Unsupported dashboard view.');
    }

    return $value;
}

function warehouseInventoryDashboardAcquisitionSummary(array $acquisition): array
{
    $projectRows = static function (mixed $rows, array $fields): array {
        if (!is_array($rows)) {
            return [];
        }
        return array_map(
            static fn(array $row): array => array_intersect_key($row, array_fill_keys($fields, true)),
            array_filter($rows, 'is_array'),
        );
    };
    $dimensionFields = [
        'key', 'label', 'filterValue', 'totalAssets', 'averageAssetAge',
        'assetsWithKnownAge', 'assetsOlderThanThreshold', 'oldAssetRate',
    ];
    $comboFields = [
        'firstKey', 'secondKey', 'first', 'second', 'firstFilterValue', 'secondFilterValue',
        'totalAssets', 'averageAssetAge', 'assetsWithKnownAge', 'assetsOlderThanThreshold', 'oldAssetRate',
    ];
    return [
        'years' => $projectRows($acquisition['years'] ?? [], $dimensionFields),
        'fiscalYears' => $projectRows($acquisition['fiscalYears'] ?? [], $dimensionFields),
        'sources' => $projectRows($acquisition['sources'] ?? [], ['key', 'label', 'filterValue', 'totalAssets']),
        'bySource' => $projectRows($acquisition['bySource'] ?? [], $comboFields),
        'byFiscalSource' => $projectRows($acquisition['byFiscalSource'] ?? [], $comboFields),
    ];
}

function warehouseInventoryDashboardSectionData(array $analytics, string $view, bool $acquisitionSummaryOnly = false): array
{
    if (!in_array($view, WAREHOUSE_INVENTORY_DASHBOARD_VIEWS, true)) {
        throw new InvalidArgumentException('Unsupported dashboard view.');
    }

    $overview = $analytics['overview'] ?? [];
    $departmentRows = ['rows' => $analytics['departments']['rows'] ?? []];
    $summaryFields = match ($view) {
        'overview', 'locations', 'aging' => null,
        'acquisition' => ['totalAssets', 'assetsOlderThanThreshold', 'oldAssetRate', 'assetsWithKnownAge'],
        default => ['totalAssets'],
    };
    if ($summaryFields !== null) {
        $overview = array_intersect_key($overview, array_fill_keys($summaryFields, true));
    }

    return match ($view) {
        'overview' => [
            'overview' => $overview,
            'departments' => $departmentRows,
            'aging' => ['ageDistribution' => $analytics['aging']['ageDistribution'] ?? []],
        ],
        'portfolio' => [
            'overview' => $overview,
            'departments' => $departmentRows,
            'portfolio' => $analytics['portfolio'] ?? [],
        ],
        'departments' => [
            'overview' => $overview,
            'departments' => $analytics['departments'] ?? ['rows' => []],
        ],
        'locations' => [
            'overview' => $overview,
            'departments' => $departmentRows,
            'locations' => $analytics['locations'] ?? [],
        ],
        'aging' => [
            'overview' => $overview,
            'departments' => $departmentRows,
            'aging' => $analytics['aging'] ?? [],
        ],
        'acquisition' => [
            'overview' => $overview,
            'acquisition' => $acquisitionSummaryOnly
                ? warehouseInventoryDashboardAcquisitionSummary($analytics['acquisition'] ?? [])
                : ($analytics['acquisition'] ?? []),
        ],
        'governance' => [
            'overview' => $overview,
            'governance' => $analytics['governance'] ?? [],
        ],
    };
}
