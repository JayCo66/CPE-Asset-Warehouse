#!/usr/bin/env bash
# build_docker_release.sh : แพ็กเฉพาะไฟล์ที่ docker-compose.prod.yml ใช้เป็น zip จาก commit ; ไม่รวม Excel และ output/ เพราะมีข้อมูลบุคคล
#   bash scripts/build_docker_release.sh <tag> <out.zip> [git-ref]
set -euo pipefail
TAG=${1:?ระบุ tag เช่น v1}
OUT=${2:?ระบุไฟล์ zip}
REF=${3:-HEAD}
git -c core.autocrlf=false archive --format=zip --prefix="CPE-Asset-Warehouse-$TAG/" -o "$OUT" "$REF" -- \
  DEPLOY.md docker-compose.prod.yml deploy.env.example .dockerignore composer.json composer.lock requirements.txt \
  etl_warehouse.py index.html hub-theme.css lib assets_api src \
  docker/php docker/etl docker/source-db \
  database/source_schema.sql database/warehouse_schema.sql \
  'mock_api/*.json' \
  data/assets_real.json data/inventory_snapshot_metadata.json \
  data/asset_utilization_data.js data/asset_inventory_utilization.json data/dw_borrow_cached.json
