# Snapshot category-key mapping

## Intent

Resolve category keys for CPE API snapshots when the source asset row omits `category_id`, and keep direct snapshot imports consistent with future warehouse ETL rebuilds.

## Current behavior

The local warehouse has three October 26 `university_api` snapshots with 4,324 facts each and null `category_key` on every fact. The source rows omit `category_id`. The direct importer passes that null to `warehouseUniversityDimensionKey`, which returns null without a fallback. The standard ETL already derives a category code from `type_code` and matches it to `asset_categories`.

Some asset rows omit `type_code` but have `type_id`; a category suffix is a `category_code`, not a `category_id` (for example, code `07` maps to category ID `6`). The university site's similarly named sibling endpoints return 404. Docker configures the existing local `assets_api/asset_types.php` and `asset_categories.php` routes against the source database; when those environment URLs are unset, the importer uses the tracked `mock_api/` reference files used by the source seed and ETL.

## Goals

- Use the configured local type and category reference routes when available, with the complete tracked `mock_api/` reference lists as the local fallback; do not hard-code category IDs.
- Prefer an asset's explicit `category_id`; otherwise resolve `type_id` to `type_code`, take the category-code suffix, then resolve that code to the source `category_id` and warehouse `category_key`.
- Stop before persistence if the reference files cannot be loaded or validated, and reject assets whose missing category cannot be mapped rather than silently importing another all-null snapshot.
- Keep archived source rows usable by `etl_warehouse.py`, whose existing fallback remaps category codes on future full refreshes.
- Repair the three affected local snapshots using the existing ETL load path.

## Non-goals

- Change the source CPE API or add columns/migrations to the warehouse schema.
- Change dashboard labels, filters, or unrelated dimension mappings.

## Approaches

1. **Use local reference routes with tracked-file fallback (selected).** Docker reads the source database through the existing local APIs. XAMPP can use the tracked reference files shared with ETL. If the configured routes or files cannot map a row, import stops before database writes.
2. **Keep a shared JSON map.** Imports could run offline, but the file can become stale when source IDs change.
3. **Add `category_code` to the warehouse dimension.** This makes lookup local, but requires schema migration and changes to both loaders.

## Implementation and repair

Fetch assets only from the fixed university asset API. Resolve reference rows from the configured local endpoints or complete bundled files, validate unique ID/code pairs, and map missing category IDs before starting the warehouse transaction. The importer stores the resolved warehouse key in `dim_asset` and `fact_asset_inventory`; source archive shape remains compatible with the ETL fallback.

Then regenerate and apply the existing ETL load SQL from the archived snapshots to repair the current local warehouse. This is a full refresh of ETL-managed tables; the snapshot history remains the input source. No schema migration is required.

## Acceptance

- New snapshot imports have mapped category keys for all resolvable records and fail before database writes if required reference data is unavailable or a required mapping is missing.
- Rebuilding from the archived snapshots restores non-null category keys for the affected records.
- Existing warehouse tables outside the ETL-managed load remain unchanged.
