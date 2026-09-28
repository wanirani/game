// T3 painted biped: 마족 영주 (demon_lord) — a ram-horned arch-demon of maroon hide split by glowing lava cracks, a
// black-and-gold pauldron and belt, digitigrade legs on cloven hooves, a folded bat wing, a tattered cape, a barbed tail
// and a flaming greatsword. Cut-out puppet: head, torso, thigh + shin per leg (2-bone IK, far leg darkened), near arm
// (upper arm + fist forearm gripping the sword), far arm (upper arm + open claw hand), wing (bending chain), cape
// (strip warp), tail (bending chain).
// Driven by AI_B.demonlord: idle (breathing, heat pulsing through the cracks, wing and tail swaying) · walk (heavy
// planted stride at the AI's 46 px/s, 5 rad/s gait) · swing (P.windup 0.6 s: the greatsword is hauled back over the
// shoulder, the body coils, the blade blazes; then a 0.1 s downward cleave on the AI's hit — its strike box reaches 124 px
// ahead — with a fire crescent, flames shed along the blade, recovery until +0.55) · fireball (0.55 s: the claw hand
// thrusts forward, a fireball swells in the palm — the AI throws three at 0.55 from (30, −84)) · hellfire (0.5 s: the
// claw hand is raised, the head throws back in a roar, the cracks flare — the AI raises pillars of fire under the
// player) · hurt · damage variants by HP (dmg1 < 60 %, dmg2 < 30 %: scorched, cracked hide) · death (the demon breaks
// apart in a burst of embers, the greatsword clatters down with the pieces).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { HP, swingTrail, glint, ik2, claimDebris } from './_biped.js';

const DMG = { char: 0.8, cracks: 2, holes: 0, chips: 1, stain: '#1a0808', crackMinLum: 40 };
export const spec = {
  id: 'demon_lord', tier: 'T3', src: 'demon_lord',
  scale: 1.05,
  bake: {
    outline: 0.42, deep: { '*': 0.55 }, deepTint: 'rgb(130,90,90)', glow: { sword: '#ffb040' },
    damage: { torso: DMG, head: DMG, uarm: DMG, thigh: DMG },
  },
};

const SW = 1.12;                      // sword scale (grip → tip ≈ 93 px)
const _q = [0, 0], _n = [0, 0], _f = [0, 0], _g = [0, 0], _t = [0, 0];

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0, P = e.params ?? {};
  const wu = P.windup ?? 0.6, ph = t * 5;
  const q = { walk: an === 'walk', ph, bob: Math.sin(t * 2) * 0.8, lean: 0.04, headR: Math.sin(t * 0.9) * 0.04,
    nU: HP - 0.6, nF: HP - 1.1, sw: -0.45,                 // near arm: upper arm / fist forearm / blade directions
    fU: HP - 0.3, fF: HP - 0.7,                            // far arm (claw hand)
    wind: 0, strike: 0, trail: null, heat: 0.5 + 0.2 * Math.sin(t * 3), cast: 0, castK: 0, roar: 0, wing: -2.35 + Math.sin(t * 1.2) * 0.05 };
  if (q.walk) { q.bob = Math.abs(Math.sin(ph)) * 2.4; q.fU = HP - 0.3 + Math.sin(ph) * 0.3; q.fF = q.fU - 0.4; }
  if (an === 'swing') {
    if (at < wu) {
      const w = ease.outCubic(clamp(at / wu, 0, 1));
      q.wind = w; q.nU = lerp(HP - 0.6, -1.35, w); q.nF = q.nU - 0.45; q.sw = lerp(-0.45, -2.25, w); q.lean = -0.12 * w; q.headR -= 0.08 * w;
    } else {
      const k = ease.outExpo(clamp((at - wu) / 0.1, 0, 1)), r = clamp((at - wu - 0.3) / 0.25, 0, 1);
      q.strike = k * (1 - r);
      q.nU = lerp(-1.35, HP - 1.0, k); q.nF = lerp(q.nU - 0.45, HP - 1.3, k); q.sw = lerp(-2.25, 0.78, k); q.lean = 0.3 * k;
      q.nU = lerp(q.nU, HP - 0.6, r); q.nF = lerp(q.nF, HP - 1.1, r); q.sw = lerp(q.sw, -0.45, ease.inOutQuad(r)); q.lean = lerp(q.lean, 0.04, r);
      const f = 1 - clamp((at - wu - 0.1) / 0.25, 0, 1);
      if (f > 0) q.trail = [HP + 2.25, HP - q.sw, f];
    }
    q.heat = 0.85;
  } else if (an === 'fireball') {
    const k = ease.outCubic(clamp(at / 0.55, 0, 1)), r = clamp((at - 0.55) / 0.3, 0, 1);
    q.cast = at < 0.55 ? k : 0; q.castK = k * (1 - r);
    q.fU = lerp(HP - 0.3, HP - 1.45, q.castK); q.fF = lerp(HP - 0.7, -0.05, q.castK); q.heat = 0.6 + k * 0.4; q.lean = 0.06 * q.castK;
  } else if (an === 'hellfire') {
    const k = ease.outCubic(clamp(at / 0.5, 0, 1)), r = clamp((at - 0.7) / 0.4, 0, 1);
    q.cast = at < 0.5 ? k : 0; q.castK = k * (1 - r); q.roar = q.castK;
    q.fU = lerp(HP - 0.3, -1.25, q.castK); q.fF = lerp(HP - 0.7, -1.5, q.castK); q.heat = 0.6 + k * 0.4; q.lean = -0.1 * q.castK; q.headR -= 0.35 * q.roar;
    q.wing = lerp(q.wing, -1.9, q.roar);
  }
  const hurt = K.hurtOf(e);
  if (hurt) { q.lean -= 0.1 * hurt; q.headR -= 0.12 * hurt; }
  return q;
}

/** feet targets for the planted stride (local, facing right) */
function feet(q, near) {
  if (!q.walk) return [near ? 5 : -5, 0];
  const s = Math.sin(q.ph + (near ? 0 : Math.PI)), c = Math.cos(q.ph + (near ? 0 : Math.PI));
  return [(near ? 3 : -3) + s * 11, -Math.max(0, c) * 6];
}

const PL = [];
let NP = 0;
function place(name, pv, x, y, rot, vn, sx = 1, sy = 1) {
  const o = PL[NP] ?? (PL[NP] = {});
  o.name = name; o.pv = pv; o.x = x; o.y = y; o.rot = rot; o.vn = vn; o.sx = sx; o.sy = sy; NP++;
}
/** bone that also records its placement for the corpse */
function bone(name, x, y, dir, vn, s = 1) {
  const p = K.part(name);
  const b = K.bone(name, x, y, dir, s, vn);
  if (p) place(name, 'a', x, y, dir - p.ang, vn, s, s);
  return b;
}
function leg(hx, hy, q, near, vn) {
  const L1 = K.part('thigh').len, L2 = K.part('shin').len;
  const [fx, fy] = feet(q, near);
  const a = ik2(hx, hy, fx, fy - 2, L1, L2, 1);
  const a0 = a[0], a1 = a[1];
  const k = bone('thigh', hx, hy, a0, vn); const kx = k[0], ky = k[1];
  bone('shin', kx, ky, a1, vn);
}

function layout(ctx, e, q, o, vb, t, td) {
  NP = 0;
  const hipY = -45 + q.bob * 0.6;
  // pelvis: hip joint under the torso pivot; the torso leans about it
  const tr = q.lean;
  K.pivotPos('torso', 'a', 'neck', 0, hipY, tr, 1, 1, _n); const nx = _n[0], ny = _n[1];
  K.pivotPos('torso', 'a', 'shN', 0, hipY, tr, 1, 1, _q); const snx = _q[0], sny = _q[1];
  K.pivotPos('torso', 'a', 'shF', 0, hipY, tr, 1, 1, _q); const sfx = _q[0], sfy = _q[1];
  // wing (folded, behind everything) and cape
  K.chain('wing', sfx - 4, sfy - 2, q.wing, 1, K.lod() === 0 ? 4 : 7, (u, j) => (j === 0 ? 0 : Math.sin(t * 1.6 - u * 3) * 0.05 + q.roar * 0.08), 1, 'deep');
  K.strips('cape', 'a', sfx - 3, sfy - 6, 0.1 + tr * 0.5, 1, 1, K.nStrips(8), 'y', (u) => {
    _q[0] = (Math.sin(t * 2 - u * 3) * u * 2.5 - u * u * (q.walk ? 4 : 1.5)) * td; _q[1] = 0; return _q;
  }, 1, 'deep');
  place('cape', 'a', sfx - 3, sfy - 6, 0.1 + tr * 0.5, 'deep');
  // far leg, tail, far arm
  leg(-2, hipY + 2, q, false, 'deep');
  K.chain('tail', -6, hipY + 3, Math.PI * 0.92 + Math.sin(t * 1.3) * 0.1, 1, K.lod() === 0 ? 4 : 7, (u, j) => (j === 0 ? 0 : Math.sin(t * 2.2 - u * 4) * 0.07 + 0.03), 1, 'deep', true);
  const fe = bone('uarm', sfx, sfy, q.fU, 'deep'); const fex = fe[0], fey = fe[1];
  bone('hand', fex, fey, q.fF, 'deep');
  K.pivotPos('hand', 'a', 'b', fex, fey, q.fF - K.part('hand').ang, 1, 1, _f);
  // near leg, torso, head
  leg(3, hipY + 1, q, true, vb);
  K.put('torso', 'a', 0, hipY, tr, 1, 1, 1, vb); place('torso', 'a', 0, hipY, tr, vb);
  K.put('head', 'a', nx - 1, ny + 2, tr * 0.6 + q.headR, 1, 1, 1, vb); place('head', 'a', nx - 1, ny + 2, tr * 0.6 + q.headR, vb);
  // near arm: upper arm, then the sword in the fist, then the fist over the grip
  const ne = bone('uarm', snx, sny, q.nU, vb); const nex = ne[0], ney = ne[1];
  const fp = K.part('fist');
  K.pivotPos('fist', 'a', 'grip', nex, ney, q.nF - fp.ang, 1, 1, _g);
  const sp = K.part('sword');
  if (!o.flash && K.lod() > 0 && (q.wind > 0.3 || q.strike > 0)) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('sword', 'grip', _g[0], _g[1], q.sw - sp.ang, SW * 1.02, SW * 1.25, 0.35 + 0.4 * Math.max(q.wind, q.strike), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.put('sword', 'grip', _g[0], _g[1], q.sw - sp.ang, SW, SW); place('sword', 'grip', _g[0], _g[1], q.sw - sp.ang, 'base', SW, SW);
  bone('fist', nex, ney, q.nF, vb);
  K.pivotPos('sword', 'grip', 'b', _g[0], _g[1], q.sw - sp.ang, SW, SW, _t);
  return { hipY, nx, ny, snx, sny, gx: _g[0], gy: _g[1], tipx: _t[0], tipy: _t[1], hx: _f[0], hy: _f[1] };
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, q = pose(e), td = rig.td;
  const hpK = e.stats?.maxHp ? e.hp / e.stats.maxHp : 1;
  const vb = hpK < 0.3 ? 'dmg2' : hpK < 0.6 ? 'dmg1' : 'base';
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { e._pcorpse = true; K.begin(ctx, rig, 0); layout(ctx, e, q, o, vb, t, td); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.04 * sq, 1 - 0.04 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(30, 0.5);
  if (!o.flash) K.glow(0, -58, 60, '#ff5a1a', 0.12 + q.heat * 0.14 + q.castK * 0.2);
  const L = layout(ctx, e, q, o, vb, t, td);
  if (!o.flash) {
    if (q.trail) swingTrail(ctx, L.snx, L.sny, q.trail[0], q.trail[1], 110, 40, '#ffa040', q.trail[2] * 0.85);
    // lava cracks, gem, eyes
    K.pivotPos('torso', 'a', 'chest', 0, L.hipY, q.lean, 1, 1, _q); K.glow(_q[0], _q[1], 16, '#ff7a2a', 0.18 + q.heat * 0.3);
    K.pivotPos('torso', 'a', 'gem', 0, L.hipY, q.lean, 1, 1, _q); K.glow(_q[0], _q[1], 5 + q.heat * 2, '#ff9a3a', 0.6 + q.heat * 0.3);
    K.pivotPos('head', 'a', 'eye', L.nx - 1, L.ny + 2, q.lean * 0.6 + q.headR, 1, 1, _q);
    K.glow(_q[0], _q[1], 3 + q.heat * 2 + q.roar * 3, '#ffb030', 0.7 + q.roar * 0.3);
    if (q.roar > 0.3) { K.pivotPos('head', 'a', 'mouth', L.nx - 1, L.ny + 2, q.lean * 0.6 + q.headR, 1, 1, _q); K.glow(_q[0], _q[1], 6 + 8 * q.roar, '#ff7a2a', q.roar); }
    // cast: fireball swelling in the claw hand / hellfire flare above it
    if (q.castK > 0) {
      K.glow(L.hx + 2, L.hy, 10 + q.cast * 14, '#ff7a2a', 0.5 + q.cast * 0.5);
      K.glow(L.hx + 2, L.hy, 4 + q.cast * 5, '#fff0a0', q.cast);
      if (q.cast > 0.5) glint(ctx, L.hx + 3, L.hy, 4 + 6 * q.cast, '#ffd080', (q.cast - 0.5) * 2);
    }
    if (q.wind > 0.6) glint(ctx, L.tipx, L.tipy, 5 + 6 * q.wind, '#ffe0a0', (q.wind - 0.6) * 2.5);
    const hurt = K.hurtOf(e);
    if (hurt) K.glow(0, -60, 40, '#ff8a5a', 0.3 * hurt);
  }
  embers(ctx, e, world, o, rig, q, L);
  K.end();
}

/** embers shed by the burning blade and the lava cracks (world space) */
function embers(ctx, e, world, o, rig, q, L) {
  if (!o.cam) return;
  const pool = e._fx ?? (e._fx = new K.FxPool(K.lod() === 0 ? 14 : 28));
  const dt = pool.step(K.clockOf(e, world));
  if (dt > 0 && !o.flash) {
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    const rate = (K.lod() === 0 ? 4 : 8) * (1 + q.wind * 2 + q.strike * 4);
    for (let k = pool.rate(0, rate, dt); k > 0; k--) {
      const u = K.fr() * 0.8 + 0.2, x = lerp(L.gx, L.tipx, u), y = lerp(L.gy, L.tipy, u);
      pool.add(3, e.cx + f * x * sc, e.bottom + y * sc, K.frand(-20, 20), -K.frand(30, 90), K.frand(0.35, 0.8), K.frand(1.4, 2.6), K.fr() < 0.5 ? '#ff9a3a' : '#ffd070');
    }
  }
  if (pool.n) { ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore(); }
}

function die(e, world, rig) {
  claimDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  const pieces = [];
  for (let i = 0; i < NP; i++) {
    const p = PL[i], heavy = p.name === 'torso' || p.name === 'sword';
    pieces.push({ ...p, vx: kb * 60 + K.frand(-100, 100) * (heavy ? 0.4 : 1), vy: -K.frand(100, 300) * (p.name === 'head' ? 1.3 : heavy ? 0.5 : 1), vr: K.frand(-6, 6) * (heavy ? 0.35 : 1) });
  }
  K.spawnCorpse(world, e, rig, pieces, { life: 1.6, fade: 0.55, bounce: 0.2, dust: { n: 10, w: 26, h: 24, col: '#3a2020' } });
  if (!world.fx?.ghost) return;
  const pool = new K.FxPool(26), t0 = world.time ?? 0, sc = (e.scale || 1) * (rig.scale ?? 1);
  for (let i = 0; i < 26; i++) { const a = K.frand(-Math.PI, 0), sp = K.frand(60, 260); pool.add(3, e.cx + K.frand(-20, 20) * sc, e.bottom - K.frand(30, 90) * sc, Math.cos(a) * sp, Math.sin(a) * sp - 40, K.frand(0.4, 1), K.frand(2, 4), i % 3 ? '#ff8a2a' : '#ffd080'); }
  world.fx.ghost((c) => {
    if ((world.time ?? t0) - t0 > 1.1) return;
    c.save(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    pool.step(world.time ?? t0); pool.draw(c);
    c.restore();
  }, 1.15, 'front');
}
