# Local Redis setup

The supported local setup uses Docker Desktop for Redis and XAMPP for Apache, PHP, and MySQL. Redis is published only on Windows loopback. This needs no WSL, firewall change, or public port.

## Start Redis

From the repository root in PowerShell:

    if (-not (Test-Path .env)) { Copy-Item .env.example .env }
    docker compose -f docker-compose.yml -f docker-compose.redis-local.yml config --quiet
    docker compose -f docker-compose.yml -f docker-compose.redis-local.yml up -d --no-deps redis
    docker compose exec -T redis redis-cli ping
    Test-NetConnection 127.0.0.1 -Port 6380

Expected Redis response: PONG. The Windows port mapping is explicitly 127.0.0.1:6380; the container listens internally on 6379. The base production Compose file has no published Redis port.

## Install PHP dependencies

Composer is not required on Windows; the Composer container installs ignored vendor/ using the tracked composer.lock:

    docker run --rm -v "${PWD}:/app" -w /app composer:2 install --no-dev --no-scripts --no-interaction --prefer-dist

XAMPP PHP 8.2 and Docker PHP 8.3 use the same pure-PHP Predis client. Do not commit vendor/.

## Configure XAMPP Apache

Add these directives to the active Apache virtual host or local Apache configuration, then restart Apache:

    SetEnv APP_ENV local
    SetEnv REDIS_ENABLED true
    SetEnv REDIS_HOST 127.0.0.1
    SetEnv REDIS_PORT 6380
    SetEnv REDIS_DB 0
    SetEnv REDIS_KEY_PREFIX cpe:local:

PHP defaults to the repository lib/RedisCache.php path. Set REDIS_CACHE_LIBRARY only if the project is outside the expected root layout. XAMPP MySQL remains unchanged.

## Run and verify the ETL load

The root ETL script creates SQL but does not load it. For repeat loads, use the loader so it invalidates cache only after successful database writes:

    $env:WH_HOST = '127.0.0.1'
    $env:WH_PORT = '3306'
    $env:WH_NAME = 'cpe_warehouse'
    $env:WH_USER = 'root'
    $env:WH_PASS = ''
    $env:REDIS_ENABLED = 'true'
    $env:REDIS_HOST = '127.0.0.1'
    $env:REDIS_PORT = '6380'
    $env:REDIS_KEY_PREFIX = 'cpe:local:'
    python docker/etl/load_warehouse.py output/warehouse_load.sql

Set warehouse credentials to the local XAMPP account in use. The loader supports Docker defaults through WH_* variables.

## Tests

With Composer dependencies installed and Redis running:

    & C:\xampp\php\php.exe tests\redis-cache.test.php
    $env:REDIS_HOST = '127.0.0.1'
    $env:REDIS_PORT = '6380'
    & C:\xampp\php\php.exe tests\redis-connectivity.test.php
    docker compose run --rm --no-deps source-seed python tests/etl-cache-invalidation.test.py

The connectivity test writes a short-lived test key under its own test prefix. It does not query MySQL.

## Stop Redis

    docker compose -f docker-compose.yml -f docker-compose.redis-local.yml stop redis

When Redis is stopped, APIs use MySQL directly. See redis-architecture.md for cache behavior and redis-ec2-deployment.md for production.
