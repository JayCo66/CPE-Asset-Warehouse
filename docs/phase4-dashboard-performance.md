# Phase 4 Dashboard performance verification

## Scope and status

This phase implements and verifies Acquisition payload reduction and startup loading changes against local XAMPP, MySQL, Redis, a real browser, and the live EC2 deployment. Production release `phase4-20261101T081231Z` is active with frontend asset version `20261101.7`. The Snapshot Worker and recurring Production schedule remain disabled; no snapshot import was run.

## Production layout verified read-only

- Apache/PHP 8.3.36 runs in `cpe-hub-web-1`; Predis 3.7.0 is already available.
- `/home/ubuntu/cpe-hub/site` is bind-mounted read-only at `/var/www/html`. Replace files from the EC2 host, not from inside the container.
- Apache runs as UID/GID `33:33`. The host release tree is UID/GID `1000:1000`; the site directory is mode `775`, and inspected application files are mode `664`. Those files are readable by Apache through the world-read bit.
- The PHP CLI reports OPcache timestamp validation enabled with a two-second revalidation frequency. `apachectl -M` confirms `mod_php` and `mpm_prefork` are active. No container restart was performed.
- The current mount is a fixed directory bind mount. Swapping the host directory for a symlink would not safely switch the mounted tree.
- The release was activated by same-directory per-file replacement on the EC2 host. Apache, MySQL, and Redis container IDs were unchanged. No database schema, records, volumes, scheduler, or environment files were changed.
- Production-only changes were preserved: `assets_api/inventory_query.php` retains the `university_api` latest-snapshot precedence fix, and production `lib/RedisCache.php` retains its 24-hour TTL cap. The production-only optional `data-snapshot-last-import` markup was not touched.

## Changes

- `view=acquisition&summary=1` returns only the five acquisition aggregates needed for the visible charts. The existing full response remains in place when `summary` is omitted, and the legacy full response remains the default when `view` is omitted.
- Cohort and cross-dimension details use bounded SQL aggregation and pagination. The browser requests the selected cohort detail on demand and requests cross-dimension detail only after its disclosure opens. Filters and the exact selected `snapshot_id` are included in detail requests and Redis keys.
- The summary cache key has an explicit projection version so earlier, larger cached values cannot be served for the compact response.
- Explorer-only utility modules load when Explorer or an asset detail page opens, rather than during Overview startup.
- No schema, index, or warehouse data changes were made.

## Measurements

### Production browser and API results

The `.6` baseline below was supplied and previously verified. Post-deployment startup figures are medians of three real-browser navigation samples; run-to-run variation was substantial. FCP and LCP paint entries were not exposed by the browser performance trace, so no post-deployment values are claimed for them.

| Metric | Before (`.6`) | After (`.7`) |
|---|---:|---:|
| FCP | 764 ms | Not exposed by browser trace |
| LCP | Not recorded | Not exposed by browser trace |
| DOMContentLoaded | 1,544.5 ms | 1,072.8 ms median |
| Overview API request start | 2,687.1 ms | 2,140.0 ms median |
| Overview usable | 3,226.2 ms | 3,009.4 ms median |
| Overview API response | 5,198 bytes transferred | 44,888 bytes decoded / 5,198 bytes transferred |
| Acquisition usable | 8.36 s | 750.2 ms warm click-to-usable |
| Acquisition response | about 4.50 MB decoded | 70,638 bytes decoded / 6,815 bytes transferred |

The Overview API started 547 ms earlier (about 20%) and became usable 217 ms earlier (about 7%) against the supplied baseline. The 1–2 second usability goal was not met. In the `.7` waterfall, `executive-dashboard.mjs` was about 236 KB decoded / 43 KB transferred and took about 1.16 seconds to load before the Overview request. That module dependency is the main remaining startup opportunity. The sampled Overview API request itself took about 509 ms; this is a single browser sample, not a median.

For Acquisition, the decoded initial summary is 98.4% smaller than the old full response. The old `.6` response sample was 4,495,986 decoded / about 140,491 transferred bytes; the `.7` summary sample was 70,638 decoded / 6,815 transferred bytes. On a cold browser load, the summary MISS took 410 ms and the selected cohort detail MISS took 397 ms. A later warm summary HIT took 718 ms, so this sample did not show lower latency on the HIT; payload reduction and on-demand detail behavior are verified, while request timing varied. Acquisition click-to-usable at 750 ms was measured with the relevant summary and selected cohort detail already warm.

Redis after deployment reported 6.19 MiB used of 96 MiB, 71 keys, and zero evictions. Apache, MySQL, and Redis remained running with their pre-deploy container IDs. All ten changed files were readable by Apache UID 33; the new PHP include is mode `644`, and existing files retained their recorded modes. HTTP checks returned 200 for the Asset Inventory page and versioned JS/module/fragment assets. Browser API requests returned HTTP 200. No HTTP 403 was observed. No port-80 interruption was observed.

The after-deployment PHP probe verified Redis `PONG`, MISS, HIT, version invalidation followed by a fresh MISS, and MySQL fallback with Redis deliberately pointed at a closed loopback port. The fallback performed a read-only warehouse row-count query; it did not change data. A unique temporary Redis test namespace was removed after the probe.

Production baseline supplied for release `.6`:

| Metric | Before |
|---|---:|
| FCP | 764 ms |
| DOMContentLoaded | 1,544.5 ms |
| Overview request start | 2,687.1 ms |
| Overview usable | 3,226.2 ms |
| Acquisition load | 8.36 s |
| Acquisition decoded response | about 4.50 MB |
| Redis HIT check | 457.1 ms |

Local Chrome after the changes, three page navigations against XAMPP and local Redis:

| Metric | Local median |
|---|---:|
| FCP | 44 ms |
| LCP | 44 ms |
| DOMContentLoaded | 16.9 ms |
| Overview API request start | 33.6 ms |
| Overview usable | 186.7 ms |
| Acquisition click to usable, including selected cohort details | 117.8 ms |

These local browser numbers are not comparable to EC2 browser numbers: Chrome was headless on the same machine as Apache, PHP, MySQL, and Redis.

Local API samples used the same warehouse snapshot and age thresholds 16–18. Each first request was a Redis MISS; each repeated summary request was a HIT.

| Request | Samples | Median | Decoded payload |
|---|---|---:|---:|
| Legacy full Acquisition response, cold | 451.4, 402.6, 387.6 ms | 402.6 ms | 4,492,800–4,493,719 bytes |
| Compact Acquisition summary, cold | 92.3, 84.8, 110.1 ms | 92.3 ms | 71,154–71,198 bytes |
| Compact Acquisition summary, warm | 60.9, 25.8, 26.4 ms | 26.4 ms | 71,154–71,198 bytes |

The summary payload is 98.42% smaller than the full Acquisition response in these samples. On the same three thresholds, canonical comparisons matched all chart aggregate values and the Overview metrics against the legacy response. A separate request with `view` omitted retained the full analytics response shape.

In the local browser, Overview transferred 46,896 bytes for a 46,596-byte decoded response. The compact Acquisition summary transferred 71,647 bytes for 71,347 decoded bytes; the selected cohort detail transferred 2,628 bytes for 2,328 decoded bytes. XAMPP returned no `Content-Encoding`, so the body was not compressed locally. In Production, the Acquisition summary sample transferred 6,815 bytes for a 70,638-byte decoded response; the Overview response transferred 5,198 bytes for 44,888 decoded bytes.

The local browser JSON parser measured about 0.7 ms for Overview and 1.0 ms for Acquisition. Instrumented Acquisition HTML writes took about 1.6 ms total; this measures synchronous DOM insertion, not full layout or paint. The browser recorded no long tasks. Explorer utility modules were absent from the Overview and Acquisition resource lists.

Redis on local port `6380` reported 5.90 MiB used of 96 MiB, `allkeys-lru`, and zero evictions. The key count at the end of testing was 66 and includes temporary test and benchmark keys.

`EXPLAIN` for both the Acquisition summary scan and paginated detail aggregate used `uq_fact_inventory_snapshot_asset` for `fact_asset_inventory`, with `eq_ref` primary-key lookups for the required dimensions. The summary's stable fact ordering uses filesort; detail grouping uses a temporary table and filesort. No index was added.

## Functional and regression verification

- The latest `university_api` snapshot was selected initially. The snapshot selector exposed historical snapshots; selecting one on Overview kept that exact snapshot through navigation to Acquisition and other sections.
- Acquisition summary, selected cohort detail, cross-detail disclosure, and page 2 loaded successfully. The filter test sent a selected department with the exact snapshot ID.
- Overview, Portfolio, Departments, Locations, Aging, Acquisition, Governance, and Explorer rendered in the browser. Rapid switches back to Overview cancelled in-flight section requests; the final Overview showed the selected snapshot without stale Acquisition content or console errors.
- The standalone Borrowing page loaded its API successfully. The Maintenance Facility and Repair views loaded with HTTP 200 APIs and no browser errors. In the unified inventory shell, the Borrowing and Maintenance links still display their existing placeholder copy.
- Local Redis tests verified PHP connectivity, MISS, HIT, expiration, version invalidation, and MySQL-loader fallback when Redis is unavailable.
- Full JavaScript suite: 136 passed, 0 failed, 0 skipped, including live local API tests for all dashboard views, filters, snapshot selection, inventory pagination/export, and the new Acquisition summary/detail contract.
- PHP tests passed for analytics, dashboard view projection, detail parameter validation, inventory filtering, pagination, Redis cache behavior, Redis connectivity, and snapshot-import validation. PHP syntax checks passed for all changed API files.
- The MySQL lock integration test was not run in this phase. It creates a temporary snapshot row inside a transaction and coordinates the import lock; no import or snapshot publication was performed.

## Controlled Production rollout and rollback

### Active release record

- Release ID: `phase4-20261101T081231Z`; frontend asset version `20261101.7`.
- Backup: `/home/ubuntu/cpe-hub/backups/phase4-20261101T081231Z/application.tar`; protected directory mode `700`, archive mode `600`, numeric ownership and file modes preserved. The archive contains the nine pre-existing changed files. The new include `assets_api/inventory_acquisition_details.php` is listed in `/home/ubuntu/cpe-hub/staging/phase4-20261101T081231Z/new-files.txt`, with its checksum in the staging `SHA256SUMS`.
- Staging: `/home/ubuntu/cpe-hub/staging/phase4-20261101T081231Z`.
- Production manifest: `assets_api/asset_inventory_dashboard.php`, `assets_api/inventory_analytics.php`, `assets_api/inventory_dashboard_views.php`, `assets_api/inventory_acquisition_details.php`, `src/asset-inv/app.js`, `src/asset-inv/executive-dashboard.mjs`, `src/asset-inv/inventory-dashboard-data.mjs`, `src/asset-inv/dashboard-request-cache.mjs`, `src/asset-inv/governance-quality.mjs`, and `src/asset-inv/index.html`.
- Production PHP 8.3.36 syntax checks, JavaScript syntax checks, dependency checks (Predis 3.7.0), browser regression, API compatibility, Redis HIT/MISS/invalidation, and MySQL fallback checks passed. The local full JavaScript suite passed 136/136.
- Snapshot automation remains disabled. No import was run.

The following is the rollback procedure for the active release. Do not enable the Snapshot Worker or its schedule as part of this release.

1. Recheck the live mount, PHP runtime, and file manifest. Compare every target with the staged release and stop if an unreviewed Production-only edit is found. Include only reviewed application files; do not include `.env`, snapshot archives, or scheduler files.
2. Stage the release and changed-file manifest outside `/home/ubuntu/cpe-hub/site`. Run JavaScript checks locally and PHP syntax checks using the Production PHP 8.3.36 runtime before activation. Verify the release checksums.
3. Create a protected backup of only the affected files, preserving numeric ownership and modes:

   ```sh
   umask 077
   release_id=phase4-YYYYMMDDTHHMMSSZ
   root=/home/ubuntu/cpe-hub/site
   backup_dir=/home/ubuntu/cpe-hub/backups/$release_id
   install -d -m 700 "$backup_dir"
   tar --numeric-owner -cpf "$backup_dir/application.tar" -C "$root" -T "/home/ubuntu/cpe-hub/staging/$release_id/changed-files.txt"
   chmod 600 "$backup_dir/application.tar"
   ```

4. Record the current file hashes and `stat -c '%u:%g %a %n'` output. The inspected source files are `1000:1000`, mode `664`; the site directory is `1000:1000`, mode `775`.
5. Activate only from the host. For each explicit relative path, copy to a temporary file beside the destination with owner `1000:1000` and the mode recorded for that exact target, verify it is readable as Apache UID 33, then rename that file into place. Preserve `664` for the current controller, analytics, JavaScript, and HTML files; preserve `644` for `inventory_dashboard_views.php` and `dashboard-request-cache.mjs`. New include-only PHP helpers use `644`. Do not apply one mode to the whole manifest. Same-directory rename is atomic for each file. For a path such as `src/asset-inv/app.js`:

   ```sh
   relative=src/asset-inv/app.js
   mode=664
   target="$root/$relative"
   temporary="$target.new.$release_id"
   install -o 1000 -g 1000 -m "$mode" "/home/ubuntu/cpe-hub/staging/$release_id/files/$relative" "$temporary"
   docker exec -u 33 cpe-hub-web-1 test -r "/var/www/html/$relative.new.$release_id"
   mv -f "$temporary" "$target"
   ```

   Do not use recursive `chmod`/`chown`, replace the bind-mount root, or write into the container's read-only mount.
6. Install the PHP detail/view helpers before the PHP controller, then deploy the versioned JavaScript modules, `app.js`, and `index.html` last. This keeps the old frontend active until its new dependencies are present. The multi-file update is not globally atomic, so keep the API backward-compatible during the sequence.
7. Check each file as Apache UID 33 with `docker exec -u 33 cpe-hub-web-1 test -r /var/www/html/<relative-path>`. Do not restart Apache or recreate containers for normal file activation. The current PHP config reports timestamp revalidation; confirm the new PHP code is served within the configured revalidation interval.
8. Immediately check the Inventory page, Overview and Acquisition API status/payloads, legacy full-response compatibility, Redis HIT/MISS, and MySQL fallback. Confirm port 80 has no 403 and existing container IDs/health are unchanged. Roll back on any critical error.

Rollback restores existing files from the protected archive, preserving stored ownership and permissions:

```sh
tar --numeric-owner --same-owner --same-permissions -xpf "$backup_dir/application.tar" -C "$root"
```

For each path listed as new in the release manifest, remove only that exact path after the old controller has been restored. Before removal, compare its SHA-256 with the staged release checksum; stop if it differs. This returns the deployed tree to its pre-release file set without risking a later file written at the same path.

Then verify hashes, ownership, modes, Apache UID 33 readability, port-80 health, and the original frontend asset version. Do not run `docker compose down`, restart/recreate MySQL or Redis, alter volumes, or modify the warehouse database.
