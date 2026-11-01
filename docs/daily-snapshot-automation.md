# Daily University snapshot and dashboard cache

Measured verification and local/EC2 performance results are recorded in [Phase 2 results](phase2-performance-results.md).

## Import behavior

`scripts/sync_university_snapshot.php --scheduled` runs from PHP CLI. It uses the same fetch, validation, warehouse writer, and archive writer as the Dashboard's manual Import button.

The worker uses the Bangkok calendar date and checks `dim_inventory_snapshot` for a successful `university_api` row whose label starts with `CPE API AUTO YYYY-MM-DD`. This marker uses the existing `snapshot_label` column. It does not change the schema, snapshot IDs, or manual labels; more than one manual snapshot on a date remains allowed.

The worker acquires the existing archive-directory file lock, a MySQL advisory lock, and a namespaced Redis lease when Redis is available. Redis uses `SET NX EX` and owner-checked renewal/release. If Redis is unavailable, the MySQL advisory lock still prevents concurrent workers; if MySQL is unavailable, the worker stops before contacting the University API.

The API response is validated before a transaction starts. Dimensions, snapshot metadata, and facts are written in one transaction. A JSON archive is written to a temporary file and atomically renamed while the transaction is open; the snapshot becomes visible only after commit. On ordinary failures, the transaction is rolled back and the archive is removed. The previous snapshots are never replaced.

After commit, the worker increments the warehouse cache version and attempts to warm the snapshot list and one default Asset Inventory response for the new exact `snapshot_id`. Warming failure is recorded but does not change import success. A scheduled run retries transient University API failures using the bounded `CPE_SNAPSHOT_MAX_ATTEMPTS` and `CPE_SNAPSHOT_RETRY_BASE_SECONDS` settings. Rerunning `--retry` is safe; it first checks the durable warehouse marker.

The worker records status under the configured Redis prefix and appends JSON lines to `.university-snapshot-worker.log` in the archive directory. A successful automatic snapshot is also durably recorded in MySQL. Redis remains a cache and coordination aid, not the import ledger.

## Local XAMPP schedule

Local PHP uses XAMPP (`C:\xampp\php\php.exe`), MySQL on `127.0.0.1:3306`, and Redis on loopback `127.0.0.1:6380`. The local Apache `SetEnv` directives are in the project `<Directory>` block in `C:\xampp\apache\conf\httpd.conf`; Redis is not exposed on a public interface.

Set `CPE_SNAPSHOT_DAILY_TIME=02:00` in `.env` to choose a different local task time. Windows must use the `SE Asia Standard Time` time zone. Register the task only while XAMPP MySQL is running:

```powershell
& .\scripts\register_university_snapshot_task.ps1
Get-ScheduledTask -TaskName CPE-Asset-Warehouse-Daily-Snapshot
```

The registration script verifies the PHP path, Bangkok time zone, MySQL listener, and task-name availability. It uses the current Windows account and does not replace an existing task. The account must be logged on for the task to run; a missed run starts when the user next signs in. The worker checks the warehouse connection before any University API request.

Manual commands:

```powershell
& C:\xampp\php\php.exe scripts\sync_university_snapshot.php --scheduled --dry-run
& C:\xampp\php\php.exe scripts\sync_university_snapshot.php --retry
& C:\xampp\php\php.exe scripts\sync_university_snapshot.php --manual
```

`--dry-run` fetches and validates the live API data, but does not write snapshot rows or an archive. `--manual` creates a regular manual snapshot and shares the same locks. The Task Scheduler uses `--scheduled`.

To disable the local schedule:

```powershell
Unregister-ScheduledTask -TaskName CPE-Asset-Warehouse-Daily-Snapshot -Confirm:$false
```

The local Apache environment rollback is to restore `C:\xampp\apache\conf\httpd.conf.codex-redis-backup-20261031`, validate with `C:\xampp\apache\bin\httpd.exe -t -f C:\xampp\apache\conf\httpd.conf`, then restart the XAMPP Apache process.

## Production schedule

The audited EC2 stack is the bind-mounted Apache project `/home/ubuntu/cpe-hub`: `web`, `db`, and `redis`, with no ETL service. The PHP source mount is read-only; snapshot archives use `/var/lib/cpe-warehouse/snapshot-history`. Phase 5 deployed the worker code to `site/assets_api` and `site/scripts`; Phase 5.8 activated the recurring host scheduler. Do not use the repository's separate Compose stack as a substitute for this live project.

The worker runs as `www-data` inside `cpe-hub-web-1` so archive files keep the existing ownership. The web container's Apache `SetEnv` values in `site/assets_api/.htaccess` do not reach PHP CLI, so the CLI worker loads `/var/lib/cpe-warehouse/snapshot-history/.snapshot-worker.env` (owner `www-data`, mode `640`, no database secrets). That file mirrors the Apache Redis prefix and TTLs; the container already supplies the database environment.

`/etc/cron.d/cpe-snapshot-worker` is active with one `0 19 * * *` entry. Ubuntu cron 3.0pl1 does not support `CRON_TZ`, and the host runs UTC, so this runs at 02:00 Asia/Bangkok (UTC+7, no DST). The entry uses a host `flock`, then runs the worker as `www-data` in `cpe-hub-web-1`. It sets `CPE_SNAPSHOT_ENV_FILE=/var/lib/cpe-warehouse/snapshot-history/.snapshot-worker.env` and the same persistent archive directory. Phase 5.8 verified the disk guard, lock contention, cron syntax, service health, and unchanged snapshot counts before activation. The first scheduled run is 2026-11-02 at 02:00 Bangkok time. Do not run an additional import during the scheduled window or add a container scheduler.

The recurring off-host backup remains deferred. The user explicitly authorized scheduler activation with that backup still deferred; the disk guard skips imports below its free-space thresholds but does not protect against EC2 or EBS loss. The installed host log is `/var/log/cpe-snapshot-worker.log`; `scripts/cpe-snapshot-worker.logrotate` retains bounded logs.

Both `scripts/sync_university_snapshot.php` and `scripts/warm_asset_inventory_cache.php` return HTTP 404 outside PHP CLI, so the read-only source mount does not expose an execution endpoint. The manual Import button keeps using the POST-only, same-origin `assets_api/import_university_snapshot.php` path and shares the same file, MySQL advisory, and Redis locks as the scheduler.

The scheduler rollback is to remove `/etc/cron.d/cpe-snapshot-worker`; this prevents future launches but does not stop an already running worker. Application rollback is separate: restore the two changed `assets_api` files from the Phase 5 backup archive. Disable API caching by setting `REDIS_ENABLED=false` in `site/assets_api/.htaccess`; PHP then reads MySQL directly. These rollbacks change no MySQL tables, snapshots, archives, or volumes.

## Cache policy and verification

Asset Inventory cache entries include the exact selected `snapshot_id` and canonicalized filters. Public report caching continues to bypass requests with cookies, sessions, or authorization headers. The Dashboard uses `X-Cache: MISS`, `HIT`, or `BYPASS` for verification.

Initial TTLs:

| Entry | TTL |
|---|---:|
| Latest Asset Inventory aggregations | 900 seconds |
| Snapshot list | 300 seconds |
| Snapshot history | 3600 seconds |
| Borrowing and maintenance reports | 120 seconds |

`REDIS_MAX_ENTRY_BYTES` caps a stored entry at 512 KiB by default. JSON is compressed when that reduces its size; larger compressed entries are returned without being cached. This prevents an unexpectedly large response from consuming the Redis cache. Cache invalidation bumps the shared warehouse version after a successful import or ETL commit.

Run local checks:

```powershell
& C:\xampp\php\php.exe tests\redis-cache.test.php
& C:\xampp\php\php.exe tests\university_snapshot_import.test.php
& C:\xampp\php\php.exe tests\university_snapshot_lock.integration.test.php
& C:\xampp\php\php.exe scripts\sync_university_snapshot.php --scheduled --dry-run
```

Use `X-Cache` plus request timings for cold and repeated GETs. Redis `INFO memory`, `INFO stats`, and `MEMORY USAGE` provide memory and eviction evidence. The worker logs only state, date, and snapshot metadata; secrets and full environment files must not be printed.

## EC2 storage and recovery readiness

The Phase 5.4 disk guard, independent disk check, log rotation, backup prerequisites, and restore procedure are recorded in [Phase 5.4 storage readiness](phase5.4-ec2-storage-readiness.md). The disk check remains active separately from the import scheduler. Off-host backups are still deferred; review that recovery risk before relying on long-term automated history.
