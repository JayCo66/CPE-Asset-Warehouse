<?php
declare(strict_types=1);

require_once __DIR__ . '/../assets_api/university_snapshot_import_lib.php';

$testCount = 0;

function importExpectSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . '\nExpected: ' . var_export($expected, true) . '\nActual: ' . var_export($actual, true));
    }
}

function importExpectThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException|RuntimeException) {
        return;
    }
    throw new RuntimeException($message);
}

function importRunTest(string $name, callable $callback): void
{
    global $testCount;
    $callback();
    $testCount++;
    echo "✔ {$name}\n";
}

function importFakeAsset(int $assetId): array
{
    return [
        'asset_id' => $assetId,
        'asset_code' => 'CPE-' . $assetId,
        'asset_name' => 'Asset ' . $assetId,
        'type_id' => 1,
        'type_name' => 'อุปกรณ์',
        'type_code' => 'FA01',
        'category_id' => 1,
        'brand' => null,
        'year_purchase' => '2020',
        'year_fiscal' => '2563',
        'source' => 'งบประมาณ',
        'asset_status' => 'พร้อมใช้งาน',
        'location_id' => 1,
        'department_id' => 1,
        'department_name' => 'หน่วยงานตัวอย่าง',
        'update_date' => '2026-10-25',
    ];
}

importRunTest('collects a complete paginated university dataset', static function (): void {
    $pages = [
        1 => ['success' => true, 'total' => 101, 'data' => array_map('importFakeAsset', range(1, 100))],
        2 => ['success' => true, 'total' => 101, 'data' => [importFakeAsset(101)]],
    ];
    $assets = warehouseUniversityCollectAssets(static fn(int $page): array => $pages[$page], 10, 1000);
    importExpectSame(101, count($assets), 'Every record from every page should be returned.');
    importExpectSame([1, 101], [reset($assets)['asset_id'], end($assets)['asset_id']], 'Page ordering should be retained.');
});

importRunTest('rejects inconsistent page totals, duplicate IDs, and incomplete final pages', static function (): void {
    importExpectThrows(static fn() => warehouseUniversityCollectAssets(static function (int $page): array {
        return ['success' => true, 'total' => $page === 1 ? 101 : 102, 'data' => $page === 1 ? array_map('importFakeAsset', range(1, 100)) : [importFakeAsset(101)]];
    }, 10, 1000), 'A changing total must fail validation.');

    importExpectThrows(static fn() => warehouseUniversityCollectAssets(static fn(): array => [
        'success' => true,
        'total' => 2,
        'data' => [importFakeAsset(1), importFakeAsset(1)],
    ], 10, 100), 'Duplicate asset IDs must fail validation.');

    importExpectThrows(static fn() => warehouseUniversityCollectAssets(static fn(): array => [
        'success' => true,
        'total' => 2,
        'data' => [importFakeAsset(1)],
    ], 10, 100), 'A truncated dataset must fail validation.');
});

importRunTest('rejects assets missing ETL-required identifiers', static function (): void {
    importExpectThrows(static fn() => warehouseUniversityCollectAssets(static fn(): array => [
        'success' => true,
        'total' => 1,
        'data' => [['asset_id' => null]],
    ], 10, 100), 'An invalid asset row must stop the complete import.');
});

importRunTest('accepts zero-valued dimension IDs retained by the warehouse ETL', static function (): void {
    $asset = importFakeAsset(1);
    $asset['location_id'] = 0;
    warehouseUniversityValidateAsset($asset);

    $asset['location_id'] = -1;
    importExpectThrows(static fn() => warehouseUniversityValidateAsset($asset), 'Negative dimension IDs must remain invalid.');
});

importRunTest('rejects page-one changes during the paginated import', static function (): void {
    $calls = 0;
    importExpectThrows(static function () use (&$calls): void {
        warehouseUniversityCollectAssets(static function (int $page) use (&$calls): array {
            $calls++;
            return ['success' => true, 'total' => 1, 'data' => [importFakeAsset($calls === 1 ? 1 : 2)]];
        }, 10, 100);
    }, 'A dataset that changes during collection must not be imported.');
});

importRunTest('allows same-origin snapshot requests on a deployed host and rejects cross-origin requests', static function (): void {
    $request = [
        'REMOTE_ADDR' => '203.0.113.20',
        'HTTP_HOST' => 'dashboard.example.test',
        'HTTP_ORIGIN' => 'https://dashboard.example.test',
        'HTTPS' => 'on',
        'HTTP_SEC_FETCH_SITE' => 'same-origin',
        'HTTP_X_CPE_SNAPSHOT_IMPORT' => '1',
    ];
    importExpectSame(true, warehouseUniversitySameOriginRequestAllowed($request), 'A same-origin request from a deployed host should be allowed.');

    $request['HTTP_ORIGIN'] = 'https://attacker.example';
    importExpectSame(false, warehouseUniversitySameOriginRequestAllowed($request), 'Cross-origin requests must be rejected.');
    $request['HTTP_ORIGIN'] = 'http://dashboard.example.test';
    importExpectSame(false, warehouseUniversitySameOriginRequestAllowed($request), 'Cross-scheme requests must be rejected.');
    $request['HTTP_ORIGIN'] = 'https://dashboard.example.test:8443';
    importExpectSame(false, warehouseUniversitySameOriginRequestAllowed($request), 'Cross-port requests must be rejected.');
    $request['HTTP_ORIGIN'] = 'https://dashboard.example.test';
    $request['HTTP_SEC_FETCH_SITE'] = 'cross-site';
    importExpectSame(false, warehouseUniversitySameOriginRequestAllowed($request), 'Cross-site fetch metadata must be rejected.');
    $request['HTTP_SEC_FETCH_SITE'] = 'same-origin';
    $request['HTTP_X_CPE_SNAPSHOT_IMPORT'] = '';
    importExpectSame(false, warehouseUniversitySameOriginRequestAllowed($request), 'Requests without the import marker must be rejected.');
});

echo "Passed {$testCount} university snapshot import tests.\n";
