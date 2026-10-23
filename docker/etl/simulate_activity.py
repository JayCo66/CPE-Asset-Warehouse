"""จำลองการใช้งานระบบครุภัณฑ์ 1 วัน ลงฐานข้อมูลต้นทาง (source-db) ขณะที่ระบบยังรันอยู่
ใช้ทดสอบว่าข้อมูลใหม่ไหลผ่าน source-api -> ETL -> warehouse -> หน้าเว็บ
รัน: docker compose run --rm source-seed python docker/etl/simulate_activity.py
ข้อมูลที่เพิ่มเป็นข้อมูลจำลองทั้งหมด (ผู้ใช้ / งานซ่อม / ใบยืม) ยกเว้นครุภัณฑ์เดิมที่ถูกอ้างถึง
"""
import os
from datetime import datetime, timedelta, timezone

import pymysql

NOW = datetime.now(timezone(timedelta(hours=7))).replace(tzinfo=None, microsecond=0)   # เวลาไทย
FY = NOW.year + 543 + (1 if NOW.month >= 10 else 0)
YY = str(FY)[2:]


def main():
    conn = pymysql.connect(host=os.getenv("DB_HOST", "source-db"), port=int(os.getenv("DB_PORT", "3306")),
                           user=os.getenv("DB_USER", "root"), password=os.getenv("DB_PASS", "root"),
                           database=os.getenv("DB_NAME", "cpeasset"), charset="utf8mb4", autocommit=False)
    cur = conn.cursor()
    q = lambda sql, *a: (cur.execute(sql, a), cur.fetchall())[1]
    log = []

    teachers = [r[0] for r in q("SELECT user_id FROM users WHERE role_status = 'อาจารย์' ORDER BY user_id")]
    staff = [r[0] for r in q("SELECT user_id FROM users WHERE role_status = 'เจ้าหน้าที่' ORDER BY user_id")]
    students = [r[0] for r in q("SELECT user_id FROM users WHERE role_status = 'นิสิต' ORDER BY user_id")]
    run_no = q("SELECT COUNT(*) FROM asset WHERE asset_code LIKE %s", f"SIM-%")[0][0] // 12 + 1

    # 1) ครุภัณฑ์จัดซื้อใหม่ปีงบปัจจุบัน 12 ชิ้น
    new_assets = []
    for i in range(12):
        is_pc = i < 6
        code = f"SIM-K0505-{'FA18' if is_pc else 'FA05'}-{run_no:02d}{i + 1:04d}/{i + 1:03d}-{YY}"
        cur.execute("""INSERT INTO asset (asset_code, asset_name, type_id, type_code, brand, year_purchase, source,
                                          asset_status, location_id, department_id, create_date, update_date, is_deleted)
                       VALUES (%s, %s, %s, %s, %s, %s, 'เงินรายได้', 'พร้อมใช้งาน', %s, 7, %s, %s, 0)""",
                    (code, "เครื่องคอมพิวเตอร์ห้องปฏิบัติการ (จำลอง)" if is_pc else "โต๊ะปฏิบัติการ (จำลอง)",
                     10 if is_pc else 2, "FA18" if is_pc else "FA05", "Sample" if is_pc else None, str(NOW.year),
                     1 if is_pc else 4, NOW, NOW))
        new_assets.append(cur.lastrowid)
    log.append(f"ครุภัณฑ์ใหม่ปีงบ {FY}: {len(new_assets)} ชิ้น (asset_id {new_assets[0]}-{new_assets[-1]})")

    # 2) ตรวจนับครุภัณฑ์ภาควิชาคอมพิวเตอร์: ระบุสถานที่ให้ 60 ชิ้นที่ยังไม่มี
    n = cur.execute("""UPDATE asset SET location_id = ELT(1 + MOD(asset_id, 3), 1, 2, 4), update_date = %s
                       WHERE department_id = 7 AND location_id IS NULL AND (is_deleted IS NULL OR is_deleted = 0)
                       ORDER BY asset_id LIMIT 60""", (NOW,))
    log.append(f"ระบุสถานที่เพิ่ม: {n} ชิ้น")

    # 3) งานซ่อมครุภัณฑ์: แจ้งใหม่ 3 งาน (ครุภัณฑ์เปลี่ยนเป็นส่งซ่อม) + ปิดงานค้าง 1 งาน
    pcs = [r[0] for r in q("""SELECT asset_id FROM asset WHERE type_id = 10 AND asset_status = 'พร้อมใช้งาน'
                              AND asset_code NOT LIKE 'SIM-%%' ORDER BY asset_id DESC LIMIT 3""")]
    for k, aid in enumerate(pcs):
        cur.execute("""INSERT INTO maintenance_asset (asset_id, reporter_name, repair_date, detail, status, created_at,
                                                      updated_at, is_followup, followup_no)
                       VALUES (%s, %s, %s, %s, 'รอดำเนินการ', %s, %s, 0, 0)""",
                    (aid, f"ผู้ใช้ตัวอย่าง {staff[k % len(staff)]:02d}", NOW - timedelta(hours=k + 1),
                     ["เปิดไม่ติด", "จอภาพไม่แสดงผล", "เสียงพัดลมดังผิดปกติ"][k], NOW, NOW))
        cur.execute("UPDATE asset SET asset_status = 'ส่งซ่อม', update_date = %s WHERE asset_id = %s", (NOW, aid))
    log.append(f"แจ้งซ่อมครุภัณฑ์ใหม่: {len(pcs)} งาน")
    open_job = q("""SELECT id, asset_id, repair_date FROM maintenance_asset WHERE complete_date IS NULL AND deleted_at IS NULL
                    AND repair_date < %s ORDER BY repair_date LIMIT 1""", NOW - timedelta(days=1))
    if open_job:
        mid, aid, rep = open_job[0]
        cur.execute("""UPDATE maintenance_asset SET status = 'ซ่อมเสร็จ', complete_date = %s, repair_total_day = %s,
                       cost = COALESCE(cost, 1500), vendor = COALESCE(vendor, 'ร้านซ่อมตัวอย่าง A'), approved_by = %s,
                       updated_at = %s WHERE id = %s""", (NOW, (NOW.date() - rep.date()).days, teachers[0], NOW, mid))
        cur.execute("UPDATE asset SET asset_status = 'พร้อมใช้งาน', update_date = %s WHERE asset_id = %s", (NOW, aid))
        log.append(f"ปิดงานซ่อมค้าง: id {mid}")

    # 4) ยืม-คืน: ใบยืมใหม่ 2 ใบ (3 ชิ้น) + คืนของที่ค้างอยู่ 1 ใบ
    lendable = [r[0] for r in q("""SELECT asset_id FROM asset WHERE type_id IN (4, 10) AND asset_status = 'พร้อมใช้งาน'
                                  AND asset_code NOT LIKE 'SIM-%%' ORDER BY asset_id LIMIT 3""")]
    for b, items in enumerate([lendable[:2], lendable[2:3]]):
        cur.execute("""INSERT INTO borrow (user_id, teacher_id, borrow_date, return_date, reason, status, created_at,
                                           department_id, approved_by, updated_at)
                       VALUES (%s, %s, %s, %s, 'ทำโครงงาน', 'อนุมัติ', %s, 7, %s, %s)""",
                    (students[b], teachers[b], NOW.date(), NOW.date() + timedelta(days=7), NOW, staff[0], NOW))
        bid = cur.lastrowid
        for aid in items:
            cur.execute("""INSERT INTO borrow_request_items (request_id, asset_id, item_status, checked_by, checked_at)
                           VALUES (%s, %s, 'อนุมัติ', %s, %s)""", (bid, aid, staff[1], NOW))
            cur.execute("UPDATE asset SET asset_status = 'ถูกยืม', update_date = %s WHERE asset_id = %s", (NOW, aid))
    log.append(f"ใบยืมใหม่: 2 ใบ {len(lendable)} ชิ้น")
    loan = q("""SELECT id FROM borrow WHERE actual_return_date IS NULL AND status = 'อนุมัติ' AND borrow_date < %s
                ORDER BY borrow_date LIMIT 1""", NOW.date())
    if loan:
        bid = loan[0][0]
        late = q("SELECT return_date < %s FROM borrow WHERE id = %s", NOW.date(), bid)[0][0]
        cur.execute("""UPDATE borrow SET status = 'คืนแล้ว', actual_return_date = %s, return_condition = 'ปกติ',
                       return_by = %s, is_overdue = %s, updated_at = %s WHERE id = %s""", (NOW, staff[2], late, NOW, bid))
        for (aid,) in q("SELECT asset_id FROM borrow_request_items WHERE request_id = %s", bid):
            cur.execute("UPDATE asset SET asset_status = 'พร้อมใช้งาน', update_date = %s WHERE asset_id = %s", (NOW, aid))
        cur.execute("""UPDATE borrow_request_items SET return_status = 'คืนแล้ว', returned_by = %s, returned_at = %s
                       WHERE request_id = %s""", (staff[2], NOW, bid))
        log.append(f"คืนของ: ใบยืม id {bid}{' (คืนช้า)' if late else ''}")

    # 5) แจ้งซ่อมอาคาร: ใหม่ 4 งาน + ปิดงานที่กำลังดำเนินการ 1 งาน
    tickets = [(1, "อาคาร 8 ชั้น 3 ห้องเรียน E8302", "แอร์ไม่เย็น"), (2, "ห้อง 9204", "หลอดไฟเสีย 2 ดวง"),
               (6, "E8303", "Wi-Fi สัญญาณอ่อน"), (8, "อาคาร 9 ชั้น 2 ห้องน้ำชาย", "ชักโครกกดไม่ลง")]
    for k, (tid, place, detail) in enumerate(tickets):
        cur.execute("""INSERT INTO maintenance_general (department_id, reporter_status, maintenance_type_id, problem_location,
                                                        problem_detail, reported_at, status, created_at, updated_at)
                       VALUES (%s, %s, %s, %s, %s, %s, 'รอตรวจสอบ', %s, %s)""",
                    (7, ["อาจารย์", "เจ้าหน้าที่", "นิสิต", "เจ้าหน้าที่"][k], tid, place, detail,
                     NOW - timedelta(hours=4 - k), NOW, NOW))
    log.append(f"แจ้งซ่อมอาคารใหม่: {len(tickets)} งาน")
    job = q("SELECT id FROM maintenance_general WHERE status = 'กำลังดำเนินการ' ORDER BY reported_at LIMIT 1")
    if job:
        cur.execute("""UPDATE maintenance_general SET status = 'เสร็จสิ้น', completed_at = %s, staff_id = COALESCE(staff_id, %s),
                       updated_at = %s WHERE id = %s""", (NOW, staff[0], NOW, job[0][0]))
        log.append(f"ปิดงานแจ้งซ่อมอาคาร: id {job[0][0]}")

    conn.commit()
    conn.close()
    print(f"[simulate] {NOW:%Y-%m-%d %H:%M} (ปีงบ {FY})")
    for line in log:
        print("  -", line)


if __name__ == "__main__":
    main()
