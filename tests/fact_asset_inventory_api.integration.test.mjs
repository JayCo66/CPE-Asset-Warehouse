import assert from "node:assert/strict";
import test from "node:test";

const endpoint = process.env.WAREHOUSE_API_BASE_URL;

test(
  "live inventory API searches beyond page one and exports only all matching records",
  { skip: !endpoint },
  async () => {
    const requestJson = async (url) => {
      const response = await fetch(url);
      const payload = await response.json();
      return { response, payload };
    };

    const firstPageUrl = new URL(endpoint);
    firstPageUrl.searchParams.set("page", "1");
    firstPageUrl.searchParams.set("limit", "10");
    const { response: firstResponse, payload: firstPage } = await requestJson(firstPageUrl);
    assert.equal(firstResponse.status, 200);
    assert.equal(firstPage.success, true);
    assert.ok(Number.isSafeInteger(firstPage.total) && firstPage.total > 10, "requires a multi-page live snapshot");
    assert.ok(Array.isArray(firstPage.filterOptions?.statuses));
    assert.ok(Array.isArray(firstPage.filterOptions?.types));

    const lastPage = Math.ceil(firstPage.total / 10);
    const lastPageUrl = new URL(endpoint);
    lastPageUrl.searchParams.set("page", String(lastPage));
    lastPageUrl.searchParams.set("limit", "10");
    const { response: lastResponse, payload: lastPagePayload } = await requestJson(lastPageUrl);
    assert.equal(lastResponse.status, 200);
    const targetRow = lastPagePayload.data.at(-1);
    assert.ok(targetRow?.asset_code, "the latest snapshot should have an asset code on its final page");
    assert.ok(
      !firstPage.data.some((row) => row.asset_code === targetRow.asset_code),
      "the chosen record should not already be present on page one",
    );

    const searchUrl = new URL(endpoint);
    searchUrl.searchParams.set("q", targetRow.asset_code);
    searchUrl.searchParams.set("page", "1");
    searchUrl.searchParams.set("limit", "10");
    const { response: searchResponse, payload: searchPayload } = await requestJson(searchUrl);
    assert.equal(searchResponse.status, 200);
    assert.ok(searchPayload.matchedTotal >= 1);
    assert.ok(searchPayload.data.some((row) => row.asset_code === targetRow.asset_code));

    if (targetRow.asset_status) searchUrl.searchParams.set("status", targetRow.asset_status);
    if (targetRow.type_name) searchUrl.searchParams.set("type", targetRow.type_name);
    const { response: filteredResponse, payload: filteredPayload } = await requestJson(searchUrl);
    assert.equal(filteredResponse.status, 200);
    assert.ok(filteredPayload.matchedTotal >= 1);
    assert.ok(filteredPayload.data.every((row) => row.asset_code === targetRow.asset_code));

    const exportUrl = new URL(endpoint);
    exportUrl.searchParams.set("format", "csv");
    exportUrl.searchParams.set("scope", "all");
    exportUrl.searchParams.set("q", targetRow.asset_code);
    if (targetRow.asset_status) exportUrl.searchParams.set("status", targetRow.asset_status);
    if (targetRow.type_name) exportUrl.searchParams.set("type", targetRow.type_name);
    const exportResponse = await fetch(exportUrl);
    const exportBytes = Buffer.from(await exportResponse.arrayBuffer());
    const csvText = new TextDecoder("utf-8").decode(exportBytes);
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type") || "", /^text\/csv; charset=utf-8/i);
    assert.equal(exportBytes.subarray(0, 3).toString("hex"), "efbbbf");
    assert.ok(csvText.includes("รหัสสินทรัพย์"));
    assert.equal(csvText.split(/\r?\n/).filter(Boolean).length - 1, filteredPayload.matchedTotal);

    const emptyExportUrl = new URL(endpoint);
    emptyExportUrl.searchParams.set("format", "csv");
    emptyExportUrl.searchParams.set("scope", "all");
    emptyExportUrl.searchParams.set("q", `__codex_no_match_${Date.now()}__`);
    const emptyResponse = await fetch(emptyExportUrl);
    const emptyBytes = Buffer.from(await emptyResponse.arrayBuffer());
    const emptyCsv = new TextDecoder("utf-8").decode(emptyBytes);
    assert.equal(emptyResponse.status, 200);
    assert.equal(emptyBytes.subarray(0, 3).toString("hex"), "efbbbf");
    assert.equal(emptyCsv.split(/\r?\n/).filter(Boolean).length, 1, "empty exports should retain headings only");

    const invalidArray = await fetch(`${endpoint}?q%5B%5D=unexpected`);
    const invalidLimit = await fetch(`${endpoint}?limit=0`);
    assert.equal(invalidArray.status, 400);
    assert.equal(invalidLimit.status, 400);
  },
);
