# Phase 5 — Production Daily Snapshot Automation (deployment record)

> Historical Phase 5.1 record: this captures the state immediately after the first authorized snapshot import, before the Phase 5.2 cache-warmer fix, Phase 5.4 storage guard, and Phase 5.8 scheduler activation. For current scheduler status, see [Daily University snapshot and dashboard cache](daily-snapshot-automation.md).

Release: `phase5-20261101T085329Z`
Date: 2026-11-01 (UTC)
Production stack: AWS EC2, `/home/ubuntu/cpe-hub`, containers `cpe-hub-web-1`, `cpe-hub-db-1`, `cpe-hub-redis-1`
Dashboard release from Phase 4: `phase4-20261101T081231Z`, frontend asset `20261101.7` (unchanged)

## Status at a glance

| Area | State |
|---|---|
| Worker code on EC2 | **Deployed** |
| CLI runtime and dependencies | **Tested** |
| Read-only dry run (live University API) | **Tested**, 4,324 assets |
| Redis, MySQL, file locks and duplicate prevention | **Tested** |
| Dashboard endpoints and cache | **Tested** |
| First production snapshot | **One authorized import completed; verification findings below** |
| Recurring daily schedule | **Not activated — requires separate approval** |
| MySQL schema change | **None** |
| MySQL data change | **One scheduled snapshot published on 2026-11-01** |
| Container restart or recreation | **None** |

## 1. Source reconciliation

Production was running the pre-worker revision of the importer: `assets_api/import_university_snapshot.php` and `assets_api/university_snapshot_import_lib.php` existed, but `university_snapshot_job.php`, `scripts/`, and the worker were absent. The dashboard could import manually, but no scheduler could run.

The deployed files are the repository worker revision (`934b211`) plus two Phase 5 changes:

- `scripts/sync_university_snapshot.php` now loads the production `REDIS_TTL_*` / `REDIS_DEFAULT_TTL` values from the CLI environment file, so cache warming uses the same TTLs as the web application.
- Both CLI scripts return HTTP 404 when they are not executed through PHP CLI.

Production-only files were preserved and not redeployed:

- `site/assets_api/.htaccess` with the production `SetEnv` Redis configuration.
- `site/lib/RedisCache.php` with the production `MAX_TTL = 86400` cap.

The worker deployment itself made no MySQL schema, snapshot, archive, or Docker configuration changes. Phase 5.1 later published one explicitly authorized snapshot; see section 9.

## 2. Files deployed

All paths are under `/home/ubuntu/cpe-hub/site`. Modes are `0664`, owner `ubuntu:ubuntu`, readable by Apache `www-data` (uid 33).

| File | Action | SHA-256 |
|---|---|---|
| `assets_api/import_university_snapshot.php` | replaced | `f26f7f14d8c64465fc7d59acf4de8e89a91795cace15c2e71ace12709157b14b` |
| `assets_api/university_snapshot_import_lib.php` | replaced | `64b9ca111471c6df67ee140cc7b83d683e35a9087c431e45bf822ed288974db6` |
| `assets_api/university_snapshot_job.php` | new | `67b238a3af9128f6be0b8e68d812c7e179d88a08fb46d3b92c2358d4b6d853d9` |
| `scripts/sync_university_snapshot.php` | new | `bcf057c3803ab5c9f33187a24c78c4651b5afcf1ac3df334c569044e69e645f2` |
| `scripts/warm_asset_inventory_cache.php` | new | `1f3a401a1138170afe84f570ab64a51ed40c368e18b68307bc26e53cc6a25e5e` |

Configuration and scheduler files:

| File | Purpose | Mode |
|---|---|---|
| `/var/lib/cpe-warehouse/snapshot-history/.snapshot-worker.env` | PHP CLI Redis/prefix/TTL/lock settings; no database secrets | `640 www-data:www-data` |
| `/home/ubuntu/cpe-hub/cron/cpe-snapshot-worker.cron` | Staged host-cron entry, schedule line commented out | `644 ubuntu:ubuntu` |

The staging manifest is `/home/ubuntu/cpe-hub/staging/phase5-20261101T085329Z/SHA256SUMS`; `changed-files.txt` and `new-files.txt` list the same set.

## 3. Backup

Protected backup: `/home/ubuntu/cpe-hub/backups/phase5-20261101T085329Z/`

- Directory mode `700`, archive mode `600`, numeric ownership and modes preserved.
- `application.tar` contains the two files that existed before deployment:
  - `assets_api/import_university_snapshot.php` — `bb5698b8c950e9b9fee54626ddbca5a84c6ccd8416a30a01ee60893fe8ee1e87`
  - `assets_api/university_snapshot_import_lib.php` — `eb9b759b4a55d19aa8ed1c4e3cc524cd4f99898f7371e5a58fd1f56391b25ada`
- `affected-files.stat`, `affected-files.sha256`, and `archive.sha256` record the original metadata and checksums.

The three new files had no previous version, so they are removed by rollback rather than restored.

## 4. Worker environment

Apache `SetEnv` in `site/assets_api/.htaccess` does not apply to PHP CLI. The worker therefore loads the CLI environment file through `CPE_SNAPSHOT_ENV_FILE`:

```
APP_ENV=production
REDIS_ENABLED=true
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0
REDIS_KEY_PREFIX=cpe:production:
REDIS_DEFAULT_TTL=300
REDIS_TTL_SNAPSHOT_LIST=300
REDIS_TTL_SNAPSHOT_HISTORY=86400
REDIS_TTL_ASSET_SUMMARY=86400
REDIS_TTL_MAINTENANCE=300
REDIS_MAX_ENTRY_BYTES=524288
REDIS_CONNECT_TIMEOUT=0.2
REDIS_READ_TIMEOUT=0.2
CPE_SNAPSHOT_MAX_ATTEMPTS=3
CPE_SNAPSHOT_RETRY_BASE_SECONDS=30
CPE_SNAPSHOT_LOCK_TTL=900
CPE_SNAPSHOT_LOCK_WAIT_SECONDS=300
```

Database credentials and `CPE_SNAPSHOT_ARCHIVE_DIR` continue to come from the container environment. The worker runs as `www-data` so new archives keep the existing ownership.

## 5. Verification

### PHP and dependencies

- PHP 8.3.36 CLI in `cpe-hub-web-1`; `php -l` passed on all five PHP files.
- Extensions required by the worker are present: `curl`, `pdo_mysql`, `openssl`, `mbstring`, `json`, `zlib`.
- `proc_open` is available and `disable_functions` is empty.
- Predis 3.7.0 is installed at `site/vendor`; `PING` returned `PONG` as `www-data`.
- PHP CLI `memory_limit` is 128 MiB; the full dry run completed within it.

### MySQL

- MySQL 8.0 container healthy; warehouse size 14.2 MiB.
- `web` grants are additive only: `SELECT` plus `INSERT`/`UPDATE` on dimension tables, `INSERT` on `dim_inventory_snapshot` and `fact_asset_inventory`. There is no `DELETE` or snapshot `UPDATE`.
- MySQL advisory lock verified with two live connections: `GET_LOCK` returned `1` then `0`, release returned `1`.
- An unreachable database made the worker exit 1 with `Snapshot worker failed before publication`, before any University API request.

### University API

- `assets.php?limit=100&page=1` returned HTTP 200 in 1.73 s from the web container.
- Three independent validations each collected **4,324 assets** over 44 pages, with total/duplicate/page-shift checks and a final page-one re-read.
- Type and category reference endpoints returned 63 types and 20 categories.

### Archive storage

- `/home/ubuntu/cpe-hub/snapshot-history` is bind-mounted at `/var/lib/cpe-warehouse/snapshot-history`, owned `www-data:www-data`, mode `770`.
- Write test as `www-data` succeeded.
- Existing archives are unchanged: three JSON files of 3,707,552 bytes each, SHA-256 values unchanged.
- Existing archive JSON decoded correctly and contains 4,324 assets.

### Baseline immediately before the Phase 5.1 import

| Item | Value |
|---|---:|
| `dim_inventory_snapshot` rows | 6 |
| `university_api` rows | 3 (all dated 2026-10-26) |
| `legacy_warehouse` rows | 3 |
| `fact_asset_inventory` rows | 25,968 |
| `dim_asset` rows | 4,336 |
| Automatic (`CPE API AUTO`) labels | 0 |
| JSON archives | 3 |

The dashboard currently selects `6f800cea-0520-4d3c-bc4f-75d87fa3005b` (`CPE API · 2026-10-26 06:00:46 · 6F800CEA`, 4,324 assets).

## 6. Dry run

Command:

```bash
docker exec -u www-data \
  -e CPE_SNAPSHOT_ENV_FILE=/var/lib/cpe-warehouse/snapshot-history/.snapshot-worker.env \
  cpe-hub-web-1 php /var/www/html/scripts/sync_university_snapshot.php \
  --scheduled --dry-run
```

Result:

```json
{"state":"dry_run","date":"2026-11-01","snapshot":{"key":"id:91675428-9247-4188-95fd-5606e9b53a43","dateKey":20261101,"label":"CPE API AUTO 2026-11-01 91675428","sourceSystem":"university_api","assets":4324}}
```

- Elapsed API collection and validation: about **77 seconds**.
- Snapshot rows, facts, dimensions, and JSON archives were unchanged afterwards: 6 snapshots, 25,968 facts, 3 archives.
- The dry run wrote only audit lines to `.university-snapshot-worker.log` and temporary Redis status metadata. The status keys were removed after testing.

A second scheduled dry run started while the first was running, waited for the lock, and completed after release. A separate test that held the file, MySQL, and Redis locks made a manual dry run return `{"state":"busy"}` immediately, without calling the University API.

### Lock and fallback tests

| Test | Result |
|---|---|
| Isolated Redis namespace `acquire` / `acquire` | `true` / `false` |
| Owner-checked renew by non-owner / owner | `false` / `true` |
| Release by non-owner / owner | `false` / `true` |
| Acquire after owner release | `true` |
| MySQL advisory lock contention | `1` then `0` |
| Worker lock held, second worker | `{"state":"busy"}` |
| Redis disabled (`REDIS_ENABLED=false`) dry run | `dry_run`, 4,324 assets, 77 s |
| MySQL unreachable | exit 1, no publication |
| Local `tests/university_snapshot_lock.integration.test.php` | passed |
| Local `tests/university_snapshot_import.test.php` | 11/11 passed |

All isolated test keys were deleted (`cpe:test:phase5-*` count is 0). The production job metadata created by the failure test was also removed.

## 7. Dashboard health

- All dashboard views returned HTTP 200: Overview, Portfolio, Departments, Locations, Aging, Acquisition, Governance.
- `inventory_dashboard_views.php` and `inventory_acquisition_details.php` returned 200.
- Repeated dashboard requests returned `X-Cache: HIT`; first requests were `MISS`.
- Frontend asset version remains `20261101.7`.
- Manual import guards: `GET` returns 405, `POST` without the same-origin header returns 403. No import was started.
- `/scripts/...` returns 404 over HTTP, so the read-only source mount exposes no CLI execution endpoint.
- No 500 responses were observed. The only 403 was the deliberate headerless `POST` used to test the manual-import origin guard.

Redis after testing: 8.81 MiB of 96 MiB, `evicted_keys=0`, no production snapshot job keys left.

## 8. Scheduler (staged, disabled)

Ubuntu cron 3.0pl1 does not support `CRON_TZ`, and the host runs UTC. 02:00 Asia/Bangkok (UTC+7, no DST) is **19:00 UTC on the previous day**, so the schedule is `0 19 * * *`.

The staged `/etc/cron.d` entry is:

```cron
0 19 * * * root /usr/bin/docker exec -u www-data -e CPE_SNAPSHOT_ENV_FILE=/var/lib/cpe-warehouse/snapshot-history/.snapshot-worker.env cpe-hub-web-1 php /var/www/html/scripts/sync_university_snapshot.php --scheduled >> /home/ubuntu/cpe-hub/snapshot-history/.snapshot-worker.cron.log 2>&1
```

It is commented out in `/home/ubuntu/cpe-hub/cron/cpe-snapshot-worker.cron`. There is no `/etc/cron.d` CPE entry, no user crontab, and no container scheduler. The cron service is enabled, and all three containers use `restart: unless-stopped` with `RestartCount=0` and unchanged container IDs, so the existing stack returns after an EC2 reboot.

Activation steps (after separate approval):

```bash
# uncomment the schedule line in the staged file, then
sudo install -o root -g root -m 0644 \
  /home/ubuntu/cpe-hub/cron/cpe-snapshot-worker.cron \
  /etc/cron.d/cpe-snapshot-worker
```

## 9. Phase 5.1 one-time production import

The user authorized exactly one `--scheduled` worker invocation after all preflight checks. It ran once as `www-data` on 2026-11-01 and exited successfully in **88.9 seconds**. No retry invocation was issued.

| Check | Result |
|---|---|
| Bangkok date and duplicate guard | `2026-11-01`; no scheduled snapshot existed before; exactly one exists after |
| University API | HTTP 200; preflight reported 4,324; worker validated/imported 4,324; post-import API still reported 4,324 |
| New snapshot | `f6d1ce63-710b-4706-9a61-b20f15e0964b`, `CPE API AUTO 2026-11-01 F6D1CE63` |
| Snapshot metadata | `asset_count=4324`, `snapshot_date_key=20261101`, `source_system=university_api` |
| New facts | 4,324 rows and 4,324 distinct asset IDs |
| Archive | `assets_20261101__f6d1ce63-710b-4706-9a61-b20f15e0964b.json`, 3,707,542 bytes, readable, valid JSON, metadata matched |
| API-to-warehouse identity check | All 4,324 archive asset IDs exactly matched the new snapshot's fact asset IDs |
| Totals after import | 7 snapshots, 4 University snapshots, 30,292 facts, 4 JSON archives, 4,336 asset dimensions |
| Historical preservation | All six prior snapshot fact counts and metadata matched baseline; all three prior archive SHA-256 values were unchanged |
| Job metadata | `succeeded`; `cacheWarmed=true`; `snapshot:daily:last_success` points to the new ID |

The pre-import backup included a full logical `cpe_warehouse` dump and all three existing JSON archives. The compressed bundle was **659,001 bytes**, passed compression and checksum checks on EC2, and was copied to a user-restricted off-host folder; local SHA-256 matched the EC2 bundle (`36286b239645d16df28a1fbd1ab6d61b32a9ca5b49f2f96bba7b7b895e980e87`).

### Cache and Dashboard verification findings

- The post-import default `view=overview` API returned HTTP 200, selected the new snapshot ID, returned seven snapshot options, and reported 4,324 assets. The first active-view request returned `X-Cache: MISS`; that normal cache-aside request populated the active overview entry.
- The worker's `cacheWarmed=true` did not mean the active section-specific Overview key had been warmed. The deployed warm script requests the legacy full-response path without `view=overview`. No further Dashboard API requests were made after discovering this discrepancy, per the instruction to stop on a verification failure. The worker did invalidate the warehouse cache version; the current key is present with value `4`, and the default API returned the new snapshot rather than stale data. A before/after version value was not recorded.
- Browser verification could not be completed: the preview browser returned “Authentication required” twice, and the CUA browser host reported unavailable. The Overview API default selection was verified server-side, but browser rendering and interactive historical selection remain unverified for this new snapshot.
- Redis, MySQL, and Apache remained healthy; no containers were restarted. The recurring scheduler remains disabled.

## 10. Rollback

The pre-publication rollback below is no longer applicable to the database state. Do not remove or restore over the published snapshot, its facts, or its archive. If application files need a rollback, restore only code/configuration and leave all snapshot data intact.

Before any snapshot is published:

```bash
cd /home/ubuntu/cpe-hub/site
tar --numeric-owner -xpf /home/ubuntu/cpe-hub/backups/phase5-20261101T085329Z/application.tar
rm -f assets_api/university_snapshot_job.php \
      scripts/sync_university_snapshot.php \
      scripts/warm_asset_inventory_cache.php
rmdir scripts 2>/dev/null || true
```

No Apache or container restart is required: the source is re-read per request and OPcache validates timestamps (`opcache.validate_timestamps=1`).

Scheduler rollback:

```bash
sudo rm -f /etc/cron.d/cpe-snapshot-worker
```

If caching must be disabled, set `REDIS_ENABLED false` in `site/assets_api/.htaccess`; PHP then reads MySQL directly. Do not delete published snapshots, facts, or archives as part of a rollback.

## 11. Remaining risks

1. **Disk capacity.** After this import, the root volume has about 1.35 GiB free (80% used). Each daily archive is about 3.7 MiB (about 1.3 GiB per year), and each day adds 4,324 fact rows. Enlarge the EBS volume or define an approved retention policy before long-term automation.
2. **Archive off-host coverage.** The verified off-host bundle is a pre-import recovery point. The new archive itself remains on EC2; establish ongoing archive backup before relying on long-term history.
3. **Active-view cache warm gap.** The worker warm script did not prefill the section-specific `view=overview` key; its first post-import request was a MISS. The verification request then populated that cache entry. Fixing the worker warmer requires a separate code change and deployment.
4. **Browser verification unavailable.** The browser host was unavailable, so interactive historical selection and visual rendering for this new snapshot were not verified.
5. **No automatic catch-up.** Cron runs once per day; a missed window (for example a reboot at 19:00 UTC) is not replayed automatically. Use `--retry` only after checking the Bangkok-day duplicate marker.
6. **Redis lease expiry.** A stalled process can lose the Redis lease after 900 s, but the archive file lock and MySQL advisory lock remain held until the process exits, and a failed lease renewal aborts the run.
7. **Manual import behavior changed.** The Import button now shares the same locks, label rules, and cache invalidation as the scheduler. It is still POST-only and same-origin protected.
8. **Log growth.** Worker and cron logs are small but are not rotated.
9. **Lock-wait zero.** `CPE_SNAPSHOT_LOCK_WAIT_SECONDS=0` falls back to the default because of the existing `?:` parsing; the production value is 300 s.
10. **Missing environment file.** If `.snapshot-worker.env` is ever removed, the worker falls back to the `local` Redis defaults, publishes the snapshot, but cannot invalidate or warm the `cpe:production:` cache. The dashboard would keep serving cached data until its TTL expires. Verify the file exists before activating cron.
11. **Crash leftovers.** A killed worker can leave an unreferenced `assets_<date>__<id>.json.tmp` in the archive directory. It is never treated as a valid archive; remove it only during an approved maintenance window.
12. **Test audit lines.** `.university-snapshot-worker.log` intentionally contains the dry-run and deliberate failure-test entries from this deployment. They are an audit trail, not production runs.

## 12. Approvals required

1. **Recurring schedule only** — require separate approval before installing `/etc/cron.d/cpe-snapshot-worker`. The one authorized production snapshot is complete; the scheduler remains disabled.

The worker has written one successful production snapshot. Do not launch it again for 2026-11-01; verify the duplicate marker before any later manual retry. No recurring schedule was installed.
