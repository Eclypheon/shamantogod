export type TribeId = 'blue' | 'red' | 'green' | 'yellow' | 'wild';

export interface PlanetConfig {
  id: number;
  name: string;
  mode: 'shaman' | 'junior-god';
  rivals: Exclude<TribeId, 'blue' | 'wild'>[];
  allianceTribe?: Exclude<TribeId, 'blue' | 'wild'>;
  allianceCost?: number;
  theme: string;
  groundColor: number;
  waterColor: number;
  initialEnemyPop: number;
  initialEnemyHuts: number;
  swarmStrength: number;
}

export interface SpellConfig {
  id: string;
  name: string;
  manaCost: number;
  cooldownSec: number;
  isStoneHead: boolean;
  unlockPlanet: number;
  radius: number;
  sound: string;
  vfx: string;
  kind: 'convert' | 'damage' | 'terrain' | 'buff' | 'summon' | 'teleport';
  description: string;
}

export interface MetaUpgradeConfig {
  id: 'startingMana' | 'manaRate' | 'castRange' | 'spellPower' | 'popCap' | 'offlineEfficiency';
  name: string;
  baseCost: number;
  costScale: number;
  maxLevel: number;
  description: string;
}

export const PLANETS: PlanetConfig[] = [
  { id: 1, name: 'Kaelis I: Dawn Plains', mode: 'shaman', rivals: ['red'], theme: 'Mainland Plains', groundColor: 0x3b6e3c, waterColor: 0x1d4e89, initialEnemyPop: 14, initialEnemyHuts: 4, swarmStrength: 1 },
  { id: 2, name: 'Kaelis II: Red Ridge', mode: 'shaman', rivals: ['red'], theme: 'Ridge & Valley', groundColor: 0x5c6b3c, waterColor: 0x1d4e89, initialEnemyPop: 24, initialEnemyHuts: 6, swarmStrength: 2 },
  { id: 3, name: 'Kaelis III: Azure Bay', mode: 'shaman', rivals: ['yellow'], theme: 'Coastal Bay', groundColor: 0x4b7752, waterColor: 0x1a659e, initialEnemyPop: 32, initialEnemyHuts: 8, swarmStrength: 3 },
  { id: 4, name: 'Kaelis IV: Mirefen', mode: 'shaman', rivals: ['green'], theme: 'Marshlands', groundColor: 0x3a5a40, waterColor: 0x264653, initialEnemyPop: 42, initialEnemyHuts: 10, swarmStrength: 4 },
  { id: 5, name: 'Kaelis V: Twin Isles', mode: 'shaman', rivals: ['yellow', 'red'], allianceTribe: 'yellow', allianceCost: 450, theme: 'Twin Islands', groundColor: 0x588157, waterColor: 0x184e77, initialEnemyPop: 56, initialEnemyHuts: 12, swarmStrength: 6 },
  { id: 6, name: 'Kaelis VI: Mist Crags', mode: 'shaman', rivals: ['green'], theme: 'Misty Crags', groundColor: 0x4f5d75, waterColor: 0x22333b, initialEnemyPop: 70, initialEnemyHuts: 14, swarmStrength: 8 },
  { id: 7, name: 'Kaelis VII: Rift Divide', mode: 'shaman', rivals: ['red', 'green'], allianceTribe: 'green', allianceCost: 1100, theme: 'Continental Divide', groundColor: 0x6b705c, waterColor: 0x1d3557, initialEnemyPop: 90, initialEnemyHuts: 17, swarmStrength: 10 },
  { id: 8, name: 'Kaelis VIII: Sunken Shoals', mode: 'shaman', rivals: ['yellow', 'green'], allianceTribe: 'yellow', allianceCost: 1800, theme: 'Archipelago', groundColor: 0x4a7c59, waterColor: 0x144552, initialEnemyPop: 115, initialEnemyHuts: 20, swarmStrength: 13 },
  { id: 9, name: 'Kaelis IX: Iron Peaks', mode: 'shaman', rivals: ['red', 'yellow'], allianceTribe: 'yellow', allianceCost: 2600, theme: 'Fortress Peaks', groundColor: 0x6c584c, waterColor: 0x1b263b, initialEnemyPop: 145, initialEnemyHuts: 24, swarmStrength: 17 },
  { id: 10, name: 'Kaelis X: Threefold Basin', mode: 'shaman', rivals: ['red', 'green', 'yellow'], allianceTribe: 'green', allianceCost: 3800, theme: 'Middle Ground', groundColor: 0x5e503f, waterColor: 0x22333b, initialEnemyPop: 180, initialEnemyHuts: 28, swarmStrength: 22 },
  { id: 11, name: 'Kaelis XI: Fractured Crust', mode: 'shaman', rivals: ['red', 'green', 'yellow'], allianceTribe: 'yellow', allianceCost: 5500, theme: 'Fractured Earth', groundColor: 0x5c3c3c, waterColor: 0x370617, initialEnemyPop: 220, initialEnemyHuts: 32, swarmStrength: 28 },
  { id: 12, name: 'Kaelis XII: Astral Reef', mode: 'junior-god', rivals: ['red', 'green', 'yellow'], allianceTribe: 'green', allianceCost: 8000, theme: 'Endless Archipelago', groundColor: 0x3d405b, waterColor: 0x14213d, initialEnemyPop: 280, initialEnemyHuts: 38, swarmStrength: 36 },
  { id: 13, name: 'Kaelis XIII: Cinder Core', mode: 'junior-god', rivals: ['red', 'green', 'yellow'], theme: 'Inferno', groundColor: 0x6a040f, waterColor: 0x370617, initialEnemyPop: 360, initialEnemyHuts: 45, swarmStrength: 46 },
  { id: 14, name: 'Kaelis XIV: Dusk Zenith', mode: 'junior-god', rivals: ['red', 'green', 'yellow'], allianceTribe: 'yellow', allianceCost: 14000, theme: "Journey's End", groundColor: 0x4a2c40, waterColor: 0x1b1426, initialEnemyPop: 450, initialEnemyHuts: 54, swarmStrength: 60 },
  { id: 15, name: 'Kaelis XV: The Beginning', mode: 'junior-god', rivals: ['red', 'green', 'yellow'], theme: 'Apex Pantheon', groundColor: 0x2b2d42, waterColor: 0x0b090a, initialEnemyPop: 600, initialEnemyHuts: 68, swarmStrength: 80 },
];

export const SPELLS: SpellConfig[] = [
  { id: 'convert', name: 'Convert', manaCost: 15, cooldownSec: 1.5, isStoneHead: false, unlockPlanet: 1, radius: 90, sound: 'convert', vfx: 'vfx_convert', kind: 'convert', description: 'Convert Wildmen and weak enemies to Braves.' },
  { id: 'blast', name: 'Blast', manaCost: 20, cooldownSec: 2, isStoneHead: false, unlockPlanet: 1, radius: 85, sound: 'blast', vfx: 'vfx_blast', kind: 'damage', description: 'Shockwave blasting enemy units and huts.' },
  { id: 'swarm', name: 'Swarm', manaCost: 55, cooldownSec: 4, isStoneHead: false, unlockPlanet: 2, radius: 110, sound: 'swarm', vfx: 'vfx_swarm', kind: 'damage', description: 'Insects scatter and damage enemy forces.' },
  { id: 'lightning', name: 'Lightning', manaCost: 90, cooldownSec: 4.5, isStoneHead: false, unlockPlanet: 3, radius: 75, sound: 'lightning', vfx: 'vfx_lightning', kind: 'damage', description: 'Strike target area with high-damage lightning.' },
  { id: 'shield', name: 'Shield', manaCost: 70, cooldownSec: 8, isStoneHead: false, unlockPlanet: 4, radius: 110, sound: 'convert', vfx: 'vfx_convert', kind: 'buff', description: 'Protect nearby followers from swarm damage.' },
  { id: 'swamp', name: 'Swamp', manaCost: 120, cooldownSec: 6, isStoneHead: false, unlockPlanet: 4, radius: 95, sound: 'swamp', vfx: 'vfx_swarm', kind: 'terrain', description: 'Create a bog that sinks attacking enemies.' },
  { id: 'landbridge', name: 'Landbridge', manaCost: 110, cooldownSec: 5, isStoneHead: false, unlockPlanet: 5, radius: 100, sound: 'convert', vfx: 'vfx_convert', kind: 'terrain', description: 'Raise land for faster follower raids.' },
  { id: 'invisibility', name: 'Invisibility', manaCost: 85, cooldownSec: 9, isStoneHead: false, unlockPlanet: 6, radius: 105, sound: 'shaman_return', vfx: 'vfx_angel', kind: 'buff', description: 'Cloak followers for bonus raid conversions.' },
  { id: 'flatten', name: 'Flatten', manaCost: 130, cooldownSec: 6, isStoneHead: false, unlockPlanet: 6, radius: 110, sound: 'blast', vfx: 'vfx_blast', kind: 'terrain', description: 'Level terrain to speed up Hut construction.' },
  { id: 'tornado', name: 'Tornado', manaCost: 180, cooldownSec: 7, isStoneHead: false, unlockPlanet: 7, radius: 125, sound: 'attack', vfx: 'vfx_tornado', kind: 'damage', description: 'Moving vortex tearing through enemy huts.' },
  { id: 'erode', name: 'Erode', manaCost: 220, cooldownSec: 8, isStoneHead: false, unlockPlanet: 8, radius: 115, sound: 'swamp', vfx: 'vfx_blast', kind: 'terrain', description: 'Sink enemy coastal structures.' },
  { id: 'earthquake', name: 'Earthquake', manaCost: 300, cooldownSec: 10, isStoneHead: false, unlockPlanet: 9, radius: 155, sound: 'volcano', vfx: 'vfx_blast', kind: 'damage', description: 'Shatter enemy buildings across a wide zone.' },
  { id: 'hypnotise', name: 'Hypnotise', manaCost: 260, cooldownSec: 9, isStoneHead: false, unlockPlanet: 10, radius: 125, sound: 'convert', vfx: 'vfx_convert', kind: 'convert', description: 'Mass-convert enemy units inside target area.' },
  { id: 'firestorm', name: 'Firestorm', manaCost: 480, cooldownSec: 12, isStoneHead: false, unlockPlanet: 11, radius: 170, sound: 'fire', vfx: 'vfx_fireball', kind: 'damage', description: 'Rain fire across enemy strongholds.' },
  { id: 'angel', name: 'Angel of Death', manaCost: 650, cooldownSec: 15, isStoneHead: false, unlockPlanet: 12, radius: 220, sound: 'angel', vfx: 'vfx_angel', kind: 'summon', description: 'Summon a spectral hunter to purge enemies.' },
  { id: 'volcano', name: 'Volcano', manaCost: 950, cooldownSec: 18, isStoneHead: false, unlockPlanet: 13, radius: 210, sound: 'volcano', vfx: 'vfx_volcano', kind: 'damage', description: 'Cataclysmic eruption devastating rival bases.' },

  // Stone Head cooldown shot-spells (0 Mana)
  { id: 'bloodlust', name: 'Bloodlust', manaCost: 0, cooldownSec: 22, isStoneHead: true, unlockPlanet: 2, radius: 130, sound: 'attack', vfx: 'vfx_fireball', kind: 'buff', description: 'Stone Head: double follower combat speed.' },
  { id: 'teleport', name: 'Teleport', manaCost: 0, cooldownSec: 18, isStoneHead: true, unlockPlanet: 4, radius: 48, sound: 'shaman_return', vfx: 'vfx_angel', kind: 'teleport', description: 'Stone Head: blink Shaman to cursor.' },
  { id: 'ghost_army', name: 'Ghost Army', manaCost: 0, cooldownSec: 26, isStoneHead: true, unlockPlanet: 6, radius: 110, sound: 'swarm', vfx: 'vfx_convert', kind: 'summon', description: 'Stone Head: decoy squad absorbs swarm hits.' },
  { id: 'armageddon', name: 'Armageddon', manaCost: 0, cooldownSec: 45, isStoneHead: true, unlockPlanet: 11, radius: 260, sound: 'volcano', vfx: 'vfx_volcano', kind: 'damage', description: 'Stone Head: massive all-tribe clash surge.' },
];

export const META_UPGRADES: MetaUpgradeConfig[] = [
  { id: 'startingMana', name: 'Ancestral Font', baseCost: 5, costScale: 1.6, maxLevel: 20, description: '+50 starting Mana on every planet.' },
  { id: 'manaRate', name: 'Worship Resonance', baseCost: 8, costScale: 1.7, maxLevel: 25, description: '+25% Mana/sec across all planets.' },
  { id: 'castRange', name: 'Astral Reach', baseCost: 6, costScale: 1.55, maxLevel: 15, description: '+15% Shaman cast range (Planets 1-11).' },
  { id: 'spellPower', name: 'Arcane Surge', baseCost: 10, costScale: 1.75, maxLevel: 25, description: '+20% spell conversion & destruction.' },
  { id: 'popCap', name: 'Fertile Huts', baseCost: 7, costScale: 1.65, maxLevel: 20, description: '+5 max follower capacity per planet.' },
  { id: 'offlineEfficiency', name: 'Eternal Vigil', baseCost: 12, costScale: 1.8, maxLevel: 10, description: '+10% offline passive progress.' },
];
