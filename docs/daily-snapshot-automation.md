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

The audited EC2 stack is the bind-mounted Apache project `/home/ubuntu/cpe-hub`: `web`, `db`, and `redis`, with no ETL service. The PHP source mount is read-only; snapshot archives use `/var/lib/cpe-warehouse/snapshot-history`. The PHP cache-only rollout is active, but the snapshot worker has not been staged in production. Do not use the repository's separate Compose stack as a substitute for this live project.

`scripts/university_snapshot_ec2.cron.example` contains the host-cron entry with `CRON_TZ=Asia/Bangkok`. It is commented out and must stay disabled until the worker code and dependencies are staged, the CLI dry run is verified, and the user approves the first automated production snapshot. The PHP cache-only rollout did not include the worker. Do not also add a container scheduler. The cron command should run `php /var/www/html/scripts/sync_university_snapshot.php --scheduled` inside `cpe-hub-web-1` after that separate worker deployment; the container has the database and Redis network settings.

The production rollback is to remove the worker's cron entry. Disable API caching by setting `REDIS_ENABLED=false` in the PHP application environment and applying the approved web-container configuration; PHP then reads MySQL directly. Neither rollback changes MySQL tables, snapshots, archives, or volumes.

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
