# Implementation Plan: Shareable snapshot demo assets

## Overview

Add a 100-row synthetic asset pack and a standalone importer so teammates can add the same demo assets to an already seeded local `cpeasset` database, then build the 2026-10-25 inventory snapshot.

## Architecture decisions

- Keep the new records in `data/snapshot_demo_assets.json`; leave `data/assets_real.json` and `seed_cpeasset.py` unchanged.
- Use the installed MySQL CLI from a standalone script, with no new Python database dependency. Resolve reference rows from natural keys (type/category codes, department name, and location fields) so differing auto-increment IDs do not prevent import.
- Import by default for a one-command teammate workflow; provide `--dry-run` for optional preview. Skip existing demo asset codes, escape JSON values in generated SQL, and commit inserts in one transaction.
- Document both local MySQL import and the follow-up ETL snapshot command.

## Task list

### Phase 1: Data and importer
- [x] Add 100 clearly synthetic asset records with unique demo codes and valid seeded references.
- [x] Add an importer with configurable database connection, reference validation, optional preview mode, duplicate skipping, and transactional insert mode.

### Phase 2: Teammate instructions
- [x] Add concise usage instructions and the snapshot/load sequence to `README.md`.

### Checkpoint: Complete
- [x] Confirm the demo references exist in the repository seed files.
- [x] Review the changes to ensure the base seed files and unrelated workspace edits remain untouched.
- [x] Provide the exact import and snapshot commands; do not run an import against the user's MySQL database.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A teammate has not seeded the reference tables | Import could create invalid references | Resolve and validate all references before any insert; report missing/ambiguous rows |
| Import is run more than once | Duplicate demo assets | Check `asset_code` and skip already-present rows |
| A user runs the helper unintentionally | Demo assets are inserted | Clearly label the imported rows, keep imports idempotent, and offer `--dry-run` |

## Open questions

- None; implementation follows the approved JSON plus MySQL CLI importer approach.
