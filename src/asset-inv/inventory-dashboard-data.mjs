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
  "ageThreshold",
]);

export function buildInventoryDashboardUrl(endpoint, filters = {}, view = null, { summaryOnly = false } = {}) {
  const url = new URL(endpoint);
  if (typeof view === "string" && view !== "") url.searchParams.set("view", view);
  if (view === "acquisition" && summaryOnly) url.searchParams.set("summary", "1");
  for (const name of FILTER_PARAMETERS) {
    const value = filters[name];
    if (value === undefined || value === null || value === "" || value === "all") continue;
    if (name === "snapshot" && value === "latest") continue;
    if (name === "ageThreshold" && Number(value) === 10) continue;
    url.searchParams.set(name, String(value));
  }
  return url.href;
}

export function buildAcquisitionDetailUrl(endpoint, filters, snapshotId, detail) {
  if (typeof snapshotId !== "string" || snapshotId.trim() === "") {
    throw new TypeError("Acquisition detail requests require a snapshot ID");
  }
  if (!detail || !["cohort", "cross"].includes(detail.detail)) {
    throw new TypeError("Acquisition detail requests require a supported detail kind");
  }

  const url = new URL(buildInventoryDashboardUrl(endpoint, {
    ...filters,
    snapshot: snapshotId.startsWith("id:") ? snapshotId : `id:${snapshotId}`,
  }, "acquisition", { summaryOnly: true }));
  for (const [name, value] of Object.entries(detail)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(name, String(value));
  }
  return url.href;
}

export function hasComparableSnapshots(payload) {
  const snapshots = Array.isArray(payload?.snapshotOptions) ? payload.snapshotOptions : [];
  const series = Array.isArray(payload?.history?.series) ? payload.history.series : [];
  const keys = new Set(snapshots.map((snapshot) => snapshot?.snapshotId ?? snapshot?.key).filter((key) => typeof key === "string" && key.length > 0));
  return Boolean(
    payload?.history?.available === true &&
    keys.size >= 2 &&
    series.length >= 2 &&
    payload.history.comparison &&
    typeof payload.history.comparison === "object",
  );
}
