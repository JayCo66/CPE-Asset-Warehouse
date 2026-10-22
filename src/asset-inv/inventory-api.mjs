function applyInventoryFilters(url, { search = "", status = "all", type = "all" } = {}) {
  const normalizedSearch = String(search).trim();
  const normalizedStatus = String(status).trim();
  const normalizedType = String(type).trim();

  if (normalizedSearch) url.searchParams.set("q", normalizedSearch);
  if (normalizedStatus && normalizedStatus !== "all") url.searchParams.set("status", normalizedStatus);
  if (normalizedType && normalizedType !== "all") url.searchParams.set("type", normalizedType);

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
