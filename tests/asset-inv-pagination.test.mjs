import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSET_API_DEFAULT_PAGE_SIZE,
  ASSET_API_PAGE_SIZE_OPTIONS,
  clampPage,
  getAssetApiTotalPages,
  normalizePageSize,
} from "../src/asset-inv/pagination.mjs";

test("normalizes page sizes to the supported API limits", () => {
  assert.equal(ASSET_API_DEFAULT_PAGE_SIZE, 10);
  assert.deepEqual(ASSET_API_PAGE_SIZE_OPTIONS, [10, 25, 50, 100]);
  assert.equal(normalizePageSize("50"), 50);
  assert.equal(normalizePageSize("250"), ASSET_API_DEFAULT_PAGE_SIZE);
});

test("calculates the number of pages for the selected page size", () => {
  assert.equal(getAssetApiTotalPages(4324, 10), 433);
  assert.equal(getAssetApiTotalPages(4324, 100), 44);
  assert.equal(getAssetApiTotalPages(0, 25), 1);
});

test("clamps a requested page to the available page range", () => {
  assert.equal(clampPage("12", 10), 10);
  assert.equal(clampPage("0", 10), 1);
  assert.equal(clampPage("not-a-page", 10), 1);
});
