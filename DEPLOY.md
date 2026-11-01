# คู่มือติดตั้ง CPE Asset Warehouse

สำหรับผู้ดูแลที่นำระบบไปติดตั้งบน server ทุกบริการรันใน Docker

## สิ่งที่ต้องมี

- Linux server ที่ติดตั้ง Docker Engine และ Docker Compose v2
- RAM อย่างน้อย 2 GB และพื้นที่ดิสก์ว่างอย่างน้อย 5 GB
- อินเทอร์เน็ตสำหรับโหลด image และแพ็กเกจตอนติดตั้ง
- พอร์ต 80 ว่าง หรือเลือกพอร์ตอื่นด้วย `WEB_PORT` ใน `.env`

## ติดตั้ง

รันคำสั่งเหล่านี้ในโฟลเดอร์ที่แตกจาก zip

```bash
cp deploy.env.example .env
sed -i "s/^DB_ROOT_PASSWORD=.*/DB_ROOT_PASSWORD=$(openssl rand -hex 24)/" .env
sed -i "s/^SOURCE_DB_ROOT_PASSWORD=.*/SOURCE_DB_ROOT_PASSWORD=$(openssl rand -hex 24)/" .env
sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$(openssl rand -hex 24)/" .env
chmod 600 .env
docker compose up -d --build
```

ครั้งแรกใช้เวลาหลายนาที ตรวจว่าโหลดข้อมูลเสร็จด้วยคำสั่งนี้ ซึ่งต้องจบที่ `etl exited 0`

```bash
docker compose logs -f etl
```

จากนั้นเปิด `http://<IP ของ server>/`

เก็บไฟล์ `.env` ไว้ รหัสผ่านถูกกำหนดตอนสร้างฐานข้อมูลครั้งแรก การแก้ไฟล์นี้ภายหลังจะไม่เปลี่ยนรหัสผ่านในฐานข้อมูล

## สิ่งที่ต้องรู้ก่อนเปิดใช้งาน

- **ไม่มีระบบ login:** ทุกคนที่เข้าถึงพอร์ตเว็บเห็นข้อมูลทั้งหมดและกดนำเข้า snapshot ได้ รวมถึงชื่อผู้ยืมผ่าน `assets_api/dw_borrow.php` ควรเปิดเฉพาะในเครือข่ายภาควิชาหรือผ่าน VPN
- **ไม่มี HTTPS:** ถ้าเปิดออกอินเทอร์เน็ต ให้ตั้ง reverse proxy ที่มี TLS ไว้ด้านหน้า
- **พอร์ต:** มีเพียงพอร์ตเว็บที่เปิดออกนอก container ฐานข้อมูล Redis และ API ต้นทางเข้าถึงได้จากภายใน Docker เท่านั้น

## ข้อมูลในชุดนี้

| ข้อมูล | ที่มา |
|---|---|
| ทะเบียนครุภัณฑ์ | ข้อมูลจริงจาก `data/assets_real.json` และนำเข้ารอบใหม่จาก API มหาวิทยาลัยได้จากหน้าเว็บ |
| การยืม-คืน งานซ่อมครุภัณฑ์ ราคาซื้อ ผู้ใช้ | ข้อมูลจำลองใน `mock_api/` |
| ใบแจ้งซ่อมอาคาร | ข้อมูลจำลอง ชุดนี้ไม่มีไฟล์ Excel เดิมเพราะมีชื่อและเบอร์โทรผู้แจ้ง |

การนำเข้าจากหน้าเว็บต้องให้ server เข้าถึง `https://cpe.eng.kps.ku.ac.th` ได้

ถ้าต้องการใส่ใบแจ้งซ่อมจริง ให้วางไฟล์ `.xlsx` ใน `data/` แล้วรัน ETL ไฟล์นี้จะไม่ถูกเปิดผ่านเว็บ แต่ผลที่ clean แล้วใน `output/` ยังเป็นข้อมูลบุคคล จึงควรจำกัดสิทธิ์เข้าถึงโฟลเดอร์นี้

```bash
docker compose run --rm etl
```

## งานดูแลประจำ

เครื่องรีบูตแล้วบริการจะกลับมาเอง ไม่ต้องสั่งใหม่

```bash
# ดูสถานะ
docker compose ps

# ดู log ของเว็บ
docker compose logs --tail 100 web

# สำรองฐานข้อมูล (รหัสผ่านอ่านจากตัวแปรใน container)
docker compose exec -T warehouse-db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction cpe_warehouse' | gzip > warehouse-$(date +%F).sql.gz
docker compose exec -T source-db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction cpeasset' | gzip > source-$(date +%F).sql.gz

# สำรองประวัติ snapshot
docker run --rm -v cpe-hub_snapshot_history:/data:ro -v "$PWD":/backup alpine tar -czf /backup/snapshot-history-$(date +%F).tar.gz -C /data .
```

การอัปเดตเวอร์ชัน: แตก zip ใหม่ทับโดยคงไฟล์ `.env` และโฟลเดอร์ `output/` ไว้ แล้วรัน `docker compose up -d --build`

**ห้ามใช้ `docker compose down -v`** เพราะจะลบฐานข้อมูลและประวัติ snapshot ทั้งหมด ใช้ `docker compose down` ถ้าต้องการหยุดระบบ

## แก้ปัญหา

| อาการ | สาเหตุและทางแก้ |
|---|---|
| `ตั้งค่าใน .env` ตอนรัน | ยังไม่ได้สร้าง `.env` หรือรหัสผ่านว่าง ทำตามขั้นตอนติดตั้งใหม่ |
| `no configuration file provided` | ไม่มี `.env` ซึ่งเป็นตัวบอกชื่อไฟล์ compose หรือไม่ได้อยู่ในโฟลเดอร์ที่แตกจาก zip |
| `port is already allocated` | พอร์ตเว็บถูกใช้อยู่ เปลี่ยน `WEB_PORT` ใน `.env` แล้วรัน `docker compose up -d` |
| หน้าเว็บไม่มีข้อมูล | ETL ยังไม่จบหรือล้มเหลว ดู `docker compose logs etl` |
| เข้าเว็บจากเครื่องอื่นไม่ได้ | ตรวจ firewall ของ server หรือ security group ว่าเปิดพอร์ตเว็บแล้ว |
