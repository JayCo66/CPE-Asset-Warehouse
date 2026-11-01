<?php
declare(strict_types=1);

require_once __DIR__ . '/../assets_api/snapshot_retention.php';

function retentionExpectSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . "\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true));
    }
}

function retentionExpectThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException) {
        return;
    }
    throw new RuntimeException($message);
}

function retentionFixture(string $id, string $date, ?string $importedAt, string $source = 'university_api', bool $archiveVerified = true): array
{
    return [
        'snapshot_id' => $id,
        'snapshot_date_key' => (int)str_replace('-', '', $date),
        'snapshot_date' => $date,
        'source_system' => $source,
        'imported_at' => $importedAt,
        'asset_count' => 4324,
        'fact_count' => 4324,
        'facts_sha256' => str_repeat('a', 64),
        'archive_key' => $archiveVerified ? 'assets_' . str_replace('-', '', $date) . '__' . $id . '.json' : null,
        'archive_bytes' => $archiveVerified ? 3707552 : null,
        'archive_sha256' => $archiveVerified ? str_repeat('b', 64) : null,
        'archive_verified' => $archiveVerified,
        'dashboard_exposed' => true,
    ];
}

$latest = 'f6d1ce63-710b-4706-9a61-b20f15e0964b';
$second = '6f800cea-0520-4d3c-bc4f-75d87fa3005b';
$third = '9c8101e8-f0cf-47a0-9ac2-3fcf34f083a0';
$candidate = 'ec8a1dc2-e470-4a74-b735-16726ac9faa5';
$legacy = '7dca40c9-0a37-46ba-914d-a039a93ba8d3';
$unverified = 'fd150057-10d7-4635-9d87-a807cd4721a6';

$plan = warehouseSnapshotCleanupBuildPlan([
    retentionFixture($legacy, '2026-10-23', null, 'legacy_warehouse'),
    retentionFixture($candidate, '2026-10-26', '2026-10-25 20:03:02'),
    retentionFixture($latest, '2026-11-01', '2026-11-01 09:29:01'),
    retentionFixture($third, '2026-10-26', '2026-10-25 20:08:41'),
    retentionFixture($second, '2026-10-26', '2026-10-25 23:00:46'),
    retentionFixture($unverified, '2026-10-21', null, 'university_api', false),
], 3);

retentionExpectSame([$latest, $second, $third], $plan['retained_snapshot_ids'], 'The three newest snapshots should be retained in Dashboard order.');
retentionExpectSame($latest, $plan['latest_university_snapshot_id'], 'The latest University API snapshot should be protected.');
retentionExpectSame([$candidate], $plan['candidate_snapshot_ids'], 'Only an older verified University archive should be a cleanup candidate.');
retentionExpectSame([$legacy, $unverified], $plan['preserved_snapshot_ids'], 'Legacy and unverified archive snapshots should be preserved.');
retentionExpectSame([$candidate], warehouseSnapshotCleanupValidateTargets($plan, [$candidate]), 'An exact candidate ID should be accepted.');
retentionExpectThrows(
    static fn() => warehouseSnapshotCleanupRequireHistoryAcknowledgement([$candidate], false),
    'Dashboard history impact must be acknowledged before applying a candidate deletion.',
);
warehouseSnapshotCleanupRequireHistoryAcknowledgement([$candidate], true);

retentionExpectThrows(
    static fn() => warehouseSnapshotCleanupBuildPlan([], 0),
    'Retention count must be positive.',
);
retentionExpectThrows(
    static fn() => warehouseSnapshotCleanupValidateTargets($plan, []),
    'An apply target list must not be empty.',
);
retentionExpectThrows(
    static fn() => warehouseSnapshotCleanupValidateTargets($plan, [$latest]),
    'The latest snapshot must never be a deletion target.',
);
retentionExpectThrows(
    static fn() => warehouseSnapshotCleanupValidateTargets($plan, [$legacy]),
    'Legacy snapshots must not be deletion targets.',
);
retentionExpectThrows(
    static fn() => warehouseSnapshotCleanupValidateTargets($plan, [$candidate, $candidate]),
    'Duplicate snapshot IDs must be rejected.',
);

$olderUniversity = warehouseSnapshotCleanupBuildPlan([
    retentionFixture('11111111-1111-4111-8111-111111111111', '2026-12-03', null, 'legacy_warehouse'),
    retentionFixture('22222222-2222-4222-8222-222222222222', '2026-12-02', null, 'legacy_warehouse'),
    retentionFixture('33333333-3333-4333-8333-333333333333', '2026-12-01', null, 'legacy_warehouse'),
    retentionFixture('44444444-4444-4444-8444-444444444444', '2026-11-30', '2026-11-30 02:00:00'),
], 3);
retentionExpectSame(
    '44444444-4444-4444-8444-444444444444',
    $olderUniversity['latest_university_snapshot_id'],
    'The latest University snapshot should be identified even when older than the retained date range.',
);
retentionExpectSame(
    ['44444444-4444-4444-8444-444444444444'],
    $olderUniversity['preserved_snapshot_ids'],
    'The latest University snapshot must stay protected outside the retention count.',
);
retentionExpectSame([], $olderUniversity['candidate_snapshot_ids'], 'The latest University snapshot must not become a candidate.');

$manifest = warehouseSnapshotCleanupCreateManifest($plan);
$sameManifest = $manifest;
$sameManifest['snapshots'][0] = array_reverse($sameManifest['snapshots'][0], true);
retentionExpectSame(
    warehouseSnapshotCleanupManifestHash($manifest),
    warehouseSnapshotCleanupManifestHash($sameManifest),
    'Manifest hashes should not depend on associative key insertion order.',
);
$changedManifest = $manifest;
$changedManifest['snapshots'][0]['facts_sha256'] = str_repeat('c', 64);
retentionExpectSame(
    false,
    hash_equals(warehouseSnapshotCleanupManifestHash($manifest), warehouseSnapshotCleanupManifestHash($changedManifest)),
    'A changed fact digest must change the approval hash.',
);

echo "Snapshot retention tests passed\n";
