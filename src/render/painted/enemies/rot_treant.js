// T3 painted walking dead tree: 썩은 나무거인 (rot_treant, 72×120). Parts (Kling full figure + parts sheet 2): the hunched
// trunk with the skull knot, the antler crown of dead branches, hanging grey moss and the glowing yellow spore sacs
// (both arms and legs cut away); one long branch arm (twiggy shoulder + clawed root hand, split at the elbow) and one
// root leg (thigh + shin with the splayed root foot), both used twice (far limbs darkened). Damage variants by HP.
// States (AI_D.treant): idle (creaking sway) · walk (slow heavy stride, arms dragging) · plant (cast, aimK over the
// 0.8 s windup: both arms rise over the crown, then slam claw-first into the ground at aimK 1 → root spikes; they stay
// buried until the state ends) · swing (aimK over 0.6 s: arms wind back over the shoulder, at 0.85 the near arm whips
// out stretched along the 150 px sweep) · spores (e.sporeAt: the sacs swell and burst a yellow cloud) · hurt · death
// (the trunk topples, limbs break off, spore puff).
import * as K from '../enemy_kit.js';
import { HP, dirOf, ik2, swingTrail, glint, claimDebris } from './_biped.js';
import { clamp, lerp, ease } from '../../../core/math.js';

export const spec = {
  id: 'rot_treant', tier: 'T3', src: 'rot_treant',
  bake: {
    outline: 0.5, deep: { uarm: 0.55, farm: 0.55, thigh: 0.55, shin: 0.55 }, deepTint: 'rgb(110,120,90)',
    damage: { body: { char: 1, holes: 3, cracks: 3, crackMinLum: 30 }, farm: { char: 1, cracks: 2, crackMinLum: 30 } },
  },
};

const PI = Math.PI;
const _q = [0, 0];
const VAR = ['base', 'dmg1', 'dmg2'];
const SACS = ['sac1', 'sac2', 'sac3'];

/** swing trail [from, to, alpha] in one reused array (no per-frame allocation) */
const TR = [0, 0, 0];
const trail = (a0, a1, k) => { TR[0] = a0; TR[1] = a1; TR[2] = k; return TR; };
const Q = { hipN: 0, hipF: 0, knN: 0, knF: 0, lean: 0, bob: 0, uaN: 0, faN: 0, uaF: 0, faF: 0, str: 1, strF: 1, trail: null, tele: 0, dig: 0, plant: 0, spore: 0 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, q = Q, k = clamp(e.aimK ?? 0, 0, 1), st = e.stateT ?? 0;
  const walk = an === 'walk', ph = t * 3.2, sw = walk ? Math.sin(ph) : 0, cw = walk ? Math.cos(ph) : 0;
  const br = Math.sin(t * 1.4);
  q.hipN = walk ? sw * 0.34 : 0.1; q.hipF = walk ? -sw * 0.34 : -0.08;
  q.knN = walk ? -Math.max(0, cw) * 0.7 - 0.12 : -0.14; q.knF = walk ? -Math.max(0, -cw) * 0.7 - 0.12 : -0.1;
  q.lean = (walk ? 0.08 : 0.02) + br * 0.02; q.bob = walk ? -Math.abs(cw) * 2.2 : br * 0.8;
  q.uaN = 0.12 - sw * 0.22 + br * 0.03; q.faN = 0.28 - sw * 0.12;
  q.uaF = 0.3 + sw * 0.22 - br * 0.03; q.faF = 0.42 + sw * 0.12;
  q.str = 1; q.strF = 1; q.trail = null; q.tele = 0; q.dig = 0; q.plant = 0;
  if (an === 'plant') {
    if (k < 0.75) { const w = ease.outCubic(k / 0.75); q.uaN = lerp(q.uaN, 2.75, w); q.faN = lerp(q.faN, 3.0, w); q.uaF = lerp(q.uaF, 2.55, w); q.faF = lerp(q.faF, 2.85, w); q.lean = lerp(q.lean, -0.12, w); q.tele = k / 0.75; }
    else {
      // slam: the arm angles are solved in draw() (2-bone IK + forearm stretch) so the claws end buried in the floor
      const s = ease.outCubic((k - 0.75) / 0.25);
      q.uaN = 2.75; q.faN = 3.0; q.uaF = 2.55; q.faF = 2.85; q.plant = s; q.lean = lerp(-0.12, 0.34, s);
      q.hipN = lerp(q.hipN, 0.35, s); q.knN = lerp(q.knN, -0.55, s);
    }
    if (k >= 1) q.dig = 1;
  } else if (an === 'swing') {
    if (k < 0.85) { const w = ease.outCubic(k / 0.85); q.uaN = lerp(q.uaN, 2.7, w); q.faN = lerp(q.faN, 3.1, w); q.uaF = lerp(q.uaF, 2.2, w); q.faF = lerp(q.faF, 2.5, w); q.lean = lerp(q.lean, -0.15, w); q.tele = k / 0.85; }
    else {
      const s = ease.outCubic(clamp((k - 0.85) / 0.15, 0, 1)), r = clamp((st - 0.6) / 0.45, 0, 1), rs = r * r * (3 - 2 * r);
      q.uaN = lerp(lerp(2.7, 1.25, s), 0.2, rs); q.faN = lerp(lerp(3.1, 1.3, s), 0.3, rs); q.str = lerp(lerp(1, 1.3, s), 1, rs);
      q.uaF = lerp(lerp(2.2, 1.0, s), 0.3, rs); q.faF = lerp(lerp(2.5, 1.1, s), 0.42, rs);
      q.lean = lerp(lerp(-0.15, 0.26, s), 0.04, rs); q.hipN = lerp(q.hipN, 0.3, s * (1 - rs)); q.knN = lerp(q.knN, -0.45, s * (1 - rs));
      q.trail = trail(3.0, q.faN, clamp(1 - (st - 0.6) / 0.3, 0, 1));
    }
  }
  q.spore = e.sporeAt != null ? clamp(1 - (t - e.sporeAt) / 0.8, 0, 1) : 0;
  if (K.hurtOf(e)) { q.lean -= 0.14; q.uaN -= 0.3; q.uaF -= 0.25; }
  q.lean += K.deathK(e) * 0.5;
  return q;
}

// ── layout: legs first (the lower foot sets the hip height), then the trunk and its shoulder / hip pivots ──
const L = { hy: 0, rot: 0, shN: [0, 0], shF: [0, 0], hN: [0, 0], hF: [0, 0], handN: [0, 0], handF: [0, 0], sacs: [0, 0, 0, 0, 0, 0] };
function legDrop(hip, kn) {
  const th = K.part('thigh'), sh = K.part('shin');
  const d1 = dirOf(hip), d2 = dirOf(hip + kn);
  // ankle → sole in the shin's own frame (rotated with the bone, texels → logical)
  const sole = sh.piv.sole, b = sh.piv.b, rot = d2 - sh.ang, lx = (sole[0] - b[0]) / RIGTD, ly = (sole[1] - b[1]) / RIGTD;
  return Math.sin(d1) * th.len + Math.sin(d2) * sh.len + Math.sin(rot) * lx + Math.cos(rot) * ly;
}
let RIGTD = 3;
function layout(q) {
  const dN = legDrop(q.hipN, q.knN), dF = legDrop(q.hipF, q.knF);
  L.hy = -Math.max(dN, dF) + Math.min(0, q.bob * 0.3); L.rot = q.lean;
  const hx = 0;
  K.pivotPos('body', 'a', 'shN', hx, L.hy, L.rot, 1, 1, L.shN);
  K.pivotPos('body', 'a', 'shF', hx, L.hy, L.rot, 1, 1, L.shF);
  K.pivotPos('body', 'a', 'hipN', hx, L.hy, L.rot, 1, 1, L.hN); L.hN[1] = L.hy;
  K.pivotPos('body', 'a', 'hipF', hx, L.hy, L.rot, 1, 1, L.hF); L.hF[1] = L.hy;
  for (let i = 0; i < 3; i++) { K.pivotPos('body', 'a', SACS[i], hx, L.hy, L.rot, 1, 1, _q); L.sacs[i * 2] = _q[0]; L.sacs[i * 2 + 1] = _q[1]; }
  return L;
}
/** blend the overhead arm (ua, fa limb angles) into a 2-bone IK reach for the floor point (tx, ty); returns stretch */
const _r = [0, 0, 1];
function reach(sx, sy, tx, ty, ua, fa, s) {
  const L1 = K.part('uarm').len, L2 = K.part('farm').len, d = Math.hypot(tx - sx, ty - sy);
  const str = clamp((d - L1 * 0.98) / L2, 1, 1.6);
  const ik = ik2(sx, sy, tx, ty, L1, L2 * str, 1);
  _r[0] = lerp(ua, HP - ik[0], s); _r[1] = lerp(fa, HP - ik[1], s); _r[2] = lerp(1, str, s);
  return _r;
}
function leg(hx, hy, hip, kn, vn) {
  const p = K.bone('thigh', hx, hy, dirOf(hip), 1, vn);
  K.bone('shin', p[0], p[1], dirOf(hip + kn), 1, vn);
}
function arm(sx, sy, ua, fa, str, vn, out) {
  const u = K.part('uarm'), du = dirOf(ua), df = dirOf(fa);
  K.bone('uarm', sx, sy, du, 1, vn);
  const ex = sx + Math.cos(du) * u.len, ey = sy + Math.sin(du) * u.len;
  K.bone('farm', ex, ey, df, 1, vn, 1, str);
  const f = K.part('farm');
  out[0] = ex + Math.cos(df) * f.len * str; out[1] = ey + Math.sin(df) * f.len * str;
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e), t = e.t ?? 0;
  RIGTD = rig.td;
  const hpK = e.stats?.maxHp ? e.hp / e.stats.maxHp : 1;
  const di = e.dying > 0 ? 2 : hpK < 0.3 ? 2 : hpK < 0.6 ? 1 : 0, vn = VAR[di], vnD = di ? 'deep_' + vn : 'deep';
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      K.begin(ctx, rig, 0); layout(q); K.end();
      e._pcorpse = true; claimDebris(world, e);
      const u = rig.parts.uarm, th = rig.parts.thigh, fa = rig.parts.farm;   // (K.part is only valid between begin/end)
      const pc = (name, pv, x, y, rot, vx, vy, vr, v = 'base') => ({ name, pv, x, y, rot, vn: v, vx, vy, vr });
      K.spawnCorpse(world, e, rig, [
        pc('thigh', 'a', L.hF[0], L.hy, dirOf(q.hipF) - th.ang, K.frand(-40, 20), -K.frand(40, 120), K.frand(-3, 3), 'deep'),
        pc('uarm', 'a', L.shF[0], L.shF[1], dirOf(q.uaF) - u.ang, K.frand(-60, 60), -K.frand(80, 200), K.frand(-5, 5), 'deep'),
        pc('body', 'a', 0, L.hy, L.rot, K.frand(20, 60), -K.frand(60, 120), K.frand(1.5, 2.6), vn),
        pc('thigh', 'a', L.hN[0], L.hy, dirOf(q.hipN) - th.ang, K.frand(-30, 30), -K.frand(40, 120), K.frand(-3, 3)),
        pc('farm', 'a', L.shN[0], L.shN[1] + 18, dirOf(q.faN) - fa.ang, K.frand(-90, 90), -K.frand(120, 260), K.frand(-6, 6)),
        pc('uarm', 'a', L.shN[0], L.shN[1], dirOf(q.uaN) - u.ang, K.frand(-90, 90), -K.frand(100, 220), K.frand(-6, 6)),
      ], { life: 1.8, fade: 0.6, bounce: 0.2, dust: { n: 14, w: 36, h: 30, col: '#8a9a3a', k: 0 } });
    }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.04 * sq, 1 - 0.04 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  layout(q);
  K.shadow(30, 0.4);
  // far limbs (darkened), trunk, near leg, near arm
  leg(L.hF[0], L.hF[1], q.hipF, q.knF, 'deep');
  if (q.plant > 0) {
    let r = reach(L.shN[0], L.shN[1], L.shN[0] + 34, 4, q.uaN, q.faN, q.plant); q.uaN = r[0]; q.faN = r[1]; q.str = r[2];
    r = reach(L.shF[0], L.shF[1], L.shF[0] + 30, 4, q.uaF, q.faF, q.plant); q.uaF = r[0]; q.faF = r[1]; q.strF = r[2];
    if (q.dig) { const tr = Math.sin(t * 40) * 0.015; q.uaN += tr; q.uaF -= tr; }
  }
  arm(L.shF[0], L.shF[1], q.uaF, q.faF, q.strF, vnD, L.handF);
  K.put('body', 'a', 0, L.hy, L.rot, 1, 1, 1, vn);
  leg(L.hN[0], L.hN[1], q.hipN, q.knN, 'base');
  arm(L.shN[0], L.shN[1], q.uaN, q.faN, q.str, vn, L.handN);
  if (!o.flash) {
    // skull eyes + spore sacs (swell and flare when the spores burst)
    for (const pn of ['eyeL', 'eyeR']) { K.pivotPos('body', 'a', pn, 0, L.hy, L.rot, 1, 1, _q); K.glow(_q[0], _q[1], 2.5 + 2 * q.tele, '#d8ff7a', 0.8); }
    for (let i = 0; i < 3; i++) {
      _q[0] = L.sacs[i * 2]; _q[1] = L.sacs[i * 2 + 1];
      const pul = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.1);
      K.glow(_q[0], _q[1], 7 + 3 * pul + 9 * q.spore, '#c8ff6a', 0.25 + 0.15 * pul + 0.4 * q.spore);
    }
    if (q.tele > 0.4) glint(ctx, L.handN[0], L.handN[1], 4 + 5 * q.tele, '#e8ffb8', (q.tele - 0.4) / 0.6);
    if (q.trail) swingTrail(ctx, L.shN[0], L.shN[1], q.trail[0], q.trail[1], 64, 14, '#c8f080', 0.45 * q.trail[2]);
    if (q.dig) { K.glow(L.handN[0], -2, 16, '#9ac83a', 0.35); K.glow(L.handF[0], -2, 12, '#9ac83a', 0.25); }
  }
  K.end();
  // spores drifting off the sacs; a burst when e.sporeAt fires; moss dust while digging in (camera space)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(30));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
    const burst = q.spore > 0.75 && !(e._spored === e.sporeAt);
    for (let i = 0; i < 3; i++) {
      const wx = e.cx + f * sc * L.sacs[i * 2], wy = e.bottom + sc * L.sacs[i * 2 + 1];
      for (let n = pool.rate(i, K.lod() === 0 ? 0.6 : 1.4, dt); n > 0; n--) pool.add(0, wx + K.frand(-3, 3), wy, K.frand(-12, 12), K.frand(-26, -8), K.frand(0.8, 1.5), K.frand(1.2, 2.2), '#c8ff6a');
      if (burst) for (let n = 0; n < (K.lod() === 0 ? 4 : 8); n++) pool.add(2, wx, wy, K.frand(-120, 120), K.frand(-110, 30), K.frand(0.6, 1.1), K.frand(5, 10), '#8aa83a');
    }
    if (burst) e._spored = e.sporeAt;
    if (q.dig && e.anim === 'plant' && (e.stateT ?? 0) < (e.params?.windup ?? 0.8) + 0.08) for (let n = pool.rate(3, 40, dt); n > 0; n--) pool.add(2, e.cx + f * sc * (L.handN[0] + K.frand(-8, 8)), e.bottom - 2, K.frand(-60, 60), K.frand(-90, -30), K.frand(0.4, 0.7), K.frand(4, 7), '#4a3a24');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
