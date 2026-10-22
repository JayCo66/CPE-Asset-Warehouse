# CPEAssets API — โครงสร้างสำหรับ ETL

Base URL: `https://cpe.eng.kps.ku.ac.th/CPEAssets/assets_api/`

ทุก endpoint ใช้ `GET <endpoint>.php?limit=100&page=N` (limit สูงสุด 100) และตอบกลับรูปแบบเดียวกับ `assets.php` ที่มีอยู่จริง:

```json
{ "success": true, "message": "...", "total": 4324, "data": [ { ... }, ... ] }
```

ETL จะดึงทีละหน้าจนได้ครบ `total` ไฟล์ mock ในโฟลเดอร์นี้มีทุก record อยู่ในหน้าเดียว และมี `_mock` บอกว่าเป็นข้อมูลสมมติ

| endpoint | สถานะ | ตารางต้นทาง | ใช้เติม warehouse |
|---|---|---|---|
| `assets` | **มีจริง** | asset | dim_asset, fact_asset_inventory |
| `asset_types` | mock (ค่าจริงจาก assets) | asset_types | dim_asset_type |
| `asset_categories` | mock | asset_categories | dim_asset_category |
| `departments` | mock (ค่าจริงจาก assets) | departments | dim_department |
| `users` | mock | users | dim_user |
| `locations` | mock | location (`location_id, location_name, building, floor, room_detail, remark, is_deleted, deleted_at`) | dim_location |
| `maintenance_type` | mock | maintenance_type | dim_maintenance_type |
| `maintenance_asset` | mock | maintenance_asset | fact_asset_maintenance |
| `maintenance_general` | mock | maintenance_general | fact_general_maintenance |
| `borrow` | mock | borrow | fact_borrow_transaction |
| `borrow_request_items` | mock | borrow_request_items | fact_borrow_transaction |

ฟิลด์ของ endpoint ที่เป็น mock ตรงกับคอลัมน์ในตาราง `DB warehouse project schema` ทุกคอลัมน์ ยกเว้นที่ระบุไว้ด้านล่าง

## ฟิลด์ที่ต้องเพิ่มจาก DB schema

- `users.role_status` (อาจารย์ / เจ้าหน้าที่ / นิสิต): `dim_user.role_status` ต้องใช้ แต่ตาราง `users` ไม่มี
- `users.department_id`: ไม่บังคับ แต่มีไว้ใช้ดูว่าผู้ใช้สังกัดหน่วยงานไหน

## ช่วงข้อมูล mock

- ซ่อมครุภัณฑ์และยืมคืน: ปีงบประมาณ 2568–2569 (1 ต.ค. 2567 – 21 ต.ค. 2569)
- แจ้งซ่อมทั่วไป: เริ่ม 15 ก.ค. 2569 ต่อจาก Excel ฉบับสุดท้าย จึงไม่ซ้ำกับ Excel
- `locations`: ค่าที่กรอกตั้งใจให้ไม่เป็นรูปแบบเดียวกัน (`ตึก 9` / `อาคาร 9`, `E8302` / `ห้อง 8302`) เหมือนที่คนกรอกจริง ETL จะจัดรูปให้เอง และมี 1 แถวที่ `is_deleted = 1` ไว้ทดสอบการกรองแถวที่ถูกลบ

## ฟิลด์ที่ `assets.php` จริงยังไม่ส่ง (warehouse จะได้ NULL)

`model`, `purchase_price`, `purchase_date`, `warranty_expire`, `serial_number`, ชื่อหมวดหมู่ (ทุก record มี `category_id = null`), และ `year_fiscal` (ทุก record เป็น null)

ถ้าเพิ่มฟิลด์เหล่านี้ใน `assets.php` ด้วยชื่อตาม DB schema ETL จะนำไปใช้ได้ทันที

## สร้าง mock ใหม่

```
python mock_api/generate_mock.py output/raw/assets.json mock_api
```

ใช้ seed คงที่ รันกี่ครั้งก็ได้ข้อมูลชุดเดิม และอ้าง asset_id/หน่วยงานจากข้อมูล assets จริงที่ดึงมา

## เปลี่ยนจาก mock เป็น API จริง

เมื่อระบบเปิด endpoint ไหนแล้ว ให้แก้ `SOURCES` ใน `etl_warehouse.py` จาก `"mock"` เป็น `"api"` ไม่ต้องแก้ส่วนอื่น
