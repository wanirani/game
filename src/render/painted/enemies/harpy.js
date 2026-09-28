// T2 painted mini-puppet: 하피 (harpy, 48×52, flying). Parts from the Kling parts sheet (mirrored to face right): 'body' =
// the side figure (wild black mane, hooked beak with a fanged scream, yellow eyes, pale chest, scaled brown feather body,
// long tail feathers, golden taloned legs), 'wing' = the great brown wing, flapped at the shoulder with a foreshortening
// squash on the downstroke (the far wing is the same art darkened, a quarter-beat behind).
// Driven by AI_B.harpy: fly (8 rad/s flap, 12 while climbing, bob) · spread (0.5 s: both wings thrown up and held, the
// eyes flare, glint at the chest → the AI fans out feathers from the chest, sparks) · shoot (0.35 s: wings snap down, recoil)
// · aim (0.4 s: rears back, wings raised, glint on the talons → dive) · dive (the stoop: rears back so the talons lead, wings
// swept up and back; the AI's strike box is −10…+34 px at −40…0; feathers shed) · climb (hard flapping) · hurt · death.
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';
import { Placer } from './blood_skeleton.js';

export const spec = {
  id: 'harpy', tier: 'T2', src: 'harpy',
  bake: { outline: 0.4, deep: { wing: 0.55 }, deepTint: 'rgb(120,90,70)' },
};

const P = new Placer();
const _q = [0, 0], _e = [0, 0], _c = [0, 0], _t = [0, 0];
const Q = {};

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = Q;
  q.t = t; q.tele = 0; q.spread = 0;
  // wing angle about the shoulder: + raises the tip (upstroke), − sweeps it down (downstroke)
  const rate = an === 'fly' && (e.vy ?? 0) < -150 ? 12 : 8;
  const fl = Math.sin(t * rate), ff = Math.sin(t * rate - 0.9);
  q.bob = fl * 2; q.rot = clamp((e.vx ?? 0) * (e.facing < 0 ? -1 : 1) / 1200, -0.12, 0.12);
  q.wN = 0.05 + fl * 0.7; q.wF = 0.1 + ff * 0.6; q.sy = 1 - Math.max(0, -fl) * 0.3;
  if (an === 'spread') {
    const k = ease.outCubic(clamp(at / 0.5, 0, 1));
    q.wN = lerp(q.wN, 0.95, k); q.wF = lerp(q.wF, 1.05, k); q.sy = lerp(q.sy, 1.08, k); q.rot = -0.12 * k; q.tele = k; q.spread = k; q.bob *= 1 - k;
  } else if (an === 'shoot') {
    const k = ease.outCubic(clamp(at / 0.35, 0, 1));
    q.wN = lerp(-0.75, 0.05, k); q.wF = lerp(-0.6, 0.1, k); q.sy = lerp(0.75, 1, k); q.rot = lerp(-0.22, 0, k); q.bob = 0;
  } else if (an === 'aim') {
    const k = ease.outCubic(clamp(at / 0.4, 0, 1));
    q.wN = lerp(q.wN, 1.25, k); q.wF = lerp(q.wF, 1.3, k); q.rot = lerp(q.rot, -0.4, k); q.tele = k; q.sy = lerp(q.sy, 1, k); q.bob *= 1 - k;
  } else if (an === 'dive') {
    // the stoop: rears back so the talons lead, wings swept up and back, tail flared
    const k = ease.outCubic(clamp(at / 0.12, 0, 1)), dn = clamp((e.vy ?? 300) / 560, -1, 1);
    q.rot = lerp(-0.4, -0.3 - dn * 0.2, k); q.wN = lerp(1.25, 0.75, k) + Math.sin(t * 30) * 0.04; q.wF = lerp(1.3, 0.8, k); q.sy = lerp(1, 0.72, k); q.bob = 0;
  }
  if (K.hurtOf(e)) { q.rot -= 0.3; q.wN += 0.5; q.wF += 0.4; }
  q.rot += K.deathK(e) * 0.8;
  return q;
}

/** body placement rotating about its middle (the talons swing forward when it rears back) */
const CY = -26;
function layout(e, q) {
  P.reset();
  const r = q.rot, s = Math.sin(r), c = Math.cos(r);
  const ax = -CY * s, ay = q.bob + CY - CY * c;
  K.pivotPos('body', 'a', 'root', ax, ay, r, 1, 1, _q);
  // far wing a beat behind, slightly smaller, darkened
  P.place('wing', _q[0] - 2, _q[1] + 1, r + q.wF, 'deep', 0.88, 0.88 * q.sy);
  P.place('body', ax, ay, r, 'base');
  P.place('wing', _q[0], _q[1], r + q.wN, 'base', 1, q.sy);
  K.pivotPos('body', 'a', 'eye', ax, ay, r, 1, 1, _e);
  K.pivotPos('body', 'a', 'chest', ax, ay, r, 1, 1, _c);
  K.pivotPos('body', 'a', 'talon', ax, ay, r, 1, 1, _t);
}

function die(e, world, rig) {
  e._pcorpse = true;
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => [kb * 60 + K.frand(-80, 80), -K.frand(40, 180), K.frand(-6, 6)],
    { life: 1.6, fade: 0.5, bounce: 0.2, dust: { n: 14, w: 30, h: 40, col: '#8a5a3a', k: 2 } });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  layout(e, q);
  P.draw();
  if (!o.flash) {
    K.glow(_e[0], _e[1], 2.2 + q.tele * 2.5, '#ffd040', 0.6 + 0.4 * q.tele, 0.2);
    if (q.spread > 0.5) glint(ctx, _c[0] + 3, _c[1], 4 + 6 * q.spread, '#ffe8c0', (q.spread - 0.5) * 2);
    if (e.anim === 'aim' && q.tele > 0.5) glint(ctx, _t[0] + 2, _t[1] - 2, 4 + 5 * q.tele, '#ffe8a0', (q.tele - 0.5) * 2);
  }
  K.end();
  // loose feathers shed on the downstroke / in the dive (render-only, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(10));
    const dt = pool.step(K.clockOf(e, world));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const f = e.facing < 0 ? -1 : 1, rate = e.anim === 'dive' ? 6 : 0.7;
    for (let n = pool.rate(0, K.lod() === 0 ? rate * 0.5 : rate, dt); n > 0; n--) pool.add(4, e.cx + f * K.frand(-16, 6) * sc, e.bottom - K.frand(24, 40) * sc, K.frand(-50, 50) - (e.vx ?? 0) * 0.3, K.frand(-220, -120), K.frand(0.5, 0.8), K.frand(1.5, 2.4) * sc, '#7a4e32');
    if (q.spread > 0.95 && !e._pfx) { e._pfx = true; for (let i = 0; i < 8; i++) pool.add(3, e.cx + f * _c[0] * sc, e.bottom + _c[1] * sc, f * K.frand(40, 180), K.frand(-80, 80), K.frand(0.15, 0.3), K.frand(1.2, 2), '#ffe0a0'); }
    if (q.spread <= 0) e._pfx = false;
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
