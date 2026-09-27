// T2 painted tall stalker: 얼굴 없는 자 (faceless, 36×104). Parts (Kling parts sheet 2): the gaunt body in the black
// funeral suit with the blank bone-white skull face and the long coat tails, one impossibly long arm ending in pale
// clawed fingers (stretched along its length for the grab), one trouser leg with a polished shoe (×2, far leg darkened).
// States (AI_D.stalker): idle (barely breathing, a slow unnatural sway) · creep (slow stiff stride, arms dangling,
// body leaning in) · freeze (dead still when the player looks at it; e.watched tilts the whole figure, head cocked) ·
// grab (windup, aimK 0→1: the arm rises level and starts to stretch, at the strike it shoots out ~1.6× to reach the
// AI's 80 px strike rect, then snaps back) · appear (after a teleport: e.alpha fades in, horizontal glitch slices that
// settle) · hurt (flash, recoil) · death (strip dissolve into black flakes — it never falls down).
import * as K from '../enemy_kit.js';
import { dirOf, glint, claimDebris } from './_biped.js';
import { clamp, lerp, ease } from '../../../core/math.js';

export const spec = {
  id: 'faceless', tier: 'T2', src: 'faceless',
  bake: { outline: 0.4, deep: { leg: 0.6, arm: 0.55 }, deepTint: 'rgb(120,110,130)' },
};

const _q = [0, 0], _g = [0, 0];
let GL = 0, GT = 0, TD = 2;
const glitchOff = (u, i) => { const h = K.h1(i * 7.1 + GT); _g[0] = (h - 0.5) * 18 * GL * TD; _g[1] = 0; return _g; };

const Q = { hipF: 0, hipB: 0, bob: 0, lean: 0, tilt: 0, arm: 0, armB: 0, stretch: 1, tele: 0 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, q = Q;
  const creep = an === 'creep', frozen = an === 'freeze';
  const ph = t * 3.2, sw = creep ? Math.sin(ph) : 0, cw = creep ? Math.cos(ph) : 0;
  q.hipF = creep ? sw * 0.32 : 0.06; q.hipB = creep ? -sw * 0.32 : -0.06;
  q.bob = creep ? -Math.abs(cw) * 2.2 : frozen ? 0 : Math.sin(t * 1.3) * 0.6;
  q.lean = creep ? 0.14 : frozen ? 0.02 : 0.03 + Math.sin(t * 0.7) * 0.03;
  q.tilt = e.watched ? -0.08 : 0;
  q.arm = creep ? 0.12 + sw * 0.2 : frozen ? 0.05 : 0.08 + Math.sin(t * 0.9) * 0.04;
  q.armB = creep ? 0.1 - sw * 0.2 : 0.05;
  q.stretch = 1; q.tele = 0;
  if (an === 'grab') {
    const k = clamp(e.aimK ?? 0, 0, 1), T0 = e.params?.grab ?? 0.35, st = e.stateT ?? 0;
    if (st < T0) { const kk = ease.outCubic(k); q.arm = lerp(q.arm, 1.5, kk); q.stretch = 1 + 0.15 * kk; q.lean = lerp(q.lean, -0.05, kk); q.tele = k; }
    else {
      const s = clamp((st - T0) / 0.08, 0, 1), r = clamp((st - T0 - 0.15) / 0.3, 0, 1);
      q.arm = lerp(1.62, 0.2, r * r * (3 - 2 * r)); q.stretch = lerp(1.15, 1.65, s) * (1 - r) + r; q.lean = 0.18 * (1 - r);
    }
  }
  if (K.hurtOf(e)) { q.lean -= 0.22; q.arm -= 0.2; q.tilt -= 0.1; }
  return q;
}

const L = { hx: 0, hy: 0, rot: 0, sx: 0, sy: 0, fx: 0, fy: 0 };
function place(e, q) {
  const hipY = -56 + q.bob;
  L.hx = 0; L.hy = hipY; L.rot = q.lean + q.tilt;
  K.pivotPos('body', 'a', 'shoulder', 0, hipY, L.rot, 1, 1, _q); L.sx = _q[0]; L.sy = _q[1];
  K.pivotPos('body', 'a', 'face', 0, hipY, L.rot, 1, 1, _q); L.fx = _q[0]; L.fy = _q[1];
  return L;
}
/** arm: limb angle a (0 = hanging, + = forward), stretched along its length */
function putArm(x, y, a, stretch, vn, alpha) {
  const p = K.part('arm');
  const dir = dirOf(a);
  K.bone('arm', x, y, dir, 1, vn, alpha, stretch);
  return p;
}

function figure(e, q, alpha) {
  K.bone('leg', L.hx - 2, L.hy, dirOf(q.hipB), 1, 'deep', alpha);
  putArm(L.sx - 3, L.sy + 1, q.armB, 1, 'deep', alpha);
  if (GL > 0.01) K.strips('body', 'a', L.hx, L.hy, L.rot, 1, 1, K.nStrips(10), 'y', glitchOff, alpha);
  else K.put('body', 'a', L.hx, L.hy, L.rot, 1, 1, alpha);
  K.bone('leg', L.hx + 1, L.hy, dirOf(q.hipF), 1, 'base', alpha);
  putArm(L.sx, L.sy, q.arm, q.stretch, 'base', alpha);
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e), t = e.t ?? 0;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      K.begin(ctx, rig, 0); place(e, q); K.end();
      e._pcorpse = true; claimDebris(world, e);
      const legA = rig.parts.leg.ang, armA = rig.parts.arm.ang;   // (K.part needs begin(); the rig is at hand)
      K.spawnDissolve(world, e, rig, [
        { name: 'leg', pv: 'a', x: L.hx - 2, y: L.hy, rot: dirOf(q.hipB) - legA, vn: 'deep' },
        { name: 'body', pv: 'a', x: L.hx, y: L.hy, rot: L.rot },
        { name: 'leg', pv: 'a', x: L.hx + 1, y: L.hy, rot: dirOf(q.hipF) - legA },
        { name: 'arm', pv: 'a', x: L.sx, y: L.sy, rot: dirOf(q.arm) - armA },
      ], { life: 1.0, strips: 16, drift: 34, rise: 22, col: '#2a2430', kind: 2, n: 24, spread: 110, cy: -60 });
    }
    return;
  }
  GT = Math.floor(t * 24); TD = rig.td;
  GL = e.anim === 'appear' ? clamp(1 - (e.alpha ?? 1), 0, 1) : 0;
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.05 * sq, 1 - 0.05 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  place(e, q);
  K.shadow(12, 0.35);
  figure(e, q, 1);
  if (!o.flash) {
    // the blank face: two faint bruise-red hollows that flare when it strikes
    const hot = Math.max(q.tele, e.anim === 'grab' && (e.stateT ?? 0) >= (e.params?.grab ?? 0.35) ? 1 : 0);
    for (const pn of ['eyeL', 'eyeR']) { K.pivotPos('body', 'a', pn, L.hx, L.hy, L.rot, 1, 1, _q); K.glow(_q[0], _q[1], 2 + 2 * hot, '#ff3a4a', 0.35 + 0.5 * hot); }
    if (q.tele > 0.5) {
      const p = K.part('arm'), d = dirOf(q.arm);
      glint(ctx, L.sx + Math.cos(d) * p.len * q.stretch, L.sy + Math.sin(d) * p.len * q.stretch, 4 + 5 * q.tele, '#ffd8e0', (q.tele - 0.5) * 2);
    }
    if (e.watched && e.anim === 'freeze') K.glow(L.fx, L.fy, 10, '#e8e0ff', 0.12);
  }
  K.end();
  // black flakes peel off the coat tails while creeping (camera space)
  if (world && o.cam && !o.flash && e.anim === 'creep') {
    const pool = e._fx ?? (e._fx = new K.FxPool(10));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
    for (let n = pool.rate(0, 3, dt); n > 0; n--) pool.add(4, e.cx - f * sc * K.frand(4, 16), e.bottom - sc * K.frand(10, 40), -f * K.frand(10, 30), K.frand(-20, 0), K.frand(0.6, 1), K.frand(1.2, 2), '#141018');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  } else if (e._fx && world && o.cam) { e._fx.step(K.clockOf(e, world)); if (e._fx.n) { ctx.setTransform(o.cam); e._fx.draw(ctx); } }
}
