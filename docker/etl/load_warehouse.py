"""Run the generated warehouse SQL and invalidate dashboard cache after commit."""

import os
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pymysql
from pymysql.constants import CLIENT

from cache_invalidation import invalidate_dashboard_cache


def load_warehouse(
    path: str | Path,
    connect: Callable[..., Any] | None = None,
    cache_invalidator: Callable[[], bool | None] | None = None,
) -> int:
    with open(path, encoding="utf-8") as sql_file:
        sql = sql_file.read()

    connect = connect or pymysql.connect
    conn = connect(
        host=os.getenv("WH_HOST", "warehouse-db"),
        port=int(os.getenv("WH_PORT", "3306")),
        user=os.getenv("WH_USER", "root"),
        password=os.getenv("WH_PASS", "root"),
        database=os.getenv("WH_NAME", "cpe_warehouse"),
        charset="utf8mb4",
        client_flag=CLIENT.MULTI_STATEMENTS,
        autocommit=True,
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            while cursor.nextset():
                pass
            cursor.execute("SELECT COUNT(*) FROM fact_asset_inventory")
            count = int(cursor.fetchone()[0])
        conn.commit()
    finally:
        conn.close()

    invalidate = cache_invalidator or invalidate_dashboard_cache
    if invalidate() is False:
        print("[cache] Redis invalidation failed; cached data will refresh after its TTL", file=sys.stderr)
    print(f"[load] loaded {path} into warehouse (fact_asset_inventory {count} rows)")
    return count


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else "output/warehouse_load.sql"
    load_warehouse(path)


if __name__ == "__main__":
    main()
