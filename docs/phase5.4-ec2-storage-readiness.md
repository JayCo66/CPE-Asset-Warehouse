# Phase 5.4 — Temporary EC2 storage and scheduler readiness

## Phase 5.8 update — 2026-11-01

The import schedule was activated by explicit authorization despite recurring off-host backups remaining deferred. `/etc/cron.d/cpe-snapshot-worker` contains one `0 19 * * *` UTC entry, which runs at 02:00 Asia/Bangkok. The worker runs as `www-data` inside `cpe-hub-web-1`, uses the protected `.snapshot-worker.env`, and writes to the persistent archive directory. The first scheduled run is 2026-11-02 at 02:00 Bangkok time.

At activation the disk guard passed with 1,778,376,704 bytes available; after its 100 MiB reserve, 1,673,519,104 bytes (23.23%) remained, above the 500 MiB and 15% minimums. Redis, MySQL advisory, and host `flock` contention checks passed. Snapshot and fact counts remained 7 and 30,292, archive count remained 4, and no worker ran during activation. Disable future launches with `sudo rm -f /etc/cron.d/cpe-snapshot-worker`.

Recurring off-host database and archive backups remain deferred. The disk guard skips runs when capacity is low but does not provide recovery from EC2 or EBS loss. This update supersedes the scheduler-disabled decision recorded during the Phase 5.4 review below.

## Decision at Phase 5.4 review (superseded)

The daily snapshot import schedule is **prepared but disabled**. The EC2 host has no recurring off-host database/archive backup, no AWS CLI or backup client, and no instance-profile role. The prior Phase 5.1 off-host bundle was reported as checksum-verified, but its workstation copy could not be located during this review. The copy on EC2 is not an off-host recovery point. Do not activate imports until a recurring off-host backup has been configured and a restore has been verified, or an alternative recovery arrangement has been explicitly approved.

The independent disk check is installed as `/etc/cron.d/cpe-snapshot-disk-check` and runs without importing data. It reports JSON to `/var/log/cpe-snapshot-disk-check.log` and emits a `user.warning` syslog entry when the guard thresholds are crossed. The snapshot import entry remains absent from `/etc/cron.d`.

## Disk guard

`assets_api/snapshot_storage_guard.php` measures the filesystem containing the persistent archive directory. Before any non-dry-run import, and again on each existing worker heartbeat during API collection and fact persistence, it requires:

- At least 500 MiB free after a 100 MiB reserve for archive temporary files and MySQL transaction growth.
- At least 15% free after that reserve.

If either threshold fails, the worker records `state=skipped` and `reason=insufficient_storage` before publication. If the filesystem cannot be measured, the worker fails closed. Dry runs do not write warehouse data or archives and do not require the capacity threshold.

The daily check is `scripts/check_snapshot_disk.php`. Its exit codes are 0 for healthy, 2 for a low-capacity warning, and 1 if the filesystem cannot be checked. The prepared check runs at 00:00 UTC (07:00 Asia/Bangkok), separately from the staged import time.

The 2026-11-01 EC2 check measured 7,203,201,024 filesystem bytes and 1,447,047,168 available bytes. After the 100 MiB reserve, 1,342,189,568 bytes (18.63%) remain; the guard passed. The EBS volume remains 8 GiB.

The worker audit log rotates in PHP at 1 MiB, keeping one prior `.1` generation (2 MiB maximum). The host worker/checker logs use logrotate with seven daily generations and a 1 MiB size limit. Snapshot archives are never covered by log rotation.

## Repeatable off-host backup process

Before enabling automated imports, choose an existing private off-host destination or obtain approval for a private S3 bucket and least-privilege role. A recurring job must run after each successful snapshot and verify the copied objects before reporting success.

The EC2 source bundle can be rebuilt without changing MySQL data:

```bash
set -euo pipefail
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="/home/ubuntu/cpe-hub/backups/snapshot-recovery-$stamp"
sudo install -d -o ubuntu -g ubuntu -m 700 "$backup_dir"

sudo docker exec cpe-hub-db-1 sh -lc \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump --single-transaction --quick --no-tablespaces -uroot cpe_warehouse' \
  | gzip -1 > "$backup_dir/cpe_warehouse.sql.gz"

sudo find /home/ubuntu/cpe-hub/snapshot-history -maxdepth 1 -type f -name 'assets_*.json' -printf '%f\0' \
  | sudo tar -C /home/ubuntu/cpe-hub/snapshot-history --null -T - -czf - > "$backup_dir/snapshot-archives.tar.gz"
sha256sum "$backup_dir"/*.gz > "$backup_dir/SHA256SUMS"
chmod 600 "$backup_dir"/*
```

Transfer the directory to the approved private off-host destination, then compare SHA-256 checksums there. Do not copy `.snapshot-worker.env`, worker logs, or lock files into a general backup destination. A recurring backup process must alert on transfer/checksum failure and must retain enough generations to recover from accidental corruption.

## Restore procedure

1. Retrieve a complete database dump and archive bundle from the off-host destination; verify every checksum before extraction.
2. Restore the dump to an isolated MySQL instance or separate recovery database first. Do not import over the live warehouse as a verification step.
3. Confirm the recovered snapshot count, per-snapshot fact counts, and archive keys against the backup manifest. Decode each JSON archive and confirm its `snapshot_id`, date, and asset count match warehouse metadata.
4. Only after review, plan a separately authorized production restore. Preserve the current live database and archives until the recovered copy has passed validation.
5. A whole-instance rollback requires a verified EBS snapshot and a replacement/root-volume recovery procedure. No EBS snapshot or tested full-instance recovery path was confirmed in this phase.

## Scheduler files and activation

- `scripts/university_snapshot_ec2.cron.example` contains the staged import entry at `0 19 * * *` UTC = 02:00 Asia/Bangkok. It uses a host `flock`; the worker keeps its archive file, MySQL advisory, and Redis ownership locks.
- `scripts/university_snapshot_disk_check_ec2.cron.example` contains the independent daily check entry.
- The worker rotates `.university-snapshot-worker.log` itself; `scripts/cpe-snapshot-worker.logrotate` bounds the two host logs under `/var/log`.

Install only the disk-check entry while the import schedule remains blocked. Activate the import entry only after off-host backup and restore verification, then install it as `/etc/cron.d/cpe-snapshot-worker` with owner `root:root` and mode `0644`.

Disable imports immediately with:

```bash
sudo rm -f /etc/cron.d/cpe-snapshot-worker
```

The disk check can be disabled separately with:

```bash
sudo rm -f /etc/cron.d/cpe-snapshot-disk-check
```

Disabling either cron entry does not stop an already running worker. Check the worker's status and locks before any manual retry. Never delete historical snapshots, warehouse facts, or archive files as part of rollback.
