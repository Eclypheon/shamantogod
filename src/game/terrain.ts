export const WORLD_W = 1600;
export const WORLD_H = 1000;
export const CELL_SIZE = 20;
export const GRID_COLS = WORLD_W / CELL_SIZE; // 80
export const GRID_ROWS = WORLD_H / CELL_SIZE; // 50

export function wrapCoord(v: number, size: number): number {
  const r = v % size;
  return r < 0 ? r + size : r;
}

export function wrapDelta(from: number, to: number, size: number): number {
  let d = (to - from) % size;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
}

export function wrapDist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(wrapDelta(x1, x2, WORLD_W), wrapDelta(y1, y2, WORLD_H));
}

function rgbParts(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Periodic toroidal/spherical-wrap elevation heightmap.
 * h < 0: Water / River / Ocean (impassable until bridged by Landbridge)
 * 0 <= h < 0.34: Flat buildable grass
 * 0.34 <= h < 1.18: Undulating hills (walkable; Braves must stomp or player casts Flatten before building)
 * h >= 1.18: Rocky mountains (impassable peaks)
 */
export class PlanetTerrain {
  readonly cols = GRID_COLS;
  readonly rows = GRID_ROWS;
  readonly heights: Float32Array;
  readonly planetId: number;

  constructor(planetId: number) {
    this.planetId = planetId;
    this.heights = new Float32Array(this.cols * this.rows);
    this.generate(planetId);
  }

  private idx(c: number, r: number): number {
    const wc = ((c % this.cols) + this.cols) % this.cols;
    const wr = ((r % this.rows) + this.rows) % this.rows;
    return wr * this.cols + wc;
  }

  cellAt(x: number, y: number): { c: number; r: number } {
    const wx = wrapCoord(x, WORLD_W);
    const wy = wrapCoord(y, WORLD_H);
    return {
      c: Math.floor(wx / CELL_SIZE) % this.cols,
      r: Math.floor(wy / CELL_SIZE) % this.rows,
    };
  }

  getHeight(x: number, y: number): number {
    const { c, r } = this.cellAt(x, y);
    return this.heights[this.idx(c, r)];
  }

  isWater(x: number, y: number): boolean {
    return this.getHeight(x, y) < 0;
  }

  isMountain(x: number, y: number): boolean {
    return this.getHeight(x, y) >= 1.18;
  }

  isWalkable(x: number, y: number): boolean {
    const h = this.getHeight(x, y);
    return h >= 0 && h < 1.18;
  }

  isFlat(x: number, y: number): boolean {
    const h = this.getHeight(x, y);
    return h >= 0 && h < 0.34;
  }

  private generate(planetId: number): void {
    const seed = planetId * 1.37;
    const hasRiver = planetId >= 5;
    const mountainAmp = planetId === 1 ? 0.25 : Math.min(0.95, 0.35 + planetId * 0.06);

    for (let r = 0; r < this.rows; r++) {
      const v = (r / this.rows) * Math.PI * 2;
      const wy = (r + 0.5) * CELL_SIZE;
      for (let c = 0; c < this.cols; c++) {
        const u = (c / this.cols) * Math.PI * 2;
        const wx = (c + 0.5) * CELL_SIZE;

        // Seamless periodic continents + undulating hills using integer harmonics
        let h =
          0.42 +
          0.42 * Math.cos(u - Math.PI) * Math.cos(v - Math.PI) +
          0.26 * Math.sin(u * 2 + seed) * Math.cos(v + seed * 0.7) +
          0.22 * Math.cos(u * 3 - seed * 0.5) * Math.sin(v * 2 + seed) +
          0.16 * Math.sin(u * 4 + v * 3 + seed);

        // Mountain ridges on Planet 2+
        const ridge = Math.pow(Math.max(0, Math.sin(u * 2 + v + seed) * Math.cos(u - v * 2)), 2);
        h += ridge * mountainAmp * 1.5;

        // Ocean straits near wrap edges so the globe has multiple distinct landmasses
        const edgeOcean = Math.sin(u * 2 + 0.6) * Math.sin(v * 2 - 0.4);
        if (edgeOcean < -0.58) {
          h -= 0.75;
        }

        // Wide navigable river separating player homeland (center) from eastern/western rivals on Planet 5+
        if (hasRiver) {
          const riverX1 = WORLD_W / 2 + 235 + Math.sin(v * 2 + seed) * 32;
          const riverX2 = WORLD_W / 2 - 245 + Math.cos(v * 2 + seed) * 32;
          const dRiver = Math.min(
            Math.abs(wrapDelta(wx, riverX1, WORLD_W)),
            Math.abs(wrapDelta(wx, riverX2, WORLD_W))
          );
          if (dRiver < 34) {
            h = -0.55 + (dRiver / 34) * 0.35;
          }
        } else if (planetId >= 3) {
          // Gentle scenic river curve on Planets 3-4 (with natural ford)
          const riverY = WORLD_H / 2 + 165 + Math.sin(u * 2) * 30;
          const dRiver = Math.abs(wrapDelta(wy, riverY, WORLD_H));
          if (dRiver < 24 && Math.abs(wrapDelta(wx, WORLD_W / 2, WORLD_W)) > 75) {
            h = -0.35;
          }
        }

        // Keep Shaman starting plateau & rival base pads above water and non-mountain,
        // while leaving village build slots undulating (0.45..0.62) so stomping / Flatten matters!
        const dCenter = wrapDist(wx, wy, WORLD_W / 2, WORLD_H / 2);
        if (dCenter < 55) {
          h = 0.22; // flat Shaman spawn clearing
        } else if (dCenter < 195) {
          h = Math.max(0.44, Math.min(0.72, h < 0.42 ? 0.48 + 0.14 * Math.sin(u * 6 + v * 5) : h));
        }

        // Keep rival village hubs on solid land (spread wide across the globe, especially on later planets!)
        const rivalHubs = [
          [WORLD_W / 2 + 560, WORLD_H / 2 - 140],
          [WORLD_W / 2 - 560, WORLD_H / 2 + 120],
          [WORLD_W / 2 + 120, WORLD_H / 2 + 370],
          [WORLD_W / 2 - 180, WORLD_H / 2 - 360],
        ];
        for (const [rx, ry] of rivalHubs) {
          const dRival = wrapDist(wx, wy, rx, ry);
          if (dRival < 115) {
            h = Math.max(0.26, Math.min(0.65, h));
          }
        }

        this.heights[this.idx(c, r)] = h;
      }
    }
  }

  /**
   * True Populous Flatten: samples the altitude at (cx, cy) and levels surrounding cells in radius to that SAME altitude.
   * Cast in water -> turns surrounding land into water. Cast on mountain -> raises surrounding land to mountain height.
   */
  flattenArea(cx: number, cy: number, radius: number, explicitTargetH?: number): { changed: number; targetH: number } {
    const targetH = explicitTargetH ?? this.getHeight(cx, cy);
    let changed = 0;
    const cellsR = Math.ceil(radius / CELL_SIZE) + 1;
    const center = this.cellAt(cx, cy);
    for (let dr = -cellsR; dr <= cellsR; dr++) {
      for (let dc = -cellsR; dc <= cellsR; dc++) {
        const c = ((center.c + dc) % this.cols + this.cols) % this.cols;
        const r = ((center.r + dr) % this.rows + this.rows) % this.rows;
        const wx = (c + 0.5) * CELL_SIZE;
        const wy = (r + 0.5) * CELL_SIZE;
        if (wrapDist(cx, cy, wx, wy) <= radius) {
          const idx = this.idx(c, r);
          if (Math.abs(this.heights[idx] - targetH) > 0.06) changed++;
          this.heights[idx] = targetH;
        }
      }
    }
    return { changed, targetH };
  }

  /** Brave stomping: flattens a small 3x3 build footprint to flat buildable meadow. */
  stompFootprint(cx: number, cy: number): void {
    this.flattenArea(cx, cy, 32, 0.16);
  }

  /** Landbridge spell: raises a walkable earthen bridge strip from (x1,y1) to (x2,y2) across rivers/water. */
  raiseLandbridge(x1: number, y1: number, x2: number, y2: number, halfWidth = 28): number {
    const dx = wrapDelta(x1, x2, WORLD_W);
    const dy = wrapDelta(y1, y2, WORLD_H);
    const dist = Math.max(20, Math.hypot(dx, dy));
    const steps = Math.ceil(dist / 12);
    let raised = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = wrapCoord(x1 + dx * t, WORLD_W);
      const py = wrapCoord(y1 + dy * t, WORLD_H);
      const center = this.cellAt(px, py);
      const cellsR = Math.ceil(halfWidth / CELL_SIZE);
      for (let dr = -cellsR; dr <= cellsR; dr++) {
        for (let dc = -cellsR; dc <= cellsR; dc++) {
          const c = ((center.c + dc) % this.cols + this.cols) % this.cols;
          const r = ((center.r + dr) % this.rows + this.rows) % this.rows;
          const wx = (c + 0.5) * CELL_SIZE;
          const wy = (r + 0.5) * CELL_SIZE;
          if (wrapDist(px, py, wx, wy) <= halfWidth) {
            const idx = this.idx(c, r);
            if (this.heights[idx] < 0.2 || this.heights[idx] >= 1.18) {
              this.heights[idx] = 0.22;
              raised++;
            }
          }
        }
      }
    }
    return raised;
  }

  /** Erode spell: lowers terrain elevation in radius, sinking land/coast into water. */
  erodeArea(cx: number, cy: number, radius: number): number {
    let sunk = 0;
    const cellsR = Math.ceil(radius / CELL_SIZE) + 1;
    const center = this.cellAt(cx, cy);
    for (let dr = -cellsR; dr <= cellsR; dr++) {
      for (let dc = -cellsR; dc <= cellsR; dc++) {
        const c = ((center.c + dc) % this.cols + this.cols) % this.cols;
        const r = ((center.r + dr) % this.rows + this.rows) % this.rows;
        const wx = (c + 0.5) * CELL_SIZE;
        const wy = (r + 0.5) * CELL_SIZE;
        const d = wrapDist(cx, cy, wx, wy);
        if (d <= radius) {
          const idx = this.idx(c, r);
          const falloff = 1 - (d / radius) * 0.5;
          const prev = this.heights[idx];
          this.heights[idx] = Math.max(-0.85, prev - 0.85 * falloff);
          if (prev >= 0 && this.heights[idx] < 0) sunk++;
        }
      }
    }
    return sunk;
  }

  /** Bilinear-interpolated height sample for smooth organic coastlines, hills, rivers, and mountain ridges. */
  private sampleSmooth(wx: number, wy: number): number {
    const fx = wrapCoord(wx, WORLD_W) / CELL_SIZE - 0.5;
    const fy = wrapCoord(wy, WORLD_H) / CELL_SIZE - 0.5;
    const c0 = Math.floor(fx);
    const r0 = Math.floor(fy);
    const tx = fx - c0;
    const ty = fy - r0;
    const h00 = this.heights[this.idx(c0, r0)];
    const h10 = this.heights[this.idx(c0 + 1, r0)];
    const h01 = this.heights[this.idx(c0, r0 + 1)];
    const h11 = this.heights[this.idx(c0 + 1, r0 + 1)];
    const top = h00 + (h10 - h00) * tx;
    const bot = h01 + (h11 - h01) * tx;
    return top + (bot - top) * ty;
  }

  /** Renders high-res (800x500) crisp textured terrain, water ripples, sandy shores, hill-shaded grass, and mountain crags. */
  renderToCanvas(ctx: CanvasRenderingContext2D, groundColor: number, waterColor: number): void {
    const rw = 800;
    const rh = 500;
    const off = document.createElement('canvas');
    off.width = rw;
    off.height = rh;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(rw, rh);
    const data = img.data;

    const [gr, gg, gb] = rgbParts(groundColor);
    const [wr, wg, wb] = rgbParts(waterColor);
    const stepX = WORLD_W / rw;
    const stepY = WORLD_H / rh;

    for (let y = 0; y < rh; y++) {
      const wy = (y + 0.5) * stepY;
      for (let x = 0; x < rw; x++) {
        const wx = (x + 0.5) * stepX;
        const h = this.sampleSmooth(wx, wy);
        const hR = this.sampleSmooth(wx + 6, wy);
        const hD = this.sampleSmooth(wx, wy + 6);
        const slope = (h - hR) * 1.25 + (h - hD) * 1.25;

        // Deterministic crisp micro-grain (matches pixel-art building/unit detail!)
        const n = (((x * 374761393 + y * 668265263) ^ (x * y * 1274126177)) >>> 0) % 256;
        const grain = (n / 255 - 0.5) * 0.11;

        let r: number;
        let g: number;
        let b: number;

        if (h < -0.2) {
          // Deep ocean / river with crisp horizontal wave shimmer bands
          const wave = Math.sin(wx * 0.14 + Math.sin(wy * 0.08) * 2.2) * Math.cos(wy * 0.24) * 0.09;
          const f = 0.84 + Math.max(-0.16, h * 0.14) + wave + grain * 0.4;
          r = wr * f;
          g = wg * (f + 0.04);
          b = wb * (f + 0.08);
        } else if (h < -0.03) {
          // Crisp turquoise coastal shoal with fine ripples
          const t = (h + 0.2) / 0.17;
          const ripple = Math.sin(wx * 0.2 + wy * 0.28) * 0.06;
          r = wr * (0.9 + t * 0.48 + ripple);
          g = wg * (1.04 + t * 0.56 + ripple);
          b = wb * (1.08 + t * 0.46 + ripple);
        } else if (h < 0.005) {
          // Crisp shoreline surf foam
          const foam = 0.94 + grain * 0.6;
          r = 212 * foam;
          g = 238 * foam;
          b = 244 * foam;
        } else if (h < 0.09) {
          // Textured warm sandy shore
          const sand = 1.0 + grain * 0.9 + slope * 0.2;
          r = 202 * sand;
          g = 176 * sand;
          b = 128 * sand;
        } else if (h < 0.34) {
          // Flat buildable sunlit meadow with subtle grass texture
          const tuft = (n % 19 === 0 ? -0.07 : n % 23 === 0 ? 0.06 : 0);
          const f = 1.13 + slope * 0.18 + grain * 0.75 + tuft;
          r = gr * f;
          g = gg * f;
          b = gb * f;
        } else if (h < 1.18) {
          // Undulating hills with directional northwest hill-shading & grass/earth texture
          const contour = Math.abs((h * 8) % 1 - 0.5) < 0.04 ? -0.045 : 0;
          const f = Math.max(0.68, Math.min(1.32, 0.96 + slope * 0.78 + (h - 0.52) * 0.12 + grain * 0.85 + contour));
          r = gr * f;
          g = gg * f;
          b = gb * f;
        } else if (h < 1.5) {
          // Craggy granite mountain slopes with stone speckle
          const f = Math.max(0.62, Math.min(1.3, 0.94 + slope * 0.95 + grain * 1.4));
          r = 116 * f;
          g = 104 * f;
          b = 92 * f;
        } else {
          // Snow-capped mountain peaks with crisp facet shading
          const f = Math.max(0.84, Math.min(1.14, 1.0 + slope * 0.42 + grain * 0.5));
          r = 228 * f;
          g = 224 * f;
          b = 214 * f;
        }

        const p = (y * rw + x) * 4;
        data[p] = clampByte(r);
        data[p + 1] = clampByte(g);
        data[p + 2] = clampByte(b);
        data[p + 3] = 255;
      }
    }

    octx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, WORLD_W, WORLD_H);

    // Subtle packed-earth village paths radiating from center
    ctx.strokeStyle = 'rgba(155, 128, 84, 0.22)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(WORLD_W / 2, WORLD_H / 2);
    ctx.lineTo(WORLD_W / 2 - 245, WORLD_H / 2 - 150);
    ctx.moveTo(WORLD_W / 2, WORLD_H / 2);
    ctx.lineTo(WORLD_W / 2 + 235, WORLD_H / 2 - 145);
    ctx.moveTo(WORLD_W / 2, WORLD_H / 2);
    ctx.lineTo(WORLD_W / 2, WORLD_H / 2 + 210);
    ctx.stroke();
  }
}
