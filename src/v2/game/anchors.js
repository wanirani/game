// v2g effect anchors (docs/v2/AREA_FORMAT.md 6): real 3D fire, embers, smoke and mist from the effects engine at the places the
// area names. The matching baked light and the glow sprite are already in the stage; this adds the moving part:
//   fire      flame sheets + sparks + thin smoke, and a flickering point light (lights the characters next to it)
//   embers    glowing sparks drifting up            smoke   a dark column
//   mist / fog_bank   wide slow ground haze         candle  a small steady flame       glow_red  slow red motes       leaves  falling flakes
// Budget: nothing is emitted for an anchor that is off screen or far from where the camera looks; only the nearest
// fires get a light (1 / 2 / 3 by effect tier — the engine keeps 3 / 5 / 8 lights in all, shots and hits need the rest).
import { E } from '../fx/engine.js';
import { SPR } from '../fx/sprites.js';

const FLAME = E({ sprite: SPR.FLAME, shape: 3, rad: 13, h: [0, 8], speed: [55, 120], drag: 0.9, grav: -70, life: [0.4, 0.75], size: [30, 46], grow: 0.35, spin: [-1.4, 1.4], c0: [1.9, 0.85, 0.2, 0.62], c1: [0.95, 0.13, 0.02, 0], jit: 3, rot: 0 });
const CORE = E({ sprite: SPR.FLAME, shape: 3, rad: 6, h: [0, 4], speed: [40, 80], drag: 0.9, grav: -50, life: [0.3, 0.5], size: [20, 30], grow: 0.4, c0: [2.6, 1.9, 0.8, 0.7], c1: [1.6, 0.5, 0.06, 0], rot: 0 });
const SPARK = E({ sprite: SPR.EMBER, shape: 3, rad: 14, h: [10, 40], speed: [70, 210], drag: 0.5, grav: -30, life: [0.8, 1.9], size: [3, 6], c0: [3.2, 1.6, 0.4, 1], c1: [1.6, 0.25, 0.04, 0], jit: 6 });
const SMOKE = E({ sprite: SPR.SMOKE, add: 0, shape: 3, rad: 16, h: [40, 70], speed: [34, 70], drag: 0.25, grav: -14, life: [1.6, 2.8], size: [40, 66], grow: 2.3, c0: [0.1, 0.085, 0.085, 0.3], c1: [0.17, 0.15, 0.15, 0], fadeIn: 0.25 });
const COLUMN = E({ sprite: SPR.SMOKE, add: 0, shape: 3, rad: 22, h: [0, 20], speed: [40, 80], drag: 0.2, grav: -10, life: [2.4, 4], size: [56, 90], grow: 2.6, c0: [0.085, 0.075, 0.08, 0.36], c1: [0.15, 0.14, 0.15, 0], fadeIn: 0.2 });
const MIST = E({ sprite: SPR.SMOKE, add: 0, shape: 3, rad: 190, h: [6, 30], speed: [2, 8], life: [4, 7], size: [150, 230], grow: 1.5, c0: [0.3, 0.36, 0.4, 0.085], c1: [0.3, 0.36, 0.4, 0], fadeIn: 0.4 });
const CANDLE = E({ sprite: SPR.FLAME, shape: 3, rad: 1, h: [0, 1], speed: [8, 16], life: [0.3, 0.5], size: [9, 13], grow: 0.5, c0: [2.4, 1.5, 0.5, 0.8], c1: [1.4, 0.4, 0.05, 0], rot: 0 });
const MOTE = E({ sprite: SPR.EMBER, shape: 3, rad: 60, h: [0, 80], speed: [10, 34], life: [1.6, 3], size: [4, 7], c0: [2.6, 0.3, 0.2, 0.9], c1: [1.2, 0.05, 0.05, 0], fadeIn: 0.3 });
const LEAF = E({ sprite: SPR.FLAKE, add: 0, shape: 3, rad: 150, h: [150, 260], speed: [-60, -30], vy: [0, 0], drag: 0.2, life: [3, 4.6], size: [7, 12], spin: [-3, 3], c0: [0.42, 0.3, 0.14, 0.9], c1: [0.3, 0.2, 0.1, 0], fadeIn: 0.15, floor: 1 });
const FIRE_COL = [1, 0.5, 0.17];
const RANGE2 = 2100 * 2100;

export class Anchors {
  constructor() { this.list = []; this.lightMax = 2; this.live = 0; this.lit = 0; this._round = 1; }
  build(area, tier) {
    this.list.length = 0;
    for (const a of area.anchors) this.list.push({ kind: a.kind, x: a.x, y: a.y ?? 0, z: a.z, size: a.size ?? 1, light: !!a.light && a.kind === 'fire', h: -1, vis: false, d2: 0, _pick: 0 });
    this.lightMax = tier === 'high' ? 3 : tier === 'low' ? 1 : 2;
  }
  /** once per tick. dt = effect time step, m = view-projection, (cx, cz) = where the camera looks */
  tick(sc, fx, dt, m, cx, cz) {
    const L = this.list, P = fx.particles; let live = 0;
    if (!L.length) { this.live = 0; this.lit = 0; return; }
    for (let i = 0; i < L.length; i++) {
      const a = L[i], dx = a.x - cx, dz = a.z - cz; a.d2 = dx * dx + dz * dz;
      a.vis = a.d2 < RANGE2 && sc._seen(m, a.x, a.y, a.z, 160);
      if (!a.vis || dt <= 0) continue;
      live++;
      const s = a.size, k = dt * (a.d2 > 1200 * 1200 ? 0.55 : 1);   // far fires burn with fewer particles
      if (a.kind === 'fire') { P.emit(FLAME, a.x, a.y, a.z, 0, 1, 0, 26 * s * k, a.y); P.emit(CORE, a.x, a.y, a.z, 0, 1, 0, 12 * s * k, a.y); P.emit(SPARK, a.x, a.y, a.z, 0, 1, 0, 7 * s * k, a.y); P.emit(SMOKE, a.x, a.y, a.z, 0, 1, 0, 3.2 * s * k, a.y); }
      else if (a.kind === 'embers') P.emit(SPARK, a.x, a.y, a.z, 0, 1, 0, 9 * s * k, a.y);
      else if (a.kind === 'smoke') P.emit(COLUMN, a.x, a.y, a.z, 0, 1, 0, 4 * s * k, a.y);
      else if (a.kind === 'mist' || a.kind === 'fog_bank') P.emit(MIST, a.x, a.y, a.z, 0, 1, 0, (a.kind === 'fog_bank' ? 2.2 : 1.1) * s * k, a.y);
      else if (a.kind === 'candle') P.emit(CANDLE, a.x, a.y, a.z, 0, 1, 0, 14 * k, a.y);
      else if (a.kind === 'glow_red') P.emit(MOTE, a.x, a.y, a.z, 0, 1, 0, 5 * s * k, a.y);
      else if (a.kind === 'leaves') P.emit(LEAF, a.x, a.y, a.z, 0, 1, 0, 1.6 * s * k, a.y);
    }
    // lights: the nearest visible fires keep one flickering light each
    let lit = 0;
    for (let n = 0; n < this.lightMax; n++) {
      let best = null;
      for (let i = 0; i < L.length; i++) { const a = L[i]; if (!a.light || !a.vis || a._pick === this._round) continue; if (!best || a.d2 < best.d2) best = a; }
      if (!best) break;
      best._pick = this._round; lit++;
      if (fx.lights._ok(best.h) < 0) best.h = fx.lights.add(best.x, best.y + 46 * best.size, best.z, 300 * best.size, FIRE_COL, 1.05, 1e7, 0.4, 1);
    }
    for (let i = 0; i < L.length; i++) { const a = L[i]; if (a.h >= 0 && a._pick !== this._round) { fx.lights.kill(a.h); a.h = -1; } }
    this._round++;
    this.live = live; this.lit = lit;
  }
  /** handles of a cleared / re-made effect engine are dead */
  reset() { for (const a of this.list) a.h = -1; }
}
