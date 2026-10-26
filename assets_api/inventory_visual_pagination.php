<?php
declare(strict_types=1);

function warehouseDashboardParseVisualPageRequest(array $query): ?array
{
    if (!array_key_exists('visualPage', $query)) {
        return null;
    }

    if (!is_string($query['visualPage']) || $query['visualPage'] !== 'governanceExceptions') {
        throw new InvalidArgumentException('Unsupported visual page.');
    }

    $pageValue = $query['page'] ?? '1';
    if (!is_string($pageValue) && !is_int($pageValue)) {
        throw new InvalidArgumentException('Invalid visual page number.');
    }
    $page = filter_var((string)$pageValue, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($page === false) {
        throw new InvalidArgumentException('Invalid visual page number.');
    }

    $pageSizeValue = $query['pageSize'] ?? '5';
    if (!is_string($pageSizeValue) && !is_int($pageSizeValue)) {
        throw new InvalidArgumentException('Invalid visual page size.');
    }
    $pageSizeValue = (string)$pageSizeValue;
    if ($pageSizeValue !== 'all' && !in_array($pageSizeValue, ['5', '10', '25'], true)) {
        throw new InvalidArgumentException('Unsupported visual page size.');
    }

    return [
        'visualPage' => 'governanceExceptions',
        'page' => $page,
        'pageSize' => $pageSizeValue === 'all' ? 'all' : (int)$pageSizeValue,
    ];
}

function warehouseDashboardPaginateVisualRows(array $rows, int $totalRows, array $request): array
{
    $totalRows = max(0, $totalRows);
    $pageSize = $request['pageSize'] ?? 5;
    $totalPages = $totalRows === 0
        ? 0
        : ($pageSize === 'all' ? 1 : (int)ceil($totalRows / max(1, (int)$pageSize)));
    $page = $totalPages === 0
        ? 1
        : min(max(1, (int)($request['page'] ?? 1)), $totalPages);
    $start = $totalRows === 0 ? 0 : ($pageSize === 'all' ? 0 : ($page - 1) * (int)$pageSize);
    $visibleRows = $pageSize === 'all' ? $rows : array_slice($rows, $start, (int)$pageSize);

    return [
        'rows' => $visibleRows,
        'totalRows' => $totalRows,
        'totalPages' => $totalPages,
        'page' => $page,
        'pageSize' => $pageSize,
        'start' => $totalRows === 0 ? 0 : $start + 1,
        'end' => $totalRows === 0 ? 0 : $start + count($visibleRows),
    ];
}
