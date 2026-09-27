// T2 painted mini-puppet: 진흙 인간 (mud_man). Parts: the hulking body (a hump bristling with roots and stones, the
// skull-faced head with glowing eyes and drooling fangs) warped as sheared strips so the mud sways and jiggles, the
// dripping arm drawn as a bending chain (near arm in front, far arm behind and darkened — it stretches thin on the
// punch), the puddle it stands in, and the mud ball.
// States (AI.mud): rise (0.9 s: bubbling puddle, then the golem heaves up out of it — clipped by the floor line,
// wobbling, the mud splashing) · walk (45 px/s: heavy sway, arms swinging, drool and drips) · idle (breathing jiggle) ·
// punch (0.5 s wind-up: the arm is drawn back, the body leans away, a glint on the fist; the strike swings the arm out
// and stretches it to the AI's 62 px reach, mud spatters) · throw (0.55 s: the arm rises overhead while a mud ball
// forms in the fist, then whips forward — the AI launches the ball) · sink (0.6 s: melts back down into the puddle) ·
// under (only the puddle glides along the floor, bubbling, two eyes glinting under the surface) · hurt (flash,
// squash, jiggle, arms fling) · death (melts into a spreading puddle that soaks away).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { HP, glint } from './_biped.js';
import { atkPhase } from '../enemy_kit.js';
import { claimDeathDebris } from './skeleton.js';

export const spec = {
  id: 'mud_man', tier: 'T2', src: 'mud_man',
  bake: { outline: 0.4, outlineParts: { puddle: 0 }, deep: { arm: 0.6 }, deepTint: 'rgb(130,118,118)' },
};

const _q = [0, 0], _o = [0, 0], _f = [0, 0];
const dirOf = (a) => HP - a;               // arm angle: 0 = hanging down, + = swung forward

// ── body warp: lean + jiggle (logical px at the top), squash-down (0..1 of the height) ──
let BT = 0, BL = 0, BW = 1, BD = 0, BH = 100, TD = 4, BF = 3.1;
const bodyOff = (u) => {
  _o[0] = (BL * u * u + Math.sin(BT * BF - u * 3.6) * BW * u) * TD;
  _o[1] = BD * u * BH;
  return _o;
};
/** warp parameter u (0 at the base … 1 at the top) of body pivot pn */
function warpU(pn) {
  const p = K.part('body'), q = p?.piv.a, r = p?.piv[pn];
  if (!r) return 0;
  return Math.abs(r[1] - q[1]) / (Math.max(q[1], p.h - q[1]) || 1);
}
/** logical offset of the body warp at pivot pn (the strips shift the shoulders and the neck with the mud) */
function warpAt(pn, out) {
  const o = bodyOff(warpU(pn));
  out[0] = o[0] / TD; out[1] = o[1] / TD;
  return out;
}

// ── arm chain ──
let AT = 0, AC = 0, AW = 0.05, AP = 0, AN = 6;
const armBend = (u, i) => AC / AN + Math.sin(AT * 3.2 + AP - u * 3) * AW * (0.3 + u);
/** point at fraction `frac` along the arm chain (same stepping as K.chain) */
function armAt(x, y, dir, s, frac, out) {
  const p = K.part('arm');
  if (!p) { out[0] = x; out[1] = y; return out; }
  const A = p.piv.a, seg = (p.w - A[0]) / TD * s / AN, m = frac * AN;
  let cum = 0, jx = x, jy = y;
  for (let i = 0; i < AN && m - i > 0; i++) {
    cum += armBend(i / AN, i);
    const l = Math.min(1, m - i) * seg;
    jx += Math.cos(dir + cum) * l; jy += Math.sin(dir + cum) * l;
  }
  out[0] = jx; out[1] = jy; return out;
}
function arm(x, y, a, s, thin, curl, ph, vn) {
  AC = curl; AP = ph;
  K.chain('arm', x, y, dirOf(a), s, AN, armBend, 1, vn, false, thin);
}
const fistFrac = () => { const p = K.part('arm'); return p?.piv.fist ? (p.piv.fist[0] - p.piv.a[0]) / (p.w - p.piv.a[0]) : 0.88; };

const POSE = {};
function pose(e) {
  const t = e.t ?? 0, at = e.animT ?? 0, st = e.state, P = e.params || {};
  const q = POSE, walking = e.anim === 'walk', hurt = K.hurtOf(e);
  const ph = t * 5.5, sw = walking ? Math.sin(ph) : 0;
  q.rise = 1; q.under = st === 'under';
  if (st === 'rise') q.rise = ease.outCubic(clamp((e.stateT ?? 0) / 0.9, 0, 1));
  else if (st === 'sink') q.rise = 1 - ease.inCubic(clamp((e.stateT ?? 0) / 0.6, 0, 1));
  q.lean = 0.12 + (hurt ? -0.25 : 0); q.bob = walking ? -Math.abs(Math.cos(ph)) * 1.6 : 0;
  q.breathe = Math.sin(t * 2) * 0.018;
  q.wob = walking ? 1.8 : 1.1; q.wobF = walking ? 5.5 : 3.1;
  q.aF = 0.35 + sw * 0.3; q.aB = 0.2 - sw * 0.3;
  q.sF = 1; q.thin = 1; q.curlF = 0.25; q.curlB = 0.3;
  q.tele = 0; q.glint = 0; q.ball = 0; q.spat = 0; q.lunge = 0; q.nod = Math.sin(t * 2.2) * 0.03 + (walking ? Math.sin(ph) * 0.04 : 0);
  if (e.anim === 'punch') {
    const ap = atkPhase(at, P.punchWind ?? 0.5, 0.08), kw = ease.outCubic(ap.w);
    if (ap.s <= 0) { q.aF = lerp(0.35, -1.2, kw); q.lean = lerp(0.12, -0.1, ap.w); q.curlF = lerp(0.25, 0.6, kw); q.aB = lerp(q.aB, 0.6, kw); }
    else {
      const ks = ease.outBack(ap.s), hold = clamp(1 - ap.after / 0.3, 0, 1);
      q.aF = lerp(-1.2, 1.5, ks); q.lean = 0.3; q.curlF = lerp(0.6, -0.05, ks); q.lunge = 2.5 * hold; q.nod = 0.12 * hold;
      q.sF = 1 + 0.62 * ease.outCubic(ap.s) * hold; q.thin = 1 / Math.sqrt(q.sF);
      q.spat = ap.after < 0.12 ? 1 : 0; q.aB = -0.3;
    }
    q.tele = q.glint = ap.s <= 0 ? ap.w : 0;
    if (ap.s <= 0) q.nod = -0.12 * kw;
    q.wob = 1.1 + q.tele * 1.4; q.wobF = 3.1 + q.tele * 9;
  } else if (e.anim === 'throw') {
    const ap = atkPhase(at, P.throwWind ?? 0.55, 0.1), kw = ease.outCubic(ap.w);
    if (ap.s <= 0) { q.aF = lerp(0.35, -2.5, kw); q.lean = -0.15 * ap.w; q.curlF = lerp(0.25, 0.5, kw); q.ball = clamp(ap.w * 1.4, 0, 1); }
    else { q.aF = lerp(-2.5, -4.75, ease.outCubic(ap.s)); q.lean = 0.25; q.curlF = -0.2; q.nod = 0.1; }
    q.tele = ap.s <= 0 ? ap.w : 0;
  }
  if (hurt) { q.aF += 0.7; q.aB += 0.5; q.wob = 3.2; q.wobF = 14; q.nod = -0.2; q.lunge = -1.5; }
  return q;
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  TD = rig.td; BT = t;
  if (e.dying > 0) {
    if (world) {
      if (!e._pcorpse) { e._pcorpse = true; claimDeathDebris(world, e); spawnMelt(world, e, rig); }
      return;
    }
    K.begin(ctx, rig, 0); drawMelt(K.deathK(e), t); K.end();   // bestiary / gallery: a frozen frame of the melt
    return;
  }
  const q = pose(e);
  const fl = K.flashK(e, o);
  if (q.under) { drawUnder(ctx, e, rig, fl, o, t); return; }
  const rising = q.rise < 0.999;
  const sq = K.squashK(e);
  // the puddle (drawn over the body's base: the golem stands in it; bubbling alone at first while rising)
  const pw = lerp(0.72, 1, clamp(q.rise * 1.6, 0, 1)) * (1 + Math.sin(t * 2.3) * 0.02);
  if (rising) {
    ctx.save();
    ctx.beginPath(); ctx.rect(-80, -150, 160, 150.5); ctx.clip();
    ctx.translate(Math.sin(t * 17) * (1 - q.rise) * 1.6, (1 - q.rise) * 70);
  }
  if (sq > 0) ctx.scale(1 + 0.08 * sq, 1 - 0.08 * sq);
  K.begin(ctx, rig, fl);
  const body = K.part('body');
  BH = body?.h ?? 100;
  BL = (q.lean + (rising ? (1 - q.rise) * 0.2 * Math.sin(t * 9) : 0)) * 60;
  BW = q.wob + (rising ? (1 - q.rise) * 4 : 0); BF = q.wobF;
  BD = rising ? (1 - q.rise) * 0.3 : -q.breathe;
  const bsx = 1 + (rising ? (1 - q.rise) * 0.25 : 0), by = q.bob;
  AN = K.nStrips(6); AT = t; AW = 0.05 + (q.wob > 2 ? 0.06 : 0);
  // far arm (behind the body)
  K.pivotPos('body', 'a', 'sh2', 0, by, 0, bsx, 1, _q); warpAt('sh2', _f);
  arm(_q[0] + _f[0], _q[1] + _f[1], q.aB, 0.95, 1, q.curlB, 1.7, 'deep');
  bodyStrips(ctx, rig, fl, 0, by, bsx, 1);
  // near arm (+ the mud ball forming in its fist) — it swings between the body and the head
  K.pivotPos('body', 'a', 'sh', 0, by, 0, bsx, 1, _q); warpAt('sh', _f);
  const sx = _q[0] + _f[0], sy = _q[1] + _f[1];
  arm(sx, sy, q.aF, q.sF, q.thin, q.curlF, 0, 'base');
  AC = q.curlF; AP = 0;
  armAt(sx, sy, dirOf(q.aF), q.sF, fistFrac(), _f);
  const fx = _f[0], fy = _f[1];
  // head: rides the warped neck, tilted with the local lean of the mud column, nods and lunges
  K.pivotPos('body', 'a', 'neck', 0, by, 0, bsx, 1, _q); const un = warpU('neck'); warpAt('neck', _o);
  const hx = _q[0] + _o[0] + q.lunge, hy = _q[1] + _o[1];
  const hr = Math.atan((2 * BL * un + BW * (Math.sin(BT * BF - un * 3.6) - 3.6 * un * Math.cos(BT * BF - un * 3.6))) / ((body?.h ?? 100) / TD)) * 0.8 + q.nod;
  K.put('head', 'a', hx, hy, hr, 1, 1);
  if (q.ball > 0) {
    if (!o.flash) K.glow(fx + 1, fy - 2, 8 * q.ball, '#c09060', 0.35 * q.ball);
    K.put('ball', 'a', fx + 1, fy - 2, t * 2, 0.4 + 0.6 * q.ball, 0.4 + 0.6 * q.ball);
  }
  if (!o.flash) {
    const ea = 0.45 + 0.15 * Math.sin(t * 4) + q.tele * 0.4;
    K.pivotPos('head', 'a', 'eye', hx, hy, hr, 1, 1, _q); K.glow(_q[0], _q[1], 3 + q.tele * 3, '#ff8a2a', ea);
    K.pivotPos('head', 'a', 'eye2', hx, hy, hr, 1, 1, _q); K.glow(_q[0], _q[1], 2.2 + q.tele * 2, '#ff8a2a', ea * 0.8);
    if (q.glint > 0.45) glint(ctx, fx, fy, 3 + 4 * q.glint, '#ffd8a0', 0.85 * (q.glint - 0.45) / 0.55);
  }
  K.pivotPos('head', 'a', 'mouth', hx, hy, hr, 1, 1, _q);
  const mx = _q[0], my = _q[1];
  K.end();
  if (rising) ctx.restore();
  K.begin(ctx, rig, fl);
  K.put('puddle', 'a', 0, 0.5, 0, pw, 0.85);
  if (rising && !o.flash) bubbles(ctx, t, 1 - q.rise, 1.4);
  K.end();
  // world-space render particles: drool and drips, the punch's mud spatter, the splash while rising
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(20));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1), lo = K.lod() === 0;
    if (!rising) {
      for (let k = pool.rate(0, lo ? 1.2 : 2.4, dt); k > 0; k--) pool.add(1, e.cx + f * sc * (mx + K.frand(-5, 3)), e.bottom + sc * (my + 4), 0, K.frand(10, 40), K.frand(0.5, 0.8), 1.5, '#4a3424');
      for (let k = pool.rate(1, lo ? 0.8 : 1.6, dt); k > 0; k--) pool.add(1, e.cx + f * sc * fx, e.bottom + sc * fy, 0, K.frand(10, 30), K.frand(0.4, 0.7), 1.6, '#4a3424');
      if (q.spat) for (let k = pool.rate(2, 70, dt); k > 0; k--) pool.add(4, e.cx + f * sc * fx, e.bottom + sc * fy, f * K.frand(60, 200), K.frand(-160, -20), K.frand(0.35, 0.6), K.frand(1.4, 2.4), '#5a4230');
    } else if (q.rise > 0.15) {
      for (let k = pool.rate(3, 16, dt); k > 0; k--) pool.add(4, e.cx + K.frand(-18, 18), e.bottom - 2, K.frand(-90, 90), K.frand(-260, -110), K.frand(0.4, 0.7), K.frand(1.4, 2.6), '#4a3424');
    }
    ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
  }
}

/** the body as sheared strips; its hit flash is laid over as ONE seam-free warp (per-strip flash blits overlap by a
 *  texel and showed as bright bands) */
function bodyStrips(ctx, rig, fl, x, y, sx, a) {
  const n = K.nStrips(12);
  if (!(fl > 0)) { K.strips('body', 'a', x, y, 0, sx, 1, n, 'y', bodyOff, a); return; }
  K.end(); K.begin(ctx, rig, 0);
  K.strips('body', 'a', x, y, 0, sx, 1, n, 'y', bodyOff, a);
  K.warpY('body', 'a', x, y, 0, sx, 1, n * 2, bodyOff, a * fl, 'flash');
  K.end(); K.begin(ctx, rig, fl);
}

/** mud bubbles swelling and popping on the puddle (render clock) */
function bubbles(ctx, t, a, w) {
  K.local();
  const ga = ctx.globalAlpha;
  ctx.lineWidth = 0.8; ctx.strokeStyle = '#a0805a';
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.9 + i * 0.37) % 1, x = (-12 + i * 12 + Math.sin(i * 7.1) * 4) * w, r = 0.8 + p * 2.6;
    ctx.globalAlpha = ga * a * (p < 0.85 ? 0.9 : (1 - p) / 0.15 * 0.9);
    ctx.beginPath(); ctx.ellipse(x, -1.5 - r * 0.4, r, r * 0.7, 0, Math.PI, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = ga;
}

/** under the floor: the puddle glides along, bubbling, two eyes glinting under the surface */
function drawUnder(ctx, e, rig, fl, o, t) {
  const mv = Math.abs(e.vx ?? 0) > 5 ? 1 : 0;
  K.begin(ctx, rig, fl);
  K.put('puddle', 'a', 0, 0.5, 0, 0.72 + mv * 0.08 + Math.sin(t * 6) * 0.03, 0.8 - mv * 0.06);
  if (!o.flash) {
    bubbles(ctx, t * 1.6, 1, 1);
    const blink = Math.sin(t * 1.3) > -0.6 ? 1 : 0;
    K.glow(9, -2.5, 2.2, '#ff8a2a', 0.5 * blink);
    K.glow(14, -2.3, 1.6, '#ff8a2a', 0.4 * blink);
  }
  K.end();
}

/** death melt at k (0..1): the body sags and slumps into the puddle, which spreads and soaks away */
function drawMelt(k, t) {
  BT = t; BL = 7 * (1 - k); BW = 1 + k * 5; BF = 6; BD = Math.pow(k, 1.2) * 0.92;
  const body = K.part('body');
  BH = body?.h ?? 100;
  const a = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35, ba = 1 - k * k * k, sx = 1 + 0.45 * k;
  K.strips('body', 'a', 0, 0, 0, sx, 1, K.nStrips(12), 'y', bodyOff, ba);
  K.pivotPos('body', 'a', 'neck', 0, 0, 0, sx, 1, _q); warpAt('neck', _o);
  K.put('head', 'a', _q[0] + _o[0], _q[1] + _o[1], 0.5 * k, 1, 1 - 0.3 * k, ba);
  K.put('puddle', 'a', 0, 0.5, 0, 1 + 0.4 * k, 0.85 + 0.15 * k, a);
}
function spawnMelt(world, e, rig) {
  if (!world?.fx?.ghost) return;
  const ox = e.cx, oy = e.bottom, fx = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
  const t0 = world.time ?? 0, life = 1.1;
  const pool = new K.FxPool(18);
  for (let i = 0; i < 18; i++) pool.add(i < 10 ? 1 : 4, ox + fx * sc * K.frand(-18, 20), oy - sc * K.frand(20, 64), K.frand(-70, 70), K.frand(-150, 10), K.frand(0.5, 0.9), K.frand(1.4, 2.6) * sc, i & 1 ? '#4a3424' : '#6a5038');
  world.fx.ghost((ctx) => {
    const now = world.time ?? t0, k = clamp((now - t0) / life, 0, 1);
    if (k >= 1) return;
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.translate(ox, oy); ctx.scale(fx * sc, sc);
    K.begin(ctx, rig, k < 0.1 ? 0.8 * (1 - k / 0.1) : 0);
    TD = rig.td;
    drawMelt(ease.outQuad(k), now);
    K.end();
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    pool.step(now); pool.draw(ctx);
    ctx.restore();
  }, life + 0.3, 'front');
}
