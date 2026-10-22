"""สร้าง mock API JSON (seeded) สำหรับ endpoint ที่ระบบ CPEAssets ยังไม่มี
อ้างอิง asset_id / department จาก snapshot ของ assets API จริง เพื่อให้ FK เชื่อมกันได้
ช่วงข้อมูล: ปีงบประมาณ 2568-2569 (1 ต.ค. 2567 - 21 ต.ค. 2569)
แจ้งซ่อมทั่วไป (maintenance_general) เริ่มต่อจาก Excel ฉบับสุดท้าย (14 ก.ค. 2569)
usage: python generate_mock.py <assets_snapshot.json> <out_dir>
"""
import json
import os
import random
import sys
from datetime import date, datetime, timedelta

rnd = random.Random(20261021)
assets = json.load(open(sys.argv[1], encoding="utf-8"))
assets = assets["data"] if isinstance(assets, dict) else assets
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
API = "https://cpe.eng.kps.ku.ac.th/CPEAssets/assets_api/"
START = datetime(2024, 10, 1)
NOW = datetime(2026, 10, 21, 9, 0)
GENERAL_START = datetime(2026, 7, 15)


def dump(name, rows, msg):
    body = {"success": True, "message": msg, "total": len(rows), "data": rows,
            "_mock": {"endpoint": f"{API}{name}.php?limit=100&page=1",
                      "note": "MOCK DATA สำหรับทดสอบ ETL เท่านั้น ไม่ใช่ข้อมูลจริง"}}
    with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False, indent=1)


def ts(d):
    return d.strftime("%Y-%m-%d %H:%M:%S") if d else None


def at(d, h, m=0):
    return datetime(d.year, d.month, d.day, h, m)


def workday(d):
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def pick_dt(a, b, month_w=None):
    """สุ่มวันทำการในช่วง a..b (ถ่วงน้ำหนักตามเดือนได้) + เวลา 08:00-16:50"""
    for _ in range(100):
        d = a + timedelta(days=rnd.randint(0, (b - a).days))
        if month_w is None or rnd.random() < month_w[d.month - 1]:
            break
    d = workday(d)
    if d > b:
        d = b
    return d.replace(hour=rnd.randint(8, 16), minute=rnd.choice(range(0, 60, 5)), second=0, microsecond=0)


# ภาคเรียน: ยืมเยอะช่วงเปิดเทอม (ส.ค.-พ.ย., ม.ค.-มี.ค.) น้อยช่วงปิดเทอม
BORROW_W = [1.0, 0.9, 0.8, 0.25, 0.3, 0.5, 0.6, 1.0, 1.0, 0.9, 0.8, 0.4]
# แอร์/ไฟฟ้าเสียบ่อยหน้าร้อน (มี.ค.-พ.ค.)
HOT_W = [0.5, 0.6, 1.0, 1.0, 1.0, 0.7, 0.6, 0.6, 0.6, 0.6, 0.5, 0.5]

# ---------- departments: ข้อมูลจริงจาก assets API ----------
deps = sorted({(a["department_id"], a["department_name"]) for a in assets if a["department_id"]})
# ตามตาราง department (department_id, department_name, shortname, is_deleted, deleted_at); shortname เป็นค่าสมมติ
SHORT = {"สำนักงานเลขานุการคณะ": "สนง.เลขาฯ", "ภาควิชาวิศวกรรมชลประทาน": "IRE", "ภาควิชาวิศวกรรมเกษตร": "AGE",
         "ภาควิชาวิศวกรรมอาหาร": "FE", "ภาควิชาวิศวกรรมโยธา": "CE", "ภาควิชาวิศวกรรมเครื่องกล": "ME",
         "ภาควิชาวิศวกรรมคอมพิวเตอร์": "CPE", "ภาควิชาวิศวกรรมอุตสาหการ": "IE",
         "ศูนย์ปฏิบัติการวิศวกรรมพลังงานและสิ่งแวดล้อม": "ศูนย์พลังงานฯ",
         "ศูนย์ทดสอบประตู หน้าต่าง และระบบผนังกระจกสำหรับงานอาคาร": "ศูนย์ทดสอบประตูฯ",
         "ศูนย์เครื่องจักรกลการเกษตรแห่งชาติ": "ศูนย์เครื่องจักรกลฯ"}
dep_rows = [{"department_id": i, "department_name": n, "shortname": SHORT.get(n), "is_deleted": 0, "deleted_at": None}
            for i, n in deps]
dep_rows.append({"department_id": max(i for i, _ in deps) + 1, "department_name": "หน่วยงานเดิม (ยุบรวมแล้ว)",
                 "shortname": "OLD", "is_deleted": 1, "deleted_at": "2024-01-15 09:00:00"})
dump("departments", dep_rows, "เรียกดูรายการหน่วยงานสำเร็จ")
dep_ids = [i for i, _ in deps]
dep_w = {i: sum(1 for a in assets if a["department_id"] == i) for i in dep_ids}   # สัดส่วนตามจำนวนครุภัณฑ์


def pick_dep():
    return rnd.choices(dep_ids, weights=[dep_w[i] ** 0.5 for i in dep_ids])[0]


# ---------- maintenance_type: ชุดเดียวกับฟอร์ม Excel ----------
MT = ["งานระบบปรับอากาศ", "งานระบบไฟฟ้า/แสงสว่าง", "งานโสตทัศนูปกรณ์", "งานอาคาร/สถานที่", "งานระบบโทรศัพท์",
      "งานระบบเครือข่าย/อินเตอร์เน็ต", "งานประปา", "งานสุขภัณฑ์", "งานคอมพิวเตอร์", "งานกล้องวงจรปิด", "งานอื่นๆ"]
MT_W = [30, 24, 13, 10, 7, 8, 5, 3, 2, 2, 2]          # สัดส่วนใกล้เคียงข้อมูล Excel
dump("maintenance_type", [{"type_id": i + 1, "type_name": n} for i, n in enumerate(MT)], "เรียกดูประเภทงานซ่อมสำเร็จ")

# ---------- asset_types: ค่าจริงจาก assets API (type_id, type_code, type_name) ตามตาราง asset_types ----------
type_rows = {}
for a in assets:
    if a["type_id"] is None:
        continue
    t = type_rows.setdefault(a["type_id"], {"type_id": a["type_id"], "type_code": None, "type_name": a["type_name"],
                                            "description": None, "is_deleted": 0, "deleted_at": None})
    t["type_code"] = t["type_code"] or a["type_code"]
dump("asset_types", sorted(type_rows.values(), key=lambda t: t["type_id"]), "เรียกดูประเภทครุภัณฑ์สำเร็จ")

# ---------- asset_categories: ตามตาราง asset_categories ----------
# category_code = เลข 2 หลักใน type_code (FA05 / FN05 / FT05 -> 05 = ครุภัณฑ์สำนักงาน) ชื่อหมวดเป็นค่าที่ตั้งเองจากชื่อ type
CATEGORIES = {
    "01": ("อาคารถาวร", "Permanent buildings"),
    "03": ("สิ่งก่อสร้าง (คอนกรีตเสริมเหล็ก/โครงสร้างเหล็ก)", "Structures - reinforced concrete or steel"),
    "04": ("สิ่งก่อสร้าง (ไม้/วัสดุอื่น)", "Structures - wood or other materials"),
    "05": ("ครุภัณฑ์สำนักงาน", "Office equipment"),
    "06": ("ครุภัณฑ์ยานพาหนะและขนส่ง", "Vehicles and transport"),
    "07": ("ครุภัณฑ์ไฟฟ้าและวิทยุ", "Electrical and radio equipment"),
    "08": ("ครุภัณฑ์ไฟฟ้า (เครื่องกำเนิดไฟฟ้า)", "Power generators"),
    "09": ("ครุภัณฑ์โฆษณาและเผยแพร่", "Advertising and media equipment"),
    "10": ("ครุภัณฑ์การเกษตร (เครื่องมือและอุปกรณ์)", "Agricultural tools"),
    "11": ("ครุภัณฑ์การเกษตร (เครื่องจักร)", "Agricultural machinery"),
    "12": ("ครุภัณฑ์โรงงาน (เครื่องมือและอุปกรณ์)", "Workshop tools"),
    "13": ("ครุภัณฑ์โรงงาน (เครื่องจักร)", "Workshop machinery"),
    "14": ("ครุภัณฑ์ก่อสร้าง (เครื่องมือและอุปกรณ์)", "Construction tools"),
    "15": ("ครุภัณฑ์ก่อสร้าง (เครื่องจักร)", "Construction machinery"),
    "16": ("ครุภัณฑ์สำรวจ", "Survey equipment"),
    "17": ("ครุภัณฑ์วิทยาศาสตร์หรือการแพทย์", "Scientific and medical equipment"),
    "18": ("ครุภัณฑ์คอมพิวเตอร์", "Computer equipment"),
    "19": ("ครุภัณฑ์การศึกษา", "Educational equipment"),
    "20": ("ครุภัณฑ์งานบ้านงานครัว", "Household and kitchen equipment"),
    "32": ("สินทรัพย์ไม่มีตัวตน (โปรแกรมคอมพิวเตอร์)", "Intangible assets - software"),
}
dump("asset_categories", [{"category_id": i + 1, "category_code": c, "category_name_th": th, "category_name_en": en,
                           "description": None, "status": "active", "created_at": "2024-10-01 09:00:00",
                           "updated_at": "2024-10-01 09:00:00"} for i, (c, (th, en)) in enumerate(CATEGORIES.items())],
     "เรียกดูหมวดหมู่ครุภัณฑ์สำเร็จ")

# ---------- users ----------
roles = ["อาจารย์"] * 15 + ["เจ้าหน้าที่"] * 12 + ["นิสิต"] * 33
users = [{"user_id": i + 1, "fullname": f"ผู้ใช้ตัวอย่าง {i + 1:02d}", "role_status": r,
          "department_id": pick_dep()} for i, r in enumerate(roles)]
dump("users", users, "เรียกดูรายชื่อผู้ใช้สำเร็จ")
U = {u["user_id"]: u for u in users}
teachers = [u["user_id"] for u in users if u["role_status"] == "อาจารย์"]
staff = [u["user_id"] for u in users if u["role_status"] == "เจ้าหน้าที่"]
students = [u["user_id"] for u in users if u["role_status"] == "นิสิต"]

# ---------- locations: ตามโครงสร้างตาราง location (location_name, building, floor, room_detail, remark, is_deleted)
# ค่าที่พิมพ์ไม่เป็นรูปแบบเดียวกัน (ตึก/อาคาร, E8302/ห้อง 8302) เหมือนข้อมูลที่คนกรอกจริง ให้ ETL จัดรูป
loc_ids = sorted({a["location_id"] for a in assets if a["location_id"]})
ROOMS = [
    ("ห้องเรียน 8302", "อาคาร 8", "3", "E8302", None), ("ห้องเรียน 8303", "อาคาร 8", "3", "ห้อง 8303", None),
    ("ห้อง Server คณะ", "อาคาร 8", "3", "ห้อง server", "ห้องควบคุมอุณหภูมิ"),
    ("ห้องปฏิบัติการคอมพิวเตอร์ 1", "อาคาร 8", "3", "8314", None),
    ("สำนักประสานงานโลจิสติกส์", "อาคาร 9", "2", "9204", None),
    ("ห้องงานบริการการศึกษาและพัฒนานิสิต", "ตึก 9", "1", None, None),
    ("สำนักงานเลขานุการคณะ", "อาคาร 9", "3", None, None),
    ("ห้องเรียน 4401", "อาคาร 4", "4", "E4401", None), ("ห้องเรียน 4402", "อาคาร 4", "4", "E4402", None),
    ("ห้องสมุดคณะ", "อาคาร 4", "3", None, None), ("ห้องปฏิบัติการ 4305", "ตึก4", "3", "4305", None),
    ("ห้องพักอาจารย์ภาควิชาวิศวกรรมโยธา", "อาคาร 6", "2", "6218", None),
    ("ห้องประชุมภาควิชาวิศวกรรมโยธา", "อาคาร 6", "2", "E6221", None),
    ("ห้องปฏิบัติการ 7101", "อาคาร 7", "1", "7101", None), ("ห้องปฏิบัติการ 7107", "อาคาร 7", "1", "7107", None),
    ("ห้อง Server อาคาร 1", "อาคาร 1", "2", "ห้อง server", None), ("ห้องเรียน 1214", "อาคาร 1", "2", "1214", None),
    ("ห้องเรียน 9501", "อาคาร 9", "5", "9501", None), ("ห้องเรียน 9502", "อาคาร 9", "5", "E9502", None),
    ("ห้องธุรการภาควิชาวิศวกรรมอุตสาหการ", "อาคาร 9", "2", "E9205", None),
    ("ห้องประชุม 1", "อาคาร 9", "3", None, None), ("ห้องปฏิบัติการ 3104", "อาคาร 3", "1", "3104", None),
    ("ห้องปฏิบัติการ 3201", "อาคาร 3", "2", "3201", None), ("ห้องปฏิบัติการ 5102", "อาคาร 5", "1", "5102", None),
    ("ห้องปฏิบัติการ 5203", "อาคาร 5", "2", "5203", None), ("ห้องเรียน 6301", "อาคาร 6", "3", "6301", None),
    ("ห้องเรียน 2203", "อาคาร 2", "2", "2203", None), ("ห้องปฏิบัติการ 2105", "อาคาร 2", "1", "2105", None),
    ("ห้องประชุมสโมสรนิสิต", "อาคารกิจการนิสิต", "2", "204", None),
]
locs = []
for i, lid in enumerate(loc_ids):
    n, b, f, r, rem = ROOMS[i % len(ROOMS)]
    locs.append({"location_id": lid, "location_name": n, "building": b, "floor": f, "room_detail": r,
                 "remark": rem, "is_deleted": 0, "deleted_at": None})
locs.append({"location_id": max(loc_ids) + 1, "location_name": "ห้องเก็บของเดิม (ยุบแล้ว)", "building": "อาคาร 8",
             "floor": "1", "room_detail": "8105", "remark": "รวมกับห้อง 8107", "is_deleted": 1,
             "deleted_at": "2025-03-01 10:00:00"})
dump("locations", locs, "เรียกดูรายการสถานที่สำเร็จ")

# ---------- maintenance_asset (~2 ปี) ----------
by_id = {a["asset_id"]: a for a in assets}
repairable = [a["asset_id"] for a in assets if a["type_id"] in (2, 3, 4, 9, 10, 12, 13, 15, 116, 125)
              and a["asset_status"] == "พร้อมใช้งาน"]
must = [a["asset_id"] for a in assets if a["asset_status"] in ("ชำรุด", "ส่งซ่อม")]
VENDORS = ["ร้านซ่อมตัวอย่าง A", "บริษัทตัวอย่าง B จำกัด", "ร้านซ่อมตัวอย่าง C", "หจก.ตัวอย่าง D"]
DETAILS = {
    "คอมพิวเตอร์": ["เปิดไม่ติด", "จอภาพไม่แสดงผล", "ฮาร์ดดิสก์เสีย", "พัดลมระบายความร้อนเสีย", "แบตเตอรี่เสื่อม"],
    "ไฟฟ้า": ["ไม่มีไฟเข้าเครื่อง", "ฟิวส์ขาด", "มีเสียงดังผิดปกติ", "สายไฟชำรุด"],
    "โฆษณา": ["โปรเจคเตอร์ภาพไม่ชัด", "หลอดโปรเจคเตอร์ขาด", "ลำโพงไม่มีเสียง"],
    "วิทยาศาสตร์": ["ค่าที่วัดคลาดเคลื่อน", "ต้องสอบเทียบใหม่", "จอแสดงผลเสีย"],
    "": ["ปุ่มกดชำรุด", "ใช้งานได้บางครั้ง", "ชิ้นส่วนแตกหัก", "ล้อ/ขาชำรุด"],
}


def detail_for(aid):
    tn = by_id[aid]["type_name"] or ""
    key = next((k for k in DETAILS if k and k in tn), "")
    return rnd.choice(DETAILS[key])


ma = []
for k in range(190):
    aid = must[k] if k < len(must) else rnd.choice(repairable)
    rep = pick_dt(START, NOW - timedelta(days=1), HOT_W)
    if k < len(must):
        rep = pick_dt(NOW - timedelta(days=25), NOW - timedelta(days=2))
    days = max(1, int(rnd.lognormvariate(2.2, 0.6)))           # ส่วนใหญ่ 5-15 วัน มีหางยาว
    done = rep + timedelta(days=days)
    open_job = k < len(must) or done > NOW
    if open_job:
        status = "ส่งซ่อม" if by_id[aid]["asset_status"] == "ส่งซ่อม" else rnd.choice(["รอดำเนินการ", "กำลังซ่อม"])
        done = None
    else:
        status = rnd.choices(["ซ่อมเสร็จ", "ซ่อมไม่ได้"], weights=[9, 1])[0]
    external = rnd.random() < 0.6 and status != "รอดำเนินการ"
    cost = round(rnd.choice([350, 500, 800, 1200, 1500, 2200, 3500, 4800, 7500]) * 1.0, 2) if external else \
        (0.0 if status in ("ซ่อมเสร็จ", "ซ่อมไม่ได้") else None)
    ex = rnd.choice(teachers)
    approved = external or status in ("ซ่อมเสร็จ", "ซ่อมไม่ได้")
    ma.append({"id": len(ma) + 1, "asset_id": aid, "reporter_name": f"ผู้ใช้ตัวอย่าง {rnd.choice(students + staff):02d}",
               "repair_date": ts(rep), "detail": detail_for(aid), "repair_image": None, "cost": cost,
               "vendor": rnd.choice(VENDORS) if external else None, "status": status,
               "executive_note": "อนุมัติให้ส่งซ่อมภายนอก" if external else None, "executive_by": ex if approved else None,
               "executive_at": ts(rep + timedelta(days=1)) if approved else None,
               "staff_note": None if external else "ซ่อมเองโดยเจ้าหน้าที่", "staff_note_by": rnd.choice(staff),
               "staff_note_at": ts(rep + timedelta(hours=3)), "complete_date": ts(done), "deleted_at": None,
               "deleted_by": None, "updated_by": rnd.choice(staff), "approved_by": ex if approved else None,
               "updated_at": ts(done or rep), "created_at": ts(rep),
               "repair_total_day": (done.date() - rep.date()).days if done else None,
               "parent_maintenance_id": None, "is_followup": 0, "followup_no": 0, "followup_cost": None})

# งานซ่อมซ้ำ: ~12% ของงานที่ซ่อมเสร็จ อาการกลับมาภายใน 10-90 วัน (ซ้ำได้หลายครั้ง)
for parent in [m for m in ma if m["status"] == "ซ่อมเสร็จ"]:
    chain, prev = 0, parent
    while rnd.random() < (0.12 if chain == 0 else 0.3):
        pdone = datetime.strptime(prev["complete_date"], "%Y-%m-%d %H:%M:%S")
        rep = workday(pdone + timedelta(days=rnd.randint(10, 90))).replace(hour=rnd.randint(8, 16))
        if rep >= NOW:
            break
        chain += 1
        days = rnd.randint(1, 10)
        done = rep + timedelta(days=days)
        done = None if done > NOW else done
        child = {**parent, "id": len(ma) + 1, "repair_date": ts(rep), "detail": "อาการเดิมกลับมาอีก",
                 "status": "ซ่อมเสร็จ" if done else "กำลังซ่อม", "cost": None,
                 "followup_cost": round(rnd.choice([0, 0, 200, 350, 500, 900]) * 1.0, 2),
                 "complete_date": ts(done), "repair_total_day": days if done else None,
                 "executive_note": None, "executive_by": None, "executive_at": None,
                 "staff_note": "ติดตามงานซ่อมเดิม", "staff_note_at": ts(rep + timedelta(hours=3)),
                 "parent_maintenance_id": parent["id"], "is_followup": 1, "followup_no": chain,
                 "created_at": ts(rep), "updated_at": ts(done or rep)}
        ma.append(child)
        if not done:
            break
        prev = child
ma.sort(key=lambda m: m["repair_date"])
remap = {m["id"]: i + 1 for i, m in enumerate(ma)}
for m in ma:
    m["id"] = remap[m["id"]]
    if m["parent_maintenance_id"]:
        m["parent_maintenance_id"] = remap[m["parent_maintenance_id"]]
dump("maintenance_asset", ma, "เรียกดูรายการซ่อมครุภัณฑ์สำเร็จ")

# ---------- borrow + borrow_request_items (~2 ปี) ----------
lendable = [a["asset_id"] for a in assets if a["type_id"] in (4, 10, 15, 116, 9) and a["asset_status"] == "พร้อมใช้งาน"]
lendable = rnd.sample(lendable, 120)                      # ชุดครุภัณฑ์ที่เปิดให้ยืม
on_loan = [a["asset_id"] for a in assets if a["asset_status"] == "ถูกยืม"]
busy = {}                                                  # asset_id -> วันที่ว่างอีกครั้ง
plans = [(pick_dt(START, NOW - timedelta(days=12), BORROW_W), False) for _ in range(165)]
plans += [(pick_dt(NOW - timedelta(days=18), NOW - timedelta(days=3)), True) for _ in on_loan]
plans.sort()
borrows, items = [], []
open_assets = list(on_loan)
for created, is_open in plans:
    bid = len(borrows) + 1
    bd = workday(created.date() + timedelta(days=rnd.choice([0, 1, 1, 2])))
    due = bd + timedelta(days=rnd.choice([3, 7, 7, 7, 14, 30]))
    rejected = not is_open and rnd.random() < 0.08
    late = rnd.random() < 0.18
    act = None
    if not is_open and not rejected:
        ret = due + timedelta(days=rnd.randint(1, 8)) if late else due - timedelta(days=rnd.randint(0, min(3, (due - bd).days)))
        act = at(ret, rnd.randint(9, 16), rnd.choice([0, 15, 30, 45]))
    if act and act > NOW:                                  # คืนในอนาคต = ยังไม่คืน
        act, is_open = None, True
    status = "ปฏิเสธ" if rejected else ("คืนแล้ว" if act else "อนุมัติ")
    borrower = rnd.choice(students * 3 + staff + teachers)
    teacher = rnd.choice(teachers)
    approver = None if rejected else (rnd.choice(staff) if rnd.random() < 0.7 else None)   # ว่าง = ใช้ teacher_id
    borrows.append({"id": bid, "user_id": borrower, "teacher_id": teacher, "borrow_date": str(bd), "return_date": str(due),
                    "reason": rnd.choice(["ใช้ในการเรียนการสอน", "ทำโครงงาน", "ใช้ในงานกิจกรรม", "ใช้ในงานวิจัย"]),
                    "status": status, "created_at": ts(created), "return_by": rnd.choice(staff) if act else None,
                    "actual_return_date": ts(act),
                    "return_condition": rnd.choices(["ปกติ", "ชำรุด"], weights=[12, 1])[0] if act else None,
                    "return_note": None, "deleted_at": None, "phone": None,
                    "department_id": U[borrower]["department_id"], "deleted_by": None, "updated_by": None,
                    "is_overdue": int(act.date() > due) if act else None, "approved_by": approver,
                    "updated_at": ts(act or created)})
    if is_open and open_assets:
        picks = [open_assets.pop(0)]
    else:
        free = [a for a in lendable if busy.get(a, date.min) <= bd]
        picks = rnd.sample(free, min(len(free), rnd.choices([1, 2, 3, 4], weights=[6, 3, 1, 1])[0]))
    for aid in picks:
        replaced = act is not None and rnd.random() < 0.06
        rep_id = rnd.choice([a for a in lendable if a not in picks]) if replaced else None
        for a in [aid] + ([rep_id] if rep_id else []):
            busy[a] = (act.date() if act else due) + timedelta(days=1)
        items.append({"id": len(items) + 1, "request_id": bid, "asset_id": aid,
                      "item_status": "ไม่อนุมัติ" if rejected else "อนุมัติ", "replace_asset_id": rep_id,
                      "staff_note": "เครื่องเดิมไม่พร้อมใช้ เปลี่ยนเครื่องทดแทน" if replaced else None,
                      "checked_by": rnd.choice(staff), "checked_at": ts(at(bd, 9, 30)),
                      "return_status": "คืนแล้ว" if act else "รอตรวจคืน", "return_note": None,
                      "returned_by": borrows[-1]["return_by"], "returned_at": ts(act), "deleted_at": None,
                      "deleted_by": None})
dump("borrow", borrows, "เรียกดูรายการยืมสำเร็จ")
dump("borrow_request_items", items, "เรียกดูรายการครุภัณฑ์ในใบยืมสำเร็จ")

# ---------- maintenance_general (ระบบใหม่ ต่อจาก Excel ที่จบ 14 ก.ค. 2569) ----------
PLACES = ["E9203", "อาคาร 8 ชั้น 3 ห้อง server", "ห้องงานบริการการศึกษาและพัฒนานิสิต", "อาคาร4 ชั้น4 ห้อง4401",
          "อาคาร 9 ชั้น 2 ห้องน้ำชาย", "ตึก 6 ห้อง E6218", "อาคารกิจการนิสิต ชั้น 2", "ห้อง 9501", "แอร์ไม่เย็น",
          "อาคาร 7 ชั้น 1 ห้อง 7101", "สำนักงานเลขานุการ", "อาคาร 8 ชั้น 3 ห้องเรียน E8302", "ห้อง 4305",
          "อาคาร 9 ชั้น 1 ห้องน้ำหญิง", "E8303", "อาคาร 6 ชั้น 2 ห้อง 6221", "ห้องสมุดคณะ อาคาร 4 ชั้น 3"]
GDET = {1: ["แอร์ไม่เย็น", "แอร์มีน้ำหยด", "แอร์มีเสียงดัง"], 2: ["หลอดไฟเสีย", "ปลั๊กไฟใช้ไม่ได้", "ไฟกระพริบ"],
        3: ["โปรเจคเตอร์ไม่แสดงภาพ", "ไมโครโฟนไม่มีเสียง"], 4: ["ประตูปิดไม่สนิท", "ฝ้าเพดานรั่ว"],
        5: ["โทรศัพท์ภายในโทรออกไม่ได้"], 6: ["อินเทอร์เน็ตใช้งานไม่ได้", "Wi-Fi สัญญาณอ่อน"],
        7: ["ก๊อกน้ำรั่ว", "ท่อน้ำอุดตัน"], 8: ["ชักโครกกดไม่ลง", "สายฉีดชำระรั่ว"], 9: ["คอมพิวเตอร์เปิดไม่ติด"],
        10: ["กล้องวงจรปิดภาพไม่ขึ้น"], 11: ["เครื่องสแกนนิ้วไม่ทำงาน"]}
mg = []
for _ in range(13):                       # ~4 งาน/เดือน ใกล้อัตราจริงของ Excel ปีงบ 2568-2569
    rep = pick_dt(GENERAL_START, NOW - timedelta(hours=2))
    t = rnd.choices(range(1, 12), weights=MT_W)[0]
    age = (NOW - rep).days
    st = "รอตรวจสอบ" if age < 3 else rnd.choices(["กำลังดำเนินการ", "เสร็จสิ้น"], weights=[1, 6 if age > 14 else 2])[0]
    done = rep + timedelta(hours=max(1, int(rnd.lognormvariate(3.3, 0.9)))) if st == "เสร็จสิ้น" else None
    if done and done > NOW:
        done, st = None, "กำลังดำเนินการ"
    mg.append({"id": 0, "department_id": pick_dep(), "reporter_status": rnd.choices(["อาจารย์", "เจ้าหน้าที่", "นิสิต"], weights=[3, 5, 2])[0],
               "maintenance_type_id": t, "problem_location": rnd.choice(PLACES), "problem_detail": rnd.choice(GDET[t]),
               "reported_at": ts(rep), "additional_detail": rnd.choice([None, None, None, "-", "ช่วยด่วนค่ะ มีสอนพรุ่งนี้"]),
               "status": st, "staff_id": rnd.choice(staff) if st != "รอตรวจสอบ" else None,
               "completed_at": ts(done), "created_at": ts(rep), "updated_at": ts(done or rep)})
mg.sort(key=lambda g: g["reported_at"])
for i, g in enumerate(mg):
    g["id"] = i + 1
dump("maintenance_general", mg, "เรียกดูรายการแจ้งซ่อมทั่วไปสำเร็จ")

print({"asset_types": len(type_rows), "asset_categories": len(CATEGORIES), "departments": len(deps), "users": len(users), "locations": len(locs), "maintenance_asset": len(ma),
       "followups": sum(m["is_followup"] for m in ma), "borrow": len(borrows), "borrow_request_items": len(items),
       "maintenance_general": len(mg)})
