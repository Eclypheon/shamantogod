import Phaser from 'phaser';
import { SPELLS } from './data';
import {
  applyCombatResult,
  castSpell,
  getCastRangePx,
  getMaxHutsForPop,
  getPlanetConfig,
  getPopCap,
  getPreacherSpeedMult,
  getRoleUnitCap,
  getShamanMaxHp,
  getSpellPowerMult,
  getTimberSpeedMult,
  getTowerRangePx,
  getTreeRegrowSec,
  getWarriorPowerMult,
  onBraveBred,
  onBraveTrained,
  onBuildingConstructed,
  onEnemyConvertedByPreacher,
  onPlayerUnitDied,
  onShamanDied,
  onWildmanConverted,
  type BuildingBlueprintKind,
  type GameState,
} from './state';

const WORLD_W = 1600;
const WORLD_H = 1000;

type BraveState =
  | 'patrol'
  | 'seek_tree'
  | 'chop_tree'
  | 'carry_wood'
  | 'build_site'
  | 'repair_building'
  | 'enter_hut'
  | 'breeding'
  | 'go_train'
  | 'training'
  | 'fight_enemy';

interface TrainingBuildingNode {
  role: 'warrior' | 'preacher' | 'firewarrior';
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Sprite;
  hp: number;
  maxHp: number;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  occupant: BraveActor | null;
  trainTimer: number;
  barBg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
}

interface TreeNode {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Sprite;
  chopped: boolean;
  regrowTimer: number;
}

interface BuildSite {
  kind: BuildingBlueprintKind;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Sprite;
  barBg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
  woodDelivered: number;
  woodNeeded: number;
}

interface PlayerHutNode {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Sprite;
  hp: number;
  maxHp: number;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  occupants: number;
  breedTimer: number;
  barBg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
}

interface WildmanActor {
  sprite: Phaser.GameObjects.Sprite;
  barBg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  waitTimer: number;
  convertProgress: number;
}

interface BraveActor {
  sprite: Phaser.GameObjects.Sprite;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dir: number; // 1..8
  fsm: BraveState;
  targetTree: TreeNode | null;
  targetHut: PlayerHutNode | null;
  targetTrainBuilding: TrainingBuildingNode | null;
  targetRepair: { x: number; y: number; hp: number; maxHp: number } | null;
  targetEnemy: EnemyActor | null;
  timer: number;
  carryingWood: boolean;
  patrolX: number;
  patrolY: number;
}

interface SpecialistActor {
  kind: 'warrior' | 'preacher' | 'firewarrior';
  sprite: Phaser.GameObjects.Sprite;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dir: number;
  attackTimer: number;
  convertProgress: number;
  garrisonedTowerIdx: number; // >=0 for Fire Warrior in a Guard Tower
  patrolX: number;
  patrolY: number;
}

interface EnemyActor {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  tribe: 'red' | 'green' | 'yellow';
  role: 'brave' | 'warrior';
  insideTraining: boolean;
  trainX: number;
  trainY: number;
  trainTimer: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  targetX: number;
  targetY: number;
  waitTimer: number;
  attackTimer: number;
  dir: number;
  airZ: number;
  vz: number;
  knockVx: number;
  knockVy: number;
  dead: boolean;
}

interface EnemyHutNode {
  sprite: Phaser.GameObjects.Sprite;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  barBg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
  isTrainingHut: boolean;
  occupant: EnemyActor | null;
  trainTimer: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  tribe: 'red' | 'green' | 'yellow';
}

interface RivalShamanActor {
  sprite: Phaser.GameObjects.Sprite;
  ring: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  tribe: 'red' | 'green' | 'yellow';
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  respawnTimer: number;
  attackTimer: number;
  targetX: number;
  targetY: number;
  waitTimer: number;
  dir: number;
}

interface ConvertCircle {
  x: number;
  y: number;
  radius: number;
  remaining: number;
  ring: Phaser.GameObjects.Arc;
  sparkles: Phaser.GameObjects.Arc[];
  phase: number;
}

/** Exact Populous sprite directions: 1=S, 2=SE, 3=E, 4=NE, 5=N, 6=NW, 7=W, 8=SW */
function dir8FromVec(dx: number, dy: number): number {
  const oct = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const map = [3, 2, 1, 8, 7, 6, 5, 4];
  return map[((oct % 8) + 8) % 8];
}

function dir4FromVec(dx: number, dy: number): number {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 3 : 7;
  return dy > 0 ? 1 : 5;
}

export class PlanetScene extends Phaser.Scene {
  private state!: GameState;
  private onHudSync!: () => void;
  private onToast!: (msg: string) => void;

  private shaman!: Phaser.GameObjects.Sprite;
  private shamanLabel!: Phaser.GameObjects.Text;
  private shamanHpBg!: Phaser.GameObjects.Rectangle;
  private shamanHpFill!: Phaser.GameObjects.Rectangle;
  private shamanHp = 180;
  private shamanRespawnTimer = 0;
  private shamanAttackTimer = 0;
  private respawnCircle!: Phaser.GameObjects.Arc;
  private respawnText!: Phaser.GameObjects.Text;
  private rangeCircle!: Phaser.GameObjects.Arc;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private joystickVec = { x: 0, y: 0 };

  private terrainGfx!: Phaser.GameObjects.Graphics;
  private trees: TreeNode[] = [];
  private playerHuts: PlayerHutNode[] = [];
  private towers: { x: number; y: number; sprite: Phaser.GameObjects.Sprite }[] = [];
  private trainingBuildings: TrainingBuildingNode[] = [];
  private enemyHuts: EnemyHutNode[] = [];
  private buildSite: BuildSite | null = null;
  private wildmen: WildmanActor[] = [];
  private braves: BraveActor[] = [];
  private specialists: SpecialistActor[] = [];
  private enemies: EnemyActor[] = [];
  private rivalShamans: RivalShamanActor[] = [];
  private convertCircles: ConvertCircle[] = [];

  private shamanDir = 1; // Facing south toward camera
  private castAnimTimer = 0;
  private currentPlanetRendered = -1;
  private renderedAllied = false;
  private enemyRaidTimer = 45;
  private simAccum = 0;
  private paused = true;

  constructor(state: GameState, onHudSync: () => void, onToast: (msg: string) => void) {
    super('PlanetScene');
    this.state = state;
    this.onHudSync = onHudSync;
    this.onToast = onToast;
  }

  setPaused(val: boolean): void {
    this.paused = val;
  }

  replaceState(next: GameState): void {
    this.state = next;
    this.currentPlanetRendered = -1;
  }

  triggerOpeningConvert(): void {
    if (!this.shaman) return;
    const p = this.state.planets[this.state.activePlanetId];
    // Disabled on World 1 so the player casts their first Convert manually during the tutorial; active on Worlds 2+
    if (p.planetId >= 2 && p.loyalPop === 0 && p.hutsBuilt === 0) {
      this.shaman.setPosition(WORLD_W / 2, WORLD_H / 2);
      this.spawnConvertCircle(this.shaman.x, this.shaman.y);
      this.castAnimTimer = 0.8;
      const castKey = `shaman_blue_cast_d${this.shamanDir}`;
      if (this.anims.exists(castKey)) this.shaman.play(castKey);
      this.playSfx('convert', 0.36);
    }
  }

  setJoystick(x: number, y: number): void {
    this.joystickVec.x = x;
    this.joystickVec.y = y;
  }

  private playSfx(key: string, volume = 0.34): void {
    if (!this.state.muted && this.cache.audio.exists(key)) {
      this.sound.play(key, { volume });
    }
  }

  preload(): void {
    this.load.atlas('units', './assets/atlases/units.png', './assets/atlases/units.json');
    this.load.atlas('world', './assets/atlases/world.png', './assets/atlases/world.json');
    const sounds = [
      'convert', 'blast', 'lightning', 'swarm', 'swamp',
      'volcano', 'angel', 'fire', 'birth', 'attack', 'punch', 'shaman_return',
    ];
    for (const s of sounds) {
      this.load.audio(s, `./assets/audio/${s}.mp3`);
    }
  }

  create(): void {
    this.registerAnimations();
    this.terrainGfx = this.add.graphics();

    this.shaman = this.add.sprite(WORLD_W / 2, WORLD_H / 2, 'units', 'shaman_blue_stand_d1_00');
    this.shaman.setOrigin(0.5, 1.0).setScale(1.4).setDepth(500);
    this.shaman.play('shaman_blue_stand_d1');
    this.shamanLabel = this.add.text(this.shaman.x, this.shaman.y - 62, 'SHAMAN', {
      fontFamily: 'Cinzel, Georgia, serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#f4e6c4',
      backgroundColor: 'rgba(39,24,12,0.72)',
      padding: { x: 4, y: 1 },
    }).setOrigin(0.5, 1).setDepth(950);

    this.shamanHp = getShamanMaxHp(this.state);
    this.shamanHpBg = this.add.rectangle(this.shaman.x, this.shaman.y - 52, 34, 4, 0x1a120a, 0.85).setVisible(false).setDepth(952);
    this.shamanHpFill = this.add.rectangle(this.shaman.x - 16, this.shaman.y - 52, 32, 2, 0x52b788, 1).setOrigin(0, 0.5).setVisible(false).setDepth(953);
    this.respawnCircle = this.add.circle(WORLD_W / 2, WORLD_H / 2, 42, 0xf4c95d, 0.16).setStrokeStyle(2.5, 0xf4c95d, 0.95).setVisible(false).setDepth(15);
    this.respawnText = this.add.text(WORLD_W / 2, WORLD_H / 2 - 54, '', {
      fontFamily: 'Cinzel, Georgia, serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#f4c95d',
      stroke: '#1b1209',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setVisible(false).setDepth(960);

    this.rangeCircle = this.add.circle(this.shaman.x, this.shaman.y, 185, 0x4ea8de, 0.06);
    this.rangeCircle.setStrokeStyle(1.5, 0xc89b4b, 0.55).setDepth(5);

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.shaman, true, 0.14, 0.14);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.paused) return;
      const target = pointer.event?.target as HTMLElement | null;
      if (target && typeof target.closest === 'function' && target.closest('#hud')) return;
      const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.handleCastAt(worldPt.x, worldPt.y);
    });

    this.rebuildPlanetVisuals();
  }

  private registerAnimations(): void {
    const frames = this.textures.get('units').getFrameNames();
    const groups = new Map<string, string[]>();
    for (const f of frames) {
      const idx = f.lastIndexOf('_');
      if (idx <= 0) continue;
      const key = f.slice(0, idx);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    for (const [key, list] of groups.entries()) {
      list.sort();
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: list.map((frame) => ({ key: 'units', frame })),
          frameRate: 10,
          repeat: key.includes('_cast_') ? 0 : -1,
        });
      }
    }
  }

  private clearPlanetObjects(): void {
    for (const t of this.trees) t.sprite.destroy();
    this.trees = [];
    for (const h of this.playerHuts) {
      h.sprite.destroy();
      h.hpBg.destroy();
      h.hpFill.destroy();
      h.barBg.destroy();
      h.barFill.destroy();
    }
    this.playerHuts = [];
    for (const tw of this.towers) tw.sprite.destroy();
    this.towers = [];
    for (const tb of this.trainingBuildings) {
      tb.sprite.destroy();
      tb.hpBg.destroy();
      tb.hpFill.destroy();
      tb.barBg.destroy();
      tb.barFill.destroy();
    }
    this.trainingBuildings = [];
    for (const eh of this.enemyHuts) {
      eh.sprite.destroy();
      eh.hpBg.destroy();
      eh.hpFill.destroy();
      eh.barBg.destroy();
      eh.barFill.destroy();
    }
    this.enemyHuts = [];
    if (this.buildSite) {
      this.buildSite.sprite.destroy();
      this.buildSite.barBg.destroy();
      this.buildSite.barFill.destroy();
      this.buildSite = null;
    }
    for (const w of this.wildmen) {
      w.sprite.destroy();
      w.barBg.destroy();
      w.barFill.destroy();
    }
    this.wildmen = [];
    for (const b of this.braves) {
      b.sprite.destroy();
      b.hpBg.destroy();
      b.hpFill.destroy();
    }
    this.braves = [];
    for (const s of this.specialists) {
      s.sprite.destroy();
      s.hpBg.destroy();
      s.hpFill.destroy();
    }
    this.specialists = [];
    for (const e of this.enemies) {
      e.sprite.destroy();
      e.shadow.destroy();
      e.hpBg.destroy();
      e.hpFill.destroy();
    }
    this.enemies = [];
    for (const rs of this.rivalShamans) {
      rs.sprite.destroy();
      rs.ring.destroy();
      rs.label.destroy();
      rs.hpBg.destroy();
      rs.hpFill.destroy();
    }
    this.rivalShamans = [];
    for (const cc of this.convertCircles) {
      cc.ring.destroy();
      cc.sparkles.forEach((sp) => sp.destroy());
    }
    this.convertCircles = [];
  }

  rebuildPlanetVisuals(): void {
    const cfg = getPlanetConfig(this.state.activePlanetId);
    const p = this.state.planets[cfg.id];
    this.currentPlanetRendered = cfg.id;
    this.renderedAllied = p.allied;

    this.clearPlanetObjects();
    this.shaman.setPosition(WORLD_W / 2, WORLD_H / 2);
    this.enemyRaidTimer = cfg.id === 1 ? 45 : Math.max(12, 30 - cfg.id * 1.5);

    // Terrain
    this.terrainGfx.clear();
    this.terrainGfx.fillStyle(cfg.waterColor, 1);
    this.terrainGfx.fillRect(0, 0, WORLD_W, WORLD_H);
    this.terrainGfx.fillStyle(0x9c8257, 1);
    this.terrainGfx.fillEllipse(WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.85, WORLD_H * 0.82);
    this.terrainGfx.fillStyle(cfg.groundColor, 1);
    this.terrainGfx.fillEllipse(WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.81, WORLD_H * 0.77);

    this.terrainGfx.lineStyle(1, 0x000000, 0.08);
    for (let gx = 200; gx < WORLD_W - 200; gx += 96) {
      for (let gy = 160; gy < WORLD_H - 160; gy += 64) {
        this.terrainGfx.strokePoints(
          [
            { x: gx, y: gy - 24 },
            { x: gx + 48, y: gy },
            { x: gx, y: gy + 24 },
            { x: gx - 48, y: gy },
          ],
          true
        );
      }
    }

    // Only 7 sparse Populous trees (regrow slowly in 75s)
    const treeOffsets = [
      [-185, -95], [-160, 105], [175, -105], [190, 95],
      [-40, -155], [45, 155], [-265, 10],
    ];
    for (const [ox, oy] of treeOffsets) {
      const tx = WORLD_W / 2 + ox;
      const ty = WORLD_H / 2 + oy;
      const sp = this.add.sprite(tx, ty, 'world', 'tree_full').setOrigin(0.5, 0.92).setDepth(ty);
      this.trees.push({ x: tx, y: ty, sprite: sp, chopped: false, regrowTimer: 0 });
    }

    this.syncBuiltStructures();

    // Rival huts with HP bars when damaged
    const enemyHutCount = Math.min(10, p.enemyHutsRemaining);
    for (let i = 0; i < enemyHutCount; i++) {
      const tribe = cfg.rivals[i % cfg.rivals.length];
      const angle = -0.9 + (i / Math.max(1, enemyHutCount)) * 1.8 + (i % 2 === 0 ? 0 : Math.PI);
      const bx = WORLD_W / 2 + Math.cos(angle) * 440;
      const by = WORLD_H / 2 + Math.sin(angle) * 240;
      const sp = this.add.sprite(bx, by, 'world', `hut_2_${tribe}`).setOrigin(0.5, 0.92).setDepth(by);
      const hpBg = this.add.rectangle(bx, by - 58, 36, 5, 0x1a120a, 0.85).setVisible(false).setDepth(928);
      const hpFill = this.add.rectangle(bx - 17, by - 58, 34, 3, 0xe63946, 1).setOrigin(0, 0.5).setVisible(false).setDepth(929);
      const barBg = this.add.rectangle(bx, by - 50, 30, 4, 0x1a120a, 0.85).setVisible(false).setDepth(920);
      const barFill = this.add.rectangle(bx - 14, by - 50, 0, 2, 0xf4c95d, 1).setOrigin(0, 0.5).setVisible(false).setDepth(921);
      this.enemyHuts.push({ sprite: sp, hpBg, hpFill, barBg, barFill, isTrainingHut: false, occupant: null, trainTimer: 0, x: bx, y: by, hp: 120, maxHp: 120, tribe });
    }

    // 1 Rival Shaman per rival tribe (can fight, die, and reincarnate!)
    cfg.rivals.forEach((tribe, idx) => {
      const isAlly = p.allied && cfg.allianceTribe === tribe;
      const angle = idx === 0 ? 0 : idx === 1 ? Math.PI : Math.PI / 2;
      const sx = WORLD_W / 2 + Math.cos(angle) * 390;
      const sy = WORLD_H / 2 + Math.sin(angle) * 210;
      const ringColor = isAlly ? 0x52b788 : tribe === 'red' ? 0xe63946 : tribe === 'green' ? 0x2ec4b6 : 0xf4c95d;
      const ring = this.add.circle(sx, sy, 26, ringColor, 0.14).setStrokeStyle(2, ringColor, 0.85).setDepth(4);
      const sp = this.add.sprite(sx, sy, 'units', `shaman_${tribe}_stand_d1_00`).setOrigin(0.5, 1).setScale(1.32).setDepth(sy);
      if (this.anims.exists(`shaman_${tribe}_stand_d1`)) sp.play(`shaman_${tribe}_stand_d1`);
      const label = this.add.text(sx, sy - 60, isAlly ? `ALLY (${tribe.toUpperCase()})` : `RIVAL (${tribe.toUpperCase()})`, {
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize: '9px',
        fontStyle: 'bold',
        color: isAlly ? '#74c69d' : '#ffb4a2',
        backgroundColor: 'rgba(20,14,8,0.75)',
        padding: { x: 4, y: 1 },
      }).setOrigin(0.5, 1).setDepth(950);
      const hpBg = this.add.rectangle(sx, sy - 50, 34, 4, 0x1a120a, 0.85).setVisible(false).setDepth(951);
      const hpFill = this.add.rectangle(sx - 16, sy - 50, 32, 2, 0xe63946, 1).setOrigin(0, 0.5).setVisible(false).setDepth(952);
      this.rivalShamans.push({
        sprite: sp,
        ring,
        label,
        hpBg,
        hpFill,
        tribe,
        homeX: sx,
        homeY: sy,
        x: sx,
        y: sy,
        hp: 180,
        maxHp: 180,
        respawnTimer: 0,
        attackTimer: 0,
        targetX: sx,
        targetY: sy,
        waitTimer: 1.5,
        dir: 1,
      });
    });

    // 6 Wildmen near the Shaman at center
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + 0.3;
      const dist = Phaser.Math.Between(48, 86);
      this.spawnWildman(WORLD_W / 2 + Math.cos(ang) * dist, WORLD_H / 2 + Math.sin(ang) * dist);
    }

    // Existing loyal units
    this.syncUnitActors();

    // Enemy Braves around rival territories (they train for 5s into Enemy Warriors, faster on later planets)
    cfg.rivals.forEach((tribe, idx) => {
      const angle = idx === 0 ? 0 : idx === 1 ? Math.PI : Math.PI / 2;
      const cx = WORLD_W / 2 + Math.cos(angle) * 370;
      const cy = WORLD_H / 2 + Math.sin(angle) * 195;
      // Rival Warrior Training Hut at their base (enemy Braves physically enter & queue here)
      const ehSp = this.add.sprite(cx + 36, cy - 28, 'world', `warrior_hut_${tribe}`).setOrigin(0.5, 0.92).setDepth(cy - 28);
      const hpBg = this.add.rectangle(cx + 36, cy - 86, 36, 5, 0x1a120a, 0.85).setVisible(false).setDepth(928);
      const hpFill = this.add.rectangle(cx + 19, cy - 86, 34, 3, 0xe63946, 1).setOrigin(0, 0.5).setVisible(false).setDepth(929);
      const barBg = this.add.rectangle(cx + 36, cy - 78, 30, 4, 0x1a120a, 0.85).setVisible(false).setDepth(920);
      const barFill = this.add.rectangle(cx + 22, cy - 78, 0, 2, 0xf4c95d, 1).setOrigin(0, 0.5).setVisible(false).setDepth(921);
      this.enemyHuts.push({ sprite: ehSp, hpBg, hpFill, barBg, barFill, isTrainingHut: true, occupant: null, trainTimer: 0, x: cx + 36, y: cy - 28, hp: 140, maxHp: 140, tribe });
      for (let i = 0; i < 4; i++) {
        this.spawnEnemy(tribe, cx + Phaser.Math.Between(-65, 65), cy + Phaser.Math.Between(-50, 50), i === 0 ? 'warrior' : 'brave', cx + 36, cy - 10);
      }
    });

    // Auto-cast opening Convert on Worlds 2+ when arriving with 0 followers
    if (cfg.id >= 2 && p.loyalPop === 0 && p.hutsBuilt === 0) {
      this.triggerOpeningConvert();
    }
  }

  private getHutSlotPos(idx: number): { x: number; y: number } {
    const slots = [
      [-82, -26], [82, -26], [-82, 58], [82, 58],
      [-155, 16], [155, 16], [0, -92], [0, 98],
    ];
    const [ox, oy] = slots[idx % slots.length];
    return { x: WORLD_W / 2 + ox, y: WORLD_H / 2 + oy };
  }

  private syncBuiltStructures(): void {
    const p = this.state.planets[this.state.activePlanetId];
    const targetHuts = Math.min(8, p.hutsBuilt);
    while (this.playerHuts.length < targetHuts) {
      const idx = this.playerHuts.length;
      const pos = this.getHutSlotPos(idx);
      const lv = Math.min(3, 1 + Math.floor(idx / 3));
      const sp = this.add.sprite(pos.x, pos.y, 'world', `hut_${lv}_blue`).setOrigin(0.5, 0.92).setDepth(pos.y);
      const hpBg = this.add.rectangle(pos.x, pos.y - 60, 36, 5, 0x1a120a, 0.85).setVisible(false).setDepth(928);
      const hpFill = this.add.rectangle(pos.x - 17, pos.y - 60, 34, 3, 0x52b788, 1).setOrigin(0, 0.5).setVisible(false).setDepth(929);
      const barBg = this.add.rectangle(pos.x, pos.y - 52, 30, 4, 0x1a120a, 0.85).setVisible(false).setDepth(920);
      const barFill = this.add.rectangle(pos.x - 14, pos.y - 52, 0, 2, 0xf4c95d, 1).setOrigin(0, 0.5).setVisible(false).setDepth(921);
      this.playerHuts.push({ x: pos.x, y: pos.y, sprite: sp, hp: 120, maxHp: 120, hpBg, hpFill, occupants: 0, breedTimer: 0, barBg, barFill });
    }

    // Add TrainingBuildingNodes lazily so active occupants/timers are preserved
    const addTraining = (role: TrainingBuildingNode['role'], frame: string, x: number, y: number) => {
      if (this.trainingBuildings.some((tb) => tb.role === role)) return;
      const sp = this.add.sprite(x, y, 'world', frame).setOrigin(0.5, 0.92).setDepth(y);
      const hpBg = this.add.rectangle(x, y - 66, 36, 5, 0x1a120a, 0.85).setVisible(false).setDepth(928);
      const hpFill = this.add.rectangle(x - 17, y - 66, 34, 3, 0x52b788, 1).setOrigin(0, 0.5).setVisible(false).setDepth(929);
      const barBg = this.add.rectangle(x, y - 58, 32, 4, 0x1a120a, 0.85).setVisible(false).setDepth(920);
      const barFill = this.add.rectangle(x - 15, y - 58, 0, 2, 0xf4c95d, 1).setOrigin(0, 0.5).setVisible(false).setDepth(921);
      this.trainingBuildings.push({
        role,
        x,
        y,
        sprite: sp,
        hp: 140,
        maxHp: 140,
        hpBg,
        hpFill,
        occupant: null,
        trainTimer: 0,
        barBg,
        barFill,
      });
    };
    if (p.warriorHutBuilt) addTraining('warrior', 'warrior_hut_blue', WORLD_W / 2 - 135, WORLD_H / 2 - 58);
    if (p.templeBuilt) addTraining('preacher', 'temple_blue', WORLD_W / 2 - 135, WORLD_H / 2 + 68);
    if (p.fireWarriorHutBuilt) addTraining('firewarrior', 'firewarrior_hut_blue', WORLD_W / 2 + 135, WORLD_H / 2 - 58);

    while (this.towers.length < Math.min(4, p.towersBuilt)) {
      const idx = this.towers.length;
      const tx = WORLD_W / 2 + 140 + (idx % 2) * 56;
      const ty = WORLD_H / 2 + 35 + Math.floor(idx / 2) * 68;
      const sp = this.add.sprite(tx, ty, 'world', 'guard_tower_blue').setOrigin(0.5, 0.92).setDepth(ty);
      this.towers.push({ x: tx, y: ty, sprite: sp });
    }
  }

  private syncUnitActors(): void {
    const p = this.state.planets[this.state.activePlanetId];
    const wantBraves = Math.min(10, p.braves);
    // Braves are persistent: only spawn up to wantBraves, never silently delete living Braves!
    while (this.braves.length < wantBraves) {
      this.spawnBrave(WORLD_W / 2 + Phaser.Math.Between(-60, 60), WORLD_H / 2 + Phaser.Math.Between(-45, 45));
    }

    const syncSpec = (kind: SpecialistActor['kind'], want: number) => {
      const existing = this.specialists.filter((s) => s.kind === kind);
      let diff = Math.min(6, want) - existing.length;
      while (diff > 0) {
        this.spawnSpecialist(kind);
        diff--;
      }
      while (diff < 0) {
        const idx = this.specialists.findIndex((s) => s.kind === kind);
        if (idx >= 0) {
          this.specialists[idx].sprite.destroy();
          this.specialists[idx].hpBg.destroy();
          this.specialists[idx].hpFill.destroy();
          this.specialists.splice(idx, 1);
        }
        diff++;
      }
    };
    syncSpec('warrior', p.warriors);
    syncSpec('preacher', p.preachers);
    syncSpec('firewarrior', p.fireWarriors);
  }

  private ensureBuildSite(): void {
    if (this.buildSite || this.braves.length === 0) return;
    const p = this.state.planets[this.state.activePlanetId];

    // Priority: ordered Training Buildings / Guard Towers first, then Huts
    let kind: BuildingBlueprintKind | null = null;
    let pos = { x: WORLD_W / 2, y: WORLD_H / 2 };
    if (p.warriorHutOrdered && !p.warriorHutBuilt) {
      kind = 'warrior_hut';
      pos = { x: WORLD_W / 2 - 135, y: WORLD_H / 2 - 58 };
    } else if (p.templeOrdered && !p.templeBuilt) {
      kind = 'temple';
      pos = { x: WORLD_W / 2 - 135, y: WORLD_H / 2 + 68 };
    } else if (p.fireWarriorHutOrdered && !p.fireWarriorHutBuilt) {
      kind = 'firewarrior_hut';
      pos = { x: WORLD_W / 2 + 135, y: WORLD_H / 2 - 58 };
    } else if (p.towersOrdered > p.towersBuilt && p.towersBuilt < 4) {
      kind = 'guard_tower';
      const idx = p.towersBuilt;
      pos = { x: WORLD_W / 2 + 140 + (idx % 2) * 56, y: WORLD_H / 2 + 35 + Math.floor(idx / 2) * 68 };
    } else if (p.hutsBuilt < getMaxHutsForPop(p)) {
      kind = 'hut';
      pos = this.getHutSlotPos(p.hutsBuilt);
    }

    if (!kind) return;
    const sp = this.add.sprite(pos.x, pos.y, 'world', 'hut_plan_blue').setOrigin(0.5, 0.92).setDepth(pos.y - 1);
    const barBg = this.add.rectangle(pos.x, pos.y - 44, 38, 5, 0x1a120a, 0.85).setDepth(920);
    const barFill = this.add.rectangle(pos.x - 18, pos.y - 44, 0, 3, 0xe9c46a, 1).setOrigin(0, 0.5).setDepth(921);
    this.buildSite = {
      kind,
      x: pos.x,
      y: pos.y,
      sprite: sp,
      barBg,
      barFill,
      woodDelivered: 0,
      woodNeeded: kind === 'hut' ? 3 : 4,
    };
  }

  private spawnWildman(x: number, y: number): void {
    const sp = this.add.sprite(x, y, 'units', 'wildman_eat_00').setOrigin(0.5, 1).setScale(1.0).setDepth(y);
    if (this.anims.exists('wildman_eat')) sp.play('wildman_eat');
    const barBg = this.add.rectangle(x, y - 42, 28, 4, 0x101820, 0.85).setVisible(false).setDepth(930);
    const barFill = this.add.rectangle(x - 13, y - 42, 0, 2, 0x72efdd, 1).setOrigin(0, 0.5).setVisible(false).setDepth(931);
    this.wildmen.push({
      sprite: sp,
      barBg,
      barFill,
      x,
      y,
      targetX: x,
      targetY: y,
      waitTimer: Phaser.Math.FloatBetween(0.5, 2.0),
      convertProgress: 0,
    });
  }

  private spawnBrave(x: number, y: number): void {
    const sp = this.add.sprite(x, y, 'units', 'brave_blue_run_d1_00').setOrigin(0.5, 1).setScale(1.0).setDepth(y);
    if (this.anims.exists('brave_blue_pray_d1')) sp.play('brave_blue_pray_d1');
    const hpBg = this.add.rectangle(x, y - 42, 22, 3, 0x1a120a, 0.85).setVisible(false).setDepth(925);
    const hpFill = this.add.rectangle(x - 10, y - 42, 20, 2, 0x52b788, 1).setOrigin(0, 0.5).setVisible(false).setDepth(926);
    this.braves.push({
      sprite: sp,
      hpBg,
      hpFill,
      x,
      y,
      hp: 35,
      maxHp: 35,
      dir: 1,
      fsm: 'patrol',
      targetTree: null,
      targetHut: null,
      targetTrainBuilding: null,
      targetRepair: null,
      targetEnemy: null,
      timer: 0.4,
      carryingWood: false,
      patrolX: x,
      patrolY: y,
    });
  }

  private spawnSpecialist(kind: SpecialistActor['kind'], spawnX?: number, spawnY?: number): void {
    const x = spawnX ?? WORLD_W / 2 + Phaser.Math.Between(-90, 90);
    const y = spawnY ?? WORLD_H / 2 + Phaser.Math.Between(-60, 60);
    const initAnim =
      kind === 'warrior'
        ? 'warrior_blue_run_d1'
        : kind === 'preacher'
          ? 'preacher_blue_pray'
          : 'firewarrior_blue_fire';
    const sp = this.add.sprite(x, y, 'units').setOrigin(0.5, 1).setScale(1.05).setDepth(y);
    if (this.anims.exists(initAnim)) sp.play(initAnim);

    let towerIdx = -1;
    if (kind === 'firewarrior' && this.towers.length > 0) {
      const taken = new Set(this.specialists.filter((s) => s.garrisonedTowerIdx >= 0).map((s) => s.garrisonedTowerIdx));
      for (let i = 0; i < this.towers.length; i++) {
        if (!taken.has(i)) {
          towerIdx = i;
          break;
        }
      }
    }

    const sx = towerIdx >= 0 ? this.towers[towerIdx].x : x;
    const sy = towerIdx >= 0 ? this.towers[towerIdx].y - 26 : y;
    const maxHp = kind === 'warrior' ? Math.round(140 * getWarriorPowerMult(this.state)) : 55;
    const hpBg = this.add.rectangle(sx, sy - 44, 24, 3, 0x1a120a, 0.85).setVisible(false).setDepth(925);
    const hpFill = this.add.rectangle(sx - 11, sy - 44, 22, 2, 0x52b788, 1).setOrigin(0, 0.5).setVisible(false).setDepth(926);
    this.specialists.push({
      kind,
      sprite: sp,
      hpBg,
      hpFill,
      x: sx,
      y: sy,
      hp: maxHp,
      maxHp,
      dir: 1,
      attackTimer: 0,
      convertProgress: 0,
      garrisonedTowerIdx: towerIdx,
      patrolX: x,
      patrolY: y,
    });
  }

  private killPlayerBrave(b: BraveActor): void {
    const idx = this.braves.indexOf(b);
    if (idx < 0) return;
    if (b.targetHut && b.fsm === 'breeding') b.targetHut.occupants = Math.max(0, b.targetHut.occupants - 1);
    if (b.targetTrainBuilding && b.targetTrainBuilding.occupant === b) b.targetTrainBuilding.occupant = null;
    b.sprite.destroy();
    b.hpBg.destroy();
    b.hpFill.destroy();
    this.braves.splice(idx, 1);
    onPlayerUnitDied(this.state, 'brave');
    this.onHudSync();
  }

  private killPlayerSpecialist(s: SpecialistActor): void {
    const idx = this.specialists.indexOf(s);
    if (idx < 0) return;
    s.sprite.destroy();
    s.hpBg.destroy();
    s.hpFill.destroy();
    this.specialists.splice(idx, 1);
    onPlayerUnitDied(this.state, s.kind);
    this.onHudSync();
  }

  private spawnEnemy(
    tribe: 'red' | 'green' | 'yellow',
    x: number,
    y: number,
    role: 'brave' | 'warrior' = 'brave',
    trainX = x,
    trainY = y
  ): void {
    const shadow = this.add.ellipse(x, y, 18, 8, 0x000000, 0.35).setDepth(y - 2);
    const animKey = role === 'warrior' ? `warrior_${tribe}_run_d1` : `brave_${tribe}_run_d1`;
    const sp = this.add.sprite(x, y, 'units', `${animKey}_00`).setOrigin(0.5, 1).setScale(1.0).setDepth(y);
    if (this.anims.exists(animKey)) sp.play(animKey);
    const hpBg = this.add.rectangle(x, y - 42, 22, 3, 0x1a120a, 0.85).setVisible(false).setDepth(925);
    const hpFill = this.add.rectangle(x - 10, y - 42, 20, 2, 0xe63946, 1).setOrigin(0, 0.5).setVisible(false).setDepth(926);
    const maxHp = role === 'warrior' ? 110 : 35;
    const trainSec = Math.max(2.4, 5.0 - (this.state.activePlanetId - 1) * 0.18);
    this.enemies.push({
      sprite: sp,
      shadow,
      hpBg,
      hpFill,
      tribe,
      role,
      insideTraining: false,
      trainX,
      trainY,
      trainTimer: role === 'brave' ? trainSec : 0,
      x,
      y,
      hp: maxHp,
      maxHp,
      targetX: x,
      targetY: y,
      waitTimer: Phaser.Math.FloatBetween(0.8, 2.4),
      attackTimer: 0,
      dir: 1,
      airZ: 0,
      vz: 0,
      knockVx: 0,
      knockVy: 0,
      dead: false,
    });
  }

  private killEnemy(e: EnemyActor): void {
    if (e.dead) return;
    e.dead = true;
    e.sprite.destroy();
    e.shadow.destroy();
    e.hpBg.destroy();
    e.hpFill.destroy();
    applyCombatResult(this.state, 1, 0, 0);
    this.onHudSync();
  }

  private spawnConvertCircle(x: number, y: number): void {
    const radius = 98;
    const ring = this.add.circle(x, y, radius, 0x72efdd, 0.12).setStrokeStyle(2.5, 0x72efdd, 0.9).setDepth(8);
    const sparkles: Phaser.GameObjects.Arc[] = [];
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const sp = this.add.circle(x + Math.cos(ang) * radius, y + Math.sin(ang) * radius, 3.2, 0xfefae0, 0.95).setDepth(900);
      sparkles.push(sp);
    }
    this.convertCircles.push({ x, y, radius, remaining: 4.0, ring, sparkles, phase: 0 });
  }

  private fireProjectile(sx: number, sy: number, tx: number, ty: number, vfxKey: string, onHit: () => void): void {
    const bolt = this.add.sprite(sx, sy, 'world', vfxKey).setScale(0.7).setDepth(920);
    const dist = Phaser.Math.Distance.Between(sx, sy, tx, ty);
    const dur = Phaser.Math.Clamp(dist * 1.35, 130, 480);
    this.tweens.add({
      targets: bolt,
      x: tx,
      y: ty,
      angle: 360,
      duration: dur,
      ease: 'Quad.easeOut',
      onComplete: () => {
        bolt.destroy();
        onHit();
      },
    });
  }

  private isNearGuardhouse(x: number, y: number): boolean {
    return this.towers.some((tw) => Phaser.Math.Distance.Between(x, y, tw.x, tw.y) <= 46);
  }

  private detonateBlast(bx: number, by: number): void {
    const radius = 92 * (1 + this.state.metaLevels.tempestForce * 0.15);
    const shock = this.add.circle(bx, by, 14, 0xff9f1c, 0.35).setStrokeStyle(3, 0xfff3b0, 0.95).setDepth(910);
    this.tweens.add({ targets: shock, radius, alpha: 0, duration: 340, onComplete: () => shock.destroy() });

    let launched = 0;
    const powerMult = getSpellPowerMult(this.state);
    // AoE falloff: max damage = 35 (Brave HP) at dead center; Warriors (110 HP) survive direct Blast!
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dist = Phaser.Math.Distance.Between(bx, by, e.x, e.y);
      if (dist <= radius) {
        const falloff = Math.max(0.2, 1 - dist / radius);
        const dmg = Math.round(35 * falloff * powerMult);
        e.hp -= dmg;
        const ang = Math.atan2(e.y - by, e.x - bx);
        e.vz = 230 * (0.55 + 0.45 * falloff);
        e.knockVx = Math.cos(ang) * 140 * falloff;
        e.knockVy = Math.sin(ang) * 105 * falloff;
        launched += 1;
      }
    }

    // Spells also hurt hostile Rival Shamans!
    const p = this.state.planets[this.state.activePlanetId];
    const cfg = getPlanetConfig(p.planetId);
    for (const rs of this.rivalShamans) {
      if (rs.respawnTimer > 0) continue;
      if (p.allied && cfg.allianceTribe === rs.tribe) continue;
      const dist = Phaser.Math.Distance.Between(bx, by, rs.x, rs.y);
      if (dist <= radius) {
        const falloff = Math.max(0.25, 1 - dist / radius);
        const dmg = Math.round(35 * falloff * powerMult);
        this.damageRivalShaman(rs, dmg);
        launched += 1;
      }
    }

    let hutHits = 0;
    const siegeMult = 1 + this.state.metaLevels.cataclysmMastery * 0.25;
    for (let i = this.enemyHuts.length - 1; i >= 0; i--) {
      const eh = this.enemyHuts[i];
      if (Phaser.Math.Distance.Between(bx, by, eh.x, eh.y) <= radius) {
        eh.hp -= 24 * powerMult * siegeMult;
        this.updateEnemyHutBar(eh);
        if (eh.hp <= 0) {
          this.destroyEnemyHut(eh, i);
          hutHits += 1;
          this.spawnFloatingText(eh.x, eh.y, '-1 Enemy Hut', '#ffb703');
        }
      }
    }

    if (hutHits > 0) applyCombatResult(this.state, 0, hutHits, 0);
    if (launched > 0) this.spawnFloatingText(bx, by, `Blast!`, '#ff9f1c');
    this.onHudSync();
  }

  private spawnFloatingText(wx: number, wy: number, text: string, color = '#f4e6c4'): void {
    const t = this.add.text(wx, wy - 20, text, {
      fontFamily: 'Cinzel, Georgia, serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color,
      stroke: '#1b1209',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(980);
    this.tweens.add({
      targets: t,
      y: wy - 62,
      alpha: 0,
      duration: 950,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private destroyEnemyHut(eh: EnemyHutNode, index: number): void {
    if (eh.occupant) {
      eh.occupant.insideTraining = false;
      eh.occupant.sprite.setVisible(true);
      eh.occupant.shadow.setVisible(true);
      eh.occupant = null;
    }
    eh.sprite.destroy();
    eh.hpBg.destroy();
    eh.hpFill.destroy();
    eh.barBg.destroy();
    eh.barFill.destroy();
    this.enemyHuts.splice(index, 1);
  }

  private updateEnemyHutBar(eh: EnemyHutNode): void {
    const damaged = eh.hp < eh.maxHp && eh.hp > 0;
    eh.hpBg.setVisible(damaged);
    eh.hpFill.setVisible(damaged).setSize(34 * Math.max(0, eh.hp / eh.maxHp), 3);
  }

  private damagePlayerShaman(dmg: number): void {
    if (this.shamanRespawnTimer > 0 || (this.state.activeBuffs.shield ?? 0) > 0) return;
    this.shamanHp = Math.max(0, this.shamanHp - dmg);
    if (this.shamanHp <= 0) {
      const res = onShamanDied(this.state);
      this.shamanRespawnTimer = res.respawnSec;
      this.shaman.setVisible(false);
      this.shamanLabel.setVisible(false);
      this.shamanHpBg.setVisible(false);
      this.shamanHpFill.setVisible(false);
      this.rangeCircle.setVisible(false);
      this.respawnCircle.setPosition(WORLD_W / 2, WORLD_H / 2).setVisible(true);
      this.respawnText.setPosition(WORLD_W / 2, WORLD_H / 2 - 54).setVisible(true);
      this.onToast(`Shaman slain! -${res.manaLost} Mana · Reincarnating...`);
      this.onHudSync();
    }
  }

  private handleCastAt(wx: number, wy: number): void {
    if (this.shamanRespawnTimer > 0) {
      this.onToast(`Reincarnating (${Math.ceil(this.shamanRespawnTimer)}s)...`);
      return;
    }
    const spell = SPELLS.find((s) => s.id === this.state.selectedSpellId);
    if (!spell) return;
    const dist = Phaser.Math.Distance.Between(this.shaman.x, this.shaman.y, wx, wy);
    const rangeMult = this.isNearGuardhouse(this.shaman.x, this.shaman.y) ? 1.45 : 1;
    const res = castSpell(this.state, spell.id, dist, rangeMult);
    if (!res.ok) {
      this.onToast(res.reason ?? 'Cannot cast');
      if (res.reason?.includes('range')) {
        this.rangeCircle.setStrokeStyle(3, 0xe63946, 0.95);
        this.time.delayedCall(260, () => this.rangeCircle.setStrokeStyle(1.5, 0xc89b4b, 0.55));
      }
      return;
    }

    if (dist > 6) this.shamanDir = dir8FromVec(wx - this.shaman.x, wy - this.shaman.y);
    this.castAnimTimer = 0.65;
    const castKey = `shaman_blue_cast_d${this.shamanDir}`;
    if (this.anims.exists(castKey)) this.shaman.play(castKey);
    this.playSfx(spell.sound, 0.35);

    if (spell.id === 'convert') {
      this.spawnConvertCircle(wx, wy);
    } else if (spell.id === 'blast') {
      this.fireProjectile(this.shaman.x, this.shaman.y - 26, wx, wy, 'vfx_blast', () => this.detonateBlast(wx, wy));
    } else if (spell.kind === 'teleport') {
      this.shaman.setPosition(Phaser.Math.Clamp(wx, 120, WORLD_W - 120), Phaser.Math.Clamp(wy, 120, WORLD_H - 120));
      this.spawnFloatingText(wx, wy, 'Teleport', '#90e0ef');
    } else {
      const vfx = this.add.sprite(wx, wy, 'world', spell.vfx).setScale(0.6).setDepth(900);
      this.tweens.add({ targets: vfx, scale: 2.2, alpha: 0, duration: 550, onComplete: () => vfx.destroy() });
      // Damage spells also hurt hostile Rival Shamans inside spell radius
      if (spell.kind === 'damage' || spell.kind === 'terrain' || spell.kind === 'summon') {
        const p = this.state.planets[this.state.activePlanetId];
        const cfg = getPlanetConfig(p.planetId);
        const dmg = Math.round((spell.manaCost >= 300 ? 95 : 48) * getSpellPowerMult(this.state));
        for (const rs of this.rivalShamans) {
          if (rs.respawnTimer > 0 || (p.allied && cfg.allianceTribe === rs.tribe)) continue;
          if (Phaser.Math.Distance.Between(wx, wy, rs.x, rs.y) <= spell.radius) {
            this.damageRivalShaman(rs, dmg);
          }
        }
      }
      if (res.converted && res.converted > 0) this.spawnFloatingText(wx, wy, `+${res.converted} Followers`, '#74c69d');
      else if (res.destroyed && res.destroyed > 0) this.spawnFloatingText(wx, wy, `-${res.destroyed} Enemy Hut`, '#ffb703');
      else if (spell.kind === 'buff') this.spawnFloatingText(wx, wy, `${spell.name} Active`, '#90e0ef');
    }

    this.onHudSync();
  }

  private playBraveAnim(b: BraveActor, verb: 'run' | 'work' | 'punch' | 'pray'): void {
    const key = `brave_blue_${verb}_d${b.dir}`;
    if (this.anims.exists(key) && b.sprite.anims.currentAnim?.key !== key) {
      b.sprite.play(key);
    }
  }

  private updateConvertCircles(dt: number): void {
    const convSpeed = getSpellPowerMult(this.state);
    for (let i = this.convertCircles.length - 1; i >= 0; i--) {
      const cc = this.convertCircles[i];
      cc.remaining -= dt;
      cc.phase += dt * 3.2;
      cc.ring.setAlpha(Math.min(0.9, cc.remaining / 0.6));
      cc.sparkles.forEach((sp, idx) => {
        const ang = cc.phase + (idx / cc.sparkles.length) * Math.PI * 2;
        const r = cc.radius * (0.85 + 0.14 * Math.sin(cc.phase * 2 + idx));
        sp.setPosition(cc.x + Math.cos(ang) * r, cc.y + Math.sin(ang) * r);
        sp.setAlpha(0.45 + 0.5 * Math.abs(Math.sin(cc.phase * 3 + idx)));
      });
      if (cc.remaining <= 0) {
        cc.ring.destroy();
        cc.sparkles.forEach((sp) => sp.destroy());
        this.convertCircles.splice(i, 1);
      }
    }

    for (let i = this.wildmen.length - 1; i >= 0; i--) {
      const w = this.wildmen[i];
      const inside = this.convertCircles.some((cc) => Phaser.Math.Distance.Between(w.x, w.y, cc.x, cc.y) <= cc.radius);

      if (inside) {
        w.convertProgress += dt * convSpeed;
        w.barBg.setVisible(true).setPosition(w.x, w.y - 40);
        w.barFill.setVisible(true).setPosition(w.x - 13, w.y - 40).setSize(Math.min(26, (w.convertProgress / 2.0) * 26), 2);
        if (w.sprite.anims.currentAnim?.key !== 'wildman_eat') w.sprite.play('wildman_eat');

        if (w.convertProgress >= 2.0) {
          w.sprite.destroy();
          w.barBg.destroy();
          w.barFill.destroy();
          this.wildmen.splice(i, 1);
          if (onWildmanConverted(this.state)) {
            this.spawnBrave(w.x, w.y);
            this.playSfx('birth', 0.35);
            this.spawnFloatingText(w.x, w.y, '+1 Brave', '#74c69d');
            this.ensureBuildSite();
            this.onHudSync();
          }
          continue;
        }
      } else {
        w.convertProgress = Math.max(0, w.convertProgress - dt * 0.5);
        w.barBg.setVisible(w.convertProgress > 0.05).setPosition(w.x, w.y - 40);
        w.barFill.setVisible(w.convertProgress > 0.05).setPosition(w.x - 13, w.y - 40).setSize((w.convertProgress / 2.0) * 26, 2);

        const dist = Phaser.Math.Distance.Between(w.x, w.y, w.targetX, w.targetY);
        if (dist < 6) {
          w.waitTimer -= dt;
          if (w.sprite.anims.currentAnim?.key !== 'wildman_eat') w.sprite.play('wildman_eat');
          if (w.waitTimer <= 0) {
            w.targetX = WORLD_W / 2 + Phaser.Math.Between(-145, 145);
            w.targetY = WORLD_H / 2 + Phaser.Math.Between(-105, 105);
            w.waitTimer = Phaser.Math.FloatBetween(1.4, 3.0);
          }
        } else {
          const dx = (w.targetX - w.x) / dist;
          const dy = (w.targetY - w.y) / dist;
          w.x += dx * 32 * dt;
          w.y += dy * 32 * dt;
          w.sprite.setFlipX(dx < 0);
          if (w.sprite.anims.currentAnim?.key !== 'wildman_run') w.sprite.play('wildman_run');
        }
      }
      w.sprite.setPosition(w.x, w.y).setDepth(w.y);
    }

    if (this.wildmen.length < 3 && Math.random() < 0.06 * dt) {
      this.spawnWildman(WORLD_W / 2 + Phaser.Math.Between(-170, 170), WORLD_H / 2 + Phaser.Math.Between(-110, 110));
    }
  }

  /** Proper Brave State Machine: seek_tree -> chop_tree -> carry_wood -> build_site | enter_hut -> breeding | fight_enemy | patrol */
  private updateBravesAndHuts(dt: number): void {
    const timberMult = getTimberSpeedMult(this.state);
    const p = this.state.planets[this.state.activePlanetId];
    const popCap = getPopCap(this.state, p.planetId);

    // Slow tree regrowth (75s)
    for (const t of this.trees) {
      if (t.chopped) {
        t.regrowTimer -= dt;
        if (t.regrowTimer <= 0) {
          t.chopped = false;
          t.sprite.setFrame('tree_full');
        }
      }
    }

    // Hut breeding timers (3x slower: 20s per pair inside a Hut)
    for (const h of this.playerHuts) {
      const hutDamaged = h.hp < h.maxHp && h.hp > 0;
      h.hpBg.setVisible(hutDamaged);
      h.hpFill.setVisible(hutDamaged).setSize(34 * Math.max(0, h.hp / h.maxHp), 3);

      if (h.occupants > 0 && p.loyalPop >= popCap) {
        // Release breeding Braves immediately if pop cap was reached so they never disappear!
        h.breedTimer = 0;
        h.barBg.setVisible(false);
        h.barFill.setVisible(false);
        for (const b of this.braves) {
          if (b.fsm === 'breeding' && b.targetHut === h) {
            b.fsm = 'patrol';
            b.targetHut = null;
            b.sprite.setVisible(true);
            b.x = h.x + Phaser.Math.Between(-18, 18);
            b.y = h.y + 18;
          }
        }
        h.occupants = 0;
      } else if (h.occupants >= 2 && p.loyalPop < popCap) {
        h.breedTimer += dt;
        h.barBg.setVisible(true);
        h.barFill.setVisible(true).setSize(Math.min(28, (h.breedTimer / 20.0) * 28), 2);
        if (h.breedTimer >= 20.0) {
          h.breedTimer = 0;
          h.barBg.setVisible(false);
          h.barFill.setVisible(false);
          if (onBraveBred(this.state)) {
            this.spawnBrave(h.x, h.y + 18);
            this.playSfx('birth', 0.3);
            this.spawnFloatingText(h.x, h.y - 26, '+1 Brave Born', '#f4c95d');
            this.onHudSync();
          }
          // Release breeding pair back to patrol
          for (const b of this.braves) {
            if (b.fsm === 'breeding' && b.targetHut === h) {
              b.fsm = 'patrol';
              b.targetHut = null;
              b.sprite.setVisible(true);
              b.x = h.x + Phaser.Math.Between(-16, 16);
              b.y = h.y + 16;
            }
          }
          h.occupants = 0;
        }
      } else {
        h.barBg.setVisible(false);
        h.barFill.setVisible(false);
      }
    }

    // Training Building physical timers (Braves are INSIDE while training, pop out as specialist when done!)
    for (const tb of this.trainingBuildings) {
      const tbDamaged = tb.hp < tb.maxHp && tb.hp > 0;
      tb.hpBg.setVisible(tbDamaged);
      tb.hpFill.setVisible(tbDamaged).setSize(34 * Math.max(0, tb.hp / tb.maxHp), 3);

      if (tb.occupant) {
        tb.trainTimer -= dt;
        tb.barBg.setVisible(true);
        tb.barFill.setVisible(true).setSize(30 * Math.min(1, (5.0 - tb.trainTimer) / 5.0), 2);
        if (tb.trainTimer <= 0) {
          const b = tb.occupant;
          tb.occupant = null;
          tb.barBg.setVisible(false);
          tb.barFill.setVisible(false);
          const idx = this.braves.indexOf(b);
          if (idx >= 0) this.braves.splice(idx, 1);
          b.sprite.destroy();
          b.hpBg.destroy();
          b.hpFill.destroy();
          if (onBraveTrained(this.state, tb.role)) {
            this.spawnSpecialist(tb.role, tb.x, tb.y + 18);
            this.playSfx('birth', 0.35);
            const title = tb.role === 'warrior' ? '+1 Warrior' : tb.role === 'preacher' ? '+1 Preacher' : '+1 Fire Warrior';
            this.spawnFloatingText(tb.x, tb.y - 22, title, '#72efdd');
            this.onHudSync();
          }
        }
      } else {
        tb.barBg.setVisible(false);
        tb.barFill.setVisible(false);
      }
    }

    this.ensureBuildSite();

    for (const b of this.braves) {
      if (b.fsm === 'breeding' || b.fsm === 'training') continue;

      if (b.fsm === 'patrol') {
        // Priority 1: Breed in an open Hut whenever >= 1 Hut exists and pop < cap!
        if (p.hutsBuilt >= 1 && this.braves.length >= 2 && p.loyalPop < popCap) {
          const openHut = this.playerHuts.find((h) => h.occupants < 2);
          const breedingBraves = this.braves.filter((x) => x.fsm === 'enter_hut' || x.fsm === 'breeding').length;
          if (openHut && breedingBraves < 2) {
            b.targetHut = openHut;
            b.fsm = 'enter_hut';
            continue;
          }
        }

        // Priority 2: Build active blueprint OR repair damaged player building
        const damagedBuilding = this.findDamagedPlayerBuilding();
        if (damagedBuilding) {
          const tree = this.findNearestTree(b.x, b.y);
          if (tree) {
            b.targetRepair = damagedBuilding;
            b.targetTree = tree;
            b.fsm = 'seek_tree';
            continue;
          }
        }
        if (this.buildSite) {
          const tree = this.findNearestTree(b.x, b.y);
          if (tree) {
            b.targetTree = tree;
            b.fsm = 'seek_tree';
            continue;
          }
        }

        // Priority 3: Physical training inside a built Training Building (or queue outside)
        const neededTb = this.findTrainingBuildingNeedingBrave();
        if (neededTb) {
          b.targetTrainBuilding = neededTb;
          b.fsm = 'go_train';
          continue;
        }

        // Priority 4: Defend buildings / fight nearby enemies, otherwise idle & wander
        const nearbyEnemy = this.findNearestEnemy(b.x, b.y, 160);
        if (nearbyEnemy) {
          b.targetEnemy = nearbyEnemy;
          b.fsm = 'fight_enemy';
          continue;
        }

        const d = Phaser.Math.Distance.Between(b.x, b.y, b.patrolX, b.patrolY);
        if (d > 6) {
          const dx = (b.patrolX - b.x) / d;
          const dy = (b.patrolY - b.y) / d;
          b.x += dx * 42 * dt;
          b.y += dy * 42 * dt;
          b.dir = dir8FromVec(dx, dy);
          this.playBraveAnim(b, 'run');
        } else {
          this.playBraveAnim(b, 'pray');
          b.timer -= dt;
          if (b.timer <= 0) {
            b.patrolX = WORLD_W / 2 + Phaser.Math.Between(-120, 120);
            b.patrolY = WORLD_H / 2 + Phaser.Math.Between(-80, 80);
            b.timer = Phaser.Math.FloatBetween(1.4, 3.2);
          }
        }
      } else if (b.fsm === 'go_train') {
        const tb = b.targetTrainBuilding;
        if (!tb) {
          b.fsm = 'patrol';
        } else {
          const queueSlotX = tb.x - 12 + (this.braves.indexOf(b) % 3) * 14;
          const queueSlotY = tb.y + 20;
          const d = Phaser.Math.Distance.Between(b.x, b.y, queueSlotX, queueSlotY);
          if (d <= 14) {
            if (!tb.occupant) {
              // Step physically inside the training building (NO external training animation!)
              tb.occupant = b;
              tb.trainTimer = 5.0;
              b.fsm = 'training';
              b.sprite.setVisible(false);
            } else {
              // Queue patiently outside the doorway
              b.dir = dir8FromVec(tb.x - b.x, tb.y - b.y);
              this.playBraveAnim(b, 'pray');
            }
          } else {
            const dx = (queueSlotX - b.x) / d;
            const dy = (queueSlotY - b.y) / d;
            b.x += dx * 46 * dt;
            b.y += dy * 46 * dt;
            b.dir = dir8FromVec(dx, dy);
            this.playBraveAnim(b, 'run');
          }
        }
      } else if (b.fsm === 'enter_hut') {
        const h = b.targetHut;
        if (!h || h.occupants >= 2) {
          b.targetHut = null;
          b.fsm = 'patrol';
        } else {
          const d = Phaser.Math.Distance.Between(b.x, b.y, h.x, h.y + 8);
          if (d <= 14) {
            h.occupants += 1;
            b.fsm = 'breeding';
            b.sprite.setVisible(false);
            b.hpBg.setVisible(false);
            b.hpFill.setVisible(false);
          } else {
            const dx = (h.x - b.x) / d;
            const dy = (h.y + 8 - b.y) / d;
            b.x += dx * 56 * dt;
            b.y += dy * 56 * dt;
            b.dir = dir8FromVec(dx, dy);
            this.playBraveAnim(b, 'run');
          }
        }
      } else if (b.fsm === 'seek_tree') {
        const t = b.targetTree;
        if (!t || t.chopped || (!this.buildSite && !b.targetRepair)) {
          b.targetTree = null;
          b.targetRepair = null;
          b.fsm = 'patrol';
        } else {
          const d = Phaser.Math.Distance.Between(b.x, b.y, t.x, t.y + 6);
          if (d <= 16) {
            b.fsm = 'chop_tree';
            b.dir = dir8FromVec(t.x - b.x, t.y - b.y);
            b.timer = 1.6 / timberMult;
            this.playBraveAnim(b, 'work');
          } else {
            const dx = (t.x - b.x) / d;
            const dy = (t.y + 6 - b.y) / d;
            b.x += dx * 44 * dt;
            b.y += dy * 44 * dt;
            b.dir = dir8FromVec(dx, dy);
            this.playBraveAnim(b, 'run');
          }
        }
      } else if (b.fsm === 'chop_tree') {
        this.playBraveAnim(b, 'work');
        b.timer -= dt;
        if (b.timer <= 0) {
          if (b.targetTree && !b.targetTree.chopped) {
            b.targetTree.chopped = true;
            b.targetTree.regrowTimer = getTreeRegrowSec(this.state);
            b.targetTree.sprite.setFrame('tree_stump');
          }
          b.carryingWood = true;
          b.targetTree = null;
          b.fsm = b.targetRepair || this.buildSite ? 'carry_wood' : 'patrol';
        }
      } else if (b.fsm === 'carry_wood') {
        const repairTarget = b.targetRepair && b.targetRepair.hp < b.targetRepair.maxHp ? b.targetRepair : null;
        if (repairTarget) {
          const d = Phaser.Math.Distance.Between(b.x, b.y, repairTarget.x, repairTarget.y + 12);
          if (d <= 22) {
            b.fsm = 'repair_building';
            b.dir = dir8FromVec(repairTarget.x - b.x, repairTarget.y - b.y);
            b.timer = 1.1 / timberMult;
            this.playBraveAnim(b, 'work');
          } else {
            const dx = (repairTarget.x - b.x) / d;
            const dy = (repairTarget.y + 12 - b.y) / d;
            b.x += dx * 42 * dt;
            b.y += dy * 42 * dt;
            b.dir = dir8FromVec(dx, dy);
            this.playBraveAnim(b, 'run');
          }
        } else if (!this.buildSite) {
          b.carryingWood = false;
          b.targetRepair = null;
          b.fsm = 'patrol';
        } else {
          const d = Phaser.Math.Distance.Between(b.x, b.y, this.buildSite.x, this.buildSite.y + 10);
          if (d <= 20) {
            b.fsm = 'build_site';
            b.dir = dir8FromVec(this.buildSite.x - b.x, this.buildSite.y - b.y);
            b.timer = 0.9 / timberMult;
            this.playBraveAnim(b, 'work');
          } else {
            const dx = (this.buildSite.x - b.x) / d;
            const dy = (this.buildSite.y + 10 - b.y) / d;
            b.x += dx * 42 * dt;
            b.y += dy * 42 * dt;
            b.dir = dir8FromVec(dx, dy);
            this.playBraveAnim(b, 'run');
          }
        }
      } else if (b.fsm === 'repair_building') {
        this.playBraveAnim(b, 'work');
        b.timer -= dt;
        if (b.timer <= 0) {
          if (b.targetRepair) {
            b.targetRepair.hp = Math.min(b.targetRepair.maxHp, b.targetRepair.hp + 40);
            this.spawnFloatingText(b.targetRepair.x, b.targetRepair.y - 24, '+40 Repaired', '#74c69d');
          }
          b.carryingWood = false;
          b.targetRepair = null;
          b.fsm = 'patrol';
        }
      } else if (b.fsm === 'build_site') {
        this.playBraveAnim(b, 'work');
        b.timer -= dt;
        if (b.timer <= 0) {
          b.carryingWood = false;
          b.fsm = 'patrol';
          if (this.buildSite) {
            this.buildSite.woodDelivered += 1;
            const frac = Math.min(1, this.buildSite.woodDelivered / this.buildSite.woodNeeded);
            this.buildSite.barFill.setSize(36 * frac, 3);
            if (this.buildSite.woodDelivered === 1) this.buildSite.sprite.setFrame('hut_frame_blue');
            if (this.buildSite.woodDelivered >= this.buildSite.woodNeeded) {
              const finishedKind = this.buildSite.kind;
              const bx = this.buildSite.x;
              const by = this.buildSite.y;
              this.buildSite.sprite.destroy();
              this.buildSite.barBg.destroy();
              this.buildSite.barFill.destroy();
              this.buildSite = null;
              onBuildingConstructed(this.state, finishedKind);
              this.syncBuiltStructures();
              this.syncUnitActors();
              this.playSfx('birth', 0.4);
              const label =
                finishedKind === 'hut'
                  ? 'Hut Built!'
                  : finishedKind === 'warrior_hut'
                    ? 'Warrior Hut Built!'
                    : finishedKind === 'temple'
                      ? 'Temple Built!'
                      : finishedKind === 'firewarrior_hut'
                        ? 'Fire Warrior Hut Built!'
                        : 'Guard Tower Built!';
              this.spawnFloatingText(bx, by - 22, label, '#f4c95d');
              this.onHudSync();
            }
          }
        }
      } else if (b.fsm === 'fight_enemy') {
        const e = b.targetEnemy;
        if (!e || e.dead) {
          b.targetEnemy = null;
          b.fsm = 'patrol';
        } else {
          const d = Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y);
          if (d <= 24) {
            b.dir = dir8FromVec(e.x - b.x, e.y - b.y);
            this.playBraveAnim(b, 'punch');
            b.timer -= dt;
            if (b.timer <= 0) {
              b.timer = 1.15;
              e.hp -= 4;
              this.playSfx('punch', 0.2);
              if (e.hp <= 0) this.killEnemy(e);
            }
          } else {
            const dx = (e.x - b.x) / d;
            const dy = (e.y - b.y) / d;
            b.x += dx * 44 * dt;
            b.y += dy * 44 * dt;
            b.dir = dir8FromVec(dx, dy);
            this.playBraveAnim(b, 'run');
          }
        }
      }

      b.sprite.setPosition(b.x, b.y).setDepth(b.y);
      const showBraveHp = b.sprite.visible && b.hp < b.maxHp;
      b.hpBg.setVisible(showBraveHp).setPosition(b.x, b.y - 42);
      b.hpFill.setVisible(showBraveHp).setPosition(b.x - 10, b.y - 42).setSize(20 * Math.max(0, b.hp / b.maxHp), 2);
    }
  }

  /** Strict role behaviors: Warriors ONLY fight (8-dir, idle when no target), Preachers ONLY convert enemies, Fire Warriors shoot fireballs / man Guard Towers. */
  private updateSpecialists(dt: number): void {
    const bloodlustMult = (this.state.activeBuffs.bloodlust ?? 0) > 0 ? 1.8 : 1;
    const warriorAtk = Math.round(14 * getWarriorPowerMult(this.state));
    const preacherSpeed = getPreacherSpeedMult(this.state);
    const towerRange = getTowerRangePx(this.state);
    const fireDmg = Math.round(18 * (1 + this.state.metaLevels.godfireApex * 0.2));
    const siegeMult = 1 + this.state.metaLevels.cataclysmMastery * 0.25;

    for (const s of this.specialists) {
      s.attackTimer = Math.max(0, s.attackTimer - dt * bloodlustMult);

      if (s.kind === 'warrior') {
        // Smart local-zone Warrior AI: finish all enemies/huts in current zone (175px) before marching across the map!
        const ZONE_R = 175;
        const localEnemy = this.findNearestEnemy(s.x, s.y, ZONE_R);
        const localHut = this.findNearestEnemyHut(s.x, s.y, ZONE_R);
        const localShaman = this.findNearestHostileShaman(s.x, s.y, ZONE_R);

        // Pick closest local threat first; only if local zone is clear, march to nearest enemy hut (or fallback enemy)
        const targetEnemy = localEnemy ?? (!localHut && !localShaman && this.enemyHuts.length === 0 ? this.findNearestEnemy(s.x, s.y, 1400) : null);
        const targetHut = !targetEnemy ? (localHut ?? (!localShaman ? this.findNearestEnemyHut(s.x, s.y, 1400) : null)) : null;
        const targetShaman = !targetEnemy && !targetHut ? (localShaman ?? this.findNearestHostileShaman(s.x, s.y, 1400)) : null;

        if (targetEnemy) {
          const d = Phaser.Math.Distance.Between(s.x, s.y, targetEnemy.x, targetEnemy.y);
          if (d <= 28) {
            s.dir = dir8FromVec(targetEnemy.x - s.x, targetEnemy.y - s.y);
            const pk = `warrior_blue_punch_d${s.dir}`;
            if (this.anims.exists(pk) && s.sprite.anims.currentAnim?.key !== pk) s.sprite.play(pk);
            if (s.attackTimer <= 0) {
              s.attackTimer = 1.05;
              targetEnemy.hp -= warriorAtk;
              this.playSfx('punch', 0.22);
              if (targetEnemy.hp <= 0) this.killEnemy(targetEnemy);
            }
          } else {
            const dx = (targetEnemy.x - s.x) / d;
            const dy = (targetEnemy.y - s.y) / d;
            s.x += dx * 48 * dt;
            s.y += dy * 48 * dt;
            s.dir = dir8FromVec(dx, dy);
            const rk = `warrior_blue_run_d${s.dir}`;
            if (this.anims.exists(rk) && s.sprite.anims.currentAnim?.key !== rk) s.sprite.play(rk);
          }
        } else if (targetHut) {
          const d = Phaser.Math.Distance.Between(s.x, s.y, targetHut.x, targetHut.y);
          if (d <= 42) {
            s.dir = dir8FromVec(targetHut.x - s.x, targetHut.y - s.y);
            const pk = `warrior_blue_punch_d${s.dir}`;
            if (this.anims.exists(pk) && s.sprite.anims.currentAnim?.key !== pk) s.sprite.play(pk);
            if (s.attackTimer <= 0) {
              s.attackTimer = 1.1;
              targetHut.hp -= Math.round(14 * siegeMult);
              this.updateEnemyHutBar(targetHut);
              this.playSfx('punch', 0.22);
              if (targetHut.hp <= 0) {
                const hIdx = this.enemyHuts.indexOf(targetHut);
                if (hIdx >= 0) this.destroyEnemyHut(targetHut, hIdx);
                applyCombatResult(this.state, 0, 1, 0);
                this.spawnFloatingText(targetHut.x, targetHut.y, '-1 Enemy Hut', '#ffb703');
                this.onHudSync();
              }
            }
          } else {
            const dx = (targetHut.x - s.x) / d;
            const dy = (targetHut.y - s.y) / d;
            s.x += dx * 46 * dt;
            s.y += dy * 46 * dt;
            s.dir = dir8FromVec(dx, dy);
            const rk = `warrior_blue_run_d${s.dir}`;
            if (this.anims.exists(rk) && s.sprite.anims.currentAnim?.key !== rk) s.sprite.play(rk);
          }
        } else if (targetShaman) {
          const d = Phaser.Math.Distance.Between(s.x, s.y, targetShaman.x, targetShaman.y);
          if (d <= 30) {
            s.dir = dir8FromVec(targetShaman.x - s.x, targetShaman.y - s.y);
            const pk = `warrior_blue_punch_d${s.dir}`;
            if (this.anims.exists(pk) && s.sprite.anims.currentAnim?.key !== pk) s.sprite.play(pk);
            if (s.attackTimer <= 0) {
              s.attackTimer = 1.05;
              this.damageRivalShaman(targetShaman, warriorAtk);
              this.playSfx('punch', 0.22);
            }
          } else {
            const dx = (targetShaman.x - s.x) / d;
            const dy = (targetShaman.y - s.y) / d;
            s.x += dx * 48 * dt;
            s.y += dy * 48 * dt;
            s.dir = dir8FromVec(dx, dy);
            const rk = `warrior_blue_run_d${s.dir}`;
            if (this.anims.exists(rk) && s.sprite.anims.currentAnim?.key !== rk) s.sprite.play(rk);
          }
        } else {
          // No targets left: patrol calmly and stand idle (NEVER slash at thin air!)
          const d = Phaser.Math.Distance.Between(s.x, s.y, s.patrolX, s.patrolY);
          if (d > 8) {
            const dx = (s.patrolX - s.x) / d;
            const dy = (s.patrolY - s.y) / d;
            s.x += dx * 36 * dt;
            s.y += dy * 36 * dt;
            s.dir = dir8FromVec(dx, dy);
            const rk = `warrior_blue_run_d${s.dir}`;
            if (this.anims.exists(rk) && s.sprite.anims.currentAnim?.key !== rk) s.sprite.play(rk);
          } else {
            if (this.anims.exists('warrior_blue_idle') && s.sprite.anims.currentAnim?.key !== 'warrior_blue_idle') {
              s.sprite.play('warrior_blue_idle');
            }
            if (Math.random() < 0.25 * dt) {
              s.patrolX = WORLD_W / 2 + Phaser.Math.Between(-130, 130);
              s.patrolY = WORLD_H / 2 + Phaser.Math.Between(-90, 90);
            }
          }
        }
      } else if (s.kind === 'preacher') {
        const enemy = this.findNearestEnemy(s.x, s.y, 900);
        const sermonRange = this.isNearGuardhouse(s.x, s.y) ? 132 : 82;
        if (enemy) {
          const d = Phaser.Math.Distance.Between(s.x, s.y, enemy.x, enemy.y);
          if (d <= sermonRange) {
            s.convertProgress += dt * preacherSpeed;
            if (s.convertProgress >= 3.8) {
              s.convertProgress = 0;
              const ex = enemy.x;
              const ey = enemy.y;
              enemy.dead = true;
              enemy.sprite.destroy();
              enemy.shadow.destroy();
              enemy.hpBg.destroy();
              enemy.hpFill.destroy();
              onEnemyConvertedByPreacher(this.state);
              this.spawnBrave(ex, ey);
              this.playSfx('convert', 0.3);
              this.spawnFloatingText(ex, ey, 'Converted!', '#72efdd');
              this.onHudSync();
            }
          } else {
            const dx = (enemy.x - s.x) / d;
            const dy = (enemy.y - s.y) / d;
            s.x += dx * 40 * dt;
            s.y += dy * 40 * dt;
            s.sprite.setFlipX(dx < 0);
          }
        }
      } else if (s.kind === 'firewarrior') {
        const range = s.garrisonedTowerIdx >= 0 ? towerRange : 210;
        const enemy = this.findNearestEnemy(s.x, s.y, range);
        const rivalShaman = !enemy ? this.findNearestHostileShaman(s.x, s.y, range) : null;
        if ((enemy || rivalShaman) && s.attackTimer <= 0) {
          s.attackTimer = s.garrisonedTowerIdx >= 0 ? 1.7 : 2.0;
          const tx = enemy ? enemy.x : rivalShaman!.x;
          const ty = enemy ? enemy.y : rivalShaman!.y;
          s.sprite.setFlipX(tx < s.x);
          this.playSfx('fire', 0.22);
          this.fireProjectile(s.x, s.y - 18, tx, ty - 12, 'vfx_fireball', () => {
            if (enemy && !enemy.dead) {
              enemy.hp -= fireDmg;
              if (enemy.hp <= 0) this.killEnemy(enemy);
            } else if (rivalShaman && rivalShaman.respawnTimer <= 0) {
              this.damageRivalShaman(rivalShaman, fireDmg);
            }
          });
        } else if (s.garrisonedTowerIdx < 0) {
          const farEnemy = this.findNearestEnemy(s.x, s.y, 900);
          if (farEnemy) {
            const d = Phaser.Math.Distance.Between(s.x, s.y, farEnemy.x, farEnemy.y);
            if (d > 175) {
              const dx = (farEnemy.x - s.x) / d;
              const dy = (farEnemy.y - s.y) / d;
              s.x += dx * 40 * dt;
              s.y += dy * 40 * dt;
              s.sprite.setFlipX(dx < 0);
            }
          }
        }
      }

      s.sprite.setPosition(s.x, s.y).setDepth(s.garrisonedTowerIdx >= 0 ? s.y + 40 : s.y);
      const showSpecHp = s.hp < s.maxHp;
      s.hpBg.setVisible(showSpecHp).setPosition(s.x, s.y - 44);
      s.hpFill.setVisible(showSpecHp).setPosition(s.x - 11, s.y - 44).setSize(22 * Math.max(0, s.hp / s.maxHp), 2);
    }
  }

  private updateEnemiesAndRivals(dt: number): void {
    const p = this.state.planets[this.state.activePlanetId];
    const cfg = getPlanetConfig(p.planetId);

    // Enemy Warrior Hut physical training timers (enemy Brave stays inside, pops out as Warrior!)
    const trainTotal = Math.max(2.4, 5.0 - (cfg.id - 1) * 0.18);
    for (const eh of this.enemyHuts) {
      if (eh.isTrainingHut && eh.occupant) {
        eh.trainTimer -= dt;
        eh.barBg.setVisible(true);
        eh.barFill.setVisible(true).setSize(28 * Math.min(1, (trainTotal - eh.trainTimer) / trainTotal), 2);
        if (eh.trainTimer <= 0) {
          const occ = eh.occupant;
          eh.occupant = null;
          eh.barBg.setVisible(false);
          eh.barFill.setVisible(false);
          occ.insideTraining = false;
          occ.role = 'warrior';
          occ.hp = 110;
          occ.maxHp = 110;
          occ.x = eh.x;
          occ.y = eh.y + 20;
          occ.sprite.setVisible(true);
          occ.shadow.setVisible(true);
          const rk = `warrior_${occ.tribe}_run_d1`;
          if (this.anims.exists(rk)) occ.sprite.play(rk);
        }
      } else {
        eh.barBg.setVisible(false);
        eh.barFill.setVisible(false);
      }
    }

    // Periodic enemy raids once the player has built at least 1 Hut (longer initial grace period on World 1!)
    if (p.hutsBuilt >= 1 && this.enemyHuts.length > 0) {
      this.enemyRaidTimer -= dt;
      if (this.enemyRaidTimer <= 0) {
        this.enemyRaidTimer = cfg.id === 1 ? 26 : Math.max(8, 18 - cfg.id * 0.6);
        const aliveEnemies = this.enemies.filter((e) => !e.dead && !e.insideTraining);
        if (aliveEnemies.length < (cfg.id === 1 ? 4 : 7)) {
          const eh = this.enemyHuts[Phaser.Math.Between(0, this.enemyHuts.length - 1)];
          this.spawnEnemy(eh.tribe, eh.x, eh.y + 18);
        }
        const raiders = aliveEnemies.filter((e) => e.role === 'warrior').slice(0, cfg.id === 1 ? 1 : 2);
        for (const e of raiders) {
          e.targetX = WORLD_W / 2 + Phaser.Math.Between(-90, 90);
          e.targetY = WORLD_H / 2 + Phaser.Math.Between(-70, 70);
        }
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) {
        this.enemies.splice(i, 1);
        continue;
      }

      if (e.airZ > 0 || e.vz !== 0) {
        e.x = Phaser.Math.Clamp(e.x + e.knockVx * dt, 100, WORLD_W - 100);
        e.y = Phaser.Math.Clamp(e.y + e.knockVy * dt, 100, WORLD_H - 100);
        e.airZ += e.vz * dt;
        e.vz -= 540 * dt;
        if (e.airZ <= 0) {
          e.airZ = 0;
          e.vz = 0;
          e.knockVx = 0;
          e.knockVy = 0;
          // Only die on landing if HP actually reached 0 (Warriors survive a single Blast!)
          if (e.hp <= 0) {
            this.killEnemy(e);
            this.enemies.splice(i, 1);
            continue;
          }
        }
      } else if (e.role === 'brave') {
        if (e.insideTraining) continue;
        // Enemy Braves physically walk to their tribe's Warrior Hut, enter if free, or queue outside!
        const trainHut = this.enemyHuts.find((h) => h.isTrainingHut && h.tribe === e.tribe);
        if (!trainHut) {
          // No training hut left: wander
          e.sprite.anims.pause();
        } else {
          const dTrain = Phaser.Math.Distance.Between(e.x, e.y, trainHut.x, trainHut.y + 18);
          if (dTrain > 22) {
            const dx = (trainHut.x - e.x) / dTrain;
            const dy = (trainHut.y + 18 - e.y) / dTrain;
            e.x += dx * 38 * dt;
            e.y += dy * 38 * dt;
            e.dir = dir4FromVec(dx, dy);
            const bk = `brave_${e.tribe}_run_d${e.dir}`;
            if (this.anims.exists(bk) && e.sprite.anims.currentAnim?.key !== bk) e.sprite.play(bk);
          } else if (!trainHut.occupant) {
            trainHut.occupant = e;
            trainHut.trainTimer = e.trainTimer;
            e.insideTraining = true;
            e.sprite.setVisible(false);
            e.shadow.setVisible(false);
            e.hpBg.setVisible(false);
            e.hpFill.setVisible(false);
          } else {
            // Queue outside enemy Warrior Hut
            const pk = `brave_${e.tribe}_pray_d1`;
            if (this.anims.exists(pk) && e.sprite.anims.currentAnim?.key !== pk) e.sprite.play(pk);
          }
        }
      } else {
        e.attackTimer = Math.max(0, e.attackTimer - dt);
        const nearShaman =
          this.shamanRespawnTimer <= 0 &&
          Phaser.Math.Distance.Between(e.x, e.y, this.shaman.x, this.shaman.y) <= 32;
        const nearWarrior = this.specialists.find((s) => s.garrisonedTowerIdx < 0 && Phaser.Math.Distance.Between(e.x, e.y, s.x, s.y) <= 28);
        const nearBrave = this.braves.find((b) => b.fsm !== 'breeding' && Phaser.Math.Distance.Between(e.x, e.y, b.x, b.y) <= 26);
        const nearHut = this.playerHuts.find((h) => h.hp > 0 && Phaser.Math.Distance.Between(e.x, e.y, h.x, h.y) <= 38);

        if (nearShaman || nearWarrior || nearBrave || nearHut) {
          const tx = nearShaman ? this.shaman.x : nearWarrior ? nearWarrior.x : nearBrave ? nearBrave.x : nearHut!.x;
          const ty = nearShaman ? this.shaman.y : nearWarrior ? nearWarrior.y : nearBrave ? nearBrave.y : nearHut!.y;
          e.dir = dir4FromVec(tx - e.x, ty - e.y);
          const pk = `warrior_${e.tribe}_punch_d${e.dir}`;
          if (this.anims.exists(pk) && e.sprite.anims.currentAnim?.key !== pk) e.sprite.play(pk);
          if (e.attackTimer <= 0) {
            e.attackTimer = 1.1;
            if ((this.state.activeBuffs.shield ?? 0) <= 0) {
              if (nearShaman) {
                this.damagePlayerShaman(11);
              } else if (nearWarrior) {
                nearWarrior.hp -= 11;
                if (nearWarrior.hp <= 0) this.killPlayerSpecialist(nearWarrior);
              } else if (nearBrave) {
                nearBrave.hp -= 11;
                if (nearBrave.hp <= 0) this.killPlayerBrave(nearBrave);
              } else if (nearHut) {
                nearHut.hp = Math.max(10, nearHut.hp - 10);
              }
            }
          }
        } else {
          const dist = Phaser.Math.Distance.Between(e.x, e.y, e.targetX, e.targetY);
          if (dist < 6) {
            e.waitTimer -= dt;
            if (this.anims.exists(`warrior_${e.tribe}_idle`) && e.sprite.anims.currentAnim?.key !== `warrior_${e.tribe}_idle`) {
              e.sprite.play(`warrior_${e.tribe}_idle`);
            }
            if (e.waitTimer <= 0) {
              e.targetX = Phaser.Math.Clamp(e.x + Phaser.Math.Between(-90, 90), 180, WORLD_W - 180);
              e.targetY = Phaser.Math.Clamp(e.y + Phaser.Math.Between(-70, 70), 150, WORLD_H - 150);
              e.waitTimer = Phaser.Math.FloatBetween(1.4, 3.0);
            }
          } else {
            const dx = (e.targetX - e.x) / dist;
            const dy = (e.targetY - e.y) / dist;
            e.x += dx * 34 * dt;
            e.y += dy * 34 * dt;
            e.dir = dir4FromVec(dx, dy);
            const rk = `warrior_${e.tribe}_run_d${e.dir}`;
            if (this.anims.exists(rk) && e.sprite.anims.currentAnim?.key !== rk) e.sprite.play(rk);
          }
        }
      }

      e.shadow.setPosition(e.x, e.y).setDepth(e.y - 2);
      e.sprite.setPosition(e.x, e.y - e.airZ).setDepth(e.y + (e.airZ > 0 ? 300 : 0));
      const showHp = e.hp < e.maxHp && e.airZ === 0;
      e.hpBg.setVisible(showHp).setPosition(e.x, e.y - 42);
      e.hpFill.setVisible(showHp).setPosition(e.x - 10, e.y - 42).setSize(20 * Math.max(0, e.hp / e.maxHp), 2);
    }

    for (const rs of this.rivalShamans) {
      if (rs.respawnTimer > 0) {
        rs.respawnTimer -= dt;
        if (rs.respawnTimer <= 0) {
          rs.hp = rs.maxHp;
          rs.x = rs.homeX;
          rs.y = rs.homeY;
          rs.sprite.setVisible(true);
          rs.ring.setVisible(true);
          rs.label.setVisible(true);
          this.playSfx('shaman_return', 0.25);
        }
        continue;
      }

      rs.attackTimer = Math.max(0, rs.attackTimer - dt);
      const isAlly = p.allied && cfg.allianceTribe === rs.tribe;
      // Rival Shamans can attack ANY nearby player unit (Shaman, Warriors, Braves, Preachers, Fire Warriors)!
      const nearPlayerShaman =
        !isAlly &&
        this.shamanRespawnTimer <= 0 &&
        Phaser.Math.Distance.Between(rs.x, rs.y, this.shaman.x, this.shaman.y) <= 42;
      const nearSpec = !isAlly
        ? this.specialists.find((s) => s.garrisonedTowerIdx < 0 && Phaser.Math.Distance.Between(rs.x, rs.y, s.x, s.y) <= 40)
        : undefined;
      const nearBrave = !isAlly
        ? this.braves.find((b) => b.fsm !== 'breeding' && Phaser.Math.Distance.Between(rs.x, rs.y, b.x, b.y) <= 40)
        : undefined;

      if (nearPlayerShaman || nearSpec || nearBrave) {
        const tx = nearPlayerShaman ? this.shaman.x : nearSpec ? nearSpec.x : nearBrave!.x;
        const ty = nearPlayerShaman ? this.shaman.y : nearSpec ? nearSpec.y : nearBrave!.y;
        rs.dir = dir8FromVec(tx - rs.x, ty - rs.y);
        const fk = `shaman_${rs.tribe}_fight_d${rs.dir}`;
        if (this.anims.exists(fk) && rs.sprite.anims.currentAnim?.key !== fk) rs.sprite.play(fk);
        if (rs.attackTimer <= 0) {
          rs.attackTimer = 1.05;
          this.playSfx('punch', 0.22);
          if ((this.state.activeBuffs.shield ?? 0) <= 0) {
            if (nearPlayerShaman) {
              this.damagePlayerShaman(18);
            } else if (nearSpec) {
              nearSpec.hp -= 18;
              if (nearSpec.hp <= 0) this.killPlayerSpecialist(nearSpec);
            } else if (nearBrave) {
              nearBrave.hp -= 18;
              if (nearBrave.hp <= 0) this.killPlayerBrave(nearBrave);
            }
          }
        }
      } else {
        const dist = Phaser.Math.Distance.Between(rs.x, rs.y, rs.targetX, rs.targetY);
        if (dist < 6) {
          rs.waitTimer -= dt;
          const sk = `shaman_${rs.tribe}_stand_d${rs.dir}`;
          if (this.anims.exists(sk) && rs.sprite.anims.currentAnim?.key !== sk) rs.sprite.play(sk);
          if (rs.waitTimer <= 0) {
            rs.targetX = Phaser.Math.Clamp(rs.homeX + Phaser.Math.Between(-110, 110), 200, WORLD_W - 200);
            rs.targetY = Phaser.Math.Clamp(rs.homeY + Phaser.Math.Between(-80, 80), 160, WORLD_H - 160);
            rs.waitTimer = Phaser.Math.FloatBetween(1.8, 3.6);
          }
        } else {
          const dx = (rs.targetX - rs.x) / dist;
          const dy = (rs.targetY - rs.y) / dist;
          rs.x += dx * 42 * dt;
          rs.y += dy * 42 * dt;
          rs.dir = dir8FromVec(dx, dy);
          const wk = `shaman_${rs.tribe}_walk_d${rs.dir}`;
          if (this.anims.exists(wk) && rs.sprite.anims.currentAnim?.key !== wk) rs.sprite.play(wk);
        }
      }
      rs.sprite.setPosition(rs.x, rs.y).setDepth(rs.y);
      rs.ring.setPosition(rs.x, rs.y);
      rs.label.setPosition(rs.x, rs.y - 60);
      const showRsHp = rs.hp < rs.maxHp;
      rs.hpBg.setVisible(showRsHp).setPosition(rs.x, rs.y - 50);
      rs.hpFill.setVisible(showRsHp).setPosition(rs.x - 16, rs.y - 50).setSize(32 * Math.max(0, rs.hp / rs.maxHp), 2);
    }
  }

  private damageRivalShaman(rs: RivalShamanActor, dmg: number): void {
    if (rs.respawnTimer > 0) return;
    rs.hp = Math.max(0, rs.hp - dmg);
    if (rs.hp <= 0) {
      rs.respawnTimer = 8.0;
      rs.sprite.setVisible(false);
      rs.ring.setVisible(false);
      rs.label.setVisible(false);
      rs.hpBg.setVisible(false);
      rs.hpFill.setVisible(false);
      applyCombatResult(this.state, 2, 0, 0);
      this.spawnFloatingText(rs.x, rs.y, 'Rival Shaman Slain!', '#f4c95d');
      this.onHudSync();
    }
  }

  private findNearestHostileShaman(x: number, y: number, maxDist: number): RivalShamanActor | null {
    const p = this.state.planets[this.state.activePlanetId];
    const cfg = getPlanetConfig(p.planetId);
    let best: RivalShamanActor | null = null;
    let bestD = maxDist;
    for (const rs of this.rivalShamans) {
      if (rs.respawnTimer > 0) continue;
      if (p.allied && cfg.allianceTribe === rs.tribe) continue;
      const d = Phaser.Math.Distance.Between(x, y, rs.x, rs.y);
      if (d < bestD) {
        bestD = d;
        best = rs;
      }
    }
    return best;
  }

  private findTrainingBuildingNeedingBrave(): TrainingBuildingNode | null {
    const p = this.state.planets[this.state.activePlanetId];
    for (const tb of this.trainingBuildings) {
      const cap = getRoleUnitCap(p, tb.role);
      const current = tb.role === 'warrior' ? p.warriors : tb.role === 'preacher' ? p.preachers : p.fireWarriors;
      const queuedOrIn = this.braves.filter(
        (b) => (b.fsm === 'go_train' || b.fsm === 'training') && b.targetTrainBuilding === tb
      ).length;
      if (current + queuedOrIn < cap) return tb;
    }
    return null;
  }

  private findDamagedPlayerBuilding(): { x: number; y: number; hp: number; maxHp: number } | null {
    for (const h of this.playerHuts) {
      if (h.hp < h.maxHp) return h;
    }
    for (const tb of this.trainingBuildings) {
      if (tb.hp < tb.maxHp) return tb;
    }
    return null;
  }

  private findNearestTree(x: number, y: number): TreeNode | null {
    let best: TreeNode | null = null;
    let bestD = Infinity;
    for (const t of this.trees) {
      if (t.chopped) continue;
      const d = Phaser.Math.Distance.Between(x, y, t.x, t.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private findNearestEnemyHut(x: number, y: number, maxDist: number): EnemyHutNode | null {
    let best: EnemyHutNode | null = null;
    let bestD = maxDist;
    for (const eh of this.enemyHuts) {
      if (eh.hp <= 0) continue;
      const d = Phaser.Math.Distance.Between(x, y, eh.x, eh.y);
      if (d < bestD) {
        bestD = d;
        best = eh;
      }
    }
    return best;
  }

  private findNearestEnemy(x: number, y: number, maxDist: number): EnemyActor | null {
    let best: EnemyActor | null = null;
    let bestD = maxDist;
    for (const e of this.enemies) {
      if (e.dead || e.airZ > 0) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    const activeP = this.state.planets[this.state.activePlanetId];
    if (this.currentPlanetRendered !== this.state.activePlanetId || this.renderedAllied !== activeP.allied) {
      this.rebuildPlanetVisuals();
    }
    if (this.paused) return;

    // Shaman Reincarnation state (5s after death, plays shaman_return SFX on return!)
    if (this.shamanRespawnTimer > 0) {
      this.shamanRespawnTimer -= dt;
      this.respawnCircle.setScale(0.92 + 0.12 * Math.sin(_time * 0.008));
      this.respawnText.setText(`Reincarnating ${Math.max(1, Math.ceil(this.shamanRespawnTimer))}s`);
      if (this.shamanRespawnTimer <= 0) {
        this.shamanHp = getShamanMaxHp(this.state);
        this.shaman.setPosition(WORLD_W / 2, WORLD_H / 2).setVisible(true);
        this.shamanLabel.setVisible(true);
        this.respawnCircle.setVisible(false);
        this.respawnText.setVisible(false);
        this.playSfx('shaman_return', 0.45);
        this.spawnFloatingText(this.shaman.x, this.shaman.y - 24, 'Reincarnated!', '#f4c95d');
      }
    } else {
      let dx = this.joystickVec.x;
      let dy = this.joystickVec.y;
      if (this.cursors) {
        if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= 1;
        if (this.cursors.right.isDown || this.wasd.D.isDown) dx += 1;
        if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= 1;
        if (this.cursors.down.isDown || this.wasd.S.isDown) dy += 1;
      }

      const len = Math.hypot(dx, dy);
      const nearEnemy = this.findNearestEnemy(this.shaman.x, this.shaman.y, 38);
      const nearRival = !nearEnemy ? this.findNearestHostileShaman(this.shaman.x, this.shaman.y, 40) : null;
      this.shamanAttackTimer = Math.max(0, this.shamanAttackTimer - dt);

      if (len > 0.05) {
        dx /= Math.max(1, len);
        dy /= Math.max(1, len);
        const speed = 135;
        this.shaman.x = (this.shaman.x + dx * speed * dt + WORLD_W) % WORLD_W;
        this.shaman.y = (this.shaman.y + dy * speed * dt + WORLD_H) % WORLD_H;
        this.shamanDir = dir8FromVec(dx, dy);
        if (this.castAnimTimer <= 0) {
          const walkKey = `shaman_blue_walk_d${this.shamanDir}`;
          if (this.anims.exists(walkKey) && this.shaman.anims.currentAnim?.key !== walkKey) {
            this.shaman.play(walkKey);
          }
        }
      } else if (this.castAnimTimer <= 0 && (nearEnemy || nearRival)) {
        const tx = nearEnemy ? nearEnemy.x : nearRival!.x;
        const ty = nearEnemy ? nearEnemy.y : nearRival!.y;
        this.shamanDir = dir8FromVec(tx - this.shaman.x, ty - this.shaman.y);
        const fightKey = `shaman_blue_fight_d${this.shamanDir}`;
        if (this.anims.exists(fightKey) && this.shaman.anims.currentAnim?.key !== fightKey) {
          this.shaman.play(fightKey);
        }
        if (this.shamanAttackTimer <= 0) {
          this.shamanAttackTimer = 1.0;
          this.playSfx('punch', 0.25);
          if (nearEnemy) {
            nearEnemy.hp -= 18;
            if (nearEnemy.hp <= 0) this.killEnemy(nearEnemy);
          } else if (nearRival) {
            this.damageRivalShaman(nearRival, 18);
          }
        }
      } else if (this.castAnimTimer <= 0) {
        const standKey = `shaman_blue_stand_d${this.shamanDir}`;
        if (this.anims.exists(standKey) && this.shaman.anims.currentAnim?.key !== standKey) {
          this.shaman.play(standKey);
        }
        // Slow out-of-combat HP regeneration
        this.shamanHp = Math.min(getShamanMaxHp(this.state), this.shamanHp + 3 * dt);
      }

      if (this.castAnimTimer > 0) this.castAnimTimer -= dt;
      this.shaman.setDepth(this.shaman.y);
      this.shamanLabel.setPosition(this.shaman.x, this.shaman.y - 62);
      const maxHp = getShamanMaxHp(this.state);
      const showShamanHp = this.shamanHp < maxHp;
      this.shamanHpBg.setVisible(showShamanHp).setPosition(this.shaman.x, this.shaman.y - 52);
      this.shamanHpFill.setVisible(showShamanHp).setPosition(this.shaman.x - 16, this.shaman.y - 52).setSize(32 * (this.shamanHp / maxHp), 2);

      const rangeMult = this.isNearGuardhouse(this.shaman.x, this.shaman.y) ? 1.45 : 1;
      const range = getCastRangePx(this.state, this.state.activePlanetId) * rangeMult;
      this.rangeCircle.setVisible(Number.isFinite(range));
      if (Number.isFinite(range)) {
        this.rangeCircle.setPosition(this.shaman.x, this.shaman.y).setRadius(range);
      }
    }

    try {
      this.updateConvertCircles(dt);
      this.updateBravesAndHuts(dt);
      this.updateSpecialists(dt);
      this.updateEnemiesAndRivals(dt);
    } catch (err) {
      console.error('PlanetScene step error:', err);
    }

    this.simAccum += dt;
    if (this.simAccum >= 0.25) {
      this.simAccum = 0;
      this.syncUnitActors();
      this.onHudSync();
    }
  }
}
