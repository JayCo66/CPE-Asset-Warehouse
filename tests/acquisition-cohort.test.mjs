import assert from "node:assert/strict";
import test from "node:test";

import {
  ACQUISITION_PAGE_SIZES,
  buildAcquisitionCohortDrillFilters,
  buildAcquisitionBreakdown,
  buildAcquisitionCrossDimensionDrillFilters,
  buildAcquisitionCrossDimensionRows,
  buildAcquisitionFocus,
  buildAcquisitionHeatmap,
  buildAcquisitionOverview,
  createAcquisitionTableState,
  createAcquisitionHeatmapState,
  paginateAcquisitionHeatmapRows,
  paginateAcquisitionRows,
  setAcquisitionHeatmapPageSize,
  setAcquisitionPage,
  setAcquisitionPageSize,
  setAcquisitionSort,
} from "../src/asset-inv/acquisition-cohort.mjs";

const metric = (totalAssets, overrides = {}) => ({
  totalAssets,
  assetsWithKnownAge: totalAssets,
  averageAssetAge: 4,
  assetsOlderThanThreshold: 1,
  oldAssetRate: totalAssets > 0 ? 100 / totalAssets : null,
  ...overrides,
});

const data = {
  years: [
    { key: "year:2024", label: "2024", filterValue: "2024", ...metric(9) },
    { key: "year:2023", label: "2023", filterValue: "2023", ...metric(3) },
    { key: "year:unknown", label: "ไม่ระบุปีจัดหา", filterValue: "__missing__", ...metric(2) },
  ],
  fiscalYears: [
    { key: "fiscal:2568", label: "2568", filterValue: "2568", ...metric(8) },
    { key: "fiscal:unknown", label: "ไม่ระบุปีงบประมาณจัดหา", filterValue: "__missing__", ...metric(1) },
  ],
  sources: [
    { key: "source:income", label: "เงินรายได้", filterValue: "เงินรายได้", totalAssets: 8 },
    { key: "source:budget", label: "เงินงบประมาณ", filterValue: "เงินงบประมาณ", totalAssets: 6 },
    { key: "source:unknown", label: "ไม่ระบุแหล่งเงิน", filterValue: "__missing__", totalAssets: 0 },
  ],
  bySource: [
    { firstKey: "year:2024", secondKey: "source:income", firstFilterValue: "2024", secondFilterValue: "เงินรายได้", ...metric(7, { assetsWithKnownAge: 5, averageAssetAge: 6, assetsOlderThanThreshold: 2, oldAssetRate: 40 }) },
    { firstKey: "year:2024", secondKey: "source:budget", firstFilterValue: "2024", secondFilterValue: "เงินงบประมาณ", ...metric(2, { assetsWithKnownAge: 2, averageAssetAge: 1, assetsOlderThanThreshold: 0, oldAssetRate: 0 }) },
    { firstKey: "year:2023", secondKey: "source:income", firstFilterValue: "2023", secondFilterValue: "เงินรายได้", ...metric(3) },
    { firstKey: "year:unknown", secondKey: "source:unknown", firstFilterValue: "__missing__", secondFilterValue: "__missing__", ...metric(2) },
  ],
  byFiscalSource: [
    { firstKey: "fiscal:2568", secondKey: "source:income", firstFilterValue: "2568", secondFilterValue: "เงินรายได้", ...metric(8) },
    { firstKey: "fiscal:unknown", secondKey: "source:unknown", firstFilterValue: "__missing__", secondFilterValue: "__missing__", ...metric(1) },
  ],
  byDepartment: [
    { firstKey: "year:2024", secondKey: "dept:a", first: "2024", second: "หน่วยงาน ก", firstFilterValue: "2024", secondFilterValue: "หน่วยงาน ก", ...metric(5) },
    { firstKey: "year:2024", secondKey: "dept:b", first: "2024", second: "หน่วยงาน ข", firstFilterValue: "2024", secondFilterValue: "หน่วยงาน ข", ...metric(4) },
  ],
  byFiscalCategory: [
    { firstKey: "fiscal:2568", secondKey: "cat:a", first: "2568", second: "คอมพิวเตอร์", firstFilterValue: "2568", secondFilterValue: "คอมพิวเตอร์", ...metric(8) },
  ],
  cohortDetails: {
    year: {
      department: [
        { cohortKey: "year:2024", sourceKey: "source:income", dimensionKey: "dept:a", cohortFilterValue: "2024", sourceFilterValue: "เงินรายได้", dimension: "หน่วยงาน ก", dimensionFilterValue: "หน่วยงาน ก", ...metric(6) },
        { cohortKey: "year:2024", sourceKey: "source:budget", dimensionKey: "dept:b", cohortFilterValue: "2024", sourceFilterValue: "เงินงบประมาณ", dimension: "หน่วยงาน ข", dimensionFilterValue: "หน่วยงาน ข", ...metric(2) },
        { cohortKey: "year:2023", sourceKey: "source:income", dimensionKey: "dept:a", cohortFilterValue: "2023", sourceFilterValue: "เงินรายได้", dimension: "หน่วยงาน ก", dimensionFilterValue: "หน่วยงาน ก", ...metric(3) },
      ],
      category: [],
      type: [],
    },
    fiscalYear: { department: [], category: [], type: [] },
  },
};

test("acquisition table defaults to five rows, supported sizes, complete-sort-before-page, and safe clamping", () => {
  assert.deepEqual(ACQUISITION_PAGE_SIZES, [5, 10, 25, "all"]);
  const rows = Array.from({ length: 12 }, (_, index) => ({
    key: String(index), label: `หน่วยงาน ${String(index).padStart(2, "0")}`,
    totalAssets: index === 0 ? null : 13 - index,
  }));
  const state = createAcquisitionTableState();
  assert.deepEqual(state, { page: 1, pageSize: 5, sortKey: "totalAssets", direction: "desc" });
  assert.equal(paginateAcquisitionRows(rows, state).rows[0].totalAssets, 12);
  assert.equal(paginateAcquisitionRows(rows, { ...state, page: 99 }).page, 3);
  assert.equal(paginateAcquisitionRows(rows, { ...state, page: 3 }).rows.at(-1).totalAssets, null);
  assert.equal(setAcquisitionPageSize(state, 10).page, 1);
  assert.equal(setAcquisitionPageSize(state, 7).pageSize, 5);
  assert.equal(setAcquisitionSort({ ...state, page: 2 }, "label", "asc").page, 1);
  assert.equal(setAcquisitionPage(state, 99, 12).page, 3);
});

test("heatmap uses stored calendar and fiscal dimensions, retains unknown groups, and normalizes across all rows", () => {
  const calendar = buildAcquisitionHeatmap(data, "year");
  assert.deepEqual(calendar.rows.map((row) => row.key), ["year:2024", "year:2023", "year:unknown"]);
  assert.equal(calendar.rows[0].cells.find((cell) => cell.key === "source:income").count, 7);
  assert.equal(calendar.rows[0].cells.find((cell) => cell.key === "source:budget").count, 2);
  assert.equal(calendar.rows[0].cells.find((cell) => cell.key === "source:unknown").count, 0);
  assert.equal(calendar.rows[0].cells.find((cell) => cell.key === "source:income").intensity, 1);
  assert.equal(calendar.rows[2].cells.find((cell) => cell.key === "source:unknown").count, 2);
  assert.equal(calendar.maxCount, 7);

  const fiscal = buildAcquisitionHeatmap(data, "fiscalYear");
  assert.deepEqual(fiscal.rows.map((row) => row.label), ["2568", "ไม่ระบุปีงบประมาณจัดหา"]);
  assert.equal(fiscal.rows[0].cells.find((cell) => cell.key === "source:income").count, 8);
  assert.equal(fiscal.rows.some((row) => row.label === "2024"), false);
});

test("heatmap keeps unavailable data distinct from confirmed zero combinations", () => {
  assert.equal(buildAcquisitionHeatmap({ years: data.years, sources: data.sources }, "year").available, false);
  assert.equal(buildAcquisitionHeatmap({ years: [], sources: [], bySource: [] }, "year").rows.length, 0);
});

test("heatmap pagination retains newest-first source order and clamps pages independently", () => {
  const heatmap = buildAcquisitionHeatmap(data, "year");
  const state = createAcquisitionHeatmapState({ page: 99, pageSize: 5 });
  assert.deepEqual(paginateAcquisitionHeatmapRows(heatmap.rows, state).rows.map((row) => row.label), ["2024", "2023", "ไม่ระบุปีจัดหา"]);
  assert.equal(paginateAcquisitionHeatmapRows(heatmap.rows, state).page, 1);
  assert.deepEqual(setAcquisitionHeatmapPageSize(state, 10), { page: 1, pageSize: 10 });
});

test("overview derives calendar-year coverage and dominant source asset share without treating it as money", () => {
  const result = buildAcquisitionOverview(data, 14, {
    assetsOlderThanThreshold: 4,
    assetsWithKnownAge: 12,
    oldAssetRate: 33.3,
  });
  assert.deepEqual(result.yearCoverage, { earliest: "2023", latest: "2024", distinctYears: 2 });
  assert.equal(result.dominantSource.label, "เงินรายได้");
  assert.equal(result.dominantSource.assetShareRate, 57.1);
  assert.equal(result.aging.assetsOlderThanThreshold, 4);
  assert.equal(buildAcquisitionOverview({ years: [], sources: [] }, 0, {}).yearCoverage, null);
});

test("cohort focus reports funding-specific metrics and within-cohort source share", () => {
  const focus = buildAcquisitionFocus(data, 14, "year", "year:2024", "source:income");
  assert.equal(focus.selectionType, "funding");
  assert.equal(focus.totalAssets, 7);
  assert.equal(focus.portfolioShareRate, 50);
  assert.equal(focus.fundingShareRate, 77.8);
  assert.equal(focus.averageAssetAge, 6);
  assert.equal(focus.assetsOlderThanThreshold, 2);
  assert.equal(focus.unknownAgeAssets, 2);
  assert.equal(focus.fundingComposition.length, 3);
  assert.equal(focus.fundingComposition.find((row) => row.key === "source:income").shareWithinCohortRate, 77.8);
});

test("whole-cohort focus and breakdown retain all cohort members and use stored fiscal grouping", () => {
  const whole = buildAcquisitionFocus(data, 14, "year", "year:2024", null);
  assert.equal(whole.selectionType, "cohort");
  assert.equal(whole.totalAssets, 9);
  assert.equal(whole.fundingComposition.reduce((total, row) => total + row.totalAssets, 0), 9);
  const breakdown = buildAcquisitionBreakdown(data, "department", whole);
  assert.deepEqual(breakdown.rows.map((row) => [row.label, row.totalAssets, row.shareRate]), [
    ["หน่วยงาน ก", 5, 55.6],
    ["หน่วยงาน ข", 4, 44.4],
  ]);

  const fiscal = buildAcquisitionFocus(data, 14, "fiscalYear", "fiscal:2568", null);
  const fiscalBreakdown = buildAcquisitionBreakdown(data, "category", fiscal);
  assert.equal(fiscal.cohortLabel, "2568");
  assert.equal(fiscalBreakdown.rows[0].label, "คอมพิวเตอร์");
});

test("funding-specific breakdown uses the true three-way aggregate, not separate marginals", () => {
  const focus = buildAcquisitionFocus(data, 14, "year", "year:2024", "source:income");
  const rows = buildAcquisitionBreakdown(data, "department", focus);
  assert.deepEqual(rows.rows.map(({ label, totalAssets }) => [label, totalAssets]), [["หน่วยงาน ก", 6]]);
  assert.equal(rows.rows[0].shareRate, 85.7);
});

test("cohort and cross-dimension Explorer actions keep their explicit filter scope", () => {
  const focus = buildAcquisitionFocus(data, 14, "fiscalYear", "fiscal:2568", "source:income");
  assert.deepEqual(buildAcquisitionCohortDrillFilters(focus), {
    acquisitionFiscalYear: "2568",
    source: "เงินรายได้",
  });
  assert.deepEqual(buildAcquisitionCohortDrillFilters(focus, "category", {
    filterValue: "คอมพิวเตอร์",
  }), {
    acquisitionFiscalYear: "2568",
    source: "เงินรายได้",
    category: "คอมพิวเตอร์",
  });
  const detail = buildAcquisitionCrossDimensionRows(data, "fiscalCategory");
  assert.deepEqual(buildAcquisitionCrossDimensionDrillFilters("fiscalCategory", detail.rows[0]), {
    acquisitionFiscalYear: "2568",
    category: "คอมพิวเตอร์",
  });
});
