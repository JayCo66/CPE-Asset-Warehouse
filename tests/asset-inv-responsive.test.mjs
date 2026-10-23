import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../src/asset-inv/styles.css", import.meta.url), "utf8");
const registerHtml = readFileSync(new URL("../src/asset-inv/sections/asset-register.html", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../src/asset-inv/index.html", import.meta.url), "utf8");
const dashboardApp = readFileSync(new URL("../src/asset-inv/app.js", import.meta.url), "utf8");

test("improves Thai asset-table typography without changing other tables", () => {
  assert.match(styles, /font-family:\s*"Leelawadee UI",\s*"Noto Sans Thai"/u);
  assert.match(styles, /\.asset-api-table th\s*\{[^}]*font-size:\s*0\.8rem/su);
  assert.match(styles, /\.asset-api-table td\s*\{[^}]*font-size:\s*0\.875rem/su);
  assert.match(styles, /\.asset-cell span\s*\{[^}]*font-size:\s*0\.8rem/su);
  assert.match(styles, /\.asset-summary-label,[\s\S]*?font-size:\s*0\.82rem;/u);
  assert.match(styles, /\.table-wrap\s*\{[^}]*overflow-x:\s*auto/su);
});

test("provides a keyboard-accessible horizontal table region and scroll cue", () => {
  assert.match(registerHtml, /class="table-scroll-hint asset-api-table-scroll-hint"/u);
  assert.match(registerHtml, /id="asset-api-table-wrap" role="region"[^>]*tabindex="0"/u);
  assert.match(registerHtml, /เลื่อนตารางในแนวนอนเพื่อดูคอลัมน์เพิ่มเติม/u);
});

test("keeps the desktop table and adds a semantic mobile asset-card list", () => {
  assert.match(registerHtml, /<table class="asset-api-table">/u);
  assert.match(registerHtml, /<ul id="asset-api-mobile-cards" class="asset-api-mobile-cards" aria-label="รายการสินทรัพย์" hidden>/u);
  assert.match(styles, /\.asset-api-table\s*\{[^}]*min-width:\s*1160px/su);
  assert.match(styles, /\.asset-api-mobile-cards\s*\{[^}]*display:\s*none/su);
  assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.asset-api-table-wrap\s*\{[^}]*display:\s*none/su);
  assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.asset-api-mobile-cards:not\(\[hidden\]\)\s*\{[^}]*display:\s*grid/su);
});

test("renders mobile asset cards from the existing page rows with accessible details", () => {
  assert.match(dashboardApp, /assetApiMobileCards:\s*document\.querySelector\("#asset-api-mobile-cards"\)/u);
  assert.match(dashboardApp, /elements\.assetApiMobileCards\.innerHTML\s*=\s*rows\.map\(\(row\)\s*=>\s*renderAssetApiMobileCard\(row\)\)/u);
  assert.match(dashboardApp, /elements\.assetApiMobileCards\.hidden\s*=\s*!hasRows/u);

  const mobileCardRenderer = dashboardApp.match(/function renderAssetApiMobileCard\(row\)\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "";
  assert.notEqual(mobileCardRenderer, "", "mobile card renderer should exist");
  for (const field of ["asset_name", "asset_code", "asset_status", "category_name"]) {
    assert.match(mobileCardRenderer, new RegExp(`row\\.${field}`, "u"));
  }
  assert.match(mobileCardRenderer, /<details/u);
  assert.match(mobileCardRenderer, /<summary>รายละเอียดเพิ่มเติม<\/summary>/u);
  assert.match(mobileCardRenderer, /<a class="button button-secondary asset-detail-action/u);
  assert.doesNotMatch(mobileCardRenderer, /\bfetch\s*\(/u);
  assert.doesNotMatch(mobileCardRenderer, /sample|ตัวอย่างข้อมูล/u);

  const locationFormatter = dashboardApp.match(/function formatAssetLocation\(row\)\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "";
  assert.match(locationFormatter, /row\.building/u);
  assert.match(locationFormatter, /row\.floor/u);
  assert.match(locationFormatter, /row\.room/u);
  assert.match(locationFormatter, /row\.area_name/u);
  assert.match(locationFormatter, /row\.location_id/u);
  assert.match(locationFormatter, /\.map\(\(value\) => displayValue\(value\)\)/u);
  assert.doesNotMatch(locationFormatter, /\$\{label\}.*displayValue/u);
});

test("keeps mobile card disclosure and detail links keyboard- and touch-accessible", () => {
  assert.match(styles, /\.asset-api-mobile-details\s*>\s*summary\s*\{[^}]*min-height:\s*44px/su);
  assert.match(styles, /\.asset-api-mobile-details\s*>\s*summary:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--cpe-focus\)/su);
  assert.match(styles, /\.asset-detail-action\s*\{[^}]*min-height:\s*44px/su);
});

test("makes inventory filters and pagination touch-friendly on mobile", () => {
  assert.match(styles, /\.asset-detail-action\s*\{[^}]*min-height:\s*44px/su);
  assert.match(styles, /\.asset-export-control \.button\s*\{[^}]*padding:\s*8px 12px/su);
  const mobileRules = styles.slice(styles.indexOf("@media (max-width: 720px)"));
  assert.match(mobileRules, /\.asset-register-toolbar input,[\s\S]*?min-height:\s*44px;[\s\S]*?font-size:\s*1rem;/u);
  assert.match(mobileRules, /\.asset-pagination-size \.button,[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/u);
});

test("keeps the mobile back-to-top control compact and clear of safe areas", () => {
  const mobileRules = styles.slice(styles.indexOf("@media (max-width: 720px)"));
  assert.match(indexHtml, /aria-label="กลับไปด้านบน"/u);
  assert.match(mobileRules, /\.back-to-top\s*\{[^}]*right:.*env\(safe-area-inset-right\)[^}]*bottom:.*env\(safe-area-inset-bottom\)/su);
  assert.match(mobileRules, /\.back-to-top\s*\{[^}]*width:\s*44px;[^}]*min-height:\s*44px;/su);
});

test("constrains dashboard grid tracks so wide scorecards scroll inside their panel", () => {
  assert.match(styles, /\.dashboard,\s*\.dashboard-sections\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*min-width:\s*0;/su);
  assert.match(styles, /\.dashboard-page\s*\{[^}]*min-width:\s*0;/su);
  assert.match(styles, /\.dashboard-table-wrap\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto/su);
});
