// T2 painted puppet: 피의 사제 (blood_priest). New design: a gaunt, grinning priest with a jewelled mitre, fur-collared
// blood-red chasuble, gold-cross stole and a rosary, holding up a golden chalice that overflows with blood. Rig: the body
// (side figure, robe hem warped with a seam-free warpY), the chalice arm (hanging sleeve piece swung from the shoulder) and
// the chalice with the gripping hand at the cuff (kept upright, tipped when pouring).
// States (AI_B.priest: 'idle' 'walk' 'cast' 'channel'): idle (slow breathing, chalice held at the chest, blood drips) ·
// walk (gliding step: robe sways, hem trails, bob) · cast (the chalice is raised high on 0.25 s — the blood lances erupt
// under the player — a blood sigil turns under his feet, eyes and chalice blaze; held until the end, lowered after) ·
// channel (0.8 s: the chalice is tipped toward the ally he heals, a red aura and blood motes pour out) · hurt (flash,
// recoil, blood spatter) · death (the priest collapses as corpse pieces into a pool-coloured dust).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease, TAU } from '../../../core/math.js';
import { claimDebris, glint } from './_biped.js';

export const spec = {
  id: 'blood_priest', tier: 'T2', src: 'blood_priest',
  bake: { outline: 0.42, glow: { chalice: '#ff3a4a' } },
};

const BLOOD = '#d0142a';
const _q = [0, 0];

const P = { bob: 0, lean: 0, arm: 1.05, tip: 0, raise: 0, chan: 0, sway: 0, walk: 0 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? e.stateT ?? 0, prm = e.params ?? {};
  const q = P;
  q.walk = an === 'walk' ? 1 : 0;
  q.bob = q.walk ? -Math.abs(Math.cos(t * 5)) * 1.6 : Math.sin(t * 1.6) * 0.6;
  q.lean = q.walk ? 0.05 : 0.02; q.arm = 0.8 + Math.sin(t * 1.6) * 0.04; q.tip = 0; q.raise = 0; q.chan = 0;
  q.sway = q.walk ? Math.sin(t * 5) : Math.sin(t * 1.3) * 0.3;
  if (an === 'cast') {
    const hold = prm.cast ?? 0.8;
    const up = ease.outCubic(clamp(at / 0.25, 0, 1)), down = clamp((at - hold) / 0.3, 0, 1);
    q.raise = up * (1 - down);
    q.arm = lerp(q.arm, -1.3, q.raise); q.lean = lerp(q.lean, -0.1, q.raise); q.tip = -0.1 * q.raise;
  } else if (an === 'channel') {
    const k = ease.outCubic(clamp(at / 0.25, 0, 1));
    q.chan = k; q.arm = lerp(q.arm, 0.15 + Math.sin(t * 18) * 0.03, k); q.tip = 0.55 * k; q.lean = 0.06;
  }
  if (K.hurtOf(e)) { q.lean = -0.2; q.arm += 0.4; }
  return q;
}

function place(q, t, out) {
  const tr = q.lean;
  K.pivotPos('body', 'a', 'sh', 0, 0, tr, 1, 1, _q); const sx = _q[0], sy = _q[1] + q.bob;
  const ap = K.part('arm'), L = ap?.len ?? 23;
  const cx = sx + Math.cos(q.arm) * L, cy = sy + Math.sin(q.arm) * L;
  out.push({ name: 'body', pv: 'a', x: 0, y: q.bob, rot: tr, sx: 1, sy: 1, vn: 'base' });
  out.push({ name: 'arm', pv: 'a', x: sx, y: sy, rot: q.arm - (ap?.ang ?? 0), sx: 1, sy: 1, vn: 'base' });
  out.push({ name: 'chalice', pv: 'a', x: cx, y: cy, rot: q.tip + Math.sin(t * 1.6) * 0.03, sx: 1, sy: 1, vn: 'base' });
  return out;
}
const PCS = [];

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      claimDebris(world, e);
      const pieces = [];
      K.begin(ctx, rig, 0); place(q, t, pieces); K.end();
      const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
      for (const p of pieces) { const body = p.name === 'body'; p.vx = kb * 40 + K.frand(-90, 90) * (body ? 0.3 : 1); p.vy = -K.frand(80, 240) * (body ? 0.35 : 1); p.vr = K.frand(-6, 6) * (body ? 0.25 : 1); }
      K.spawnCorpse(world, e, rig, pieces, { life: 1.6, fade: 0.55, bounce: 0.2, dust: { n: 10, w: 24, h: 30, col: '#7a1020' } });
    }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(22, 0.4);
  // blood sigil under the feet while casting (local space, behind the priest)
  if (!o.flash && q.raise > 0.02) sigil(ctx, 0, -1, 26 + 4 * q.raise, t, q.raise);
  if (!o.flash) K.glow(0, -40, 36, '#ff2a44', 0.1 + 0.35 * q.raise + 0.25 * q.chan);
  PCS.length = 0; place(q, t, PCS);
  const ph = t * (q.walk ? 6 : 2), sway = q.sway;
  const b = PCS[0];
  // robe: the hem (lower half) sways with the step and trails behind while walking
  K.warpY('body', 'a', b.x, b.y, b.rot, 1, 1, K.nStrips(9), (u) => {
    const w = Math.max(0, 0.5 - u) / 0.5;            // u: 0 = the feet pivot row (hem) … 1 = top of the mitre
    _q[0] = (-(w * w) * 3 * q.walk + Math.sin(ph - u * 4) * w * 1.6 * (0.4 + Math.abs(sway))) * rig.td; _q[1] = 0; return _q;
  }, 1, 'base', 0);
  const a = PCS[1], c = PCS[2];
  K.put(a.name, a.pv, a.x, a.y, a.rot);
  K.put(c.name, c.pv, c.x, c.y, c.rot);
  if (!o.flash) {
    K.pivotPos('body', 'a', 'eye', b.x, b.y, b.rot, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.2 + 2 * (q.raise + q.chan), '#ff3040', 0.8);
    K.pivotPos('chalice', 'a', 'cup', c.x, c.y, c.rot, 1, 1, _q);
    const gl = 0.35 + 0.15 * Math.sin(t * 4) + 0.5 * q.raise + 0.4 * q.chan;
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('chalice', 'a', c.x, c.y, c.rot, 1.05, 1.05, gl * 0.6, 'glow');
    ctx.globalCompositeOperation = gco;
    K.glow(_q[0], _q[1], 6 + 10 * q.raise + 6 * q.chan, '#ff2a3a', gl);
    if (q.raise > 0.85 && (e.animT ?? 0) < 0.45) glint(ctx, _q[0], _q[1] - 4, 4 + 4 * q.raise, '#ffd0d0', (q.raise - 0.85) / 0.15);
    L.cx = _q[0]; L.cy = _q[1];
  }
  K.end();
  if (!world || !o.cam || o.flash) return;
  // blood dripping from the chalice (more when tipped), motes rising from the sigil (world space, per second of game time)
  const pool = e._fx ?? (e._fx = new K.FxPool(24));
  const dt = pool.step(K.clockOf(e, world));
  const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1), lo = K.lod() === 0 ? 0.5 : 1;
  const wx = e.cx + f * sc * L.cx, wy = e.bottom + sc * L.cy;
  for (let n = pool.rate(0, (1.5 + 10 * q.chan) * lo, dt); n > 0; n--) pool.add(1, wx + f * K.frand(-1, 3) * sc, wy + 2 * sc, f * 20 * q.chan, K.frand(10, 40), K.frand(0.5, 0.9), 1.6 * sc, BLOOD);
  if (q.raise > 0.1) for (let n = pool.rate(1, 16 * lo * q.raise, dt); n > 0; n--) { const a2 = K.frand(0, TAU), r = K.frand(8, 26) * sc; pool.add(0, e.cx + Math.cos(a2) * r, e.bottom - 2 + Math.sin(a2) * r * 0.3, 0, K.frand(-60, -25), K.frand(0.4, 0.8), K.frand(2.5, 4.5) * sc, '#ff3a4a'); }
  if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 8; i++) pool.add(1, e.cx + K.frand(-8, 8), e.bottom - 50 + K.frand(-10, 10), K.frand(-120, 120), K.frand(-160, -20), K.frand(0.4, 0.7), K.frand(1.4, 2.4), BLOOD); }
  if (e.flashT <= 0) e._hitFx = false;
  ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
}
const L = { cx: 0, cy: -50 };

/** rotating blood sigil (ellipse ring + inverted-star spokes), local space, additive */
function sigil(ctx, x, y, r, t, a) {
  K.local();
  const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
  ctx.globalAlpha = ga * clamp(a, 0, 1) * 0.85; ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#ff2a3a'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.28, 0, 0, TAU); ctx.stroke();
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.72, r * 0.2, 0, 0, TAU); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const ang = t * 0.9 + (i * 2 * TAU) / 5;
    const px = x + Math.cos(ang) * r * 0.72, py = y + Math.sin(ang) * r * 0.2;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
}
