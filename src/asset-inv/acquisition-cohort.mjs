export const ACQUISITION_PAGE_SIZES = Object.freeze([5, 10, 25, "all"]);
export const ACQUISITION_DIMENSIONS = Object.freeze(["year", "fiscalYear"]);
export const ACQUISITION_BREAKDOWN_DIMENSIONS = Object.freeze(["department", "category", "type"]);
export const ACQUISITION_RELATIONSHIPS = Object.freeze([
  "yearDepartment", "yearCategory", "yearType", "fiscalCategory", "sourceDepartment", "sourceCategory",
]);

const COLLATOR = new Intl.Collator("th", { numeric: true, sensitivity: "base" });
const isMissing = (value) => value === null || value === undefined || value === "";
const numeric = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
  ? null
  : Number(value);
const dimensionRows = (data, dimension) => dimension === "fiscalYear" ? data?.fiscalYears : data?.years;
const sourceRows = (data, dimension) => dimension === "fiscalYear" ? data?.byFiscalSource : data?.bySource;
const getRowKey = (row) => String(row?.key ?? row?.filterValue ?? "");
const getComboCohortKey = (row) => String(row?.firstKey ?? row?.firstFilterValue ?? "");
const getComboSourceKey = (row) => String(row?.secondKey ?? row?.secondFilterValue ?? "");
const getStableKey = (row) => String(row?.key ?? row?.dimensionKey ?? row?.secondKey ?? row?.label ?? "");

function compareValues(left, right, direction) {
  const leftMissing = isMissing(left);
  const rightMissing = isMissing(right);
  if (leftMissing || rightMissing) return leftMissing === rightMissing ? 0 : leftMissing ? 1 : -1;

  const leftNumber = numeric(left);
  const rightNumber = numeric(right);
  const comparison = leftNumber !== null && rightNumber !== null
    ? leftNumber - rightNumber
    : COLLATOR.compare(String(left), String(right));
  return direction === "asc" ? comparison : -comparison;
}

export function createAcquisitionTableState(overrides = {}) {
  const pageSize = ACQUISITION_PAGE_SIZES.includes(overrides.pageSize) ? overrides.pageSize : 5;
  const direction = overrides.direction === "asc" ? "asc" : "desc";
  return {
    page: Number.isInteger(overrides.page) && overrides.page > 0 ? overrides.page : 1,
    pageSize,
    sortKey: typeof overrides.sortKey === "string" && overrides.sortKey ? overrides.sortKey : "totalAssets",
    direction,
  };
}

export function createAcquisitionHeatmapState(overrides = {}) {
  return {
    page: Number.isInteger(overrides.page) && overrides.page > 0 ? overrides.page : 1,
    pageSize: ACQUISITION_PAGE_SIZES.includes(overrides.pageSize) ? overrides.pageSize : 5,
  };
}

export function paginateAcquisitionHeatmapRows(rows, state = createAcquisitionHeatmapState()) {
  const normalized = createAcquisitionHeatmapState(state);
  const completeRows = Array.isArray(rows) ? rows : [];
  const totalRows = completeRows.length;
  const totalPages = totalRows === 0 ? 0 : normalized.pageSize === "all" ? 1 : Math.ceil(totalRows / normalized.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(normalized.page, totalPages);
  const start = normalized.pageSize === "all" ? 0 : (page - 1) * normalized.pageSize;
  const visibleRows = normalized.pageSize === "all"
    ? completeRows
    : completeRows.slice(start, start + normalized.pageSize);
  return { rows: visibleRows, totalRows, totalPages, page, pageSize: normalized.pageSize };
}

export function setAcquisitionHeatmapPage(state, page, totalRows) {
  const normalized = createAcquisitionHeatmapState(state);
  const totalPages = totalRows <= 0 ? 0 : normalized.pageSize === "all" ? 1 : Math.ceil(totalRows / normalized.pageSize);
  const requested = Number.isInteger(page) && page > 0 ? page : 1;
  return { ...normalized, page: totalPages === 0 ? 1 : Math.min(requested, totalPages) };
}

export function setAcquisitionHeatmapPageSize(state, pageSize) {
  if (!ACQUISITION_PAGE_SIZES.includes(pageSize)) return createAcquisitionHeatmapState(state);
  return { ...createAcquisitionHeatmapState(state), page: 1, pageSize };
}

export function sortAcquisitionRows(rows, sortKey, direction = "desc") {
  const dir = direction === "asc" ? "asc" : "desc";
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const primary = compareValues(left?.[sortKey], right?.[sortKey], dir);
    if (primary !== 0) return primary;
    const label = COLLATOR.compare(String(left?.label ?? ""), String(right?.label ?? ""));
    if (label !== 0) return label;
    return COLLATOR.compare(getStableKey(left), getStableKey(right));
  });
}

export function paginateAcquisitionRows(rows, state = createAcquisitionTableState()) {
  const normalized = createAcquisitionTableState(state);
  const sortedRows = sortAcquisitionRows(rows, normalized.sortKey, normalized.direction);
  const totalRows = sortedRows.length;
  const totalPages = totalRows === 0 ? 0 : normalized.pageSize === "all" ? 1 : Math.ceil(totalRows / normalized.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(normalized.page, totalPages);
  const start = normalized.pageSize === "all" ? 0 : (page - 1) * normalized.pageSize;
  const visibleRows = normalized.pageSize === "all"
    ? sortedRows
    : sortedRows.slice(start, start + normalized.pageSize);
  return { rows: visibleRows, sortedRows, totalRows, totalPages, page, pageSize: normalized.pageSize };
}

export function setAcquisitionPage(state, page, totalRows) {
  const normalized = createAcquisitionTableState(state);
  const totalPages = totalRows <= 0 ? 0 : normalized.pageSize === "all" ? 1 : Math.ceil(totalRows / normalized.pageSize);
  const requested = Number.isInteger(page) && page > 0 ? page : 1;
  return { ...normalized, page: totalPages === 0 ? 1 : Math.min(requested, totalPages) };
}

export function setAcquisitionPageSize(state, pageSize) {
  if (!ACQUISITION_PAGE_SIZES.includes(pageSize)) return createAcquisitionTableState(state);
  return { ...createAcquisitionTableState(state), page: 1, pageSize };
}

export function setAcquisitionSort(state, sortKey, direction, allowedKeys = []) {
  if ((allowedKeys.length > 0 && !allowedKeys.includes(sortKey)) || !["asc", "desc"].includes(direction)) {
    return createAcquisitionTableState(state);
  }
  return { ...createAcquisitionTableState(state), page: 1, sortKey, direction };
}

export function buildAcquisitionHeatmap(data, dimension = "year") {
  if (!ACQUISITION_DIMENSIONS.includes(dimension)) return { available: false, rows: [], sources: [], maxCount: 0 };
  const cohorts = dimensionRows(data, dimension);
  const sources = data?.sources;
  const combinations = sourceRows(data, dimension);
  if (!Array.isArray(cohorts) || !Array.isArray(sources) || !Array.isArray(combinations)) {
    return { available: false, rows: [], sources: [], maxCount: 0 };
  }

  const sortedCohorts = [...cohorts].sort((left, right) => {
    const leftYear = numeric(left?.label);
    const rightYear = numeric(right?.label);
    if (leftYear === null || rightYear === null) {
      if (leftYear !== rightYear) return leftYear === null ? 1 : -1;
      return COLLATOR.compare(String(left?.label ?? ""), String(right?.label ?? ""));
    }
    return rightYear - leftYear || COLLATOR.compare(getRowKey(left), getRowKey(right));
  });
  const combinationMap = new Map(combinations.map((row) => [
    JSON.stringify([getComboCohortKey(row), getComboSourceKey(row)]), row,
  ]));
  const maxCount = Math.max(0, ...combinations.map((row) => numeric(row?.totalAssets)).filter((value) => value !== null));
  const rows = sortedCohorts.map((cohort) => {
    const cohortKey = getRowKey(cohort);
    const cells = sources.map((source) => {
      const sourceKey = getRowKey(source);
      const match = combinationMap.get(JSON.stringify([cohortKey, sourceKey]));
      const count = match ? numeric(match.totalAssets) : 0;
      return {
        key: sourceKey,
        label: String(source?.label ?? ""),
        filterValue: source?.filterValue ?? null,
        count,
        intensity: count === null || maxCount === 0 ? 0 : count / maxCount,
        metrics: match ?? null,
      };
    });
    return { ...cohort, key: cohortKey, cells };
  });
  return { available: true, rows, sources: [...sources], maxCount };
}

export function buildAcquisitionOverview(data, totalAssets, overview = {}) {
  const years = Array.isArray(data?.years) ? data.years : [];
  const validYears = years.filter((row) => numeric(row?.label) !== null && row?.filterValue !== "__missing__");
  const sortedYears = [...validYears].sort((left, right) => numeric(left.label) - numeric(right.label));
  const yearCoverage = sortedYears.length === 0
    ? null
    : {
      earliest: String(sortedYears[0].label),
      latest: String(sortedYears.at(-1).label),
      distinctYears: new Set(sortedYears.map(getRowKey)).size,
    };
  const sources = Array.isArray(data?.sources) ? [...data.sources] : [];
  sources.sort((left, right) =>
    (numeric(right?.totalAssets) ?? -1) - (numeric(left?.totalAssets) ?? -1)
    || COLLATOR.compare(String(left?.label ?? ""), String(right?.label ?? ""))
    || COLLATOR.compare(getRowKey(left), getRowKey(right))
  );
  const dominant = sources[0] && numeric(sources[0].totalAssets) !== null ? sources[0] : null;
  const total = numeric(totalAssets);
  return {
    totalAssets: total,
    yearCoverage,
    dominantSource: dominant ? {
      key: getRowKey(dominant),
      label: dominant.label,
      totalAssets: numeric(dominant.totalAssets),
      assetShareRate: total > 0 ? Number(((Number(dominant.totalAssets) / total) * 100).toFixed(1)) : null,
    } : null,
    aging: {
      assetsOlderThanThreshold: numeric(overview?.assetsOlderThanThreshold),
      oldAssetRate: numeric(overview?.oldAssetRate),
      assetsWithKnownAge: numeric(overview?.assetsWithKnownAge),
    },
  };
}

export function buildAcquisitionFocus(data, totalAssets, dimension, cohortKey, sourceKey = null) {
  const heatmap = buildAcquisitionHeatmap(data, dimension);
  if (!heatmap.available || heatmap.rows.length === 0) return null;
  const cohort = heatmap.rows.find((row) => row.key === String(cohortKey)) ?? heatmap.rows[0];
  const requestedSource = sourceKey === null ? null : heatmap.sources.find((row) => getRowKey(row) === String(sourceKey));
  const selectedSource = requestedSource ?? null;
  const selectedCell = selectedSource ? cohort.cells.find((cell) => cell.key === getRowKey(selectedSource)) : null;
  const subset = selectedSource ? selectedCell?.metrics : cohort;
  if (selectedSource && !selectedCell) return buildAcquisitionFocus(data, totalAssets, dimension, cohort.key, null);

  const count = numeric(subset?.totalAssets) ?? (selectedSource ? 0 : null);
  const cohortCount = numeric(cohort.totalAssets);
  const knownAgeCount = numeric(subset?.assetsWithKnownAge);
  const fundingComposition = cohort.cells.map((cell) => ({
    key: cell.key,
    label: cell.label,
    filterValue: cell.filterValue,
    totalAssets: cell.count,
    shareWithinCohortRate: cohortCount > 0 && cell.count !== null
      ? Number(((cell.count / cohortCount) * 100).toFixed(1))
      : null,
    selected: selectedSource ? cell.key === getRowKey(selectedSource) : false,
  }));
  return {
    dimension,
    cohortKey: cohort.key,
    cohortLabel: cohort.label,
    cohortFilterValue: cohort.filterValue,
    sourceKey: selectedSource ? getRowKey(selectedSource) : null,
    sourceLabel: selectedSource?.label ?? null,
    sourceFilterValue: selectedSource?.filterValue ?? null,
    selectionType: selectedSource ? "funding" : "cohort",
    totalAssets: count,
    cohortTotalAssets: cohortCount,
    portfolioShareRate: numeric(totalAssets) > 0 && count !== null
      ? Number(((count / Number(totalAssets)) * 100).toFixed(1))
      : null,
    fundingShareRate: selectedSource && cohortCount > 0 && count !== null
      ? Number(((count / cohortCount) * 100).toFixed(1))
      : null,
    averageAssetAge: numeric(subset?.averageAssetAge),
    assetsOlderThanThreshold: numeric(subset?.assetsOlderThanThreshold),
    oldAssetRate: numeric(subset?.oldAssetRate),
    assetsWithKnownAge: knownAgeCount,
    unknownAgeAssets: count !== null && knownAgeCount !== null && knownAgeCount <= count ? count - knownAgeCount : null,
    fundingComposition,
  };
}

const WHOLE_COHORT_GROUPS = Object.freeze({
  year: { department: "byDepartment", category: "byCategory", type: "byType" },
  fiscalYear: { department: "byFiscalDepartment", category: "byFiscalCategory", type: "byFiscalType" },
});

const ACQUISITION_FILTER_KEYS = Object.freeze({
  year: "acquisitionYear",
  fiscalYear: "acquisitionFiscalYear",
  department: "department",
  category: "category",
  type: "type",
  source: "source",
});

export function buildAcquisitionCohortDrillFilters(focus, dimension = null, row = null) {
  if (!focus) return {};
  const filters = {};
  const cohortFilter = ACQUISITION_FILTER_KEYS[focus.dimension];
  if (cohortFilter && focus.cohortFilterValue !== null && focus.cohortFilterValue !== undefined) {
    filters[cohortFilter] = focus.cohortFilterValue;
  }
  if (focus.sourceKey !== null && focus.sourceFilterValue !== null && focus.sourceFilterValue !== undefined) {
    filters.source = focus.sourceFilterValue;
  }
  const dimensionFilter = ACQUISITION_FILTER_KEYS[dimension];
  if (row && dimensionFilter && row.filterValue !== null && row.filterValue !== undefined) {
    filters[dimensionFilter] = row.filterValue;
  }
  return filters;
}

export function buildAcquisitionCrossDimensionDrillFilters(relation, row) {
  const relationFilters = {
    yearDepartment: ["acquisitionYear", "department"],
    yearCategory: ["acquisitionYear", "category"],
    yearType: ["acquisitionYear", "type"],
    fiscalCategory: ["acquisitionFiscalYear", "category"],
    sourceDepartment: ["source", "department"],
    sourceCategory: ["source", "category"],
  }[relation];
  if (!relationFilters || !row) return {};
  return Object.fromEntries([
    [relationFilters[0], row.firstFilterValue],
    [relationFilters[1], row.secondFilterValue],
  ].filter(([, value]) => value !== null && value !== undefined));
}

export function buildAcquisitionBreakdown(data, dimension, focus) {
  if (!focus || !ACQUISITION_BREAKDOWN_DIMENSIONS.includes(dimension)) return { available: false, rows: [] };
  const cohortDimension = focus.dimension;
  let rows;
  if (focus.sourceKey !== null) {
    const combinations = data?.cohortDetails?.[cohortDimension]?.[dimension];
    if (!Array.isArray(combinations)) return { available: false, rows: [] };
    rows = combinations
      .filter((row) => String(row.cohortKey) === focus.cohortKey && String(row.sourceKey) === focus.sourceKey)
      .map((row) => ({
        key: String(row.dimensionKey ?? row.dimensionFilterValue ?? row.dimension ?? ""),
        label: String(row.dimension ?? ""),
        filterValue: row.dimensionFilterValue ?? null,
        totalAssets: numeric(row.totalAssets),
        averageAssetAge: numeric(row.averageAssetAge),
        assetsOlderThanThreshold: numeric(row.assetsOlderThanThreshold),
        oldAssetRate: numeric(row.oldAssetRate),
        sourceFilterValue: row.sourceFilterValue ?? focus.sourceFilterValue,
      }));
  } else {
    const relationKey = WHOLE_COHORT_GROUPS[cohortDimension]?.[dimension];
    const combinations = relationKey ? data?.[relationKey] : null;
    if (!Array.isArray(combinations)) return { available: false, rows: [] };
    rows = combinations
      .filter((row) => getComboCohortKey(row) === focus.cohortKey)
      .map((row) => ({
        key: String(row.secondKey ?? row.secondFilterValue ?? row.second ?? ""),
        label: String(row.second ?? ""),
        filterValue: row.secondFilterValue ?? null,
        totalAssets: numeric(row.totalAssets),
        averageAssetAge: numeric(row.averageAssetAge),
        assetsOlderThanThreshold: numeric(row.assetsOlderThanThreshold),
        oldAssetRate: numeric(row.oldAssetRate),
        sourceFilterValue: null,
      }));
  }
  const normalized = rows.map((row) => ({
    ...row,
    shareRate: focus.totalAssets > 0 && row.totalAssets !== null
      ? Number(((row.totalAssets / focus.totalAssets) * 100).toFixed(1))
      : null,
  }));
  const deduplicated = new Map();
  for (const row of normalized) {
    const prior = deduplicated.get(row.key);
    if (prior) return { available: false, rows: [] };
    deduplicated.set(row.key, row);
  }
  return { available: true, rows: [...deduplicated.values()] };
}

export function buildAcquisitionCrossDimensionRows(data, relation) {
  const sourceRowsByRelation = {
    yearDepartment: [data?.byDepartment, "acquisitionYear", "department"],
    yearCategory: [data?.byCategory, "acquisitionYear", "category"],
    yearType: [data?.byType, "acquisitionYear", "type"],
    fiscalCategory: [data?.byFiscalCategory, "acquisitionFiscalYear", "category"],
    sourceDepartment: [data?.sourceDepartment, "source", "department"],
    sourceCategory: [data?.sourceCategory, "source", "category"],
  };
  const [rows, firstFilter, secondFilter] = sourceRowsByRelation[relation] || [];
  if (!Array.isArray(rows)) return { available: false, rows: [], firstFilter: null, secondFilter: null };
  return {
    available: true,
    firstFilter,
    secondFilter,
    rows: rows.map((row) => ({
      key: JSON.stringify([row.firstKey ?? row.firstFilterValue, row.secondKey ?? row.secondFilterValue]),
      first: row.first,
      second: row.second,
      firstKey: row.firstKey ?? row.firstFilterValue,
      secondKey: row.secondKey ?? row.secondFilterValue,
      firstFilterValue: row.firstFilterValue ?? null,
      secondFilterValue: row.secondFilterValue ?? null,
      label: String(row.second ?? ""),
      totalAssets: numeric(row.totalAssets),
      averageAssetAge: numeric(row.averageAssetAge),
      assetsOlderThanThreshold: numeric(row.assetsOlderThanThreshold),
      oldAssetRate: numeric(row.oldAssetRate),
    })),
  };
}
