export const ASSET_API_PAGE_SIZE_OPTIONS = Object.freeze([10, 25, 50, 100]);
export const ASSET_API_DEFAULT_PAGE_SIZE = ASSET_API_PAGE_SIZE_OPTIONS[0];

export function normalizePageSize(value) {
  const pageSize = Number(value);
  return ASSET_API_PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : ASSET_API_DEFAULT_PAGE_SIZE;
}

export function getAssetApiTotalPages(total, pageSize) {
  const normalizedTotal = Math.max(0, Number(total) || 0);
  const normalizedPageSize = normalizePageSize(pageSize);
  return Math.max(1, Math.ceil(normalizedTotal / normalizedPageSize));
}

export function clampPage(value, totalPages) {
  const normalizedTotalPages = Math.max(1, Number(totalPages) || 1);
  const page = Number.parseInt(value, 10);
  const normalizedPage = Number.isFinite(page) ? page : 1;
  return Math.min(Math.max(normalizedPage, 1), normalizedTotalPages);
}

export function getAssetApiPageButtons(totalPages) {
  const normalizedTotalPages = Math.max(1, Number(totalPages) || 1);

  return [...new Set([1, normalizedTotalPages - 1, normalizedTotalPages])]
    .filter((page) => page >= 1)
    .sort((pageA, pageB) => pageA - pageB);
}

export function getAssetApiPageTargets(page, totalPages) {
  const normalizedTotalPages = Math.max(1, Number(totalPages) || 1);
  const currentPage = clampPage(page, normalizedTotalPages);

  return {
    current: currentPage,
    jumpBack: clampPage(currentPage - 2, normalizedTotalPages),
    previous: clampPage(currentPage - 1, normalizedTotalPages),
    next: clampPage(currentPage + 1, normalizedTotalPages),
    jumpForward: clampPage(currentPage + 2, normalizedTotalPages),
  };
}
