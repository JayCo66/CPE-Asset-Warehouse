// Application shell: อ่านรายการโมดูลจาก API -> เมนูลอย, router (hash), เลือกโมดูลจาก route, เรียกหน้าจอของโมดูล
(function () {
  const nav = document.getElementById("module-nav");
  const navList = document.getElementById("module-nav-list");
  const head = document.getElementById("module-head");
  const localNav = document.getElementById("local-nav");
  const localList = document.getElementById("local-nav-list");
  const view = document.getElementById("view");
  const main = document.getElementById("main");
  const SOURCE_LABEL = { real: "ข้อมูลจริง", mixed: "ข้อมูลจริง + จำลอง", sample: "ข้อมูลจำลอง" };

  let registry = null;
  let rendered = null; // "module/view" ที่แสดงอยู่ (ไม่ render ซ้ำเมื่อเปลี่ยนแค่ query)
  let token = 0;

  // ---------- route ----------
  function parseRoute() {
    const raw = decodeURIComponent(location.hash.replace(/^#/, "")) || "/";
    const [path, qs = ""] = raw.split("?");
    return { path: "/" + path.replace(/^\/+|\/+$/g, ""), query: new URLSearchParams(qs) };
  }

  /** โมดูลที่ path ยาวที่สุดซึ่งเป็น prefix ของ route (รองรับ route ลูก) */
  function resolve(path) {
    const m = registry.modules
      .filter((mod) => path === mod.path || path.startsWith(mod.path + "/"))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (!m) return null;
    const rest = path.slice(m.path.length).replace(/^\//, "").split("/")[0];
    const v = (m.views || []).find((x) => x.id === rest) || (m.views || [])[0];
    return { module: m, view: v, exact: !rest || rest === v?.id };
  }

  function setQuery(obj) {
    const { path } = parseRoute();
    const p = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => { if (v !== "" && v !== null && v !== undefined) p.set(k, v); });
    const hash = "#" + path + (p.toString() ? "?" + p : "");
    if (hash !== location.hash) history.replaceState(null, "", hash);
  }

  // ---------- render ----------
  function renderNav() {
    navList.replaceChildren(...registry.modules.map((m) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#" + m.path;
      a.textContent = m.label;
      a.dataset.module = m.id;
      if (m.description) a.title = m.description;
      li.appendChild(a);
      return li;
    }));
    nav.classList.remove("is-loading");
    updateOverflow();
  }

  function updateOverflow() {
    const el = navList;
    const over = el.scrollWidth > el.clientWidth + 1;
    el.classList.toggle("fade-start", over && el.scrollLeft > 2);
    el.classList.toggle("fade-end", over && el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }
  navList.addEventListener("scroll", updateOverflow, { passive: true });
  navList.addEventListener("focusin", (e) => ensureVisible(e.target));

  /** เลื่อนเมนูให้ลิงก์ที่เลือก/โฟกัสอยู่ในกรอบ (scrollIntoView ใช้ไม่ได้ดีกับ scroll-snap) */
  function ensureVisible(a) {
    const l = navList.getBoundingClientRect(), r = a.getBoundingClientRect(), pad = 32;
    if (r.left < l.left + pad) navList.scrollLeft -= l.left + pad - r.left;
    else if (r.right > l.right - pad) navList.scrollLeft += r.right - (l.right - pad);
    updateOverflow();
  }
  window.addEventListener("resize", updateOverflow);

  function markActive(active) {
    navList.querySelectorAll("a").forEach((a) => {
      if (a.dataset.module === active.module.id) {
        a.setAttribute("aria-current", "page");
        requestAnimationFrame(() => ensureVisible(a));
      } else a.removeAttribute("aria-current");
    });
  }

  function renderHead(active) {
    const m = active.module;
    head.hidden = false;
    document.getElementById("module-title").textContent = m.label;
    const badge = document.getElementById("module-source");
    badge.textContent = SOURCE_LABEL[m.data_source] || "";
    badge.className = `source-badge is-${m.data_source || "real"}`;
    badge.hidden = !m.data_source;
    // คำอธิบายโมดูลไม่แสดงบนหน้า (หัวข้อกับกราฟต้องอ่านเข้าใจเอง) เหลือไว้เป็น tooltip ของป้ายแหล่งข้อมูล
    badge.title = [m.description, m.data_note].filter(Boolean).join(" · ");
    const views = m.views || [];
    localNav.hidden = views.length < 2;
    localList.replaceChildren(...views.map((v) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#${m.path}/${v.id}`;
      a.textContent = v.label;
      a.dataset.view = v.id;
      if (v.id === active.view.id) a.setAttribute("aria-current", "page");
      li.appendChild(a);
      return li;
    }));
    if (m.badges) loadBadges(m);
    document.title = `${m.label}${views.length > 1 ? " · " + active.view.label : ""} · ${registry.app?.name || "CPE Asset Warehouse"}`;
  }

  // ตัวเลขบนแท็บ (เช่น จำนวนรายการที่มีสัญญาณ) จาก endpoint ใน modules.json ; ดึงครั้งเดียวต่อโมดูล ถ้าดึงไม่ได้ก็แสดงแท็บตามปกติ
  const badgeCache = new Map();
  async function loadBadges(m) {
    try {
      if (!badgeCache.has(m.id)) badgeCache.set(m.id, await window.ViewApi(m.badges));
      const b = badgeCache.get(m.id);
      localList.querySelectorAll("a").forEach((a) => {
        if (b[a.dataset.view] === undefined || a.querySelector(".tab-badge")) return;
        const s = document.createElement("span");
        s.className = "tab-badge";
        s.textContent = b[a.dataset.view];
        a.appendChild(s);
      });
    } catch { /* ไม่มีตัวเลขก็ใช้แท็บได้ */ }
  }

  async function route(focus) {
    const { path, query } = parseRoute();
    const active = resolve(path);
    if (!active) {
      const first = registry.modules[0];
      if (!first) return showState("ยังไม่มีโมดูล", "เพิ่มโมดูลใน web/config/modules.json");
      history.replaceState(null, "", "#" + first.path);
      return route(false);
    }
    const key = `${active.module.id}/${active.view?.id}`;
    if (key === rendered) return;
    rendered = key;
    markActive(active);
    renderHead(active);
    const my = ++token;
    view.replaceChildren();
    view.setAttribute("aria-busy", "true");
    // skeleton แสดงจนกว่าหน้าจอจะได้ข้อมูล ; frag อยู่ใน DOM ตั้งแต่แรกเพื่อให้กราฟวัดความกว้างได้
    const sk = document.createElement("div");
    sk.className = "skeleton";
    sk.style.height = "18rem";
    const frag = document.createElement("div");
    frag.style.display = "contents";
    view.append(sk, frag);
    const component = window.Views[active.view?.component];
    try {
      if (!component) throw new Error(`ยังไม่มีหน้าจอ "${active.view?.component}" ใน assets/views.js`);
      await component(frag, { module: active.module, view: active.view, query, setQuery, settings: registry.settings || {} });
      if (my === token) sk.remove();
    } catch (e) {
      if (my === token) window.ViewStates.errorState(view, e, () => { rendered = null; route(false); });
    } finally {
      if (my === token) view.removeAttribute("aria-busy");
    }
    if (focus) document.getElementById("module-title").focus({ preventScroll: true });
  }

  function showState(title, hint) {
    view.replaceChildren();
    window.ViewStates.emptyState(view, title, hint);
  }

  async function boot() {
    nav.classList.add("is-loading");
    document.getElementById("module-title").tabIndex = -1;
    try {
      const res = await fetch("api/modules.php");
      registry = await res.json();
      if (!res.ok || registry.error) throw new Error(registry.error || `HTTP ${res.status}`);
    } catch (e) {
      nav.hidden = true;
      window.ViewStates.errorState(view, e, () => location.reload());
      return;
    }
    if (registry.app) {
      document.getElementById("app-name").textContent = registry.app.name;
      document.getElementById("app-sub").textContent = registry.app.subtitle || "";
    }
    document.getElementById("app-meta").textContent = `ปีงบประมาณ ${F.currentFiscalYear()}`;
    // พิมพ์รายงานหน้าที่เปิดอยู่ (เสนอผู้บริหาร / แนบบันทึกข้อความ) ; หัวกระดาษบอกวันเวลาที่พิมพ์
    document.getElementById("print-btn").addEventListener("click", () => {
      const now = new Date();
      document.getElementById("print-meta").textContent =
        `${registry.app?.name || ""} · ${registry.app?.subtitle || ""} · ข้อมูล ณ ${F.dateTH(registry.today || "")} พิมพ์เวลา ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} น.`;
      window.print();
    });
    renderNav();
    window.addEventListener("hashchange", () => route(true));
    route(false);
  }

  boot();
})();
