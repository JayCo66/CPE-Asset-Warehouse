<?php
// รายการโมดูลของแอป + เกณฑ์ (settings) : เมนูหลักสร้างจากข้อมูลนี้ ไม่ได้เขียนตายตัวในหน้าเว็บ
require __DIR__ . '/db.php';

$config = app_config();
if (!isset($config['modules'])) {
    fail('อ่านรายการโมดูลไม่ได้ (config/modules.json)');
}
$config['modules'] = array_values(array_filter($config['modules'], fn($m) => ($m['visible'] ?? true) !== false));
$config['today'] = today();
respond($config);
