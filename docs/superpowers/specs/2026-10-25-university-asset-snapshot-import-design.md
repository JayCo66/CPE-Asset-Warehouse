# University Asset Snapshot Import

## Intent

Let inventory staff explicitly fetch the university asset API and save the complete response as a selectable snapshot in the local `cpe_warehouse` database. The snapshot selector will retain the existing demo snapshot under a `DEMO-` label and show the imported university snapshot separately, even when both were captured on the same date.

## Verified current state

- The warehouse identifies an inventory snapshot only with `fact_asset_inventory.snapshot_date_key` (`YYYYMMDD`); it has no snapshot name or ID.
- Local snapshots are `2026-10-25` with 4,424 assets and `2026-10-22` with 4,324 assets. The repository's demo-data design documents 100 synthetic assets for the 2026-10-25 snapshot.
- The university endpoint returns 4,324 assets in 44 pages of 100 (the final page has 24). Its envelope is `{ success, message, total, data }`.
- Asset rows include status, department/type/category/location IDs, years, source, and record update date. They omit model and detailed location fields.
- The ETL already defines status mapping (`พร้อมใช้งาน` is available; `ชำรุด` and `ส่งซ่อม` are damaged; `ถูกยืม` is unavailable without being classified as damaged) and acquisition-date/age calculation.
- The ETL rebuilds the warehouse from `output/history`; its current history format allows only one file per date. Import files must be archived and the ETL history reader extended so a later full refresh does not erase this snapshot.

## Goals

- Import all validated university API pages through a same-origin PHP endpoint into `cpe_warehouse`.
- Store snapshots with distinct IDs, names, capture dates, sources, import times, and record counts.
- Keep `snapshot_date_key` for calendar reporting while using snapshot ID to select fact rows.
- Label the existing 2026-10-25 demo snapshot `DEMO-2026-10-25`; retain the 2026-10-22 label as its date.
- Put an accessible import button immediately to the right of the snapshot selector in its existing panel.
- On success, select the imported snapshot and refresh the dashboard using existing filters and API error/loading patterns.
- Preserve the source payload under `output/history` so the existing ETL full refresh can reproduce imported snapshots.

## Non-goals

- Do not alter or import into the source `cpeasset` database.
- Do not change borrowing, repair, or maintenance data or workflows.
- Do not fabricate unavailable model, category-name, or location-detail values.
- Do not calculate the retired below-threshold measure.
- Do not modify production data or contact any endpoint other than the fixed university asset API.

## Approaches considered

1. **Add snapshot identity and labels (selected).** Add a snapshot dimension and `snapshot_id` to inventory facts, then update inventory queries and ETL. This preserves both same-day snapshots and persists the `DEMO-` name.
2. **Replace the existing 2026-10-25 facts.** This avoids a schema change but destroys the existing 4,424-row demo snapshot, so it does not meet the request.
3. **Keep date-only keys and wait for a later day.** This preserves current data but cannot import a second snapshot today or persist a name. It postpones the requested behavior.

## Design decisions

### Snapshot model and migration

- Add `dim_inventory_snapshot` with a generated `snapshot_id`, `snapshot_date_key`, `snapshot_label`, `source_system`, `imported_at`, and `asset_count`.
- Add `snapshot_id` to `fact_asset_inventory` and backfill existing rows by `snapshot_date_key`. Keep `snapshot_date_key` unchanged for date semantics and existing date joins.
- Use UUID snapshot IDs: deterministic UUID v5 values for the two legacy archives and generated UUID v4 values for new captures. Archive metadata carries each ID so ETL full refresh restores the same identity.
- Backfill existing metadata with `DEMO-2026-10-25` for the documented 4,424-row demo snapshot and `2026-10-22` for the other existing snapshot.
- Use snapshot IDs in dashboard and Explorer filtering. Keep existing `snapshot=YYYYMMDD` requests backward-compatible by resolving them to the newest snapshot ID for that date; new UI requests use IDs.
- Extend `warehouse_schema.sql`, provide an additive migration for the current database, and update `etl_warehouse.py` so generated full refreshes write snapshot metadata and fact IDs for every archive file, including multiple files on one date.

### University import

- Add a fixed-purpose `POST /assets_api/import_university_snapshot.php`; the browser never calls the university host directly and cannot submit an arbitrary URL.
- Fetch pages from `https://cpe.eng.kps.ku.ac.th/CPEAssets/assets_api/assets.php?limit=100&page=N` with TLS verification, bounded timeouts, a page/row cap, and response-shape validation. Require consistent `total`, successful pages, valid unique `asset_id` values, and exactly the reported record count before writing.
- The university API has no source-side snapshot token. Re-fetch page one after pagination to detect a changed total or first page; a complete atomic upstream view cannot be guaranteed by this API.
- Reuse the ETL's verified status, acquisition-date, age, source-grouping, and location-key rules. Reuse existing dimension details when available; store missing source fields as `NULL` and leave the retired threshold flag unset.
- Create a new snapshot ID for each successful import, even when its calendar date matches another snapshot. Use a label such as `CPE API · YYYY-MM-DD HH:mm` so repeat imports on one date remain distinguishable.
- Archive the validated payload atomically in `output/history` using a unique ID filename. Commit metadata and fact rows in one MySQL transaction; remove the archive if the database transaction fails.
- Return a consistent JSON result containing the new snapshot ID, label, date, and imported count. Fetch or validation failures must not modify database rows or archives.

### Dashboard interaction

- Add a Thai-labeled primary/secondary action beside the snapshot select, following the existing button styles and CPE tokens.
- Disable the button while the import is in progress and announce progress/result through an accessible live status. On success, refresh snapshot options, select the new ID, and reload analytics. On failure, show a concise error and leave the current selection/data intact.
- Snapshot options include `key` (snapshot ID), `date`, `label`, and `assets`; display `label` while keeping the date available to the dashboard's date notice.
- History comparisons group by snapshot ID, ordered by capture date and import time, so two snapshots on the same day are not merged.

## Scope and affected areas

- Warehouse DDL and a migration for snapshot identity/backfill.
- PHP inventory dashboard, query/filter, and list/export endpoints, plus a new allowlisted importer endpoint.
- `etl_warehouse.py` snapshot archive loading and full-refresh SQL output.
- Asset Inventory snapshot selector markup, scoped CSS, and dashboard request/refresh behavior.
- No borrowing or maintenance module changes.

## Constraints and risks

- The local database must be migrated before the updated dashboard endpoints are used.
- The API does not provide model or detailed location fields; existing local dimension values can be reused, otherwise those values remain unknown.
- The API's per-asset `update_date` is not the inventory capture date; the server capture date is used for `snapshot_date_key`.
- The import archive must remain available to ETL. It is local generated data and must not be committed.
- A same-day repeat import is a separate snapshot, not an overwrite.

## Verification plan

- Validate full pagination and response counts without writing if the remote response is incomplete or malformed.
- Verify migration backfills both existing snapshots and their labels without changing fact counts.
- Verify imported fact count equals the validated API count, both same-day snapshot IDs remain separately selectable, and the prior snapshot's rows remain unchanged.
- Check the import endpoint with PHP lint, JavaScript with Node syntax checking, relevant existing checks, `git diff --check`, and the dashboard in browser after applying the local migration.

## Implementation status

The user approved the snapshot-ID/label approach. Implementation is in place and the local `cpe_warehouse` migration was applied after confirming the 4,324-row 2026-10-22 and 4,424-row 2026-10-25 snapshots. The university importer has not been run; no university records were written during implementation.
