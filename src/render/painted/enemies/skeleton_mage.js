// T2 painted mini-puppet: 해골 마법사 (skeleton_mage). Skeleton-rig variant: the hooded purple robe (skull, gold mantle,
// rope belt with skull charms, bony feet) is one strip-warped body — the hem sways and trails when it walks; the wide
// sleeve + bony hand is a separate stiff arm (twice: the far one darkened) and the near hand holds the gnarled staff
// with the violet crystal.
// Driven by AI_A.caster: idle (breathing sway, staff planted) · walk (slow glide, hem trails) · cast (0 → params.cast:
// both sleeves rise, the staff lifts forward, the crystal and the eye sockets blaze, a violet rune circle spreads at
// its feet — the telegraph glint on the crystal peaks just before the spell fires) · hurt (flash, recoil, sleeves
// flail) · death (the robe crumbles into violet ash — strip dissolve — and the staff clatters to the floor).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { dirOf, glint, claimDebris, HP } from './_biped.js';
import { runeCircle } from './blood_skeleton.js';

export const spec = {
  id: 'skeleton_mage', tier: 'T2', src: 'skeleton_mage',
  bake: { outline: 0.4, deep: { sleeve: 0.58 }, deepTint: 'rgb(130,110,160)' },
};

const _q = [0, 0], _g = [0, 0];
const VIOLET = '#c070ff';
let T = 0, WALK = 0, TD = 2;

function hem(u) {     // u = 0 at the feet (pivot) … 1 at the hood tip: the lower robe sways and trails
  const h = clamp(1 - u / 0.55, 0, 1);
  _q[0] = (-(h * h) * (WALK ? 4 : 1.2) - Math.sin(T * (WALK ? 7 : 2.2) - u * 6) * h * (WALK ? 1.6 : 0.8)) * TD; _q[1] = 0;
  return _q;
}

/** pose → placement values (reused object) */
const Q = {};
function pose(e) {
  const t = e.t ?? 0, at = e.animT ?? 0, cast = e.anim === 'cast';
  const walk = e.anim === 'walk';
  const T0 = e.params?.cast ?? 0.8;
  const k = cast ? ease.outCubic(clamp(at / 0.35, 0, 1)) : 0;
  const w = cast ? clamp(at / T0, 0, 1) : 0;
  const ph = t * 6;
  Q.k = k; Q.w = w; Q.cast = cast;
  Q.bob = walk ? -Math.abs(Math.cos(ph)) * 1.4 : Math.sin(t * 2.2) * 0.6;
  Q.lean = (walk ? 0.07 : 0.02) - 0.08 * k;
  Q.shF = lerp(walk ? 0.3 + Math.sin(ph) * 0.12 : 0.34 + Math.sin(t * 1.3) * 0.03, 2.35, k) + Math.sin(t * 20) * 0.03 * w;
  Q.shB = lerp(walk ? -0.05 - Math.sin(ph) * 0.12 : -0.06, 1.55, k);
  Q.staff = lerp(-0.04, 0.55, k);                  // staff tilt from vertical (+ = top leans forward)
  Q.tele = cast ? w : 0;
  if (K.hurtOf(e)) { Q.lean = -0.2; Q.shF -= 0.5; Q.shB -= 0.4; Q.staff -= 0.3; }
  Q.lean += K.deathK(e) * 0.5;
  return Q;
}

const PL = [];
function layout(q) {
  let n = 0;
  const add = (name, x, y, rot, vn = 'base', pv = 'a') => { const o = PL[n] ?? (PL[n] = {}); o.name = name; o.x = x; o.y = y; o.rot = rot; o.vn = vn; o.pv = pv; o.sx = 1; o.sy = 1; n++; return o; };
  const by = q.bob, rot = q.lean * 0.35;
  K.pivotPos('body', 'a', 'shoulder', 0, by, rot, 1, 1, _q);
  const shx = _q[0], shy = _q[1];
  const sl = K.part('sleeve'), st = K.part('staff');
  // far sleeve (behind the robe)
  add('sleeve', shx - 2, shy + 0.5, dirOf(q.shB) - sl.ang, 'deep');
  add('body', 0, by, rot);
  // staff in the near hand (drawn under the fingers)
  const frot = dirOf(q.shF) - sl.ang;
  K.pivotPos('sleeve', 'a', 'grip', shx, shy, frot, 1, 1, _g);
  const sd = -HP + q.staff;
  add('staff', _g[0], _g[1], sd - st.ang);
  add('sleeve', shx, shy, frot);
  K.pivotPos('staff', 'a', 'gem', _g[0], _g[1], sd - st.ang, 1, 1, _q);
  return { n, by, rot, gx: _q[0], gy: _q[1] };
}
function drawAll(L, alpha = 1) {
  for (let i = 0; i < L.n; i++) {
    const p = PL[i];
    if (p.name === 'body') K.strips('body', 'a', p.x, p.y, p.rot, 1, 1, K.nStrips(8), 'y', hem, alpha, p.vn);
    else K.put(p.name, p.pv, p.x, p.y, p.rot, 1, 1, alpha, p.vn);
  }
}

function die(e, world, rig, L) {
  e._pcorpse = true;
  claimDebris(world, e);
  const pl = [];
  for (let i = 0; i < L.n; i++) { const p = PL[i]; if (p.name !== 'staff') pl.push({ name: p.name, pv: p.pv, x: p.x, y: p.y, rot: p.rot, sx: 1, sy: 1, vn: p.vn }); }
  K.spawnDissolve(world, e, rig, pl, { life: 1.0, strips: 16, drift: 40, rise: 18, col: '#b070ff', kind: 3, n: 26, spread: 130, glow: '#9a50ff', cy: -42, layer: 'back' });
  const s = PL.find((p, i) => i < L.n && p.name === 'staff');
  if (s) K.spawnCorpse(world, e, rig, [{ name: 'staff', pv: s.pv, x: s.x, y: s.y, rot: s.rot, sx: 1, sy: 1, vn: 'base', vx: (e.facing < 0 ? -1 : 1) * K.frand(-40, 80), vy: -K.frand(60, 160), vr: K.frand(-5, 5) }],
    { life: 1.6, fade: 0.5, bounce: 0.3 });
}

export function draw(ctx, e, world, o, rig) {
  T = e.t ?? 0; WALK = e.anim === 'walk' ? 1 : 0; TD = rig.td;
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); const L = layout(q); K.end(); die(e, world, rig, L); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(16);
  // rune circle under its feet while casting (the fire pillar lands on the player; the circle is the tell)
  if (q.cast && !o.flash) runeCircle(ctx, 0, -2, 30 * ease.outCubic(q.w), T, '#c07cff', 0.9 * q.w, true);
  const L = layout(q);
  drawAll(L);
  if (!o.flash) {
    // crystal + eye sockets
    K.glow(L.gx, L.gy, 5 + 7 * q.w + Math.sin(T * 5) * 0.8, VIOLET, 0.55 + 0.4 * q.w);
    if (K.lod() > 0 && q.w > 0.1) K.glow(L.gx, L.gy, 16 + 10 * q.w, '#7a30d0', 0.35 * q.w);
    for (const pn of ['eye', 'eye2']) {
      K.pivotPos('body', 'a', pn, 0, L.by, L.rot, 1, 1, _q);
      K.glow(_q[0], _q[1], 2.2 + 2 * q.w, '#d080ff', 0.6 + 0.25 * Math.sin(T * 6) + 0.3 * q.w);
    }
  }
  if (q.tele > 0.55) glint(ctx, L.gx, L.gy, 5 + 6 * q.tele, '#e0b0ff', (q.tele - 0.55) / 0.45);
  K.end();
}
