import test from "node:test";
import assert from "node:assert/strict";

import {
  combineBorrowHistory,
  filterAssetHistory,
  normalizeAssetId,
  sortMaintenanceHistory,
} from "../src/asset-inv/asset-detail.mjs";

test("normalizes positive asset IDs and rejects invalid route values", () => {
  assert.equal(normalizeAssetId("754"), 754);
  assert.equal(normalizeAssetId("0"), null);
  assert.equal(normalizeAssetId("not-an-id"), null);
});

test("filters maintenance and borrowing rows by asset ID", () => {
  const rows = [{ asset_id: 754 }, { asset_id: 2854 }, { asset_id: 754 }];

  assert.deepEqual(filterAssetHistory(rows, 754), [{ asset_id: 754 }, { asset_id: 754 }]);
  assert.deepEqual(filterAssetHistory(rows, 999), []);
});

test("joins borrow item history with its request details", () => {
  const items = [
    { id: 1, request_id: 10, asset_id: 754, return_status: "คืนแล้ว" },
    { id: 2, request_id: 11, asset_id: 754, return_status: "ยังไม่คืน" },
    { id: 3, request_id: 12, asset_id: 2854, return_status: "คืนแล้ว" },
  ];
  const requests = [
    { id: 10, borrow_date: "2024-10-01", reason: "ใช้งานในห้องเรียน" },
    { id: 11, borrow_date: "2025-01-01", reason: "ใช้งานในกิจกรรม" },
  ];

  assert.deepEqual(combineBorrowHistory(items, requests, 754), [
    {
      id: 2,
      request_id: 11,
      asset_id: 754,
      return_status: "ยังไม่คืน",
      borrow_date: "2025-01-01",
      reason: "ใช้งานในกิจกรรม",
    },
    {
      id: 1,
      request_id: 10,
      asset_id: 754,
      return_status: "คืนแล้ว",
      borrow_date: "2024-10-01",
      reason: "ใช้งานในห้องเรียน",
    },
  ]);
});

test("sorts maintenance history newest first", () => {
  const rows = [
    { id: 1, asset_id: 754, repair_date: "2024-10-01" },
    { id: 2, asset_id: 754, repair_date: "2025-02-01" },
    { id: 3, asset_id: 2854, repair_date: "2026-01-01" },
  ];

  assert.deepEqual(sortMaintenanceHistory(rows, 754).map((row) => row.id), [2, 1]);
});
