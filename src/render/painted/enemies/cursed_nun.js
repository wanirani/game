// T2 painted puppet: 저주받은 수녀 (cursed_nun). New design: a gaunt nun gliding above the floor, eyes bound with a
// blood-soaked blindfold, black habit and veil, the torn hem bleeding violet light over bare darkened feet; an inverted
// violet rosary cross swings at her chest. Rig: the body (side figure; the hem and veil tail are warped with a seam-free
// warpY), the near arm (bell sleeve + hand, swung from the shoulder), the inverted cross (pendulum).
// States (AI_B.nun: 'float' 'pray'): float (hovers and bobs, the hem ripples and trails the glide, violet wisps drip off
// the hem, the blindfold weeps blood) · pray (the inverted prayer: she arches back, the arm lifts with a violet-lit hand,
// the cross rises before her and blazes — the six orbiting crosses appear at 0.3 s and are hurled one by one after
// 1.2 s) · hurt (flash, squash, recoil) · death (the habit collapses as corpse pieces into violet ash).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { claimDebris, glint } from './_biped.js';

export const spec = {
  id: 'cursed_nun', tier: 'T2', src: 'cursed_nun',
  bake: { outline: 0.4, glow: { cross: '#c070ff', body: '#9a50ff' } },
};

const VIO = '#b060ff';
const _q = [0, 0];
const L = { hx: 0, hy: 0, cx: 0, cy: 0, ex: 0, ey: -70 };

const Q = { bob: 0, lean: 0, arm: 0, pray: 0, crossLift: 0, sway: 0, trail: 0 };
function pose(e) {
  const t = e.t ?? 0, at = e.animT ?? e.stateT ?? 0, f = e.facing < 0 ? -1 : 1, P = e.params ?? {};
  const q = Q;
  q.bob = Math.sin(t * 2) * 2.2; q.lean = clamp((e.vx ?? 0) * f * 0.002, -0.08, 0.12);
  q.arm = Math.PI / 2 - 0.08 + Math.sin(t * 1.4) * 0.05; q.pray = 0; q.crossLift = 0;
  q.sway = Math.sin(t * 2.2) * 0.25; q.trail = Math.min(10, Math.abs(e.vx ?? 0) * 0.08);
  // the AI ends the prayer on the frame the last cross flies (or when every cross is gone), so the release is eased
  // after it instead of snapping back to the float pose (render-only memory e._nun; a fresh entity never blends)
  const m = e._nun ?? (e._nun = { k: 0, t0: 0 });
  let pk = 0;
  if (e.anim === 'pray') {
    const pr = (P.pray ?? 0.9) + 0.3;
    const up = ease.outCubic(clamp(at / 0.3, 0, 1)), down = clamp((at - pr - 0.6) / 0.4, 0, 1);
    pk = up * (1 - down);
    m.k = pk; m.t0 = t;
  } else if (m.k > 0) {
    const u = clamp((t - m.t0) / 0.35, 0, 1);
    pk = m.k * (1 - ease.inOutCubic(u));
    if (u >= 1) m.k = 0;
  }
  if (pk > 0) {
    q.pray = pk;
    q.arm = lerp(q.arm, 0.75 + Math.sin(t * 9) * 0.04, pk);
    q.lean = lerp(q.lean, -0.12, pk);
    q.crossLift = pk; q.sway *= 1 - pk;
  }
  if (K.hurtOf(e)) { q.lean = -0.18; q.arm += 0.3; }
  return q;
}

/** set placement i of `out` (reused objects per frame; the corpse passes a fresh array) */
function slot(out, i, name, x, y, rot, sx, sy) {
  const o = out[i] ?? (out[i] = { name: '', pv: 'a', x: 0, y: 0, rot: 0, sx: 1, sy: 1, vn: 'base' });
  o.name = name; o.x = x; o.y = y; o.rot = rot; o.sx = sx; o.sy = sy;
  return o;
}
function place(q, out) {
  const bx = 0, by = -1 + q.bob, tr = q.lean;
  K.pivotPos('body', 'a', 'sh', bx, by, tr, 1, 1, _q); const sx = _q[0], sy = _q[1];
  K.pivotPos('body', 'a', 'chest', bx, by, tr, 1, 1, _q); const cx = _q[0], cy = _q[1];
  const ap = K.part('arm');
  slot(out, 0, 'body', bx, by, tr, 1, 1);
  slot(out, 1, 'arm', sx, sy, q.arm - (ap?.ang ?? 0), 1, 1);
  // the inverted cross hangs from the neck (pendulum); while praying it rises before her chest
  const lx = cx - 3 + 11 * q.crossLift, ly = cy - 1 - 12 * q.crossLift;
  slot(out, 2, 'cross', lx, ly, Math.PI + q.sway * 0.4, 1 + 0.3 * q.crossLift, 1 + 0.3 * q.crossLift);
  const al = ap?.len ?? 30;
  L.hx = sx + Math.cos(q.arm) * al; L.hy = sy + Math.sin(q.arm) * al;
  L.cx = lx; L.cy = ly;
  K.pivotPos('body', 'a', 'eye', bx, by, tr, 1, 1, _q); L.ex = _q[0]; L.ey = _q[1];
  return out;
}
const PCS = [];
const HW = { ph: 0, trail: 0, td: 1 };
const hemOff = (u) => {                   // hoisted warp callback (no per-frame closure)
  const w = Math.max(0, 0.42 - u) / 0.42;          // u: 0 = the feet pivot row … 1 = top of the veil
  _q[0] = (-(w * w) * HW.trail - Math.sin(HW.ph - u * 6) * w * 1.8) * HW.td; _q[1] = 0; return _q;
};

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      claimDebris(world, e);
      const pieces = [];
      K.begin(ctx, rig, 0); place(q, pieces); K.end();
      const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
      for (const p of pieces) { const body = p.name === 'body'; p.vx = kb * 40 + K.frand(-90, 90) * (body ? 0.3 : 1); p.vy = -K.frand(80, 240) * (body ? 0.35 : 1); p.vr = K.frand(-6, 6) * (body ? 0.25 : 1); }
      K.spawnCorpse(world, e, rig, pieces, { life: 1.6, fade: 0.55, bounce: 0.2, dust: { n: 10, w: 22, h: 30, col: '#6a3a9a' } });
    }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(18, 0.25);
  if (!o.flash) K.glow(0, -40, 34, '#7a30d0', 0.12 + 0.3 * q.pray);
  place(q, PCS);
  const b = PCS[0], a = PCS[1], c = PCS[2];
  // habit: the hem (bottom third) ripples and trails the glide; the torso and head stay rigid
  HW.ph = t * 3.2; HW.trail = q.trail; HW.td = rig.td;
  K.warpY('body', 'a', b.x, b.y, b.rot, 1, 1, K.nStrips(9), hemOff, 1, 'base', 0);
  K.put(c.name, c.pv, c.x, c.y, c.rot, c.sx, c.sy);
  K.put(a.name, a.pv, a.x, a.y, a.rot);
  if (!o.flash) {
    const gl = 0.3 + 0.1 * Math.sin(t * 3) + 0.6 * q.pray;
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('cross', 'a', c.x, c.y, c.rot, c.sx * 1.1, c.sy * 1.1, gl, 'glow');
    ctx.globalCompositeOperation = gco;
    K.glow(L.cx + Math.sin(c.rot) * -4, L.cy + 5, 6 + 12 * q.pray, VIO, gl);
    if (q.pray > 0.2) K.glow(L.hx, L.hy, 4 + 8 * q.pray, VIO, 0.8 * q.pray);
    if (q.pray > 0.9 && e.anim === 'pray' && (e.animT ?? 0) < 0.5) glint(ctx, L.cx, L.cy + 6, 5 + 3 * q.pray, '#f0d8ff', (q.pray - 0.9) * 10);
  }
  K.end();
  if (!world || !o.cam || o.flash) return;
  // violet wisps dripping off the torn hem, blood weeping from the blindfold (world space, per second of game time)
  const pool = e._fx ?? (e._fx = new K.FxPool(22));
  const dt = pool.step(K.clockOf(e, world));
  const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1), lo = K.lod() === 0 ? 0.5 : 1;
  for (let n = pool.rate(0, (6 + 10 * q.pray) * lo, dt); n > 0; n--) pool.add(0, e.cx + K.frand(-12, 10) * sc, e.bottom - K.frand(4, 18) * sc, K.frand(-10, 10) - f * q.trail * 2, K.frand(-30, -8), K.frand(0.5, 0.9), K.frand(3, 5.5) * sc, VIO);
  for (let n = pool.rate(1, 0.8, dt); n > 0; n--) pool.add(1, e.cx + f * sc * (L.ex + 1), e.bottom + sc * (L.ey + 3), 0, K.frand(10, 30), K.frand(0.6, 1), 1.3 * sc, '#a0101c');
  if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 8; i++) pool.add(0, e.cx + K.frand(-8, 8), e.bottom - 44 + K.frand(-12, 12), K.frand(-120, 120), K.frand(-140, 20), K.frand(0.35, 0.6), K.frand(3, 5), VIO); }
  if (e.flashT <= 0) e._hitFx = false;
  ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
}
