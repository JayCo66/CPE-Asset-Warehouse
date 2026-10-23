"""รัน output/warehouse_load.sql ที่ ETL สร้าง เข้า warehouse (MySQL) ทีเดียวทั้งไฟล์"""
import os
import sys

import pymysql
from pymysql.constants import CLIENT

path = sys.argv[1] if len(sys.argv) > 1 else "output/warehouse_load.sql"
with open(path, encoding="utf-8") as f:
    sql = f.read()

conn = pymysql.connect(host=os.getenv("WH_HOST", "warehouse-db"), port=int(os.getenv("WH_PORT", "3306")),
                       user=os.getenv("WH_USER", "root"), password=os.getenv("WH_PASS", "root"),
                       database=os.getenv("WH_NAME", "warehouse"), charset="utf8mb4",
                       client_flag=CLIENT.MULTI_STATEMENTS, autocommit=True)
with conn.cursor() as cur:
    cur.execute(sql)
    while cur.nextset():          # อ่านผลของทุก statement ให้ครบ (ถ้ามี statement ไหน error จะ raise ตรงนี้)
        pass
    cur.execute("SELECT COUNT(*) FROM fact_asset_inventory")
    print(f"[load] โหลด {path} เข้า warehouse แล้ว (fact_asset_inventory {cur.fetchone()[0]} แถว)")
conn.close()
