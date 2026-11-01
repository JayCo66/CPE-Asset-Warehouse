# รันหน้ารวมด้วย Docker

ต้องมี Docker Desktop หรือ Docker Engine พร้อม Compose

```bash
docker compose up -d --build
```

รอ ETL ทำงานจบประมาณ 1-2 นาที แล้วเปิด <http://localhost:8090/>

| พอร์ต | บริการ |
|---|---|
| 8090 | หน้ารวมและ API |
| 8088 | หน้า dashboard รายปี |
| 8089 | API ต้นทาง |
| 3307 / 3308 | MySQL ของ warehouse / ต้นทาง |

เปลี่ยนรหัสผ่านและพอร์ตได้โดยสร้างไฟล์ `.env` ก่อนรัน ค่าที่ใช้ได้ดูใน `docker-compose.yml` และ `.env.example`

## ข้อมูล

ชุดนี้มีทะเบียนครุภัณฑ์จาก `data/assets_real.json` ส่วนการยืม-คืน งานซ่อม และผู้ใช้เป็นข้อมูลจำลองใน `mock_api/`

ไม่มี Excel ใบแจ้งซ่อมเดิมและ `output/` เพราะมีข้อมูลบุคคล หน้าแจ้งซ่อมอาคารจึงแสดงเฉพาะข้อมูลจำลอง ถ้าต้องการข้อมูลจริง ให้วางไฟล์ `.xlsx` ไว้ใน `data/` แล้วรัน ETL ใหม่

```bash
docker compose run --rm etl
```
