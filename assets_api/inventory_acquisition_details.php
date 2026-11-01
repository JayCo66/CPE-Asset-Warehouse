<?php
declare(strict_types=1);

require_once __DIR__ . '/inventory_query.php';

function warehouseDashboardParseAcquisitionDetailRequest(array $query): ?array
{
    if (!array_key_exists('detail', $query)) {
        return null;
    }
    $kind = warehouseInventoryReadQueryString($query, 'detail', '', 16);
    if (!in_array($kind, ['cohort', 'cross'], true)) {
        throw new InvalidArgumentException('Unsupported acquisition detail request.');
    }

    $pageValue = warehouseInventoryReadQueryString($query, 'page', '1', 8);
    $limitValue = warehouseInventoryReadQueryString($query, 'limit', '25', 3);
    if (!ctype_digit($pageValue) || (int)$pageValue < 1 || (int)$pageValue > 100000) {
        throw new InvalidArgumentException('Invalid acquisition detail page.');
    }
    if (!in_array((int)$limitValue, [5, 10, 25, 50, 100], true) || !ctype_digit($limitValue)) {
        throw new InvalidArgumentException('Invalid acquisition detail page size.');
    }

    $direction = warehouseInventoryReadQueryString($query, 'direction', 'desc', 4);
    if (!in_array($direction, ['asc', 'desc'], true)) {
        throw new InvalidArgumentException('Invalid acquisition detail sort direction.');
    }

    $request = [
        'kind' => $kind,
        'cohortDimension' => null,
        'cohortValue' => null,
        'dimension' => null,
        'relation' => null,
        'page' => (int)$pageValue,
        'limit' => (int)$limitValue,
        'sort' => warehouseInventoryReadQueryString($query, 'sort', 'totalAssets', 32),
        'direction' => $direction,
    ];

    if ($kind === 'cohort') {
        $request['cohortDimension'] = warehouseInventoryReadQueryString($query, 'cohortDimension', '', 16);
        $request['cohortValue'] = warehouseInventoryReadQueryString($query, 'cohortValue', '', 12);
        $request['dimension'] = warehouseInventoryReadQueryString($query, 'dimension', '', 16);
        if (!in_array($request['cohortDimension'], ['year', 'fiscalYear'], true)
            || !in_array($request['dimension'], ['department', 'category', 'type'], true)
            || ($request['cohortValue'] !== '__missing__' && !ctype_digit($request['cohortValue']))) {
            throw new InvalidArgumentException('Invalid acquisition cohort selector.');
        }
        $sortKeys = ['label', 'totalAssets', 'averageAssetAge', 'assetsOlderThanThreshold', 'oldAssetRate'];
    } else {
        $request['relation'] = warehouseInventoryReadQueryString($query, 'relation', '', 32);
        $relations = [
            'yearDepartment', 'yearCategory', 'yearType', 'fiscalCategory', 'sourceDepartment', 'sourceCategory',
        ];
        if (!in_array($request['relation'], $relations, true)) {
            throw new InvalidArgumentException('Invalid acquisition cross-dimension relation.');
        }
        $sortKeys = ['first', 'second', 'totalAssets', 'averageAssetAge', 'assetsOlderThanThreshold', 'oldAssetRate'];
    }

    if (!in_array($request['sort'], $sortKeys, true)) {
        throw new InvalidArgumentException('Invalid acquisition detail sort key.');
    }

    return $request;
}

function warehouseDashboardAcquisitionDimensionSpec(string $dimension): array
{
    return match ($dimension) {
        'year' => ['key' => 'acquisition_date.`year`', 'label' => 'acquisition_date.`year`', 'unknownLabel' => 'ไม่ระบุปีจัดหา'],
        'fiscalYear' => ['key' => 'acquisition_date.`fiscal_year`', 'label' => 'acquisition_date.`fiscal_year`', 'unknownLabel' => 'ไม่ระบุปีงบประมาณจัดหา'],
        'source' => ['key' => 'da.`source`', 'label' => 'da.`source`', 'unknownLabel' => 'ไม่ระบุแหล่งเงิน'],
        'department' => ['key' => 'fai.`department_key`', 'label' => 'department.`department_name`', 'unknownLabel' => 'ไม่ระบุหน่วยงาน'],
        'category' => ['key' => 'fai.`category_key`', 'label' => 'asset_category.`category_name`', 'unknownLabel' => 'ไม่ระบุหมวดหมู่'],
        'type' => ['key' => 'fai.`type_key`', 'label' => 'asset_type.`type_name`', 'unknownLabel' => 'ไม่ระบุประเภท'],
        default => throw new InvalidArgumentException('Unsupported acquisition detail dimension.'),
    };
}

function warehouseDashboardAcquisitionGroupExpressions(array $spec, string $prefix): array
{
    $key = $spec['key'];
    $label = $spec['label'];
    $keyExpression = "CASE WHEN {$key} IS NULL OR NULLIF(TRIM(CAST({$label} AS CHAR)), '') IS NULL THEN '__unknown__' ELSE CAST({$key} AS CHAR) END";
    $labelExpression = "COALESCE(NULLIF(TRIM(CAST({$label} AS CHAR)), ''), '')";
    $filterExpression = "CASE WHEN {$keyExpression} = '__unknown__' THEN '__missing__' ELSE TRIM(CAST({$label} AS CHAR)) END";

    return [
        'select' => [
            $keyExpression . ' AS `' . $prefix . '_key`',
            $labelExpression . ' AS `' . $prefix . '_label`',
            $filterExpression . ' AS `' . $prefix . '_filter_value`',
        ],
        'group' => [$keyExpression, $labelExpression, $filterExpression],
        'unknownLabel' => $spec['unknownLabel'],
    ];
}

function warehouseDashboardAcquisitionAggregateSql(array $groups, array $where): string
{
    $weight = 'COALESCE(fai.`asset_count`, 0)';
    $knownAge = 'fai.`asset_age_years` IS NOT NULL AND fai.`asset_age_years` >= 0';
    $groupSelect = [];
    $groupBy = [];
    foreach ($groups as $group) {
        array_push($groupSelect, ...$group['select']);
        array_push($groupBy, ...$group['group']);
    }

    return 'SELECT ' . implode(', ', [
        ...$groupSelect,
        'SUM(' . $weight . ') AS `total_assets`',
        'SUM(CASE WHEN ' . $knownAge . ' THEN ' . $weight . ' ELSE 0 END) AS `known_age_assets`',
        'SUM(CASE WHEN fai.`asset_age_years` > :detail_age_threshold THEN ' . $weight . ' ELSE 0 END) AS `older_assets`',
        'SUM(CASE WHEN ' . $knownAge . ' THEN fai.`asset_age_years` * ' . $weight . ' ELSE 0 END) AS `weighted_age`',
    ]) . ' ' . warehouseInventoryFromSql() . ' ' . $where['sql'] . ' GROUP BY ' . implode(', ', $groupBy);
}

function warehouseDashboardAcquisitionBind(PDOStatement $statement, array $parameters): void
{
    foreach ($parameters as $name => $value) {
        $type = is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR;
        $statement->bindValue(':' . $name, $value, $type);
    }
}

function warehouseDashboardFetchAcquisitionDetails(PDO $pdo, array $filters, string $snapshotId, array $request): array
{
    if ($request['kind'] === 'cohort') {
        $filterName = $request['cohortDimension'] === 'year' ? 'acquisitionYear' : 'acquisitionFiscalYear';
        $filters[$filterName] = $request['cohortValue'];
        $groups = [warehouseDashboardAcquisitionGroupExpressions(
            warehouseDashboardAcquisitionDimensionSpec($request['dimension']),
            'row',
        )];
    } else {
        $relationDimensions = [
            'yearDepartment' => ['year', 'department'],
            'yearCategory' => ['year', 'category'],
            'yearType' => ['year', 'type'],
            'fiscalCategory' => ['fiscalYear', 'category'],
            'sourceDepartment' => ['source', 'department'],
            'sourceCategory' => ['source', 'category'],
        ];
        $groups = array_map(
            static fn(string $dimension, int $index): array => warehouseDashboardAcquisitionGroupExpressions(
                warehouseDashboardAcquisitionDimensionSpec($dimension),
                $index === 0 ? 'first' : 'second',
            ),
            $relationDimensions[$request['relation']],
            array_keys($relationDimensions[$request['relation']]),
        );
    }

    $where = warehouseInventoryBuildWhere($filters, null, $snapshotId);
    $groupedSql = warehouseDashboardAcquisitionAggregateSql($groups, $where);
    $countStatement = $pdo->prepare('SELECT COUNT(*) FROM (' . $groupedSql . ') acquisition_groups');
    warehouseDashboardAcquisitionBind($countStatement, [
        ...$where['params'],
        'detail_age_threshold' => $filters['ageThreshold'],
    ]);
    $countStatement->execute();
    $totalRows = (int)$countStatement->fetchColumn();
    $totalPages = $totalRows === 0 ? 0 : (int)ceil($totalRows / $request['limit']);
    $page = $totalPages === 0 ? 1 : min($request['page'], $totalPages);

    $sortColumns = [
        'label' => '`row_label`', 'first' => '`first_label`', 'second' => '`second_label`',
        'totalAssets' => '`total_assets`', 'averageAssetAge' => '`average_asset_age`',
        'assetsOlderThanThreshold' => '`older_assets`', 'oldAssetRate' => '`old_asset_rate`',
    ];
    $sortColumn = $sortColumns[$request['sort']];
    $direction = strtoupper($request['direction']);
    $tieBreakers = $request['kind'] === 'cohort'
        ? '`row_label` ASC, `row_key` ASC'
        : '`first_label` ASC, `first_key` ASC, `second_label` ASC, `second_key` ASC';
    $offset = ($page - 1) * $request['limit'];
    $rowsStatement = $pdo->prepare(
        'SELECT acquisition_groups.*,
            CASE WHEN `known_age_assets` > 0 THEN ROUND(`weighted_age` / `known_age_assets`, 1) ELSE NULL END AS `average_asset_age`,
            CASE WHEN `known_age_assets` > 0 THEN ROUND(`older_assets` / `known_age_assets` * 100, 1) ELSE NULL END AS `old_asset_rate`
        FROM (' . $groupedSql . ') acquisition_groups
        ORDER BY ' . $sortColumn . ' ' . $direction . ', ' . $tieBreakers . '
        LIMIT :detail_limit OFFSET :detail_offset'
    );
    warehouseDashboardAcquisitionBind($rowsStatement, [
        ...$where['params'],
        'detail_age_threshold' => $filters['ageThreshold'],
        'detail_limit' => $request['limit'],
        'detail_offset' => $offset,
    ]);
    $rowsStatement->execute();

    $rows = [];
    foreach ($rowsStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $total = (int)$row['total_assets'];
        $knownAge = (int)$row['known_age_assets'];
        $normalized = [
            'totalAssets' => $total,
            'averageAssetAge' => $row['average_asset_age'] === null ? null : (float)$row['average_asset_age'],
            'assetsOlderThanThreshold' => (int)$row['older_assets'],
            'oldAssetRate' => $row['old_asset_rate'] === null ? null : (float)$row['old_asset_rate'],
        ];
        if ($request['kind'] === 'cohort') {
            $rowKey = (string)$row['row_key'];
            $rows[] = [
                'key' => $rowKey,
                'label' => $row['row_label'] === '' ? $groups[0]['unknownLabel'] : (string)$row['row_label'],
                'filterValue' => (string)$row['row_filter_value'],
                ...$normalized,
                'assetsWithKnownAge' => $knownAge,
            ];
            continue;
        }

        $firstKey = (string)$row['first_key'];
        $secondKey = (string)$row['second_key'];
        $rows[] = [
            'first' => $row['first_label'] === '' ? $groups[0]['unknownLabel'] : (string)$row['first_label'],
            'second' => $row['second_label'] === '' ? $groups[1]['unknownLabel'] : (string)$row['second_label'],
            'firstKey' => $firstKey,
            'secondKey' => $secondKey,
            'firstFilterValue' => (string)$row['first_filter_value'],
            'secondFilterValue' => (string)$row['second_filter_value'],
            ...$normalized,
        ];
    }

    $start = $totalRows === 0 ? 0 : $offset + 1;
    $end = min($totalRows, $offset + count($rows));

    return [
        'kind' => $request['kind'],
        'rows' => $rows,
        'pagination' => [
            'page' => $page,
            'pageSize' => $request['limit'],
            'totalRows' => $totalRows,
            'totalPages' => $totalPages,
            'start' => $start,
            'end' => $end,
        ],
    ];
}
