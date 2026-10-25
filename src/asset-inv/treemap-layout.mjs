export function squarifyTreemap(items, width, height) {
  const boundsWidth = Number(width);
  const boundsHeight = Number(height);
  if (!Number.isFinite(boundsWidth) || !Number.isFinite(boundsHeight) || boundsWidth <= 0 || boundsHeight <= 0) {
    return [];
  }

  const weightedItems = (Array.isArray(items) ? items : [])
    .map((item) => ({ item, weight: Number(item?.assets) }))
    .filter(({ weight }) => Number.isFinite(weight) && weight > 0)
    .sort((left, right) => right.weight - left.weight);
  const totalWeight = weightedItems.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return [];

  const totalArea = boundsWidth * boundsHeight;
  const remaining = weightedItems.map((entry) => ({
    ...entry,
    area: (entry.weight / totalWeight) * totalArea,
  }));
  const cells = [];
  let x = 0;
  let y = 0;
  let remainingWidth = boundsWidth;
  let remainingHeight = boundsHeight;
  let row = [];

  const worstAspectRatio = (entries, sideLength) => {
    if (entries.length === 0 || sideLength <= 0) return Number.POSITIVE_INFINITY;
    const areas = entries.map((entry) => entry.area);
    const sum = areas.reduce((value, area) => value + area, 0);
    const min = Math.min(...areas);
    const max = Math.max(...areas);
    if (min <= 0 || sum <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(
      (sideLength * sideLength * max) / (sum * sum),
      (sum * sum) / (sideLength * sideLength * min),
    );
  };

  const placeRow = () => {
    if (row.length === 0) return;
    const rowArea = row.reduce((sum, entry) => sum + entry.area, 0);

    if (remainingWidth >= remainingHeight) {
      const stripWidth = Math.min(remainingWidth, rowArea / remainingHeight);
      let cursorY = y;
      for (const entry of row) {
        const cellHeight = stripWidth > 0 ? entry.area / stripWidth : 0;
        cells.push({ item: entry.item, x, y: cursorY, width: stripWidth, height: cellHeight });
        cursorY += cellHeight;
      }
      x += stripWidth;
      remainingWidth = Math.max(0, remainingWidth - stripWidth);
    } else {
      const stripHeight = Math.min(remainingHeight, rowArea / remainingWidth);
      let cursorX = x;
      for (const entry of row) {
        const cellWidth = stripHeight > 0 ? entry.area / stripHeight : 0;
        cells.push({ item: entry.item, x: cursorX, y, width: cellWidth, height: stripHeight });
        cursorX += cellWidth;
      }
      y += stripHeight;
      remainingHeight = Math.max(0, remainingHeight - stripHeight);
    }
    row = [];
  };

  while (remaining.length > 0) {
    const sideLength = Math.min(remainingWidth, remainingHeight);
    if (sideLength <= 0) break;
    const candidate = remaining[0];
    if (row.length === 0 || worstAspectRatio([...row, candidate], sideLength) <= worstAspectRatio(row, sideLength)) {
      row.push(remaining.shift());
    } else {
      placeRow();
    }
  }
  placeRow();

  return cells;
}
