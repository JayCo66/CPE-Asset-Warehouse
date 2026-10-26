import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portfolio = readFileSync(new URL("../src/asset-inv/sections/portfolio.html", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/asset-inv/executive-dashboard.mjs", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/asset-inv/styles.css", import.meta.url), "utf8");

test("portfolio section presents the treemap, matrix, and department focus only", () => {
  assert.match(portfolio, /id="portfolio-categories"/u);
  assert.match(portfolio, /id="portfolio-matrix"/u);
  assert.match(portfolio, /id="portfolio-focus"/u);
  assert.doesNotMatch(portfolio, /portfolio-types|portfolio-department-category|portfolio-department-type|portfolio-diversity/u);
});

test("portfolio matrix renders complete categories with normalized cell descriptions and local selection", () => {
  assert.match(dashboard, /departmentCategoryMatrix/u);
  assert.match(dashboard, /data-portfolio-department-select=/u);
  assert.match(dashboard, /data-portfolio-matrix-sort=/u);
  assert.match(dashboard, /getPortfolioCategoryShare\(/u);
  assert.match(dashboard, /portfolio-matrix-cell\$\{selectedCategory \? " is-selected-category" : ""\}" aria-label="\$\{escapeHtml\(description\)\}" title="\$\{escapeHtml\(description\)\}"/u);
  assert.match(portfolio, /สีเข้มขึ้นหมายถึงสัดส่วนหมวดหมู่นั้นภายในหน่วยงานสูงขึ้น/u);
  assert.doesNotMatch(dashboard, /renderRankedBars\("portfolio-types"/u);
  assert.doesNotMatch(dashboard, /renderComboTable\("portfolio-department-(category|type)"/u);
});

test("portfolio category selection is local and explorer actions remain explicit", () => {
  assert.match(dashboard, /data-portfolio-category-select=/u);
  assert.match(dashboard, /data-portfolio-category-explorer/u);
  assert.match(dashboard, /applyFilterAndRefresh\(drill\.dataset\.drillFilter/u);
  assert.match(dashboard, /portfolioMatrixState = \{ \.\.\.portfolioMatrixState, page: 1 \}/u);
});

test("treemap selection scrolls to the selected-category summary in Department Focus", () => {
  assert.match(dashboard, /portfolioCategorySelect\.matches\("\[data-portfolio-category-tile\]"\)/u);
  assert.match(dashboard, /data-portfolio-focus-category/u);
  assert.match(dashboard, /focusContent\?\.closest\("\.panel"\)\?\.scrollIntoView\(/u);
});

test("portfolio visual styles keep matrix scrolling scoped and treemap tiles keyboard-visible", () => {
  assert.match(styles, /\.portfolio-matrix-scroll\s*\{[^}]*overflow-x:\s*auto/u);
  assert.match(styles, /\.portfolio-treemap-tile:focus-visible/u);
  assert.match(styles, /\.portfolio-focus-category\.is-selected/u);
});
