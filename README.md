# CPE Asset Warehouse

ระบบคลังข้อมูลและแดชบอร์ดวิเคราะห์ครุภัณฑ์ ภาควิชาวิศวกรรมคอมพิวเตอร์ คณะวิศวกรรมศาสตร์ กำแพงแสน แสดงทะเบียนสินทรัพย์ การยืม-คืน การแจ้งซ่อมอาคาร และงานซ่อมครุภัณฑ์บนหน้ารวมเดียว

- เว็บ: HTML/JavaScript + PHP 8.3 API บน Apache
- ฐานข้อมูล: MySQL 8.0 จำนวน 2 ฐาน คือ `cpeasset` (ระบบครุภัณฑ์ต้นทาง) และ `cpe_warehouse` (Data Warehouse)
- Cache: Redis (ไม่บังคับ)

## โครงสร้างโปรเจกต์

```text
├── Dockerfile               image สำหรับ production (เว็บ + API)
├── docker/web/              config Apache และ entrypoint ที่ตั้ง BASE_PATH
├── deploy.env.example       ตัวอย่าง env-file
├── index.html, hub-theme.css  หน้ารวม เปิดแต่ละโมดูลใน iframe
├── src/
│   ├── asset-inv/           แดชบอร์ดทะเบียนสินทรัพย์ + ปุ่มนำเข้า snapshot
│   ├── borrow/              แดชบอร์ดการยืม-คืน
│   └── maintenance/         แดชบอร์ดแจ้งซ่อมอาคารและซ่อมครุภัณฑ์
├── assets_api/              PHP API ที่หน้าเว็บเรียก (อ่าน cpe_warehouse) และ API ต้นทางสำหรับ ETL (อ่าน cpeasset)
├── lib/RedisCache.php       cache ของ API
├── data/, mock_api/         ข้อมูลประกอบหน้าเว็บ และข้อมูลจำลองของระบบต้นทาง
├── database/                schema และ migration ของทั้ง 2 ฐาน
├── etl_warehouse.py         ETL จากระบบต้นทาง + Excel ใบแจ้งซ่อม เข้า cpe_warehouse (ดู docs/etl.md)
├── scripts/                 งานนำเข้า snapshot รายวันและงานดูแล snapshot
├── tests/                   เทส PHP / JavaScript / Python
├── docs/                    เอกสารเพิ่มเติม
└── docker-compose.yml       ระบบทั้งสายสำหรับพัฒนาในเครื่องเท่านั้น
```

## Docker

ไม่ใช้ Docker Compose ฐานข้อมูล MySQL อยู่นอก container

### ฐานข้อมูล

นำเข้าไฟล์ dump ที่ส่งให้ ไฟล์นี้สร้างทั้ง 2 ฐานข้อมูลให้เอง แล้วสร้าง user ของเว็บ

```bash
mysql -uroot -p < cpe_asset_warehouse_dump.sql
```

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

ไม่ต้องรัน migration กับฐานข้อมูลจาก dump

### Build และ Run

```bash
docker build -t cpe-asset-warehouse .

cp deploy.env.example .env      # กรอกค่าที่เป็น CHANGE_ME
docker volume create cpe-asset-snapshots
docker run -d --name cpe-asset-warehouse \
  --restart unless-stopped \
  --env-file .env \
  -p 8080:80 \
  -v cpe-asset-snapshots:/var/lib/cpe-warehouse/snapshot-history \
  cpe-asset-warehouse
```

เปิดที่ `http://localhost:8080/asset-warehouse/` ถ้า MySQL อยู่ใน container บน Docker network เดียวกัน ให้เพิ่ม `--network <ชื่อ network>` และใช้ชื่อ container ของ MySQL เป็น host

| | ค่า |
|---|---|
| Port ใน container | 80 |
| Volume | `/var/lib/cpe-warehouse/snapshot-history` ไฟล์ snapshot ที่นำเข้าจากหน้าเว็บ |

### Environment

ทุกค่าเป็นค่าตอนรัน ไม่มีค่าใดต้องส่งตอน build

| ตัวแปร | ความหมาย |
|---|---|
| `BASE_PATH` | path ของเว็บ เช่น `/asset-warehouse` ว่างไว้ = เปิดที่ `/` |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | ฐานข้อมูล `cpeasset` |
| `WAREHOUSE_DB_HOST` `WAREHOUSE_DB_PORT` `WAREHOUSE_DB_NAME` `WAREHOUSE_DB_USER` `WAREHOUSE_DB_PASS` | ฐานข้อมูล `cpe_warehouse` |
| `CPE_TRUST_PROXY_HEADERS` | `true` เมื่ออยู่หลัง reverse proxy ที่ส่ง `X-Forwarded-Host` และ `X-Forwarded-Proto` ปุ่มนำเข้า snapshot ต้องใช้ |
| `REDIS_ENABLED` `REDIS_HOST` `REDIS_PORT` | cache ไม่บังคับ |

### Reverse proxy

ส่งต่อโดยไม่ตัด base path และตั้ง timeout อย่างน้อย 6 นาที เพราะการนำเข้า snapshot ใช้เวลาได้ถึง 5 นาที

```nginx
location /asset-warehouse/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 360s;
}
```

### ข้อควรรู้

- ระบบไม่มี login ทุกคนที่เข้าถึงเว็บเห็นข้อมูลทั้งหมด รวมถึงชื่อผู้ยืม และกดนำเข้า snapshot ได้
- การนำเข้า snapshot ดึงข้อมูลจาก `https://cpe.eng.kps.ku.ac.th` container ต้องออกอินเทอร์เน็ตได้
