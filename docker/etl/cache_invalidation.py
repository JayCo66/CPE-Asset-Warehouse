"""Invalidate dashboard cache generations after a successful warehouse load."""

import os
from collections.abc import Callable, Mapping
from typing import Any


def _timeout(env: Mapping[str, str], name: str) -> float:
    try:
        value = float(env.get(name, "0.2"))
    except (TypeError, ValueError):
        value = 0.2
    return max(0.05, min(2.0, value))


def invalidate_dashboard_cache(
    environment: Mapping[str, str] | None = None,
    client_factory: Callable[..., Any] | None = None,
) -> bool | None:
    env = os.environ if environment is None else environment
    if env.get("REDIS_ENABLED", "false").strip().lower() not in {"1", "true", "yes", "on"}:
        return None

    try:
        if client_factory is None:
            from redis import Redis

            client_factory = Redis

        prefix = env.get("REDIS_KEY_PREFIX", f"cpe:{env.get('APP_ENV', 'local')}:")
        client = client_factory(
            host=env.get("REDIS_HOST", "127.0.0.1"),
            port=int(env.get("REDIS_PORT", "6379")),
            db=int(env.get("REDIS_DB", "0")),
            socket_connect_timeout=_timeout(env, "REDIS_CONNECT_TIMEOUT"),
            socket_timeout=_timeout(env, "REDIS_READ_TIMEOUT"),
            decode_responses=True,
        )
        client.incr(f"{prefix}warehouse:version")
        close = getattr(client, "close", None)
        if close is not None:
            try:
                close()
            except Exception:
                pass
        return True
    except Exception:
        return False
