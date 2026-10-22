<?php
// ==============================================================================
// Database Connection & Helper Functions for CPEAssets API
// รองรับการทำงานร่วมกับ etl_warehouse.py
// ==============================================================================

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ตั้งค่าการเชื่อมต่อฐานข้อมูล (ปรับตามเครื่อง Server/Local ของคุณ)
$db_host = getenv('DB_HOST') ?: 'localhost';
$db_port = getenv('DB_PORT') ?: '3306';
$db_name = getenv('DB_NAME') ?: 'cpeasset';
$db_user = getenv('DB_USER') ?: 'root';
$db_pass = getenv('DB_PASS') ?: '';

try {
    $dsn = "mysql:host={$db_host};port={$db_port};dbname={$db_name};charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_STRINGIFY_FETCHES  => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
    ];
    $pdo = new PDO($dsn, $db_user, $db_pass, $options);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database connection failed: ' . $e->getMessage(),
        'total'   => 0,
        'data'    => []
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * ฟังก์ชันส่ง JSON Response ตาม Format ที่ etl_warehouse.py ต้องการ
 */
function sendJsonResponse($success, $message, $total, $data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode([
        'success' => (bool)$success,
        'message' => (string)$message,
        'total'   => (int)$total,
        'data'    => $data
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/**
 * ดึงค่า Pagination parameter: limit (สูงสุด 100) และ page
 */
function getPaginationParams() {
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
    if ($limit < 1) $limit = 100;
    if ($limit > 100) $limit = 100; // etl_warehouse.py กำหนดเพดานไว้ที่ 100

    $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
    if ($page < 1) $page = 1;

    $offset = ($page - 1) * $limit;

    return [$limit, $page, $offset];
}
