export const LOCATION_PAGE_SIZES = Object.freeze([5, 10, 25, "all"]);

const LOCATION_STATES = Object.freeze([
  { key: "complete", label: "รายละเอียดครบ", countKey: "locationDetailCompleteAssets", filterValue: "complete" },
  { key: "incomplete", label: "ระบุแล้วแต่รายละเอียดไม่ครบ", countKey: "locationDetailsIncompleteAssets", filterValue: "incomplete" },
  { key: "missing", label: "ไม่มีตำแหน่งตามธงคลัง", countKey: "missingLocationAssets", filterValue: "missing" },
  { key: "unknown", label: "ไม่ทราบสถานะตำแหน่ง", countKey: "locationUnknownAssets", filterValue: "unknown" },
]);

const DEFAULT_TABLE_STATE = Object.freeze({ page: 1, pageSize: 5, sortKey: "missingRate", direction: "desc" });

function numberOrNull(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function labelCompare(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "th", { numeric: true });
}

function keyCompare(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true });
}

function rate(count, total) {
  return count === null || total === null || total <= 0 ? null : (count / total) * 100;
}

export function buildLocationCompletenessSegments(overview = {}) {
  const totalAssets = numberOrNull(overview?.totalAssets);
  const segments = LOCATION_STATES.map((state) => ({
    ...state,
    count: numberOrNull(overview?.[state.countKey]),
  }));
  const complete = totalAssets !== null
    && totalAssets >= 0
    && segments.every((segment) => segment.count !== null && segment.count >= 0)
    && segments.reduce((sum, segment) => sum + segment.count, 0) === totalAssets;
  const withShares = segments.map((segment) => ({
    ...segment,
    share: totalAssets !== null && totalAssets > 0 && segment.count !== null
      ? (segment.count / totalAssets) * 100
      : null,
  }));
  return { totalAssets, segments: withShares, available: complete };
}

export function buildLocationDepartmentRows(departments) {
  return (Array.isArray(departments) ? departments : []).map((department) => {
    const totalAssets = numberOrNull(department?.totalAssets);
    const completeAssets = numberOrNull(department?.locationDetailCompleteAssets);
    const incompleteAssets = numberOrNull(department?.locationDetailsIncompleteAssets);
    const missingAssets = numberOrNull(department?.missingLocationAssets);
    const unknownAssets = numberOrNull(department?.locationUnknownAssets);
    const key = department?.key ?? department?.departmentKey ?? department?.filterValue ?? department?.label;
    return {
      ...department,
      key: key === null || key === undefined ? null : String(key),
      label: department?.label || "ไม่ระบุหน่วยงาน",
      filterValue: department?.filterValue ?? "__missing__",
      totalAssets,
      completeAssets,
      incompleteAssets,
      missingAssets,
      unknownAssets,
      completeRate: rate(completeAssets, totalAssets),
      incompleteRate: rate(incompleteAssets, totalAssets),
      missingRate: rate(missingAssets, totalAssets),
      unknownRate: rate(unknownAssets, totalAssets),
      representedBuildings: numberOrNull(department?.representedBuildings),
      representedFloors: numberOrNull(department?.representedFloors),
      representedRoomsOrAreas: numberOrNull(department?.representedRoomsOrAreas),
      mostCommonBuilding: department?.mostCommonBuilding ?? null,
      mostCommonBuildingAssets: numberOrNull(department?.mostCommonBuildingAssets),
    };
  });
}

export function createLocationTableState(overrides = {}) {
  const pageSize = LOCATION_PAGE_SIZES.includes(overrides.pageSize) ? overrides.pageSize : DEFAULT_TABLE_STATE.pageSize;
  return {
    ...DEFAULT_TABLE_STATE,
    ...overrides,
    page: Number.isInteger(overrides.page) && overrides.page > 0 ? overrides.page : 1,
    pageSize,
    sortKey: typeof overrides.sortKey === "string" && overrides.sortKey ? overrides.sortKey : DEFAULT_TABLE_STATE.sortKey,
    direction: overrides.direction === "asc" ? "asc" : "desc",
  };
}

export function sortLocationRows(rows, sortKey, direction = "desc") {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const leftRaw = left?.[sortKey];
    const rightRaw = right?.[sortKey];
    const leftNumber = numberOrNull(leftRaw);
    const rightNumber = numberOrNull(rightRaw);
    const leftMissing = leftRaw === null || leftRaw === undefined || leftRaw === "" || leftNumber === null;
    const rightMissing = rightRaw === null || rightRaw === undefined || rightRaw === "" || rightNumber === null;
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    if (!leftMissing && !rightMissing) {
      if (leftNumber !== rightNumber) return (leftNumber - rightNumber) * multiplier;
      return labelCompare(left?.label ?? left?.first, right?.label ?? right?.first)
        || labelCompare(left?.second, right?.second)
        || keyCompare(left?.key, right?.key);
    }
    const comparison = labelCompare(leftRaw, rightRaw) * multiplier;
    return comparison || keyCompare(left?.key, right?.key);
  });
}

export function paginateLocationRows(rows, state = DEFAULT_TABLE_STATE) {
  const normalized = createLocationTableState(state);
  const sortedRows = sortLocationRows(rows, normalized.sortKey, normalized.direction);
  const totalRows = sortedRows.length;
  const totalPages = totalRows === 0 ? 0 : normalized.pageSize === "all" ? 1 : Math.ceil(totalRows / normalized.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(normalized.page, totalPages);
  const start = normalized.pageSize === "all" ? 0 : (page - 1) * normalized.pageSize;
  const visibleRows = normalized.pageSize === "all"
    ? sortedRows
    : sortedRows.slice(start, start + normalized.pageSize);
  return { rows: visibleRows, sortedRows, totalRows, totalPages, page, pageSize: normalized.pageSize };
}

export function setLocationPage(state, page, totalRows) {
  const normalized = createLocationTableState(state);
  const totalPages = totalRows <= 0 ? 0 : normalized.pageSize === "all" ? 1 : Math.ceil(totalRows / normalized.pageSize);
  const requested = Number.isInteger(page) && page > 0 ? page : 1;
  return { ...normalized, page: totalPages === 0 ? 1 : Math.min(requested, totalPages) };
}

export function setLocationPageSize(state, pageSize) {
  if (!LOCATION_PAGE_SIZES.includes(pageSize)) return createLocationTableState(state);
  return { ...createLocationTableState(state), page: 1, pageSize };
}

export function setLocationSort(state, sortKey, direction, allowedKeys = []) {
  if (!allowedKeys.includes(sortKey) || !["asc", "desc"].includes(direction)) return createLocationTableState(state);
  return { ...createLocationTableState(state), page: 1, sortKey, direction };
}

export function reconcileLocationExplorerSelection(explorer, selection = {}) {
  const buildings = Array.isArray(explorer?.buildings) ? explorer.buildings : [];
  const buildingKey = buildings.some((building) => building?.key === selection?.buildingKey)
    ? selection.buildingKey
    : buildings[0]?.key ?? null;
  const building = buildings.find((item) => item?.key === buildingKey) ?? null;
  const floors = Array.isArray(building?.floors) ? building.floors : [];
  const floorKey = floors.some((floor) => floor?.key === selection?.floorKey)
    ? selection.floorKey
    : floors[0]?.key ?? null;
  const floor = floors.find((item) => item?.key === floorKey) ?? null;
  const rooms = Array.isArray(floor?.rooms) ? floor.rooms : [];
  const roomKey = rooms.some((room) => room?.key === selection?.roomKey)
    ? selection.roomKey
    : rooms[0]?.key ?? null;
  return { buildingKey, floorKey, roomKey, buildings, floors, rooms };
}
