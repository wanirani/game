// v2g effect anchors (docs/v2/AREA_FORMAT.md 6): real 3D fire, embers, smoke and mist from the effects engine at the places the
// area names. The matching baked light and the glow sprite are already in the stage; this adds the moving part:
//   fire      flame sheets + sparks + thin smoke, and a flickering point light (lights the characters next to it)
//   embers    glowing sparks drifting up            smoke   a dark column
//   mist / fog_bank   wide slow ground haze         candle  a small steady flame       glow_red  slow red motes       leaves  falling flakes
// Budget: nothing is emitted for an anchor that is off screen or far from where the camera looks; only the nearest
// fires get a light (1 / 2 / 3 by effect tier — the engine keeps 3 / 5 / 8 lights in all, shots and hits need the rest).
import { E } from '../fx/engine.js';
import { SPR } from '../fx/sprites.js';

// SPEED-FIRE: the fire is drawn only by these particles (the world bakes no flame leaves any more - env/props2.js flames).
// One fire = tapered tongues (flame sprite, upright, shrinking as they rise and speeding up - buoyancy) + a white-yellow core at the
// base + a soft hot glow that hides where the tongues start + spark streaks + a little smoke above. Sizes come in three classes
// (a brazier / bowl, a house fire, a wall-top or wreck blaze); a wide fire (w) burns from up to 4 points along its width.
const fireSet = (k) => ({
  k,
  TONGUE: E({ sprite: SPR.FLAME, shape: 3, rad: 10 * k, h: [0, 8 * k], speed: [40 * k, 78 * k], drag: 1.1, grav: -170 * k, life: [0.38, 0.62], size: [34 * k, 50 * k], grow: 0.26, spin: [-0.35, 0.35], rot: 0, c0: [2.05, 0.8, 0.17, 0.6], c1: [1.05, 0.16, 0.03, 0], jit: 4 * k, fadeIn: 0.07 }),
  CORE: E({ sprite: SPR.FLAME, shape: 3, rad: 6 * k, h: [0, 4 * k], speed: [20 * k, 40 * k], drag: 1, grav: -80 * k, life: [0.22, 0.34], size: [20 * k, 30 * k], grow: 0.55, spin: [-0.2, 0.2], rot: 0, c0: [2.9, 2.1, 0.95, 0.88], c1: [2.0, 0.75, 0.14, 0], fadeIn: 0.05 }),
  HEAT: E({ sprite: SPR.GLOW, shape: 3, rad: 6 * k, h: [6 * k, 12 * k], speed: [6, 14], life: [0.26, 0.42], size: [54 * k, 72 * k], grow: 1.1, c0: [1.15, 0.42, 0.09, 0.2], c1: [0.8, 0.2, 0.04, 0], fadeIn: 0.15 }),
  SPARK: E({ sprite: SPR.EMBER, shape: 3, rad: 10 * k, h: [10 * k, 34 * k], speed: [80 * k, 190 * k], drag: 0.55, grav: -36, life: [0.5, 1.25], size: [2.6, 4.6], stretch: 2.2, c0: [3.2, 1.65, 0.45, 1], c1: [1.8, 0.3, 0.05, 0], jit: 5 * k }),
  SMOKE: E({ sprite: SPR.SMOKE, add: 0, shape: 3, rad: 12 * k, h: [56 * k, 80 * k], speed: [20 * k, 40 * k], drag: 0.3, grav: -18, life: [1.4, 2.4], size: [30 * k, 48 * k], grow: 2.2, c0: [0.09, 0.075, 0.075, 0.22], c1: [0.15, 0.14, 0.14, 0], fadeIn: 0.3 }),
});
const FIRE_S = fireSet(0.55), FIRE_M = fireSet(0.9), FIRE_L = fireSet(1.25);
const SPARK = FIRE_M.SPARK;   // embers anchors: the same spark streaks
const SMOKE = E({ sprite: SPR.SMOKE, add: 0, shape: 3, rad: 16, h: [40, 70], speed: [34, 70], drag: 0.25, grav: -14, life: [1.6, 2.8], size: [40, 66], grow: 2.3, c0: [0.1, 0.085, 0.085, 0.3], c1: [0.17, 0.15, 0.15, 0], fadeIn: 0.25 });
const COLUMN = E({ sprite: SPR.SMOKE, add: 0, shape: 3, rad: 22, h: [0, 20], speed: [40, 80], drag: 0.2, grav: -10, life: [2.4, 4], size: [56, 90], grow: 2.6, c0: [0.085, 0.075, 0.08, 0.36], c1: [0.15, 0.14, 0.15, 0], fadeIn: 0.2 });
const MIST = E({ sprite: SPR.SMOKE, add: 0, shape: 3, rad: 190, h: [6, 30], speed: [2, 8], life: [4, 7], size: [150, 230], grow: 1.5, c0: [0.3, 0.36, 0.4, 0.085], c1: [0.3, 0.36, 0.4, 0], fadeIn: 0.4 });
const CANDLE = E({ sprite: SPR.FLAME, shape: 3, rad: 1, h: [0, 1], speed: [10, 18], grav: -30, life: [0.24, 0.4], size: [8, 12], grow: 0.35, c0: [2.6, 1.7, 0.6, 0.85], c1: [1.5, 0.45, 0.06, 0], rot: 0 });
const MOTE = E({ sprite: SPR.EMBER, shape: 3, rad: 60, h: [0, 80], speed: [10, 34], life: [1.6, 3], size: [4, 7], c0: [2.6, 0.3, 0.2, 0.9], c1: [1.2, 0.05, 0.05, 0], fadeIn: 0.3 });
const LEAF = E({ sprite: SPR.FLAKE, add: 0, shape: 3, rad: 150, h: [150, 260], speed: [-60, -30], vy: [0, 0], drag: 0.2, life: [3, 4.6], size: [7, 12], spin: [-3, 3], c0: [0.42, 0.3, 0.14, 0.9], c1: [0.3, 0.2, 0.1, 0], fadeIn: 0.15, floor: 1 });
const FIRE_COL = [1, 0.5, 0.17];
const RANGE2 = 2100 * 2100;

export class Anchors {
  constructor() { this.list = []; this.lightMax = 2; this.live = 0; this.lit = 0; this._round = 1; }
  build(area, tier) {
    this.list.length = 0;
    for (const a of area.anchors) {
      const size = a.size ?? 1, set = size < 0.6 ? FIRE_S : size < 1.05 ? FIRE_M : FIRE_L, w = a.w ?? 50 * size, pts = a.kind === 'fire' ? Math.max(1, Math.min(4, Math.round(w / (58 * set.k)))) : 1;
      const fire = a.kind === 'fire';   // a fire burns a little in front of what it sits on (the camera looks along +z) so the wall top does not swallow the base of the tongues
      this.list.push({ kind: a.kind, x: a.x, y: (a.y ?? 0) + (fire ? 4 : 0), z: a.z - (fire ? 10 : 0), size, rs: Math.pow(size, 0.6), set, pts, step: pts > 1 ? (w * 0.78) / (pts - 1) : 0, per: (1 + 0.25 * (pts - 1)) / pts, light: !!a.light && a.kind === 'fire', h: -1, vis: false, d2: 0, _pick: 0 });
    }
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
      if (a.kind === 'fire') {   // per point along the fire's width: tongues, core, heat; sparks and smoke once for the whole fire
        const F = a.set, r = a.rs * k, q = r * a.per, x0 = a.x - (a.step * (a.pts - 1)) / 2;   // rates follow size^0.6: a small bowl still needs a dozen tongues to read as fire
        for (let j = 0; j < a.pts; j++) { const px = x0 + a.step * j; P.emit(F.TONGUE, px, a.y, a.z, 0, 1, 0, 42 * q, a.y); P.emit(F.CORE, px, a.y, a.z, 0, 1, 0, 16 * q, a.y); P.emit(F.HEAT, px, a.y, a.z, 0, 1, 0, 6 * q, a.y); }
        P.emit(F.SPARK, a.x, a.y, a.z, 0, 1, 0, 5 * r, a.y); P.emit(F.SMOKE, a.x, a.y, a.z, 0, 1, 0, 2.2 * r, a.y);
      }
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
      if (fx.lights._ok(best.h) < 0) best.h = fx.lights.add(best.x, best.y + 40 * best.size, best.z, 200 + 180 * best.size, FIRE_COL, 1.1, 1e7, 0.45, 1);   // (was 300 × size: a brazier's light reached only 150 px)
    }
    for (let i = 0; i < L.length; i++) { const a = L[i]; if (a.h >= 0 && a._pick !== this._round) { fx.lights.kill(a.h); a.h = -1; } }
    this._round++;
    this.live = live; this.lit = lit;
  }
  /** handles of a cleared / re-made effect engine are dead */
  reset() { for (const a of this.list) a.h = -1; }
}
