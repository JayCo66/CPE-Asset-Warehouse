import {
  ASSET_API_DEFAULT_PAGE_SIZE,
  clampPage,
  getAssetApiPageButtons,
  getAssetApiTotalPages as getTotalPages,
  normalizePageSize,
} from "./pagination.mjs";

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
  metrics: {
    total: 4324,
    ready: 3416,
    belowThreshold: 512,
    missingLocation: 134,
  },
  readiness: {
    current: [
      { label: "คอมพิวเตอร์และอุปกรณ์ต่อพ่วง", total: 1640, ready: 1297 },
      { label: "การเรียนการสอนและโสตทัศนูปกรณ์", total: 982, ready: 814 },
      { label: "ระบบเครือข่าย", total: 712, ready: 589 },
      { label: "อุปกรณ์ห้องปฏิบัติการ", total: 546, ready: 426 },
      { label: "อุปกรณ์สำนักงาน", total: 444, ready: 290 },
    ],
    prior: [
      { label: "คอมพิวเตอร์และอุปกรณ์ต่อพ่วง", total: 1640, ready: 1258 },
      { label: "การเรียนการสอนและโสตทัศนูปกรณ์", total: 982, ready: 785 },
      { label: "ระบบเครือข่าย", total: 712, ready: 565 },
      { label: "อุปกรณ์ห้องปฏิบัติการ", total: 546, ready: 411 },
      { label: "อุปกรณ์สำนักงาน", total: 444, ready: 272 },
    ],
  },
  ageBands: [
    { label: "0–2 ปี", count: 1184 },
    { label: "3–5 ปี", count: 1576 },
    { label: "6–8 ปี", count: 1022 },
    { label: "9 ปีขึ้นไป", count: 542 },
  ],
  checks: [
    { label: "ทะเบียนสินทรัพย์", status: "เสร็จสมบูรณ์", tone: "success" },
    { label: "การยืนยันสินทรัพย์จริง", status: "กำลังดำเนินการ", tone: "info" },
    { label: "การกระทบยอดตำแหน่ง", status: "ถัดไป", tone: "warning" },
  ],
  exceptions: [
    {
      code: "CPE-INV-0108",
      name: "Dell OptiPlex 7080",
      category: "Computing",
      age: 7,
      location: "Building 9 · 8303",
      readiness: "Needs review",
      tone: "warning",
    },
    {
      code: "CPE-INV-0441",
      name: "Epson EB-X06 projector",
      category: "Teaching & AV",
      age: 8,
      location: "Unmatched",
      readiness: "Missing location",
      tone: "info",
    },
    {
      code: "CPE-INV-2194",
      name: "Cisco Catalyst 2960",
      category: "Networking",
      age: 10,
      location: "Building 8 · 2F",
      readiness: "Needs review",
      tone: "warning",
    },
    {
      code: "CPE-INV-3782",
      name: "Olympus CX23 microscope",
      category: "Laboratory equipment",
      age: 6,
      location: "Building 6 · Lab 2",
      readiness: "Damaged flag",
      tone: "danger",
    },
    {
      code: "CPE-INV-4020",
      name: "Brother HL-L2375DW",
      category: "Office equipment",
      age: 5,
      location: "Building 9 · Office 1",
      readiness: "Needs review",
      tone: "warning",
    },
  ],
};

const auditState = {
  progress: 82,
  checked: 3545,
};

const ASSET_API_BASE_URL = window.ASSET_API_BASE_URL || "https://cpe.eng.kps.ku.ac.th/CPEAssets/assets_api";
const DASHBOARD_SECTION_FILES = [
  "sections/overview.html",
  "sections/analysis.html",
  "sections/asset-register.html",
];

const categoryLabels = {
  Computing: "คอมพิวเตอร์",
  "Teaching & AV": "การเรียนการสอนและโสตทัศนูปกรณ์",
  Networking: "ระบบเครือข่าย",
  "Laboratory equipment": "อุปกรณ์ห้องปฏิบัติการ",
  "Office equipment": "อุปกรณ์สำนักงาน",
};

const readinessLabels = {
  "Needs review": "ต้องตรวจสอบ",
  "Missing location": "ไม่พบตำแหน่ง",
  "Damaged flag": "ติดธงชำรุด",
};

const locationLabels = {
  "Building 9 · 8303": "อาคาร 9 · 8303",
  Unmatched: "ไม่พบตำแหน่ง",
  "Building 8 · 2F": "อาคาร 8 · ชั้น 2",
  "Building 6 · Lab 2": "อาคาร 6 · ห้องปฏิบัติการ 2",
  "Building 9 · Office 1": "อาคาร 9 · สำนักงาน 1",
};

const categoryLabel = (value) => categoryLabels[value] ?? value;
const readinessLabel = (value) => readinessLabels[value] ?? value;
const locationLabel = (value) => locationLabels[value] ?? value;

const assetApiState = {
  status: "idle",
  page: 1,
  pageSize: ASSET_API_DEFAULT_PAGE_SIZE,
  rows: [],
  total: 0,
  loadedAt: null,
  error: null,
};

let elements;

function cacheElements() {
  elements = {
    moduleLinks: document.querySelector("#module-links"),
    dashboardSections: document.querySelector("#dashboard-sections"),
    modulePlaceholder: document.querySelector("#module-placeholder"),
    modulePlaceholderTitle: document.querySelector("#module-placeholder-title"),
    modulePlaceholderDescription: document.querySelector("#module-placeholder-description"),
    readinessChart: document.querySelector("#readiness-chart"),
    ageChart: document.querySelector("#age-chart"),
    checkList: document.querySelector("#check-list"),
    exceptionsBody: document.querySelector("#exceptions-body"),
    emptyState: document.querySelector("#empty-state"),
    resultsCount: document.querySelector("#results-count"),
    searchInput: document.querySelector("#search-input"),
    categoryFilter: document.querySelector("#category-filter"),
    snapshotSelect: document.querySelector("#snapshot-select"),
    auditProgress: document.querySelector("#audit-progress"),
    auditProgressBar: document.querySelector("#audit-progress-bar"),
    auditChecked: document.querySelector("#audit-checked"),
    auditRemaining: document.querySelector("#audit-remaining"),
    auditStatus: document.querySelector("#audit-status"),
    markCheckButton: document.querySelector("#mark-check-button"),
    exportButton: document.querySelector("#export-button"),
    startCheckButton: document.querySelector("#start-check-button"),
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
    assetApiStatusFilter: document.querySelector("#asset-api-status-filter"),
    assetApiTypeFilter: document.querySelector("#asset-api-type-filter"),
    assetApiPageSizeButtons: document.querySelector("#asset-api-page-size-buttons"),
    refreshAssetApiButton: document.querySelector("#refresh-asset-api-button"),
    assetApiLoading: document.querySelector("#asset-api-loading"),
    assetApiError: document.querySelector("#asset-api-error"),
    assetApiErrorMessage: document.querySelector("#asset-api-error-message"),
    assetApiTableWrap: document.querySelector("#asset-api-table-wrap"),
    assetApiBody: document.querySelector("#asset-api-body"),
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
  };
}

async function loadDashboardSections() {
  const container = document.querySelector("#dashboard-sections");
  if (!container) throw new Error("ไม่พบพื้นที่สำหรับโหลดส่วนแดชบอร์ด");

  const responses = await Promise.all(
    DASHBOARD_SECTION_FILES.map((file) => fetch(file, { headers: { Accept: "text/html" } })),
  );
  const failedResponse = responses.find((response) => !response.ok);
  if (failedResponse) throw new Error(`โหลดส่วนแดชบอร์ดไม่สำเร็จ (HTTP ${failedResponse.status})`);

  const sections = await Promise.all(responses.map((response) => response.text()));
  container.innerHTML = sections.join("\n");
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
  return getTotalPages(assetApiState.total, assetApiState.pageSize);
}

function assetStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (/ready|available|พร้อม|ใช้งาน/.test(normalized)) return "success";
  if (/damage|broken|repair|ชำรุด|เสีย|ซ่อม/.test(normalized)) return "danger";
  if (/pending|wait|รอ|ตรวจ/.test(normalized)) return "warning";
  return "info";
}

function getCurrentModuleId() {
  const route = window.location.hash.replace(/^#\/?/, "").split("/")[0];
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

function renderModuleView(moduleId = getCurrentModuleId()) {
  const activeModule = dashboardData.moduleNav.find((module) => module.id === moduleId) || dashboardData.moduleNav[0];
  const isInventory = activeModule.id === "inventory";

  elements.dashboardSections.hidden = !isInventory;
  elements.modulePlaceholder.hidden = isInventory;

  if (!isInventory) {
    elements.modulePlaceholderTitle.textContent = activeModule.label;
    elements.modulePlaceholderDescription.textContent = activeModule.description;
    elements.modulePlaceholderTitle.focus({ preventScroll: true });
  }
}

function handleModuleRoute() {
  const activeModuleId = getCurrentModuleId();
  renderModuleNav(activeModuleId);
  renderModuleView(activeModuleId);
  if (activeModuleId !== "inventory") window.scrollTo({ top: 0, behavior: "auto" });
}

function renderMetrics() {
  const { total, ready, belowThreshold, missingLocation } = dashboardData.metrics;
  const readyPercent = (ready / total) * 100;
  const thresholdPercent = (belowThreshold / total) * 100;
  const locationPercent = ((total - missingLocation) / total) * 100;

  document.querySelector("#metric-total").textContent = formatNumber(total);
  document.querySelector("#metric-ready").textContent = percent(readyPercent);
  document.querySelector("#metric-threshold").textContent = percent(thresholdPercent);
  document.querySelector("#metric-location").textContent = percent(locationPercent);
  document.querySelector("#metric-ready-footnote").textContent = `${formatNumber(ready)} รายการผ่านการตรวจสอบความพร้อม`;
  document.querySelector("#metric-threshold-footnote").textContent = `${formatNumber(belowThreshold)} รายการมีมูลค่าต่ำกว่า ฿5,000`;
  document.querySelector("#metric-location-footnote").textContent = `${formatNumber(missingLocation)} รายการยังต้องจับคู่ตำแหน่ง`;
}

function renderReadiness(snapshot = "current") {
  const rows = dashboardData.readiness[snapshot];

  elements.readinessChart.innerHTML = rows
    .map((row) => {
      const readyPercent = (row.ready / row.total) * 100;
      const reviewPercent = 100 - readyPercent;

      return `
        <div class="bar-row" role="img" aria-label="${escapeHtml(row.label)}: พร้อม ${percent(readyPercent)}, ต้องตรวจสอบ ${percent(reviewPercent)}">
          <div class="bar-label-row">
            <span>${escapeHtml(row.label)}</span>
            <strong>${percent(readyPercent)}</strong>
          </div>
          <div class="bar-track" aria-hidden="true">
            <span class="bar-fill" style="width: ${readyPercent}%"></span>
            <span class="bar-watch" style="width: ${reviewPercent}%"></span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderAgeChart() {
  const maxCount = Math.max(...dashboardData.ageBands.map((band) => band.count));

  elements.ageChart.innerHTML = dashboardData.ageBands
    .map(
      (band) => `
        <div class="age-column">
          <div class="age-bar-wrap">
          <span class="age-bar" style="height: ${(band.count / maxCount) * 100}%" title="${formatNumber(band.count)} รายการ"></span>
          </div>
          <strong class="age-count">${formatNumber(band.count)}</strong>
          <span class="age-label">${escapeHtml(band.label)}</span>
        </div>
      `,
    )
    .join("");
}

function renderChecks() {
  elements.checkList.innerHTML = dashboardData.checks
    .map(
      (check) => `
        <li class="check-item">
          <strong>${escapeHtml(check.label)}</strong>
          <span class="status-chip status-chip-${check.tone}">${escapeHtml(check.status)}</span>
        </li>
      `,
    )
    .join("");
}

function renderCategoryFilter() {
  const categories = [...new Set(dashboardData.exceptions.map((item) => item.category))];
  elements.categoryFilter.insertAdjacentHTML(
    "beforeend",
    categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(categoryLabel(category))}</option>`).join(""),
  );
}

function setAssetApiFilterOptions(select, values, allLabel) {
  const currentValue = select.value;
  select.innerHTML = [
    `<option value="all">${escapeHtml(allLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`),
  ].join("");

  select.value = values.includes(currentValue) ? currentValue : "all";
}

function renderAssetApiFilters() {
  const statuses = [...new Set(assetApiState.rows.map((row) => row.asset_status).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
  const types = [...new Set(assetApiState.rows.map((row) => row.type_name).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b)),
  );

  setAssetApiFilterOptions(elements.assetApiStatusFilter, statuses, "ทุกสถานะ");
  setAssetApiFilterOptions(elements.assetApiTypeFilter, types, "ทุกประเภท");
}

function getFilteredAssetApiRows() {
  const search = elements.assetApiSearch.value.trim().toLowerCase();
  const status = elements.assetApiStatusFilter.value;
  const type = elements.assetApiTypeFilter.value;

  return assetApiState.rows.filter((row) => {
    const searchable = [
      row.asset_code,
      row.asset_name,
      row.type_name,
      row.brand,
      row.department_name,
      row.asset_status,
    ]
      .map(displayValue)
      .join(" ")
      .toLowerCase();

    return (
      searchable.includes(search) &&
      (status === "all" || row.asset_status === status) &&
      (type === "all" || row.type_name === type)
    );
  });
}

function renderAssetApiSummary() {
  const rows = assetApiState.rows;
  const types = new Set(rows.map((row) => row.type_name).filter(Boolean));
  const latestUpdate = rows
    .map((row) => parseApiDate(row.update_date))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const totalPages = getAssetApiTotalPages();

  elements.assetApiTotal.textContent = assetApiState.status === "ready" ? formatNumber(assetApiState.total) : "—";
  elements.assetApiLoaded.textContent = assetApiState.status === "ready" ? formatNumber(rows.length) : "—";
  elements.assetApiPages.textContent =
    assetApiState.status === "ready"
      ? `หน้า ${formatNumber(assetApiState.page)} จาก ${formatNumber(totalPages)} · ${formatNumber(assetApiState.pageSize)} แถวต่อหน้า`
      : "กำลังรอข้อมูล";
  elements.assetApiTypeCount.textContent = assetApiState.status === "ready" ? formatNumber(types.size) : "—";
  elements.assetApiLatest.textContent = assetApiState.status === "ready" ? formatApiDate(latestUpdate) : "—";

  if (assetApiState.status !== "ready") {
    elements.assetApiStatusMix.textContent = "สัดส่วนสถานะจะแสดงหลังจากแหล่งข้อมูลสดตอบกลับ";
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
    ? `สัดส่วนสถานะในตัวอย่าง · ${statusMix}`
    : "ไม่พบค่าสถานะในข้อมูลตัวอย่าง";
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

function renderAssetApiTable() {
  if (assetApiState.status !== "ready") return;

  const filtered = getFilteredAssetApiRows();
  elements.assetApiBody.innerHTML = filtered
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
          <td>${escapeHtml(formatApiDate(row.update_date))}</td>
        </tr>
      `;
    })
    .join("");

  const hasRows = filtered.length > 0;
  elements.assetApiTableWrap.hidden = !hasRows;
  elements.assetApiEmpty.hidden = hasRows;
  elements.assetApiResultsCount.textContent = `แสดง ${formatNumber(filtered.length)} จาก ${formatNumber(assetApiState.rows.length)} แถวที่โหลด · ทั้งหมด ${formatNumber(assetApiState.total)} รายการใน API`;
  renderAssetApiPagination();
}

function renderAssetApiState() {
  const isLoading = assetApiState.status === "loading";
  const hasError = assetApiState.status === "error";
  const isReady = assetApiState.status === "ready";

  elements.assetApiLoading.hidden = !isLoading;
  elements.assetApiError.hidden = !hasError;
  elements.assetApiTableWrap.hidden = !isReady;
  elements.assetApiEmpty.hidden = true;
  elements.assetApiResultsCount.textContent = isLoading ? "กำลังโหลดแถวข้อมูลสด…" : "กำลังรอข้อมูลสด";

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
    elements.assetApiStatus.textContent = "เชื่อมต่อ API แล้ว";
    elements.assetApiStatus.className = "status-chip status-chip-success";
    elements.assetApiUpdated.textContent = `โหลดเมื่อ ${formatApiDate(assetApiState.loadedAt, true)}`;
  }

  renderAssetApiSummary();
  renderAssetApiPagination();
  if (isReady) renderAssetApiTable();
}

async function loadAssetRegister(page = assetApiState.page, pageSize = assetApiState.pageSize) {
  assetApiState.status = "loading";
  assetApiState.page = Math.max(1, Number.parseInt(page, 10) || 1);
  assetApiState.pageSize = normalizePageSize(pageSize);
  assetApiState.error = null;
  renderAssetApiState();
  elements.refreshAssetApiButton.disabled = true;

  try {
    const endpoint = new URL("assets.php", `${ASSET_API_BASE_URL.replace(/\/+$/, "")}/`);
    endpoint.searchParams.set("limit", String(assetApiState.pageSize));
    endpoint.searchParams.set("page", String(assetApiState.page));

    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`คำขอล้มเหลว (HTTP ${response.status})`);

    const payload = await response.json();
    if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
      throw new Error(payload?.message || "ได้รับข้อมูลจาก assets.php ในรูปแบบที่ไม่คาดคิด");
    }

    if (payload.data.some((row) => !row || typeof row !== "object")) {
      throw new Error("พบแถวสินทรัพย์ในคำตอบจาก assets.php ที่ไม่ถูกต้อง");
    }

    assetApiState.rows = payload.data;
    assetApiState.total = Number(payload.total) || payload.data.length;
    assetApiState.page = clampPage(assetApiState.page, getAssetApiTotalPages());
    assetApiState.loadedAt = new Date();
    assetApiState.status = "ready";
    renderAssetApiFilters();
    renderAssetApiState();
  } catch (error) {
    assetApiState.status = "error";
    assetApiState.error = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุจาก API";
    renderAssetApiState();
  } finally {
    elements.refreshAssetApiButton.disabled = false;
  }
}

function renderExceptions() {
  const search = elements.searchInput.value.trim().toLowerCase();
  const category = elements.categoryFilter.value;
  const filtered = dashboardData.exceptions.filter((item) => {
    const matchesSearch = [
      item.code,
      item.name,
      item.category,
      categoryLabel(item.category),
      item.location,
      locationLabel(item.location),
      item.readiness,
      readinessLabel(item.readiness),
    ]
      .join(" ")
      .toLowerCase()
      .includes(search);
    const matchesCategory = category === "all" || item.category === category;
    return matchesSearch && matchesCategory;
  });

  elements.exceptionsBody.innerHTML = filtered
    .map(
      (item) => `
        <tr>
          <td>
            <div class="asset-cell">
              <strong>${escapeHtml(item.code)}</strong>
              <span>${escapeHtml(item.name)}</span>
            </div>
          </td>
          <td>${escapeHtml(categoryLabel(item.category))}</td>
          <td class="age-cell">${item.age} ปี</td>
          <td>${escapeHtml(locationLabel(item.location))}</td>
          <td><span class="status-chip status-chip-${item.tone}">${escapeHtml(readinessLabel(item.readiness))}</span></td>
          <td><button class="row-action" type="button" data-asset="${escapeHtml(item.code)}" aria-label="เพิ่ม ${escapeHtml(item.code)} เข้าคิวตรวจสอบ">เพิ่มเข้าคิวตรวจสอบ</button></td>
        </tr>
      `,
    )
    .join("");

  elements.emptyState.hidden = filtered.length > 0;
  elements.resultsCount.textContent = `แสดง ${filtered.length} จาก ${dashboardData.exceptions.length} รายการในมุมมอง`;
}

function renderAuditState() {
  const { total } = dashboardData.metrics;
  const remaining = Math.max(total - auditState.checked, 0);
  const complete = auditState.progress >= 100;

  elements.auditProgress.textContent = `${auditState.progress}%`;
  elements.auditProgressBar.style.width = `${auditState.progress}%`;
  elements.auditProgressBar.setAttribute("aria-valuenow", String(auditState.progress));
  elements.auditChecked.textContent = `${formatNumber(auditState.checked)} รายการตรวจแล้ว`;
  elements.auditRemaining.textContent = `${formatNumber(remaining)} รายการคงเหลือ`;
  elements.auditStatus.textContent = complete ? "เสร็จสมบูรณ์" : "กำลังดำเนินการ";
  elements.auditStatus.className = `status-chip ${complete ? "status-chip-success" : "status-chip-info"}`;
  elements.markCheckButton.disabled = complete;
  elements.markCheckButton.textContent = complete ? "การตรวจนับประจำปีเสร็จสมบูรณ์" : "ตรวจยืนยันชุดถัดไป";
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

function exportView() {
  const headers = ["รหัสสินทรัพย์", "ชื่อสินทรัพย์", "หมวดหมู่", "อายุ (ปี)", "ตำแหน่ง", "ความพร้อม"];
  const rows = dashboardData.exceptions.map((item) => [
    item.code,
    item.name,
    categoryLabel(item.category),
    item.age,
    locationLabel(item.location),
    readinessLabel(item.readiness),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "asset-inventory-exceptions.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("ส่งออกรายการที่ต้องตรวจสอบเป็น CSV แล้ว");
}

function initInteractions() {
  elements.searchInput.addEventListener("input", renderExceptions);
  elements.categoryFilter.addEventListener("change", renderExceptions);
  elements.snapshotSelect.addEventListener("change", (event) => renderReadiness(event.target.value));
  elements.assetApiSearch.addEventListener("input", renderAssetApiTable);
  elements.assetApiStatusFilter.addEventListener("change", renderAssetApiTable);
  elements.assetApiTypeFilter.addEventListener("change", renderAssetApiTable);
  elements.assetApiPageSizeButtons.addEventListener("click", handleAssetApiPageSizeButtonClick);
  elements.refreshAssetApiButton.addEventListener("click", loadAssetRegister);
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

  elements.markCheckButton.addEventListener("click", () => {
    auditState.progress = Math.min(auditState.progress + 4, 100);
    auditState.checked = Math.min(
      dashboardData.metrics.total,
      Math.round((dashboardData.metrics.total * auditState.progress) / 100),
    );
    renderAuditState();
    showToast(
      auditState.progress === 100
        ? "การตรวจนับสินทรัพย์ประจำปีเสร็จสมบูรณ์แล้ว"
        : "ทำเครื่องหมายตรวจยืนยันชุดถัดไปแล้ว",
    );
  });

  elements.startCheckButton.addEventListener("click", () => {
    document.querySelector(".audit-panel").scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("รอบตรวจนับประจำปีพร้อมสำหรับชุดถัดไปแล้ว");
  });

  elements.exportButton.addEventListener("click", exportView);
  elements.exceptionsBody.addEventListener("click", (event) => {
    const action = event.target.closest("[data-asset]");
    if (action) showToast(`${action.dataset.asset} ถูกเพิ่มเข้าคิวตรวจสอบภาคสนามถัดไปแล้ว`);
  });
}

async function init() {
  await loadDashboardSections();
  cacheElements();
  renderModuleNav();
  renderModuleView();
  renderMetrics();
  renderReadiness();
  renderAgeChart();
  renderChecks();
  renderCategoryFilter();
  renderExceptions();
  renderAuditState();
  initInteractions();
  renderBackToTop();
  loadAssetRegister();
}

init().catch((error) => {
  console.error("Dashboard initialization failed", error);
  showDashboardLoadError();
});
