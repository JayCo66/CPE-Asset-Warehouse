const FILTER_PARAMETERS = Object.freeze([
  "snapshot",
  "department",
  "category",
  "type",
  "building",
  "floor",
  "room",
  "area",
  "source",
  "status",
  "acquisitionYear",
  "fiscalYear",
  "acquisitionFiscalYear",
  "ageBand",
  "availability",
  "damage",
  "locationStatus",
  "belowThreshold",
  "ageThreshold",
]);

export function buildInventoryDashboardUrl(endpoint, filters = {}) {
  const url = new URL(endpoint);
  for (const name of FILTER_PARAMETERS) {
    const value = filters[name];
    if (value === undefined || value === null || value === "" || value === "all") continue;
    if (name === "snapshot" && value === "latest") continue;
    if (name === "ageThreshold" && Number(value) === 10) continue;
    url.searchParams.set(name, String(value));
  }
  return url.href;
}

export function hasComparableSnapshots(payload) {
  const snapshots = Array.isArray(payload?.snapshotOptions) ? payload.snapshotOptions : [];
  const series = Array.isArray(payload?.history?.series) ? payload.history.series : [];
  const keys = new Set(snapshots.map((snapshot) => Number(snapshot?.key)).filter(Number.isSafeInteger));
  return Boolean(
    payload?.history?.available === true &&
    keys.size >= 2 &&
    series.length >= 2 &&
    payload.history.comparison &&
    typeof payload.history.comparison === "object",
  );
}
