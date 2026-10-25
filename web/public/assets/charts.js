// กราฟแท่ง/เส้นด้วย d3: สีมาจาก CSS token, ทุกกราฟมี tooltip และไม่มีแกน y ซ้อนสองแกน
(function () {
  const H = 240, TOP = 14, BOTTOM = 28;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function tooltip(box) {
    let tip = box.querySelector(".tip");
    if (!tip) { tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; box.appendChild(tip); }
    return {
      show(x, y, title, lines) {
        tip.replaceChildren();
        const t = document.createElement("div"); t.className = "t"; t.textContent = title; tip.appendChild(t);
        lines.forEach(([label, value, color]) => {
          const l = document.createElement("div");
          if (color) { const i = document.createElement("i"); i.style.background = color; l.appendChild(i); }
          l.appendChild(document.createTextNode(label ? `${label}  ${value}` : value));
          tip.appendChild(l);
        });
        tip.hidden = false;
        const w = tip.offsetWidth, h = tip.offsetHeight;
        tip.style.left = Math.max(0, Math.min(box.clientWidth - w, x - w / 2)) + "px";
        tip.style.top = Math.max(0, y - h - 10) + "px";
      },
      hide() { tip.hidden = true; },
    };
  }

  // กราฟที่คลิกได้ (onPick): บอกใน tooltip และให้แถบรับคลิกทั้งแถบ
  const withHint = (lines, onPick) => (onPick ? [...lines, ["", "คลิกดูรายการ"]] : lines);
  function pickable(sel, onPick, tip) {
    if (!onPick) return;
    sel.style("cursor", "pointer").on("click", (ev, r) => { tip.hide(); onPick(r); });
  }

  function frame(box) {
    box.querySelectorAll("svg").forEach((n) => n.remove());
    const W = Math.max(box.clientWidth, 280);
    const svg = d3.select(box).append("svg").attr("width", "100%").attr("height", H).attr("viewBox", `0 0 ${W} ${H}`)
      .attr("role", "img");
    return { svg, W };
  }

  function yAxis(svg, y, fmt, W) {
    const g = svg.append("g");
    const ticks = y.ticks(4);
    const labels = g.selectAll("text").data(ticks).join("text").attr("text-anchor", "end").attr("dy", "0.32em").text(fmt);
    const left = d3.max(labels.nodes(), (n) => n.getComputedTextLength()) + 10;
    labels.attr("x", left - 6).attr("y", (d) => y(d));
    g.selectAll("line").data(ticks).join("line").attr("x1", left).attr("x2", W).attr("y1", (d) => y(d)).attr("y2", (d) => y(d))
      .style("stroke", "var(--line)");
    return left;
  }

  function xLabels(svg, items, xOf, label, W, y = H - 9) {
    let lastX = -Infinity;
    items.forEach((it) => {
      const text = label(it);
      if (text === null) return;
      const cx = xOf(it);
      const t = svg.append("text").attr("x", cx).attr("y", y).attr("text-anchor", "middle").text(text);
      const w = t.node().getComputedTextLength();
      if (cx - w / 2 < lastX + 8 || cx + w / 2 > W + 2) t.remove(); else lastX = cx + w / 2;
    });
  }

  const barPath = (x, y, w, h, r) => {
    if (h <= 0) return "";
    r = Math.min(r, h, w / 2);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  };

  /** แท่ง (ซ้อนได้) ; series: [{key, label, color}] ; ref: {key, label} เส้นแนวตั้งอ้างอิง */
  function bars(box, rows, { series, yFmt, xLabel, ref, tipTitle, tipLines, label, onPick }) {
    const { svg, W } = frame(box);
    svg.attr("aria-label", label || "");
    const total = (r) => d3.sum(series, (s) => +r[s.key] || 0);
    const y = d3.scaleLinear([0, d3.max(rows, total) || 1], [H - BOTTOM, TOP]).nice(4);
    const left = yAxis(svg, y, yFmt, W);
    const x = d3.scaleBand(rows.map((r) => r.key), [left, W - 2]).paddingInner(0.22).paddingOuter(0.08);
    rows.forEach((r) => {
      let base = 0;
      series.forEach((s, i) => {
        const v = +r[s.key] || 0;
        if (!v) return;
        const isTop = series.slice(i + 1).every((t) => !(+r[t.key]));
        const gap = base ? 1 : 0;
        svg.append("path").style("fill", s.color)
          .attr("d", barPath(x(r.key), y(base + v), x.bandwidth(), y(base) - y(base + v) - gap, isTop ? 3 : 0));
        base += v;
      });
    });
    svg.append("line").attr("x1", left).attr("x2", W).attr("y1", y(0)).attr("y2", y(0)).style("stroke", "var(--line-strong)");
    xLabels(svg, rows, (r) => x(r.key) + x.bandwidth() / 2, xLabel, W);
    if (ref && x(ref.key) !== undefined) {
      const rx = x(ref.key) - (x.step() * x.paddingInner()) / 2;
      svg.append("line").attr("x1", rx).attr("x2", rx).attr("y1", TOP).attr("y2", H - BOTTOM)
        .style("stroke", "var(--cpe-text-muted)").attr("stroke-dasharray", "4 3");
      const t = svg.append("text").attr("x", rx - 6).attr("y", TOP + 8).attr("text-anchor", "end").text(ref.label);
      if (t.node().getComputedTextLength() > rx - left - 8) t.attr("text-anchor", "start").attr("x", rx + 6);
    }
    const tip = tooltip(box);
    const hl = svg.insert("rect", ":first-child").style("fill", "var(--fill-hover)").attr("opacity", 0);
    svg.append("g").selectAll("rect").data(rows).join("rect")
      .attr("x", (r) => x(r.key) - (x.step() * x.paddingInner()) / 2).attr("width", x.step())
      .attr("y", TOP).attr("height", H - BOTTOM - TOP).style("fill", "transparent")
      .on("pointerenter pointermove", (ev, r) => {
        hl.attr("x", x(r.key) - 2).attr("width", x.bandwidth() + 4).attr("y", TOP).attr("height", H - BOTTOM - TOP).attr("opacity", 1);
        tip.show(x(r.key) + x.bandwidth() / 2, y(total(r)), tipTitle(r), withHint(tipLines(r), onPick));
      })
      .on("pointerleave", () => { hl.attr("opacity", 0); tip.hide(); })
      .call(pickable, onPick, tip);
  }

  /** เส้นหลายชุดบนแกนหมวด ; label ท้ายเส้นแทน legend ; crosshair + tooltip */
  function lines(box, rows, { xKey, xLabel, series, yFmt, yMax, tipTitle, label, refY, onPick }) {
    const { svg, W } = frame(box);
    svg.attr("aria-label", label || "");
    const val = (r, s) => (r[s.key] === null || r[s.key] === undefined ? null : +r[s.key]);
    const max = Math.max(yMax || d3.max(rows, (r) => d3.max(series, (s) => val(r, s))) || 1, refY ? refY.value : 0);
    const y = d3.scaleLinear([0, max], [H - BOTTOM, TOP]).nice(4);
    const left = yAxis(svg, y, yFmt, W);
    const probe = svg.append("text").attr("class", "end-label");
    const endW = d3.max(series, (s) => { probe.text(`${s.label} ${yFmt(val(rows[rows.length - 1], s) || 0)}`); return probe.node().getComputedTextLength(); });
    probe.remove();
    const right = W - Math.min(endW + 14, W * 0.38);
    const x = d3.scalePoint(rows.map((r) => r[xKey]), [left + 10, right]).padding(0.25);
    xLabels(svg, rows, (r) => x(r[xKey]), xLabel, right + 10);
    svg.append("line").attr("x1", left).attr("x2", W).attr("y1", y(0)).attr("y2", y(0)).style("stroke", "var(--line-strong)");
    if (refY) {   // เส้นเกณฑ์แนวนอน เช่น SLA
      svg.append("line").attr("x1", left).attr("x2", right).attr("y1", y(refY.value)).attr("y2", y(refY.value))
        .style("stroke", "var(--cpe-warning)").attr("stroke-dasharray", "4 3");
      svg.append("text").attr("x", left + 4).attr("y", y(refY.value) - 5).text(refY.label);
    }
    const ends = [];
    series.forEach((s) => {
      const pts = rows.filter((r) => val(r, s) !== null);
      svg.append("path").style("fill", "none").style("stroke", s.color).attr("stroke-width", 2)
        .attr("stroke-linecap", "round").attr("stroke-linejoin", "round")
        .attr("d", d3.line().x((r) => x(r[xKey])).y((r) => y(val(r, s)))(pts));
      const last = pts[pts.length - 1];
      if (last) {
        svg.append("circle").attr("cx", x(last[xKey])).attr("cy", y(val(last, s))).attr("r", 4)
          .style("fill", s.color).style("stroke", "var(--cpe-page-start)").attr("stroke-width", 2);
        ends.push({ s, x: x(last[xKey]), y: y(val(last, s)), v: val(last, s) });
      }
    });
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    ends.forEach((e) => svg.append("text").attr("class", "end-label").attr("x", e.x + 9).attr("y", e.y).attr("dy", "0.32em")
      .text(`${e.s.label} ${yFmt(e.v)}`));
    const tip = tooltip(box);
    const rule = svg.append("line").attr("y1", TOP).attr("y2", H - BOTTOM).style("stroke", "var(--line-strong)").attr("opacity", 0);
    const dots = svg.append("g");
    const step = rows.length > 1 ? x(rows[1][xKey]) - x(rows[0][xKey]) : W;
    svg.append("g").selectAll("rect").data(rows).join("rect")
      .attr("x", (r) => x(r[xKey]) - step / 2).attr("width", step).attr("y", TOP).attr("height", H - BOTTOM - TOP)
      .style("fill", "transparent")
      .on("pointerenter pointermove", (ev, r) => {
        rule.attr("x1", x(r[xKey])).attr("x2", x(r[xKey])).attr("opacity", 1);
        dots.selectAll("circle").data(series.filter((s) => val(r, s) !== null)).join("circle")
          .attr("cx", x(r[xKey])).attr("cy", (s) => y(val(r, s))).attr("r", 4)
          .style("fill", (s) => s.color).style("stroke", "var(--cpe-page-start)").attr("stroke-width", 2);
        tip.show(x(r[xKey]), d3.min(series, (s) => (val(r, s) === null ? H : y(val(r, s)))), tipTitle(r),
          withHint(series.map((s) => [series.length > 1 ? s.label : "", val(r, s) === null ? "–" : yFmt(val(r, s)), series.length > 1 ? s.color : null]), onPick));
      })
      .on("pointerleave", () => { rule.attr("opacity", 0); dots.selectAll("circle").remove(); tip.hide(); })
      .call(pickable, onPick, tip);
  }

  /** แท่งแนวนอนเทียบ 2 ช่วง (HTML) ; rows: [{name, a, b}] */
  function compare(box, rows, { a, b, fmt, better = null }) {
    box.replaceChildren();
    const max = d3.max(rows, (r) => Math.max(+r.a || 0, +r.b || 0)) || 1;
    rows.forEach((r) => {
      const row = document.createElement("div"); row.className = "hrow";
      const lab = document.createElement("div"); lab.className = "hrow-label";
      const n = document.createElement("span"); n.textContent = r.name;
      const d = F.delta(+r.b, +r.a, { better });
      const c = document.createElement("span"); c.textContent = d.text; c.className = d.cls;
      lab.append(n, c); row.appendChild(lab);
      [[a, +r.a], [b, +r.b]].forEach(([s, v]) => {
        const bar = document.createElement("div"); bar.className = "hbar";
        const fill = document.createElement("div"); fill.style.width = (v / max) * 100 + "%"; fill.style.background = s.color;
        fill.title = s.label;
        const t = document.createElement("span"); t.textContent = fmt(v);
        bar.append(fill, t); row.appendChild(bar);
      });
      box.appendChild(row);
    });
  }

  /** ชื่อยาวใต้แท่ง: ตัดเป็นไม่เกิน 2 บรรทัดตามความกว้าง ตัดหลัง "/" หรือช่องว่างก่อน
   *  ถ้าต้องตัดกลางคำ ไม่ตัดหน้าสระหลัง/สระบนล่าง/วรรณยุกต์ และไม่ตัดหลังสระหน้า (เ แ โ ใ ไ) */
  function wrapLabel(svg, text, cx, y, width) {
    const t = svg.append("text").attr("x", cx).attr("y", y).attr("text-anchor", "middle");
    const probe = t.append("tspan").attr("x", cx).text(text);
    const fits = (s) => { probe.text(s); return probe.node().getComputedTextLength() <= width; };
    if (fits(text)) return;
    const noStart = /[ะ-ฺๅ็-๎]/, noEnd = /[เ-ไ]/;
    const lines = [];
    let line = "";
    for (const part of text.split(/(?<=[/\s])/)) {   // ทีละคำ (แยกหลัง / และช่องว่าง)
      if (fits(line + part)) { line += part; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const ch of part) {
        if (line && !noStart.test(ch) && !noEnd.test(line.slice(-1)) && !fits(line + ch)) { lines.push(line); line = ch; } else line += ch;
      }
    }
    lines.push(line);
    probe.remove();
    lines.slice(0, 2).forEach((l, i) => t.append("tspan").attr("x", cx).attr("dy", i ? "1.25em" : 0)
      .text(i === 1 && lines.length > 2 ? `${l.slice(0, -1)}…` : l));
  }

  /** แท่งเรียงคู่ต่อกลุ่มบนแกนเดียว (เทียบหลายกลุ่มพร้อมกัน) ; rows: [{name, ...}] ; series: [{key, label, color}]
   *  delta(r) -> {text, cls} แสดงเหนือกลุ่ม ; shortName(r) ชื่อใต้แกน */
  function grouped(box, rows, { series, yFmt, label, tipTitle, tipLines, delta, shortName = (r) => r.name, onPick }) {
    box.querySelectorAll("svg").forEach((n) => n.remove());
    const W = Math.max(box.clientWidth, 280), HH = 300, B = 46, T = 30;
    const svg = d3.select(box).append("svg").attr("width", "100%").attr("height", HH).attr("viewBox", `0 0 ${W} ${HH}`)
      .attr("role", "img").attr("aria-label", label || "");
    const y = d3.scaleLinear([0, d3.max(rows, (r) => d3.max(series, (s) => +r[s.key] || 0)) || 1], [HH - B, T]).nice(4);
    const left = yAxis(svg, y, yFmt, W);
    const x0 = d3.scaleBand(rows.map((r) => r.name), [left, W - 2]).paddingInner(0.28).paddingOuter(0.12);
    const x1 = d3.scaleBand(series.map((s) => s.key), [0, x0.bandwidth()]).padding(0.1);
    rows.forEach((r) => series.forEach((s) => {
      const v = +r[s.key] || 0;
      svg.append("path").style("fill", s.color).attr("d", barPath(x0(r.name) + x1(s.key), y(v), x1.bandwidth(), y(0) - y(v), 3));
    }));
    svg.append("line").attr("x1", left).attr("x2", W).attr("y1", y(0)).attr("y2", y(0)).style("stroke", "var(--line-strong)");
    rows.forEach((r) => {
      const cx = x0(r.name) + x0.bandwidth() / 2;
      wrapLabel(svg, shortName(r), cx, HH - B + 16, x0.step() - 4);
      if (delta) {
        const d = delta(r);
        svg.append("text").attr("class", `delta-label ${d.cls}`).attr("x", cx).attr("text-anchor", "middle")
          .attr("y", y(d3.max(series, (s) => +r[s.key] || 0)) - 7).text(d.text);
      }
    });
    const tip = tooltip(box);
    const hl = svg.insert("rect", ":first-child").style("fill", "var(--fill-hover)").attr("opacity", 0);
    svg.append("g").selectAll("rect").data(rows).join("rect")
      .attr("x", (r) => x0(r.name) - (x0.step() * x0.paddingInner()) / 2).attr("width", x0.step())
      .attr("y", T).attr("height", HH - B - T).style("fill", "transparent")
      .on("pointerenter pointermove", (ev, r) => {
        hl.attr("x", x0(r.name) - 4).attr("width", x0.bandwidth() + 8).attr("y", T).attr("height", HH - B - T).attr("opacity", 1);
        tip.show(x0(r.name) + x0.bandwidth() / 2, y(d3.max(series, (s) => +r[s.key] || 0)), tipTitle(r), withHint(tipLines(r), onPick));
      })
      .on("pointerleave", () => { hl.attr("opacity", 0); tip.hide(); })
      .call(pickable, onPick, tip);
  }

  /**
   * วงกลม: x แกน log (เช่น ราคา), y แกนเส้นตรง, รัศมีตาม size(r) ; refs: [{ratio, label, color}] เส้น y = ratio·x
   * dim(r) = ทำให้จาง (ไม่อยู่ในกลุ่มที่เลือก) ; onPick(r) เมื่อคลิกวง
   */
  function bubbles(box, rows, { x, y, size, color, xFmt, yFmt, xTitle, yTitle, refs = [], dim = () => false, tipTitle, tipLines, onPick, label }) {
    box.querySelectorAll("svg").forEach((n) => n.remove());
    const W = Math.max(box.clientWidth, 280), HB = 380, TOP_B = 28, AXIS = HB - 40, R_MAX = 18;
    const svg = d3.select(box).append("svg").attr("width", "100%").attr("height", HB).attr("viewBox", `0 0 ${W} ${HB}`)
      .attr("role", "img").attr("aria-label", label);
    const tip = tooltip(box);
    const [x0, x1] = d3.extent(rows, x);
    const y1 = d3.max(rows, y) || 1;
    const r = d3.scaleSqrt().domain([0, d3.max(rows, size) || 1]).range([0, R_MAX]);
    const ys = d3.scaleLinear().domain([0, y1 * 1.08]).nice().range([AXIS, TOP_B + R_MAX / 2]);
    const left = yAxis(svg, ys, yFmt, W);
    const xs = d3.scaleLog().domain([x0 / 1.25, x1 * 1.25]).range([left + R_MAX, W - R_MAX]);

    // แกน x: ค่าที่อ่านง่าย 1, 2, 5 × 10^n เท่าที่อยู่ในช่วง
    const ticks = [];
    for (let p = 10 ** Math.floor(Math.log10(x0)); p <= x1 * 1.25; p *= 10) [1, 2, 5].forEach((m) => { const v = m * p; if (v >= x0 / 1.25 && v <= x1 * 1.25) ticks.push(v); });
    xLabels(svg, ticks, (v) => xs(v), xFmt, W, AXIS + 18);
    svg.append("text").attr("x", W).attr("y", HB - 4).attr("text-anchor", "end").text(xTitle);
    svg.append("text").attr("x", left).attr("y", 12).text(yTitle);

    // เส้นเกณฑ์ y = ratio·x (บนแกน log จึงเป็นเส้นโค้ง) วาดถึงขอบบนของกราฟ
    refs.forEach((ref) => {
      const pts = d3.range(0, 121).map((i) => x0 / 1.25 * ((x1 * 1.25) / (x0 / 1.25)) ** (i / 120))
        .map((v) => [v, ref.ratio * v]).filter(([, v]) => v <= ys.domain()[1]);
      if (pts.length < 2) return;
      svg.append("path").attr("d", d3.line().x((p) => xs(p[0])).y((p) => ys(p[1]))(pts))
        .attr("fill", "none").style("stroke", ref.color).attr("stroke-width", 1.5).attr("stroke-dasharray", "5 4");
      const [lx, ly] = pts[pts.length - 1];
      svg.append("text").attr("x", xs(lx) + 4).attr("y", ys(ly) + 4).style("fill", ref.color).text(ref.label);
    });

    // วงใหญ่วาดก่อน วงเล็กอยู่บนสุด จะได้ชี้ถึงทุกวง
    const g = svg.append("g");
    g.selectAll("circle").data([...rows].sort((a, b) => size(b) - size(a))).join("circle")
      .attr("cx", (d) => xs(x(d))).attr("cy", (d) => ys(y(d))).attr("r", (d) => Math.max(3, r(size(d))))
      .style("fill", color).attr("fill-opacity", (d) => (dim(d) ? 0.12 : 0.72))
      .style("stroke", "var(--cpe-surface)").attr("stroke-width", 1).style("cursor", onPick ? "pointer" : null)
      .on("pointerenter", function (e, d) {
        d3.select(this).style("stroke", "var(--cpe-text)").attr("stroke-width", 2).raise();
        tip.show(+this.getAttribute("cx"), +this.getAttribute("cy") - +this.getAttribute("r"), tipTitle(d), tipLines(d));
      })
      .on("pointerleave", function () { d3.select(this).style("stroke", "var(--cpe-surface)").attr("stroke-width", 1); tip.hide(); })
      .on("click", (e, d) => { tip.hide(); if (onPick) onPick(d); });
  }

  function legend(items) {
    const el = document.createElement("div"); el.className = "legend";
    items.forEach(([label, color]) => {
      const s = document.createElement("span"); const i = document.createElement("i"); i.style.background = color;
      s.append(i, document.createTextNode(label)); el.appendChild(s);
    });
    return el;
  }

  window.Charts = { bars, lines, compare, grouped, bubbles, legend, css };
})();
