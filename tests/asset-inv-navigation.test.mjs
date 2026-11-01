import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const styles = readFileSync(new URL("../src/asset-inv/styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../src/asset-inv/index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/asset-inv/app.js", import.meta.url), "utf8");
const executiveDashboard = readFileSync(new URL("../src/asset-inv/executive-dashboard.mjs", import.meta.url), "utf8");
const localNavigation = readFileSync(new URL("../src/asset-inv/sections/executive-navigation.html", import.meta.url), "utf8");
const assetRegister = readFileSync(new URL("../src/asset-inv/sections/asset-register.html", import.meta.url), "utf8");

function getRuleBlocks(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rulePattern = new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{([^}]*)\\}`, "g");

  return [...styles.matchAll(rulePattern)].map((match) => match[1]);
}

test("dashboard stylesheet URL is versioned to prevent stale navigation styles", () => {
  const stylesheetHref = html.match(/<link\b[^>]*\bhref="([^"]*styles\.css[^"]*)"/)?.[1];

  assert.ok(stylesheetHref, "dashboard stylesheet link should exist");
  assert.match(stylesheetHref, /[?&]v=[\w.-]+/, "stylesheet URL should change when its version is bumped");
});

test("floating navigation scrolls horizontally without vertical overflow", () => {
  const [nav] = getRuleBlocks(".module-nav");

  assert.ok(nav, "module navigation styles should exist");
  assert.match(nav, /height:\s*auto/);
  assert.match(nav, /overflow-x:\s*auto/);
  assert.match(nav, /overflow-y:\s*hidden/);
  assert.match(nav, /scrollbar-width:\s*none/);
  assert.match(nav, /-ms-overflow-style:\s*none/);
  assert.match(styles, /\.module-nav::-webkit-scrollbar\s*\{[^}]*display:\s*none/s);
});

test("module tabs stay in one row at every responsive breakpoint", () => {
  const linkRules = getRuleBlocks(".module-link");

  assert.ok(linkRules.length > 1, "module tab rules should include responsive styles");
  assert.ok(linkRules.some((rule) => /white-space:\s*nowrap/.test(rule)));
  assert.ok(linkRules.some((rule) => /flex:\s*1\s+0\s+0/.test(rule)));
  assert.ok(linkRules.some((rule) => /min-width:\s*max-content/.test(rule)));
  assert.ok(linkRules.every((rule) => !/white-space:\s*normal/.test(rule)));
  assert.ok(linkRules.every((rule) => !/overflow-wrap:\s*anywhere/.test(rule)));
  assert.ok(getRuleBlocks(".module-links").every((rule) => /flex-wrap:\s*nowrap/.test(rule)));
});

test("does not show an inactive workspace menu beside the working module navigation", () => {
  assert.doesNotMatch(html, /aria-label="เปิดเมนูพื้นที่ทำงาน"/);
  assert.match(html, /<nav\b[^>]*class="module-nav"/);
  assert.match(html, /id="module-links"/);
});

test("loads existing executive page fragments and exposes every executive view in local navigation", () => {
  const fragmentPaths = [...app.matchAll(/"(sections\/[\w-]+\.html)"/gu)].map((match) => match[1]);
  assert.ok(fragmentPaths.length > 0, "dashboard fragment list should not be empty");
  for (const fragment of fragmentPaths) {
    assert.ok(existsSync(new URL(`../src/asset-inv/${fragment}`, import.meta.url)), `${fragment} should exist`);
  }

  const links = [...localNavigation.matchAll(/data-dashboard-link="([\w-]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(links, ["overview", "portfolio", "departments", "locations", "aging", "acquisition", "governance", "explorer"]);
});

test("loads only the active dashboard fragment on navigation", () => {
  assert.match(app, /const DASHBOARD_COMMON_SECTION_FILES = \[/u);
  assert.match(app, /const DASHBOARD_PAGE_FILES = Object\.freeze\(/u);
  assert.match(app, /loadDashboardSectionMarkup\(file\)/u);
  assert.match(app, /loadDashboardSections\(pageId, renderId\)/u);
  assert.match(app, /const executiveModuleResultPromise = loadExecutiveDashboardModule\(\)\.then\(/u);
  assert.match(app, /await loadDashboardSections\(pageId, renderId\);[\s\S]*?setDashboardSectionVisibility\(pageId\);[\s\S]*?await executiveModuleResultPromise/u);
  assert.doesNotMatch(app, /DASHBOARD_PAGE_FILES\s*\)\.map/u);
  assert.doesNotMatch(app, /from ["']\.\/executive-dashboard\.mjs/u);
  assert.match(html, /id="dashboard-sections"[^>]*>[\s\S]*?กำลังโหลดแดชบอร์ด/u);
  assert.doesNotMatch(html, /id="overview-title"|id="asset-api-search"/u);
});

test("cache-busts the entry module together with its lazy dashboard modules", () => {
  const version = app.match(/const UI_ASSET_VERSION = "([0-9.]+)";/u)?.[1];
  assert.ok(version, "lazy module version should be present");
  assert.match(html, new RegExp(`<script type="module" src="app\\.js\\?v=${version}"></script>`, "u"));
});

test("cache-busts changed dashboard data and request-cache helpers", () => {
  const version = app.match(/const UI_ASSET_VERSION = "([0-9.]+)";/u)?.[1];
  assert.ok(version, "dashboard asset version should be present");
  assert.ok(executiveDashboard.includes(`inventory-dashboard-data.mjs?v=${version}`));
  assert.ok(executiveDashboard.includes(`dashboard-request-cache.mjs?v=${version}`));
  assert.ok(executiveDashboard.includes(`governance-quality.mjs?v=${version}`));
  const governance = readFileSync(new URL("../src/asset-inv/governance-quality.mjs", import.meta.url), "utf8");
  assert.ok(governance.includes(`inventory-dashboard-data.mjs?v=${version}`));
});

test("preserves the Asset Register loading state when removing the shell placeholder", () => {
  assert.match(assetRegister, /id="asset-api-loading"[^>]*role="status"/u);
  const shellLoadingCleanup = 'container.querySelector(":scope > .api-state-loading[role=\'status\']:not([data-dashboard-request-state])")?.remove();';
  assert.equal(app.split(shellLoadingCleanup).length - 1, 2, "both success and error cleanup should target only the shell placeholder");
});

test("gets Explorer filters from the dynamically loaded dashboard module", () => {
  assert.match(app, /await module\.initExecutiveDashboard\(/u);
  assert.match(app, /\.\.\.\(executiveDashboardModule\?\.getExecutiveDashboardFilters\?\.\(\) \?\? \{\}\)/u);
  assert.doesNotMatch(app, /\.\.\.getExecutiveDashboardFilters\(\)/u);
});

test("defers Explorer utility modules until the Explorer or asset-detail route is opened", () => {
  for (const moduleName of ["pagination", "asset-detail", "inventory-data", "inventory-api"]) {
    assert.doesNotMatch(app, new RegExp(`from [\"']\\./${moduleName}\\.mjs`, "u"), `${moduleName} must not be in the initial import graph`);
    assert.ok(app.includes(`import(\`./${moduleName}.mjs?v=`), `${moduleName} must load from the deferred utility loader`);
  }
  assert.match(app, /if \(pageId === "explorer"\) \{[\s\S]*?await loadAssetUiModules\(\);[\s\S]*?loadAssetRegister\(1\);/u);
  assert.match(app, /if \(isAssetDetail\) \{[\s\S]*?await loadAssetUiModules\(\);/u);
});

test("starts the initial dashboard request with the URL string and safely deduplicates it", () => {
  assert.ok(/const url = buildInventoryDashboardUrl\(DASHBOARD_API, filters, selectedView, \{ summaryOnly: selectedView === "acquisition" \}\);\s*const requestKey = url;/u.test(executiveDashboard), "string URL should be the request and cache key");
  assert.ok(/if \(activeDashboardRequest && activeDashboardRequest\.key === requestKey && !force\) return activeDashboardRequest\.promise;/u.test(executiveDashboard), "deduplication should guard the request before reading its promise");
  assert.ok(/if \(resolvedUrl !== requestKey\) \{\s*await dashboardPayloadCache\.load\(resolvedUrl,/u.test(executiveDashboard), "resolved snapshot URL should remain a string cache key");
});

test("awaits initial dashboard initialization so startup errors reach the route handler", () => {
  assert.ok(/await module\.initExecutiveDashboard\(/u.test(app), "the route should await initial data loading");
  assert.ok(/return activeDashboardPage !== "explorer"\s*\? loadDashboard\(activeDashboardPage\)\s*:\s*Promise\.resolve\(\);/u.test(executiveDashboard), "initialization should return the load promise");
  assert.ok(/console\.error\("Dashboard module initialization failed", error\)/u.test(app), "the route should preserve initialization failures in the console for diagnosis");
});

test("loads section-only dashboard modules on demand without delaying Overview", () => {
  for (const moduleName of ["portfolio-composition", "location-distribution", "acquisition-cohort", "governance-quality"]) {
    assert.ok(!new RegExp(`from [\"']\\./${moduleName}\\.mjs`, "u").test(executiveDashboard), `${moduleName} should not be in the initial import graph`);
    assert.ok(executiveDashboard.includes(`import(\"./${moduleName}.mjs?`), `${moduleName} should load when its view is requested`);
  }
  assert.ok(/Promise\.all\(\[dashboardPayloadCache\.load\([\s\S]*?viewModulePromise\]\)/u.test(executiveDashboard), "view code should load alongside API data rather than before the API starts");
});
