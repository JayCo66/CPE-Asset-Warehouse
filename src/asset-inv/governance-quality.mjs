import { buildInventoryDashboardUrl } from "./inventory-dashboard-data.mjs";

export const GOVERNANCE_PAGE_SIZES = Object.freeze([5, 10, 25, "all"]);

const thaiCollator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });

export function createGovernanceTableState(sortKey, direction = "desc") {
  return { page: 1, pageSize: 5, sortKey, direction };
}

export function setGovernancePage(state, page, totalRows, sortValueCount = totalRows) {
  const pageSize = state.pageSize === "all" ? Math.max(1, sortValueCount) : state.pageSize;
  const totalPages = Math.max(0, Math.ceil(Math.max(0, totalRows) / pageSize));
  return { ...state, page: totalPages === 0 ? 1 : Math.max(1, Math.min(Math.trunc(Number(page) || 1), totalPages)) };
}

export function setGovernancePageSize(state, pageSize) {
  const normalized = pageSize === "all" ? "all" : Number(pageSize);
  if (!GOVERNANCE_PAGE_SIZES.includes(normalized)) {
    throw new RangeError("Unsupported governance page size.");
  }
  return { ...state, page: 1, pageSize: normalized };
}

export function setGovernanceSort(state, sortKey, direction, allowedSortKeys) {
  if (!allowedSortKeys.includes(sortKey) || !["asc", "desc"].includes(direction)) {
    throw new RangeError("Unsupported governance sort.");
  }
  return { ...state, page: 1, sortKey, direction };
}

function isMissingSortValue(value) {
  return value === null || value === undefined || (typeof value === "number" && Number.isNaN(value));
}

function compareValues(left, right) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return thaiCollator.compare(String(left), String(right));
}

function stableLabel(row) {
  return row?.label ?? row?.department ?? row?.assetName ?? row?.assetCode ?? "";
}

function stableKey(row) {
  return row?.key ?? row?.filterValue ?? row?.departmentFilterValue ?? row?.assetId ?? row?.assetCode ?? "";
}

export function paginateGovernanceRows(rows, state, { getSortValue = (row) => row?.[state.sortKey] } = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const direction = state.direction === "asc" ? 1 : -1;
  const sortedRows = sourceRows.map((row, index) => ({ row, index })).sort((left, right) => {
    const leftValue = getSortValue(left.row, state.sortKey);
    const rightValue = getSortValue(right.row, state.sortKey);
    const leftMissing = isMissingSortValue(leftValue);
    const rightMissing = isMissingSortValue(rightValue);
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    if (!leftMissing) {
      const valueOrder = compareValues(leftValue, rightValue) * direction;
      if (valueOrder !== 0) return valueOrder;
    }
    const labelOrder = thaiCollator.compare(String(stableLabel(left.row)), String(stableLabel(right.row)));
    if (labelOrder !== 0) return labelOrder;
    const keyOrder = thaiCollator.compare(String(stableKey(left.row)), String(stableKey(right.row)));
    return keyOrder || left.index - right.index;
  }).map(({ row }) => row);

  const totalRows = sortedRows.length;
  const pageSize = state.pageSize === "all" ? Math.max(1, totalRows) : state.pageSize;
  const totalPages = totalRows === 0 ? 0 : Math.ceil(totalRows / pageSize);
  const page = totalPages === 0 ? 1 : Math.max(1, Math.min(Math.trunc(Number(state.page) || 1), totalPages));
  const start = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = totalRows === 0 ? 0 : Math.min(totalRows, start + pageSize - 1);

  return {
    rows: sortedRows.slice(start === 0 ? 0 : start - 1, end),
    totalRows,
    totalPages,
    page,
    pageSize: state.pageSize,
    start,
    end,
  };
}

export function resolveGovernancePage(totalRows, state) {
  const total = Math.max(0, Number(totalRows) || 0);
  const effectiveSize = state.pageSize === "all" ? Math.max(1, total) : state.pageSize;
  const totalPages = total === 0 ? 0 : Math.ceil(total / effectiveSize);
  const page = totalPages === 0 ? 1 : Math.max(1, Math.min(Math.trunc(Number(state.page) || 1), totalPages));
  const start = total === 0 ? 0 : (state.pageSize === "all" ? 1 : (page - 1) * effectiveSize + 1);
  const end = total === 0 ? 0 : Math.min(total, state.pageSize === "all" ? total : start + effectiveSize - 1);
  return { totalRows: total, totalPages, page, pageSize: state.pageSize, start, end };
}

export function buildGovernanceExceptionsUrl(endpoint, filters, state) {
  const url = new URL(buildInventoryDashboardUrl(endpoint, filters));
  url.searchParams.set("visualPage", "governanceExceptions");
  url.searchParams.set("page", String(state.page));
  url.searchParams.set("pageSize", String(state.pageSize));
  return url.href;
}

export function governanceRequestContext(filters, snapshotId = null) {
  const activeFilters = Object.entries(filters || {}).filter(([key, value]) => {
    if (key === "snapshot" && snapshotId !== null && snapshotId !== undefined) return false;
    if (value === null || value === undefined || value === "" || value === "all") return false;
    if (key === "ageThreshold" && Number(value) === 10) return false;
    return true;
  });
  const orderedFilters = Object.fromEntries(activeFilters.sort(([left], [right]) => left.localeCompare(right)));
  return JSON.stringify({ snapshotId: snapshotId ?? null, filters: orderedFilters });
}
