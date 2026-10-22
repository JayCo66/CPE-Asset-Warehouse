import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../src/asset-inv/styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../src/asset-inv/index.html", import.meta.url), "utf8");

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
