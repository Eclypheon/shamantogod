import Phaser from 'phaser';
import { SPELLS } from './data';
import {
  applyBlastImpact,
  castSpell,
  getCastRangePx,
  getPlanetConfig,
  getSpellPowerMult,
  getTimberSpeedMult,
  onHutConstructed,
  onWildmanConverted,
  type GameState,
} from './state';

const WORLD_W = 1600;
const WORLD_H = 1000;

type BraveTask = 'idle' | 'seek_tree' | 'chop_tree' | 'carry_wood' | 'build_hut';

interface TreeNode {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Sprite;
  chopped: boolean;
  regrowTimer: number;
}

interface HutBlueprint {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Sprite;
  barBg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
  woodDelivered: number;
  woodNeeded: number;
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
  convertProgress: number; // 0..2.0 seconds
}

interface BraveActor {
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  dir: number; // 1, 3, 5, 7
  task: BraveTask;
  targetTree: TreeNode | null;
  workTimer: number;
  carryingWood: boolean;
  idleX: number;
  idleY: number;
}

interface EnemyActor {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  tribe: 'red' | 'green' | 'yellow';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  waitTimer: number;
  dir: number;
  // Knockback physics
  airZ: number;
  vz: number;
  knockVx: number;
  knockVy: number;
  dead: boolean;
}

interface RivalShamanActor {
  sprite: Phaser.GameObjects.Sprite;
  ring: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  tribe: 'red' | 'green' | 'yellow';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  waitTimer: number;
  dir: number;
  castTimer: number;
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

function dir8FromVec(dx: number, dy: number): number {
  const angle = Math.atan2(dy, dx);
  return ((((Math.round((angle / (Math.PI * 2)) * 8) + 2) % 8) + 8) % 8) + 1;
}

function dir4FromVec(dx: number, dy: number): number {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 3 : 7;
  }
  return dy > 0 ? 5 : 1;
}

export class PlanetScene extends Phaser.Scene {
  private state!: GameState;
  private onHudSync!: () => void;
  private onToast!: (msg: string) => void;

  private shaman!: Phaser.GameObjects.Sprite;
  private shamanLabel!: Phaser.GameObjects.Text;
  private rangeCircle!: Phaser.GameObjects.Arc;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private joystickVec = { x: 0, y: 0 };

  private terrainGfx!: Phaser.GameObjects.Graphics;
  private trees: TreeNode[] = [];
  private playerHuts: Phaser.GameObjects.Sprite[] = [];
  private enemyHuts: { sprite: Phaser.GameObjects.Sprite; x: number; y: number }[] = [];
  private extraBuildings: Phaser.GameObjects.Sprite[] = [];
  private blueprint: HutBlueprint | null = null;
  private wildmen: WildmanActor[] = [];
  private braves: BraveActor[] = [];
  private enemies: EnemyActor[] = [];
  private rivalShamans: RivalShamanActor[] = [];
  private convertCircles: ConvertCircle[] = [];

  private shamanDir = 5;
  private castAnimTimer = 0;
  private currentPlanetRendered = -1;
  private renderedAllied = false;
  private renderedTowers = -1;
  private simAccum = 0;

  constructor(state: GameState, onHudSync: () => void, onToast: (msg: string) => void) {
    super('PlanetScene');
    this.state = state;
    this.onHudSync = onHudSync;
    this.onToast = onToast;
  }

  replaceState(next: GameState): void {
    this.state = next;
    this.currentPlanetRendered = -1;
  }

  /** Triggered when player clicks Begin Conquest on Planet 1 with 0 followers. */
  triggerOpeningConvert(): void {
    if (!this.shaman) return;
    const p = this.state.planets[this.state.activePlanetId];
    if (p.planetId === 1 && p.loyalPop === 0 && p.hutsBuilt === 0) {
      this.shaman.setPosition(WORLD_W / 2, WORLD_H / 2);
      this.spawnConvertCircle(this.shaman.x, this.shaman.y);
      this.castAnimTimer = 0.8;
      const castKey = `shaman_blue_cast_d${this.shamanDir}`;
      if (this.anims.exists(castKey)) this.shaman.play(castKey);
      this.playSfx('convert', 0.38);
    }
  }

  setJoystick(x: number, y: number): void {
    this.joystickVec.x = x;
    this.joystickVec.y = y;
  }

  private playSfx(key: string, volume = 0.35): void {
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

    this.shaman = this.add.sprite(WORLD_W / 2, WORLD_H / 2, 'units', 'shaman_blue_stand_d5_00');
    this.shaman.setOrigin(0.5, 1.0).setScale(1.4).setDepth(500);
    this.shaman.play('shaman_blue_stand_d5');
    this.shamanLabel = this.add.text(this.shaman.x, this.shaman.y - 62, 'SHAMAN', {
      fontFamily: 'Cinzel, Georgia, serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#f4e6c4',
      backgroundColor: 'rgba(39,24,12,0.72)',
      padding: { x: 4, y: 1 },
    }).setOrigin(0.5, 1).setDepth(950);

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
      const target = pointer.event.target as HTMLElement | null;
      if (target && target.closest('#hud')) return;
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
    for (const s of this.playerHuts) s.destroy();
    this.playerHuts = [];
    for (const eh of this.enemyHuts) eh.sprite.destroy();
    this.enemyHuts = [];
    for (const s of this.extraBuildings) s.destroy();
    this.extraBuildings = [];
    if (this.blueprint) {
      this.blueprint.sprite.destroy();
      this.blueprint.barBg.destroy();
      this.blueprint.barFill.destroy();
      this.blueprint = null;
    }
    for (const w of this.wildmen) {
      w.sprite.destroy();
      w.barBg.destroy();
      w.barFill.destroy();
    }
    this.wildmen = [];
    for (const b of this.braves) b.sprite.destroy();
    this.braves = [];
    for (const e of this.enemies) {
      e.sprite.destroy();
      e.shadow.destroy();
    }
    this.enemies = [];
    for (const rs of this.rivalShamans) {
      rs.sprite.destroy();
      rs.ring.destroy();
      rs.label.destroy();
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
    this.renderedTowers = Math.min(4, p.towersBuilt);

    this.clearPlanetObjects();
    this.shaman.setPosition(WORLD_W / 2, WORLD_H / 2);

    // Draw warm Populous-style island terrain
    this.terrainGfx.clear();
    this.terrainGfx.fillStyle(cfg.waterColor, 1);
    this.terrainGfx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Sandy coastline ring + main grass/earth island
    this.terrainGfx.fillStyle(0x9c8257, 1);
    this.terrainGfx.fillEllipse(WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.85, WORLD_H * 0.82);
    this.terrainGfx.fillStyle(cfg.groundColor, 1);
    this.terrainGfx.fillEllipse(WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.81, WORLD_H * 0.77);

    // Subtle isometric grid lines
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

    // Plant Populous tree groves around the center and outer edges
    const treeOffsets = [
      [-170, -90], [-140, -125], [-195, -55], [-160, 80], [-195, 110], [-125, 115],
      [155, -100], [185, -70], [160, 95], [195, 65], [-70, -140], [65, -145],
      [-60, 145], [75, 140], [-280, 10], [-260, -140], [260, -150], [240, 155],
    ];
    for (const [ox, oy] of treeOffsets) {
      const tx = WORLD_W / 2 + ox;
      const ty = WORLD_H / 2 + oy;
      const sp = this.add.sprite(tx, ty, 'world', 'tree_full').setOrigin(0.5, 0.92).setDepth(ty);
      this.trees.push({ x: tx, y: ty, sprite: sp, chopped: false, regrowTimer: 0 });
    }

    // Existing player huts (0 at start of Planet 1!)
    this.syncPlayerHutSprites();

    // Guard towers if built
    for (let i = 0; i < this.renderedTowers; i++) {
      const tx = WORLD_W / 2 + 125 + (i % 2) * 58;
      const ty = WORLD_H / 2 - 55 + Math.floor(i / 2) * 110;
      this.extraBuildings.push(
        this.add.sprite(tx, ty, 'world', 'guard_tower_blue').setOrigin(0.5, 0.92).setDepth(ty)
      );
    }

    // Rival huts positioned on the far eastern/outer territory so center starts calm and clean
    const enemyHutCount = Math.min(10, p.enemyHutsRemaining);
    for (let i = 0; i < enemyHutCount; i++) {
      const tribe = cfg.rivals[i % cfg.rivals.length];
      const angle = -0.9 + (i / Math.max(1, enemyHutCount)) * 1.8 + (i % 2 === 0 ? 0 : Math.PI);
      const bx = WORLD_W / 2 + Math.cos(angle) * 440;
      const by = WORLD_H / 2 + Math.sin(angle) * 240;
      const sp = this.add.sprite(bx, by, 'world', `hut_2_${tribe}`).setOrigin(0.5, 0.92).setDepth(by);
      this.enemyHuts.push({ sprite: sp, x: bx, y: by });
    }

    // 1 Rival Shaman per rival tribe (becomes Ally Shaman when allied on Planet 5+)
    cfg.rivals.forEach((tribe, idx) => {
      const isAlly = p.allied && cfg.allianceTribe === tribe;
      const angle = idx === 0 ? 0 : idx === 1 ? Math.PI : Math.PI / 2;
      const sx = WORLD_W / 2 + Math.cos(angle) * 390;
      const sy = WORLD_H / 2 + Math.sin(angle) * 210;
      const ringColor = isAlly ? 0x52b788 : tribe === 'red' ? 0xe63946 : tribe === 'green' ? 0x2ec4b6 : 0xf4c95d;
      const ring = this.add.circle(sx, sy, 26, ringColor, 0.14).setStrokeStyle(2, ringColor, 0.85).setDepth(4);
      const sp = this.add.sprite(sx, sy, 'units', `shaman_${tribe}_stand_d5_00`).setOrigin(0.5, 1).setScale(1.32).setDepth(sy);
      if (this.anims.exists(`shaman_${tribe}_stand_d5`)) sp.play(`shaman_${tribe}_stand_d5`);
      const label = this.add.text(sx, sy - 60, isAlly ? `ALLY (${tribe.toUpperCase()})` : `RIVAL (${tribe.toUpperCase()})`, {
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize: '9px',
        fontStyle: 'bold',
        color: isAlly ? '#74c69d' : '#ffb4a2',
        backgroundColor: 'rgba(20,14,8,0.75)',
        padding: { x: 4, y: 1 },
      }).setOrigin(0.5, 1).setDepth(950);
      this.rivalShamans.push({
        sprite: sp,
        ring,
        label,
        tribe,
        x: sx,
        y: sy,
        targetX: sx,
        targetY: sy,
        waitTimer: 1.5,
        dir: 5,
        castTimer: Phaser.Math.FloatBetween(4, 9),
      });
    });

    // Spawn 6 Wildmen right near the Shaman in the center!
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + 0.3;
      const dist = Phaser.Math.Between(48, 86);
      this.spawnWildman(WORLD_W / 2 + Math.cos(ang) * dist, WORLD_H / 2 + Math.sin(ang) * dist);
    }

    // Spawn existing loyal Braves
    const braveCount = Math.min(10, p.loyalPop);
    for (let i = 0; i < braveCount; i++) {
      this.spawnBrave(WORLD_W / 2 + Phaser.Math.Between(-80, 80), WORLD_H / 2 + Phaser.Math.Between(-50, 50));
    }

    // Spawn enemy guards around rival territories
    cfg.rivals.forEach((tribe, idx) => {
      const angle = idx === 0 ? 0 : idx === 1 ? Math.PI : Math.PI / 2;
      const cx = WORLD_W / 2 + Math.cos(angle) * 390;
      const cy = WORLD_H / 2 + Math.sin(angle) * 200;
      for (let i = 0; i < 4; i++) {
        this.spawnEnemy(tribe, cx + Phaser.Math.Between(-70, 70), cy + Phaser.Math.Between(-55, 55));
      }
    });
  }

  private syncPlayerHutSprites(): void {
    const p = this.state.planets[this.state.activePlanetId];
    const targetCount = Math.min(8, p.hutsBuilt);
    while (this.playerHuts.length < targetCount) {
      const idx = this.playerHuts.length;
      const pos = this.getHutSlotPos(idx);
      const lv = Math.min(3, 1 + Math.floor(idx / 3));
      const sp = this.add.sprite(pos.x, pos.y, 'world', `hut_${lv}_blue`).setOrigin(0.5, 0.92).setDepth(pos.y);
      this.playerHuts.push(sp);
    }
    // Unlock visual Temple / Warrior Hut organically as village grows
    if (p.hutsBuilt >= 2 && this.extraBuildings.length === 0) {
      this.extraBuildings.push(
        this.add.sprite(WORLD_W / 2 - 125, WORLD_H / 2 - 45, 'world', 'warrior_hut_blue').setOrigin(0.5, 0.92).setDepth(WORLD_H / 2 - 45)
      );
    }
    if (p.hutsBuilt >= 3 && this.extraBuildings.length === 1) {
      this.extraBuildings.push(
        this.add.sprite(WORLD_W / 2 - 125, WORLD_H / 2 + 55, 'world', 'temple_blue').setOrigin(0.5, 0.92).setDepth(WORLD_H / 2 + 55)
      );
    }
  }

  private getHutSlotPos(idx: number): { x: number; y: number } {
    const slots = [
      [-78, -28], [78, -28], [-78, 56], [78, 56],
      [-155, 14], [155, 14], [0, -88], [0, 96],
    ];
    const [ox, oy] = slots[idx % slots.length];
    return { x: WORLD_W / 2 + ox, y: WORLD_H / 2 + oy };
  }

  private ensureBlueprint(): void {
    const p = this.state.planets[this.state.activePlanetId];
    if (!this.state.autoBuild || this.blueprint || this.braves.length === 0 || p.hutsBuilt >= 8) return;
    const slot = this.getHutSlotPos(p.hutsBuilt);
    const sp = this.add.sprite(slot.x, slot.y, 'world', 'hut_plan_blue').setOrigin(0.5, 0.92).setDepth(slot.y - 1);
    const barBg = this.add.rectangle(slot.x, slot.y - 44, 38, 5, 0x1a120a, 0.85).setDepth(920);
    const barFill = this.add.rectangle(slot.x - 18, slot.y - 44, 0, 3, 0xe9c46a, 1).setOrigin(0, 0.5).setDepth(921);
    this.blueprint = { x: slot.x, y: slot.y, sprite: sp, barBg, barFill, woodDelivered: 0, woodNeeded: 3 };
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
    const sp = this.add.sprite(x, y, 'units', 'brave_blue_walk_d5_00').setOrigin(0.5, 1).setScale(1.0).setDepth(y);
    if (this.anims.exists('brave_blue_walk_d5')) sp.play('brave_blue_walk_d5');
    this.braves.push({
      sprite: sp,
      x,
      y,
      dir: 5,
      task: 'idle',
      targetTree: null,
      workTimer: 0,
      carryingWood: false,
      idleX: x,
      idleY: y,
    });
  }

  private spawnEnemy(tribe: 'red' | 'green' | 'yellow', x: number, y: number): void {
    const shadow = this.add.ellipse(x, y, 18, 8, 0x000000, 0.35).setDepth(y - 2);
    const sp = this.add.sprite(x, y, 'units', `warrior_${tribe}_run_d5_00`).setOrigin(0.5, 1).setScale(1.0).setDepth(y);
    if (this.anims.exists(`warrior_${tribe}_run_d5`)) sp.play(`warrior_${tribe}_run_d5`);
    this.enemies.push({
      sprite: sp,
      shadow,
      tribe,
      x,
      y,
      targetX: x,
      targetY: y,
      waitTimer: Phaser.Math.FloatBetween(0.5, 2),
      dir: 5,
      airZ: 0,
      vz: 0,
      knockVx: 0,
      knockVy: 0,
      dead: false,
    });
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

  private fireBlastProjectile(tx: number, ty: number): void {
    const sx = this.shaman.x;
    const sy = this.shaman.y - 26;
    const bolt = this.add.sprite(sx, sy, 'world', 'vfx_blast').setScale(0.75).setDepth(920);
    const dist = Phaser.Math.Distance.Between(sx, sy, tx, ty);
    const dur = Phaser.Math.Clamp(dist * 1.4, 140, 480);

    this.tweens.add({
      targets: bolt,
      x: tx,
      y: ty,
      angle: 360,
      duration: dur,
      ease: 'Quad.easeOut',
      onComplete: () => {
        bolt.destroy();
        this.detonateBlast(tx, ty);
      },
    });
  }

  private detonateBlast(bx: number, by: number): void {
    const radius = 92 * (1 + this.state.metaLevels.tempestForce * 0.15);
    const shock = this.add.circle(bx, by, 14, 0xff9f1c, 0.35).setStrokeStyle(3, 0xfff3b0, 0.95).setDepth(910);
    this.tweens.add({
      targets: shock,
      radius,
      alpha: 0,
      duration: 340,
      onComplete: () => shock.destroy(),
    });

    let unitHits = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Phaser.Math.Distance.Between(bx, by, e.x, e.y);
      if (d <= radius) {
        const ang = Math.atan2(e.y - by, e.x - bx);
        e.vz = 230;
        e.knockVx = Math.cos(ang) * 145;
        e.knockVy = Math.sin(ang) * 110;
        unitHits += 1;
      }
    }

    let hutHits = 0;
    for (let i = this.enemyHuts.length - 1; i >= 0; i--) {
      const eh = this.enemyHuts[i];
      if (Phaser.Math.Distance.Between(bx, by, eh.x, eh.y) <= radius) {
        eh.sprite.destroy();
        this.enemyHuts.splice(i, 1);
        hutHits += 1;
        this.spawnFloatingText(eh.x, eh.y, '-1 Enemy Hut', '#ffb703');
      }
    }

    if (unitHits > 0 || hutHits > 0) {
      applyBlastImpact(this.state, unitHits, hutHits);
      if (unitHits > 0) this.spawnFloatingText(bx, by, `Blast! ${unitHits} launched`, '#ff9f1c');
      this.onHudSync();
    }
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

  private handleCastAt(wx: number, wy: number): void {
    const spell = SPELLS.find((s) => s.id === this.state.selectedSpellId);
    if (!spell) return;
    const dist = Phaser.Math.Distance.Between(this.shaman.x, this.shaman.y, wx, wy);
    const res = castSpell(this.state, spell.id, dist);
    if (!res.ok) {
      this.onToast(res.reason ?? 'Cannot cast');
      if (res.reason?.includes('range')) {
        this.rangeCircle.setStrokeStyle(3, 0xe63946, 0.95);
        this.time.delayedCall(260, () => this.rangeCircle.setStrokeStyle(1.5, 0xc89b4b, 0.55));
      }
      return;
    }

    // Turn Shaman toward target and play cast animation
    if (dist > 6) {
      this.shamanDir = dir8FromVec(wx - this.shaman.x, wy - this.shaman.y);
    }
    this.castAnimTimer = 0.65;
    const castKey = `shaman_blue_cast_d${this.shamanDir}`;
    if (this.anims.exists(castKey)) this.shaman.play(castKey);
    this.playSfx(spell.sound, 0.36);

    if (spell.id === 'convert') {
      this.spawnConvertCircle(wx, wy);
    } else if (spell.id === 'blast') {
      this.fireBlastProjectile(wx, wy);
    } else if (spell.kind === 'teleport') {
      this.shaman.setPosition(Phaser.Math.Clamp(wx, 120, WORLD_W - 120), Phaser.Math.Clamp(wy, 120, WORLD_H - 120));
      this.spawnFloatingText(wx, wy, 'Teleport', '#90e0ef');
    } else {
      const vfx = this.add.sprite(wx, wy, 'world', spell.vfx).setScale(0.6).setDepth(900);
      this.tweens.add({ targets: vfx, scale: 2.2, alpha: 0, duration: 550, onComplete: () => vfx.destroy() });
      if (res.converted && res.converted > 0) this.spawnFloatingText(wx, wy, `+${res.converted} Braves`, '#74c69d');
      else if (res.destroyed && res.destroyed > 0) this.spawnFloatingText(wx, wy, `-${res.destroyed} Enemy Hut`, '#ffb703');
      else if (spell.kind === 'buff') this.spawnFloatingText(wx, wy, `${spell.name} Active`, '#90e0ef');
    }

    this.onHudSync();
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

    // Update Wildmen (wandering + 2.0s conversion inside active Convert circles)
    for (let i = this.wildmen.length - 1; i >= 0; i--) {
      const w = this.wildmen[i];
      let insideCircle: ConvertCircle | null = null;
      for (const cc of this.convertCircles) {
        if (Phaser.Math.Distance.Between(w.x, w.y, cc.x, cc.y) <= cc.radius) {
          insideCircle = cc;
          break;
        }
      }

      if (insideCircle) {
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
            this.ensureBlueprint();
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
            w.targetX = WORLD_W / 2 + Phaser.Math.Between(-150, 150);
            w.targetY = WORLD_H / 2 + Phaser.Math.Between(-110, 110);
            w.waitTimer = Phaser.Math.FloatBetween(1.2, 3.0);
          }
        } else {
          const speed = 34;
          const dx = (w.targetX - w.x) / dist;
          const dy = (w.targetY - w.y) / dist;
          w.x += dx * speed * dt;
          w.y += dy * speed * dt;
          w.sprite.setFlipX(dx < 0);
          if (w.sprite.anims.currentAnim?.key !== 'wildman_run') w.sprite.play('wildman_run');
        }
      }
      w.sprite.setPosition(w.x, w.y).setDepth(w.y);
    }

    // Slowly replenish Wildmen if fewer than 4 remain
    if (this.wildmen.length < 4 && Math.random() < 0.12 * dt) {
      this.spawnWildman(WORLD_W / 2 + Phaser.Math.Between(-190, 190), WORLD_H / 2 + Phaser.Math.Between(-120, 120));
    }
  }

  private updateBravesAndTrees(dt: number): void {
    const timberMult = getTimberSpeedMult(this.state);

    // Regrow chopped trees slowly
    for (const t of this.trees) {
      if (t.chopped) {
        t.regrowTimer -= dt;
        if (t.regrowTimer <= 0) {
          t.chopped = false;
          t.sprite.setFrame('tree_full');
        }
      }
    }

    this.ensureBlueprint();

    for (const b of this.braves) {
      if (b.task === 'idle') {
        if (this.blueprint && !b.carryingWood) {
          // Find nearest live tree
          let best: TreeNode | null = null;
          let bestD = Infinity;
          for (const t of this.trees) {
            if (t.chopped) continue;
            const d = Phaser.Math.Distance.Between(b.x, b.y, t.x, t.y);
            if (d < bestD) {
              bestD = d;
              best = t;
            }
          }
          if (best) {
            b.targetTree = best;
            b.task = 'seek_tree';
          }
        } else {
          // Calmly patrol near idle point
          const d = Phaser.Math.Distance.Between(b.x, b.y, b.idleX, b.idleY);
          if (d > 6) {
            const dx = (b.idleX - b.x) / d;
            const dy = (b.idleY - b.y) / d;
            b.x += dx * 42 * dt;
            b.y += dy * 42 * dt;
            b.dir = dir4FromVec(dx, dy);
            const k = `brave_blue_walk_d${b.dir}`;
            if (this.anims.exists(k) && b.sprite.anims.currentAnim?.key !== k) b.sprite.play(k);
          } else {
            b.sprite.anims.pause();
            if (Math.random() < 0.3 * dt) {
              b.idleX = WORLD_W / 2 + Phaser.Math.Between(-110, 110);
              b.idleY = WORLD_H / 2 + Phaser.Math.Between(-70, 70);
            }
          }
        }
      } else if (b.task === 'seek_tree') {
        const t = b.targetTree;
        if (!t || t.chopped || !this.blueprint) {
          b.task = 'idle';
          b.targetTree = null;
        } else {
          const d = Phaser.Math.Distance.Between(b.x, b.y, t.x, t.y + 6);
          if (d <= 14) {
            b.task = 'chop_tree';
            b.workTimer = 1.4 / timberMult;
            const wk = `brave_blue_work_d${b.dir}`;
            if (this.anims.exists(wk)) b.sprite.play(wk);
          } else {
            const dx = (t.x - b.x) / d;
            const dy = (t.y + 6 - b.y) / d;
            b.x += dx * 56 * dt;
            b.y += dy * 56 * dt;
            b.dir = dir4FromVec(dx, dy);
            const wk = `brave_blue_walk_d${b.dir}`;
            if (this.anims.exists(wk) && b.sprite.anims.currentAnim?.key !== wk) b.sprite.play(wk);
          }
        }
      } else if (b.task === 'chop_tree') {
        b.workTimer -= dt;
        if (b.workTimer <= 0) {
          if (b.targetTree && !b.targetTree.chopped) {
            b.targetTree.chopped = true;
            b.targetTree.regrowTimer = 25;
            b.targetTree.sprite.setFrame('tree_stump');
          }
          b.carryingWood = true;
          b.targetTree = null;
          b.task = this.blueprint ? 'carry_wood' : 'idle';
        }
      } else if (b.task === 'carry_wood') {
        if (!this.blueprint) {
          b.carryingWood = false;
          b.task = 'idle';
        } else {
          const d = Phaser.Math.Distance.Between(b.x, b.y, this.blueprint.x, this.blueprint.y + 10);
          if (d <= 18) {
            b.task = 'build_hut';
            b.workTimer = 0.85 / timberMult;
            const wk = `brave_blue_work_d${b.dir}`;
            if (this.anims.exists(wk)) b.sprite.play(wk);
          } else {
            const dx = (this.blueprint.x - b.x) / d;
            const dy = (this.blueprint.y + 10 - b.y) / d;
            b.x += dx * 52 * dt;
            b.y += dy * 52 * dt;
            b.dir = dir4FromVec(dx, dy);
            const wk = `brave_blue_walk_d${b.dir}`;
            if (this.anims.exists(wk) && b.sprite.anims.currentAnim?.key !== wk) b.sprite.play(wk);
          }
        }
      } else if (b.task === 'build_hut') {
        b.workTimer -= dt;
        if (b.workTimer <= 0) {
          b.carryingWood = false;
          b.task = 'idle';
          if (this.blueprint) {
            this.blueprint.woodDelivered += 1;
            const frac = Math.min(1, this.blueprint.woodDelivered / this.blueprint.woodNeeded);
            this.blueprint.barFill.setSize(36 * frac, 3);
            if (this.blueprint.woodDelivered === 1) {
              this.blueprint.sprite.setFrame('hut_frame_blue');
            }
            if (this.blueprint.woodDelivered >= this.blueprint.woodNeeded) {
              const bx = this.blueprint.x;
              const by = this.blueprint.y;
              this.blueprint.sprite.destroy();
              this.blueprint.barBg.destroy();
              this.blueprint.barFill.destroy();
              this.blueprint = null;
              onHutConstructed(this.state);
              this.syncPlayerHutSprites();
              this.playSfx('birth', 0.4);
              this.spawnFloatingText(bx, by - 20, 'Hut Built!', '#f4c95d');
              this.onHudSync();
            }
          }
        }
      }

      b.sprite.setPosition(b.x, b.y).setDepth(b.y);
    }
  }

  private updateEnemiesAndRivals(dt: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) continue;

      // Parabolic Blast knockback arc
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
          e.dead = true;
          e.sprite.destroy();
          e.shadow.destroy();
          this.enemies.splice(i, 1);
          continue;
        }
      } else {
        const dist = Phaser.Math.Distance.Between(e.x, e.y, e.targetX, e.targetY);
        if (dist < 6) {
          e.waitTimer -= dt;
          e.sprite.anims.pause();
          if (e.waitTimer <= 0) {
            e.targetX = Phaser.Math.Clamp(e.x + Phaser.Math.Between(-90, 90), 180, WORLD_W - 180);
            e.targetY = Phaser.Math.Clamp(e.y + Phaser.Math.Between(-70, 70), 150, WORLD_H - 150);
            e.waitTimer = Phaser.Math.FloatBetween(1.0, 2.6);
          }
        } else {
          const dx = (e.targetX - e.x) / dist;
          const dy = (e.targetY - e.y) / dist;
          e.x += dx * 44 * dt;
          e.y += dy * 44 * dt;
          e.dir = dir4FromVec(dx, dy);
          const rk = `warrior_${e.tribe}_run_d${e.dir}`;
          if (this.anims.exists(rk) && e.sprite.anims.currentAnim?.key !== rk) e.sprite.play(rk);
        }
      }
      e.shadow.setPosition(e.x, e.y).setDepth(e.y - 2);
      e.sprite.setPosition(e.x, e.y - e.airZ).setDepth(e.y + (e.airZ > 0 ? 300 : 0));
    }

    for (const rs of this.rivalShamans) {
      const dist = Phaser.Math.Distance.Between(rs.x, rs.y, rs.targetX, rs.targetY);
      if (dist < 6) {
        rs.waitTimer -= dt;
        const sk = `shaman_${rs.tribe}_stand_d${rs.dir}`;
        if (this.anims.exists(sk) && rs.sprite.anims.currentAnim?.key !== sk) rs.sprite.play(sk);
        if (rs.waitTimer <= 0) {
          rs.targetX = Phaser.Math.Clamp(rs.x + Phaser.Math.Between(-110, 110), 200, WORLD_W - 200);
          rs.targetY = Phaser.Math.Clamp(rs.y + Phaser.Math.Between(-80, 80), 160, WORLD_H - 160);
          rs.waitTimer = Phaser.Math.FloatBetween(1.5, 3.2);
        }
      } else {
        const dx = (rs.targetX - rs.x) / dist;
        const dy = (rs.targetY - rs.y) / dist;
        rs.x += dx * 52 * dt;
        rs.y += dy * 52 * dt;
        rs.dir = dir8FromVec(dx, dy);
        const wk = `shaman_${rs.tribe}_walk_d${rs.dir}`;
        if (this.anims.exists(wk) && rs.sprite.anims.currentAnim?.key !== wk) rs.sprite.play(wk);
      }
      rs.sprite.setPosition(rs.x, rs.y).setDepth(rs.y);
      rs.ring.setPosition(rs.x, rs.y);
      rs.label.setPosition(rs.x, rs.y - 60);
    }
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    const activeP = this.state.planets[this.state.activePlanetId];
    if (
      this.currentPlanetRendered !== this.state.activePlanetId ||
      this.renderedAllied !== activeP.allied ||
      this.renderedTowers !== Math.min(4, activeP.towersBuilt)
    ) {
      this.rebuildPlanetVisuals();
    }

    // Player Shaman movement (directional 8-way animations)
    let dx = this.joystickVec.x;
    let dy = this.joystickVec.y;
    if (this.cursors) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= 1;
      if (this.cursors.right.isDown || this.wasd.D.isDown) dx += 1;
      if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= 1;
      if (this.cursors.down.isDown || this.wasd.S.isDown) dy += 1;
    }

    const len = Math.hypot(dx, dy);
    if (len > 0.05) {
      dx /= Math.max(1, len);
      dy /= Math.max(1, len);
      const speed = 175;
      this.shaman.x = (this.shaman.x + dx * speed * dt + WORLD_W) % WORLD_W;
      this.shaman.y = (this.shaman.y + dy * speed * dt + WORLD_H) % WORLD_H;
      this.shamanDir = dir8FromVec(dx, dy);
      if (this.castAnimTimer <= 0) {
        const walkKey = `shaman_blue_walk_d${this.shamanDir}`;
        if (this.anims.exists(walkKey) && this.shaman.anims.currentAnim?.key !== walkKey) {
          this.shaman.play(walkKey);
        }
      }
    } else if (this.castAnimTimer <= 0) {
      const standKey = `shaman_blue_stand_d${this.shamanDir}`;
      if (this.anims.exists(standKey) && this.shaman.anims.currentAnim?.key !== standKey) {
        this.shaman.play(standKey);
      }
    }

    if (this.castAnimTimer > 0) this.castAnimTimer -= dt;
    this.shaman.setDepth(this.shaman.y);
    this.shamanLabel.setPosition(this.shaman.x, this.shaman.y - 62);

    const range = getCastRangePx(this.state, this.state.activePlanetId);
    this.rangeCircle.setVisible(Number.isFinite(range));
    if (Number.isFinite(range)) {
      this.rangeCircle.setPosition(this.shaman.x, this.shaman.y).setRadius(range);
    }

    this.updateConvertCircles(dt);
    this.updateBravesAndTrees(dt);
    this.updateEnemiesAndRivals(dt);

    this.simAccum += dt;
    if (this.simAccum >= 0.25) {
      this.simAccum = 0;
      this.onHudSync();
    }
  }
}
