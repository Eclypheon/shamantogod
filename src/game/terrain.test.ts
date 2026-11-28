import { describe, expect, it } from 'vitest';
import { PlanetTerrain, WORLD_H, WORLD_W, wrapCoord, wrapDelta, wrapDist } from './terrain';

describe('Periodic Globe Terrain & Land Spells', () => {
  it('wraps coordinates and shortest deltas seamlessly around the globe', () => {
    expect(wrapCoord(-10, WORLD_W)).toBe(WORLD_W - 10);
    expect(wrapCoord(WORLD_W + 25, WORLD_W)).toBe(25);
    expect(wrapDelta(WORLD_W - 10, 10, WORLD_W)).toBe(20);
    expect(wrapDist(10, 500, WORLD_W - 10, 500)).toBe(20);
    expect(wrapDist(500, 15, 500, WORLD_H - 15)).toBe(30);
  });

  it('starts with undulating hills around village slots that Flatten and stomping level into flat land', () => {
    const t = new PlanetTerrain(1);
    // Shaman spawn at center is flat walkable land
    expect(t.isWalkable(WORLD_W / 2, WORLD_H / 2)).toBe(true);
    expect(t.isFlat(WORLD_W / 2, WORLD_H / 2)).toBe(true);

    // Village hut slot at (-82, -26) starts undulating (walkable, not flat yet)
    const sx = WORLD_W / 2 - 82;
    const sy = WORLD_H / 2 - 26;
    expect(t.isWalkable(sx, sy)).toBe(true);
    expect(t.isFlat(sx, sy)).toBe(false);

    // Flatten spell levels it into flat buildable meadow
    const changed = t.flattenArea(sx, sy, 60);
    expect(changed).toBeGreaterThan(0);
    expect(t.isFlat(sx, sy)).toBe(true);
  });

  it('carves rivers on Planet 5+ that block walking until Landbridge raises a walkable crossing', () => {
    const t = new PlanetTerrain(5);
    // Scan east from center to find the river channel
    let riverX = -1;
    for (let x = WORLD_W / 2 + 120; x <= WORLD_W / 2 + 340; x += 10) {
      if (t.isWater(x, WORLD_H / 2)) {
        riverX = x;
        break;
      }
    }
    expect(riverX).toBeGreaterThan(0);
    expect(t.isWalkable(riverX, WORLD_H / 2)).toBe(false);

    // Cast Landbridge across the river
    const bridged = t.raiseLandbridge(WORLD_W / 2 + 150, WORLD_H / 2, WORLD_W / 2 + 340, WORLD_H / 2, 32);
    expect(bridged).toBeGreaterThan(0);
    expect(t.isWalkable(riverX, WORLD_H / 2)).toBe(true);
  });

  it('sinks land into water when Erode is cast', () => {
    const t = new PlanetTerrain(8);
    const tx = WORLD_W / 2;
    const ty = WORLD_H / 2;
    expect(t.isWater(tx, ty)).toBe(false);
    const sunk = t.erodeArea(tx, ty, 50);
    expect(sunk).toBeGreaterThan(0);
    expect(t.isWater(tx, ty)).toBe(true);
  });
});
