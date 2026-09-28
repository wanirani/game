// T2 painted mini-puppet (knight-rig reuse): 얼어붙은 기사 (frozen_knight). The armor_knight's parts re-painted as a knight
// frozen on the spire (composition-keeping Kling edits → tools/painted/enemies/frozen_knight/parts.json reuses the knight's
// cut coordinates): ice-crusted cuirass with crystal spikes, spiked helm, rerebrace (also the cuisse), vambrace+gauntlet,
// greave+sabaton, frozen cape, glowing two-handed ice greatsword.
// Driven by AI_B.swordsman (anim idle / walk / guard / slash with comboI, stateT, counter): the greatsword is held in
// both hands (near arm FK, far hand IK onto the grip). Slash wind-up → strike frame → recovery follow the AI's timing
// (wind-up = params.windup for the first cut, 0.3 s for the follow-ups, 0.25 s for a counter), the last cut of the combo
// is the big overhead chop that launches the ground ice wave; guard raises the blade upright (the AI's front block);
// hurt recoil + white flash; death collapse (armour pieces, helm and sword tumble into a puff of frost).
// The shared swordsman layout here is also used by death_knight.js (same knight rig, its own art and VFX).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { bipedPose, dirOf, swingTrail, glint, ik2 } from './_biped.js';
import { claimDeathDebris } from './skeleton.js';

export const spec = {
  id: 'frozen_knight', tier: 'T2', src: 'frozen_knight',
  scale: 1.15,       // the cut knight puppet stands 80 px; the logic rect is 92 px
  bake: { outline: 0.42, deep: { '*': 0.62 }, deepTint: 'rgb(122,150,192)', glow: { sword: '#6fd8ff' } },
};

// ─────────────────────────────── shared swordsman knight (frozen_knight, death_knight) ───────────────────────────────
const PL = []; let NP = 0;
function place(name, x, y, rot, vn = 'base', sx = 1, sy = 1, pv = 'a') {
  const o = PL[NP] ?? (PL[NP] = {});
  o.name = name; o.x = x; o.y = y; o.rot = rot; o.vn = vn; o.sx = sx; o.sy = sy; o.pv = pv; o.cape = false; NP++;
  return o;
}
const _q = [0, 0], _r = [0, 0];
/** limb whose painted piece is shorter than the logical bone: pivot b on the far joint, piece stretched `st` */
function limb(name, x, y, dir, L, vn, st = 1, sx = 1) {
  const p = K.part(name);
  const ex = x + Math.cos(dir) * L, ey = y + Math.sin(dir) * L;
  if (p) place(name, ex, ey, dir - p.ang, vn, sx, st, 'b');
  _r[0] = ex; _r[1] = ey;
  return _r;
}
function bone(name, x, y, dir, vn) {
  const p = K.part(name);
  if (p) place(name, x, y, dir - p.ang, vn);
  _r[0] = x + Math.cos(dir) * (p?.len ?? 0); _r[1] = y + Math.sin(dir) * (p?.len ?? 0);
  return _r;
}

/** swordsman arm/blade pose (same contract as the vector slashPose in render/enemies_b.js; angle 0 = down, + = forward) */
const S = { arm: 0.45, arm2: 0.35, blade: 1.95, lean: 0, wind: 0, trail: null, legSpread: 0, guard: 0, last: false, strike: 0 };
const TR = [0, 0, 0];
export function slashPose(e) {
  const an = e.anim, t = e.t ?? 0, P = e.params ?? {};
  S.arm = 0.4; S.arm2 = 0.3; S.blade = 1.95 + Math.sin(t * 1.8) * 0.03; S.lean = 0; S.wind = 0; S.trail = null; S.legSpread = 0; S.guard = 0; S.last = false; S.strike = 0;
  if (an === 'guard') { S.arm = 1.1; S.arm2 = 0.3; S.blade = Math.PI; S.lean = -0.08; S.guard = 1; return S; }
  if (an === 'walk') { S.arm = 0.55 + Math.sin(t * 6) * 0.1; S.arm2 = 0.35; S.blade = 1.9; return S; }
  if (an !== 'slash') return S;
  const combo = P.combo ?? 2, ci = e.comboI ?? 0, last = ci >= combo - 1;
  const wu = e.counter ? 0.25 : ci === 0 ? (P.windup ?? 0.55) : 0.3;
  const st = e.stateT ?? e.animT ?? 0;
  let from, to;
  if (last) { from = 3.6; to = 1.0; } else if (ci === 0) { from = -0.6; to = 1.9; } else { from = 1.1; to = 3.2; }
  S.last = last;
  if (st < wu) {
    const k = ease.outCubic(clamp(st / wu, 0, 1));
    const a = lerp(1.9, from, k);
    S.arm = a * 0.75; S.arm2 = a * 0.25; S.blade = a + (last ? 0.3 : 0); S.lean = last ? -0.12 * k : -0.05 * k; S.wind = k;
  } else {
    const k = ease.outExpo(clamp((st - wu) / 0.1, 0, 1));
    const a = lerp(from, to, k);
    S.arm = a * 0.75; S.arm2 = a * 0.25; S.blade = a; S.lean = last ? 0.25 * k : 0.12 * k; S.legSpread = 1; S.strike = k;
    const fade = 1 - clamp((st - wu - 0.1) / 0.2, 0, 1);
    if (fade > 0) { TR[0] = from; TR[1] = a; TR[2] = fade; S.trail = TR; }
  }
  return S;
}

const L = { nx: 0, ny: 0, hr: 0, snx: 0, sny: 0, gx: 0, gy: 0, dS: 0, tipx: 0, tipy: 0, eyeX: 0, eyeY: 0, reach: 0 };
/**
 * Pose the swordsman knight: cape, far leg, far arm (IK onto the grip), cuirass, near leg, helm, greatsword, near arm.
 * vars = [near variant, far variant] (damage levels for T3). Returns the shared layout object L.
 */
export function layoutSwordKnight(e, q, s, vars = ['base', 'deep']) {
  NP = 0;
  const vN = vars[0], vF = vars[1];
  const hipY = -36 + q.bob, sx0 = q.stepX + s.strike * 3;
  const tr = q.lean + s.lean;
  K.pivotPos('torso', 'a', 'neck', sx0, hipY, tr, 1, 1, _q); const nx = _q[0], ny = _q[1];
  K.pivotPos('torso', 'a', 'shN', sx0, hipY, tr, 1, 1, _q); const snx = _q[0], sny = _q[1];
  K.pivotPos('torso', 'a', 'shF', sx0, hipY, tr, 1, 1, _q); const sfx = _q[0], sfy = _q[1];
  if (K.part('cape')) { const c = place('cape', nx - 5, ny + 3, tr * 0.5, vF, 0.62, 1); c.cape = true; }
  // far leg
  const sp = s.legSpread;
  let b = limb('uarm', sx0 - 2, hipY, dirOf(q.hipB - 0.3 * sp), 15, vF, 1.15, 1.2);
  bone('shin', b[0], b[1], dirOf(q.hipB + q.knB - 0.1 * sp), vF);
  // near arm FK → grip point
  const up = K.part('uarm'), fp = K.part('farm'), sw = K.part('sword');
  const dU = dirOf(s.arm), ex = snx + Math.cos(dU) * up.len, ey = sny + Math.sin(dU) * up.len;
  const fRot = dirOf(s.arm + s.arm2) - fp.ang;
  K.pivotPos('farm', 'a', 'grip', ex, ey, fRot, 1, 1, _q); const gx = _q[0], gy = _q[1];
  const dS = dirOf(s.blade);
  // far hand on the grip below the near hand (pommel side), 2-bone IK from the far shoulder
  const gA = fp.piv.grip ?? fp.piv.b, fa = fp.piv.a;
  const gLen = Math.hypot(gA[0] - fa[0], gA[1] - fa[1]) * FK.k, gAng = Math.atan2(gA[1] - fa[1], gA[0] - fa[0]);
  const h2x = gx - Math.cos(dS) * 4.5, h2y = gy - Math.sin(dS) * 4.5;
  const ik = ik2(sfx, sfy, h2x, h2y, up.len, gLen, 1);
  const d1 = ik[0], d2 = ik[1];
  place('uarm', sfx, sfy, d1 - up.ang, vF);
  place('farm', sfx + Math.cos(d1) * up.len, sfy + Math.sin(d1) * up.len, d2 - gAng, vF);
  // cuirass, near leg, helm
  place('torso', sx0, hipY, tr, vN);
  b = limb('uarm', sx0 + 2, hipY, dirOf(q.hipF + 0.35 * sp), 15, vN, 1.15, 1.2);
  bone('shin', b[0], b[1], dirOf(q.hipF + q.knF - 0.15 * sp), vN);
  const hr = tr * 0.5 + q.head * 0.7;
  place('helm', nx + 1, ny + 2, hr, vN);
  // greatsword (grip in the near hand), then the near arm over it
  if (sw) place('sword', gx, gy, dS - sw.ang, 'base', 1, 1, sw.piv.grip ? 'grip' : 'a');
  place('uarm', snx, sny, dU - up.ang, vN);
  place('farm', ex, ey, fRot, vN);
  L.nx = nx; L.ny = ny; L.hr = hr; L.snx = snx; L.sny = sny; L.gx = gx; L.gy = gy; L.dS = dS;
  const sl = sw ? swordLen(sw) : 50;
  L.tipx = gx + Math.cos(dS) * sl; L.tipy = gy + Math.sin(dS) * sl;
  L.reach = Math.hypot(L.tipx - snx, L.tipy - sny);
  K.pivotPos('helm', 'a', 'eye', nx + 1, ny + 2, hr, 1, 1, _q); L.eyeX = _q[0]; L.eyeY = _q[1];
  return L;
}
// logical px per texel of the rig currently being drawn (set in drawSwordKnight: parts.len is logical, piv are texels)
const FK = { k: 1 };
function swordLen(sw) {
  const g = sw.piv.grip ?? sw.piv.a, t = sw.piv.b;
  return Math.hypot(t[0] - g[0], t[1] - g[1]) * FK.k;
}

/** draw the posed parts (cape strip-warped, sword with an additive glow pass) */
function drawParts(e, o, glowA) {
  const t = e.t ?? 0, walk = e.anim === 'walk';
  for (let i = 0; i < NP; i++) {
    const p = PL[i];
    if (p.cape) {
      const sway = walk ? 1 : 0.35;
      K.strips(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, K.nStrips(8), 'y', (u) => {
        _q[0] = -(u * u) * (walk ? 22 : 7) - Math.sin(t * (walk ? 9 : 2.2) - u * 3) * u * 6 * sway; _q[1] = 0; return _q;
      }, 1, p.vn);
      continue;
    }
    K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, 1, p.vn);
    if (p.name === 'sword' && glowA > 0.01 && !o.flash) {
      const ctx = CTXREF.c, gco = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      K.put('sword', p.pv, p.x, p.y, p.rot, 1.03, 1.03, glowA, 'glow');
      ctx.globalCompositeOperation = gco;
    }
  }
}
const CTXREF = { c: null };

/**
 * Shared draw for the swordsman knights. cfg: { eye, trail, glow(t, s) → alpha, dmg: bool, fx(ctx, e, world, o, rig, L, s, pool, dt), dust }
 */
export function drawSwordKnight(ctx, e, world, o, rig, cfg) {
  FK.k = 1 / rig.td;
  const q = bipedPose(e, { stride: 6, legSwing: 0.42, armSwing: 0.3, knee: 0.8, bobAmp: 2, walkLean: 0.06 });
  const s = slashPose(e);
  const hpK = e.stats?.maxHp ? e.hp / e.stats.maxHp : 1;
  const dl = cfg.dmg ? (e.dying > 0 ? 2 : hpK < 0.3 ? 2 : hpK < 0.6 ? 1 : 0) : 0;
  const vars = VARS[dl];
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      K.begin(ctx, rig, 0); layoutSwordKnight(e, q, s, vars); K.end();
      e._pcorpse = true;
      claimDeathDebris(world, e);
      const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
      const pieces = [];
      for (let i = 0; i < NP; i++) {
        const p = PL[i];
        const heavy = p.name === 'torso' || p.name === 'sword';
        pieces.push({ name: p.name, pv: p.pv, x: p.x, y: p.y, rot: p.rot, sx: p.sx, sy: p.sy, vn: p.vn, vx: kb * 40 + K.frand(-90, 90) * (heavy ? 0.4 : 1), vy: -K.frand(80, 300) * (heavy ? 0.5 : p.name === 'helm' ? 1.3 : 1), vr: K.frand(-7, 7) * (heavy ? 0.4 : 1) });
      }
      K.spawnCorpse(world, e, rig, pieces, { life: 1.7, fade: 0.55, bounce: 0.2, dust: cfg.dust ?? { n: 8, w: 18, h: 20, col: '#6a6470' } });
    }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  CTXREF.c = ctx;
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(21);
  const L = layoutSwordKnight(e, q, s, vars);
  drawParts(e, o, cfg.glow ? cfg.glow(e.t ?? 0, s) : 0);
  if (!o.flash) {
    K.glow(L.eyeX, L.eyeY, 3 + 4 * s.wind, cfg.eye, 0.6 + 0.4 * s.wind + 0.1 * Math.sin((e.t ?? 0) * 5));
    if (s.trail) {
      // arc swept by the tip about the near shoulder, ending exactly on the drawn tip
      const aT = Math.PI / 2 - Math.atan2(L.tipy - L.sny, L.tipx - L.snx);
      swingTrail(ctx, L.snx, L.sny, aT + clamp(s.trail[0] - s.trail[1], -1.7, 1.7), aT, L.reach + 2, s.last ? 16 : 12, cfg.trail, s.trail[2] * 0.8);
    }
    if (s.wind > 0.45) glint(ctx, L.tipx, L.tipy, 5 + 6 * s.wind, cfg.glint ?? '#ffffff', (s.wind - 0.45) / 0.55);
    if (s.guard) K.glow(L.gx + Math.cos(L.dS) * 20, L.gy + Math.sin(L.dS) * 20, 16, cfg.trail, 0.35 + 0.15 * Math.sin((e.t ?? 0) * 20));
  }
  K.end();
  if (!world || !o.cam || o.flash || !cfg.fx) return;
  const pool = e._fx ?? (e._fx = new K.FxPool(cfg.pool ?? 24));
  const dt = pool.step(K.clockOf(e, world));
  cfg.fx(e, L, s, pool, dt, (e.scale || 1) * (rig.scale ?? 1));
  ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
}
const VARS = [['base', 'deep'], ['dmg1', 'deep_dmg1'], ['dmg2', 'deep_dmg2']];
/** world position of a local point of the enemy (feet origin, facing, scale) */
export function toWorld(e, sc, x, y, out) { out[0] = e.cx + (e.facing < 0 ? -1 : 1) * sc * x; out[1] = e.bottom + sc * y; return out; }

// ─────────────────────────────── frozen knight ───────────────────────────────
const _w = [0, 0];
const CFG = {
  eye: '#bff4ff', trail: '#bfeeff', glint: '#e8fbff',
  glow: (t, s) => 0.22 + 0.08 * Math.sin(t * 6) + 0.35 * s.wind + 0.3 * s.strike * (s.trail ? s.trail[2] : 0),
  dust: { n: 10, w: 18, h: 22, col: '#d8ecf8' },
  fx(e, L, s, pool, dt, sc) {
    const lo = K.lod() === 0 ? 0.5 : 1;
    // cold mist rolling off the armour at the feet, ice sparkle along the blade
    for (let n = pool.rate(0, 3 * lo, dt); n > 0; n--) pool.add(2, e.cx + K.frand(-14, 14), e.bottom - K.frand(0, 6), K.frand(-10, 10), K.frand(-16, -6), K.frand(0.8, 1.4), K.frand(4, 7) * sc, '#d6ecfa');
    for (let n = pool.rate(1, (4 + 10 * s.wind) * lo, dt); n > 0; n--) {
      const u = K.frand(0.2, 1);
      toWorld(e, sc, lerp(L.gx, L.tipx, u), lerp(L.gy, L.tipy, u), _w);
      pool.add(3, _w[0], _w[1], K.frand(-15, 15), K.frand(-25, 5), K.frand(0.25, 0.5), K.frand(1.2, 2.2) * sc, '#e8fbff');
    }
  },
};
export function draw(ctx, e, world, o, rig) { drawSwordKnight(ctx, e, world, o, rig, CFG); }
