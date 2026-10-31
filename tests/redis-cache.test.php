<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/RedisCache.php';

function expectSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

final class MemoryRedis
{
    public array $values = [];
    public array $ttls = [];
    public array $expiresAt = [];
    public int $getCount = 0;
    public int $setCount = 0;
    public int $deleteCount = 0;
    public bool $fail = false;
    public bool $returnStatusObject = false;

    public function get(string $key): ?string
    {
        $this->getCount++;
        if ($this->fail) {
            throw new RuntimeException('redis unavailable');
        }
        if (isset($this->expiresAt[$key]) && $this->expiresAt[$key] <= time()) {
            unset($this->values[$key], $this->expiresAt[$key]);
        }
        return $this->values[$key] ?? null;
    }

    public function setex(string $key, int $ttl, string $value): string
    {
        if ($this->fail) {
            throw new RuntimeException('redis unavailable');
        }
        $this->values[$key] = $value;
        $this->ttls[$key] = $ttl;
        $this->expiresAt[$key] = time() + $ttl;
        $this->setCount++;
        return 'OK';
    }

    public function del(string $key): int
    {
        if ($this->fail) {
            throw new RuntimeException('redis unavailable');
        }
        $this->deleteCount++;
        unset($this->values[$key]);
        return 1;
    }

    public function incr(string $key): int
    {
        if ($this->fail) {
            throw new RuntimeException('redis unavailable');
        }
        $this->values[$key] = (string)((int)($this->values[$key] ?? '0') + 1);
        return (int)$this->values[$key];
    }

    public function ping(): string
    {
        if ($this->fail) {
            throw new RuntimeException('redis unavailable');
        }
        return 'PONG';
    }

    public function set(string $key, string $value, string $expiry, int $ttl, string $condition): mixed
    {
        if ($this->fail) {
            throw new RuntimeException('redis unavailable');
        }
        $this->get($key);
        if ($condition === 'NX' && isset($this->values[$key])) {
            return null;
        }
        $this->values[$key] = $value;
        $this->expiresAt[$key] = time() + $ttl;
        return $this->returnStatusObject ? new FakeRedisStatus() : 'OK';
    }

    public function eval(string $script, int $keyCount, string $key, string $token, ?int $ttl = null): int
    {
        if ($this->fail) {
            throw new RuntimeException('redis unavailable');
        }
        if (($this->values[$key] ?? null) !== $token) {
            return 0;
        }
        if ($ttl === null) {
            unset($this->values[$key], $this->expiresAt[$key]);
        } else {
            $this->expiresAt[$key] = time() + $ttl;
        }
        return 1;
    }
}

final class FakeRedisStatus implements Stringable
{
    public function __toString(): string
    {
        return 'OK';
    }
}

function newCache(MemoryRedis $redis, bool $enabled = true): RedisCache
{
    return new RedisCache([
        'enabled' => $enabled,
        'key_prefix' => 'cpe:test:',
        'default_ttl' => 300,
    ], $redis);
}

$_SERVER['REQUEST_METHOD'] = 'GET';
unset($_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REMOTE_USER'], $_SESSION);

$redis = new MemoryRedis();
$cache = newCache($redis);
$calls = 0;
$loader = static function () use (&$calls): array {
    $calls++;
    return ['total' => 12, 'average' => 1.5];
};
expectSame(['total' => 12, 'average' => 1.5], $cache->remember('borrow.php', ['fy' => 2569], 120, $loader), 'cache miss returns loaded data');
expectSame('MISS', $cache->lastStatus(), 'first request is a miss');
expectSame(['total' => 12, 'average' => 1.5], $cache->remember('borrow.php', ['fy' => 2569], 120, $loader), 'cache hit returns stored data');
expectSame('HIT', $cache->lastStatus(), 'second request is a hit');
expectSame(1, $calls, 'hit avoids the loader');
expectSame(120, array_values($redis->ttls)[0], 'caller TTL is applied');
$cache->remember('borrow.php', ['fy' => 2570], 120, $loader);
expectSame(2, $calls, 'different filters use a different cache entry');

$redis = new MemoryRedis();
$cache = newCache($redis);
$calls = 0;
$cache->remember('annual.php', [], 1, static function () use (&$calls): array { $calls++; return ['revision' => $calls]; });
sleep(2);
expectSame(['revision' => 2], $cache->remember('annual.php', [], 1, static function () use (&$calls): array { $calls++; return ['revision' => $calls]; }), 'expired cache is refreshed');
expectSame('MISS', $cache->lastStatus(), 'expired entry is a miss');

$redis = new MemoryRedis();
$cache = newCache($redis);
$left = ['filters' => ['status' => 'active', 'department' => 'CPE']];
$right = ['filters' => ['department' => 'CPE', 'status' => 'active']];
$calls = 0;
$cache->remember('inventory.php', $left, 300, static function () use (&$calls): array { $calls++; return ['count' => 5]; });
$cache->remember('inventory.php', $right, 300, static function () use (&$calls): array { $calls++; return ['count' => 6]; });
expectSame(1, $calls, 'query parameter ordering is canonicalized');

$redis = new MemoryRedis();
$cache = newCache($redis);
$key = $cache->responseKey('repair.php', ['view' => 'overview'], '0', 'public');
$redis->values[$key] = '{broken';
$calls = 0;
$result = $cache->remember('repair.php', ['view' => 'overview'], 120, static function () use (&$calls): array { $calls++; return ['jobs' => 4]; });
expectSame(['jobs' => 4], $result, 'corrupt JSON is replaced with fresh data');
expectSame(1, $calls, 'corrupt cache triggers the loader');
expectSame(1, $redis->deleteCount, 'corrupt cache is deleted');
expectSame('MISS', $cache->lastStatus(), 'corrupt cache is a miss');

$redis = new MemoryRedis();
$cache = newCache($redis);
$calls = 0;
$cache->remember('annual.php', ['fy' => 2569], 300, static function () use (&$calls): array { $calls++; return ['revision' => 1]; });
expectSame(true, $cache->invalidateWarehouse(), 'version invalidation succeeds');
$cache->remember('annual.php', ['fy' => 2569], 300, static function () use (&$calls): array { $calls++; return ['revision' => 2]; });
expectSame(2, $calls, 'version bump makes old entries unreachable');

$redis = new MemoryRedis();
$redis->fail = true;
$cache = newCache($redis);
$calls = 0;
expectSame(['ok' => true], $cache->remember('annual.php', [], 300, static function () use (&$calls): array { $calls++; return ['ok' => true]; }), 'Redis failure falls back to the loader');
expectSame(1, $calls, 'fallback calls the loader once');
expectSame('BYPASS', $cache->lastStatus(), 'Redis failure is recorded as a bypass');

$redis = new MemoryRedis();
$cache = newCache($redis, false);
$calls = 0;
$cache->remember('annual.php', [], 300, static function () use (&$calls): array { $calls++; return ['ok' => true]; });
expectSame(1, $calls, 'disabled cache calls the loader');
expectSame(0, $redis->getCount, 'disabled cache does not connect');
expectSame('BYPASS', $cache->lastStatus(), 'disabled cache is a bypass');

$redis = new MemoryRedis();
$cache = newCache($redis);
$calls = 0;
$_SERVER['REQUEST_METHOD'] = 'POST';
$cache->remember('inventory.php', [], 300, static function () use (&$calls): array { $calls++; return ['ok' => true]; });
expectSame(0, $redis->getCount, 'mutating methods bypass cache reads');
$_SERVER['REQUEST_METHOD'] = 'GET';

$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer user-token';
$cache->remember('inventory.php', [], 300, static function () use (&$calls): array { $calls++; return ['ok' => true]; });
expectSame(0, $redis->getCount, 'authenticated requests bypass shared cache');
unset($_SERVER['HTTP_AUTHORIZATION']);

$redis = new MemoryRedis();
$cache = newCache($redis);
$_SERVER['HTTP_COOKIE'] = 'session=private';
$cache->remember('inventory.php', [], 300, static function (): array { return ['ok' => true]; });
expectSame(0, $redis->getCount, 'cookie-bearing requests bypass shared cache');
unset($_SERVER['HTTP_COOKIE']);

$redis = new MemoryRedis();
$cache = newCache($redis);
$cache->remember('annual.php', [], 999999, static fn(): array => ['ok' => true]);
expectSame(3600, array_values($redis->ttls)[0], 'cache TTL is capped');

$redis = new MemoryRedis();
$cache = newCache($redis);
$snapshotId = '41979494-e206-4c30-b103-0bc347fc8d68';
expectSame(false, $cache->responseKey('asset-inventory:overview', ['snapshot_id' => $snapshotId], '0')
    === $cache->responseKey('asset-inventory:overview', ['snapshot_id' => '41979494-e206-4c30-b103-0bc347fc8d69'], '0'),
    'different snapshot IDs must have separate cache keys');

$redis = new MemoryRedis();
$cache = newCache($redis);
$largeValue = ['cohorts' => str_repeat('asset-data-', 60000)];
$calls = 0;
expectSame($largeValue, $cache->remember('asset-inventory:analytics', ['snapshot_id' => $snapshotId], 900, static function () use (&$calls, $largeValue): array {
    $calls++;
    return $largeValue;
}), 'compressed dashboard payload is returned on the initial load');
$storedPayload = end($redis->values);
expectSame(true, str_starts_with($storedPayload, "\0CPE1"), 'large compressible cache values use the versioned gzip encoding');
expectSame(true, strlen($storedPayload) < 524288, 'compressed dashboard cache values stay under the default entry limit');
expectSame($largeValue, $cache->remember('asset-inventory:analytics', ['snapshot_id' => $snapshotId], 900, static function () use (&$calls): array {
    $calls++;
    return ['wrong' => true];
}), 'compressed cache values decode safely on a hit');
expectSame(1, $calls, 'compressed cache hit skips the loader');

$redis = new MemoryRedis();
$cache = newCache($redis);
$largeValue = ['payload' => base64_encode(random_bytes(600000))];
$calls = 0;
$cache->remember('large', [], 900, static function () use (&$calls, $largeValue): array { $calls++; return $largeValue; });
$cache->remember('large', [], 900, static function () use (&$calls, $largeValue): array { $calls++; return $largeValue; });
expectSame(2, $calls, 'values larger than the cache entry limit are served without being stored');

$redis = new MemoryRedis();
$cache = newCache($redis);
$redis->returnStatusObject = true;
expectSame(true, $cache->ping(), 'Redis availability can be checked for cache warming');
expectSame(true, $cache->acquireLock('snapshot:daily:import', 'owner-a', 60), 'first owner acquires a namespaced lock');
expectSame(false, $cache->acquireLock('snapshot:daily:import', 'owner-b', 60), 'another owner cannot replace an active lock');
expectSame(false, $cache->releaseLock('snapshot:daily:import', 'owner-b'), 'a non-owner cannot release a lock');
expectSame(true, $cache->renewLock('snapshot:daily:import', 'owner-a', 60), 'lock owner can renew its lease');
expectSame(true, $cache->releaseLock('snapshot:daily:import', 'owner-a'), 'lock owner can release its lease');
expectSame(true, $cache->acquireLock('snapshot:daily:import', 'owner-b', 60), 'a released lock can be acquired');
expectSame(true, $cache->setJsonMetadata('snapshot:daily:status', ['state' => 'running'], 60), 'job state can be recorded as namespaced JSON');
expectSame(['state' => 'running'], $cache->getJsonMetadata('snapshot:daily:status'), 'job state can be read as JSON');

$redis = new MemoryRedis();
$redis->fail = true;
$cache = newCache($redis);
expectSame(null, $cache->acquireLock('snapshot:daily:import', 'owner-a', 60), 'Redis lock failure signals the database-lock fallback');

echo "Redis cache tests passed\n";
