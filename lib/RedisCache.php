<?php
declare(strict_types=1);

final class RedisCache
{
    private bool $enabled;
    private bool $failed = false;
    private string $prefix;
    private string $host;
    private int $port;
    private int $database;
    private float $connectTimeout;
    private float $readTimeout;
    private int $maxEntryBytes;
    private ?object $redis;
    private string $lastStatus = 'BYPASS';
    private ?string $autoload;

    public function __construct(array $config, ?object $client = null)
    {
        $this->enabled = (bool)($config['enabled'] ?? false);
        $this->prefix = (string)($config['key_prefix'] ?? 'cpe:local:');
        $this->prefix = $this->prefix !== '' ? $this->prefix : 'cpe:local:';
        $this->host = (string)($config['host'] ?? '127.0.0.1');
        $this->port = (int)($config['port'] ?? 6379);
        $this->database = (int)($config['database'] ?? 0);
        $this->connectTimeout = max(0.05, min(2.0, (float)($config['connect_timeout'] ?? 0.2)));
        $this->readTimeout = max(0.05, min(2.0, (float)($config['read_timeout'] ?? 0.2)));
        $this->maxEntryBytes = max(16384, min(2097152, (int)($config['max_entry_bytes'] ?? 524288)));
        $this->redis = $client;
        $this->autoload = isset($config['autoload']) ? (string)$config['autoload'] : null;
    }

    public static function fromEnvironment(): self
    {
        $environment = getenv('APP_ENV') ?: 'local';
        $prefix = getenv('REDIS_KEY_PREFIX') ?: 'cpe:' . $environment . ':';
        $enabled = filter_var(getenv('REDIS_ENABLED') ?: 'false', FILTER_VALIDATE_BOOLEAN);

        return new self([
            'enabled' => $enabled,
            'host' => getenv('REDIS_HOST') ?: '127.0.0.1',
            'port' => self::intEnvironment('REDIS_PORT', 6379, 1, 65535),
            'database' => self::intEnvironment('REDIS_DB', 0, 0, 15),
            'key_prefix' => $prefix,
            'connect_timeout' => self::floatEnvironment('REDIS_CONNECT_TIMEOUT', 0.2, 0.05, 2.0),
            'read_timeout' => self::floatEnvironment('REDIS_READ_TIMEOUT', 0.2, 0.05, 2.0),
            'max_entry_bytes' => self::intEnvironment('REDIS_MAX_ENTRY_BYTES', 524288, 16384, 2097152),
            'autoload' => getenv('COMPOSER_AUTOLOAD') ?: dirname(__DIR__) . '/vendor/autoload.php',
        ]);
    }

    public static function ttl(string $category, int $fallback): int
    {
        $value = getenv('REDIS_TTL_' . strtoupper($category));
        if ($value === false || $value === '') {
            $value = getenv('REDIS_DEFAULT_TTL');
        }
        if ($value === false || !ctype_digit((string)$value)) {
            $value = $fallback;
        }
        return max(1, min(3600, (int)$value));
    }

    public function remember(string $route, array $query, int $ttl, callable $loader): mixed
    {
        $this->lastStatus = 'BYPASS';
        $scope = $this->requestScope();
        if (!$this->enabled || $scope === null) {
            return $loader();
        }

        $redis = $this->client();
        if ($redis === null) {
            return $loader();
        }

        try {
            $version = $redis->get($this->versionKey());
            $version = is_scalar($version) && (string)$version !== '' ? (string)$version : '0';
            $key = $this->responseKey($route, $query, $version, $scope);
            $cached = $redis->get($key);
        } catch (Throwable) {
            $this->failed = true;
            return $loader();
        }

        if (is_string($cached)) {
            try {
                $json = str_starts_with($cached, "\0CPE1")
                    ? gzdecode(substr($cached, 5))
                    : $cached;
                if (!is_string($json)) {
                    throw new JsonException('Invalid compressed cache entry.');
                }
                $value = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
                if (is_array($value)) {
                    $this->lastStatus = 'HIT';
                    return $value;
                }
            } catch (JsonException) {
                // A bad cache entry is discarded and rebuilt from MySQL.
            }

            try {
                $redis->del($key);
            } catch (Throwable) {
                $this->failed = true;
                return $loader();
            }
        }

        $this->lastStatus = 'MISS';
        $value = $loader();
        if (!is_array($value)) {
            return $value;
        }

        try {
            $json = json_encode(
                $value,
                JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR,
            );
            $compressed = function_exists('gzencode') ? gzencode($json, 1) : false;
            $stored = is_string($compressed) && strlen($compressed) + 5 < strlen($json)
                ? "\0CPE1" . $compressed
                : $json;
            if (strlen($stored) <= $this->maxEntryBytes) {
                $redis->setex($key, max(1, min(3600, $ttl)), $stored);
            }
        } catch (Throwable) {
            $this->failed = true;
        }

        return $value;
    }

    public function invalidateWarehouse(): bool
    {
        if (!$this->enabled) {
            return false;
        }
        $redis = $this->client();
        if ($redis === null) {
            return false;
        }
        try {
            $redis->incr($this->versionKey());
            return true;
        } catch (Throwable) {
            $this->failed = true;
            return false;
        }
    }

    public function ping(): bool
    {
        $redis = $this->client();
        if ($redis === null) {
            return false;
        }
        try {
            return strtoupper((string)$redis->ping()) === 'PONG';
        } catch (Throwable) {
            $this->failed = true;
            return false;
        }
    }

    public function lastStatus(): string
    {
        return $this->lastStatus;
    }

    /**
     * Returns true when acquired, false when owned by another worker, and null
     * when Redis is disabled or unavailable so callers can use a durable lock.
     */
    public function acquireLock(string $name, string $owner, int $ttl): ?bool
    {
        $redis = $this->client();
        if ($redis === null) {
            return null;
        }
        try {
            $result = $redis->set($this->lockKey($name), $owner, 'EX', max(1, min(3600, $ttl)), 'NX');
            return $result !== null && strtoupper((string)$result) === 'OK';
        } catch (Throwable) {
            $this->failed = true;
            return null;
        }
    }

    public function renewLock(string $name, string $owner, int $ttl): ?bool
    {
        return $this->runOwnerLockScript(
            $name,
            $owner,
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end",
            max(1, min(3600, $ttl)),
        );
    }

    public function releaseLock(string $name, string $owner): ?bool
    {
        return $this->runOwnerLockScript(
            $name,
            $owner,
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        );
    }

    public function setJsonMetadata(string $name, array $value, int $ttl): bool
    {
        $redis = $this->client();
        if ($redis === null) {
            return false;
        }
        try {
            $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR);
            $redis->setex($this->metadataKey($name), max(1, min(2592000, $ttl)), $json);
            return true;
        } catch (Throwable) {
            $this->failed = true;
            return false;
        }
    }

    public function getJsonMetadata(string $name): ?array
    {
        $redis = $this->client();
        if ($redis === null) {
            return null;
        }
        try {
            $json = $redis->get($this->metadataKey($name));
            if (!is_string($json)) {
                return null;
            }
            $value = json_decode($json, true, 32, JSON_THROW_ON_ERROR);
            return is_array($value) ? $value : null;
        } catch (Throwable) {
            $this->failed = true;
            return null;
        }
    }

    public function responseKey(string $route, array $query, string $version, string $scope = 'public'): string
    {
        $payload = json_encode([
            'version' => $version,
            'route' => $route,
            'query' => self::normalize($query),
            'scope' => $scope,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR);

        return $this->prefix . 'response:' . hash('sha256', $payload);
    }

    public function versionKey(): string
    {
        return $this->prefix . 'warehouse:version';
    }

    private function client(): ?object
    {
        if (!$this->enabled || $this->failed) {
            return null;
        }
        if ($this->redis !== null) {
            return $this->redis;
        }

        try {
            $autoload = $this->autoload ?: getenv('COMPOSER_AUTOLOAD') ?: dirname(__DIR__) . '/vendor/autoload.php';
            if (is_readable($autoload)) {
                require_once $autoload;
            }
            if (!class_exists(\Predis\Client::class)) {
                $this->failed = true;
                return null;
            }

            $this->redis = new \Predis\Client([
                'scheme' => 'tcp',
                'host' => $this->host,
                'port' => $this->port,
                'database' => $this->database,
                'timeout' => $this->connectTimeout,
                'read_write_timeout' => $this->readTimeout,
            ]);
            return $this->redis;
        } catch (Throwable) {
            $this->failed = true;
            return null;
        }
    }

    private function runOwnerLockScript(string $name, string $owner, string $script, ?int $ttl = null): ?bool
    {
        $redis = $this->client();
        if ($redis === null) {
            return null;
        }
        try {
            $arguments = [$script, 1, $this->lockKey($name), $owner];
            if ($ttl !== null) {
                $arguments[] = $ttl;
            }
            return (int)$redis->eval(...$arguments) === 1;
        } catch (Throwable) {
            $this->failed = true;
            return null;
        }
    }

    private function lockKey(string $name): string
    {
        return $this->prefix . 'lock:' . hash('sha256', $name);
    }

    private function metadataKey(string $name): string
    {
        if (preg_match('/\A[a-z0-9:_-]{1,100}\z/iD', $name) !== 1) {
            throw new InvalidArgumentException('Invalid Redis metadata key.');
        }
        return $this->prefix . $name;
    }

    private function requestScope(): ?string
    {
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
            return null;
        }
        if (!empty($_SERVER['HTTP_AUTHORIZATION']) || !empty($_SERVER['HTTP_COOKIE']) || !empty($_SERVER['REMOTE_USER'])) {
            return null;
        }
        if (isset($_SESSION) && is_array($_SESSION) && $_SESSION !== []) {
            return null;
        }
        return 'public';
    }

    private static function normalize(array $values): array
    {
        if (array_is_list($values)) {
            return array_map(static fn($value) => is_array($value) ? self::normalize($value) : $value, $values);
        }

        $keys = array_keys($values);
        sort($keys, SORT_STRING);
        $normalized = [];
        foreach ($keys as $key) {
            $value = $values[$key];
            $normalized[$key] = is_array($value) ? self::normalize($value) : $value;
        }
        return $normalized;
    }

    private static function intEnvironment(string $name, int $fallback, int $minimum, int $maximum): int
    {
        $value = getenv($name);
        if ($value === false || !preg_match('/\A-?\d+\z/', (string)$value)) {
            return $fallback;
        }
        return max($minimum, min($maximum, (int)$value));
    }

    private static function floatEnvironment(string $name, float $fallback, float $minimum, float $maximum): float
    {
        $value = getenv($name);
        if ($value === false || !is_numeric($value)) {
            return $fallback;
        }
        return max($minimum, min($maximum, (float)$value));
    }
}
