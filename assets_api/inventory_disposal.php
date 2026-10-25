<?php
declare(strict_types=1);

require_once __DIR__ . '/report_common.php';

function warehouseInventoryDisposalCandidateCount(
    array $rows,
    float $repairCostRatioThreshold,
    float $minimumUsefulLifeShare,
): int {
    $candidateAssets = 0;
    foreach ($rows as $row) {
        if (!is_numeric($row['asset_age_years'] ?? null)) {
            continue;
        }

        $category = is_string($row['category_name'] ?? null) ? $row['category_name'] : null;
        $assetCode = is_scalar($row['asset_code'] ?? null) ? (string)$row['asset_code'] : '';
        $repairCost = is_numeric($row['repair_cost'] ?? null) ? (float)$row['repair_cost'] : 0.0;
        $price = mock_purchase_price($assetCode, $category, (bool)($row['below_threshold'] ?? false));
        $repairCostRatio = $price > 0 ? round($repairCost / $price, 3) : null;
        $minimumAge = useful_life($category) * $minimumUsefulLifeShare;

        if ($repairCostRatio === null
            || $repairCostRatio < $repairCostRatioThreshold
            || (float)$row['asset_age_years'] < $minimumAge) {
            continue;
        }

        $candidateAssets += max(0, (int)($row['asset_count'] ?? 0));
    }

    return $candidateAssets;
}

function warehouseDashboardUnavailableDisposalEstimate(): array
{
    return [
        'available' => false,
        'eligibleAssets' => null,
        'priceBasis' => 'modeled',
    ];
}

function warehouseDashboardDisposalEstimate(PDO $pdo, array $filters, string $snapshotId): array
{
    $repairCostRatioThreshold = (float)setting('repair_cost_ratio_dispose', 0.5);
    $minimumUsefulLifeShare = (float)setting('replace_min_life_share', 0.5);

    try {
        $where = warehouseInventoryBuildWhere($filters, null, $snapshotId);
        $conditions = $where['sql'] === ''
            ? []
            : [preg_replace('/^WHERE\s+/i', '', $where['sql'])];
        $conditions[] = "asset_category.`category_name` LIKE 'ครุภัณฑ์%'";
        $conditions[] = 'acquisition_date.`date_key` IS NOT NULL';
        $conditions[] = 'repair_summary.`asset_key` IS NOT NULL';

        $statement = $pdo->prepare(
            'SELECT
                fai.`asset_count`,
                fai.`asset_age_years`,
                fai.`is_below_threshold_flag` AS `below_threshold`,
                da.`asset_code`,
                asset_category.`category_name`,
                repair_summary.`repair_cost`
            ' . warehouseInventoryFromSql() . '
            LEFT JOIN (
                SELECT
                    fam.`asset_key`,
                    COALESCE(SUM(fam.`total_repair_cost`), 0) AS `repair_cost`
                FROM `fact_asset_maintenance` fam
                JOIN `dim_date` repair_date
                    ON repair_date.`date_key` = fam.`repair_date_key`
                GROUP BY fam.`asset_key`
            ) repair_summary
                ON repair_summary.`asset_key` = fai.`asset_key`
            WHERE ' . implode(' AND ', $conditions)
        );

        foreach ($where['params'] as $name => $value) {
            $statement->bindValue(':' . $name, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $statement->execute();

        $eligibleAssets = warehouseInventoryDisposalCandidateCount(
            $statement->fetchAll(PDO::FETCH_ASSOC),
            $repairCostRatioThreshold,
            $minimumUsefulLifeShare,
        );

        return [
            'available' => true,
            'eligibleAssets' => $eligibleAssets,
            'repairCostRatioThreshold' => $repairCostRatioThreshold,
            'minimumUsefulLifeShare' => $minimumUsefulLifeShare,
            'priceBasis' => 'modeled',
        ];
    } catch (Throwable $error) {
        error_log('Asset inventory disposal estimate unavailable: ' . $error->getMessage());
        return warehouseDashboardUnavailableDisposalEstimate();
    }
}
