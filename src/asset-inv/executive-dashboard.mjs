import {
  buildInventoryDashboardUrl,
  hasComparableSnapshots,
} from "./inventory-dashboard-data.mjs";

const DASHBOARD_API = new URL("../../assets_api/asset_inventory_dashboard.php", import.meta.url).href;
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
  belowThreshold: "all",
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
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
const DATE_FORMAT = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });

let filters = { ...FILTER_DEFAULTS };
let latestPayload = null;
let requestId = 0;
let onFiltersChange = () => {};
let departmentSort = { key: "totalAssets", direction: "desc" };

const formatCount = (value) => NUMBER_FORMAT.format(Number(value || 0));
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
  const primary = [
    {
      label: "สินทรัพย์ทั้งหมด",
      value: formatCount(data.totalAssets),
      note: "ผลรวม asset_count ในชุดข้อมูลที่เลือก",
      tone: "primary",
    },
    {
      label: "พร้อมใช้งาน",
      value: formatCount(data.availableAssets),
      note: `อัตราความพร้อม ${formatPercent(data.availabilityRate)}`,
      tone: "success",
    },
    {
      label: "ชำรุด",
      value: formatCount(data.damagedAssets),
      note: `อัตราความเสียหาย ${formatPercent(data.damageRate)}`,
      tone: "danger",
    },
    {
      label: "ครอบคลุมตำแหน่ง",
      value: formatPercent(data.locationCoverageRate),
      note: `ไม่มีตำแหน่ง ${formatCount(data.missingLocationAssets)} รายการ`,
      tone: "info",
    },
  ];
  setHtml("executive-metrics", primary.map((item) => `
    <article class="metric-card metric-card-${item.tone}">
      <span class="metric-label">${item.label}</span>
      <strong class="metric-value">${item.value}</strong>
      <span class="metric-footnote">${item.note}</span>
    </article>
  `).join(""));

  const secondary = [
    ["ไม่พร้อมใช้งาน", formatCount(data.unavailableAssets)],
    ["ไม่ระบุความพร้อม", formatCount(data.availabilityUnknownAssets)],
    ["ธงต่ำกว่าเกณฑ์", formatCount(data.belowThresholdAssets)],
    ["อัตราธงต่ำกว่าเกณฑ์", formatPercent(data.belowThresholdRate)],
    ["อายุเฉลี่ย", data.averageAssetAge === null ? "—" : `${Number(data.averageAssetAge).toFixed(1)} ปี`],
    [`อายุเกิน ${filters.ageThreshold} ปี`, formatCount(data.assetsOlderThanThreshold)],
    ["ข้อมูลอายุครบ", formatPercent(data.ageCoverageRate)],
  ];
  setHtml("overview-secondary-metrics", secondary.map(([label, value]) => `
    <div class="secondary-metric"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
  `).join(""));
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

function renderOverview(data, payload) {
  renderMetrics(data);
  renderRankedBars("overview-status-distribution", data.statusDistribution, {
    labelKey: "label", countKey: "assets", filterKey: "status", valueKey: "key", limit: 8,
  });
  renderRankedBars("overview-availability-distribution", data.availabilityDistribution, {
    labelKey: "label", countKey: "assets", filterKey: "availability", valueKey: "key", limit: 3,
  });
  const ageRows = Object.entries(payload.aging.ageDistribution || {}).map(([key, assets]) => ({
    key,
    label: AGE_LABELS[key] || key,
    assets,
  }));
  renderRankedBars("overview-age-distribution", ageRows, {
    labelKey: "label", countKey: "assets", filterKey: "ageBand", valueKey: "key", limit: 7, sort: false,
  });
  renderRankedBars("overview-departments", data.topDepartments, {
    labelKey: "label", countKey: "totalAssets", filterKey: "department", valueKey: "label", limit: 7,
  });

  const attention = (data.attentionAreas || []).filter((item) =>
    ["damaged", "unavailable", "old", "missingLocation", "missingCriticalMetadata", "belowThreshold"].includes(item.key),
  );
  renderRankedBars("overview-attention", attention, {
    labelKey: "label", countKey: "assets", valueKey: "key", limit: 6,
  });
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
  historyTarget.innerHTML = `<p class="history-date-caption">${escapeHtml(formatDate(comparison.currentSnapshot))} เทียบกับ ${escapeHtml(formatDate(comparison.previousSnapshot))}</p>${tableMarkup("ตารางเปรียบเทียบชุดข้อมูล", columns, rows)}`;
}

function tableMarkup(caption, columns, rows) {
  return `<div class="dashboard-table-wrap"><table class="dashboard-data-table"><caption class="sr-only">${escapeHtml(caption)}</caption><thead><tr>${columns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderPortfolio(data) {
  renderRankedBars("portfolio-categories", data.categories, {
    labelKey: "label", countKey: "totalAssets", rateKey: "assetShareRate", filterKey: "category", valueKey: "label", limit: 15,
  });
  renderRankedBars("portfolio-types", data.topTypes, {
    labelKey: "label", countKey: "totalAssets", rateKey: "assetShareRate", filterKey: "type", valueKey: "label", limit: 15,
  });
  renderComboTable("portfolio-department-category", "หน่วยงานและหมวดหมู่", data.departmentCategory, "department", "category", "หน่วยงาน", "หมวดหมู่", 40);
  renderComboTable("portfolio-department-type", "หน่วยงานและประเภทสินทรัพย์", data.departmentType, "department", "type", "หน่วยงาน", "ประเภท", 40);
  renderTable("portfolio-diversity", "ความหลากหลายของพอร์ตตามหน่วยงาน", [
    { label: "หน่วยงาน", render: (row) => drillButton(row.department, "department", row.departmentFilterValue) },
    { label: "สินทรัพย์", render: (row) => formatCount(row.assets) },
    { label: "หมวดหมู่ไม่ซ้ำ", render: (row) => formatCount(row.distinctCategories) },
    { label: "ประเภทไม่ซ้ำ", render: (row) => formatCount(row.distinctTypes) },
  ], data.departmentDiversity);
}

function sortDepartmentRows(rows) {
  return [...(rows || [])].sort((left, right) => {
    const a = left[departmentSort.key];
    const b = right[departmentSort.key];
    const result = typeof a === "number" || typeof b === "number"
      ? (Number(a ?? -Infinity) - Number(b ?? -Infinity))
      : String(a ?? "").localeCompare(String(b ?? ""), "th");
    return departmentSort.direction === "asc" ? result : -result;
  });
}

function renderDepartments(data) {
  const rows = sortDepartmentRows(data.rows);
  renderTable("department-scorecard", "ตารางเปรียบเทียบหน่วยงาน", [
    { label: "หน่วยงาน", render: (row) => drillButton(row.label, "department", row.filterValue) },
    { label: "สินทรัพย์", key: "totalAssets", sortKey: "totalAssets", render: (row) => formatCount(row.totalAssets) },
    { label: "สัดส่วน", key: "assetShareRate", sortKey: "assetShareRate", render: (row) => formatPercent(row.assetShareRate) },
    { label: "พร้อมใช้", key: "availabilityRate", sortKey: "availabilityRate", render: (row) => formatPercent(row.availabilityRate) },
    { label: "ชำรุด", key: "damageRate", sortKey: "damageRate", render: (row) => formatPercent(row.damageRate) },
    { label: "ไม่มีตำแหน่ง", key: "missingLocationRate", sortKey: "missingLocationRate", render: (row) => formatPercent(row.missingLocationRate) },
    { label: "อายุเฉลี่ย", key: "averageAssetAge", sortKey: "averageAssetAge", render: (row) => row.averageAssetAge === null ? "—" : `${row.averageAssetAge} ปี` },
    { label: `อายุเกิน ${filters.ageThreshold}`, key: "assetsOlderThanThreshold", sortKey: "assetsOlderThanThreshold", render: (row) => formatCount(row.assetsOlderThanThreshold) },
    { label: "อัตราสินทรัพย์เก่า", key: "oldAssetRate", sortKey: "oldAssetRate", render: (row) => formatPercent(row.oldAssetRate) },
    { label: "ธงต่ำกว่าเกณฑ์", key: "belowThresholdRate", sortKey: "belowThresholdRate", render: (row) => formatPercent(row.belowThresholdRate) },
  ], rows);
  renderRankedBars("department-old-ranking", [...rows].sort((a, b) => (b.oldAssetRate ?? -1) - (a.oldAssetRate ?? -1)), {
    labelKey: "label", countKey: "assetsOlderThanThreshold", rateKey: "oldAssetRate", filterKey: "department", valueKey: "filterValue", limit: 10, sort: false,
  });
  renderRankedBars("department-location-ranking", [...rows].sort((a, b) => (b.missingLocationRate ?? -1) - (a.missingLocationRate ?? -1)), {
    labelKey: "label", countKey: "missingLocationAssets", rateKey: "missingLocationRate", filterKey: "department", valueKey: "filterValue", limit: 10, sort: false,
  });
}

function renderLocations(data) {
  const summary = document.getElementById("location-coverage-summary");
  if (summary) {
    summary.innerHTML = `
      <dl class="location-coverage-list">
        <div><dt>ตำแหน่งที่ระบุ</dt><dd>${formatCount(latestPayload.overview.locationAssignedAssets)}</dd></div>
        <div><dt>รายละเอียดครบทั้งอาคาร ชั้น ห้อง และพื้นที่</dt><dd>${formatCount(latestPayload.overview.locationDetailCompleteAssets)}</dd></div>
        <div><dt>ระบุแล้วแต่รายละเอียดไม่ครบ</dt><dd>${formatCount(latestPayload.overview.locationDetailsIncompleteAssets)}</dd></div>
        <div><dt>ไม่มีตำแหน่งตามธงคลัง</dt><dd>${formatCount(latestPayload.overview.missingLocationAssets)}</dd></div>
      </dl>`;
  }
  renderRankedBars("location-buildings", data.building, { labelKey: "label", countKey: "totalAssets", filterKey: "building", valueKey: "label", limit: 15 });
  renderRankedBars("location-floors", data.floor, { labelKey: "label", countKey: "totalAssets", limit: 15 });
  renderRankedBars("location-rooms", data.room, { labelKey: "label", countKey: "totalAssets", limit: 20 });
  renderComboTable("location-department-building", "หน่วยงานตามอาคาร", data.departmentBuilding, "department", "building", "หน่วยงาน", "อาคาร", 40);
  renderComboTable("location-category-building", "หมวดหมู่ตามอาคาร", data.categoryBuilding, "category", "building", "หมวดหมู่", "อาคาร", 40);
  renderTable("location-missing-departments", "ความครอบคลุมและรายละเอียดสถานที่ตามหน่วยงาน", [
    { label: "หน่วยงาน", render: (row) => drillButton(row.department, "department", row.departmentFilterValue) },
    { label: "สินทรัพย์", render: (row) => formatCount(row.totalAssets) },
    { label: "ไม่มีตำแหน่ง", render: (row) => formatCount(row.missingLocationAssets) },
    { label: "อัตราไม่มีตำแหน่ง", render: (row) => formatPercent(row.missingLocationRate) },
    { label: "ระบุตำแหน่งแล้ว", render: (row) => formatCount(row.locationAssignedAssets) },
    { label: "รายละเอียดไม่ครบ", render: (row) => formatCount(row.locationDetailsIncompleteAssets) },
  ], data.missingLocationByDepartment);
}

function renderAgeCrossTable(id, caption, source, labels) {
  const bands = Object.keys(AGE_LABELS);
  const rows = bands.map((band) => ({
    ageBand: AGE_LABELS[band],
    ...(source?.[band] || {}),
  }));
  const columns = [
    { label: "ช่วงอายุ", key: "ageBand" },
    ...labels.map(([key, label]) => ({ label, render: (row) => formatCount(row[key]) })),
  ];
  renderTable(id, caption, columns, rows, { emptyTitle: "ไม่มีข้อมูลอายุ" });
}

function renderAgeDimensionTable(id, caption, source, dimensionFilter) {
  const dimensions = new Map();
  for (const item of source || []) {
    const row = dimensions.get(item.dimension) || {
      dimension: item.dimension,
      filterValue: item.dimensionFilterValue,
    };
    row[item.ageBand] = item.assets;
    dimensions.set(item.dimension, row);
  }
  renderTable(id, caption, [
    { label: "มิติ", render: (row) => drillButton(row.dimension, dimensionFilter, row.filterValue) },
    ...Object.keys(AGE_LABELS).map((band) => ({ label: AGE_LABELS[band], render: (row) => formatCount(row[band] || 0) })),
  ], [...dimensions.values()]);
}

function rankByOldRate(rows) {
  return [...(rows || [])].sort((left, right) =>
    ((right.oldAssetRate ?? -1) - (left.oldAssetRate ?? -1)) ||
    (right.assetsOlderThanThreshold - left.assetsOlderThanThreshold),
  );
}

function renderAging(data) {
  const bands = Object.entries(data.ageDistribution || {}).map(([key, assets]) => ({ key, label: AGE_LABELS[key] || key, assets }));
  renderRankedBars("aging-distribution", bands, { labelKey: "label", countKey: "assets", filterKey: "ageBand", valueKey: "key", limit: 7, sort: false });
  renderAgeCrossTable("aging-availability", "จำนวนตามช่วงอายุและความพร้อม", data.ageAvailability, [
    ["available", "พร้อมใช้งาน"], ["unavailable", "ไม่พร้อมใช้งาน"], ["unknown", "ไม่ระบุ"],
  ]);
  renderAgeCrossTable("aging-damage", "จำนวนตามช่วงอายุและสภาพชำรุด", data.ageDamage, [
    ["damaged", "ชำรุด"], ["notDamaged", "ไม่ชำรุด"], ["unknown", "ไม่ระบุ"],
  ]);
  const groups = [
    ["aging-departments", data.replacementPressureDepartments, "หน่วยงาน"],
    ["aging-categories", data.replacementPressureCategories, "หมวดหมู่"],
    ["aging-types", data.replacementPressureTypes, "ประเภท"],
  ];
  for (const [id, rows, filterKey] of groups) {
    renderRankedBars(id, rankByOldRate(rows), {
      labelKey: "label", countKey: "assetsOlderThanThreshold", rateKey: "oldAssetRate", filterKey, valueKey: "filterValue", limit: 10, sort: false,
    });
  }
  renderAgeDimensionTable("aging-by-department", "จำนวนสินทรัพย์ตามหน่วยงานและช่วงอายุ", data.byDepartment, "department");
  renderAgeDimensionTable("aging-by-category", "จำนวนสินทรัพย์ตามหมวดหมู่และช่วงอายุ", data.byCategory, "category");
  renderAgeDimensionTable("aging-by-type", "จำนวนสินทรัพย์ตามประเภทและช่วงอายุ", data.byType, "type");
}

function renderAcquisition(data) {
  const chronological = (left, right) => {
    if (left.filterValue === "__missing__") return 1;
    if (right.filterValue === "__missing__") return -1;
    return Number(left.label) - Number(right.label);
  };
  renderRankedBars("acquisition-years", data.years, { labelKey: "label", countKey: "totalAssets", limit: 20, sort: chronological });
  renderRankedBars("acquisition-fiscal-years", data.fiscalYears, { labelKey: "label", countKey: "totalAssets", limit: 20, sort: chronological });
  renderTable("acquisition-cohorts", "รุ่นสินทรัพย์ตามปีจัดหา", [
    { label: "ปีจัดหา (ค.ศ.)", key: "label" },
    { label: "จำนวน", render: (row) => formatCount(row.totalAssets) },
    { label: "อายุเฉลี่ย", render: (row) => row.averageAssetAge === null ? "—" : `${row.averageAssetAge} ปี` },
    { label: `อายุเกิน ${filters.ageThreshold}`, render: (row) => formatCount(row.assetsOlderThanThreshold) },
    { label: "อัตราอายุเกินเกณฑ์", render: (row) => formatPercent(row.oldAssetRate) },
    { label: "พร้อมใช้งาน", render: (row) => formatPercent(row.availabilityRate) },
  ], data.years);
  renderRankedBars("acquisition-sources", data.sources, { labelKey: "label", countKey: "totalAssets", filterKey: "source", valueKey: "label", limit: 15 });
  renderTable("acquisition-source-metrics", "ตัวชี้วัดสินทรัพย์ตามแหล่งเงิน", [
    { label: "แหล่งเงิน", render: (row) => drillButton(row.label, "source", row.filterValue) },
    { label: "จำนวน", render: (row) => formatCount(row.totalAssets) },
    { label: "อายุเฉลี่ย", render: (row) => row.averageAssetAge === null ? "—" : `${row.averageAssetAge} ปี` },
    { label: "อายุเกินเกณฑ์", render: (row) => formatPercent(row.oldAssetRate) },
    { label: "พร้อมใช้งาน", render: (row) => formatPercent(row.availabilityRate) },
  ], data.sources);
  renderComboTable("acquisition-year-department", "ปีจัดหาแยกตามหน่วยงาน", data.byDepartment, "acquisitionYear", "department", "ปีจัดหา", "หน่วยงาน", 40);
  renderComboTable("acquisition-year-category", "ปีจัดหาแยกตามหมวดหมู่", data.byCategory, "acquisitionYear", "category", "ปีจัดหา", "หมวดหมู่", 40);
  renderComboTable("acquisition-year-type", "ปีจัดหาแยกตามประเภท", data.byType, "acquisitionYear", "type", "ปีจัดหา", "ประเภท", 40);
  renderComboTable("acquisition-fiscal-category", "ปีงบประมาณจัดหาแยกตามหมวดหมู่", data.byFiscalCategory, "acquisitionFiscalYear", "category", "ปีงบประมาณจัดหา", "หมวดหมู่", 40);
  renderComboTable("acquisition-source-department", "แหล่งเงินแยกตามหน่วยงาน", data.sourceDepartment, "source", "department", "แหล่งเงิน", "หน่วยงาน", 40);
  renderComboTable("acquisition-source-category", "แหล่งเงินแยกตามหมวดหมู่", data.sourceCategory, "source", "category", "แหล่งเงิน", "หมวดหมู่", 40);
}

function renderGovernance(data) {
  renderTable("governance-quality-fields", "สรุปช่องข้อมูลที่ขาด", [
    { label: "ช่องข้อมูล", render: (row) => escapeHtml(row.label) },
    { label: "ระดับ", render: (row) => row.tier === "essential" ? "ตัวระบุ/ผู้ถือครอง" : "ข้อมูลประกอบ" },
    { label: "ขาดข้อมูล", render: (row) => formatCount(row.missingAssets) },
    { label: "อัตราขาด", render: (row) => formatPercent(row.missingRate) },
  ], Object.values(data.qualityFields || {}));
  renderTable("governance-quality-departments", "ความครบถ้วนของข้อมูลสำคัญตามหน่วยงาน", [
    { label: "หน่วยงาน", render: (row) => drillButton(row.department, "department", row.departmentFilterValue) },
    { label: "สินทรัพย์", render: (row) => formatCount(row.totalAssets) },
    { label: "ข้อมูลสำคัญไม่ครบ", render: (row) => formatCount(row.missingCriticalMetadata) },
    { label: "อัตราขาด", render: (row) => formatPercent(row.missingCriticalRate) },
    { label: "รหัสขาด", render: (row) => formatPercent(row.missingByField.assetCode?.rate) },
    { label: "ชื่อขาด", render: (row) => formatPercent(row.missingByField.assetName?.rate) },
    { label: "หน่วยงานขาด", render: (row) => formatPercent(row.missingByField.department?.rate) },
    { label: "ไม่มีตำแหน่ง", render: (row) => formatPercent(row.missingByField.location?.rate) },
  ], data.qualityByDepartment);
  const summary = document.getElementById("governance-exception-summary");
  if (summary) {
    summary.textContent = `${formatCount(data.exceptionsTotal)} สินทรัพย์มีเงื่อนไขที่ควรตรวจสอบ · แสดง 50 รายการแรกตามลำดับความสำคัญ`;
  }
  renderTable("governance-exceptions", "รายการสินทรัพย์ที่ควรตรวจสอบ", [
    { label: "ลำดับ", render: (row) => `<span class="priority-chip priority-${row.priority === "สูง" ? "high" : row.priority === "ควรตรวจสอบ" ? "medium" : "low"}">${escapeHtml(row.priority)}</span>` },
    { label: "รหัส", render: (row) => row.assetId ? `<a class="dashboard-drill-button" href="#/inventory/asset/${encodeURIComponent(row.assetId)}">${escapeHtml(displayValue(row.assetCode))}</a>` : escapeHtml(displayValue(row.assetCode)) },
    { label: "ชื่อสินทรัพย์", render: (row) => escapeHtml(displayValue(row.assetName)) },
    { label: "หน่วยงาน", render: (row) => escapeHtml(displayValue(row.department)) },
    { label: "หมวดหมู่", render: (row) => escapeHtml(displayValue(row.category)) },
    { label: "ประเภท", render: (row) => escapeHtml(displayValue(row.type)) },
    { label: "อายุ", render: (row) => row.age === null ? "ไม่ทราบ" : `${formatCount(row.age)} ปี` },
    { label: "สถานะ", render: (row) => escapeHtml(displayValue(row.status)) },
    { label: "ความพร้อม", render: (row) => escapeHtml(row.availability) },
    { label: "สภาพ", render: (row) => escapeHtml(row.damaged) },
    { label: "สถานที่", render: (row) => escapeHtml(row.location) },
    { label: "เหตุผล", render: (row) => escapeHtml(row.attentionReason) },
  ], data.exceptions, { limit: 50 });
}

function renderDashboard(payload) {
  latestPayload = payload;
  renderOverview(payload.overview, payload);
  renderPortfolio(payload.portfolio);
  renderDepartments(payload.departments);
  renderLocations(payload.locations);
  renderAging(payload.aging);
  renderAcquisition(payload.acquisition);
  renderGovernance(payload.governance);
}

function setRequestState(kind, message = "") {
  const state = document.getElementById("dashboard-request-state");
  const detail = document.getElementById("dashboard-request-message");
  const retry = document.getElementById("dashboard-retry");
  if (!state || !detail) return;
  state.hidden = kind === "ready";
  state.className = `api-state dashboard-request-state api-state-${kind === "empty" ? "empty" : kind}`;
  state.setAttribute("role", kind === "error" ? "alert" : "status");
  detail.textContent = message;
  if (retry) retry.hidden = kind !== "error";
  state.dataset.state = kind;
}

function updateSnapshotLabel(payload) {
  const label = document.getElementById("dashboard-snapshot-context");
  const date = document.getElementById("dashboard-snapshot-date");
  const state = document.getElementById("dashboard-data-state");
  const detail = document.getElementById("dashboard-data-detail");
  if (!payload.snapshot) {
    if (label) label.textContent = "ยังไม่มีชุดข้อมูล";
    if (date) date.textContent = "—";
    if (state) state.textContent = "ไม่พบข้อมูลสินทรัพย์";
    if (detail) detail.textContent = "คลังไม่มีชุดข้อมูลสำหรับตัวกรองที่เลือก";
    return;
  }
  const snapshotDate = formatDate(payload.snapshot.date);
  if (label) label.textContent = `${formatCount(payload.overview?.totalAssets)} สินทรัพย์ตามตัวกรอง · ${snapshotDate}`;
  if (date) date.textContent = snapshotDate;
  if (state) state.textContent = "ข้อมูลเชื่อมต่อจากคลัง MySQL";
  if (detail) detail.textContent = "สรุปจำนวนด้วย SUM(asset_count) · ธงต่ำกว่าเกณฑ์แสดงตามข้อมูลคลัง โดยความหมายทางธุรกิจยังไม่ได้รับการยืนยัน";
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
  const snapshotSelect = document.getElementById("dashboard-filter-snapshot");
  if (snapshotSelect) {
    const latestDate = payload.snapshotOptions?.[0]?.date;
    const snapshotOptions = [
      ["latest", `ชุดข้อมูลล่าสุด${latestDate ? ` · ${formatDate(latestDate)}` : ""}`],
      ...(payload.snapshotOptions || []).map((snapshot) => [String(snapshot.key), formatDate(snapshot.date)]),
    ];
    const selected = String(filters.snapshot);
    snapshotSelect.innerHTML = snapshotOptions.map(([value, label]) =>
      `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`,
    ).join("");
    snapshotSelect.value = selected;
  }
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
    updateSelect(
      document.querySelector(`[data-dashboard-filter="${key}"]`),
      values || [],
      filters[key],
      label,
      (value) => [value, value === "__missing__" ? missingLabel : value],
    );
  }
  updateFilterCount();
}

function updateFilterCount() {
  const count = Object.entries(filters).filter(([key, value]) =>
    key !== "snapshot" && key !== "ageThreshold" && value !== FILTER_DEFAULTS[key],
  ).length;
  const target = document.getElementById("dashboard-filter-count");
  if (target) target.textContent = count === 0 ? "ยังไม่ได้กรอง" : `ใช้ตัวกรอง ${count} รายการ`;
}

async function loadDashboard() {
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
  const secondary = document.getElementById("overview-secondary-metrics");
  if (metrics) metrics.replaceChildren();
  if (secondary) secondary.replaceChildren();
  for (const element of document.querySelectorAll(".dashboard-chart, .dashboard-table-wrap, #overview-history-content")) {
    element.replaceChildren();
  }
}

function applyFilterAndRefresh(key, value, { navigateToExplorer = false } = {}) {
  if (!Object.hasOwn(FILTER_DEFAULTS, key)) return;
  filters[key] = key === "ageThreshold" ? Number(value) : String(value);
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
  updateFilterCount();
  loadDashboard();
  onFiltersChange({ ...filters });
  window.location.hash = "#/inventory/explorer";
}

export function initExecutiveDashboard({ onFilterChange = () => {} } = {}) {
  onFiltersChange = onFilterChange;
  document.querySelectorAll("[data-dashboard-filter]").forEach((select) => {
    select.addEventListener("change", () => applyFilterAndRefresh(select.dataset.dashboardFilter, select.value));
  });
  document.getElementById("dashboard-filter-reset")?.addEventListener("click", () => {
    filters = { ...FILTER_DEFAULTS };
    document.querySelectorAll("[data-dashboard-filter]").forEach((select) => {
      if (select.dataset.dashboardFilter === "snapshot") select.value = "latest";
      else select.value = "all";
    });
    const threshold = document.getElementById("age-threshold-input");
    if (threshold) threshold.value = "10";
    updateFilterCount();
    loadDashboard();
    onFiltersChange({ ...filters });
  });
  document.getElementById("age-threshold-input")?.addEventListener("change", (event) => {
    const value = Number.parseInt(event.currentTarget.value, 10);
    if (!Number.isInteger(value) || value < 1 || value > 50) {
      event.currentTarget.value = String(filters.ageThreshold);
      return;
    }
    applyFilterAndRefresh("ageThreshold", value);
  });
  document.getElementById("dashboard-retry")?.addEventListener("click", loadDashboard);
  document.getElementById("dashboard-sections")?.addEventListener("click", (event) => {
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
