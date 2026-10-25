<?php
declare(strict_types=1);

const WAREHOUSE_UNIVERSITY_ASSET_URL = 'https://cpe.eng.kps.ku.ac.th/CPEAssets/assets_api/assets.php';
const WAREHOUSE_UNIVERSITY_TYPE_URL = 'https://cpe.eng.kps.ku.ac.th/CPEAssets/assets_api/asset_types.php';
const WAREHOUSE_UNIVERSITY_CATEGORY_URL = 'https://cpe.eng.kps.ku.ac.th/CPEAssets/assets_api/asset_categories.php';
const WAREHOUSE_UNIVERSITY_LOCAL_TYPE_URL = 'http://127.0.0.1/assets_api/asset_types.php';
const WAREHOUSE_UNIVERSITY_LOCAL_CATEGORY_URL = 'http://127.0.0.1/assets_api/asset_categories.php';
const WAREHOUSE_UNIVERSITY_PAGE_SIZE = 100;
const WAREHOUSE_UNIVERSITY_MAX_PAGES = 500;
const WAREHOUSE_UNIVERSITY_MAX_RECORDS = 50000;

function warehouseUniversityCollectAssets(callable $fetchPage, int $maxPages, int $maxRecords, int $maxDurationSeconds = 300): array
{
    $deadline = microtime(true) + max(1, $maxDurationSeconds);
    $getPage = static function (int $page) use ($fetchPage, $deadline): array {
        if (microtime(true) >= $deadline) {
            throw new RuntimeException('The university import exceeded its time limit.');
        }
        return $fetchPage($page);
    };

    $firstPage = $getPage(1);
    warehouseUniversityValidateEnvelope($firstPage);
    $reportedTotal = $firstPage['total'];
    if ($reportedTotal > $maxRecords) {
        throw new RuntimeException('The university dataset exceeds the configured import limit.');
    }

    $pageCount = max(1, (int)ceil($reportedTotal / WAREHOUSE_UNIVERSITY_PAGE_SIZE));
    if ($pageCount > $maxPages) {
        throw new RuntimeException('The university dataset exceeds the configured page limit.');
    }

    $assets = [];
    $seenIds = [];
    $firstPageFingerprint = hash('sha256', json_encode($firstPage['data'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    for ($page = 1; $page <= $pageCount; $page++) {
        $response = $page === 1 ? $firstPage : $getPage($page);
        warehouseUniversityValidateEnvelope($response);
        if ($response['total'] !== $reportedTotal) {
            throw new RuntimeException('The university dataset total changed during pagination.');
        }

        $expectedRows = min(WAREHOUSE_UNIVERSITY_PAGE_SIZE, max(0, $reportedTotal - (($page - 1) * WAREHOUSE_UNIVERSITY_PAGE_SIZE)));
        if (count($response['data']) !== $expectedRows) {
            throw new RuntimeException('A university API page was incomplete or contained an unexpected number of rows.');
        }

        foreach ($response['data'] as $asset) {
            warehouseUniversityValidateAsset($asset);
            $assetId = (string)$asset['asset_id'];
            if (isset($seenIds[$assetId])) {
                throw new RuntimeException('The university dataset contains duplicate asset IDs.');
            }
            $seenIds[$assetId] = true;
            $assets[] = $asset;
        }
    }

    if (count($assets) !== $reportedTotal) {
        throw new RuntimeException('The number of validated university assets does not match the reported total.');
    }

    // The upstream API exposes no snapshot token. Re-read page one to detect common pagination shifts.
    $verificationPage = $getPage(1);
    warehouseUniversityValidateEnvelope($verificationPage);
    if ($verificationPage['total'] !== $reportedTotal
        || hash('sha256', json_encode($verificationPage['data'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)) !== $firstPageFingerprint) {
        throw new RuntimeException('The university dataset changed during import; no snapshot was saved. Please retry.');
    }

    return $assets;
}

function warehouseUniversityValidateEnvelope(mixed $response): void
{
    if (!is_array($response)
        || ($response['success'] ?? null) !== true
        || !array_key_exists('total', $response)
        || !is_int($response['total'])
        || $response['total'] < 0
        || !isset($response['data'])
        || !is_array($response['data'])
        || !array_is_list($response['data'])) {
        throw new RuntimeException('The university API returned an invalid response envelope.');
    }
}

function warehouseUniversityValidateAsset(mixed $asset): void
{
    if (!is_array($asset)) {
        throw new RuntimeException('The university API returned a non-object asset row.');
    }

    $requiredFields = [
        'asset_id', 'asset_code', 'asset_name', 'type_id', 'type_name', 'type_code',
        'category_id', 'brand', 'year_purchase', 'year_fiscal', 'source', 'asset_status',
        'location_id', 'department_id', 'department_name',
    ];
    foreach ($requiredFields as $field) {
        if (!array_key_exists($field, $asset)) {
            throw new RuntimeException('The university API omitted a field required by the warehouse ETL.');
        }
    }

    if (!is_int($asset['asset_id']) || $asset['asset_id'] < 1) {
        throw new RuntimeException('The university API returned an invalid asset ID.');
    }

    foreach (['type_id', 'category_id', 'location_id', 'department_id'] as $field) {
        if ($asset[$field] !== null && (!is_int($asset[$field]) || $asset[$field] < 0)) {
            throw new RuntimeException('The university API returned an invalid dimension ID.');
        }
    }

    foreach (['asset_code', 'asset_name', 'type_name', 'type_code', 'brand', 'year_purchase', 'year_fiscal', 'source', 'asset_status', 'department_name'] as $field) {
        $value = $asset[$field];
        if ($value !== null && !is_string($value) && !is_int($value) && !is_float($value)) {
            throw new RuntimeException('The university API returned an invalid text field.');
        }
        if (is_string($value) && preg_match('//u', $value) !== 1) {
            throw new RuntimeException('The university API returned invalid UTF-8 data.');
        }
    }
}

function warehouseUniversityFetchEndpointPage(string $endpointUrl, int $page): array
{
    $allowedUrls = [
        WAREHOUSE_UNIVERSITY_ASSET_URL,
        WAREHOUSE_UNIVERSITY_TYPE_URL,
        WAREHOUSE_UNIVERSITY_CATEGORY_URL,
        WAREHOUSE_UNIVERSITY_LOCAL_TYPE_URL,
        WAREHOUSE_UNIVERSITY_LOCAL_CATEGORY_URL,
    ];
    if ($page < 1 || !extension_loaded('curl') || !in_array($endpointUrl, $allowedUrls, true)) {
        throw new RuntimeException('Secure university API fetching is unavailable.');
    }

    $handle = curl_init($endpointUrl . '?limit=' . WAREHOUSE_UNIVERSITY_PAGE_SIZE . '&page=' . $page);
    if ($handle === false) {
        throw new RuntimeException('Unable to initialize the university API request.');
    }

    $body = '';
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$body): int {
            if (strlen($body) + strlen($chunk) > 2097152) {
                return 0;
            }
            $body .= $chunk;
            return strlen($chunk);
        },
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_USERAGENT => 'CPE-Asset-Warehouse-Snapshot-Importer/1.0',
    ]);
    $requestResult = curl_exec($handle);
    $status = (int)curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $errorNumber = curl_errno($handle);
    curl_close($handle);

    if ($requestResult !== true || $errorNumber !== 0 || $status !== 200) {
        throw new RuntimeException('The university API could not provide a complete page.');
    }

    try {
        $response = json_decode($body, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new RuntimeException('The university API returned invalid JSON.');
    }
    warehouseUniversityValidateEnvelope($response);
    return $response;
}

function warehouseUniversityFetchPage(int $page): array
{
    return warehouseUniversityFetchEndpointPage(WAREHOUSE_UNIVERSITY_ASSET_URL, $page);
}

function warehouseUniversityCollectReferenceRows(callable $fetchPage, string $idField, string $codeField, bool $codeRequired): array
{
    $firstPage = $fetchPage(1);
    warehouseUniversityValidateEnvelope($firstPage);
    $reportedTotal = $firstPage['total'];
    if ($reportedTotal > WAREHOUSE_UNIVERSITY_MAX_RECORDS) {
        throw new RuntimeException('A reference list exceeds the configured import limit.');
    }

    $pageCount = max(1, (int)ceil($reportedTotal / WAREHOUSE_UNIVERSITY_PAGE_SIZE));
    if ($pageCount > WAREHOUSE_UNIVERSITY_MAX_PAGES) {
        throw new RuntimeException('A reference list exceeds the configured page limit.');
    }

    $rows = [];
    $seenIds = [];
    $firstPageFingerprint = hash('sha256', json_encode($firstPage['data'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    for ($page = 1; $page <= $pageCount; $page++) {
        $response = $page === 1 ? $firstPage : $fetchPage($page);
        warehouseUniversityValidateEnvelope($response);
        if ($response['total'] !== $reportedTotal) {
            throw new RuntimeException('A reference-list total changed during pagination.');
        }

        $expectedRows = min(WAREHOUSE_UNIVERSITY_PAGE_SIZE, max(0, $reportedTotal - (($page - 1) * WAREHOUSE_UNIVERSITY_PAGE_SIZE)));
        if (count($response['data']) !== $expectedRows) {
            throw new RuntimeException('A reference-list page was incomplete or unexpected.');
        }

        foreach ($response['data'] as $row) {
            if (!is_array($row)
                || !array_key_exists($idField, $row)
                || !array_key_exists($codeField, $row)
                || !is_int($row[$idField])
                || $row[$idField] < 0) {
                throw new RuntimeException('A reference list contains an invalid row.');
            }
            $id = $row[$idField];
            $idKey = (string)$id;
            if (isset($seenIds[$idKey])) {
                throw new RuntimeException('A reference list contains duplicate IDs.');
            }
            $seenIds[$idKey] = true;

            $code = $row[$codeField];
            if ($code !== null && !is_string($code) && !is_int($code) && !is_float($code)) {
                throw new RuntimeException('A reference list contains an invalid code.');
            }
            $row[$codeField] = warehouseUniversityNormalizeText($code === null ? null : (string)$code);
            if ($codeRequired && $row[$codeField] === null) {
                throw new RuntimeException('A reference list contains an empty required code.');
            }
            $rows[] = $row;
        }
    }

    if (count($rows) !== $reportedTotal) {
        throw new RuntimeException('The validated reference-list count did not match its total.');
    }

    $verificationPage = $fetchPage(1);
    warehouseUniversityValidateEnvelope($verificationPage);
    if ($verificationPage['total'] !== $reportedTotal
        || hash('sha256', json_encode($verificationPage['data'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)) !== $firstPageFingerprint) {
        throw new RuntimeException('A reference list changed during collection; no snapshot was saved. Please retry.');
    }

    return $rows;
}

function warehouseUniversityLoadReferenceRows(string $referenceName): array
{
    $references = [
        'types' => [
            'path' => __DIR__ . '/../mock_api/asset_types.json',
            'id_field' => 'type_id',
            'code_field' => 'type_code',
            'environment' => 'CPE_UNIVERSITY_TYPE_API_URL',
            'default_url' => WAREHOUSE_UNIVERSITY_TYPE_URL,
            'local_url' => WAREHOUSE_UNIVERSITY_LOCAL_TYPE_URL,
        ],
        'categories' => [
            'path' => __DIR__ . '/../mock_api/asset_categories.json',
            'id_field' => 'category_id',
            'code_field' => 'category_code',
            'environment' => 'CPE_UNIVERSITY_CATEGORY_API_URL',
            'default_url' => WAREHOUSE_UNIVERSITY_CATEGORY_URL,
            'local_url' => WAREHOUSE_UNIVERSITY_LOCAL_CATEGORY_URL,
        ],
    ];
    if (!isset($references[$referenceName])) {
        throw new InvalidArgumentException('Unknown bundled asset reference list.');
    }

    $reference = $references[$referenceName];
    $configuredUrl = getenv($reference['environment']);
    if (is_string($configuredUrl) && trim($configuredUrl) !== '') {
        $configuredUrl = trim($configuredUrl);
        if (!in_array($configuredUrl, [$reference['default_url'], $reference['local_url']], true)) {
            throw new RuntimeException('A configured university reference endpoint is not allowed.');
        }
        $fetchPage = static fn(int $page): array => warehouseUniversityFetchEndpointPage($configuredUrl, $page);
        return warehouseUniversityCollectReferenceRows(
            $fetchPage,
            $reference['id_field'],
            $reference['code_field'],
            false,
        );
    }

    $contents = file_get_contents($reference['path']);
    if ($contents === false) {
        throw new RuntimeException('A bundled asset reference list is unavailable; no snapshot was saved.');
    }

    try {
        $payload = json_decode($contents, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new RuntimeException('A bundled asset reference list contains invalid JSON; no snapshot was saved.');
    }
    warehouseUniversityValidateEnvelope($payload);
    if (count($payload['data']) !== $payload['total']) {
        throw new RuntimeException('A bundled asset reference list is incomplete; no snapshot was saved.');
    }

    $fetchPage = static function (int $page) use ($payload): array {
        $offset = ($page - 1) * WAREHOUSE_UNIVERSITY_PAGE_SIZE;
        return [
            'success' => true,
            'total' => $payload['total'],
            'data' => array_slice($payload['data'], $offset, WAREHOUSE_UNIVERSITY_PAGE_SIZE),
        ];
    };

    return warehouseUniversityCollectReferenceRows(
        $fetchPage,
        $reference['id_field'],
        $reference['code_field'],
        false,
    );
}

function warehouseUniversityBuildTypeCodeMap(array $typeRows): array
{
    $typeCodeById = [];
    foreach ($typeRows as $row) {
        $typeCode = warehouseUniversityNormalizeText($row['type_code'] ?? null);
        if ($typeCode !== null) {
            $typeCodeById[$row['type_id']] = strtoupper($typeCode);
        }
    }
    return $typeCodeById;
}

function warehouseUniversityBuildCategoryMaps(array $categoryRows): array
{
    if ($categoryRows === []) {
        throw new RuntimeException('The reference data contains no asset categories.');
    }

    $categoryById = [];
    $categoryByCode = [];
    foreach ($categoryRows as $row) {
        $categoryId = $row['category_id'];
        $categoryCode = $row['category_code'];
        if (($categoryCode !== null
                && (!is_string($categoryCode) || preg_match('/^\d{2}$/D', $categoryCode) !== 1))
            || isset($categoryById[$categoryId])
            || ($categoryCode !== null && isset($categoryByCode[$categoryCode]))) {
            throw new RuntimeException('The reference data contains an invalid or duplicate category mapping.');
        }

        $category = [
            'category_id' => $categoryId,
            'category_code' => $categoryCode,
            'category_name' => warehouseUniversityNormalizeText($row['category_name_th'] ?? null),
        ];
        $categoryById[$categoryId] = $category;
        if ($categoryCode !== null) {
            $categoryByCode[$categoryCode] = $category;
        }
    }

    return [$categoryById, $categoryByCode];
}

function warehouseUniversityResolveCategory(array $asset, array $typeCodeById, array $categoryById, array $categoryByCode): array
{
    $categoryId = $asset['category_id'];
    if ($categoryId !== null) {
        return $categoryById[$categoryId] ?? [
            'category_id' => $categoryId,
            'category_code' => null,
            'category_name' => null,
        ];
    }

    $typeCode = warehouseUniversityNormalizeText($asset['type_code']);
    if ($typeCode === null && $asset['type_id'] !== null) {
        $typeCode = $typeCodeById[$asset['type_id']] ?? null;
    }
    if ($typeCode === null || preg_match('/^[A-Z]{2}(\d{2})$/D', strtoupper($typeCode), $matches) !== 1) {
        throw new RuntimeException('An asset with no category ID has no mappable type code; no snapshot was saved.');
    }

    $category = $categoryByCode[$matches[1]] ?? null;
    if (!is_array($category)) {
        throw new RuntimeException('An asset type code has no matching category; no snapshot was saved.');
    }
    return $category;
}

function warehouseUniversityUuidV4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4)
        . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
}

function warehouseUniversityNormalizeText(mixed $value): ?string
{
    if ($value === null || trim((string)$value) === '') {
        return null;
    }
    $normalized = preg_replace('/[\s\x{00A0}]+/u', ' ', trim((string)$value));
    if (!is_string($normalized) || preg_match('//u', $normalized) !== 1) {
        throw new RuntimeException('A university asset field could not be normalized.');
    }
    return $normalized;
}

function warehouseUniversityFiscalYearFromCode(?string $assetCode): ?int
{
    foreach (['~/\d{3}-(\d{2})\s*$~u', '~/[ก-๙]{1,3}\.?-?(\d{2})-\d+\s*$~u'] as $pattern) {
        if (preg_match($pattern, $assetCode ?? '', $matches) === 1) {
            $fiscalYear = 2500 + (int)$matches[1];
            if ($fiscalYear >= 2530 && $fiscalYear <= 2600) {
                return $fiscalYear;
            }
        }
    }
    return null;
}

function warehouseUniversityAcquisitionDate(array $asset): ?DateTimeImmutable
{
    $purchaseDate = $asset['purchase_date'] ?? null;
    if (is_string($purchaseDate) && $purchaseDate !== '') {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', substr($purchaseDate, 0, 10));
        return $date === false ? null : $date;
    }

    $fiscalYear = warehouseUniversityFiscalYearFromCode(warehouseUniversityNormalizeText($asset['asset_code'] ?? null));
    if ($fiscalYear !== null) {
        return new DateTimeImmutable(($fiscalYear - 544) . '-10-01');
    }

    $purchaseYear = warehouseUniversityNormalizeText($asset['year_purchase'] ?? null);
    if ($purchaseYear !== null && ctype_digit($purchaseYear) && (int)$purchaseYear >= 1950 && (int)$purchaseYear <= 2100) {
        return new DateTimeImmutable($purchaseYear . '-01-01');
    }
    return null;
}

function warehouseUniversitySameOriginRequestAllowed(array $server): bool
{
    $host = strtolower((string)($server['HTTP_HOST'] ?? ''));
    $origin = (string)($server['HTTP_ORIGIN'] ?? '');
    $fetchSite = strtolower((string)($server['HTTP_SEC_FETCH_SITE'] ?? ''));
    $customHeader = (string)($server['HTTP_X_CPE_SNAPSHOT_IMPORT'] ?? '');

    if ($host === ''
        || $customHeader !== '1'
        || ($fetchSite !== '' && $fetchSite !== 'same-origin')) {
        return false;
    }

    $originParts = parse_url($origin);
    $hostParts = parse_url('http://' . $host);
    $serverScheme = !empty($server['HTTPS']) && strtolower((string)$server['HTTPS']) !== 'off' ? 'https' : 'http';
    if (!is_array($originParts)
        || !is_array($hostParts)
        || !isset($originParts['scheme'], $originParts['host'])
        || !in_array(strtolower($originParts['scheme']), ['http', 'https'], true)
        || !isset($hostParts['host'])
        || isset($originParts['user']) || isset($originParts['pass'])
        || isset($originParts['path']) || isset($originParts['query']) || isset($originParts['fragment'])
        || (isset($originParts['port']) && ($originParts['port'] < 1 || $originParts['port'] > 65535))
        || (isset($hostParts['port']) && ($hostParts['port'] < 1 || $hostParts['port'] > 65535))) {
        return false;
    }

    $originScheme = strtolower($originParts['scheme']);
    $originPort = $originParts['port'] ?? ($originScheme === 'https' ? 443 : 80);
    $hostPort = $hostParts['port'] ?? ($serverScheme === 'https' ? 443 : 80);
    return $originScheme === $serverScheme
        && strtolower($originParts['host']) === strtolower($hostParts['host'])
        && $originPort === $hostPort;
}

function warehouseUniversityWriteArchive(string $directory, array $snapshot): string
{
    if (!is_dir($directory) && !mkdir($directory, 0770, true) && !is_dir($directory)) {
        throw new RuntimeException('Unable to create the local snapshot archive directory.');
    }

    $fileName = 'assets_' . str_replace('-', '', $snapshot['snapshot_date']) . '__' . $snapshot['snapshot_id'] . '.json';
    $targetPath = $directory . DIRECTORY_SEPARATOR . $fileName;
    $temporaryPath = $targetPath . '.tmp';
    $encoded = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRETTY_PRINT);
    if (!is_string($encoded) || file_put_contents($temporaryPath, $encoded . "\n", LOCK_EX) === false) {
        throw new RuntimeException('Unable to write the local snapshot archive.');
    }
    if (!rename($temporaryPath, $targetPath)) {
        @unlink($temporaryPath);
        throw new RuntimeException('Unable to finalize the local snapshot archive.');
    }
    return $fileName;
}
