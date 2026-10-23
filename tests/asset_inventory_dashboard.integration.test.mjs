import assert from "node:assert/strict";
import test from "node:test";

const endpoint = process.env.WAREHOUSE_DASHBOARD_API_URL;

const isMissing = (value) => value === null || value === undefined || String(value).trim() === "";
const weight = (row) => Number(row.asset_count || 0);
const flagIs = (value, expected) => value === expected || String(value) === String(expected);
const percentage = (numerator, denominator) => denominator > 0
  ? Math.round((numerator / denominator) * 1000) / 10
  : null;

function assetAgeBand(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0) return "unknown";
  const age = Number(value);
  if (age <= 2) return "0-2";
  if (age <= 5) return "3-5";
  if (age <= 10) return "6-10";
  if (age <= 15) return "11-15";
  if (age <= 20) return "16-20";
  return "over-20";
}

function filterValue(value) {
  return isMissing(value) ? "__missing__" : String(value).trim();
}

function flagFilter(value, affirmative, negative) {
  if (flagIs(value, 1)) return affirmative;
  if (flagIs(value, 0)) return negative;
  return "unknown";
}

function matchesFlag(value, selected) {
  if (selected === "unknown") return value === null || value === undefined;
  return flagIs(value, selected === "available" || selected === "damaged" || selected === "yes" ? 1 : 0);
}

test(
  "inventory dashboard returns connected fact-only summaries and honest snapshot availability",
  { skip: !endpoint },
  async () => {
    const response = await fetch(endpoint);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.data.overview.totalAssets, payload.data.snapshot.assets);
    assert.equal(payload.data.history.available, payload.data.snapshotOptions.length > 1);
    if (payload.data.snapshotOptions.length < 2) {
      assert.deepEqual(payload.data.history.series, []);
      assert.equal(payload.data.history.comparison, null);
    } else {
      assert.ok(payload.data.history.series.length > 1);
      assert.ok(payload.data.history.comparison);
    }
    assert.ok(Array.isArray(payload.data.portfolio.categories));
    assert.ok(Array.isArray(payload.data.departments.rows));
    assert.ok(Array.isArray(payload.data.locations.building));
    assert.ok(Array.isArray(payload.data.aging.byDepartment));
    assert.ok(Array.isArray(payload.data.acquisition.years));
    assert.ok(Array.isArray(payload.data.governance.exceptions));
    assert.ok(Array.isArray(payload.data.filterOptions.rooms));
    assert.ok(Array.isArray(payload.data.filterOptions.floors));
    assert.ok(Array.isArray(payload.data.filterOptions.areas));
    assert.ok(Array.isArray(payload.data.filterOptions.fiscalYears));
    assert.ok(Array.isArray(payload.data.filterOptions.acquisitionFiscalYears));
    assert.ok(!Object.hasOwn(payload.data, "assets"), "analytics should return aggregates, not a full asset collection");

    const factEndpoint = new URL(endpoint);
    factEndpoint.pathname = factEndpoint.pathname.replace(/asset_inventory_dashboard\.php$/u, "fact_asset_inventory.php");
    factEndpoint.searchParams.set("limit", "100");
    const firstPageResponse = await fetch(factEndpoint);
    const firstPage = await firstPageResponse.json();
    assert.equal(firstPageResponse.status, 200);
    const pageCount = Math.ceil(firstPage.total / 100);
    const pages = await Promise.all(Array.from({ length: pageCount }, async (_, index) => {
      const pageUrl = new URL(factEndpoint);
      pageUrl.searchParams.set("page", String(index + 1));
      const pageResponse = await fetch(pageUrl);
      assert.equal(pageResponse.status, 200);
      return pageResponse.json();
    }));
    const allRows = pages.flatMap((page) => page.data);
    const sumByFlag = (flag) => allRows.reduce((sum, row) => sum + (row[flag] === 1 ? Number(row.asset_count || 0) : 0), 0);
    assert.equal(payload.data.overview.totalAssets, allRows.reduce((sum, row) => sum + Number(row.asset_count || 0), 0));
    assert.equal(payload.data.overview.availableAssets, sumByFlag("is_available_flag"));
    assert.equal(payload.data.overview.damagedAssets, sumByFlag("is_damaged_flag"));

    if (allRows.length > 0) {
      const selectedRow = allRows.find((row) => weight(row) > 0) ?? allRows[0];
      const selectedFlags = {
        availability: flagFilter(selectedRow.is_available_flag, "available", "unavailable"),
        damage: flagFilter(selectedRow.is_damaged_flag, "damaged", "not-damaged"),
        locationStatus: flagFilter(selectedRow.has_location_flag, "assigned", "missing"),
        belowThreshold: flagFilter(selectedRow.is_below_threshold_flag, "yes", "no"),
      };
      const combinedFilters = {
        department: filterValue(selectedRow.department_name),
        category: filterValue(selectedRow.category_name),
        building: filterValue(selectedRow.building),
        floor: filterValue(selectedRow.floor),
        room: filterValue(selectedRow.room),
        area: filterValue(selectedRow.area_name),
        ageBand: assetAgeBand(selectedRow.asset_age_years),
        ...selectedFlags,
        ageThreshold: "10",
      };
      const combinedMatches = allRows.filter((row) => {
        const departmentMatches = combinedFilters.department === "__missing__"
          ? isMissing(row.department_name)
          : row.department_name === combinedFilters.department;
        const categoryMatches = combinedFilters.category === "__missing__"
          ? isMissing(row.category_name)
          : row.category_name === combinedFilters.category;
        const buildingMatches = combinedFilters.building === "__missing__"
          ? isMissing(row.building)
          : row.building === combinedFilters.building;
        const floorMatches = combinedFilters.floor === "__missing__"
          ? isMissing(row.floor)
          : row.floor === combinedFilters.floor;
        const roomMatches = combinedFilters.room === "__missing__"
          ? isMissing(row.room)
          : row.room === combinedFilters.room;
        const areaMatches = combinedFilters.area === "__missing__"
          ? isMissing(row.area_name)
          : row.area_name === combinedFilters.area;
        const locationMatches = combinedFilters.locationStatus === "unknown"
          ? row.has_location_flag === null || row.has_location_flag === undefined
          : matchesFlag(row.has_location_flag, combinedFilters.locationStatus === "assigned" ? "available" : "unavailable");
        return departmentMatches
          && categoryMatches
          && buildingMatches
          && floorMatches
          && roomMatches
          && areaMatches
          && assetAgeBand(row.asset_age_years) === combinedFilters.ageBand
          && matchesFlag(row.is_available_flag, combinedFilters.availability)
          && matchesFlag(row.is_damaged_flag, combinedFilters.damage)
          && locationMatches
          && matchesFlag(row.is_below_threshold_flag, combinedFilters.belowThreshold);
      });
      const combinedUrl = new URL(endpoint);
      for (const [name, value] of Object.entries(combinedFilters)) combinedUrl.searchParams.set(name, value);
      const combinedResponse = await fetch(combinedUrl);
      const combinedPayload = await combinedResponse.json();
      assert.equal(combinedResponse.status, 200);

      const sum = (predicate) => combinedMatches.reduce((total, row) => total + (predicate(row) ? weight(row) : 0), 0);
      const totalAssets = sum(() => true);
      const availableAssets = sum((row) => flagIs(row.is_available_flag, 1));
      const unavailableAssets = sum((row) => flagIs(row.is_available_flag, 0));
      const damagedAssets = sum((row) => flagIs(row.is_damaged_flag, 1));
      const belowThresholdAssets = sum((row) => flagIs(row.is_below_threshold_flag, 1));
      const missingLocationAssets = sum((row) => flagIs(row.has_location_flag, 0));
      const locationAssignedAssets = sum((row) => flagIs(row.has_location_flag, 1));
      const locationDetailCompleteAssets = sum((row) => flagIs(row.has_location_flag, 1)
        && ["building", "floor", "room", "area_name"].every((field) => !isMissing(row[field])));
      const knownAgeAssets = sum((row) => row.asset_age_years !== null && row.asset_age_years !== undefined && Number(row.asset_age_years) >= 0);
      const olderAssets = sum((row) => Number(row.asset_age_years) > 10);
      const overview = combinedPayload.data.overview;
      assert.equal(overview.totalAssets, totalAssets);
      assert.equal(overview.availableAssets, availableAssets);
      assert.equal(overview.unavailableAssets, unavailableAssets);
      assert.equal(overview.damagedAssets, damagedAssets);
      assert.equal(overview.belowThresholdAssets, belowThresholdAssets);
      assert.equal(overview.missingLocationAssets, missingLocationAssets);
      assert.equal(overview.locationAssignedAssets, locationAssignedAssets);
      assert.equal(overview.locationDetailCompleteAssets, locationDetailCompleteAssets);
      assert.equal(overview.assetsWithKnownAge, knownAgeAssets);
      assert.equal(overview.assetsOlderThanThreshold, olderAssets);
      assert.equal(overview.availabilityRate, percentage(availableAssets, totalAssets));
      assert.equal(overview.unavailableRate, percentage(unavailableAssets, totalAssets));
      assert.equal(overview.damageRate, percentage(damagedAssets, totalAssets));
      assert.equal(overview.belowThresholdRate, percentage(belowThresholdAssets, totalAssets));
      assert.equal(overview.missingLocationRate, percentage(missingLocationAssets, totalAssets));
      assert.equal(overview.locationCoverageRate, percentage(locationAssignedAssets, totalAssets));
      assert.equal(overview.locationDetailCompleteRate, percentage(locationDetailCompleteAssets, totalAssets));
      assert.equal(overview.ageCoverageRate, percentage(knownAgeAssets, totalAssets));
      assert.equal(overview.oldAssetRate, percentage(olderAssets, knownAgeAssets));

      const department = combinedPayload.data.departments.rows[0];
      for (const metric of ["availabilityRate", "damageRate", "belowThresholdRate", "missingLocationRate", "locationCoverageRate", "oldAssetRate"]) {
        assert.equal(department[metric], overview[metric], `Department and overview ${metric} should share the same filtered definition.`);
      }
      for (const field of Object.values(combinedPayload.data.governance.qualityFields)) {
        assert.equal(field.assets, overview.totalAssets, "Governance field coverage should use the same filtered canonical asset total.");
        assert.equal(field.missingRate, percentage(field.missingAssets, overview.totalAssets));
      }
      for (const quality of combinedPayload.data.governance.qualityByDepartment) {
        assert.equal(quality.totalAssets, overview.totalAssets, "Department governance rows should use the same combined-filter denominator.");
        assert.equal(quality.missingCriticalRate, percentage(quality.missingCriticalMetadata, quality.totalAssets));
      }
    }

    const roomDrill = payload.data.locations.room.find((row) => row.drillFilters);
    if (roomDrill) {
      const roomDrillUrl = new URL(endpoint);
      for (const [name, value] of Object.entries(roomDrill.drillFilters)) roomDrillUrl.searchParams.set(name, value);
      const roomDrillResponse = await fetch(roomDrillUrl);
      const roomDrillPayload = await roomDrillResponse.json();
      assert.equal(roomDrillResponse.status, 200);
      assert.equal(roomDrillPayload.data.overview.totalAssets, roomDrill.totalAssets);
    }

    const selectedDepartment = payload.data.filterOptions.departments[0];
    const filteredUrl = new URL(endpoint);
    filteredUrl.searchParams.set("department", selectedDepartment);
    const filteredResponse = await fetch(filteredUrl);
    const filtered = await filteredResponse.json();
    assert.equal(filteredResponse.status, 200);
    assert.equal(filtered.data.selectedFilters.department, selectedDepartment);
    assert.ok(filtered.data.overview.totalAssets <= payload.data.overview.totalAssets);
    assert.ok(filtered.data.departments.rows.every((row) => row.label === selectedDepartment));

    if (payload.data.filterOptions.departments.includes("__missing__")) {
      const missingDepartmentUrl = new URL(endpoint);
      missingDepartmentUrl.searchParams.set("department", "__missing__");
      const missingDepartmentResponse = await fetch(missingDepartmentUrl);
      const missingDepartment = await missingDepartmentResponse.json();
      assert.equal(missingDepartmentResponse.status, 200);
      assert.equal(missingDepartment.data.departments.rows.length, 1);
      assert.equal(missingDepartment.data.departments.rows[0].filterValue, "__missing__");
    }

    const badAgeBand = new URL(endpoint);
    badAgeBand.searchParams.set("ageBand", "not-a-band");
    const invalidResponse = await fetch(badAgeBand);
    assert.equal(invalidResponse.status, 400);

    const emptyUrl = new URL(endpoint);
    emptyUrl.searchParams.set("department", "__audit_no_matching_department_20261023__");
    const emptyResponse = await fetch(emptyUrl);
    const emptyPayload = await emptyResponse.json();
    assert.equal(emptyResponse.status, 200);
    assert.equal(emptyPayload.data.overview.totalAssets, 0);
    for (const rate of [
      "availabilityRate",
      "damageRate",
      "belowThresholdRate",
      "missingLocationRate",
      "locationCoverageRate",
      "locationDetailCompleteRate",
      "ageCoverageRate",
      "oldAssetRate",
    ]) {
      assert.equal(emptyPayload.data.overview[rate], null, `${rate} should be unavailable when its denominator is zero.`);
    }
    assert.equal(emptyPayload.data.overview.averageAssetAge, null);
    assert.deepEqual(emptyPayload.data.history.series, []);
    assert.equal(emptyPayload.data.history.comparison, null);
  },
);
