<?php
declare(strict_types=1);

function warehouseSnapshotCleanupBuildPlan(array $snapshots, int $retainCount): array
{
    if ($retainCount < 1) {
        throw new InvalidArgumentException('Retention count must be positive.');
    }

    $seen = [];
    foreach ($snapshots as &$snapshot) {
        $id = strtolower((string)($snapshot['snapshot_id'] ?? ''));
        if (preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/iD', $id) !== 1 || isset($seen[$id])) {
            throw new InvalidArgumentException('Snapshot inventory contains an invalid or duplicate ID.');
        }
        if (!isset($snapshot['snapshot_date_key'], $snapshot['source_system'], $snapshot['asset_count'], $snapshot['fact_count'])) {
            throw new InvalidArgumentException('Snapshot inventory is missing required metadata.');
        }

        $snapshot['snapshot_id'] = $id;
        $snapshot['snapshot_date_key'] = (int)$snapshot['snapshot_date_key'];
        $snapshot['source_system'] = (string)$snapshot['source_system'];
        $snapshot['imported_at'] = isset($snapshot['imported_at']) && (string)$snapshot['imported_at'] !== ''
            ? (string)$snapshot['imported_at']
            : null;
        $snapshot['asset_count'] = (int)$snapshot['asset_count'];
        $snapshot['fact_count'] = (int)$snapshot['fact_count'];
        $snapshot['archive_key'] = isset($snapshot['archive_key']) && (string)$snapshot['archive_key'] !== ''
            ? (string)$snapshot['archive_key']
            : null;
        $snapshot['archive_bytes'] = isset($snapshot['archive_bytes']) ? (int)$snapshot['archive_bytes'] : null;
        $snapshot['archive_sha256'] = isset($snapshot['archive_sha256']) ? strtolower((string)$snapshot['archive_sha256']) : null;
        $snapshot['archive_verified'] = (bool)($snapshot['archive_verified'] ?? false);
        $snapshot['facts_sha256'] = isset($snapshot['facts_sha256']) ? strtolower((string)$snapshot['facts_sha256']) : null;
        $snapshot['dashboard_exposed'] = (bool)($snapshot['dashboard_exposed'] ?? false);
        $seen[$id] = true;
    }
    unset($snapshot);

    usort($snapshots, static function (array $left, array $right): int {
        $dateOrder = $right['snapshot_date_key'] <=> $left['snapshot_date_key'];
        if ($dateOrder !== 0) {
            return $dateOrder;
        }

        $leftImported = $left['imported_at'] ?? '';
        $rightImported = $right['imported_at'] ?? '';
        $importedOrder = strcmp($rightImported, $leftImported);
        return $importedOrder !== 0 ? $importedOrder : strcmp($right['snapshot_id'], $left['snapshot_id']);
    });

    $retained = array_slice($snapshots, 0, $retainCount);
    $retainedIds = array_column($retained, 'snapshot_id');
    $retainedSet = array_fill_keys($retainedIds, true);
    $latestSnapshotId = $snapshots[0]['snapshot_id'] ?? null;
    $latestUniversitySnapshotId = null;
    foreach ($snapshots as $snapshot) {
        if ($snapshot['source_system'] === 'university_api') {
            $latestUniversitySnapshotId = $snapshot['snapshot_id'];
            break;
        }
    }

    $candidates = [];
    $preserved = [];
    foreach ($snapshots as &$snapshot) {
        $id = $snapshot['snapshot_id'];
        if (isset($retainedSet[$id])) {
            $snapshot['disposition'] = 'retained';
            $snapshot['disposition_reason'] = 'within_retention_count';
            continue;
        }
        if ($id === $latestUniversitySnapshotId) {
            $snapshot['disposition'] = 'preserved';
            $snapshot['disposition_reason'] = 'latest_university_api_snapshot';
            $preserved[] = $snapshot;
            continue;
        }
        if ($snapshot['source_system'] !== 'university_api') {
            $snapshot['disposition'] = 'preserved';
            $snapshot['disposition_reason'] = 'non_university_source_requires_review';
            $preserved[] = $snapshot;
            continue;
        }
        if (!$snapshot['archive_verified']) {
            $snapshot['disposition'] = 'preserved';
            $snapshot['disposition_reason'] = 'archive_missing_or_unverified';
            $preserved[] = $snapshot;
            continue;
        }

        $snapshot['disposition'] = 'candidate';
        $snapshot['disposition_reason'] = $snapshot['dashboard_exposed']
            ? 'outside_retention_count_requires_history_review'
            : 'outside_retention_count';
        $candidates[] = $snapshot;
    }
    unset($snapshot);

    $snapshotById = [];
    foreach ($snapshots as $snapshot) {
        $snapshotById[$snapshot['snapshot_id']] = $snapshot;
    }

    return [
        'retain_count' => $retainCount,
        'latest_snapshot_id' => $latestSnapshotId,
        'latest_university_snapshot_id' => $latestUniversitySnapshotId,
        'retained_snapshot_ids' => $retainedIds,
        'candidate_snapshot_ids' => array_column($candidates, 'snapshot_id'),
        'preserved_snapshot_ids' => array_column($preserved, 'snapshot_id'),
        'snapshots' => array_values($snapshotById),
        'candidates' => $candidates,
        'preserved' => $preserved,
    ];
}

function warehouseSnapshotCleanupValidateTargets(array $plan, array $requestedIds): array
{
    if ($requestedIds === []) {
        throw new InvalidArgumentException('At least one exact snapshot ID is required for apply.');
    }

    $requested = [];
    foreach ($requestedIds as $id) {
        $normalized = strtolower(trim((string)$id));
        if (preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/iD', $normalized) !== 1) {
            throw new InvalidArgumentException('Requested snapshot ID is invalid.');
        }
        if (isset($requested[$normalized])) {
            throw new InvalidArgumentException('Requested snapshot IDs must be unique.');
        }
        $requested[$normalized] = true;
    }

    $candidateSet = array_fill_keys($plan['candidate_snapshot_ids'] ?? [], true);
    foreach (array_keys($requested) as $id) {
        if (!isset($candidateSet[$id])) {
            throw new InvalidArgumentException('Requested snapshot ID is protected or is not a verified cleanup candidate.');
        }
    }

    return array_values(array_filter(
        $plan['candidate_snapshot_ids'],
        static fn(string $id): bool => isset($requested[$id]),
    ));
}

function warehouseSnapshotCleanupCreateManifest(array $plan): array
{
    return [
        'schema_version' => 1,
        'policy' => [
            'retain_count' => (int)$plan['retain_count'],
            'candidate_sources' => ['university_api'],
            'legacy_snapshots' => 'preserve_for_review',
            'archive_required' => true,
            'dashboard_history' => 'all listed snapshots are selectable history points; candidates require explicit acknowledgement',
        ],
        'latest_snapshot_id' => $plan['latest_snapshot_id'],
        'latest_university_snapshot_id' => $plan['latest_university_snapshot_id'],
        'retained_snapshot_ids' => array_values($plan['retained_snapshot_ids']),
        'candidate_snapshot_ids' => array_values($plan['candidate_snapshot_ids']),
        'preserved_snapshot_ids' => array_values($plan['preserved_snapshot_ids']),
        'snapshots' => array_values($plan['snapshots']),
    ];
}

function warehouseSnapshotCleanupRequireHistoryAcknowledgement(array $targetIds, bool $acknowledged): void
{
    if ($targetIds !== [] && !$acknowledged) {
        throw new InvalidArgumentException('Apply requires acknowledgement that selected snapshots are used by Dashboard history.');
    }
}

function warehouseSnapshotCleanupManifestHash(array $manifest): string
{
    $canonicalize = static function (mixed $value) use (&$canonicalize): mixed {
        if (!is_array($value)) {
            return $value;
        }
        if (array_is_list($value)) {
            return array_map($canonicalize, $value);
        }
        ksort($value, SORT_STRING);
        foreach ($value as $key => $item) {
            $value[$key] = $canonicalize($item);
        }
        return $value;
    };

    return hash('sha256', json_encode(
        $canonicalize($manifest),
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR,
    ));
}
