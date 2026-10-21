-- ==========================================
-- DIMENSION TABLES (ตารางมิติข้อมูล)
-- ==========================================

CREATE TABLE `dim_date` (
  `date_key` INT PRIMARY KEY COMMENT 'รหัสวันที่รูปแบบ YYYYMMDD เช่น 20261021',
  `full_date` DATE COMMENT 'วันที่แบบเต็ม',
  `day_of_week` VARCHAR(20) COMMENT 'วันในสัปดาห์ (จันทร์-อาทิตย์)',
  `month` INT COMMENT 'เลขเดือน (1-12)',
  `month_name` VARCHAR(50) COMMENT 'ชื่อเดือน',
  `quarter` INT COMMENT 'ไตรมาส (1-4)',
  `year` INT COMMENT 'ปี ค.ศ.',
  `fiscal_year` INT COMMENT 'ปีงบประมาณ'
);

CREATE TABLE `dim_department` (
  `department_key` INT AUTO_INCREMENT PRIMARY KEY,
  `department_id` INT COMMENT 'Original ID จากตาราง departments',
  `department_name` VARCHAR(255)
);

CREATE TABLE `dim_user` (
  `user_key` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT COMMENT 'Original ID จากตาราง users',
  `fullname` VARCHAR(255),
  `role_status` VARCHAR(100) COMMENT 'เช่น นักศึกษา, อาจารย์, เจ้าหน้าที่'
);

CREATE TABLE `dim_maintenance_type` (
  `maintenance_type_key` INT AUTO_INCREMENT PRIMARY KEY,
  `type_id` INT COMMENT 'Original ID จากตาราง maintenance_type',
  `type_name` VARCHAR(255)
);

CREATE TABLE `dim_asset_category` (
  `category_key` INT AUTO_INCREMENT PRIMARY KEY,
  `category_id` INT,
  `category_name` VARCHAR(255) COMMENT 'หมวดหมู่ครุภัณฑ์'
);

CREATE TABLE `dim_asset_type` (
  `type_key` INT AUTO_INCREMENT PRIMARY KEY,
  `type_id` INT,
  `type_code` VARCHAR(10),
  `type_name` VARCHAR(255) COMMENT 'ประเภทครุภัณฑ์'
);

CREATE TABLE `dim_location` (
  `location_key` INT AUTO_INCREMENT PRIMARY KEY,
  `building` VARCHAR(100) COMMENT 'อาคาร (เช่น อาคาร 9, อาคาร 8)',
  `floor` VARCHAR(50) COMMENT 'ชั้น (เช่น 1, 2, 3)',
  `room` VARCHAR(100) COMMENT 'ห้อง (เช่น 8303, 9204)',
  `area_name` VARCHAR(255) COMMENT 'ชื่อพื้นที่ (เช่น ห้องประชุม 1, สำนักงานเลขานุการ)'
);

CREATE TABLE `dim_asset` (
  `asset_key` INT AUTO_INCREMENT PRIMARY KEY,
  `asset_id` INT COMMENT 'Original ID จากตาราง asset',
  `asset_code` VARCHAR(50),
  `asset_name` VARCHAR(200),
  `brand` VARCHAR(100),
  `model` VARCHAR(100),
  `purchase_price` DECIMAL(12,2),
  `year_purchase` VARCHAR(10),
  `year_fiscal` VARCHAR(10),
  `source` VARCHAR(255),
  `asset_status` VARCHAR(50),
  `category_key` INT,
  `type_key` INT,
  `location_key` INT
);

-- ==========================================
-- FACT TABLES (ตารางข้อเท็จจริงและตัวชี้วัด)
-- ==========================================

CREATE TABLE `fact_borrow_transaction` (
  `borrow_fact_id` INT AUTO_INCREMENT PRIMARY KEY,
  `borrow_date_key` INT COMMENT 'FK เชื่อมวันที่ยืม',
  `return_date_key` INT COMMENT 'FK เชื่อมวันที่กำหนดคืน',
  `actual_return_date_key` INT COMMENT 'FK เชื่อมวันที่คืนจริง',
  `asset_key` INT COMMENT 'FK เชื่อมครุภัณฑ์ที่ถูกยืม',
  `borrower_user_key` INT COMMENT 'FK เชื่อมผู้ยืม',
  `approver_user_key` INT COMMENT 'FK เชื่อมอาจารย์/ผู้อนุมัติ',
  `department_key` INT COMMENT 'FK เชื่อมหน่วยงานของผู้ยืม',
  `borrow_request_id` INT COMMENT 'รหัสใบคำขอยืมเดิม',
  `item_status` VARCHAR(50),
  `return_condition` VARCHAR(100) COMMENT 'สภาพตอนคืน เช่น ปกติ, ชำรุด',
  `borrow_item_count` INT DEFAULT 1 COMMENT 'จำนวนชิ้น (ใช้ SUM นับยอดการยืม)',
  `borrow_duration_days` INT COMMENT 'จำนวนวันที่ยืมใช้งานจริง',
  `overdue_days` INT COMMENT 'จำนวนวันที่เกินกำหนดส่งคืน',
  `is_overdue_flag` TINYINT(1) COMMENT '1 = คืนล่าช้า, 0 = ปกติ',
  `is_replaced_flag` TINYINT(1) COMMENT '1 = มีการเปลี่ยนเครื่องทดแทน, 0 = ไม่เปลี่ยน'
);

CREATE TABLE `fact_asset_maintenance` (
  `maint_asset_fact_id` INT AUTO_INCREMENT PRIMARY KEY,
  `repair_date_key` INT COMMENT 'FK เชื่อมวันที่แจ้งซ่อม',
  `complete_date_key` INT COMMENT 'FK เชื่อมวันที่ซ่อมเสร็จ',
  `asset_key` INT COMMENT 'FK เชื่อมครุภัณฑ์ที่ซ่อม',
  `department_key` INT COMMENT 'FK เชื่อมหน่วยงานเจ้าของครุภัณฑ์',
  `approved_by_user_key` INT COMMENT 'FK เชื่อมผู้บริหารที่อนุมัติ',
  `vendor_name` VARCHAR(150) COMMENT 'ร้านค้า/บริษัทที่รับซ่อม',
  `repair_status` VARCHAR(50),
  `maintenance_count` INT DEFAULT 1 COMMENT 'จำนวนครั้งที่ซ่อม',
  `repair_cost` DECIMAL(10,2) COMMENT 'ค่าใช้จ่ายหลักในการซ่อม',
  `followup_cost` DECIMAL(10,2) COMMENT 'ค่าใช้จ่ายเพิ่มเติมในการติดตามงาน',
  `total_repair_cost` DECIMAL(10,2) COMMENT 'ค่าใช้จ่ายรวม (cost + followup_cost)',
  `repair_total_days` INT COMMENT 'จำนวนวันที่ใช้ซ่อม',
  `is_followup_flag` TINYINT(1) COMMENT '1 = เป็นงานซ่อมซ้ำ/ติดตามผล, 0 = ปกติ',
  `followup_no` INT COMMENT 'ลำดับครั้งของการซ่อมซ้ำ'
);

CREATE TABLE `fact_general_maintenance` (
  `maint_gen_fact_id` INT AUTO_INCREMENT PRIMARY KEY,
  `reported_date_key` INT COMMENT 'FK เชื่อมวันที่แจ้งปัญหา',
  `completed_date_key` INT COMMENT 'FK เชื่อมวันที่แก้ไขเสร็จ',
  `department_key` INT COMMENT 'FK เชื่อมสังกัดผู้แจ้ง',
  `maintenance_type_key` INT COMMENT 'FK เชื่อมประเภทงานซ่อม',
  `location_key` INT COMMENT 'FK เชื่อมสถานที่เกิดปัญหา',
  `staff_user_key` INT COMMENT 'FK เชื่อมเจ้าหน้าที่ผู้รับผิดชอบ',
  `reporter_status` VARCHAR(100) COMMENT 'สถานภาพผู้แจ้ง (อาจารย์, เจ้าหน้าที่)',
  `job_status` VARCHAR(50),
  `incident_count` INT DEFAULT 1 COMMENT 'จำนวนรายการแจ้งซ่อม',
  `resolution_hours` DECIMAL(10,2) COMMENT 'ระยะเวลาที่ใช้แก้ไขปัญหา (ชั่วโมง)',
  `resolution_days` INT COMMENT 'ระยะเวลาที่ใช้แก้ไขปัญหา (วัน)'
);

-- ==========================================
-- RELATIONSHIPS (การสร้าง Foreign Keys)
-- ==========================================

-- Snowflake Sub-Dimensions ของ Asset
ALTER TABLE `dim_asset` ADD FOREIGN KEY (`category_key`) REFERENCES `dim_asset_category` (`category_key`);
ALTER TABLE `dim_asset` ADD FOREIGN KEY (`type_key`) REFERENCES `dim_asset_type` (`type_key`);
ALTER TABLE `dim_asset` ADD FOREIGN KEY (`location_key`) REFERENCES `dim_location` (`location_key`);

-- Links สำหรับ Fact Borrow
ALTER TABLE `fact_borrow_transaction` ADD FOREIGN KEY (`borrow_date_key`) REFERENCES `dim_date` (`date_key`);
ALTER TABLE `fact_borrow_transaction` ADD FOREIGN KEY (`return_date_key`) REFERENCES `dim_date` (`date_key`);
ALTER TABLE `fact_borrow_transaction` ADD FOREIGN KEY (`actual_return_date_key`) REFERENCES `dim_date` (`date_key`);
ALTER TABLE `fact_borrow_transaction` ADD FOREIGN KEY (`asset_key`) REFERENCES `dim_asset` (`asset_key`);
ALTER TABLE `fact_borrow_transaction` ADD FOREIGN KEY (`borrower_user_key`) REFERENCES `dim_user` (`user_key`);
ALTER TABLE `fact_borrow_transaction` ADD FOREIGN KEY (`approver_user_key`) REFERENCES `dim_user` (`user_key`);
ALTER TABLE `fact_borrow_transaction` ADD FOREIGN KEY (`department_key`) REFERENCES `dim_department` (`department_key`);

-- Links สำหรับ Fact Asset Maintenance
ALTER TABLE `fact_asset_maintenance` ADD FOREIGN KEY (`repair_date_key`) REFERENCES `dim_date` (`date_key`);
ALTER TABLE `fact_asset_maintenance` ADD FOREIGN KEY (`complete_date_key`) REFERENCES `dim_date` (`date_key`);
ALTER TABLE `fact_asset_maintenance` ADD FOREIGN KEY (`asset_key`) REFERENCES `dim_asset` (`asset_key`);
ALTER TABLE `fact_asset_maintenance` ADD FOREIGN KEY (`department_key`) REFERENCES `dim_department` (`department_key`);
ALTER TABLE `fact_asset_maintenance` ADD FOREIGN KEY (`approved_by_user_key`) REFERENCES `dim_user` (`user_key`);

-- Links สำหรับ Fact General Maintenance
ALTER TABLE `fact_general_maintenance` ADD FOREIGN KEY (`reported_date_key`) REFERENCES `dim_date` (`date_key`);
ALTER TABLE `fact_general_maintenance` ADD FOREIGN KEY (`completed_date_key`) REFERENCES `dim_date` (`date_key`);
ALTER TABLE `fact_general_maintenance` ADD FOREIGN KEY (`department_key`) REFERENCES `dim_department` (`department_key`);
ALTER TABLE `fact_general_maintenance` ADD FOREIGN KEY (`maintenance_type_key`) REFERENCES `dim_maintenance_type` (`maintenance_type_key`);
ALTER TABLE `fact_general_maintenance` ADD FOREIGN KEY (`location_key`) REFERENCES `dim_location` (`location_key`);
ALTER TABLE `fact_general_maintenance` ADD FOREIGN KEY (`staff_user_key`) REFERENCES `dim_user` (`user_key`);