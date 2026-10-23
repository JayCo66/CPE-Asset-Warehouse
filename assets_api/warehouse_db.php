<?php
declare(strict_types=1);

if (!defined('WAREHOUSE_INVENTORY_API_REQUEST')) {
    http_response_code(404);
    exit;
}

$warehouseDbHost = getenv('WAREHOUSE_DB_HOST') ?: (getenv('DB_HOST') ?: 'localhost');
$warehouseDbPort = getenv('WAREHOUSE_DB_PORT') ?: (getenv('DB_PORT') ?: '3306');
$warehouseDbUser = getenv('WAREHOUSE_DB_USER') ?: (getenv('DB_USER') ?: 'root');
$warehouseDbPass = getenv('WAREHOUSE_DB_PASS');

if ($warehouseDbPass === false) {
    $warehouseDbPass = getenv('DB_PASS');
}

if ($warehouseDbPass === false) {
    $warehouseDbPass = '';
}

$warehouseDsn = sprintf(
    'mysql:host=%s;port=%s;dbname=cpe_warehouse;charset=utf8mb4',
    $warehouseDbHost,
    $warehouseDbPort
);

$warehousePdo = new PDO($warehouseDsn, $warehouseDbUser, $warehouseDbPass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
    PDO::ATTR_STRINGIFY_FETCHES => false,
]);
