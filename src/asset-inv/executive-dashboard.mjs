import {
  buildInventoryDashboardUrl,
  hasComparableSnapshots,
} from "./inventory-dashboard-data.mjs?v=20261026.1";
import {
  createDepartmentComparisonState,
  DEPARTMENT_COMPARISON_PAGE_SIZES,
  getDepartmentHeatLevel,
  getDepartmentKey,
  paginateDepartmentRows,
  resolveSelectedDepartment,
  setDepartmentPage,
  setDepartmentPageSize,
  setDepartmentSort,
} from "./department-comparison.mjs?v=20261026.1";
import { squarifyTreemap } from "./treemap-layout.mjs?v=20261025.1";
import {
  buildPortfolioMatrixRows,
  createPortfolioMatrixState,
  getPortfolioCategoryKey,
  getPortfolioCategoryShare,
  getPortfolioDepartmentKey,
  paginatePortfolioMatrixRows,
  PORTFOLIO_MATRIX_PAGE_SIZES,
  resolvePortfolioDepartment,
  setPortfolioMatrixPage,
  setPortfolioMatrixPageSize,
  setPortfolioMatrixSort,
} from "./portfolio-composition.mjs?v=20261026.1";
import {
  buildLocationCompletenessSegments,
  buildLocationDepartmentRows,
  createLocationTableState,
  LOCATION_PAGE_SIZES,
  paginateLocationRows,
  reconcileLocationExplorerSelection,
  setLocationPage,
  setLocationPageSize,
  setLocationSort,
} from "./location-distribution.mjs?v=20261026.1";
import {
  AGING_BAND_KEYS,
  AGING_EXPOSURE_SORT_KEYS,
  AGING_PAGE_SIZES,
  buildAgingExposureRows,
  buildDetailedAgeMatrixRows,
  buildReplacementLens,
  createAgingTableState,
  paginateAgingRows,
  resolveAgingDepartmentFocus,
  setAgingPage,
  setAgingPageSize,
  setAgingSort,
} from "./aging-replacement.mjs?v=20261026.1";
import {
  ACQUISITION_BREAKDOWN_DIMENSIONS,
  ACQUISITION_DIMENSIONS,
  ACQUISITION_PAGE_SIZES,
  ACQUISITION_RELATIONSHIPS,
  buildAcquisitionBreakdown,
  buildAcquisitionCohortDrillFilters,
  buildAcquisitionCrossDimensionDrillFilters,
  buildAcquisitionCrossDimensionRows,
  buildAcquisitionFocus,
  buildAcquisitionHeatmap,
  buildAcquisitionOverview,
  createAcquisitionHeatmapState,
  createAcquisitionTableState,
  paginateAcquisitionHeatmapRows,
  paginateAcquisitionRows,
  setAcquisitionHeatmapPage,
  setAcquisitionHeatmapPageSize,
  setAcquisitionPage,
  setAcquisitionPageSize,
  setAcquisitionSort,
} from "./acquisition-cohort.mjs?v=20261026.1";
import {
  GOVERNANCE_PAGE_SIZES,
  buildGovernanceExceptionsUrl,
  createGovernanceTableState,
  governanceRequestContext,
  paginateGovernanceRows,
  resolveGovernancePage,
  setGovernancePage,
  setGovernancePageSize,
  setGovernanceSort,
} from "./governance-quality.mjs?v=20261026.2";

const DASHBOARD_API = new URL("../../assets_api/asset_inventory_dashboard.php", import.meta.url).href;
const SNAPSHOT_IMPORT_API = new URL("../../assets_api/import_university_snapshot.php", import.meta.url).href;
const PAGE_IDS = ["overview", "portfolio", "departments", "locations", "aging", "acquisition", "governance", "explorer"];
const FILTER_DEFAULTS = Object.freeze({
  snapshot: "latest",
  department: "all",
  category: "all",
  type: "all",
  building: "all",
  floor: "all",
  room: "all",
  area: "all",
  source: "all",
  status: "all",
  acquisitionYear: "all",
  fiscalYear: "all",
  acquisitionFiscalYear: "all",
  ageBand: "all",
  availability: "all",
  damage: "all",
  locationStatus: "all",
  ageThreshold: 10,
});
const FILTER_LABELS = Object.freeze({
  department: "ทุกหน่วยงาน",
  category: "ทุกหมวดหมู่",
  type: "ทุกประเภท",
  building: "ทุกอาคาร",
  floor: "ทุกชั้น",
  room: "ทุกห้อง",
  area: "ทุกพื้นที่",
  source: "ทุกแหล่งเงิน",
  status: "ทุกสถานะ",
  acquisitionYear: "ทุกปี",
  fiscalYear: "ทุกปีงบประมาณของสินทรัพย์",
  acquisitionFiscalYear: "ทุกปีงบประมาณจัดหา",
});
const AGE_LABELS = Object.freeze({
  "0-2": "0–2 ปี",
  "3-5": "3–5 ปี",
  "6-10": "6–10 ปี",
  "11-15": "11–15 ปี",
  "16-20": "16–20 ปี",
  "over-20": "มากกว่า 20 ปี",
  unknown: "ไม่ทราบอายุ",
});
const AGING_DIMENSIONS = Object.freeze(["department", "category", "type"]);
const AGING_DIMENSION_LABELS = Object.freeze({ department: "หน่วยงาน", category: "หมวดหมู่", type: "ประเภท" });
const ACQUISITION_DIMENSION_LABELS = Object.freeze({ year: "ปีจัดหา", fiscalYear: "ปีงบประมาณจัดหา" });
const ACQUISITION_BREAKDOWN_LABELS = Object.freeze({ department: "หน่วยงาน", category: "หมวดหมู่", type: "ประเภท" });
const ACQUISITION_RELATION_LABELS = Object.freeze({
  yearDepartment: ["ปีจัดหา", "หน่วยงาน"],
  yearCategory: ["ปีจัดหา", "หมวดหมู่"],
  yearType: ["ปีจัดหา", "ประเภท"],
  fiscalCategory: ["ปีงบประมาณจัดหา", "หมวดหมู่"],
  sourceDepartment: ["แหล่งเงิน", "หน่วยงาน"],
  sourceCategory: ["แหล่งเงิน", "หมวดหมู่"],
});
const ACQUISITION_TABLE_SORT_KEYS = Object.freeze(["label", "totalAssets", "shareRate", "averageAssetAge"]);
const ACQUISITION_CROSS_SORT_KEYS = Object.freeze(["first", "second", "totalAssets", "averageAssetAge", "oldAssetRate"]);
const AGING_DETAIL_SORT_KEYS = Object.freeze([
  "label",
  "totalAssets",
  ...AGING_BAND_KEYS.map((band) => `band:${band}`),
]);
const GOVERNANCE_FIELD_SORT_KEYS = Object.freeze(["label", "tier", "missingAssets", "missingRate", "completeRate"]);
const GOVERNANCE_FIELD_LABELS = Object.freeze({
  assetCode: "รหัส",
  assetName: "ชื่อ",
  brand: "ยี่ห้อ",
  model: "รุ่น",
  purchaseYear: "ปีจัดซื้อ",
  fiscalYear: "ปีงบประมาณ",
  source: "แหล่งเงิน",
  assetStatus: "สถานะสินทรัพย์",
  department: "หน่วยงาน",
  location: "ตำแหน่ง",
  building: "อาคาร",
  floor: "ชั้น",
  room: "ห้อง",
  area: "พื้นที่",
});
const GOVERNANCE_DEPARTMENT_SORT_KEYS = Object.freeze([
  "department",
  "totalAssets",
  "missingCriticalRate",
  ...Object.keys(GOVERNANCE_FIELD_LABELS).map((key) => `field:${key}`),
]);
const createAgingTableStates = (sortKey) => Object.fromEntries(AGING_DIMENSIONS.map((dimension) => [
  dimension,
  createAgingTableState({ sortKey, direction: "desc" }),
]));
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
const DATE_FORMAT = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });
const ISSUE_HEATMAP_LIMIT = 5;
const ISSUE_HEATMAP_SORT_KEYS = new Set(["missingLocationRate", "oldAssetRate", "damageRate"]);

let filters = { ...FILTER_DEFAULTS };
let latestPayload = null;
let requestId = 0;
let onFiltersChange = () => {};
let departmentSort = { key: "totalAssets", direction: "desc" };
let departmentComparisonState = createDepartmentComparisonState();
let selectedDepartmentKey = null;
let portfolioMatrixState = createPortfolioMatrixState();
let selectedPortfolioDepartmentKey = null;
let selectedPortfolioCategoryKey = null;
let locationExplorerSelection = { buildingKey: null, floorKey: null, roomKey: null };
let locationExplorerPages = {
  building: createLocationTableState({ sortKey: "totalAssets", direction: "desc" }),
  floor: createLocationTableState({ sortKey: "totalAssets", direction: "desc" }),
  room: createLocationTableState({ sortKey: "totalAssets", direction: "desc" }),
};
let locationMatrixState = createLocationTableState({ sortKey: "missingRate", direction: "desc" });
let locationCategoryBuildingState = createLocationTableState({ sortKey: "totalAssets", direction: "desc" });
let selectedLocationDepartmentKey = null;
let agingExposureDimension = "department";
let agingDetailDimension = "department";
let agingConditionMode = "availability";
let agingExposureStates = createAgingTableStates("oldAssetRate");
let agingDetailStates = createAgingTableStates("totalAssets");
let selectedAgingDepartmentKey = null;
let acquisitionYearDimension = "year";
let acquisitionSelectedCohortKey = null;
let acquisitionSelectedSourceKey = null;
let acquisitionBreakdownDimension = "department";
let acquisitionCrossRelation = "yearDepartment";
let acquisitionHeatmapState = createAcquisitionHeatmapState();
let acquisitionBreakdownStates = Object.fromEntries(ACQUISITION_BREAKDOWN_DIMENSIONS.map((dimension) => [
  dimension,
  createAcquisitionTableState({ sortKey: "totalAssets", direction: "desc" }),
]));
let acquisitionCrossStates = Object.fromEntries(ACQUISITION_RELATIONSHIPS.map((relation) => [
  relation,
  createAcquisitionTableState({ sortKey: "totalAssets", direction: "desc" }),
]));
let issueHeatmapSort = { key: "missingLocationRate", direction: "desc" };
let issueHeatmapExpanded = false;
let governanceFieldState = createGovernanceTableState("missingAssets");
let governanceDepartmentState = createGovernanceTableState("missingCriticalRate");
let governanceExceptionsState = createGovernanceTableState("priority");
let governanceSelectedFieldKey = null;
let governanceSelectedDepartmentKey = null;
let governanceExceptionView = { contextKey: null, requestKey: null, status: "idle", rows: [], page: null, error: "" };
let governanceExceptionRequestId = 0;
let governanceExceptionController = null;
let governancePendingFocusSelector = null;
let ageTreemapObserver = null;
let portfolioTreemapObserver = null;
const ageTreemapTooltipTargets = new WeakSet();

const formatCount = (value) => NUMBER_FORMAT.format(Number(value || 0));
const formatGovernanceCount = (value) => value === null || value === undefined || !Number.isFinite(Number(value)) ? "—" : formatCount(value);
const formatPercent = (value) => value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}%`;
const formatSigned = (value, suffix = "") => {
  if (value === null || value === undefined) return "—";
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${formatCount(numeric)}${suffix}`;
};
const displayValue = (value) => value === null || value === undefined || value === "" ? "—" : String(value);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatDate(value) {
  if (!value) return "ไม่ระบุวันที่";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? String(value) : DATE_FORMAT.format(date);
}

function setHtml(id, html) {
  const target = document.getElementById(id);
  if (target) target.innerHTML = html;
}

function emptyMarkup(title, detail = "ไม่มีรายการที่ตรงกับตัวกรองปัจจุบัน") {
  return `<div class="dashboard-empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`;
}

function drillButton(label, filterKey, value) {
  if (filterKey && typeof filterKey === "object" && !Array.isArray(filterKey)) {
    const validEntries = Object.entries(filterKey).filter(([key, item]) =>
      Object.hasOwn(FILTER_DEFAULTS, key) && item !== null && item !== undefined && item !== "" && item !== "__unknown__",
    );
    if (validEntries.length === 0) return escapeHtml(label);
    return `<button class="dashboard-drill-button" type="button" data-drill-filters="${escapeHtml(JSON.stringify(Object.fromEntries(validEntries)))}">${escapeHtml(label)}</button>`;
  }
  if (!filterKey || value === null || value === undefined || value === "" || value === "__unknown__") {
    return escapeHtml(label);
  }
  return `<button class="dashboard-drill-button" type="button" data-drill-filter="${escapeHtml(filterKey)}" data-filter-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
}

function renderMetrics(data) {
  const total = Math.max(0, Number(data.totalAssets) || 0);
  const available = Math.max(0, Number(data.availableAssets) || 0);
  const unavailable = Math.max(0, Number(data.unavailableAssets) || 0);
  const unknown = Math.max(0, Number(data.availabilityUnknownAssets) || 0);
  const readiness = document.getElementById("overview-readiness-rate");
  if (readiness) readiness.textContent = formatPercent(data.availabilityRate);

  const meter = document.getElementById("overview-readiness-meter");
  if (meter) {
    meter.setAttribute(
      "aria-label",
      `อัตราความพร้อมใช้งาน ${formatPercent(data.availabilityRate)} · พร้อมใช้งาน ${formatCount(available)} · ไม่พร้อมใช้งาน ${formatCount(unavailable)} · ไม่ระบุ ${formatCount(unknown)} จาก ${formatCount(total)} รายการ`,
    );
    const setSegmentWidth = (id, count) => {
      const segment = document.getElementById(id);
      if (segment) segment.style.width = total > 0 ? `${Math.max(0, Math.min(100, (count / total) * 100))}%` : "0%";
    };
    setSegmentWidth("overview-readiness-ready-segment", available);
    setSegmentWidth("overview-readiness-unavailable-segment", unavailable);
    setSegmentWidth("overview-readiness-unknown-segment", unknown);
  }

  setHtml("overview-readiness-counts", `
    <div>
      <dt><span class="overview-status-dot is-ready" aria-hidden="true"></span>พร้อมใช้งาน</dt>
      <dd>${drillButton(formatCount(available), "availability", "available")}</dd>
    </div>
    <div>
      <dt><span class="overview-status-dot is-unavailable" aria-hidden="true"></span>ไม่พร้อมใช้งาน</dt>
      <dd>${drillButton(formatCount(unavailable), "availability", "unavailable")}</dd>
    </div>
    ${unknown > 0 ? `<div>
      <dt><span class="overview-status-dot is-unknown" aria-hidden="true"></span>ไม่ระบุความพร้อม</dt>
      <dd>${drillButton(formatCount(unknown), "availability", "unknown")}</dd>
    </div>` : ""}
  `);

  const damaged = Math.max(0, Number(data.damagedAssets) || 0);
  const damagedStatus = getStatusCount(data, "ชำรุด");
  const repairStatus = getStatusCount(data, "ส่งซ่อม");
  const ageThreshold = Number.isFinite(Number(filters.ageThreshold)) ? Number(filters.ageThreshold) : 10;
  const olderThanThreshold = Math.max(0, Number(data.assetsOlderThanThreshold) || 0);
  const olderThanTotalRate = total > 0 ? (olderThanThreshold / total) * 100 : null;
  const disposalEstimate = data.disposalEstimate;
  const disposalValue = disposalEstimate?.eligibleAssets;
  const hasDisposalEstimate = disposalEstimate?.available === true
    && disposalValue !== null
    && disposalValue !== undefined
    && Number.isFinite(Number(disposalValue));
  const disposalAssets = hasDisposalEstimate ? Math.max(0, Number(disposalValue)) : 0;
  const disposalRate = hasDisposalEstimate && total > 0 ? (disposalAssets / total) * 100 : null;
  setHtml("executive-metrics", `
    <article class="overview-kpi-card">
      <h3>ครุภัณฑ์ทั้งหมด</h3>
      <strong class="overview-kpi-value">${formatCount(total)}</strong>
      <p>ฐานในการคำนวณ KPI</p>
    </article>
    <article class="overview-kpi-card is-danger">
      <h3>ชำรุด / ส่งซ่อม</h3>
      <strong class="overview-kpi-value">${drillButton(formatCount(damaged), "damage", "damaged")}</strong>
      <p>ชำรุด ${drillButton(formatCount(damagedStatus), "status", "ชำรุด")} · ส่งซ่อม ${drillButton(formatCount(repairStatus), "status", "ส่งซ่อม")}</p>
    </article>
    <article class="overview-kpi-card ${hasDisposalEstimate ? "is-info" : "is-unavailable"}">
      <h3>ประมาณการเข้าข่ายพิจารณาทดแทน</h3>
      <strong class="overview-kpi-value" aria-label="${hasDisposalEstimate ? "จำนวนเข้าข่ายพิจารณาทดแทนโดยประมาณ" : "ประมาณการเกณฑ์พิจารณาทดแทนยังไม่พร้อมใช้งาน"}">${hasDisposalEstimate ? formatCount(disposalAssets) : "—"}</strong>
      <p>${hasDisposalEstimate ? `${formatPercent(disposalRate)} ของสินทรัพย์ตามตัวกรอง · ค่าซ่อมสะสมและอายุ · ราคาอ้างอิงจำลอง` : "ข้อมูลการซ่อมไม่พร้อมสำหรับการประมาณการ"}</p>
    </article>
    <article class="overview-kpi-card is-info">
      <h3>อายุเกิน ${formatCount(ageThreshold)} ปี</h3>
      <strong class="overview-kpi-value">${formatCount(olderThanThreshold)}</strong>
      <p>${formatPercent(olderThanTotalRate)} ของครุภัณฑ์ทั้งหมด</p>
    </article>
  `);
}

function getStatusCount(data, statusName) {
  const status = (Array.isArray(data.statusDistribution) ? data.statusDistribution : [])
    .find((item) => item.key === statusName || item.label === statusName);
  const count = Number(status?.assets);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function renderUnavailableBreakdown(data) {
  const target = document.getElementById("overview-unavailable-breakdown");
  if (!target) return;

  const rows = [
    { label: "ชำรุด", status: "ชำรุด", tone: "is-damaged" },
    { label: "ถูกยืม", status: "ถูกยืม", tone: "is-borrowed" },
    { label: "ส่งซ่อม", status: "ส่งซ่อม", tone: "is-repair" },
  ].map((row) => ({ ...row, count: getStatusCount(data, row.status) }));
  const unavailable = Math.max(0, Number(data.unavailableAssets) || 0);
  const categorized = rows.reduce((sum, row) => sum + row.count, 0);
  if (unavailable > categorized) {
    rows.push({ label: "สถานะอื่นหรือไม่ระบุ", status: null, tone: "is-unknown", count: unavailable - categorized });
  }

  target.innerHTML = `<ol class="unavailable-breakdown-list">${rows.map((row) => `
    <li class="unavailable-breakdown-row ${row.tone}">
      <span class="unavailable-breakdown-label">
        <span class="overview-status-dot ${row.tone}" aria-hidden="true"></span>
        ${row.status ? drillButton(row.label, "status", row.status) : escapeHtml(row.label)}
      </span>
      <strong>${formatCount(row.count)}</strong>
    </li>
  `).join("")}</ol>`;
}

function renderRankedBars(id, rows, {
  labelKey = "label",
  countKey = "totalAssets",
  rateKey = null,
  filterKey = null,
  valueKey = "key",
  limit = 12,
  sort = "count",
} = {}) {
  const target = document.getElementById(id);
  if (!target) return;
  const list = Array.isArray(rows) ? [...rows] : [];
  if (typeof sort === "function") list.sort(sort);
  else if (sort === "count") list.sort((left, right) => Number(right[countKey] || 0) - Number(left[countKey] || 0));
  const visibleRows = list.slice(0, limit);
  if (visibleRows.length === 0) {
    target.innerHTML = emptyMarkup("ไม่พบข้อมูลในมิตินี้");
    return;
  }
  const max = Math.max(1, ...visibleRows.map((row) => Number(row[countKey] || 0)));
  target.innerHTML = `<ol class="ranked-bars">${visibleRows.map((row) => {
    const label = displayValue(row[labelKey]);
    const count = Number(row[countKey] || 0);
    const width = Math.max(0, Math.min(100, (count / max) * 100));
    const rate = rateKey ? ` · ${formatPercent(row[rateKey])}` : "";
    const filterValue = row.filterValue ?? (row.key === "__unknown__" ? "__missing__" : row[valueKey] ?? row[labelKey]);
    const action = row.drillFilters
      ? drillButton(label, row.drillFilters)
      : drillButton(label, filterKey, filterValue);
    return `<li class="ranked-bar-row">
      <div class="ranked-bar-heading"><span class="ranked-bar-label">${action}</span><strong>${formatCount(count)}</strong></div>
      <div class="ranked-bar-track" aria-hidden="true"><span style="width:${width.toFixed(1)}%"></span></div>
      ${rateKey ? `<span class="ranked-bar-detail">${rate.trim().replace(/^·\s*/u, "")}</span>` : ""}
    </li>`;
  }).join("")}</ol>`;
}

function renderRateHeatmap(id, caption, rows, columns, {
  labelKey = "label",
  filterValueKey = "filterValue",
  overviewControls = false,
} = {}) {
  const target = document.getElementById(id);
  if (!target) return;
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (sourceRows.length === 0) {
    target.innerHTML = emptyMarkup("ไม่มีข้อมูลสำหรับเปรียบเทียบหน่วยงาน");
    return;
  }

  const headers = columns.map((column) => {
    if (!overviewControls || !column.sortKey) {
      return `<th scope="col" title="${escapeHtml(column.description || column.label)}">${escapeHtml(column.label)}</th>`;
    }
    const isSorted = issueHeatmapSort.key === column.sortKey;
    const direction = isSorted ? issueHeatmapSort.direction : "desc";
    const directionLabel = direction === "asc" ? "น้อยไปมาก" : "มากไปน้อย";
    const indicator = isSorted ? (direction === "asc" ? "↑" : "↓") : "↕";
    return `<th scope="col"${isSorted ? ` aria-sort="${direction === "asc" ? "ascending" : "descending"}"` : ""} title="${escapeHtml(column.description || column.label)}">
      <button class="heatmap-sort-button" type="button" data-issue-heatmap-sort="${escapeHtml(column.sortKey)}" aria-label="${escapeHtml(`เรียง ${column.label} จาก${directionLabel}`)}">
        <span>${escapeHtml(column.label)}</span><span class="heatmap-sort-indicator" aria-hidden="true">${indicator}</span>
      </button>
    </th>`;
  }).join("");
  const sortedRows = overviewControls
    ? [...sourceRows].sort((left, right) => {
      const sortKey = issueHeatmapSort.key;
      const leftValue = Number(left?.[sortKey]);
      const rightValue = Number(right?.[sortKey]);
      const leftUnavailable = left?.[sortKey] === null || left?.[sortKey] === undefined || left?.[sortKey] === "" || !Number.isFinite(leftValue);
      const rightUnavailable = right?.[sortKey] === null || right?.[sortKey] === undefined || right?.[sortKey] === "" || !Number.isFinite(rightValue);
      if (leftUnavailable !== rightUnavailable) return leftUnavailable ? 1 : -1;
      if (!leftUnavailable && leftValue !== rightValue) {
        return (issueHeatmapSort.direction === "asc" ? 1 : -1) * (leftValue - rightValue);
      }
      const assetDifference = (Number(right?.totalAssets) || 0) - (Number(left?.totalAssets) || 0);
      return assetDifference || displayValue(left?.[labelKey]).localeCompare(displayValue(right?.[labelKey]), "th");
    })
    : sourceRows;
  const visibleRows = overviewControls && !issueHeatmapExpanded
    ? sortedRows.slice(0, ISSUE_HEATMAP_LIMIT)
    : sortedRows;
  const body = visibleRows.map((row) => {
    const label = displayValue(row[labelKey]);
    const metricCells = columns.map((column) => {
      const rawRate = column.getRate(row);
      const rate = rawRate === null || rawRate === undefined || rawRate === "" || !Number.isFinite(Number(rawRate))
        ? null
        : Math.max(0, Math.min(100, Number(rawRate)));
      const rawCount = column.getCount(row);
      const rawDenominator = column.getDenominator(row);
      const hasCount = rawCount !== null && rawCount !== undefined && Number.isFinite(Number(rawCount));
      const hasDenominator = rawDenominator !== null && rawDenominator !== undefined && Number.isFinite(Number(rawDenominator));
      const countText = hasCount && hasDenominator
        ? `${formatCount(rawCount)} / ${formatCount(rawDenominator)}`
        : "ไม่มีจำนวนให้แสดง";
      const rateText = rate === null ? "—" : formatPercent(rate);
      const heatIntensity = rate === null ? 0 : 0.08 + (rate / 100) * 0.24;
      return `<td><div class="heatmap-cell${rate === null ? " is-unavailable" : ""}" style="--heat-intensity:${heatIntensity.toFixed(3)}" title="${escapeHtml(`${column.label}: ${rateText} · ${countText}`)}">
        <strong class="heatmap-rate">${rateText}</strong>
        <span class="heatmap-count">${countText}</span>
      </div></td>`;
    }).join("");
    return `<tr><th scope="row">${drillButton(label, "department", row[filterValueKey])}</th>${metricCells}</tr>`;
  }).join("");

  target.innerHTML = `<div class="rate-heatmap-scroll" role="region" tabindex="0" aria-label="${escapeHtml(caption)}">
    <table class="dashboard-data-table rate-heatmap-table" id="${escapeHtml(id)}-table">
      <caption class="sr-only">${escapeHtml(caption)}</caption>
      <thead><tr><th scope="col">หน่วยงาน</th>${headers}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>${overviewControls && sourceRows.length > ISSUE_HEATMAP_LIMIT ? `<div class="heatmap-control-bar">
    <button class="button button-secondary heatmap-expand-button" type="button" data-issue-heatmap-toggle aria-controls="${escapeHtml(id)}-table" aria-expanded="${issueHeatmapExpanded}">
      ${issueHeatmapExpanded ? `แสดง ${ISSUE_HEATMAP_LIMIT} หน่วยงาน` : `แสดงทุกหน่วยงาน (${formatCount(sourceRows.length)})`}
    </button>
    <span class="heatmap-row-count" aria-live="polite">แสดง ${formatCount(visibleRows.length)} จาก ${formatCount(sourceRows.length)} หน่วยงาน</span>
  </div>` : ""}`;
}

function layoutTreemap(items) {
  const cells = [];
  const weightOf = (item) => Math.max(0, Number(item.totalAssets) || 0);

  function divide(group, x, y, width, height) {
    if (group.length === 0) return;
    if (group.length === 1) {
      cells.push({ item: group[0], x, y, width, height });
      return;
    }

    const totalWeight = group.reduce((sum, item) => sum + weightOf(item), 0);
    if (totalWeight <= 0) return;
    let splitIndex = 1;
    let firstWeight = weightOf(group[0]);
    while (splitIndex < group.length - 1 && firstWeight < totalWeight / 2) {
      firstWeight += weightOf(group[splitIndex]);
      splitIndex += 1;
    }

    const ratio = firstWeight / totalWeight;
    const firstGroup = group.slice(0, splitIndex);
    const secondGroup = group.slice(splitIndex);
    if (width >= height) {
      const firstWidth = width * ratio;
      divide(firstGroup, x, y, firstWidth, height);
      divide(secondGroup, x + firstWidth, y, width - firstWidth, height);
    } else {
      const firstHeight = height * ratio;
      divide(firstGroup, x, y, width, firstHeight);
      divide(secondGroup, x, y + firstHeight, width, height - firstHeight);
    }
  }

  divide(items, 0, 0, 100, 100);
  return cells;
}

function renderTreemap(id, rows, {
  filterKey,
  totalAssets = 0,
  otherLabel = "รายการอื่น",
  caption = "สัดส่วนสินทรัพย์",
} = {}) {
  const target = document.getElementById(id);
  if (!target) return;
  const allRows = Array.isArray(rows)
    ? rows.map((row) => ({ ...row, totalAssets: Math.max(0, Number(row.totalAssets) || 0) }))
      .sort((left, right) => right.totalAssets - left.totalAssets)
    : [];
  const rowTotal = allRows.reduce((sum, row) => sum + row.totalAssets, 0);
  if (allRows.length === 0 || rowTotal === 0) {
    target.innerHTML = emptyMarkup("ไม่มีข้อมูลให้แสดงในแผนผังสัดส่วน");
    return;
  }

  const denominator = Number(totalAssets) > 0 ? Number(totalAssets) : rowTotal;
  const missingRows = allRows.filter((row) => row.key === "__unknown__" || row.filterValue === "__missing__");
  const knownRows = allRows.filter((row) => !missingRows.includes(row));
  const topRows = knownRows.slice(0, 5);
  const remainderRows = knownRows.slice(5);
  const displayRows = [...topRows, ...missingRows];
  if (remainderRows.length > 0) {
    displayRows.push({
      key: "__other__",
      label: `${otherLabel} (${remainderRows.length} กลุ่ม)`,
      totalAssets: remainderRows.reduce((sum, row) => sum + row.totalAssets, 0),
      aggregate: true,
    });
  }
  displayRows.sort((left, right) => right.totalAssets - left.totalAssets);

  const positioned = layoutTreemap(displayRows);
  const tiles = positioned.map(({ item, x, y, width, height }, index) => {
    const share = denominator > 0 ? (item.totalAssets / denominator) * 100 : 0;
    const ariaLabel = `${item.label}: ${formatCount(item.totalAssets)} สินทรัพย์ (${formatPercent(share)})${item.aggregate ? " รวมรายการที่เหลือ" : " เลือกเพื่อกรอง"}`;
    const style = `left:${x.toFixed(3)}%;top:${y.toFixed(3)}%;width:${width.toFixed(3)}%;height:${height.toFixed(3)}%`;
    const content = `<span class="treemap-tile-label">${escapeHtml(item.label)}</span><strong class="treemap-tile-count">${formatCount(item.totalAssets)}</strong><span class="treemap-tile-share">${formatPercent(share)}</span>`;
    if (item.aggregate) {
      return `<div class="treemap-tile treemap-tile-aggregate" style="${style}" role="img" aria-label="${escapeHtml(ariaLabel)}" title="${escapeHtml(ariaLabel)}">${content}</div>`;
    }
    const filterValue = item.filterValue ?? (item.key === "__unknown__" ? "__missing__" : item.label);
    return `<button class="treemap-tile treemap-tile-tone-${index % 4}" type="button" style="${style}" data-drill-filter="${escapeHtml(filterKey)}" data-filter-value="${escapeHtml(filterValue)}" aria-label="${escapeHtml(ariaLabel)}" title="${escapeHtml(ariaLabel)}">${content}</button>`;
  }).join("");
  const detailsRows = allRows.map((row) => {
    const share = denominator > 0 ? (row.totalAssets / denominator) * 100 : 0;
    const filterValue = row.filterValue ?? (row.key === "__unknown__" ? "__missing__" : row.label);
    return `<tr><th scope="row">${drillButton(row.label, filterKey, filterValue)}</th><td>${formatCount(row.totalAssets)}</td><td>${formatPercent(share)}</td></tr>`;
  }).join("");

  target.innerHTML = `<div class="treemap-stage" role="group" aria-label="${escapeHtml(caption)} · พื้นที่แทนผลรวม asset_count">
    ${tiles}
  </div>
  <p class="treemap-note">พื้นที่แทนจำนวนจาก SUM(asset_count) · คลิกหมวดหมู่หรือแหล่งเงินเพื่อกรอง · รายการที่ไม่ทราบค่าจะแสดงแยก</p>
  <details class="treemap-details">
    <summary>ดูตัวเลขครบทุกกลุ่ม (${formatCount(allRows.length)} รายการ)</summary>
    <div class="dashboard-table-wrap">
      <table class="dashboard-data-table treemap-detail-table">
        <caption class="sr-only">${escapeHtml(caption)} รายการทั้งหมด</caption>
        <thead><tr><th scope="col">รายการ</th><th scope="col">จำนวนสินทรัพย์</th><th scope="col">สัดส่วน</th></tr></thead>
        <tbody>${detailsRows}</tbody>
      </table>
    </div>
  </details>`;
}

function renderTable(id, caption, columns, rows, { emptyTitle = "ไม่มีข้อมูลให้แสดง", limit = 100 } = {}) {
  const target = document.getElementById(id);
  if (!target) return;
  const visibleRows = Array.isArray(rows) ? rows.slice(0, limit) : [];
  if (visibleRows.length === 0) {
    target.innerHTML = emptyMarkup(emptyTitle);
    return;
  }
  const header = columns.map((column) => {
    const sortable = column.sortKey;
    const current = sortable && departmentSort.key === sortable;
    const ariaSort = current ? (departmentSort.direction === "asc" ? "ascending" : "descending") : "none";
    const label = sortable
      ? `<button class="table-sort-button" type="button" data-department-sort="${escapeHtml(sortable)}" aria-label="เรียงตาม${escapeHtml(column.label)}" aria-pressed="${current ? "true" : "false"}">${escapeHtml(column.label)}<span aria-hidden="true">${current ? (departmentSort.direction === "asc" ? " ↑" : " ↓") : ""}</span></button>`
      : escapeHtml(column.label);
    return `<th scope="col"${sortable ? ` aria-sort="${ariaSort}"` : ""}>${label}</th>`;
  }).join("");
  const body = visibleRows.map((row) => `<tr>${columns.map((column) => {
    const value = column.render ? column.render(row) : escapeHtml(displayValue(row[column.key]));
    return `<td>${value}</td>`;
  }).join("")}</tr>`).join("");
  target.innerHTML = `<table class="dashboard-data-table"><caption class="sr-only">${escapeHtml(caption)}</caption><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function bindAgeTreemapTooltip(target) {
  if (ageTreemapTooltipTargets.has(target)) return;

  const state = { hovered: null, focused: null, active: null };
  const update = () => {
    const tile = [state.focused, state.hovered].find((candidate) => candidate?.isConnected);
    const tooltip = target.querySelector(".age-treemap-tooltip");
    if (!tooltip || !tile) {
      if (state.active?.isConnected) state.active.removeAttribute("aria-describedby");
      state.active = null;
      if (tooltip) tooltip.hidden = true;
      return;
    }

    if (state.active !== tile) {
      if (state.active?.isConnected) state.active.removeAttribute("aria-describedby");
      state.active = tile;
    }
    tooltip.textContent = tile.dataset.tooltip || "";
    tooltip.hidden = false;
    tile.setAttribute("aria-describedby", tooltip.id);

    const bounds = tile.getBoundingClientRect();
    const tooltipBounds = tooltip.getBoundingClientRect();
    const inset = 8;
    const left = Math.max(inset, Math.min(
      window.innerWidth - tooltipBounds.width - inset,
      bounds.left + bounds.width / 2 - tooltipBounds.width / 2,
    ));
    const above = bounds.top - tooltipBounds.height - inset;
    const top = above >= inset
      ? above
      : Math.min(window.innerHeight - tooltipBounds.height - inset, bounds.bottom + inset);
    tooltip.style.left = String(left) + "px";
    tooltip.style.top = String(Math.max(inset, top)) + "px";
  };

  target.addEventListener("pointerover", (event) => {
    const tile = event.target?.closest?.(".age-treemap-tile");
    if (!tile || !target.contains(tile)) return;
    if (event.relatedTarget?.closest?.(".age-treemap-tile") === tile) return;
    state.hovered = tile;
    update();
  });
  target.addEventListener("pointerout", (event) => {
    const tile = event.target?.closest?.(".age-treemap-tile");
    if (!tile || event.relatedTarget?.closest?.(".age-treemap-tile") === tile) return;
    state.hovered = null;
    update();
  });
  target.addEventListener("focusin", (event) => {
    const tile = event.target?.closest?.(".age-treemap-tile");
    if (!tile) return;
    state.focused = tile;
    update();
  });
  target.addEventListener("focusout", (event) => {
    const tile = event.target?.closest?.(".age-treemap-tile");
    if (!tile || event.relatedTarget?.closest?.(".age-treemap-tile") === tile) return;
    state.focused = null;
    update();
  });
  ageTreemapTooltipTargets.add(target);
}

function renderAgeTreemap(id, source, totalAssets) {
  const target = document.getElementById(id);
  if (!target) return;

  ageTreemapObserver?.disconnect();
  ageTreemapObserver = null;

  const sourceCounts = source && typeof source === "object" ? source : {};
  const rows = Object.entries(AGE_LABELS).map(([key, label], index) => {
    const count = Number(sourceCounts[key]);
    return {
      key,
      label,
      index,
      assets: Number.isFinite(count) && count > 0 ? count : 0,
    };
  });
  const total = Number(totalAssets);
  const denominator = Number.isFinite(total) && total > 0 ? total : 0;
  const populatedRows = rows.filter((row) => row.assets > 0);
  const detailRows = rows.map((row) => {
    const share = denominator > 0 ? (row.assets / denominator) * 100 : 0;
    return '<tr><th scope="row">' + drillButton(row.label, "ageBand", row.key) + '</th><td>' +
      formatCount(row.assets) + '</td><td>' + formatPercent(share) + '</td></tr>';
  }).join("");

  const tiles = populatedRows.map((row) => {
    const share = denominator > 0 ? (row.assets / denominator) * 100 : 0;
    const tooltip = row.label + "\nจำนวน: " + formatCount(row.assets) + " รายการ\nสัดส่วน: " + formatPercent(share);
    const accessibleLabel = "กรองตามช่วงอายุ " + row.label;
    return '<button class="age-treemap-tile age-treemap-tone-' + row.index + ' is-tiny" type="button" data-band-key="' +
      escapeHtml(row.key) + '" data-drill-filter="ageBand" data-filter-value="' + escapeHtml(row.key) +
      '" data-tooltip="' + escapeHtml(tooltip) + '" aria-label="' + escapeHtml(accessibleLabel) +
      '" title="' + escapeHtml(tooltip) + '">' +
      '<span class="age-treemap-index" aria-hidden="true">' + String(row.index + 1).padStart(2, "0") + '</span>' +
      '<span class="age-treemap-content"><strong class="age-treemap-count">' + formatCount(row.assets) +
      '</strong><span class="age-treemap-label">' + escapeHtml(row.label) +
      '</span><span class="age-treemap-share">' + formatPercent(share) + '</span></span></button>';
  }).join("");

  const treemap = populatedRows.length > 0
    ? '<div class="age-treemap-stage" role="group" aria-label="โครงสร้างอายุครุภัณฑ์ พื้นที่ของแต่ละช่องแทนจำนวนสินทรัพย์">' +
      tiles + '<div id="overview-age-treemap-tooltip" class="age-treemap-tooltip" role="tooltip" hidden></div></div>'
    : '<div class="age-treemap-empty">' + emptyMarkup("ไม่มีข้อมูลอายุครุภัณฑ์ในชุดที่เลือก") + '</div>';

  target.innerHTML = treemap +
    '<details class="age-treemap-details">' +
      '<summary>ดูจำนวนและสัดส่วนครบทุกช่วงอายุ</summary>' +
      '<div class="dashboard-table-wrap">' +
        '<table class="dashboard-data-table age-treemap-detail-table">' +
          '<caption class="sr-only">โครงสร้างอายุครุภัณฑ์ จำนวน และสัดส่วนของทุกช่วงอายุ</caption>' +
          '<thead><tr><th scope="col">ช่วงอายุ</th><th scope="col">จำนวนสินทรัพย์</th><th scope="col">สัดส่วนจากสินทรัพย์ทั้งหมด</th></tr></thead>' +
          '<tbody>' + detailRows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</details>';

  if (populatedRows.length === 0) return;
  bindAgeTreemapTooltip(target);

  const stage = target.querySelector(".age-treemap-stage");
  const tilesByKey = new Map([...stage.querySelectorAll(".age-treemap-tile")]
    .map((tile) => [tile.dataset.bandKey, tile]));
  const updateLayout = () => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width <= 0 || height <= 0) return;

    const cells = squarifyTreemap(populatedRows, width, height);
    for (const cell of cells) {
      const tile = tilesByKey.get(cell.item.key);
      if (!tile) continue;
      const inset = Math.min(1, Math.floor(Math.min(cell.width, cell.height) / 3));
      tile.style.left = String(cell.x + inset) + "px";
      tile.style.top = String(cell.y + inset) + "px";
      tile.style.width = String(Math.max(0, cell.width - inset * 2)) + "px";
      tile.style.height = String(Math.max(0, cell.height - inset * 2)) + "px";
      const sizeClass = cell.width >= 150 && cell.height >= 92
        ? "is-large"
        : cell.width >= 88 && cell.height >= 50
          ? "is-medium"
          : cell.width >= 54 && cell.height >= 32
            ? "is-small"
            : "is-tiny";
      tile.classList.remove("is-large", "is-medium", "is-small", "is-tiny");
      tile.classList.add(sizeClass);
    }
  };

  updateLayout();
  if (typeof ResizeObserver === "function") {
    ageTreemapObserver = new ResizeObserver(updateLayout);
    ageTreemapObserver.observe(stage);
  }
}

function renderComboTable(id, caption, rows, firstFilter, secondFilter, firstLabel, secondLabel, limit = 40) {
  const mapped = (rows || []).slice(0, limit).map((row) => ({
    first: row.first,
    second: row.second,
    firstFilterValue: row.firstFilterValue,
    secondFilterValue: row.secondFilterValue,
    totalAssets: row.totalAssets,
    availabilityRate: row.availabilityRate,
  }));
  renderTable(id, caption, [
    { label: firstLabel, render: (row) => drillButton(row.first, firstFilter, row.firstFilterValue) },
    { label: secondLabel, render: (row) => drillButton(row.second, secondFilter, row.secondFilterValue) },
    { label: "จำนวนสินทรัพย์", render: (row) => formatCount(row.totalAssets) },
    { label: "อัตราพร้อมใช้", render: (row) => formatPercent(row.availabilityRate) },
  ], mapped, { limit });
}

function renderOverviewIssueHeatmap(payload) {
  const columns = [
    {
      label: "ไม่มีตำแหน่ง",
      sortKey: "missingLocationRate",
      getRate: (row) => row.missingLocationRate,
      getCount: (row) => row.missingLocationAssets,
      getDenominator: (row) => row.totalAssets,
    },
    {
      label: `อายุเกิน ${filters.ageThreshold} ปี`,
      description: `อัตราอายุเกิน ${filters.ageThreshold} ปีคิดจากรายการที่ทราบอายุ`,
      sortKey: "oldAssetRate",
      getRate: (row) => row.oldAssetRate,
      getCount: (row) => row.assetsOlderThanThreshold,
      getDenominator: (row) => row.assetsWithKnownAge,
    },
    {
      label: "ชำรุด",
      sortKey: "damageRate",
      getRate: (row) => row.damageRate,
      getCount: (row) => row.damagedAssets,
      getDenominator: (row) => row.totalAssets,
    },
  ];
  renderRateHeatmap(
    "overview-issue-heatmap",
    "อัตราประเด็นสินทรัพย์ตามหน่วยงาน",
    payload?.departments?.rows,
    columns,
    { overviewControls: true },
  );
  const issueNote = document.getElementById("overview-issue-note");
  if (issueNote) {
    issueNote.textContent = `เริ่มจาก 5 หน่วยงานที่มีอัตราไม่มีตำแหน่งสูงที่สุด · กดหัวคอลัมน์เพื่อเรียงอัตราจากน้อยไปมากหรือมากไปน้อย · ตัวเลขใต้เปอร์เซ็นต์คือจำนวน / ฐาน · อายุเกิน ${filters.ageThreshold} ปีใช้เฉพาะรายการที่ทราบอายุ ส่วนประเด็นอื่นใช้จำนวนสินทรัพย์ทั้งหมดของหน่วยงาน`;
  }
}

function renderOverview(data, payload) {
  renderMetrics(data);
  renderUnavailableBreakdown(data);
  renderAgeTreemap("overview-age-distribution", payload?.aging?.ageDistribution, data?.totalAssets);
  renderOverviewIssueHeatmap(payload);
  const history = payload.history;
  const historyTarget = document.getElementById("overview-history-content");
  if (!historyTarget) return;
  if (!hasComparableSnapshots(payload)) {
    historyTarget.innerHTML = emptyMarkup("ยังไม่มีชุดข้อมูลก่อนหน้า", "เมื่อคลังมีข้อมูลอย่างน้อยสองชุด จะแสดงการเปลี่ยนแปลงจริงที่นี่");
    return;
  }
  const comparison = history.comparison;
  const columns = [
    { label: "ตัวชี้วัด", key: "label" },
    { label: "การเปลี่ยนแปลง", key: "change" },
  ];
  const rows = [
    { label: "จำนวนสินทรัพย์", change: formatSigned(comparison.totalAssets) },
    { label: "จำนวนพร้อมใช้งาน", change: formatSigned(comparison.availableAssets) },
    { label: "อัตราพร้อมใช้งาน", change: formatSigned(comparison.availabilityRatePoints, " จุดเปอร์เซ็นต์") },
    { label: "จำนวนชำรุด", change: formatSigned(comparison.damagedAssets) },
    { label: "อัตราชำรุด", change: formatSigned(comparison.damageRatePoints, " จุดเปอร์เซ็นต์") },
    { label: "จำนวนไม่มีตำแหน่ง", change: formatSigned(comparison.missingLocationAssets) },
    { label: `จำนวนอายุเกิน ${filters.ageThreshold} ปี`, change: formatSigned(comparison.assetsOlderThanThreshold) },
  ];
  const currentName = `${formatDate(comparison.currentSnapshot)} · ${comparison.currentLabel || ""}`;
  const previousName = `${formatDate(comparison.previousSnapshot)} · ${comparison.previousLabel || ""}`;
  historyTarget.innerHTML = `<p class="history-date-caption">${escapeHtml(currentName)} เทียบกับ ${escapeHtml(previousName)}</p>${tableMarkup("ตารางเปรียบเทียบชุดข้อมูล", columns, rows)}`;
}

function tableMarkup(caption, columns, rows) {
  return `<div class="dashboard-table-wrap"><table class="dashboard-data-table"><caption class="sr-only">${escapeHtml(caption)}</caption><thead><tr>${columns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function portfolioMetric(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function portfolioCategoryPercent(assets, total) {
  const share = getPortfolioCategoryShare(assets, total);
  return share === null ? "—" : formatPercent(share);
}

function renderPortfolioTreemap(rows, totalAssets, selectedCategoryKey) {
  const target = document.getElementById("portfolio-categories");
  if (!target) return;
  portfolioTreemapObserver?.disconnect();
  portfolioTreemapObserver = null;

  const categories = Array.isArray(rows) ? rows : [];
  const total = portfolioMetric(totalAssets);
  if (categories.length === 0) {
    target.innerHTML = emptyMarkup("ไม่มีข้อมูลหมวดหมู่", "ไม่พบสินทรัพย์ที่ตรงกับตัวกรองปัจจุบัน");
    return;
  }

  const positiveCategories = categories.filter((category) => (portfolioMetric(category.totalAssets) ?? 0) > 0);
  const tiles = positiveCategories.map((category, index) => {
    const key = getPortfolioCategoryKey(category);
    const assets = portfolioMetric(category.totalAssets);
    const share = getPortfolioCategoryShare(assets, total);
    const label = category.label || "ไม่ระบุหมวดหมู่";
    const selected = key === selectedCategoryKey;
    const accessibleDescription = `${label} · ${formatCount(assets)} รายการ · สัดส่วนพอร์ต ${share === null ? "คำนวณไม่ได้" : formatPercent(share)} · เลือกเพื่อดูองค์ประกอบ`;
    return `<button class="portfolio-treemap-tile portfolio-treemap-tone-${index % 4}${selected ? " is-selected" : ""}" type="button" data-portfolio-category-tile="${escapeHtml(key)}" data-portfolio-category-select="${escapeHtml(key)}" aria-pressed="${selected}" aria-label="${escapeHtml(accessibleDescription)}" title="${escapeHtml(accessibleDescription)}">
      <span class="portfolio-category-label">${escapeHtml(label)}</span>
      <strong class="portfolio-category-count">${formatCount(assets)}</strong>
      <span class="portfolio-category-share">${portfolioCategoryPercent(assets, total)}</span>
    </button>`;
  }).join("");

  const categoryRows = [...categories]
    .sort((left, right) => (portfolioMetric(right.totalAssets) ?? Number.NEGATIVE_INFINITY) - (portfolioMetric(left.totalAssets) ?? Number.NEGATIVE_INFINITY)
      || String(left.label ?? "").localeCompare(String(right.label ?? ""), "th", { numeric: true }))
    .map((category) => {
      const key = getPortfolioCategoryKey(category);
      const assets = portfolioMetric(category.totalAssets);
      const selected = key === selectedCategoryKey;
      return `<tr class="${selected ? "is-selected" : ""}">
        <th scope="row"><button class="portfolio-category-select" type="button" data-portfolio-category-select="${escapeHtml(key)}" aria-pressed="${selected}">${escapeHtml(category.label || "ไม่ระบุหมวดหมู่")}</button></th>
        <td class="portfolio-number">${assets === null ? "—" : formatCount(assets)}</td>
        <td class="portfolio-number">${portfolioCategoryPercent(assets, total)}</td>
      </tr>`;
    }).join("");
  const selectedCategory = categories.find((category) => getPortfolioCategoryKey(category) === selectedCategoryKey);
  const selectedFilterValue = selectedCategory?.filterValue;
  const explorerAction = selectedCategory && selectedFilterValue !== null && selectedFilterValue !== undefined && selectedFilterValue !== ""
    ? `<button class="button button-secondary" type="button" data-portfolio-category-explorer data-drill-filter="category" data-filter-value="${escapeHtml(selectedFilterValue)}">เปิดสินทรัพย์ในหมวดนี้</button>`
    : "";
  const unavailableCount = categories.length - positiveCategories.length;

  target.innerHTML = `${positiveCategories.length > 0
    ? `<div class="portfolio-treemap-stage" role="group" aria-label="แผนผังสัดส่วนหมวดหมู่ ขนาดพื้นที่แทนจำนวนสินทรัพย์">${tiles}</div>`
    : emptyMarkup("ไม่มีจำนวนที่ใช้คำนวณพื้นที่แผนผัง", "หมวดหมู่ที่มีค่าเป็นศูนย์หรือค่าติดลบยังตรวจดูได้ในรายการทั้งหมด")}
    <div class="portfolio-treemap-actions"><p class="portfolio-treemap-note">พื้นที่คำนวณจากจำนวนสินทรัพย์ของแต่ละหมวดหมู่ · เปอร์เซ็นต์เทียบกับจำนวนสินทรัพย์ทั้งหมดหลังใช้ตัวกรอง${unavailableCount > 0 ? ` · ${formatCount(unavailableCount)} หมวดหมู่ไม่มีค่าบวกจึงไม่มีพื้นที่ในแผนผัง` : ""}</p>${explorerAction}</div>
    <details class="portfolio-category-details"><summary>ดูตัวเลขครบทุกหมวดหมู่ (${formatCount(categories.length)} หมวด)</summary>
      <div class="dashboard-table-wrap"><table class="dashboard-data-table portfolio-category-table">
        <caption class="sr-only">จำนวนและสัดส่วนสินทรัพย์ในทุกหมวดหมู่</caption>
        <thead><tr><th scope="col">หมวดหมู่</th><th scope="col">จำนวนสินทรัพย์</th><th scope="col">สัดส่วนพอร์ต</th></tr></thead><tbody>${categoryRows}</tbody>
      </table></div>
    </details>`;

  const stage = target.querySelector(".portfolio-treemap-stage");
  if (!stage) return;
  const updateLayout = () => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width <= 0 || height <= 0) return;
    const categoryTiles = new Map([...stage.querySelectorAll("[data-portfolio-category-tile]")]
      .map((tile) => [tile.dataset.portfolioCategoryTile, tile]));
    const cells = squarifyTreemap(positiveCategories.map((category) => ({
      ...category,
      assets: portfolioMetric(category.totalAssets) ?? 0,
    })), width, height);
    for (const cell of cells) {
      const tile = categoryTiles.get(getPortfolioCategoryKey(cell.item));
      if (!tile) continue;
      tile.style.left = `${cell.x}px`;
      tile.style.top = `${cell.y}px`;
      tile.style.width = `${cell.width}px`;
      tile.style.height = `${cell.height}px`;
      const area = cell.width * cell.height;
      tile.classList.toggle("is-large", cell.width >= 175 && cell.height >= 92 && area >= 19000);
      tile.classList.toggle("is-medium", cell.width >= 90 && cell.height >= 58 && area >= 6500);
      tile.classList.toggle("is-small", cell.width >= 55 && cell.height >= 38 && area >= 2200);
      tile.classList.toggle("is-tiny", cell.width < 55 || cell.height < 38 || area < 2200);
    }
  };
  updateLayout();
  if (typeof ResizeObserver === "function") {
    portfolioTreemapObserver = new ResizeObserver(updateLayout);
    portfolioTreemapObserver.observe(stage);
  }
}

function portfolioSortHeader(sortKey, label) {
  const active = portfolioMatrixState.sortKey === sortKey;
  const direction = active ? portfolioMatrixState.direction : "desc";
  const indicator = active ? (direction === "asc" ? "↑" : "↓") : "↕";
  const directionLabel = direction === "asc" ? "น้อยไปมาก" : "มากไปน้อย";
  return `<th scope="col" aria-sort="${active ? (direction === "asc" ? "ascending" : "descending") : "none"}">
    <button class="portfolio-matrix-sort" type="button" data-portfolio-matrix-sort="${escapeHtml(sortKey)}" aria-label="เรียง ${escapeHtml(label)} จาก${directionLabel}">${escapeHtml(label)}<span aria-hidden="true">${indicator}</span></button>
  </th>`;
}

function renderPortfolioMatrixPagination(page) {
  if (page.totalRows === 0 || (page.totalRows <= 5 && page.pageSize === 5)) return "";
  const start = page.pageSize === "all" ? 1 : ((page.page - 1) * page.pageSize) + 1;
  const end = page.pageSize === "all" ? page.totalRows : Math.min(page.totalRows, page.page * page.pageSize);
  const disabled = (action) => action === "first" || action === "previous"
    ? page.page <= 1
    : page.page >= page.totalPages;
  const button = (action, label, accessibleLabel) => `<button class="button button-secondary department-page-button" type="button" data-portfolio-matrix-page="${action}" aria-label="${accessibleLabel}"${disabled(action) ? " disabled" : ""}>${label}</button>`;
  return `<nav class="department-pagination portfolio-matrix-pagination" aria-label="แบ่งหน้าตารางองค์ประกอบสินทรัพย์">
    <p class="department-pagination-range" role="status" aria-live="polite">แสดง ${formatCount(start)}–${formatCount(end)} จาก ${formatCount(page.totalRows)} หน่วยงาน</p>
    <div class="department-pagination-controls">
      <label class="department-page-size-label">หน่วยงานต่อหน้า
        <select data-portfolio-matrix-page-size aria-label="จำนวนหน่วยงานต่อหน้า">
          ${PORTFOLIO_MATRIX_PAGE_SIZES.map((size) => `<option value="${size}"${page.pageSize === size ? " selected" : ""}>${size === "all" ? "ทั้งหมด" : size}</option>`).join("")}
        </select>
      </label>
      <div class="department-page-actions">${button("first", "«", "หน้าแรก")}${button("previous", "‹", "หน้าก่อน")}
        <span class="department-page-current" aria-current="page">หน้า ${formatCount(page.page)} จาก ${formatCount(page.totalPages)}</span>
        ${button("next", "›", "หน้าถัดไป")}${button("last", "»", "หน้าสุดท้าย")}
      </div>
    </div>
  </nav>`;
}

function renderPortfolioMatrix(rows, categories, complete) {
  const target = document.getElementById("portfolio-matrix");
  if (!target) return;
  if (!complete) {
    target.innerHTML = emptyMarkup("ข้อมูลเมทริกซ์ยังไม่ครบ", "ไม่สามารถยืนยันองค์ประกอบครบทุกหน่วยงานและหมวดหมู่จากข้อมูลที่ได้รับ");
    return;
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    target.innerHTML = emptyMarkup("ไม่มีหน่วยงานให้เปรียบเทียบ", "ลองเปลี่ยนตัวกรองหรือเลือกชุดข้อมูลอื่น");
    return;
  }

  const sortableKeys = new Set(["totalAssets", ...categories.map((category) => `category:${getPortfolioCategoryKey(category)}`)]);
  if (!sortableKeys.has(portfolioMatrixState.sortKey)) {
    portfolioMatrixState = { ...portfolioMatrixState, page: 1, sortKey: "totalAssets", direction: "desc" };
  }
  const page = paginatePortfolioMatrixRows(rows, portfolioMatrixState);
  portfolioMatrixState = { ...portfolioMatrixState, page: page.page };
  const categoryHeaders = categories.map((category) => {
    const key = getPortfolioCategoryKey(category);
    return portfolioSortHeader(`category:${key}`, category.label || "ไม่ระบุหมวดหมู่");
  }).join("");
  const rowMarkup = page.rows.map((row) => {
    const selected = row.key === selectedPortfolioDepartmentKey;
    const categoryCells = categories.map((category) => {
      const key = getPortfolioCategoryKey(category);
      const rawAssets = row.categoryCounts.get(key);
      const assets = portfolioMetric(rawAssets);
      const share = getPortfolioCategoryShare(assets, row.totalAssets);
      const selectedCategory = key === selectedPortfolioCategoryKey;
      const heatMix = share === null ? 0 : Math.max(0, Math.min(36, share * 0.36));
      const classes = [
        "portfolio-matrix-value",
        assets === null ? "is-unavailable" : "",
        assets === 0 ? "is-zero" : "",
        share === null && assets !== null ? "has-no-denominator" : "",
        selectedCategory ? "is-selected-category" : "",
      ].filter(Boolean).join(" ");
      const description = assets === null
        ? `${row.label} · ${category.label}: ไม่มีข้อมูลจำนวน`
        : `${row.label} · ${category.label}: ${formatCount(assets)} รายการ · ${share === null ? "คำนวณสัดส่วนไม่ได้เนื่องจากยอดรวมหน่วยงานเป็นศูนย์หรือไม่พร้อมใช้งาน" : `${formatPercent(share)} ของสินทรัพย์ในหน่วยงาน`}`;
      return `<td class="portfolio-matrix-cell${selectedCategory ? " is-selected-category" : ""}" aria-label="${escapeHtml(description)}" title="${escapeHtml(description)}"><span class="${classes}"${heatMix > 0 ? ` style="--portfolio-heat-mix:${heatMix.toFixed(1)}%"` : ""}>${assets === null ? "—" : formatCount(assets)}</span></td>`;
    }).join("");
    const label = row.label || "ไม่ระบุหน่วยงาน";
    return `<tr data-portfolio-department-row="${escapeHtml(row.key)}" class="${selected ? "is-selected" : ""}">
      <th scope="row"><button class="portfolio-department-select" type="button" data-portfolio-department-select="${escapeHtml(row.key)}" aria-controls="portfolio-focus" aria-pressed="${selected}" aria-label="เลือกหน่วยงาน ${escapeHtml(label)}">${escapeHtml(label)}</button></th>
      <td class="portfolio-matrix-total">${row.totalAssets === null ? "—" : formatCount(row.totalAssets)}</td>${categoryCells}
    </tr>`;
  }).join("");
  const guide = document.getElementById("portfolio-matrix-guide")?.id || "";

  target.innerHTML = `<div class="portfolio-matrix-scroll" role="region" tabindex="0" aria-label="เมทริกซ์องค์ประกอบรายหน่วยงาน เลื่อนแนวนอนเพื่อดูหมวดหมู่ทั้งหมด">
    <table class="dashboard-data-table portfolio-matrix-table" aria-describedby="${guide}">
      <caption class="sr-only">จำนวนสินทรัพย์แยกตามหน่วยงานและหมวดหมู่</caption>
      <thead><tr><th scope="col">หน่วยงาน</th>${portfolioSortHeader("totalAssets", "สินทรัพย์ทั้งหมด")}${categoryHeaders}</tr></thead>
      <tbody>${rowMarkup}</tbody>
    </table>
  </div>${renderPortfolioMatrixPagination(page)}`;
}

function renderPortfolioFocus(department, categories, selectedCategoryKey, portfolioTotal, complete) {
  const target = document.getElementById("portfolio-focus");
  if (!target) return;
  if (!complete) {
    target.innerHTML = emptyMarkup("ยังแสดงรายละเอียดองค์ประกอบไม่ได้", "ข้อมูลเมทริกซ์ไม่ครบ จึงไม่แสดงสัดส่วนบางส่วนที่อาจทำให้เข้าใจผิด");
    return;
  }
  if (!department) {
    target.innerHTML = emptyMarkup("ไม่มีหน่วยงานให้แสดง", "ไม่พบหน่วยงานที่ตรงกับตัวกรองปัจจุบัน");
    return;
  }

  const departmentTotal = department.totalAssets;
  const portfolioShare = getPortfolioCategoryShare(departmentTotal, portfolioTotal);
  const breakdown = categories.map((category) => {
    const key = getPortfolioCategoryKey(category);
    const assets = portfolioMetric(department.categoryCounts.get(key));
    return {
      key,
      label: category.label || "ไม่ระบุหมวดหมู่",
      filterValue: category.filterValue,
      assets,
      share: getPortfolioCategoryShare(assets, departmentTotal),
    };
  }).sort((left, right) => (right.assets ?? Number.NEGATIVE_INFINITY) - (left.assets ?? Number.NEGATIVE_INFINITY)
    || left.label.localeCompare(right.label, "th", { numeric: true }));
  const represented = breakdown.filter((item) => item.assets !== null && item.assets > 0).length;
  const dominant = breakdown.find((item) => item.assets !== null && item.assets > 0) ?? null;
  const selectedCategory = breakdown.find((item) => item.key === selectedCategoryKey) ?? null;
  const selectedCategoryText = selectedCategory
    ? `<p class="portfolio-focus-selected-category" data-portfolio-focus-category tabindex="-1"><span>หมวดหมู่ที่เลือก</span><strong>${escapeHtml(selectedCategory.label)}</strong><span>${selectedCategory.assets === null ? "—" : `${formatCount(selectedCategory.assets)} รายการ`} · ${selectedCategory.share === null ? "สัดส่วนคำนวณไม่ได้" : `${formatPercent(selectedCategory.share)} ของหน่วยงาน`}</span></p>`
    : "";
  const departmentAction = department.filterValue !== null && department.filterValue !== undefined && department.filterValue !== ""
    ? `<button class="button button-secondary" type="button" data-portfolio-department-explorer data-drill-filter="department" data-filter-value="${escapeHtml(department.filterValue)}">เปิดสินทรัพย์ของหน่วยงานนี้</button>`
    : "";
  const categoryAction = selectedCategory && selectedCategory.filterValue !== null && selectedCategory.filterValue !== undefined && selectedCategory.filterValue !== ""
    ? `<button class="button button-secondary" type="button" data-portfolio-category-explorer data-drill-filter="category" data-filter-value="${escapeHtml(selectedCategory.filterValue)}">เปิดสินทรัพย์ในหมวดนี้</button>`
    : "";
  const categoryRows = breakdown.map((item) => {
    const selected = item.key === selectedCategoryKey;
    const name = `<button class="portfolio-focus-category-select" type="button" data-portfolio-category-select="${escapeHtml(item.key)}" aria-pressed="${selected}">${escapeHtml(item.label)}</button>`;
    const count = item.assets === null ? "—" : formatCount(item.assets);
    const share = item.share === null ? "—" : formatPercent(item.share);
    return `<tr class="portfolio-focus-category${selected ? " is-selected" : ""}"><th scope="row">${name}</th><td class="portfolio-number">${count}</td><td class="portfolio-number">${share}</td></tr>`;
  }).join("");

  target.innerHTML = `<div class="portfolio-focus-summary">
    <div class="portfolio-focus-identity"><p class="portfolio-focus-kicker">หน่วยงานที่เลือก</p><h3>${escapeHtml(department.label || "ไม่ระบุหน่วยงาน")}</h3><p><strong>${departmentTotal === null ? "—" : formatCount(departmentTotal)}</strong> สินทรัพย์ <span>· สัดส่วนพอร์ต ${portfolioShare === null ? "—" : formatPercent(portfolioShare)}</span></p></div>
    <dl class="portfolio-focus-metrics"><div><dt>หมวดหมู่ที่มีสินทรัพย์</dt><dd>${formatCount(represented)}</dd></div><div><dt>ประเภทที่มีข้อมูล</dt><dd>${department.distinctTypes === null ? "—" : formatCount(department.distinctTypes)}</dd></div></dl>
    <div class="portfolio-focus-dominant"><span>หมวดหมู่หลัก</span><strong>${escapeHtml(dominant?.label || "—")}</strong><span>${dominant ? `${formatCount(dominant.assets)} รายการ · ${dominant.share === null ? "สัดส่วนคำนวณไม่ได้" : `${formatPercent(dominant.share)} ของหน่วยงาน`}` : "ไม่มีหมวดหมู่ที่มียอดสินทรัพย์"}</span></div>
    ${selectedCategoryText}
  </div>
  <div class="portfolio-focus-actions">${departmentAction}${categoryAction}</div>
  <div class="portfolio-focus-breakdown-scroll" role="region" tabindex="0" aria-label="องค์ประกอบหมวดหมู่ของ ${escapeHtml(department.label || "หน่วยงานที่เลือก")}">
    <table class="dashboard-data-table portfolio-focus-breakdown"><caption class="sr-only">จำนวนและสัดส่วนหมวดหมู่ภายในหน่วยงานที่เลือก</caption>
      <thead><tr><th scope="col">หมวดหมู่</th><th scope="col">จำนวน</th><th scope="col">สัดส่วนในหน่วยงาน</th></tr></thead><tbody>${categoryRows}</tbody>
    </table>
  </div>`;
}

function renderPortfolio(data) {
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const departments = latestPayload?.departments?.rows || [];
  const matrix = buildPortfolioMatrixRows(departments, categories, data?.departmentCategoryMatrix);
  const selectedDepartment = resolvePortfolioDepartment(matrix.rows, selectedPortfolioDepartmentKey);
  selectedPortfolioDepartmentKey = getPortfolioDepartmentKey(selectedDepartment);
  const selectedCategory = categories.find((category) => getPortfolioCategoryKey(category) === selectedPortfolioCategoryKey) ?? categories[0] ?? null;
  selectedPortfolioCategoryKey = getPortfolioCategoryKey(selectedCategory);
  const portfolioTotal = latestPayload?.overview?.totalAssets;

  renderPortfolioTreemap(categories, portfolioTotal, selectedPortfolioCategoryKey);
  renderPortfolioMatrix(matrix.rows, categories, matrix.complete);
  renderPortfolioFocus(selectedDepartment, categories, selectedPortfolioCategoryKey, portfolioTotal, matrix.complete);
}

const DEPARTMENT_COMPARISON_SORT_KEYS = new Set([
  "totalAssets",
  "assetShareRate",
  "availabilityRate",
  "damageRate",
  "missingLocationRate",
  "averageAssetAge",
  "assetsOlderThanThreshold",
  "oldAssetRate",
]);

function departmentMetricText(value, formatter) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "") || !Number.isFinite(Number(value))) return "—";
  return formatter(value);
}

function renderDepartmentMatrixCell(row, column, allRows) {
  const value = row?.[column.key];
  const text = departmentMetricText(value, column.format);
  if (!column.heatColor) {
    return `<td class="department-matrix-number">${escapeHtml(text)}</td>`;
  }

  const heatValues = allRows.map((item) => item?.[column.key]);
  const heatLevel = getDepartmentHeatLevel(value, heatValues);
  if (heatLevel === null) {
    return `<td class="department-matrix-number"><span class="department-heat-value is-unavailable" title="ไม่มีข้อมูลสำหรับตัวชี้วัดนี้">—</span></td>`;
  }

  const tint = `${4 + Math.round(heatLevel * 12)}%`;
  return `<td class="department-matrix-number"><span class="department-heat-value" style="--department-heat-color:${column.heatColor};--department-heat-tint:${tint}" title="${escapeHtml(`${column.label}: ${text} · สีแสดงค่าเปรียบเทียบภายในคอลัมน์`)}">${escapeHtml(text)}</span></td>`;
}

function renderDepartmentPagination(page) {
  if (page.totalRows === 0) return "";
  const start = page.pageSize === "all" ? 1 : ((page.page - 1) * page.pageSize) + 1;
  const end = page.pageSize === "all" ? page.totalRows : Math.min(page.page * page.pageSize, page.totalRows);
  const disabled = (action) => {
    if (action === "first" || action === "previous") return page.page <= 1;
    return page.page >= page.totalPages;
  };
  const button = (action, label, accessibleLabel) => `<button class="button button-secondary department-page-button" type="button" data-department-comparison-page="${action}" aria-label="${accessibleLabel}"${disabled(action) ? " disabled" : ""}>${label}</button>`;

  return `<nav class="department-pagination" aria-label="แบ่งหน้าตารางเปรียบเทียบหน่วยงาน">
    <p class="department-pagination-range" role="status" aria-live="polite">แสดง ${formatCount(start)}–${formatCount(end)} จาก ${formatCount(page.totalRows)} หน่วยงาน</p>
    <div class="department-pagination-controls">
      <label class="department-page-size-label">รายการต่อหน้า
        <select data-department-comparison-page-size aria-label="จำนวนหน่วยงานต่อหน้า">
          ${DEPARTMENT_COMPARISON_PAGE_SIZES.map((size) => `<option value="${size}"${page.pageSize === size ? " selected" : ""}>${size === "all" ? "ทั้งหมด" : size}</option>`).join("")}
        </select>
      </label>
      <div class="department-page-actions">
        ${button("first", "หน้าแรก", "ไปหน้าแรก")}
        ${button("previous", "ก่อนหน้า", "ไปหน้าก่อนหน้า")}
        <span class="department-page-current" aria-current="page">หน้า ${formatCount(page.page)} จาก ${formatCount(page.totalPages)}</span>
        ${button("next", "ถัดไป", "ไปหน้าถัดไป")}
        ${button("last", "หน้าสุดท้าย", "ไปหน้าสุดท้าย")}
      </div>
    </div>
  </nav>`;
}

function renderDepartmentMatrix(rows) {
  const target = document.getElementById("department-matrix");
  if (!target) return;
  if (rows.length === 0) {
    target.innerHTML = emptyMarkup("ไม่พบข้อมูลหน่วยงาน", "ปรับตัวกรองหรือเลือกชุดข้อมูลอื่นเพื่อดูผลเปรียบเทียบ");
    return;
  }

  const columns = [
    { key: "totalAssets", label: "สินทรัพย์ทั้งหมด", format: formatCount },
    { key: "assetShareRate", label: "สัดส่วนพอร์ต", format: formatPercent },
    { key: "availabilityRate", label: "พร้อมใช้งาน", format: formatPercent, heatColor: "var(--cpe-success)" },
    { key: "damageRate", label: "ชำรุด", format: formatPercent, heatColor: "var(--cpe-danger)" },
    { key: "missingLocationRate", label: "ไม่มีตำแหน่ง", format: formatPercent, heatColor: "var(--cpe-warning)" },
    { key: "averageAssetAge", label: "อายุเฉลี่ย", format: (value) => `${Number(value).toFixed(1)} ปี` },
    { key: "assetsOlderThanThreshold", label: `อายุเกิน ${filters.ageThreshold} ปี`, format: formatCount },
    { key: "oldAssetRate", label: "อัตราสินทรัพย์อายุเก่า", format: formatPercent, heatColor: "var(--cpe-info)" },
  ];
  const page = paginateDepartmentRows(rows, departmentComparisonState);
  departmentComparisonState = { ...departmentComparisonState, page: page.page };
  const headers = columns.map((column) => {
    const active = departmentComparisonState.sortKey === column.key;
    const direction = departmentComparisonState.direction;
    const indicator = active ? (direction === "asc" ? " ↑" : " ↓") : "";
    const sortLabel = active && direction === "asc" ? "จากน้อยไปมาก" : "จากมากไปน้อย";
    return `<th scope="col" aria-sort="${active ? (direction === "asc" ? "ascending" : "descending") : "none"}"><button class="table-sort-button department-sort-button" type="button" data-department-comparison-sort="${column.key}" aria-label="เรียง${sortLabel}ตาม${escapeHtml(column.label)}">${escapeHtml(column.label)}<span aria-hidden="true">${indicator}</span></button></th>`;
  }).join("");
  const body = page.rows.map((row) => {
    const key = getDepartmentKey(row);
    const selected = key === selectedDepartmentKey;
    const label = displayValue(row?.label);
    const metricCells = columns.map((column) => renderDepartmentMatrixCell(row, column, rows)).join("");
    return `<tr data-department-row="${escapeHtml(key)}" aria-selected="${selected}">
      <th scope="row"><button class="department-row-select" type="button" data-department-select="${escapeHtml(key)}" aria-controls="department-focus" aria-pressed="${selected}" aria-label="เลือกหน่วยงาน ${escapeHtml(label)}">${escapeHtml(label)}</button></th>
      ${metricCells}
    </tr>`;
  }).join("");

  target.innerHTML = `<div class="dashboard-table-wrap department-comparison-scroll" role="region" tabindex="0" aria-label="ตารางเปรียบเทียบหน่วยงาน เลื่อนแนวนอนเพื่อดูตัวชี้วัดทั้งหมด">
    <table class="dashboard-data-table department-comparison-table" aria-describedby="department-matrix-guide">
      <caption class="sr-only">ตารางเปรียบเทียบหน่วยงาน เรียงตามตัวชี้วัดที่เลือก</caption>
      <thead><tr><th scope="col">หน่วยงาน</th>${headers}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>${renderDepartmentPagination(page)}`;
}

function renderDepartmentFocus(row) {
  const target = document.getElementById("department-focus");
  if (!target) return;
  if (!row) {
    target.innerHTML = emptyMarkup("ไม่พบข้อมูลหน่วยงาน", "หน่วยงานที่ตรงกับตัวกรองจะแสดงที่นี่");
    return;
  }

  const label = displayValue(row.label);
  const total = departmentMetricText(row.totalAssets, formatCount);
  const share = departmentMetricText(row.assetShareRate, formatPercent);
  const averageAge = departmentMetricText(row.averageAssetAge, (value) => `${Number(value).toFixed(1)} ปี`);
  const oldRateNote = "อัตราสินทรัพย์อายุเก่าคำนวณจากรายการที่ทราบอายุ";
  const explorerAction = row.filterValue && row.filterValue !== "__unknown__"
    ? drillButton("ดูสินทรัพย์ของหน่วยงานนี้", "department", row.filterValue)
    : `<span class="department-focus-unavailable">ไม่สามารถกรองหน่วยงานที่ไม่ระบุได้</span>`;

  target.innerHTML = `<div class="department-focus-identity">
      <h3>${escapeHtml(label)}</h3>
      <p><strong>${escapeHtml(total)}</strong><span>รายการ · สัดส่วนพอร์ต ${escapeHtml(share)}</span></p>
    </div>
    <div class="department-focus-metrics">
      <section class="department-focus-group" aria-labelledby="department-focus-operational-title">
        <h3 id="department-focus-operational-title">ความพร้อมและสภาพ</h3>
        <dl>
          <div><dt>พร้อมใช้งาน</dt><dd>${escapeHtml(departmentMetricText(row.availabilityRate, formatPercent))}</dd></div>
          <div><dt>ชำรุด</dt><dd>${escapeHtml(departmentMetricText(row.damageRate, formatPercent))}</dd></div>
          <div><dt>ไม่มีตำแหน่ง</dt><dd>${escapeHtml(departmentMetricText(row.missingLocationRate, formatPercent))}</dd></div>
        </dl>
      </section>
      <section class="department-focus-group" aria-labelledby="department-focus-aging-title">
        <h3 id="department-focus-aging-title">อายุสินทรัพย์</h3>
        <dl>
          <div><dt>อายุเฉลี่ย</dt><dd>${escapeHtml(averageAge)}</dd></div>
          <div><dt>อายุเกิน ${formatCount(filters.ageThreshold)} ปี</dt><dd>${escapeHtml(departmentMetricText(row.assetsOlderThanThreshold, formatCount))}</dd></div>
          <div><dt>อัตราสินทรัพย์อายุเก่า</dt><dd>${escapeHtml(departmentMetricText(row.oldAssetRate, formatPercent))}</dd></div>
        </dl>
        <p class="department-focus-note">${oldRateNote}</p>
      </section>
    </div>
    <div class="department-focus-action">${explorerAction}</div>`;
}

function renderDepartments(data) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const selected = resolveSelectedDepartment(rows, selectedDepartmentKey);
  selectedDepartmentKey = getDepartmentKey(selected);
  renderDepartmentMatrix(rows);
  renderDepartmentFocus(selected);
}

function renderLocationCompleteness(data) {
  const target = document.getElementById("location-completeness");
  if (!target) return;
  const { totalAssets: total, segments, available } = buildLocationCompletenessSegments(data);
  if (total === null || total <= 0) {
    target.innerHTML = emptyMarkup("ไม่มีสินทรัพย์ในชุดข้อมูลที่เลือก");
    return;
  }
  if (!available) {
    target.innerHTML = emptyMarkup("ข้อมูลสถานที่ไม่ครบสำหรับการสรุป", "จำนวนสถานะแต่ละกลุ่มไม่รวมเท่ากับสินทรัพย์ทั้งหมด จึงยังไม่แสดงแผนภูมิ");
    return;
  }

  const circumference = 2 * Math.PI * 62;
  let offset = 0;
  const arcs = segments.filter((segment) => segment.count > 0).map((segment) => {
    const length = circumference * segment.count / total;
    const ariaLabel = `${segment.label}: ${formatCount(segment.count)} รายการ · ${formatPercent(segment.share)}`;
    const arc = `<circle class="location-donut-segment location-donut-${segment.key}" cx="80" cy="80" r="62" stroke-dasharray="${length.toFixed(3)} ${(circumference - length).toFixed(3)}" stroke-dashoffset="-${offset.toFixed(3)}" aria-label="${escapeHtml(ariaLabel)}"><title>${escapeHtml(ariaLabel)}</title></circle>`;
    offset += length;
    return arc;
  }).join("");
  const legend = segments.map((segment) => {
    const label = segment.count > 0
      ? drillButton(segment.label, "locationStatus", segment.filterValue)
      : escapeHtml(segment.label);
    return `<li class="location-completeness-item">
      <span class="location-completeness-swatch location-donut-${segment.key}" aria-hidden="true"></span>
      <span class="location-completeness-label">${label}</span>
      <strong>${formatCount(segment.count)}</strong>
      <span>${formatPercent(segment.share)}</span>
    </li>`;
  }).join("");
  const description = segments.map((segment) => `${segment.label} ${formatCount(segment.count)} รายการ ${formatPercent(segment.share)}`).join("; ");

  target.innerHTML = `<div class="location-donut-wrap">
      <svg class="location-completeness-donut" viewBox="0 0 160 160" role="img" aria-labelledby="location-donut-title location-donut-description">
        <title id="location-donut-title">สัดส่วนความครบถ้วนของข้อมูลตำแหน่ง</title>
        <desc id="location-donut-description">${escapeHtml(description)}</desc>
        <circle class="location-donut-track" cx="80" cy="80" r="62"></circle>${arcs}
      </svg>
      <div class="location-donut-center" aria-hidden="true"><strong>${formatCount(total)}</strong><span>สินทรัพย์</span></div>
    </div>
    <ul class="location-completeness-legend" aria-label="สรุปสถานะข้อมูลตำแหน่ง">${legend}</ul>`;
}

function renderLocationPagination(page, scope, label) {
  if (page.totalRows === 0 || (page.totalRows <= 5 && page.pageSize === 5)) return "";
  const start = page.pageSize === "all" ? 1 : ((page.page - 1) * page.pageSize) + 1;
  const end = page.pageSize === "all" ? page.totalRows : Math.min(page.totalRows, page.page * page.pageSize);
  const maxPage = Math.max(1, page.totalPages);
  const disabled = (action) => action === "first" || action === "previous" ? page.page <= 1 : page.page >= maxPage;
  const button = (action, text, accessibleLabel) => `<button class="button button-secondary location-page-button" type="button" data-location-page="${scope}" data-location-page-action="${action}" aria-label="${accessibleLabel}"${disabled(action) ? " disabled" : ""}>${text}</button>`;
  return `<nav class="location-pagination" aria-label="แบ่งหน้ารายการ${escapeHtml(label)}">
    <p class="location-pagination-range" role="status" aria-live="polite">แสดง ${formatCount(start)}–${formatCount(end)} จาก ${formatCount(page.totalRows)} รายการ</p>
    <div class="location-pagination-controls">
      <label>รายการต่อหน้า <select data-location-page-size="${scope}" aria-label="จำนวน${escapeHtml(label)}ต่อหน้า">
        ${LOCATION_PAGE_SIZES.map((size) => `<option value="${size}"${page.pageSize === size ? " selected" : ""}>${size === "all" ? "ทั้งหมด" : size}</option>`).join("")}
      </select></label>
      <div class="location-page-actions">${button("first", "«", "หน้าแรก")}${button("previous", "‹", "หน้าก่อน")}
        <span class="location-page-current" aria-current="page">หน้า ${formatCount(page.page)} จาก ${formatCount(maxPage)}</span>
        ${button("next", "›", "หน้าถัดไป")}${button("last", "»", "หน้าสุดท้าย")}
      </div>
    </div>
  </nav>`;
}

function locationExplorerDrillButton(filters, label) {
  const entries = Object.entries(filters || {}).filter(([key, value]) =>
    Object.hasOwn(FILTER_DEFAULTS, key) && value !== null && value !== undefined && value !== "",
  );
  if (entries.length === 0) return "";
  return `<button class="button button-secondary" type="button" data-location-explorer-drill data-drill-filters="${escapeHtml(JSON.stringify(Object.fromEntries(entries)))}">${escapeHtml(label)}</button>`;
}

function renderLocationExplorerList(id, items, level, selectedKey, label) {
  const target = document.getElementById(id);
  if (!target) return;
  if (!Array.isArray(items) || items.length === 0) {
    target.innerHTML = emptyMarkup(level === "building" ? "ไม่มีตำแหน่งที่ระบุ" : `ไม่มี${label}ในรายการที่เลือก`);
    return;
  }
  const page = paginateLocationRows(items, locationExplorerPages[level]);
  locationExplorerPages[level] = { ...locationExplorerPages[level], page: page.page };
  const rows = page.rows.map((item) => `<li class="location-explorer-item">
    <button class="location-explorer-select${item.key === selectedKey ? " is-selected" : ""}" type="button" data-location-explorer-select="${level}" data-location-explorer-key="${escapeHtml(item.key)}" aria-pressed="${item.key === selectedKey}" aria-label="เลือก${escapeHtml(label)} ${escapeHtml(item.label)} จำนวน ${formatCount(item.totalAssets)} รายการ">
      <span>${escapeHtml(item.label)}</span><strong>${formatCount(item.totalAssets)}</strong>
    </button>
  </li>`).join("");
  target.innerHTML = `<ul class="location-explorer-items">${rows}</ul>${renderLocationPagination(page, `explorer-${level}`, label)}`;
}

function renderLocationExplorer(data) {
  const explorer = data && typeof data === "object" ? data : {};
  if (!Array.isArray(explorer.buildings)) {
    for (const id of ["location-explorer-buildings", "location-explorer-floors", "location-explorer-rooms", "location-explorer-unassigned", "location-explorer-selection"]) {
      const target = document.getElementById(id);
      if (target) target.innerHTML = emptyMarkup("ข้อมูลสำรวจตำแหน่งไม่พร้อมใช้งาน");
    }
    locationExplorerSelection = { buildingKey: null, floorKey: null, roomKey: null };
    return;
  }
  const selection = reconcileLocationExplorerSelection(explorer, locationExplorerSelection);
  locationExplorerSelection = {
    buildingKey: selection.buildingKey,
    floorKey: selection.floorKey,
    roomKey: selection.roomKey,
  };
  const selectedBuilding = selection.buildings.find((item) => item.key === selection.buildingKey) ?? null;
  const selectedFloor = selection.floors.find((item) => item.key === selection.floorKey) ?? null;
  const selectedRoom = selection.rooms.find((item) => item.key === selection.roomKey) ?? null;
  renderLocationExplorerList("location-explorer-buildings", selection.buildings, "building", selection.buildingKey, "อาคาร");
  renderLocationExplorerList("location-explorer-floors", selection.floors, "floor", selection.floorKey, "ชั้น");
  renderLocationExplorerList("location-explorer-rooms", selection.rooms, "room", selection.roomKey, "ห้อง / พื้นที่");

  const unassigned = Number(explorer.unassignedAssets);
  const unknown = Number(explorer.unknownStatusAssets);
  const statusTarget = document.getElementById("location-explorer-unassigned");
  if (statusTarget) {
    const unassignedCount = Number.isFinite(unassigned) ? formatCount(unassigned) : "—";
    const unknownCount = Number.isFinite(unknown) ? formatCount(unknown) : "—";
    statusTarget.innerHTML = `<div class="location-unassigned-item"><div><strong>ไม่มีตำแหน่งตามธงคลัง</strong><span>${unassignedCount} รายการ · ไม่รวมในลำดับอาคาร ชั้น และห้อง</span></div>${unassigned > 0 ? drillButton("ดูสินทรัพย์", "locationStatus", "missing") : ""}</div>
      ${unknown > 0 ? `<div class="location-unassigned-item is-unknown"><div><strong>ไม่ทราบสถานะการระบุตำแหน่ง</strong><span>${unknownCount} รายการ · แยกจากตำแหน่งที่ระบุแล้ว</span></div>${drillButton("ดูสินทรัพย์", "locationStatus", "unknown")}</div>` : ""}`;
  }

  const selectedNode = selectedRoom || selectedFloor || selectedBuilding;
  const selectedFilters = selectedNode?.drillFilters ?? null;
  const selectionTarget = document.getElementById("location-explorer-selection");
  if (selectionTarget) {
    selectionTarget.innerHTML = selectedNode
      ? `<div class="location-selection-copy"><strong>${escapeHtml(selectedNode.label)}</strong><span>${formatCount(selectedNode.totalAssets)} รายการ · ${selectedRoom ? "ห้อง / พื้นที่" : selectedFloor ? "ชั้น" : "อาคาร"}</span></div>${locationExplorerDrillButton(selectedFilters, "ดูสินทรัพย์ในตำแหน่งนี้")}`
      : emptyMarkup("ไม่มีข้อมูลตำแหน่งที่ระบุ", "ตรวจสอบสถานะในส่วนสรุปด้านบน หรือเปลี่ยนตัวกรอง");
  }
}

function locationSortHeader(key, label, state, dataAttribute) {
  const active = state.sortKey === key;
  const direction = active ? state.direction : "desc";
  const directionLabel = direction === "asc" ? "น้อยไปมาก" : "มากไปน้อย";
  const indicator = active ? (direction === "asc" ? "↑" : "↓") : "↕";
  return `<th scope="col" aria-sort="${active ? (direction === "asc" ? "ascending" : "descending") : "none"}"><button class="location-sort-button" type="button" ${dataAttribute}="${escapeHtml(key)}" aria-label="เรียง${escapeHtml(label)}จาก${directionLabel}">${escapeHtml(label)}<span aria-hidden="true">${indicator}</span></button></th>`;
}

function locationHeatCell(row, countKey, rateKey, tone, title) {
  const count = row[countKey];
  const rate = row[rateKey];
  const unavailable = count === null || rate === null;
  const intensity = unavailable ? 0 : Math.max(0, Math.min(18, rate * 0.18));
  const description = unavailable
    ? `${row.label} · ${title}: ไม่มีข้อมูล`
    : `${row.label} · ${title}: ${formatCount(count)} รายการ · ${formatPercent(rate)} ของสินทรัพย์ทั้งหมดในหน่วยงาน`;
  const classes = ["location-rate-cell", `is-${tone}`, unavailable ? "is-unavailable" : "", count === 0 ? "is-zero" : ""].filter(Boolean).join(" ");
  return `<td class="location-heat-cell"><span class="${classes}"${intensity > 0 ? ` style="--location-heat:${intensity.toFixed(2)}%"` : ""} aria-label="${escapeHtml(description)}" title="${escapeHtml(description)}"><strong>${count === null ? "—" : formatCount(count)}</strong><small>${rate === null ? "—" : formatPercent(rate)}</small></span></td>`;
}

function renderLocationDepartmentMatrix(departments) {
  const target = document.getElementById("location-department-matrix");
  if (!target) return null;
  const rows = buildLocationDepartmentRows(departments);
  if (rows.length === 0) {
    selectedLocationDepartmentKey = null;
    target.innerHTML = emptyMarkup("ไม่มีหน่วยงานให้เปรียบเทียบ", "ลองเปลี่ยนตัวกรองหรือเลือกชุดข้อมูลอื่น");
    return null;
  }
  const sortableKeys = ["label", "totalAssets", "completeRate", "incompleteRate", "missingRate", "unknownRate"];
  if (!sortableKeys.includes(locationMatrixState.sortKey)) {
    locationMatrixState = setLocationSort(locationMatrixState, "missingRate", "desc", sortableKeys);
  }
  const page = paginateLocationRows(rows, locationMatrixState);
  locationMatrixState = { ...locationMatrixState, page: page.page };
  const selected = rows.find((row) => row.key === selectedLocationDepartmentKey) ?? page.sortedRows[0];
  selectedLocationDepartmentKey = selected?.key ?? null;
  const body = page.rows.map((row) => {
    const isSelected = row.key === selectedLocationDepartmentKey;
    const departmentLabel = row.label || "ไม่ระบุหน่วยงาน";
    return `<tr class="${isSelected ? "is-selected" : ""}" aria-selected="${isSelected}" data-location-department-row="${escapeHtml(row.key)}">
      <th scope="row"><button class="location-department-select" type="button" data-location-department-select="${escapeHtml(row.key)}" aria-controls="location-department-focus" aria-pressed="${isSelected}" aria-label="เลือกหน่วยงาน ${escapeHtml(departmentLabel)}">${escapeHtml(departmentLabel)}</button></th>
      <td class="location-number">${row.totalAssets === null ? "—" : formatCount(row.totalAssets)}</td>
      ${locationHeatCell(row, "completeAssets", "completeRate", "complete", "รายละเอียดครบ")}
      ${locationHeatCell(row, "incompleteAssets", "incompleteRate", "incomplete", "ระบุแล้วแต่รายละเอียดไม่ครบ")}
      ${locationHeatCell(row, "missingAssets", "missingRate", "missing", "ไม่มีตำแหน่ง")}
      ${locationHeatCell(row, "unknownAssets", "unknownRate", "unknown", "ไม่ทราบสถานะตำแหน่ง")}
    </tr>`;
  }).join("");
  target.innerHTML = `<div class="location-matrix-scroll-inner" role="region" tabindex="0" aria-label="เมทริกซ์คุณภาพข้อมูลตำแหน่ง เลื่อนแนวนอนเพื่อดูทุกสถานะ">
    <table class="dashboard-data-table location-matrix-table" aria-describedby="location-matrix-guide">
      <caption class="sr-only">จำนวนและสัดส่วนความครบถ้วนของข้อมูลตำแหน่งแยกตามหน่วยงาน</caption>
      <thead><tr>
        ${locationSortHeader("label", "หน่วยงาน", locationMatrixState, "data-location-matrix-sort")}
        ${locationSortHeader("totalAssets", "สินทรัพย์ทั้งหมด", locationMatrixState, "data-location-matrix-sort")}
        ${locationSortHeader("completeRate", "รายละเอียดครบ · จำนวน / %", locationMatrixState, "data-location-matrix-sort")}
        ${locationSortHeader("incompleteRate", "ระบุแล้วแต่ไม่ครบ · จำนวน / %", locationMatrixState, "data-location-matrix-sort")}
        ${locationSortHeader("missingRate", "ไม่มีตำแหน่ง · จำนวน / %", locationMatrixState, "data-location-matrix-sort")}
        ${locationSortHeader("unknownRate", "ไม่ทราบสถานะ · จำนวน / %", locationMatrixState, "data-location-matrix-sort")}
      </tr></thead><tbody>${body}</tbody>
    </table>
  </div>${renderLocationPagination(page, "department-matrix", "หน่วยงาน")}`;
  return selected;
}

function renderLocationDepartmentFocus(row) {
  const target = document.getElementById("location-department-focus");
  if (!target) return;
  if (!row) {
    target.innerHTML = emptyMarkup("ไม่มีหน่วยงานให้แสดง", "หน่วยงานที่ตรงกับตัวกรองจะแสดงที่นี่");
    return;
  }
  const categories = [
    { key: "complete", label: "รายละเอียดครบ", count: row.completeAssets, rate: row.completeRate },
    { key: "incomplete", label: "ระบุแล้วแต่รายละเอียดไม่ครบ", count: row.incompleteAssets, rate: row.incompleteRate },
    { key: "missing", label: "ไม่มีตำแหน่งตามธงคลัง", count: row.missingAssets, rate: row.missingRate },
    { key: "unknown", label: "ไม่ทราบสถานะตำแหน่ง", count: row.unknownAssets, rate: row.unknownRate },
  ];
  const categoryRows = categories.map((item) => {
    const action = item.count > 0
      ? drillButton("ดูรายการ", { department: row.filterValue, locationStatus: item.key })
      : "";
    return `<div class="location-focus-quality-item"><dt>${escapeHtml(item.label)}</dt><dd>${item.count === null ? "—" : `${formatCount(item.count)} รายการ`}<span>${formatPercent(item.rate)}</span>${action}</dd></div>`;
  }).join("");
  const identity = `<div class="location-focus-identity"><h3>${escapeHtml(row.label || "ไม่ระบุหน่วยงาน")}</h3><p><strong>${row.totalAssets === null ? "—" : formatCount(row.totalAssets)}</strong> รายการ <span>· สัดส่วนพอร์ต ${formatPercent(row.assetShareRate)}</span></p></div>`;
  const distribution = `<dl class="location-focus-distribution">
    <div><dt>อาคารที่ระบุได้</dt><dd>${row.representedBuildings === null ? "—" : formatCount(row.representedBuildings)}</dd></div>
    <div><dt>ชั้นที่ระบุได้</dt><dd>${row.representedFloors === null ? "—" : formatCount(row.representedFloors)}</dd></div>
    <div><dt>ห้อง / พื้นที่ที่ระบุได้</dt><dd>${row.representedRoomsOrAreas === null ? "—" : formatCount(row.representedRoomsOrAreas)}</dd></div>
    <div><dt>อาคารที่มีสินทรัพย์มากที่สุด</dt><dd>${escapeHtml(row.mostCommonBuilding || "—")}<span>${row.mostCommonBuildingAssets === null ? "" : `${formatCount(row.mostCommonBuildingAssets)} รายการ`}</span></dd></div>
  </dl>`;
  const allAssetsAction = drillButton("ดูสินทรัพย์ของหน่วยงาน", "department", row.filterValue);
  target.innerHTML = `<div class="location-focus-layout">${identity}<dl class="location-focus-quality">${categoryRows}</dl>${distribution}</div><div class="location-focus-actions">${allAssetsAction}</div>`;
}

function renderLocationCategoryBuildingTable(rows) {
  const target = document.getElementById("location-category-building-details");
  if (!target) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    target.innerHTML = emptyMarkup("ไม่มีข้อมูลหมวดหมู่ตามอาคาร");
    return;
  }
  const allowedKeys = ["totalAssets", "first", "second"];
  if (!allowedKeys.includes(locationCategoryBuildingState.sortKey)) {
    locationCategoryBuildingState = setLocationSort(locationCategoryBuildingState, "totalAssets", "desc", allowedKeys);
  }
  const page = paginateLocationRows(rows, locationCategoryBuildingState);
  locationCategoryBuildingState = { ...locationCategoryBuildingState, page: page.page };
  const body = page.rows.map((row) => {
    const filterValues = { category: row.firstFilterValue, building: row.secondFilterValue };
    return `<tr><th scope="row">${escapeHtml(row.first)}</th><td>${escapeHtml(row.second)}</td><td class="location-number">${formatCount(row.totalAssets)}</td><td>${drillButton("ดูสินทรัพย์", filterValues)}</td></tr>`;
  }).join("");
  target.innerHTML = `<div class="dashboard-table-wrap"><table class="dashboard-data-table location-category-building-table"><caption class="sr-only">หมวดหมู่และอาคารที่ระบุตำแหน่งแล้ว</caption><thead><tr>
    ${locationSortHeader("first", "หมวดหมู่", locationCategoryBuildingState, "data-location-category-building-sort")}
    ${locationSortHeader("second", "อาคาร", locationCategoryBuildingState, "data-location-category-building-sort")}
    ${locationSortHeader("totalAssets", "สินทรัพย์", locationCategoryBuildingState, "data-location-category-building-sort")}
    <th scope="col">การดำเนินการ</th></tr></thead><tbody>${body}</tbody></table></div>${renderLocationPagination(page, "category-building", "รายการหมวดหมู่ตามอาคาร")}`;
}

function renderLocations(data) {
  renderLocationCompleteness(latestPayload?.overview);
  renderLocationExplorer(data?.explorer);
  const selectedDepartment = renderLocationDepartmentMatrix(latestPayload?.departments?.rows);
  renderLocationDepartmentFocus(selectedDepartment);
  renderLocationCategoryBuildingTable(data?.categoryBuildingAll);
}

function getLocationVisualRows(scope) {
  const locations = latestPayload?.locations || {};
  if (scope === "explorer-building") return locations.explorer?.buildings || [];
  if (scope === "explorer-floor") {
    const building = locations.explorer?.buildings?.find((item) => item.key === locationExplorerSelection.buildingKey);
    return building?.floors || [];
  }
  if (scope === "explorer-room") {
    const building = locations.explorer?.buildings?.find((item) => item.key === locationExplorerSelection.buildingKey);
    const floor = building?.floors?.find((item) => item.key === locationExplorerSelection.floorKey);
    return floor?.rooms || [];
  }
  if (scope === "department-matrix") return buildLocationDepartmentRows(latestPayload?.departments?.rows);
  if (scope === "category-building") return locations.categoryBuildingAll || [];
  return [];
}

function getLocationVisualState(scope) {
  if (scope === "explorer-building") return locationExplorerPages.building;
  if (scope === "explorer-floor") return locationExplorerPages.floor;
  if (scope === "explorer-room") return locationExplorerPages.room;
  if (scope === "department-matrix") return locationMatrixState;
  if (scope === "category-building") return locationCategoryBuildingState;
  return null;
}

function setLocationVisualState(scope, state) {
  if (scope === "explorer-building") locationExplorerPages = { ...locationExplorerPages, building: state };
  else if (scope === "explorer-floor") locationExplorerPages = { ...locationExplorerPages, floor: state };
  else if (scope === "explorer-room") locationExplorerPages = { ...locationExplorerPages, room: state };
  else if (scope === "department-matrix") locationMatrixState = state;
  else if (scope === "category-building") locationCategoryBuildingState = state;
}

function resetLocationPages() {
  locationExplorerPages = Object.fromEntries(Object.entries(locationExplorerPages).map(([key, state]) => [key, { ...state, page: 1 }]));
  locationMatrixState = { ...locationMatrixState, page: 1 };
  locationCategoryBuildingState = { ...locationCategoryBuildingState, page: 1 };
}

function resetAgingPages() {
  agingExposureStates = Object.fromEntries(Object.entries(agingExposureStates).map(([key, state]) => [key, { ...state, page: 1 }]));
  agingDetailStates = Object.fromEntries(Object.entries(agingDetailStates).map(([key, state]) => [key, { ...state, page: 1 }]));
}

function resetAcquisitionPages() {
  acquisitionHeatmapState = { ...acquisitionHeatmapState, page: 1 };
  acquisitionBreakdownStates = Object.fromEntries(Object.entries(acquisitionBreakdownStates).map(([key, state]) => [key, { ...state, page: 1 }]));
  acquisitionCrossStates = Object.fromEntries(Object.entries(acquisitionCrossStates).map(([key, state]) => [key, { ...state, page: 1 }]));
}

function getAcquisitionFocus() {
  if (!latestPayload?.acquisition) return null;
  return buildAcquisitionFocus(
    latestPayload.acquisition,
    latestPayload.overview?.totalAssets,
    acquisitionYearDimension,
    acquisitionSelectedCohortKey,
    acquisitionSelectedSourceKey,
  );
}

function getAcquisitionVisualRows(scope) {
  if (!latestPayload?.acquisition) return [];
  if (scope === "heatmap") return buildAcquisitionHeatmap(latestPayload.acquisition, acquisitionYearDimension).rows;
  if (scope.startsWith("breakdown:")) {
    const dimension = scope.slice("breakdown:".length);
    return buildAcquisitionBreakdown(latestPayload.acquisition, dimension, getAcquisitionFocus()).rows;
  }
  if (scope.startsWith("cross:")) {
    return buildAcquisitionCrossDimensionRows(latestPayload.acquisition, scope.slice("cross:".length)).rows;
  }
  return [];
}

function getAcquisitionVisualState(scope) {
  if (scope === "heatmap") return acquisitionHeatmapState;
  if (scope.startsWith("breakdown:")) return acquisitionBreakdownStates[scope.slice("breakdown:".length)] ?? null;
  if (scope.startsWith("cross:")) return acquisitionCrossStates[scope.slice("cross:".length)] ?? null;
  return null;
}

function setAcquisitionVisualState(scope, state) {
  if (scope === "heatmap") acquisitionHeatmapState = state;
  else if (scope.startsWith("breakdown:")) {
    const dimension = scope.slice("breakdown:".length);
    acquisitionBreakdownStates = { ...acquisitionBreakdownStates, [dimension]: state };
  } else if (scope.startsWith("cross:")) {
    const relation = scope.slice("cross:".length);
    acquisitionCrossStates = { ...acquisitionCrossStates, [relation]: state };
  }
}

function formatAgingCount(value) {
  return value === null || value === undefined ? "—" : formatCount(value);
}

function formatAgingYears(value) {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(1)} ปี`;
}

function getAgingDimensionData(payload, dimension) {
  if (dimension === "department") {
    return {
      label: AGING_DIMENSION_LABELS.department,
      filterKey: "department",
      entities: payload?.departments?.rows || [],
      ageGroups: payload?.aging?.byDepartment || [],
    };
  }
  if (dimension === "category") {
    return {
      label: AGING_DIMENSION_LABELS.category,
      filterKey: "category",
      entities: payload?.portfolio?.categories || [],
      ageGroups: payload?.aging?.byCategory || [],
    };
  }
  return {
    label: AGING_DIMENSION_LABELS.type,
    filterKey: "type",
    entities: payload?.portfolio?.types || [],
    ageGroups: payload?.aging?.byType || [],
  };
}

function renderAgingPagination(page, scope, dimension, label) {
  if (page.totalRows === 0 || (page.totalRows <= 5 && page.pageSize === 5)) return "";
  const first = page.pageSize === "all" ? 1 : (page.page - 1) * page.pageSize + 1;
  const last = page.pageSize === "all" ? page.totalRows : Math.min(page.page * page.pageSize, page.totalRows);
  const disabled = (action) => (
    (action === "first" || action === "previous") ? page.page <= 1 : page.page >= page.totalPages
  );
  const button = (action, glyph, ariaLabel) => `<button class="button button-secondary aging-page-button" type="button" data-aging-page="${scope}" data-aging-table-dimension="${dimension}" data-aging-page-action="${action}" aria-label="${ariaLabel}"${disabled(action) ? " disabled" : ""}>${glyph}</button>`;
  return `<nav class="aging-pagination" aria-label="แบ่งหน้ารายการ${escapeHtml(label)}">
    <span class="aging-page-range" aria-live="polite">แสดง ${formatCount(first)}–${formatCount(last)} จาก ${formatCount(page.totalRows)} รายการ</span>
    <label class="aging-page-size">รายการต่อหน้า
      <select data-aging-page-size="${scope}" data-aging-table-dimension="${dimension}" aria-label="จำนวน${escapeHtml(label)}ต่อหน้า">
        ${AGING_PAGE_SIZES.map((size) => `<option value="${size}"${page.pageSize === size ? " selected" : ""}>${size === "all" ? "ทั้งหมด" : size}</option>`).join("")}
      </select>
    </label>
    <span class="aging-page-navigation">
      ${button("first", "«", "หน้าแรก")}
      ${button("previous", "‹", "หน้าก่อนหน้า")}
      <span class="aging-page-indicator">หน้า ${formatCount(page.page)} จาก ${formatCount(page.totalPages)}</span>
      ${button("next", "›", "หน้าถัดไป")}
      ${button("last", "»", "หน้าสุดท้าย")}
    </span>
  </nav>`;
}

function renderAgingSortHeader(key, label, state, selector, dimension) {
  const active = state.sortKey === key;
  const direction = active ? state.direction : "desc";
  const directionLabel = direction === "asc" ? "น้อยไปมาก" : "มากไปน้อย";
  const indicator = active ? (direction === "asc" ? "↑" : "↓") : "↕";
  return `<th scope="col" aria-sort="${active ? (direction === "asc" ? "ascending" : "descending") : "none"}">
    <button class="aging-sort-button" type="button" ${selector}="${escapeHtml(key)}" data-aging-table-dimension="${dimension}" aria-label="เรียง${escapeHtml(label)}จาก${directionLabel}">${escapeHtml(label)}<span aria-hidden="true">${indicator}</span></button>
  </th>`;
}

function renderReplacementLens(overview, ageDistribution) {
  const target = document.getElementById("aging-replacement-lens");
  if (!target) return;
  const lens = buildReplacementLens(overview, ageDistribution);
  if (!lens.available) {
    target.innerHTML = emptyMarkup("ไม่สามารถสรุปอายุเทียบเกณฑ์ได้", "จำนวนอายุที่ทราบและไม่ทราบต้องสอดคล้องกับสินทรัพย์ทั้งหมดก่อนแสดงสัดส่วน");
    return;
  }

  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = lens.segments.map((segment) => {
    const length = lens.totalAssets > 0 ? (segment.count / lens.totalAssets) * circumference : 0;
    const arc = `<circle class="aging-donut-segment is-${segment.key}" cx="100" cy="100" r="${radius}" stroke-dasharray="${length.toFixed(3)} ${(circumference - length).toFixed(3)}" stroke-dashoffset="${(-offset).toFixed(3)}" />`;
    offset += length;
    return arc;
  }).join("");
  const legend = lens.segments.map((segment) => `<li class="aging-donut-legend-item">
    <span class="aging-donut-swatch is-${segment.key}" aria-hidden="true"></span>
    <span class="aging-donut-legend-label"><strong>${escapeHtml(segment.label)}</strong><small>${formatCount(segment.count)} รายการ</small></span>
    <span class="aging-donut-share">${formatPercent(segment.share)}</span>
  </li>`).join("");
  const metrics = [
    { label: "สินทรัพย์ทั้งหมด", value: formatAgingCount(lens.metrics.totalAssets), primary: true },
    { label: "อายุเกินเกณฑ์", value: formatAgingCount(lens.metrics.aboveThresholdAssets), primary: true },
    { label: "อัตราอายุเกินเกณฑ์ · จากอายุที่ทราบ", value: formatPercent(lens.metrics.exposureRate) },
    { label: "อายุเฉลี่ย", value: formatAgingYears(lens.metrics.averageAssetAge) },
    { label: "ไม่ทราบอายุ", value: formatAgingCount(lens.metrics.unknownAgeAssets) },
  ].map((metric) => `<div class="aging-lens-metric${metric.primary ? " is-primary" : ""}"><dt>${escapeHtml(metric.label)}</dt><dd>${metric.value}</dd></div>`).join("");

  target.innerHTML = `<div class="aging-lens-layout">
    <div class="aging-lens-chart-group">
      <div class="aging-donut" role="img" aria-label="สินทรัพย์ทั้งหมด ${formatCount(lens.totalAssets)} รายการ อายุเกินเกณฑ์ ${formatCount(lens.metrics.aboveThresholdAssets)} รายการ">
        <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false"><circle class="aging-donut-track" cx="100" cy="100" r="${radius}" />${arcs}</svg>
        <div class="aging-donut-center"><strong>${formatCount(lens.metrics.aboveThresholdAssets)}</strong><span>สินทรัพย์อายุเกินเกณฑ์</span></div>
      </div>
      <ul class="aging-donut-legend">${legend}</ul>
    </div>
    <dl class="aging-lens-metrics">${metrics}</dl>
  </div>`;
}

function renderAgingExposure(payload, departmentRows) {
  const target = document.getElementById("aging-replacement-exposure");
  if (!target) return;
  document.querySelectorAll("[data-aging-exposure-dimension]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.agingExposureDimension === agingExposureDimension));
  });
  const dimension = AGING_DIMENSIONS.includes(agingExposureDimension) ? agingExposureDimension : "department";
  agingExposureDimension = dimension;
  const source = dimension === "department"
    ? departmentRows
    : buildAgingExposureRows(dimension === "category" ? payload?.portfolio?.categories : payload?.portfolio?.types);
  if (source.length === 0) {
    target.innerHTML = emptyMarkup(`ไม่พบข้อมูล${AGING_DIMENSION_LABELS[dimension]}`, "ไม่มีกลุ่มสินทรัพย์ที่ตรงกับตัวกรองและชุดข้อมูลปัจจุบัน");
    return;
  }

  const state = agingExposureStates[dimension];
  const page = paginateAgingRows(source, state);
  agingExposureStates = { ...agingExposureStates, [dimension]: { ...state, page: page.page } };
  const filterKey = dimension === "department" ? "department" : dimension;
  const body = page.rows.map((row) => {
    const selected = dimension === "department" && row.key === selectedAgingDepartmentKey;
    const label = row.label || "ไม่ระบุกลุ่ม";
    const groupName = dimension === "department"
      ? `<button class="aging-department-select" type="button" data-aging-department-select="${escapeHtml(row.key)}" aria-controls="aging-department-focus" aria-pressed="${selected}" aria-label="เลือกหน่วยงาน ${escapeHtml(label)}">${escapeHtml(label)}</button>`
      : drillButton(label, filterKey, row.filterValue);
    const rate = row.oldAssetRate;
    const heat = rate === null ? null : Math.max(0, Math.min(18, rate * 0.18));
    const rateCell = rate === null
      ? `<span class="aging-exposure-rate is-unavailable">—</span>`
      : `<span class="aging-exposure-rate${rate === 0 ? " is-zero" : ""}" style="--aging-exposure-heat:${heat.toFixed(2)}%"><strong>${formatPercent(rate)}</strong><small>ทราบอายุ</small></span>`;
    return `<tr class="${selected ? "is-selected" : ""}"${dimension === "department" ? ` data-aging-department-row="${escapeHtml(row.key)}"` : ""}>
      <th scope="row">${groupName}</th>
      <td class="aging-number">${formatAgingCount(row.totalAssets)}</td>
      <td class="aging-number">${formatAgingCount(row.assetsOlderThanThreshold)}</td>
      <td>${rateCell}</td>
      <td class="aging-number">${formatAgingYears(row.averageAssetAge)}</td>
      <td>${drillButton("ดูสินทรัพย์", filterKey, row.filterValue)}</td>
    </tr>`;
  }).join("");
  const columns = [
    { key: "label", label: "ชื่อกลุ่ม" },
    { key: "totalAssets", label: "สินทรัพย์ทั้งหมด" },
    { key: "assetsOlderThanThreshold", label: "อายุเกินเกณฑ์" },
    { key: "oldAssetRate", label: "อัตราอายุเกินเกณฑ์" },
    { key: "averageAssetAge", label: "อายุเฉลี่ย" },
  ];
  target.innerHTML = `<div class="aging-data-table-scroll" role="region" tabindex="0" aria-label="ตารางกลุ่มสินทรัพย์อายุเกินเกณฑ์ตาม${AGING_DIMENSION_LABELS[dimension]}">
    <table class="dashboard-data-table aging-exposure-table">
      <caption class="sr-only">กลุ่มสินทรัพย์อายุเกินเกณฑ์ตาม${AGING_DIMENSION_LABELS[dimension]}</caption>
      <thead><tr>
        ${renderAgingSortHeader(columns[0].key, columns[0].label, state, "data-aging-exposure-sort", dimension)}
        ${renderAgingSortHeader(columns[1].key, columns[1].label, state, "data-aging-exposure-sort", dimension)}
        ${renderAgingSortHeader(columns[2].key, columns[2].label, state, "data-aging-exposure-sort", dimension)}
        ${renderAgingSortHeader(columns[3].key, columns[3].label, state, "data-aging-exposure-sort", dimension)}
        ${renderAgingSortHeader(columns[4].key, columns[4].label, state, "data-aging-exposure-sort", dimension)}
        <th scope="col">เปิดรายการ</th>
      </tr></thead><tbody>${body}</tbody>
    </table>
  </div>${renderAgingPagination(page, "exposure", dimension, AGING_DIMENSION_LABELS[dimension])}`;
}

function renderAgingCondition(payload) {
  const target = document.getElementById("aging-condition");
  if (!target) return;
  document.querySelectorAll("[data-aging-condition-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.agingConditionMode === agingConditionMode));
  });
  const overview = payload?.overview || {};
  const totalAboveThreshold = overview.assetsOlderThanThreshold !== null
    && overview.assetsOlderThanThreshold !== undefined
    && Number.isFinite(Number(overview.assetsOlderThanThreshold))
    ? Number(overview.assetsOlderThanThreshold)
    : null;
  const definitions = agingConditionMode === "damage"
    ? [
      { label: "ชำรุด", count: overview.oldAndDamagedAssets, tone: "damaged" },
      { label: "ไม่ชำรุด", count: overview.oldAndNotDamagedAssets, tone: "not-damaged" },
      { label: "ไม่ทราบสภาพ", count: overview.oldAndDamageUnknownAssets, tone: "unknown" },
    ]
    : [
      { label: "พร้อมใช้งาน", count: overview.oldAndAvailableAssets, tone: "available" },
      { label: "ไม่พร้อมใช้งาน", count: overview.oldAndUnavailableAssets, tone: "unavailable" },
      { label: "ไม่ทราบความพร้อม", count: overview.oldAndAvailabilityUnknownAssets, tone: "unknown" },
    ];
  const counts = definitions.map((item) => item.count !== null
    && item.count !== undefined
    && Number.isInteger(Number(item.count))
    && Number(item.count) >= 0
    ? Number(item.count)
    : null);
  if (totalAboveThreshold === null || counts.some((count) => count === null) || counts.reduce((sum, count) => sum + count, 0) !== totalAboveThreshold) {
    target.innerHTML = emptyMarkup("ข้อมูลสถานะของสินทรัพย์อายุเกินเกณฑ์ยังไม่พร้อม", "จำนวนแต่ละสถานะต้องรวมกันเท่ากับสินทรัพย์ที่ทราบอายุและเกินเกณฑ์");
    return;
  }
  if (totalAboveThreshold === 0) {
    target.innerHTML = emptyMarkup("ไม่มีสินทรัพย์อายุเกินเกณฑ์", "ปรับเกณฑ์อายุหรือตัวกรองเพื่อดูข้อมูลสถานะ");
    return;
  }
  const rows = definitions.map((item, index) => {
    const count = counts[index];
    const rate = (count / totalAboveThreshold) * 100;
    return `<div class="aging-condition-item is-${item.tone}"><dt><span aria-hidden="true"></span>${escapeHtml(item.label)}</dt><dd><strong>${formatCount(count)}</strong><span>${formatPercent(rate)}</span></dd></div>`;
  }).join("");
  target.innerHTML = `<p class="aging-condition-denominator">จากสินทรัพย์อายุเกินเกณฑ์ ${formatCount(totalAboveThreshold)} รายการ</p><dl class="aging-condition-list">${rows}</dl>`;
}

function renderAgingDepartmentFocus(row) {
  const target = document.getElementById("aging-department-focus");
  if (!target) return;
  if (!row) {
    target.innerHTML = emptyMarkup("ไม่มีหน่วยงานให้แสดง", "หน่วยงานที่ตรงกับตัวกรองจะแสดงรายละเอียดที่นี่");
    return;
  }
  const qualityRows = [
    { label: "อายุเกินเกณฑ์", value: formatAgingCount(row.assetsOlderThanThreshold) },
    { label: "อัตราอายุเกินเกณฑ์ · จากอายุที่ทราบ", value: formatPercent(row.oldAssetRate) },
    { label: "อายุเฉลี่ย", value: formatAgingYears(row.averageAssetAge) },
    { label: "ไม่ทราบอายุ", value: formatAgingCount(row.unknownAgeAssets) },
    { label: "พร้อมใช้งานและอายุเกินเกณฑ์", value: formatAgingCount(row.oldAndAvailableAssets) },
    { label: "ชำรุดและอายุเกินเกณฑ์", value: formatAgingCount(row.oldAndDamagedAssets) },
  ].map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${item.value}</dd></div>`).join("");
  const explorerAction = drillButton("เปิดสินทรัพย์ทั้งหมดของหน่วยงานใน Asset Explorer", "department", row.filterValue);
  target.innerHTML = `<div class="aging-focus-identity"><h3>${escapeHtml(row.label || "ไม่ระบุหน่วยงาน")}</h3><p><strong>${formatAgingCount(row.totalAssets)}</strong><span>สินทรัพย์ทั้งหมด</span></p></div>
    <dl class="aging-focus-metrics">${qualityRows}</dl>
    <div class="aging-focus-action">${explorerAction}</div>`;
}

function renderAgingDetailMatrix(payload) {
  const target = document.getElementById("aging-detail-matrix");
  if (!target) return;
  document.querySelectorAll("[data-aging-detail-dimension]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.agingDetailDimension === agingDetailDimension));
  });
  const dimension = AGING_DIMENSIONS.includes(agingDetailDimension) ? agingDetailDimension : "department";
  agingDetailDimension = dimension;
  const source = getAgingDimensionData(payload, dimension);
  const matrix = buildDetailedAgeMatrixRows(source.entities, source.ageGroups);
  if (!matrix.available) {
    target.innerHTML = emptyMarkup("ไม่สามารถแสดงตารางช่วงอายุได้", "ผลรวมช่วงอายุของบางกลุ่มไม่ตรงกับจำนวนสินทรัพย์ จึงไม่แสดงข้อมูลบางส่วน");
    return;
  }
  if (matrix.rows.length === 0) {
    target.innerHTML = emptyMarkup(`ไม่พบข้อมูล${source.label}`, "ไม่มีข้อมูลที่ตรงกับตัวกรองปัจจุบัน");
    return;
  }
  const state = agingDetailStates[dimension];
  const page = paginateAgingRows(matrix.rows, state);
  agingDetailStates = { ...agingDetailStates, [dimension]: { ...state, page: page.page } };
  const header = (key, label) => renderAgingSortHeader(key, label, state, "data-aging-detail-sort", dimension);
  const body = page.rows.map((row) => {
    const cells = AGING_BAND_KEYS.map((band) => {
      const count = row.complete ? row.counts[band] : null;
      const share = row.complete ? row.shares[band] : null;
      const heat = share === null ? 0 : Math.max(0, Math.min(18, share * 0.18));
      const description = share === null
        ? `${row.label} · ${AGE_LABELS[band]} · ไม่มีสัดส่วนให้คำนวณ`
        : `${row.label} · ${AGE_LABELS[band]} · ${formatCount(count)} รายการ · ${formatPercent(share)} ของกลุ่ม`;
      return `<td><span class="aging-matrix-heat${count === 0 ? " is-zero" : ""}${share === null ? " is-unavailable" : ""}"${heat > 0 ? ` style="--aging-matrix-heat:${heat.toFixed(2)}%"` : ""} title="${escapeHtml(description)}" aria-label="${escapeHtml(description)}"><strong>${formatAgingCount(count)}</strong><small>${formatPercent(share)}</small></span></td>`;
    }).join("");
    return `<tr><th scope="row">${drillButton(row.label, source.filterKey, row.filterValue)}</th><td class="aging-number">${formatAgingCount(row.totalAssets)}</td>${cells}</tr>`;
  }).join("");
  target.innerHTML = `<div class="aging-data-table-scroll aging-detail-matrix-scroll" role="region" tabindex="0" aria-label="ตารางการกระจายตามช่วงอายุ แยกตาม${source.label}">
    <table class="dashboard-data-table aging-detail-matrix-table" aria-describedby="aging-detail-guide">
      <caption class="sr-only">จำนวนสินทรัพย์และสัดส่วนตามช่วงอายุแยกตาม${source.label}</caption>
      <thead><tr>${header("label", "ชื่อกลุ่ม")}${header("totalAssets", "สินทรัพย์ทั้งหมด")}${AGING_BAND_KEYS.map((band) => header(`band:${band}`, AGE_LABELS[band])).join("")}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>${renderAgingPagination(page, "detail", dimension, source.label)}`;
}

function renderAging(data, payload) {
  const aging = data || {};
  const departmentRows = buildAgingExposureRows(payload?.departments?.rows);
  const selectedKeyExists = departmentRows.some((row) => row.key === selectedAgingDepartmentKey);
  const defaultDepartment = paginateAgingRows(departmentRows, agingExposureStates.department).sortedRows[0];
  const selectedDepartment = resolveAgingDepartmentFocus(
    departmentRows,
    selectedKeyExists ? selectedAgingDepartmentKey : defaultDepartment?.key,
  );
  selectedAgingDepartmentKey = selectedDepartment?.key ?? null;
  renderReplacementLens(payload?.overview, aging.ageDistribution);
  renderAgingExposure(payload, departmentRows);
  renderAgingCondition(payload);
  renderAgingDepartmentFocus(selectedDepartment);
  renderAgingDetailMatrix({ ...payload, aging });
}

function renderAcquisitionPagination(page, scope, label) {
  if (page.totalRows === 0 || (page.totalRows <= 5 && page.pageSize === 5)) return "";
  const start = page.pageSize === "all" ? 1 : ((page.page - 1) * page.pageSize) + 1;
  const end = page.pageSize === "all" ? page.totalRows : Math.min(page.totalRows, page.page * page.pageSize);
  const disabled = (action) => action === "first" || action === "previous"
    ? page.page <= 1
    : page.page >= page.totalPages;
  const button = (action, text, ariaLabel) => `<button class="button button-secondary acquisition-page-button" type="button" data-acquisition-page="${escapeHtml(scope)}" data-acquisition-page-action="${action}" aria-label="${ariaLabel}"${disabled(action) ? " disabled" : ""}>${text}</button>`;
  return `<nav class="acquisition-pagination" aria-label="แบ่งหน้ารายการ${escapeHtml(label)}">
    <p class="acquisition-page-range" role="status" aria-live="polite">แสดง ${formatCount(start)}–${formatCount(end)} จาก ${formatCount(page.totalRows)} รายการ</p>
    <label class="acquisition-page-size">รายการต่อหน้า <select data-acquisition-page-size="${escapeHtml(scope)}" aria-label="จำนวน${escapeHtml(label)}ต่อหน้า">
      ${ACQUISITION_PAGE_SIZES.map((size) => `<option value="${size}"${page.pageSize === size ? " selected" : ""}>${size === "all" ? "ทั้งหมด" : size}</option>`).join("")}
    </select></label>
    <div class="acquisition-page-navigation">
      ${button("first", "«", `หน้าแรกของ${label}`)}
      ${button("previous", "‹", `หน้าก่อนหน้าของ${label}`)}
      <span class="acquisition-page-indicator" aria-current="page">หน้า ${formatCount(page.page)} จาก ${formatCount(page.totalPages)}</span>
      ${button("next", "›", `หน้าถัดไปของ${label}`)}
      ${button("last", "»", `หน้าสุดท้ายของ${label}`)}
    </div>
  </nav>`;
}

function renderAcquisitionSortHeader(key, label, state, attribute, scope = "") {
  const active = state.sortKey === key;
  const direction = active ? state.direction : "desc";
  const sortText = active ? (direction === "asc" ? "น้อยไปมาก" : "มากไปน้อย") : "มากไปน้อย";
  const attributes = `${attribute}="${escapeHtml(key)}"${scope ? ` data-acquisition-table="${escapeHtml(scope)}"` : ""}`;
  return `<th scope="col" aria-sort="${active ? (direction === "asc" ? "ascending" : "descending") : "none"}"><button class="acquisition-sort-button" type="button" ${attributes} aria-label="เรียง${escapeHtml(label)}จาก${sortText}">${escapeHtml(label)}<span aria-hidden="true">${active ? (direction === "asc" ? " ↑" : " ↓") : ""}</span></button></th>`;
}

function renderAcquisitionOverview(data) {
  const summary = buildAcquisitionOverview(data, latestPayload?.overview?.totalAssets, latestPayload?.overview);
  const coverage = summary.yearCoverage
    ? `${escapeHtml(summary.yearCoverage.earliest)}–${escapeHtml(summary.yearCoverage.latest)}`
    : "—";
  const coverageDetail = summary.yearCoverage
    ? `พบข้อมูล ${formatCount(summary.yearCoverage.distinctYears)} ปีจัดหา`
    : "ไม่มีปีจัดหาที่ระบุได้";
  const dominant = summary.dominantSource;
  const aging = summary.aging;
  setHtml("acquisition-overview", `<dl class="acquisition-overview-metrics">
    <div class="acquisition-overview-metric is-primary"><dt>สินทรัพย์ทั้งหมด</dt><dd>${summary.totalAssets === null ? "—" : formatCount(summary.totalAssets)}</dd><small>ตาม snapshot และตัวกรองปัจจุบัน</small></div>
    <div class="acquisition-overview-metric"><dt>ช่วงปีจัดหา (ค.ศ.)</dt><dd>${coverage}</dd><small>${coverageDetail}</small></div>
    <div class="acquisition-overview-metric"><dt>แหล่งเงินที่มีจำนวนสินทรัพย์สูงสุด</dt><dd>${dominant ? escapeHtml(dominant.label) : "—"}</dd><small>${dominant ? `${formatCount(dominant.totalAssets)} รายการ · ${formatPercent(dominant.assetShareRate)} ของสินทรัพย์` : "ไม่มีข้อมูลแหล่งเงิน"}</small></div>
    <div class="acquisition-overview-metric"><dt>อายุเกิน ${formatCount(filters.ageThreshold)} ปี</dt><dd>${aging.assetsOlderThanThreshold === null ? "—" : formatCount(aging.assetsOlderThanThreshold)}</dd><small>${formatPercent(aging.oldAssetRate)} ของรายการที่ทราบอายุ</small></div>
  </dl>`);
}

function renderAcquisitionHeatmap(heatmap) {
  const target = document.getElementById("acquisition-heatmap");
  if (!target) return;
  if (!heatmap.available) {
    target.innerHTML = emptyMarkup("ข้อมูลแผนผังรุ่นสินทรัพย์ยังไม่พร้อม", "ข้อมูลปีจัดหาหรือแหล่งเงินไม่ครบสำหรับการเปรียบเทียบ");
    return;
  }
  if (heatmap.rows.length === 0 || heatmap.sources.length === 0) {
    target.innerHTML = emptyMarkup("ไม่พบข้อมูลรุ่นสินทรัพย์", "ลองปรับตัวกรองหรือเลือก snapshot อื่น");
    return;
  }
  const page = paginateAcquisitionHeatmapRows(heatmap.rows, acquisitionHeatmapState);
  acquisitionHeatmapState = { ...acquisitionHeatmapState, page: page.page };
  const header = heatmap.sources.map((source) => `<th scope="col">${escapeHtml(source.label)}</th>`).join("");
  const body = page.rows.map((cohort) => {
    const rowSelected = cohort.key === acquisitionSelectedCohortKey;
    const cohortLabel = `${ACQUISITION_DIMENSION_LABELS[acquisitionYearDimension]} ${cohort.label}`;
    const cohortButton = `<button class="acquisition-cohort-select" type="button" data-acquisition-cohort="${escapeHtml(cohort.key)}" aria-pressed="${rowSelected && acquisitionSelectedSourceKey === null}" aria-label="เลือก${escapeHtml(cohortLabel)} รวมทุกแหล่งเงิน">${escapeHtml(cohort.label)}</button>`;
    const cells = cohort.cells.map((cell) => {
      const selected = rowSelected && acquisitionSelectedSourceKey === cell.key;
      const unavailable = cell.count === null;
      const heat = unavailable || heatmap.maxCount <= 0 ? 0 : Math.round((cell.intensity || 0) * 24);
      const aria = `${cohortLabel} · ${cell.label} · ${unavailable ? "ไม่มีข้อมูล" : `จำนวน ${formatCount(cell.count)} รายการ`}`;
      return `<td><button class="acquisition-heat-cell${cell.count === 0 ? " is-zero" : ""}${unavailable ? " is-unavailable" : ""}${selected ? " is-selected" : ""}" type="button" data-acquisition-cell="select" data-acquisition-cohort-key="${escapeHtml(cohort.key)}" data-acquisition-source-key="${escapeHtml(cell.key)}" aria-pressed="${selected}" aria-label="${escapeHtml(aria)}" title="${escapeHtml(aria)}"${heat > 0 ? ` style="--acquisition-heat:${heat}%"` : ""}>${unavailable ? "—" : formatCount(cell.count)}</button></td>`;
    }).join("");
    return `<tr aria-selected="${rowSelected}"><th scope="row">${cohortButton}</th>${cells}</tr>`;
  }).join("");
  target.innerHTML = `<div class="acquisition-heatmap-legend" aria-label="คำอธิบายความเข้มของสี"><span class="acquisition-heatmap-scale" aria-hidden="true"></span><span>สีเข้มขึ้นหมายถึงมีสินทรัพย์จำนวนมากขึ้น</span><span class="acquisition-heatmap-zero">0 = ไม่มีรายการ</span></div>
    <div class="acquisition-heatmap-scroll" role="region" tabindex="0" aria-label="ตารางรุ่นสินทรัพย์แยกตาม${ACQUISITION_DIMENSION_LABELS[acquisitionYearDimension]}และแหล่งเงิน">
      <table class="dashboard-data-table acquisition-heatmap-table" aria-describedby="acquisition-heatmap-guide"><caption class="sr-only">จำนวนสินทรัพย์ตาม${ACQUISITION_DIMENSION_LABELS[acquisitionYearDimension]}และแหล่งเงิน</caption><thead><tr><th scope="col">${ACQUISITION_DIMENSION_LABELS[acquisitionYearDimension]}</th>${header}</tr></thead><tbody>${body}</tbody></table>
    </div>${renderAcquisitionPagination(page, "heatmap", "รุ่นสินทรัพย์")}`;
}

function renderAcquisitionFocus(focus) {
  if (!focus) {
    setHtml("acquisition-cohort-focus", emptyMarkup("ยังไม่มีรุ่นสินทรัพย์ให้เลือก", "ข้อมูลปีจัดหาจะปรากฏเมื่อมีรายการที่ตรงกับตัวกรอง"));
    return;
  }
  const cohortName = `${ACQUISITION_DIMENSION_LABELS[focus.dimension]}${focus.dimension === "year" ? " (ค.ศ.)" : " (พ.ศ.)"} ${focus.cohortLabel}`;
  const sourceName = focus.sourceLabel ? `แหล่งเงิน: ${focus.sourceLabel}` : "ทุกแหล่งเงิน";
  const selectionLabel = focus.selectionType === "funding" ? "รุ่นย่อยตามแหล่งเงิน" : "รุ่นสินทรัพย์ทั้งหมด";
  const threshold = formatCount(filters.ageThreshold);
  const drill = drillButton("ดูสินทรัพย์ที่ตรงกับรุ่นนี้", buildAcquisitionCohortDrillFilters(focus));
  const funding = focus.fundingComposition.length === 0
    ? emptyMarkup("ไม่มีองค์ประกอบแหล่งเงิน", "ไม่พบจำนวนที่ใช้แจกแจง")
    : `<ul class="acquisition-funding-list">${focus.fundingComposition.map((item) => `<li${item.selected ? " class=\"is-selected\"" : ""}><span>${escapeHtml(item.label)}</span><strong>${item.totalAssets === null ? "—" : formatCount(item.totalAssets)}</strong><small>${formatPercent(item.shareWithinCohortRate)}</small></li>`).join("")}</ul>`;
  setHtml("acquisition-cohort-focus", `<div class="acquisition-focus-identity"><h3>${escapeHtml(cohortName)}</h3><p>${escapeHtml(sourceName)} · ${selectionLabel}</p></div>
    <dl class="acquisition-focus-metrics">
      <div class="is-primary"><dt>สินทรัพย์ในรุ่นที่เลือก</dt><dd>${focus.totalAssets === null ? "—" : formatCount(focus.totalAssets)}</dd><small>สัดส่วนของสินทรัพย์ตามตัวกรอง ${formatPercent(focus.portfolioShareRate)}</small></div>
      ${focus.selectionType === "funding" ? `<div><dt>สัดส่วนในรุ่นทั้งหมด</dt><dd>${formatPercent(focus.fundingShareRate)}</dd><small>แหล่งเงิน ${escapeHtml(focus.sourceLabel)}</small></div>` : ""}
      <div><dt>อายุเฉลี่ย</dt><dd>${focus.averageAssetAge === null ? "—" : `${Number(focus.averageAssetAge).toFixed(1)} ปี`}</dd></div>
      <div><dt>อายุเกิน ${threshold} ปี</dt><dd>${focus.assetsOlderThanThreshold === null ? "—" : formatCount(focus.assetsOlderThanThreshold)}</dd><small>อัตราในกลุ่มที่ทราบอายุ ${formatPercent(focus.oldAssetRate)}</small></div>
      <div><dt>ไม่ทราบอายุ</dt><dd>${focus.unknownAgeAssets === null ? "—" : formatCount(focus.unknownAgeAssets)}</dd></div>
    </dl>
    <div class="acquisition-focus-funding"><h3>องค์ประกอบแหล่งเงินในรุ่น</h3>${funding}</div>
    <div class="acquisition-focus-action">${drill}</div>`);
}

function renderAcquisitionBreakdown(data, focus) {
  const target = document.getElementById("acquisition-cohort-breakdown");
  if (!target) return;
  const breakdown = buildAcquisitionBreakdown(data, acquisitionBreakdownDimension, focus);
  document.querySelectorAll("[data-acquisition-breakdown-dimension]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.acquisitionBreakdownDimension === acquisitionBreakdownDimension));
  });
  if (!focus) {
    target.innerHTML = emptyMarkup("ยังไม่มีรุ่นที่เลือก", "เลือกปีหรือช่องแหล่งเงินในแผนผัง");
    return;
  }
  if (!breakdown.available) {
    target.innerHTML = emptyMarkup("ข้อมูลแจกแจงยังไม่พร้อม", "ไม่มีข้อมูลครบสำหรับมิตินี้ในรุ่นที่เลือก");
    return;
  }
  if (breakdown.rows.length === 0) {
    target.innerHTML = emptyMarkup("ไม่พบกลุ่มในรุ่นที่เลือก", "ลองเลือกปีหรือแหล่งเงินอื่น");
    return;
  }
  const state = acquisitionBreakdownStates[acquisitionBreakdownDimension];
  const page = paginateAcquisitionRows(breakdown.rows, state);
  acquisitionBreakdownStates = { ...acquisitionBreakdownStates, [acquisitionBreakdownDimension]: { ...state, page: page.page } };
  const headers = [
    ["label", ACQUISITION_BREAKDOWN_LABELS[acquisitionBreakdownDimension]],
    ["totalAssets", "สินทรัพย์"],
    ["shareRate", "สัดส่วนในรุ่น"],
  ];
  const rows = page.rows.map((row) => {
    const drillFilters = buildAcquisitionCohortDrillFilters(focus, acquisitionBreakdownDimension, row);
    return `<tr><th scope="row">${drillButton(row.label, drillFilters)}</th><td class="acquisition-number">${row.totalAssets === null ? "—" : formatCount(row.totalAssets)}</td><td class="acquisition-number">${formatPercent(row.shareRate)}</td></tr>`;
  }).join("");
  target.innerHTML = `<div class="acquisition-table-scroll" role="region" tabindex="0" aria-label="${escapeHtml(ACQUISITION_BREAKDOWN_LABELS[acquisitionBreakdownDimension])}ในรุ่นที่เลือก"><table class="dashboard-data-table acquisition-data-table"><caption class="sr-only">การแจกแจงรุ่นสินทรัพย์ตาม${ACQUISITION_BREAKDOWN_LABELS[acquisitionBreakdownDimension]}</caption><thead><tr>${headers.map(([key, label]) => renderAcquisitionSortHeader(key, label, state, "data-acquisition-breakdown-sort", acquisitionBreakdownDimension)).join("")}</tr></thead><tbody>${rows}</tbody></table></div>${renderAcquisitionPagination(page, `breakdown:${acquisitionBreakdownDimension}`, ACQUISITION_BREAKDOWN_LABELS[acquisitionBreakdownDimension])}`;
}

function renderAcquisitionCrossDetails(data) {
  const target = document.getElementById("acquisition-cross-dimension-details");
  if (!target) return;
  const result = buildAcquisitionCrossDimensionRows(data, acquisitionCrossRelation);
  document.querySelectorAll("[data-acquisition-cross-relation]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.acquisitionCrossRelation === acquisitionCrossRelation));
  });
  if (!result.available || result.rows.length === 0) {
    target.innerHTML = emptyMarkup("ไม่มีข้อมูลความสัมพันธ์นี้", "ไม่พบข้อมูลที่ตรงกับ snapshot และตัวกรองปัจจุบัน");
    return;
  }
  const state = acquisitionCrossStates[acquisitionCrossRelation];
  const page = paginateAcquisitionRows(result.rows, state);
  acquisitionCrossStates = { ...acquisitionCrossStates, [acquisitionCrossRelation]: { ...state, page: page.page } };
  const [firstLabel, secondLabel] = ACQUISITION_RELATION_LABELS[acquisitionCrossRelation];
  const rows = page.rows.map((row) => {
    const filtersForDrill = buildAcquisitionCrossDimensionDrillFilters(acquisitionCrossRelation, row);
    return `<tr><td>${escapeHtml(row.first)}</td><th scope="row">${drillButton(row.second, filtersForDrill)}</th><td class="acquisition-number">${row.totalAssets === null ? "—" : formatCount(row.totalAssets)}</td><td class="acquisition-number">${row.averageAssetAge === null ? "—" : `${Number(row.averageAssetAge).toFixed(1)} ปี`}</td><td class="acquisition-number">${formatPercent(row.oldAssetRate)}</td></tr>`;
  }).join("");
  const headers = [
    ["first", firstLabel], ["second", secondLabel], ["totalAssets", "สินทรัพย์"],
    ["averageAssetAge", "อายุเฉลี่ย"], ["oldAssetRate", `อายุเกิน ${formatCount(filters.ageThreshold)} ปี`],
  ];
  target.innerHTML = `<div class="acquisition-table-scroll" role="region" tabindex="0" aria-label="ตาราง${firstLabel}และ${secondLabel}"><table class="dashboard-data-table acquisition-cross-table"><caption class="sr-only">${firstLabel}แยกตาม${secondLabel}</caption><thead><tr>${headers.map(([key, label]) => renderAcquisitionSortHeader(key, label, state, "data-acquisition-cross-sort", acquisitionCrossRelation)).join("")}</tr></thead><tbody>${rows}</tbody></table></div>${renderAcquisitionPagination(page, `cross:${acquisitionCrossRelation}`, `${firstLabel}และ${secondLabel}`)}`;
}

function renderAcquisition(data) {
  const acquisition = data || {};
  if (!ACQUISITION_DIMENSIONS.includes(acquisitionYearDimension)) acquisitionYearDimension = "year";
  renderAcquisitionOverview(acquisition);
  document.querySelectorAll("[data-acquisition-year-dimension]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.acquisitionYearDimension === acquisitionYearDimension));
  });
  const heatmap = buildAcquisitionHeatmap(acquisition, acquisitionYearDimension);
  const requestedCohort = heatmap.rows.find((row) => row.key === acquisitionSelectedCohortKey) ?? null;
  const selectedCohort = requestedCohort ?? heatmap.rows[0] ?? null;
  if (requestedCohort === null) acquisitionSelectedSourceKey = null;
  acquisitionSelectedCohortKey = selectedCohort?.key ?? null;
  if (acquisitionSelectedSourceKey !== null && !heatmap.sources.some((row) => String(row.key ?? row.filterValue ?? "") === acquisitionSelectedSourceKey)) {
    acquisitionSelectedSourceKey = null;
  }
  const focus = selectedCohort
    ? buildAcquisitionFocus(
      acquisition,
      latestPayload?.overview?.totalAssets,
      acquisitionYearDimension,
      acquisitionSelectedCohortKey,
      acquisitionSelectedSourceKey,
    )
    : null;
  renderAcquisitionHeatmap(heatmap);
  renderAcquisitionFocus(focus);
  renderAcquisitionBreakdown(acquisition, focus);
  renderAcquisitionCrossDetails(acquisition);
}

function renderGovernanceSortHeader(scope, key, label, state) {
  const active = state.sortKey === key;
  const sort = active ? (state.direction === "asc" ? "ascending" : "descending") : "none";
  const arrow = active ? (state.direction === "asc" ? " ↑" : " ↓") : "";
  return `<th scope="col" aria-sort="${sort}"><button class="table-sort-button" type="button" data-governance-${scope}-sort="${escapeHtml(key)}" aria-label="เรียงตาม${escapeHtml(label)}" aria-pressed="${active}">${escapeHtml(label)}<span aria-hidden="true">${arrow}</span></button></th>`;
}

function renderGovernancePagination(scope, state, totalRows, label) {
  const page = resolveGovernancePage(totalRows, state);
  if (page.totalRows === 0 || (page.totalRows <= 5 && state.pageSize === 5)) return "";
  const isDisabled = (action) => action === "first" || action === "previous"
    ? page.page <= 1
    : page.page >= page.totalPages;
  const button = (action, glyph, ariaLabel) => `<button class="button button-secondary governance-page-button" type="button" data-governance-page="${scope}" data-governance-page-action="${action}" aria-label="${ariaLabel}"${isDisabled(action) ? " disabled" : ""}>${glyph}</button>`;
  return `<nav class="governance-pagination" aria-label="แบ่งหน้ารายการ${escapeHtml(label)}">
    <span class="governance-page-range" role="status" aria-live="polite">แสดง ${formatCount(page.start)}–${formatCount(page.end)} จาก ${formatCount(page.totalRows)} รายการ</span>
    <label class="governance-page-size">รายการต่อหน้า <select data-governance-page-size="${scope}" aria-label="จำนวน${escapeHtml(label)}ต่อหน้า">
      ${GOVERNANCE_PAGE_SIZES.map((size) => `<option value="${size}"${state.pageSize === size ? " selected" : ""}>${size === "all" ? "ทั้งหมด" : size}</option>`).join("")}
    </select></label>
    <div class="governance-page-navigation">${button("first", "«", "หน้าแรก")}${button("previous", "‹", "หน้าก่อนหน้า")}<span aria-current="page">หน้า ${formatCount(page.page)} จาก ${formatCount(page.totalPages)}</span>${button("next", "›", "หน้าถัดไป")}${button("last", "»", "หน้าสุดท้าย")}</div>
  </nav>`;
}

function governanceHeatCell(rate, missingCount, denominator) {
  if (rate === null || rate === undefined || !Number.isFinite(Number(rate))) {
    return `<span class="governance-heat is-unavailable" aria-label="ไม่มีข้อมูลอัตราที่ใช้คำนวณ">—</span>`;
  }
  const numericRate = Math.max(0, Math.min(100, Number(rate)));
  const alpha = (numericRate * 0.22).toFixed(1);
  if (missingCount === null || missingCount === undefined || denominator === null || denominator === undefined
    || !Number.isFinite(Number(missingCount)) || !Number.isFinite(Number(denominator))) {
    return `<span class="governance-heat is-unavailable" aria-label="ไม่มีข้อมูลจำนวนหรือฐานคำนวณ">—</span>`;
  }
  const count = missingCount === null || missingCount === undefined ? null : Number(missingCount);
  const base = denominator === null || denominator === undefined ? null : Number(denominator);
  if (count === 0) {
    return `<span class="governance-heat is-zero" title="ขาดข้อมูล 0 จาก ${formatCount(base)} รายการ"><strong>0.0%</strong><small>0 / ${formatCount(base)}</small></span>`;
  }
  return `<span class="governance-heat" style="--governance-heat:${alpha}%" title="ขาดข้อมูล ${formatCount(count)} จาก ${formatCount(base)} รายการ"><strong>${formatPercent(numericRate)}</strong><small>${formatCount(count)} / ${formatCount(base)}</small></span>`;
}

function renderGovernanceOverview(overview, data) {
  const target = document.getElementById("governance-summary");
  const criticalTarget = document.getElementById("governance-critical-field-list");
  if (!target || !criticalTarget) return;
  const summary = [
    { label: "สินทรัพย์ในชุดข้อมูลที่เลือก", value: overview?.totalAssets },
    { label: "สินทรัพย์ที่ข้อมูลไม่ครบ", value: data?.assetsWithMissingInformation },
    { label: "เข้าเกณฑ์ตรวจสอบเดิม", value: data?.exceptionsTotal },
  ];
  target.innerHTML = summary.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${item.value === null || item.value === undefined ? "—" : formatCount(item.value)}</dd></div>`).join("");
  const criticalFields = Object.entries(data?.qualityFields || {}).filter(([, field]) => field.tier === "essential");
  criticalTarget.innerHTML = criticalFields.length === 0
    ? emptyMarkup("ไม่มีข้อมูลการจัดประเภทฟิลด์สำคัญ", "ระบบยังไม่ได้ส่งฟิลด์ที่จัดประเภทไว้")
    : criticalFields.map(([key, field]) => {
      const assets = field.assets === null || field.assets === undefined ? null : Number(field.assets);
      const missing = field.missingAssets === null || field.missingAssets === undefined ? null : Number(field.missingAssets);
      const hasDenominator = assets !== null && missing !== null && Number.isFinite(assets) && Number.isFinite(missing) && assets > 0;
      const complete = hasDenominator ? assets - missing : null;
      const rate = hasDenominator ? ((assets - missing) / assets) * 100 : null;
      return `<div class="governance-critical-field"><span>${escapeHtml(field.label || GOVERNANCE_FIELD_LABELS[key] || key)}</span><strong>${formatPercent(rate)}</strong><small>${complete === null ? "ไม่มีฐานคำนวณ" : `${formatCount(complete)} / ${formatCount(assets)} ครบถ้วน`}</small></div>`;
    }).join("");
}

function renderGovernanceFieldDetail(row) {
  const target = document.getElementById("governance-field-detail");
  if (!target) return;
  if (!row) {
    target.innerHTML = emptyMarkup("ยังไม่มีฟิลด์ให้ตรวจดู", "เมื่อมีข้อมูล ฟิลด์ที่เลือกจะแสดงรายละเอียดที่นี่");
    return;
  }
  const completeAssets = Number(row.assets || 0) > 0 ? Number(row.assets) - Number(row.missingAssets || 0) : null;
  const completeRate = row.missingRate === null || row.missingRate === undefined ? null : 100 - Number(row.missingRate);
  target.innerHTML = `<div class="governance-detail-heading"><h3>${escapeHtml(row.label || "ไม่ระบุชื่อฟิลด์")}</h3><span>${row.tier === "essential" ? "ข้อมูลสำคัญ" : "ข้อมูลประกอบ"}</span></div>
    <dl class="governance-detail-metrics"><div><dt>ข้อมูลครบ</dt><dd>${completeAssets === null ? "—" : formatCount(completeAssets)}</dd></div><div><dt>อัตราครบถ้วน</dt><dd>${formatPercent(completeRate)}</dd></div><div><dt>ขาดข้อมูล</dt><dd>${formatGovernanceCount(row.missingAssets)}</dd></div><div><dt>อัตราขาด</dt><dd>${formatPercent(row.missingRate)}</dd></div></dl>
    <p>อ้างอิงนิยามค่าว่างจากบริการวิเคราะห์เดิม ไม่มีการเพิ่มตัวกรองสินทรัพย์ที่ทะเบียนไม่รองรับ</p>`;
}

function renderGovernanceFields(data) {
  const target = document.getElementById("governance-quality-fields");
  if (!target) return;
  const rows = Object.entries(data?.qualityFields || {}).map(([key, field]) => ({ ...field, key }));
  const page = paginateGovernanceRows(rows, governanceFieldState, {
    getSortValue: (row, key) => key === "completeRate"
      ? (row.missingRate === null || row.missingRate === undefined ? null : 100 - Number(row.missingRate))
      : row[key],
  });
  governanceFieldState = setGovernancePage(governanceFieldState, page.page, page.totalRows);
  const selected = rows.find((row) => row.key === governanceSelectedFieldKey) || page.rows[0] || null;
  governanceSelectedFieldKey = selected?.key ?? null;
  if (rows.length === 0) {
    target.innerHTML = emptyMarkup("ไม่มีข้อมูลช่องข้อมูล", "ไม่พบข้อมูลความครบถ้วนตามตัวกรองปัจจุบัน");
    renderGovernanceFieldDetail(null);
    return;
  }
  const body = page.rows.map((row) => {
    const isSelected = row.key === governanceSelectedFieldKey;
    return `<tr${isSelected ? ' aria-selected="true" class="is-selected"' : ""}>
      <th scope="row"><button class="governance-row-select" type="button" data-governance-field-select="${escapeHtml(row.key)}" aria-pressed="${isSelected}" aria-controls="governance-field-detail">${escapeHtml(row.label)}</button></th>
      <td>${row.tier === "essential" ? "ข้อมูลสำคัญ" : "ข้อมูลประกอบ"}</td>
      <td class="governance-number">${formatGovernanceCount(row.missingAssets)}</td>
      <td>${governanceHeatCell(row.missingRate, row.missingAssets, row.assets)}</td>
      <td class="governance-number">${formatPercent(row.missingRate === null || row.missingRate === undefined ? null : 100 - Number(row.missingRate))}</td>
    </tr>`;
  }).join("");
  target.innerHTML = `<div class="governance-table-scroll" role="region" tabindex="0" aria-label="ตารางความครบถ้วนของทุกฟิลด์">
    <table class="dashboard-data-table governance-field-table"><caption class="sr-only">จำนวนและอัตราฟิลด์ข้อมูลที่ขาด</caption><thead><tr>
      ${renderGovernanceSortHeader("field", "label", "ช่องข้อมูล", governanceFieldState)}
      ${renderGovernanceSortHeader("field", "tier", "การจัดประเภท", governanceFieldState)}
      ${renderGovernanceSortHeader("field", "missingAssets", "ขาดข้อมูล", governanceFieldState)}
      ${renderGovernanceSortHeader("field", "missingRate", "อัตราขาด", governanceFieldState)}
      ${renderGovernanceSortHeader("field", "completeRate", "อัตราครบถ้วน", governanceFieldState)}
    </tr></thead><tbody>${body}</tbody></table></div>
    ${renderGovernancePagination("field", governanceFieldState, page.totalRows, "ช่องข้อมูล")}`;
  renderGovernanceFieldDetail(selected);
}

function getGovernanceDepartmentKey(row) {
  return String(row?.departmentKey ?? row?.departmentFilterValue ?? row?.department ?? "");
}

function governanceDepartmentSortValue(row, key) {
  if (key === "department") return row.department;
  if (key === "totalAssets") return row.totalAssets;
  if (key === "missingCriticalRate") return row.missingCriticalRate;
  if (key.startsWith("field:")) return row.missingByField?.[key.slice(6)]?.rate;
  return null;
}

function renderGovernanceDepartmentDetail(row) {
  const target = document.getElementById("governance-department-detail");
  if (!target) return;
  if (!row) {
    target.innerHTML = emptyMarkup("ไม่มีหน่วยงานตามตัวกรอง", "ปรับตัวกรองเพื่อดูรายละเอียดคุณภาพข้อมูล");
    return;
  }
  const detailKeys = ["assetCode", "assetName", "department", "location", "building", "floor", "room"];
  const detailMetrics = detailKeys.map((key) => {
    const metric = row.missingByField?.[key];
    return `<div><dt>${escapeHtml(GOVERNANCE_FIELD_LABELS[key])}</dt><dd>${metric ? `${formatPercent(metric.rate)} <small>${formatGovernanceCount(metric.assets)} / ${formatGovernanceCount(row.totalAssets)}</small>` : "—"}</dd></div>`;
  }).join("");
  target.innerHTML = `<div class="governance-detail-heading"><h3>${escapeHtml(row.department || "ไม่ระบุหน่วยงาน")}</h3><span>${formatGovernanceCount(row.totalAssets)} สินทรัพย์</span></div>
    <p class="governance-department-critical">ข้อมูลสำคัญขาด ${formatGovernanceCount(row.missingCriticalMetadata)} รายการ · ${formatPercent(row.missingCriticalRate)}</p>
    <dl class="governance-department-metrics">${detailMetrics}</dl>`;
}

function renderGovernanceDepartments(data) {
  const target = document.getElementById("governance-quality-departments");
  if (!target) return;
  const rows = Array.isArray(data?.qualityByDepartment) ? data.qualityByDepartment : [];
  const page = paginateGovernanceRows(rows, governanceDepartmentState, {
    getSortValue: governanceDepartmentSortValue,
  });
  governanceDepartmentState = setGovernancePage(governanceDepartmentState, page.page, page.totalRows);
  const selected = rows.find((row) => getGovernanceDepartmentKey(row) === governanceSelectedDepartmentKey) || page.rows[0] || null;
  governanceSelectedDepartmentKey = selected ? getGovernanceDepartmentKey(selected) : null;
  if (rows.length === 0) {
    target.innerHTML = emptyMarkup("ไม่พบข้อมูลหน่วยงาน", "ไม่พบข้อมูลคุณภาพตามตัวกรองและ snapshot ที่เลือก");
    renderGovernanceDepartmentDetail(null);
    return;
  }
  const body = page.rows.map((row) => {
    const key = getGovernanceDepartmentKey(row);
    const isSelected = key === governanceSelectedDepartmentKey;
    const fieldCells = Object.keys(GOVERNANCE_FIELD_LABELS).map((field) => {
      const metric = row.missingByField?.[field];
      return `<td>${metric ? governanceHeatCell(metric.rate, metric.assets, row.totalAssets) : `<span class="governance-heat is-unavailable" aria-label="ไม่มีข้อมูล">—</span>`}</td>`;
    }).join("");
    return `<tr data-governance-department-row aria-selected="${isSelected}"${isSelected ? ' class="is-selected"' : ""}>
      <th scope="row"><button class="governance-row-select" type="button" data-governance-department-select="${escapeHtml(key)}" aria-pressed="${isSelected}" aria-controls="governance-department-detail">${escapeHtml(row.department || "ไม่ระบุหน่วยงาน")}</button></th>
      <td class="governance-number">${formatGovernanceCount(row.totalAssets)}</td>
      <td>${governanceHeatCell(row.missingCriticalRate, row.missingCriticalMetadata, row.totalAssets)}</td>${fieldCells}
    </tr>`;
  }).join("");
  const fieldHeaders = Object.entries(GOVERNANCE_FIELD_LABELS).map(([field, label]) => renderGovernanceSortHeader("department", `field:${field}`, `ขาด: ${label}`, governanceDepartmentState)).join("");
  target.innerHTML = `<p class="governance-heatmap-guide">อัตราขาดแสดงจำนวน / ฐานคำนวณ · สีแสดงสัดส่วนข้อมูลที่ขาด ไม่ใช่คะแนนความเสี่ยง</p>
    <div class="governance-table-scroll governance-department-scroll" role="region" tabindex="0" aria-label="ตารางคุณภาพข้อมูลตามหน่วยงาน เลื่อนแนวนอนเพื่อดูทุกฟิลด์">
      <table class="dashboard-data-table governance-department-table"><caption class="sr-only">อัตราและจำนวนข้อมูลที่ขาดแยกตามหน่วยงาน</caption><thead><tr>
        ${renderGovernanceSortHeader("department", "department", "หน่วยงาน", governanceDepartmentState)}
        ${renderGovernanceSortHeader("department", "totalAssets", "สินทรัพย์", governanceDepartmentState)}
        ${renderGovernanceSortHeader("department", "missingCriticalRate", "ข้อมูลสำคัญขาด", governanceDepartmentState)}
        ${fieldHeaders}
      </tr></thead><tbody>${body}</tbody></table></div>
    ${renderGovernancePagination("department", governanceDepartmentState, page.totalRows, "หน่วยงาน")}`;
  renderGovernanceDepartmentDetail(selected);
}

function governanceExceptionRequestKey(contextKey, page) {
  return JSON.stringify({ contextKey, page: page.page, pageSize: page.pageSize });
}

function renderGovernanceExceptionTable(rows, page) {
  const target = document.getElementById("governance-exceptions");
  if (!target) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    target.innerHTML = emptyMarkup("ไม่มีสินทรัพย์ที่เข้าเกณฑ์ตรวจสอบ", "ไม่พบรายการตามกฎเดิมและตัวกรองที่เลือก");
    return;
  }
  const body = rows.map((row) => {
    const reasons = Array.isArray(row.attentionReasons) && row.attentionReasons.length > 0
      ? row.attentionReasons
      : (row.attentionReason ? String(row.attentionReason).split(" · ") : []);
    const priorityTone = row.priority === "สูง" ? "high" : row.priority === "ควรตรวจสอบ" ? "medium" : "low";
    const assetHref = row.assetId ? `#/inventory/asset/${encodeURIComponent(String(row.assetId))}` : null;
    const status = displayValue(row.status);
    return `<tr>
      <td><span class="priority-chip priority-${priorityTone}">${escapeHtml(displayValue(row.priority))}</span></td>
      <th scope="row"><div class="governance-review-asset"><strong>${escapeHtml(displayValue(row.assetCode))}</strong><span>${escapeHtml(displayValue(row.assetName))}</span></div></th>
      <td>${escapeHtml(displayValue(row.department))}</td>
      <td>${row.age === null || row.age === undefined ? "ไม่ทราบอายุ" : `${formatCount(row.age)} ปี`}</td>
      <td>${escapeHtml(status)}</td>
      <td>${escapeHtml(reasons[0] || "ไม่ระบุเหตุผล")}${reasons.length > 1 ? `<small class="governance-reason-count">อีก ${formatCount(reasons.length - 1)} เหตุผล</small>` : ""}</td>
      <td><details class="governance-review-details"><summary>รายละเอียด</summary><div class="governance-review-detail-content">
        <ul>${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
        <dl><div><dt>หมวดหมู่</dt><dd>${escapeHtml(displayValue(row.category))}</dd></div><div><dt>ประเภท</dt><dd>${escapeHtml(displayValue(row.type))}</dd></div><div><dt>ความพร้อม</dt><dd>${escapeHtml(displayValue(row.availability))}</dd></div><div><dt>สภาพ</dt><dd>${escapeHtml(displayValue(row.damaged))}</dd></div><div><dt>สถานที่</dt><dd>${escapeHtml(displayValue(row.location))}</dd></div></dl>
        ${assetHref ? `<a class="dashboard-drill-button" href="${assetHref}" aria-label="เปิดรายละเอียดสินทรัพย์ ${escapeHtml(displayValue(row.assetCode))}">เปิดรายละเอียดสินทรัพย์</a>` : `<span class="governance-no-asset-link">ไม่มีรหัสสำหรับเปิดรายละเอียดสินทรัพย์</span>`}
      </div></details></td>
    </tr>`;
  }).join("");
  target.innerHTML = `<div class="governance-table-scroll" role="region" tabindex="0" aria-label="รายการสินทรัพย์ที่ควรตรวจสอบ">
    <table class="dashboard-data-table governance-exception-table"><caption class="sr-only">รายการสินทรัพย์ตามลำดับความสำคัญและเหตุผลตรวจสอบเดิม</caption><thead><tr><th scope="col">ลำดับ</th><th scope="col">สินทรัพย์</th><th scope="col">หน่วยงาน</th><th scope="col">อายุ</th><th scope="col">สถานะ</th><th scope="col">เหตุผล</th><th scope="col">รายละเอียด</th></tr></thead><tbody>${body}</tbody></table></div>
    ${renderGovernancePagination("exceptions", governanceExceptionsState, page.totalRows, "สินทรัพย์ที่ควรตรวจสอบ")}`;
}

function restoreGovernanceExceptionFocus() {
  if (!governancePendingFocusSelector) return;
  const selector = governancePendingFocusSelector;
  governancePendingFocusSelector = null;
  document.querySelector(selector)?.focus();
}

function renderGovernanceExceptions(data) {
  const summary = document.getElementById("governance-exception-summary");
  if (summary) {
    const count = data?.exceptionsTotal;
    summary.textContent = count === null || count === undefined
      ? "ไม่สามารถยืนยันจำนวนรายการที่เข้าเกณฑ์ได้"
      : `${formatCount(count)} สินทรัพย์เข้าเกณฑ์ตรวจสอบเดิม · เรียงตามลำดับความสำคัญที่มีอยู่`;
  }
  const page = resolveGovernancePage(data?.exceptionsTotal ?? 0, governanceExceptionsState);
  governanceExceptionsState = setGovernancePage(governanceExceptionsState, page.page, page.totalRows);
  if (page.totalRows === 0) {
    renderGovernanceExceptionTable([], page);
    restoreGovernanceExceptionFocus();
    return;
  }
  const contextKey = governanceRequestContext(filters, latestPayload?.snapshot?.snapshotId ?? null);
  const requestKey = governanceExceptionRequestKey(contextKey, page);
  const useInitialPage = page.page === 1 && page.pageSize === 5;
  if (useInitialPage) {
    renderGovernanceExceptionTable((data?.exceptions || []).slice(0, 5), page);
    restoreGovernanceExceptionFocus();
    return;
  }

  const view = governanceExceptionView;
  if (view.requestKey === requestKey && view.status === "ready") {
    renderGovernanceExceptionTable(view.rows, view.page);
    restoreGovernanceExceptionFocus();
    return;
  }
  const target = document.getElementById("governance-exceptions");
  if (!target) return;
  if (view.requestKey === requestKey && view.status === "error") {
    target.innerHTML = `<div class="governance-inline-error" role="alert"><p>${escapeHtml(view.error || "ไม่สามารถโหลดรายการนี้ได้")}</p><button class="button button-secondary" type="button" data-governance-exceptions-retry>ลองอีกครั้ง</button></div>`;
    restoreGovernanceExceptionFocus();
    return;
  }
  target.innerHTML = `<p class="governance-inline-loading" role="status" aria-live="polite">กำลังโหลดรายการตรวจสอบหน้า ${formatCount(page.page)}…</p>`;
  if (!(view.requestKey === requestKey && view.status === "loading")) {
    void loadGovernanceExceptionsPage(data, contextKey, page, requestKey);
  }
}

async function loadGovernanceExceptionsPage(governance, contextKey, page, requestKey) {
  governanceExceptionController?.abort();
  const controller = new AbortController();
  governanceExceptionController = controller;
  const id = ++governanceExceptionRequestId;
  governanceExceptionView = { contextKey, requestKey, status: "loading", rows: [], page: null, error: "" };
  renderGovernanceExceptions(governance);
  try {
    const url = buildGovernanceExceptionsUrl(DASHBOARD_API, filters, page);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok || result?.success !== true || result?.data?.visualPage !== "governanceExceptions") {
      throw new Error(result?.message || `โหลดรายการไม่สำเร็จ (HTTP ${response.status})`);
    }
    const data = result.data;
    const currentContext = governanceRequestContext(filters, latestPayload?.snapshot?.snapshotId ?? null);
    const responseContext = governanceRequestContext(data.selectedFilters, data.snapshotId ?? null);
    if (id !== governanceExceptionRequestId || contextKey !== currentContext || contextKey !== responseContext) return;
    if (!Array.isArray(data.rows) || !Number.isInteger(data.totalRows) || !Number.isInteger(data.totalPages)) {
      throw new Error("รายการที่ได้รับมีรูปแบบไม่ถูกต้อง");
    }
    governanceExceptionsState = {
      ...governanceExceptionsState,
      page: Number(data.page) || 1,
      pageSize: data.pageSize,
    };
    governanceExceptionView = {
      contextKey,
      requestKey: governanceExceptionRequestKey(contextKey, resolveGovernancePage(data.totalRows, governanceExceptionsState)),
      status: "ready",
      rows: data.rows,
      page: {
        totalRows: data.totalRows,
        totalPages: data.totalPages,
        page: data.page,
        pageSize: data.pageSize,
        start: data.start,
        end: data.end,
      },
      error: "",
    };
    renderGovernanceExceptions(governance);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (id !== governanceExceptionRequestId || contextKey !== governanceRequestContext(filters, latestPayload?.snapshot?.snapshotId ?? null)) return;
    governanceExceptionView = {
      contextKey,
      requestKey,
      status: "error",
      rows: [],
      page: null,
      error: error instanceof Error ? error.message : "ไม่สามารถโหลดรายการที่ควรตรวจสอบได้",
    };
    renderGovernanceExceptions(governance);
  } finally {
    if (id === governanceExceptionRequestId) governanceExceptionController = null;
  }
}

function renderGovernance(data) {
  renderGovernanceOverview(latestPayload?.overview, data);
  renderGovernanceFields(data);
  renderGovernanceDepartments(data);
  renderGovernanceExceptions(data);
}

function renderDashboard(payload) {
  latestPayload = payload;
  renderOverview(payload.overview, payload);
  renderPortfolio(payload.portfolio);
  renderDepartments(payload.departments);
  renderLocations(payload.locations);
  renderAging(payload.aging, payload);
  renderAcquisition(payload.acquisition);
  renderGovernance(payload.governance);
}

function setRequestState(kind, message = "") {
  document.querySelectorAll("[data-dashboard-request-state]").forEach((state) => {
    const detail = state.querySelector("[data-dashboard-request-message]");
    const retry = state.querySelector("[data-dashboard-retry]");
    if (!detail) return;
    state.hidden = kind === "ready";
    state.className = `api-state dashboard-request-state api-state-${kind === "empty" ? "empty" : kind}`;
    state.setAttribute("role", kind === "error" ? "alert" : "status");
    detail.textContent = message;
    if (retry) retry.hidden = kind !== "error";
    state.dataset.state = kind;
  });
}

function updateSnapshotLabel(payload) {
  const date = document.getElementById("dashboard-snapshot-date");
  const state = document.getElementById("dashboard-data-state");
  const detail = document.getElementById("dashboard-data-detail");
  const latestUniversitySnapshot = payload.snapshotOptions?.find((snapshot) => snapshot.sourceSystem === "university_api");
  const lastImport = document.querySelector("[data-snapshot-last-import]");
  if (lastImport) {
    const importedAt = latestUniversitySnapshot?.importedAt;
    const sourceTime = String(importedAt || "").replace(" ", "T");
    const timestamp = sourceTime
      ? new Date(`${sourceTime}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(sourceTime) ? "" : "Z"}`)
      : null;
    const formatted = timestamp && !Number.isNaN(timestamp.valueOf())
      ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(timestamp)
      : "—";
    lastImport.textContent = `นำเข้าจาก University Asset API ล่าสุด: ${formatted}`;
  }
  if (!payload.snapshot) {
    if (date) date.textContent = "—";
    if (state) state.textContent = "ไม่พบข้อมูลสินทรัพย์";
    if (detail) detail.textContent = "คลังไม่มีชุดข้อมูลสำหรับตัวกรองที่เลือก";
    return;
  }
  const snapshotDate = formatDate(payload.snapshot.date);
  if (date) date.textContent = payload.snapshot.label || snapshotDate;
  if (state) state.textContent = "ข้อมูลเชื่อมต่อจากคลัง MySQL";
  if (detail) detail.textContent = `${snapshotDate} · สรุปจำนวนสินทรัพย์ด้วย SUM(asset_count)`;
}

function updateSelect(select, values, selected, allLabel, mapValue = (value) => [value, value]) {
  if (!select) return;
  const options = [["all", allLabel], ...values.map(mapValue)];
  if (selected !== "all" && selected !== "latest" && !options.some(([value]) => String(value) === String(selected))) {
    options.push(selected === "__missing__" ? mapValue(selected) : [selected, selected]);
  }
  select.innerHTML = options.map(([value, label]) =>
    `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`,
  ).join("");
  select.value = selected;
}

function populateFilterOptions(payload) {
  const options = payload.filterOptions || {};
  const latestSnapshot = payload.snapshotOptions?.find((snapshot) => snapshot.sourceSystem === "university_api")
    || payload.snapshotOptions?.[0];
  const snapshotOptions = [
    ["latest", `ชุดข้อมูลล่าสุด${latestSnapshot ? ` · ${latestSnapshot.label} · ${formatDate(latestSnapshot.date)}` : ""}`],
    ...(payload.snapshotOptions || []).map((snapshot) => [String(snapshot.key), `${snapshot.label} · ${formatDate(snapshot.date)}`]),
  ];
  document.querySelectorAll('[data-dashboard-filter="snapshot"]').forEach((snapshotSelect) => {
    snapshotSelect.innerHTML = snapshotOptions.map(([value, label]) =>
      `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`,
    ).join("");
    snapshotSelect.value = String(filters.snapshot);
  });
  const selectOptions = [
    ["department", options.departments, FILTER_LABELS.department, "ไม่ระบุหน่วยงาน"],
    ["category", options.categories, FILTER_LABELS.category, "ไม่ระบุหมวดหมู่"],
    ["type", options.types, FILTER_LABELS.type, "ไม่ระบุประเภท"],
    ["building", options.buildings, FILTER_LABELS.building, "ไม่ระบุอาคาร"],
    ["floor", options.floors, FILTER_LABELS.floor, "ไม่ระบุชั้น"],
    ["room", options.rooms, FILTER_LABELS.room, "ไม่ระบุห้อง"],
    ["area", options.areas, FILTER_LABELS.area, "ไม่ระบุพื้นที่"],
    ["source", options.sources, FILTER_LABELS.source, "ไม่ระบุแหล่งเงิน"],
    ["status", options.statuses, FILTER_LABELS.status, "ไม่ระบุสถานะ"],
    ["acquisitionYear", options.acquisitionYears, FILTER_LABELS.acquisitionYear, "ไม่ระบุปีจัดหา"],
    ["fiscalYear", options.fiscalYears, FILTER_LABELS.fiscalYear, "ไม่ระบุปีงบประมาณของสินทรัพย์"],
    ["acquisitionFiscalYear", options.acquisitionFiscalYears, FILTER_LABELS.acquisitionFiscalYear, "ไม่ระบุปีงบประมาณจัดหา"],
  ];
  for (const [key, values, label, missingLabel] of selectOptions) {
    document.querySelectorAll(`[data-dashboard-filter="${key}"]`).forEach((select) => {
      updateSelect(
        select,
        values || [],
        filters[key],
        label,
        (value) => [value, value === "__missing__" ? missingLabel : value],
      );
    });
  }
  updateFilterCount();
}

function updateFilterCount() {
  const count = Object.entries(filters).filter(([key, value]) =>
    key !== "snapshot" && key !== "ageThreshold" && value !== FILTER_DEFAULTS[key],
  ).length;
  document.querySelectorAll("[data-dashboard-filter-count]").forEach((target) => {
    target.textContent = count === 0 ? "ยังไม่ได้กรอง" : `ใช้ตัวกรอง ${count} รายการ`;
  });
}

function syncFilterControls() {
  document.querySelectorAll("[data-dashboard-filter]").forEach((select) => {
    const value = filters[select.dataset.dashboardFilter];
    if (value !== undefined) select.value = String(value);
  });
}

async function loadDashboard() {
  resetLocationPages();
  governanceFieldState = { ...governanceFieldState, page: 1 };
  governanceDepartmentState = { ...governanceDepartmentState, page: 1 };
  governanceExceptionsState = { ...governanceExceptionsState, page: 1 };
  governanceExceptionRequestId += 1;
  governanceExceptionController?.abort();
  governanceExceptionController = null;
  governancePendingFocusSelector = null;
  governanceExceptionView = { contextKey: null, requestKey: null, status: "idle", rows: [], page: null, error: "" };
  const id = ++requestId;
  setRequestState("loading", "กำลังคำนวณข้อมูลตามตัวกรองที่เลือก");
  const sections = document.getElementById("dashboard-sections");
  if (sections) sections.setAttribute("aria-busy", "true");
  try {
    const url = buildInventoryDashboardUrl(DASHBOARD_API, filters);
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`คำขอล้มเหลว (HTTP ${response.status})`);
    const result = await response.json();
    if (id !== requestId) return;
    if (!result || result.success !== true || !result.data || typeof result.data !== "object") {
      throw new Error(result?.message || "ได้รับสรุปจากคลังสินทรัพย์ในรูปแบบที่ไม่คาดคิด");
    }
    if (result.data.selectedFilters?.snapshot) {
      filters.snapshot = String(result.data.selectedFilters.snapshot);
      onFiltersChange({ ...filters });
    }
    populateFilterOptions(result.data);
    updateSnapshotLabel(result.data);
    renderDashboard(result.data);
    const hasAssets = Number(result.data.overview?.totalAssets || 0) > 0;
    setRequestState(hasAssets ? "ready" : "empty", hasAssets ? "" : "ไม่พบสินทรัพย์ตามตัวกรองที่เลือก ลองเปลี่ยนหรือล้างตัวกรอง");
  } catch (error) {
    if (id !== requestId) return;
    const message = error instanceof Error ? error.message : "ไม่สามารถเชื่อมต่อคลังข้อมูลได้";
    setRequestState("error", `${message} · ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง`);
    const notice = document.getElementById("dashboard-data-state");
    const detail = document.getElementById("dashboard-data-detail");
    if (notice) notice.textContent = "ไม่สามารถยืนยันข้อมูลล่าสุดได้";
    if (detail) detail.textContent = message;
    clearDashboardData();
  } finally {
    if (id === requestId && sections) sections.removeAttribute("aria-busy");
  }
}

function clearDashboardData() {
  const metrics = document.getElementById("executive-metrics");
  if (metrics) metrics.replaceChildren();
  const readiness = document.getElementById("overview-readiness-rate");
  if (readiness) readiness.textContent = "—";
  const readinessCounts = document.getElementById("overview-readiness-counts");
  if (readinessCounts) readinessCounts.replaceChildren();
  const readinessMeter = document.getElementById("overview-readiness-meter");
  if (readinessMeter) readinessMeter.setAttribute("aria-label", "ยังไม่มีข้อมูลความพร้อมใช้งาน");
  for (const id of [
    "overview-readiness-ready-segment",
    "overview-readiness-unavailable-segment",
    "overview-readiness-unknown-segment",
  ]) {
    const segment = document.getElementById(id);
    if (segment) segment.style.width = "0%";
  }
  for (const element of document.querySelectorAll(".dashboard-chart, .dashboard-table-wrap, #overview-history-content")) {
    element.replaceChildren();
  }
  for (const id of [
    "governance-summary",
    "governance-critical-field-list",
    "governance-field-detail",
    "governance-department-detail",
    "governance-exception-summary",
  ]) {
    document.getElementById(id)?.replaceChildren();
  }
}

function applyFilterAndRefresh(key, value, { navigateToExplorer = false } = {}) {
  if (!Object.hasOwn(FILTER_DEFAULTS, key)) return;
  filters[key] = key === "ageThreshold" ? Number(value) : String(value);
  departmentComparisonState = { ...departmentComparisonState, page: 1 };
  portfolioMatrixState = { ...portfolioMatrixState, page: 1 };
  resetAgingPages();
  resetAcquisitionPages();
  syncFilterControls();
  updateFilterCount();
  loadDashboard();
  onFiltersChange({ ...filters });
  if (navigateToExplorer) window.location.hash = "#/inventory/explorer";
}

function applyDrillFiltersAndRefresh(nextFilters) {
  const entries = Object.entries(nextFilters || {});
  if (entries.length === 0 || entries.some(([key, value]) =>
    !Object.hasOwn(FILTER_DEFAULTS, key) || value === null || value === undefined || value === "",
  )) return;
  for (const [key, value] of entries) filters[key] = String(value);
  departmentComparisonState = { ...departmentComparisonState, page: 1 };
  portfolioMatrixState = { ...portfolioMatrixState, page: 1 };
  resetAgingPages();
  resetAcquisitionPages();
  syncFilterControls();
  updateFilterCount();
  loadDashboard();
  onFiltersChange({ ...filters });
  window.location.hash = "#/inventory/explorer";
}

async function importUniversitySnapshot(button) {
  const status = button.closest(".snapshot-filter-row")?.querySelector("[data-snapshot-import-status]");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  if (status) status.textContent = "กำลังดึงและตรวจสอบข้อมูลทุกหน้า…";

  try {
    const response = await fetch(SNAPSHOT_IMPORT_API, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-CPE-Snapshot-Import": "1",
      },
    });
    const result = await response.json();
    if (!response.ok || result?.success !== true || !result?.data?.snapshot?.key) {
      throw new Error(result?.message || `นำเข้าข้อมูลไม่สำเร็จ (HTTP ${response.status})`);
    }

    filters.snapshot = String(result.data.snapshot.key);
    departmentComparisonState = { ...departmentComparisonState, page: 1 };
    portfolioMatrixState = { ...portfolioMatrixState, page: 1 };
    resetAgingPages();
    resetAcquisitionPages();
    syncFilterControls();
    updateFilterCount();
    onFiltersChange({ ...filters });
    if (status) {
      status.textContent = `นำเข้าสำเร็จ ${formatCount(result.data.importedCount)} รายการ · ${result.data.snapshot.label}`;
    }
    loadDashboard();
  } catch (error) {
    const message = error instanceof Error ? error.message : "นำเข้าข้อมูลไม่สำเร็จ";
    if (status) status.textContent = message;
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

export function initExecutiveDashboard({ onFilterChange = () => {} } = {}) {
  onFiltersChange = onFilterChange;
  const dashboardSections = document.getElementById("dashboard-sections");
  dashboardSections?.addEventListener("change", (event) => {
    const governancePageSizeSelect = event.target.closest("[data-governance-page-size]");
    if (governancePageSizeSelect) {
      const scope = governancePageSizeSelect.dataset.governancePageSize;
      const pageSize = governancePageSizeSelect.value === "all" ? "all" : Number(governancePageSizeSelect.value);
      if (scope === "field") governanceFieldState = setGovernancePageSize(governanceFieldState, pageSize);
      else if (scope === "department") governanceDepartmentState = setGovernancePageSize(governanceDepartmentState, pageSize);
      else if (scope === "exceptions") {
        governanceExceptionsState = setGovernancePageSize(governanceExceptionsState, pageSize);
        governancePendingFocusSelector = '[data-governance-page-size="exceptions"]';
      } else return;
      if (latestPayload) renderGovernance(latestPayload.governance);
      if (scope !== "exceptions") document.querySelector(`[data-governance-page-size="${scope}"]`)?.focus();
      return;
    }
    const locationPageSizeSelect = event.target.closest("[data-location-page-size]");
    if (locationPageSizeSelect) {
      const scope = locationPageSizeSelect.dataset.locationPageSize;
      const pageSize = locationPageSizeSelect.value === "all" ? "all" : Number(locationPageSizeSelect.value);
      const state = getLocationVisualState(scope);
      if (!state) return;
      setLocationVisualState(scope, setLocationPageSize(state, pageSize));
      if (latestPayload) renderLocations(latestPayload.locations);
      document.querySelector(`[data-location-page-size="${scope}"]`)?.focus();
      return;
    }
    const portfolioPageSizeSelect = event.target.closest("[data-portfolio-matrix-page-size]");
    if (portfolioPageSizeSelect) {
      portfolioMatrixState = setPortfolioMatrixPageSize(
        portfolioMatrixState,
        portfolioPageSizeSelect.value === "all" ? "all" : Number(portfolioPageSizeSelect.value),
      );
      if (latestPayload) renderPortfolio(latestPayload.portfolio);
      document.querySelector("[data-portfolio-matrix-page-size]")?.focus();
      return;
    }
    const pageSizeSelect = event.target.closest("[data-department-comparison-page-size]");
    if (pageSizeSelect) {
      departmentComparisonState = setDepartmentPageSize(
        departmentComparisonState,
        pageSizeSelect.value === "all" ? "all" : Number(pageSizeSelect.value),
      );
      if (latestPayload) renderDepartments(latestPayload.departments);
      document.querySelector("[data-department-comparison-page-size]")?.focus();
      return;
    }
    const agingPageSizeSelect = event.target.closest("[data-aging-page-size]");
    if (agingPageSizeSelect) {
      const scope = agingPageSizeSelect.dataset.agingPageSize;
      const dimension = agingPageSizeSelect.dataset.agingTableDimension;
      if (!AGING_DIMENSIONS.includes(dimension) || !["exposure", "detail"].includes(scope)) return;
      const stateGroup = scope === "exposure" ? agingExposureStates : agingDetailStates;
      const pageSize = agingPageSizeSelect.value === "all" ? "all" : Number(agingPageSizeSelect.value);
      const nextState = setAgingPageSize(stateGroup[dimension], pageSize);
      if (scope === "exposure") agingExposureStates = { ...agingExposureStates, [dimension]: nextState };
      else agingDetailStates = { ...agingDetailStates, [dimension]: nextState };
      if (latestPayload) renderAging(latestPayload.aging, latestPayload);
      document.querySelector(`[data-aging-page-size="${scope}"][data-aging-table-dimension="${dimension}"]`)?.focus();
      return;
    }
    const acquisitionPageSizeSelect = event.target.closest("[data-acquisition-page-size]");
    if (acquisitionPageSizeSelect) {
      const scope = acquisitionPageSizeSelect.dataset.acquisitionPageSize;
      const state = getAcquisitionVisualState(scope);
      if (!state) return;
      const pageSize = acquisitionPageSizeSelect.value === "all" ? "all" : Number(acquisitionPageSizeSelect.value);
      setAcquisitionVisualState(scope, scope === "heatmap"
        ? setAcquisitionHeatmapPageSize(state, pageSize)
        : setAcquisitionPageSize(state, pageSize));
      if (latestPayload) renderAcquisition(latestPayload.acquisition);
      document.querySelector(`[data-acquisition-page-size="${scope}"]`)?.focus();
      return;
    }
    const select = event.target.closest("[data-dashboard-filter]");
    if (select) applyFilterAndRefresh(select.dataset.dashboardFilter, select.value);
  });
  dashboardSections?.addEventListener("click", (event) => {
    const governanceFieldSort = event.target.closest("[data-governance-field-sort]");
    if (governanceFieldSort && latestPayload) {
      const key = governanceFieldSort.dataset.governanceFieldSort;
      if (!GOVERNANCE_FIELD_SORT_KEYS.includes(key)) return;
      const direction = governanceFieldState.sortKey === key && governanceFieldState.direction === "desc" ? "asc" : "desc";
      governanceFieldState = setGovernanceSort(governanceFieldState, key, direction, GOVERNANCE_FIELD_SORT_KEYS);
      renderGovernance(latestPayload.governance);
      document.querySelector(`[data-governance-field-sort="${key}"]`)?.focus();
      return;
    }
    const governanceDepartmentSort = event.target.closest("[data-governance-department-sort]");
    if (governanceDepartmentSort && latestPayload) {
      const key = governanceDepartmentSort.dataset.governanceDepartmentSort;
      if (!GOVERNANCE_DEPARTMENT_SORT_KEYS.includes(key)) return;
      const direction = governanceDepartmentState.sortKey === key && governanceDepartmentState.direction === "desc" ? "asc" : "desc";
      governanceDepartmentState = setGovernanceSort(governanceDepartmentState, key, direction, GOVERNANCE_DEPARTMENT_SORT_KEYS);
      renderGovernance(latestPayload.governance);
      document.querySelector(`[data-governance-department-sort="${key}"]`)?.focus();
      return;
    }
    const governanceFieldSelect = event.target.closest("[data-governance-field-select]");
    if (governanceFieldSelect && latestPayload) {
      governanceSelectedFieldKey = governanceFieldSelect.dataset.governanceFieldSelect;
      renderGovernance(latestPayload.governance);
      document.querySelector(`[data-governance-field-select="${governanceSelectedFieldKey}"]`)?.focus();
      return;
    }
    const governanceDepartmentSelect = event.target.closest("[data-governance-department-select]");
    if (governanceDepartmentSelect && latestPayload) {
      governanceSelectedDepartmentKey = governanceDepartmentSelect.dataset.governanceDepartmentSelect;
      renderGovernance(latestPayload.governance);
      document.querySelector(`[data-governance-department-select="${governanceSelectedDepartmentKey}"]`)?.focus();
      return;
    }
    const governancePageButton = event.target.closest("[data-governance-page]");
    if (governancePageButton && latestPayload) {
      const scope = governancePageButton.dataset.governancePage;
      const action = governancePageButton.dataset.governancePageAction;
      const state = scope === "field" ? governanceFieldState : scope === "department" ? governanceDepartmentState : scope === "exceptions" ? governanceExceptionsState : null;
      if (!state || !["first", "previous", "next", "last"].includes(action)) return;
      const totalRows = scope === "field"
        ? Object.keys(latestPayload.governance?.qualityFields || {}).length
        : scope === "department"
          ? (latestPayload.governance?.qualityByDepartment || []).length
          : Number(latestPayload.governance?.exceptionsTotal || 0);
      const page = resolveGovernancePage(totalRows, state);
      const requestedPage = { first: 1, previous: page.page - 1, next: page.page + 1, last: page.totalPages }[action];
      if (scope === "field") governanceFieldState = setGovernancePage(state, requestedPage, totalRows);
      else if (scope === "department") governanceDepartmentState = setGovernancePage(state, requestedPage, totalRows);
      else {
        governanceExceptionsState = setGovernancePage(state, requestedPage, totalRows);
        governancePendingFocusSelector = '[data-governance-page-size="exceptions"]';
      }
      renderGovernance(latestPayload.governance);
      if (scope !== "exceptions") {
        document.querySelector(`[data-governance-page="${scope}"][data-governance-page-action="${action}"]`)?.focus();
      }
      return;
    }
    const governanceRetry = event.target.closest("[data-governance-exceptions-retry]");
    if (governanceRetry && latestPayload) {
      const contextKey = governanceRequestContext(filters, latestPayload.snapshot?.snapshotId ?? null);
      governancePendingFocusSelector = '[data-governance-page-size="exceptions"]';
      governanceExceptionView = { contextKey, requestKey: null, status: "idle", rows: [], page: null, error: "" };
      renderGovernance(latestPayload.governance);
      return;
    }
    const issueSortButton = event.target.closest("[data-issue-heatmap-sort]");
    if (issueSortButton) {
      const key = issueSortButton.dataset.issueHeatmapSort;
      if (!ISSUE_HEATMAP_SORT_KEYS.has(key)) return;
      issueHeatmapSort = {
        key,
        direction: issueHeatmapSort.key === key && issueHeatmapSort.direction === "desc" ? "asc" : "desc",
      };
      if (latestPayload) renderOverviewIssueHeatmap(latestPayload);
      return;
    }
    const issueToggleButton = event.target.closest("[data-issue-heatmap-toggle]");
    if (issueToggleButton) {
      issueHeatmapExpanded = !issueHeatmapExpanded;
      if (latestPayload) renderOverviewIssueHeatmap(latestPayload);
      return;
    }
    const importButton = event.target.closest("[data-university-snapshot-import]");
    if (importButton) {
      importUniversitySnapshot(importButton);
      return;
    }
    const resetButton = event.target.closest("[data-dashboard-filter-reset]");
    if (resetButton) {
      filters = { ...FILTER_DEFAULTS };
      departmentComparisonState = { ...departmentComparisonState, page: 1 };
      portfolioMatrixState = { ...portfolioMatrixState, page: 1 };
      resetAgingPages();
      resetAcquisitionPages();
      syncFilterControls();
      const threshold = document.getElementById("age-threshold-input");
      if (threshold) threshold.value = "10";
      updateFilterCount();
      loadDashboard();
      onFiltersChange({ ...filters });
      return;
    }
    if (event.target.closest("[data-dashboard-retry]")) loadDashboard();
  });
  document.getElementById("age-threshold-input")?.addEventListener("change", (event) => {
    const value = Number.parseInt(event.currentTarget.value, 10);
    if (!Number.isInteger(value) || value < 1 || value > 50) {
      event.currentTarget.value = String(filters.ageThreshold);
      return;
    }
    applyFilterAndRefresh("ageThreshold", value);
  });
  document.getElementById("dashboard-sections")?.addEventListener("click", (event) => {
    const acquisitionYearDimensionButton = event.target.closest("[data-acquisition-year-dimension]");
    if (acquisitionYearDimensionButton) {
      const dimension = acquisitionYearDimensionButton.dataset.acquisitionYearDimension;
      if (!ACQUISITION_DIMENSIONS.includes(dimension)) return;
      acquisitionYearDimension = dimension;
      acquisitionSelectedCohortKey = null;
      acquisitionSelectedSourceKey = null;
      acquisitionHeatmapState = { ...acquisitionHeatmapState, page: 1 };
      resetAcquisitionPages();
      if (latestPayload) renderAcquisition(latestPayload.acquisition);
      document.querySelector(`[data-acquisition-year-dimension="${dimension}"]`)?.focus();
      return;
    }

    const acquisitionCell = event.target.closest("[data-acquisition-cell]");
    if (acquisitionCell && latestPayload) {
      acquisitionSelectedCohortKey = acquisitionCell.dataset.acquisitionCohortKey;
      acquisitionSelectedSourceKey = acquisitionCell.dataset.acquisitionSourceKey;
      resetAcquisitionPages();
      renderAcquisition(latestPayload.acquisition);
      [...document.querySelectorAll("[data-acquisition-cell]")]
        .find((button) => button.dataset.acquisitionCohortKey === acquisitionSelectedCohortKey
          && button.dataset.acquisitionSourceKey === acquisitionSelectedSourceKey)
        ?.focus();
      return;
    }

    const acquisitionCohortButton = event.target.closest("[data-acquisition-cohort]");
    if (acquisitionCohortButton && latestPayload) {
      acquisitionSelectedCohortKey = acquisitionCohortButton.dataset.acquisitionCohort;
      acquisitionSelectedSourceKey = null;
      resetAcquisitionPages();
      renderAcquisition(latestPayload.acquisition);
      [...document.querySelectorAll("[data-acquisition-cohort]")]
        .find((button) => button.dataset.acquisitionCohort === acquisitionSelectedCohortKey)
        ?.focus();
      return;
    }

    const acquisitionBreakdownButton = event.target.closest("[data-acquisition-breakdown-dimension]");
    if (acquisitionBreakdownButton) {
      const dimension = acquisitionBreakdownButton.dataset.acquisitionBreakdownDimension;
      if (!ACQUISITION_BREAKDOWN_DIMENSIONS.includes(dimension)) return;
      acquisitionBreakdownDimension = dimension;
      acquisitionBreakdownStates = {
        ...acquisitionBreakdownStates,
        [dimension]: { ...acquisitionBreakdownStates[dimension], page: 1 },
      };
      if (latestPayload) renderAcquisition(latestPayload.acquisition);
      document.querySelector(`[data-acquisition-breakdown-dimension="${dimension}"]`)?.focus();
      return;
    }

    const acquisitionBreakdownSort = event.target.closest("[data-acquisition-breakdown-sort]");
    if (acquisitionBreakdownSort && latestPayload) {
      const dimension = acquisitionBreakdownSort.dataset.acquisitionTable;
      const key = acquisitionBreakdownSort.dataset.acquisitionBreakdownSort;
      if (!ACQUISITION_BREAKDOWN_DIMENSIONS.includes(dimension) || !ACQUISITION_TABLE_SORT_KEYS.includes(key)) return;
      const state = acquisitionBreakdownStates[dimension];
      const direction = state.sortKey === key && state.direction === "desc" ? "asc" : "desc";
      acquisitionBreakdownStates = {
        ...acquisitionBreakdownStates,
        [dimension]: setAcquisitionSort(state, key, direction, ACQUISITION_TABLE_SORT_KEYS),
      };
      renderAcquisition(latestPayload.acquisition);
      [...document.querySelectorAll("[data-acquisition-breakdown-sort]")]
        .find((button) => button.dataset.acquisitionBreakdownSort === key && button.dataset.acquisitionTable === dimension)
        ?.focus();
      return;
    }

    const acquisitionRelationButton = event.target.closest("[data-acquisition-cross-relation]");
    if (acquisitionRelationButton) {
      const relation = acquisitionRelationButton.dataset.acquisitionCrossRelation;
      if (!ACQUISITION_RELATIONSHIPS.includes(relation)) return;
      acquisitionCrossRelation = relation;
      acquisitionCrossStates = {
        ...acquisitionCrossStates,
        [relation]: { ...acquisitionCrossStates[relation], page: 1 },
      };
      if (latestPayload) renderAcquisition(latestPayload.acquisition);
      document.querySelector(`[data-acquisition-cross-relation="${relation}"]`)?.focus();
      return;
    }

    const acquisitionCrossSort = event.target.closest("[data-acquisition-cross-sort]");
    if (acquisitionCrossSort && latestPayload) {
      const relation = acquisitionCrossSort.dataset.acquisitionTable;
      const key = acquisitionCrossSort.dataset.acquisitionCrossSort;
      if (!ACQUISITION_RELATIONSHIPS.includes(relation) || !ACQUISITION_CROSS_SORT_KEYS.includes(key)) return;
      const state = acquisitionCrossStates[relation];
      const direction = state.sortKey === key && state.direction === "desc" ? "asc" : "desc";
      acquisitionCrossStates = {
        ...acquisitionCrossStates,
        [relation]: setAcquisitionSort(state, key, direction, ACQUISITION_CROSS_SORT_KEYS),
      };
      renderAcquisition(latestPayload.acquisition);
      [...document.querySelectorAll("[data-acquisition-cross-sort]")]
        .find((button) => button.dataset.acquisitionCrossSort === key && button.dataset.acquisitionTable === relation)
        ?.focus();
      return;
    }

    const acquisitionPageButton = event.target.closest("[data-acquisition-page]");
    if (acquisitionPageButton && latestPayload) {
      const scope = acquisitionPageButton.dataset.acquisitionPage;
      const state = getAcquisitionVisualState(scope);
      if (!state) return;
      const rows = getAcquisitionVisualRows(scope);
      const page = scope === "heatmap"
        ? paginateAcquisitionHeatmapRows(rows, state)
        : paginateAcquisitionRows(rows, state);
      const action = acquisitionPageButton.dataset.acquisitionPageAction;
      const requestedPage = {
        first: 1,
        previous: page.page - 1,
        next: page.page + 1,
        last: page.totalPages,
      }[action];
      if (requestedPage !== undefined) {
        setAcquisitionVisualState(scope, scope === "heatmap"
          ? setAcquisitionHeatmapPage(state, requestedPage, page.totalRows)
          : setAcquisitionPage(state, requestedPage, page.totalRows));
        renderAcquisition(latestPayload.acquisition);
        [...document.querySelectorAll("[data-acquisition-page]")]
          .find((button) => button.dataset.acquisitionPage === scope && button.dataset.acquisitionPageAction === action && !button.disabled)
          ?.focus();
      }
      return;
    }

    const agingExposureDimensionButton = event.target.closest("[data-aging-exposure-dimension]");
    if (agingExposureDimensionButton) {
      const dimension = agingExposureDimensionButton.dataset.agingExposureDimension;
      if (!AGING_DIMENSIONS.includes(dimension)) return;
      agingExposureDimension = dimension;
      if (latestPayload) renderAging(latestPayload.aging, latestPayload);
      document.querySelector(`[data-aging-exposure-dimension="${dimension}"]`)?.focus();
      return;
    }

    const agingDetailDimensionButton = event.target.closest("[data-aging-detail-dimension]");
    if (agingDetailDimensionButton) {
      const dimension = agingDetailDimensionButton.dataset.agingDetailDimension;
      if (!AGING_DIMENSIONS.includes(dimension)) return;
      agingDetailDimension = dimension;
      if (latestPayload) renderAging(latestPayload.aging, latestPayload);
      document.querySelector(`[data-aging-detail-dimension="${dimension}"]`)?.focus();
      return;
    }

    const agingConditionButton = event.target.closest("[data-aging-condition-mode]");
    if (agingConditionButton) {
      const mode = agingConditionButton.dataset.agingConditionMode;
      if (!["availability", "damage"].includes(mode)) return;
      agingConditionMode = mode;
      if (latestPayload) renderAging(latestPayload.aging, latestPayload);
      document.querySelector(`[data-aging-condition-mode="${mode}"]`)?.focus();
      return;
    }

    const agingDepartmentButton = event.target.closest("[data-aging-department-select]");
    if (agingDepartmentButton && latestPayload) {
      selectedAgingDepartmentKey = agingDepartmentButton.dataset.agingDepartmentSelect;
      renderAging(latestPayload.aging, latestPayload);
      document.querySelector(`[data-aging-department-select="${selectedAgingDepartmentKey}"]`)?.focus();
      return;
    }

    const agingDepartmentRow = event.target.closest("[data-aging-department-row]");
    if (agingDepartmentRow && !event.target.closest("button, a, select, input") && latestPayload) {
      selectedAgingDepartmentKey = agingDepartmentRow.dataset.agingDepartmentRow;
      renderAging(latestPayload.aging, latestPayload);
      document.querySelector(`[data-aging-department-select="${selectedAgingDepartmentKey}"]`)?.focus();
      return;
    }

    const agingExposureSortButton = event.target.closest("[data-aging-exposure-sort]");
    if (agingExposureSortButton && latestPayload) {
      const dimension = agingExposureSortButton.dataset.agingTableDimension;
      const key = agingExposureSortButton.dataset.agingExposureSort;
      if (!AGING_DIMENSIONS.includes(dimension) || !AGING_EXPOSURE_SORT_KEYS.includes(key)) return;
      const state = agingExposureStates[dimension];
      const direction = state.sortKey === key && state.direction === "desc" ? "asc" : "desc";
      agingExposureStates = {
        ...agingExposureStates,
        [dimension]: setAgingSort(state, key, direction, AGING_EXPOSURE_SORT_KEYS),
      };
      renderAging(latestPayload.aging, latestPayload);
      document.querySelector(`[data-aging-exposure-sort="${key}"][data-aging-table-dimension="${dimension}"]`)?.focus();
      return;
    }

    const agingDetailSortButton = event.target.closest("[data-aging-detail-sort]");
    if (agingDetailSortButton && latestPayload) {
      const dimension = agingDetailSortButton.dataset.agingTableDimension;
      const key = agingDetailSortButton.dataset.agingDetailSort;
      if (!AGING_DIMENSIONS.includes(dimension) || !AGING_DETAIL_SORT_KEYS.includes(key)) return;
      const state = agingDetailStates[dimension];
      const direction = state.sortKey === key && state.direction === "desc" ? "asc" : "desc";
      agingDetailStates = {
        ...agingDetailStates,
        [dimension]: setAgingSort(state, key, direction, AGING_DETAIL_SORT_KEYS),
      };
      renderAging(latestPayload.aging, latestPayload);
      document.querySelector(`[data-aging-detail-sort="${key}"][data-aging-table-dimension="${dimension}"]`)?.focus();
      return;
    }

    const agingPageButton = event.target.closest("[data-aging-page]");
    if (agingPageButton && latestPayload) {
      const scope = agingPageButton.dataset.agingPage;
      const dimension = agingPageButton.dataset.agingTableDimension;
      const action = agingPageButton.dataset.agingPageAction;
      if (!["exposure", "detail"].includes(scope) || !AGING_DIMENSIONS.includes(dimension)) return;
      const dimensionData = getAgingDimensionData(latestPayload, dimension);
      const rows = scope === "exposure"
        ? (dimension === "department"
          ? buildAgingExposureRows(dimensionData.entities)
          : buildAgingExposureRows(dimensionData.entities))
        : buildDetailedAgeMatrixRows(dimensionData.entities, dimensionData.ageGroups).rows;
      const stateGroup = scope === "exposure" ? agingExposureStates : agingDetailStates;
      const state = stateGroup[dimension];
      const page = paginateAgingRows(rows, state);
      const requestedPage = {
        first: 1,
        previous: page.page - 1,
        next: page.page + 1,
        last: page.totalPages,
      }[action];
      if (requestedPage !== undefined) {
        const nextState = setAgingPage(state, requestedPage, page.totalRows);
        if (scope === "exposure") agingExposureStates = { ...agingExposureStates, [dimension]: nextState };
        else agingDetailStates = { ...agingDetailStates, [dimension]: nextState };
        renderAging(latestPayload.aging, latestPayload);
        document.querySelector(`[data-aging-page="${scope}"][data-aging-table-dimension="${dimension}"][data-aging-page-action="${action}"]`)?.focus();
      }
      return;
    }

    const locationPageButton = event.target.closest("[data-location-page]");
    if (locationPageButton) {
      const scope = locationPageButton.dataset.locationPage;
      const state = getLocationVisualState(scope);
      const rows = getLocationVisualRows(scope);
      if (!state) return;
      const page = paginateLocationRows(rows, state);
      const action = locationPageButton.dataset.locationPageAction;
      const requestedPage = {
        first: 1,
        previous: page.page - 1,
        next: page.page + 1,
        last: page.totalPages,
      }[action];
      if (requestedPage !== undefined) {
        setLocationVisualState(scope, setLocationPage(state, requestedPage, page.totalRows));
        if (latestPayload) renderLocations(latestPayload.locations);
        [...document.querySelectorAll(`[data-location-page="${scope}"]`)]
          .find((button) => button.dataset.locationPageAction === action && !button.disabled)
          ?.focus();
      }
      return;
    }

    const locationMatrixSort = event.target.closest("[data-location-matrix-sort]");
    if (locationMatrixSort && latestPayload) {
      const key = locationMatrixSort.dataset.locationMatrixSort;
      const allowed = ["label", "totalAssets", "completeRate", "incompleteRate", "missingRate", "unknownRate"];
      if (!allowed.includes(key)) return;
      const direction = locationMatrixState.sortKey === key && locationMatrixState.direction === "desc" ? "asc" : "desc";
      locationMatrixState = setLocationSort(locationMatrixState, key, direction, allowed);
      renderLocations(latestPayload.locations);
      [...document.querySelectorAll("[data-location-matrix-sort]")].find((button) => button.dataset.locationMatrixSort === key)?.focus();
      return;
    }

    const locationCategorySort = event.target.closest("[data-location-category-building-sort]");
    if (locationCategorySort && latestPayload) {
      const key = locationCategorySort.dataset.locationCategoryBuildingSort;
      const allowed = ["first", "second", "totalAssets"];
      if (!allowed.includes(key)) return;
      const direction = locationCategoryBuildingState.sortKey === key && locationCategoryBuildingState.direction === "desc" ? "asc" : "desc";
      locationCategoryBuildingState = setLocationSort(locationCategoryBuildingState, key, direction, allowed);
      renderLocations(latestPayload.locations);
      [...document.querySelectorAll("[data-location-category-building-sort]")].find((button) => button.dataset.locationCategoryBuildingSort === key)?.focus();
      return;
    }

    const locationDepartment = event.target.closest("[data-location-department-select]");
    if (locationDepartment && latestPayload) {
      selectedLocationDepartmentKey = locationDepartment.dataset.locationDepartmentSelect;
      renderLocations(latestPayload.locations);
      [...document.querySelectorAll("[data-location-department-select]")]
        .find((button) => button.dataset.locationDepartmentSelect === selectedLocationDepartmentKey)
        ?.focus();
      return;
    }

    const locationDepartmentRow = event.target.closest("[data-location-department-row]");
    if (locationDepartmentRow && !event.target.closest("button, a, select, input")) {
      selectedLocationDepartmentKey = locationDepartmentRow.dataset.locationDepartmentRow;
      renderLocations(latestPayload.locations);
      return;
    }

    const locationExplorerSelect = event.target.closest("[data-location-explorer-select]");
    if (locationExplorerSelect && latestPayload) {
      const level = locationExplorerSelect.dataset.locationExplorerSelect;
      const key = locationExplorerSelect.dataset.locationExplorerKey;
      if (level === "building") {
        locationExplorerSelection = { buildingKey: key, floorKey: null, roomKey: null };
        locationExplorerPages = {
          ...locationExplorerPages,
          floor: { ...locationExplorerPages.floor, page: 1 },
          room: { ...locationExplorerPages.room, page: 1 },
        };
      } else if (level === "floor") {
        locationExplorerSelection = { ...locationExplorerSelection, floorKey: key, roomKey: null };
        locationExplorerPages = { ...locationExplorerPages, room: { ...locationExplorerPages.room, page: 1 } };
      } else if (level === "room") {
        locationExplorerSelection = { ...locationExplorerSelection, roomKey: key };
      } else {
        return;
      }
      renderLocations(latestPayload.locations);
      [...document.querySelectorAll(`[data-location-explorer-select="${level}"]`)]
        .find((button) => button.dataset.locationExplorerKey === key)
        ?.focus();
      return;
    }

    const portfolioCategorySelect = event.target.closest("[data-portfolio-category-select]");
    if (portfolioCategorySelect && latestPayload?.portfolio) {
      const selectedFromTreemap = portfolioCategorySelect.matches("[data-portfolio-category-tile]");
      const sourceId = portfolioCategorySelect.closest("#portfolio-categories, #portfolio-focus")?.id;
      selectedPortfolioCategoryKey = portfolioCategorySelect.dataset.portfolioCategorySelect;
      renderPortfolio(latestPayload.portfolio);
      if (selectedFromTreemap) {
        const focusContent = document.getElementById("portfolio-focus");
        const selectedCategory = focusContent?.querySelector("[data-portfolio-focus-category]");
        selectedCategory?.focus({ preventScroll: true });
        focusContent?.closest(".panel")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start",
        });
      } else {
        [...(document.getElementById(sourceId)?.querySelectorAll("[data-portfolio-category-select]") ?? [])]
          .find((button) => button.dataset.portfolioCategorySelect === selectedPortfolioCategoryKey)
          ?.focus();
      }
      return;
    }

    const portfolioDepartmentSelect = event.target.closest("[data-portfolio-department-select]");
    if (portfolioDepartmentSelect && latestPayload?.portfolio) {
      selectedPortfolioDepartmentKey = portfolioDepartmentSelect.dataset.portfolioDepartmentSelect;
      renderPortfolio(latestPayload.portfolio);
      [...document.querySelectorAll("[data-portfolio-department-select]")]
        .find((button) => button.dataset.portfolioDepartmentSelect === selectedPortfolioDepartmentKey)
        ?.focus();
      return;
    }

    const portfolioSortButton = event.target.closest("[data-portfolio-matrix-sort]");
    if (portfolioSortButton && latestPayload?.portfolio) {
      const key = portfolioSortButton.dataset.portfolioMatrixSort;
      const categories = latestPayload.portfolio.categories || [];
      const isSupported = key === "totalAssets" || categories.some((category) => key === `category:${getPortfolioCategoryKey(category)}`);
      if (!isSupported) return;
      const direction = portfolioMatrixState.sortKey === key && portfolioMatrixState.direction === "desc" ? "asc" : "desc";
      portfolioMatrixState = setPortfolioMatrixSort(portfolioMatrixState, key, direction);
      renderPortfolio(latestPayload.portfolio);
      [...document.querySelectorAll("[data-portfolio-matrix-sort]")]
        .find((button) => button.dataset.portfolioMatrixSort === key)
        ?.focus();
      return;
    }

    const portfolioPageButton = event.target.closest("[data-portfolio-matrix-page]");
    if (portfolioPageButton && latestPayload?.portfolio) {
      const matrix = buildPortfolioMatrixRows(
        latestPayload.departments?.rows || [],
        latestPayload.portfolio.categories || [],
        latestPayload.portfolio.departmentCategoryMatrix,
      );
      const currentPage = paginatePortfolioMatrixRows(matrix.rows, portfolioMatrixState);
      const action = portfolioPageButton.dataset.portfolioMatrixPage;
      const requestedPage = {
        first: 1,
        previous: currentPage.page - 1,
        next: currentPage.page + 1,
        last: currentPage.totalPages,
      }[action];
      if (requestedPage !== undefined) {
        portfolioMatrixState = setPortfolioMatrixPage(portfolioMatrixState, requestedPage, currentPage.totalRows);
        renderPortfolio(latestPayload.portfolio);
        [...document.querySelectorAll("[data-portfolio-matrix-page]")]
          .find((button) => button.dataset.portfolioMatrixPage === action && !button.disabled)
          ?.focus();
      }
      return;
    }

    const comparisonSortButton = event.target.closest("[data-department-comparison-sort]");
    if (comparisonSortButton) {
      const key = comparisonSortButton.dataset.departmentComparisonSort;
      if (!DEPARTMENT_COMPARISON_SORT_KEYS.has(key)) return;
      const direction = departmentComparisonState.sortKey === key && departmentComparisonState.direction === "desc"
        ? "asc"
        : "desc";
      departmentComparisonState = setDepartmentSort(departmentComparisonState, key, direction);
      if (latestPayload) renderDepartments(latestPayload.departments);
      [...document.querySelectorAll("[data-department-comparison-sort]")]
        .find((button) => button.dataset.departmentComparisonSort === key)
        ?.focus();
      return;
    }

    const pageButton = event.target.closest("[data-department-comparison-page]");
    if (pageButton && latestPayload) {
      const rows = latestPayload.departments?.rows || [];
      const currentPage = paginateDepartmentRows(rows, departmentComparisonState);
      const action = pageButton.dataset.departmentComparisonPage;
      const requestedPage = {
        first: 1,
        previous: currentPage.page - 1,
        next: currentPage.page + 1,
        last: currentPage.totalPages,
      }[action];
      if (requestedPage !== undefined) {
        departmentComparisonState = setDepartmentPage(departmentComparisonState, requestedPage, currentPage.totalRows);
        renderDepartments(latestPayload.departments);
        const nextFocusTarget = [...document.querySelectorAll("[data-department-comparison-page]")]
          .find((button) => button.dataset.departmentComparisonPage === action && !button.disabled);
        (nextFocusTarget || document.querySelector("[data-department-comparison-page-size]"))?.focus();
      }
      return;
    }

    const departmentSelect = event.target.closest("[data-department-select]");
    if (departmentSelect) {
      const key = departmentSelect.dataset.departmentSelect;
      const row = latestPayload?.departments?.rows?.find((item) => getDepartmentKey(item) === key);
      if (!row) return;
      selectedDepartmentKey = key;
      document.querySelectorAll("[data-department-row]").forEach((tableRow) => {
        const selected = tableRow.dataset.departmentRow === key;
        tableRow.setAttribute("aria-selected", String(selected));
        tableRow.querySelector("[data-department-select]")?.setAttribute("aria-pressed", String(selected));
      });
      renderDepartmentFocus(row);
      return;
    }

    const departmentRow = event.target.closest("[data-department-row]");
    if (departmentRow && !event.target.closest("button, a, select, input")) {
      const key = departmentRow.dataset.departmentRow;
      const row = latestPayload?.departments?.rows?.find((item) => getDepartmentKey(item) === key);
      if (!row) return;
      selectedDepartmentKey = key;
      document.querySelectorAll("[data-department-row]").forEach((tableRow) => {
        const selected = tableRow.dataset.departmentRow === key;
        tableRow.setAttribute("aria-selected", String(selected));
        tableRow.querySelector("[data-department-select]")?.setAttribute("aria-pressed", String(selected));
      });
      renderDepartmentFocus(row);
      return;
    }

    const sortButton = event.target.closest("[data-department-sort]");
    if (sortButton) {
      const key = sortButton.dataset.departmentSort;
      departmentSort = {
        key,
        direction: departmentSort.key === key && departmentSort.direction === "desc" ? "asc" : "desc",
      };
      if (latestPayload) renderDepartments(latestPayload.departments);
      return;
    }
    const multiFilterDrill = event.target.closest("[data-drill-filters]");
    if (multiFilterDrill) {
      try {
        applyDrillFiltersAndRefresh(JSON.parse(multiFilterDrill.dataset.drillFilters));
      } catch {
        return;
      }
      return;
    }
    const drill = event.target.closest("[data-drill-filter]");
    if (drill) applyFilterAndRefresh(drill.dataset.drillFilter, drill.dataset.filterValue, { navigateToExplorer: true });
  });
  loadDashboard();
}

export function getExecutiveDashboardFilters() {
  return { ...filters };
}

export function setInventoryDashboardPage(pageId) {
  const selectedPage = PAGE_IDS.includes(pageId) ? pageId : "overview";
  document.querySelectorAll("[data-dashboard-page]").forEach((page) => {
    page.hidden = page.dataset.dashboardPage !== selectedPage;
  });
  document.querySelectorAll("[data-dashboard-link]").forEach((link) => {
    if (link.dataset.dashboardLink === selectedPage) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

export function refreshExecutiveDashboard() {
  return loadDashboard();
}
