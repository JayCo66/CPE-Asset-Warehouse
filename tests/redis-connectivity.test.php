<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../lib/RedisCache.php';

$client = new Predis\Client([
    'scheme' => 'tcp',
    'host' => getenv('REDIS_HOST') ?: '127.0.0.1',
    'port' => getenv('REDIS_PORT') ?: 6379,
    'timeout' => 0.5,
    'read_write_timeout' => 0.5,
]);
if (strtoupper((string)$client->ping()) !== 'PONG') {
    throw new RuntimeException('Redis did not respond to ping');
}

putenv('REDIS_ENABLED=true');
putenv('REDIS_KEY_PREFIX=cpe:test:' . bin2hex(random_bytes(6)) . ':');
$cache = RedisCache::fromEnvironment();
$_SERVER['REQUEST_METHOD'] = 'GET';
unset($_SERVER['HTTP_AUTHORIZATION'], $_SERVER['HTTP_COOKIE'], $_SERVER['REMOTE_USER'], $_SESSION);
$route = 'connectivity-test-' . bin2hex(random_bytes(8));
$loaderCalls = 0;
$loader = static function () use (&$loaderCalls): array {
    $loaderCalls++;
    return ['ok' => true];
};
$cache->remember($route, [], 10, $loader);
if ($cache->lastStatus() !== 'MISS') {
    throw new RuntimeException('Redis cache miss could not be verified');
}
$cache->remember($route, [], 10, $loader);
if ($cache->lastStatus() !== 'HIT' || $loaderCalls !== 1) {
    throw new RuntimeException('Redis cache hit could not be verified');
}

echo "Redis connectivity and cache hit/miss passed\n";
