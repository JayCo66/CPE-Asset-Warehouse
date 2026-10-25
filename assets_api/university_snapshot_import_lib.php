<?php
declare(strict_types=1);

const WAREHOUSE_UNIVERSITY_ASSET_URL = 'https://cpe.eng.kps.ku.ac.th/CPEAssets/assets_api/assets.php';
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

function warehouseUniversityFetchPage(int $page): array
{
    if ($page < 1 || !extension_loaded('curl')) {
        throw new RuntimeException('Secure university API fetching is unavailable.');
    }

    $handle = curl_init(WAREHOUSE_UNIVERSITY_ASSET_URL . '?limit=' . WAREHOUSE_UNIVERSITY_PAGE_SIZE . '&page=' . $page);
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

function warehouseUniversityLocalRequestAllowed(array $server): bool
{
    $remoteAddress = strtolower((string)($server['REMOTE_ADDR'] ?? ''));
    $host = strtolower((string)($server['HTTP_HOST'] ?? ''));
    $origin = (string)($server['HTTP_ORIGIN'] ?? '');
    $fetchSite = strtolower((string)($server['HTTP_SEC_FETCH_SITE'] ?? ''));
    $customHeader = (string)($server['HTTP_X_CPE_SNAPSHOT_IMPORT'] ?? '');

    if (!in_array($remoteAddress, ['127.0.0.1', '::1', '::ffff:127.0.0.1'], true)
        || preg_match('/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/D', $host) !== 1
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
        || !in_array(strtolower($originParts['host']), ['localhost', '127.0.0.1', '::1'], true)
        || !in_array(strtolower((string)($hostParts['host'] ?? '')), ['localhost', '127.0.0.1', '::1'], true)
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
