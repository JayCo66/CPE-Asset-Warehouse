import assert from "node:assert/strict";
import test from "node:test";
import {
  PORTFOLIO_MATRIX_PAGE_SIZES,
  buildPortfolioMatrixRows,
  createPortfolioMatrixState,
  getPortfolioCategoryShare,
  paginatePortfolioMatrixRows,
  resolvePortfolioDepartment,
  setPortfolioMatrixPage,
  setPortfolioMatrixPageSize,
  setPortfolioMatrixSort,
  sortPortfolioMatrixRows,
} from "../src/asset-inv/portfolio-composition.mjs";

const categories = [
  { key: "10", label: "ครุภัณฑ์สำนักงาน", filterValue: "ครุภัณฑ์สำนักงาน" },
  { key: "20", label: "ครุภัณฑ์คอมพิวเตอร์", filterValue: "ครุภัณฑ์คอมพิวเตอร์" },
  { key: "__unknown__", label: "ไม่ระบุหมวดหมู่", filterValue: "__missing__" },
];

const departments = [
  { key: "1", label: "หน่วยงาน ก", filterValue: "หน่วยงาน ก", totalAssets: 100, distinctTypes: 3 },
  { key: "2", label: "หน่วยงาน ข", filterValue: "หน่วยงาน ข", totalAssets: 50, distinctTypes: 2 },
];

const combinations = [
  { departmentKey: "1", categoryKey: "10", departmentFilterValue: "หน่วยงาน ก", categoryFilterValue: "ครุภัณฑ์สำนักงาน", assets: 75 },
  { departmentKey: "1", categoryKey: "20", departmentFilterValue: "หน่วยงาน ก", categoryFilterValue: "ครุภัณฑ์คอมพิวเตอร์", assets: 20 },
  { departmentKey: "1", categoryKey: "__unknown__", departmentFilterValue: "หน่วยงาน ก", categoryFilterValue: "__missing__", assets: 5 },
  { departmentKey: "2", categoryKey: "10", departmentFilterValue: "หน่วยงาน ข", categoryFilterValue: "ครุภัณฑ์สำนักงาน", assets: 0 },
  { departmentKey: "2", categoryKey: "20", departmentFilterValue: "หน่วยงาน ข", categoryFilterValue: "ครุภัณฑ์คอมพิวเตอร์", assets: 50 },
];

test("portfolio matrix uses five rows by default and the shared size choices", () => {
  assert.deepEqual(PORTFOLIO_MATRIX_PAGE_SIZES, [5, 10, 25, "all"]);
  assert.deepEqual(createPortfolioMatrixState(), {
    page: 1,
    pageSize: 5,
    sortKey: "totalAssets",
    direction: "desc",
  });
});

test("builds every department/category cell and keeps zero and unknown categories distinct", () => {
  const matrix = buildPortfolioMatrixRows(departments, categories, combinations);
  assert.equal(matrix.complete, true);
  assert.equal(matrix.rows.length, 2);
  assert.equal(matrix.rows[0].categoryCounts.get("10"), 75);
  assert.equal(matrix.rows[0].categoryCounts.get("__unknown__"), 5);
  assert.equal(matrix.rows[1].categoryCounts.get("10"), 0);
  assert.equal(matrix.rows[1].categoryCounts.get("20"), 50);
});

test("flags a missing or unmatched matrix payload rather than presenting partial composition", () => {
  assert.equal(buildPortfolioMatrixRows(departments, categories, undefined).complete, false);
  const unmatched = buildPortfolioMatrixRows(departments, categories, [
    { departmentKey: "unknown-department", categoryKey: "10", assets: 3 },
  ]);
  assert.equal(unmatched.complete, false);
});

test("category share uses the selected department total and handles zero denominators", () => {
  assert.equal(getPortfolioCategoryShare(75, 100), 75);
  assert.equal(getPortfolioCategoryShare(0, 50), 0);
  assert.equal(getPortfolioCategoryShare(1, 0), null);
  assert.equal(getPortfolioCategoryShare(null, 50), null);
});

test("sorts the complete department dataset by total or category count before pagination", () => {
  const rows = buildPortfolioMatrixRows(departments, categories, combinations).rows;
  const expandedRows = [...rows, ...[
    ["3", "หน่วยงาน ค", 40],
    ["4", "หน่วยงาน ง", 30],
    ["5", "หน่วยงาน จ", 10],
    ["6", "หน่วยงาน ฉ", 0],
  ].map(([key, label, assets]) => ({ key, label, totalAssets: 1, categoryCounts: new Map([["20", assets]]) }))];
  assert.deepEqual(sortPortfolioMatrixRows(rows, "totalAssets", "desc").map((row) => row.key), ["1", "2"]);
  assert.deepEqual(sortPortfolioMatrixRows(expandedRows, "category:20", "desc").map((row) => row.key), ["2", "3", "4", "1", "5", "6"]);
  const page = paginatePortfolioMatrixRows(expandedRows, createPortfolioMatrixState({ sortKey: "category:20" }));
  assert.equal(page.totalRows, 6);
  assert.deepEqual(page.rows.map((row) => row.key), ["2", "3", "4", "1", "5"]);
});

test("keeps missing sort values last in either direction and treats zero as a value", () => {
  const rows = [
    { key: "missing", label: "หน่วยงาน ง", totalAssets: 5, categoryCounts: new Map([["10", null]]) },
    { key: "zero", label: "หน่วยงาน ค", totalAssets: 5, categoryCounts: new Map([["10", 0]]) },
    { key: "value", label: "หน่วยงาน ข", totalAssets: 5, categoryCounts: new Map([["10", 3]]) },
  ];
  assert.deepEqual(sortPortfolioMatrixRows(rows, "category:10", "asc").map((row) => row.key), ["zero", "value", "missing"]);
  assert.deepEqual(sortPortfolioMatrixRows(rows, "category:10", "desc").map((row) => row.key), ["value", "zero", "missing"]);
});

test("clamps pages, preserves selection across sorting, and resets only pagination controls", () => {
  const rows = buildPortfolioMatrixRows(departments, categories, combinations).rows;
  const elevenRows = Array.from({ length: 11 }, (_, index) => ({ key: String(index), label: `Department ${index}`, totalAssets: index, categoryCounts: new Map() }));
  assert.equal(paginatePortfolioMatrixRows(elevenRows, createPortfolioMatrixState({ page: 9 })).page, 3);
  assert.equal(resolvePortfolioDepartment(rows, "2").key, "2");
  assert.equal(resolvePortfolioDepartment(rows, "gone").key, "1");
  assert.equal(resolvePortfolioDepartment([], "2"), null);
  const resized = setPortfolioMatrixPageSize(createPortfolioMatrixState({ page: 3 }), 25);
  assert.deepEqual(resized, { page: 1, pageSize: 25, sortKey: "totalAssets", direction: "desc" });
  const sorted = setPortfolioMatrixSort(resized, "category:20", "asc");
  assert.equal(sorted.page, 1);
  assert.equal(sorted.sortKey, "category:20");
  assert.equal(setPortfolioMatrixPage(sorted, 99, 30).page, 2);
});
