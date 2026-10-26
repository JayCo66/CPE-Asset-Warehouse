import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const section = readFileSync(new URL("../src/asset-inv/sections/governance.html", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/asset-inv/executive-dashboard.mjs", import.meta.url), "utf8");
const api = readFileSync(new URL("../assets_api/asset_inventory_dashboard.php", import.meta.url), "utf8");
const analytics = readFileSync(new URL("../assets_api/inventory_analytics.php", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/asset-inv/styles.css", import.meta.url), "utf8");

test("governance section separates portfolio completeness, missing fields, departments, and review assets", () => {
  for (const id of [
    "governance-summary",
    "governance-critical-field-list",
    "governance-quality-fields",
    "governance-field-detail",
    "governance-quality-departments",
    "governance-department-detail",
    "governance-exceptions",
  ]) assert.ok(section.includes(`id="${id}"`), `${id} is present`);
  assert.match(dashboard, /สินทรัพย์ที่ข้อมูลไม่ครบ/u);
  assert.match(section, /เข้าเกณฑ์ตรวจสอบ/u);
  assert.doesNotMatch(section, /คะแนนคุณภาพ|quality score|progressbar|progress-bar/iu);
});

test("governance uses existing field tiers and transparent review rules with distinct portfolio counts", () => {
  assert.match(analytics, /'assetsWithMissingInformation'/u);
  assert.match(analytics, /in_array\(true,\s*\$qualityChecks,\s*true\)/u);
  assert.match(analytics, /warehouseInventoryAnalyticsAttentionReasons\(/u);
  assert.match(analytics, /warehouseInventoryAnalyticsPriority\(/u);
  assert.match(dashboard, /field\.tier === "essential"/u);
  assert.match(dashboard, /row\.attentionReasons/u);
  assert.match(dashboard, /data-governance-exceptions-retry/u);
  assert.match(dashboard, /new AbortController\(\)/u);
  assert.match(dashboard, /governanceRequestContext/u);
});

test("governance tables expose keyboard selection, sorting, paging, and internal matrix scrolling", () => {
  assert.match(dashboard, /aria-sort=/u);
  assert.match(dashboard, /aria-pressed="\$\{isSelected\}"/u);
  assert.match(dashboard, /data-governance-page-size/u);
  assert.match(dashboard, /data-governance-page=/u);
  assert.match(dashboard, /data-governance-field-select/u);
  assert.match(dashboard, /data-governance-department-select/u);
  assert.match(api, /warehouseDashboardParseVisualPageRequest\(\$_GET\)/u);
  assert.match(api, /warehouseDashboardFetchAnalytics\([^;]*\$visualPageRequest\)/u);
  assert.match(styles, /\.governance-table-scroll\s*\{[^}]*overflow:\s*auto/u);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*?\.governance-summary/u);
  assert.match(styles, /\.governance-analysis-grid\s*\{[^}]*grid-template-columns:/u);
});
