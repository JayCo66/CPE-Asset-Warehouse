export const ASSET_DETAIL_API_PAGE_SIZE = 100;

export const ASSET_DETAIL_API_ENDPOINTS = Object.freeze({
  assets: "assets.php",
  borrowItems: "borrow_request_items.php",
  borrowRequests: "borrow.php",
  maintenance: "maintenance_asset.php",
});

export function normalizeAssetId(value) {
  const assetId = Number.parseInt(value, 10);
  return Number.isInteger(assetId) && assetId > 0 ? assetId : null;
}

export function filterAssetHistory(rows, assetId) {
  const normalizedAssetId = normalizeAssetId(assetId);
  if (!normalizedAssetId || !Array.isArray(rows)) return [];

  return rows.filter((row) => Number(row?.asset_id) === normalizedAssetId);
}

export function combineBorrowHistory(items, requests, assetId) {
  const requestsById = new Map(
    (Array.isArray(requests) ? requests : [])
      .filter((request) => request && request.id !== null && request.id !== undefined)
      .map((request) => [Number(request.id), request]),
  );

  return filterAssetHistory(items, assetId)
    .map((item) => ({
      ...requestsById.get(Number(item.request_id)),
      ...item,
    }))
    .sort((rowA, rowB) => {
      const dateA = rowA.borrow_date || rowA.created_at || "";
      const dateB = rowB.borrow_date || rowB.created_at || "";
      return String(dateB).localeCompare(String(dateA));
    });
}

export function sortMaintenanceHistory(rows, assetId) {
  return filterAssetHistory(rows, assetId).sort((rowA, rowB) =>
    String(rowB.repair_date || rowB.created_at || "").localeCompare(String(rowA.repair_date || rowA.created_at || "")),
  );
}
