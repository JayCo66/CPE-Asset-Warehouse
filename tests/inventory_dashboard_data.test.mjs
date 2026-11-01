import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAcquisitionDetailUrl,
  buildInventoryDashboardUrl,
  hasComparableSnapshots,
} from "../src/asset-inv/inventory-dashboard-data.mjs";

test("dashboard query serializes selected filters without sending unrestricted values", () => {
  const url = new URL(buildInventoryDashboardUrl("https://example.invalid/asset_inventory_dashboard.php", {
    snapshot: "20261022",
    department: "ภาควิชาวิศวกรรมคอมพิวเตอร์",
    category: "all",
    type: "คอมพิวเตอร์",
    building: "อาคาร 8",
    floor: "3",
    room: "8302",
    area: "ห้องปฏิบัติการ",
    fiscalYear: "2567",
    acquisitionFiscalYear: "2568",
    availability: "unavailable",
    ageBand: "11-15",
    ageThreshold: 15,
    locationStatus: "incomplete",
  }));

  assert.equal(url.searchParams.get("snapshot"), "20261022");
  assert.equal(url.searchParams.get("department"), "ภาควิชาวิศวกรรมคอมพิวเตอร์");
  assert.equal(url.searchParams.has("category"), false);
  assert.equal(url.searchParams.get("type"), "คอมพิวเตอร์");
  assert.equal(url.searchParams.get("building"), "อาคาร 8");
  assert.equal(url.searchParams.get("floor"), "3");
  assert.equal(url.searchParams.get("room"), "8302");
  assert.equal(url.searchParams.get("area"), "ห้องปฏิบัติการ");
  assert.equal(url.searchParams.get("fiscalYear"), "2567");
  assert.equal(url.searchParams.get("acquisitionFiscalYear"), "2568");
  assert.equal(url.searchParams.get("availability"), "unavailable");
  assert.equal(url.searchParams.get("ageBand"), "11-15");
  assert.equal(url.searchParams.get("ageThreshold"), "15");
  assert.equal(url.searchParams.get("locationStatus"), "incomplete");
});

test("dashboard requests can select one view without changing the default legacy request", () => {
  const endpoint = "https://example.invalid/asset_inventory_dashboard.php";
  const fullUrl = new URL(buildInventoryDashboardUrl(endpoint, { snapshot: "latest" }));
  const overviewUrl = new URL(buildInventoryDashboardUrl(endpoint, { snapshot: "latest" }, "overview"));
  const legacyAcquisitionUrl = new URL(buildInventoryDashboardUrl(endpoint, { snapshot: "latest" }, "acquisition"));
  const acquisitionSummaryUrl = new URL(buildInventoryDashboardUrl(endpoint, { snapshot: "latest" }, "acquisition", { summaryOnly: true }));

  assert.equal(fullUrl.searchParams.has("view"), false);
  assert.equal(overviewUrl.searchParams.get("view"), "overview");
  assert.equal(overviewUrl.searchParams.has("snapshot"), false);
  assert.equal(legacyAcquisitionUrl.searchParams.has("summary"), false);
  assert.equal(acquisitionSummaryUrl.searchParams.get("summary"), "1");
});

test("acquisition detail requests are snapshot-aware and preserve active filters", () => {
  const url = new URL(buildAcquisitionDetailUrl(
    "https://example.invalid/asset_inventory_dashboard.php",
    { snapshot: "latest", department: "Engineering", ageThreshold: 15 },
    "id:8d3b8504-c8f8-4e3a-a450-84776d8a121f",
    {
      detail: "cohort",
      cohortDimension: "year",
      cohortValue: "2024",
      dimension: "department",
      page: 2,
      limit: 25,
      sort: "totalAssets",
      direction: "asc",
    },
  ));

  assert.equal(url.searchParams.get("view"), "acquisition");
  assert.equal(url.searchParams.get("summary"), "1");
  assert.equal(url.searchParams.get("snapshot"), "id:8d3b8504-c8f8-4e3a-a450-84776d8a121f");
  assert.equal(url.searchParams.get("department"), "Engineering");
  assert.equal(url.searchParams.get("ageThreshold"), "15");
  assert.equal(url.searchParams.get("detail"), "cohort");
  assert.equal(url.searchParams.get("cohortValue"), "2024");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("limit"), "25");
});

test("does not enable snapshot comparison or trends with a single real snapshot", () => {
  assert.equal(hasComparableSnapshots({
    snapshotOptions: [{ key: 20261022, date: "2026-10-22" }],
    history: { available: true, series: [{ snapshotDateKey: 20261022 }], comparison: { totalAssets: 10 } },
  }), false);
  assert.equal(hasComparableSnapshots({
    snapshotOptions: [{ key: 20261022, date: "2026-10-22" }],
    history: { available: false, series: [], comparison: null },
  }), false);
});

test("shows historical comparisons only when two snapshot records and a real comparison exist", () => {
  assert.equal(hasComparableSnapshots({
    snapshotOptions: [
      { key: "id:8d3b8504-c8f8-4e3a-a450-84776d8a121f", snapshotId: "8d3b8504-c8f8-4e3a-a450-84776d8a121f" },
      { key: "id:be5166d5-2bc0-5ecc-8176-54a6260df3f4", snapshotId: "be5166d5-2bc0-5ecc-8176-54a6260df3f4" },
    ],
    history: {
      available: true,
      series: [{ snapshotDateKey: 20261022 }, { snapshotDateKey: 20261022 }],
      comparison: { totalAssets: 12 },
    },
  }), true);
  assert.equal(hasComparableSnapshots({
    snapshotOptions: [{ key: 20261022 }, { key: 20250930 }],
    history: { available: true, series: [{ snapshotDateKey: 20261022 }], comparison: null },
  }), false);
});
