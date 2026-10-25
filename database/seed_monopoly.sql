-- ==============================================================================
-- Script: seed_monopoly.sql
-- จำลองข้อมูลพฤติกรรมผูกขาดเครื่อง (> 3 ครั้ง ติดต่อกัน ห่างกัน <= 7 วัน)
-- ลงในตาราง fact_borrow_transaction ใน cpe_warehouse
-- ทำให้เกิด 2 รูปแบบ (Pattern) สำหรับแสดงผลใน Risk Radar KPI & Dashboard
-- ==============================================================================

USE `cpe_warehouse`;

-- รูปแบบที่ 1: ผู้ยืม user_key = 59 (นายรัฐศาสตร์ ธรรมนูญ) ยืม asset_key = 3337 ติดต่อกัน 4 ครั้ง
UPDATE `fact_borrow_transaction` 
SET `asset_key` = 3337, 
    `borrow_date_key` = 20250210, 
    `return_date_key` = 20250217, 
    `actual_return_date_key` = 20250217, 
    `borrow_duration_days` = 7 
WHERE `borrow_fact_id` = 58;

UPDATE `fact_borrow_transaction` 
SET `asset_key` = 3337, 
    `borrow_date_key` = 20250220, 
    `return_date_key` = 20250227, 
    `actual_return_date_key` = 20250227, 
    `borrow_duration_days` = 7 
WHERE `borrow_fact_id` = 60;

UPDATE `fact_borrow_transaction` 
SET `asset_key` = 3337, 
    `borrow_date_key` = 20250303, 
    `return_date_key` = 20250310, 
    `actual_return_date_key` = 20250310, 
    `borrow_duration_days` = 7 
WHERE `borrow_fact_id` = 70;

UPDATE `fact_borrow_transaction` 
SET `asset_key` = 3337, 
    `borrow_date_key` = 20250313, 
    `return_date_key` = 20250320, 
    `actual_return_date_key` = 20250320, 
    `borrow_duration_days` = 7 
WHERE `borrow_fact_id` = 75;

-- รูปแบบที่ 2: ผู้ยืม user_key = 37 (นางสาวกานต์รวี ประเสริฐสังข์) ยืม asset_key = 268 ติดต่อกัน 4 ครั้ง
UPDATE `fact_borrow_transaction` 
SET `asset_key` = 268, 
    `borrow_date_key` = 20250804, 
    `return_date_key` = 20250811, 
    `actual_return_date_key` = 20250811, 
    `borrow_duration_days` = 7 
WHERE `borrow_fact_id` = 99;

UPDATE `fact_borrow_transaction` 
SET `asset_key` = 268, 
    `borrow_date_key` = 20250814, 
    `return_date_key` = 20250821, 
    `actual_return_date_key` = 20250821, 
    `borrow_duration_days` = 7 
WHERE `borrow_fact_id` = 110;

UPDATE `fact_borrow_transaction` 
SET `asset_key` = 268, 
    `borrow_date_key` = 20250825, 
    `return_date_key` = 20250901, 
    `actual_return_date_key` = 20250901, 
    `borrow_duration_days` = 7 
WHERE `borrow_fact_id` = 124;

UPDATE `fact_borrow_transaction` 
SET `asset_key` = 268, 
    `borrow_date_key` = 20250904, 
    `return_date_key` = 20250911, 
    `actual_return_date_key` = 20250911, 
    `borrow_duration_days` = 7 
WHERE `borrow_fact_id` = 125;
