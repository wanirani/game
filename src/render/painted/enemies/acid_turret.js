// T1 painted sprite: 산성 증류기 (acid_turret, 44×70, stationary). Painted from the Kling reference: 'base' = the brick
// furnace with its glowing fire mouth, 'body' = the stone slab, riveted copper boiler, gauge, red valve wheel, the big
// round glass flask of glowing acid and the curved glass neck into the copper condenser nozzle.
// Procedural on top: fire flicker, acid glow and boiling bubbles in the flask, steam, drips from the nozzle.
// Driven by AI_B.distiller: idle (simmering) · charge (params.charge 0.8 s: the apparatus rattles harder and harder, the
// flask boils over with light, a glint swells at the nozzle) · fire (0.4 s: recoil squash, flash at the nozzle, a burst of
// acid drops) · hurt (flash + squash) · death (the glass bursts: the parts topple off the furnace in a green splash).
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { glint } from './_biped.js';
import { claimDeathDebris } from './blood_skeleton.js';

export const spec = {
  id: 'acid_turret', tier: 'T1', src: 'acid_turret',
  bake: { outline: 0.35 },
};

const _q = [0, 0], _n = [0, 0];

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const ck = an === 'charge' ? clamp(at / (e.params?.charge ?? 0.8), 0, 1) : 0;
  const fk = an === 'fire' ? 1 - clamp(at / 0.4, 0, 1) : 0;
  return { t, ck, fk, shake: an === 'charge' ? Math.sin(t * 60) * ck * 1.2 : 0, sq: 1 - fk * 0.06 };
}

function die(e, world, rig, q) {
  e._pcorpse = true;
  claimDeathDebris(world, e);
  K.spawnCorpse(world, e, rig, [
    { name: 'base', pv: 'a', x: 0, y: 0, rot: 0, sx: 1, sy: 1, vx: K.frand(-20, 20), vy: -K.frand(20, 60), vr: K.frand(-0.5, 0.5) },
    { name: 'body', pv: 'a', x: q.shake, y: 0, rot: 0, sx: 1, sy: 1, vx: K.frand(-90, 90), vy: -K.frand(180, 280), vr: K.frand(-5, 5) },
  ], { life: 1.5, fade: 0.55, bounce: 0.2, dust: { n: 14, w: 22, h: 40, col: '#9aff4a', k: 0 },
    after: (age) => { if (age < 0.4) K.glow(0, -40, 40 * (1 - age * 2), '#b0ff4a', 0.8 * (1 - age * 2.5)); } });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0 && world) { if (!e._pcorpse) die(e, world, rig, q); return; }
  const t = q.t, sq = K.squashK(e);
  const sx = 1 + 0.04 * sq, sy = q.sq * (1 - 0.05 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(24, 0.5);
  K.put('base', 'a', q.shake * 0.3, 0, 0, sx, sy);
  if (!o.flash) {
    K.pivotPos('base', 'a', 'fire', q.shake * 0.3, 0, 0, sx, sy, _q);
    const fl = 0.75 + 0.25 * Math.sin(t * 17) + 0.12 * Math.sin(t * 29) + q.ck * 0.5;
    K.glow(_q[0], _q[1], 12 + q.ck * 8, '#ff8a2a', 0.55 * fl, 0.2);
  }
  K.put('body', 'a', q.shake, 0, 0, sx, sy);
  if (!o.flash) {
    K.pivotPos('body', 'a', 'flask', q.shake, 0, 0, sx, sy, _q);
    const fx = _q[0], fy = _q[1];
    K.glow(fx, fy, 16 + q.ck * 12, '#9aff4a', 0.35 + q.ck * 0.5, 0.25);
    // boiling: bubbles rise through the acid (additive dots inside the flask; faster and bigger while charging)
    if (K.lod() > 0) {
      const n = 4 + Math.round(q.ck * 4);
      for (let i = 0; i < n; i++) {
        const h = K.h1(i * 7.3), u = (t * (0.7 + q.ck * 1.8 + h * 0.4) + h) % 1;
        K.glow(fx + (K.h1(i + 3.1) - 0.5) * 11, fy + 6 - u * 10, 1.2 + h * 1.4 + q.ck, '#e8ffc0', 0.6 * (1 - u), 0.3);
      }
    }
    K.pivotPos('body', 'a', 'nozzle', q.shake, 0, 0, sx, sy, _n);
    if (q.ck > 0.5) glint(ctx, _n[0], _n[1], 4 + 6 * q.ck, '#d8ff9a', (q.ck - 0.5) * 2);
    if (q.fk > 0) { K.glow(_n[0], _n[1], 20 * q.fk + 6, '#b0ff4a', q.fk); K.glow(_n[0], _n[1], 7, '#ffffe0', q.fk); }
  }
  K.end();
  // steam off the flask neck, acid drips from the nozzle (render-only, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(24));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    const nx = e.cx + f * _n[0] * sc, ny = e.bottom + _n[1] * sc;
    for (let n = pool.rate(0, (K.lod() === 0 ? 1.2 : 2.4) * (1 + q.ck * 2), dt); n > 0; n--) pool.add(1, nx + K.frand(-1, 1), ny + 2, 0, K.frand(10, 40), K.frand(0.5, 0.8), 1.6 * sc, '#9aff4a');
    for (let n = pool.rate(1, (K.lod() === 0 ? 1 : 2) * (1 + q.ck * 3), dt); n > 0; n--) pool.add(2, e.cx + f * K.frand(-4, 6) * sc, e.bottom - K.frand(58, 66) * sc, K.frand(-8, 8), K.frand(-30, -14), K.frand(0.8, 1.4), K.frand(3, 5) * sc, '#c8d8c0');
    if (q.fk > 0.9 && !e._fireFx) { e._fireFx = true; for (let i = 0; i < 8; i++) pool.add(0, nx, ny, f * K.frand(20, 140), K.frand(-160, -20), K.frand(0.25, 0.45), K.frand(3, 5) * sc, '#b0ff4a'); }
    if (q.fk <= 0) e._fireFx = false;
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
