const dashboardData = {
  moduleNav: [
    { id: "inventory", label: "Asset inventory", marker: "AI", href: "#main-content", active: true },
    { id: "asset-register", label: "Live register", marker: "AR", href: "#asset-register", active: false },
  ],
  metrics: {
    total: 4324,
    ready: 3416,
    belowThreshold: 512,
    missingLocation: 134,
  },
  readiness: {
    current: [
      { label: "Computing & peripherals", total: 1640, ready: 1297 },
      { label: "Teaching & AV", total: 982, ready: 814 },
      { label: "Networking", total: 712, ready: 589 },
      { label: "Laboratory equipment", total: 546, ready: 426 },
      { label: "Office equipment", total: 444, ready: 290 },
    ],
    prior: [
      { label: "Computing & peripherals", total: 1640, ready: 1258 },
      { label: "Teaching & AV", total: 982, ready: 785 },
      { label: "Networking", total: 712, ready: 565 },
      { label: "Laboratory equipment", total: 546, ready: 411 },
      { label: "Office equipment", total: 444, ready: 272 },
    ],
  },
  ageBands: [
    { label: "0–2 years", count: 1184 },
    { label: "3–5 years", count: 1576 },
    { label: "6–8 years", count: 1022 },
    { label: "9+ years", count: 542 },
  ],
  checks: [
    { label: "Asset register", status: "Complete", tone: "success" },
    { label: "Physical confirmation", status: "In progress", tone: "info" },
    { label: "Location reconciliation", status: "Next", tone: "warning" },
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
const ASSET_API_PAGE_SIZE = 100;

const assetApiState = {
  status: "idle",
  page: 1,
  rows: [],
  total: 0,
  loadedAt: null,
  error: null,
};

const elements = {
  moduleLinks: document.querySelector("#module-links"),
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
  refreshAssetApiButton: document.querySelector("#refresh-asset-api-button"),
  assetApiLoading: document.querySelector("#asset-api-loading"),
  assetApiError: document.querySelector("#asset-api-error"),
  assetApiErrorMessage: document.querySelector("#asset-api-error-message"),
  assetApiTableWrap: document.querySelector("#asset-api-table-wrap"),
  assetApiBody: document.querySelector("#asset-api-body"),
  assetApiEmpty: document.querySelector("#asset-api-empty"),
  assetApiPrevious: document.querySelector("#asset-api-previous"),
  assetApiNext: document.querySelector("#asset-api-next"),
  assetApiPageLabel: document.querySelector("#asset-api-page-label"),
  assetApiStatusMix: document.querySelector("#asset-api-status-mix"),
  assetApiResultsCount: document.querySelector("#asset-api-results-count"),
};

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

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function getAssetApiTotalPages() {
  return Math.max(1, Math.ceil(assetApiState.total / ASSET_API_PAGE_SIZE));
}

function assetStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (/ready|available|พร้อม|ใช้งาน/.test(normalized)) return "success";
  if (/damage|broken|repair|ชำรุด|เสีย|ซ่อม/.test(normalized)) return "danger";
  if (/pending|wait|รอ|ตรวจ/.test(normalized)) return "warning";
  return "info";
}

function renderModuleNav() {
  elements.moduleLinks.innerHTML = dashboardData.moduleNav
    .map(
      (module) => `
        <a class="module-link" href="${escapeHtml(module.href)}"${module.active ? ' aria-current="page"' : ""}>
          <span class="module-link-mark" aria-hidden="true">${escapeHtml(module.marker)}</span>
          ${escapeHtml(module.label)}
        </a>
      `,
    )
    .join("");
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
  document.querySelector("#metric-ready-footnote").textContent = `${formatNumber(ready)} assets pass the readiness check`;
  document.querySelector("#metric-threshold-footnote").textContent = `${formatNumber(belowThreshold)} assets under ฿5,000`;
  document.querySelector("#metric-location-footnote").textContent = `${formatNumber(missingLocation)} assets need a location match`;
}

function renderReadiness(snapshot = "current") {
  const rows = dashboardData.readiness[snapshot];

  elements.readinessChart.innerHTML = rows
    .map((row) => {
      const readyPercent = (row.ready / row.total) * 100;
      const reviewPercent = 100 - readyPercent;

      return `
        <div class="bar-row" role="img" aria-label="${escapeHtml(row.label)}: ${percent(readyPercent)} ready, ${percent(reviewPercent)} needs review">
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
            <span class="age-bar" style="height: ${(band.count / maxCount) * 100}%" title="${formatNumber(band.count)} assets"></span>
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
    categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join(""),
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

  setAssetApiFilterOptions(elements.assetApiStatusFilter, statuses, "All statuses");
  setAssetApiFilterOptions(elements.assetApiTypeFilter, types, "All types");
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
      ? `Page ${formatNumber(assetApiState.page)} of ${formatNumber(totalPages)}`
      : "Waiting for data";
  elements.assetApiTypeCount.textContent = assetApiState.status === "ready" ? formatNumber(types.size) : "—";
  elements.assetApiLatest.textContent = assetApiState.status === "ready" ? formatApiDate(latestUpdate) : "—";

  if (assetApiState.status !== "ready") {
    elements.assetApiStatusMix.textContent = "Status mix will appear after the live source responds.";
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
    ? `Status mix in preview · ${statusMix}`
    : "No status values were returned in the preview.";
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
  elements.assetApiResultsCount.textContent = `Showing ${formatNumber(filtered.length)} of ${formatNumber(assetApiState.rows.length)} loaded rows · ${formatNumber(assetApiState.total)} total in API`;
  const totalPages = getAssetApiTotalPages();
  elements.assetApiPageLabel.textContent = `Page ${formatNumber(assetApiState.page)} of ${formatNumber(totalPages)}`;
  elements.assetApiPrevious.disabled = assetApiState.page <= 1;
  elements.assetApiNext.disabled = assetApiState.page >= totalPages;
}

function renderAssetApiState() {
  const isLoading = assetApiState.status === "loading";
  const hasError = assetApiState.status === "error";
  const isReady = assetApiState.status === "ready";

  elements.assetApiLoading.hidden = !isLoading;
  elements.assetApiError.hidden = !hasError;
  elements.assetApiTableWrap.hidden = !isReady;
  elements.assetApiEmpty.hidden = true;
  elements.assetApiResultsCount.textContent = isLoading ? "Loading live rows…" : "Waiting for live data";
  elements.assetApiPrevious.disabled = !isReady || assetApiState.page <= 1;
  elements.assetApiNext.disabled = !isReady || assetApiState.page >= getAssetApiTotalPages();

  if (isLoading) {
    elements.assetApiStatus.textContent = "Connecting";
    elements.assetApiStatus.className = "status-chip status-chip-info";
    elements.assetApiUpdated.textContent = `Requesting page ${formatNumber(assetApiState.page)}`;
  } else if (hasError) {
    elements.assetApiStatus.textContent = "Unavailable";
    elements.assetApiStatus.className = "status-chip status-chip-danger";
    elements.assetApiUpdated.textContent = "Request failed";
    elements.assetApiErrorMessage.textContent = assetApiState.error || "Try refreshing the source.";
  } else if (isReady) {
    elements.assetApiStatus.textContent = "Live API";
    elements.assetApiStatus.className = "status-chip status-chip-success";
    elements.assetApiUpdated.textContent = `Loaded ${formatApiDate(assetApiState.loadedAt, true)}`;
  }

  renderAssetApiSummary();
  if (isReady) renderAssetApiTable();
}

async function loadAssetRegister(page = assetApiState.page) {
  assetApiState.status = "loading";
  assetApiState.page = Math.max(1, page);
  assetApiState.error = null;
  renderAssetApiState();
  elements.refreshAssetApiButton.disabled = true;

  try {
    const endpoint = new URL("assets.php", `${ASSET_API_BASE_URL.replace(/\/+$/, "")}/`);
    endpoint.searchParams.set("limit", String(ASSET_API_PAGE_SIZE));
    endpoint.searchParams.set("page", String(assetApiState.page));

    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}.`);

    const payload = await response.json();
    if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
      throw new Error(payload?.message || "Unexpected response from assets.php.");
    }

    if (payload.data.some((row) => !row || typeof row !== "object")) {
      throw new Error("Unexpected asset row in the assets.php response.");
    }

    assetApiState.rows = payload.data;
    assetApiState.total = Number(payload.total) || payload.data.length;
    assetApiState.page = Math.min(assetApiState.page, getAssetApiTotalPages());
    assetApiState.loadedAt = new Date();
    assetApiState.status = "ready";
    renderAssetApiFilters();
    renderAssetApiState();
  } catch (error) {
    assetApiState.status = "error";
    assetApiState.error = error instanceof Error ? error.message : "Unknown API error.";
    renderAssetApiState();
  } finally {
    elements.refreshAssetApiButton.disabled = false;
  }
}

function renderExceptions() {
  const search = elements.searchInput.value.trim().toLowerCase();
  const category = elements.categoryFilter.value;
  const filtered = dashboardData.exceptions.filter((item) => {
    const matchesSearch = [item.code, item.name, item.category, item.location]
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
          <td>${escapeHtml(item.category)}</td>
          <td class="age-cell">${item.age} years</td>
          <td>${escapeHtml(item.location)}</td>
          <td><span class="status-chip status-chip-${item.tone}">${escapeHtml(item.readiness)}</span></td>
          <td><button class="row-action" type="button" data-asset="${escapeHtml(item.code)}">Queue check</button></td>
        </tr>
      `,
    )
    .join("");

  elements.emptyState.hidden = filtered.length > 0;
  elements.resultsCount.textContent = `Showing ${filtered.length} of ${dashboardData.exceptions.length} visible records`;
}

function renderAuditState() {
  const { total } = dashboardData.metrics;
  const remaining = Math.max(total - auditState.checked, 0);
  const complete = auditState.progress >= 100;

  elements.auditProgress.textContent = `${auditState.progress}%`;
  elements.auditProgressBar.style.width = `${auditState.progress}%`;
  elements.auditProgressBar.setAttribute("aria-valuenow", String(auditState.progress));
  elements.auditChecked.textContent = `${formatNumber(auditState.checked)} checked`;
  elements.auditRemaining.textContent = `${formatNumber(remaining)} remaining`;
  elements.auditStatus.textContent = complete ? "Complete" : "In progress";
  elements.auditStatus.className = `status-chip ${complete ? "status-chip-success" : "status-chip-info"}`;
  elements.markCheckButton.disabled = complete;
  elements.markCheckButton.textContent = complete ? "Annual check complete" : "Mark next batch checked";
}

let toastTimer;
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

function exportView() {
  const headers = ["asset_code", "asset_name", "category", "asset_age_years", "location", "readiness"];
  const rows = dashboardData.exceptions.map((item) => [item.code, item.name, item.category, item.age, item.location, item.readiness]);
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "asset-inventory-exceptions.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Exception queue exported as CSV.");
}

function initInteractions() {
  elements.searchInput.addEventListener("input", renderExceptions);
  elements.categoryFilter.addEventListener("change", renderExceptions);
  elements.snapshotSelect.addEventListener("change", (event) => renderReadiness(event.target.value));
  elements.assetApiSearch.addEventListener("input", renderAssetApiTable);
  elements.assetApiStatusFilter.addEventListener("change", renderAssetApiTable);
  elements.assetApiTypeFilter.addEventListener("change", renderAssetApiTable);
  elements.refreshAssetApiButton.addEventListener("click", loadAssetRegister);
  elements.assetApiPrevious.addEventListener("click", () => loadAssetRegister(assetApiState.page - 1));
  elements.assetApiNext.addEventListener("click", () => loadAssetRegister(assetApiState.page + 1));

  elements.markCheckButton.addEventListener("click", () => {
    auditState.progress = Math.min(auditState.progress + 4, 100);
    auditState.checked = Math.min(
      dashboardData.metrics.total,
      Math.round((dashboardData.metrics.total * auditState.progress) / 100),
    );
    renderAuditState();
    showToast(auditState.progress === 100 ? "Annual inventory check complete." : "Next audit batch marked checked.");
  });

  elements.startCheckButton.addEventListener("click", () => {
    document.querySelector(".audit-panel").scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("Annual check rail is ready for the next batch.");
  });

  elements.exportButton.addEventListener("click", exportView);
  elements.exceptionsBody.addEventListener("click", (event) => {
    const action = event.target.closest("[data-asset]");
    if (action) showToast(`${action.dataset.asset} added to the next physical check.`);
  });
}

function init() {
  renderModuleNav();
  renderMetrics();
  renderReadiness();
  renderAgeChart();
  renderChecks();
  renderCategoryFilter();
  renderExceptions();
  renderAuditState();
  initInteractions();
  loadAssetRegister();
}

init();
