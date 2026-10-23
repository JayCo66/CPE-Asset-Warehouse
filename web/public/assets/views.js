// หน้าจอของแต่ละโมดูล ลงทะเบียนตามชื่อ component ใน config/modules.json
// (เมนูหลักไม่รู้จักชื่อเหล่านี้ app.js แค่เรียก Views[component])
(function () {
  const { esc, num, dec, pct, ratio, monthLabel, dateTH, delta, fillMonths } = F;
  const BLUE = "var(--cpe-brand-blue)";
  const MUTED = "var(--series-muted)";

  async function api(path) {
    const res = await fetch(`api/${path}`, { headers: { Accept: "application/json" } });
    const body = await res.json().catch(() => ({ error: `เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (${res.status})` }));
    if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  }

  const html = (strings, ...values) => strings.reduce((s, str, i) => s + str + (i < values.length ? values[i] : ""), "");

  function section(root, { id, title, note, wide }) {
    const el = document.createElement("section");
    el.className = "section";
    el.id = id;
    el.setAttribute("aria-labelledby", `${id}-h`);
    el.innerHTML = html`<div class="section-head"><h2 id="${id}-h">${esc(title)}</h2></div>${note ? `<p class="section-note">${esc(note)}</p>` : ""}`;
    const body = document.createElement("div");
    body.className = wide ? "section-body is-wide" : "section-body";
    el.appendChild(body);
    root.appendChild(el);
    return body;
  }

  function cols(root) {
    const el = document.createElement("div");
    el.className = "cols";
    root.appendChild(el);
    return el;
  }

  /** แถบตัวเลขหลัก ; items: [{label, value, unit?, sub?, subCls?, href?}] */
  function stats(root, items, label) {
    const el = document.createElement("div");
    el.className = "stats";
    el.setAttribute("role", "list");
    el.setAttribute("aria-label", label);
    el.innerHTML = items.map((s) => html`
      <${s.href ? `a href="${esc(s.href)}"` : "div"} class="stat${s.href ? " is-link" : ""}" role="listitem">
        <span class="stat-label">${esc(s.label)}</span>
        <span class="stat-value">${esc(s.value)}${s.unit ? `<small>${esc(s.unit)}</small>` : ""}</span>
        ${s.sub ? `<span class="stat-sub ${s.subCls || "delta-flat"}">${esc(s.sub)}</span>` : ""}
      </${s.href ? "a" : "div"}>`).join("");
    root.appendChild(el);
  }

  function table(root, { columns, rows, tall, caption }) {
    const wrap = document.createElement("div");
    wrap.className = "table-wrap" + (tall ? " is-tall" : "");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", caption);
    wrap.innerHTML = html`<table><caption class="visually-hidden">${esc(caption)}</caption>
      <thead><tr>${columns.map((c) => `<th scope="col" class="${c.align === "l" ? "l" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${columns.map((c) => {
        const v = c.render ? c.render(r) : esc(r[c.key]);
        return `<td class="${c.cls ? (typeof c.cls === "function" ? c.cls(r) : c.cls) : ""} ${c.align === "l" ? "l" : ""}"${c.style ? ` style="${c.style(r)}"` : ""}>${v}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table>`;
    root.appendChild(wrap);
    return wrap;
  }

  function chartBox(root, legendItems) {
    if (legendItems) root.appendChild(Charts.legend(legendItems));
    const box = document.createElement("div");
    box.className = "chart";
    root.appendChild(box);
    return box;
  }

  /** วาดกราฟใหม่เมื่อความกว้างเปลี่ยน */
  function responsive(box, draw) {
    draw();
    let w = box.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(box.clientWidth - w) > 4) { w = box.clientWidth; draw(); } });
    ro.observe(box);
  }

  const fyShort = (fy) => String(fy).slice(2);

  // =====================================================================
  const Views = {};
  const RED = "var(--cpe-danger)";
  const FY_MONTHS = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const quarterTick = (r) => ([1, 4, 7, 10].includes(r.month) ? monthLabel(r.year, r.month) : null);
  const vsPrev = (curr, prev, fy, opt) => {
    if (curr === null || curr === undefined || prev === null || prev === undefined) return {};
    const x = delta(curr, prev, opt);
    return { sub: `${x.text} จากปีงบ ${fy}`, subCls: x.cls };
  };
  const compareBox = (sec, rows, { prevFy, currFy, fmt, better }) => {
    if (!rows.length) return emptyState(sec, "ไม่มีข้อมูล", "");
    sec.appendChild(Charts.legend([[`ปีงบ ${prevFy}`, MUTED], [`ปีงบ ${currFy}`, BLUE]]));
    const b = document.createElement("div");
    b.className = "hbars";
    sec.appendChild(b);
    Charts.compare(b, rows, { a: { label: `ปีงบ ${prevFy}`, color: MUTED }, b: { label: `ปีงบ ${currFy}`, color: BLUE }, fmt, better });
  };

  // =====================================================================
  // รายงานประจำปีงบประมาณ
  const fyPeriod = (fy) => `${dateTH(`${fy - 544}-10-01`)} – ${dateTH(`${fy - 543}-09-30`)}`;
  /** ข้อความเทียบปีก่อนสำหรับสรุปที่คัดลอก ; prev = null คือปีก่อนไม่มีข้อมูล */
  function compareText(curr, prev, pv, unit) {
    if (prev === null || prev === undefined) return "";
    if (curr === prev) return ` เท่ากับปีงบ ${pv}`;
    if (!prev) return ` (ปีงบ ${pv} ไม่มี)`;
    const p = Math.abs(((curr - prev) / prev) * 100).toFixed(0);
    return ` ${curr > prev ? "เพิ่มขึ้น" : "ลดลง"} ${p}% จากปีงบ ${pv} (${num(prev)} ${unit})`;
  }

  Views["annual-summary"] = async (root, ctx) => {
    const out = document.createElement("div");
    out.style.display = "contents";
    root.appendChild(out);
    let seq = 0;
    async function load(want) {
      const my = ++seq;
      const d = await api(`annual.php${want ? `?fy=${encodeURIComponent(want)}` : ""}`);
      if (my !== seq) return;
      out.replaceChildren();
      if (!d.fy) return emptyState(out, "ยังไม่มีปีงบประมาณที่จบแล้ว", "");
      ctx.setQuery({ fy: d.fy });
      render(out, d);
    }

    function render(root, d) {
      const fy = d.fy, pv = fy - 1;
      const H = new Map(d.history.map((h) => [h.fiscal_year, h]));
      const C = H.get(fy) || {}, P = H.get(pv) || {};
      const cf = C.facility, cr = C.repair, cb = C.borrow, pf = P.facility, pr = P.repair, pb = P.borrow;
      const acq = C.inventory?.acquired || 0, pacq = P.inventory?.acquired || 0;

      const pick = document.createElement("label");
      pick.className = "field field-lg";
      pick.htmlFor = "annual-fy";
      pick.innerHTML = html`ปีงบประมาณ<select id="annual-fy">${[...d.years].reverse().map((y) =>
        `<option value="${y}"${y === fy ? " selected" : ""}>${y}</option>`).join("")}</select>`;
      pick.querySelector("select").addEventListener("change", (e) => load(e.target.value).catch((err) => errorState(out, err, () => load(e.target.value))));

      // ข้อความสรุปสำหรับวางในบันทึกข้อความ (ไม่แสดงบนหน้า ตัวเลขบนหน้าบอกอยู่แล้ว)
      const summary = () => {
        const lines = [];
        if (cf) lines.push(`แจ้งซ่อมอาคาร ${num(cf.total)} งาน${compareText(cf.total, pf?.total, pv, "งาน")}` +
          (d.facility_types[0]?.curr ? ` ส่วนใหญ่เป็น${d.facility_types[0].name} ${num(d.facility_types[0].curr)} งาน` : ""));
        if (cr) lines.push(`ซ่อมครุภัณฑ์ ${num(cr.jobs)} งาน${compareText(cr.jobs, pr?.jobs, pv, "งาน")} ค่าซ่อมรวม ${num(cr.cost)} บาท` +
          (cr.timed ? ` ซ่อมเสร็จภายใน ${d.sla.repair} วันทำการ ${pct(ratio(cr.within_sla, cr.timed), 0)}` : ""));
        if (cb) lines.push(`ให้ยืมครุภัณฑ์ ${num(cb.items)} ชิ้น แก่ผู้ยืม ${num(cb.borrowers)} คน${compareText(cb.items, pb?.items, pv, "ชิ้น")}` +
          (cb.due_items ? ` คืนเกินกำหนด ${pct(ratio(cb.overdue, cb.due_items), 0)}` : ""));
        lines.push(`ครุภัณฑ์ที่ได้รับเข้า ${num(acq)} ชิ้น${compareText(acq, pacq, pv, "ชิ้น")}`);
        return [`สรุปผลการดำเนินงานด้านครุภัณฑ์และอาคารสถานที่ ประจำปีงบประมาณ ${fy} (${fyPeriod(fy)})`,
          ...lines.map((t, i) => `${i + 1}. ${t}`), `ข้อมูล ณ ${dateTH(d.today)}`].join("\n");
      };
      toolbar(root, `เทียบกับปีงบ ${pv}`, [["คัดลอกสรุป", summary]], pick);

      stats(root, [
        cf && { label: "แจ้งซ่อมอาคาร", value: num(cf.total), unit: "งาน", ...vsPrev(cf.total, pf?.total, pv, { better: "down" }) },
        cr && { label: "ซ่อมครุภัณฑ์", value: num(cr.jobs), unit: "งาน", ...vsPrev(cr.jobs, pr?.jobs, pv, { better: "down" }) },
        cr && { label: "ค่าซ่อม", value: num(cr.cost), unit: "บาท", ...vsPrev(cr.cost, pr?.cost, pv, { better: "down" }) },
        cb && { label: "ให้ยืม", value: num(cb.items), unit: "ชิ้น", ...vsPrev(cb.items, pb?.items, pv) },
        { label: "ได้รับครุภัณฑ์เข้า", value: num(acq), unit: "ชิ้น", ...vsPrev(acq, pacq, pv) },
      ].filter(Boolean), `ตัวเลขหลักปีงบ ${fy}`);

      // รายเดือน ต.ค.–ก.ย. เทียบปีก่อน
      const byM = new Map(d.monthly.map((m) => [`${m.fiscal_year}-${m.month}`, m]));
      const monthRows = FY_MONTHS.map((m) => {
        const r = { key: String(m), label: F.TH_MONTH[m - 1] };
        [["c", fy, C], ["p", pv, P]].forEach(([tag, y, has]) => ["facility", "repair", "borrow"].forEach((k) => {
          r[`${tag}_${k}`] = has[k] ? (byM.get(`${y}-${m}`)?.[k] || 0) : null;
        }));
        return r;
      });
      const monthly = (sec, k, unit) => {
        const series = [{ key: `c_${k}`, label: String(fy), color: BLUE }];
        if (P[k]) series.push({ key: `p_${k}`, label: String(pv), color: MUTED });
        const box = chartBox(sec);
        responsive(box, () => Charts.lines(box, monthRows, { label: sec.closest("section").querySelector("h2").textContent, xKey: "key",
          xLabel: (r) => r.label, series, yFmt: num, tipTitle: (r) => `${r.label} (${unit})` }));
      };
      const c1 = cols(root);
      if (cf) monthly(section(c1, { id: "annual-fac-month", title: "แจ้งซ่อมอาคาร รายเดือน" }), "facility", "งาน");
      if (cr) monthly(section(c1, { id: "annual-rep-month", title: "ซ่อมครุภัณฑ์ รายเดือน" }), "repair", "งาน");
      if (cb) monthly(section(c1, { id: "annual-bor-month", title: "ยืมครุภัณฑ์ รายเดือน" }), "borrow", "ชิ้น");

      const c2 = cols(root);
      if (cf) compareBox(section(c2, { id: "annual-fac-type", title: "แจ้งซ่อมตามประเภทงาน" }),
        d.facility_types.map((r) => ({ name: r.name, a: r.prev, b: r.curr })), { prevFy: pv, currFy: fy, fmt: (v) => `${num(v)} งาน`, better: "down" });
      if (cf) compareBox(section(c2, { id: "annual-building", title: "อาคารที่แจ้งซ่อมมากที่สุด" }),
        d.buildings.map((r) => ({ name: r.name, a: r.prev, b: r.curr })), { prevFy: pv, currFy: fy, fmt: (v) => `${num(v)} งาน`, better: "down" });
    }

    await load(ctx.query.get("fy"));
  };

  Views["annual-history"] = async (root, ctx) => {
    const d = await api("annual.php");
    const rows = [...d.history].reverse();   // ปีล่าสุดอยู่บน
    if (!rows.length) return emptyState(root, "ยังไม่มีข้อมูล", "");
    const sla = d.sla;
    const rate = (o, a, b) => (o && o[b] ? o[a] / o[b] : null);
    const full = d.history.filter((r) => !r.partial).map((r) => ({
      ...r, key: String(r.fiscal_year),
      facility_n: r.facility?.total ?? null, repair_n: r.repair?.jobs ?? null, borrow_n: r.borrow?.items ?? null,
      repair_cost: r.repair?.cost ?? null,
    }));
    const label = (r) => (r.partial ? `${r.fiscal_year} (ยังไม่จบปี)` : String(r.fiscal_year));
    const cols_ = [
      ["ปีงบ", (r) => label(r)],
      ["แจ้งซ่อมอาคาร", (r) => r.facility?.total ?? null],
      ["ซ่อมครุภัณฑ์", (r) => r.repair?.jobs ?? null],
      ["ค่าซ่อม (บาท)", (r) => r.repair?.cost ?? null],
      [`ซ่อมเสร็จใน ${sla.repair} วันทำการ`, (r) => rate(r.repair, "within_sla", "timed"), "pct"],
      ["ให้ยืม (ชิ้น)", (r) => r.borrow?.items ?? null],
      ["คืนเกินกำหนด", (r) => rate(r.borrow, "overdue", "due_items"), "pct"],
      ["ได้รับครุภัณฑ์เข้า", (r) => r.inventory?.acquired ?? 0],
    ];
    const show = (v, kind) => (kind === "pct" ? pct(v, 0) : num(v));

    toolbar(root, "", [["คัดลอกตาราง", () => tsv(cols_.map((c) => c[0]),
      rows.map((r) => cols_.map(([, f, kind], i) => { const v = f(r); return i === 0 ? v : v === null ? "" : show(v, kind); })))]]);

    const c2 = cols(root);
    const a = section(c2, { id: "hist-volume", title: "ปริมาณงานแต่ละปีงบ" });
    const va = chartBox(a);
    responsive(va, () => Charts.lines(va, full, { label: "ปริมาณงานแต่ละปีงบ", xKey: "key", xLabel: (r) => r.key, yFmt: num,
      series: [{ key: "facility_n", label: "แจ้งซ่อม", color: BLUE }, { key: "repair_n", label: "ซ่อม", color: "var(--cpe-warning)" },
        { key: "borrow_n", label: "ยืม", color: MUTED }],
      tipTitle: (r) => `ปีงบ ${r.fiscal_year}` }));
    const b = section(c2, { id: "hist-cost", title: "ค่าซ่อมครุภัณฑ์แต่ละปีงบ" });
    const vb = chartBox(b);
    responsive(vb, () => Charts.bars(vb, full.filter((r) => r.repair_cost !== null), { label: "ค่าซ่อมครุภัณฑ์แต่ละปีงบ",
      series: [{ key: "repair_cost", color: BLUE }], yFmt: num, xLabel: (r) => r.key,
      tipTitle: (r) => `ปีงบ ${r.fiscal_year}`, tipLines: (r) => [["ค่าซ่อม", `${num(r.repair_cost)} บาท`], ["งานซ่อม", `${num(r.repair_n)} งาน`]] }));

    const t = section(root, { id: "hist-table", title: "สรุปทุกปีงบ" });
    const w = table(t, {
      caption: "สรุปย้อนหลังรายปีงบประมาณ", rows, columns: cols_.map(([labelText, f, kind], i) => (i === 0
        ? { label: labelText, align: "l", render: (r) => (r.partial ? esc(label(r)) : `<a href="#${esc(ctx.module.path)}/summary?fy=${r.fiscal_year}">${r.fiscal_year}</a>`) }
        : { label: labelText, render: (r) => show(f(r), kind) })),
    });
    w.querySelectorAll("tbody tr").forEach((tr, i) => tr.classList.toggle("is-partial", rows[i].partial));
  };

  // =====================================================================
  Views["inventory-overview"] = async (root) => {
    const d = await api("inventory.php");
    if (d.empty) return emptyState(root, "ยังไม่มี snapshot ครุภัณฑ์", "รัน ETL อย่างน้อย 1 ครั้ง");
    const L = d.latest, fy = d.fiscal_years;
    const byFy = new Map(d.acquisitions.map((r) => [r.fiscal_year, r]));
    const fys = d.acquisitions.map((r) => r.fiscal_year);
    const acq = fys.length ? d3.range(d3.min(fys), Math.max(d3.max(fys), fy.curr) + 1).map((y) => {
      const r = byFy.get(y) || { fiscal_year: y, assets: 0, below_threshold: 0 };
      return { ...r, key: String(y), regular: r.assets - r.below_threshold };
    }) : [];
    const got = (y) => byFy.get(y)?.assets || 0;
    stats(root, [
      { label: "ครุภัณฑ์ทั้งหมด", value: num(L.total), unit: "ชิ้น" },
      { label: `ได้รับเข้า ปีงบ ${fy.curr}`, value: num(got(fy.curr)), unit: "ชิ้น", ...vsPrev(got(fy.curr), got(fy.prev), fy.prev) },
      { label: "อายุ 10 ปีขึ้นไป", value: pct(ratio(L.age_10_plus, L.total), 0), sub: `${num(L.age_10_plus)} ชิ้น` },
    ], "ตัวเลขหลักของครุภัณฑ์");

    const a = section(root, { id: "inv-acquired", title: "ได้รับครุภัณฑ์เข้าแต่ละปีงบ" });
    const box = chartBox(a, [["ตามเกณฑ์", BLUE], ["ต่ำกว่า 5,000 บาท", MUTED]]);
    responsive(box, () => Charts.bars(box, acq, {
      label: "จำนวนครุภัณฑ์ตามปีงบที่ได้มา",
      series: [{ key: "regular", color: BLUE }, { key: "below_threshold", color: MUTED }],
      yFmt: num, xLabel: (r) => (r.fiscal_year % 5 === 0 ? String(r.fiscal_year) : null),
      tipTitle: (r) => `ปีงบ ${r.fiscal_year}`,
      tipLines: (r) => [["รวม", `${num(r.assets)} ชิ้น`], ["ต่ำกว่าเกณฑ์", `${num(r.below_threshold)} ชิ้น`]],
    }));

    const cat = section(root, { id: "inv-category", title: "หมวดที่เก่าจนควรวางแผนซื้อทดแทน" });
    table(cat, {
      caption: "ครุภัณฑ์ตามหมวด", rows: [...d.categories].sort((x, y) => ratio(y.age_10_plus, y.assets) - ratio(x.age_10_plus, x.assets)), columns: [
        { key: "name", label: "หมวด", align: "l", cls: "wrap" },
        { label: "อายุ 10 ปีขึ้นไป", render: (r) => `<span class="big-cell">${pct(ratio(r.age_10_plus, r.assets), 0)}</span>` },
        { label: "จำนวน", render: (r) => num(r.assets) },
        { label: "อายุเฉลี่ย", render: (r) => `${dec(r.avg_age)} ปี` },
      ],
    });
  };

  Views["facility-overview"] = async (root) => {
    const d = await api("facility.php");
    const fy = d.fiscal_years, k = d.kpi;
    const months = fillMonths(d.monthly, ["total", "legacy_form", "new_system", "aircon"]);
    const acCurr = d3.sum(months.filter((r) => r.fiscal_year === fy.curr), (r) => r.aircon);
    const acPrev = d3.sum(months.filter((r) => r.fiscal_year === fy.prev), (r) => r.aircon);
    stats(root, [
      { label: `แจ้งซ่อม ปีงบ ${fy.curr}`, value: num(k.curr_total), unit: "งาน", ...vsPrev(k.curr_total, k.prev_total, fy.prev, { better: "down" }) },
      { label: `งานแอร์ ปีงบ ${fy.curr}`, value: num(acCurr), unit: "งาน", ...vsPrev(acCurr, acPrev, fy.prev, { better: "down" }) },
      { label: `ปิดงานใน ${k.sla_workdays} วันทำการ`, value: pct(ratio(k.within_sla, k.resolved_jobs), 0),
        sub: k.resolved_jobs ? `${num(k.resolved_jobs)} งานในระบบใหม่` : "" },
    ], "ตัวเลขหลักงานแจ้งซ่อม");

    const s1 = section(root, { id: "fac-trend", title: "แจ้งซ่อมรายเดือน" });
    const box = chartBox(s1, [["ฟอร์มเดิม", BLUE], ["ระบบใหม่", MUTED]]);
    const firstNew = months.find((r) => r.new_system > 0);
    responsive(box, () => Charts.bars(box, months, {
      label: "งานแจ้งซ่อมต่อเดือน", series: [{ key: "legacy_form", color: BLUE }, { key: "new_system", color: MUTED }],
      yFmt: num, xLabel: (r) => (r.month === 10 ? monthLabel(r.year, r.month) : null),
      ref: firstNew ? { key: firstNew.key, label: "เริ่มระบบใหม่" } : null,
      tipTitle: (r) => `${monthLabel(r.year, r.month)} · ปีงบ ${r.fiscal_year}`,
      tipLines: (r) => [["รวม", `${num(r.total)} งาน`], ["แอร์", `${num(r.aircon)} งาน`]],
    }));

    const c2 = cols(root);
    if (d.season.length) {
      const s2 = section(c2, { id: "fac-season", title: "เดือนที่แอร์เสียบ่อย (เฉลี่ยต่อปี)" });
      const byM = new Map(d.season.map((r) => [r.month, r]));
      const season = FY_MONTHS.map((m) => ({ month: m, label: F.TH_MONTH[m - 1], aircon_avg: byM.get(m)?.aircon_avg ?? 0, other_avg: byM.get(m)?.other_avg ?? 0 }));
      const sb = chartBox(s2);
      responsive(sb, () => Charts.lines(sb, season, { label: "ค่าเฉลี่ยงานแจ้งซ่อมรายเดือน", xKey: "month", xLabel: (r) => r.label,
        series: [{ key: "aircon_avg", label: "แอร์", color: BLUE }, { key: "other_avg", label: "อื่นๆ", color: MUTED }],
        yFmt: (v) => dec(v), tipTitle: (r) => `เดือน ${r.label} (เฉลี่ยต่อปี)` }));
    }
    const years = fy.buildings;
    const byB = new Map();
    d.buildings.forEach((r) => { if (!byB.has(r.building)) byB.set(r.building, { building: r.building }); byB.get(r.building)[r.fiscal_year] = r.n; });
    const brows = [...byB.values()].map((r) => ({ ...r, total: d3.sum(years, (y) => r[y] || 0) })).sort((a, b) => b.total - a.total);
    const max = d3.max(brows, (r) => d3.max(years, (y) => r[y] || 0)) || 1;
    const s4 = section(c2, { id: "fac-building", title: "อาคารที่แจ้งซ่อมบ่อย" });
    table(s4, {
      caption: "งานแจ้งซ่อมตามอาคารและปีงบ", tall: true, rows: brows, columns: [
        { key: "building", label: "อาคาร", align: "l" },
        ...years.map((y) => ({ label: String(y), cls: "heat", render: (r) => num(r[y] || 0),
          style: (r) => `background: color-mix(in srgb, var(--cpe-brand-blue) ${Math.round(((r[y] || 0) / max) * 60)}%, transparent)` })),
      ],
    });
  };

  Views["repair-overview"] = async (root, ctx) => {
    const d = await api("repair.php");
    const fy = d.fiscal_years, C = d.kpi.curr, P = d.kpi.prev, sla = d.sla_workdays;
    stats(root, [
      { label: `ค่าซ่อม ปีงบ ${fy.curr}`, value: num(C.cost), unit: "บาท", ...vsPrev(C.cost, P.cost, fy.prev, { better: "down" }) },
      { label: `งานซ่อม ปีงบ ${fy.curr}`, value: num(C.jobs), unit: "งาน", ...vsPrev(C.jobs, P.jobs, fy.prev, { better: "down" }) },
      { label: `เสร็จใน ${sla} วันทำการ`, value: pct(ratio(C.within_sla, C.done), 0),
        ...vsPrev(ratio(C.within_sla, C.done), ratio(P.within_sla, P.done), fy.prev, { better: "up", kind: "rate" }) },
      { label: "ไม่คุ้มซ่อมแล้ว", value: num(d.worth.dispose), unit: "ชิ้น", href: `#${ctx.module.path}/worth`,
        sub: "ดูรายการ", subCls: d.worth.dispose ? "delta-bad" : "delta-flat" },
    ], "ตัวเลขหลักงานซ่อมครุภัณฑ์");

    const months = fillMonths(d.monthly, ["opened", "completed", "cost"]).map((r) => {
      const src = d.monthly.find((m) => m.year === r.year && m.month === r.month);
      return { ...r, median_workdays: src ? src.median_workdays : null };
    });
    const c2 = cols(root);
    const s1 = section(c2, { id: "rep-cost", title: "ค่าซ่อมรายเดือน" });
    const b1 = chartBox(s1);
    responsive(b1, () => Charts.bars(b1, months, { label: "ค่าซ่อมรายเดือน", series: [{ key: "cost", color: BLUE }], yFmt: num,
      xLabel: quarterTick, tipTitle: (r) => `${monthLabel(r.year, r.month)} · ปีงบ ${r.fiscal_year}`,
      tipLines: (r) => [["ค่าซ่อม", `${num(r.cost)} บาท`], ["แจ้งซ่อม", `${num(r.opened)} งาน`]] }));
    const s2 = section(c2, { id: "rep-days", title: "ระยะเวลาซ่อม (วันทำการ)" });
    const b2 = chartBox(s2);
    responsive(b2, () => Charts.lines(b2, months, { label: "ระยะเวลาซ่อมรายเดือน", xKey: "key", xLabel: quarterTick,
      series: [{ key: "median_workdays", label: "ค่ากลาง", color: BLUE }], yFmt: (v) => dec(v),
      refY: { value: sla, label: `เกณฑ์ ${sla} วัน` }, tipTitle: (r) => `${monthLabel(r.year, r.month)} · ปีงบ ${r.fiscal_year}` }));

    compareBox(section(root, { id: "rep-category", title: "ค่าซ่อมตามหมวด" }),
      d.categories.map((r) => ({ name: r.name, a: r.prev_cost, b: r.curr_cost })),
      { prevFy: fy.prev, currFy: fy.curr, fmt: (v) => `${num(v)} บาท`, better: "down" });
  };

  // ค่าซ่อมสะสมเทียบราคาซื้อ: แถบ = ค่าซ่อมคิดเป็นกี่ % ของราคาซื้อ (เต็มแถบ = เท่าราคาซื้อ)
  Views["repair-worth"] = async (root) => {
    const d = await api("repair.php?view=worth");
    const T = d.thresholds, all = d.assets;
    const LABEL = { dispose: "ไม่คุ้มซ่อม", review: "ค่าซ่อมสูงแต่ยังใหม่", watch: "เฝ้าระวัง", ok: "ซ่อมต่อได้" };
    const CLS = { dispose: "bad", review: "warn", watch: "warn", ok: "ok" };
    const groups = Object.fromEntries(Object.keys(LABEL).map((k) => [k, all.filter((a) => a.verdict === k)]));
    stats(root, [
      { label: "ไม่คุ้มซ่อม ควรเสนอจำหน่าย", value: num(groups.dispose.length), unit: "ชิ้น",
        sub: `ค่าซ่อม ≥ ${pct(T.dispose, 0)} ของราคาซื้อ และใช้งานเกิน ${pct(T.life_share, 0)} ของอายุ`, subCls: "delta-bad" },
      { label: "ค่าซ่อมที่จ่ายไปกับกลุ่มนี้", value: num(d3.sum(groups.dispose, (a) => a.repair_cost)), unit: "บาท",
        sub: `ราคาซื้อรวม ${num(d3.sum(groups.dispose, (a) => a.price))} บาท` },
      { label: "ค่าซ่อมสูงแต่ยังใหม่", value: num(groups.review.length), unit: "ชิ้น", sub: "ตรวจสาเหตุ/ประกันก่อนตัดสิน" },
      { label: "เฝ้าระวัง", value: num(groups.watch.length), unit: "ชิ้น", sub: `${pct(T.watch, 0)}–${pct(T.dispose, 0)} ของราคาซื้อ` },
    ], "สรุปความคุ้มค่าการซ่อม");

    let pick = "dispose";
    const sec = section(root, { id: "rep-worth", title: "ค่าซ่อมสะสมเทียบราคาซื้อ" });
    const seg = document.createElement("div");
    seg.className = "seg";
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "กลุ่มครุภัณฑ์");
    seg.innerHTML = Object.keys(LABEL).map((k) => `<button type="button" data-k="${k}">${LABEL[k]} <b>${num(groups[k].length)}</b></button>`).join("");
    toolbar(sec, "", [["คัดลอกรายการเสนอจำหน่าย", () => tsv(
      ["ลำดับ", "เลขครุภัณฑ์", "ชื่อ", "หมวด", "ราคาซื้อ (บาท)", "ค่าซ่อมสะสม (บาท)", "ค่าซ่อม/ราคาซื้อ", "ซ่อม (ครั้ง)", "อายุ (ปี)"],
      groups.dispose.map((r, i) => [i + 1, r.asset_code, r.asset_name, r.category_name, r.price, r.repair_cost, pct(r.ratio, 0), r.repairs, r.age_years ?? ""]))]], seg);
    const list = document.createElement("ol");
    list.className = "worth-list";
    sec.appendChild(list);
    const draw = () => {
      seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === pick)));
      const rows = groups[pick];
      if (!rows.length) { list.innerHTML = `<li class="state">ไม่มีครุภัณฑ์ในกลุ่มนี้</li>`; return; }
      const cls = CLS[pick];
      list.innerHTML = rows.map((r) => html`
        <li>
          <div class="worth-name">${esc(r.asset_name)}
            <span>${esc(r.category_name)} · ซ่อม ${num(r.repairs)} ครั้ง${r.age_years !== null ? ` · อายุ ${num(r.age_years)}/${num(r.life_years)} ปี` : ""} · ${esc(r.asset_code)}</span></div>
          <div class="worth-bar" role="img" aria-label="ค่าซ่อม ${pct(r.ratio, 0)} ของราคาซื้อ">
            <span class="fill is-${cls}" style="width:${Math.min(100, r.ratio * 100)}%"></span>
            <i style="left:${T.watch * 100}%"></i><i style="left:${T.dispose * 100}%"></i>
          </div>
          <div class="worth-num"><strong class="is-${cls}">${pct(r.ratio, 0)}</strong>
            <span>${num(r.repair_cost)} / ${num(r.price)} บาท</span></div>
        </li>`).join("");
    };
    seg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { pick = b.dataset.k; draw(); } });
    draw();
  };

  // ขอเงินลงทุน: อายุเทียบอายุการใช้งาน, ถ้าไม่ลงทุนเทียบทำตามแผน, แผนทดแทนรายปี, รายการที่ควรทดแทนทันที
  Views["invest-overview"] = async (root) => {
    const d = await api("invest.php");
    if (d.empty) return emptyState(root, "ยังไม่มี snapshot ครุภัณฑ์", "รัน ETL อย่างน้อย 1 ครั้ง");
    const cur = d.current_fiscal_year, [y0, y1] = d.plan_years, T = d.thresholds;
    const mb = (v) => dec(v / 1e6);
    const GREEN = "var(--cpe-success)";
    const now = d.history[d.history.length - 1], prev = d.history[d.history.length - 2];
    const cost = (p) => p.immediate_cost + p.backlog_cost + p.eol_cost;
    const total = d3.sum(d.plan, cost);
    stats(root, [
      { label: `เกินอายุการใช้งาน ปีงบ ${cur}`, value: pct(now.share, 0), sub: `${num(now.past)} จาก ${num(now.n)} ชิ้น`,
        ...vsPrev(now.share, prev.share, prev.fiscal_year, { better: "down", kind: "rate" }) },
      { label: `งบทดแทน ปีงบ ${y0}–${y1}`, value: mb(total), unit: "ล้านบาท", sub: `เฉลี่ย ${mb(total / d.plan.length)} ล้านบาทต่อปี` },
      { label: "งบที่ควรตั้งทุกปี", value: mb(d.keep_up_per_year), unit: "ล้านบาท", sub: "เพื่อไม่ให้เกินอายุสะสมเพิ่ม" },
      { label: "ควรทดแทนทันที", value: num(d.immediate.length), unit: "ชิ้น",
        sub: `ค่าซ่อม ≥ ${pct(T.repair_ratio, 0)} ของราคาซื้อ และใช้งานเกิน ${pct(T.life_share, 0)} ของอายุ`, subCls: "delta-bad" },
    ], "สรุปคำขอเงินลงทุน");

    // ที่ผ่านมา -> ปีงบปัจจุบัน -> คาดการณ์ (เส้นทั้งสามต่อกันที่ปีงบปัจจุบัน)
    const rows = [
      ...d.history.map((h) => ({ key: String(h.fiscal_year), actual: h.share, no_invest: h.fiscal_year === cur ? h.share : null, with_plan: h.fiscal_year === cur ? h.share : null })),
      ...d.projection.map((p) => ({ key: String(p.fiscal_year), actual: null, no_invest: p.no_invest, with_plan: p.with_plan })),
    ];
    const s1 = section(root, { id: "inv-past-life", title: "ครุภัณฑ์ที่เกินอายุการใช้งาน: ไม่ลงทุน กับ ทำตามแผน" });
    const b1 = chartBox(s1);
    responsive(b1, () => Charts.lines(b1, rows, { label: "สัดส่วนครุภัณฑ์ที่เกินอายุการใช้งาน", xKey: "key", xLabel: (r) => r.key, yMax: 1,
      series: [{ key: "actual", label: "ที่ผ่านมา", color: BLUE }, { key: "no_invest", label: "ไม่ลงทุน", color: RED },
        { key: "with_plan", label: "ตามแผน", color: GREEN }],
      yFmt: (v) => pct(v, 0), tipTitle: (r) => `ปีงบ ${r.key}` }));

    const s2 = section(root, { id: "inv-plan", title: `แผนทดแทนรายปี (ล้านบาท)` });
    toolbar(s2, "", [["คัดลอกแผนรายปี", () => tsv(
      ["ปีงบประมาณ", "ทดแทนทันที (ชิ้น)", "ทดแทนทันที (บาท)", "เกินอายุค้างสะสม (ชิ้น)", "เกินอายุค้างสะสม (บาท)", "ครบอายุในปี (ชิ้น)", "ครบอายุในปี (บาท)", "รวม (บาท)"],
      d.plan.map((p) => [p.fiscal_year, p.immediate_n, p.immediate_cost, p.backlog_n, p.backlog_cost, p.eol_n, p.eol_cost, cost(p)]))]]);
    const b2 = chartBox(s2, [["ทดแทนทันที", RED], ["เกินอายุค้างสะสม", BLUE], ["ครบอายุในปีนั้น", MUTED]]);
    const plan = d.plan.map((p) => ({ ...p, key: String(p.fiscal_year) }));
    responsive(b2, () => Charts.bars(b2, plan, { label: "แผนทดแทนรายปี",
      series: [{ key: "immediate_cost", color: RED }, { key: "backlog_cost", color: BLUE }, { key: "eol_cost", color: MUTED }],
      yFmt: mb, xLabel: (r) => r.key, tipTitle: (r) => `ปีงบ ${r.key} · รวม ${mb(cost(r))} ล้านบาท`,
      tipLines: (r) => [["ทดแทนทันที", `${num(r.immediate_n)} ชิ้น · ${num(r.immediate_cost)} บาท`, RED],
        ["ค้างสะสม", `${num(r.backlog_n)} ชิ้น · ${num(r.backlog_cost)} บาท`, BLUE],
        ["ครบอายุ", `${num(r.eol_n)} ชิ้น · ${num(r.eol_cost)} บาท`, MUTED]] }));

    const s3 = section(root, { id: "inv-category", title: "แยกตามหมวด" });
    table(s3, {
      caption: "แผนทดแทนแยกตามหมวด", rows: d.categories, columns: [
        { key: "name", label: "หมวด", align: "l", cls: "wrap" },
        { label: "เกินอายุแล้ว", render: (r) => `<span class="big-cell">${pct(ratio(r.past, r.assets), 0)}</span>` },
        { label: "อายุใช้งาน", render: (r) => `${num(r.life)} ปี` },
        { label: "ทั้งหมด", render: (r) => num(r.assets) },
        { label: "เกินอายุ", render: (r) => num(r.past) },
        { label: `ครบอายุภายใน ${y1}`, render: (r) => num(r.due) },
        { label: "งบทดแทน (บาท)", render: (r) => num(r.cost) },
      ],
    });

    const s4 = section(root, { id: "inv-now", title: "ควรทดแทนทันที" });
    if (!d.immediate.length) emptyState(s4, "ไม่มีรายการ", "");
    else table(s4, {
      caption: "ครุภัณฑ์ที่ควรทดแทนทันที", rows: d.immediate, columns: [
        { key: "asset_name", label: "ครุภัณฑ์", align: "l", cls: "wrap" },
        { label: "ค่าซ่อม / ราคาซื้อ", render: (r) => `<span class="big-cell is-bad">${pct(r.ratio, 0)}</span>` },
        { label: "บาท", render: (r) => `${num(r.repair_cost)} / ${num(r.price)}` },
        { label: "อายุ / อายุใช้งาน", render: (r) => `${num(r.age_years)} / ${num(r.life_years)} ปี` },
        { key: "category_name", label: "หมวด", align: "l", cls: "wrap" },
        { key: "asset_code", label: "เลขครุภัณฑ์", align: "l" },
      ],
    });
  };

  Views["borrow-overview"] = async (root) => {
    const d = await api("borrow.php");
    const fy = d.fiscal_years, k = d.kpi;
    stats(root, [
      { label: `ให้ยืม ปีงบ ${fy.curr}`, value: num(k.curr_items), unit: "ชิ้น", ...vsPrev(k.curr_items, k.prev_items, fy.prev) },
      { label: "คืนเกินกำหนด", value: pct(ratio(k.curr_overdue, k.curr_items), 0),
        ...vsPrev(ratio(k.curr_overdue, k.curr_items), ratio(k.prev_overdue, k.prev_items), fy.prev, { better: "down", kind: "rate" }) },
      { label: "ผู้ยืม", value: num(k.curr_borrowers), unit: "คน", ...vsPrev(k.curr_borrowers, k.prev_borrowers, fy.prev) },
    ], "ตัวเลขหลักการยืม-คืน");

    const months = fillMonths(d.monthly, ["items", "overdue", "rejected"]);
    const c2 = cols(root);
    const s1 = section(c2, { id: "bor-trend", title: "ยืมรายเดือน" });
    const box = chartBox(s1);
    responsive(box, () => Charts.bars(box, months, {
      label: "จำนวนชิ้นที่ยืมต่อเดือน", series: [{ key: "items", color: BLUE }], yFmt: num, xLabel: quarterTick,
      tipTitle: (r) => `${monthLabel(r.year, r.month)} · ปีงบ ${r.fiscal_year}`,
      tipLines: (r) => [["ยืม", `${num(r.items)} ชิ้น`], ["คืนช้า", `${num(r.overdue)} ชิ้น`]],
    }));
    const q = d.quarterly.map((r) => ({ ...r, key: `Q${r.quarter}/${fyShort(r.fiscal_year)}`, rate: ratio(r.overdue, r.due_items) }));
    const s2 = section(c2, { id: "bor-overdue", title: "คืนเกินกำหนด รายไตรมาส" });
    const qb = chartBox(s2);
    responsive(qb, () => Charts.lines(qb, q, { label: "สัดส่วนการคืนเกินกำหนดรายไตรมาส", xKey: "key", xLabel: (r) => r.key,
      series: [{ key: "rate", label: "คืนช้า", color: RED }], yFmt: (v) => pct(v, 0),
      tipTitle: (r) => `${r.key} · ${num(r.overdue)} จาก ${num(r.due_items)} ชิ้น` }));
  };

  /** แถบเครื่องมือของหน้า: [lead เช่น ตัวเลือกปีงบ] ข้อความสรุป + ปุ่ม ; buttons: [[label | () => label, onClick(btn)]] */
  function toolbar(root, text, buttons, lead) {
    const bar = document.createElement("div");
    bar.className = "action-bar";
    if (lead) bar.appendChild(lead);
    const t = document.createElement("span");
    t.className = "action-text";
    t.textContent = text;
    bar.appendChild(t);
    const live = document.createElement("span");
    live.className = "action-status";
    live.setAttribute("aria-live", "polite");
    buttons.forEach(([label, onClick]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn";
      b.textContent = typeof label === "function" ? label() : label;
      b.addEventListener("click", async () => {
        const res = await onClick(b);
        if (typeof res === "string") copy(res, live);
      });
      bar.appendChild(b);
    });
    bar.appendChild(live);
    root.appendChild(bar);
  }

  function tsv(header, rows) {
    return [header, ...rows].map((r) => r.map((v) => String(v ?? "").replace(/[\t\n]/g, " ")).join("\t")).join("\n");
  }

  async function copy(text, live) {
    try {
      await navigator.clipboard.writeText(text);
      live.textContent = "คัดลอกแล้ว วางในเอกสารหรือ Excel ได้เลย";
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.className = "copy-fallback";
      live.replaceChildren(document.createTextNode("คัดลอกอัตโนมัติไม่ได้ กด Ctrl+C เพื่อคัดลอกข้อความนี้"), ta);
      ta.select();
    }
    setTimeout(() => { if (live.textContent.startsWith("คัดลอกแล้ว")) live.textContent = ""; }, 4000);
  }

  // ---------- states ----------
  function emptyState(root, title, hint) {
    const el = document.createElement("div");
    el.className = "state";
    el.innerHTML = html`<strong>${esc(title)}</strong>${esc(hint)}`;
    root.appendChild(el);
  }

  function errorState(root, err, retry) {
    root.replaceChildren();
    const el = document.createElement("div");
    el.className = "state is-error";
    el.setAttribute("role", "alert");
    el.innerHTML = html`<strong>โหลดข้อมูลไม่สำเร็จ</strong><span>${esc(err.message)}</span><div style="margin-top:12px"><button class="btn" type="button">ลองอีกครั้ง</button></div>`;
    el.querySelector("button").addEventListener("click", retry);
    root.appendChild(el);
  }

  window.Views = Views;
  window.ViewStates = { emptyState, errorState };
})();
