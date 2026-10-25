const INVENTORY_FILTER_PARAMETERS = Object.freeze([
  "status",
  "type",
  "snapshot",
  "department",
  "category",
  "building",
  "floor",
  "room",
  "area",
  "source",
  "acquisitionYear",
  "fiscalYear",
  "acquisitionFiscalYear",
  "ageBand",
  "availability",
  "damage",
  "locationStatus",
]);

function applyInventoryFilters(url, { search = "", ...filters } = {}) {
  const normalizedSearch = String(search).trim();

  if (normalizedSearch) url.searchParams.set("q", normalizedSearch);
  for (const name of INVENTORY_FILTER_PARAMETERS) {
    const value = filters[name];
    if (
      value === undefined ||
      value === null ||
      String(value).trim() === "" ||
      value === "all" ||
      (name === "snapshot" && value === "latest")
    ) continue;
    url.searchParams.set(name, String(value).trim());
  }

  return url;
}

export function buildAssetInventoryApiUrl(endpoint, options = {}) {
  const url = new URL(endpoint, import.meta.url);
  url.searchParams.set("page", String(options.page ?? 1));
  url.searchParams.set("limit", String(options.pageSize ?? 10));
  return applyInventoryFilters(url, options).href;
}

export function buildAssetInventoryExportUrl(endpoint, options = {}) {
  const url = new URL(endpoint, import.meta.url);
  url.searchParams.set("format", "csv");
  url.searchParams.set("scope", "all");
  return applyInventoryFilters(url, options).href;
}
