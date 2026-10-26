<?php
declare(strict_types=1);

require_once __DIR__ . '/../assets_api/inventory_visual_pagination.php';

function visualPageExpectSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . '\nExpected: ' . var_export($expected, true) . '\nActual: ' . var_export($actual, true));
    }
}

function visualPageExpectInvalid(array $query, string $message): void
{
    try {
        warehouseDashboardParseVisualPageRequest($query);
    } catch (InvalidArgumentException) {
        return;
    }
    throw new RuntimeException($message);
}

visualPageExpectSame(null, warehouseDashboardParseVisualPageRequest([]), 'Normal dashboard requests must remain unchanged.');
visualPageExpectSame(
    ['visualPage' => 'governanceExceptions', 'page' => 2, 'pageSize' => 25],
    warehouseDashboardParseVisualPageRequest(['visualPage' => 'governanceExceptions', 'page' => '2', 'pageSize' => '25']),
    'Governance visual requests should validate and normalize supported paging parameters.',
);
visualPageExpectSame(
    ['visualPage' => 'governanceExceptions', 'page' => 1, 'pageSize' => 'all'],
    warehouseDashboardParseVisualPageRequest(['visualPage' => 'governanceExceptions', 'pageSize' => 'all']),
    'The explicit all-rows option should be supported for a user-requested review view.',
);
visualPageExpectInvalid(['visualPage' => 'otherVisual'], 'Unsupported visual IDs must be rejected.');
visualPageExpectInvalid(['visualPage' => 'governanceExceptions', 'page' => '0'], 'Page numbers must be positive.');
visualPageExpectInvalid(['visualPage' => 'governanceExceptions', 'page' => '1.5'], 'Fractional page numbers must be rejected.');
visualPageExpectInvalid(['visualPage' => 'governanceExceptions', 'pageSize' => '50'], 'Unsupported page sizes must be rejected.');
visualPageExpectInvalid(['visualPage' => 'governanceExceptions', 'pageSize' => ['25']], 'Array query values must be rejected.');

$rows = array_map(static fn(int $value): array => ['value' => $value], range(1, 12));
$page = warehouseDashboardPaginateVisualRows($rows, 12, ['page' => 2, 'pageSize' => 5]);
visualPageExpectSame([6, 7, 8, 9, 10], array_column($page['rows'], 'value'), 'Server pagination should return only the selected slice.');
visualPageExpectSame(12, $page['totalRows'], 'Totals must represent all matching rows before pagination.');
visualPageExpectSame(3, $page['totalPages'], 'Total pages should use the requested page size.');
visualPageExpectSame(2, $page['page'], 'Valid requested pages should be preserved.');

$clamped = warehouseDashboardPaginateVisualRows($rows, 12, ['page' => 99, 'pageSize' => 5]);
visualPageExpectSame(3, $clamped['page'], 'Out-of-range pages should clamp to the final page.');
visualPageExpectSame([11, 12], array_column($clamped['rows'], 'value'), 'Clamped pages should contain the final matching rows.');

$all = warehouseDashboardPaginateVisualRows($rows, 12, ['page' => 8, 'pageSize' => 'all']);
visualPageExpectSame(1, $all['page'], 'All mode should resolve to its only page.');
visualPageExpectSame(1, $all['totalPages'], 'All mode should report one page when rows exist.');
visualPageExpectSame(12, count($all['rows']), 'All mode should return all rows only after the user asks for it.');

$empty = warehouseDashboardPaginateVisualRows([], 0, ['page' => 7, 'pageSize' => 5]);
visualPageExpectSame([], $empty['rows'], 'Empty results should return no rows.');
visualPageExpectSame(1, $empty['page'], 'Empty results should never return page zero or preserve an invalid page.');
visualPageExpectSame(0, $empty['totalPages'], 'Empty results should have zero pages.');

echo "Passed inventory visual pagination tests.\n";
