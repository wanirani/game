// T2 painted puppet: 서큐버스 (succubus). New design: a horned demoness in a high-collared black battle gown with crimson
// trim and a long split skirt, long gloves and heeled boots, bat wings and a spade tail. The body is the side-on flight pose
// of the reference painting (wings and tail cut away); the flowing skirt is a seam-free warpY cloth warp that trails
// against the motion and ripples; the two bat wings (the far one darkened) beat about the back of the shoulders with a
// foreshortening squash; the spade tail is a bending chain.
// States (AI_B.succubus, anims 'fly' 'kiss' 'fold' 'dive'): fly (graceful wingbeat, bob, lean into the motion, tail
// sways) · kiss (0.55 s: she draws back, wings spread wide, a pink heart swells at her lips — the three homing hearts leave
// at 0.55 s with a flash) · fold (0.38 s: wings wrap back, she curls forward, eyes flare — the dive follows) · dive (body
// pitched along the velocity, wings swept back, skirt streaming, a pink after-image) · climb ('fly') · vanish/appear (the
// AI fades alpha; pink mist boils off her) · hurt (flash, squash, recoil) · death (wings, tail and body fall apart as
// corpse pieces into a puff of rose ash).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'succubus', tier: 'T2', src: 'succubus',
  bake: { outline: 0.4, deep: { wing: 0.62 }, deepTint: 'rgb(120,70,100)', glow: { body: '#ff5a9a' } },
};

const KISS = 0.55, FOLD = 0.38;
const PINK = '#ff4a8a';
const _q = [0, 0];

const P = { flap: 0, wr: 0, wsx: 1, wsy: 1, bob: 0, lean: 0, rot: 0, trail: 6, kiss: 0, fired: 0, fold: 0, dive: 0, flare: 0, tailA: 0.14, tailF: 3 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? e.stateT ?? 0, f = e.facing < 0 ? -1 : 1;
  const q = P;
  const vx = (e.vx ?? 0) * f, vy = e.vy ?? 0;
  q.flap = Math.sin(t * 4.2);
  q.wr = 0.2 + 0.45 * q.flap; q.wsx = 1; q.wsy = 0.8 + 0.2 * Math.abs(q.flap);
  q.bob = Math.sin(t * 2.4) * 2.5 - q.flap * 1.2; q.lean = clamp(vx * 0.0018, -0.15, 0.2); q.rot = 0;
  q.trail = 5 + Math.min(12, Math.hypot(vx, vy) * 0.03); q.kiss = 0; q.fired = 0; q.fold = 0; q.dive = 0; q.flare = 0;
  q.tailA = 0.22; q.tailF = 3;
  if (an === 'kiss') {
    const k = clamp(at / KISS, 0, 1);
    q.kiss = at < KISS ? ease.outCubic(k) : 0; q.fired = at >= KISS ? clamp(1 - (at - KISS) / 0.3, 0, 1) : 0;
    const slow = Math.sin(t * 2.2);
    q.wr = lerp(q.wr, 0.38 + 0.08 * slow, k); q.wsy = lerp(q.wsy, 1, k);
    q.lean = at < KISS ? -0.12 * q.kiss : lerp(0.1, 0, clamp((at - KISS) / 0.4, 0, 1));
  } else if (an === 'fold') {
    const k = ease.outCubic(clamp(at / FOLD, 0, 1));
    q.fold = k; q.wr = lerp(q.wr, -0.95, k); q.wsx = lerp(1, 0.62, k); q.wsy = lerp(q.wsy, 0.9, k); q.lean = 0.22 * k; q.flare = k;
    q.tailA = 0.05; q.tailF = 14;
  } else if (an === 'dive') {
    q.dive = 1; q.wr = -1.05; q.wsx = 0.58; q.wsy = 0.85; q.flare = 1; q.bob = 0;
    q.rot = clamp(Math.atan2(vy, Math.max(20, Math.abs(vx))), -0.6, 1.2) * 0.75; q.lean = 0;
    q.trail = 18; q.tailA = 0.05; q.tailF = 16;
  }
  if (K.hurtOf(e)) { q.lean -= 0.2; q.wr += Math.sin(t * 50) * 0.15; }
  return q;
}

let TW_T = 0, TW_A = 0.14, TW_F = 3;
const tailBend = (u) => Math.sin(TW_T * TW_F - u * 3.6) * TW_A * (0.4 + u);

/** place + draw the whole puppet (also used to snapshot corpse pieces) */
function drawPuppet(e, q, rig, o, t, pieces) {
  const ax = 7, ay = -46 + q.bob, tr = q.lean;
  K.pivotPos('body', 'a', 'wing', ax, ay, tr, 1, 1, _q); const wx = _q[0], wy = _q[1];
  K.pivotPos('body', 'a', 'tail', ax, ay, tr, 1, 1, _q); const tx = _q[0], ty = _q[1];
  if (pieces) {
    pieces.push({ name: 'wing', pv: 'a', x: wx + 5, y: wy - 2, rot: q.wr + 0.25, sx: q.wsx * 0.88, sy: q.wsy * 0.92, vn: 'deep' });
    pieces.push({ name: 'wing', pv: 'a', x: wx, y: wy, rot: q.wr, sx: q.wsx, sy: q.wsy, vn: 'base' });
    pieces.push({ name: 'tail', pv: 'a', x: tx, y: ty, rot: 3.3 - (K.part('tail')?.ang ?? 0), sx: 1, sy: 1, vn: 'base' });
    pieces.push({ name: 'body', pv: 'a', x: ax, y: ay, rot: tr, sx: 1, sy: 1, vn: 'base' });
    return;
  }
  K.put('wing', 'a', wx + 5, wy - 2, q.wr + 0.25, q.wsx * 0.88, q.wsy * 0.92, 1, 'deep');   // far wing
  K.put('wing', 'a', wx, wy, q.wr, q.wsx, q.wsy);                                           // near wing (behind the hair)
  TW_T = t; TW_A = q.tailA; TW_F = q.tailF;
  K.chain('tail', tx, ty, 3.3 + Math.sin(t * 1.6) * 0.12 - q.dive * 0.25 + tr, 1, K.nStrips(6), tailBend);
  // after-image while diving (two faded copies trailing back along the motion)
  if (q.dive && !o.flash) {
    K.put('body', 'a', ax - 9, ay - 2, tr, 1, 1, 0.22);
    K.put('body', 'a', ax - 17, ay - 4, tr, 1, 1, 0.1);
  }
  // body: skirt bands (below the waist) stream back and ripple; the torso stays rigid
  const ph = t * 4, trail = q.trail;
  K.warpY('body', 'a', ax, ay, tr, 1, 1, K.nStrips(10), (u) => {
    const w = Math.max(0, u - 0.5) / 0.5;
    _q[0] = (-(w * w) * trail - Math.sin(ph - u * 7) * w * 2.6) * rig.td; _q[1] = 0; return _q;
  }, 1, 'base', 0);
  return { ax, ay, tr };
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      const pieces = [];
      K.begin(ctx, rig, 0); drawPuppet(e, q, rig, o, t, pieces); K.end();
      const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
      for (const p of pieces) { const body = p.name === 'body'; p.vx = kb * 40 + K.frand(-100, 100) * (body ? 0.4 : 1); p.vy = -K.frand(60, 240) * (body ? 0.5 : 1); p.vr = K.frand(-6, 6) * (body ? 0.3 : 1); }
      K.spawnCorpse(world, e, rig, pieces, { life: 1.5, fade: 0.55, bounce: 0.2, dust: { n: 10, w: 22, h: 30, col: '#ff8ab8' } });
    }
    return;
  }
  const sq = K.squashK(e);
  ctx.save();
  if (q.rot) { ctx.translate(0, -44); ctx.rotate(q.rot); ctx.translate(0, 44); }
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.glow(0, -44, 34, '#ff3a7a', 0.1 + 0.2 * (q.kiss + q.fired) + 0.1 * q.flare);
  const B = drawPuppet(e, q, rig, o, t, null);
  if (!o.flash) {
    K.pivotPos('body', 'a', 'eye', B.ax, B.ay, B.tr, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.2 + 2.5 * q.flare + q.kiss, PINK, 0.8 + 0.2 * Math.sin(t * 5));
    if (q.flare > 0.6 && q.fold) glint(ctx, _q[0] + 1, _q[1], 3 + 3 * q.flare, '#ffd0e4', (q.flare - 0.6) * 2.5);
    K.pivotPos('body', 'a', 'lips', B.ax, B.ay, B.tr, 1, 1, _q);
    const lx = _q[0] + 2, ly = _q[1];
    if (q.kiss > 0.05) { K.glow(lx, ly, 5 + 9 * q.kiss, PINK, 0.7 * q.kiss); heart(ctx, lx + 1 + 3 * q.kiss, ly - 1, 1.2 + 2.6 * q.kiss, q.kiss); }
    if (q.fired > 0) K.glow(lx + 4, ly, 20 * q.fired, '#ffc0da', q.fired, 0.2);
  }
  K.end();
  ctx.restore();
  if (!world || !o.cam || o.flash) return;
  // world-space FX: pink mist while fading (vanish/appear), rose sparks trailing a dive, a few drifting motes in flight
  const pool = e._fx ?? (e._fx = new K.FxPool(24));
  const dt = pool.step(K.clockOf(e, world));
  const lo = K.lod() === 0 ? 0.5 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
  const a = e.alpha ?? 1;
  if (a < 0.98) for (let n = pool.rate(0, 34 * lo * (1 - a * 0.6), dt); n > 0; n--) pool.add(0, e.cx + K.frand(-16, 16) * sc, e.bottom - K.frand(10, 70) * sc, K.frand(-40, 40), K.frand(-60, -10), K.frand(0.4, 0.8), K.frand(4, 8) * sc, '#ff6aa0');
  if (q.dive) for (let n = pool.rate(1, 24 * lo, dt); n > 0; n--) pool.add(3, e.cx + K.frand(-8, 8) * sc, e.bottom - K.frand(20, 60) * sc, -(e.vx ?? 0) * 0.2, -(e.vy ?? 0) * 0.2, K.frand(0.25, 0.5), K.frand(1.4, 2.4), '#ffb0d0');
  for (let n = pool.rate(2, 2 * lo, dt); n > 0; n--) pool.add(3, e.cx + K.frand(-14, 14) * sc, e.bottom - K.frand(20, 70) * sc, K.frand(-8, 8), K.frand(-20, -4), K.frand(0.6, 1.1), K.frand(1, 1.8), '#ff8ab8');
  ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
}

/** small glowing heart (local space) */
function heart(ctx, x, y, s, a) {
  if (a <= 0.02) return;
  K.local();
  const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
  ctx.globalAlpha = ga * clamp(a, 0, 1); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#ff6aa6';
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
}
