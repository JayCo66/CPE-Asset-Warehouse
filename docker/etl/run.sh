#!/bin/sh
# ETL ครบรอบ: ดึงทุก endpoint จาก source-api -> สร้าง warehouse_load.sql -> โหลดเข้า warehouse-db
set -e
cd /app
python etl_warehouse.py --all-api --api-base "${SOURCE_API:-http://source-api/}" -o output "$@"
python docker/etl/load_warehouse.py output/warehouse_load.sql
