import {
  ASSET_API_DEFAULT_PAGE_SIZE,
  clampPage,
  getAssetApiPageButtons,
  getAssetApiTotalPages as getTotalPages,
  normalizePageSize,
} from "./pagination.mjs";
import {
  ASSET_DETAIL_API_ENDPOINTS,
  ASSET_DETAIL_API_PAGE_SIZE,
  combineBorrowHistory,
  normalizeAssetId,
  sortMaintenanceHistory,
} from "./asset-detail.mjs";
import {
  buildAssetInventoryCsv,
  normalizeSnapshotSummary,
} from "./inventory-data.mjs?v=20261025.1";
import {
  buildAssetInventoryApiUrl,
  buildAssetInventoryExportUrl,
} from "./inventory-api.mjs?v=20261025.1";
import {
  getExecutiveDashboardFilters,
  initExecutiveDashboard,
  refreshExecutiveDashboard,
  setInventoryDashboardPage,
} from "./executive-dashboard.mjs?v=20261025.2";

const dashboardData = {
  moduleNav: [
    { id: "inventory", label: "ทะเบียนสินทรัพย์", marker: "AI", href: "#/inventory" },
    {
      id: "borrowing",
      label: "การยืมคืน",
      marker: "BR",
      href: "#/borrowing",
      description: "พื้นที่สำหรับจัดการคำขอยืมคืนจะเปิดใช้งานในขั้นตอนถัดไป",
    },
    {
      id: "maintenance",
      label: "ระบบซ่อม",
      marker: "MT",
      href: "#/maintenance",
      description: "พื้นที่สำหรับติดตามงานซ่อมจะเปิดใช้งานในขั้นตอนถัดไป",
    },
  ],
};

const ASSET_API_BASE_URL = new URL("../../assets_api/", import.meta.url).href;
const ASSET_INVENTORY_API_ENDPOINT = new URL(
  ASSET_DETAIL_API_ENDPOINTS.assets,
  ASSET_API_BASE_URL,
).href;
const DASHBOARD_SECTION_FILES = [
  "sections/executive-filters.html",
  "sections/executive-overview.html",
  "sections/executive-navigation.html",
  "sections/portfolio.html",
  "sections/departments.html",
  "sections/locations.html",
  "sections/aging.html",
  "sections/acquisition.html",
  "sections/governance.html",
  "sections/asset-register.html",
];
const ASSET_DETAIL_SECTION_FILE = "sections/asset-detail.html";
const THEME_STORAGE_KEY = "cpe-asset-inventory-theme";

const assetApiState = {
  status: "idle",
  page: 1,
  pageSize: ASSET_API_DEFAULT_PAGE_SIZE,
  rows: [],
  total: 0,
  matchedTotal: 0,
  filterOptions: { statuses: [], types: [] },
  summary: null,
  loadedAt: null,
  error: null,
};

const assetDetailState = {
  status: "idle",
  assetId: null,
  asset: null,
  error: null,
  borrow: { status: "idle", rows: [], error: null },
  maintenance: { status: "idle", rows: [], error: null },
};

let assetDetailRequestId = 0;
let assetApiRequestId = 0;
let assetApiSearchTimer;

let elements;

function readThemePreference() {
  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return theme === "light" || theme === "dark" ? theme : null;
  } catch {
    return null;
  }
}

function initializeThemeToggle() {
  const toggle = document.querySelector("#theme-toggle");
  if (!toggle) return;

  const systemTheme = window.matchMedia?.("(prefers-color-scheme: light)");
  let hasManualPreference = readThemePreference() !== null;

  const applyTheme = (theme) => {
    const isLight = theme === "light";
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
  };

  applyTheme(readThemePreference() ?? (systemTheme?.matches ? "light" : "dark"));
  toggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    hasManualPreference = true;
    applyTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The selected theme still applies for this page view without storage.
    }
  });

  const followSystemTheme = (event) => {
    if (!hasManualPreference) applyTheme(event.matches ? "light" : "dark");
  };
  if (typeof systemTheme?.addEventListener === "function") {
    systemTheme.addEventListener("change", followSystemTheme);
  } else {
    systemTheme?.addListener?.(followSystemTheme);
  }
}

function cacheElements() {
  elements = {
    moduleLinks: document.querySelector("#module-links"),
    dashboardSections: document.querySelector("#dashboard-sections"),
    assetDetailContainer: document.querySelector("#asset-detail-container"),
    modulePlaceholder: document.querySelector("#module-placeholder"),
    modulePlaceholderTitle: document.querySelector("#module-placeholder-title"),
    modulePlaceholderDescription: document.querySelector("#module-placeholder-description"),
    backToTop: document.querySelector("#back-to-top"),
    toast: document.querySelector("#toast"),
    assetApiStatus: document.querySelector("#asset-api-status"),
    assetApiUpdated: document.querySelector("#asset-api-updated"),
    assetApiTotal: document.querySelector("#asset-api-total"),
    assetApiLoaded: document.querySelector("#asset-api-loaded"),
    assetApiPages: document.querySelector("#asset-api-pages"),
    assetApiTypeCount: document.querySelector("#asset-api-type-count"),
    assetApiLatest: document.querySelector("#asset-api-latest"),
    assetApiSearch: document.querySelector("#asset-api-search"),
    assetApiPageSizeButtons: document.querySelector("#asset-api-page-size-buttons"),
    refreshAssetApiButton: document.querySelector("#refresh-asset-api-button"),
    assetApiExportButton: document.querySelector("#asset-api-export-button"),
    assetApiExportAllButton: document.querySelector("#asset-api-export-all-button"),
    assetApiLoading: document.querySelector("#asset-api-loading"),
    assetApiError: document.querySelector("#asset-api-error"),
    assetApiErrorMessage: document.querySelector("#asset-api-error-message"),
    assetApiTableWrap: document.querySelector("#asset-api-table-wrap"),
    assetApiTableScrollHint: document.querySelector("#asset-api-table-scroll-hint"),
    assetApiBody: document.querySelector("#asset-api-body"),
    assetApiMobileCards: document.querySelector("#asset-api-mobile-cards"),
    assetApiEmpty: document.querySelector("#asset-api-empty"),
    assetApiPageNavigation: document.querySelector(".asset-page-navigation"),
    assetApiPrevious: document.querySelector("#asset-api-previous"),
    assetApiPageJumpBack: document.querySelector("#asset-api-page-jump-back"),
    assetApiPageJumpForward: document.querySelector("#asset-api-page-jump-forward"),
    assetApiNext: document.querySelector("#asset-api-next"),
    assetApiFirstPageButton: document.querySelector("#asset-api-first-page-button"),
    assetApiFinalPageButtons: document.querySelector("#asset-api-final-page-buttons"),
    assetApiPageInput: document.querySelector("#asset-api-page-input"),
    assetApiPageLabel: document.querySelector("#asset-api-page-label"),
    assetApiStatusMix: document.querySelector("#asset-api-status-mix"),
    assetApiResultsCount: document.querySelector("#asset-api-results-count"),
    assetDetailLoading: document.querySelector("#asset-detail-loading"),
    assetDetailError: document.querySelector("#asset-detail-error"),
    assetDetailErrorMessage: document.querySelector("#asset-detail-error-message"),
    assetDetailContent: document.querySelector("#asset-detail-content"),
    assetDetailTitle: document.querySelector("#asset-detail-title"),
    assetDetailSubtitle: document.querySelector("#asset-detail-subtitle"),
    assetDetailName: document.querySelector("#asset-detail-name"),
    assetDetailCode: document.querySelector("#asset-detail-code"),
    assetDetailStatus: document.querySelector("#asset-detail-status"),
    assetDetailUpdated: document.querySelector("#asset-detail-updated"),
    assetDetailFields: document.querySelector("#asset-detail-fields"),
    assetBorrowHistoryStatus: document.querySelector("#asset-borrow-history-status"),
    assetBorrowHistory: document.querySelector("#asset-borrow-history"),
    assetMaintenanceHistoryStatus: document.querySelector("#asset-maintenance-history-status"),
    assetMaintenanceHistory: document.querySelector("#asset-maintenance-history"),
  };
}

async function loadDashboardSections() {
  const container = document.querySelector("#dashboard-sections");
  if (!container) throw new Error("ไม่พบพื้นที่สำหรับโหลดส่วนแดชบอร์ด");

  const responses = await Promise.all(
    DASHBOARD_SECTION_FILES.map((file) => fetch(file, {
      cache: "no-cache",
      headers: { Accept: "text/html" },
    })),
  );
  const failedResponse = responses.find((response) => !response.ok);
  if (failedResponse) throw new Error(`โหลดส่วนแดชบอร์ดไม่สำเร็จ (HTTP ${failedResponse.status})`);

  const sections = await Promise.all(responses.map((response) => response.text()));
  container.innerHTML = sections.join("\n");
  container.removeAttribute("aria-busy");
}

async function loadAssetDetailSection() {
  const container = document.querySelector("#asset-detail-container");
  if (!container) throw new Error("ไม่พบพื้นที่สำหรับโหลดหน้ารายละเอียดสินทรัพย์");

  const response = await fetch(ASSET_DETAIL_SECTION_FILE, { headers: { Accept: "text/html" } });
  if (!response.ok) throw new Error(`โหลดหน้ารายละเอียดสินทรัพย์ไม่สำเร็จ (HTTP ${response.status})`);

  container.innerHTML = await response.text();
  container.removeAttribute("aria-busy");
}

function showDashboardLoadError() {
  const container = document.querySelector("#dashboard-sections");
  if (!container) return;

  const errorState = document.createElement("div");
  errorState.className = "api-state api-state-error";
  errorState.setAttribute("role", "alert");

  const heading = document.createElement("strong");
  heading.textContent = "ไม่สามารถโหลดส่วนแดชบอร์ด";
  const detail = document.createElement("span");
  detail.textContent = "โปรดเปิดหน้านี้ผ่านเซิร์ฟเวอร์ภายในเครื่องแล้วลองใหม่อีกครั้ง";

  errorState.append(heading, detail);
  container.replaceChildren(errorState);
  container.removeAttribute("aria-busy");
}

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(value);
const percent = (value) => `${value.toFixed(1)}%`;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[character];
  });

const displayValue = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") return "—";
  return String(value);
};

function parseApiDate(value) {
  if (!value) return null;
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatApiDate(value, includeTime = false) {
  const date = value instanceof Date ? value : parseApiDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function getAssetApiTotalPages() {
  return getTotalPages(assetApiState.matchedTotal, assetApiState.pageSize);
}

async function fetchAssetApiPage(endpointName, page = 1, limit = ASSET_DETAIL_API_PAGE_SIZE) {
  const endpoint = new URL(endpointName, `${ASSET_API_BASE_URL.replace(/\/+$/, "")}/`);
  endpoint.searchParams.set("limit", String(limit));
  endpoint.searchParams.set("page", String(page));

  const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${endpointName} คำขอล้มเหลว (HTTP ${response.status})`);

  const payload = await response.json();
  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new Error(payload?.message || `${endpointName} ตอบกลับในรูปแบบที่ไม่คาดคิด`);
  }

  return {
    rows: payload.data.filter((row) => row && typeof row === "object"),
    total: Number(payload.total) || payload.data.length,
  };
}

async function fetchAssetApiCollection(endpointName) {
  const rows = [];
  let page = 1;
  let total = 0;

  while (page <= 100) {
    const result = await fetchAssetApiPage(endpointName, page);
    rows.push(...result.rows);
    total = Math.max(total, result.total);

    if (result.rows.length === 0 || rows.length >= total) return rows;
    page += 1;
  }

  throw new Error(`${endpointName} มีจำนวนหน้ามากเกินกว่าจะโหลดในหน้ารายละเอียด`);
}

async function fetchAssetById(assetId) {
  const existingAsset = assetApiState.rows.find((row) => Number(row.asset_id) === assetId);
  if (existingAsset) return existingAsset;

  const estimatedPage = Math.max(1, Math.ceil(assetId / ASSET_DETAIL_API_PAGE_SIZE));
  const estimatedPageResult = await fetchAssetApiPage(
    ASSET_DETAIL_API_ENDPOINTS.assets,
    estimatedPage,
    ASSET_DETAIL_API_PAGE_SIZE,
  );
  const estimatedAsset = estimatedPageResult.rows.find((row) => Number(row.asset_id) === assetId);
  if (estimatedAsset) return estimatedAsset;

  const allAssets = await fetchAssetApiCollection(ASSET_DETAIL_API_ENDPOINTS.assets);
  return allAssets.find((row) => Number(row.asset_id) === assetId) || null;
}

function assetStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (/ready|available|พร้อม|ใช้งาน/.test(normalized)) return "success";
  if (/damage|broken|repair|ชำรุด|เสีย|ซ่อม/.test(normalized)) return "danger";
  if (/pending|wait|รอ|ตรวจ/.test(normalized)) return "warning";
  return "info";
}

function getCurrentRouteSegments() {
  return window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

function getCurrentAssetId() {
  const [moduleId, routeName, rawAssetId] = getCurrentRouteSegments();
  return moduleId === "inventory" && routeName === "asset" ? normalizeAssetId(rawAssetId) : null;
}

function getCurrentDashboardPage() {
  const [, routeName] = getCurrentRouteSegments();
  return ["overview", "portfolio", "departments", "locations", "aging", "acquisition", "governance", "explorer"].includes(routeName)
    ? routeName
    : "overview";
}

function handleDashboardSectionClick(event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!(event.target instanceof Element)) return;

  const link = event.target.closest(".inventory-view-nav [data-dashboard-link]");
  if (!link || link.dataset.dashboardLink !== getCurrentDashboardPage()) return;

  event.preventDefault();
  window.location.hash = "#/inventory/overview";
}

function scrollAssetExplorerIntoView() {
  const explorer = elements.dashboardSections.querySelector('[data-dashboard-page="explorer"]');
  if (!explorer) return;

  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  window.requestAnimationFrame(() => explorer.scrollIntoView({ behavior, block: "start" }));
}

function getCurrentModuleId() {
  const [route] = getCurrentRouteSegments();
  return dashboardData.moduleNav.some((module) => module.id === route) ? route : "inventory";
}

function renderModuleNav(activeModuleId = getCurrentModuleId()) {
  elements.moduleLinks.innerHTML = dashboardData.moduleNav
    .map(
      (module) => `
        <a class="module-link" href="${escapeHtml(module.href)}"${module.id === activeModuleId ? ' aria-current="page"' : ""}>
          <span class="module-link-mark" aria-hidden="true">${escapeHtml(module.marker)}</span>
          ${escapeHtml(module.label)}
        </a>
      `,
    )
    .join("");
}

function formatApiCurrency(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "—";

  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(amount)
    : displayValue(value);
}

function renderAssetDetailFields(asset) {
  const fields = [
    ["รหัสสินทรัพย์", asset.asset_code],
    ["ชื่อสินทรัพย์", asset.asset_name],
    ["รหัสฐานข้อมูล", asset.asset_id],
    ["ประเภท", asset.type_name],
    ["รหัสประเภท", asset.type_code],
    ["รหัสประเภทฐานข้อมูล", asset.type_id],
    ["รหัสหมวดหมู่", asset.category_id],
    ["ยี่ห้อ", asset.brand],
    ["ปีที่จัดซื้อ", asset.year_purchase],
    ["ปีงบประมาณ", asset.year_fiscal],
    ["แหล่งเงิน", asset.source],
    ["สถานะสินทรัพย์", asset.asset_status],
    ["หน่วยงาน", asset.department_name],
    ["รหัสหน่วยงาน", asset.department_id],
    ["รหัสสถานที่", asset.location_id],
    ["วันที่ชุดข้อมูล", formatApiDate(asset.snapshot_date, true)],
  ];

  elements.assetDetailFields.innerHTML = fields
    .map(
      ([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(displayValue(value))}</dd>
        </div>
      `,
    )
    .join("");
}

function setAssetHistoryStatus(element, state) {
  const status = {
    loading: ["กำลังโหลด", "info"],
    ready: [`${formatNumber(state.rows.length)} รายการ`, "success"],
    unavailable: ["รอ API", "warning"],
  }[state.status] || ["กำลังรอข้อมูล", "info"];

  element.textContent = status[0];
  element.className = `status-chip status-chip-${status[1]}`;
}

function renderHistoryMessage(container, heading, detail) {
  container.innerHTML = `
    <div class="asset-history-state">
      <strong>${escapeHtml(heading)}</strong>
      <p>${escapeHtml(detail)}</p>
    </div>
  `;
}

function renderAssetBorrowHistory() {
  const state = assetDetailState.borrow;
  setAssetHistoryStatus(elements.assetBorrowHistoryStatus, state);

  if (state.status === "loading") {
    renderHistoryMessage(elements.assetBorrowHistory, "กำลังโหลดประวัติการยืมคืน", "กำลังตรวจสอบข้อมูลจากโมดูลการยืมคืน");
    return;
  }

  if (state.status === "unavailable") {
    renderHistoryMessage(
      elements.assetBorrowHistory,
      "ยังไม่พบ API ประวัติการยืมคืน",
      "ส่วนนี้จะเริ่มแสดงข้อมูลเมื่อโมดูลการยืมคืนของสมาชิก 2 เปิด endpoint แล้ว",
    );
    return;
  }

  if (state.rows.length === 0) {
    renderHistoryMessage(elements.assetBorrowHistory, "ยังไม่พบประวัติการยืมคืน", "สินทรัพย์นี้ยังไม่มีรายการในข้อมูลที่เชื่อมต่อ");
    return;
  }

  elements.assetBorrowHistory.innerHTML = `
    <div class="table-wrap asset-history-table-wrap">
      <table class="asset-history-table">
        <caption class="sr-only">ประวัติการยืมคืนของสินทรัพย์</caption>
        <thead>
          <tr>
            <th scope="col">วันที่ยืม</th>
            <th scope="col">กำหนดคืน</th>
            <th scope="col">สถานะคำขอ</th>
            <th scope="col">สถานะคืน</th>
            <th scope="col">คืนจริง</th>
          </tr>
        </thead>
        <tbody>
          ${state.rows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(formatApiDate(row.borrow_date || row.created_at))}</td>
                  <td>${escapeHtml(formatApiDate(row.return_date))}</td>
                  <td><span class="status-chip status-chip-${assetStatusTone(row.status)}">${escapeHtml(displayValue(row.status))}</span></td>
                  <td>${escapeHtml(displayValue(row.return_status || row.item_status))}</td>
                  <td>${escapeHtml(formatApiDate(row.actual_return_date || row.returned_at))}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAssetMaintenanceHistory() {
  const state = assetDetailState.maintenance;
  setAssetHistoryStatus(elements.assetMaintenanceHistoryStatus, state);

  if (state.status === "loading") {
    renderHistoryMessage(elements.assetMaintenanceHistory, "กำลังโหลดประวัติการซ่อม", "กำลังตรวจสอบข้อมูลจากโมดูลระบบซ่อม");
    return;
  }

  if (state.status === "unavailable") {
    renderHistoryMessage(
      elements.assetMaintenanceHistory,
      "ยังไม่พบ API ประวัติการซ่อม",
      "ส่วนนี้จะเริ่มแสดงข้อมูลเมื่อโมดูลระบบซ่อมของสมาชิก 3 เปิด endpoint แล้ว",
    );
    return;
  }

  if (state.rows.length === 0) {
    renderHistoryMessage(elements.assetMaintenanceHistory, "ยังไม่พบประวัติการซ่อม", "สินทรัพย์นี้ยังไม่มีรายการในข้อมูลที่เชื่อมต่อ");
    return;
  }

  elements.assetMaintenanceHistory.innerHTML = `
    <div class="table-wrap asset-history-table-wrap">
      <table class="asset-history-table">
        <caption class="sr-only">ประวัติการซ่อมของสินทรัพย์</caption>
        <thead>
          <tr>
            <th scope="col">วันที่แจ้ง</th>
            <th scope="col">รายละเอียด</th>
            <th scope="col">สถานะ</th>
            <th scope="col">ค่าใช้จ่าย</th>
            <th scope="col">วันที่เสร็จ</th>
          </tr>
        </thead>
        <tbody>
          ${state.rows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(formatApiDate(row.repair_date || row.created_at))}</td>
                  <td>${escapeHtml(displayValue(row.detail))}</td>
                  <td><span class="status-chip status-chip-${assetStatusTone(row.status)}">${escapeHtml(displayValue(row.status))}</span></td>
                  <td class="age-cell">${escapeHtml(formatApiCurrency(row.cost))}</td>
                  <td>${escapeHtml(formatApiDate(row.complete_date))}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAssetDetailHistory() {
  renderAssetBorrowHistory();
  renderAssetMaintenanceHistory();
}

function renderAssetDetailState() {
  const isLoading = assetDetailState.status === "loading";
  const hasError = assetDetailState.status === "error";
  const isReady = assetDetailState.status === "ready";

  elements.assetDetailLoading.hidden = !isLoading;
  elements.assetDetailError.hidden = !hasError;
  elements.assetDetailContent.hidden = !isReady;

  if (hasError) {
    elements.assetDetailErrorMessage.textContent = assetDetailState.error || "ลองกลับไปที่ทะเบียนแล้วเปิดรายการนี้อีกครั้ง";
    return;
  }

  if (!isReady || !assetDetailState.asset) return;

  const asset = assetDetailState.asset;
  const code = displayValue(asset.asset_code);
  elements.assetDetailTitle.textContent = `รายละเอียดสินทรัพย์ ${code}`;
  elements.assetDetailSubtitle.textContent = "ข้อมูลจากคลังสินทรัพย์ พร้อมประวัติการยืมคืนและการซ่อมเมื่อ endpoint พร้อมใช้งาน";
  elements.assetDetailName.textContent = displayValue(asset.asset_name);
  elements.assetDetailCode.textContent = code;
  elements.assetDetailStatus.textContent = displayValue(asset.asset_status);
  elements.assetDetailStatus.className = `status-chip status-chip-${assetStatusTone(asset.asset_status)}`;
  elements.assetDetailUpdated.textContent = `ข้อมูล ณ วันที่ ${formatApiDate(asset.snapshot_date, true)}`;
  renderAssetDetailFields(asset);
  renderAssetDetailHistory();
}

async function loadAssetDetailHistory(assetId, requestId) {
  const [borrowItemsResult, borrowRequestsResult, maintenanceResult] = await Promise.allSettled([
    fetchAssetApiCollection(ASSET_DETAIL_API_ENDPOINTS.borrowItems),
    fetchAssetApiCollection(ASSET_DETAIL_API_ENDPOINTS.borrowRequests),
    fetchAssetApiCollection(ASSET_DETAIL_API_ENDPOINTS.maintenance),
  ]);

  if (requestId !== assetDetailRequestId || assetDetailState.assetId !== assetId) return;

  const borrowItems = borrowItemsResult.status === "fulfilled" ? borrowItemsResult.value : [];
  const borrowRequests = borrowRequestsResult.status === "fulfilled" ? borrowRequestsResult.value : [];
  const borrowUnavailable = borrowItemsResult.status === "rejected" || borrowRequestsResult.status === "rejected";
  const maintenanceUnavailable = maintenanceResult.status === "rejected";

  assetDetailState.borrow = {
    status: borrowUnavailable ? "unavailable" : "ready",
    rows: combineBorrowHistory(borrowItems, borrowRequests, assetId),
    error: borrowUnavailable
      ? borrowItemsResult.reason?.message || borrowRequestsResult.reason?.message
      : null,
  };
  assetDetailState.maintenance = {
    status: maintenanceUnavailable ? "unavailable" : "ready",
    rows: maintenanceUnavailable ? [] : sortMaintenanceHistory(maintenanceResult.value, assetId),
    error: maintenanceUnavailable ? maintenanceResult.reason?.message : null,
  };
  renderAssetDetailState();
}

async function loadAssetDetail(assetId) {
  const normalizedAssetId = normalizeAssetId(assetId);
  if (!normalizedAssetId) return;

  const requestId = ++assetDetailRequestId;
  assetDetailState.status = "loading";
  assetDetailState.assetId = normalizedAssetId;
  assetDetailState.asset = null;
  assetDetailState.error = null;
  assetDetailState.borrow = { status: "loading", rows: [], error: null };
  assetDetailState.maintenance = { status: "loading", rows: [], error: null };
  renderAssetDetailState();

  try {
    const asset = await fetchAssetById(normalizedAssetId);
    if (requestId !== assetDetailRequestId) return;
    if (!asset) throw new Error(`ไม่พบสินทรัพย์รหัส ${normalizedAssetId} ในคลังข้อมูล`);

    assetDetailState.status = "ready";
    assetDetailState.asset = asset;
    renderAssetDetailState();
    loadAssetDetailHistory(normalizedAssetId, requestId);
  } catch (error) {
    if (requestId !== assetDetailRequestId) return;
    assetDetailState.status = "error";
    assetDetailState.error = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุจาก API";
    renderAssetDetailState();
  }
}

function renderModuleView(moduleId = getCurrentModuleId()) {
  const activeModule = dashboardData.moduleNav.find((module) => module.id === moduleId) || dashboardData.moduleNav[0];
  const isInventory = activeModule.id === "inventory";
  const assetId = getCurrentAssetId();
  const isAssetDetail = isInventory && assetId !== null;

  elements.dashboardSections.hidden = !isInventory || isAssetDetail;
  elements.assetDetailContainer.hidden = !isAssetDetail;
  elements.modulePlaceholder.hidden = isInventory;

  if (isAssetDetail) {
    loadAssetDetail(assetId);
  } else if (!isInventory) {
    elements.modulePlaceholderTitle.textContent = activeModule.label;
    elements.modulePlaceholderDescription.textContent = activeModule.description;
    elements.modulePlaceholderTitle.focus({ preventScroll: true });
  } else {
    const pageId = getCurrentDashboardPage();
    setInventoryDashboardPage(pageId);
    if (pageId === "explorer") scrollAssetExplorerIntoView();
  }
}

function handleModuleRoute() {
  const activeModuleId = getCurrentModuleId();
  const isAssetDetail = getCurrentAssetId() !== null;
  renderModuleNav(activeModuleId);
  renderModuleView(activeModuleId);
  if (activeModuleId === "inventory" && !isAssetDetail && getCurrentDashboardPage() === "explorer") {
    loadAssetRegister(1);
  }
  if (activeModuleId !== "inventory" || isAssetDetail) window.scrollTo({ top: 0, behavior: "auto" });
}

function getCurrentInventorySnapshot() {
  return normalizeSnapshotSummary(assetApiState.summary?.current);
}

function getAssetApiPageRows() {
  return assetApiState.rows;
}

function renderAssetApiSummary() {
  const rows = assetApiState.rows;
  const types = new Set(rows.map((row) => row.type_name).filter(Boolean));
  const current = getCurrentInventorySnapshot();
  const totalPages = getAssetApiTotalPages();

  elements.assetApiTotal.textContent = assetApiState.status === "ready" ? formatNumber(assetApiState.total) : "—";
  elements.assetApiLoaded.textContent = assetApiState.status === "ready" ? formatNumber(rows.length) : "—";
  elements.assetApiPages.textContent =
    assetApiState.status === "ready"
      ? `หน้า ${formatNumber(assetApiState.page)} จาก ${formatNumber(totalPages)} · ${formatNumber(assetApiState.pageSize)} แถวต่อหน้า`
      : "กำลังรอข้อมูล";
  elements.assetApiTypeCount.textContent = assetApiState.status === "ready" ? formatNumber(types.size) : "—";
  elements.assetApiLatest.textContent = assetApiState.status === "ready" ? formatApiDate(current?.snapshotDate) : "—";
  elements.assetApiExportButton.disabled = assetApiState.status !== "ready" || getAssetApiPageRows().length === 0;
  elements.assetApiExportAllButton.disabled = assetApiState.status !== "ready" || assetApiState.matchedTotal === 0;

  if (assetApiState.status !== "ready") {
    elements.assetApiStatusMix.textContent = "สถานะในหน้าปัจจุบันจะแสดงเมื่อโหลดข้อมูลจากคลังแล้ว";
    return;
  }

  const statusCounts = rows.reduce((counts, row) => {
    const status = displayValue(row.asset_status);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const statusMix = Object.entries(statusCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 4)
    .map(([status, count]) => `${status}: ${formatNumber(count)}`)
    .join(" · ");

  elements.assetApiStatusMix.textContent = statusMix
    ? `สถานะในหน้าปัจจุบัน · ${statusMix}`
    : "ไม่มีแถวข้อมูลในหน้าปัจจุบัน";
}

function renderAssetApiPagination() {
  const totalPages = getAssetApiTotalPages();
  const isReady = assetApiState.status === "ready";
  const hasMultiplePages = totalPages > 1;

  renderAssetApiPageSizeButtons();
  renderAssetApiPageButtons();
  elements.assetApiPageInput.min = "1";
  elements.assetApiPageInput.max = String(totalPages);
  elements.assetApiPageInput.value = String(assetApiState.page);
  elements.assetApiPageInput.disabled = !isReady || !hasMultiplePages;
  elements.assetApiPageLabel.textContent = `หน้า ${formatNumber(assetApiState.page)} จาก ${formatNumber(totalPages)}`;

  const currentPage = clampPage(assetApiState.page, totalPages);
  const pageTargets = {
    current: currentPage,
    jumpBack: clampPage(currentPage - 2, totalPages),
    previous: clampPage(currentPage - 1, totalPages),
    next: clampPage(currentPage + 1, totalPages),
    jumpForward: clampPage(currentPage + 2, totalPages),
  };
  const relativePageButtons = [
    [elements.assetApiPageJumpBack, pageTargets.jumpBack, pageTargets.current > 1],
    [elements.assetApiPrevious, pageTargets.previous, pageTargets.current > 1],
    [elements.assetApiNext, pageTargets.next, pageTargets.current < totalPages],
    [elements.assetApiPageJumpForward, pageTargets.jumpForward, pageTargets.current < totalPages],
  ];
  relativePageButtons.forEach(([button, targetPage, canMove]) => {
    button.dataset.page = String(targetPage);
    button.disabled = !isReady || !canMove;
  });
}

function renderAssetApiPageSizeButtons() {
  const isReady = assetApiState.status === "ready";

  elements.assetApiPageSizeButtons.querySelectorAll("[data-page-size]").forEach((button) => {
    const isActive = Number(button.dataset.pageSize) === assetApiState.pageSize;
    button.classList.toggle("button-primary", isActive);
    button.classList.toggle("button-secondary", !isActive);
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.disabled = !isReady;
  });
}

function renderAssetApiPageButtons() {
  const totalPages = getAssetApiTotalPages();
  const isReady = assetApiState.status === "ready";
  const pageButtons = getAssetApiPageButtons(totalPages);
  const firstPages = pageButtons.slice(0, Math.min(2, pageButtons.length));
  const finalPages = pageButtons.length > 2 ? pageButtons.slice(-2) : [];
  const renderButton = (page) => {
    const isActive = page === assetApiState.page;
    const buttonVariant = isActive ? "button-primary" : "button-secondary";
    const disabledAttribute = isReady ? "" : " disabled";
    const currentAttribute = isActive ? ' aria-current="page"' : "";

    return `<button class="button ${buttonVariant} pagination-page-button${isActive ? " is-active" : ""}" type="button" data-page="${page}" aria-label="ไปหน้าที่ ${formatNumber(page)}"${currentAttribute}${disabledAttribute}>${formatNumber(page)}</button>`;
  };

  elements.assetApiFirstPageButton.innerHTML = firstPages.map(renderButton).join("");
  elements.assetApiFinalPageButtons.innerHTML = finalPages.map(renderButton).join("");
}

function formatAssetLocation(row) {
  const namedParts = [
    row.building,
    row.floor,
    row.room,
    row.area_name,
  ]
    .filter((value) => displayValue(value) !== "—")
    .map((value) => displayValue(value));

  if (namedParts.length > 0) return namedParts.join(" · ");

  const locationId = displayValue(row.location_id);
  return locationId === "—" ? locationId : `รหัสสถานที่ ${locationId}`;
}

function renderAssetApiMobileCard(row) {
  const status = displayValue(row.asset_status);
  const statusTone = assetStatusTone(row.asset_status);
  const assetCode = displayValue(row.asset_code);
  const assetDetailHref = `#/inventory/asset/${encodeURIComponent(String(row.asset_id))}`;

  return `
    <li class="asset-api-mobile-card">
      <article>
        <h3 class="asset-api-mobile-card-title">${escapeHtml(displayValue(row.asset_name))}</h3>
        <p class="asset-api-mobile-card-code"><span>รหัสสินทรัพย์</span><strong>${escapeHtml(assetCode)}</strong></p>
        <p class="asset-api-mobile-card-status"><span class="status-chip status-chip-${statusTone}">${escapeHtml(status)}</span></p>
        <dl class="asset-api-mobile-fields">
          <div><dt>หมวดหมู่</dt><dd>${escapeHtml(displayValue(row.category_name))}</dd></div>
          <div><dt>สถานที่</dt><dd>${escapeHtml(formatAssetLocation(row))}</dd></div>
        </dl>
        <details class="asset-api-mobile-details">
          <summary>รายละเอียดเพิ่มเติม</summary>
          <dl>
            <div><dt>ประเภท</dt><dd>${escapeHtml(displayValue(row.type_name))}</dd></div>
            <div><dt>ยี่ห้อ</dt><dd>${escapeHtml(displayValue(row.brand))}</dd></div>
            <div><dt>รุ่น</dt><dd>${escapeHtml(displayValue(row.model))}</dd></div>
            <div><dt>ปีที่จัดซื้อ</dt><dd>${escapeHtml(displayValue(row.year_purchase))}</dd></div>
            <div><dt>ปีงบประมาณ</dt><dd>${escapeHtml(displayValue(row.year_fiscal))}</dd></div>
            <div><dt>หน่วยงาน</dt><dd>${escapeHtml(displayValue(row.department_name))}</dd></div>
            <div><dt>รหัสสถานที่</dt><dd>${escapeHtml(displayValue(row.location_id))}</dd></div>
            <div><dt>วันที่ชุดข้อมูล</dt><dd>${escapeHtml(formatApiDate(row.snapshot_date))}</dd></div>
          </dl>
        </details>
        <a class="button button-secondary asset-detail-action" href="${assetDetailHref}" aria-label="ดูรายละเอียด ${escapeHtml(assetCode)}">
          ดูรายละเอียด
        </a>
      </article>
    </li>
  `;
}

function renderAssetApiTable() {
  if (assetApiState.status !== "ready") return;

  const rows = getAssetApiPageRows();
  elements.assetApiMobileCards.innerHTML = rows.map((row) => renderAssetApiMobileCard(row)).join("");
  elements.assetApiBody.innerHTML = rows
    .map((row) => {
      const status = displayValue(row.asset_status);
      const statusTone = assetStatusTone(row.asset_status);
      const typeAndBrand = [row.type_name, row.brand].filter((value) => displayValue(value) !== "—");

      return `
        <tr>
          <td>
            <div class="asset-cell">
              <strong>${escapeHtml(displayValue(row.asset_code))}</strong>
              <span>${escapeHtml(displayValue(row.asset_name))}</span>
            </div>
          </td>
          <td>
            <div class="asset-cell">
              <strong>${escapeHtml(displayValue(typeAndBrand[0]))}</strong>
              <span>${escapeHtml(displayValue(typeAndBrand[1]))}</span>
            </div>
          </td>
          <td><span class="status-chip status-chip-${statusTone}">${escapeHtml(status)}</span></td>
          <td class="age-cell">${escapeHtml(displayValue(row.year_purchase))}</td>
          <td>${escapeHtml(displayValue(row.department_name))}</td>
          <td>${escapeHtml(displayValue(row.location_id))}</td>
          <td>${escapeHtml(formatApiDate(row.snapshot_date))}</td>
          <td>
            <a class="button button-secondary asset-detail-action" href="#/inventory/asset/${encodeURIComponent(String(row.asset_id))}" aria-label="ดูรายละเอียด ${escapeHtml(displayValue(row.asset_code))}">
              ดูรายละเอียด
            </a>
          </td>
        </tr>
      `;
    })
    .join("");

  const hasRows = rows.length > 0;
  elements.assetApiTableWrap.hidden = !hasRows;
  elements.assetApiMobileCards.hidden = !hasRows;
  elements.assetApiTableScrollHint.hidden = !hasRows;
  elements.assetApiEmpty.hidden = hasRows;
  elements.assetApiResultsCount.textContent = `แสดง ${formatNumber(rows.length)} รายการในหน้านี้ · พบ ${formatNumber(assetApiState.matchedTotal)} รายการที่ตรงกับคำค้นและตัวกรอง จากทั้งหมด ${formatNumber(assetApiState.total)} รายการ`;
  elements.assetApiExportButton.disabled = !hasRows;
  elements.assetApiExportAllButton.disabled = assetApiState.matchedTotal === 0;
  renderAssetApiPagination();
}

function renderAssetApiState() {
  const isLoading = assetApiState.status === "loading";
  const hasError = assetApiState.status === "error";
  const isReady = assetApiState.status === "ready";

  elements.assetApiLoading.hidden = !isLoading;
  elements.assetApiError.hidden = !hasError;
  elements.assetApiTableWrap.hidden = !isReady;
  elements.assetApiMobileCards.hidden = !isReady;
  elements.assetApiTableScrollHint.hidden = !isReady || assetApiState.rows.length === 0;
  elements.assetApiEmpty.hidden = true;
  elements.assetApiResultsCount.textContent = isLoading ? "กำลังโหลดข้อมูลจากคลัง…" : "กำลังรอข้อมูลจากคลังข้อมูล";

  if (isLoading) {
    elements.assetApiStatus.textContent = "กำลังเชื่อมต่อ";
    elements.assetApiStatus.className = "status-chip status-chip-info";
    elements.assetApiUpdated.textContent = `กำลังขอข้อมูลหน้า ${formatNumber(assetApiState.page)}`;
  } else if (hasError) {
    elements.assetApiStatus.textContent = "ไม่พร้อมใช้งาน";
    elements.assetApiStatus.className = "status-chip status-chip-danger";
    elements.assetApiUpdated.textContent = "คำขอล้มเหลว";
    elements.assetApiErrorMessage.textContent = assetApiState.error || "ลองรีเฟรชแหล่งข้อมูลอีกครั้ง";
  } else if (isReady) {
    elements.assetApiStatus.textContent = "เชื่อมต่อคลังข้อมูลแล้ว";
    elements.assetApiStatus.className = "status-chip status-chip-success";
    elements.assetApiUpdated.textContent = `โหลดเมื่อ ${formatApiDate(assetApiState.loadedAt, true)}`;
  }

  renderAssetApiSummary();
  renderAssetApiPagination();
  if (isReady) renderAssetApiTable();
}

async function loadAssetRegister(page = assetApiState.page, pageSize = assetApiState.pageSize) {
  window.clearTimeout(assetApiSearchTimer);
  const requestId = ++assetApiRequestId;
  assetApiState.status = "loading";
  assetApiState.page = Math.max(1, Number.parseInt(page, 10) || 1);
  assetApiState.pageSize = normalizePageSize(pageSize);
  assetApiState.summary = null;
  assetApiState.error = null;
  renderAssetApiState();
  elements.refreshAssetApiButton.disabled = true;

  try {
    const endpoint = buildAssetInventoryApiUrl(ASSET_INVENTORY_API_ENDPOINT, {
      ...getExecutiveDashboardFilters(),
      page: assetApiState.page,
      pageSize: assetApiState.pageSize,
      search: elements.assetApiSearch.value,
    });

    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`คำขอล้มเหลว (HTTP ${response.status})`);

    const payload = await response.json();
    if (requestId !== assetApiRequestId) return;
    if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
      throw new Error(payload?.message || "ได้รับข้อมูลจาก fact_asset_inventory.php ในรูปแบบที่ไม่คาดคิด");
    }

    if (payload.data.some((row) => !row || typeof row !== "object")) {
      throw new Error("พบแถวสินทรัพย์ในคำตอบจาก fact_asset_inventory.php ที่ไม่ถูกต้อง");
    }

    const total = Number(payload.total);
    const matchedTotal = Number(payload.matchedTotal ?? payload.total);
    if (
      !Number.isSafeInteger(total) ||
      total < 0 ||
      !Number.isSafeInteger(matchedTotal) ||
      matchedTotal < 0 ||
      matchedTotal > total
    ) {
      throw new Error("จำนวนผลลัพธ์จาก fact_asset_inventory.php ไม่ถูกต้อง");
    }

    assetApiState.rows = payload.data;
    assetApiState.total = total;
    assetApiState.matchedTotal = matchedTotal;
    const filterOptions = payload.filterOptions && typeof payload.filterOptions === "object" ? payload.filterOptions : {};
    assetApiState.filterOptions = {
      statuses: Array.isArray(filterOptions.statuses)
        ? filterOptions.statuses.filter((value) => typeof value === "string")
        : [...new Set(payload.data.map((row) => row.asset_status).filter((value) => typeof value === "string"))],
      types: Array.isArray(filterOptions.types)
        ? filterOptions.types.filter((value) => typeof value === "string")
        : [...new Set(payload.data.map((row) => row.type_name).filter((value) => typeof value === "string"))],
    };
    assetApiState.summary = payload.summary && typeof payload.summary === "object" ? payload.summary : null;
    assetApiState.page = clampPage(payload.page ?? assetApiState.page, getAssetApiTotalPages());
    assetApiState.loadedAt = new Date();
    assetApiState.status = "ready";
    renderAssetApiState();
  } catch (error) {
    if (requestId !== assetApiRequestId) return;
    assetApiState.status = "error";
    assetApiState.error = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุจาก API";
    renderAssetApiState();
  } finally {
    if (requestId === assetApiRequestId) elements.refreshAssetApiButton.disabled = false;
  }
}

function renderBackToTop() {
  elements.backToTop.hidden = window.scrollY < 480;
}

function handleAssetApiPageButtonClick(event) {
  const button = event.target.closest("[data-page]");
  if (!button || button.disabled) return;

  loadAssetRegister(button.dataset.page);
}

function handleAssetApiPageSizeButtonClick(event) {
  const button = event.target.closest("[data-page-size]");
  if (!button || button.disabled) return;

  loadAssetRegister(1, button.dataset.pageSize);
}

function jumpToAssetApiPage() {
  const page = clampPage(elements.assetApiPageInput.value, getAssetApiTotalPages());
  elements.assetApiPageInput.value = String(page);
  loadAssetRegister(page);
}

function scrollToTop() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelector("#main-content").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
}

let toastTimer;
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

function exportCurrentAssetPage() {
  const rows = getAssetApiPageRows();
  if (assetApiState.status !== "ready" || rows.length === 0) return;

  const csv = buildAssetInventoryCsv(rows);
  const objectUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `ทะเบียนสินทรัพย์-หน้า-${assetApiState.page}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  showToast(`ส่งออก ${formatNumber(rows.length)} รายการจากหน้าปัจจุบันตามคำค้นและตัวกรองที่เลือก`);
}

function exportAllMatchingAssetRows() {
  if (assetApiState.status !== "ready" || assetApiState.matchedTotal === 0) return;

  const endpoint = buildAssetInventoryExportUrl(ASSET_INVENTORY_API_ENDPOINT, {
    ...getExecutiveDashboardFilters(),
    search: elements.assetApiSearch.value,
  });
  window.location.assign(endpoint);
  showToast(`กำลังส่งออกรายการที่ตรงกับตัวกรอง ${formatNumber(assetApiState.matchedTotal)} รายการ`);
}

function initInteractions() {
  elements.dashboardSections.addEventListener("click", handleDashboardSectionClick);
  elements.assetApiSearch.addEventListener("input", () => {
    window.clearTimeout(assetApiSearchTimer);
    assetApiRequestId += 1;
    assetApiState.status = "loading";
    assetApiState.error = null;
    renderAssetApiState();
    elements.refreshAssetApiButton.disabled = true;
    assetApiSearchTimer = window.setTimeout(() => loadAssetRegister(1), 300);
  });
  elements.assetApiPageSizeButtons.addEventListener("click", handleAssetApiPageSizeButtonClick);
  elements.refreshAssetApiButton.addEventListener("click", () => {
    refreshExecutiveDashboard();
    loadAssetRegister(1);
  });
  elements.assetApiExportButton.addEventListener("click", exportCurrentAssetPage);
  elements.assetApiExportAllButton.addEventListener("click", exportAllMatchingAssetRows);
  elements.assetApiPageNavigation.addEventListener("click", handleAssetApiPageButtonClick);
  elements.assetApiPageInput.addEventListener("change", jumpToAssetApiPage);
  elements.assetApiPageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      jumpToAssetApiPage();
    }
  });
  window.addEventListener("hashchange", handleModuleRoute);
  window.addEventListener("scroll", renderBackToTop, { passive: true });
  elements.backToTop.addEventListener("click", scrollToTop);
}

async function init() {
  await Promise.all([loadDashboardSections(), loadAssetDetailSection()]);
  cacheElements();
  renderModuleNav();
  renderModuleView();
  initInteractions();
  initExecutiveDashboard({
    onFilterChange: () => {
      if (getCurrentModuleId() === "inventory" && getCurrentDashboardPage() === "explorer" && !getCurrentAssetId()) {
        loadAssetRegister(1);
      }
    },
  });
  renderBackToTop();
  if (getCurrentDashboardPage() === "explorer") loadAssetRegister();
}

initializeThemeToggle();

init().catch((error) => {
  console.error("Dashboard initialization failed", error);
  showDashboardLoadError();
});
