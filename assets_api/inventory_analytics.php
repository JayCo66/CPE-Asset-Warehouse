<?php
declare(strict_types=1);

function warehouseInventoryAnalyticsAgeBand(mixed $age): string
{
    if ($age === null || !is_numeric($age) || (int)$age < 0) {
        return 'unknown';
    }

    $years = (int)$age;
    return match (true) {
        $years <= 2 => '0-2',
        $years <= 5 => '3-5',
        $years <= 10 => '6-10',
        $years <= 15 => '11-15',
        $years <= 20 => '16-20',
        default => 'over-20',
    };
}

function warehouseInventoryAnalyticsCreate(int $ageThreshold): array
{
    $ageBands = ['0-2', '3-5', '6-10', '11-15', '16-20', 'over-20', 'unknown'];
    $availabilityStates = ['available', 'unavailable', 'unknown'];
    $damageStates = ['damaged', 'notDamaged', 'unknown'];
    $qualityFields = [
        'assetCode' => ['รหัสสินทรัพย์', 'essential'],
        'assetName' => ['ชื่อสินทรัพย์', 'essential'],
        'brand' => ['ยี่ห้อ', 'supporting'],
        'model' => ['รุ่น', 'supporting'],
        'purchaseYear' => ['ปีที่จัดซื้อ', 'supporting'],
        'fiscalYear' => ['ปีงบประมาณ', 'supporting'],
        'source' => ['แหล่งเงิน', 'supporting'],
        'assetStatus' => ['สถานะสินทรัพย์', 'supporting'],
        'department' => ['หน่วยงาน', 'essential'],
        'location' => ['การระบุตำแหน่ง', 'supporting'],
        'building' => ['อาคาร', 'supporting'],
        'floor' => ['ชั้น', 'supporting'],
        'room' => ['ห้อง', 'supporting'],
        'area' => ['พื้นที่', 'supporting'],
    ];

    $state = [
        'ageThreshold' => $ageThreshold,
        'metrics' => warehouseInventoryAnalyticsEmptyMetrics(),
        'groups' => [
            'departments' => [], 'categories' => [], 'types' => [], 'buildings' => [],
            'floors' => [], 'rooms' => [], 'sources' => [], 'acquisitionYears' => [],
            'fiscalYears' => [], 'departmentCategory' => [], 'departmentType' => [],
            'departmentBuilding' => [], 'categoryBuilding' => [], 'sourceDepartment' => [],
            'sourceCategory' => [], 'yearDepartment' => [], 'yearCategory' => [],
            'yearType' => [], 'yearSource' => [], 'fiscalDepartment' => [],
            'fiscalCategory' => [], 'fiscalType' => [],
        ],
        'ageDistribution' => array_fill_keys($ageBands, 0),
        'ageByDepartment' => [], 'ageByCategory' => [], 'ageByType' => [],
        'ageAvailability' => [], 'ageDamage' => [],
        'statusDistribution' => [],
        'availabilityDistribution' => array_fill_keys($availabilityStates, 0),
        'damageDistribution' => array_fill_keys($damageStates, 0),
        'qualityFields' => [], 'qualityByDepartment' => [],
        'attentionAreas' => [
            'damaged' => 0, 'unavailable' => 0, 'old' => 0, 'missingLocation' => 0,
            'oldDamaged' => 0, 'oldUnavailable' => 0, 'oldMissingLocation' => 0,
            'missingCriticalMetadata' => 0,
        ],
        'exceptions' => [], 'exceptionsTotal' => 0,
    ];

    foreach ($qualityFields as $key => [$label, $tier]) {
        $state['qualityFields'][$key] = [
            'label' => $label,
            'tier' => $tier,
            'assets' => 0,
            'missingAssets' => 0,
        ];
    }

    foreach ($ageBands as $band) {
        $state['ageAvailability'][$band] = array_fill_keys($availabilityStates, 0);
        $state['ageDamage'][$band] = array_fill_keys($damageStates, 0);
    }

    return $state;
}

function warehouseInventoryAnalyticsEmptyMetrics(): array
{
    return [
        'total' => 0,
        'available' => 0,
        'unavailable' => 0,
        'availabilityUnknown' => 0,
        'damaged' => 0,
        'notDamaged' => 0,
        'damageUnknown' => 0,
        'missingLocation' => 0,
        'locationAssigned' => 0,
        'locationUnknown' => 0,
        'locationComplete' => 0,
        'locationIncomplete' => 0,
        'ageWeightedTotal' => 0,
        'ageKnownAssets' => 0,
        'olderThanThreshold' => 0,
        'oldAndDamaged' => 0,
        'oldAndUnavailable' => 0,
        'oldAndMissingLocation' => 0,
    ];
}

function warehouseInventoryAnalyticsFlag(mixed $value): ?int
{
    if ($value === 1 || $value === '1') {
        return 1;
    }
    if ($value === 0 || $value === '0') {
        return 0;
    }
    return null;
}

function warehouseInventoryAnalyticsIsMissing(mixed $value): bool
{
    return $value === null || trim((string)$value) === '';
}

function warehouseInventoryAnalyticsAddMetrics(array &$metrics, array $row, int $weight, int $ageThreshold): void
{
    if ($weight === 0) {
        return;
    }

    $available = warehouseInventoryAnalyticsFlag($row['is_available_flag'] ?? null);
    $damaged = warehouseInventoryAnalyticsFlag($row['is_damaged_flag'] ?? null);
    $hasLocation = warehouseInventoryAnalyticsFlag($row['has_location_flag'] ?? null);
    $age = $row['asset_age_years'] ?? null;
    $knownAge = $age !== null && is_numeric($age) && (int)$age >= 0;
    $old = $knownAge && (int)$age > $ageThreshold;
    $locationComplete = $hasLocation === 1
        && !warehouseInventoryAnalyticsIsMissing($row['building'] ?? null)
        && !warehouseInventoryAnalyticsIsMissing($row['floor'] ?? null)
        && !warehouseInventoryAnalyticsIsMissing($row['room'] ?? null)
        && !warehouseInventoryAnalyticsIsMissing($row['area_name'] ?? null);

    $metrics['total'] += $weight;
    if ($available === 1) {
        $metrics['available'] += $weight;
    } elseif ($available === 0) {
        $metrics['unavailable'] += $weight;
    } else {
        $metrics['availabilityUnknown'] += $weight;
    }

    if ($damaged === 1) {
        $metrics['damaged'] += $weight;
    } elseif ($damaged === 0) {
        $metrics['notDamaged'] += $weight;
    } else {
        $metrics['damageUnknown'] += $weight;
    }

    if ($hasLocation === 1) {
        $metrics['locationAssigned'] += $weight;
        $metrics[$locationComplete ? 'locationComplete' : 'locationIncomplete'] += $weight;
    } elseif ($hasLocation === 0) {
        $metrics['missingLocation'] += $weight;
    } else {
        $metrics['locationUnknown'] += $weight;
    }

    if ($knownAge) {
        $metrics['ageWeightedTotal'] += (int)$age * $weight;
        $metrics['ageKnownAssets'] += $weight;
    }
    if ($old) {
        $metrics['olderThanThreshold'] += $weight;
        if ($damaged === 1) {
            $metrics['oldAndDamaged'] += $weight;
        }
        if ($available === 0) {
            $metrics['oldAndUnavailable'] += $weight;
        }
        if ($hasLocation === 0) {
            $metrics['oldAndMissingLocation'] += $weight;
        }
    }
}

function warehouseInventoryAnalyticsDimension(array $row, string $keyField, string $nameField, string $unknownLabel): array
{
    $id = $row[$keyField] ?? null;
    $name = $row[$nameField] ?? null;
    $nameIsMissing = warehouseInventoryAnalyticsIsMissing($name);
    $key = $id === null || $id === '' || $nameIsMissing ? '__unknown__' : (string)$id;
    $label = $nameIsMissing ? $unknownLabel : trim((string)$name);
    return [$key, $label];
}

function warehouseInventoryAnalyticsDimensionFilterValue(string $key, string $label): string
{
    return $key === '__unknown__' ? '__missing__' : $label;
}

function warehouseInventoryAnalyticsAddGroup(
    array &$groups,
    string $key,
    string $label,
    array $row,
    int $weight,
    int $ageThreshold,
    ?string $filterValue = null,
    ?array $drillFilters = null
): void {
    if (!isset($groups[$key])) {
        $groups[$key] = [
            'key' => $key,
            'label' => $label,
            'filterValue' => $filterValue,
            'drillFilters' => $drillFilters,
            'metrics' => warehouseInventoryAnalyticsEmptyMetrics(),
        ];
    }
    warehouseInventoryAnalyticsAddMetrics($groups[$key]['metrics'], $row, $weight, $ageThreshold);
}

function warehouseInventoryAnalyticsAddCombo(
    array &$groups,
    string $key,
    string $firstLabel,
    string $secondLabel,
    string $firstFilterValue,
    string $secondFilterValue,
    array $row,
    int $weight,
    int $ageThreshold
): void {
    if (!isset($groups[$key])) {
        $groups[$key] = [
            'first' => $firstLabel,
            'second' => $secondLabel,
            'firstFilterValue' => $firstFilterValue,
            'secondFilterValue' => $secondFilterValue,
            'metrics' => warehouseInventoryAnalyticsEmptyMetrics(),
        ];
    }
    warehouseInventoryAnalyticsAddMetrics($groups[$key]['metrics'], $row, $weight, $ageThreshold);
}

function warehouseInventoryAnalyticsConsume(array &$state, array $row): void
{
    $rawWeight = $row['asset_count'] ?? null;
    $weight = $rawWeight !== null && is_numeric($rawWeight) ? (int)$rawWeight : 0;
    if ($weight === 0) {
        return;
    }

    $threshold = $state['ageThreshold'];
    $age = $row['asset_age_years'] ?? null;
    $band = warehouseInventoryAnalyticsAgeBand($age);
    $available = warehouseInventoryAnalyticsFlag($row['is_available_flag'] ?? null);
    $damaged = warehouseInventoryAnalyticsFlag($row['is_damaged_flag'] ?? null);
    $hasLocation = warehouseInventoryAnalyticsFlag($row['has_location_flag'] ?? null);
    $old = $age !== null && is_numeric($age) && (int)$age > $threshold;

    warehouseInventoryAnalyticsAddMetrics($state['metrics'], $row, $weight, $threshold);
    $state['ageDistribution'][$band] += $weight;
    $availabilityKey = $available === 1 ? 'available' : ($available === 0 ? 'unavailable' : 'unknown');
    $damageKey = $damaged === 1 ? 'damaged' : ($damaged === 0 ? 'notDamaged' : 'unknown');
    $state['availabilityDistribution'][$availabilityKey] += $weight;
    $state['damageDistribution'][$damageKey] += $weight;
    $state['ageAvailability'][$band][$availabilityKey] += $weight;
    $state['ageDamage'][$band][$damageKey] += $weight;

    $status = warehouseInventoryAnalyticsIsMissing($row['asset_status'] ?? null)
        ? '__missing__'
        : trim((string)$row['asset_status']);
    $state['statusDistribution'][$status] = ($state['statusDistribution'][$status] ?? 0) + $weight;

    [$departmentKey, $departmentLabel] = warehouseInventoryAnalyticsDimension($row, 'department_key', 'department_name', 'ไม่ระบุหน่วยงาน');
    [$categoryKey, $categoryLabel] = warehouseInventoryAnalyticsDimension($row, 'category_key', 'category_name', 'ไม่ระบุหมวดหมู่');
    [$typeKey, $typeLabel] = warehouseInventoryAnalyticsDimension($row, 'type_key', 'type_name', 'ไม่ระบุประเภท');
    [$buildingKey, $buildingLabel] = warehouseInventoryAnalyticsDimension($row, 'building', 'building', 'ไม่ระบุอาคาร');
    [$sourceKey, $sourceLabel] = warehouseInventoryAnalyticsDimension($row, 'source', 'source', 'ไม่ระบุแหล่งเงิน');
    [$yearKey, $yearLabel] = warehouseInventoryAnalyticsDimension($row, 'acquisition_year', 'acquisition_year', 'ไม่ระบุปีจัดหา');
    [$fiscalKey, $fiscalLabel] = warehouseInventoryAnalyticsDimension($row, 'acquisition_fiscal_year', 'acquisition_fiscal_year', 'ไม่ระบุปีงบประมาณจัดหา');

    $floor = warehouseInventoryAnalyticsIsMissing($row['floor'] ?? null) ? 'ไม่ระบุชั้น' : trim((string)$row['floor']);
    $room = warehouseInventoryAnalyticsIsMissing($row['room'] ?? null) ? 'ไม่ระบุห้อง' : trim((string)$row['room']);
    $area = warehouseInventoryAnalyticsIsMissing($row['area_name'] ?? null) ? 'ไม่ระบุพื้นที่' : trim((string)$row['area_name']);
    $buildingFloorKey = $buildingKey . '|' . $floor;
    $roomKey = $buildingFloorKey . '|' . $room . '|' . $area;

    warehouseInventoryAnalyticsAddGroup($state['groups']['departments'], $departmentKey, $departmentLabel, $row, $weight, $threshold, warehouseInventoryAnalyticsDimensionFilterValue($departmentKey, $departmentLabel));
    warehouseInventoryAnalyticsAddGroup($state['groups']['categories'], $categoryKey, $categoryLabel, $row, $weight, $threshold, warehouseInventoryAnalyticsDimensionFilterValue($categoryKey, $categoryLabel));
    warehouseInventoryAnalyticsAddGroup($state['groups']['types'], $typeKey, $typeLabel, $row, $weight, $threshold, warehouseInventoryAnalyticsDimensionFilterValue($typeKey, $typeLabel));
    warehouseInventoryAnalyticsAddGroup($state['groups']['buildings'], $buildingKey, $buildingLabel, $row, $weight, $threshold, warehouseInventoryAnalyticsDimensionFilterValue($buildingKey, $buildingLabel));
    warehouseInventoryAnalyticsAddGroup($state['groups']['floors'], $buildingFloorKey, $buildingLabel . ' · ชั้น ' . $floor, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddGroup(
        $state['groups']['rooms'],
        $roomKey,
        $buildingLabel . ' · ชั้น ' . $floor . ' · ห้อง ' . $room . ' · ' . $area,
        $row,
        $weight,
        $threshold,
        warehouseInventoryAnalyticsIsMissing($row['room'] ?? null) ? '__missing__' : trim((string)$row['room']),
        [
            'building' => warehouseInventoryAnalyticsDimensionFilterValue($buildingKey, $buildingLabel),
            'floor' => warehouseInventoryAnalyticsIsMissing($row['floor'] ?? null) ? '__missing__' : trim((string)$row['floor']),
            'room' => warehouseInventoryAnalyticsIsMissing($row['room'] ?? null) ? '__missing__' : trim((string)$row['room']),
            'area' => warehouseInventoryAnalyticsIsMissing($row['area_name'] ?? null) ? '__missing__' : trim((string)$row['area_name']),
        ],
    );
    warehouseInventoryAnalyticsAddGroup($state['groups']['sources'], $sourceKey, $sourceLabel, $row, $weight, $threshold, warehouseInventoryAnalyticsDimensionFilterValue($sourceKey, $sourceLabel));
    warehouseInventoryAnalyticsAddGroup($state['groups']['acquisitionYears'], $yearKey, $yearLabel, $row, $weight, $threshold, warehouseInventoryAnalyticsDimensionFilterValue($yearKey, $yearLabel));
    warehouseInventoryAnalyticsAddGroup($state['groups']['fiscalYears'], $fiscalKey, $fiscalLabel, $row, $weight, $threshold, warehouseInventoryAnalyticsDimensionFilterValue($fiscalKey, $fiscalLabel));

    $departmentBucket =& $state['groups']['departments'][$departmentKey];
    $departmentBucket['categoryKeys'][$categoryKey] = true;
    $departmentBucket['typeKeys'][$typeKey] = true;
    unset($departmentBucket);

    $departmentFilterValue = warehouseInventoryAnalyticsDimensionFilterValue($departmentKey, $departmentLabel);
    $categoryFilterValue = warehouseInventoryAnalyticsDimensionFilterValue($categoryKey, $categoryLabel);
    $typeFilterValue = warehouseInventoryAnalyticsDimensionFilterValue($typeKey, $typeLabel);
    $buildingFilterValue = warehouseInventoryAnalyticsDimensionFilterValue($buildingKey, $buildingLabel);
    $sourceFilterValue = warehouseInventoryAnalyticsDimensionFilterValue($sourceKey, $sourceLabel);
    $yearFilterValue = warehouseInventoryAnalyticsDimensionFilterValue($yearKey, $yearLabel);
    $fiscalFilterValue = warehouseInventoryAnalyticsDimensionFilterValue($fiscalKey, $fiscalLabel);
    warehouseInventoryAnalyticsAddCombo($state['groups']['departmentCategory'], $departmentKey . '|' . $categoryKey, $departmentLabel, $categoryLabel, $departmentFilterValue, $categoryFilterValue, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddCombo($state['groups']['departmentType'], $departmentKey . '|' . $typeKey, $departmentLabel, $typeLabel, $departmentFilterValue, $typeFilterValue, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddCombo($state['groups']['departmentBuilding'], $departmentKey . '|' . $buildingKey, $departmentLabel, $buildingLabel, $departmentFilterValue, $buildingFilterValue, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddCombo($state['groups']['categoryBuilding'], $categoryKey . '|' . $buildingKey, $categoryLabel, $buildingLabel, $categoryFilterValue, $buildingFilterValue, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddCombo($state['groups']['sourceDepartment'], $sourceKey . '|' . $departmentKey, $sourceLabel, $departmentLabel, $sourceFilterValue, $departmentFilterValue, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddCombo($state['groups']['sourceCategory'], $sourceKey . '|' . $categoryKey, $sourceLabel, $categoryLabel, $sourceFilterValue, $categoryFilterValue, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddCombo($state['groups']['yearDepartment'], $yearKey . '|' . $departmentKey, $yearLabel, $departmentLabel, $yearFilterValue, $departmentFilterValue, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddCombo($state['groups']['yearCategory'], $yearKey . '|' . $categoryKey, $yearLabel, $categoryLabel, $yearFilterValue, $categoryFilterValue, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddCombo($state['groups']['yearType'], $yearKey . '|' . $typeKey, $yearLabel, $typeLabel, $yearFilterValue, $typeFilterValue, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddCombo($state['groups']['yearSource'], $yearKey . '|' . $sourceKey, $yearLabel, $sourceLabel, $yearFilterValue, $sourceFilterValue, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddCombo($state['groups']['fiscalDepartment'], $fiscalKey . '|' . $departmentKey, $fiscalLabel, $departmentLabel, $fiscalFilterValue, $departmentFilterValue, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddCombo($state['groups']['fiscalCategory'], $fiscalKey . '|' . $categoryKey, $fiscalLabel, $categoryLabel, $fiscalFilterValue, $categoryFilterValue, $row, $weight, $threshold);
    warehouseInventoryAnalyticsAddCombo($state['groups']['fiscalType'], $fiscalKey . '|' . $typeKey, $fiscalLabel, $typeLabel, $fiscalFilterValue, $typeFilterValue, $row, $weight, $threshold);

    warehouseInventoryAnalyticsAddGroup($state['ageByDepartment'], $departmentKey . '|' . $band, $departmentLabel . '|' . $band, $row, $weight, $threshold, $departmentFilterValue);
    warehouseInventoryAnalyticsAddGroup($state['ageByCategory'], $categoryKey . '|' . $band, $categoryLabel . '|' . $band, $row, $weight, $threshold, $categoryFilterValue);
    warehouseInventoryAnalyticsAddGroup($state['ageByType'], $typeKey . '|' . $band, $typeLabel . '|' . $band, $row, $weight, $threshold, $typeFilterValue);

    $qualityChecks = [
        'assetCode' => warehouseInventoryAnalyticsIsMissing($row['asset_code'] ?? null),
        'assetName' => warehouseInventoryAnalyticsIsMissing($row['asset_name'] ?? null),
        'brand' => warehouseInventoryAnalyticsIsMissing($row['brand'] ?? null),
        'model' => warehouseInventoryAnalyticsIsMissing($row['model'] ?? null),
        'purchaseYear' => warehouseInventoryAnalyticsIsMissing($row['year_purchase'] ?? null),
        'fiscalYear' => warehouseInventoryAnalyticsIsMissing($row['year_fiscal'] ?? null),
        'source' => warehouseInventoryAnalyticsIsMissing($row['source'] ?? null),
        'assetStatus' => warehouseInventoryAnalyticsIsMissing($row['asset_status'] ?? null),
        'department' => warehouseInventoryAnalyticsIsMissing($row['department_key'] ?? null) || warehouseInventoryAnalyticsIsMissing($row['department_name'] ?? null),
        'location' => $hasLocation !== 1 || warehouseInventoryAnalyticsIsMissing($row['location_key'] ?? null),
        'building' => warehouseInventoryAnalyticsIsMissing($row['building'] ?? null),
        'floor' => warehouseInventoryAnalyticsIsMissing($row['floor'] ?? null),
        'room' => warehouseInventoryAnalyticsIsMissing($row['room'] ?? null),
        'area' => warehouseInventoryAnalyticsIsMissing($row['area_name'] ?? null),
    ];
    foreach ($qualityChecks as $field => $missing) {
        $state['qualityFields'][$field]['assets'] += $weight;
        if ($missing) {
            $state['qualityFields'][$field]['missingAssets'] += $weight;
        }
    }
    $qualityGroup = $state['qualityByDepartment'][$departmentKey] ?? [
        'department' => $departmentLabel,
        'departmentFilterValue' => $departmentFilterValue,
        'totalAssets' => 0,
        'missingCriticalMetadata' => 0,
        'missingByField' => array_fill_keys(array_keys($qualityChecks), 0),
    ];
    $qualityGroup['totalAssets'] += $weight;
    $criticalMissing = $qualityChecks['assetCode'] || $qualityChecks['assetName'] || $qualityChecks['department'];
    if ($criticalMissing) {
        $qualityGroup['missingCriticalMetadata'] += $weight;
    }
    foreach ($qualityChecks as $field => $missing) {
        if ($missing) {
            $qualityGroup['missingByField'][$field] += $weight;
        }
    }
    $state['qualityByDepartment'][$departmentKey] = $qualityGroup;

    $missingLocation = $hasLocation === 0;
    $missingCritical = $qualityChecks['assetCode'] || $qualityChecks['assetName'] || $qualityChecks['department'];
    if ($damaged === 1) $state['attentionAreas']['damaged'] += $weight;
    if ($available === 0) $state['attentionAreas']['unavailable'] += $weight;
    if ($old) $state['attentionAreas']['old'] += $weight;
    if ($missingLocation) $state['attentionAreas']['missingLocation'] += $weight;
    if ($old && $damaged === 1) $state['attentionAreas']['oldDamaged'] += $weight;
    if ($old && $available === 0) $state['attentionAreas']['oldUnavailable'] += $weight;
    if ($old && $missingLocation) $state['attentionAreas']['oldMissingLocation'] += $weight;
    if ($missingCritical) $state['attentionAreas']['missingCriticalMetadata'] += $weight;

    $reasons = warehouseInventoryAnalyticsAttentionReasons($row, $qualityChecks, $threshold);
    if ($reasons !== []) {
        $state['exceptionsTotal'] += $weight;
        $priority = warehouseInventoryAnalyticsPriority($row, $qualityChecks, $old, $missingLocation);
        $state['exceptions'][] = [
            'priority' => $priority,
            'assetId' => $row['asset_id'] ?? null,
            'assetCode' => $row['asset_code'] ?? null,
            'assetName' => $row['asset_name'] ?? null,
            'department' => $departmentLabel,
            'category' => $categoryLabel,
            'type' => $typeLabel,
            'age' => $age === null || !is_numeric($age) ? null : (int)$age,
            'status' => $row['asset_status'] ?? null,
            'availability' => $available === 1 ? 'พร้อมใช้งาน' : ($available === 0 ? 'ไม่พร้อมใช้งาน' : 'ไม่ระบุ'),
            'damaged' => $damaged === 1 ? 'ชำรุด' : ($damaged === 0 ? 'ไม่ชำรุด' : 'ไม่ระบุ'),
            'location' => warehouseInventoryAnalyticsLocationLabel($row),
            'attentionReason' => implode(' · ', $reasons),
            '_priorityOrder' => $priority === 'สูง' ? 1 : ($priority === 'ควรตรวจสอบ' ? 2 : 3),
        ];
    }
}

function warehouseInventoryAnalyticsLocationLabel(array $row): string
{
    $parts = [];
    foreach (['building', 'floor', 'room', 'area_name'] as $field) {
        if (!warehouseInventoryAnalyticsIsMissing($row[$field] ?? null)) {
            $parts[] = trim((string)$row[$field]);
        }
    }
    return $parts === [] ? 'ไม่ระบุตำแหน่ง' : implode(' · ', $parts);
}

function warehouseInventoryAnalyticsAttentionReasons(array $row, array $qualityChecks, int $ageThreshold): array
{
    $available = warehouseInventoryAnalyticsFlag($row['is_available_flag'] ?? null);
    $damaged = warehouseInventoryAnalyticsFlag($row['is_damaged_flag'] ?? null);
    $hasLocation = warehouseInventoryAnalyticsFlag($row['has_location_flag'] ?? null);
    $age = $row['asset_age_years'] ?? null;
    $old = $age !== null && is_numeric($age) && (int)$age > $ageThreshold;
    $reasons = [];

    if ($old && $damaged === 1) {
        $reasons[] = 'อายุเกิน ' . $ageThreshold . ' ปี + ชำรุด';
    } elseif ($damaged === 1) {
        $reasons[] = 'ชำรุด';
    }
    if ($old && $available === 0) {
        $reasons[] = 'อายุเกิน ' . $ageThreshold . ' ปี + ไม่พร้อมใช้งาน';
    } elseif ($available === 0 && !($old && $damaged === 1)) {
        $reasons[] = 'ไม่พร้อมใช้งาน';
    }
    if ($old && $hasLocation === 0) {
        $reasons[] = 'อายุเกิน ' . $ageThreshold . ' ปี + ไม่มีตำแหน่ง';
    } elseif ($hasLocation === 0 && !$old) {
        $reasons[] = 'ไม่มีตำแหน่ง';
    }
    if ($old && !in_array($damaged, [1], true) && $available !== 0 && $hasLocation !== 0) {
        $reasons[] = 'อายุเกิน ' . $ageThreshold . ' ปี';
    }
    if ($qualityChecks['assetCode'] || $qualityChecks['assetName'] || $qualityChecks['department']) {
        $reasons[] = 'ข้อมูลสำคัญไม่ครบ (รหัส ชื่อ หรือหน่วยงาน)';
    }
    return $reasons;
}

function warehouseInventoryAnalyticsPriority(array $row, array $qualityChecks, bool $old, bool $missingLocation): string
{
    $available = warehouseInventoryAnalyticsFlag($row['is_available_flag'] ?? null);
    $damaged = warehouseInventoryAnalyticsFlag($row['is_damaged_flag'] ?? null);
    $missingCritical = $qualityChecks['assetCode'] || $qualityChecks['assetName'] || $qualityChecks['department'];
    if ($missingCritical || ($damaged === 1 && $available === 0)) {
        return 'สูง';
    }
    if ($damaged === 1 || $available === 0 || ($old && $missingLocation)) {
        return 'ควรตรวจสอบ';
    }
    return 'ติดตาม';
}

function warehouseInventoryAnalyticsRate(int|float $numerator, int|float $denominator): ?float
{
    return $denominator > 0 ? round(($numerator / $denominator) * 100, 1) : null;
}

function warehouseInventoryAnalyticsMetricOutput(array $metrics): array
{
    $total = (int)$metrics['total'];
    $ageKnown = (int)$metrics['ageKnownAssets'];
    $ageAverage = $ageKnown > 0 ? round($metrics['ageWeightedTotal'] / $ageKnown, 1) : null;
    return [
        'totalAssets' => $total,
        'availableAssets' => (int)$metrics['available'],
        'availabilityRate' => warehouseInventoryAnalyticsRate($metrics['available'], $total),
        'unavailableAssets' => (int)$metrics['unavailable'],
        'unavailableRate' => warehouseInventoryAnalyticsRate($metrics['unavailable'], $total),
        'availabilityUnknownAssets' => (int)$metrics['availabilityUnknown'],
        'damagedAssets' => (int)$metrics['damaged'],
        'damageRate' => warehouseInventoryAnalyticsRate($metrics['damaged'], $total),
        'damageUnknownAssets' => (int)$metrics['damageUnknown'],
        'missingLocationAssets' => (int)$metrics['missingLocation'],
        'missingLocationRate' => warehouseInventoryAnalyticsRate($metrics['missingLocation'], $total),
        'locationAssignedAssets' => (int)$metrics['locationAssigned'],
        'locationCoverageRate' => warehouseInventoryAnalyticsRate($metrics['locationAssigned'], $total),
        'locationUnknownAssets' => (int)$metrics['locationUnknown'],
        'locationDetailCompleteAssets' => (int)$metrics['locationComplete'],
        'locationDetailCompleteRate' => warehouseInventoryAnalyticsRate($metrics['locationComplete'], $total),
        'locationDetailsIncompleteAssets' => (int)$metrics['locationIncomplete'],
        'averageAssetAge' => $ageAverage,
        'assetsWithKnownAge' => $ageKnown,
        'ageCoverageRate' => warehouseInventoryAnalyticsRate($ageKnown, $total),
        'assetsOlderThanThreshold' => (int)$metrics['olderThanThreshold'],
        'oldAssetRate' => warehouseInventoryAnalyticsRate($metrics['olderThanThreshold'], $ageKnown),
        'oldAndDamagedAssets' => (int)$metrics['oldAndDamaged'],
        'oldAndUnavailableAssets' => (int)$metrics['oldAndUnavailable'],
        'oldAndMissingLocationAssets' => (int)$metrics['oldAndMissingLocation'],
    ];
}

function warehouseInventoryAnalyticsFinalizeMap(array $groups, int $totalAssets = 0): array
{
    $result = [];
    foreach ($groups as $group) {
        $row = [
            'key' => $group['key'],
            'label' => $group['label'],
            'filterValue' => $group['filterValue'] ?? $group['label'],
        ];
        $row += warehouseInventoryAnalyticsMetricOutput($group['metrics']);
        if ($group['drillFilters'] !== null) {
            $row['drillFilters'] = $group['drillFilters'];
        }
        if (isset($group['categoryKeys'])) {
            $row['distinctCategories'] = count($group['categoryKeys']);
        }
        if (isset($group['typeKeys'])) {
            $row['distinctTypes'] = count($group['typeKeys']);
        }
        $row['assetShareRate'] = warehouseInventoryAnalyticsRate($row['totalAssets'], $totalAssets);
        $result[] = $row;
    }
    usort($result, static fn(array $left, array $right): int =>
        ($right['totalAssets'] <=> $left['totalAssets']) ?: strcasecmp($left['label'], $right['label'])
    );
    return $result;
}

function warehouseInventoryAnalyticsFinalizeComboMap(array $groups, int $limit = 100): array
{
    $result = [];
    foreach ($groups as $group) {
        $result[] = [
            'first' => $group['first'],
            'second' => $group['second'],
            'firstFilterValue' => $group['firstFilterValue'],
            'secondFilterValue' => $group['secondFilterValue'],
            ...warehouseInventoryAnalyticsMetricOutput($group['metrics']),
        ];
    }
    usort($result, static fn(array $left, array $right): int => $right['totalAssets'] <=> $left['totalAssets']);
    return array_slice($result, 0, $limit);
}

function warehouseInventoryAnalyticsFinalizeAgeGroups(array $groups): array
{
    $result = [];
    foreach ($groups as $group) {
        [$dimension, $band] = explode('|', $group['label'], 2);
        $result[] = [
            'dimension' => $dimension,
            'dimensionFilterValue' => $group['filterValue'],
            'ageBand' => $band,
            'assets' => (int)$group['metrics']['total'],
        ];
    }
    usort($result, static fn(array $left, array $right): int => $right['assets'] <=> $left['assets']);
    return $result;
}

function warehouseInventoryAnalyticsFinalize(array $state): array
{
    $overview = warehouseInventoryAnalyticsMetricOutput($state['metrics']);
    $departments = warehouseInventoryAnalyticsFinalizeMap($state['groups']['departments'], $overview['totalAssets']);
    $categories = warehouseInventoryAnalyticsFinalizeMap($state['groups']['categories'], $overview['totalAssets']);
    $types = warehouseInventoryAnalyticsFinalizeMap($state['groups']['types'], $overview['totalAssets']);
    $buildings = warehouseInventoryAnalyticsFinalizeMap($state['groups']['buildings'], $overview['totalAssets']);
    $floors = warehouseInventoryAnalyticsFinalizeMap($state['groups']['floors'], $overview['totalAssets']);
    $rooms = warehouseInventoryAnalyticsFinalizeMap($state['groups']['rooms'], $overview['totalAssets']);
    $sources = warehouseInventoryAnalyticsFinalizeMap($state['groups']['sources'], $overview['totalAssets']);
    $acquisitionYears = warehouseInventoryAnalyticsFinalizeMap($state['groups']['acquisitionYears'], $overview['totalAssets']);
    $fiscalYears = warehouseInventoryAnalyticsFinalizeMap($state['groups']['fiscalYears'], $overview['totalAssets']);

    foreach ($state['qualityFields'] as &$field) {
        $field['assets'] = (int)$field['assets'];
        $field['missingAssets'] = (int)$field['missingAssets'];
        $field['missingRate'] = warehouseInventoryAnalyticsRate($field['missingAssets'], $field['assets']);
    }
    unset($field);

    foreach ($state['qualityByDepartment'] as &$quality) {
        $quality['missingCriticalRate'] = warehouseInventoryAnalyticsRate($quality['missingCriticalMetadata'], $quality['totalAssets']);
        foreach ($quality['missingByField'] as $field => $missing) {
            $quality['missingByField'][$field] = [
                'assets' => (int)$missing,
                'rate' => warehouseInventoryAnalyticsRate($missing, $quality['totalAssets']),
            ];
        }
    }
    unset($quality);
    usort($state['qualityByDepartment'], static fn(array $left, array $right): int => $right['missingCriticalRate'] <=> $left['missingCriticalRate']);

    usort($state['exceptions'], static function (array $left, array $right): int {
        return ($left['_priorityOrder'] <=> $right['_priorityOrder'])
            ?: (($right['age'] ?? -1) <=> ($left['age'] ?? -1))
            ?: strcasecmp((string)($left['assetName'] ?? ''), (string)($right['assetName'] ?? ''));
    });
    $state['exceptions'] = array_slice($state['exceptions'], 0, 50);
    foreach ($state['exceptions'] as &$exception) {
        unset($exception['_priorityOrder']);
    }
    unset($exception);

    $attentionLabels = [
        'damaged' => 'ชำรุด',
        'unavailable' => 'ไม่พร้อมใช้งาน',
        'old' => 'อายุเกิน ' . $state['ageThreshold'] . ' ปี',
        'missingLocation' => 'ไม่มีตำแหน่ง',
        'oldDamaged' => 'อายุเกินเกณฑ์และชำรุด',
        'oldUnavailable' => 'อายุเกินเกณฑ์และไม่พร้อมใช้งาน',
        'oldMissingLocation' => 'อายุเกินเกณฑ์และไม่มีตำแหน่ง',
        'missingCriticalMetadata' => 'ข้อมูลสำคัญไม่ครบ',
    ];
    $attentionAreas = [];
    foreach ($attentionLabels as $key => $label) {
        $attentionAreas[] = ['key' => $key, 'label' => $label, 'assets' => (int)$state['attentionAreas'][$key]];
    }

    return [
        'overview' => [
            ...$overview,
            'statusDistribution' => array_map(
                static fn(string $key, int $assets): array => [
                    'key' => $key,
                    'label' => $key === '__missing__' ? 'ไม่ระบุสถานะ' : $key,
                    'assets' => $assets,
                ],
                array_keys($state['statusDistribution']),
                array_values($state['statusDistribution']),
            ),
            'availabilityDistribution' => array_map(static fn(string $key, int $assets): array => [
                'key' => $key,
                'label' => ['available' => 'พร้อมใช้งาน', 'unavailable' => 'ไม่พร้อมใช้งาน', 'unknown' => 'ไม่ระบุ'][ $key ],
                'assets' => $assets,
            ], array_keys($state['availabilityDistribution']), array_values($state['availabilityDistribution'])),
            'damageDistribution' => array_map(static fn(string $key, int $assets): array => [
                'key' => $key,
                'label' => ['damaged' => 'ชำรุด', 'notDamaged' => 'ไม่ชำรุด', 'unknown' => 'ไม่ระบุ'][ $key ],
                'assets' => $assets,
            ], array_keys($state['damageDistribution']), array_values($state['damageDistribution'])),
            'topDepartments' => array_slice($departments, 0, 10),
            'attentionAreas' => $attentionAreas,
        ],
        'portfolio' => [
            'categories' => $categories,
            'types' => $types,
            'topTypes' => array_slice($types, 0, 15),
            'departmentCategory' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['departmentCategory'], 100),
            'departmentType' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['departmentType'], 100),
            'departmentDiversity' => array_map(static fn(array $department): array => [
                'department' => $department['label'],
                'departmentFilterValue' => $department['filterValue'],
                'assets' => $department['totalAssets'],
                'distinctCategories' => $department['distinctCategories'] ?? 0,
                'distinctTypes' => $department['distinctTypes'] ?? 0,
            ], $departments),
        ],
        'departments' => ['rows' => $departments],
        'locations' => [
            'building' => $buildings,
            'floor' => $floors,
            'room' => $rooms,
            'departmentBuilding' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['departmentBuilding'], 100),
            'categoryBuilding' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['categoryBuilding'], 100),
            'missingLocationByDepartment' => array_map(static fn(array $department): array => [
                'department' => $department['label'],
                'departmentFilterValue' => $department['filterValue'],
                'totalAssets' => $department['totalAssets'],
                'missingLocationAssets' => $department['missingLocationAssets'],
                'missingLocationRate' => $department['missingLocationRate'],
                'locationAssignedAssets' => $department['locationAssignedAssets'],
                'locationDetailsIncompleteAssets' => $department['locationDetailsIncompleteAssets'],
            ], $departments),
        ],
        'aging' => [
            'ageDistribution' => $state['ageDistribution'],
            'byDepartment' => warehouseInventoryAnalyticsFinalizeAgeGroups($state['ageByDepartment']),
            'byCategory' => warehouseInventoryAnalyticsFinalizeAgeGroups($state['ageByCategory']),
            'byType' => warehouseInventoryAnalyticsFinalizeAgeGroups($state['ageByType']),
            'ageAvailability' => $state['ageAvailability'],
            'ageDamage' => $state['ageDamage'],
            'replacementPressureDepartments' => array_slice($departments, 0, 20),
            'replacementPressureCategories' => array_slice($categories, 0, 20),
            'replacementPressureTypes' => array_slice($types, 0, 20),
        ],
        'acquisition' => [
            'years' => $acquisitionYears,
            'fiscalYears' => $fiscalYears,
            'byDepartment' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['yearDepartment'], 100),
            'byCategory' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['yearCategory'], 100),
            'byType' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['yearType'], 100),
            'bySource' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['yearSource'], 100),
            'byFiscalDepartment' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['fiscalDepartment'], 100),
            'byFiscalCategory' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['fiscalCategory'], 100),
            'byFiscalType' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['fiscalType'], 100),
            'sources' => $sources,
            'sourceDepartment' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['sourceDepartment'], 100),
            'sourceCategory' => warehouseInventoryAnalyticsFinalizeComboMap($state['groups']['sourceCategory'], 100),
        ],
        'governance' => [
            'qualityFields' => $state['qualityFields'],
            'qualityByDepartment' => array_values($state['qualityByDepartment']),
            'exceptions' => $state['exceptions'],
            'exceptionsTotal' => (int)$state['exceptionsTotal'],
        ],
        'summary' => $overview,
    ];
}
