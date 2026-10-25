import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const section = readFileSync(new URL("../src/asset-inv/sections/departments.html", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/asset-inv/executive-dashboard.mjs", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/asset-inv/styles.css", import.meta.url), "utf8");

test("department section uses one comparison matrix and a connected focus panel", () => {
  assert.match(section, /id="department-matrix"/u);
  assert.match(section, /id="department-focus" aria-live="polite"/u);
  assert.match(section, /id="department-matrix-guide"/u);
  assert.match(section, /class="department-scroll-hint"/u);
  assert.doesNotMatch(section, /department-scorecard|department-old-ranking|department-location-ranking|department-highlight-grid/u);
  assert.doesNotMatch(dashboard, /renderRankedBars\("department-/u);
});

test("matrix keeps all API metrics, uses complete-row heat scales, and marks row sorting semantically", () => {
  for (const field of [
    "totalAssets",
    "assetShareRate",
    "availabilityRate",
    "damageRate",
    "missingLocationRate",
    "averageAssetAge",
    "assetsOlderThanThreshold",
    "oldAssetRate",
  ]) {
    assert.ok(dashboard.includes(`key: "${field}"`) || dashboard.includes(`"${field}"`), `${field} is present`);
  }
  assert.match(dashboard, /getDepartmentHeatLevel\(value, heatValues\)/u);
  assert.match(dashboard, /renderDepartmentMatrixCell\(row, column, rows\)/u);
  assert.match(dashboard, /aria-sort="\$\{active \?/u);
  assert.match(dashboard, /data-department-comparison-sort=/u);
  assert.match(section, /ความเข้มสีเทียบเฉพาะคอลัมน์/u);
  assert.match(section, /สีเขียวแทนความพร้อม สีแดงแทนชำรุด สีเหลืองแทนไม่มีตำแหน่ง และสีน้ำเงินแทนอายุเก่า/u);
  assert.match(section, /ไม่ใช่เกณฑ์ความเสี่ยงอย่างเป็นทางการ/u);
});

test("department selection is local and focus drill-down uses the existing department filter", () => {
  const selectHandler = dashboard.match(/const departmentSelect = event\.target\.closest\("\[data-department-select\]"\);([\s\S]*?)const departmentRow/u)?.[1] ?? "";
  assert.match(selectHandler, /selectedDepartmentKey = key/u);
  assert.match(selectHandler, /renderDepartmentFocus\(row\)/u);
  assert.doesNotMatch(selectHandler, /applyFilterAndRefresh|filters\[/u);
  assert.match(dashboard, /drillButton\("ดูสินทรัพย์ของหน่วยงานนี้", "department", row\.filterValue\)/u);
  assert.match(dashboard, /aria-pressed="\$\{selected\}"/u);
  assert.match(dashboard, /aria-controls="department-focus"/u);
  assert.match(dashboard, /aria-selected="\$\{selected\}"/u);
});

test("department page and sort controls are scoped and reset on global filter changes", () => {
  assert.match(dashboard, /data-department-comparison-page-size/u);
  assert.match(dashboard, /data-department-comparison-page=/u);
  assert.match(dashboard, /DEPARTMENT_COMPARISON_PAGE_SIZES\.map/u);
  assert.match(dashboard, /departmentComparisonState = \{ \.\.\.departmentComparisonState, page: 1 \}/u);
  assert.match(dashboard, /setDepartmentPageSize\(/u);
  assert.match(dashboard, /setDepartmentSort\(/u);
  assert.match(dashboard, /setDepartmentPage\(/u);
});

test("comparison labels are escaped and responsive styling keeps the matrix scrollable", () => {
  assert.match(dashboard, /const label = displayValue\(row\?\.label\)/u);
  assert.match(dashboard, /aria-label="เลือกหน่วยงาน \$\{escapeHtml\(label\)\}"/u);
  assert.match(dashboard, /<h3>\$\{escapeHtml\(label\)\}<\/h3>/u);
  assert.match(styles, /\.department-comparison-scroll\s*\{[^}]*overflow/u);
  assert.match(styles, /\.department-comparison-table\s*\{[^}]*min-width:\s*1140px/u);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.department-focus-metrics\s*\{\s*grid-template-columns:\s*1fr/u);
  assert.match(styles, /\.department-scroll-hint\s*\{\s*display:\s*block/u);
});

test("empty data and unavailable metric values remain distinct from numeric zero", () => {
  assert.match(dashboard, /if \(rows\.length === 0\) \{\s*target\.innerHTML = emptyMarkup\("ไม่พบข้อมูลหน่วยงาน"/u);
  assert.match(dashboard, /value === null \|\| value === undefined[\s\S]*?return "—"/u);
  assert.match(dashboard, /Number\.isFinite\(Number\(value\)\)/u);
});
