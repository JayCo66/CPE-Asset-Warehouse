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

$expiresRoute = 'connectivity-expiry-' . bin2hex(random_bytes(8));
$expiryCalls = 0;
$expiryLoader = static function () use (&$expiryCalls): array {
    $expiryCalls++;
    return ['revision' => $expiryCalls];
};
if ($cache->remember($expiresRoute, [], 1, $expiryLoader) !== ['revision' => 1]) {
    throw new RuntimeException('Redis expiry test did not store the first value');
}
sleep(2);
if ($cache->remember($expiresRoute, [], 1, $expiryLoader) !== ['revision' => 2] || $cache->lastStatus() !== 'MISS') {
    throw new RuntimeException('Expired Redis entry was not rebuilt');
}

$invalidatesRoute = 'connectivity-invalidation-' . bin2hex(random_bytes(8));
$invalidatesCalls = 0;
$invalidationLoader = static function () use (&$invalidatesCalls): array {
    $invalidatesCalls++;
    return ['revision' => $invalidatesCalls];
};
$cache->remember($invalidatesRoute, [], 30, $invalidationLoader);
if (!$cache->invalidateWarehouse()) {
    throw new RuntimeException('Redis warehouse invalidation could not be verified');
}
if ($cache->remember($invalidatesRoute, [], 30, $invalidationLoader) !== ['revision' => 2] || $cache->lastStatus() !== 'MISS') {
    throw new RuntimeException('Redis version invalidation did not force a miss');
}

$fallbackCache = new RedisCache([
    'enabled' => true,
    'host' => '127.0.0.1',
    'port' => 6381,
    'key_prefix' => 'cpe:test:fallback:' . bin2hex(random_bytes(6)) . ':',
    'connect_timeout' => 0.1,
    'read_timeout' => 0.1,
]);
$fallbackCalls = 0;
$fallbackValue = $fallbackCache->remember(
    'connectivity-fallback',
    [],
    10,
    static function () use (&$fallbackCalls): array {
        $fallbackCalls++;
        return ['fallback' => true];
    },
);
if ($fallbackValue !== ['fallback' => true] || $fallbackCalls !== 1 || $fallbackCache->lastStatus() !== 'BYPASS') {
    throw new RuntimeException('Unavailable Redis did not fall back to the loader');
}

echo "Redis connectivity, MISS/HIT, expiration, invalidation, and fallback passed\n";
