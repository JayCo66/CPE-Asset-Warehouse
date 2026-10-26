import assert from "node:assert/strict";
import test from "node:test";

import {
  GOVERNANCE_PAGE_SIZES,
  createGovernanceTableState,
  buildGovernanceExceptionsUrl,
  governanceRequestContext,
  paginateGovernanceRows,
  setGovernancePage,
  setGovernancePageSize,
  setGovernanceSort,
  resolveGovernancePage,
} from "../src/asset-inv/governance-quality.mjs";

test("governance tables start independently at five rows", () => {
  const fields = createGovernanceTableState("missingAssets");
  const departments = createGovernanceTableState("missingCriticalRate");

  assert.deepEqual(GOVERNANCE_PAGE_SIZES, [5, 10, 25, "all"]);
  assert.deepEqual(fields, { page: 1, pageSize: 5, sortKey: "missingAssets", direction: "desc" });
  assert.equal(departments.page, 1);
  assert.equal(departments.pageSize, 5);
  assert.equal(departments.sortKey, "missingCriticalRate");
  assert.notEqual(fields, departments);
});

test("governance pagination sorts the complete set before slicing and keeps nulls last", () => {
  const rows = [
    { label: "ค่าว่าง", rate: null },
    { label: "ศูนย์", rate: 0 },
    { label: "สูง", rate: 75 },
    { label: "กลาง", rate: 50 },
    { label: "สูงกว่า", rate: 90 },
    { label: "ต่ำ", rate: 10 },
  ];
  const page = paginateGovernanceRows(rows, createGovernanceTableState("rate"), {
    getSortValue: (row) => row.rate,
  });

  assert.deepEqual(page.rows.map((row) => row.label), ["สูงกว่า", "สูง", "กลาง", "ต่ำ", "ศูนย์"]);
  assert.equal(page.totalRows, 6);
  assert.equal(page.totalPages, 2);
  assert.equal(page.start, 1);
  assert.equal(page.end, 5);

  const ascending = paginateGovernanceRows(rows, { ...createGovernanceTableState("rate"), direction: "asc" }, {
    getSortValue: (row) => row.rate,
  });
  assert.deepEqual(ascending.rows.map((row) => row.label), ["ศูนย์", "ต่ำ", "กลาง", "สูง", "สูงกว่า"]);
});

test("governance page-size, sort, and page changes reset or clamp only their state", () => {
  const current = { page: 4, pageSize: 5, sortKey: "missingAssets", direction: "desc" };
  const resized = setGovernancePageSize(current, 10);
  const sorted = setGovernanceSort(current, "label", "asc", ["label", "missingAssets"]);

  assert.deepEqual(resized, { ...current, page: 1, pageSize: 10 });
  assert.deepEqual(sorted, { ...current, page: 1, sortKey: "label", direction: "asc" });
  assert.equal(setGovernancePage(current, 99, 12).page, 3);
  assert.equal(setGovernancePage(current, 99, 0).page, 1);
  assert.equal(setGovernancePageSize(current, "all").pageSize, "all");
});

test("governance label ties sort deterministically and source arrays stay unchanged", () => {
  const rows = [
    { label: "หน่วยงาน ข", value: 5 },
    { label: "หน่วยงาน ก", value: 5 },
    { label: "หน่วยงาน ค", value: 5 },
  ];
  const original = [...rows];
  const page = paginateGovernanceRows(rows, createGovernanceTableState("value"), {
    getSortValue: (row) => row.value,
  });

  assert.deepEqual(page.rows.map((row) => row.label), ["หน่วยงาน ก", "หน่วยงาน ข", "หน่วยงาน ค"]);
  assert.deepEqual(rows, original);
});

test("governance server pagination keeps snapshot, filters, and page state in the request", () => {
  const filters = { snapshot: "id:snapshot-7", department: "__missing__", ageThreshold: 15, category: "all" };
  const state = { page: 3, pageSize: 25, sortKey: "priority", direction: "asc" };
  const url = new URL(buildGovernanceExceptionsUrl("https://example.invalid/asset_inventory_dashboard.php", filters, state));

  assert.equal(url.searchParams.get("visualPage"), "governanceExceptions");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("pageSize"), "25");
  assert.equal(url.searchParams.get("snapshot"), "id:snapshot-7");
  assert.equal(url.searchParams.get("department"), "__missing__");
  assert.equal(url.searchParams.get("ageThreshold"), "15");
  assert.equal(url.searchParams.has("category"), false);
  assert.notEqual(governanceRequestContext(filters, "snapshot-7"), governanceRequestContext(filters, "snapshot-8"));
  assert.deepEqual(resolveGovernancePage(0, { page: 9, pageSize: 5 }), {
    totalRows: 0, totalPages: 0, page: 1, pageSize: 5, start: 0, end: 0,
  });
});

test("governance request context ignores API-normalized defaults but distinguishes active filters", () => {
  const snapshot = "id:snapshot-7";
  const snapshotId = "snapshot-7";
  const clientFilters = { snapshot, department: "all", ageThreshold: 10 };
  const apiFilters = {
    search: "",
    status: "all",
    type: "all",
    department: "all",
    category: "all",
    building: "all",
    floor: "all",
    room: "all",
    area: "all",
    source: "all",
    acquisitionYear: "all",
    fiscalYear: "all",
    acquisitionFiscalYear: "all",
    ageBand: "all",
    availability: "all",
    damage: "all",
    locationStatus: "all",
    snapshot,
    ageThreshold: 10,
  };

  assert.equal(
    governanceRequestContext(clientFilters, snapshotId),
    governanceRequestContext(apiFilters, snapshotId),
  );
  assert.notEqual(
    governanceRequestContext({ ...clientFilters, department: "unit-2" }, snapshotId),
    governanceRequestContext(apiFilters, snapshotId),
  );
});
