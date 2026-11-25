import Phaser from 'phaser';
import { SPELLS } from './data';
import { castSpell, getCastRangePx, getPlanetConfig, type GameState } from './state';

const WORLD_W = 1600;
const WORLD_H = 1000;

interface Actor {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  tribe: 'blue' | 'red' | 'green' | 'yellow' | 'wild';
  kind: 'brave' | 'preacher' | 'warrior' | 'firewarrior' | 'wildman';
}

export class PlanetScene extends Phaser.Scene {
  private state!: GameState;
  private onHudSync!: () => void;
  private onToast!: (msg: string) => void;

  private shaman!: Phaser.GameObjects.Sprite;
  private rangeCircle!: Phaser.GameObjects.Arc;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private joystickVec = { x: 0, y: 0 };

  private terrainGfx!: Phaser.GameObjects.Graphics;
  private buildingSprites: Phaser.GameObjects.Sprite[] = [];
  private actors: Actor[] = [];
  private shamanDir = 5;
  private castAnimTimer = 0;
  private currentPlanetRendered = -1;
  private simAccum = 0;

  constructor(state: GameState, onHudSync: () => void, onToast: (msg: string) => void) {
    super('PlanetScene');
    this.state = state;
    this.onHudSync = onHudSync;
    this.onToast = onToast;
  }

  setJoystick(x: number, y: number): void {
    this.joystickVec.x = x;
    this.joystickVec.y = y;
  }

  preload(): void {
    this.load.atlas('units', './assets/atlases/units.png', './assets/atlases/units.json');
    this.load.atlas('world', './assets/atlases/world.png', './assets/atlases/world.json');
    const sounds = [
      'ambience', 'convert', 'blast', 'lightning', 'swarm', 'swamp',
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

    this.rangeCircle = this.add.circle(this.shaman.x, this.shaman.y, 185, 0x4ea8de, 0.08);
    this.rangeCircle.setStrokeStyle(2, 0x4ea8de, 0.65).setDepth(5);

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.shaman, true, 0.12, 0.12);

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

  rebuildPlanetVisuals(): void {
    const cfg = getPlanetConfig(this.state.activePlanetId);
    this.currentPlanetRendered = cfg.id;

    this.terrainGfx.clear();
    this.terrainGfx.fillStyle(cfg.waterColor, 1);
    this.terrainGfx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Draw isometric landmass diamonds
    this.terrainGfx.fillStyle(cfg.groundColor, 1);
    this.terrainGfx.fillEllipse(WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.84, WORLD_H * 0.8);
    this.terrainGfx.lineStyle(1, 0x000000, 0.14);
    for (let gx = 160; gx < WORLD_W - 160; gx += 96) {
      for (let gy = 140; gy < WORLD_H - 140; gy += 64) {
        this.terrainGfx.strokePoints([
          { x: gx, y: gy - 24 },
          { x: gx + 48, y: gy },
          { x: gx, y: gy + 24 },
          { x: gx - 48, y: gy },
        ], true);
      }
    }

    for (const s of this.buildingSprites) s.destroy();
    this.buildingSprites = [];
    for (const a of this.actors) a.sprite.destroy();
    this.actors = [];

    const p = this.state.planets[cfg.id];
    // Player Huts & Stone Head near center-left
    const hutCount = Math.min(8, p.hutsBuilt);
    for (let i = 0; i < hutCount; i++) {
      const bx = WORLD_W * 0.42 + (i % 4) * 72 - 110;
      const by = WORLD_H * 0.48 + Math.floor(i / 4) * 62;
      this.buildingSprites.push(
        this.add.sprite(bx, by, 'world', `hut_${Math.min(3, 1 + (i % 3))}_blue`).setOrigin(0.5, 1).setDepth(by)
      );
    }
    this.buildingSprites.push(this.add.sprite(WORLD_W * 0.36, WORLD_H * 0.44, 'world', 'temple_blue').setOrigin(0.5, 1).setDepth(440));
    this.buildingSprites.push(this.add.sprite(WORLD_W * 0.46, WORLD_H * 0.42, 'world', 'warrior_hut_blue').setOrigin(0.5, 1).setDepth(420));
    this.buildingSprites.push(this.add.sprite(WORLD_W * 0.50, WORLD_H * 0.56, 'world', 'stone_head').setOrigin(0.5, 1).setDepth(560));

    // Rival Huts on right/outer ring
    const enemyHuts = Math.min(12, p.enemyHutsRemaining);
    for (let i = 0; i < enemyHuts; i++) {
      const tribe = cfg.rivals[i % cfg.rivals.length];
      const angle = (i / Math.max(1, enemyHuts)) * Math.PI * 2;
      const bx = WORLD_W / 2 + Math.cos(angle) * 420;
      const by = WORLD_H / 2 + Math.sin(angle) * 260;
      this.buildingSprites.push(
        this.add.sprite(bx, by, 'world', `hut_2_${tribe}`).setOrigin(0.5, 1).setDepth(by)
      );
    }

    // Spawn representative roaming units
    this.spawnActors('blue', 'brave', Math.min(8, p.braves), WORLD_W * 0.45, WORLD_H * 0.5);
    this.spawnActors('blue', 'preacher', Math.min(4, p.preachers), WORLD_W * 0.45, WORLD_H * 0.5);
    this.spawnActors('blue', 'warrior', Math.min(6, p.warriors), WORLD_W * 0.48, WORLD_H * 0.5);
    this.spawnActors('blue', 'firewarrior', Math.min(4, p.fireWarriors), WORLD_W * 0.48, WORLD_H * 0.5);
    for (const r of cfg.rivals) {
      this.spawnActors(r, 'warrior', 5, WORLD_W * 0.72, WORLD_H * 0.5);
    }
    this.spawnActors('wild', 'wildman', 5, WORLD_W * 0.55, WORLD_H * 0.35);
  }

  private spawnActors(
    tribe: Actor['tribe'],
    kind: Actor['kind'],
    count: number,
    cx: number,
    cy: number
  ): void {
    for (let i = 0; i < count; i++) {
      const x = cx + Phaser.Math.Between(-140, 140);
      const y = cy + Phaser.Math.Between(-100, 100);
      const animKey =
        kind === 'wildman'
          ? 'wildman_run'
          : kind === 'preacher'
            ? `preacher_${tribe}_pray`
            : kind === 'firewarrior'
              ? `firewarrior_${tribe}_fire`
              : kind === 'warrior'
                ? `warrior_${tribe}_run_d5`
                : `brave_${tribe}_walk_d5`;
      const sp = this.add.sprite(x, y, 'units').setOrigin(0.5, 1).setScale(1.15).setDepth(y);
      if (this.anims.exists(animKey)) sp.play(animKey);
      this.actors.push({
        sprite: sp,
        vx: Phaser.Math.FloatBetween(-28, 28),
        vy: Phaser.Math.FloatBetween(-20, 20),
        tribe,
        kind,
      });
    }
  }

  private handleCastAt(wx: number, wy: number): void {
    const spell = SPELLS.find((s) => s.id === this.state.selectedSpellId);
    if (!spell) return;
    const dist = Phaser.Math.Distance.Between(this.shaman.x, this.shaman.y, wx, wy);
    const res = castSpell(this.state, spell.id, dist);
    if (!res.ok) {
      this.onToast(res.reason ?? 'Cannot cast');
      return;
    }

    if (spell.kind === 'teleport') {
      this.shaman.setPosition(Phaser.Math.Clamp(wx, 60, WORLD_W - 60), Phaser.Math.Clamp(wy, 80, WORLD_H - 60));
    }

    this.castAnimTimer = 0.6;
    const castKey = `shaman_blue_cast_d${this.shamanDir}`;
    if (this.anims.exists(castKey)) this.shaman.play(castKey);

    if (!this.state.muted && this.cache.audio.exists(spell.sound)) {
      this.sound.play(spell.sound, { volume: 0.45 });
    }

    const vfx = this.add.sprite(wx, wy, 'world', spell.vfx).setScale(0.6).setDepth(900);
    this.tweens.add({
      targets: vfx,
      scale: 2.2,
      alpha: 0,
      duration: 550,
      onComplete: () => vfx.destroy(),
    });

    this.onHudSync();
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    if (this.currentPlanetRendered !== this.state.activePlanetId) {
      this.rebuildPlanetVisuals();
    }

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
      const speed = 190;
      this.shaman.x = (this.shaman.x + dx * speed * dt + WORLD_W) % WORLD_W;
      this.shaman.y = (this.shaman.y + dy * speed * dt + WORLD_H) % WORLD_H;

      const angle = Math.atan2(dy, dx);
      this.shamanDir = (((Math.round((angle / (Math.PI * 2)) * 8) + 2) % 8) + 8) % 8 + 1;
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

    const range = getCastRangePx(this.state, this.state.activePlanetId);
    this.rangeCircle.setVisible(Number.isFinite(range));
    if (Number.isFinite(range)) {
      this.rangeCircle.setPosition(this.shaman.x, this.shaman.y).setRadius(range);
    }

    for (const a of this.actors) {
      a.sprite.x = (a.sprite.x + a.vx * dt + WORLD_W) % WORLD_W;
      a.sprite.y = (a.sprite.y + a.vy * dt + WORLD_H) % WORLD_H;
      a.sprite.setDepth(a.sprite.y);
    }

    this.simAccum += dt;
    if (this.simAccum >= 0.25) {
      this.simAccum = 0;
      this.onHudSync();
    }
  }
}
