export const AGING_BAND_KEYS = Object.freeze(["0-2", "3-5", "6-10", "11-15", "16-20", "over-20", "unknown"]);
export const AGING_PAGE_SIZES = Object.freeze([5, 10, 25, "all"]);
export const AGING_EXPOSURE_SORT_KEYS = Object.freeze([
  "label",
  "totalAssets",
  "assetsOlderThanThreshold",
  "oldAssetRate",
  "averageAssetAge",
]);

const DEFAULT_AGING_TABLE_STATE = Object.freeze({
  page: 1,
  pageSize: 5,
  sortKey: "oldAssetRate",
  direction: "desc",
});

function numberOrNull(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonnegativeCount(value) {
  const number = numberOrNull(value);
  return number !== null && Number.isInteger(number) && number >= 0 ? number : null;
}

function compareLabels(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "th", { numeric: true });
}

function compareKeys(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true });
}

export function buildReplacementLens(overview = {}, ageDistribution = {}) {
  const totalAssets = nonnegativeCount(overview?.totalAssets);
  const knownAgeAssets = nonnegativeCount(overview?.assetsWithKnownAge);
  const aboveThresholdAssets = nonnegativeCount(overview?.assetsOlderThanThreshold);
  const unknownAgeAssets = nonnegativeCount(ageDistribution?.unknown);
  const knownBandTotal = AGING_BAND_KEYS
    .filter((key) => key !== "unknown")
    .map((key) => nonnegativeCount(ageDistribution?.[key]));
  const allKnownBandsPresent = knownBandTotal.every((count) => count !== null);
  const underThresholdAssets = knownAgeAssets !== null && aboveThresholdAssets !== null
    ? knownAgeAssets - aboveThresholdAssets
    : null;
  const available = totalAssets !== null
    && knownAgeAssets !== null
    && aboveThresholdAssets !== null
    && unknownAgeAssets !== null
    && allKnownBandsPresent
    && underThresholdAssets !== null
    && underThresholdAssets >= 0
    && knownBandTotal.reduce((sum, count) => sum + count, 0) === knownAgeAssets
    && knownAgeAssets + unknownAgeAssets === totalAssets
    && totalAssets - aboveThresholdAssets - underThresholdAssets - unknownAgeAssets === 0;

  const segments = [
    { key: "under", label: "อายุไม่เกินเกณฑ์", count: underThresholdAssets },
    { key: "over", label: "อายุเกินเกณฑ์", count: aboveThresholdAssets },
    { key: "unknown", label: "ไม่ทราบอายุ", count: unknownAgeAssets },
  ];
  const normalizedSegments = segments.map((segment) => ({
    ...segment,
    share: available && totalAssets > 0 ? (segment.count / totalAssets) * 100 : null,
  }));

  return {
    available,
    totalAssets,
    segments: normalizedSegments,
    metrics: {
      totalAssets,
      aboveThresholdAssets,
      exposureRate: numberOrNull(overview?.oldAssetRate),
      averageAssetAge: numberOrNull(overview?.averageAssetAge),
      unknownAgeAssets,
    },
  };
}

export function buildAgingExposureRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const totalAssets = nonnegativeCount(row?.totalAssets);
    const knownAgeAssets = nonnegativeCount(row?.assetsWithKnownAge);
    const unknownAgeAssets = totalAssets !== null && knownAgeAssets !== null && knownAgeAssets <= totalAssets
      ? totalAssets - knownAgeAssets
      : null;
    return {
      ...row,
      key: row?.key === null || row?.key === undefined ? null : String(row.key),
      label: row?.label || "ไม่ระบุกลุ่ม",
      filterValue: row?.filterValue ?? "__missing__",
      totalAssets,
      assetsOlderThanThreshold: nonnegativeCount(row?.assetsOlderThanThreshold),
      oldAssetRate: numberOrNull(row?.oldAssetRate),
      averageAssetAge: numberOrNull(row?.averageAssetAge),
      assetsWithKnownAge: knownAgeAssets,
      unknownAgeAssets,
    };
  });
}

export function buildDetailedAgeMatrixRows(entities, ageGroups) {
  const entityRows = Array.isArray(entities) ? entities : [];
  const sourceGroups = Array.isArray(ageGroups) ? ageGroups : [];
  const byDimensionKey = new Map();
  const validEntityKeys = new Set(entityRows
    .map((entity) => entity?.key)
    .filter((key) => key !== null && key !== undefined)
    .map(String));
  let sourceValid = sourceGroups.every((item) => {
    const dimensionKey = item?.dimensionKey;
    const bandKey = item?.ageBand;
    const count = nonnegativeCount(item?.assets);
    return dimensionKey !== null
      && dimensionKey !== undefined
      && validEntityKeys.has(String(dimensionKey))
      && AGING_BAND_KEYS.includes(bandKey)
      && count !== null;
  });

  if (sourceValid) {
    for (const item of sourceGroups) {
      const key = String(item.dimensionKey);
      const counts = byDimensionKey.get(key) ?? Object.create(null);
      counts[item.ageBand] = (counts[item.ageBand] ?? 0) + Number(item.assets);
      byDimensionKey.set(key, counts);
    }
  }

  const rows = entityRows.map((entity) => {
    const key = entity?.key === null || entity?.key === undefined ? null : String(entity.key);
    const totalAssets = nonnegativeCount(entity?.totalAssets);
    const counts = byDimensionKey.get(key) ?? Object.create(null);
    const normalizedCounts = Object.fromEntries(AGING_BAND_KEYS.map((band) => [
      band,
      counts[band] ?? 0,
    ]));
    const bandTotal = Object.values(normalizedCounts).reduce((sum, count) => sum + count, 0);
    const complete = sourceValid && key !== null && totalAssets !== null && bandTotal === totalAssets;
    const shares = Object.fromEntries(AGING_BAND_KEYS.map((band) => [
      band,
      complete && totalAssets > 0 ? (normalizedCounts[band] / totalAssets) * 100 : null,
    ]));
    return {
      ...entity,
      key,
      label: entity?.label || "ไม่ระบุกลุ่ม",
      filterValue: entity?.filterValue ?? "__missing__",
      totalAssets,
      counts: normalizedCounts,
      shares,
      complete,
    };
  });

  return { rows, available: sourceValid && rows.every((row) => row.complete) };
}

function metricValue(row, sortKey) {
  if (sortKey.startsWith("band:")) return numberOrNull(row?.counts?.[sortKey.slice(5)]);
  if (sortKey.startsWith("share:")) return numberOrNull(row?.shares?.[sortKey.slice(6)]);
  return sortKey === "label" ? row?.label : numberOrNull(row?.[sortKey]);
}

export function sortAgingRows(rows, sortKey, direction = "desc") {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const leftValue = metricValue(left, sortKey);
    const rightValue = metricValue(right, sortKey);
    const leftMissing = leftValue === null || leftValue === undefined || leftValue === "";
    const rightMissing = rightValue === null || rightValue === undefined || rightValue === "";
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    if (!leftMissing && !rightMissing) {
      const difference = typeof leftValue === "string"
        ? compareLabels(leftValue, rightValue)
        : Number(leftValue) - Number(rightValue);
      if (difference !== 0) return difference * multiplier;
    }
    const assetDifference = numberOrNull(right?.assetsOlderThanThreshold) - numberOrNull(left?.assetsOlderThanThreshold);
    return (Number.isFinite(assetDifference) ? assetDifference : 0)
      || compareLabels(left?.label, right?.label)
      || compareKeys(left?.key, right?.key);
  });
}

export function createAgingTableState(overrides = {}) {
  return {
    ...DEFAULT_AGING_TABLE_STATE,
    ...overrides,
    page: Number.isInteger(overrides.page) && overrides.page > 0 ? overrides.page : 1,
    pageSize: AGING_PAGE_SIZES.includes(overrides.pageSize) ? overrides.pageSize : DEFAULT_AGING_TABLE_STATE.pageSize,
    sortKey: typeof overrides.sortKey === "string" && overrides.sortKey ? overrides.sortKey : DEFAULT_AGING_TABLE_STATE.sortKey,
    direction: overrides.direction === "asc" ? "asc" : "desc",
  };
}

export function paginateAgingRows(rows, state = DEFAULT_AGING_TABLE_STATE) {
  const normalized = createAgingTableState(state);
  const sortedRows = sortAgingRows(rows, normalized.sortKey, normalized.direction);
  const totalRows = sortedRows.length;
  const totalPages = totalRows === 0 ? 0 : normalized.pageSize === "all" ? 1 : Math.ceil(totalRows / normalized.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(normalized.page, totalPages);
  const start = normalized.pageSize === "all" ? 0 : (page - 1) * normalized.pageSize;
  const visibleRows = normalized.pageSize === "all"
    ? sortedRows
    : sortedRows.slice(start, start + normalized.pageSize);
  return { rows: visibleRows, sortedRows, totalRows, totalPages, page, pageSize: normalized.pageSize };
}

export function setAgingPage(state, page, totalRows) {
  const normalized = createAgingTableState(state);
  const totalPages = totalRows <= 0 ? 0 : normalized.pageSize === "all" ? 1 : Math.ceil(totalRows / normalized.pageSize);
  const requested = Number.isInteger(page) && page > 0 ? page : 1;
  return { ...normalized, page: totalPages === 0 ? 1 : Math.min(requested, totalPages) };
}

export function setAgingPageSize(state, pageSize) {
  if (!AGING_PAGE_SIZES.includes(pageSize)) return createAgingTableState(state);
  return { ...createAgingTableState(state), page: 1, pageSize };
}

export function setAgingSort(state, sortKey, direction, allowedKeys = AGING_EXPOSURE_SORT_KEYS) {
  if (!allowedKeys.includes(sortKey) || !["asc", "desc"].includes(direction)) return createAgingTableState(state);
  return { ...createAgingTableState(state), page: 1, sortKey, direction };
}

export function resolveAgingDepartmentFocus(rows, selectedKey) {
  const departments = Array.isArray(rows) ? rows : [];
  return departments.find((row) => String(row?.key ?? "") === String(selectedKey ?? "")) ?? departments[0] ?? null;
}
