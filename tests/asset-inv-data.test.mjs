import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAssetInventoryCsv,
  compareInventorySnapshots,
  filterAssetRows,
  normalizeSnapshotSummary,
} from "../src/asset-inv/inventory-data.mjs";

const currentSnapshot = {
  snapshotDateKey: 20261022,
  snapshotDate: "2026-10-22",
  total: 4,
  ready: 3,
  missingLocation: 1,
  ageBands: { zeroToTwo: 1, threeToFive: 1, sixToEight: 1, ninePlus: 1, unknown: 0 },
};

test("keeps unavailable and inconsistent summaries unavailable instead of inventing values", () => {
  assert.equal(normalizeSnapshotSummary(null), null);
  assert.equal(
    normalizeSnapshotSummary({ ...currentSnapshot, ready: 5 }),
    null,
  );
  assert.equal(
    normalizeSnapshotSummary({ ...currentSnapshot, ageBands: { ...currentSnapshot.ageBands, unknown: 2 } }),
    null,
  );
});

test("normalizes valid connected snapshot summaries without changing their counts", () => {
  assert.deepEqual(normalizeSnapshotSummary(currentSnapshot), currentSnapshot);
});

test("does not compare snapshots when a previous snapshot is unavailable", () => {
  assert.equal(compareInventorySnapshots(currentSnapshot, null), null);
});

test("compares real snapshot counts and percentage-point changes", () => {
  const previousSnapshot = {
    ...currentSnapshot,
    snapshotDateKey: 20250930,
    snapshotDate: "2025-09-30",
    total: 3,
    ready: 2,
    missingLocation: 1,
    ageBands: { zeroToTwo: 1, threeToFive: 1, sixToEight: 1, ninePlus: 0, unknown: 0 },
  };

  assert.deepEqual(compareInventorySnapshots(currentSnapshot, previousSnapshot), {
    total: { current: 4, previous: 3, delta: 1 },
    ready: { current: 3, previous: 2, delta: 1, percentagePointDelta: 8.3 },
    located: { current: 3, previous: 2, delta: 1, percentagePointDelta: 8.3 },
  });
});

test("filters only the supplied page using the active search, status, and type criteria", () => {
  const pageRows = [
    { asset_code: "CPE-1", asset_name: "เครื่องฉาย", type_name: "ภาพและเสียง", asset_status: "พร้อมใช้งาน" },
    { asset_code: "CPE-2", asset_name: "คอมพิวเตอร์", type_name: "คอมพิวเตอร์", asset_status: "ชำรุด" },
  ];

  assert.deepEqual(
    filterAssetRows(pageRows, { search: "cpe-1", status: "พร้อมใช้งาน", type: "ภาพและเสียง" }),
    [pageRows[0]],
  );
  assert.deepEqual(filterAssetRows(pageRows, { search: "not on this page" }), []);
});

test("exports only rows matching the active search and filters from the supplied page", () => {
  const currentPageRows = [
    { asset_code: "CPE-1", asset_name: "เครื่องฉาย", type_name: "ภาพและเสียง", asset_status: "พร้อมใช้งาน" },
    { asset_code: "CPE-2", asset_name: "คอมพิวเตอร์", type_name: "คอมพิวเตอร์", asset_status: "ชำรุด" },
  ];
  const matchingRows = filterAssetRows(currentPageRows, {
    search: "CPE-1",
    status: "พร้อมใช้งาน",
    type: "ภาพและเสียง",
  });
  const csv = buildAssetInventoryCsv(matchingRows);

  assert.match(csv, /"CPE-1"/);
  assert.doesNotMatch(csv, /"CPE-2"/);
  assert.equal(matchingRows.length, 1);
});

test("exports Thai headings, quotes cell contents, and neutralizes spreadsheet formulas", () => {
  const csv = buildAssetInventoryCsv([
    {
      asset_code: "CPE-1",
      asset_name: 'เครื่อง "พิเศษ"',
      type_name: "ภาพและเสียง",
      brand: "=HYPERLINK(\"https://example.invalid\")",
      asset_status: "พร้อมใช้งาน",
      year_purchase: 2568,
      department_name: "ภาควิชา",
      location_id: 12,
      snapshot_date: "2026-10-22",
    },
  ]);

  assert.ok(csv.startsWith("\uFEFF\"รหัสสินทรัพย์\",\"ชื่อสินทรัพย์\""));
  assert.match(csv.split("\r\n", 1)[0], /"วันที่ข้อมูล"/u);
  assert.match(csv, /"เครื่อง ""พิเศษ"""/);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/);
  assert.match(csv, /"2026-10-22"/);
});
