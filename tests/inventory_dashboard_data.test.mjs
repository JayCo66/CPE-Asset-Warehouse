import assert from "node:assert/strict";
import test from "node:test";

import {
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
    snapshotOptions: [{ key: 20261022 }, { key: 20250930 }],
    history: {
      available: true,
      series: [{ snapshotDateKey: 20261022 }, { snapshotDateKey: 20250930 }],
      comparison: { totalAssets: 12 },
    },
  }), true);
  assert.equal(hasComparableSnapshots({
    snapshotOptions: [{ key: 20261022 }, { key: 20250930 }],
    history: { available: true, series: [{ snapshotDateKey: 20261022 }], comparison: null },
  }), false);
});
