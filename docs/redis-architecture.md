# Redis cache architecture

Redis is an optional cache for reconstructible warehouse API results. MySQL remains authoritative. Set REDIS_ENABLED=false to disable it. If Redis is unreachable or returns invalid data, PHP loads from MySQL and ETL completes normally.

## Cached endpoints

Only GET aggregate and reporting data is cached. Other methods bypass cache access. Requests with an Authorization header, authenticated Apache user, PHP session data, or cookies also bypass the shared cache.

| Endpoint | Cached data | Default TTL |
|---|---|---:|
| web/public/api/annual.php | Annual dashboard summary | 300 s |
| web/public/api/borrow.php | Aggregate borrowing statistics | 120 s |
| web/public/api/facility.php | Maintenance summary and counts | 120 s |
| web/public/api/repair.php | Repair summary, worth, and counts | 120 s |
| web/public/api/inventory.php | Asset summary | 300 s |
| web/public/api/invest.php | Replacement planning summary | 300 s |
| assets_api/report_facility.php | Facility reports | 120 s |
| assets_api/report_repair.php | Repair reports | 120 s |
| assets_api/asset_inventory_dashboard.php | Snapshot options (300 s), overview/aggregates (900 s), and history (3600 s) | 300–3600 s |

The facility and repair view=jobs responses bypass caching because they include staff identities. The borrower detail endpoint assets_api/dw_borrow.php is not cached.

## Keys and invalidation

The prefix separates environments, for example cpe:local: and cpe:production:. Response keys are SHA-256 hashes over the route, canonicalized query parameters, public access scope, and warehouse version. Redis stores JSON with SETEX; TTLs are capped at one hour.

After a warehouse load succeeds and its SQL statements and commit complete, ETL increments the configured prefix followed by warehouse:version. New requests then use a fresh key generation. Old entries expire by TTL and are evicted under allkeys-lru. Invalidation does not scan keys or flush a database.

If invalidation fails, the load still succeeds and the previous cache generation expires naturally. ETL prints a generic warning without Redis connection details.

## Redis service

The repository Compose service uses pinned redis:7.4.12-alpine3.21, 96 MB maxmemory, a 128 MB container limit, LRU eviction, and no persistence. The base Compose file does not publish port 6379. The local-only Compose override publishes it to 127.0.0.1.

PHP connects to redis:6379 inside Compose. XAMPP connects to 127.0.0.1:6380 by default; REDIS_PORT and REDIS_LOCAL_PORT can be changed together when that host port is occupied. Use separate local and production prefixes.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| APP_ENV | local | Selects the default environment namespace |
| REDIS_ENABLED | false in PHP; true in Compose | Cache feature flag |
| REDIS_HOST | 127.0.0.1 | Redis hostname; redis inside Compose |
| REDIS_PORT | 6379 | Redis port |
| REDIS_DB | 0 | Redis logical database |
| REDIS_KEY_PREFIX | cpe:{APP_ENV}: | Environment namespace |
| REDIS_DEFAULT_TTL | 300 | Fallback TTL in seconds |
| REDIS_TTL_OVERVIEW | 300 | Annual overview TTL |
| REDIS_TTL_BORROWING | 120 | Borrow summary TTL |
| REDIS_TTL_MAINTENANCE | 120 | Maintenance summary TTL |
| REDIS_TTL_ASSET_SUMMARY | 300 | Asset and analytics TTL |
| REDIS_CONNECT_TIMEOUT | 0.2 | Connection timeout in seconds |
| REDIS_READ_TIMEOUT | 0.2 | Read timeout in seconds |
| REDIS_CACHE_LIBRARY | repository lib/RedisCache.php | Optional PHP class path override |

No production credentials belong in .env.example or Git.

## Troubleshooting

- An X-Cache value of BYPASS is expected when caching is disabled, Redis is unreachable, the request is not GET, or the request carries identity state.
- For a connection failure, verify the Redis service is healthy, the PHP host/port match its environment, and Composer installed vendor/ from composer.lock. The API continues to use MySQL while Redis is unavailable.
- If a successful ETL run does not refresh a dashboard immediately, confirm the API and ETL use the same REDIS_KEY_PREFIX. Old entries expire within their TTL.
