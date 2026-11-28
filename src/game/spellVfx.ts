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
    remaining = 6.0;
    scene.cameras.main.shake(300, 0.01);
    const cone = scene.add.polygon(0, 0, [-48, 22, -16, -34, 16, -34, 48, 22], 0x4a2c1d, 0.95).setStrokeStyle(2, 0x26140c);
    const lava = scene.add.ellipse(0, -34, 28, 12, 0xff5400, 0.95);
    container.add([cone, lava]);
  }

  return { kind, x, y, vx, vy, radius, remaining, tickAccum: 0, container, phase: 0 };
}
