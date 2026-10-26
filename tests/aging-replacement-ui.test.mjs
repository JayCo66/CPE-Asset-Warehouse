import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const section = readFileSync(new URL("../src/asset-inv/sections/aging.html", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/asset-inv/executive-dashboard.mjs", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/asset-inv/styles.css", import.meta.url), "utf8");

test("aging section has one Replacement Lens donut, exposure table, condition context, focus, and collapsed matrix", () => {
  for (const id of [
    "aging-replacement-lens",
    "aging-replacement-exposure",
    "aging-condition",
    "aging-department-focus",
    "aging-detail-matrix",
  ]) assert.ok(section.includes(`id="${id}"`), `${id} is present`);
  assert.match(section, /<details[^>]*id="aging-detail-disclosure"/u);
  assert.match(section, /data-aging-exposure-dimension="department"/u);
  assert.match(section, /data-aging-exposure-dimension="category"/u);
  assert.match(section, /data-aging-exposure-dimension="type"/u);
  assert.doesNotMatch(section, /aging-distribution|aging-availability|aging-damage|aging-departments|aging-categories|aging-types/u);
});

test("aging rendering uses one donut and warehouse-backed threshold-specific status fields", () => {
  assert.match(dashboard, /renderReplacementLens\(/u);
  assert.match(dashboard, /oldAndAvailableAssets/u);
  assert.match(dashboard, /oldAndUnavailableAssets/u);
  assert.match(dashboard, /oldAndAvailabilityUnknownAssets/u);
  assert.match(dashboard, /oldAndDamagedAssets/u);
  assert.match(dashboard, /oldAndNotDamagedAssets/u);
  assert.match(dashboard, /oldAndDamageUnknownAssets/u);
  assert.doesNotMatch(dashboard, /renderRankedBars\("aging-/u);
});

test("aging interactions remain local, accessible, sortable, and paginated", () => {
  assert.match(dashboard, /data-aging-exposure-dimension/u);
  assert.match(dashboard, /data-aging-detail-dimension/u);
  assert.match(dashboard, /data-aging-exposure-sort/u);
  assert.match(dashboard, /data-aging-detail-sort/u);
  assert.match(dashboard, /aria-sort=/u);
  assert.match(dashboard, /aria-pressed=/u);
  assert.match(dashboard, /data-aging-page-size/u);
  assert.match(dashboard, /data-aging-page=/u);
  assert.match(dashboard, /selectedAgingDepartmentKey/u);
  assert.match(dashboard, /renderAging\(payload\.aging,\s*payload\)/u);
});

test("aging UI retains existing theme tokens and responsive internal table scrolling", () => {
  assert.ok(styles.includes(".aging-lens-layout"));
  assert.ok(styles.includes(".aging-detail-matrix-scroll"));
  assert.match(styles, /\.aging-data-table-scroll\s*\{[^}]*overflow-x:\s*auto/u);
  assert.match(styles, /@media \(max-width:\s*1024px\)[\s\S]*?\.aging-lens-layout/u);
  assert.ok(styles.includes("var(--cpe-info)"));
});
