import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const section = readFileSync(new URL("../src/asset-inv/sections/acquisition.html", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/asset-inv/executive-dashboard.mjs", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/asset-inv/styles.css", import.meta.url), "utf8");

test("acquisition section uses the cohort explorer surfaces and progressive detail disclosure", () => {
  for (const id of [
    "acquisition-overview",
    "acquisition-heatmap",
    "acquisition-cohort-focus",
    "acquisition-cohort-breakdown",
    "acquisition-cross-dimension-details",
  ]) assert.ok(section.includes(`id="${id}"`), `${id} exists`);
  assert.match(section, /<details class="acquisition-detail-disclosure">/u);
  assert.match(section, /acquisition-year-dimension-selector/u);
  assert.doesNotMatch(section, /acquisition-years|acquisition-fiscal-years|acquisition-sources|acquisition-source-metrics|acquisition-year-department|acquisition-year-category|acquisition-year-type|acquisition-fiscal-category|acquisition-source-department|acquisition-source-category/u);
});

test("cohort controls expose keyboard-operable selection, shared sorting and pagination, and explicit explorer drill-down", () => {
  assert.match(dashboard, /data-acquisition-year-dimension/u);
  assert.match(dashboard, /data-acquisition-cohort=/u);
  assert.match(dashboard, /data-acquisition-cell=/u);
  assert.match(dashboard, /"data-acquisition-breakdown-sort"/u);
  assert.match(dashboard, /"data-acquisition-cross-sort"/u);
  assert.match(dashboard, /data-acquisition-page=/u);
  assert.match(dashboard, /data-acquisition-page-size=/u);
  assert.match(dashboard, /buildAcquisitionBreakdown/u);
  assert.match(dashboard, /aria-pressed="\$\{selected\}"/u);
  assert.match(dashboard, /drillButton\(/u);
  assert.ok(/\.acquisition-heatmap-scroll,[\s\S]*?overflow-x:\s*auto/u.test(styles), "the heatmap scrolls inside its own container");
  assert.ok(/@media \(max-width: 767px\)[\s\S]*?\.acquisition-overview/u.test(styles), "acquisition layout responds at mobile widths");
});

test("year coverage distinguishes the observed range from the distinct year count", () => {
  assert.match(dashboard, /summary\.yearCoverage\.earliest[\s\S]*?summary\.yearCoverage\.latest/u);
  assert.match(dashboard, /พบข้อมูล \$\{formatCount\(summary\.yearCoverage\.distinctYears\)\} ปีจัดหา/u);
});
