const AGE_BAND_KEYS = ["zeroToTwo", "threeToFive", "sixToEight", "ninePlus", "unknown"];

const CSV_COLUMNS = [
  ["รหัสสินทรัพย์", "asset_code"],
  ["ชื่อสินทรัพย์", "asset_name"],
  ["ประเภท", "type_name"],
  ["ยี่ห้อ", "brand"],
  ["สถานะ", "asset_status"],
  ["ปีที่จัดซื้อ", "year_purchase"],
  ["หน่วยงาน", "department_name"],
  ["รหัสสถานที่", "location_id"],
  ["วันที่ข้อมูล", "snapshot_date"],
];

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function normalizeSnapshotSummary(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;

  const countKeys = ["snapshotDateKey", "total", "ready", "missingLocation"];
  if (countKeys.some((key) => !isCount(snapshot[key]))) return null;
  if (snapshot.ready > snapshot.total || snapshot.missingLocation > snapshot.total) {
    return null;
  }

  const ageBands = snapshot.ageBands;
  if (!ageBands || typeof ageBands !== "object" || AGE_BAND_KEYS.some((key) => !isCount(ageBands[key]))) return null;
  if (AGE_BAND_KEYS.reduce((sum, key) => sum + ageBands[key], 0) !== snapshot.total) return null;

  return {
    snapshotDateKey: snapshot.snapshotDateKey,
    snapshotDate: typeof snapshot.snapshotDate === "string" ? snapshot.snapshotDate : null,
    total: snapshot.total,
    ready: snapshot.ready,
    missingLocation: snapshot.missingLocation,
    ageBands: Object.fromEntries(AGE_BAND_KEYS.map((key) => [key, ageBands[key]])),
  };
}

function getPercentagePointDelta(currentCount, currentTotal, previousCount, previousTotal) {
  if (currentTotal === 0 || previousTotal === 0) return null;
  const currentRate = (currentCount / currentTotal) * 100;
  const previousRate = (previousCount / previousTotal) * 100;
  return Number((currentRate - previousRate).toFixed(1));
}

export function compareInventorySnapshots(currentSnapshot, previousSnapshot) {
  const current = normalizeSnapshotSummary(currentSnapshot);
  const previous = normalizeSnapshotSummary(previousSnapshot);
  if (!current || !previous) return null;

  const currentLocated = current.total - current.missingLocation;
  const previousLocated = previous.total - previous.missingLocation;

  return {
    total: { current: current.total, previous: previous.total, delta: current.total - previous.total },
    ready: {
      current: current.ready,
      previous: previous.ready,
      delta: current.ready - previous.ready,
      percentagePointDelta: getPercentagePointDelta(current.ready, current.total, previous.ready, previous.total),
    },
    located: {
      current: currentLocated,
      previous: previousLocated,
      delta: currentLocated - previousLocated,
      percentagePointDelta: getPercentagePointDelta(currentLocated, current.total, previousLocated, previous.total),
    },
  };
}

export function filterAssetRows(rows, { search = "", status = "all", type = "all" } = {}) {
  const normalizedSearch = String(search).trim().toLocaleLowerCase("th");

  return rows.filter((row) => {
    const searchable = [
      row.asset_code,
      row.asset_name,
      row.type_name,
      row.brand,
      row.department_name,
      row.asset_status,
    ]
      .map((value) => (value === null || value === undefined ? "" : String(value)))
      .join(" ")
      .toLocaleLowerCase("th");

    return (
      searchable.includes(normalizedSearch) &&
      (status === "all" || row.asset_status === status) &&
      (type === "all" || row.type_name === type)
    );
  });
}

function escapeCsvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s\u0000-\u001f\u007f]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildAssetInventoryCsv(rows) {
  const headings = CSV_COLUMNS.map(([heading]) => heading);
  const records = rows.map((row) => CSV_COLUMNS.map(([, key]) => row[key]));
  return `\uFEFF${[headings, ...records].map((record) => record.map(escapeCsvCell).join(",")).join("\r\n")}`;
}
