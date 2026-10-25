# Implementation Plan: Snapshot category-key mapping

## Overview

Use the repository's tracked CPE type/category reference data to resolve missing category IDs in direct snapshot imports, then rebuild the local warehouse from its archived snapshots to repair existing null keys.

## Architecture decisions

- Load the complete tracked `mock_api/asset_types.json` and `mock_api/asset_categories.json` references used by the existing source seed and ETL.
- Resolve `category_id` as: explicit asset ID first; otherwise `type_id` to `type_code`, then the two-digit type-code suffix to `category_code`, then source `category_id` and warehouse surrogate `category_key`.
- Keep the source archive format unchanged; the existing ETL fallback already recalculates category keys on future rebuilds.
- Apply the approved one-time local ETL full refresh to repair the three October 26 snapshots.

## Task list

### Phase 1: Import mapping
- [x] Add validated bundled-reference loading and code-to-ID resolution to the local snapshot importer.
- [x] Resolve all categories before beginning the warehouse transaction; reject unmappable rows before database writes.
- [x] Run PHP syntax checks; do not run the test suite unless requested. Both changed PHP files pass `php -l`.

### Phase 2: Existing local warehouse repair
- [x] Regenerate the warehouse SQL from cached API data and all archived snapshots.
- [x] Apply the generated SQL to local `cpe_warehouse`.
- [x] Query snapshot-level category counts and confirm all three October 26 snapshots have mapped keys.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Bundled reference data is missing or stale | Import cannot resolve new categories | Validate complete reference files before starting the transaction; abort without writes when a category cannot be mapped. |
| A type code has no category-code match | Snapshot would contain an unknown category | Reject the import before persistence and report the mapping issue. |
| ETL load is a full refresh | Managed warehouse tables are rebuilt | Preserve all snapshot history and verify per-snapshot counts after applying the generated SQL. |

## Scope

Only the snapshot importer, the generated local warehouse output, and the local `cpe_warehouse` rebuild are in scope. Existing unrelated working-tree changes remain untouched.
