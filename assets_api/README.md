# Warehouse inventory API

The asset-inventory dashboard reads the local warehouse through:

```text
GET /assets_api/fact_asset_inventory.php?page=1&limit=10
```

The endpoint returns the latest `snapshot_date_key` only. It joins
`fact_asset_inventory` with its date, asset, type, category, department, and
location dimensions, and returns the dashboard's
`{ success, message, total, data }` response format. `limit` accepts values
from 1 to 100; `page` starts at 1.
There is no university-API fallback in the dashboard.

## Local setup

Requirements: PHP with `pdo_mysql`, MySQL, and the `cpeasset_warehouse` database
loaded from the warehouse ETL output.

Configure the connection with `WAREHOUSE_DB_HOST`, `WAREHOUSE_DB_PORT`,
`WAREHOUSE_DB_USER`, and `WAREHOUSE_DB_PASS`. If not set, the connection uses
the existing `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_PASS` variables, then local
development defaults (`localhost:3306`, user `root`, empty password). The
database name is fixed to `cpeasset_warehouse`. In a deployed environment, use
a dedicated MySQL user with read-only access to the warehouse tables.

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
