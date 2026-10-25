# เปิดหน้ารวม (`index.html`) ด้วย XAMPP

หน้ารวมเปิดงานของทุกคนจากเมนูเดียว:

| เมนู | ไฟล์ | ดึงข้อมูลจาก |
|---|---|---|
| ทะเบียนสินทรัพย์ | `src/asset-inv/` | `assets_api/asset_inventory_dashboard.php` → ฐานข้อมูล `cpe_warehouse` |
| ยืม-คืน | `src/borrow/` | `http://localhost/assets_api/dw_borrow.php` → `cpe_warehouse` (ถ้าเรียกไม่ได้ จะใช้ไฟล์ `data/dw_borrow_cached.json` แทน) |
| แจ้งซ่อมอาคาร, ซ่อมครุภัณฑ์ | `src/maintenance/` | `assets_api/report_facility.php`, `report_repair.php` → `cpe_warehouse` |

ทุกหน้าอ่านข้อมูลจาก **`cpe_warehouse`** ตัวเดียวกัน โดยข้อมูลไหลตามลำดับนี้

```
seed  →  cpeasset (ฐานข้อมูลต้นทาง)  →  assets_api  →  ETL  →  cpe_warehouse  →  หน้าเว็บ
```

## สิ่งที่ต้องมี

- **XAMPP**: PHP 8.1 ขึ้นไป พร้อม Apache และ MySQL/MariaDB
- **Python 3** พร้อม `pip`: ใช้ seed ข้อมูลและรัน ETL
- **git**
- **อินเทอร์เน็ต**: หน้าเว็บโหลดฟอนต์ กราฟ (Chart.js, d3) และตัวอ่าน Excel จาก CDN

## 1. วาง repo เป็น `htdocs`

ต้องวาง repo ไว้ที่ **root ของ `htdocs`** เพราะ:
- หน้ายืม-คืนเรียก `http://localhost/assets_api/dw_borrow.php` แบบระบุที่อยู่เต็ม
- ETL เรียก `http://localhost/assets_api/` เป็นค่าเริ่มต้น

ถ้า `htdocs` เดิมมีของอยู่ ให้เปลี่ยนชื่อโฟลเดอร์เดิมเก็บไว้ก่อน แล้ว clone repo เป็น `htdocs`:

```bat
cd C:\xampp
ren htdocs htdocs_old
git clone https://github.com/JayCo66/CPE-Asset-Warehouse.git htdocs
```

> **ถ้าวาง repo ในโฟลเดอร์ย่อย** เช่น `htdocs\CPE-Asset-Warehouse` จะใช้ได้แต่มีข้อจำกัด:
> - ต้องเปิดหน้าเว็บด้วย `http://localhost/CPE-Asset-Warehouse/index.html`
> - ตอนรัน ETL ต้องเพิ่ม `--api-base http://localhost/CPE-Asset-Warehouse/assets_api/`
> - หน้ายืม-คืนจะใช้ข้อมูลจากไฟล์ cache แทนข้อมูลจริง

## 2. เปิด Apache และ MySQL

เปิด XAMPP Control Panel แล้วกด **Start** ที่ Apache และ MySQL

คำสั่งในขั้นต่อไปใช้ค่าเริ่มต้นของ XAMPP คือ ผู้ใช้ `root` ไม่มีรหัสผ่าน (ดู[รหัสผ่าน MySQL](#ปัญหาที่พบบ่อย) ถ้าตั้งไว้)

## 3. สร้างฐานข้อมูลต้นทาง `cpeasset`

รันที่โฟลเดอร์ repo:

```bat
cd C:\xampp\htdocs
pip install -r requirements.txt
python scripts\seed_cpeasset.py
```

สคริปต์ทำ 3 อย่าง:
1. สร้างฐานข้อมูล `cpeasset`
2. สร้างตารางจาก `database/source_schema.sql`
3. ใส่ข้อมูล:
   - ครุภัณฑ์จริงจาก `data/assets_real.json`
   - ข้อมูลจำลองจาก `mock_api/*.json` (ยืม-คืน, ซ่อม, ผู้ใช้, สถานที่)

**ตำแหน่ง `mysql.exe`**: สคริปต์หาที่ `C:\xampp` และ `D:\xampp` ให้เอง ถ้าติดตั้งที่อื่นให้เพิ่ม `--mysql-bin "E:\xampp\mysql\bin\mysql.exe"`

**ตรวจผล**: เปิด <http://localhost/assets_api/assets.php?limit=1> ต้องเห็น `"success": true`

## 4. รัน ETL

```bat
python etl_warehouse.py
```

**ก่อนรัน**: Apache ต้องเปิดอยู่ เพราะ ETL ดึงข้อมูลจาก `http://localhost/assets_api/`

**ETL ทำอะไร**:
- อ่าน Excel ใบแจ้งซ่อมใน `data/`
- ดึงข้อมูลจาก API
- สร้างไฟล์ `output/warehouse_load.sql` (ประมาณ 3 MB)

**สรุปท้ายรัน**: ETL พิมพ์จำนวนแถวของแต่ละตารางออกมา

> โฟลเดอร์ `output/` มีข้อมูลจริง **ห้าม commit** (อยู่ใน `.gitignore` แล้ว) แต่ละคนรัน ETL สร้างเองในเครื่อง

## 5. สร้าง `cpe_warehouse` แล้วโหลดข้อมูล

### แบบ phpMyAdmin

1. เปิด <http://localhost/phpmyadmin>
2. สร้างฐานข้อมูลใหม่ชื่อ `cpe_warehouse` เลือก collation `utf8mb4_unicode_ci`
3. เลือก `cpe_warehouse` → แท็บ **Import** → นำเข้า `database/warehouse_schema.sql` (ทำครั้งแรกครั้งเดียว)
4. Import `output/warehouse_load.sql`

### แบบคำสั่ง (Command Prompt / cmd)

```bat
C:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS cpe_warehouse CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 cpe_warehouse < database\warehouse_schema.sql
C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 cpe_warehouse < output\warehouse_load.sql
```

**ใช้ cmd เท่านั้น**: PowerShell ไม่รองรับ `<`

**ไฟล์ schema**: นำเข้าครั้งแรกครั้งเดียว ถ้านำเข้าซ้ำจะ error ว่ามีตารางอยู่แล้ว

**ไฟล์ `warehouse_load.sql`**:
- ล้างข้อมูลในตาราง (TRUNCATE) ก่อนใส่ใหม่ทุกครั้ง จึงนำเข้าซ้ำได้
- สร้าง view `view_borrow_risk_radar` ที่หน้ายืม-คืนใช้ให้ด้วย

## 6. เปิดหน้ารวม

<http://localhost/index.html>

- ใช้เมนูด้านบนสลับหน้า
- ปุ่ม **โหมดสว่าง/มืด** เปลี่ยนธีมทุกหน้าพร้อมกัน
- ลิงก์ตรงไปแต่ละหน้า: `#/assets`, `#/borrow`, `#/facility`, `#/repair` เช่น `http://localhost/index.html#/repair`

หน้าอื่นที่เปิดแยกได้:

| หน้า | URL |
|---|---|
| จำลอง ETL ส่วน Excel ทีละขั้น | <http://localhost/etl_demo.html> |
| แต่ละหน้าแบบไม่มีเมนูรวม | `http://localhost/src/asset-inv/`, `/src/borrow/`, `/src/maintenance/` |

## เมื่อดึงงานใหม่ (`git pull`)

**แก้แค่หน้าเว็บ**: กด **Ctrl+F5** ในเบราว์เซอร์ก็พอ เพราะเบราว์เซอร์อาจจำไฟล์เก่าไว้

**ข้อมูลหรือ ETL เปลี่ยน**: รันขั้น 4 ใหม่ แล้วนำเข้า `output/warehouse_load.sql` อีกครั้ง

**`database/source_schema.sql` หรือ `mock_api/` เปลี่ยน**:
1. รัน `python scripts\seed_cpeasset.py --reset`
2. รันขั้น 4–5 ใหม่

`--reset` จะลบ `cpeasset` แล้วสร้างใหม่

## ถ้าอยากเห็นกราฟแนวโน้มของหน้าทะเบียนสินทรัพย์

กราฟแนวโน้มต้องมี snapshot ครุภัณฑ์หลายวัน การรัน ETL 1 ครั้งได้ 1 snapshot ทำได้ 2 แบบ:

**แบบที่ 1: รัน ETL หลายรอบด้วยวันที่ต่างกัน**

```bat
python etl_warehouse.py --snapshot-date 2026-09-25
python etl_warehouse.py --snapshot-date 2026-10-25
```

**แบบที่ 2: เพิ่มครุภัณฑ์ตัวอย่าง (DEMO) ก่อน แล้วรัน ETL**

```bat
python scripts\import_snapshot_demo_assets.py
python etl_warehouse.py --snapshot-date 2026-10-25
```

ทั้ง 2 แบบ เสร็จแล้วนำเข้า `output/warehouse_load.sql` ใหม่ทุกครั้ง

**ห้ามลบ `output/history/`**: snapshot ทุกรอบเก็บอยู่ในโฟลเดอร์นี้ ถ้าลบ ประวัติจะหาย

## ข้อมูลจะตรงกับเครื่องอื่นไหม

ข้อมูลตั้งต้นมาจากไฟล์ชุดเดียวกัน คือ `data/assets_real.json`, `mock_api/*.json` และ Excel ใน `data/` ตัวเลขหลักจึงตรงกัน

ส่วนที่อาจต่างกัน:
- **จำนวนและวันที่ของ snapshot ครุภัณฑ์**: ขึ้นกับว่ารัน ETL วันไหน กี่ครั้ง
- **วันเกินกำหนดของรายการยืมที่ยังไม่คืน**: คิดถึงวันที่รัน ETL
- **ข้อมูลจำลองที่เพิ่มใน Docker**: ด้วย `docker/etl/simulate_activity.py`

ถ้าต้องการให้ตรงกันทุกตัวเลข:
1. ให้เครื่องต้นแบบ export ฐานข้อมูล `cpe_warehouse` (phpMyAdmin → Export)
2. ส่งไฟล์ให้กันทางส่วนตัว **ห้ามส่งผ่าน git**
3. เครื่องปลายทางนำเข้าแทนขั้น 4–5

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| เปิด `http://localhost/` แล้วเจอหน้า XAMPP | `htdocs` ยังเป็นของเดิม ดูขั้น 1 หรือเปิด `/index.html` ตรง ๆ |
| หน้าขึ้นแต่ไม่มีข้อมูล หรือขึ้น `Database connection failed` | MySQL ไม่ได้เปิด หรือยังไม่ได้ทำขั้น 5 |
| ทดสอบ API แล้ว `Unknown database 'cpe_warehouse'` | ยังไม่ได้สร้างฐานข้อมูลในขั้น 5 |
| หน้ายืม-คืนแสดงข้อมูลไม่ตรงกับหน้าอื่น | `dw_borrow.php` เรียกไม่ได้ เลยใช้ไฟล์ cache เปิด <http://localhost/assets_api/dw_borrow.php> ดู error |
| ETL error ตอนดึง endpoint | Apache ไม่ได้เปิด, ยังไม่ได้ seed `cpeasset` หรือ repo ไม่ได้อยู่ที่ root ของ `htdocs` (ใช้ `--api-base`) |
| `seed_cpeasset.py` หา `mysql` ไม่เจอ | ใส่ `--mysql-bin` ชี้ไปที่ `mysql.exe` ของ XAMPP |
| ตั้งรหัสผ่าน `root` ของ MySQL ไว้ | seed: เพิ่ม `--password รหัส` ; ฝั่ง PHP: เพิ่ม `SetEnv DB_PASS รหัส` และ `SetEnv WAREHOUSE_DB_PASS รหัส` ใน `C:\xampp\apache\conf\httpd.conf` แล้ว restart Apache |
| หน้าตาหรือฟอนต์เป็นแบบเก่า | กด Ctrl+F5 |
| phpMyAdmin นำเข้าไฟล์ไม่ได้เพราะไฟล์ใหญ่ | ใช้แบบคำสั่งในขั้น 5 แทน |
