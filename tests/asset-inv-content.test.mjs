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

test("labels page-local search and the actual inventory-data date accurately", () => {
  assert.match(registerHtml, /ค้นหาในหน้าปัจจุบัน/u);
  assert.match(registerHtml, /placeholder="ค้นหาในหน้านี้: รหัส ชื่อ ประเภท หรือหน่วยงาน"/u);
  assert.match(registerHtml, /วันที่ชุดข้อมูลล่าสุด/u);
  assert.doesNotMatch(registerHtml, /การอัปเดตล่าสุด/u);
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
