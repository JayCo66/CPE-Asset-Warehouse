"""Preview or import the synthetic inventory snapshot assets into cpeasset."""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "data" / "snapshot_demo_assets.json"
DEFAULT_MYSQL_PATHS = [
    r"C:\xampp\mysql\bin\mysql.exe",
    r"D:\xampp\mysql\bin\mysql.exe",
    r"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
]
REQUIRED_FIELDS = {
    "asset_code",
    "asset_name",
    "type_code",
    "category_code",
    "brand",
    "year_purchase",
    "year_fiscal",
    "source",
    "asset_status",
    "department_name",
    "location",
    "update_date",
}
LOCATION_FIELDS = {"location_name", "building", "floor", "room_detail"}
ALLOWED_STATUSES = {"พร้อมใช้งาน", "ถูกยืม", "ชำรุด", "ส่งซ่อม"}


def find_mysql_binary(custom_path=None):
    if custom_path:
        resolved = shutil.which(custom_path)
        if resolved:
            return resolved
        if Path(custom_path).is_file():
            return custom_path
        raise FileNotFoundError(f"MySQL client not found: {custom_path}")

    for path in DEFAULT_MYSQL_PATHS:
        if Path(path).is_file():
            return path
    for command in ("mysql.exe", "mysql"):
        resolved = shutil.which(command)
        if resolved:
            return resolved
    raise FileNotFoundError("MySQL client not found; install MySQL/XAMPP or pass --mysql-bin.")


def sql_literal(value):
    if value is None:
        return "NULL"
    text = str(value).replace("\\", "\\\\").replace("\0", "\\0").replace("\n", "\\n").replace("\r", "\\r")
    return "'" + text.replace("'", "''") + "'"


def run_sql(mysql_bin, host, port, user, password, database, sql):
    command = [
        mysql_bin,
        f"-h{host}",
        f"-P{port}",
        f"-u{user}",
        "--default-character-set=utf8mb4",
        "--batch",
        "--skip-column-names",
        database,
    ]
    process_env = os.environ.copy()
    if password:
        process_env["MYSQL_PWD"] = password
    result = subprocess.run(
        command,
        input=sql.encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=process_env,
        timeout=60,
    )
    if result.returncode:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(message or f"MySQL client exited with code {result.returncode}.")
    return result.stdout.decode("utf-8", errors="strict").strip()


def load_assets(path):
    with open(path, encoding="utf-8") as f:
        payload = json.load(f)

    if not isinstance(payload, dict) or not isinstance(payload.get("assets"), list):
        raise ValueError("Input JSON must contain an 'assets' list.")

    assets = payload["assets"]
    if not assets:
        raise ValueError("Input JSON contains no assets.")

    codes = set()
    for index, asset in enumerate(assets, start=1):
        if not isinstance(asset, dict):
            raise ValueError(f"Asset row {index} must be an object.")
        missing = REQUIRED_FIELDS - asset.keys()
        if missing:
            raise ValueError(f"Asset row {index} is missing fields: {', '.join(sorted(missing))}.")

        code = asset["asset_code"]
        if not isinstance(code, str) or not code.startswith("DEMO-SNAP-"):
            raise ValueError(f"Asset row {index} must use a DEMO-SNAP asset_code.")
        if code in codes:
            raise ValueError(f"Duplicate asset_code in input: {code}")
        codes.add(code)

        for field in ("asset_name", "type_code", "category_code", "brand", "year_purchase",
                      "year_fiscal", "source", "department_name", "update_date"):
            if not isinstance(asset[field], str) or not asset[field].strip():
                raise ValueError(f"Asset row {index} has an empty or invalid {field}.")
        if not isinstance(asset["asset_status"], str) or asset["asset_status"] not in ALLOWED_STATUSES:
            raise ValueError(f"Asset row {index} has unsupported asset_status: {asset['asset_status']!r}.")

        location = asset["location"]
        if not isinstance(location, dict) or LOCATION_FIELDS - location.keys():
            raise ValueError(f"Asset row {index} must have all location fields: {', '.join(sorted(LOCATION_FIELDS))}.")
        for field in LOCATION_FIELDS - {"room_detail"}:
            if not isinstance(location[field], str) or not location[field].strip():
                raise ValueError(f"Asset row {index} has an empty or invalid location.{field}.")
        if location["room_detail"] is not None and not isinstance(location["room_detail"], str):
            raise ValueError(f"Asset row {index} has an invalid location.room_detail.")

    return payload, assets


def preflight_query(asset):
    location = asset["location"]
    code = sql_literal(asset["asset_code"])
    return f"""SELECT {code},
(SELECT COUNT(*) FROM asset_types WHERE type_code = {sql_literal(asset['type_code'])} AND COALESCE(is_deleted, 0) = 0),
(SELECT COUNT(*) FROM asset_categories WHERE category_code = {sql_literal(asset['category_code'])}),
(SELECT COUNT(*) FROM departments WHERE department_name = {sql_literal(asset['department_name'])} AND COALESCE(is_deleted, 0) = 0),
(SELECT COUNT(*) FROM locations WHERE location_name = {sql_literal(location['location_name'])}
 AND building <=> {sql_literal(location['building'])} AND floor <=> {sql_literal(location['floor'])}
 AND room_detail <=> {sql_literal(location['room_detail'])} AND COALESCE(is_deleted, 0) = 0),
(SELECT COUNT(*) FROM asset WHERE asset_code = {code});"""


def insert_query(asset):
    location = asset["location"]
    code = sql_literal(asset["asset_code"])
    return f"""INSERT INTO asset (
 asset_code, asset_name, type_id, type_code, category_id, brand,
 year_purchase, year_fiscal, source, asset_status, location_id,
 department_id, update_date, is_deleted
)
SELECT {code}, {sql_literal(asset['asset_name'])}, t.type_id, {sql_literal(asset['type_code'])}, c.category_id,
 {sql_literal(asset['brand'])}, {sql_literal(asset['year_purchase'])}, {sql_literal(asset['year_fiscal'])},
 {sql_literal(asset['source'])}, {sql_literal(asset['asset_status'])}, l.location_id, d.department_id,
 {sql_literal(asset['update_date'])}, 0
FROM asset_types AS t
JOIN asset_categories AS c ON c.category_code = {sql_literal(asset['category_code'])}
JOIN departments AS d ON d.department_name = {sql_literal(asset['department_name'])}
JOIN locations AS l ON l.location_name = {sql_literal(location['location_name'])}
 AND l.building <=> {sql_literal(location['building'])} AND l.floor <=> {sql_literal(location['floor'])}
 AND l.room_detail <=> {sql_literal(location['room_detail'])}
WHERE t.type_code = {sql_literal(asset['type_code'])} AND COALESCE(t.is_deleted, 0) = 0
 AND COALESCE(d.is_deleted, 0) = 0 AND COALESCE(l.is_deleted, 0) = 0
 AND NOT EXISTS (SELECT 1 FROM asset AS old WHERE old.asset_code = {code});"""


def main():
    parser = argparse.ArgumentParser(
        description="Preview or import the synthetic snapshot assets into an existing cpeasset database."
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_DATA, help="JSON asset pack (default: data/snapshot_demo_assets.json)")
    parser.add_argument("--host", default=os.getenv("CPEASSET_DB_HOST", "localhost"), help="MySQL host")
    parser.add_argument("--port", type=int, default=os.getenv("CPEASSET_DB_PORT", "3306"), help="MySQL port")
    parser.add_argument("--user", default=os.getenv("CPEASSET_DB_USER", "root"), help="MySQL user")
    parser.add_argument("--db", default=os.getenv("CPEASSET_DB_NAME", "cpeasset"), help="Database name")
    parser.add_argument("--mysql-bin", help="Path to mysql.exe/mysql if it is not in a common location or PATH")
    parser.add_argument("--dry-run", action="store_true", help="validate and preview without inserting")
    args = parser.parse_args()
    password = os.getenv("CPEASSET_DB_PASSWORD", "")

    try:
        if not re.fullmatch(r"[A-Za-z0-9_]+", args.db):
            raise ValueError("Database name may contain only letters, digits, and underscores.")
        payload, assets = load_assets(args.input)
        mysql_bin = find_mysql_binary(args.mysql_bin)
        checks_sql = "SET NAMES utf8mb4;\n" + "\n".join(preflight_query(asset) for asset in assets)
        check_lines = run_sql(mysql_bin, args.host, args.port, args.user, password, args.db, checks_sql).splitlines()
        if len(check_lines) != len(assets):
            raise RuntimeError(f"Expected {len(assets)} preflight rows; received {len(check_lines)}.")

        existing = set()
        for line in check_lines:
            fields = line.split("\t")
            if len(fields) != 6:
                raise RuntimeError(f"Unexpected MySQL preflight response: {line!r}")
            code, *counts = fields
            type_count, category_count, department_count, location_count, existing_count = map(int, counts)
            if existing_count > 1:
                raise ValueError(f"asset_code is not unique in cpeasset: {code}")
            if existing_count:
                existing.add(code)
                continue
            if (type_count, category_count, department_count, location_count) != (1, 1, 1, 1):
                raise ValueError(f"References for {code} are missing or ambiguous: {counts[:4]}.")

        to_insert = [asset for asset in assets if asset["asset_code"] not in existing]
        if args.dry_run:
            label = "would insert"
        elif to_insert:
            statements = ["SET NAMES utf8mb4;", "START TRANSACTION;"]
            statements.extend(insert_query(asset) for asset in to_insert)
            codes = ", ".join(sql_literal(asset["asset_code"]) for asset in assets)
            statements.extend(("COMMIT;", f"SELECT COUNT(*) FROM asset WHERE asset_code IN ({codes});"))
            result = run_sql(mysql_bin, args.host, args.port, args.user, password, args.db, "\n".join(statements))
            total_present = int(result.splitlines()[-1])
            if total_present != len(assets):
                raise RuntimeError(f"Expected {len(assets)} demo assets after import; found {total_present}.")
            label = "inserted"
        else:
            label = "inserted"

        print(f"[snapshot-demo] {label}: {len(to_insert)}; already present: {len(existing)}")
        if args.dry_run:
            print("[snapshot-demo] preview only; rerun without --dry-run to insert these rows")
        if payload.get("snapshot_date"):
            print(f"[snapshot-demo] intended snapshot date: {payload['snapshot_date']}")
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        print(f"[snapshot-demo] error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
