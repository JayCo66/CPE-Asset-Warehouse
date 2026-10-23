# Warehouse inventory API

The asset-inventory dashboard reads the local warehouse through:

```text
GET /assets_api/fact_asset_inventory.php?page=1&limit=10&q=เครื่องมือ&status=พร้อมใช้งาน&type=ครุภัณฑ์สำนักงาน
```

The `data` list returns rows from the latest `snapshot_date_key` only. Existing
response fields are preserved; `total` continues to describe the complete
latest snapshot and `limit` retains its 1–100 range. The response also includes
an additive `summary` object with read-only aggregates for the latest and
immediately previous snapshots, when available:

- `total` remains the number of rows in the latest snapshot.
- `matchedTotal` is the number of rows matching `q`, `status`, and `type`.
- `page` is the effective page after clamping to the matching result count.
- `filterOptions.statuses` and `filterOptions.types` contain the available
  filter choices for the entire latest snapshot, not just the current page.

Search is server-side, with text-matching behavior determined by the MySQL
column collation. It checks asset ID/code/name, type code/name, category, brand/model,
purchase and fiscal year, source, status, department, and location identifiers
and names. Search terms are limited to 200 characters; status/type values are
limited to 100 characters. `page` and `limit` retain their existing limits.

The current-page CSV button exports only rows returned for the active page.
For all matching rows in the latest snapshot, the browser navigates directly to
the streaming endpoint (no complete record set is loaded into JavaScript):

```text
GET /assets_api/fact_asset_inventory.php?format=csv&scope=all&q=เครื่องมือ&status=พร้อมใช้งาน&type=ครุภัณฑ์สำนักงาน
```

`scope=all` is required with `format=csv`; it exports every row matching the
same search and filters, regardless of `page` or `limit`. The CSV keeps the
existing Thai headings, includes a UTF-8 BOM for spreadsheet compatibility,
neutralizes formula-like cells, and writes in keyset batches using a temporary
stream to bound PHP memory use. An empty match produces a header-only CSV.

### Threshold flag: business meaning unconfirmed

The API's `belowThreshold` aggregate reflects the stored
`is_below_threshold_flag`. The ETL currently sets that flag from asset-type
classification (`type_code` beginning `FN`, `FP`, or `FU`, or `type_name`
containing “ต่ำกว่าเกณฑ์”); this is not a quantity-based low-stock calculation
and does not use the readiness flag. However, `warehouse schema.sql` separately
describes the field as below ฿5,000. The authoritative business meaning has not
been confirmed, so the dashboard labels this flag as undefined and must not
interpret it as a minimum stock level, readiness state, or verified monetary
threshold. No flag calculation or schema was changed.

The data owner should confirm:

1. Is the intended condition a procurement/accounting value threshold, and is
   ฿5,000 the authoritative amount?
2. Are the `FN` / `FP` / `FU` type-code groups the authoritative source for the
   flag, including donated and transferred assets?
3. Should this remain an asset-type classification, or is there a separate
   inventory-quantity/minimum-stock rule that belongs in another field?

`summary.current` and `summary.previous` have this shape:

| Field | Type | Meaning |
| --- | --- | --- |
| `snapshotDateKey` | integer | Warehouse date key |
| `snapshotDate` | string or `null` | Snapshot date from `dim_date` |
| `total`, `ready`, `belowThreshold`, `missingLocation` | integer | Counts from the selected snapshot |
| `ageBands.zeroToTwo`, `threeToFive`, `sixToEight`, `ninePlus`, `unknown` | integer | Age counts; unknown acquisition age is reported separately |

Counts are aggregated from the existing one-row-per-asset snapshot facts and
their stored flags/age values. `previous` is `null` when the warehouse has no
earlier snapshot. No tables or source data are changed. `limit` accepts values
from 1 to 100; `page` starts at 1.
There is no university-API fallback in the dashboard.

## Local setup

Requirements: PHP with `pdo_mysql`, MySQL, and the `cpe_warehouse` database
loaded from the warehouse ETL output.

Configure the connection with `WAREHOUSE_DB_HOST`, `WAREHOUSE_DB_PORT`,
`WAREHOUSE_DB_USER`, and `WAREHOUSE_DB_PASS`. The connection uses
the existing `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_PASS` variables, then local
development defaults (`localhost:3306`, user `root`, empty password). In a
deployed environment, use a dedicated MySQL user with read-only access to the
warehouse tables.

Start PHP's built-in server from the repository root:

```powershell
php -S 127.0.0.1:8000 -t .
```

Then open <http://127.0.0.1:8000/src/asset-inv/>. The PHP server serves both
the dashboard and `/assets_api/`; a static-only server such as `python -m
http.server` cannot execute the PHP endpoint.

The ETL's upstream source configuration is separate: `etl_warehouse.py` still
uses its configured source API to populate the warehouse. The dashboard itself
no longer requests that university host.
