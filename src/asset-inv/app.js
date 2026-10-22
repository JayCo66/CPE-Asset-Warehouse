const dashboardData = {
  moduleNav: [
    { id: "inventory", label: "คลังสินทรัพย์", marker: "AI", href: "#main-content" },
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
    { label: "0–2 ปี", count: 1184, position: 10, signal: "ตรวจตามรอบ", tone: "success" },
    { label: "3–5 ปี", count: 1576, position: 40, signal: "ติดตาม", tone: "info" },
    { label: "6–8 ปี", count: 1022, position: 70, signal: "ควรตรวจเร็ว ๆ นี้", tone: "warning" },
    { label: "9 ปีขึ้นไป", count: 542, position: 92, signal: "เร่งตรวจสอบ", tone: "danger" },
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
  const totalCount = dashboardData.ageBands.reduce((sum, band) => sum + band.count, 0);
  const maxCount = Math.max(...dashboardData.ageBands.map((band) => band.count));

  const axisLabels = ["0 ปี", "3", "6", "9+"];
  const points = dashboardData.ageBands
    .map((band) => {
      const share = (band.count / totalCount) * 100;
      const dotSize = Math.round(30 + (band.count / maxCount) * 28);

      return `
        <span
          class="age-point age-point-${band.tone}"
          style="--age-position: ${band.position}%; --dot-size: ${dotSize}px"
          title="${escapeHtml(band.label)}: ${formatNumber(band.count)} รายการ, ${percent(share)}"
        ></span>
      `;
    })
    .join("");

  elements.ageChart.innerHTML = `
    <div class="age-plot-visual" role="img" aria-label="การกระจายอายุสินทรัพย์ ตำแหน่งจุดแสดงช่วงอายุ และขนาดจุดแสดงจำนวนสินทรัพย์">
      <div class="age-axis" aria-hidden="true">
        ${axisLabels.map((label) => `<span>${label}</span>`).join("")}
      </div>
      <div class="age-track" aria-hidden="true">
        <span class="age-gridline age-gridline-start"></span>
        <span class="age-gridline age-gridline-mid"></span>
        <span class="age-gridline age-gridline-end"></span>
        ${points}
      </div>
    </div>
    <div class="age-point-list" role="list" aria-label="รายละเอียดช่วงอายุสินทรัพย์">
      ${dashboardData.ageBands
        .map((band) => {
          const share = (band.count / totalCount) * 100;

          return `
            <div class="age-point-detail" role="listitem">
              <div class="age-detail-label">
                <span class="age-detail-swatch age-detail-swatch-${band.tone}" aria-hidden="true"></span>
                <span>${escapeHtml(band.label)}</span>
              </div>
              <strong class="age-count">${formatNumber(band.count)}</strong>
              <span class="age-share">${percent(share)} ของสินทรัพย์ทั้งหมด</span>
              <span class="status-chip status-chip-${band.tone}">${escapeHtml(band.signal)}</span>
            </div>
          `;
        })
        .join("")}
    </div>
    <p class="chart-note">ตำแหน่งจุดอ้างอิงค่ากลางของช่วงอายุ ขนาดจุดแสดงจำนวนรายการ และรายละเอียดตัวเลขพร้อมสัญญาณการตรวจสอบอยู่ด้านล่าง</p>
  `;
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
  showToast("ส่งออกรายการที่ต้องตรวจสอบเป็น CSV แล้ว");
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
    showToast(auditState.progress === 100 ? "การตรวจนับสินทรัพย์ประจำปีเสร็จสมบูรณ์แล้ว" : "ทำเครื่องหมายตรวจยืนยันชุดถัดไปแล้ว");
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
