// T2 painted mini-puppet: 호문쿨루스 (homunculus, 28×50). Parts from the Kling side-view reference: the oversized stitched
// 'head' (glowing yellow eyes, needle teeth) nodding on the neck, the hunched 'body' (spine knobs, ribs, the brass back
// connector), the near arm as 'uarm' + 'farm' (forearm with the long claws) and the near leg as 'thigh' + 'shin' (the far
// limbs are the same parts darkened), and the pink feeding 'tube' from the parts sheet trailing from the connector as a
// bending chain.
// Driven by AI_B.pouncer: idle (twitchy breathing, head bob) · walk (14 rad/s scuttle with jerky pauses: the legs are solved
// with 2-bone IK so the feet stay planted) · crouch (params.crouch 0.38 s: sinks low, head forward, the eyes flare and a
// glint pulses → leap) · leap (flat dive, claws thrust forward, legs trailing, tube streaming behind; the AI's strike box is
// −6…+30 px in front at −44…−4) · land (0.35 s: absorbs, rises) · hurt (flash, recoil) · death (falls apart into its parts).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { dirOf, glint, ik2 } from './_biped.js';
import { Placer } from './blood_skeleton.js';

export const spec = {
  id: 'homunculus', tier: 'T2', src: 'homunculus',
  bake: { outline: 0.4, deep: { uarm: 0.5, farm: 0.5, thigh: 0.5, shin: 0.5 }, deepTint: 'rgb(120,90,110)' },
};

const P = new Placer();
const _q = [0, 0], _h = [0, 0];
const Q = { aN: [0, 0], aF: [0, 0], lg: [[0, 0], [0, 0]] };
const set2 = (a, x, y) => { a[0] = x; a[1] = y; };
const HIP = -16.2;
let T = 0, TB = 0;
/** feeding tube: steep drop out of the connector that flattens toward the tip, wobbling */
function tubeBend(u) { return TB + Math.sin(T * 4.2 - u * 5) * 0.06; }

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = Q;
  q.t = t; q.an = an; q.fk = false; q.glint = 0; q.eye = 1;
  q.walk = an === 'walk';
  const ph = t * 14;
  q.ph = ph;
  q.hip = HIP + Math.sin(t * 3) * 0.4; q.lean = Math.sin(t * 1.3) * 0.03; q.head = Math.sin(t * 1.7) * 0.08; q.dx = 0;
  set2(q.aN, 0.4, 0.5 + Math.sin(t * 2) * 0.1); set2(q.aF, 0.3, 0.6 + Math.sin(t * 2 + 1) * 0.1);
  q.fN = 2; q.fF = -3; q.lN = 0; q.lF = 0;
  q.tube = 0.11;
  if (q.walk) {
    q.hip = HIP + 1.2 - Math.abs(Math.sin(ph)) * 1.4; q.lean = 0.28; q.head = Math.sin(ph * 2) * 0.05;
    q.fN = 1 + Math.sin(ph) * 5; q.fF = -2 + Math.sin(ph + Math.PI) * 5;
    q.lN = Math.max(0, -Math.cos(ph)) * 3; q.lF = Math.max(0, Math.cos(ph)) * 3;
    set2(q.aN, 0.6 + Math.sin(ph + Math.PI) * 0.6, 0.3); set2(q.aF, 0.6 + Math.sin(ph) * 0.6, 0.3);
  } else if (an === 'crouch') {
    const k = ease.outCubic(clamp(at / 0.3, 0, 1));
    q.hip = HIP + 5 * k; q.lean = 0.45 * k; q.head = 0.2 * k; q.dx = 1.5 * k;
    set2(q.aN, lerp(0.4, 0.5, k), lerp(0.5, 0.9, k)); set2(q.aF, lerp(0.3, 0.45, k), lerp(0.6, 0.9, k));
    q.fN = 3; q.fF = -3; q.glint = clamp(at / 0.3, 0, 1); q.eye = 1 + 0.6 * k; q.tube = 0.13;
  } else if (an === 'leap') {
    q.fk = true; q.hip = HIP - 1; q.lean = 0.62; q.head = 0.3;
    set2(q.lg[0], -0.9, 0.3); set2(q.lg[1], -0.6, 0.3);
    set2(q.aN, 1.9, 0.1); set2(q.aF, 2.1, 0.1); q.eye = 1.5; q.tube = 0.04;
  } else if (an === 'land') {
    const k = 1 - clamp(at / 0.35, 0, 1);
    q.hip = HIP + 4 * k; q.lean = 0.25 + 0.2 * k; q.head = 0.1 * k;
    set2(q.aN, 0.7, 0.4); set2(q.aF, 0.6, 0.5); q.fN = 4; q.fF = -4;
  }
  if (e.onGround === false && an !== 'leap' && !(e.stun > 0)) { q.fk = true; set2(q.lg[0], 0.3, -0.9); set2(q.lg[1], 0.1, -0.8); }
  if (K.hurtOf(e)) { q.lean -= 0.25; q.head -= 0.25; q.aN[0] -= 0.5; q.aF[0] -= 0.4; }
  q.lean += K.deathK(e) * 0.4;
  return q;
}

function leg(x, y, fx, lift, vn, fk, lg) {
  const th = K.part('thigh'), sh = K.part('shin');
  let d1, d2;
  if (fk) { d1 = dirOf(lg[0]); d2 = dirOf(lg[0] + lg[1]); }
  else { const r = ik2(x, y, fx, -3 - lift, th.len, sh.len, 1); d1 = r[0]; d2 = r[1]; }
  const kx = x + Math.cos(d1) * th.len, ky = y + Math.sin(d1) * th.len;
  P.place('shin', kx, ky, d2 - sh.ang, vn);
  P.place('thigh', x, y, d1 - th.ang, vn);
}

function arm(x, y, a, vn) {
  const b = P.bone('uarm', x, y, dirOf(a[0]), vn);
  const ex = b[0], ey = b[1];
  P.bone('farm', ex, ey, dirOf(a[0] + a[1]), vn);
  K.pivotPos('farm', 'a', 'claw', ex, ey, dirOf(a[0] + a[1]) - K.part('farm').ang, 1, 1, _h);
}

function layout(e, q) {
  P.reset();
  const hx = q.dx, hy = q.hip, tr = q.lean;
  K.pivotPos('body', 'hip', 'shoulder', hx, hy, tr, 1, 1, _q);
  const sx = _q[0], sy = _q[1];
  // far limbs behind the body
  leg(hx - 2, hy + 0.5, hx + q.fF, q.lF, 'deep', q.fk, q.lg[1]);
  arm(sx - 2, sy + 1, q.aF, 'deep');
  leg(hx, hy, hx + q.fN, q.lN, 'base', q.fk, q.lg[0]);
  P.place('body', hx, hy, tr, 'base', 1, 1, 'hip');
  K.pivotPos('body', 'hip', 'neck', hx, hy, tr, 1, 1, _q);
  const nx = _q[0], ny = _q[1], hr = tr * 0.5 + q.head;
  P.place('head', nx, ny, hr, 'base', 1, 1, 'neck');
  arm(sx + 0.5, sy, q.aN, 'base');
  const cx = _h[0], cy = _h[1];
  K.pivotPos('head', 'neck', 'eye', nx, ny, hr, 1, 1, _q);
  const ex = _q[0], ey = _q[1];
  K.pivotPos('head', 'neck', 'eye2', nx, ny, hr, 1, 1, _q);
  const e2x = _q[0], e2y = _q[1];
  K.pivotPos('body', 'hip', 'port', hx, hy, tr, 1, 1, _q);
  return { ex, ey, e2x, e2y, cx, cy, px: _q[0], py: _q[1], tr };
}

function die(e, world, rig) {
  e._pcorpse = true;
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => {
    const heavy = p.name === 'body' || p.name === 'head';
    return [kb * 50 + K.frand(-110, 110) * (heavy ? 0.5 : 1), -K.frand(100, 300) * (heavy ? 0.6 : 1), K.frand(-8, 8)];
  }, { life: 1.4, fade: 0.5, bounce: 0.25, dust: { n: 10, w: 12, h: 24, col: '#8a2a3a', k: 1 } });
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
  K.shadow(12, 0.4);
  const L = layout(e, q);
  // feeding tube first (behind everything): out of the connector, drooping to the floor
  T = q.t; TB = q.tube;
  const tb = K.part('tube');
  const s = 26 / tb.len;
  K.chain('tube', L.px, L.py, (q.fk ? 2.55 : 1.95) + L.tr * 0.5, s, K.nStrips(7), tubeBend, 1, 'base', false, 0.36);
  P.draw();
  if (!o.flash) {
    K.glow(L.ex, L.ey, 2.4 * q.eye, '#ffe040', 0.8, 0.2);
    K.glow(L.e2x, L.e2y, 1.6 * q.eye, '#ffe040', 0.55, 0.2);
    if (q.an === 'leap') K.glow(L.cx, L.cy, 6, '#ffd0d0', 0.18);
  }
  if (q.glint > 0) glint(ctx, L.ex + 3, L.ey - 1, 4 + 3 * Math.abs(Math.sin(q.t * 30)), '#ffe060', q.glint);
  K.end();
}
