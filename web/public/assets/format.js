// ตัวช่วยจัดรูปตัวเลข/วันที่ และสร้าง HTML อย่างปลอดภัย (ข้อมูลทุกค่าผ่าน esc)
(function () {
  const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const nf = new Intl.NumberFormat("th-TH");
  const nf1 = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 });

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => (v === null || v === undefined || v === "" ? "–" : nf.format(Math.round(+v)));
  const dec = (v) => (v === null || v === undefined || v === "" ? "–" : nf1.format(+v));
  const pct = (v, digits = 1) => (v === null || v === undefined || !isFinite(v) ? "–" : (v * 100).toFixed(digits) + "%");
  const ratio = (a, b) => (b ? a / b : null);
  const monthLabel = (y, m) => TH_MONTH[m - 1] + " " + String(+y + 543).slice(2);
  const dateTH = (iso) => {
    if (!iso) return "–";
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return `${d} ${TH_MONTH[m - 1]} ${y + 543}`;
  };
  const currentFiscalYear = () => {
    const now = new Date();
    return now.getFullYear() + 543 + (now.getMonth() >= 9 ? 1 : 0);
  };

  /** การเปลี่ยนแปลงจาก prev -> curr ; better = "down" | "up" | null ; kind = "count" (ร้อยละ) | "rate" (จุด) */
  function delta(curr, prev, { better = null, kind = "count", label = "" } = {}) {
    if (curr === null || prev === null || curr === undefined || prev === undefined) return { text: "–", cls: "delta-flat" };
    let text;
    const diff = curr - prev;
    if (kind === "rate") {
      text = (diff >= 0 ? "+" : "−") + Math.abs(diff * 100).toFixed(1) + " จุด";
    } else if (prev === 0) {
      text = diff === 0 ? "เท่าเดิม" : "ใหม่";
    } else {
      text = (diff >= 0 ? "+" : "−") + Math.abs((diff / prev) * 100).toFixed(1) + "%";
    }
    // เปลี่ยนน้อยจนปัดแล้วเป็น 0 (เช่น −0.0 จุด) ให้แสดงว่าเท่าเดิม
    if (Math.abs(diff) < (kind === "rate" ? 0.0005 : 1e-9) || (kind !== "rate" && prev && Math.abs(diff / prev) < 0.0005)) text = "เท่าเดิม";
    let cls = "delta-flat";
    if (better && Math.abs(diff) > 1e-9) cls = (diff < 0) === (better === "down") ? "delta-good" : "delta-bad";
    return { text: label ? `${text} ${label}` : text, cls };
  }

  /** เติมเดือนที่ไม่มีข้อมูลให้เป็น 0 ระหว่างเดือนแรกถึงเดือนสุดท้าย */
  function fillMonths(rows, keys) {
    if (!rows.length) return [];
    const byKey = new Map(rows.map((r) => [r.year * 12 + r.month - 1, r]));
    const first = rows[0].year * 12 + rows[0].month - 1;
    const last = rows[rows.length - 1].year * 12 + rows[rows.length - 1].month - 1;
    const out = [];
    for (let k = first; k <= last; k++) {
      const y = Math.floor(k / 12), m = (k % 12) + 1;
      const r = byKey.get(k) || { year: y, month: m, fiscal_year: y + 543 + (m >= 10 ? 1 : 0) };
      const row = { ...r, key: `${y}-${String(m).padStart(2, "0")}` };
      keys.forEach((kk) => { row[kk] = +(r[kk] || 0); });
      out.push(row);
    }
    return out;
  }

  window.F = { esc, num, dec, pct, ratio, monthLabel, dateTH, delta, fillMonths, currentFiscalYear, TH_MONTH };
})();
