<?php
declare(strict_types=1);

function warehouseInventoryParseFilters(array $query): array
{
    return [
        'search' => warehouseInventoryReadQueryString($query, 'q', '', 200),
        'status' => warehouseInventoryReadQueryString($query, 'status', 'all', 100),
        'type' => warehouseInventoryReadQueryString($query, 'type', 'all', 100),
    ];
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

function warehouseInventoryBuildWhere(array $filters, int $snapshotDateKey): array
{
    $conditions = ['fai.`snapshot_date_key` = :snapshot_date_key'];
    $params = ['snapshot_date_key' => $snapshotDateKey];
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

    if (($filters['status'] ?? 'all') !== 'all') {
        $conditions[] = 'da.`asset_status` = :filter_status';
        $params['filter_status'] = $filters['status'];
    }

    if (($filters['type'] ?? 'all') !== 'all') {
        $conditions[] = 'asset_type.`type_name` = :filter_type';
        $params['filter_type'] = $filters['type'];
    }

    return [
        'sql' => 'WHERE ' . implode(' AND ', $conditions),
        'params' => $params,
    ];
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
