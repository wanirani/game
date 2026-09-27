// T2 painted winged lancer: 질풍 창기사 (gale_knight, 46×86). Parts (Kling parts sheets 1+2): white-and-gold breastplate
// torso, side helm with the glowing cyan T-visor, near arm (rerebrace + vambrace/gauntlet, 2-bone IK onto the lance
// grip), the very long gold lance, one armoured leg (×2, far leg darkened), one white/gold feathered wing (×2 through
// the bending chain, far wing darkened), the pale blue cape streaming behind (strip warp).
// States (AI_D.galeknight): fly/hover (slow wing beat, legs dangling, lance level at the hip) · aim (aimK 0→1: lance
// drawn back along e.lanceDir, body coils forward, wings rise, visor + lance tip glint) · dash (body pitched into the
// charge, lance thrust at full reach, wings swept back, afterimage streaks) · recover (anim fly) · slash (aimK: the lance
// is raised overhead, at 0.5 s it cuts down → the AI's wind crescent; swing trail) · hurt (flash, squash, recoil) ·
// death (corpse: every armour piece, the lance and the wings tumble to the floor).
import * as K from '../enemy_kit.js';
import { dirOf, swingTrail, glint, claimDebris, ik2 } from './_biped.js';
import { clamp, lerp, ease } from '../../../core/math.js';

export const spec = {
  id: 'gale_knight', tier: 'T2', src: 'gale_knight',
  bake: { outline: 0.45, deep: { leg: 0.62, wing: 0.66 }, deepTint: 'rgb(140,150,175)' },
};

const PI = Math.PI;
const _q = [0, 0];
const PL = []; let NP = 0;
function place(name, x, y, rot, vn = 'base', sx = 1, sy = 1, pv = 'a', kind = 0) {
  const o = PL[NP] ?? (PL[NP] = {});
  o.name = name; o.x = x; o.y = y; o.rot = rot; o.vn = vn; o.sx = sx; o.sy = sy; o.pv = pv; o.kind = kind; NP++;
  return o;
}
let BEND = 0, CT = 0, CS = 0;
const bendN = (u) => BEND * (0.4 + u);
const bendF = (u) => -BEND * (0.4 + u);
const capeOff = (u) => { _q[0] = (-u * u * CS - Math.sin(CT * 5 - u * 4) * u * 1.6) * 4; _q[1] = 0; return _q; };

const Q = { lean: 0, bob: 0, el: 0, elF: 0, lanceA: 0, pull: 0, hipF: 0, hipB: 0, tele: 0, swing: 0, trail: null, head: 0, dash: 0, fold: 1, speed: 0 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, q = Q;
  const k = clamp(e.aimK ?? 0, 0, 1);
  const A = Math.sin(t * 6);
  q.lean = 0.12; q.bob = -A * 2; q.el = 1.05 + 0.5 * A; q.elF = 1.0 + 0.45 * Math.sin(t * 6 - 0.5); q.fold = 1;
  q.lanceA = 0.06; q.pull = 0; q.hipF = 0.22 + Math.sin(t * 2.1) * 0.08; q.hipB = -0.05 + Math.sin(t * 2.1 + 1) * 0.08;
  q.tele = 0; q.swing = 0; q.trail = null; q.head = Math.sin(t * 1.4) * 0.04; q.dash = 0; q.speed = Math.min(1, Math.abs(e.vx ?? 0) / 300);
  if (an === 'aim') {
    const kk = ease.outCubic(k);
    q.lean = lerp(0.12, 0.34, kk); q.pull = 8 * kk; q.lanceA = lerp(0.06, 0, kk); q.el = lerp(q.el, 1.45, kk); q.elF = lerp(q.elF, 1.35, kk);
    q.hipF = lerp(q.hipF, 0.05, kk); q.hipB = lerp(q.hipB, -0.45, kk); q.tele = k; q.bob *= 1 - kk;
  } else if (an === 'dash') {
    q.lean = 0.62; q.pull = -7; q.lanceA = 0; q.el = 0.35 + Math.sin(t * 24) * 0.05; q.elF = 0.3; q.fold = 0.85;
    q.hipF = -0.55; q.hipB = -0.9; q.dash = 1; q.bob = 0; q.speed = 1;
  } else if (an === 'slash') {
    if (k < 1) {                                  // raise overhead (0 → 0.5 s)
      const kw = ease.outCubic(k);
      q.lanceA = lerp(0.06, -1.9, kw); q.lean = lerp(0.12, -0.12, kw); q.tele = k; q.el = lerp(q.el, 1.5, kw); q.pull = 3 * kw;
    } else {                                      // cut (after 0.5 s)
      const s = clamp(((e.stateT ?? 0.5) - 0.5) / 0.12, 0, 1), ks = ease.outCubic(s);
      q.lanceA = lerp(-1.9, 0.7, ks); q.lean = lerp(-0.12, 0.3, ks); q.swing = s; q.el = lerp(1.5, 0.6, ks);
      q.trail = [-1.9, q.lanceA, clamp(1 - ((e.stateT ?? 0.5) - 0.5) / 0.3, 0, 1)];
    }
  }
  if (K.hurtOf(e)) { q.lean -= 0.3; q.head -= 0.25; q.el += 0.4; q.lanceA -= 0.25; }
  q.lean += K.deathK(e) * 0.5;
  return q;
}

const L = { hx: 0, hy: 0, tx: 0, ty: 0, trot: 0, nx: 0, ny: 0, gx: 0, gy: 0, tipx: 0, tipy: 0, shx: 0, shy: 0, wx: 0, wy: 0, dN: 0, dF: 0, cx: 0, cy: 0 };
/** pose the rig into PL (draw order) */
function layout(e, q) {
  NP = 0;
  const sq = K.squashK(e), hipY = -42 + q.bob;
  const tp = K.part('torso');
  // torso stands on the hip joints and leans from there
  K.pivotPos('torso', 'hipN', 'a', 0, hipY, q.lean, 1, 1, _q);
  const tx = _q[0], ty = _q[1], trot = q.lean;
  L.tx = tx; L.ty = ty; L.trot = trot;
  K.pivotPos('torso', 'a', 'neck', tx, ty, trot, 1, 1, _q); L.nx = _q[0]; L.ny = _q[1];
  K.pivotPos('torso', 'a', 'shN', tx, ty, trot, 1, 1, _q); L.shx = _q[0]; L.shy = _q[1];
  K.pivotPos('torso', 'a', 'wing', tx, ty, trot, 1, 1, _q); L.wx = _q[0]; L.wy = _q[1];
  K.pivotPos('torso', 'a', 'cape', tx, ty, trot, 1, 1, _q); L.cx = _q[0]; L.cy = _q[1];
  K.pivotPos('torso', 'a', 'hipF', tx, ty, trot, 1, 1, _q); const hfx = _q[0], hfy = _q[1];
  L.dN = -PI + q.el + trot * 0.5; L.dF = -PI + q.elF + trot * 0.5;
  // back to front: far wing, cape, far leg, near wing root layer, torso, near leg, helm, lance, near arm
  place('wing', L.wx - 2, L.wy, L.dF, 'deep', 0.92 * q.fold, 1, 'a', 2);
  place('cape', L.cx, L.cy, trot * 0.4 + q.speed * 0.25, 'base', 1, 1, 'a', 1);
  place('leg', hfx - 2, hfy, dirOf(q.hipB) - K.part('leg').ang, 'deep');
  place('wing', L.wx + 1, L.wy + 1, L.dN, 'base', q.fold, 1, 'a', 3);
  place('torso', tx, ty, trot);
  K.pivotPos('torso', 'a', 'hipN', tx, ty, trot, 1, 1, _q);
  place('leg', _q[0], _q[1], dirOf(q.hipF) - K.part('leg').ang);
  place('helm', L.nx + 1, L.ny + 2, trot * 0.5 + q.head);
  // lance: grip at the fist; fist sits at the hip, pulled back by q.pull while aiming
  const la = q.lanceA, lp = K.part('lance');
  const gx = L.shx + 5 - q.pull + Math.max(0, -la) * 4, gy = L.shy + 18 - Math.max(0, -la) * 20;
  place('lance', gx, gy, la - lp.ang, 'base', 1, 1, 'grip');
  L.gx = gx; L.gy = gy;
  const fore = lp.len * (lp.piv.tip[0] - lp.piv.grip[0]) / (lp.piv.tip[0] - lp.piv.a[0]);   // grip → tip (logical px)
  L.tipx = gx + Math.cos(la) * fore; L.tipy = gy + Math.sin(la) * fore;
  // near arm: 2-bone IK shoulder → fist
  const ua = K.part('uarm'), fa = K.part('farm');
  const d = ik2(L.shx, L.shy, gx, gy, ua.len, fa.len, -1);
  const d0 = d[0], d1 = d[1];
  place('uarm', L.shx, L.shy, d0 - ua.ang);
  const ex = L.shx + Math.cos(d0) * ua.len, ey = L.shy + Math.sin(d0) * ua.len;
  place('farm', ex, ey, d1 - fa.ang);
  L.sq = sq;
  return L;
}

function drawAll(e) {
  for (let i = 0; i < NP; i++) {
    const p = PL[i];
    if (p.kind === 2 || p.kind === 3) K.chain('wing', p.x, p.y, p.rot, p.sx, K.nStrips(6), p.kind === 2 ? bendF : bendN, 1, p.vn, true);
    else if (p.kind === 1) K.strips('cape', 'a', p.x, p.y, p.rot, 1, 1, K.nStrips(6), 'y', capeOff, 1, 'base');
    else K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, 1, p.vn);
  }
}

function die(e, world, rig) {
  e._pcorpse = true;
  claimDebris(world, e);
  const pieces = [];
  for (let i = 0; i < NP; i++) {
    const p = PL[i], w = p.kind === 2 || p.kind === 3;
    const light = p.name === 'helm' || p.name === 'lance';
    pieces.push({ name: p.name, pv: p.pv, x: p.x, y: p.y, rot: w ? p.rot : p.rot, sx: p.sx, sy: w ? -p.sy : p.sy, vn: p.vn, vx: K.frand(-110, 110), vy: -K.frand(120, 320) * (light ? 1.3 : 1), vr: K.frand(-8, 8) });
  }
  K.spawnCorpse(world, e, rig, pieces, { life: 1.6, fade: 0.5, bounce: 0.3, dust: { n: 8, w: 22, h: 30, col: '#c8d4e0' } });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e), t = e.t ?? 0;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    return;
  }
  CT = t; CS = 3 + q.speed * 9;
  BEND = 0.1 * Math.cos(t * 6) - 0.02;
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  const L0 = layout(e, q);
  // dash afterimages (two faded copies trailing behind)
  if (q.dash && !o.flash) {
    const ga = ctx.globalAlpha;
    for (let j = 2; j >= 1; j--) {
      ctx.globalAlpha = ga * 0.16 * (3 - j);
      K.put('torso', 'a', L0.tx - 14 * j, L0.ty, L0.trot, 1, 1);
      K.put('lance', 'grip', L0.gx - 14 * j, L0.gy, q.lanceA - K.part('lance').ang, 1, 1);
    }
    ctx.globalAlpha = ga;
  }
  drawAll(e);
  if (!o.flash) {
    if (q.trail) swingTrail(ctx, L0.gx, L0.gy, PI / 2 - q.trail[0], PI / 2 - q.trail[1], 62, 22, '#dff4ff', q.trail[2]);
    K.pivotPos('helm', 'a', 'visor', L0.nx + 1, L0.ny + 2, L0.trot * 0.5 + q.head, 1, 1, _q);
    K.glow(_q[0], _q[1], 3.5 + 3 * q.tele, '#7affff', 0.85);
    if (q.tele > 0.4) glint(ctx, L0.tipx, L0.tipy, 5 + 6 * q.tele, '#e8fbff', (q.tele - 0.4) / 0.6);
    if (q.dash) K.glow(L0.tipx, L0.tipy, 16, '#bfe8ff', 0.7);
  }
  K.end();
  // wind streaks while dashing / feathers shed on the beat (camera space)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(18));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
    if (q.dash) for (let n = pool.rate(0, 26, dt); n > 0; n--) pool.add(3, e.cx - f * sc * K.frand(0, 30), e.bottom - sc * K.frand(20, 70), -f * K.frand(200, 400), 0, K.frand(0.15, 0.3), K.frand(1.5, 3), '#dff4ff');
    for (let n = pool.rate(1, K.lod() === 0 ? 0.8 : 1.6, dt); n > 0; n--) pool.add(4, e.cx - f * sc * K.frand(6, 22), e.bottom - sc * K.frand(55, 80), -f * K.frand(20, 60), K.frand(-20, 10), K.frand(0.8, 1.4), K.frand(1.6, 2.4), '#f4f0e0');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
