import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCATION_PAGE_SIZES,
  buildLocationCompletenessSegments,
  buildLocationDepartmentRows,
  createLocationTableState,
  paginateLocationRows,
  reconcileLocationExplorerSelection,
  setLocationPage,
  setLocationPageSize,
  setLocationSort,
} from "../src/asset-inv/location-distribution.mjs";

test("location completeness is exhaustive and preserves unavailable values", () => {
  const result = buildLocationCompletenessSegments({
    totalAssets: 11,
    locationDetailCompleteAssets: 2,
    locationDetailsIncompleteAssets: 3,
    missingLocationAssets: 5,
    locationUnknownAssets: 1,
  });
  assert.equal(result.available, true);
  assert.equal(result.segments.reduce((sum, segment) => sum + segment.count, 0), result.totalAssets);
  assert.equal(result.segments[0].share, (2 / 11) * 100);
  assert.equal(result.segments[3].share, (1 / 11) * 100);
  assert.deepEqual(result.segments.map(({ key, count }) => [key, count]), [
    ["complete", 2], ["incomplete", 3], ["missing", 5], ["unknown", 1],
  ]);

  const unavailable = buildLocationCompletenessSegments({ totalAssets: 10, locationUnknownAssets: null });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.segments[3].count, null);
});

test("department location rates use each department total and keep unknown distinct", () => {
  const [row] = buildLocationDepartmentRows([{
    key: "dept-1",
    label: "หน่วยงานทดสอบ",
    filterValue: "หน่วยงานทดสอบ",
    totalAssets: 20,
    locationDetailCompleteAssets: 10,
    locationDetailsIncompleteAssets: 4,
    missingLocationAssets: 5,
    locationUnknownAssets: 1,
    representedBuildings: 2,
    representedFloors: 3,
    representedRoomsOrAreas: 4,
    mostCommonBuilding: "อาคาร A",
    mostCommonBuildingAssets: 8,
  }]);

  assert.equal(row.completeRate, 50);
  assert.equal(row.incompleteRate, 20);
  assert.equal(row.missingRate, 25);
  assert.equal(row.unknownRate, 5);
  assert.equal(row.completeAssets + row.incompleteAssets + row.missingAssets + row.unknownAssets, row.totalAssets);

  const [zero] = buildLocationDepartmentRows([{
    key: "empty",
    totalAssets: 0,
    locationDetailCompleteAssets: 0,
    locationDetailsIncompleteAssets: 0,
    missingLocationAssets: 0,
    locationUnknownAssets: 0,
  }]);
  assert.equal(zero.completeRate, null);
  assert.equal(zero.missingRate, null);
});

test("location table sorting keeps missing metrics last and paginates after sorting", () => {
  assert.deepEqual(LOCATION_PAGE_SIZES, [5, 10, 25, "all"]);
  const rows = [
    { key: "a", label: "อาคาร A", missingRate: null },
    { key: "b", label: "อาคาร B", missingRate: 0 },
    { key: "c", label: "อาคาร C", missingRate: 30 },
    { key: "d", label: "อาคาร D", missingRate: 30 },
    { key: "e", label: "อาคาร E", missingRate: 10 },
    { key: "f", label: "อาคาร F", missingRate: 5 },
  ];
  const state = createLocationTableState({ sortKey: "missingRate", direction: "desc" });
  const page = paginateLocationRows(rows, state);
  assert.equal(page.pageSize, 5);
  assert.deepEqual(page.rows.map((row) => row.key), ["c", "d", "e", "f", "b"]);
  assert.equal(page.totalRows, 6);

  const asc = paginateLocationRows(rows, { ...state, direction: "asc", pageSize: "all" });
  assert.equal(asc.rows.at(-1).key, "a");
  assert.equal(asc.rows[0].missingRate, 0);

  const resized = setLocationPageSize({ ...state, page: 2 }, 10);
  assert.equal(resized.page, 1);
  assert.equal(resized.pageSize, 10);
  const clamped = setLocationPage({ ...state, pageSize: 5 }, 99, rows.length);
  assert.equal(clamped.page, 2);
});

test("hierarchy selection reconciles children when a parent changes or disappears", () => {
  const explorer = {
    buildings: [
      { key: "building-a", floors: [{ key: "floor-a", rooms: [{ key: "room-a" }] }] },
      { key: "building-b", floors: [{ key: "floor-b", rooms: [{ key: "room-b" }, { key: "room-c" }] }] },
    ],
  };
  const initial = reconcileLocationExplorerSelection(explorer, {});
  assert.equal(initial.buildingKey, "building-a");
  assert.equal(initial.floorKey, "floor-a");
  assert.equal(initial.roomKey, "room-a");

  const changedParent = reconcileLocationExplorerSelection(explorer, {
    buildingKey: "building-b",
    floorKey: "floor-a",
    roomKey: "room-a",
  });
  assert.equal(changedParent.buildingKey, "building-b");
  assert.equal(changedParent.floorKey, "floor-b");
  assert.equal(changedParent.roomKey, "room-b");

  const afterFilter = reconcileLocationExplorerSelection({ buildings: [] }, changedParent);
  assert.equal(afterFilter.buildingKey, null);
  assert.equal(afterFilter.floorKey, null);
  assert.equal(afterFilter.roomKey, null);
});
