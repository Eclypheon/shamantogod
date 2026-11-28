import Phaser from 'phaser';

export interface ActiveHazard {
  kind: 'swarm' | 'swamp' | 'tornado' | 'volcano';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  remaining: number;
  tickAccum: number;
  container: Phaser.GameObjects.Container;
  phase: number;
}

/** Distinct, visceral Phaser spell VFX (no generic expanding dots). */
export function playLightningVfx(scene: Phaser.Scene, x: number, y: number): void {
  scene.cameras.main.shake(130, 0.007);
  const gfx = scene.add.graphics().setDepth(960);
  // Jagged forked lightning bolt from sky to ground
  const drawBolt = (alpha: number, width: number, color: number) => {
    gfx.lineStyle(width, color, alpha);
    gfx.beginPath();
    let cx = x + Phaser.Math.Between(-25, 25);
    let cy = y - 340;
    gfx.moveTo(cx, cy);
    for (let i = 1; i <= 7; i++) {
      cx = i === 7 ? x : x + Phaser.Math.Between(-28, 28);
      cy = y - 340 + (340 * i) / 7;
      gfx.lineTo(cx, cy);
    }
    gfx.strokePath();
  };
  drawBolt(0.55, 7, 0x72efdd);
  drawBolt(1.0, 2.5, 0xffffff);

  const scorch = scene.add.ellipse(x, y, 48, 24, 0x1a1410, 0.65).setDepth(6);
  const flash = scene.add.circle(x, y, 36, 0xe0fbfc, 0.8).setDepth(955);
  scene.tweens.add({ targets: [gfx, flash], alpha: 0, duration: 280, onComplete: () => { gfx.destroy(); flash.destroy(); } });
  scene.tweens.add({ targets: scorch, alpha: 0, duration: 2600, onComplete: () => scorch.destroy() });
}

export function playEarthquakeVfx(scene: Phaser.Scene, x: number, y: number, radius: number): void {
  scene.cameras.main.shake(380, 0.012);
  const gfx = scene.add.graphics().setDepth(7);
  gfx.lineStyle(3, 0x2b1d10, 0.9);
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
    gfx.beginPath();
    gfx.moveTo(x, y);
    let px = x;
    let py = y;
    for (let s = 1; s <= 4; s++) {
      const r = (radius * s) / 4;
      px = x + Math.cos(ang) * r + Phaser.Math.Between(-12, 12);
      py = y + Math.sin(ang) * r * 0.65 + Phaser.Math.Between(-8, 8);
      gfx.lineTo(px, py);
    }
    gfx.strokePath();
  }
  scene.tweens.add({ targets: gfx, alpha: 0, duration: 3000, onComplete: () => gfx.destroy() });
}

export function playFirestormVfx(scene: Phaser.Scene, x: number, y: number, radius: number): void {
  scene.cameras.main.shake(220, 0.006);
  for (let i = 0; i < 9; i++) {
    scene.time.delayedCall(i * 190, () => {
      const tx = x + Phaser.Math.Between(-radius * 0.75, radius * 0.75);
      const ty = y + Phaser.Math.Between(-radius * 0.5, radius * 0.5);
      const meteor = scene.add.circle(tx - 90, ty - 260, 7, 0xff6b00, 1).setStrokeStyle(2, 0xfff3b0).setDepth(950);
      scene.tweens.add({
        targets: meteor,
        x: tx,
        y: ty,
        duration: 280,
        ease: 'Quad.easeIn',
        onComplete: () => {
          meteor.destroy();
          const boom = scene.add.circle(tx, ty, 10, 0xff4500, 0.75).setDepth(940);
          scene.tweens.add({ targets: boom, radius: 34, alpha: 0, duration: 320, onComplete: () => boom.destroy() });
        },
      });
    });
  }
}

export function playHypnotiseVfx(scene: Phaser.Scene, x: number, y: number, radius: number): void {
  for (let i = 0; i < 3; i++) {
    const ring = scene.add.circle(x, y, 14 + i * 16, 0x9d4edd, 0.14).setStrokeStyle(2.5, 0xe0aaff, 0.9).setDepth(920);
    scene.tweens.add({
      targets: ring,
      radius: radius,
      alpha: 0,
      duration: 600 + i * 150,
      onComplete: () => ring.destroy(),
    });
  }
}

export function playTeleportVfx(scene: Phaser.Scene, fromX: number, fromY: number, toX: number, toY: number): void {
  for (const [px, py] of [[fromX, fromY], [toX, toY]]) {
    const beam = scene.add.rectangle(px, py - 90, 22, 180, 0xf4c95d, 0.65).setDepth(950);
    scene.tweens.add({ targets: beam, scaleX: 0.1, alpha: 0, duration: 380, onComplete: () => beam.destroy() });
  }
}

export interface AngelOfDeathActor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  remaining: number;
  breathTimer: number;
  phase: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  leftWing: Phaser.GameObjects.Polygon;
  rightWing: Phaser.GameObjects.Polygon;
}

/** Summons a flying, fire-breathing winged serpentine dragon inspired by Populous: The Beginning's Angel of Death! */
export function createAngelOfDeathVfx(scene: Phaser.Scene, x: number, y: number): AngelOfDeathActor {
  const shadow = scene.add.ellipse(x, y + 8, 52, 20, 0x000000, 0.36).setDepth(y - 4);
  const container = scene.add.container(x, y - 58).setDepth(965);

  const gfx = scene.add.graphics();
  // Spiked serpentine tail & crimson-obsidian dragon torso
  gfx.lineStyle(5, 0x3b0d11, 1);
  gfx.beginPath();
  gfx.moveTo(-28, 12);
  gfx.lineTo(-14, 6);
  gfx.lineTo(0, 0);
  gfx.lineTo(14, -4);
  gfx.strokePath();
  gfx.lineStyle(2.5, 0x9b2226, 1);
  gfx.beginPath();
  gfx.moveTo(-26, 11);
  gfx.lineTo(12, -3);
  gfx.strokePath();

  // Winged dragon body & horned head
  const body = scene.add.ellipse(0, 0, 30, 14, 0x5c1116, 1).setStrokeStyle(1.5, 0x1f0709);
  const head = scene.add.polygon(17, -4, [-6, -5, 10, -2, 12, 3, -4, 5], 0x78141c, 1).setStrokeStyle(1.5, 0x1f0709);
  const horn1 = scene.add.triangle(15, -10, 0, 5, 4, -5, 7, 5, 0xd4a373, 1);
  const eye = scene.add.circle(21, -5, 2.2, 0xffd166, 1);
  const aura = scene.add.circle(0, 0, 26, 0xff5400, 0.14).setStrokeStyle(1.5, 0xff9f1c, 0.55);

  // Articulated bat-like leathery wings that flap every frame!
  const leftWing = scene.add.polygon(-2, -6, [0, 0, -24, -26, -6, -20, 10, -24, 6, -4], 0x8f1d21, 0.94).setStrokeStyle(1.5, 0x2a080a);
  const rightWing = scene.add.polygon(-2, 6, [0, 0, -22, 24, -4, 18, 10, 22, 6, 4], 0x6b1216, 0.94).setStrokeStyle(1.5, 0x2a080a);

  container.add([aura, leftWing, rightWing, gfx, body, head, horn1, eye]);

  // Dramatic ground eruption ring on summon
  const burst = scene.add.circle(x, y, 16, 0xff5400, 0.45).setStrokeStyle(3, 0xffd166, 0.95).setDepth(950);
  scene.tweens.add({ targets: burst, radius: 74, alpha: 0, duration: 520, onComplete: () => burst.destroy() });

  return {
    x,
    y,
    vx: 68,
    vy: -24,
    remaining: 26,
    breathTimer: 0.4,
    phase: 0,
    container,
    shadow,
    leftWing,
    rightWing,
  };
}

/** Roaring dragon fire-breath cone from the flying Angel of Death onto a target unit or hut. */
export function playDragonFireBreathVfx(scene: Phaser.Scene, sx: number, sy: number, tx: number, ty: number): void {
  for (let i = 0; i < 6; i++) {
    scene.time.delayedCall(i * 45, () => {
      const puff = scene.add.circle(sx, sy, 5 + i * 1.2, i % 2 === 0 ? 0xff5400 : 0xffd166, 0.92).setDepth(968);
      scene.tweens.add({
        targets: puff,
        x: tx + Phaser.Math.Between(-16, 16),
        y: ty + Phaser.Math.Between(-12, 12),
        scale: 2.2,
        alpha: 0,
        duration: 260,
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy(),
      });
    });
  }
}

export function playWaterSplashVfx(scene: Phaser.Scene, x: number, y: number): void {
  const ring = scene.add.ellipse(x, y, 12, 6, 0x90e0ef, 0.45).setStrokeStyle(2, 0xe0fbfc, 0.95).setDepth(920);
  scene.tweens.add({ targets: ring, scaleX: 3.0, scaleY: 2.6, alpha: 0, duration: 480, onComplete: () => ring.destroy() });
  for (let i = 0; i < 6; i++) {
    const drop = scene.add.circle(x, y, 2.5, 0xcaf0f8, 0.95).setDepth(925);
    const ang = (i / 6) * Math.PI * 2;
    scene.tweens.add({
      targets: drop,
      x: x + Math.cos(ang) * 20,
      y: y - 16 + Math.sin(ang) * 10,
      alpha: 0,
      duration: 380,
      ease: 'Quad.easeOut',
      onComplete: () => drop.destroy(),
    });
  }
}

export function createHazardVfx(
  scene: Phaser.Scene,
  kind: ActiveHazard['kind'],
  x: number,
  y: number,
  radius: number
): ActiveHazard {
  const container = scene.add.container(x, y).setDepth(kind === 'swamp' ? 7 : 915);
  let remaining = 5.0;
  let vx = 0;
  let vy = 0;

  if (kind === 'swamp') {
    remaining = 10.0;
    const bog = scene.add.ellipse(0, 0, radius * 1.5, radius * 0.9, 0x2d6a4f, 0.62).setStrokeStyle(2, 0x52b788, 0.85);
    const b1 = scene.add.circle(-18, -6, 6, 0x74c69d, 0.7);
    const b2 = scene.add.circle(20, 8, 5, 0x74c69d, 0.7);
    container.add([bog, b1, b2]);
  } else if (kind === 'swarm') {
    remaining = 4.5;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const r = Phaser.Math.Between(12, radius * 0.7);
      container.add(scene.add.circle(Math.cos(ang) * r, Math.sin(ang) * r * 0.7, 3, i % 2 === 0 ? 0x222814 : 0xb5e48c, 0.95));
    }
  } else if (kind === 'tornado') {
    remaining = 5.5;
    vx = Phaser.Math.FloatBetween(-36, 36);
    vy = Phaser.Math.FloatBetween(-24, 24);
    for (let i = 0; i < 5; i++) {
      const ring = scene.add.ellipse(0, -i * 14, 20 + i * 14, 10 + i * 5, 0xd8e2dc, 0.22).setStrokeStyle(2, 0xf8f9fa, 0.75);
      container.add(ring);
    }
  } else if (kind === 'volcano') {
    remaining = 7.5;
    scene.cameras.main.shake(340, 0.011);
    const gfx = scene.add.graphics();
    // Ground scorch shadow
    gfx.fillStyle(0x1a0c06, 0.55);
    gfx.fillEllipse(0, 26, 132, 46);
    // Shaded jagged volcanic mountain silhouette (lit left slope + shadowed right basalt slope)
    gfx.fillStyle(0x4b3022, 1);
    gfx.fillPoints([
      new Phaser.Geom.Point(-64, 24),
      new Phaser.Geom.Point(-42, -4),
      new Phaser.Geom.Point(-22, -44),
      new Phaser.Geom.Point(0, -48),
      new Phaser.Geom.Point(0, 28),
    ], true);
    gfx.fillStyle(0x2d1a12, 1);
    gfx.fillPoints([
      new Phaser.Geom.Point(0, -48),
      new Phaser.Geom.Point(22, -44),
      new Phaser.Geom.Point(44, -2),
      new Phaser.Geom.Point(64, 24),
      new Phaser.Geom.Point(0, 28),
    ], true);
    gfx.lineStyle(2, 0x1a0c06, 0.9);
    gfx.strokePoints([
      new Phaser.Geom.Point(-64, 24),
      new Phaser.Geom.Point(-42, -4),
      new Phaser.Geom.Point(-22, -44),
      new Phaser.Geom.Point(22, -44),
      new Phaser.Geom.Point(44, -2),
      new Phaser.Geom.Point(64, 24),
    ], false);
    // Glowing molten magma rivers & cracks streaming down the cone!
    gfx.lineStyle(3.5, 0xff4500, 0.95);
    gfx.beginPath();
    gfx.moveTo(-6, -42); gfx.lineTo(-14, -18); gfx.lineTo(-26, 10); gfx.lineTo(-34, 24);
    gfx.moveTo(8, -42); gfx.lineTo(18, -14); gfx.lineTo(12, 6); gfx.lineTo(24, 24);
    gfx.strokePath();
    gfx.lineStyle(1.6, 0xffd166, 0.95);
    gfx.beginPath();
    gfx.moveTo(-6, -42); gfx.lineTo(-14, -18); gfx.lineTo(-26, 10);
    gfx.moveTo(8, -42); gfx.lineTo(18, -14); gfx.lineTo(12, 6);
    gfx.strokePath();

    // Glowing molten caldera rim + rising ash plume
    const calderaGlow = scene.add.ellipse(0, -45, 50, 20, 0xff5400, 0.45);
    const calderaCore = scene.add.ellipse(0, -45, 34, 12, 0xffd166, 0.95);
    const smoke1 = scene.add.circle(-8, -64, 14, 0x2b2420, 0.48);
    const smoke2 = scene.add.circle(10, -76, 18, 0x3b322c, 0.36);
    container.add([gfx, calderaGlow, calderaCore, smoke1, smoke2]);
  }

  return { kind, x, y, vx, vy, radius, remaining, tickAccum: 0, container, phase: 0 };
}
