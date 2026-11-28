import { META_UPGRADES, PLANETS, SPELLS, type MetaUpgradeConfig, type MetaUpgradeId, type PlanetConfig, type SpellConfig } from './data';

export type BuildingBlueprintKind = 'hut' | 'warrior_hut' | 'temple' | 'firewarrior_hut' | 'guard_tower';

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
  // Mana-unlocked building decrees (queued -> built by Braves)
  warriorHutOrdered: boolean;
  warriorHutBuilt: boolean;
  templeOrdered: boolean;
  templeBuilt: boolean;
  fireWarriorHutOrdered: boolean;
  fireWarriorHutBuilt: boolean;
  towersOrdered: number;
  towersBuilt: number;
  // Computed unit counts (hidden percentages: ~10% per unlocked training building)
  braves: number;
  preachers: number;
  warriors: number;
  fireWarriors: number;
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
  tutorialStep: number;
  muted: boolean;
  metaLevels: Record<MetaUpgradeId, number>;
  planets: Record<number, PlanetProgress>;
}

const SAVE_KEY = 'shamantogod_save_v4';

function createDefaultMetaLevels(): Record<MetaUpgradeId, number> {
  const levels = {} as Record<MetaUpgradeId, number>;
  for (const u of META_UPGRADES) levels[u.id] = 0;
  return levels;
}

export const BUILDING_FOLLOWER_REQS = {
  warrior_hut: 4,
  temple: 8,
  firewarrior_hut: 12,
  guard_tower: 14,
} as const;

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
    warriorHutOrdered: false,
    warriorHutBuilt: false,
    templeOrdered: false,
    templeBuilt: false,
    fireWarriorHutOrdered: false,
    fireWarriorHutBuilt: false,
    towersOrdered: 0,
    towersBuilt: 0,
    braves: 0,
    preachers: 0,
    warriors: 0,
    fireWarriors: 0,
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
    version: 4,
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
    tutorialStep: 0,
    muted: false,
    metaLevels: createDefaultMetaLevels(),
    planets,
  };
}

export function computeDominance(p: PlanetProgress): number {
  // If every hostile enemy and hut is cleared, Dominance is cleanly 100%!
  if (p.enemyPop <= 0 && p.enemyHutsRemaining <= 0) return 100;
  const totalPop = Math.max(1, p.loyalPop + p.enemyPop);
  const popShare = Math.min(1, p.loyalPop / totalPop);
  const razed = Math.max(0, p.initialEnemyHuts - p.enemyHutsRemaining);
  const hutShare = p.initialEnemyHuts > 0 ? Math.min(1, razed / p.initialEnemyHuts) : 1;
  const allianceBonus = p.allied ? 0.1 : 0;
  const raw = (popShare * 0.5 + hutShare * 0.5 + allianceBonus) * 100;
  return Math.min(100, Math.round(raw * 10) / 10);
}

export function isTribeAllied(state: GameState, planetId: number, tribe: string): boolean {
  const cfg = getPlanetConfig(planetId);
  const p = state.planets[planetId];
  return Boolean(p?.allied && cfg.allianceTribe === tribe);
}

/** Keeps state.ts enemy counts strictly synchronized with live hostile scene entities so clearing a planet always hits 100%. */
export function syncPlanetHostiles(state: GameState, hostileUnitsAlive: number, hostileHutsAlive: number): boolean {
  const p = state.planets[state.activePlanetId];
  const wasConquered = p.conquered;
  p.enemyHutsRemaining = Math.min(p.initialEnemyHuts, Math.max(0, hostileHutsAlive));
  if (hostileHutsAlive <= 0 && hostileUnitsAlive <= 0) {
    p.enemyPop = 0;
  } else {
    p.enemyPop = Math.max(hostileUnitsAlive, Math.min(p.enemyPop, hostileUnitsAlive + hostileHutsAlive * 3));
  }
  updateDominanceAndUnlocks(state, p);
  return !wasConquered && p.conquered;
}

export function claimObeliskMana(state: GameState, baseAmount = 45): number {
  const gain = Math.round(baseAmount * (1 + (state.activePlanetId - 1) * 0.35) * (1 + state.metaLevels.manaRate * 0.15));
  state.mana += gain;
  return gain;
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
  return 1 + state.metaLevels.spellPower * 0.18;
}

export function getTimberSpeedMult(state: GameState): number {
  return 1 + state.metaLevels.timberMastery * 0.18;
}

export function getTreeRegrowSec(state: GameState): number {
  return Math.max(25, 75 * (1 - state.metaLevels.sacredGroves * 0.15));
}

export function getWarriorPowerMult(state: GameState): number {
  return 1 + state.metaLevels.ironDiscipline * 0.2;
}

export function getPreacherSpeedMult(state: GameState): number {
  return 1 + state.metaLevels.zealotSermons * 0.2;
}

export function getTowerRangePx(state: GameState): number {
  return 310 * (1 + state.metaLevels.watchtowerPrecision * 0.25);
}

export function getShamanMaxHp(state: GameState): number {
  return Math.round(180 * (1 + state.metaLevels.crownOfKaelis * 0.15));
}

export function getSpellManaCost(state: GameState, spell: SpellConfig): number {
  if (spell.isStoneHead) return 0;
  return Math.max(5, Math.round(spell.manaCost * Math.max(0.4, 1 - state.metaLevels.astralConduit * 0.1)));
}

export function getSpellCooldownSec(state: GameState, spell: SpellConfig): number {
  return Math.max(0.6, spell.cooldownSec * Math.max(0.4, 1 - state.metaLevels.sovereignSight * 0.1));
}

export function onShamanDied(state: GameState): { manaLost: number; respawnSec: number } {
  const penalty = Math.max(250, 1000 - state.metaLevels.soulAnchor * 150);
  const actualLoss = Math.min(state.mana, penalty);
  state.mana = Math.max(0, state.mana - penalty);
  const respawnSec = Math.max(2.5, 5.0 - state.metaLevels.soulAnchor * 0.5);
  return { manaLost: Math.floor(actualLoss), respawnSec };
}

export function getPlanetManaPerSec(state: GameState, planetId: number): number {
  const p = state.planets[planetId];
  if (!p.unlocked) return 0;
  const baseShaman = planetId === state.activePlanetId ? 0.6 : 0;
  const followerRate =
    p.braves * 0.45 + p.preachers * 0.8 + p.warriors * 0.4 + p.fireWarriors * 0.65 + p.hutsBuilt * 1.4;
  const allianceBonus = p.allied ? 1.25 : 1;
  const metaMult = (1 + state.metaLevels.manaRate * 0.2) * (1 + state.metaLevels.crownOfKaelis * 0.15);
  const bgBonus = 0.4 + state.metaLevels.orbitalLeylines * 0.15;
  const backgroundFactor = planetId === state.activePlanetId ? 1 : bgBonus;
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

/** Progressive disclosure: show Tier-1 roots, already-leveled nodes, and immediate children of leveled nodes. */
export function isMetaNodeVisible(state: GameState, cfg: MetaUpgradeConfig): boolean {
  return isMetaNodeUnlocked(state, cfg) || (state.metaLevels[cfg.id] ?? 0) > 0;
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

/** Automatically queues training buildings & guardhouses as soon as follower & Pantheon requirements are met. */
export function autoOrderUnlockedBuildings(state: GameState, planetId = state.activePlanetId): Exclude<BuildingBlueprintKind, 'hut'> | null {
  const order: Exclude<BuildingBlueprintKind, 'hut'>[] = ['warrior_hut', 'temple', 'firewarrior_hut', 'guard_tower'];
  for (const kind of order) {
    if (orderBuilding(state, planetId, kind)) {
      return kind;
    }
  }
  return null;
}

/** Order a training building or guardhouse based on follower count + Pantheon unlocks (no Mana mismatch!). */
export function orderBuilding(
  state: GameState,
  planetId: number,
  kind: Exclude<BuildingBlueprintKind, 'hut'>
): boolean {
  const p = state.planets[planetId];
  if (!p || !p.unlocked) return false;

  if (kind === 'warrior_hut') {
    if (p.warriorHutOrdered || p.warriorHutBuilt || p.hutsBuilt < 1) return false;
    if (p.loyalPop < BUILDING_FOLLOWER_REQS.warrior_hut) return false;
    p.warriorHutOrdered = true;
    return true;
  }
  if (kind === 'temple') {
    if (state.metaLevels.unlockTemple <= 0) return false;
    if (p.templeOrdered || p.templeBuilt || !p.warriorHutBuilt) return false;
    if (p.loyalPop < BUILDING_FOLLOWER_REQS.temple) return false;
    p.templeOrdered = true;
    return true;
  }
  if (kind === 'firewarrior_hut') {
    if (state.metaLevels.unlockFireWarriors <= 0) return false;
    if (p.fireWarriorHutOrdered || p.fireWarriorHutBuilt || !p.templeBuilt) return false;
    if (p.loyalPop < BUILDING_FOLLOWER_REQS.firewarrior_hut) return false;
    p.fireWarriorHutOrdered = true;
    return true;
  }
  if (kind === 'guard_tower') {
    if (state.metaLevels.unlockGuardhouse <= 0) return false;
    if (p.towersOrdered >= 4 || !p.fireWarriorHutBuilt) return false;
    if (p.loyalPop < BUILDING_FOLLOWER_REQS.guard_tower) return false;
    p.towersOrdered += 1;
    return true;
  }
  return false;
}

export function getMaxHutsForPop(p: PlanetProgress): number {
  if (p.loyalPop <= 0) return 0;
  return Math.min(8, Math.max(1, Math.ceil(p.loyalPop / 6)));
}

/** Hidden target cap for a trained role: 30% of followers once its training building is built. */
export function getRoleUnitCap(p: PlanetProgress, role: 'warrior' | 'preacher' | 'firewarrior'): number {
  const built =
    role === 'warrior'
      ? p.warriorHutBuilt
      : role === 'preacher'
        ? p.templeBuilt
        : p.fireWarriorHutBuilt;
  if (!built) return 0;
  return Math.max(1, Math.floor(p.loyalPop * 0.3));
}

/** Proportional training building limit: 1 per 20 of that role's unit cap (Guardhouses are exempt). */
export function getMaxTrainingBuildings(p: PlanetProgress, role: 'warrior' | 'preacher' | 'firewarrior'): number {
  const cap = Math.max(1, getRoleUnitCap(p, role));
  return Math.max(1, Math.ceil(cap / 20));
}

/** Called when a Brave finishes physical training inside a Training Building and pops out as a specialist. */
export function onBraveTrained(state: GameState, role: 'warrior' | 'preacher' | 'firewarrior'): boolean {
  const p = state.planets[state.activePlanetId];
  if (p.braves <= 0) return false;
  p.braves -= 1;
  if (role === 'warrior') p.warriors += 1;
  else if (role === 'preacher') p.preachers += 1;
  else p.fireWarriors += 1;
  updateDominanceAndUnlocks(state, p);
  return true;
}

/** Keeps unit counts consistent with loyalPop without magically auto-promoting Braves (training happens inside buildings). */
export function rebalanceUnits(p: PlanetProgress): void {
  const trained = p.warriors + p.preachers + p.fireWarriors;
  if (trained > p.loyalPop) {
    // Trim specialists only if population dropped below trained count due to combat losses
    let excess = trained - p.loyalPop;
    const cutW = Math.min(p.warriors, excess);
    p.warriors -= cutW;
    excess -= cutW;
    const cutP = Math.min(p.preachers, excess);
    p.preachers -= cutP;
    excess -= cutP;
    const cutF = Math.min(p.fireWarriors, excess);
    p.fireWarriors -= cutF;
  }
  p.braves = Math.max(0, p.loyalPop - p.warriors - p.preachers - p.fireWarriors);
}

export function onWildmanConverted(state: GameState): boolean {
  const p = state.planets[state.activePlanetId];
  const cap = getPopCap(state, p.planetId);
  if (p.loyalPop >= cap) return false;
  p.loyalPop += 1;
  rebalanceUnits(p);
  updateDominanceAndUnlocks(state, p);
  return true;
}

export function onBraveBred(state: GameState): boolean {
  return onWildmanConverted(state);
}

export function onEnemyConvertedByPreacher(state: GameState): boolean {
  const p = state.planets[state.activePlanetId];
  const cap = getPopCap(state, p.planetId);
  if (p.enemyPop > 0) p.enemyPop -= 1;
  if (p.loyalPop < cap) {
    p.loyalPop += 1;
    rebalanceUnits(p);
  }
  updateDominanceAndUnlocks(state, p);
  return true;
}

export function onBuildingConstructed(state: GameState, kind: BuildingBlueprintKind): void {
  const p = state.planets[state.activePlanetId];
  if (kind === 'hut') p.hutsBuilt += 1;
  else if (kind === 'warrior_hut') p.warriorHutBuilt = true;
  else if (kind === 'temple') p.templeBuilt = true;
  else if (kind === 'firewarrior_hut') p.fireWarriorHutBuilt = true;
  else if (kind === 'guard_tower') p.towersBuilt = Math.min(4, p.towersBuilt + 1);
  updateDominanceAndUnlocks(state, p);
}

export function onPlayerUnitDied(
  state: GameState,
  role: 'brave' | 'warrior' | 'preacher' | 'firewarrior'
): void {
  const p = state.planets[state.activePlanetId];
  if (p.loyalPop <= 0) return;
  p.loyalPop = Math.max(0, p.loyalPop - 1);
  if (role === 'warrior' && p.warriors > 0) p.warriors -= 1;
  else if (role === 'preacher' && p.preachers > 0) p.preachers -= 1;
  else if (role === 'firewarrior' && p.fireWarriors > 0) p.fireWarriors -= 1;
  else if (p.braves > 0) p.braves -= 1;
  rebalanceUnits(p);
  updateDominanceAndUnlocks(state, p);
}

export function applyCombatResult(
  state: GameState,
  enemyUnitKills: number,
  enemyHutKills: number,
  playerLosses = 0
): void {
  const p = state.planets[state.activePlanetId];
  if (enemyUnitKills > 0) {
    const killed = Math.min(p.enemyPop, enemyUnitKills);
    p.enemyPop -= killed;
    p.swarmKills += enemyUnitKills;
    state.totalSwarmKills += enemyUnitKills;
    state.pendingDivineEssence += enemyUnitKills * 0.3;
  }
  if (enemyHutKills > 0 && p.enemyHutsRemaining > 0) {
    const down = Math.min(p.enemyHutsRemaining, enemyHutKills);
    p.enemyHutsRemaining -= down;
    p.passiveDestruction += down;
    state.pendingDivineEssence += down * 0.8;
  }
  if (playerLosses > 0 && p.loyalPop > 1) {
    p.loyalPop = Math.max(1, p.loyalPop - playerLosses);
    rebalanceUnits(p);
  }
  updateDominanceAndUnlocks(state, p);
}

export function castSpell(
  state: GameState,
  spellId: string,
  distanceFromShamanPx: number,
  rangeMult = 1
): { ok: boolean; reason?: string; converted?: number; destroyed?: number } {
  const spell = SPELLS.find((s) => s.id === spellId);
  if (!spell) return { ok: false, reason: 'Unknown spell' };
  if (!isSpellUnlocked(state, spell)) return { ok: false, reason: 'Locked' };

  const cd = state.spellCooldowns[spell.id] ?? 0;
  if (cd > 0) return { ok: false, reason: `Cooldown ${cd.toFixed(1)}s` };

  const range = getCastRangePx(state, state.activePlanetId) * rangeMult;
  if (distanceFromShamanPx > range) {
    return { ok: false, reason: 'Out of Shaman cast range' };
  }

  const manaCost = getSpellManaCost(state, spell);
  if (state.mana < manaCost) {
    return { ok: false, reason: 'Not enough Mana' };
  }

  state.mana -= manaCost;
  state.spellCooldowns[spell.id] = getSpellCooldownSec(state, spell);

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

  rebalanceUnits(p);
  updateDominanceAndUnlocks(state, p);
  return { ok: true, converted, destroyed };
}

export function updateDominanceAndUnlocks(state: GameState, p: PlanetProgress): void {
  const dom = computeDominance(p);
  if (dom > p.peakDominance) {
    const delta = dom - p.peakDominance;
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

export function formAlliance(state: GameState, planetId: number): boolean {
  const cfg = getPlanetConfig(planetId);
  const p = state.planets[planetId];
  if (!cfg.allianceTribe || !cfg.allianceCost || p.allied) return false;
  const discount = Math.max(0.25, 1 - state.metaLevels.allianceFavor * 0.15);
  const cost = Math.round(cfg.allianceCost * discount);
  if (state.mana < cost) return false;
  state.mana -= cost;
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

  // Background (non-active) planets run passive progression
  for (const cfg of PLANETS) {
    const p = state.planets[cfg.id];
    if (!p.unlocked) continue;
    const isActive = cfg.id === state.activePlanetId;
    if (isActive) {
      // Rival Shamans slowly reinforce enemy pop if huts remain
      const activeRivals = cfg.rivals.filter((r) => !(p.allied && r === cfg.allianceTribe));
      if (!p.conquered && p.hutsBuilt > 0 && p.enemyHutsRemaining > 0 && activeRivals.length > 0) {
        if (Math.random() < 0.03 * activeRivals.length * dtSec) {
          p.enemyPop = Math.min(cfg.initialEnemyPop + p.enemyHutsRemaining * 3, p.enemyPop + 1);
        }
      }
      updateDominanceAndUnlocks(state, p);
      continue;
    }

    // Background passive destruction & breeding on earlier planets
    const cap = getPopCap(state, cfg.id);
    if (p.hutsBuilt >= 3 && p.loyalPop < cap && Math.random() < 0.08 * p.hutsBuilt * dtSec) {
      p.loyalPop += 1;
      rebalanceUnits(p);
    }
    const power = p.preachers * 0.3 + p.warriors * 0.45 + p.fireWarriors * 0.7 + p.towersBuilt * 0.6;
    if (power > 0 && Math.random() < Math.min(0.4, power * 0.02 * dtSec)) {
      if (p.conquered) {
        p.swarmKills += 1;
        state.totalSwarmKills += 1;
        p.passiveDestruction += 1;
        state.pendingDivineEssence += 0.2 * cfg.id;
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
  if (parsed.version !== 4 || !parsed.planets) return base;
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
