export const PORTFOLIO_MATRIX_PAGE_SIZES = Object.freeze([5, 10, 25, "all"]);

const DEFAULT_STATE = Object.freeze({
  page: 1,
  pageSize: 5,
  sortKey: "totalAssets",
  direction: "desc",
});

function dimensionKey(item) {
  if (typeof item !== "object" || item === null) {
    return item === null || item === undefined || item === "" ? null : String(item);
  }
  const key = item?.key ?? item?.departmentKey ?? item?.categoryKey ?? item?.filterValue ?? item?.label;
  return key === null || key === undefined || key === "" ? null : String(key);
}

function metricNumber(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareLabels(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "th", { numeric: true });
}

function compareKeys(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true });
}

export function getPortfolioDepartmentKey(row) {
  return dimensionKey(row);
}

export function getPortfolioCategoryKey(category) {
  return dimensionKey(category);
}

export function createPortfolioMatrixState(overrides = {}) {
  const pageSize = PORTFOLIO_MATRIX_PAGE_SIZES.includes(overrides.pageSize)
    ? overrides.pageSize
    : DEFAULT_STATE.pageSize;
  const page = Number.isInteger(overrides.page) && overrides.page > 0 ? overrides.page : 1;
  return {
    ...DEFAULT_STATE,
    ...overrides,
    page,
    pageSize,
    sortKey: typeof overrides.sortKey === "string" && overrides.sortKey ? overrides.sortKey : DEFAULT_STATE.sortKey,
    direction: overrides.direction === "asc" ? "asc" : "desc",
  };
}

export function buildPortfolioMatrixRows(departments, categories, combinations) {
  const departmentRows = Array.isArray(departments) ? departments : [];
  const categoryRows = Array.isArray(categories) ? categories : [];
  const matrixRows = Array.isArray(combinations) ? combinations : [];
  const categoryKeys = categoryRows.map(getPortfolioCategoryKey).filter((key) => key !== null);
  const categoryKeySet = new Set(categoryKeys);
  const rows = departmentRows.map((department) => {
    const key = getPortfolioDepartmentKey(department);
    return {
      key,
      label: department?.label || "ไม่ระบุหน่วยงาน",
      filterValue: department?.filterValue ?? "__missing__",
      totalAssets: metricNumber(department?.totalAssets),
      distinctTypes: metricNumber(department?.distinctTypes),
      categoryCounts: new Map(categoryKeys.map((categoryKey) => [categoryKey, 0])),
    };
  });
  const rowsByKey = new Map(rows.filter((row) => row.key !== null).map((row) => [row.key, row]));
  let complete = Array.isArray(departments) && Array.isArray(categories) && Array.isArray(combinations);

  for (const combination of matrixRows) {
    const departmentKey = dimensionKey(combination?.departmentKey);
    const categoryKey = dimensionKey(combination?.categoryKey);
    const row = rowsByKey.get(departmentKey);
    const assets = metricNumber(combination?.assets);
    if (!row || !categoryKeySet.has(categoryKey) || assets === null) {
      complete = false;
      continue;
    }
    const previous = row.categoryCounts.get(categoryKey);
    row.categoryCounts.set(categoryKey, previous === null ? assets : previous + assets);
  }

  for (const row of rows) {
    const categoryTotal = [...row.categoryCounts.values()].reduce((sum, value) => sum + (value ?? 0), 0);
    if (row.totalAssets === null || Math.abs(categoryTotal - row.totalAssets) > 0.000001) complete = false;
  }

  return { rows, complete };
}

export function getPortfolioCategoryShare(assets, departmentTotal) {
  const numerator = metricNumber(assets);
  const denominator = metricNumber(departmentTotal);
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function rowMetric(row, sortKey) {
  if (sortKey === "totalAssets") return row?.totalAssets;
  if (sortKey.startsWith("category:")) return row?.categoryCounts?.get(sortKey.slice("category:".length));
  return null;
}

export function sortPortfolioMatrixRows(rows, sortKey = "totalAssets", direction = "desc") {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const leftValue = metricNumber(rowMetric(left, sortKey));
    const rightValue = metricNumber(rowMetric(right, sortKey));
    if ((leftValue === null) !== (rightValue === null)) return leftValue === null ? 1 : -1;
    if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
      return (leftValue - rightValue) * multiplier;
    }
    return compareLabels(left?.label, right?.label) || compareKeys(left?.key, right?.key);
  });
}

export function paginatePortfolioMatrixRows(rows, state = DEFAULT_STATE) {
  const normalized = createPortfolioMatrixState(state);
  const sortedRows = sortPortfolioMatrixRows(rows, normalized.sortKey, normalized.direction);
  const totalRows = sortedRows.length;
  const totalPages = totalRows === 0 ? 0 : normalized.pageSize === "all" ? 1 : Math.ceil(totalRows / normalized.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(normalized.page, totalPages);
  const startIndex = normalized.pageSize === "all" ? 0 : (page - 1) * normalized.pageSize;
  const visibleRows = normalized.pageSize === "all"
    ? sortedRows
    : sortedRows.slice(startIndex, startIndex + normalized.pageSize);
  return { rows: visibleRows, sortedRows, totalRows, totalPages, page, pageSize: normalized.pageSize };
}

export function setPortfolioMatrixPage(state, page, totalRows) {
  const normalized = createPortfolioMatrixState(state);
  const totalPages = totalRows <= 0 ? 0 : normalized.pageSize === "all" ? 1 : Math.ceil(totalRows / normalized.pageSize);
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  return { ...normalized, page: totalPages === 0 ? 1 : Math.min(requestedPage, totalPages) };
}

export function setPortfolioMatrixPageSize(state, pageSize) {
  if (!PORTFOLIO_MATRIX_PAGE_SIZES.includes(pageSize)) return createPortfolioMatrixState(state);
  return { ...createPortfolioMatrixState(state), page: 1, pageSize };
}

export function setPortfolioMatrixSort(state, sortKey, direction) {
  if (typeof sortKey !== "string" || (!sortKey.startsWith("category:") && sortKey !== "totalAssets") || !["asc", "desc"].includes(direction)) {
    return createPortfolioMatrixState(state);
  }
  return { ...createPortfolioMatrixState(state), page: 1, sortKey, direction };
}

export function resolvePortfolioDepartment(rows, selectedKey) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((row) => getPortfolioDepartmentKey(row) === String(selectedKey ?? "")) ?? rows[0];
}
