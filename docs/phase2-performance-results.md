# Phase 2 verification and performance results

Recorded 2026-10-31. Latencies are real request timings from the local Apache/PHP endpoint and the live EC2 endpoint; they are not estimates.

## Local daily import

- Before the run, the local warehouse had 8 snapshots and 34,716 fact rows, with no automatic University API snapshot for 2026-10-31.
- `scripts/sync_university_snapshot.php --scheduled` completed with 4,324 assets. It published one `university_api` snapshot for the Bangkok calendar date, wrote `output/history/assets_20261031__84bb743b-66a9-41c6-9579-210e466731d7.json`, and reported `cacheWarmed: true`.
- The archive exists and its `.tmp` file does not. The warehouse now has 9 snapshots and 39,040 fact rows; the automatic marker count for the date is one. The previous eight snapshots remain.
- A second `--scheduled` launch returned `skipped` with `already_imported` and did not add another snapshot.
- A default Dashboard GET selected that exact new snapshot ID, returned 4,324 assets, and returned `X-Cache: HIT` after warming.
- The Windows Task Scheduler task `CPE-Asset-Warehouse-Daily-Snapshot` is registered for 02:00 in `SE Asia Standard Time` (Asia/Bangkok). It has not run from Task Scheduler yet; its next run is 2026-11-01 02:00. It runs under the current interactive Windows account and starts missed runs after the account signs in.

## Dashboard latency

Endpoint: `assets_api/asset_inventory_dashboard.php`, HTTP 200.

| Environment and run | Samples | Median | Response body |
|---|---|---:|---:|
| Local, before cache activation | 0.632284, 0.591977, 0.590755 s | 0.591977 s | 5,326,886 bytes |
| Local, after the successful snapshot import; five cache hits | 0.217742 s median of five | 0.217742 s | 5,327,695 bytes |
| EC2, pre-activation production baseline | 0.863148, 0.801277, 0.798833, 0.791956, 0.794483 s | 0.798833 s | 5,325,987 bytes |

The five local post-import requests all reported `X-Cache: HIT`, and their SHA-256 body hashes matched. The observed local warm median is about 63% lower than the earlier local baseline. The warehouse changed between those runs when the new daily snapshot was imported, so this is an observed comparison, not a controlled same-data benchmark.

## Production PHP cache rollout

PHP Redis caching was activated on EC2 on 2026-10-31 under the authorized PHP-only rollout. The recorded before/after median request times were:

| Endpoint | Before activation | Warm cache |
|---|---:|---:|
| Asset Inventory overview | 850.2 ms | 173.9 ms |
| Facility summary | 9.92 ms | 2.93 ms |
| Repair summary | 15.48 ms | 4.17 ms |

The repeated requests reported `X-Cache: HIT` after the initial miss, and the cached and uncached response hashes matched. Redis-unavailable requests fell back to MySQL. Personal or authenticated views bypass shared caching. Borrowing details remain uncached.

## Redis usage and query plans

- Local Redis after the import and warm-up: 2.10 MiB used of 96 MiB configured; 17 keys; 10 response entries totaling 731,088 bytes; largest response entry 393,352 bytes; 0 evictions. The largest entry fits below the 512 KiB per-entry cap.
- EC2 Redis after the isolated staging test was cleaned up and before PHP cache activation: 1.29 MiB used of 96 MiB configured; 0 evictions. Production post-activation Redis memory and key count were not measured in this run.
- Local MariaDB 10.4 and EC2 MySQL 8 both use `uq_fact_inventory_snapshot_asset` for the `fact_asset_inventory.snapshot_id` filter. Dimension joins use `eq_ref` primary-key lookups. Snapshot ordering uses the existing `idx_dim_inventory_snapshot_date`. No index or schema changes were made.

## EC2 staged verification and limits

- PHP 8.3.36 in `cpe-hub-web-1` resolved the internal `redis` service. A temporary copy of the current cache code and Predis passed Redis `PING`, miss-then-hit behavior, and owner-checked lock renewal/release.
- The staged CLI worker dry run validated 4,324 University API assets without publishing a database snapshot or archive. Its temporary files and test-prefix Redis key were removed afterward.
- The existing web, MySQL, Redis, and phpMyAdmin containers remained running and healthy. Redis port 6379 has no published host binding.
- Production PHP caching is active after the authorized PHP-only rollout. No production snapshot worker or recurring EC2 scheduler is installed. The commented EC2 cron example remains disabled until the user separately approves automated production snapshots.

## Verification run

- PHP tests passed, including Redis cache, connectivity, snapshot import, and MySQL lock integration tests.
- JavaScript tests and syntax checks passed. Four live API integration cases were skipped by the existing test setup.
- Python ETL cache invalidation and snapshot-history tests passed using a temporary isolated PyMySQL install; no Python package was added to the global environment.
- PHP syntax checks, `docker compose config --quiet`, and `git diff --check` passed. Git reported only its configured LF/CRLF notices.
- A real-browser check could not run because the browser access host was unavailable. Local HTTP API behavior and unit tests were used instead.
