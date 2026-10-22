const dashboardData = {
  moduleNav: [
    { id: "inventory", label: "Asset inventory", marker: "AI", href: "#main-content" },
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
};

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(value);
const percent = (value) => `${value.toFixed(1)}%`;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[character];
  });

function renderModuleNav() {
  elements.moduleLinks.innerHTML = dashboardData.moduleNav
    .map(
      (module) => `
        <a class="module-link" href="${module.href}" aria-current="page">
          <span class="module-link-mark" aria-hidden="true">${module.marker}</span>
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
}

init();
