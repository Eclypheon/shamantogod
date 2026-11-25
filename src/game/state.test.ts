import { describe, expect, it } from 'vitest';
import { META_UPGRADES } from './data';
import {
  applyOfflineProgress,
  buyMetaUpgrade,
  castSpell,
  computeDominance,
  createInitialState,
  formAlliance,
  getCastRangePx,
  hydrateState,
  isMetaNodeVisible,
  onBuildingConstructed,
  onShamanDied,
  onWildmanConverted,
  orderBuilding,
  prestigeToPlanet,
  stepSimulation,
  switchPlanet,
} from './state';

describe('Shaman to God simulation', () => {
  it('starts minimalistic with 0 followers, 0 huts, and 0 Divine Essence until Prestige', () => {
    const state = createInitialState();
    expect(state.divineEssence).toBe(0);
    expect(state.planets[1].loyalPop).toBe(0);
    expect(state.planets[1].hutsBuilt).toBe(0);

    onWildmanConverted(state);
    onBuildingConstructed(state, 'hut');
    expect(state.divineEssence).toBe(0);
    expect(state.pendingDivineEssence).toBeGreaterThan(0);

    state.planets[2].unlocked = true;
    const res = prestigeToPlanet(state, 2);
    expect(res.ok).toBe(true);
    expect(state.divineEssence).toBe(res.bankedEssence);
  });

  it('orders Warrior Hut with Mana and automatically trains ~10% Warriors once Braves build it', () => {
    const state = createInitialState();
    state.mana = 500;
    onBuildingConstructed(state, 'hut');
    for (let i = 0; i < 10; i++) onWildmanConverted(state);

    expect(orderBuilding(state, 1, 'warrior_hut')).toBe(true);
    expect(state.planets[1].warriorHutOrdered).toBe(true);
    expect(state.planets[1].warriors).toBe(0);

    onBuildingConstructed(state, 'warrior_hut');
    expect(state.planets[1].warriorHutBuilt).toBe(true);
    expect(state.planets[1].warriors).toBe(1); // 10% of 10
  });

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

  it('progressively reveals deeper Pantheon nodes only after parent is blessed', () => {
    const state = createInitialState();
    const initialVisible = META_UPGRADES.filter((u) => isMetaNodeVisible(state, u));
    expect(initialVisible.length).toBe(4); // 4 Tier-1 bough roots

    state.divineEssence = 100;
    expect(buyMetaUpgrade(state, 'manaRate')).toBe(false);
    expect(buyMetaUpgrade(state, 'startingMana')).toBe(true);
    const afterVisible = META_UPGRADES.filter((u) => isMetaNodeVisible(state, u));
    expect(afterVisible.some((u) => u.id === 'manaRate')).toBe(true);
    expect(buyMetaUpgrade(state, 'manaRate')).toBe(true);
  });

  it('penalizes Shaman death by 1000 Mana and sets 5s reincarnation timer', () => {
    const state = createInitialState();
    state.mana = 1400;
    const res = onShamanDied(state);
    expect(res.manaLost).toBe(1000);
    expect(res.respawnSec).toBe(5.0);
    expect(state.mana).toBe(400);
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

  it('safely hydrates partial or older saved states without missing planets', () => {
    const hydrated = hydrateState({
      version: 3,
      mana: 321,
      planets: { 1: { planetId: 1, unlocked: true, hutsBuilt: 3 } },
    });
    expect(hydrated.mana).toBe(321);
    expect(hydrated.planets[1].hutsBuilt).toBe(3);
    expect(hydrated.planets[15].planetId).toBe(15);
    expect(hydrated.activeBuffs).toEqual({});
  });
});
