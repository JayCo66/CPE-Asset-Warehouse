export const DEPARTMENT_COMPARISON_PAGE_SIZES = Object.freeze([5, 10, 25, "all"]);

const DEFAULT_STATE = Object.freeze({
  page: 1,
  pageSize: 5,
  sortKey: "totalAssets",
  direction: "desc",
});

const isMissing = (value) => value === null
  || value === undefined
  || (typeof value === "string" && value.trim() === "");

const isMissingMetric = (value) => isMissing(value)
  || ((typeof value === "number" || typeof value === "string") && !Number.isFinite(Number(value)));

function compareLabels(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "th", { numeric: true });
}

function compareKeys(left, right) {
  return String(getDepartmentKey(left) ?? "").localeCompare(String(getDepartmentKey(right) ?? ""), "en", { numeric: true });
}

function compareValues(left, right) {
  const leftNumber = typeof left === "number" || (typeof left === "string" && left.trim() !== "")
    ? Number(left)
    : Number.NaN;
  const rightNumber = typeof right === "number" || (typeof right === "string" && right.trim() !== "")
    ? Number(right)
    : Number.NaN;
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return compareLabels(left, right);
}

export function createDepartmentComparisonState(overrides = {}) {
  const pageSize = DEPARTMENT_COMPARISON_PAGE_SIZES.includes(overrides.pageSize)
    ? overrides.pageSize
    : DEFAULT_STATE.pageSize;
  const direction = overrides.direction === "asc" ? "asc" : "desc";
  const page = Number.isInteger(overrides.page) && overrides.page > 0 ? overrides.page : 1;
  return {
    ...DEFAULT_STATE,
    ...overrides,
    page,
    pageSize,
    sortKey: typeof overrides.sortKey === "string" && overrides.sortKey ? overrides.sortKey : DEFAULT_STATE.sortKey,
    direction,
  };
}

export function getDepartmentKey(row) {
  if (!row || typeof row !== "object") return null;
  const key = row.key ?? row.filterValue ?? row.label;
  return key === null || key === undefined ? null : String(key);
}

export function sortDepartmentRows(rows, sortKey = "totalAssets", direction = "desc") {
  const order = direction === "asc" ? 1 : -1;
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const leftValue = left?.[sortKey];
    const rightValue = right?.[sortKey];
    const leftMissing = isMissingMetric(leftValue);
    const rightMissing = isMissingMetric(rightValue);

    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    if (!leftMissing) {
      const metricOrder = compareValues(leftValue, rightValue);
      if (metricOrder !== 0) return metricOrder * order;
    }

    const labelOrder = compareLabels(left?.label, right?.label);
    return labelOrder || compareKeys(left, right);
  });
}

export function paginateDepartmentRows(rows, state = DEFAULT_STATE) {
  const normalizedState = createDepartmentComparisonState(state);
  const sortedRows = sortDepartmentRows(rows, normalizedState.sortKey, normalizedState.direction);
  const totalRows = sortedRows.length;
  const totalPages = totalRows === 0 || normalizedState.pageSize === "all"
    ? (totalRows === 0 ? 0 : 1)
    : Math.ceil(totalRows / normalizedState.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(normalizedState.page, totalPages);
  const start = normalizedState.pageSize === "all" ? 0 : (page - 1) * normalizedState.pageSize;
  const visibleRows = normalizedState.pageSize === "all"
    ? sortedRows
    : sortedRows.slice(start, start + normalizedState.pageSize);

  return { rows: visibleRows, sortedRows, totalRows, totalPages, page, pageSize: normalizedState.pageSize };
}

export function setDepartmentPage(state, page, totalRows) {
  const normalizedState = createDepartmentComparisonState(state);
  const pageSize = normalizedState.pageSize;
  const totalPages = totalRows <= 0 || pageSize === "all" ? (totalRows <= 0 ? 0 : 1) : Math.ceil(totalRows / pageSize);
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  return { ...normalizedState, page: totalPages === 0 ? 1 : Math.min(requestedPage, totalPages) };
}

export function setDepartmentPageSize(state, pageSize) {
  if (!DEPARTMENT_COMPARISON_PAGE_SIZES.includes(pageSize)) return createDepartmentComparisonState(state);
  return { ...createDepartmentComparisonState(state), page: 1, pageSize };
}

export function setDepartmentSort(state, sortKey, direction) {
  if (typeof sortKey !== "string" || !sortKey || !["asc", "desc"].includes(direction)) {
    return createDepartmentComparisonState(state);
  }
  return { ...createDepartmentComparisonState(state), page: 1, sortKey, direction };
}

export function resolveSelectedDepartment(rows, selectedKey) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((row) => getDepartmentKey(row) === String(selectedKey ?? "")) ?? rows[0];
}

export function getDepartmentHeatLevel(value, values) {
  if (isMissing(value)) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const numericValues = (Array.isArray(values) ? values : [])
    .filter((candidate) => !isMissing(candidate))
    .map(Number)
    .filter(Number.isFinite);
  if (numericValues.length === 0) return 0;
  const minimum = Math.min(...numericValues);
  const maximum = Math.max(...numericValues);
  if (minimum === maximum) return numericValue === 0 ? 0 : 0.5;
  return Math.max(0, Math.min(1, (numericValue - minimum) / (maximum - minimum)));
}
