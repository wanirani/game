// v2g effect anchors (docs/v2/AREA_FORMAT.md 6): real 3D fire, embers, smoke and mist from the effects engine at the places the
// area names. The matching baked light and the glow sprite are already in the stage; this adds the moving part:
//   fire      a layered blaze (below) and a flickering point light (lights the characters next to it)
//   embers    glowing sparks drifting up            smoke   a dark column
//   mist / fog_bank   wide slow ground haze         candle  a small steady flame       glow_red  slow red motes       leaves  falling flakes
//   candles   (not in the area data: found from the stage's candle groups) one small living flame per candle + a soft halo per group
// Budget: nothing is emitted for an anchor that is off screen or far from where the camera looks; only the nearest
// fires get a light (1 / 2 / 3 by effect tier - the engine keeps 3 / 5 / 8 lights in all, shots and hits need the rest).
import { E } from '../fx/engine.js';
import { SPR } from '../fx/sprites.js';
import { candleSpots } from '../env/props2.js';

// FIRE-2 (docs/v2/FX.md 13): one fire = layers of the flame flipbook, not teardrops.
//   BODY    wide flame tufts standing on the burning thing, one continuous sheet along its whole width (the foot of every quad stays where it was
//           born, the flipbook licks and tears at the top; quads overlap by more than half, so a wall-top fire is one fire, not a row)
//   CORE    small, short, nearly white flames at the foot        TONGUE  detached tongues (the wisp flipbook) that break away upward and thin out
//   HEAT    one or two soft glows over the foot (the warm haze on the wall behind)       SPARK  streaks shooting up       EMBER  slow drifting dots
//   SMOKE   soft dark puffs above the tongues
// Everything is emitted on a fixed beat per fire (an accumulator per layer, positions from a golden-ratio walk along the width): the number of
// live quads is steady, so a small bowl burns evenly, and the big overlapping quads are exactly as many as planned. All fire particles are
// `amb` (ambient): they do not count in the fill governor, so a fight next to a blaze keeps its hit effects at full strength.
// k = the fire's scale (a bowl 0.7, a house fire about 1.05, a wall-top / roof / wreck blaze 1.3 - 1.6): a body quad is about 66k wide and 100k tall.
const WARM = { body0: [1.3, 1.02, 0.8, 0.88], body1: [1.2, 0.55, 0.22, 0], core0: [1.9, 1.7, 1.3, 0.9], core1: [1.6, 0.9, 0.35, 0], tongue0: [1.55, 0.95, 0.5, 0.9], tongue1: [1.15, 0.3, 0.06, 0], heat0: [1.0, 0.4, 0.09, 0.15], heat1: [0.8, 0.22, 0.04, 0],
  spark0: [3.2, 1.65, 0.45, 1], spark1: [1.8, 0.3, 0.05, 0], ember0: [2.6, 1.0, 0.25, 1], ember1: [1.2, 0.15, 0.03, 0], smoke0: [0.3, 0.16, 0.09, 0.34], light: [1, 0.5, 0.17] };
// under the cold light of the crypt tonight: a paler fire with a blue-white core (the same sheet, other vertex colours)
const COLD = { body0: [0.8, 1.0, 1.45, 0.85], body1: [0.55, 0.6, 1.0, 0], core0: [1.25, 1.6, 2.3, 0.9], core1: [0.8, 1.0, 1.6, 0], tongue0: [0.85, 0.95, 1.3, 0.85], tongue1: [0.5, 0.45, 0.8, 0], heat0: [0.35, 0.5, 0.9, 0.13], heat1: [0.2, 0.3, 0.6, 0],
  spark0: [1.8, 2.2, 3.2, 1], spark1: [0.5, 0.7, 1.6, 0], ember0: [1.4, 1.7, 2.6, 1], ember1: [0.3, 0.4, 1.0, 0], smoke0: [0.08, 0.09, 0.12, 0.26], light: [0.6, 0.74, 1] };
const fireSet = (k, C) => ({
  k, bw: 66 * k, bh: 100 * k, light: C.light,
  BODY: E({ sprite: SPR.FIRE, aspect: 1.5, fps: [11, 15], shape: 3, rad: 3 * k, h: [0, 5 * k], speed: [10 * k, 22 * k], grav: -26 * k, life: [0.55, 0.72], size: [58 * k, 74 * k], grow: 1.12, c0: C.body0, c1: C.body1, add: 0.72, fadeIn: 0.2, pri: 1, amb: 1, min: 1 }),
  CORE: E({ sprite: SPR.FIRE, aspect: 1.15, fps: [14, 18], shape: 3, rad: 2 * k, h: [0, 3 * k], speed: [8 * k, 16 * k], life: [0.28, 0.38], size: [34 * k, 44 * k], grow: 1.1, c0: C.core0, c1: C.core1, fadeIn: 0.25, pri: 1, amb: 1, min: 1 }),
  TONGUE: E({ sprite: SPR.WISP, aspect: 1.75, shape: 3, rad: 4 * k, h: [30 * k, 56 * k], speed: [50 * k, 92 * k], drag: 0.8, grav: -110 * k, life: [0.42, 0.62], size: [40 * k, 54 * k], grow: 0.85, c0: C.tongue0, c1: C.tongue1, add: 0.88, fadeIn: 0.14, pri: 1, amb: 1, min: 1 }),
  HEAT: E({ sprite: SPR.GLOW, shape: 3, rad: 4 * k, h: [22 * k, 34 * k], speed: [4, 10], life: [0.5, 0.7], size: [96 * k, 118 * k], grow: 1.15, c0: C.heat0, c1: C.heat1, fadeIn: 0.3, amb: 1, min: 1 }),
  SPARK: E({ sprite: SPR.EMBER, shape: 0, spread: 0.42, speed: [90 * k, 210 * k], drag: 0.6, grav: -30, life: [0.5, 1.3], size: [2.6, 4.6], stretch: 2.2, c0: C.spark0, c1: C.spark1, jit: 7 * k, amb: 1, min: 1 }),
  EMBER: E({ sprite: SPR.EMBER, shape: 0, spread: 0.7, speed: [26 * k, 60 * k], drag: 0.35, grav: -12, life: [1.3, 2.5], size: [2.2, 3.6], spin: [-2, 2], c0: C.ember0, c1: C.ember1, jit: 9 * k, fadeIn: 0.1, amb: 1, min: 1 }),
  SMOKE: E({ sprite: SPR.SMOKE, add: 0, shape: 0, spread: 0.3, speed: [26 * k, 46 * k], drag: 0.3, grav: -14, life: [1.7, 2.6], size: [42 * k, 58 * k], grow: 2.3, c0: C.smoke0, c1: [0.15, 0.14, 0.14, 0], jit: 8 * k, fadeIn: 0.3, amb: 1, min: 1 }),
});
const SETS = new Map();   // built when an area is built, never in a frame
const setOf = (k, cold) => { const key = (cold ? 'c' : 'w') + k.toFixed(2); let s = SETS.get(key); if (!s) SETS.set(key, s = fireSet(+k.toFixed(2), cold ? COLD : WARM)); return s; };
const kOf = (size) => Math.max(0.4, size < 0.7 ? 0.7 + (size - 0.5) * 0.8 : size < 1 ? 1.0 + (size - 0.8) * 1.1 : 1.3 + (size - 1.05) * 1.35);   // three classes: bowl, house fire, blaze
const SPARK = E({ sprite: SPR.EMBER, shape: 3, rad: 9, h: [9, 30], speed: [72, 170], drag: 0.55, grav: -36, life: [0.5, 1.25], size: [2.6, 4.6], stretch: 2.2, c0: [3.2, 1.65, 0.45, 1], c1: [1.8, 0.3, 0.05, 0], jit: 4.5 });   // embers anchors (as before)
const COLUMN = E({ sprite: SPR.SMOKE, add: 0, shape: 3, rad: 22, h: [0, 20], speed: [40, 80], drag: 0.2, grav: -10, life: [2.4, 4], size: [56, 90], grow: 2.6, c0: [0.085, 0.075, 0.08, 0.36], c1: [0.15, 0.14, 0.15, 0], fadeIn: 0.2 });
const MIST = E({ sprite: SPR.SMOKE, add: 0, shape: 3, rad: 190, h: [6, 30], speed: [2, 8], life: [4, 7], size: [150, 230], grow: 1.5, c0: [0.3, 0.36, 0.4, 0.085], c1: [0.3, 0.36, 0.4, 0], fadeIn: 0.4 });
// a candle: the flame flipbook, small and slow, two quads alive per wick (born on a beat, cross-fading) + a soft halo per group
const CANDLE = E({ sprite: SPR.FIRE, aspect: 2.2, fps: [7, 10], life: [0.52, 0.52], size: [5.4, 6.4], c0: [1.6, 1.35, 1.0, 0.95], c1: [1.5, 1.15, 0.75, 0.55], fadeIn: 0.3, pri: 1, amb: 1, min: 1 });
const HALO = E({ sprite: SPR.GLOW, life: [0.7, 0.7], size: [30, 36], c0: [1.0, 0.6, 0.24, 0.13], c1: [1.0, 0.55, 0.2, 0.07], fadeIn: 0.35, amb: 1, min: 1 });
const MOTE = E({ sprite: SPR.EMBER, shape: 3, rad: 60, h: [0, 80], speed: [10, 34], life: [1.6, 3], size: [4, 7], c0: [2.6, 0.3, 0.2, 0.9], c1: [1.2, 0.05, 0.05, 0], fadeIn: 0.3 });
const LEAF = E({ sprite: SPR.FLAKE, add: 0, shape: 3, rad: 150, h: [150, 260], speed: [-60, -30], vy: [0, 0], drag: 0.2, life: [3, 4.6], size: [7, 12], spin: [-3, 3], c0: [0.42, 0.3, 0.14, 0.9], c1: [0.3, 0.2, 0.1, 0], fadeIn: 0.15, floor: 1 });
const RANGE2 = 2100 * 2100, GOLD = 0.6180339887, CANDLE_BEAT = 0.26, WIND = 0.2;   // WIND: sparks, embers and smoke lean this much towards +x
const frac = (v) => v - Math.floor(v);

export class Anchors {
  constructor() { this.list = []; this.lightMax = 2; this.fireK = 1; this.softK = 1; this.live = 0; this.lit = 0; this._round = 1; }
  build(area, tier, gAt = null) {   // gAt(x, z) = floor height there: an anchor with ground: true stands on the floor (world/index.js finishArea - a brazier on a raised terrace)
    this.list.length = 0;
    const parts = area.stage?.parts ?? [];
    for (const a of area.anchors) {
      const gy = a.ground && gAt ? gAt(a.x, a.z) : 0, y0 = (a.y ?? 0) + (Number.isFinite(gy) ? gy : 0);
      const size = a.size ?? 1, fire = a.kind === 'fire', o = { kind: a.kind, x: a.x, y: y0, z: a.z, size, light: !!a.light && fire, h: -1, vis: false, d2: 0, _pick: 0, rad: 160 };
      if (fire) {   // a fire burns a little in front of what it sits on (the camera looks along +z) so the wall top does not swallow the foot of the flames
        let cold = false;   // the fire part under this anchor says what light it gives: a cold (blue) light = the pale fire
        for (const P of parts) if (P.mesh === 'fire' && P.light?.c && Math.abs(P.x - a.x) < 60 && Math.abs(P.z - a.z) < 60 && P.light.c[2] > P.light.c[0]) cold = true;
        const F = setOf(kOf(size), cold), w = a.w ?? 50 * size, slots = Math.max(1, Math.round(w / (0.42 * F.bw)));
        o.y += 2; o.z -= 10; o.set = F; o.w = w; o.span = Math.max(0, w - 0.3 * F.bw); o.rad = 160 + w * 0.5 + F.bh;
        // live quads wanted per layer -> emission per second (life = the middle of the layer's range)
        o.rate = new Float32Array([Math.max(3, 2.6 * slots) / 0.63, Math.max(2, 1.7 * slots) / 0.33, Math.max(1.6, 1.3 * slots) / 0.57, Math.min(2.4, 0.9 + 0.35 * slots) / 0.6, 3 + 4.5 * slots, F.k >= 1 ? 1.2 + 2 * slots : 0, 1 + 0.45 * slots]);
        o.acc = new Float32Array(7); o.seq = new Uint32Array(7); for (let j = 0; j < 7; j++) { o.acc[j] = frac(a.x * 0.013 + j * 0.37); o.seq[j] = (a.x * 7 + j * 13) >>> 0; }
      }
      this.list.push(o);
    }
    for (const c of candleSpots(parts)) {   // every candle group of the stage: one small flame per wick (the world bakes none in the game)
      const gy = c.ground && gAt ? gAt(c.x, c.z) : 0, n = c.pts.length / 3;
      this.list.push({ kind: 'candles', x: c.x, y: c.y + (Number.isFinite(gy) ? gy : 0), z: c.z, size: 1, light: false, h: -1, vis: false, d2: 0, _pick: 0, rad: 60, pts: c.pts, n, t: frac(c.x * 0.37), i: 0 });
    }
    this.lightMax = tier === 'high' ? 3 : tier === 'low' ? 1 : 2;
    this.fireK = tier === 'high' ? 1 : tier === 'low' ? 0.62 : 0.85;   // flame layers: fewer quads on the lower tiers (their size stays: the fire keeps its shape)
    this.softK = tier === 'high' ? 1 : tier === 'low' ? 0.4 : 0.75;    // heat glow, sparks, embers, smoke
  }
  /** once per tick. dt = effect time step, m = view-projection, (cx, cz) = where the camera looks */
  tick(sc, fx, dt, m, cx, cz) {
    const L = this.list, P = fx.particles; let live = 0;
    if (!L.length) { this.live = 0; this.lit = 0; return; }
    for (let i = 0; i < L.length; i++) {
      const a = L[i], dx = a.x - cx, dz = a.z - cz; a.d2 = dx * dx + dz * dz;
      a.vis = a.d2 < RANGE2 && sc._seen(m, a.x, a.y, a.z, a.rad);
      if (!a.vis || dt <= 0) continue;
      live++;
      const s = a.size, k = dt * (a.d2 > 1200 * 1200 ? 0.55 : 1);   // far fires burn with fewer particles
      if (a.kind === 'fire') {
        const F = a.set, R = a.rate, A = a.acc, Q = a.seq, kf = k * this.fireK, ks = k * this.softK * P.gov, y = a.y, z = a.z, x0 = a.x - a.span * 0.5, sp = a.span;
        // each layer: the accumulator fills at its rate; every whole count is one quad at the next place along the width (at most 3 a tick)
        A[0] += R[0] * kf; for (let n = 0; A[0] >= 1 && n < 3; n++) { A[0] -= 1; P.emit(F.BODY, x0 + frac(++Q[0] * GOLD) * sp, y, z, 0, 1, 0, 0, y); }
        A[1] += R[1] * kf; for (let n = 0; A[1] >= 1 && n < 3; n++) { A[1] -= 1; P.emit(F.CORE, x0 + frac(++Q[1] * GOLD) * sp, y, z - 2, 0, 1, 0, 0, y); }
        A[2] += R[2] * kf; for (let n = 0; A[2] >= 1 && n < 3; n++) { A[2] -= 1; P.emit(F.TONGUE, x0 + frac(++Q[2] * GOLD) * sp, y, z + 1, 0, 1, 0, 0, y); }
        A[3] += R[3] * ks; for (let n = 0; A[3] >= 1 && n < 2; n++) { A[3] -= 1; P.emit(F.HEAT, x0 + frac(++Q[3] * GOLD) * sp, y, z - 4, 0, 1, 0, 0, y); }
        A[4] += R[4] * ks; for (let n = 0; A[4] >= 1 && n < 3; n++) { A[4] -= 1; P.emit(F.SPARK, x0 + frac(++Q[4] * GOLD) * sp, y + F.bh * 0.3, z, WIND, 0.98, 0, 0, y); }
        A[5] += R[5] * ks; for (let n = 0; A[5] >= 1 && n < 2; n++) { A[5] -= 1; P.emit(F.EMBER, x0 + frac(++Q[5] * GOLD) * sp, y + F.bh * 0.5, z, WIND * 1.6, 0.95, 0, 0, y); }
        A[6] += R[6] * ks; for (let n = 0; A[6] >= 1 && n < 2; n++) { A[6] -= 1; P.emit(F.SMOKE, x0 + frac(++Q[6] * GOLD) * sp, y + F.bh * 1.15, z + 6, WIND, 0.98, 0, 0, y); }
      }
      else if (a.kind === 'candles') {   // round robin: every wick gets a new flame quad each beat, the wicks one after the other; the halo twice a beat
        a.t += dt * a.n / CANDLE_BEAT;
        for (let n = 0; a.t >= 1 && n < 4; n++) {
          a.t -= 1; const j = a.i * 3, T = a.pts; P.emit(CANDLE, a.x + T[j], a.y + T[j + 1], a.z + T[j + 2], 0, 1, 0, 0, a.y);
          if (a.i === 0 || a.i === (a.n >> 1)) P.emit(HALO, a.x, a.y + 16, a.z - 4, 0, 1, 0, 0, a.y);
          a.i = (a.i + 1) % a.n;
        }
      }
      else if (a.kind === 'embers') P.emit(SPARK, a.x, a.y, a.z, 0, 1, 0, 9 * s * k, a.y);
      else if (a.kind === 'smoke') P.emit(COLUMN, a.x, a.y, a.z, 0, 1, 0, 4 * s * k, a.y);
      else if (a.kind === 'mist' || a.kind === 'fog_bank') P.emit(MIST, a.x, a.y, a.z, 0, 1, 0, (a.kind === 'fog_bank' ? 2.2 : 1.1) * s * k, a.y);
      else if (a.kind === 'candle') { a.t = (a.t ?? 0) + dt * 2 / CANDLE_BEAT; if (a.t >= 1) { a.t -= 1; P.emit(CANDLE, a.x, a.y, a.z, 0, 1, 0, 0, a.y); } }
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
      if (fx.lights._ok(best.h) < 0) best.h = fx.lights.add(best.x, best.y + 40 * best.size, best.z, 200 + 180 * best.size, best.set.light, 1.1, 1e7, 0.45, 1);   // (was 300 x size: a brazier's light reached only 150 px)
    }
    for (let i = 0; i < L.length; i++) { const a = L[i]; if (a.h >= 0 && a._pick !== this._round) { fx.lights.kill(a.h); a.h = -1; } }
    this._round++;
    this.live = live; this.lit = lit;
  }
  /** handles of a cleared / re-made effect engine are dead */
  reset() { for (const a of this.list) a.h = -1; }
}
