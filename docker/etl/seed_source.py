"""เติมข้อมูลลงฐานข้อมูลต้นทาง (ระบบครุภัณฑ์จำลองใน Docker) ให้ assets_api มีข้อมูลส่ง
- asset: ข้อมูลจริงจาก data/assets_real.json
- ตารางอื่น: mock_api/*.json (ข้อมูลจำลอง) จนกว่าจะได้ข้อมูลจริงจากระบบ
เติมเฉพาะครั้งแรก (ตาราง asset ว่าง) ; --force = ล้างแล้วเติมใหม่
"""
import json
import os
import sys

import pymysql

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# ตาราง -> ไฟล์ ; เรียงตามลำดับ foreign key (แม่ก่อนลูก)
TABLES = [
    ("departments", "mock_api/departments.json"),
    ("users", "mock_api/users.json"),
    ("asset_categories", "mock_api/asset_categories.json"),
    ("asset_types", "mock_api/asset_types.json"),
    ("locations", "mock_api/locations.json"),
    ("maintenance_type", "mock_api/maintenance_type.json"),
    ("asset", "data/assets_real.json"),
    ("maintenance_asset", "mock_api/maintenance_asset.json"),
    ("maintenance_general", "mock_api/maintenance_general.json"),
    ("borrow", "mock_api/borrow.json"),
    ("borrow_request_items", "mock_api/borrow_request_items.json"),
]


def load_rows(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        body = json.load(f)
    return body["data"] if isinstance(body, dict) else body


def main(force):
    conn = pymysql.connect(host=os.getenv("DB_HOST", "source-db"), port=int(os.getenv("DB_PORT", "3306")),
                           user=os.getenv("DB_USER", "root"), password=os.getenv("DB_PASS", "root"),
                           database=os.getenv("DB_NAME", "cpeasset"), charset="utf8mb4", autocommit=False)
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM asset")
        if cur.fetchone()[0] and not force:
            print("[seed] ฐานข้อมูลต้นทางมีข้อมูลแล้ว ข้าม (ใช้ --force เพื่อล้างแล้วเติมใหม่)")
            return
        cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        for table, _ in reversed(TABLES):
            cur.execute(f"TRUNCATE TABLE `{table}`")
        for table, path in TABLES:
            cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = %s", (table,))
            cols_in_db = {r[0] for r in cur.fetchall()}
            rows = load_rows(path)
            cols = [c for c in rows[0] if c in cols_in_db]          # ข้ามฟิลด์ที่ตารางไม่มี เช่น asset.type_name, department_name
            sql = f"INSERT INTO `{table}` ({', '.join(f'`{c}`' for c in cols)}) VALUES ({', '.join(['%s'] * len(cols))})"
            cur.executemany(sql, [tuple(r.get(c) for c in cols) for r in rows])
            print(f"[seed] {table:<22} {len(rows):>5} แถว จาก {path}")
        cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    conn.commit()
    conn.close()


if __name__ == "__main__":
    main("--force" in sys.argv)
