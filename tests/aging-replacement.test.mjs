import assert from "node:assert/strict";
import test from "node:test";

import {
  AGING_BAND_KEYS,
  AGING_PAGE_SIZES,
  buildAgingExposureRows,
  buildDetailedAgeMatrixRows,
  buildReplacementLens,
  createAgingTableState,
  paginateAgingRows,
  resolveAgingDepartmentFocus,
  setAgingPage,
  setAgingPageSize,
  setAgingSort,
} from "../src/asset-inv/aging-replacement.mjs";

test("replacement lens reconciles under-threshold, above-threshold, and unknown ages", () => {
  const result = buildReplacementLens({
    totalAssets: 12,
    assetsWithKnownAge: 10,
    assetsOlderThanThreshold: 6,
    oldAssetRate: 60,
    averageAssetAge: 10.8,
  }, { "0-2": 0, "3-5": 0, "6-10": 4, "11-15": 6, "16-20": 0, "over-20": 0, unknown: 2 });

  assert.equal(result.available, true);
  assert.deepEqual(result.segments.map(({ key, count }) => [key, count]), [
    ["under", 4], ["over", 6], ["unknown", 2],
  ]);
  assert.equal(result.metrics.exposureRate, 60);
  assert.equal(result.metrics.averageAssetAge, 10.8);
});

test("replacement lens withholds inconsistent and unavailable totals", () => {
  const inconsistent = buildReplacementLens({
    totalAssets: 12, assetsWithKnownAge: 10, assetsOlderThanThreshold: 6,
  }, { unknown: 1 });
  const unavailable = buildReplacementLens({ totalAssets: null }, {});

  assert.equal(inconsistent.available, false);
  assert.equal(unavailable.available, false);
});

test("exposure rows preserve null metrics and derive unknown-age counts from known age", () => {
  const rows = buildAgingExposureRows([
    { key: "dept-1", label: "หน่วยงานหนึ่ง", totalAssets: 12, assetsWithKnownAge: 10, assetsOlderThanThreshold: 6, oldAssetRate: 60, averageAssetAge: 10.8 },
    { key: "dept-2", label: "หน่วยงานสอง", totalAssets: 0, assetsWithKnownAge: 0, assetsOlderThanThreshold: 0, oldAssetRate: null, averageAssetAge: null },
    { key: "dept-3", label: "ไม่ทราบอายุ", totalAssets: 4, assetsWithKnownAge: null, assetsOlderThanThreshold: null, oldAssetRate: null, averageAssetAge: null },
  ]);

  assert.equal(rows[0].unknownAgeAssets, 2);
  assert.equal(rows[1].unknownAgeAssets, 0);
  assert.equal(rows[1].assetsOlderThanThreshold, 0);
  assert.equal(rows[1].oldAssetRate, null);
  assert.equal(rows[2].unknownAgeAssets, null);
  assert.equal(rows[2].assetsOlderThanThreshold, null);
});

test("detailed matrix joins using stable dimension keys and normalizes within each row", () => {
  const entities = [
    { key: "7", label: "ชื่อซ้ำ", filterValue: "ชื่อซ้ำ", totalAssets: 4 },
    { key: "8", label: "ชื่อซ้ำ", filterValue: "ชื่อซ้ำ", totalAssets: 2 },
  ];
  const groups = [
    { dimensionKey: "7", dimension: "ชื่อซ้ำ", ageBand: "0-2", assets: 3 },
    { dimensionKey: "7", dimension: "ชื่อซ้ำ", ageBand: "unknown", assets: 1 },
    { dimensionKey: "8", dimension: "ชื่อซ้ำ", ageBand: "11-15", assets: 2 },
  ];

  const result = buildDetailedAgeMatrixRows(entities, groups);

  assert.equal(result.available, true);
  assert.deepEqual(result.rows.map((row) => row.key), ["7", "8"]);
  assert.equal(result.rows[0].counts["0-2"], 3);
  assert.equal(result.rows[0].shares["0-2"], 75);
  assert.equal(result.rows[0].shares.unknown, 25);
  assert.equal(result.rows[1].counts["0-2"], 0);
  assert.equal(result.rows[1].shares["11-15"], 100);
  assert.deepEqual(AGING_BAND_KEYS, ["0-2", "3-5", "6-10", "11-15", "16-20", "over-20", "unknown"]);
});

test("detailed matrix does not present incomplete age-group totals as complete", () => {
  const result = buildDetailedAgeMatrixRows(
    [{ key: "7", label: "หน่วยงาน", filterValue: "หน่วยงาน", totalAssets: 4 }],
    [{ dimensionKey: "7", ageBand: "0-2", assets: 3 }],
  );

  assert.equal(result.available, false);
  assert.equal(result.rows[0].complete, false);
});

test("exposure sorting happens before pagination and keeps missing values last", () => {
  const source = [
    { key: "a", label: "ก", oldAssetRate: 10, assetsOlderThanThreshold: 1 },
    { key: "missing", label: "ไม่ทราบ", oldAssetRate: null, assetsOlderThanThreshold: null },
    { key: "b", label: "ข", oldAssetRate: 80, assetsOlderThanThreshold: 2 },
    { key: "zero", label: "ศูนย์", oldAssetRate: 0, assetsOlderThanThreshold: 0 },
    { key: "c", label: "ค", oldAssetRate: 40, assetsOlderThanThreshold: 3 },
    { key: "d", label: "ง", oldAssetRate: 20, assetsOlderThanThreshold: 4 },
  ];
  const page = paginateAgingRows(source, createAgingTableState({ pageSize: 5, sortKey: "oldAssetRate", direction: "desc" }));

  assert.deepEqual(page.rows.map((row) => row.key), ["b", "c", "d", "a", "zero"]);
  assert.equal(page.totalRows, 6);
  assert.equal(page.totalPages, 2);
});

test("aging pagination uses supported sizes and resets only the chosen view state", () => {
  assert.deepEqual(AGING_PAGE_SIZES, [5, 10, 25, "all"]);
  let state = createAgingTableState({ page: 3, pageSize: 10, sortKey: "totalAssets" });
  state = setAgingPageSize(state, 25);
  assert.equal(state.page, 1);
  assert.equal(state.pageSize, 25);
  state = setAgingPage(state, 2, 70);
  state = setAgingSort(state, "averageAssetAge", "asc");
  assert.equal(state.page, 1);
  assert.equal(state.sortKey, "averageAssetAge");
  assert.equal(state.direction, "asc");
  assert.equal(createAgingTableState({ pageSize: 50 }).pageSize, 5);
});

test("department focus persists while present and falls back safely when filtered out", () => {
  const rows = [{ key: "a", label: "ก" }, { key: "b", label: "ข" }];

  assert.equal(resolveAgingDepartmentFocus(rows, "b").key, "b");
  assert.equal(resolveAgingDepartmentFocus(rows.slice(0, 1), "b").key, "a");
  assert.equal(resolveAgingDepartmentFocus([], "b"), null);
});
