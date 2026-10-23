-- คอลัมน์ที่ assets_api (departments.php, users.php) และ warehouse ต้องใช้ แต่ยังไม่มีใน "DB warehouse project schema.sql"
-- ใช้กับฐานข้อมูลต้นทางที่รันใน Docker เท่านั้น ระบบจริงต้องให้ทีมเพิ่มคอลัมน์เหล่านี้เอง
ALTER TABLE `departments`
  ADD COLUMN `shortname` varchar(50) DEFAULT NULL,
  ADD COLUMN `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN `deleted_at` datetime DEFAULT NULL;

ALTER TABLE `users`
  ADD COLUMN `role_status` varchar(100) DEFAULT NULL COMMENT 'อาจารย์ / เจ้าหน้าที่ / นิสิต (dim_user.role_status)',
  ADD COLUMN `department_id` int DEFAULT NULL,
  ADD FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`);
