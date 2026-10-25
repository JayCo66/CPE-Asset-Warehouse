import assert from "node:assert/strict";
import test from "node:test";

import {
  DEPARTMENT_COMPARISON_PAGE_SIZES,
  createDepartmentComparisonState,
  getDepartmentHeatLevel,
  getDepartmentKey,
  paginateDepartmentRows,
  resolveSelectedDepartment,
  setDepartmentPage,
  setDepartmentPageSize,
  setDepartmentSort,
  sortDepartmentRows,
} from "../src/asset-inv/department-comparison.mjs";

test("department comparison defaults to five rows and supports All", () => {
  assert.deepEqual(DEPARTMENT_COMPARISON_PAGE_SIZES, [5, 10, 25, "all"]);
  assert.deepEqual(createDepartmentComparisonState(), {
    page: 1,
    pageSize: 5,
    sortKey: "totalAssets",
    direction: "desc",
  });
});

test("sorts the complete department list before slicing and clamps the requested page", () => {
  const source = [
    { key: "a", label: "ก", totalAssets: 10 },
    { key: "b", label: "ข", totalAssets: 70 },
    { key: "c", label: "ค", totalAssets: 40 },
    { key: "d", label: "ง", totalAssets: 100 },
    { key: "e", label: "จ", totalAssets: 20 },
    { key: "f", label: "ฉ", totalAssets: 80 },
    { key: "g", label: "ช", totalAssets: 30 },
  ];

  const page = paginateDepartmentRows(source, createDepartmentComparisonState({ page: 3 }));

  assert.deepEqual(page.rows.map((row) => row.key), ["e", "a"]);
  assert.equal(page.totalRows, 7);
  assert.equal(page.totalPages, 2);
  assert.equal(page.page, 2);
  assert.deepEqual(source.map((row) => row.key), ["a", "b", "c", "d", "e", "f", "g"]);
});

test("missing metrics sort last in both directions while zero remains a valid value", () => {
  const rows = [
    { key: "missing", label: "ไม่ทราบ", damageRate: null },
    { key: "zero", label: "ศูนย์", damageRate: 0 },
    { key: "higher", label: "สูง", damageRate: 25 },
  ];

  assert.deepEqual(sortDepartmentRows(rows, "damageRate", "asc").map(getDepartmentKey), ["zero", "higher", "missing"]);
  assert.deepEqual(sortDepartmentRows(rows, "damageRate", "desc").map(getDepartmentKey), ["higher", "zero", "missing"]);
});

test("department sort is deterministic for equal metrics using Thai labels and stable keys", () => {
  const rows = [
    { key: "2", label: "หน่วยงาน ก", totalAssets: 5 },
    { key: "3", label: "หน่วยงาน ข", totalAssets: 5 },
    { key: "1", label: "หน่วยงาน ก", totalAssets: 5 },
  ];

  assert.deepEqual(sortDepartmentRows(rows, "totalAssets", "desc").map(getDepartmentKey), ["1", "2", "3"]);
});

test("heat intensity is relative per metric and distinguishes zero, missing, and equal values", () => {
  assert.equal(getDepartmentHeatLevel(null, [0, 50, 100]), null);
  assert.equal(getDepartmentHeatLevel(0, [0, 50, 100]), 0);
  assert.equal(getDepartmentHeatLevel(50, [0, 50, 100]), 0.5);
  assert.equal(getDepartmentHeatLevel(100, [0, 50, 100]), 1);
  assert.equal(getDepartmentHeatLevel(7, [7, 7, 7]), 0.5);
  assert.equal(getDepartmentHeatLevel(0, [0, 0]), 0);
});

test("selection survives pagination and sorting, falls back after filtering, and handles empty data", () => {
  const rows = [
    { key: "a", label: "ก", totalAssets: 6 },
    { key: "b", label: "ข", totalAssets: 5 },
    { key: "c", label: "ค", totalAssets: 4 },
    { key: "d", label: "ง", totalAssets: 3 },
    { key: "e", label: "จ", totalAssets: 2 },
    { key: "f", label: "ฉ", totalAssets: 1 },
  ];
  const page = paginateDepartmentRows(rows, createDepartmentComparisonState({ page: 2 }));

  assert.deepEqual(getDepartmentKey(resolveSelectedDepartment(rows, "a")), "a");
  assert.equal(page.rows.some((row) => getDepartmentKey(row) === "a"), false);
  assert.deepEqual(getDepartmentKey(resolveSelectedDepartment(rows.slice(1), "a")), "b");
  assert.equal(resolveSelectedDepartment([], "a"), null);
});

test("page size and sort changes reset the page; all-results mode uses one page", () => {
  let state = createDepartmentComparisonState({ page: 4, pageSize: 10, sortKey: "damageRate" });
  state = setDepartmentPageSize(state, 25);
  assert.equal(state.page, 1);
  assert.equal(state.pageSize, 25);

  state = setDepartmentPage(state, 2, 60);
  state = setDepartmentSort(state, "availabilityRate", "asc");
  assert.equal(state.page, 1);
  assert.equal(state.sortKey, "availabilityRate");
  assert.equal(state.direction, "asc");

  const all = paginateDepartmentRows(Array.from({ length: 30 }, (_, index) => ({
    key: String(index), label: `หน่วยงาน ${index}`, totalAssets: index,
  })), createDepartmentComparisonState({ pageSize: "all", page: 4 }));
  assert.equal(all.rows.length, 30);
  assert.equal(all.totalPages, 1);
  assert.equal(all.page, 1);
});
