import { META_UPGRADES, PLANETS, SPELLS, type MetaUpgradeConfig, type PlanetConfig, type SpellConfig } from './data';

export interface UnitRatios {
  brave: number;
  preacher: number;
  warrior: number;
  fireWarrior: number;
}

export interface PlanetProgress {
  planetId: number;
  unlocked: boolean;
  conquered: boolean;
  peakDominance: number;
  loyalPop: number;
  enemyPop: number;
  enemyHutsRemaining: number;
  initialEnemyHuts: number;
  hutsBuilt: number;
  braves: number;
  preachers: number;
  warriors: number;
  fireWarriors: number;
  towersBuilt: number;
  allied: boolean;
  swarmKills: number;
  passiveDestruction: number;
}

export interface GameState {
  version: number;
  activePlanetId: number;
  mana: number;
  divineEssence: number;
  pendingDivineEssence: number;
  prestiges: number;
  totalSwarmKills: number;
  lastSavedAt: number;
  selectedSpellId: string;
  spellCooldowns: Record<string, number>;
  activeBuffs: Record<string, number>;
  ratios: UnitRatios;
  autoBuild: boolean;
  muted: boolean;
  metaLevels: Record<MetaUpgradeConfig['id'], number>;
  planets: Record<number, PlanetProgress>;
}

const SAVE_KEY = 'shamantogod_save_v2';

export function createPlanetProgress(cfg: PlanetConfig, unlocked: boolean): PlanetProgress {
  return {
    planetId: cfg.id,
    unlocked,
    conquered: false,
    peakDominance: 0,
    loyalPop: 0,
    enemyPop: cfg.initialEnemyPop,
    enemyHutsRemaining: cfg.initialEnemyHuts,
    initialEnemyHuts: cfg.initialEnemyHuts,
    hutsBuilt: 0,
    braves: 0,
    preachers: 0,
    warriors: 0,
    fireWarriors: 0,
    towersBuilt: 0,
    allied: false,
    swarmKills: 0,
    passiveDestruction: 0,
  };
}

export function createInitialState(now = Date.now()): GameState {
  const planets: Record<number, PlanetProgress> = {};
  for (const cfg of PLANETS) {
    planets[cfg.id] = createPlanetProgress(cfg, cfg.id === 1);
  }
  return {
    version: 2,
    activePlanetId: 1,
    mana: 60,
    divineEssence: 0,
    pendingDivineEssence: 0,
    prestiges: 0,
    totalSwarmKills: 0,
    lastSavedAt: now,
    selectedSpellId: 'convert',
    spellCooldowns: {},
    activeBuffs: {},
    ratios: { brave: 55, preacher: 15, warrior: 20, fireWarrior: 10 },
    autoBuild: true,
    muted: false,
    metaLevels: {
      startingMana: 0,
      manaRate: 0,
      castRange: 0,
      spellPower: 0,
      popCap: 0,
      offlineEfficiency: 0,
      timberMastery: 0,
      tempestForce: 0,
    },
    planets,
  };
}

export function computeDominance(p: PlanetProgress): number {
  const totalPop = Math.max(1, p.loyalPop + p.enemyPop);
  const popShare = Math.min(1, p.loyalPop / totalPop);
  const razed = Math.max(0, p.initialEnemyHuts - p.enemyHutsRemaining);
  const hutShare = p.initialEnemyHuts > 0 ? Math.min(1, razed / p.initialEnemyHuts) : 1;
  const allianceBonus = p.allied ? 0.1 : 0;
  const raw = (popShare * 0.5 + hutShare * 0.5 + allianceBonus) * 100;
  return Math.min(100, Math.round(raw * 10) / 10);
}

export function getPlanetConfig(planetId: number): PlanetConfig {
  return PLANETS.find((p) => p.id === planetId) ?? PLANETS[0];
}

export function getPopCap(state: GameState, planetId: number): number {
  const p = state.planets[planetId];
  return p.hutsBuilt * 6 + state.metaLevels.popCap * 5 + 8;
}

export function getCastRangePx(state: GameState, planetId: number): number {
  const cfg = getPlanetConfig(planetId);
  if (cfg.mode === 'junior-god') return Infinity;
  return 185 * (1 + state.metaLevels.castRange * 0.15);
}

export function getSpellPowerMult(state: GameState): number {
  return 1 + state.metaLevels.spellPower * 0.2;
}

export function getTimberSpeedMult(state: GameState): number {
  return 1 + state.metaLevels.timberMastery * 0.2;
}

export function getPlanetManaPerSec(state: GameState, planetId: number): number {
  const p = state.planets[planetId];
  if (!p.unlocked) return 0;
  // Base Shaman meditation (0.8/s) on active planet so player is never soft-locked at 0 pop
  const baseShaman = planetId === state.activePlanetId ? 0.8 : 0;
  const followerRate =
    p.braves * 0.55 + p.preachers * 0.9 + p.warriors * 0.45 + p.fireWarriors * 0.75 + p.hutsBuilt * 1.6;
  const allianceBonus = p.allied ? 1.25 : 1;
  const metaMult = 1 + state.metaLevels.manaRate * 0.25;
  const backgroundFactor = planetId === state.activePlanetId ? 1 : 0.45;
  return (baseShaman + followerRate) * allianceBonus * metaMult * backgroundFactor;
}

export function getTotalManaPerSec(state: GameState): number {
  let total = 0;
  for (const cfg of PLANETS) {
    total += getPlanetManaPerSec(state, cfg.id);
  }
  return total;
}

export function getMetaUpgradeCost(cfg: MetaUpgradeConfig, level: number): number {
  return Math.floor(cfg.baseCost * Math.pow(cfg.costScale, level));
}

export function isMetaNodeUnlocked(state: GameState, cfg: MetaUpgradeConfig): boolean {
  if (!cfg.parent) return true;
  return (state.metaLevels[cfg.parent] ?? 0) > 0;
}

export function buyMetaUpgrade(state: GameState, id: MetaUpgradeConfig['id']): boolean {
  const cfg = META_UPGRADES.find((u) => u.id === id);
  if (!cfg || !isMetaNodeUnlocked(state, cfg)) return false;
  const lvl = state.metaLevels[id];
  if (lvl >= cfg.maxLevel) return false;
  const cost = getMetaUpgradeCost(cfg, lvl);
  if (state.divineEssence < cost) return false;
  state.divineEssence -= cost;
  state.metaLevels[id] = lvl + 1;
  return true;
}

export function isSpellUnlocked(state: GameState, spell: SpellConfig): boolean {
  if (!state.planets[spell.unlockPlanet]?.unlocked) return false;
  if (spell.id === 'blast') {
    const p1 = state.planets[1];
    return p1.hutsBuilt >= 1 || p1.loyalPop >= 3 || state.activePlanetId >= 2;
  }
  return true;
}

export function onWildmanConverted(state: GameState): boolean {
  const p = state.planets[state.activePlanetId];
  const cap = getPopCap(state, p.planetId);
  if (p.loyalPop >= cap) return false;
  p.loyalPop += 1;
  p.braves += 1;
  rebalanceUnits(state, p);
  updateDominanceAndUnlocks(state, p);
  return true;
}

export function onHutConstructed(state: GameState): void {
  const p = state.planets[state.activePlanetId];
  p.hutsBuilt += 1;
  updateDominanceAndUnlocks(state, p);
}

export function applyBlastImpact(state: GameState, enemyUnitHits: number, enemyHutHits: number): void {
  const p = state.planets[state.activePlanetId];
  if (enemyUnitHits > 0) {
    const killed = Math.min(p.enemyPop, enemyUnitHits);
    p.enemyPop -= killed;
    p.swarmKills += killed;
    state.totalSwarmKills += killed;
    state.pendingDivineEssence += killed * 0.3;
  }
  if (enemyHutHits > 0 && p.enemyHutsRemaining > 0) {
    const down = Math.min(p.enemyHutsRemaining, enemyHutHits);
    p.enemyHutsRemaining -= down;
    p.passiveDestruction += down;
    state.pendingDivineEssence += down * 0.8;
  }
  updateDominanceAndUnlocks(state, p);
}

export function castSpell(
  state: GameState,
  spellId: string,
  distanceFromShamanPx: number
): { ok: boolean; reason?: string; converted?: number; destroyed?: number } {
  const spell = SPELLS.find((s) => s.id === spellId);
  if (!spell) return { ok: false, reason: 'Unknown spell' };
  if (!isSpellUnlocked(state, spell)) return { ok: false, reason: 'Locked' };

  const cd = state.spellCooldowns[spell.id] ?? 0;
  if (cd > 0) return { ok: false, reason: `Cooldown ${cd.toFixed(1)}s` };

  const range = getCastRangePx(state, state.activePlanetId);
  if (distanceFromShamanPx > range) {
    return { ok: false, reason: 'Out of Shaman cast range' };
  }

  if (state.mana < spell.manaCost) {
    return { ok: false, reason: 'Not enough Mana' };
  }

  state.mana -= spell.manaCost;
  state.spellCooldowns[spell.id] = spell.cooldownSec;

  // Convert (4s sparkling circle, 2s per Wildman) and Blast (projectile + knockback) resolve physically in PlanetScene
  if (spell.id === 'convert' || spell.id === 'blast') {
    return { ok: true };
  }

  const p = state.planets[state.activePlanetId];
  const power = getSpellPowerMult(state);
  let converted = 0;
  let destroyed = 0;

  if (spell.kind === 'convert') {
    const cap = getPopCap(state, p.planetId);
    const space = Math.max(0, cap - p.loyalPop);
    const gain = Math.min(space, Math.max(1, Math.round(5 * power)));
    const takenFromEnemy = Math.min(p.enemyPop, gain);
    p.enemyPop -= takenFromEnemy;
    p.loyalPop += gain;
    p.braves += gain;
    converted = gain;
  } else if (spell.kind === 'damage' || spell.kind === 'terrain' || spell.kind === 'summon') {
    const baseKill = spell.manaCost >= 300 ? 10 : spell.manaCost >= 100 ? 5 : 2;
    const kill = Math.round(baseKill * power);
    const enemyKill = Math.min(p.enemyPop, kill);
    p.enemyPop -= enemyKill;
    p.swarmKills += enemyKill;
    state.totalSwarmKills += enemyKill;
    if (enemyKill > 0) {
      state.pendingDivineEssence += enemyKill * 0.25;
    }
    if (p.enemyHutsRemaining > 0 && (spell.manaCost >= 80 || Math.random() < 0.45)) {
      const hutsDown = Math.min(p.enemyHutsRemaining, spell.manaCost >= 300 ? 2 : 1);
      p.enemyHutsRemaining -= hutsDown;
      p.passiveDestruction += hutsDown;
      destroyed = hutsDown;
    }
  } else if (spell.kind === 'buff') {
    state.activeBuffs[spell.id] = 12;
  }

  rebalanceUnits(state, p);
  updateDominanceAndUnlocks(state, p);
  return { ok: true, converted, destroyed };
}

export function rebalanceUnits(state: GameState, p: PlanetProgress): void {
  const total = p.loyalPop;
  // Early ramp-up: before first Hut is built, all followers stay Braves so they chop trees & build!
  if (p.hutsBuilt === 0) {
    p.braves = total;
    p.preachers = 0;
    p.warriors = 0;
    p.fireWarriors = 0;
    return;
  }
  const r = state.ratios;
  const sum = Math.max(1, r.brave + r.preacher + r.warrior + r.fireWarrior);
  const preachers = Math.floor((total * r.preacher) / sum);
  const warriors = Math.floor((total * r.warrior) / sum);
  const fireWarriors = Math.floor((total * r.fireWarrior) / sum);
  const braves = Math.max(0, total - preachers - warriors - fireWarriors);
  p.preachers = preachers;
  p.warriors = warriors;
  p.fireWarriors = fireWarriors;
  p.braves = braves;
}

export function updateDominanceAndUnlocks(state: GameState, p: PlanetProgress): void {
  const dom = computeDominance(p);
  if (dom > p.peakDominance) {
    const delta = dom - p.peakDominance;
    // Accumulates into pendingDivineEssence; only banked on Prestige!
    state.pendingDivineEssence += delta * 0.35 * p.planetId;
    p.peakDominance = dom;
  }
  if (dom > 95 && !p.conquered) {
    p.conquered = true;
    state.pendingDivineEssence += 10 * p.planetId;
    const next = state.planets[p.planetId + 1];
    if (next) {
      next.unlocked = true;
    }
  }
}

export function buildGuardTower(state: GameState, planetId: number): boolean {
  const p = state.planets[planetId];
  if (!p || !p.unlocked || p.towersBuilt >= 4) return false;
  const cost = 150 * (p.towersBuilt + 1);
  if (state.mana < cost) return false;
  state.mana -= cost;
  p.towersBuilt += 1;
  return true;
}

export function formAlliance(state: GameState, planetId: number): boolean {
  const cfg = getPlanetConfig(planetId);
  const p = state.planets[planetId];
  if (!cfg.allianceTribe || !cfg.allianceCost || p.allied) return false;
  if (state.mana < cfg.allianceCost) return false;
  state.mana -= cfg.allianceCost;
  p.allied = true;
  updateDominanceAndUnlocks(state, p);
  return true;
}

export function prestigeToPlanet(state: GameState, targetPlanetId: number): { ok: boolean; bankedEssence: number } {
  const p = state.planets[targetPlanetId];
  if (!p || !p.unlocked) return { ok: false, bankedEssence: 0 };
  const banked = Math.floor(state.pendingDivineEssence);
  if (banked > 0) {
    state.divineEssence += banked;
    state.pendingDivineEssence -= banked;
    state.prestiges += 1;
  }
  state.activePlanetId = targetPlanetId;
  if (p.loyalPop === 0 && p.hutsBuilt === 0) {
    state.mana = Math.max(state.mana, 60 + state.metaLevels.startingMana * 50);
  }
  return { ok: true, bankedEssence: banked };
}

export function switchPlanet(state: GameState, targetPlanetId: number): boolean {
  return prestigeToPlanet(state, targetPlanetId).ok;
}

export function stepSimulation(state: GameState, dtSec: number): void {
  if (dtSec <= 0) return;

  for (const id of Object.keys(state.spellCooldowns)) {
    state.spellCooldowns[id] = Math.max(0, state.spellCooldowns[id] - dtSec);
  }
  for (const id of Object.keys(state.activeBuffs)) {
    state.activeBuffs[id] = Math.max(0, state.activeBuffs[id] - dtSec);
  }

  state.mana += getTotalManaPerSec(state) * dtSec;

  const bloodlustMult = (state.activeBuffs.bloodlust ?? 0) > 0 ? 2 : 1;
  const invisBonus = (state.activeBuffs.invisibility ?? 0) > 0 ? 1.5 : 1;
  const shieldActive = (state.activeBuffs.shield ?? 0) > 0;

  for (const cfg of PLANETS) {
    const p = state.planets[cfg.id];
    if (!p.unlocked) continue;
    const isActive = cfg.id === state.activePlanetId;
    const rate = isActive ? 1 : 0.35;

    // Background planets auto-build huts passively; active planet builds physically via Braves chopping trees
    const cap = getPopCap(state, cfg.id);
    if (!isActive && state.autoBuild && p.hutsBuilt > 0 && p.loyalPop >= cap - 2 && state.mana >= 80 * p.hutsBuilt) {
      state.mana -= 80 * p.hutsBuilt;
      p.hutsBuilt += 1;
    }

    // Huts breed new Braves over time (only once at least 1 Hut exists)
    if (p.hutsBuilt > 0 && p.loyalPop < cap && Math.random() < 0.2 * p.hutsBuilt * dtSec * rate) {
      p.loyalPop += 1;
      rebalanceUnits(state, p);
    }

    // Followers convert/attack enemies
    const attackPower =
      (p.preachers * 0.4 * invisBonus + p.warriors * 0.55 + p.fireWarriors * 0.8 + p.towersBuilt * 0.7) *
      bloodlustMult *
      rate;
    if (attackPower > 0 && Math.random() < Math.min(0.8, attackPower * 0.04 * dtSec)) {
      if (p.enemyPop > 0) {
        p.enemyPop -= 1;
        p.swarmKills += 1;
        state.totalSwarmKills += 1;
        state.pendingDivineEssence += 0.15;
      } else if (p.enemyHutsRemaining > 0) {
        p.enemyHutsRemaining -= 1;
        p.passiveDestruction += 1;
      } else if (p.conquered) {
        p.swarmKills += 1;
        state.totalSwarmKills += 1;
        p.passiveDestruction += 1;
        state.pendingDivineEssence += 0.2 * cfg.id;
      }
    }

    // Rival Shamans (1-3 per planet) build/train unless allied
    const activeRivals = cfg.rivals.filter((r) => !(p.allied && r === cfg.allianceTribe));
    const rivalCount = activeRivals.length;
    if (isActive && rivalCount > 0 && p.hutsBuilt > 0) {
      if (!p.conquered && p.enemyHutsRemaining > 0 && Math.random() < 0.05 * rivalCount * dtSec) {
        p.enemyPop = Math.min(cfg.initialEnemyPop + p.enemyHutsRemaining * 4, p.enemyPop + 1);
      }
      if (!p.conquered && p.enemyHutsRemaining > 0 && p.enemyHutsRemaining < cfg.initialEnemyHuts && Math.random() < 0.01 * rivalCount * dtSec) {
        p.enemyHutsRemaining += 1;
      }
    }

    // Ally Shaman (Planet 5+) fights remaining rivals
    if (p.allied && activeRivals.length > 0 && Math.random() < 0.12 * dtSec) {
      if (p.enemyPop > 0) {
        p.enemyPop -= 1;
        p.swarmKills += 1;
        state.totalSwarmKills += 1;
        state.pendingDivineEssence += 0.15;
      } else if (p.enemyHutsRemaining > 0) {
        p.enemyHutsRemaining -= 1;
        p.passiveDestruction += 1;
      }
    }

    // Endless Swarm pressure (only once player has a village started)
    if (isActive && p.hutsBuilt > 0 && !shieldActive && Math.random() < 0.06 * cfg.swarmStrength * dtSec) {
      if (p.loyalPop > 3 && p.warriors + p.fireWarriors < cfg.swarmStrength) {
        p.loyalPop -= 1;
        rebalanceUnits(state, p);
      }
    }

    updateDominanceAndUnlocks(state, p);
  }
}

export function applyOfflineProgress(state: GameState, now = Date.now()): { elapsedSec: number; manaGained: number } {
  const elapsedSec = Math.max(0, Math.min(8 * 3600, (now - state.lastSavedAt) / 1000));
  if (elapsedSec < 5) {
    state.lastSavedAt = now;
    return { elapsedSec: 0, manaGained: 0 };
  }
  const efficiency = 0.35 + state.metaLevels.offlineEfficiency * 0.1;
  const manaGained = getTotalManaPerSec(state) * elapsedSec * efficiency;
  state.mana += manaGained;
  state.lastSavedAt = now;
  return { elapsedSec, manaGained };
}

export function saveGame(state: GameState): void {
  state.lastSavedAt = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function hydrateState(raw: unknown): GameState {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;
  const parsed = raw as Partial<GameState>;
  if (parsed.version !== 2 || !parsed.planets) return base;
  const mergedPlanets: Record<number, PlanetProgress> = {};
  for (const cfg of PLANETS) {
    mergedPlanets[cfg.id] = {
      ...base.planets[cfg.id],
      ...(parsed.planets[cfg.id] ?? {}),
    };
  }
  return {
    ...base,
    ...parsed,
    metaLevels: { ...base.metaLevels, ...(parsed.metaLevels ?? {}) },
    ratios: { ...base.ratios, ...(parsed.ratios ?? {}) },
    spellCooldowns: { ...(parsed.spellCooldowns ?? {}) },
    activeBuffs: { ...(parsed.activeBuffs ?? {}) },
    planets: mergedPlanets,
  };
}

export function hasSavedGame(): boolean {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function resetGame(): GameState {
  const fresh = createInitialState();
  saveGame(fresh);
  return fresh;
}

export function isCampaignWon(state: GameState): boolean {
  return PLANETS.every((cfg) => state.planets[cfg.id]?.conquered);
}

export function loadGame(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return createInitialState();
    return hydrateState(JSON.parse(raw));
  } catch {
    return createInitialState();
  }
}
