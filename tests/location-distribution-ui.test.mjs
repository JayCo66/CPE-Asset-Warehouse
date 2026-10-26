import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const section = readFileSync(new URL("../src/asset-inv/sections/locations.html", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/asset-inv/executive-dashboard.mjs", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/asset-inv/styles.css", import.meta.url), "utf8");

test("location section has completeness, three hierarchy levels, department matrix, focus, and retained detail", () => {
  for (const id of [
    "location-completeness",
    "location-explorer-buildings",
    "location-explorer-floors",
    "location-explorer-rooms",
    "location-explorer-unassigned",
    "location-department-matrix",
    "location-department-focus",
    "location-category-building-details",
  ]) assert.ok(section.includes(`id="${id}"`), `${id} exists`);
  assert.match(section, /<details class="location-secondary-details">/u);
  assert.match(section, /<summary>ดูข้อมูลหมวดหมู่ตามอาคาร/u);
  assert.match(section, /aria-live="polite"/u);
  assert.doesNotMatch(section, /location-buildings|location-floors|location-rooms|location-department-building|location-missing-departments/u);
});

test("location visuals use coordinated local selection and explicit filtered Explorer actions", () => {
  assert.match(dashboard, /reconcileLocationExplorerSelection/u);
  assert.match(dashboard, /data-location-explorer-select=/u);
  assert.match(dashboard, /data-location-department-select=/u);
  assert.match(dashboard, /"data-location-matrix-sort"/u);
  assert.match(dashboard, /"data-location-category-building-sort"/u);
  assert.match(dashboard, /data-location-explorer-drill(?:\s|>)/u);
  assert.match(dashboard, /locationStatus: item\.key/u);
  assert.doesNotMatch(dashboard, /renderRankedBars\("location-(buildings|floors|rooms)"/u);
});

test("location matrix and lists expose pagination, sorting, focus state, and semantic heatmap labels", () => {
  assert.match(dashboard, /LOCATION_PAGE_SIZES\.map/u);
  assert.match(dashboard, /setLocationPageSize\(/u);
  assert.match(dashboard, /setLocationSort\(/u);
  assert.match(dashboard, /aria-sort=/u);
  assert.match(dashboard, /aria-pressed="\$\{selected\}"/u);
  assert.match(dashboard, /aria-label="\$\{escapeHtml\(description\)\}"/u);
  assert.match(styles, /\.location-explorer-grid\s*\{/u);
  assert.match(styles, /\.location-matrix-scroll-inner\s*\{[^}]*overflow-x:\s*auto/u);
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.location-explorer-grid/u);
});
