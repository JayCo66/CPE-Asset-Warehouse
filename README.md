# ETL ระบบครุภัณฑ์ + ใบแจ้งซ่อม → Data Warehouse

`etl_warehouse.py` รวมข้อมูลจาก 2 แหล่งให้เป็นรูปแบบเดียวกัน แล้วสร้างไฟล์ SQL สำหรับโหลดเข้า warehouse ตาม `warehouse schema.sql` ซึ่งมี 8 dimension และ 4 fact

| แหล่ง | มาจาก | ไปที่ warehouse |
|---|---|---|
| Excel | ใบแจ้งซ่อม Google Form เดิม | `fact_general_maintenance` |
| API | ระบบครุภัณฑ์ CPEAssets | `dim_asset` และ dimension อื่นๆ, `fact_asset_inventory`, `fact_asset_maintenance`, `fact_borrow_transaction`, `fact_general_maintenance` |

## วิธีรัน

```bash
pip install -r requirements.txt
python etl_warehouse.py
```

หรือรันทั้งระบบ (ฐานข้อมูลต้นทาง + API + ETL + warehouse + เว็บ) ด้วย Docker ดู[ส่วนที่ 3](#3-รันทั้งระบบบนเครื่อง-docker)

ค่า default อ่านใบแจ้งซ่อมจากไฟล์ `.xlsx` ในโฟลเดอร์ `data/` และดึงครุภัณฑ์จาก assets API จริง ถ้าเรียก API ไม่ได้จะใช้ `data/assets_real.json` แทนอัตโนมัติ ถ้าจะใช้ไฟล์ใบแจ้งซ่อมอื่นใส่ path ต่อท้าย เช่น `python etl_warehouse.py "ใบแจ้งซ่อม.xlsx" -o output`

แล้วรัน `output/warehouse_load.sql` บน MySQL 8 ที่สร้างตารางจาก `warehouse schema.sql` ไว้แล้ว ไฟล์นี้ TRUNCATE ทุกตารางก่อน INSERT จึงรันซ้ำได้

รัน ETL เป็นรอบ (เช่น สัปดาห์ละครั้ง) เพื่อเก็บ snapshot ครุภัณฑ์ใน `fact_asset_inventory` ไว้ดูแนวโน้มตามเวลา (ดู [snapshot ครุภัณฑ์](#snapshot-ครุภัณฑ์-fact_asset_inventory))

| ตัวเลือก | ความหมาย |
|---|---|
| `-o DIR` | โฟลเดอร์ผลลัพธ์ (default `./output`) |
| `--api-base URL` | URL ของ API (default `https://cpe.eng.kps.ku.ac.th/CPEAssets/assets_api/`) |
| `--mock-dir DIR` | โฟลเดอร์ mock JSON (default `mock_api/` ข้างสคริปต์) |
| `--offline` | ไม่เรียก API จริง ใช้ข้อมูลที่ดึงไว้ใน `<out>/raw/` |
| `--all-api` | ดึงทุก endpoint จาก API (ไม่ใช้ mock) ใช้คู่กับ `--api-base` เช่นตอนรันใน Docker |
| `--as-of YYYY-MM-DD` | วันที่อ้างอิงสำหรับคำนวณวันเกินกำหนดของรายการยืมที่ยังไม่คืน (default วันนี้) |
| `--snapshot-date YYYY-MM-DD` | วันที่ของ snapshot ครุภัณฑ์รอบนี้ (default วันที่ดึง assets API) |
| `--keep-invalid-place` | เก็บแถวที่สถานที่ใช้ไม่ได้ไว้ โดยเว้นสถานที่ว่าง แทนการลบแถว |

**ผลลัพธ์**

| ไฟล์ | เนื้อหา |
|---|---|
| `warehouse_load.sql` | SQL โหลด warehouse ทั้งหมด หัวไฟล์บอกแหล่งข้อมูล ส่วนที่เป็น mock และปัญหาที่พบ |
| `warehouse/*.csv` | ข้อมูลรายตาราง ไว้ตรวจหรือโหลดด้วยวิธีอื่น |
| `repair_requests_clean.xlsx` | Excel ที่ clean แล้ว มี sheet `cleaning_log` (ทุกการแก้) และ `rejected_place` (แถวที่ถูกตัด) |
| `raw/*.json` | ข้อมูลที่ดึงจาก API จริง ใช้กับ `--offline` |
| `history/assets_YYYYMMDD.json` | snapshot ครุภัณฑ์ของแต่ละรอบ **ห้ามลบ** ไม่อย่างนั้นประวัติใน `fact_asset_inventory` หาย |

---

## 1. Excel ใบแจ้งซ่อม

### โครงสร้างที่ต้องเป็น

ไฟล์ `.xlsx` ต้องมี 3 sheet ชื่อนี้ตรงตัว:

| sheet | ตำแหน่งข้อมูล |
|---|---|
| `การตอบแบบฟอร์ม 1` | ข้อมูลเริ่ม**แถว 4 คอลัมน์ B** (แถว 2–3 ว่าง และ header ในแถว 1 เลื่อนไปซ้าย 1 คอลัมน์จากข้อมูล ซึ่งเป็นลักษณะของไฟล์เดิม) |
| `การตอบแบบฟอร์ม 3` | header แถว 1 ข้อมูลเริ่มแถว 2 คอลัมน์ A |
| `การตอบแบบฟอร์ม 4` | header แถว 1 ข้อมูลเริ่มแถว 2 คอลัมน์ A |

sheet อื่น เช่น `การตอบแบบฟอร์ม 2` ซึ่งเป็นฟอร์มผลการปฏิบัติงาน จะไม่ถูกอ่าน

> ETL อ่านคอลัมน์**ตามลำดับ ไม่ใช่ตามชื่อ header** ถ้าแทรก ลบ หรือสลับคอลัมน์ใน Google Form จะอ่านผิดหรือ error ต้องแก้ใน `extract()` ก่อน

**ลำดับคอลัมน์ sheet 3 และ 4** (11 คอลัมน์ A–K)

| # | คอลัมน์ | ใช้ทำอะไร |
|---|---|---|
| 1 | ประทับเวลา | **ต้องมี** ต้องเป็น datetime ใช้ตรวจวันแจ้งที่พิมพ์ผิด และตรวจการส่งซ้ำ |
| 2 | ชื่อ-นามสกุล ผู้แจ้งซ่อม | ใช้ตรวจแถวทดสอบและการส่งซ้ำ ไม่โหลดเข้า warehouse |
| 3 | สังกัด | → `dim_department` |
| 4 | สถานภาพผู้แจ้งซ่อม | → `reporter_status` |
| 5 | เบอร์โทรศัพท์ผู้แจ้งซ่อม | ไม่ใช้ (ข้อมูลส่วนบุคคล) |
| 6 | ประเภทงานซ่อมบำรุง | → `dim_maintenance_type` |
| 7 | สถานที่เกิดปัญหา | → `dim_location` |
| 8 | รายละเอียดของปัญหา | ใช้ตรวจการส่งซ้ำ (warehouse ไม่มีคอลัมน์รับ) |
| 9 | แจ้งซ่อมเมื่อ | → `reported_date_key` |
| 10 | รายละเอียดเพิ่มเติม | รวมเข้ากับรายละเอียดของปัญหา |
| 11 | รูปภาพประกอบ | ไม่ใช้ |

**sheet 1** มีคอลัมน์เหมือนกันแต่ลำดับต่าง (B–L): ประทับเวลา, ชื่อ, สถานภาพ, เบอร์โทร, ประเภทงาน, สถานที่, รายละเอียด, แจ้งซ่อมเมื่อ, รายละเอียดเพิ่มเติม, **สังกัด**, รูปภาพ

### ค่าที่ ETL รับได้ และสิ่งที่ทำให้

| ช่อง | รับได้ | ETL ทำอะไร |
|---|---|---|
| แจ้งซ่อมเมื่อ | datetime ของ Excel หรือข้อความ `m/d/yyyy hh:mm` | ปี พ.ศ. แปลงเป็น ค.ศ.; ถ้าอ่านไม่ได้, อยู่หลังประทับเวลาเกิน 5 นาที หรือเก่ากว่าเกิน 7 วัน ให้ใช้ประทับเวลาแทน |
| ประเภทงาน | 8 ประเภทมาตรฐานของฟอร์ม | ข้อความที่พิมพ์เองจัดเข้าประเภทตาม `TYPE_MAP` ถ้าไม่รู้จักเป็น `งานอื่นๆ` |
| สถานภาพ | เจ้าหน้าที่ / อาจารย์ / นิสิต / ช่างเทคนิค / แม่บ้าน | ค่าอื่นจัดตาม `STATUS_MAP` ถ้าไม่รู้จักเป็น `อื่นๆ` |
| สังกัด | ชื่อเต็ม หรือ shortname ตาม `departments` ของ API | ชื่อที่สะกดต่างแก้ตาม `EXCEL_DEPT_ALIAS` ถ้าไม่ตรงจะเพิ่มเป็นหน่วยงานใหม่ `department_id = NULL` |
| สถานที่ | ข้อความอิสระ | แยกเป็นอาคาร/ชั้น/ห้อง/ชื่อพื้นที่ (ดูด้านล่าง) |

**การอ่านสถานที่**
- รหัสห้อง 4 หลัก เช่น `E9203`, `9203`, `ห้อง 9203` อ่านเป็น อาคาร 9 ชั้น 2 ห้อง 9203 (ตัว `E` ตัดทิ้ง)
- `ตึก` / `อ.` แปลงเป็น `อาคาร` และแก้คำพิมพ์ผิดที่พบบ่อย
- ชื่อพื้นที่ที่มีที่เดียว ใช้ได้แม้ไม่มีเลข เช่น ห้องงานบริการการศึกษาและพัฒนานิสิต, สำนักงานเลขานุการ, ศูนย์พลังงาน, ห้องสมุดคณะ (รายการเต็มอยู่ใน `UNIQUE_AREAS`)
- ชื่อทั่วไปที่มีหลายที่ ต้องมีอาคารหรือรหัสห้องด้วย เช่น ห้องน้ำ, ห้อง Server, ห้องธุรการ

**แถวที่ถูกตัดออก** (ดูเหตุผลได้ใน `cleaning_log` / `rejected_place`)
- แถวทดสอบ: ชื่อขึ้นต้นด้วย "ทดสอบ" หรือมีคำว่า "ทดสอบ" ในประเภท สถานที่ หรือรายละเอียด ยกเว้น "ศูนย์ทดสอบ…" ที่เป็นชื่อหน่วยงานจริง
- ส่งซ้ำ: ผู้แจ้งคนเดิม เนื้อหาเหมือนกันทุกช่อง ภายใน 24 ชั่วโมง
- สถานที่ใช้ไม่ได้: เป็นอาการ (เช่น "แอร์ไม่เย็น"), อาคารที่ไม่มีจริง, อาคาร/ชั้นขัดกับรหัสห้อง หรือชื่อทั่วไปที่ไม่มีอาคาร (ใช้ `--keep-invalid-place` ถ้าต้องการเก็บแถวไว้)

---

## 2. API ระบบครุภัณฑ์

### สถานะแต่ละ endpoint

ตั้งค่าที่ `SOURCES` ใน `etl_warehouse.py`: `"api"` คือเรียก API จริง, `"mock"` คืออ่าน `mock_api/<endpoint>.json`, `"file:<path>"` คืออ่านไฟล์ข้อมูลจริงที่ export ไว้ใน repo (JSON เป็น list หรือ `{data: [...]}`)

| endpoint | ตอนนี้ | ไปที่ warehouse |
|---|---|---|
| `assets` | **API จริง** ถ้าเรียกไม่ได้ใช้ `data/assets_real.json` แทน (`FALLBACK_FILES`) | `dim_asset`, `fact_asset_inventory` |
| `asset_types` | mock (ค่าจริงจาก assets) | `dim_asset_type` |
| `asset_categories` | mock | `dim_asset_category` |
| `departments` | mock | `dim_department` |
| `users` | mock | `dim_user` |
| `locations` | mock | `dim_location` (`location_id`) |
| `maintenance_type` | mock | `dim_maintenance_type` |
| `maintenance_asset` | mock | `fact_asset_maintenance` |
| `maintenance_general` | mock | `fact_general_maintenance` |
| `borrow` | mock | `fact_borrow_transaction` |
| `borrow_request_items` | mock | `fact_borrow_transaction` |

เมื่อระบบจริงทำ endpoint ไหนเสร็จ ให้เปลี่ยนค่าใน `SOURCES` เป็น `"api"` ไม่ต้องแก้ส่วนอื่น ถ้า API ทำตามข้อกำหนดด้านล่าง

โค้ด PHP ของทุก endpoint อยู่ใน `assets_api/` แล้ว เปลี่ยนเป็น `"api"` ได้เมื่อขึ้น server

ถ้าเรียก API ไม่ได้ ETL จะแจ้ง `[warn]` ตอนรัน และเขียนไว้ในหัวไฟล์ `warehouse_load.sql` ว่าใช้ไฟล์แทน กรณีนี้วันที่ของ snapshot ใน `fact_asset_inventory` คือวันที่ไฟล์ถูกแก้ล่าสุด ถ้าไฟล์ export ไว้นานแล้ว ให้ใส่ `--snapshot-date` เป็นวันที่ export จริง

### ข้อกำหนดของ API

#### Request

```http
GET {API_BASE}{endpoint}.php?limit=100&page=1
```

| ส่วน | ค่า |
|---|---|
| `API_BASE` | `https://cpe.eng.kps.ku.ac.th/CPEAssets/assets_api/` (เปลี่ยนได้ด้วย `--api-base`) |
| `endpoint` | ชื่อในตาราง "สถานะแต่ละ endpoint" ด้านบน เช่น `borrow.php`, `locations.php` |
| `limit` | จำนวน record ต่อหน้า ETL ส่ง 100 |
| `page` | เริ่มที่ 1 ETL เพิ่มทีละ 1 จนได้ครบ `total` หรือจนเจอหน้าที่ `data` เป็น `[]` |
| method / auth | `GET` ไม่มี token หรือ login (ยังไม่รองรับ) |

#### Response

ทุก endpoint ตอบกลับโครงเดียวกัน (เหมือน `assets.php` ที่ใช้งานอยู่จริง) โดยใช้ `Content-Type: application/json` และ UTF-8

```json
{
  "success": true,
  "message": "เรียกดูรายการยืมสำเร็จ",
  "total": 168,
  "data": [
    { "id": 1, "user_id": 57, "...": "..." },
    { "id": 2, "user_id": 12, "...": "..." }
  ]
}
```

| key | ชนิด | ความหมาย |
|---|---|---|
| `success` | boolean | `false` = ETL หยุดและแสดง `message` |
| `message` | string | ข้อความสถานะ |
| `total` | integer | จำนวน record **ทั้งหมด** (ไม่ใช่แค่ในหน้านี้) ใช้บอกว่าดึงครบหรือยัง |
| `data` | array | record ของหน้านี้ ไม่เกิน `limit` รายการ |

ตัวอย่างการแบ่งหน้า เมื่อ `total = 168`:

| request | `data` ได้กี่รายการ |
|---|---|
| `?limit=100&page=1` | 100 |
| `?limit=100&page=2` | 68 แล้ว ETL หยุด เพราะครบ 168 |
| `?limit=100&page=3` | `[]` (ถ้าถูกเรียก ต้องตอบ array ว่าง ไม่ใช่ error) |

ตัวอย่าง error:

```json
{ "success": false, "message": "ไม่สามารถเชื่อมต่อฐานข้อมูลได้", "total": 0, "data": [] }
```

#### กติกาของ record ใน `data`

- **1 record = 1 แถวของตารางใน DB schema** ใช้ชื่อ key เดียวกับชื่อคอลัมน์ ส่งคอลัมน์อื่นเกินมาได้ ETL จะไม่สนใจ
- **โครงแบน ไม่ซ้อน object/array** ข้อมูลที่เกี่ยวกันอ้างถึงกันด้วย id (ดูแผนผังด้านล่าง)
- **วันเวลา** `"YYYY-MM-DD HH:MM:SS"` (เวลาไทย), **วันที่** `"YYYY-MM-DD"` (แบบ ISO ที่มี `T` หรือ timezone ยังไม่รองรับ)
- **ไม่มีค่า** ส่ง `null` และต้องมี key นั้นอยู่ ห้ามตัด key ทิ้ง
- **ตัวเลข/เงิน** เป็น number (`800.0`) ไม่ใช่ string; **flag** เป็น `0` / `1`
- **ข้อความ** เป็นภาษาไทยตรงๆ ใน UTF-8 ได้เลย

#### ความสัมพันธ์ระหว่าง endpoint

```
departments.department_id ◄── assets.department_id
                          ◄── users.department_id
                          ◄── borrow.department_id
                          ◄── maintenance_general.department_id
locations.location_id     ◄── assets.location_id
users.user_id             ◄── borrow.user_id / teacher_id / approved_by
                          ◄── maintenance_asset.approved_by
                          ◄── maintenance_general.staff_id
maintenance_type.type_id  ◄── maintenance_general.maintenance_type_id
assets.asset_id           ◄── maintenance_asset.asset_id
                          ◄── borrow_request_items.asset_id / replace_asset_id
borrow.id                 ◄── borrow_request_items.request_id
maintenance_asset.id      ◄── maintenance_asset.parent_maintenance_id   (งานซ่อมซ้ำ)
```

id ที่อ้างถึงต้องมีอยู่จริงใน endpoint ปลายทาง ไม่อย่างนั้นช่องนั้นใน warehouse จะเป็น NULL

### ฟิลด์ที่ ETL ใช้

**ต้องมี** = ถ้าไม่มี key นี้ ETL จะ error (ค่าเป็น `null` ได้) / **ไม่บังคับ** = ไม่มีก็ได้ จะได้ NULL หรือใช้ค่าเริ่มต้น

| endpoint | ต้องมี | ไม่บังคับ |
|---|---|---|
| `assets` | `asset_id, asset_code, asset_name, type_id, type_code, type_name, brand, year_purchase, year_fiscal, source, asset_status, location_id, department_id` | `model`, `category_id`, `purchase_date` |
| `asset_types` | `type_id, type_code, type_name` | `is_deleted` |
| `asset_categories` | `category_id, category_name_th` | `category_code` (ใช้ผูกหมวดเมื่อ asset ไม่มี `category_id`) |
| `departments` | `department_id, department_name` | `shortname` (ใช้จับคู่ชื่อสังกัดใน Excel), `is_deleted` |
| `users` | `user_id, fullname` | `role_status` (**ไม่มีใน DB schema แต่ `dim_user` ต้องใช้**), `department_id` |
| `locations` | `location_id, location_name, building, floor, room_detail` | `is_deleted` |
| `maintenance_type` | `type_id, type_name` | – |
| `maintenance_asset` | `asset_id, repair_date, complete_date, cost, followup_cost, vendor, status, approved_by, repair_total_day, is_followup, followup_no` | – |
| `maintenance_general` | `id, department_id, reporter_status, maintenance_type_id, problem_location, reported_at, status, staff_id, completed_at` | – |
| `borrow` | `id, user_id, teacher_id, borrow_date, return_date, actual_return_date, status, return_condition, department_id, is_overdue, approved_by` | – |
| `borrow_request_items` | `request_id, asset_id, item_status, replace_asset_id` | – |

### ตัวอย่าง JSON แต่ละ endpoint

ตัวอย่างนี้คือ 1 record ใน `data` แบบส่งครบทุกคอลัมน์ตาม DB schema `assets` เป็นข้อมูลจริง ส่วน endpoint อื่นมาจาก mock

**`assets.php`** (API จริง ส่ง `type_name` และ `department_name` มาด้วย)
```json
{
  "asset_id": 948, "asset_code": "2-K0504-FA05-09200040001/001-68", "asset_name": "เวทีสำเร็จรูป",
  "type_id": 2, "type_name": "ครุภัณฑ์สำนักงาน", "type_code": "FA05", "category_id": null,
  "brand": "", "year_purchase": null, "year_fiscal": null, "source": "เงินรายได้",
  "asset_status": "พร้อมใช้งาน", "location_id": 32, "department_id": 3,
  "department_name": "ภาควิชาวิศวกรรมเกษตร", "update_date": "2026-06-23 14:07:32"
}
```
ควรเพิ่ม: `model`, `purchase_date`, `purchase_price`, `warranty_expire`, `serial_number` และใส่ค่า `brand`, `year_fiscal`, `category_id` ที่ตอนนี้ว่างเกือบทั้งหมด

**`asset_types.php`** (ค่าจริงจาก assets)
```json
{"type_id": 12, "type_code": "FN05", "type_name": "ครุภัณฑ์สำนักงาน-ต่ำกว่าเกณฑ์ (ต่ำกว่า 5,000 บาท)", "description": null, "is_deleted": 0, "deleted_at": null}
```

**`asset_categories.php`** (`category_code` = เลข 2 หลักใน `type_code` เช่น FA**05** / FN**05** → 05)
```json
{"category_id": 4, "category_code": "05", "category_name_th": "ครุภัณฑ์สำนักงาน", "category_name_en": "Office equipment", "description": null, "status": "active", "created_at": "2024-10-01 09:00:00", "updated_at": "2024-10-01 09:00:00"}
```

**`departments.php`**
```json
{ "department_id": 7, "department_name": "ภาควิชาวิศวกรรมคอมพิวเตอร์", "shortname": "CPE", "is_deleted": 0, "deleted_at": null }
```

**`users.php`** (`role_status` / `department_id` ไม่มีในตาราง `users` ของ DB schema แต่ควรส่งมา)
```json
{ "user_id": 1, "fullname": "ผู้ใช้ตัวอย่าง 01", "role_status": "อาจารย์", "department_id": 5 }
```
`role_status`: `อาจารย์` / `เจ้าหน้าที่` / `นิสิต`

**`locations.php`**
```json
{
  "location_id": 1, "location_name": "ห้องเรียน 8302", "building": "อาคาร 8", "floor": "3",
  "room_detail": "E8302", "remark": null, "is_deleted": 0, "deleted_at": null
}
```
`building` / `room_detail` กรอกแบบอิสระได้ (`ตึก 8`, `E8302`, `ห้อง 8302`) ETL จะจัดรูปเอง

**`maintenance_type.php`**
```json
{ "type_id": 1, "type_name": "งานระบบปรับอากาศ" }
```
ชื่อควรตรงกับประเภทในฟอร์ม Excel เพื่อให้รวมกันได้ (ตัวอย่างครบ 11 ประเภทอยู่ใน `mock_api/maintenance_type.json`)

**`maintenance_asset.php`** (งานซ่อมครุภัณฑ์)
```json
{
  "id": 4, "asset_id": 2657, "reporter_name": "ผู้ใช้ตัวอย่าง 36",
  "repair_date": "2024-10-10 12:20:00", "detail": "ใช้งานได้บางครั้ง", "repair_image": null,
  "cost": 800.0, "vendor": "ร้านซ่อมตัวอย่าง C", "status": "ซ่อมเสร็จ",
  "executive_note": "อนุมัติให้ส่งซ่อมภายนอก", "executive_by": 15, "executive_at": "2024-10-11 12:20:00",
  "staff_note": null, "staff_note_by": 23, "staff_note_at": "2024-10-10 15:20:00",
  "complete_date": "2024-10-18 12:20:00", "deleted_at": null, "deleted_by": null, "updated_by": 24,
  "approved_by": 15, "updated_at": "2024-10-18 12:20:00", "created_at": "2024-10-10 12:20:00",
  "repair_total_day": 8, "parent_maintenance_id": null, "is_followup": 0, "followup_no": 0, "followup_cost": null
}
```
งานซ่อมซ้ำของงานเดิม: `"parent_maintenance_id": 5, "is_followup": 1, "followup_no": 1, "cost": null, "followup_cost": 350.0`
ถ้ายังซ่อมไม่เสร็จ: `complete_date` และ `repair_total_day` เป็น `null`

**`maintenance_general.php`** (แจ้งซ่อมทั่วไปในระบบใหม่)
```json
{
  "id": 11, "department_id": 2, "reporter_status": "เจ้าหน้าที่", "maintenance_type_id": 1,
  "problem_location": "อาคาร 8 ชั้น 3 ห้องเรียน E8302", "problem_detail": "แอร์มีเสียงดัง",
  "reported_at": "2026-08-11 13:30:00", "additional_detail": "-", "status": "เสร็จสิ้น",
  "staff_id": 26, "completed_at": "2026-08-12 14:30:00",
  "created_at": "2026-08-11 13:30:00", "updated_at": "2026-08-12 14:30:00"
}
```
`problem_location` ใช้กติกาเดียวกับช่องสถานที่ใน Excel ถ้ากรอกเป็นอาการ (เช่น "แอร์ไม่เย็น") แถวนั้นจะถูกตัด

**`borrow.php`** (ใบยืม 1 ใบ)
```json
{
  "id": 3, "user_id": 51, "teacher_id": 15, "borrow_date": "2024-10-11", "return_date": "2024-11-10",
  "reason": "ใช้ในงานกิจกรรม", "status": "คืนแล้ว", "created_at": "2024-10-10 11:40:00",
  "return_by": 19, "actual_return_date": "2024-11-09 16:15:00", "return_condition": "ปกติ",
  "return_note": null, "deleted_at": null, "phone": null, "department_id": 2,
  "deleted_by": null, "updated_by": null, "is_overdue": 0, "approved_by": 21, "updated_at": "2024-11-09 16:15:00"
}
```
`return_date` = วันกำหนดคืน, `actual_return_date` = วันคืนจริง (`null` = ยังไม่คืน), `status` = `อนุมัติ` / `คืนแล้ว` / `ปฏิเสธ`

**`borrow_request_items.php`** (ครุภัณฑ์แต่ละชิ้นในใบยืม ใบยืม 1 ใบมีได้หลายชิ้น)
```json
{
  "id": 3, "request_id": 3, "asset_id": 2840, "item_status": "อนุมัติ", "replace_asset_id": 3337,
  "staff_note": "เครื่องเดิมไม่พร้อมใช้ เปลี่ยนเครื่องทดแทน", "checked_by": 18, "checked_at": "2024-10-11 09:30:00",
  "return_status": "คืนแล้ว", "return_note": null, "returned_by": 19, "returned_at": "2024-11-09 16:15:00",
  "deleted_at": null, "deleted_by": null
}
```
`replace_asset_id` = เครื่องทดแทนที่ให้ยืมไปจริง (`null` = ไม่ได้เปลี่ยน)

### สิ่งที่ ETL ทำกับข้อมูล API

- **หมวดหมู่ครุภัณฑ์**: ใช้ `asset.category_id` ถ้ามี ถ้าไม่มี (ตอนนี้ API จริงเป็น null ทุกแถว) ใช้เลขหมวดใน `type_code` (FA05 → 05) จับกับ `asset_categories.category_code`
- **ประเภทครุภัณฑ์**: ใช้ `asset_types`; ครุภัณฑ์ที่ `type_id` ว่างแต่มี `type_code` จะได้ประเภทจากรหัสนั้น
- **ปีงบที่ได้มา (`year_fiscal`)**: ถ้า API ว่าง ถอดจากท้ายรหัสครุภัณฑ์ เช่น `.../001-68` → 2568, `.../ร.54-1` → 2554
- **แหล่งเงิน (`source`)**: 8 แบบที่สะกดต่างกันรวมเป็น 4 กลุ่ม (`SOURCE_GROUP`)
- **locations**: `building + floor + room_detail + location_name` ผ่านตัวแยกสถานที่เดียวกับ Excel ห้องเดียวกันจึงได้ `location_key` เดียวกันทั้งฝั่งครุภัณฑ์และฝั่งแจ้งซ่อม
- **แถวที่ `is_deleted = 1`** (departments, locations): ตัดออก ยกเว้นยังมีข้อมูลอ้างถึงอยู่
- **ผู้อนุมัติการยืม**: ใช้ `approved_by` ถ้าว่างใช้ `teacher_id`
- **ครุภัณฑ์ที่ยืม**: ถ้ามี `replace_asset_id` ใช้เครื่องทดแทน (เครื่องที่ยืมไปจริง) และตั้ง `is_replaced_flag = 1`
- **วันเกินกำหนด**: คืนแล้วคิดจาก `actual_return_date − return_date`; ยังไม่คืนคิดถึงวันที่ `--as-of`; ใบที่ `status = ปฏิเสธ` ไม่คิด
- **แจ้งซ่อมทั่วไป**: ถือว่า API เป็นระบบใหม่ที่ใช้ต่อจาก Excel ถ้ามีงานใน API ที่แจ้งก่อนหรือวันเดียวกับ Excel ใบสุดท้าย ETL จะเตือนในหัวไฟล์ SQL ว่าอาจซ้ำ

### Snapshot ครุภัณฑ์ (`fact_asset_inventory`)

fact นี้เป็น periodic snapshot: 1 แถว = ครุภัณฑ์ 1 ชิ้น ณ วันที่ดึงข้อมูล ทุกครั้งที่รัน ETL จะเก็บรายการ assets ของรอบนั้นไว้ที่ `<out>/history/assets_YYYYMMDD.json` แล้วสร้าง fact จาก**ทุก** snapshot ที่เก็บไว้ (รันซ้ำวันเดียวกันจะเขียนทับ snapshot ของวันนั้น)

| คอลัมน์ | คิดจาก |
|---|---|
| `snapshot_date_key` | วันที่ดึง assets API (หรือ `--snapshot-date`) |
| `acquisition_date_key` | `purchase_date` → ถ้าไม่มี ใช้ 1 ต.ค. ต้นปีงบจากท้ายรหัสครุภัณฑ์ → ถ้าไม่มี ใช้ 1 ม.ค. ของ `year_purchase` |
| `department_key`, `type_key`, `category_key`, `location_key` | ค่าของครุภัณฑ์ ณ วันที่ snapshot |
| `is_available_flag` | `asset_status = พร้อมใช้งาน` (ถูกยืม / ชำรุด / ส่งซ่อม = 0) |
| `is_damaged_flag` | `asset_status` เป็น ชำรุด หรือ ส่งซ่อม |
| `is_below_threshold_flag` | `type_code` ขึ้นต้น FN / FP / FU หรือชื่อประเภทมีคำว่า ต่ำกว่าเกณฑ์ |
| `has_location_flag` | มี `location_key` |
| `asset_age_years` | จำนวนปีเต็มจากวันที่ได้มาถึงวันที่ snapshot |

warehouse โหลดแบบ full refresh ทุกครั้ง ประวัติ snapshot จึงอยู่ที่โฟลเดอร์ `history/` ไม่ได้อยู่ใน MySQL ถ้าโฟลเดอร์นี้หาย จะเหลือแค่ snapshot ของรอบล่าสุด

### Mock

- `mock_api/*.json` คือตัวอย่าง response ตามข้อกำหนดข้างบน ทีมที่ทำ API ใช้เป็นแบบได้
- `departments` และ `asset_types` ใช้ id และชื่อจริงจาก assets ส่วน `asset_categories` ใช้เลขหมวดจริงใน `type_code` แต่ชื่อหมวดเป็นค่าที่ตั้งเอง ที่เหลือเป็นค่าสมมติที่อ้าง asset_id จริง
- ช่วงข้อมูล: ปีงบประมาณ 2568–2569 ส่วนแจ้งซ่อมทั่วไปเริ่มหลัง Excel
- สร้างใหม่ได้ด้วยคำสั่งนี้ (seed คงที่ ได้ข้อมูลชุดเดิมทุกครั้ง):
  ```bash
  python mock_api/generate_mock.py output/raw/assets.json mock_api
  ```
- รายละเอียด field ครบทุกตัวอยู่ใน [mock_api/API_SPEC.md](mock_api/API_SPEC.md)

---

## 3. รันทั้งระบบบนเครื่อง (Docker)

`docker-compose.yml` เปิดระบบครบทั้งสาย ข้อมูลไหลจริงทุกขั้น ไม่ได้อ่านไฟล์ mock ตรงๆ:

```
source-db ──► source-api ──► etl ──► warehouse-db ──► warehouse-api ──► frontend
(ระบบครุภัณฑ์)  (assets_api/*.php)  (etl_warehouse.py)          (web/public/api)   (Nginx)
```

| service | ทำอะไร | port บนเครื่อง |
|---|---|---|
| `source-db` | MySQL ของระบบครุภัณฑ์ สร้างตารางจาก `DB warehouse project schema.sql` + `docker/source-db/02-extend.sql` | 3308 |
| `source-seed` | เติมข้อมูลครั้งแรก: `asset` จาก `data/assets_real.json` (จริง) ตารางอื่นจาก `mock_api/` (จำลอง) แล้วจบ | – |
| `source-api` | PHP ของทีมใน `assets_api/` | 8089 |
| `etl` | ดึง**ทุก endpoint** จาก `source-api` (`--all-api`) → `output/warehouse_load.sql` → โหลดเข้า warehouse แล้วจบ | – |
| `warehouse-db` | MySQL ของ warehouse (ฐานข้อมูล `cpe_warehouse` ชื่อเดียวกับที่ทีมใช้ใน XAMPP) สร้างตารางจาก `warehouse schema.sql` | 3307 |
| `warehouse-api` | backend ของ dashboard (`web/public/api/*.php`) อ่าน warehouse อย่างเดียว | ผ่าน frontend |
| `frontend` | Nginx ส่งหน้าเว็บ `web/public` และส่งต่อ `/api/` ไปที่ `warehouse-api` | **8088** |
| `report-web` | PHP วาง `dashboard_report.html`, `dashboard_borrow.html` และ `assets_api/` แบบเดียวกับ XAMPP | **8090** |

### เริ่มใช้งาน

ต้องมี Docker Desktop อย่างเดียว ไม่ต้องติดตั้ง Python บนเครื่อง

```bash
docker compose up -d --build
```

เปิด <http://localhost:8088> (dashboard) และดู API ของระบบครุภัณฑ์ได้ที่ <http://localhost:8089/assets.php?limit=5&page=1>

| ต้องการ | คำสั่ง |
|---|---|
| รัน ETL รอบใหม่ (snapshot ครุภัณฑ์รอบใหม่ + โหลด warehouse) | `docker compose run --rm etl` |
| ดูผลของ ETL | `docker compose logs etl` |
| จำลองการใช้งาน 1 วันในระบบต้นทาง (ครุภัณฑ์ใหม่ ระบุสถานที่ แจ้งซ่อม ยืม-คืน) แล้วรัน `etl` เพื่อดูข้อมูลไหลถึงหน้าเว็บ | `docker compose run --rm source-seed python docker/etl/simulate_activity.py` |
| ล้างข้อมูลระบบต้นทางแล้วเติมใหม่ | `docker compose run --rm source-seed python docker/etl/seed_source.py --force` |
| หยุด | `docker compose down` |
| ลบฐานข้อมูลทั้งหมดแล้วเริ่มใหม่ (เช่น schema เปลี่ยน) | `docker compose down -v` แล้ว `docker compose up -d --build` |

- `docker compose up` ทุกครั้งจะรัน ETL ใหม่ ส่วน `source-seed` เติมข้อมูลเฉพาะครั้งแรก (ตาราง `asset` ว่าง)
- ผลลัพธ์ ETL และ `output/history/` (snapshot ครุภัณฑ์) อยู่บนเครื่อง ไม่หายเมื่อลบ container
- `docker/source-db/02-extend.sql` เพิ่มคอลัมน์ที่ `departments.php` / `users.php` ต้องใช้แต่ DB schema ยังไม่มี (`departments.shortname`, `is_deleted`, `deleted_at`; `users.role_status`, `department_id`) ระบบจริงต้องเพิ่มคอลัมน์เหล่านี้ด้วย

| ค่า | default | เปลี่ยนได้ด้วย env |
|---|---|---|
| port หน้าเว็บ / API ต้นทาง | 8088 / 8089 | `WEB_PORT`, `SOURCE_API_PORT` |
| ผู้ใช้ warehouse (backend ใช้) | `dashboard` / `dashboard` | `DB_USER`, `DB_PASSWORD` |
| root ของ warehouse / ระบบต้นทาง | `root` / `root` | `DB_ROOT_PASSWORD`, `SOURCE_DB_ROOT_PASSWORD` |

รหัสผ่าน default ใช้สำหรับเครื่องตัวเองเท่านั้น ห้ามใช้บน server จริง

RAM ที่วัดได้ตอนรันครบ: `warehouse-db` ~340 MB, `source-db` ~200 MB, `source-api` ~18 MB, `warehouse-api` ~15 MB, `frontend` ~5 MB รวมประมาณ 580 MB (`etl` ใช้ ~115 MB เฉพาะตอนรันแล้วจบ)

### โครงสร้างหน้าเว็บ

```
web/
├── config/modules.json        รายการโมดูล ลำดับ ชื่อ path มุมมองย่อย แหล่งข้อมูล (จริง/จำลอง) และเกณฑ์ (settings)
└── public/
    ├── index.html             application shell: header, เมนูลอย, หัวโมดูล, เมนูย่อย
    ├── api/                   backend: อ่านอย่างเดียวจาก warehouse (JSON)
    │   ├── modules.php        ส่ง config/modules.json ให้หน้าเว็บสร้างเมนู
    │   ├── invest.php         ขอเงินลงทุน: เกินอายุการใช้งาน กลุ่มครุภัณฑ์ตามปีที่ครบอายุ (ให้หน้าเว็บจำลองงบ) รายการทดแทนทันที
    │   ├── annual.php         รายงานประจำปี: ตัวเลขทุกโมดูลรายปีงบ + รายละเอียดปีที่เลือก (?fy=2569) เทียบปีก่อน
    │   ├── inventory.php      fact_asset_inventory: ได้รับเข้าตามปีงบ อายุ หมวด ประวัติ snapshot
    │   ├── facility.php       fact_general_maintenance: รายเดือน ฤดูกาล ประเภทงาน อาคาร
    │   ├── repair.php         fact_asset_maintenance (?view=overview | worth) ค่าซ่อมสะสมเทียบราคาซื้อ
    │   └── borrow.php         fact_borrow_transaction: รายเดือน รายไตรมาส หมวด
    └── assets/
        ├── app.css            token สีจาก docs/design-guide.md
        ├── app.js             router (hash) + เมนูลอยที่สร้างจาก modules.json
        ├── views.js           หน้าจอของแต่ละโมดูล ลงทะเบียนตามชื่อ component
        ├── charts.js          กราฟแท่ง/เส้น (d3)
        └── format.js          จัดรูปตัวเลข วันที่ ปีงบ
docker/
├── php/Dockerfile             php:8.3-apache + pdo_mysql (source-api, warehouse-api)
├── etl/                       Dockerfile, run.sh (ETL + โหลด), seed_source.py, load_warehouse.py
├── source-db/02-extend.sql    คอลัมน์เพิ่มของระบบต้นทาง
└── frontend/nginx.conf
```

- **เกณฑ์ปรับได้** ใน `settings` ของ `modules.json`: เกณฑ์ปิดงานแจ้งซ่อม (`sla_facility_workdays`, default 3 วันทำการ), เกณฑ์ซ่อมครุภัณฑ์ (`sla_repair_workdays`, 15), เกณฑ์ความคุ้มค่าการซ่อม (ค่าซ่อมสะสม ≥ `repair_cost_ratio_dispose` 50% ของราคาซื้อ **และ** ใช้งานเกิน `replace_min_life_share` 50% ของอายุการใช้งาน = ไม่คุ้มซ่อม ควรทดแทน, ค่าซ่อมถึง 50% แต่ยังใหม่ = ตรวจสาเหตุก่อน, ≥ `repair_cost_ratio_watch` 30% = เฝ้าระวัง), อายุการใช้งานตามหมวด (`useful_life_years` เป็นค่าตั้งต้น ควรยืนยันกับหลักเกณฑ์ของกรมบัญชีกลาง/พัสดุ), จำนวนปีของแผนทดแทน (`replacement_plan_years`, 5) และ **วันหยุดราชการ (`holidays`) ที่ต้องเติมเองทุกปี** ไม่อย่างนั้นวันทำการจะไม่หักวันหยุดนักขัตฤกษ์
- **ราคาซื้อเป็นข้อมูลจำลอง**: ระบบครุภัณฑ์ยังไม่มี `purchase_price` หน้า "คุ้มซ่อมไหม" ใช้ `mock_purchase_price()` ใน `api/db.php` ที่สุ่มราคาแบบคงที่จากรหัสครุภัณฑ์ ตามช่วงราคาของหมวด และไม่เกิน 5,000 บาทสำหรับครุภัณฑ์ต่ำกว่าเกณฑ์ เมื่อมีราคาจริงให้แทนฟังก์ชันนี้
- **ขอเงินลงทุน**: สัดส่วนครุภัณฑ์ที่เกินอายุการใช้งานย้อนหลัง 10 ปี และตัวปรับ "ถ้าได้งบทดแทนปีละเท่าไร" (what-if แบบ Power BI / Predictor) ที่จำลองบนหน้าเว็บทันทีเมื่อเลื่อนงบ: แต่ละปีใช้งบกับรายการซ่อมไม่คุ้มก่อน แล้วไล่จากชิ้นที่เกินอายุนานที่สุด ชิ้นที่ทดแทนแล้วกลับมาครบอายุอีกครั้งตามอายุการใช้งาน เห็นผลเป็นเส้น "ไม่ลงทุน" เทียบ "งบที่เลือก", การใช้งบรายปี และสัดส่วนที่เหลือเกินอายุแยกหมวด มีปุ่มลัด ไม่ลงทุน / งบเฉลี่ยตามอายุ (ราคา ÷ อายุการใช้งาน) / งบน้อยที่สุดที่ล้างค้างได้ภายในแผน งบที่เลือกอยู่ใน URL (`#/invest?budget=12`) ส่งลิงก์ให้ผู้บริหารเปิดฉากเดียวกันได้ ปุ่มคัดลอกแผนรายปีไปวางในแบบคำของบได้ คิดเฉพาะหมวดที่ขึ้นต้นด้วย "ครุภัณฑ์" ราคาทดแทนประมาณจากราคาซื้อจำลอง
- **หน้าจอเน้นตัวเลขสำคัญ**: แต่ละหน้ามีตัวเลขหลัก 3–5 ตัวเป็นตัวใหญ่ ตามด้วยกราฟที่มีแค่หัวข้อ ไม่มีคำอธิบายรอง (คำอธิบายโมดูลอยู่ใน tooltip ของป้ายแหล่งข้อมูล)
- **มุมมองแบบรายงานย้อนหลัง ไม่ใช่สถานะปัจจุบัน**: โมดูลแรก "รายงานประจำปี" เลือกปีงบได้ เทียบปีก่อน ปุ่ม "คัดลอกสรุป" ให้ข้อความเป็นข้อ ๆ ไปวางในบันทึกข้อความ และหน้า "ย้อนหลังทุกปีงบ" เป็นตารางทุกปีตั้งแต่เริ่มมีข้อมูล (คัดลอกวางใน Excel/Word ได้) ปีงบที่ยังไม่จบแสดงในตารางแต่ไม่ใช้เทียบ ทุกหน้าพิมพ์หรือบันทึกเป็น PDF ได้ (หน้าพิมพ์เป็นพื้นขาว มีวันเวลาที่พิมพ์)
- **เมนูไม่ได้เขียนตายตัว**: เมนูหลักและเมนูย่อยสร้างจาก `config/modules.json` เพิ่ม ลบ เรียงใหม่ หรือซ่อนโมดูล (`"visible": false`) ได้โดยไม่แก้โค้ดเมนู ตาม `docs/frontend-guide.md`
- **เพิ่มโมดูลใหม่**: เพิ่ม entry ใน `modules.json` → เขียน `api/<ชื่อ>.php` → เพิ่มหน้าจอใน `views.js` ด้วยชื่อ `component` ที่ตั้งไว้
- **URL**: แต่ละหน้ามีลิงก์ของตัวเอง เช่น `#/annual/summary?fy=2568` ปุ่มย้อนกลับ/ไปข้างหน้าของ browser ใช้ได้
- **ปีงบที่เทียบกัน**: ใช้ปีงบที่ครบแล้วล่าสุดเทียบกับปีก่อนหน้า คิดจากวันที่ปัจจุบัน (ต.ค. 2569 เป็นต้นไป = ปีงบ 2569 เทียบ 2568)
- **แหล่งข้อมูล**: หัวโมดูลบอกว่าเป็น ข้อมูลจริง / จริง + จำลอง / ข้อมูลจำลอง ตาม `data_source` ใน `modules.json` เมื่อระบบต้นทางมีข้อมูลจริงของโมดูลนั้นแล้วให้แก้ค่านี้
- d3 และฟอนต์ IBM Plex Sans Thai โหลดจาก CDN จึงต้องต่ออินเทอร์เน็ต

---

### dashboard_report.html (ไฟล์เดียว แบบเดียวกับ dashboard_borrow.html)

หน้ารายงานประจำปี ขอเงินลงทุน ครุภัณฑ์ แจ้งซ่อมอาคาร ซ่อมครุภัณฑ์ และยืม-คืน รวมอยู่ในไฟล์ `dashboard_report.html` ที่ root ของ repo ดึงข้อมูลจาก `assets_api/report_*.php` ซึ่งอ่าน Data Warehouse อย่างเดียว

| ไฟล์ | หน้าที่ |
|---|---|
| `dashboard_report.html` | หน้าเว็บทั้งหมด (CSS/JS ในไฟล์เดียว, d3 จาก CDN) มีปุ่มสลับโหมดมืด/สว่าง ใช้ค่า `cpe_theme` ร่วมกับ `dashboard_borrow.html` |
| `assets_api/report_common.php` | เชื่อมต่อ warehouse + ฟังก์ชันกลาง (วันทำการ, ราคาจำลอง, อายุการใช้งาน, ความคุ้มค่าการซ่อม) |
| `assets_api/report_config.json` | เกณฑ์ทั้งหมด (SLA, เกณฑ์ซ่อม 50% + ครึ่งอายุ, อายุการใช้งานตามหมวด, วันหยุดราชการ) |
| `assets_api/report_annual.php`, `report_invest.php`, `report_inventory.php`, `report_facility.php`, `report_repair.php`, `report_borrow.php` | ข้อมูลของแต่ละหน้า |

- **XAMPP**: วาง repo ไว้ใน `htdocs` แล้วเปิด `http://localhost/<โฟลเดอร์>/dashboard_report.html` ตัวหน้าเรียก `assets_api/` ที่อยู่ข้างไฟล์ ถ้า API อยู่ที่อื่นให้เติม `?api=http://localhost/assets_api/` ท้าย URL
- **ฐานข้อมูล**: `report_*.php` ใช้ `WAREHOUSE_DB_HOST` / `WAREHOUSE_DB_PORT` / `WAREHOUSE_DB_NAME` / `WAREHOUSE_DB_USER` / `WAREHOUSE_DB_PASS` ค่าเริ่มต้นคือ `localhost`, `3306`, `cpe_warehouse`, `root`, ไม่มีรหัสผ่าน (ชื่อฐานข้อมูลเดียวกับ `dw_borrow.php` ของหน้ายืม-คืน)
- **Docker**: เปิด <http://localhost:8090/dashboard_report.html> (service `report-web`)
- เนื้อหาเหมือนหน้าใน `web/public` แต่เป็นไฟล์แยก แก้หน้าใดหน้าหนึ่งแล้วอีกหน้าจะไม่เปลี่ยนตาม

## ข้อจำกัดที่ควรรู้

- `fact_general_maintenance` ไม่มีคอลัมน์รายละเอียดของปัญหาและชั่วโมงที่แจ้ง จึงไม่ได้โหลด 2 อย่างนี้
- แถวจาก Excel ไม่มีวันเสร็จ สถานะงาน ผู้รับผิดชอบ และเวลาแก้ไข (เป็น NULL)
- ใบแจ้งซ่อมที่ระบุหลายห้อง/ชั้น/อาคาร เก็บรวมในช่องเดียว เช่น ห้อง `4401, 4402` เพราะ fact มี `location_key` ได้ค่าเดียว
- API จริงยังไม่ส่ง `model`, `purchase_date`, `category_id` และ `year_fiscal` เป็น null ทั้งหมด (ETL ถอดปีงบและหมวดจากรหัสแทน)
- ครุภัณฑ์ 83% ไม่มี `location_id` ใน API จริง จึงไม่มี `location_key`
- `dim_location.location_id` มีค่าเฉพาะสถานที่ที่มาจากตาราง `locations`; สถานที่ที่มาจากใบแจ้งซ่อมอย่างเดียวเป็น NULL
- `fiscal_year` ใน `dim_date` เป็นปีงบประมาณ **พ.ศ.** เริ่ม 1 ต.ค. (เปลี่ยนได้ที่ `FISCAL_YEAR_BE`)
