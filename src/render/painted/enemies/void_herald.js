// T2 painted floating caster: 공허의 전령 (void_herald, 44×100). Parts (Kling parts sheet 1): the hooded priest seen from
// the front — iridescent spiked halo behind the hood, two white eye-lights in the dark, the robe split open on a
// starfield, the hem tearing into black smoke (strip-warped so it drifts like something underwater); its far arm and
// light hand stay painted, the near arm is the loose bell sleeve with the white light hand, swung from the shoulder.
// States (AI_D.herald): float (slow bob, hem drifting, the hand turning) · aim (P.aim 0.9 s, aimK: the hand follows
// e.aimA and gathers a white-rainbow charge, the eyes flare; e.lock = the aim line froze → the hand shivers) · fire (the
// prism beam leaves the hand: recoil, flash) · raise (cast 0.7 s: the arm rises overhead, the halo flares and spins
// its light, dying stars gather) · blink (e.alpha fades out and in; the figure shears into horizontal slices) · hurt
// (flash, squash, the hood snaps back) · death (dissolves upward into stars).
import * as K from '../enemy_kit.js';
import { claimDebris } from './_biped.js';
import { clamp, lerp, ease } from '../../../core/math.js';

export const spec = {
  id: 'void_herald', tier: 'T2', src: 'void_herald',
  bake: { outline: 0.4 },
};

const PI = Math.PI;
const _q = [0, 0], _w = [0, 0];
const RAINBOW = ['#ff6aa8', '#ffe46a', '#6affc0', '#7a9aff', '#d07aff'];
let HT = 0, TD = 2.4, GL = 0, GT = 0;
// robe: the hem drifts (quadratic in u = texel row from the top), the blink shears it into slices
const robeOff = (u, i) => {
  _w[0] = (Math.sin(HT * 1.9 - u * 4.2) * u * u * 3.2 + (GL > 0.01 ? (K.h1(i * 5.3 + GT) - 0.5) * 16 * GL : 0)) * TD;
  _w[1] = 0; return _w;
};

const Q = { bob: 0, rot: 0, dir: 0, hot: 0, lock: 0, raise: 0, recoil: 0, aimDir: 0, aimW: 0 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, st = e.stateT ?? 0, q = Q, k = clamp(e.aimK ?? 0, 0, 1);
  q.bob = Math.sin(t * 1.3) * 2.2; q.rot = Math.sin(t * 0.8) * 0.03;
  q.dir = PI / 2 - 0.95 + Math.sin(t * 1.5) * 0.1;    // float: the hand held out low in front
  q.hot = 0.3 + 0.1 * Math.sin(t * 3); q.lock = 0; q.raise = 0; q.recoil = 0;
  if (an === 'aim' || an === 'fire') {
    const f = e.facing < 0 ? -1 : 1, aa = e.aimA ?? 0;
    const ld = Math.atan2(Math.sin(aa), Math.cos(aa) * f);   // world beam angle → local (drawn facing right)
    q.aimDir = ld;
    const w = an === 'fire' ? 1 : ease.outCubic(clamp(k / 0.3, 0, 1));
    q.aimW = w;
    q.hot = an === 'fire' ? 1 : 0.3 + 0.7 * k;
    q.lock = an === 'aim' && e.lock ? 1 : 0;
    if (an === 'fire') q.recoil = clamp(1 - st / 0.3, 0, 1);
  } else q.aimW = 0;
  if (an === 'raise') { q.raise = ease.outCubic(k); q.hot = 0.3 + 0.7 * k; if (st > 0.7) q.hot = clamp(1 - (st - 0.7) / 0.3, 0.3, 1); }
  if (K.hurtOf(e)) { q.rot -= 0.12; q.hot = 0.1; }
  return q;
}

const L = { bx: 0, by: 0, sx: 0, sy: 0, dir: 0, hx: 0, hy: 0 };
function layout(e, q) {
  L.bx = 0; L.by = -46 + q.bob;
  K.pivotPos('body', 'a', 'shoulder', L.bx, L.by, q.rot, 1, 1, _q); L.sx = _q[0] - 2; L.sy = _q[1] + 1;
  let d = q.dir;
  if (q.aimW > 0) {
    // point the hand at the beam line (the AI fires from (16, −h·0.62)), not just parallel to it
    const ox = 16, oy = -(e.h ?? 100) * 0.62, tx = ox + Math.cos(q.aimDir) * 150, ty = oy + Math.sin(q.aimDir) * 150;
    const da = Math.atan2(ty - L.sy, tx - L.sx);
    d = lerpAng(d, da, q.aimW) - q.recoil * 0.25;
  }
  if (q.raise > 0) d = lerpAng(d, -PI / 2 + 0.3, q.raise);
  if (q.lock) d += Math.sin((e.t ?? 0) * 70) * 0.02;
  L.dir = d;
  const a = K.part('arm');
  K.pivotPos('arm', 'a', 'palm', L.sx, L.sy, d - a.ang, 1, 1, _q); L.hx = _q[0]; L.hy = _q[1];
  return L;
}
function lerpAng(a, b, k) { let d = b - a; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI; return a + d * k; }

export function draw(ctx, e, world, o, rig) {
  const q = pose(e), t = e.t ?? 0;
  TD = rig.td; HT = t;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      K.begin(ctx, rig, 0); layout(e, q); K.end();
      e._pcorpse = true; claimDebris(world, e);
      K.spawnDissolve(world, e, rig, [
        { name: 'body', pv: 'a', x: L.bx, y: L.by, rot: q.rot },
        { name: 'arm', pv: 'a', x: L.sx, y: L.sy, rot: L.dir - K.part('arm').ang },
      ], { life: 1.2, strips: 16, drift: 30, rise: 40, col: '#ffffff', kind: 3, n: 30, spread: 120, glow: '#c8b8ff', cy: -50 });
    }
    return;
  }
  GL = e.anim === 'blink' ? clamp(1 - (e.alpha ?? 1), 0, 1) : 0; GT = Math.floor(t * 24);
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.05 * sq, 1 - 0.05 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  layout(e, q);
  if (!o.flash) {
    // the halo's light: a slow rainbow wheel behind the hood, flaring for the starfall
    K.pivotPos('body', 'a', 'halo', L.bx, L.by, q.rot, 1, 1, _q);
    const hx = _q[0], hy = _q[1], hk = 0.35 + 0.65 * q.raise;
    for (let i = 0; i < 5; i++) {
      const a = t * (0.8 + q.raise * 3) + i * (2 * PI / 5), r = 8 + 3 * q.raise;
      K.glow(hx + Math.cos(a) * r, hy + Math.sin(a) * r * 0.9, 6 + 5 * q.raise, RAINBOW[i], 0.25 * hk);
    }
    K.glow(hx, hy, 14 + 12 * q.raise, '#f4f0ff', 0.2 + 0.35 * q.raise);
  }
  // (the white hit flash is drawn unwarped: one blit, no strip seams in the silhouette)
  if (o.flash && GL < 0.01) K.put('body', 'a', L.bx, L.by, q.rot, 1, 1);
  else K.strips('body', 'a', L.bx, L.by, q.rot, 1, 1, K.nStrips(8), 'y', robeOff, 1);
  const arm = K.part('arm');
  K.put('arm', 'a', L.sx, L.sy, L.dir - arm.ang, 1, 1);
  if (!o.flash) {
    const eyeA = 0.7 + 0.3 * q.hot;
    for (const pn of ['eyeL', 'eyeR']) { K.pivotPos('body', 'a', pn, L.bx, L.by, q.rot, 1, 1, _q); K.glow(_q[0], _q[1], 1.6 + 1.6 * q.hot, '#ffffff', eyeA, 0.25); }
    K.pivotPos('body', 'a', 'handF', L.bx, L.by, q.rot, 1, 1, _q); K.glow(_q[0], _q[1], 7, '#e8f0ff', 0.45);
    // the light hand: white core, a rainbow fringe while it charges, a hard flash when the beam leaves it
    K.glow(L.hx, L.hy, 8 + 16 * q.hot, '#ffffff', 0.4 + 0.5 * q.hot);
    if (q.hot > 0.5) K.glow(L.hx + Math.sin(t * 9) * 2, L.hy + Math.cos(t * 7) * 2, 10 + 10 * q.hot, RAINBOW[Math.floor(t * 12) % 5], 0.35 * q.hot);
    if (q.recoil > 0) K.glow(L.hx, L.hy, 26, '#ffffff', 0.8 * q.recoil, 0.15);
    if (q.lock) K.glow(L.hx, L.hy, 5, '#ffffff', 0.9, 0.1);
  }
  K.end();
  // stars twinkling in the robe, dust of dying stars gathering to the raised hand (camera space)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(22));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
    for (let n = pool.rate(0, K.lod() === 0 ? 2 : 5, dt); n > 0; n--) pool.add(3, e.cx + f * sc * K.frand(-10, 14), e.bottom + sc * (L.by + K.frand(-6, 40)), K.frand(-4, 4), K.frand(-10, 4), K.frand(0.4, 0.9), K.frand(0.8, 1.6), '#ffffff');
    if (q.raise > 0.05 || q.hot > 0.6) for (let n = pool.rate(1, (K.lod() === 0 ? 8 : 18) * Math.max(q.raise, q.hot - 0.4), dt); n > 0; n--) {
      const a = K.frand(0, 2 * PI), r = K.frand(18, 34);
      pool.add(3, e.cx + f * sc * (L.hx + Math.cos(a) * r), e.bottom + sc * (L.hy + Math.sin(a) * r), -Math.cos(a) * r * 2.4 * f, -Math.sin(a) * r * 2.4, 0.4, K.frand(1, 2), RAINBOW[(n + Math.floor(t * 10)) % 5]);
    }
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
