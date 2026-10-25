# Shareable snapshot demo data

## Intent

Add 100 clearly synthetic assets to a local `cpeasset` database so the team can generate an inventory snapshot for 2026-10-25. Keep the base seed dataset unchanged and make the additions importable on teammates' local MySQL instances.

## Goals

- Store the extra asset records in a separate JSON file under `data/`.
- Add a repeatable importer that inserts the records into an existing, seeded `cpeasset` database without truncating or reseeding its tables.
- Make repeated imports safe by recognizing already-imported asset codes and checking required reference rows.
- Document the import and snapshot commands for teammates.

## Non-goals

- Change `seed_cpeasset.py` or its existing seed data.
- Add borrow or maintenance activity; those are not needed to affect `fact_asset_inventory`.
- Run the import or ETL against the user's live MySQL database.

## Approaches considered

1. A separate JSON pack with a small MySQL CLI importer. This keeps sample data reviewable and repeatable, can validate references, and avoids modifying the existing destructive seed flow. **Selected.**
2. A standalone SQL file. This is easy to run with MySQL tools, but static IDs and database differences make it more prone to conflicts.

## Design decisions

- Add 100 synthetic asset records only, referencing the existing seeded departments, locations, and asset types.
- Place the records in a new file under `data/`; do not append them to `data/assets_real.json`.
- Add a standalone importer using the installed `mysql.exe`/`mysql` client, with explicit connection options and conservative duplicate handling. Require the base `cpeasset` schema and seed data to exist first; allow `--dry-run` to preview without writing.
- Teammates import the sample data, run `etl_warehouse.py --snapshot-date 2026-10-25`, and load the resulting `output/warehouse_load.sql` into their warehouse. The Docker ETL path may be used when the local source API and warehouse services are running.

## Constraints and remaining implementation choices

- Use only repository data and mark all added records as synthetic demo assets.
- Preserve all unrelated working-tree changes.
- The implementation may choose the exact small set of records and precise importer CLI based on the existing schema and seed conventions.
