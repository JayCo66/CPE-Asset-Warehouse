import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registerHtml = readFileSync(new URL("../src/asset-inv/sections/asset-register.html", import.meta.url), "utf8");
const overviewHtml = readFileSync(new URL("../src/asset-inv/sections/executive-overview.html", import.meta.url), "utf8");
const analysisHtml = readFileSync(new URL("../src/asset-inv/sections/analysis.html", import.meta.url), "utf8");
const dashboardApp = readFileSync(new URL("../src/asset-inv/app.js", import.meta.url), "utf8");
const executiveDashboard = readFileSync(new URL("../src/asset-inv/executive-dashboard.mjs", import.meta.url), "utf8");
const dashboardStyles = readFileSync(new URL("../src/asset-inv/styles.css", import.meta.url), "utf8");
const executiveFilters = readFileSync(new URL("../src/asset-inv/sections/executive-filters.html", import.meta.url), "utf8");
const inventoryDashboardApi = readFileSync(new URL("../assets_api/asset_inventory_dashboard.php", import.meta.url), "utf8");
const inventoryDisposalApi = readFileSync(new URL("../assets_api/inventory_disposal.php", import.meta.url), "utf8");

function visibleMarkupText(markup) {
  return markup.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ");
}

test("labels whole-inventory search, export scopes, and the actual inventory-data date accurately", () => {
  assert.match(registerHtml, /ค้นหาทั้งชุดข้อมูลที่เลือก/u);
  assert.match(registerHtml, /id="asset-api-search"[^>]*maxlength="200"/u);
  assert.match(registerHtml, /ค้นหาทั้งชุดข้อมูล\s*<input id="asset-api-search" type="search" maxlength="200"/u);
  assert.match(registerHtml, /placeholder="รหัส ชื่อ ยี่ห้อ รุ่น หน่วยงาน หมวดหมู่ ประเภท อาคาร ห้อง แหล่งเงิน หรือสถานะ"/u);
  assert.match(registerHtml, /ส่งออกหน้าปัจจุบัน/u);
  assert.match(registerHtml, /ส่งออกทุกรายการที่ตรงกับตัวกรอง/u);
  assert.match(dashboardApp, /buildAssetInventoryApiUrl/u);
  assert.match(dashboardApp, /buildAssetInventoryExportUrl/u);
  assert.match(dashboardApp, /matchedTotal/u);
  assert.match(registerHtml, /วันที่ชุดข้อมูลที่เลือก/u);
  assert.doesNotMatch(registerHtml, /การอัปเดตล่าสุด/u);
});

test("uses Thai copy for snapshot concepts across the inventory dashboard", () => {
  const sectionText = visibleMarkupText(`${overviewHtml}\n${analysisHtml}\n${registerHtml}`);
  const allDashboardCode = `${dashboardApp}\n${executiveDashboard}`;
  const renderedAppCopy = [...allDashboardCode.matchAll(/(?:textContent|innerHTML)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/gu)]
    .map((match) => match.slice(1).find((value) => value !== undefined) ?? "")
    .join("\n")
    .replace(/\$\{[^}]*\}/gu, "");

  assert.doesNotMatch(sectionText, /\bsnapshot\b/iu);
  assert.doesNotMatch(renderedAppCopy, /\bsnapshot\b/iu);
  assert.match(dashboardApp, /\["วันที่ชุดข้อมูล",\s*formatApiDate\(asset\.snapshot_date, true\)\]/u);
  assert.match(dashboardApp, /assetDetailUpdated\.textContent = `ข้อมูล ณ วันที่ \$\{formatApiDate\(asset\.snapshot_date, true\)\}`/u);
  assert.match(dashboardApp, /formatApiDate\(row\.snapshot_date\)/u);
});

test("university snapshot import uses selectors that survive filter-panel ID suffixing", () => {
  assert.match(dashboardApp, /idMap\.set\(element\.id, `\$\{element\.id\}-\$\{suffix\}`\)/u);
  assert.match(executiveFilters, /data-university-snapshot-import/u);
  assert.match(executiveFilters, /data-snapshot-import-status/u);
  assert.match(executiveDashboard, /event\.target\.closest\("\[data-university-snapshot-import\]"\)/u);
  assert.match(executiveDashboard, /button\.closest\("\.snapshot-filter-row"\)\?\.querySelector\("\[data-snapshot-import-status\]"\)/u);
});

test("uses a decision-first overview with API-backed readiness, aging, and unavailable reasons", () => {
  assert.match(overviewHtml, /class="overview-executive-layout"/u);
  assert.match(overviewHtml, /id="overview-readiness-rate"/u);
  assert.match(overviewHtml, /id="overview-readiness-meter"/u);
  assert.match(overviewHtml, /class="overview-supporting-kpis" id="executive-metrics"/u);
  assert.match(overviewHtml, /id="overview-age-distribution"/u);
  assert.match(overviewHtml, /<h2>โครงสร้างอายุครุภัณฑ์<\/h2>/u);
  assert.match(executiveDashboard, /squarifyTreemap\(populatedRows, width, height\)/u);
  assert.match(executiveDashboard, /data-drill-filter="ageBand"/u);
  assert.match(executiveDashboard, /role="tooltip"/u);
  assert.match(executiveDashboard, /new ResizeObserver\(updateLayout\)/u);
  assert.match(dashboardStyles, /\.age-treemap-tile\.is-tiny\s*\{\s*padding:\s*0;\s*\}/u);
  for (const band of ["0-2", "3-5", "6-10", "11-15", "16-20", "over-20", "unknown"]) {
    assert.ok(executiveDashboard.includes('"' + band + '"'), "age band " + band + " remains supported");
  }
  assert.match(overviewHtml, /id="overview-unavailable-breakdown"/u);
  assert.doesNotMatch(overviewHtml, /overview-status-distribution|overview-availability-distribution/u);
  assert.doesNotMatch(overviewHtml, /คิวประเด็นที่ต้องตรวจสอบ|ข้อเสนอแนะ|คำแนะนำ/u);

  for (const metric of ["availabilityRate", "availableAssets", "unavailableAssets", "damagedAssets", "statusDistribution", "assetsOlderThanThreshold"]) {
    assert.match(executiveDashboard, new RegExp(`data\\.${metric}`, "u"));
  }
  assert.match(executiveDashboard, /data\.disposalEstimate/u);
  assert.match(executiveDashboard, /ค่าซ่อมสะสมและอายุ/u);
  assert.match(executiveDashboard, /ราคาอ้างอิงจำลอง/u);
  assert.match(inventoryDashboardApi, /warehouseDashboardDisposalEstimate/u);
  assert.match(inventoryDashboardApi, /warehouseDashboardDisposalEstimate\(\s*\$warehousePdo,\s*\$filters,\s*\$selectedSnapshot/su);
  assert.match(inventoryDisposalApi, /warehouseInventoryBuildWhere\(\$filters,\s*null,\s*\$snapshotId\)/u);
  assert.match(inventoryDisposalApi, /fact_asset_maintenance/u);
  assert.match(inventoryDisposalApi, /fai\.`asset_count`/u);
});

test("exposes the full building, floor, room, and area location filter path", () => {
  for (const locationPart of ["building", "floor", "room", "area"]) {
    assert.match(executiveFilters, new RegExp(`data-dashboard-filter="${locationPart}"`, "u"));
    assert.match(executiveDashboard, new RegExp(String.raw`\["${locationPart}"`, "u"));
  }
});
