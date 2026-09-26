// T3 painted large puppet: 저주받은 무덤지기 (gravedigger, 52×96). Boss-kit tech on a regular elite-sized enemy:
// damage variants by HP (torn/charred coat, cracks: dmg1 < 60 %, dmg2 < 30 %), 2-bone IK keeps the near hand on the
// shovel handle, swinging lantern (spring pendulum) with a flickering light, strip-warped coat tails, dust/ember FX.
// Reach: the painted shovel is short, so its plain handle is lengthened when the rig is baked (spec.bake.stretch,
// pivots h0..h1: one blit at runtime) and the far hand holds it near the top end ('grip'): the blade rests on the ground ahead like the vector shovel and the slam
// lands where AI_A.digger puts its strike rect (x 8..122), dust ring and shock wave (≈72 px ahead).
// States (AI_A.digger): idle (heavy breathing), walk (stride 5, shovel dragging on the ground), slam (shovel raised over
// the head → strike frame at params.slamWind 0.7 → impact dust), fling (scoop wind-up → throw at flingWind 0.5 → dirt
// spray), hurt (flash + squash + recoil), death (collapse forward: pieces tumble, lantern shatters in sparks).
import * as K from '../enemy_kit.js';
import { dirOf, swingTrail, glint, claimDebris, ik2, HP } from './_biped.js';
import { atkPhase, hurtOf, deathK } from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';

export const spec = {
  id: 'gravedigger', tier: 'T3', src: 'gravedigger',
  bake: {
    outline: 0.5, deep: { uarm: 0.6, farm: 0.6, hand: 0.6, boot: 0.6 }, deepTint: 'rgb(150,140,150)',
    stretch: { shovel: { from: 'h0', to: 'h1', ext: 22 } },   // +22 px of handle: hand → blade tip ≈ 68 px (vector ≈ 69)
    damage: { torso: { char: 3, cracks: 2, holes: 3, stain: '#2a1810', crackMinLum: 55 }, head: { char: 1.5, cracks: 2, holes: 1 }, tails: { char: 2, cracks: 1, holes: 4, crackMinLum: 45 }, uarm: { char: 1.5, holes: 2, cracks: 1, crackMinLum: 60 }, farm: { char: 1.5, holes: 2, cracks: 1, crackMinLum: 60 } },
  },
};

const PL = []; let NP = 0;
function place(name, x, y, rot, vn = 'base', sx = 1, sy = 1, pv = 'a', kind = 0) {
  const o = PL[NP] ?? (PL[NP] = {});
  o.name = name; o.x = x; o.y = y; o.rot = rot; o.vn = vn; o.sx = sx; o.sy = sy; o.pv = pv; o.kind = kind; NP++;
  return o;
}
const SH_NEAR = 15;    // the near hand grips the handle this far below the far hand
/** shovel geometry of the baked rig: grip pivot (far hand) and hand → blade-tip reach in logical px */
function shovelGeo(sp, td) {
  if (sp._geo) return sp._geo;
  const P = sp.piv, grip = P.grip ? 'grip' : 'a';
  return (sp._geo = { grip, reach: Math.hypot(P.b[0] - P[grip][0], P.b[1] - P[grip][1]) / td });
}
const _q = [0, 0];
const HUNCH = 0.32;                   // lean already painted into the torso

const Q0 = {}, TR = [0, 0, 0];
const VARS = [['base', 'deep'], ['dmg1', 'deep_dmg1'], ['dmg2', 'deep_dmg2']];   // [near, far] part variant per damage level
let LAN = null;                       // lantern placement of the current layout
/** pose — same numbers as the vector drawHumanoid(pose:'shovel') so the painted swing matches the AI hit frame */
function pose(e) {
  const t = e.t ?? 0, at = e.animT ?? 0, anim = e.anim, P = e.params || {};
  const hurt = hurtOf(e), walking = anim === 'walk';
  const ph = t * 5, sw = walking ? Math.sin(ph) : 0, cw = walking ? Math.cos(ph) : 0, br = Math.sin(t * 2.1);
  const q = Q0;                                  // reused (no per-frame allocation)
  q.walking = walking; q.hurt = hurt; q.tele = 0; q.trail = null; q.stepX = 0; q.strike = 0; q.scoop = 0; q.slamK = -1;
  q.bob = walking ? -Math.abs(cw) * 2.4 : br * 0.9;
  q.lean = HUNCH + (walking ? 0.05 : 0) + br * 0.015;
  q.hipF = walking ? sw * 0.45 : 0.14; q.hipB = walking ? -sw * 0.45 : -0.1;
  q.knF = walking ? -Math.max(0, cw) * 0.85 - 0.1 : -0.15; q.knB = walking ? -Math.max(0, -cw) * 0.85 - 0.1 : -0.08;
  q.shB = 0.55; q.elB = -0.1;
  q.head = Math.sin(t * 1.3) * 0.05;
  q.wA = null;
  if (anim === 'slam' || anim === 'fling') {
    const wu = anim === 'slam' ? (P.slamWind ?? 0.7) : (P.flingWind ?? 0.5);
    const ap = atkPhase(at, wu, 0.1), kw = ease.outCubic(ap.w), ks = ease.outCubic(ap.s);
    if (anim === 'slam') {
      q.shB = ap.s <= 0 ? lerp(0.2, 3.5, kw) : lerp(3.5, 1.15, ks); q.elB = ap.s <= 0 ? 0.4 : lerp(0.4, 0.1, ks);
      q.wA = ap.s <= 0 ? lerp(2.3, 3.9, kw) : lerp(3.9, 1.35, ks);
      q.slamK = ap.s > 0 ? ks : -1;          // swing progress: layout() ends the swing with the blade on the ground
      q.lean = ap.s <= 0 ? lerp(0.25, -0.15, kw) : lerp(-0.15, 0.55, ks);
      if (ap.s > 0) { q.trail = TR; TR[0] = 3.9; TR[1] = q.wA; TR[2] = clamp(1 - ap.after / 0.3, 0, 1); }
      q.stepX = ap.s * 6; q.strike = ap.s > 0 ? clamp(1 - ap.after / 0.35, 0, 1) : 0;
      q.hipF = lerp(q.hipF, 0.5, kw); q.knF = lerp(q.knF, -0.5, kw);
    } else {
      q.shB = ap.s <= 0 ? lerp(0.2, -0.9, kw) : lerp(-0.9, 2.4, ks); q.elB = 0.3;
      q.wA = ap.s <= 0 ? lerp(2.3, 0.4, kw) : lerp(0.4, 3.0, ks);
      q.lean = ap.s <= 0 ? lerp(0.25, 0.5, kw) : lerp(0.5, -0.1, ks);
      q.bob += ap.s <= 0 ? 6 * kw : 6 * (1 - ks);
      if (ap.s > 0) { q.trail = TR; TR[0] = 0.4; TR[1] = q.wA; TR[2] = clamp(1 - ap.after / 0.25, 0, 1) * 0.7; }
      q.scoop = ap.s > 0 ? clamp(1 - ap.after / 0.3, 0, 1) : 0;
      q.knF = lerp(q.knF, -0.7, kw); q.knB = lerp(q.knB, -0.5, kw);
    }
    q.tele = ap.w < 1 ? ap.w : 0;
  }
  if (hurt) { q.lean -= 0.3; q.head = -0.3; }
  q.lean += deathK(e) * 0.5;
  return q;
}

function layout(e, q, dl, rig) {
  NP = 0; LAN = null;
  const hipY = -45 + q.bob, x0 = q.stepX;
  const tr = q.lean - HUNCH;
  const VN = VARS[dl], V = (base) => (base === 'deep' ? VN[1] : VN[0]);
  K.pivotPos('torso', 'a', 'neck', x0, hipY, tr, 1, 1, _q); const nx = _q[0], ny = _q[1];
  K.pivotPos('torso', 'a', 'shN', x0, hipY, tr, 1, 1, _q); const snx = _q[0], sny = _q[1];
  K.pivotPos('torso', 'a', 'shF', x0, hipY, tr, 1, 1, _q); const sfx = _q[0], sfy = _q[1];
  K.pivotPos('torso', 'a', 'belt', x0, hipY, tr, 1, 1, _q); const blx = _q[0], bly = _q[1];
  // back (shovel) arm: FK like the vector version; the shovel hangs from its hand
  const UA = 17, FA = 16;
  const d1 = dirOf(q.shB), d2 = dirOf(q.shB + q.elB);
  const bex = sfx + Math.cos(d1) * UA, bey = sfy + Math.sin(d1) * UA;
  const bhx = bex + Math.cos(d2) * FA, bhy = bey + Math.sin(d2) * FA;
  // shovel angle: at rest the blade leans on the ground (as in the vector renderer), during attacks it follows wA
  const sp = K.part('shovel'), G = shovelGeo(sp, rig.td);
  let wA = q.wA;
  // blade tip on the ground (never below it): hand height / reach
  const gA = Math.acos(clamp(-bhy / G.reach, 0.05, 1));
  if (wA === null) wA = gA + (q.walking ? Math.sin((e.t ?? 0) * 5) * 0.05 : 0);
  else if (q.slamK >= 0) { wA = lerp(3.9, gA, q.slamK); if (q.trail) q.trail[1] = wA; }   // the slam ends planted in the ground
  else wA = Math.max(wA, gA);
  const sd = dirOf(wA);
  // near hand grabs the handle a little below the far hand (IK); far-side limbs darker
  const g2x = bhx + Math.cos(sd) * SH_NEAR, g2y = bhy + Math.sin(sd) * SH_NEAR;
  // far arm (behind the torso)
  limbB('uarm', sfx, sfy, d1, UA, V('deep'), 1.35);
  limbB('farm', bex, bey, d2, FA, 'deep', 1);
  place('hand', bhx, bhy, d2 - HP, 'deep', 1, 1, 'grip');
  // far leg
  const hbx = x0 - 3, hfx = x0 + 3;
  const kbx = hbx + Math.sin(q.hipB) * 23, kby = hipY + Math.cos(q.hipB) * 23;
  const bp = K.part('boot');
  place('boot', kbx, kby, dirOf(q.hipB + q.knB) - bp.ang, 'deep');
  // coat tails: strip-warped cloth from the belt line
  place('tails', x0 - 1, hipY - 1, tr * 0.4, VN[0], 1.05, 1, 'a', 1);
  // torso + hump
  place('torso', x0, hipY, tr, V('base'));
  // near leg
  const kfx = hfx + Math.sin(q.hipF) * 23, kfy = hipY + Math.cos(q.hipF) * 23;
  place('boot', kfx, kfy, dirOf(q.hipF + q.knF) - bp.ang, 'base');
  // head
  const hr = q.head + (q.lean - HUNCH) * 0.3;
  place('head', nx, ny, hr, VN[0]);
  // shovel (handle in the far hand)
  place('shovel', bhx, bhy, sd - sp.ang, 'base', 1, 1, G.grip);
  // lantern on the belt: spring pendulum
  const L = e._lan ?? (e._lan = { a: 0, v: 0, t: e.t ?? 0 });
  const now = e.t ?? 0, dt = clamp(now - L.t, 0, 0.05); L.t = now;
  const target = -(e.vx ?? 0) * 0.002 * (e.facing < 0 ? -1 : 1) - (q.lean - HUNCH) * 0.8;
  L.v += ((target - L.a) * 40 - L.v * 3) * dt; L.a += L.v * dt;
  LAN = place('lantern', blx + 2, bly - 1, L.a, 'base', 1, 1, 'a', 2);
  // near arm: IK onto the upper handle
  const ik = ik2(snx, sny, g2x, g2y, UA, FA, -1);
  const nex = snx + Math.cos(ik[0]) * UA, ney = sny + Math.sin(ik[0]) * UA;
  limbB('uarm', snx, sny, ik[0], UA, V('base'), 1.35);
  limbB('farm', nex, ney, ik[1], FA, VN[0], 1);
  place('hand', g2x, g2y, ik[1] - HP, 'base', 1, 1, 'grip');
  return { sfx, sfy, nx, ny, hr, blx, bly, reach: G.reach, tipx: bhx + Math.cos(sd) * G.reach, tipy: bhy + Math.sin(sd) * G.reach };
}
/** limb piece shorter than the bone: pivot b on the far joint, stretched along the bone by `st` */
function limbB(name, x, y, dir, L, vn, st) {
  const p = K.part(name);
  if (!p) return;
  place(name, x + Math.cos(dir) * L, y + Math.sin(dir) * L, dir - p.ang, vn, 1, st, 'b');
}

let TW = false, TT = 0;
/** coat-tail strip offsets (texels): pushed back the lower they hang, flutter while walking, slow sway at rest */
function tailsOff(u) {
  _q[0] = -(u * u) * (TW ? 14 : 4) - Math.sin(TT * (TW ? 10 : 2) - u * 3.5) * u * 6 * (TW ? 1 : 0.3); _q[1] = 0; return _q;
}
function drawAll(e, q) {
  const t = e.t ?? 0;
  for (let i = 0; i < NP; i++) {
    const p = PL[i];
    if (p.kind === 1) {
      TW = q.walking; TT = t;
      K.strips(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, K.nStrips(5), 'y', tailsOff, 1, p.vn);
    } else K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, 1, p.vn);
  }
}

function die(e, world, rig) {
  e._pcorpse = true;
  claimDebris(world, e);
  const pieces = [];
  for (let i = 0; i < NP; i++) {
    const p = PL[i];
    const heavy = p.name === 'torso' || p.name === 'tails';
    // collapses forward: the big body pitches over, head/hat/shovel/lantern fly
    pieces.push({ ...p, vx: (heavy ? 50 : 30) + K.frand(-70, 90), vy: -K.frand(60, 240) * (heavy ? 0.4 : 1), vr: (heavy ? 1.6 : K.frand(-8, 8)) });
  }
  const lx = LAN ? { x: LAN.x, y: LAN.y } : null;
  K.spawnCorpse(world, e, rig, pieces, {
    life: 1.8, fade: 0.6, bounce: 0.18,
    dust: { n: 12, w: 26, h: 20, col: '#5a4a3a' },
    after: lx ? (age) => { if (age < 0.5) K.glow(lx.x, lx.y + 8, 30 * (1 - age * 1.6), '#ffb050', 0.9 * (1 - age * 2)); } : null,
  });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  const hpK = e.stats?.maxHp ? e.hp / e.stats.maxHp : 1;
  const dl = e.dying > 0 ? 2 : hpK < 0.3 ? 2 : hpK < 0.6 ? 1 : 0;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q, dl, rig); K.end(); die(e, world, rig); }
    return;
  }
  const t = e.t ?? 0;
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.05 * sq, 1 - 0.05 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(28, 0.5);
  const L = layout(e, q, dl, rig);
  drawAll(e, q);
  if (!o.flash) {
    // amber eyes under the brim (flare on wind-ups), lantern light with render-RNG flicker
    K.pivotPos('head', 'a', 'eye', L.nx, L.ny, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 3.2 + 3 * q.tele, '#ffb040', 0.7 + 0.3 * q.tele);
    const lan = LAN;
    if (lan) {
      K.pivotPos('lantern', 'a', 'glow', lan.x, lan.y, lan.rot, 1, 1, _q);
      const fl = 0.85 + 0.15 * Math.sin(t * 13) + (dl === 2 ? (K.fr() - 0.5) * 0.35 : 0);
      K.glow(_q[0], _q[1], 22 * fl, '#ffc060', 0.7 * fl, 0.12);   // warm halo with a hot core, one additive blit
    }
    if (q.trail) swingTrail(ctx, L.sfx, L.sfy, q.trail[0], q.trail[1], 17 + 16 + L.reach - 4, 18, '#ffcf90', q.trail[2] * 0.85);
  }
  if (q.tele > 0.4) glint(ctx, L.tipx, L.tipy, 5 + 5 * q.tele, '#ffd8a0', (q.tele - 0.4) / 0.6);
  K.end();
  // impact dust / scoop spray: render-only particles in camera space
  if (world) {
    const pool = e._fx ?? (e._fx = new K.FxPool(26));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    if (q.strike > 0.9 && !e._slamFx) {
      e._slamFx = true;
      for (let i = 0; i < 10; i++) pool.add(2, e.cx + f * sc * (L.tipx + K.frand(-8, 8)), e.bottom - K.frand(0, 6), K.frand(-90, 90), K.frand(-80, -20), K.frand(0.5, 0.9), K.frand(5, 10), '#6a5a48');
      for (let i = 0; i < 6; i++) pool.add(4, e.cx + f * sc * L.tipx, e.bottom - 4, K.frand(-160, 160), K.frand(-320, -120), K.frand(0.5, 0.8), K.frand(1.5, 3), '#4a3a2a');
    }
    if (q.strike <= 0) e._slamFx = false;
    if (q.scoop > 0.8 && !e._scoopFx) { e._scoopFx = true; for (let i = 0; i < 8; i++) pool.add(4, e.cx + f * sc * L.tipx, e.bottom - 6, f * K.frand(40, 220), K.frand(-360, -160), K.frand(0.4, 0.7), K.frand(1.5, 3), '#5a4230'); }
    if (q.scoop <= 0) e._scoopFx = false;
    if (dl === 2) for (let n = pool.rate(3, 3.6, dt); n > 0; n--) pool.add(3, e.cx + f * sc * K.frand(-10, 14), e.bottom - K.frand(40, 80) * sc, K.frand(-10, 10), K.frand(-40, -15), K.frand(0.4, 0.8), K.frand(1.5, 2.5), '#ff9a40');
    if (pool.n && o.cam) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
