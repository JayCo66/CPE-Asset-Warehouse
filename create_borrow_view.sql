-- ==============================================================================
-- Script: create_borrow_view.sql
-- คำสั่งสร้าง View: view_borrow_risk_radar สำหรับแดชบอร์ดวิเคราะห์การยืม-คืน
-- และเรดาร์ตรวจจับพฤติกรรมผิดปกติ (Anomaly & Risk Radar)
--
-- วิธีใช้งาน:
--   mysql -u root -p cpe_warehouse < create_borrow_view.sql
-- หรือเปิดไฟล์นี้แล้วกด Execute ใน phpMyAdmin / MySQL Workbench
-- ==============================================================================

CREATE OR REPLACE VIEW `view_borrow_risk_radar` AS
SELECT 
    f.`borrow_fact_id`,
    f.`borrow_request_id`,
    f.`borrow_date_key`,
    f.`return_date_key`,
    f.`actual_return_date_key`,
    f.`borrow_duration_days`,
    f.`overdue_days`,
    f.`is_overdue_flag`,
    f.`is_replaced_flag`,
    f.`item_status`,
    f.`return_condition`,
    
    -- ข้อมูลมิติผู้ยืม (Borrower)
    u.`user_key` AS `borrower_user_key`,
    u.`fullname` AS `borrower_name`,
    u.`role_status` AS `borrower_role`,
    
    -- ข้อมูลผู้อนุมัติ (Approver)
    appr.`fullname` AS `approver_name`,
    
    -- ข้อมูลสังกัด/หน่วยงาน (Department)
    d.`department_key`,
    d.`department_name`,
    
    -- ข้อมูลครุภัณฑ์ (Asset)
    a.`asset_key`,
    a.`asset_id`,
    a.`asset_code`,
    a.`asset_name`,
    a.`brand`,
    typ.`type_name`,
    cat.`category_name`,

    -- ==========================================================================
    -- การคำนวณสถิติและเมทริกซ์ความเสี่ยงด้วย MySQL Window Functions
    -- ==========================================================================
    -- 1. ผู้ใช้คนเดิมยืมอุปกรณ์ชิ้นเดิมซ้ำกี่ครั้ง (Monopolization / Repeat Asset)
    COUNT(*) OVER (
        PARTITION BY f.`borrower_user_key`, f.`asset_key`
    ) AS `repeat_asset_times`,

    -- 2. จำนวนครุภัณฑ์ที่ถูกขอยืมพร้อมกันในคำขอเดียวกัน (Mass Borrowing / Hoarding)
    COUNT(*) OVER (
        PARTITION BY f.`borrow_request_id`
    ) AS `items_in_request`,

    -- 3. ประวัติการยืมสะสมทั้งหมดของผู้ยืมรายนี้
    COUNT(*) OVER (
        PARTITION BY f.`borrower_user_key`
    ) AS `user_total_borrows`,

    -- 4. ประวัติส่งคืนล่าช้าสะสมของผู้ยืมรายนี้
    SUM(f.`is_overdue_flag`) OVER (
        PARTITION BY f.`borrower_user_key`
    ) AS `user_overdue_count`,

    -- 5. สัดส่วนการส่งคืนล่าช้า (%) ของผู้ยืมรายนี้ (Chronic Overdue Rate)
    ROUND(
        SUM(f.`is_overdue_flag`) OVER (PARTITION BY f.`borrower_user_key`) * 100.0 / 
        NULLIF(COUNT(*) OVER (PARTITION BY f.`borrower_user_key`), 0), 
        1
    ) AS `user_overdue_rate_pct`,

    -- 6. ประวัติส่งคืนครุภัณฑ์ในสภาพชำรุดของผู้ยืมรายนี้
    SUM(CASE WHEN f.`return_condition` = 'ชำรุด' THEN 1 ELSE 0 END) OVER (
        PARTITION BY f.`borrower_user_key`
    ) AS `user_damage_count`,

    -- ==========================================================================
    -- แฟล็กตรวจจับความผิดปกติ (Anomaly Boolean Flags: 1 = พบความเสี่ยง, 0 = ปกติ)
    -- ==========================================================================
    -- แฟล็ก: ผูกขาดเครื่องเดิมซ้ำ (ตั้งแต่ 2 ครั้งขึ้นไป)
    CASE 
        WHEN COUNT(*) OVER (PARTITION BY f.`borrower_user_key`, f.`asset_key`) >= 2 THEN 1 
        ELSE 0 
    END AS `is_repeat_asset_flag`,

    -- แฟล็ก: ขอยืมจำนวนมากผิดปกติ (ตั้งแต่ 3 ชิ้นขึ้นไปใน 1 คำขอ)
    CASE 
        WHEN COUNT(*) OVER (PARTITION BY f.`borrow_request_id`) >= 3 THEN 1 
        ELSE 0 
    END AS `is_mass_borrow_flag`,

    -- แฟล็ก: ประวัติคืนล่าช้าเรื้อรัง (ยืม >= 3 ครั้ง และอัตราคืนล่าช้าสะสม >= 50%)
    CASE 
        WHEN (SUM(f.`is_overdue_flag`) OVER (PARTITION BY f.`borrower_user_key`) * 100.0 / 
              NULLIF(COUNT(*) OVER (PARTITION BY f.`borrower_user_key`), 0)) >= 50.0 
             AND COUNT(*) OVER (PARTITION BY f.`borrower_user_key`) >= 3 THEN 1 
        ELSE 0 
    END AS `is_chronic_overdue_flag`,

    -- แฟล็ก: ถือครองยาวนานเกินเกณฑ์ (> 30 วัน)
    CASE 
        WHEN f.`borrow_duration_days` >= 30 THEN 1 
        ELSE 0 
    END AS `is_excessive_duration_flag`

FROM `fact_borrow_transaction` f
LEFT JOIN `dim_user` u ON f.`borrower_user_key` = u.`user_key`
LEFT JOIN `dim_user` appr ON f.`approver_user_key` = appr.`user_key`
LEFT JOIN `dim_department` d ON f.`department_key` = d.`department_key`
LEFT JOIN `dim_asset` a ON f.`asset_key` = a.`asset_key`
LEFT JOIN `dim_asset_type` typ ON a.`type_key` = typ.`type_key`
LEFT JOIN `dim_asset_category` cat ON a.`category_key` = cat.`category_key`;
