# Phase 5.5 — Snapshot Retention Audit and Cleanup

Audit date: 2026-11-01 (UTC and Asia/Bangkok)

## Current State

The read-only EC2 audit found 7 inventory snapshots, 30,292 inventory fact rows, and 4 JSON archives. The latest snapshot is `f6d1ce63-710b-4706-9a61-b20f15e0964b`. No production rows, schema, archive files, containers, or volumes were changed, and no cleanup was executed.

The exact dry-run manifest is [phase5.5-snapshot-cleanup-manifest.json](phase5.5-snapshot-cleanup-manifest.json). Its approval SHA-256 is:

```text
2960ad2cc55d8d6d02c679daed00decfde8841af2577d47b7b2720d82354fccc
```

The manifest covers all snapshot metadata, per-snapshot fact-row digests, archive hashes, latest and retained IDs, and each row's disposition. Any change to this live inventory invalidates that hash.

## Snapshot Inventory

Archive paths below are relative to `/var/lib/cpe-warehouse/snapshot-history`; the three legacy files are referenced by metadata but are missing on disk.

| Snapshot ID | Date | Source | Assets | Facts | Archive | Disposition |
|---|---|---|---:|---:|---|---|
| `f6d1ce63-710b-4706-9a61-b20f15e0964b` | 2026-11-01 | `university_api` | 4,324 | 4,324 | `assets_20261101__f6d1ce63-710b-4706-9a61-b20f15e0964b.json` — 3,707,542 bytes | Retain, latest |
| `6f800cea-0520-4d3c-bc4f-75d87fa3005b` | 2026-10-26 | `university_api` | 4,324 | 4,324 | `assets_20261026__6f800cea-0520-4d3c-bc4f-75d87fa3005b.json` — 3,707,552 bytes | Retain |
| `9c8101e8-f0cf-47a0-9ac2-3fcf34f083a0` | 2026-10-26 | `university_api` | 4,324 | 4,324 | `assets_20261026__9c8101e8-f0cf-47a0-9ac2-3fcf34f083a0.json` — 3,707,552 bytes | Retain |
| `ec8a1dc2-e470-4a74-b735-16726ac9faa5` | 2026-10-26 | `university_api` | 4,324 | 4,324 | `assets_20261026__ec8a1dc2-e470-4a74-b735-16726ac9faa5.json` — 3,707,552 bytes | Candidate for separate approval |
| `7dca40c9-0a37-46ba-914d-a039a93ba8d3` | 2026-10-23 | `legacy_warehouse` | 4,336 | 4,336 | Referenced `assets_20261023__7dca40c9-0a37-46ba-914d-a039a93ba8d3.json` missing | Preserve for review |
| `379cf335-e90a-4e00-986c-a6e8624ca4c0` | 2026-10-22 | `legacy_warehouse` | 4,336 | 4,336 | Referenced `assets_20261022__379cf335-e90a-4e00-986c-a6e8624ca4c0.json` missing | Preserve for review |
| `fd150057-10d7-4635-9d87-a807cd4721a6` | 2026-10-21 | `legacy_warehouse` | 4,324 | 4,324 | Referenced `assets_20261021__fd150057-10d7-4635-9d87-a807cd4721a6.json` missing | Preserve for review |

`imported_at` is a MySQL `DATETIME` without timezone metadata; the table lists the stored values in the manifest. Snapshot dates come from `snapshot_date_key` joined to `dim_date`.

The candidate is the oldest University API snapshot outside the newest three. It has the same 4,324 asset rows and fact content as the retained Oct 26 snapshot `9c8101e8-f0cf-47a0-9ac2-3fcf34f083a0`; the fact-content comparison found zero missing or different business rows. Its import identity and timestamp are still distinct.

## References and Foreign Keys

The live Dashboard builds its selector from every row returned by `warehouseInventorySnapshotOptions()` and resolves historical selections by exact snapshot ID. `warehouseDashboardHistory()` includes the selected snapshot and older snapshots, up to 24. No snapshot IDs were hard-coded in the live PHP application. Deleting the candidate will remove one selectable historical point. Its measures duplicate the next-newer Oct 26 snapshot, but its import event will no longer be available for selection or comparison.

The live foreign keys are:

- `dim_inventory_snapshot.snapshot_date_key` → `dim_date.date_key`
- `fact_asset_inventory.snapshot_id` → `dim_inventory_snapshot.snapshot_id`
- `fact_asset_inventory.snapshot_date_key` → `dim_date.date_key`
- `fact_asset_inventory.acquisition_date_key` → `dim_date.date_key`
- `fact_asset_inventory.asset_key` → `dim_asset.asset_key`
- `fact_asset_inventory.department_key` → `dim_department.department_key`
- `fact_asset_inventory.type_key` → `dim_asset_type.type_key`
- `fact_asset_inventory.category_key` → `dim_asset_category.category_key`
- `fact_asset_inventory.location_key` → `dim_location.location_key`

There are no other foreign keys referencing `dim_inventory_snapshot`. The cleanup CLI deletes only matching rows from `fact_asset_inventory`, then the matching row from `dim_inventory_snapshot`, in one InnoDB transaction. It never disables FK checks or removes dimensions, borrowing records, or maintenance records.

## Disk Impact

The final EC2 root filesystem check measured 7,203,201,024 bytes total, 5,739,479,040 bytes used, and 1,446,944,768 bytes free (80% used). The candidate archive is 3,707,552 bytes, about 3.54 MiB. That archive is the only confidently reclaimable filesystem space from the proposed cleanup.

The MySQL `fact_asset_inventory.ibd` file is 23,068,672 bytes and `dim_inventory_snapshot.ibd` is 163,840 bytes. The fact table currently reports 4 MiB `DATA_FREE`. Deleting rows can make InnoDB pages reusable, but does not shrink the tablespace file; no `OPTIMIZE TABLE` is planned. The cleanup is therefore not a meaningful root-disk capacity fix.

Other audited items: four JSON archives total about 14.8 MB; the persistent MySQL volume is about 301.6 MB; Docker reports effectively no reclaimable images, containers, or volumes (about 12 KB of build cache was marked reclaimable); APT package archives are about 8 KB; logs are about 52 MB, including about 40 MB of journal; `/tmp` is about 5.2 MB. No cleanup or prune was run.

## Cleanup CLI

Files added:

- `assets_api/snapshot_retention.php` — deterministic retention planning, exact-ID validation, manifest hashing, and history acknowledgement guard.
- `scripts/cleanup_inventory_snapshots.php` — CLI-only dry-run/apply tool.
- `tests/snapshot_retention.test.php` — retention, candidate, target, history-acknowledgement, and manifest-hash tests.

Default invocation is read-only:

```bash
php scripts/cleanup_inventory_snapshots.php
```

Optional dry-run manifest output:

```bash
php scripts/cleanup_inventory_snapshots.php --retain=3 --manifest-out=/path/to/manifest.json
```

Apply requires all of the following: `APP_ENV=production`, healthy production Redis with the `cpe:production:` namespace, the shared file/MySQL/Redis import lock, exact candidate ID(s), the current manifest SHA-256, an off-host backup bundle SHA-256 and reference, and `--ack-history-removal`. For example, after the user separately approves this exact manifest and ID:

```bash
php scripts/cleanup_inventory_snapshots.php \
  --retain=3 \
  --apply \
  --snapshot-id=ec8a1dc2-e470-4a74-b735-16726ac9faa5 \
  --manifest-sha256=2960ad2cc55d8d6d02c679daed00decfde8841af2577d47b7b2720d82354fccc \
  --backup-bundle-sha256=<approved-off-host-bundle-sha256> \
  --backup-reference=<approved-backup-reference> \
  --ack-history-removal
```

The CLI re-reads and hashes the full snapshot inventory after acquiring the import lock. It refuses the operation if any snapshot, fact, archive, latest ID, or approval hash changed. It deletes exact fact rows and metadata transactionally, invalidates the Redis warehouse version immediately after commit, and only then removes verified candidate archive paths. A cache or archive failure after commit is logged as a partial outcome; the script stops and leaves any remaining archives intact. Audit output is JSON Lines in `.snapshot-cleanup-audit.jsonl`, capped at 1 MiB with one preserved rotated generation; if rotation would overwrite an existing generation, the script fails closed.

The cleanup script has not been deployed into the EC2 application tree. The live dry-run executed the same source through PHP CLI without writing a production application file.

## Off-host Backup and Restore Check

A one-time backup bundle is stored outside EC2 on the authorized workstation:

`%LOCALAPPDATA%\CPE-Asset-Warehouse\backups\phase5.5-20261101T1310Z.zip`

Bundle SHA-256: `f7dd9a04ee347d5770c217f27c34c6f6d55a5a387ad7690b1bc391b0e770f1b1`

The bundle contains a `mysqldump --single-transaction` of `cpe_warehouse` (all 13 tables use InnoDB), the candidate JSON archive, the exact approval manifest, a `SHA256SUMS` file, and restore notes. The compressed dump was streamed from EC2 to the workstation; no temporary database dump was written to the EC2 filesystem. The dump, archive, manifest, and ZIP checksums were verified. The archive decodes to the expected candidate ID and 4,324 rows.

The SQL dump was restored into a local MySQL 8.0.46 test container with no network and no published ports. Read-only verification returned 7 snapshots, 30,292 facts, and 4,324 candidate facts. The container was stopped after the check. **I unintentionally let Docker's `--rm` remove the anonymous `/var/lib/mysql` volume that the MySQL image created for this test.** It contained only the isolated restored test database; no pre-existing project volume was mounted or changed, and production MySQL and its volume were not touched. The `mysql:8.0.46` image pulled for the test was removed after the container stopped. The workstation's free C: space went from 14,793,797,632 to 13,372,583,936 bytes and did not return after image removal; Docker Desktop's virtual disk may retain the allocated space. No Docker disk compaction or pruning was attempted.

For recovery, verify `SHA256SUMS`, restore `cpe_warehouse.sql.gz` into a separately isolated MySQL 8.0.46 database, and compare snapshot/fact counts and the candidate archive metadata before considering any production restore. Never restore this dump directly over the live database as part of cleanup.

## Verification and Approval

- PHP syntax checks: passed for both new PHP files.
- Focused retention tests: passed.
- Production dry-run: passed; Redis `PONG`; one verified candidate, 4,324 fact rows, and 3,707,552 archive bytes.
- Production health: MySQL `SELECT 1`; Redis `PONG`; Apache HTTP 200; no snapshot worker was running during backup preflight.
- Production schema/data/archive state: unchanged.
- Recurring scheduler: unchanged; no import was run.

No snapshot has been deleted. Before any apply, separately approve the exact ID `ec8a1dc2-e470-4a74-b735-16726ac9faa5`, the manifest SHA-256 above, and the off-host bundle SHA-256 above, acknowledging that its historical Dashboard selection point will be removed. The three legacy snapshots remain preserved.
