# คู่มือ Deploy (Docker ไม่ใช้ Compose)

ระบบมีแอปเดียว คือเว็บหน้ารวมพร้อม API (PHP 8.3 + Apache) ใช้ `Dockerfile` ที่ root ของ repo ส่วนฐานข้อมูลเป็น MySQL ที่อยู่นอก container

## สิ่งที่ต้องเตรียม

| รายการ | ค่า |
|---|---|
| ชนิดฐานข้อมูล | MySQL 8.0 (utf8mb4) |
| ฐานข้อมูล | `cpeasset` (ระบบครุภัณฑ์ต้นทาง) และ `cpe_warehouse` (Data Warehouse) อยู่บน server เดียวกันได้ |
| พอร์ตใน container | 80 |
| Base path | ตั้งด้วย `BASE_PATH` เช่น `/asset-warehouse` |
| ข้อมูลที่ต้องคงอยู่ | `/var/lib/cpe-warehouse/snapshot-history` (ไฟล์ snapshot ที่นำเข้าจากหน้าเว็บ) |

## 1. เตรียมฐานข้อมูล

นำเข้าไฟล์ dump ที่ส่งให้ ไฟล์นี้สร้างทั้งสองฐานข้อมูลให้เอง

```bash
mysql -uroot -p < cpe_asset_warehouse_dump.sql
```

สร้าง user ของเว็บ สิทธิ์เขียนจำกัดเฉพาะตารางที่การนำเข้า snapshot ใช้

```sql
CREATE USER 'cpe_web'@'%' IDENTIFIED BY '<รหัสผ่าน>';
GRANT SELECT, SHOW VIEW ON cpeasset.* TO 'cpe_web'@'%';
GRANT SELECT, SHOW VIEW ON cpe_warehouse.* TO 'cpe_web'@'%';
GRANT INSERT, UPDATE ON cpe_warehouse.dim_asset TO 'cpe_web'@'%';
GRANT INSERT, UPDATE ON cpe_warehouse.dim_asset_category TO 'cpe_web'@'%';
GRANT INSERT, UPDATE ON cpe_warehouse.dim_asset_type TO 'cpe_web'@'%';
GRANT INSERT, UPDATE ON cpe_warehouse.dim_department TO 'cpe_web'@'%';
GRANT INSERT, UPDATE ON cpe_warehouse.dim_location TO 'cpe_web'@'%';
GRANT INSERT ON cpe_warehouse.dim_date TO 'cpe_web'@'%';
GRANT INSERT ON cpe_warehouse.dim_inventory_snapshot TO 'cpe_web'@'%';
GRANT INSERT ON cpe_warehouse.fact_asset_inventory TO 'cpe_web'@'%';
```

`database/source_schema.sql` และ `database/warehouse_schema.sql` ใช้สร้างฐานข้อมูลเปล่าสำหรับพัฒนาเท่านั้น ฐานข้อมูลที่มีอยู่แล้วไม่ต้องรัน migration เพิ่ม

## 2. Build image

```bash
docker build -t cpe-asset-warehouse .
```

## 3. Run

คัดลอก `deploy.env.example` เป็น `.env` แล้วกรอกค่าที่มี `CHANGE_ME`

```bash
docker volume create cpe-asset-snapshots
docker run -d --name cpe-asset-warehouse \
  --restart unless-stopped \
  --env-file .env \
  -p 8080:80 \
  -v cpe-asset-snapshots:/var/lib/cpe-warehouse/snapshot-history \
  cpe-asset-warehouse
```

ถ้า MySQL อยู่ใน container บน Docker network เดียวกัน ให้เพิ่ม `--network <ชื่อ network>` และใช้ชื่อ container ของ MySQL เป็น `DB_HOST` กับ `WAREHOUSE_DB_HOST`

ทดสอบที่ `http://localhost:8080/asset-warehouse/`

## ค่าใน `.env`

| ตัวแปร | ต้องตั้ง | ความหมาย |
|---|---|---|
| `BASE_PATH` | ไม่บังคับ | path ที่เว็บเปิดอยู่ เช่น `/asset-warehouse` ว่างไว้ = เปิดที่ `/` |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | ต้องตั้ง | ฐานข้อมูล `cpeasset` |
| `WAREHOUSE_DB_HOST` `WAREHOUSE_DB_PORT` `WAREHOUSE_DB_NAME` `WAREHOUSE_DB_USER` `WAREHOUSE_DB_PASS` | ต้องตั้ง | ฐานข้อมูล `cpe_warehouse` |
| `CPE_TRUST_PROXY_HEADERS` | เมื่ออยู่หลัง proxy | `true` เพื่อให้ปุ่มนำเข้า snapshot ผ่านการตรวจว่าคำขอมาจากหน้าเว็บเดียวกัน |
| `REDIS_ENABLED` `REDIS_HOST` `REDIS_PORT` | ไม่บังคับ | cache ของแดชบอร์ด ไม่มี Redis ก็ทำงานได้ |

ทุกค่าเป็นค่าตอนรัน ไม่มีค่าใดต้องส่งตอน build

## Reverse proxy

ส่งคำขอต่อโดยไม่ตัด base path ออก และส่ง host กับ scheme เดิมไปด้วย ตัวอย่าง nginx:

```nginx
location /asset-warehouse/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 360s;
}
```

การนำเข้า snapshot ใช้เวลาได้ถึง 5 นาที จึงต้องตั้ง timeout ของ proxy ให้ยาวพอ

## สิ่งที่ควรรู้

- ระบบไม่มี login ทุกคนที่เข้าถึงเว็บเห็นข้อมูลทั้งหมด รวมถึงชื่อผู้ยืมผ่าน `assets_api/dw_borrow.php` และกดนำเข้า snapshot ได้
- การนำเข้า snapshot ดึงข้อมูลจาก `https://cpe.eng.kps.ku.ac.th` container ต้องออกอินเทอร์เน็ตได้
- การนำเข้า snapshot อัตโนมัติรายวันเป็น cron บน EC2 เดิม ยังไม่อยู่ใน image นี้ ใช้ปุ่มนำเข้าบนหน้าทะเบียนสินทรัพย์แทน
- ETL (`etl_warehouse.py`) ไม่จำเป็นต่อการรันเว็บ ใช้เมื่อต้องการสร้าง warehouse ใหม่จากต้นทาง มี `docker/etl/Dockerfile` สำหรับงานนี้
- `docker-compose.yml` ใน repo ใช้สำหรับพัฒนาในเครื่องเท่านั้น
