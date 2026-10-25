import ast
import json
import os
import re
import tempfile
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TREE = ast.parse((ROOT / "etl_warehouse.py").read_text(encoding="utf-8"))
FUNCTION = next(node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name == "load_history")
ARCHIVE_FUNCTION = next(node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name == "archive_assets_snapshot")
MODULE = ast.Module(body=[FUNCTION, ARCHIVE_FUNCTION], type_ignores=[])
NAMESPACE = {"os": os, "re": re, "json": json, "uuid": uuid, "datetime": datetime, "timezone": timezone}
exec(compile(MODULE, str(ROOT / "etl_warehouse.py"), "exec"), NAMESPACE)
load_history = NAMESPACE["load_history"]


class InventorySnapshotHistoryTests(unittest.TestCase):
    def test_same_day_snapshots_keep_distinct_stable_ids_and_metadata(self):
        legacy_id = "be5166d5-2bc0-5ecc-8176-54a6260df3f4"
        imported_id = "8d3b8504-c8f8-4e3a-a450-84776d8a121f"
        with tempfile.TemporaryDirectory() as temp_dir:
            history = Path(temp_dir)
            (history / "assets_20261025.json").write_text(
                json.dumps({"snapshot_date": "2026-10-25", "data": [{"asset_id": 1}]}), encoding="utf-8"
            )
            (history / f"assets_20261025__{imported_id}.json").write_text(
                json.dumps({
                    "snapshot_id": imported_id,
                    "snapshot_date": "2026-10-25",
                    "snapshot_label": "UNIVERSITY-2026-10-25-8D3B8504",
                    "source_system": "university_api",
                    "imported_at": "2026-10-25 03:00:00",
                    "data": [{"asset_id": 2}],
                }), encoding="utf-8"
            )
            metadata = {
                "assets_20261025.json": {
                    "snapshot_id": legacy_id,
                    "snapshot_date": "2026-10-25",
                    "snapshot_label": "DEMO-2026-10-25",
                    "source_system": "demo_seed",
                    "imported_at": None,
                    "asset_count": 1,
                }
            }

            first = load_history(history, metadata)
            second = load_history(history, metadata)

            self.assertEqual(2, len(first))
            self.assertEqual({legacy_id, imported_id}, {snapshot["snapshot_id"] for snapshot in first})
            self.assertEqual(["DEMO-2026-10-25", "UNIVERSITY-2026-10-25-8D3B8504"], [s["snapshot_label"] for s in first])
            self.assertEqual([s["snapshot_id"] for s in first], [s["snapshot_id"] for s in second])
            self.assertEqual([1, 2], [s["data"][0]["asset_id"] for s in first])

    def test_etl_archives_a_distinct_same_day_capture_without_overwriting_history(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            history = Path(temp_dir)
            legacy_path = history / "assets_20261025.json"
            legacy_document = {"snapshot_date": "2026-10-25", "data": [{"asset_id": 1}]}
            legacy_path.write_text(json.dumps(legacy_document), encoding="utf-8")
            new_assets = [{"asset_id": 2}]

            captured = NAMESPACE["archive_assets_snapshot"](
                str(history), datetime(2026, 10, 25), new_assets, "etl_assets_api"
            )

            self.assertIsNotNone(captured)
            self.assertEqual(legacy_document, json.loads(legacy_path.read_text(encoding="utf-8")))
            self.assertEqual(2, len(list(history.glob("*.json"))))
            self.assertEqual(captured["snapshot_id"], json.loads((history / captured["archive_key"]).read_text(encoding="utf-8"))["snapshot_id"])
            self.assertIsNone(NAMESPACE["archive_assets_snapshot"](
                str(history), datetime(2026, 10, 25), new_assets, "etl_assets_api"
            ))


if __name__ == "__main__":
    unittest.main()
