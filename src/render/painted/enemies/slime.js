// T1 painted sprite: 연금 슬라임 (slime, 40×30; the split-off small ones are the same art scaled by the AI, e.scale 0.62).
// Parts (Kling reference, one image): 'body' = the translucent green dome with the half-dissolved skull and bones and
// the slit-pupil alchemical core eye, 'puddle' = the slime it sits in (drawn only on the ground, spreads on landing).
// Driven by AI_B.slime: idle (slow jelly breathing, seam-free warpY wobble) · squash (0.36 s: flattens and bulges, the
// core flares, a glint swells on its front → it hops) · jump (stretched along the velocity, puddle left behind) · land
// (0.22 s splat: wide squash with a jiggle, green drips thrown out) · hurt (flash + violent wobble + splatter) · death
// (strip dissolve into green slime drops).
import * as K from '../enemy_kit.js';
import { clamp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'slime', tier: 'T1', src: 'slime',
  bake: { outline: 0.3, glow: { body: '#6aff3a' } },
};

const _q = [0, 0];
let T = 0, AMP = 1, TD = 2;
/** jelly wobble: u = 0 at the bottom pivot … 1 at the top; the top sways most */
function wobble(u) {
  _q[0] = (Math.sin(T * 4.2 + u * 3.1) * 0.9 + Math.sin(T * 7.3 - u * 2) * 0.35) * AMP * u * TD; _q[1] = 0;
  return _q;
}

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  let sx = 1, sy = 1, lift = 0, air = false, flare = 0, splat = 0;
  if (an === 'squash') { const k = ease.outCubic(clamp(at / 0.3, 0, 1)); sx = 1 + 0.28 * k; sy = 1 - 0.32 * k; flare = k; }
  else if (an === 'jump') { const v = clamp((e.vy ?? 0) / 700, -1, 1); sx = 1 - 0.16 * Math.abs(v); sy = 1 + 0.24 * Math.abs(v); lift = 2; air = true; }
  else if (an === 'land') { const k = 1 - clamp(at / 0.22, 0, 1); sx = 1 + 0.35 * k * (1 + Math.sin(at * 40) * 0.2); sy = 1 - 0.3 * k; splat = k; }
  else { sx = 1 + Math.sin(t * 4) * 0.05; sy = 1 - Math.sin(t * 4) * 0.05; }
  if (e.onGround === false && an !== 'jump') { air = true; lift = 2; }
  const q = Q;   // reused every frame (no per-frame allocation)
  q.t = t; q.sx = sx; q.sy = sy; q.lift = lift; q.air = air; q.flare = flare; q.splat = splat;
  return q;
}
const Q = { t: 0, sx: 1, sy: 1, lift: 0, air: false, flare: 0, splat: 0 };

function die(e, world, rig, q) {
  e._pcorpse = true;
  K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'a', x: 0, y: -q.lift, rot: 0, sx: q.sx, sy: q.sy }],
    { life: 0.8, strips: 10, drift: 40, rise: 10, col: '#8aff5a', kind: 1, n: 18, spread: 150, glow: '#6aff3a', cy: -14 });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  T = q.t; TD = rig.td;
  if (e.dying > 0 && world) { if (!e._pcorpse) die(e, world, rig, q); return; }
  const sq = K.squashK(e);
  AMP = 1 + q.flare * 0.8 + sq * 2.5 + q.splat * 1.5;
  const sx = q.sx * (1 + 0.08 * sq), sy = q.sy * (1 - 0.1 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  if (!q.air) {
    K.shadow(20 * sx, 0.45);
    K.put('puddle', 'a', 0, 0, 0, sx * (1 + q.splat * 0.25), 1, 1);
  } else K.shadow(12, 0.25);
  if (!o.flash) K.glow(0, -14 * sy - q.lift, 30, '#6aff3a', 0.26 + q.flare * 0.2);
  if (K.lod() > 0) K.warpY('body', 'a', 0, -q.lift, 0, sx, sy, K.nStrips(8), wobble, 0.97, 'base', 2);
  else K.put('body', 'a', 0, -q.lift, 0, sx, sy, 0.97);
  if (!o.flash) {
    K.pivotPos('body', 'a', 'eye', 0, -q.lift, 0, sx, sy, _q);
    const pk = 0.5 + 0.5 * Math.sin(T * 5);
    K.glow(_q[0], _q[1], 7 + pk * 2 + q.flare * 6, '#f0ff60', 0.3 + pk * 0.2 + q.flare * 0.5, 0.15);
    if (q.flare > 0.5) glint(ctx, _q[0] + 4, _q[1], 5 + 5 * q.flare, '#e8ffb0', (q.flare - 0.5) * 2);
  }
  K.end();
  // drips thrown out on landing / when hit, and a slow ooze while resting (render-only, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(16));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    if (q.splat > 0.8 && !e._splat) { e._splat = true; for (let i = 0; i < 7; i++) pool.add(1, e.cx + K.frand(-16, 16) * sc, e.bottom - 4 * sc, K.frand(-140, 140), K.frand(-260, -90), K.frand(0.35, 0.6), 1.8 * sc, '#7aff5a'); }
    if (q.splat <= 0) e._splat = false;
    if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 6; i++) pool.add(1, e.cx + K.frand(-12, 12) * sc, e.bottom - K.frand(6, 22) * sc, K.frand(-150, 150), K.frand(-200, -60), K.frand(0.3, 0.55), 2 * sc, '#9aff6a'); }
    if (e.flashT <= 0) e._hitFx = false;
    if (!q.air) for (let n = pool.rate(0, K.lod() === 0 ? 0.8 : 1.6, dt); n > 0; n--) pool.add(0, e.cx + f * K.frand(-10, 12) * sc, e.bottom - K.frand(8, 26) * sc, K.frand(-6, 6), K.frand(-22, -8), K.frand(0.6, 1.1), K.frand(2, 3.5) * sc, '#b8ff8a');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
