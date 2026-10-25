import test from "node:test";
import assert from "node:assert/strict";
import { squarifyTreemap } from "../src/asset-inv/treemap-layout.mjs";

const closeTo = (actual, expected, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + " should be close to " + expected);
};

test("squarified treemap preserves area proportions and fills the available rectangle", () => {
  const items = [
    { key: "largest", assets: 60 },
    { key: "middle", assets: 30 },
    { key: "smallest", assets: 10 },
  ];
  const cells = squarifyTreemap(items, 400, 240);
  const areaByKey = new Map(cells.map((cell) => [cell.item.key, cell.width * cell.height]));

  assert.equal(cells.length, 3);
  closeTo(areaByKey.get("largest"), 400 * 240 * 0.6);
  closeTo(areaByKey.get("middle"), 400 * 240 * 0.3);
  closeTo(areaByKey.get("smallest"), 400 * 240 * 0.1);
  closeTo([...areaByKey.values()].reduce((sum, area) => sum + area, 0), 400 * 240);
});

test("omits zero-count groups from geometry while leaving them available to the caller", () => {
  const items = [
    { key: "known", assets: 8 },
    { key: "zero", assets: 0 },
    { key: "unknown", assets: 2 },
  ];
  const cells = squarifyTreemap(items, 320, 180);

  assert.deepEqual(cells.map((cell) => cell.item.key).sort(), ["known", "unknown"]);
  closeTo(cells.reduce((sum, cell) => sum + cell.width * cell.height, 0), 320 * 180);
});

test("handles one group and extremely disproportionate counts without invalid rectangles", () => {
  const single = squarifyTreemap([{ key: "all", assets: 5 }], 390, 220);
  assert.equal(single.length, 1);
  closeTo(single[0].width * single[0].height, 390 * 220);

  const cells = squarifyTreemap([
    { key: "dominant", assets: 1000000 },
    { key: "rare", assets: 1 },
    { key: "unknown", assets: 2 },
  ], 390, 220);
  assert.equal(cells.length, 3);
  for (const cell of cells) {
    assert.ok(cell.width > 0);
    assert.ok(cell.height > 0);
    assert.ok(cell.x >= 0 && cell.y >= 0);
    assert.ok(cell.x + cell.width <= 390 + 1e-7);
    assert.ok(cell.y + cell.height <= 220 + 1e-7);
  }
  const rare = cells.find((cell) => cell.item.key === "rare");
  closeTo(rare.width * rare.height, (390 * 220) / 1000003);
});

test("recalculates valid proportional layouts for mobile, tablet, and desktop containers", () => {
  const items = [
    { key: "0-2", assets: 870 },
    { key: "3-5", assets: 575 },
    { key: "6-10", assets: 1324 },
    { key: "11-15", assets: 683 },
    { key: "16-20", assets: 596 },
    { key: "over-20", assets: 369 },
    { key: "unknown", assets: 7 },
  ];
  const sizes = [[350, 230], [340, 300], [620, 300]];
  for (const [width, height] of sizes) {
    const cells = squarifyTreemap(items, width, height);
    assert.equal(cells.length, items.length);
    closeTo(cells.reduce((sum, cell) => sum + cell.width * cell.height, 0), width * height);
    for (const cell of cells) {
      assert.ok(cell.x >= 0 && cell.y >= 0);
      assert.ok(cell.width > 0 && cell.height > 0);
      assert.ok(cell.x + cell.width <= width + 1e-7);
      assert.ok(cell.y + cell.height <= height + 1e-7);
    }
  }
});

test("returns no cells for empty, zero-weight, or invalid bounds", () => {
  assert.deepEqual(squarifyTreemap([], 320, 180), []);
  assert.deepEqual(squarifyTreemap([{ assets: 0 }], 320, 180), []);
  assert.deepEqual(squarifyTreemap([{ assets: 1 }], 0, 180), []);
  assert.deepEqual(squarifyTreemap([{ assets: 1 }], 320, Number.NaN), []);
});
