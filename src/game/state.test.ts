import { describe, expect, it } from 'vitest';
import {
  applyOfflineProgress,
  buyMetaUpgrade,
  castSpell,
  computeDominance,
  createInitialState,
  getCastRangePx,
  switchPlanet,
} from './state';

describe('Shaman to God simulation', () => {
  it('computes 50/50 Dominance % from loyal pop share and enemy huts destroyed', () => {
    const state = createInitialState();
    const p1 = state.planets[1];
    p1.loyalPop = 14;
    p1.enemyPop = 0;
    p1.enemyHutsRemaining = 0;
    expect(computeDominance(p1)).toBe(100);
  });

  it('enforces Shaman cast range on Planets 1-11 and unlimited range on Planet 12+', () => {
    const state = createInitialState();
    expect(getCastRangePx(state, 1)).toBeLessThan(Infinity);
    const outOfRange = castSpell(state, 'convert', 999);
    expect(outOfRange.ok).toBe(false);

    state.planets[12].unlocked = true;
    switchPlanet(state, 12);
    expect(getCastRangePx(state, 12)).toBe(Infinity);
    const globalCast = castSpell(state, 'convert', 9999);
    expect(globalCast.ok).toBe(true);
  });

  it('allows purchasing Divine Essence upgrades and backtracking without penalty', () => {
    const state = createInitialState();
    state.divineEssence = 100;
    expect(buyMetaUpgrade(state, 'manaRate')).toBe(true);
    expect(state.metaLevels.manaRate).toBe(1);

    state.planets[2].unlocked = true;
    expect(switchPlanet(state, 2)).toBe(true);
    expect(switchPlanet(state, 1)).toBe(true);
    expect(state.activePlanetId).toBe(1);
  });

  it('applies bounded offline Mana progress', () => {
    const now = 1_000_000_000;
    const state = createInitialState(now - 600_000); // 10 min ago
    const res = applyOfflineProgress(state, now);
    expect(res.elapsedSec).toBe(600);
    expect(res.manaGained).toBeGreaterThan(0);
  });
});
