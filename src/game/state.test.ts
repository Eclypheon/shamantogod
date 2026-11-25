import { describe, expect, it } from 'vitest';
import {
  applyOfflineProgress,
  buildGuardTower,
  buyMetaUpgrade,
  castSpell,
  computeDominance,
  createInitialState,
  formAlliance,
  getCastRangePx,
  hydrateState,
  stepSimulation,
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
    const state = createInitialState(now - 600_000);
    const res = applyOfflineProgress(state, now);
    expect(res.elapsedSec).toBe(600);
    expect(res.manaGained).toBeGreaterThan(0);
  });

  it('activates buff spells and decays them during simulation', () => {
    const state = createInitialState();
    state.planets[2].unlocked = true;
    const res = castSpell(state, 'bloodlust', 10);
    expect(res.ok).toBe(true);
    expect(state.activeBuffs.bloodlust).toBe(12);
    stepSimulation(state, 2);
    expect(state.activeBuffs.bloodlust).toBe(10);
  });

  it('forms an Alliance on Planet 5+ and boosts Dominance %', () => {
    const state = createInitialState();
    state.planets[5].unlocked = true;
    state.mana = 500;
    const before = computeDominance(state.planets[5]);
    expect(formAlliance(state, 5)).toBe(true);
    expect(state.planets[5].allied).toBe(true);
    expect(computeDominance(state.planets[5])).toBeGreaterThan(before);
  });

  it('constructs Guard Towers up to 4 per planet', () => {
    const state = createInitialState();
    state.mana = 500;
    expect(buildGuardTower(state, 1)).toBe(true);
    expect(state.planets[1].towersBuilt).toBe(1);
    expect(state.mana).toBe(350);
  });

  it('safely hydrates partial or older saved states without missing planets', () => {
    const hydrated = hydrateState({
      version: 1,
      mana: 321,
      planets: { 1: { planetId: 1, unlocked: true, hutsBuilt: 3 } },
    });
    expect(hydrated.mana).toBe(321);
    expect(hydrated.planets[1].hutsBuilt).toBe(3);
    expect(hydrated.planets[15].planetId).toBe(15);
    expect(hydrated.activeBuffs).toEqual({});
  });
});
