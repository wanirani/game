// T2 painted mini-puppet: 하급 악마 (lesser_demon). Parts: the painted imp body (horned head, yellow eyes and fangs,
// black mane, glowing chest rune, the near arm hanging, goat legs and hooves), the bat wing (cut rotated so its
// root→tip axis runs along the texel rows: a bending chain, drawn twice behind the body — the far one darkened and a
// beat behind), the far arm that reaches forward (it rises for the cast) and the arrow tail swaying under the mane.
// Driven by AI_A.imp: fly (10 rad/s wing beats with the tips lagging, the body bobbing against the stroke, the tail
// swinging) · cast (rears back and lifts the claw: a dark-fire orb swells in the palm, rune sparks, the eyes and the
// chest rune flare, glint just before the orbs fly at params.castWind) · swoop (0.4 s: wings flung high, claw drawn
// back, glint on the claws) → dive (nose along the dive vector, wings swept back, claw reaching, tail streaming) ·
// hurt (flash, recoil, wings jolt) · death (burns away: strip dissolve into violet embers and ash).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'lesser_demon', tier: 'T2', src: 'lesser_demon',
  bake: { outline: 0.4, deep: { wing: 0.58 }, deepTint: 'rgb(150,120,140)' },
};

const _q = [0, 0];
const WS = 0.86;                 // wing scale (painted wing ≈ 45 px root→tip → ≈ 38 px, the vector wing span)
let WB = 0, WN = 6;
const wingBend = (u) => WB * (0.4 + u) / WN;

const Q = {};
function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = Q, ph = t * 10, fl = Math.sin(ph);
  q.cy = -27 + fl * 2; q.rot = Math.sin(t * 1.7) * 0.04;
  q.ang = 0.35 + 0.6 * fl; q.bend = -0.28 * Math.cos(ph); q.lag = 0.5;
  q.arm = Math.sin(t * 3 + 1) * 0.08; q.tail = Math.sin(t * 3) * 0.12; q.cast = 0; q.tele = 0; q.clawG = 0; q.dive = false;
  if (an === 'cast') {
    const wu = e.params?.castWind ?? 0.65, k = clamp(at / wu, 0, 1), after = Math.max(0, at - wu);
    const sf = Math.sin(t * 7);
    q.ang = 0.45 + 0.4 * sf; q.bend = -0.18 * Math.cos(t * 7); q.cy = -28.5 + sf;
    const ke = ease.outCubic(k), rel = clamp(after / 0.3, 0, 1);
    q.cast = after > 0 ? 1 - rel : ke; q.tele = after > 0 ? 0 : k;
    q.arm = lerp(0, -1.55, ke) + (after > 0 ? 0.35 * ease.outCubic(rel) : 0);
    q.rot = -0.12 * ke + (after > 0 ? 0.1 * Math.sin(rel * Math.PI) : 0);
  } else if (an === 'swoop') {
    const k = clamp(at / 0.35, 0, 1), ke = ease.outCubic(k);
    q.ang = lerp(q.ang, 1.15, ke) + Math.sin(t * 40) * 0.04 * k; q.bend = 0.2 * ke; q.rot = -0.14 * ke; q.cy = -28;
    q.arm = lerp(q.arm, 0.5, ke); q.tail = -0.1; q.tele = k; q.clawG = k;
  } else if (an === 'dive') {
    const f = e.facing < 0 ? -1 : 1, vx = (e.vx ?? 0) * f, vy = e.vy ?? 0;
    q.dive = true;
    q.rot = clamp(Math.atan2(vy, Math.max(60, vx)) * 0.75, -0.3, 0.8);
    q.ang = -0.3 + Math.sin(t * 30) * 0.05; q.bend = 0.12; q.cy = -27;
    q.arm = -0.8; q.tail = -0.35; q.clawG = clamp(1 - at / 0.3, 0, 1);
  }
  if (K.hurtOf(e)) { q.rot -= 0.25; q.ang += 0.35; q.arm += 0.3; }
  q.rot += K.deathK(e) * 0.4;
  return q;
}

/** body placement + joint positions in the enemy's local frame (the body pivot 'a' sits at the hip) */
const L = {};
function layout(q) {
  L.x = 0; L.y = q.cy; L.rot = q.rot;
  K.pivotPos('body', 'a', 'w1', L.x, L.y, L.rot, 1, 1, _q); L.wx = _q[0]; L.wy = _q[1];
  K.pivotPos('body', 'a', 'shoulder', L.x, L.y, L.rot, 1, 1, _q); L.sx = _q[0]; L.sy = _q[1];
  K.pivotPos('body', 'a', 'tail', L.x, L.y, L.rot, 1, 1, _q); L.tx = _q[0]; L.ty = _q[1];
  L.arot = L.rot + q.arm;
  K.pivotPos('arm', 'a', 'hand', L.sx, L.sy, L.arot, 1, 1, _q); L.hx = _q[0]; L.hy = _q[1];
  return L;
}
/** the wing as a bending chain: `ang` = lift above the horizontal (back), texture unmirrored (see parts.json) */
function wing(x, y, ang, s, bend, vn) {
  WB = bend;
  K.chain('wing', x, y, Math.PI + ang, s, WN, wingBend, 1, vn, true);
}

function die(ctx, e, world, rig, q) {
  e._pcorpse = true;
  K.begin(ctx, rig, 0); layout(q); K.end();
  K.spawnDissolve(world, e, rig, [
    { name: 'wing', pv: 'a', x: L.wx + 2, y: L.wy - 1, rot: L.rot + q.ang - q.lag * 0.3, sx: WS * 0.9, sy: WS * 0.9, vn: 'deep' },
    { name: 'tail', pv: 'a', x: L.tx, y: L.ty, rot: L.rot + q.tail },
    { name: 'wing', pv: 'a', x: L.wx, y: L.wy, rot: L.rot + q.ang, sx: WS, sy: WS },
    { name: 'body', pv: 'a', x: L.x, y: L.y, rot: L.rot },
    { name: 'arm', pv: 'a', x: L.sx, y: L.sy, rot: L.arot },
  ], { life: 0.85, strips: 12, drift: 44, rise: 18, col: '#b060ff', kind: 3, n: 22, spread: 160, glow: '#ff5020', cy: -30 });
}
export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) die(ctx, e, world, rig, q);
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  WN = K.nStrips(6);
  if (!o.flash) K.glow(0, q.cy - 6, 30, '#ff3020', 0.14);                          // faint hellish heat around it
  const Lq = layout(q);
  // far wing (darkened, a beat behind), tail, near wing — all behind the body; the forward arm in front of the chest
  wing(Lq.wx + 2.2, Lq.wy - 1, Lq.rot + q.ang - q.lag * 0.3, WS * 0.9, q.bend * 0.8 + 0.04, 'deep');
  K.put('tail', 'a', Lq.tx, Lq.ty, Lq.rot + q.tail);
  wing(Lq.wx, Lq.wy, Lq.rot + q.ang, WS, q.bend, 'base');
  K.put('body', 'a', Lq.x, Lq.y, Lq.rot);
  K.put('arm', 'a', Lq.sx, Lq.sy, Lq.arot);
  if (!o.flash) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    K.pivotPos('body', 'a', 'eye', Lq.x, Lq.y, Lq.rot, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.4 + q.tele * 2.5, '#ffd040', 0.7 + 0.3 * q.tele);
    K.pivotPos('body', 'a', 'chest', Lq.x, Lq.y, Lq.rot, 1, 1, _q);
    K.glow(_q[0], _q[1], 6 + 4 * q.cast, '#ff8a2a', 0.22 + 0.12 * pulse + 0.35 * q.cast);
    if (q.cast > 0.02) {
      // dark fire in the raised palm: violet halo, black core, a turning ring of runes
      const ox = Lq.hx + 1.5, oy = Lq.hy - 3.5, r = 2 + q.cast * 5;
      K.glow(ox, oy, r * 3.4, '#b060ff', 0.75 * q.cast);
      K.local();
      ctx.fillStyle = 'rgba(30,6,48,0.85)';
      ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(220,170,255,0.9)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(ox, oy, r + 0.6, t * 8, t * 8 + 4); ctx.stroke();
      K.glow(ox - r * 0.3, oy - r * 0.3, r * 0.6, '#f0d0ff', 0.8 * q.cast);
      if (q.tele > 0.6) glint(ctx, ox, oy, 6 + 8 * q.tele, '#e0b0ff', (q.tele - 0.6) / 0.4);
    }
  }
  if (q.clawG > 0.05) {
    K.pivotPos('arm', 'a', 'claw', Lq.sx, Lq.sy, Lq.arot, 1, 1, _q);
    glint(ctx, _q[0] + 1, _q[1], 5 + 4 * q.clawG, '#ffb0a0', q.clawG);
  }
  K.end();
  // dark-fire motes rising from the palm while casting, a few embers off the chest rune (world space, per second)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(14));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1), lo = K.lod() === 0;
    if (q.cast > 0.1) for (let n = pool.rate(0, lo ? 6 : 14, dt); n > 0; n--) pool.add(3, e.cx + f * sc * (Lq.hx + 1.5 + K.frand(-3, 3)), e.bottom + sc * (Lq.hy - 3.5 + K.frand(-3, 3)), K.frand(-20, 20), K.frand(-70, -20), K.frand(0.25, 0.5), K.frand(1, 2) * sc, '#c080ff');
    for (let n = pool.rate(1, lo ? 0.8 : 1.8, dt); n > 0; n--) pool.add(0, e.cx + f * sc * K.frand(0, 10), e.bottom + sc * (q.cy - 8 + K.frand(-4, 4)), K.frand(-10, 10), K.frand(-40, -15), K.frand(0.5, 0.9), K.frand(1.2, 2) * sc, '#ff7a2a');
    ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
  }
}
