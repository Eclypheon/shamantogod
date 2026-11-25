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

interface RivalShamanActor {
  sprite: Phaser.GameObjects.Sprite;
  ring: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  tribe: 'red' | 'green' | 'yellow';
  vx: number;
  vy: number;
  castTimer: number;
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
  private buildingSprites: Phaser.GameObjects.Sprite[] = [];
  private actors: Actor[] = [];
  private rivalShamans: RivalShamanActor[] = [];
  private shamanDir = 5;
  private castAnimTimer = 0;
  private currentPlanetRendered = -1;
  private renderedAllied = false;
  private renderedHuts = -1;
  private renderedEnemyHuts = -1;
  private renderedTowers = -1;
  private simAccum = 0;
  private ambienceStarted = false;

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

  startAmbience(): void {
    if (this.ambienceStarted || this.state.muted) return;
    if (this.cache.audio.exists('ambience')) {
      this.ambienceStarted = true;
      this.sound.play('ambience', { loop: true, volume: 0.14 });
    }
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
    this.shaman.setOrigin(0.5, 1.0).setScale(1.45).setDepth(500);
    this.shaman.play('shaman_blue_stand_d5');
    this.shamanLabel = this.add.text(this.shaman.x, this.shaman.y - 68, 'YOU (Shaman)', {
      fontSize: '11px',
      color: '#4ea8de',
      backgroundColor: 'rgba(13,19,33,0.75)',
      padding: { x: 4, y: 1 },
    }).setOrigin(0.5, 1).setDepth(950);

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
    for (const rs of this.rivalShamans) {
      rs.sprite.destroy();
      rs.ring.destroy();
      rs.label.destroy();
    }
    this.rivalShamans = [];

    const p = this.state.planets[cfg.id];
    this.renderedAllied = p.allied;
    this.renderedHuts = Math.min(8, p.hutsBuilt);
    this.renderedEnemyHuts = Math.min(12, p.enemyHutsRemaining);
    this.renderedTowers = Math.min(4, p.towersBuilt);
    // Player Huts & Stone Head near center-left
    const hutCount = this.renderedHuts;
    for (let i = 0; i < hutCount; i++) {
      const bx = WORLD_W * 0.42 + (i % 4) * 72 - 110;
      const by = WORLD_H * 0.48 + Math.floor(i / 4) * 62;
      this.buildingSprites.push(
        this.add.sprite(bx, by, 'world', `hut_${Math.min(3, 1 + (i % 3))}_blue`).setOrigin(0.5, 1).setDepth(by)
      );
    }
    for (let i = 0; i < this.renderedTowers; i++) {
      const tx = WORLD_W * 0.56 + (i % 2) * 58;
      const ty = WORLD_H * 0.44 + Math.floor(i / 2) * 86;
      this.buildingSprites.push(
        this.add.sprite(tx, ty, 'world', 'guard_tower_blue').setOrigin(0.5, 1).setDepth(ty)
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

    // Spawn 1 Shaman per rival tribe (becomes Ally Shaman when allied on Planet 5+)
    cfg.rivals.forEach((tribe, idx) => {
      const isAlly = p.allied && cfg.allianceTribe === tribe;
      const angle = (idx / Math.max(1, cfg.rivals.length)) * Math.PI * 2 + 0.6;
      const sx = WORLD_W / 2 + Math.cos(angle) * 340;
      const sy = WORLD_H / 2 + Math.sin(angle) * 210;
      const ringColor = isAlly ? 0x52b788 : tribe === 'red' ? 0xe63946 : tribe === 'green' ? 0x2ec4b6 : 0xf4c95d;
      const ring = this.add.circle(sx, sy, 28, ringColor, 0.14).setStrokeStyle(2, ringColor, 0.85).setDepth(4);
      const sp = this.add.sprite(sx, sy, 'units', `shaman_${tribe}_walk_d5_00`).setOrigin(0.5, 1).setScale(1.35).setDepth(sy);
      if (this.anims.exists(`shaman_${tribe}_walk_d5`)) sp.play(`shaman_${tribe}_walk_d5`);
      const tag = isAlly ? `ALLY (${tribe.toUpperCase()})` : `RIVAL (${tribe.toUpperCase()})`;
      const label = this.add.text(sx, sy - 64, tag, {
        fontSize: '10px',
        color: isAlly ? '#52b788' : '#ffb4a2',
        backgroundColor: 'rgba(13,19,33,0.75)',
        padding: { x: 4, y: 1 },
      }).setOrigin(0.5, 1).setDepth(950);
      this.rivalShamans.push({
        sprite: sp,
        ring,
        label,
        tribe,
        vx: Phaser.Math.FloatBetween(-45, 45),
        vy: Phaser.Math.FloatBetween(-32, 32),
        castTimer: Phaser.Math.FloatBetween(2, 6),
      });
    });

    // Spawn representative roaming followers (smaller than Shamans)
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
      const sp = this.add.sprite(x, y, 'units').setOrigin(0.5, 1).setScale(0.95).setDepth(y);
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

  private spawnFloatingText(wx: number, wy: number, text: string, color = '#f4e6c4'): void {
    const t = this.add.text(wx, wy - 20, text, {
      fontFamily: 'Cinzel, Georgia, serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color,
      stroke: '#1b1209',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(980);
    this.tweens.add({
      targets: t,
      y: wy - 64,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private handleCastAt(wx: number, wy: number): void {
    this.startAmbience();
    const spell = SPELLS.find((s) => s.id === this.state.selectedSpellId);
    if (!spell) return;
    const dist = Phaser.Math.Distance.Between(this.shaman.x, this.shaman.y, wx, wy);
    const res = castSpell(this.state, spell.id, dist);
    if (!res.ok) {
      this.onToast(res.reason ?? 'Cannot cast');
      if (res.reason?.includes('range')) {
        this.rangeCircle.setStrokeStyle(3, 0xe63946, 0.95);
        this.time.delayedCall(280, () => this.rangeCircle.setStrokeStyle(2, 0x4ea8de, 0.65));
      }
      return;
    }

    if (res.converted && res.converted > 0) {
      this.spawnFloatingText(wx, wy, `+${res.converted} Braves`, '#74c69d');
    } else if (res.destroyed && res.destroyed > 0) {
      this.spawnFloatingText(wx, wy, `-${res.destroyed} Enemy Hut`, '#ffb703');
    } else if (spell.kind === 'buff') {
      this.spawnFloatingText(wx, wy, `${spell.name} Active`, '#90e0ef');
    } else {
      this.spawnFloatingText(wx, wy, spell.name, '#f4e6c4');
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
    const activeP = this.state.planets[this.state.activePlanetId];
    if (
      this.currentPlanetRendered !== this.state.activePlanetId ||
      this.renderedAllied !== activeP.allied ||
      this.renderedHuts !== Math.min(8, activeP.hutsBuilt) ||
      this.renderedEnemyHuts !== Math.min(12, activeP.enemyHutsRemaining) ||
      this.renderedTowers !== Math.min(4, activeP.towersBuilt)
    ) {
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
    this.shamanLabel.setPosition(this.shaman.x, this.shaman.y - 68);

    for (const rs of this.rivalShamans) {
      rs.sprite.x = (rs.sprite.x + rs.vx * dt + WORLD_W) % WORLD_W;
      rs.sprite.y = (rs.sprite.y + rs.vy * dt + WORLD_H) % WORLD_H;
      rs.sprite.setDepth(rs.sprite.y);
      rs.ring.setPosition(rs.sprite.x, rs.sprite.y);
      rs.label.setPosition(rs.sprite.x, rs.sprite.y - 64);
      rs.castTimer -= dt;
      if (rs.castTimer <= 0) {
        rs.castTimer = Phaser.Math.FloatBetween(4, 8);
        const vfx = this.add.sprite(rs.sprite.x + Phaser.Math.Between(-40, 40), rs.sprite.y + Phaser.Math.Between(-25, 25), 'world', 'vfx_fireball').setScale(0.5).setDepth(900);
        this.tweens.add({ targets: vfx, scale: 1.5, alpha: 0, duration: 450, onComplete: () => vfx.destroy() });
      }
    }

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
