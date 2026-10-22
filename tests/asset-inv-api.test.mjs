import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAssetInventoryApiUrl,
  buildAssetInventoryExportUrl,
} from "../src/asset-inv/inventory-api.mjs";

const endpoint = "http://localhost/assets_api/fact_asset_inventory.php";

test("builds paginated API URLs with server-side Thai search and active filters", () => {
  const url = new URL(buildAssetInventoryApiUrl(endpoint, {
    page: 3,
    pageSize: 25,
    search: "  เครื่องมือ & อุปกรณ์  ",
    status: "พร้อมใช้งาน",
    type: "เครื่องมือพิเศษ",
  }));

  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(url.searchParams.get("q"), "เครื่องมือ & อุปกรณ์");
  assert.equal(url.searchParams.get("status"), "พร้อมใช้งาน");
  assert.equal(url.searchParams.get("type"), "เครื่องมือพิเศษ");
});

test("builds all-matching CSV export URLs without page or limit parameters", () => {
  const url = new URL(buildAssetInventoryExportUrl(endpoint, {
    search: "A_%!",
    status: "ชำรุด",
    type: "ครุภัณฑ์สำนักงาน",
  }));

  assert.equal(url.searchParams.get("format"), "csv");
  assert.equal(url.searchParams.get("scope"), "all");
  assert.equal(url.searchParams.get("q"), "A_%!");
  assert.equal(url.searchParams.get("status"), "ชำรุด");
  assert.equal(url.searchParams.get("type"), "ครุภัณฑ์สำนักงาน");
  assert.equal(url.searchParams.has("page"), false);
  assert.equal(url.searchParams.has("limit"), false);
});

test("omits empty search and unfiltered criteria from API URLs", () => {
  const pageUrl = new URL(buildAssetInventoryApiUrl(endpoint, { search: "   " }));
  const exportUrl = new URL(buildAssetInventoryExportUrl(endpoint, {}));

  assert.equal(pageUrl.searchParams.has("q"), false);
  assert.equal(pageUrl.searchParams.has("status"), false);
  assert.equal(pageUrl.searchParams.has("type"), false);
  assert.equal(exportUrl.searchParams.has("q"), false);
  assert.equal(exportUrl.searchParams.has("status"), false);
  assert.equal(exportUrl.searchParams.has("type"), false);
});
