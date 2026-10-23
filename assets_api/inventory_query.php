<?php
declare(strict_types=1);

function warehouseInventoryParseFilters(array $query): array
{
    $ageThreshold = warehouseInventoryReadQueryString($query, 'ageThreshold', '10', 2);
    if (!ctype_digit($ageThreshold) || (int)$ageThreshold < 1 || (int)$ageThreshold > 50) {
        throw new InvalidArgumentException('Invalid age threshold.');
    }

    $snapshot = warehouseInventoryReadQueryString($query, 'snapshot', 'latest', 10);
    if ($snapshot !== 'latest' && preg_match('/^\d{8}$/D', $snapshot) !== 1) {
        throw new InvalidArgumentException('Invalid snapshot key.');
    }

    $acquisitionYear = warehouseInventoryReadQueryString($query, 'acquisitionYear', 'all', 12);
    $fiscalYear = warehouseInventoryReadQueryString($query, 'fiscalYear', 'all', 12);
    $acquisitionFiscalYear = warehouseInventoryReadQueryString($query, 'acquisitionFiscalYear', 'all', 12);
    foreach ([
        'acquisitionYear' => $acquisitionYear,
        'fiscalYear' => $fiscalYear,
        'acquisitionFiscalYear' => $acquisitionFiscalYear,
    ] as $name => $value) {
        if ($value !== 'all' && $value !== '__missing__' && !ctype_digit($value)) {
            throw new InvalidArgumentException('Invalid year filter: ' . $name);
        }
    }

    return [
        'search' => warehouseInventoryReadQueryString($query, 'q', '', 200),
        'status' => warehouseInventoryReadQueryString($query, 'status', 'all', 100),
        'type' => warehouseInventoryReadQueryString($query, 'type', 'all', 100),
        'department' => warehouseInventoryReadQueryString($query, 'department', 'all', 255),
        'category' => warehouseInventoryReadQueryString($query, 'category', 'all', 255),
        'building' => warehouseInventoryReadQueryString($query, 'building', 'all', 100),
        'floor' => warehouseInventoryReadQueryString($query, 'floor', 'all', 100),
        'room' => warehouseInventoryReadQueryString($query, 'room', 'all', 100),
        'area' => warehouseInventoryReadQueryString($query, 'area', 'all', 255),
        'source' => warehouseInventoryReadQueryString($query, 'source', 'all', 255),
        'acquisitionYear' => $acquisitionYear,
        'fiscalYear' => $fiscalYear,
        'acquisitionFiscalYear' => $acquisitionFiscalYear,
        'ageBand' => warehouseInventoryReadChoice($query, 'ageBand', 'all', ['0-2', '3-5', '6-10', '11-15', '16-20', 'over-20', 'unknown']),
        'availability' => warehouseInventoryReadChoice($query, 'availability', 'all', ['available', 'unavailable', 'unknown']),
        'damage' => warehouseInventoryReadChoice($query, 'damage', 'all', ['damaged', 'not-damaged', 'unknown']),
        'locationStatus' => warehouseInventoryReadChoice($query, 'locationStatus', 'all', ['assigned', 'missing', 'complete', 'incomplete', 'unknown']),
        'belowThreshold' => warehouseInventoryReadChoice($query, 'belowThreshold', 'all', ['yes', 'no', 'unknown']),
        'snapshot' => $snapshot,
        'ageThreshold' => (int)$ageThreshold,
    ];
}

function warehouseInventoryReadChoice(array $query, string $name, string $default, array $allowedValues): string
{
    $value = warehouseInventoryReadQueryString($query, $name, $default, 40);
    if ($value !== $default && !in_array($value, $allowedValues, true)) {
        throw new InvalidArgumentException('Invalid filter choice: ' . $name);
    }

    return $value;
}

function warehouseInventoryReadQueryString(array $query, string $name, string $default, int $maximumLength): string
{
    if (!array_key_exists($name, $query)) {
        return $default;
    }

    $value = $query[$name];
    if (!is_string($value) || preg_match('//u', $value) !== 1) {
        throw new InvalidArgumentException('Invalid query parameter: ' . $name);
    }

    $value = trim($value);
    $characterCount = preg_match_all('/./us', $value);
    if ($characterCount === false || $characterCount > $maximumLength) {
        throw new InvalidArgumentException('Query parameter is too long: ' . $name);
    }

    return $value;
}

function warehouseInventoryBuildWhere(array $filters, ?int $snapshotDateKey): array
{
    $conditions = [];
    $params = [];
    if ($snapshotDateKey !== null) {
        $conditions[] = 'fai.`snapshot_date_key` = :snapshot_date_key';
        $params['snapshot_date_key'] = $snapshotDateKey;
    }
    $search = (string)($filters['search'] ?? '');

    if ($search !== '') {
        $escapedSearch = strtr($search, ['!' => '!!', '%' => '!%', '_' => '!_']);
        $searchColumns = [
            'CAST(da.`asset_id` AS CHAR)',
            'da.`asset_code`',
            'da.`asset_name`',
            'asset_type.`type_code`',
            'asset_type.`type_name`',
            'asset_category.`category_name`',
            'da.`brand`',
            'da.`model`',
            'da.`year_purchase`',
            'da.`year_fiscal`',
            'da.`source`',
            'da.`asset_status`',
            'department.`department_name`',
            'CAST(location.`location_id` AS CHAR)',
            'location.`building`',
            'location.`floor`',
            'location.`room`',
            'location.`area_name`',
        ];
        $searchConditions = [];

        foreach ($searchColumns as $index => $column) {
            $parameter = 'search_' . $index;
            $searchConditions[] = $column . ' LIKE :' . $parameter . " ESCAPE '!'";
            $params[$parameter] = '%' . $escapedSearch . '%';
        }

        $conditions[] = '(' . implode(' OR ', $searchConditions) . ')';
    }

    if (($filters['status'] ?? 'all') === '__missing__') {
        $conditions[] = '(da.`asset_status` IS NULL OR TRIM(da.`asset_status`) = \'\')';
    } elseif (($filters['status'] ?? 'all') !== 'all') {
        $conditions[] = 'da.`asset_status` = :filter_status';
        $params['filter_status'] = $filters['status'];
    }

    if (($filters['type'] ?? 'all') === '__missing__') {
        $conditions[] = '(asset_type.`type_name` IS NULL OR TRIM(asset_type.`type_name`) = \'\')';
    } elseif (($filters['type'] ?? 'all') !== 'all') {
        $conditions[] = 'asset_type.`type_name` = :filter_type';
        $params['filter_type'] = $filters['type'];
    }

    $dimensionFilters = [
        'department' => ['department.`department_name`', 'filter_department', '(department.`department_name` IS NULL OR TRIM(department.`department_name`) = \'\')'],
        'category' => ['asset_category.`category_name`', 'filter_category', '(asset_category.`category_name` IS NULL OR TRIM(asset_category.`category_name`) = \'\')'],
        'building' => ['location.`building`', 'filter_building', '(location.`building` IS NULL OR TRIM(location.`building`) = \'\')'],
        'floor' => ['location.`floor`', 'filter_floor', '(location.`floor` IS NULL OR TRIM(location.`floor`) = \'\')'],
        'room' => ['location.`room`', 'filter_room', '(location.`room` IS NULL OR TRIM(location.`room`) = \'\')'],
        'area' => ['location.`area_name`', 'filter_area', '(location.`area_name` IS NULL OR TRIM(location.`area_name`) = \'\')'],
        'source' => ['da.`source`', 'filter_source', '(da.`source` IS NULL OR TRIM(da.`source`) = \'\')'],
        'acquisitionYear' => ['acquisition_date.`year`', 'filter_acquisition_year', 'acquisition_date.`year` IS NULL'],
        'fiscalYear' => ['da.`year_fiscal`', 'filter_fiscal_year', '(da.`year_fiscal` IS NULL OR TRIM(da.`year_fiscal`) = \'\')'],
        'acquisitionFiscalYear' => ['acquisition_date.`fiscal_year`', 'filter_acquisition_fiscal_year', 'acquisition_date.`fiscal_year` IS NULL'],
    ];

    foreach ($dimensionFilters as $filterName => [$column, $parameter, $missingCondition]) {
        $value = $filters[$filterName] ?? 'all';
        if ($value === 'all') {
            continue;
        }
        if ($value === '__missing__') {
            $conditions[] = $missingCondition;
            continue;
        }

        $conditions[] = $column . ' = :' . $parameter;
        $params[$parameter] = $value;
    }

    $ageBandConditions = [
        '0-2' => 'fai.`asset_age_years` BETWEEN 0 AND 2',
        '3-5' => 'fai.`asset_age_years` BETWEEN 3 AND 5',
        '6-10' => 'fai.`asset_age_years` BETWEEN 6 AND 10',
        '11-15' => 'fai.`asset_age_years` BETWEEN 11 AND 15',
        '16-20' => 'fai.`asset_age_years` BETWEEN 16 AND 20',
        'over-20' => 'fai.`asset_age_years` > 20',
        'unknown' => '(fai.`asset_age_years` IS NULL OR fai.`asset_age_years` < 0)',
    ];
    if (($filters['ageBand'] ?? 'all') !== 'all') {
        $conditions[] = $ageBandConditions[$filters['ageBand']];
    }

    $flagFilters = [
        'availability' => [
            'available' => 'fai.`is_available_flag` = 1',
            'unavailable' => 'fai.`is_available_flag` = 0',
            'unknown' => 'fai.`is_available_flag` IS NULL',
        ],
        'damage' => [
            'damaged' => 'fai.`is_damaged_flag` = 1',
            'not-damaged' => 'fai.`is_damaged_flag` = 0',
            'unknown' => 'fai.`is_damaged_flag` IS NULL',
        ],
        'belowThreshold' => [
            'yes' => 'fai.`is_below_threshold_flag` = 1',
            'no' => 'fai.`is_below_threshold_flag` = 0',
            'unknown' => 'fai.`is_below_threshold_flag` IS NULL',
        ],
        'locationStatus' => [
            'assigned' => 'fai.`has_location_flag` = 1',
            'missing' => 'fai.`has_location_flag` = 0',
            'complete' => 'fai.`has_location_flag` = 1 AND ' . warehouseInventoryLocationDetailCompleteSql(),
            'incomplete' => 'fai.`has_location_flag` = 1 AND NOT (' . warehouseInventoryLocationDetailCompleteSql() . ')',
            'unknown' => 'fai.`has_location_flag` IS NULL',
        ],
    ];
    foreach ($flagFilters as $filterName => $values) {
        $value = $filters[$filterName] ?? 'all';
        if ($value !== 'all') {
            $conditions[] = $values[$value];
        }
    }

    return [
        'sql' => $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions),
        'params' => $params,
    ];
}

function warehouseInventoryFromSql(): string
{
    return 'FROM `fact_asset_inventory` fai
        LEFT JOIN `dim_date` snapshot_date
            ON snapshot_date.`date_key` = fai.`snapshot_date_key`
        LEFT JOIN `dim_date` acquisition_date
            ON acquisition_date.`date_key` = fai.`acquisition_date_key`
        LEFT JOIN `dim_asset` da
            ON da.`asset_key` = fai.`asset_key`
        LEFT JOIN `dim_asset_type` asset_type
            ON asset_type.`type_key` = fai.`type_key`
        LEFT JOIN `dim_asset_category` asset_category
            ON asset_category.`category_key` = fai.`category_key`
        LEFT JOIN `dim_department` department
            ON department.`department_key` = fai.`department_key`
        LEFT JOIN `dim_location` location
            ON location.`location_key` = fai.`location_key`';
}

function warehouseInventoryLocationDetailCompleteSql(): string
{
    return "NULLIF(TRIM(location.`building`), '') IS NOT NULL
        AND NULLIF(TRIM(location.`floor`), '') IS NOT NULL
        AND NULLIF(TRIM(location.`room`), '') IS NOT NULL
        AND NULLIF(TRIM(location.`area_name`), '') IS NOT NULL";
}

function warehouseInventorySanitizeCsvValue(mixed $value): string
{
    if ($value === null) {
        return '';
    }
    if (!is_scalar($value)) {
        throw new InvalidArgumentException('CSV values must be scalar.');
    }

    $text = (string)$value;
    if (preg_match('/^[\s\x00-\x1f\x7f]*[=+\-@]/', $text) === 1) {
        return "'" . $text;
    }

    return $text;
}

function warehouseInventoryCsvHeadings(): array
{
    return ['รหัสสินทรัพย์', 'ชื่อสินทรัพย์', 'ประเภท', 'ยี่ห้อ', 'สถานะ', 'ปีที่จัดซื้อ', 'หน่วยงาน', 'รหัสสถานที่', 'วันที่ข้อมูล'];
}

function warehouseInventoryCsvRow(array $row): array
{
    return [
        $row['asset_code'] ?? null,
        $row['asset_name'] ?? null,
        $row['type_name'] ?? null,
        $row['brand'] ?? null,
        $row['asset_status'] ?? null,
        $row['year_purchase'] ?? null,
        $row['department_name'] ?? null,
        $row['location_id'] ?? null,
        $row['snapshot_date'] ?? null,
    ];
}

function warehouseInventoryWriteCsvRow($stream, array $values): bool
{
    $safeValues = array_map('warehouseInventorySanitizeCsvValue', $values);
    return fputcsv($stream, $safeValues, ',', '"', '') !== false;
}
