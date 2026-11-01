import assert from "node:assert/strict";
import test from "node:test";

import { createDashboardRequestCache } from "../src/asset-inv/dashboard-request-cache.mjs";

test("deduplicates concurrent requests and caches the completed value", async () => {
  const cache = createDashboardRequestCache();
  let calls = 0;
  let release;
  const loader = () => {
    calls += 1;
    return new Promise((resolve) => {
      release = () => resolve({ value: 42 });
    });
  };

  const first = cache.load("overview", loader);
  const second = cache.load("overview", loader);
  await Promise.resolve();
  release();

  assert.deepEqual(await first, { value: 42 });
  assert.deepEqual(await second, { value: 42 });
  assert.deepEqual(await cache.load("overview", loader), { value: 42 });
  assert.equal(calls, 1);
});

test("drops failed requests so a later attempt can retry", async () => {
  const cache = createDashboardRequestCache();
  let calls = 0;

  await assert.rejects(cache.load("acquisition", async () => {
    calls += 1;
    throw new Error("temporary failure");
  }), /temporary failure/u);

  assert.deepEqual(await cache.load("acquisition", async () => {
    calls += 1;
    return { value: "recovered" };
  }), { value: "recovered" });
  assert.equal(calls, 2);
});

test("discarded in-flight requests cannot overwrite a newer value for the same key", async () => {
  const cache = createDashboardRequestCache();
  let releaseOld;
  const oldRequest = cache.load("acquisition:detail", () => new Promise((resolve) => {
    releaseOld = resolve;
  }));
  await Promise.resolve();

  assert.equal(cache.discard("acquisition:detail"), true);
  const newRequest = cache.load("acquisition:detail", async () => "new detail");
  assert.equal(await newRequest, "new detail");
  releaseOld("obsolete detail");
  assert.equal(await oldRequest, "obsolete detail");
  assert.equal(await cache.load("acquisition:detail", async () => "unexpected"), "new detail");
});

test("deduplicates latest-snapshot lookups without caching the mutable alias", async () => {
  const cache = createDashboardRequestCache();
  let calls = 0;
  const loadLatest = () => cache.load("overview:latest", async () => ({ snapshotId: `snapshot-${++calls}` }), {
    cacheResult: false,
  });

  assert.deepEqual(await loadLatest(), { snapshotId: "snapshot-1" });
  assert.deepEqual(await loadLatest(), { snapshotId: "snapshot-2" });
  assert.equal(calls, 2);
});

test("expires completed section responses after the configured TTL", async () => {
  const cache = createDashboardRequestCache(7, 10);
  let calls = 0;
  const load = () => cache.load("snapshot:overview", async () => ++calls);

  assert.equal(await load(), 1);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(await load(), 2);
});

test("evicts least recently used completed responses at the configured limit", async () => {
  const cache = createDashboardRequestCache(2);
  await cache.load("overview", async () => "overview");
  await cache.load("portfolio", async () => "portfolio");
  await cache.load("overview", async () => "unused");
  await cache.load("acquisition", async () => "acquisition");

  let portfolioCalls = 0;
  await cache.load("portfolio", async () => {
    portfolioCalls += 1;
    return "portfolio";
  });

  assert.equal(portfolioCalls, 1);
});
