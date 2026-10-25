"""
=============================================================================
Seed Script: seed_cpeasset.py
=============================================================================
สคริปต์สำหรับสร้างฐานข้อมูลต้นทาง (OLTP) `cpeasset` และนำเข้าข้อมูลทั้งหมด
- ครุภัณฑ์จริง 4,324 ชิ้น (จาก data/assets_real.json หรือ Live API)
- ข้อมูลจำลองและมิติอ้างอิงจาก mock_api/*.json (ยืมคืน, ซ่อมบำรุง, ภาควิชา, สถานที่, ผู้ใช้)

การเรียกใช้งาน:
    python seed_cpeasset.py
    python seed_cpeasset.py --reset   # ล้างฐานข้อมูลเดิมแล้วสร้างใหม่ตั้งแต่ต้น
=============================================================================
"""

import os
import sys
import json
import argparse
import subprocess
import urllib.request

# ค้นหาพาธของ mysql.exe ใน XAMPP หรือ PATH ของระบบอัตโนมัติ
DEFAULT_MYSQL_PATHS = [
    r"C:\xampp\mysql\bin\mysql.exe",
    r"D:\xampp\mysql\bin\mysql.exe",
    r"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
    "mysql"
]

def find_mysql_binary(custom_path=None):
    if custom_path and os.path.exists(custom_path):
        return custom_path
    for p in DEFAULT_MYSQL_PATHS:
        if os.path.exists(p) or p == "mysql":
            return p
    return "mysql"

def run_sql(mysql_bin, host, port, user, password, db, sql_content):
    cmd = [mysql_bin, f"-h{host}", f"-P{port}", f"-u{user}", "--default-character-set=utf8mb4"]
    if password:
        cmd.append(f"-p{password}")
    if db:
        cmd.append(db)
        
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, err = p.communicate(input=sql_content.encode("utf-8"))
    if p.returncode != 0:
        err_msg = err.decode("utf-8", errors="ignore")
        raise RuntimeError(f"MySQL Error ({p.returncode}): {err_msg}")
    return out.decode("utf-8", errors="ignore")

def sql_val(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, bool):
        return "1" if v else "0"
    s = str(v).replace("\\", "\\\\").replace("'", "''")
    return f"'{s}'"

def ensure_assets_json(data_path):
    if os.path.exists(data_path):
        with open(data_path, "r", encoding="utf-8") as f:
            return json.load(f)
            
    print("[1/5] ไม่พบ data/assets_real.json กำลังดาวน์โหลดข้อมูลจริงจาก API คณะวิศวะฯ...")
    os.makedirs(os.path.dirname(data_path), exist_ok=True)
    url_base = "https://cpe.eng.kps.ku.ac.th/CPEAssets/assets_api/assets.php?limit=100&page="
    page = 1
    assets = []
    while True:
        req = urllib.request.Request(f"{url_base}{page}", headers={"User-Agent": "etl-warehouse"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            data = body.get("data", [])
            if not data:
                break
            assets.extend(data)
            if len(assets) >= body.get("total", 4324):
                break
        page += 1
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(assets, f, ensure_ascii=False)
    print(f"      ดาวน์โหลดสำเร็จ: {len(assets)} รายการ บันทึกลง {data_path}")
    return assets

def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="นำเข้าข้อมูลตั้งต้นสู่ฐานข้อมูล cpeasset (MySQL)")
    parser.add_argument("--host", default="localhost", help="MySQL Host (default: localhost)")
    parser.add_argument("--port", default="3306", help="MySQL Port (default: 3306)")
    parser.add_argument("--user", default="root", help="MySQL User (default: root)")
    parser.add_argument("--password", default="", help="MySQL Password (default: empty)")
    parser.add_argument("--db", default="cpeasset", help="ชื่อฐานข้อมูล (default: cpeasset)")
    parser.add_argument("--mysql-bin", default=None, help="พาธของโปรแกรม mysql.exe")
    parser.add_argument("--schema", default="database/source_schema.sql", help="ไฟล์ DDL Schema (default: database/source_schema.sql)")
    parser.add_argument("--mock-dir", default="mock_api", help="โฟลเดอร์ไฟล์ mock JSON")
    parser.add_argument("--assets-json", default="data/assets_real.json", help="ไฟล์แคชข้อมูลครุภัณฑ์จริง")
    parser.add_argument("--reset", action="store_true", help="ล้างฐานข้อมูลเดิมแล้วสร้างโครงสร้างใหม่หมด")
    args = parser.parse_args()

    mysql_bin = find_mysql_binary(args.mysql_bin)
    print("=" * 70)
    print(f"📦 สคริปต์เตรียมฐานข้อมูลต้นทาง (OLTP): `{args.db}`")
    print(f"   MySQL Binary: {mysql_bin}")
    print(f"   Target: {args.user}@{args.host}:{args.port}/{args.db}")
    print("=" * 70)

    # 1. จัดการ Database & Reset
    print("\n[1/5] ตรวจสอบฐานข้อมูล...")
    if args.reset:
        print("      ⚠️ พบตัวเลือก --reset: กำลังล้างฐานข้อมูลเดิมแล้วสร้างใหม่...")
        run_sql(mysql_bin, args.host, args.port, args.user, args.password, "", 
                f"DROP DATABASE IF EXISTS `{args.db}`; CREATE DATABASE `{args.db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
    else:
        run_sql(mysql_bin, args.host, args.port, args.user, args.password, "", 
                f"CREATE DATABASE IF NOT EXISTS `{args.db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")

    # ตรวจสอบว่ามีตารางอยู่แล้วหรือไม่
    tables_out = run_sql(mysql_bin, args.host, args.port, args.user, args.password, args.db, "SHOW TABLES;").strip()
    existing_tables = [t for t in tables_out.split("\n") if t and not t.startswith("Tables_in_")]

    # 2. นำเข้า Schema DDL (ถ้ายังไม่มีตาราง)
    if not existing_tables and os.path.exists(args.schema):
        print(f"[2/5] สร้างโครงสร้างตารางใหม่จาก `{args.schema}`...")
        with open(args.schema, "r", encoding="utf-8") as f:
            schema_sql = f.read()
        run_sql(mysql_bin, args.host, args.port, args.user, args.password, args.db, schema_sql)
    else:
        print(f"[2/5] พบตารางเดิมอยู่แล้ว ({len(existing_tables)} ตาราง) ข้ามขั้นตอนรัน DDL...")

    # ตรวจสอบและเพิ่มคอลัมน์เพิ่มเติมเพื่อความเข้ากันได้
    alter_sql = """
    ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `role_status` VARCHAR(100) NULL, 
                        ADD COLUMN IF NOT EXISTS `department_id` INT NULL, 
                        ADD COLUMN IF NOT EXISTS `is_deleted` TINYINT(1) DEFAULT 0;
    ALTER TABLE `departments` ADD COLUMN IF NOT EXISTS `shortname` VARCHAR(50) NULL, 
                              ADD COLUMN IF NOT EXISTS `is_deleted` TINYINT(1) DEFAULT 0, 
                              ADD COLUMN IF NOT EXISTS `deleted_at` DATETIME NULL;
    ALTER TABLE `asset` ADD COLUMN IF NOT EXISTS `type_name` VARCHAR(255) NULL;
    """
    run_sql(mysql_bin, args.host, args.port, args.user, args.password, args.db, alter_sql)

    # 3. เตรียมข้อมูล
    print("[3/5] โหลดข้อมูลครุภัณฑ์จริงและ mock JSON...")
    assets = ensure_assets_json(args.assets_json)
    
    mock_files = {
        "departments": os.path.join(args.mock_dir, "departments.json"),
        "locations": os.path.join(args.mock_dir, "locations.json"),
        "users": os.path.join(args.mock_dir, "users.json"),
        "maintenance_type": os.path.join(args.mock_dir, "maintenance_type.json"),
        "asset_categories": os.path.join(args.mock_dir, "asset_categories.json"),
        "asset_types": os.path.join(args.mock_dir, "asset_types.json"),
        "borrow": os.path.join(args.mock_dir, "borrow.json"),
        "borrow_request_items": os.path.join(args.mock_dir, "borrow_request_items.json"),
        "maintenance_asset": os.path.join(args.mock_dir, "maintenance_asset.json"),
        "maintenance_general": os.path.join(args.mock_dir, "maintenance_general.json"),
    }
    
    loaded_data = {}
    for k, p in mock_files.items():
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                loaded_data[k] = json.load(f).get("data", [])
        else:
            loaded_data[k] = []

    # 4. สร้างคำสั่ง SQL สำหรับ Insert
    print("[4/5] กำลังล้างและนำเข้าข้อมูลใหม่ลง MySQL...")
    sql_lines = [
        "SET NAMES utf8mb4;",
        "SET FOREIGN_KEY_CHECKS = 0;",
        "START TRANSACTION;"
    ]

    def build_inserts(table, cols, rows):
        sql_lines.append(f"TRUNCATE TABLE `{table}`;")
        if not rows:
            return
        head = f"INSERT INTO `{table}` (`" + "`, `".join(cols) + "`) VALUES "
        for i in range(0, len(rows), 500):
            chunk = rows[i:i + 500]
            values_str = ",\n".join(
                "(" + ", ".join(sql_val(r.get(c)) for c in cols) + ")" for r in chunk
            )
            sql_lines.append(head + "\n" + values_str + ";")

    # แทรกข้อมูลตามลำดับ
    build_inserts("departments", ['department_id', 'department_name', 'shortname', 'is_deleted', 'deleted_at'], loaded_data["departments"])
    build_inserts("locations", ['location_id', 'location_name', 'building', 'floor', 'room_detail', 'remark', 'is_deleted', 'deleted_at'], loaded_data["locations"])
    build_inserts("users", ['user_id', 'fullname', 'role_status', 'department_id'], loaded_data["users"])
    build_inserts("maintenance_type", ['type_id', 'type_name'], loaded_data["maintenance_type"])
    build_inserts("asset_categories", ['category_id', 'category_code', 'category_name_th', 'category_name_en', 'description', 'status', 'created_at', 'updated_at'], loaded_data["asset_categories"])
    build_inserts("asset_types", ['type_id', 'type_code', 'type_name', 'description', 'is_deleted', 'deleted_at'], loaded_data["asset_types"])
    build_inserts("asset", ['asset_id', 'asset_code', 'asset_name', 'type_id', 'type_name', 'type_code', 'category_id', 'brand', 'year_purchase', 'year_fiscal', 'source', 'asset_status', 'location_id', 'department_id', 'update_date'], assets)
    build_inserts("borrow", ['id', 'user_id', 'teacher_id', 'borrow_date', 'return_date', 'reason', 'status', 'created_at', 'return_by', 'actual_return_date', 'return_condition', 'return_note', 'deleted_at', 'phone', 'department_id', 'deleted_by', 'updated_by', 'is_overdue', 'approved_by', 'updated_at'], loaded_data["borrow"])
    build_inserts("borrow_request_items", ['id', 'request_id', 'asset_id', 'item_status', 'replace_asset_id', 'staff_note', 'checked_by', 'checked_at', 'return_status', 'return_note', 'returned_by', 'returned_at', 'deleted_at', 'deleted_by'], loaded_data["borrow_request_items"])
    build_inserts("maintenance_asset", ['id', 'asset_id', 'reporter_name', 'repair_date', 'detail', 'repair_image', 'cost', 'vendor', 'status', 'executive_note', 'executive_by', 'executive_at', 'staff_note', 'staff_note_by', 'staff_note_at', 'complete_date', 'deleted_at', 'deleted_by', 'updated_by', 'approved_by', 'updated_at', 'created_at', 'repair_total_day', 'parent_maintenance_id', 'is_followup', 'followup_no', 'followup_cost'], loaded_data["maintenance_asset"])
    build_inserts("maintenance_general", ['id', 'department_id', 'reporter_status', 'maintenance_type_id', 'problem_location', 'problem_detail', 'reported_at', 'additional_detail', 'status', 'staff_id', 'completed_at', 'created_at', 'updated_at'], loaded_data["maintenance_general"])

    sql_lines.append("COMMIT;")
    sql_lines.append("SET FOREIGN_KEY_CHECKS = 1;")

    full_sql = "\n".join(sql_lines)
    run_sql(mysql_bin, args.host, args.port, args.user, args.password, args.db, full_sql)

    # 5. ตรวจสอบจำนวนแถวหลังนำเข้า
    print("[5/5] ตรวจสอบจำนวนข้อมูลในตารางทั้งหมด...")
    verify_sql = """
    SELECT 'departments' AS tbl, COUNT(*) AS count FROM departments
    UNION ALL SELECT 'locations', COUNT(*) FROM locations
    UNION ALL SELECT 'users', COUNT(*) FROM users
    UNION ALL SELECT 'maintenance_type', COUNT(*) FROM maintenance_type
    UNION ALL SELECT 'asset_categories', COUNT(*) FROM asset_categories
    UNION ALL SELECT 'asset_types', COUNT(*) FROM asset_types
    UNION ALL SELECT 'asset', COUNT(*) FROM asset
    UNION ALL SELECT 'borrow', COUNT(*) FROM borrow
    UNION ALL SELECT 'borrow_request_items', COUNT(*) FROM borrow_request_items
    UNION ALL SELECT 'maintenance_asset', COUNT(*) FROM maintenance_asset
    UNION ALL SELECT 'maintenance_general', COUNT(*) FROM maintenance_general;
    """
    res = run_sql(mysql_bin, args.host, args.port, args.user, args.password, args.db, verify_sql)

    print("\n" + "-" * 40)
    print(f"📊 สรุปจำนวนข้อมูลใน `{args.db}`:")
    print("-" * 40)
    for line in res.strip().split("\n"):
        parts = line.split("\t")
        if len(parts) == 2 and parts[0] != "tbl":
            print(f"  • {parts[0]:<24} : {int(parts[1]):>5} แถว")
    print("-" * 40)
    print("✅ นำเข้าข้อมูลสู่ cpeasset สำเร็จเรียบร้อยแล้ว!\n")

if __name__ == "__main__":
    main()
