import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ETL_DIR = ROOT / "docker" / "etl"
sys.path.insert(0, str(ETL_DIR))

from cache_invalidation import invalidate_dashboard_cache
from load_warehouse import load_warehouse


class FakeRedis:
    def __init__(self, **options):
        self.options = options
        self.keys = []

    def incr(self, key):
        self.keys.append(key)
        return 1


class FakeCursor:
    def __init__(self, fail=False):
        self.fail = fail
        self.queries = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql):
        self.queries.append(sql)
        if self.fail:
            raise RuntimeError("warehouse write failed")

    def nextset(self):
        return False

    def fetchone(self):
        return (7,)


class FakeConnection:
    def __init__(self, events, fail=False, fail_commit=False):
        self.events = events
        self.cursor_instance = FakeCursor(fail)
        self.fail_commit = fail_commit

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        if self.fail_commit:
            raise RuntimeError("warehouse commit failed")
        self.events.append("commit")

    def close(self):
        self.events.append("close")


class RedisInvalidationTests(unittest.TestCase):
    def test_disabled_cache_does_not_connect(self):
        def should_not_connect(**_options):
            raise AssertionError("Redis must not be contacted when disabled")

        self.assertIsNone(invalidate_dashboard_cache({"REDIS_ENABLED": "false"}, should_not_connect))

    def test_enabled_cache_increments_environment_version_key(self):
        instances = []

        def create_client(**options):
            client = FakeRedis(**options)
            instances.append(client)
            return client

        self.assertTrue(invalidate_dashboard_cache({
            "REDIS_ENABLED": "true",
            "APP_ENV": "production",
            "REDIS_KEY_PREFIX": "cpe:production:",
            "REDIS_HOST": "redis",
            "REDIS_PORT": "6379",
            "REDIS_DB": "0",
            "REDIS_CONNECT_TIMEOUT": "99",
            "REDIS_READ_TIMEOUT": "-1",
        }, create_client))
        self.assertEqual("redis", instances[0].options["host"])
        self.assertEqual(2.0, instances[0].options["socket_connect_timeout"])
        self.assertEqual(0.05, instances[0].options["socket_timeout"])
        self.assertEqual(["cpe:production:warehouse:version"], instances[0].keys)

    def test_redis_connection_failure_does_not_fail_invalidation(self):
        def unavailable(**_options):
            raise ConnectionError("unavailable")

        self.assertFalse(invalidate_dashboard_cache({"REDIS_ENABLED": "true"}, unavailable))

    def test_loader_invalidates_after_successful_load_and_commit(self):
        events = []

        def connect(**_options):
            return FakeConnection(events)

        def invalidate():
            self.assertIn("commit", events)
            events.append("invalidate")

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as sql_file:
            sql_file.write("INSERT INTO fact_asset_inventory VALUES (1);")
            path = Path(sql_file.name)
        try:
            count = load_warehouse(path, connect=connect, cache_invalidator=invalidate)
        finally:
            path.unlink()

        self.assertEqual(7, count)
        self.assertLess(events.index("commit"), events.index("invalidate"))

    def test_failed_warehouse_write_does_not_invalidate(self):
        events = []

        def connect(**_options):
            return FakeConnection(events, fail=True)

        def invalidate():
            events.append("invalidate")

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as sql_file:
            sql_file.write("INVALID SQL;")
            path = Path(sql_file.name)
        try:
            with self.assertRaises(RuntimeError):
                load_warehouse(path, connect=connect, cache_invalidator=invalidate)
        finally:
            path.unlink()

        self.assertNotIn("invalidate", events)

    def test_failed_commit_does_not_invalidate(self):
        events = []

        def connect(**_options):
            return FakeConnection(events, fail_commit=True)

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as sql_file:
            sql_file.write("INSERT INTO fact_asset_inventory VALUES (1);")
            path = Path(sql_file.name)
        try:
            with self.assertRaises(RuntimeError):
                load_warehouse(path, connect=connect, cache_invalidator=lambda: events.append("invalidate"))
        finally:
            path.unlink()

        self.assertNotIn("invalidate", events)
        self.assertIn("close", events)

    def test_cache_invalidation_failure_does_not_fail_successful_load(self):
        events = []

        def connect(**_options):
            return FakeConnection(events)

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as sql_file:
            sql_file.write("INSERT INTO fact_asset_inventory VALUES (1);")
            path = Path(sql_file.name)
        try:
            count = load_warehouse(path, connect=connect, cache_invalidator=lambda: False)
        finally:
            path.unlink()

        self.assertEqual(7, count)
        self.assertIn("commit", events)


if __name__ == "__main__":
    unittest.main()
