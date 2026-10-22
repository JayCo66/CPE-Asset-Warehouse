import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registerHtml = readFileSync(new URL("../src/asset-inv/sections/asset-register.html", import.meta.url), "utf8");
const overviewHtml = readFileSync(new URL("../src/asset-inv/sections/overview.html", import.meta.url), "utf8");
const analysisHtml = readFileSync(new URL("../src/asset-inv/sections/analysis.html", import.meta.url), "utf8");
const dashboardApp = readFileSync(new URL("../src/asset-inv/app.js", import.meta.url), "utf8");

function visibleMarkupText(markup) {
  return markup.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ");
}

test("labels whole-inventory search, export scopes, and the actual inventory-data date accurately", () => {
  assert.match(registerHtml, /ค้นหาทั้งคลัง/u);
  assert.match(registerHtml, /id="asset-api-search"[^>]*maxlength="200"/u);
  assert.match(registerHtml, /ค้นหาทั้งคลัง\s*<input id="asset-api-search" type="search" maxlength="200"/u);
  assert.match(registerHtml, /placeholder="รหัส ชื่อ ประเภท ยี่ห้อ หน่วยงาน หรือสถานที่"/u);
  assert.match(registerHtml, /ส่งออกหน้าปัจจุบัน/u);
  assert.match(registerHtml, /ส่งออกทุกรายการที่ตรงกับตัวกรอง/u);
  assert.match(dashboardApp, /buildAssetInventoryApiUrl/u);
  assert.match(dashboardApp, /buildAssetInventoryExportUrl/u);
  assert.match(dashboardApp, /matchedTotal/u);
  assert.match(registerHtml, /วันที่ชุดข้อมูลล่าสุด/u);
  assert.doesNotMatch(registerHtml, /การอัปเดตล่าสุด/u);
});

test("labels the threshold flag as undefined rather than implying low stock", () => {
  assert.match(overviewHtml, /ธงประเภท “ต่ำกว่าเกณฑ์” · นิยามยังไม่ยืนยัน/u);
  assert.match(dashboardApp, /นิยามธุรกิจยังไม่ยืนยัน/u);
  assert.match(dashboardApp, /ไม่ใช่จำนวนสต็อก/u);
});

test("uses Thai copy for snapshot concepts across the inventory dashboard", () => {
  const sectionText = visibleMarkupText(`${overviewHtml}\n${analysisHtml}\n${registerHtml}`);
  const renderedAppCopy = [...dashboardApp.matchAll(/(?:textContent|innerHTML)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/gu)]
    .map((match) => match.slice(1).find((value) => value !== undefined) ?? "")
    .join("\n")
    .replace(/\$\{[^}]*\}/gu, "");

  assert.doesNotMatch(sectionText, /\bsnapshot\b/iu);
  assert.doesNotMatch(renderedAppCopy, /\bsnapshot\b/iu);
  assert.match(dashboardApp, /\["วันที่ชุดข้อมูล",\s*formatApiDate\(asset\.snapshot_date, true\)\]/u);
  assert.match(dashboardApp, /assetDetailUpdated\.textContent = `ข้อมูล ณ วันที่ \$\{formatApiDate\(asset\.snapshot_date, true\)\}`/u);
  assert.match(dashboardApp, /formatApiDate\(row\.snapshot_date\)/u);
});
