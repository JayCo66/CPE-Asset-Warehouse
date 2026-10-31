# EC2 Redis deployment and rollback

Inspect the actual host Compose project before applying changes. The live instance inspected for this rollout is /home/ubuntu/cpe-hub: it runs Apache/PHP (web), MySQL 8 (db), and phpMyAdmin. It is not the repository's Nginx/warehouse Compose deployment and has no ETL container. Keep using its existing Compose project and network.

## Redis-only rollout

Add Redis to the actual Compose file with:

- redis:7.4.12-alpine3.21
- no ports mapping
- the existing default Compose network so PHP can resolve redis
- 96 MB maxmemory, allkeys-lru, disabled snapshots and append-only persistence
- a 128 MB container memory limit and health check

Before applying, save a permissions-restricted backup of docker-compose.yml, record IDs and health of running services, inspect free RAM and disk, and run docker compose config --quiet. Do not print .env or run docker compose down.

Apply only the cache service:

    docker compose up -d --no-deps redis
    docker compose exec -T redis redis-cli ping
    docker compose ps
    docker compose logs --tail=100 redis

Confirm Redis has no published host port, resolves on the existing Compose network, and the existing web, db, and phpmyadmin container IDs and health remain unchanged. Never recreate MySQL or modify its volume.

Redis may log a host-kernel memory-overcommit warning. Verify health with the health check and PING; this cache-only service has persistence and replication disabled. Do not change host sysctl settings as part of the Redis rollout.

## Application rollout status

PHP Redis caching was activated on 2026-10-31 in the authorized PHP-only rollout. Predis was available in the production PHP runtime, Redis resolved by the Docker service name, and the Dashboard APIs verified cache miss/hit behavior and MySQL fallback. The pre-rollout application backup is `/home/ubuntu/cpe-hub/backups/php-redis-cache-predeploy-20261031T151644Z.tar.gz`. The live application uses a read-only bind mount.

The production snapshot worker and recurring scheduler were not included in that rollout and remain disabled pending separate authorization. When deploying ETL cache invalidation, configure it with the same `REDIS_KEY_PREFIX` as PHP.

Do not expose port 6379 through a host mapping, firewall, or security group. Do not copy local .env values to EC2.

## Rollback

For an application rollback, set REDIS_ENABLED=false and apply the environment change using the approved application deployment procedure. PHP falls back to MySQL.

For Redis-only rollout, use the exact backup filename printed during deployment:

    backup=docker-compose.yml.pre-redis.YYYYMMDDTHHMMSSZ.bak
    docker compose stop redis
    cat "$backup" > docker-compose.yml
    docker compose config --quiet

If the temporary Redis container must be removed, remove only that Redis container; do not run docker compose down, remove volumes, or prune Docker resources. The application remains unchanged and cache entries are reconstructible.
