CREATE TABLE `asset` (
  `asset_id` INT AUTO_INCREMENT PRIMARY KEY,
  `asset_code` varchar(50) UNIQUE,
  `asset_name` varchar(200),
  `type_id` int,
  `type_code` varchar(10),
  `category_id` int,
  `brand` varchar(100),
  `model` varchar(100),
  `asset_function` varchar(255),
  `short_spec` text,
  `detailed_spec` text,
  `serial_number` varchar(100),
  `purchase_date` date,
  `warranty_expire` date,
  `year_purchase` varchar(10),
  `year_fiscal` varchar(10),
  `source` varchar(255),
  `asset_status` varchar(50) COMMENT 'เปลี่ยนจาก enum เป็น varchar เพื่อรองรับสถานะที่ยืดหยุ่น',
  `location_id` int,
  `department_id` int,
  `note` text,
  `thumnail` varchar(255),
  `url_qrcode` varchar(255),
  `qr_images` varchar(255),
  `group_id` int,
  `permission_id` int,
  `create_date` timestamp NULL DEFAULT NULL,
  `update_date` timestamp NULL DEFAULT NULL,
  `deleted_at` datetime,
  `deleted_by` int,
  `updated_by` int,
  `qr_code` varchar(255),
  `updated_at` datetime,
  `is_deleted` tinyint(1)
);

CREATE TABLE `maintenance_asset` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `asset_id` int,
  `reporter_name` varchar(255),
  `repair_date` datetime,
  `detail` text,
  `repair_image` varchar(255),
  `cost` decimal(10,2),
  `vendor` varchar(150),
  `status` varchar(50),
  `executive_note` text,
  `executive_by` int,
  `executive_at` datetime,
  `staff_note` text,
  `staff_note_by` int,
  `staff_note_at` datetime,
  `complete_date` datetime,
  `deleted_at` datetime,
  `deleted_by` int,
  `updated_by` int,
  `approved_by` int,
  `updated_at` datetime,
  `created_at` datetime,
  `repair_total_day` int,
  `parent_maintenance_id` int,
  `is_followup` tinyint(1),
  `followup_no` int,
  `followup_cost` decimal(10,2)
);

CREATE TABLE `maintenance_general` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `department_id` int,
  `reporter_status` varchar(100),
  `maintenance_type_id` int,
  `problem_location` varchar(255),
  `problem_detail` text,
  `reported_at` datetime,
  `additional_detail` text,
  `status` varchar(50) DEFAULT 'รอตรวจสอบ',
  `staff_id` int,
  `completed_at` datetime,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
);

CREATE TABLE `borrow` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` int,
  `teacher_id` int,
  `borrow_date` date,
  `return_date` date,
  `reason` text,
  `status` varchar(50),
  `created_at` timestamp NULL DEFAULT NULL,
  `return_by` int,
  `actual_return_date` datetime,
  `return_condition` varchar(100),
  `return_note` text,
  `deleted_at` datetime,
  `phone` varchar(20),
  `department_id` int,
  `deleted_by` int,
  `updated_by` int,
  `is_overdue` tinyint(1),
  `approved_by` int,
  `updated_at` datetime
);

CREATE TABLE `borrow_request_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `request_id` int,
  `asset_id` int,
  `item_status` varchar(50) DEFAULT 'รอตรวจสอบ',
  `replace_asset_id` int,
  `staff_note` text,
  `checked_by` int,
  `checked_at` datetime,
  `return_status` varchar(50) DEFAULT 'รอตรวจคืน',
  `return_note` text,
  `returned_by` int,
  `returned_at` datetime,
  `deleted_at` datetime,
  `deleted_by` int
);

CREATE TABLE `maintenance_type` (
  `type_id` INT AUTO_INCREMENT PRIMARY KEY,
  `type_name` varchar(255)
);

CREATE TABLE `departments` (
  `department_id` INT AUTO_INCREMENT PRIMARY KEY,
  `department_name` varchar(255)
);

CREATE TABLE `locations` (
  `location_id` INT AUTO_INCREMENT PRIMARY KEY,
  `location_name` varchar(150) NOT NULL,
  `building` varchar(100) DEFAULT NULL,
  `floor` varchar(20) DEFAULT NULL,
  `room_detail` varchar(255) DEFAULT NULL,
  `remark` varchar(255) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `deleted_at` datetime DEFAULT NULL
);

CREATE TABLE `users` (
  `user_id` INT AUTO_INCREMENT PRIMARY KEY,
  `fullname` varchar(255)
);

-- เพิ่ม Foreign Keys (ลบ DEFERRABLE ออกเพื่อให้รันผ่านใน MySQL)
ALTER TABLE `maintenance_asset` ADD FOREIGN KEY (`asset_id`) REFERENCES `asset` (`asset_id`);
ALTER TABLE `maintenance_asset` ADD FOREIGN KEY (`parent_maintenance_id`) REFERENCES `maintenance_asset` (`id`);
ALTER TABLE `maintenance_general` ADD FOREIGN KEY (`maintenance_type_id`) REFERENCES `maintenance_type` (`type_id`);
ALTER TABLE `maintenance_general` ADD FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`);
ALTER TABLE `maintenance_general` ADD FOREIGN KEY (`staff_id`) REFERENCES `users` (`user_id`);
ALTER TABLE `borrow_request_items` ADD FOREIGN KEY (`request_id`) REFERENCES `borrow` (`id`);
ALTER TABLE `borrow_request_items` ADD FOREIGN KEY (`asset_id`) REFERENCES `asset` (`asset_id`);
ALTER TABLE `borrow_request_items` ADD FOREIGN KEY (`replace_asset_id`) REFERENCES `asset` (`asset_id`);
ALTER TABLE `borrow` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);
ALTER TABLE `borrow` ADD FOREIGN KEY (`teacher_id`) REFERENCES `users` (`user_id`);
ALTER TABLE `borrow` ADD FOREIGN KEY (`return_by`) REFERENCES `users` (`user_id`);
ALTER TABLE `borrow` ADD FOREIGN KEY (`deleted_by`) REFERENCES `users` (`user_id`);
ALTER TABLE `borrow` ADD FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`);
ALTER TABLE `borrow` ADD FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`);
ALTER TABLE `borrow_request_items` ADD FOREIGN KEY (`checked_by`) REFERENCES `users` (`user_id`);
ALTER TABLE `borrow_request_items` ADD FOREIGN KEY (`returned_by`) REFERENCES `users` (`user_id`);
ALTER TABLE `borrow_request_items` ADD FOREIGN KEY (`deleted_by`) REFERENCES `users` (`user_id`);
ALTER TABLE `borrow` ADD FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`);
ALTER TABLE `asset` ADD FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`);
ALTER TABLE `asset` ADD FOREIGN KEY (`location_id`) REFERENCES `locations` (`location_id`);