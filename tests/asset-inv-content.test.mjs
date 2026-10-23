import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registerHtml = readFileSync(new URL("../src/asset-inv/sections/asset-register.html", import.meta.url), "utf8");
const overviewHtml = readFileSync(new URL("../src/asset-inv/sections/overview.html", import.meta.url), "utf8");
const analysisHtml = readFileSync(new URL("../src/asset-inv/sections/analysis.html", import.meta.url), "utf8");
const dashboardApp = readFileSync(new URL("../src/asset-inv/app.js", import.meta.url), "utf8");
const executiveDashboard = readFileSync(new URL("../src/asset-inv/executive-dashboard.mjs", import.meta.url), "utf8");
const executiveFilters = readFileSync(new URL("../src/asset-inv/sections/executive-filters.html", import.meta.url), "utf8");

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

test("labels the threshold flag without assigning it a stock or readiness meaning", () => {
  assert.match(executiveDashboard, /ธงต่ำกว่าเกณฑ์/u);
  assert.match(executiveDashboard, /ความหมายทางธุรกิจยังไม่ได้รับการยืนยัน/u);
  assert.doesNotMatch(`${overviewHtml}\n${registerHtml}\n${executiveDashboard}`, /สต็อกต่ำ|ปริมาณสินค้าต่ำ/u);
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

test("exposes the full building, floor, room, and area location filter path", () => {
  for (const locationPart of ["building", "floor", "room", "area"]) {
    assert.match(executiveFilters, new RegExp(`data-dashboard-filter="${locationPart}"`, "u"));
    assert.match(executiveDashboard, new RegExp(String.raw`\["${locationPart}"`, "u"));
  }
});
