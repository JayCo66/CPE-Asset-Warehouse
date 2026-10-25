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
  /** กราฟเดียวเทียบทุกกลุ่ม: แท่งคู่ปีงบก่อน/ปีงบล่าสุด บนแกนเดียวกัน ; rows: [{name, a, b}] */
  const groupedBox = (sec, rows, { prevFy, currFy, fmt, axisFmt = fmt, better, shortName }) => {
    if (!rows.length) return emptyState(sec, "ไม่มีข้อมูล", "");
    const box = chartBox(sec, [[`ปีงบ ${prevFy}`, MUTED], [`ปีงบ ${currFy}`, BLUE]]);
    responsive(box, () => Charts.grouped(box, rows, {
      label: sec.closest("section").querySelector("h2").textContent, yFmt: axisFmt, shortName,
      series: [{ key: "a", label: `ปีงบ ${prevFy}`, color: MUTED }, { key: "b", label: `ปีงบ ${currFy}`, color: BLUE }],
      delta: (r) => delta(+r.b, +r.a, { better }),
      tipTitle: (r) => r.name,
      tipLines: (r) => [[`ปีงบ ${prevFy}`, fmt(r.a), MUTED], [`ปีงบ ${currFy}`, fmt(r.b), BLUE]],
    }));
  };
  const noPrefix = (r) => r.name.replace(/^ครุภัณฑ์/, "");

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

    groupedBox(section(root, { id: "fac-types", title: "แจ้งซ่อมตามประเภทงาน" }),
      d.types.map((r) => ({ name: r.type_name, a: r.prev, b: r.curr })),
      { prevFy: fy.prev, currFy: fy.curr, fmt: (v) => `${num(v)} งาน`, axisFmt: num, better: "down", shortName: (r) => r.name.replace(/^งาน/, "") });

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

    groupedBox(section(root, { id: "rep-category", title: "ค่าซ่อมตามหมวด" }),
      d.categories.map((r) => ({ name: r.name, a: r.prev_cost, b: r.curr_cost })),
      { prevFy: fy.prev, currFy: fy.curr, fmt: (v) => `${num(v)} บาท`, axisFmt: num, better: "down", shortName: noPrefix });
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

  // ขอเงินลงทุน ----------------------------------------------------------
  /**
   * จำลองแผนทดแทนเมื่อได้งบเท่ากันทุกปี: แต่ละปีใช้งบกับ (1) รายการซ่อมไม่คุ้ม (2) ที่เกินอายุนานที่สุดก่อน
   * ชิ้นที่ทดแทนแล้วกลับมาครบอายุอีกครั้งในอีก "อายุการใช้งาน" ปี ; งบที่ใช้ไม่หมดไม่ยกไปปีถัดไป
   */
  function simulateBudget(d, budget) {
    const [y0, y1] = d.plan_years, life = d.categories.map((c) => c.life);
    const pool = [...d.urgent_groups.map((g) => ({ cat: g[0], eol: g[1], n: g[2], cost: g[3], urgent: true })),
      ...d.groups.map((g) => ({ cat: g[0], eol: g[1], n: g[2], cost: g[3], urgent: false }))];
    const years = [];
    for (let y = y0; y <= y1; y++) {
      let money = budget;
      const spend = { immediate: { n: 0, cost: 0 }, backlog: { n: 0, cost: 0 }, due: { n: 0, cost: 0 } };
      const renewed = [];
      const queue = pool.filter((g) => g.n > 0 && (g.urgent || g.eol <= y)).sort((a, b) => (b.urgent - a.urgent) || (a.eol - b.eol));
      for (const g of queue) {
        const unit = g.cost / g.n;
        const take = Math.min(g.n, Math.floor(money / unit + 1e-9));
        if (!take) continue;   // ซื้อชิ้นนี้ไม่พอ ลองรายการถัดไปที่ถูกกว่า
        const cost = unit * take;
        g.n -= take; g.cost -= cost; money -= cost;
        const kind = g.urgent ? "immediate" : g.eol < y0 ? "backlog" : "due";
        spend[kind].n += take; spend[kind].cost += cost;
        renewed.push({ cat: g.cat, eol: y + life[g.cat], n: take, cost, urgent: false });
      }
      pool.push(...renewed);
      const past = d3.sum(pool, (g) => (g.eol <= y ? g.n : 0));
      years.push({ fiscal_year: y, key: String(y), past, share: past / d.total_assets, spend, unused: money,
        immediate_cost: spend.immediate.cost, backlog_cost: spend.backlog.cost, due_cost: spend.due.cost });
    }
    const last = years[years.length - 1];
    return { years, last, total: d3.sum(years, (r) => budget - r.unused),
      byCat: d.categories.map((_, i) => d3.sum(pool, (g) => (g.cat === i && g.eol <= y1 ? g.n : 0))) };
  }

  /** งบต่อปีน้อยที่สุดที่ทำให้ไม่เหลือครุภัณฑ์เกินอายุในปีสุดท้ายของแผน (ค้นแบบแบ่งครึ่ง ละเอียด 1 แสนบาท) */
  function budgetToClear(d) {
    let lo = 0, hi = d3.sum(d.groups, (g) => g[3]) + d3.sum(d.urgent_groups, (g) => g[3]);
    while (hi - lo > 1e5) {
      const mid = (lo + hi) / 2;
      if (simulateBudget(d, mid).last.past === 0) hi = mid; else lo = mid;
    }
    return Math.ceil(hi / 1e5) * 1e5;
  }

  Views["invest-overview"] = async (root, ctx) => {
    const d = await api("invest.php");
    if (d.empty) return emptyState(root, "ยังไม่มี snapshot ครุภัณฑ์", "รัน ETL อย่างน้อย 1 ครั้ง");
    const cur = d.current_fiscal_year, [y0, y1] = d.plan_years, T = d.thresholds;
    const mb = (v) => dec(v / 1e6);
    const GREEN = "var(--cpe-success)";
    const now = d.history[d.history.length - 1], prev = d.history[d.history.length - 2];
    const clear = budgetToClear(d), keep = d.keep_up_per_year;
    const none = simulateBudget(d, 0);

    stats(root, [
      { label: `เกินอายุการใช้งาน ปีงบ ${cur}`, value: pct(now.share, 0), sub: `${num(now.past)} จาก ${num(now.n)} ชิ้น`,
        ...vsPrev(now.share, prev.share, prev.fiscal_year, { better: "down", kind: "rate" }) },
      { label: `งบที่ล้างค้างได้ภายใน ${y1}`, value: mb(clear), unit: "ล้านบาท/ปี" },
      { label: "งบเฉลี่ยตามอายุการใช้งาน", value: mb(keep), unit: "ล้านบาท/ปี", sub: "ราคา ÷ อายุการใช้งาน รวมทุกชิ้น" },
      { label: "ควรทดแทนทันที", value: num(d.immediate.length), unit: "ชิ้น",
        sub: `ค่าซ่อม ≥ ${pct(T.repair_ratio, 0)} ของราคาซื้อ และใช้งานเกิน ${pct(T.life_share, 0)} ของอายุ`, subCls: "delta-bad" },
    ], "สรุปคำขอเงินลงทุน");

    // ---------- ถ้าได้งบปีละเท่าไร (what-if) ----------
    const max = Math.ceil((clear * 1.5) / 1e6);
    const fromQuery = parseFloat(ctx.query.get("budget"));
    let budget = Number.isFinite(fromQuery) ? Math.min(max, Math.max(0, fromQuery)) * 1e6 : clear;
    const PRESET = [["ไม่ลงทุน", 0], ["เท่างบเฉลี่ยตามอายุ", keep], [`ล้างค้างภายใน ${y1}`, clear]];

    const sim = section(root, { id: "inv-whatif", title: "ถ้าได้งบทดแทนปีละเท่าไร" });
    const ctl = document.createElement("div");
    ctl.className = "whatif";
    ctl.innerHTML = html`
      <label class="whatif-label" for="inv-budget">งบทดแทนต่อปี <output id="inv-budget-out"></output></label>
      <input id="inv-budget" type="range" min="0" max="${max}" step="0.1">
      <div class="seg" role="group" aria-label="งบที่ตั้งไว้ล่วงหน้า">${PRESET.map(([l, v], i) =>
        `<button type="button" data-i="${i}">${esc(l)} <b>${mb(v)}</b></button>`).join("")}</div>`;
    sim.appendChild(ctl);
    const slider = ctl.querySelector("input"), out = ctl.querySelector("output");
    const result = document.createElement("div");
    sim.appendChild(result);

    const s1 = section(root, { id: "inv-past-life", title: "ครุภัณฑ์ที่เกินอายุการใช้งาน" });
    const b1 = chartBox(s1);
    const s2 = section(root, { id: "inv-plan", title: "ใช้งบแต่ละปีกับอะไร (ล้านบาท)" });
    toolbar(s2, "", [["คัดลอกแผนรายปี", () => tsv(
      ["ปีงบประมาณ", "ทดแทนทันที (ชิ้น)", "ทดแทนทันที (บาท)", "เกินอายุค้างสะสม (ชิ้น)", "เกินอายุค้างสะสม (บาท)",
        "ครบอายุระหว่างแผน (ชิ้น)", "ครบอายุระหว่างแผน (บาท)", "รวม (บาท)", "เกินอายุสิ้นปี"],
      run.years.map((r) => [r.fiscal_year, r.spend.immediate.n, Math.round(r.spend.immediate.cost), r.spend.backlog.n, Math.round(r.spend.backlog.cost),
        r.spend.due.n, Math.round(r.spend.due.cost), Math.round(budget - r.unused), pct(r.share, 0)]))]]);
    const b2 = chartBox(s2, [["ทดแทนทันที", RED], ["เกินอายุค้างสะสม", BLUE], ["ครบอายุระหว่างแผน", MUTED]]);
    const s3 = section(root, { id: "inv-category", title: "แยกตามหมวด" });
    const catBox = document.createElement("div");
    s3.appendChild(catBox);

    let run = simulateBudget(d, budget);
    const drawLines = () => {
      const rows = [
        ...d.history.map((h) => ({ key: String(h.fiscal_year), actual: h.share,
          none: h.fiscal_year === cur ? h.share : null, plan: h.fiscal_year === cur ? h.share : null })),
        ...run.years.map((r, i) => ({ key: r.key, actual: null, none: none.years[i].share, plan: r.share })),
      ];
      Charts.lines(b1, rows, { label: "สัดส่วนครุภัณฑ์ที่เกินอายุการใช้งาน", xKey: "key", xLabel: (r) => r.key, yMax: 1,
        series: [{ key: "actual", label: "ที่ผ่านมา", color: BLUE }, { key: "none", label: "ไม่ลงทุน", color: RED },
          { key: "plan", label: `ปีละ ${mb(budget)} ล้าน`, color: GREEN }],
        yFmt: (v) => pct(v, 0), tipTitle: (r) => `ปีงบ ${r.key}` });
    };
    const drawBars = () => Charts.bars(b2, run.years, { label: "การใช้งบทดแทนรายปี",
      series: [{ key: "immediate_cost", color: RED }, { key: "backlog_cost", color: BLUE }, { key: "due_cost", color: MUTED }],
      yFmt: mb, xLabel: (r) => r.key, tipTitle: (r) => `ปีงบ ${r.key} · ใช้ ${mb(budget - r.unused)} ล้านบาท`,
      tipLines: (r) => [["ทดแทนทันที", `${num(r.spend.immediate.n)} ชิ้น`, RED], ["ค้างสะสม", `${num(r.spend.backlog.n)} ชิ้น`, BLUE],
        ["ครบอายุ", `${num(r.spend.due.n)} ชิ้น`, MUTED], ["เกินอายุสิ้นปี", pct(r.share, 0)]] });

    function update() {
      run = simulateBudget(d, budget);
      out.textContent = `${mb(budget)} ล้านบาท`;
      slider.value = String(budget / 1e6);
      ctl.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(Math.abs(PRESET[b.dataset.i][1] - budget) < 5e4)));
      const L = run.last;
      result.replaceChildren();
      stats(result, [
        { label: `เกินอายุ ปีงบ ${y1}`, value: pct(L.share, 0), sub: `ปัจจุบัน ${pct(now.share, 0)} · ไม่ลงทุน ${pct(none.last.share, 0)}`,
          subCls: L.share < now.share ? "delta-good" : L.share > now.share ? "delta-bad" : "delta-flat" },
        { label: `ยังค้างทดแทน สิ้นปีงบ ${y1}`, value: num(L.past), unit: "ชิ้น" },
        { label: `ใช้งบรวม ${y0}–${y1}`, value: mb(run.total), unit: "ล้านบาท",
          sub: run.total < budget * run.years.length - 1e5 ? `เหลือ ${mb(budget * run.years.length - run.total)} ล้านบาท` : "" },
      ], "ผลของงบที่เลือก");
      catBox.replaceChildren();
      table(catBox, {
        caption: "แผนทดแทนแยกตามหมวด", rows: d.categories.map((c, i) => ({ ...c, left: run.byCat[i] })), columns: [
          { key: "name", label: "หมวด", align: "l", cls: "wrap" },
          { label: "เกินอายุตอนนี้", render: (r) => `<span class="big-cell">${pct(ratio(r.past, r.assets), 0)}</span>` },
          { label: `เหลือเกินอายุ ${y1}`, render: (r) => `<span class="big-cell ${r.left ? "" : "is-ok"}">${pct(ratio(r.left, r.assets), 0)}</span>` },
          { label: "อายุใช้งาน", render: (r) => `${num(r.life)} ปี` },
          { label: "ทั้งหมด", render: (r) => num(r.assets) },
          { label: `ต้องทดแทนภายใน ${y1}`, render: (r) => num(r.past + r.due) },
          { label: "งบทดแทน (บาท)", render: (r) => num(r.cost) },
        ],
      });
      drawLines();
      drawBars();
      ctx.setQuery({ budget: budget / 1e6 });
    }
    slider.addEventListener("input", () => { budget = parseFloat(slider.value) * 1e6; update(); });
    ctl.querySelector(".seg").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { budget = PRESET[b.dataset.i][1]; update(); }
    });
    update();
    responsive(b1, drawLines);
    responsive(b2, drawBars);

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

  // =====================================================================
  // ตัวสำรวจรายการ (แนวเดียวกับ dashboard_borrow.html ของ Boom):
  // ชิปสัญญาณกดกรองได้ + ตัวกรอง + ตัวเลขหลักและกราฟรายเดือนที่เปลี่ยนตามตัวกรอง + ตาราง + หน้าต่างรายละเอียดพร้อมประวัติ
  const FLAG = {
    repeat: ["แจ้งซ้ำที่เดิม", "bad"], aircon: ["งานแอร์", "info"], slow: ["เกินเกณฑ์วันทำการ", "warn"], noplace: ["ไม่ระบุอาคาร", "warn"],
    followup: ["ซ่อมซ้ำ", "warn"], dispose: ["ไม่คุ้มซ่อม", "bad"], vendor: ["ส่งร้าน", ""],
  };
  const flagChips = (flags, show = Object.keys(FLAG)) => {
    const f = flags.filter((x) => show.includes(x));
    return f.length ? f.map((x) => `<span class="status ${FLAG[x][1]}">${esc(FLAG[x][0])}</span>`).join(" ") : `<span class="muted-text">ปกติ</span>`;
  };
  const countBy = (rows, fn) => {
    const m = new Map();
    rows.forEach((r) => { const k = fn(r); if (k !== null && k !== undefined) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  function facts(root, pairs) {
    const dl = document.createElement("dl");
    dl.className = "facts";
    dl.innerHTML = pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("");
    root.appendChild(dl);
  }

  /**
   * cfg: rows, date(r) "YYYY-MM-DD", isFlag(r), flagLabel, chips [{id,label,test}], filters [{id,label,value(r),desc?}],
   *      search(r), kpis(rows) -> stats items, highlights(rows) -> [{label, text, row?}], columns, detailTitle(r), detail(r, all) -> [{label, render(el)}]
   */
  function explorer(root, ctx, cfg) {
    const all = cfg.rows, q = ctx.query, PAGE = 12;
    const state = { chip: q.get("chip") || "all", text: q.get("q") || "", page: 1,
      filters: Object.fromEntries(cfg.filters.map((f) => [f.id, q.get(f.id) || ""])) };

    const chipBar = document.createElement("div");
    chipBar.className = "chips";
    chipBar.setAttribute("role", "group");
    chipBar.setAttribute("aria-label", "สัญญาณ");
    root.appendChild(chipBar);

    const bar = document.createElement("div");
    bar.className = "toolbar";
    bar.innerHTML = html`<label class="field">ค้นหา<input type="search" data-f="q" autocomplete="off" value="${esc(state.text)}"></label>` +
      cfg.filters.map((f) => {
        const vals = [...new Set(all.map(f.value).filter((v) => v !== null && v !== undefined && v !== ""))]
          .sort((a, b) => (f.desc ? -1 : 1) * String(a).localeCompare(String(b), "th", { numeric: true }));
        return html`<label class="field">${esc(f.label)}<select data-f="${f.id}"><option value="">ทั้งหมด</option>${vals.map((v) =>
          `<option value="${esc(v)}"${String(v) === state.filters[f.id] ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
      }).join("") + `<button type="button" class="btn" data-reset hidden>ล้างตัวกรอง</button>`;
    root.appendChild(bar);

    const kpiBox = document.createElement("div");
    root.appendChild(kpiBox);
    const hl = document.createElement("div");
    hl.className = "hl-row";
    root.appendChild(hl);
    const chartSec = section(root, { id: "exp-month", title: "รายเดือน" });
    const chart = chartBox(chartSec, [["ปกติ", BLUE], [cfg.flagLabel, RED]]);
    const tableSec = section(root, { id: "exp-table", title: "รายการ" });
    const tableBox = document.createElement("div");
    tableSec.appendChild(tableBox);
    const pager = document.createElement("div");
    pager.className = "pager";
    pager.innerHTML = `<button class="btn" type="button" data-p="-1">ก่อนหน้า</button><span></span><button class="btn" type="button" data-p="1">ถัดไป</button>`;
    tableSec.appendChild(pager);

    // หน้าต่างรายละเอียด (dialog ของ browser: กด Esc ปิดได้ โฟกัสอยู่ในหน้าต่าง)
    const dlg = document.createElement("dialog");
    dlg.className = "detail";
    dlg.innerHTML = `<div class="detail-head"><h2></h2><button type="button" class="btn" data-close>ปิด</button></div>
      <div class="detail-tabs" role="tablist"></div><div class="detail-body"></div>`;
    root.appendChild(dlg);
    dlg.querySelector("[data-close]").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    function openDetail(r) {
      dlg.querySelector("h2").textContent = cfg.detailTitle(r);
      const tabs = cfg.detail(r, all), tabBar = dlg.querySelector(".detail-tabs"), body = dlg.querySelector(".detail-body");
      const show = (i) => {
        tabBar.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-selected", String(i === j)));
        body.replaceChildren();
        tabs[i].render(body);
      };
      tabBar.innerHTML = tabs.map((t, i) => `<button type="button" role="tab" data-t="${i}">${esc(t.label)}</button>`).join("");
      tabBar.onclick = (e) => { const b = e.target.closest("button"); if (b) show(+b.dataset.t); };
      show(0);
      dlg.showModal();
    }

    let view = [], months = [];
    const drawChart = () => Charts.bars(chart, months, {
      label: "จำนวนรายการรายเดือน", yFmt: num,
      series: [{ key: "normal", color: BLUE }, { key: "flagged", color: RED }],
      xLabel: (r) => (r.month === 10 ? monthLabel(r.year, r.month) : null),
      tipTitle: (r) => `${monthLabel(r.year, r.month)} · ปีงบ ${r.fiscal_year}`,
      tipLines: (r) => [["ทั้งหมด", num(r.normal + r.flagged)], [cfg.flagLabel, num(r.flagged), RED]],
    });

    function render(resetPage = true) {
      if (resetPage) state.page = 1;
      const text = state.text.toLowerCase();
      const base = all.filter((r) => cfg.filters.every((f) => !state.filters[f.id] || String(f.value(r)) === state.filters[f.id])
        && (!text || cfg.search(r).toLowerCase().includes(text)));
      const chips = [{ id: "all", label: "ทั้งหมด", test: () => true }, ...cfg.chips];
      if (!chips.some((c) => c.id === state.chip)) state.chip = "all";
      chipBar.innerHTML = chips.map((c) => `<button type="button" data-c="${c.id}" aria-pressed="${c.id === state.chip}">${esc(c.label)} <b>${num(base.filter(c.test).length)}</b></button>`).join("");
      view = base.filter(chips.find((c) => c.id === state.chip).test);
      bar.querySelector("[data-reset]").hidden = !(state.text || state.chip !== "all" || Object.values(state.filters).some(Boolean));
      ctx.setQuery({ chip: state.chip === "all" ? "" : state.chip, q: state.text, ...state.filters });

      kpiBox.replaceChildren();
      stats(kpiBox, cfg.kpis(view), "ตัวเลขตามตัวกรอง");

      const items = view.length ? cfg.highlights(view) : [];
      hl.innerHTML = items.length ? `<span class="hl-label">เด่น</span>` + items.map((h, i) =>
        `<${h.row ? `button type="button" data-h="${i}"` : "span"} class="hl"><span>${esc(h.label)}</span> <b>${esc(h.text)}</b></${h.row ? "button" : "span"}>`).join("") : "";
      hl.onclick = (e) => { const b = e.target.closest("[data-h]"); if (b) openDetail(items[+b.dataset.h].row); };

      const byM = new Map();
      view.forEach((r) => {
        const [y, m] = cfg.date(r).split("-").map(Number), k = y * 12 + m - 1;
        if (!byM.has(k)) byM.set(k, { year: y, month: m, fiscal_year: y + 543 + (m >= 10 ? 1 : 0), flagged: 0, normal: 0 });
        byM.get(k)[cfg.isFlag(r) ? "flagged" : "normal"]++;
      });
      months = fillMonths([...byM.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]), ["flagged", "normal"]);
      drawChart();
      renderTable();
    }

    function renderTable() {
      const pages = Math.max(1, Math.ceil(view.length / PAGE));
      state.page = Math.min(state.page, pages);
      const slice = view.slice((state.page - 1) * PAGE, state.page * PAGE);
      tableBox.replaceChildren();
      if (!slice.length) emptyState(tableBox, "ไม่พบรายการ", "ลองล้างตัวกรอง");
      else {
        const w = table(tableBox, { caption: "รายการตามตัวกรอง", rows: slice, columns: [...cfg.columns,
          { label: "", render: (r) => `<button type="button" class="btn btn-sm" data-i="${view.indexOf(r)}">ดูข้อมูล</button>` }] });
        w.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) openDetail(view[+b.dataset.i]); });
      }
      pager.querySelector("span").textContent = `${num(view.length)} รายการ · หน้า ${num(state.page)} / ${num(pages)}`;
      pager.querySelector('[data-p="-1"]').disabled = state.page <= 1;
      pager.querySelector('[data-p="1"]').disabled = state.page >= pages;
    }

    chipBar.addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (b) { state.chip = b.dataset.c; render(); } });
    let t;
    bar.addEventListener("input", (e) => {
      const f = e.target.dataset.f;
      if (f === "q") { clearTimeout(t); t = setTimeout(() => { state.text = e.target.value.trim(); render(); }, 250); }
    });
    bar.addEventListener("change", (e) => { const f = e.target.dataset.f; if (f && f !== "q") { state.filters[f] = e.target.value; render(); } });
    bar.querySelector("[data-reset]").addEventListener("click", () => {
      state.text = ""; state.chip = "all";
      Object.keys(state.filters).forEach((k) => { state.filters[k] = ""; });
      bar.querySelectorAll("select").forEach((s) => { s.value = ""; });
      bar.querySelector("input").value = "";
      render();
    });
    pager.addEventListener("click", (e) => { const b = e.target.closest("[data-p]"); if (b) { state.page += +b.dataset.p; renderTable(); } });
    render();
    responsive(chart, drawChart);
  }

  Views["facility-jobs"] = async (root, ctx) => {
    const d = await api("facility.php?view=jobs");
    const has = (f) => (r) => r.flags.includes(f);
    explorer(root, ctx, {
      rows: d.rows, date: (r) => r.reported, flagLabel: "แจ้งซ้ำ / ปิดงานช้า", isFlag: (r) => has("repeat")(r) || has("slow")(r),
      chips: [
        { id: "repeat", label: "แจ้งซ้ำที่เดิมภายใน 30 วัน", test: has("repeat") },
        { id: "aircon", label: "งานแอร์", test: has("aircon") },
        { id: "slow", label: `ปิดงานเกิน ${d.sla_workdays} วันทำการ`, test: has("slow") },
        { id: "noplace", label: "ไม่ระบุอาคาร", test: has("noplace") },
      ],
      search: (r) => `${r.type_name} ${r.place} ${r.department}`,
      filters: [
        { id: "fy", label: "ปีงบ", value: (r) => r.fiscal_year, desc: true },
        { id: "building", label: "อาคาร", value: (r) => r.building },
        { id: "type", label: "ประเภทงาน", value: (r) => r.type_name },
        { id: "reporter", label: "ผู้แจ้ง", value: (r) => r.reporter_status || "ไม่ระบุ" },
      ],
      kpis: (rows) => {
        const topB = countBy(rows.filter((r) => r.building !== "ไม่ระบุอาคาร"), (r) => r.building)[0];
        return [
          { label: "งานแจ้งซ่อม", value: num(rows.length), unit: "งาน" },
          { label: "แจ้งซ้ำที่เดิม", value: num(rows.filter(has("repeat")).length), unit: "งาน", sub: "ภายใน 30 วัน", subCls: "delta-bad" },
          { label: "งานแอร์", value: pct(ratio(rows.filter(has("aircon")).length, rows.length), 0) },
          { label: "อาคารที่แจ้งมากสุด", value: topB ? topB[0] : "–", sub: topB ? `${num(topB[1])} งาน` : "" },
        ];
      },
      highlights: (rows) => {
        const place = countBy(rows.filter((r) => r.location_key !== null), (r) => r.place)[0];
        const type = countBy(rows, (r) => r.type_name)[0];
        const month = countBy(rows, (r) => r.reported.slice(0, 7))[0];
        const out = [];
        if (place && place[1] > 1) out.push({ label: "แจ้งบ่อยสุด:", text: `${place[0]} (${num(place[1])})`, row: rows.find((r) => r.place === place[0]) });
        if (type) out.push({ label: "ประเภทมากสุด:", text: `${type[0]} (${num(type[1])})` });
        if (month) { const [y, m] = month[0].split("-").map(Number); out.push({ label: "เดือนที่แจ้งมากสุด:", text: `${monthLabel(y, m)} (${num(month[1])})` }); }
        return out;
      },
      columns: [
        { label: "วันที่แจ้ง", align: "l", render: (r) => esc(dateTH(r.reported)) },
        { key: "type_name", label: "ประเภทงาน", align: "l", cls: "wrap" },
        { key: "place", label: "สถานที่", align: "l", cls: "wrap" },
        { key: "source", label: "ช่องทาง", align: "l" },
        { label: "สัญญาณ", align: "l", render: (r) => flagChips(r.flags, ["repeat", "slow", "noplace"]) },
      ],
      detailTitle: (r) => `${r.type_name} · ${dateTH(r.reported)}`,
      detail: (r, rows) => [
        { label: "งานแจ้งซ่อม", render: (el) => facts(el, [
          ["วันที่แจ้ง", esc(dateTH(r.reported))], ["ประเภทงาน", esc(r.type_name)], ["สถานที่", esc(r.place)],
          ["หน่วยงานผู้แจ้ง", esc(r.department)], ["สถานภาพผู้แจ้ง", esc(r.reporter_status || "–")], ["ช่องทาง", esc(r.source)],
          ["ผู้รับงาน", esc(r.staff || "–")],
          ["ปิดงาน", r.completed ? `${esc(dateTH(r.completed))} · ${num(r.workdays)} วันทำการ` : "–"],
          ["สัญญาณ", flagChips(r.flags)],
        ]) },
        { label: "ประวัติสถานที่นี้", render: (el) => {
          const same = rows.filter((x) => (r.location_key !== null ? x.location_key === r.location_key : x.building === r.building));
          stats(el, [
            { label: r.location_key !== null ? r.place : r.building, value: num(same.length), unit: "งาน" },
            { label: "แจ้งซ้ำภายใน 30 วัน", value: num(same.filter(has("repeat")).length), unit: "งาน" },
            { label: "ประเภทที่แจ้งบ่อย", value: countBy(same, (x) => x.type_name)[0][0].replace(/^งาน/, "") },
          ], "สรุปสถานที่");
          table(el, { caption: "งานแจ้งซ่อมที่สถานที่นี้", tall: true, rows: same, columns: [
            { label: "วันที่แจ้ง", align: "l", render: (x) => `${esc(dateTH(x.reported))}${x.id === r.id ? ' <span class="status info">รายการนี้</span>' : ""}` },
            { key: "type_name", label: "ประเภทงาน", align: "l", cls: "wrap" },
            { key: "source", label: "ช่องทาง", align: "l" },
          ] });
        } },
      ],
    });
  };

  Views["repair-jobs"] = async (root, ctx) => {
    const d = await api("repair.php?view=jobs");
    const has = (f) => (r) => r.flags.includes(f);
    const sla = d.sla_workdays;
    explorer(root, ctx, {
      rows: d.rows, date: (r) => r.repair_date, flagLabel: "ซ่อมซ้ำ / ช้า / ไม่คุ้ม",
      isFlag: (r) => ["followup", "slow", "dispose"].some((f) => r.flags.includes(f)),
      chips: [
        { id: "followup", label: "ซ่อมซ้ำอาการเดิม", test: has("followup") },
        { id: "slow", label: `เกิน ${sla} วันทำการ`, test: has("slow") },
        { id: "dispose", label: "ครุภัณฑ์ไม่คุ้มซ่อม", test: has("dispose") },
        { id: "vendor", label: "ส่งร้านภายนอก", test: has("vendor") },
      ],
      search: (r) => `${r.asset_name} ${r.asset_code} ${r.vendor_name || ""}`,
      filters: [
        { id: "fy", label: "ปีงบ", value: (r) => r.fiscal_year, desc: true },
        { id: "category", label: "หมวด", value: (r) => r.category },
        { id: "department", label: "หน่วยงาน", value: (r) => r.department },
        { id: "by", label: "ผู้ซ่อม", value: (r) => r.handled_by },
      ],
      kpis: (rows) => {
        const done = rows.filter((r) => r.workdays !== null);
        return [
          { label: "งานซ่อม", value: num(rows.length), unit: "งาน" },
          { label: "ค่าซ่อม", value: num(d3.sum(rows, (r) => r.cost)), unit: "บาท" },
          { label: `เสร็จใน ${sla} วันทำการ`, value: pct(ratio(done.filter((r) => r.workdays <= sla).length, done.length), 0) },
          { label: "ซ่อมซ้ำอาการเดิม", value: num(rows.filter(has("followup")).length), unit: "งาน", subCls: "delta-bad" },
        ];
      },
      highlights: (rows) => {
        const out = [];
        const cost = d3.greatest(rows, (r) => r.cost), slow = d3.greatest(rows.filter((r) => r.workdays !== null), (r) => r.workdays);
        const often = countBy(rows, (r) => r.asset_code)[0];
        if (cost && cost.cost) out.push({ label: "ค่าซ่อมสูงสุด:", text: `${cost.asset_name} ${num(cost.cost)} บาท`, row: cost });
        if (slow) out.push({ label: "ซ่อมนานสุด:", text: `${slow.asset_name} ${num(slow.workdays)} วันทำการ`, row: slow });
        if (often && often[1] > 1) {
          const r = rows.find((x) => x.asset_code === often[0]);
          out.push({ label: "ซ่อมบ่อยสุด:", text: `${r.asset_name} ${num(often[1])} ครั้ง`, row: r });
        }
        return out;
      },
      columns: [
        { label: "วันที่แจ้ง", align: "l", render: (r) => esc(dateTH(r.repair_date)) },
        { key: "asset_name", label: "ครุภัณฑ์", align: "l", cls: "wrap" },
        { label: "หมวด", align: "l", render: (r) => esc(r.category.replace(/^ครุภัณฑ์/, "")) },
        { label: "ค่าซ่อม", render: (r) => num(r.cost) },
        { label: "วันทำการ", render: (r) => (r.workdays === null ? "–" : num(r.workdays)) },
        { label: "สัญญาณ", align: "l", render: (r) => flagChips(r.flags, ["followup", "slow", "dispose"]) },
      ],
      detailTitle: (r) => r.asset_name,
      detail: (r, rows) => [
        { label: "งานซ่อม", render: (el) => facts(el, [
          ["วันที่แจ้ง", esc(dateTH(r.repair_date))],
          ["ซ่อมเสร็จ", r.complete_date ? `${esc(dateTH(r.complete_date))} · ${num(r.workdays)} วันทำการ` : "–"],
          ["ผู้ซ่อม", esc(r.vendor_name ? `ส่งร้าน: ${r.vendor_name}` : "ซ่อมเองโดยเจ้าหน้าที่")],
          ["สถานะ", esc(r.repair_status || "–")], ["ค่าซ่อม", `${num(r.cost)} บาท`],
          ["ซ่อมซ้ำ", r.is_followup_flag ? `ครั้งที่ ${num(r.followup_no)}` : "ไม่ใช่"],
          ["ผู้อนุมัติ", esc(r.approver || "–")], ["หน่วยงาน", esc(r.department)],
          ["หมวด", esc(r.category)], ["เลขครุภัณฑ์", esc(r.asset_code)], ["สัญญาณ", flagChips(r.flags)],
        ]) },
        { label: "ประวัติครุภัณฑ์ชิ้นนี้", render: (el) => {
          const same = rows.filter((x) => x.asset_code === r.asset_code);
          const cls = r.asset_verdict === "dispose" ? "delta-bad" : r.asset_verdict === "ok" ? "delta-good" : "delta-flat";
          stats(el, [
            { label: "ค่าซ่อมสะสม / ราคาซื้อ", value: pct(r.asset_ratio, 0),
              sub: `${num(r.asset_repair_cost)} / ${num(r.asset_price)} บาท`, subCls: cls },
            { label: "ซ่อมทั้งหมด", value: num(same.length), unit: "ครั้ง" },
            { label: "อายุ / อายุการใช้งาน", value: r.asset_age_years === null ? "–" : `${num(r.asset_age_years)}/${num(r.asset_life_years)}`, unit: "ปี" },
          ], "สรุปครุภัณฑ์");
          table(el, { caption: "งานซ่อมของครุภัณฑ์ชิ้นนี้", tall: true, rows: same, columns: [
            { label: "วันที่แจ้ง", align: "l", render: (x) => `${esc(dateTH(x.repair_date))}${x.id === r.id ? ' <span class="status info">รายการนี้</span>' : ""}` },
            { key: "handled_by", label: "ผู้ซ่อม", align: "l" },
            { label: "ค่าซ่อม", render: (x) => num(x.cost) },
            { label: "วันทำการ", render: (x) => (x.workdays === null ? "–" : num(x.workdays)) },
            { label: "ซ่อมซ้ำ", align: "l", render: (x) => (x.is_followup_flag ? '<span class="status warn">ใช่</span>' : "–") },
          ] });
        } },
      ],
    });
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
  window.ViewApi = api;   // ให้ app.js ดึงตัวเลขบนแท็บผ่านที่อยู่ API เดียวกัน
  window.ViewStates = { emptyState, errorState };
})();
