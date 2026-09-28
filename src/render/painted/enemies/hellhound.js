// T2 painted quadruped (wolf-rig reuse): 지옥견 (hellhound). The wolf's painted parts re-painted as a lava-born hound
// (composition-keeping Kling edits, so tools/painted/enemies/hellhound/parts.json reuses the wolf's cut coordinates):
// charred black body split by glowing lava cracks with a mane of flames and a black horn, one front leg and one hind leg
// (rigid painted limbs swung from their joints, far pair darkened behind the body) and a tail ending in a flame tuft
// (bending chain). spec.scale sizes the wolf-sized cut to the hound's 70×46 logic rect.
// Driven by AI_B.hound (+ AI.charger): idle (breathing, embers rising off the mane) · walk (trot 9 rad/s) · wind (0.42 s
// growl before the charge: crouch, shiver, eyes flare, fang glint) · charge (gallop 16 rad/s, stretched, the mane and
// tail stream flames, sparks kicked up — the burning footprints are the AI's own zones) · breath (0.5 s rear-up while
// the throat glows, then the jaws snap forward and a jet of fire pours out for 0.7 s; the AI emits the fire particles and
// the hit box, the renderer adds the glowing maw and the flame tongue) · rest (idle) · hurt · airborne (legs tucked) ·
// death (the body and legs collapse as corpse pieces in a burst of embers and ash).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { HP, glint, claimDebris } from './_biped.js';

export const spec = {
  id: 'hellhound', tier: 'T2', src: 'hellhound',
  scale: 1.13,       // wolf-sized cut (≈ 62×40) → the hound's 70×46 logic rect (measure.mjs)
  bake: { outline: 0.42, deep: { fleg: 0.58, hleg: 0.58 }, deepTint: 'rgb(150,110,110)' },
};

const EYE = '#ffb030';
const _q = [0, 0], _j = [0, 0];
const PL = [];
let NP = 0;
function place(name, pv, x, y, rot, vn = 'base', sx = 1, sy = 1) {
  const o = PL[NP] ?? (PL[NP] = {});
  o.name = name; o.pv = pv; o.x = x; o.y = y; o.rot = rot; o.vn = vn; o.sx = sx; o.sy = sy; NP++;
  return o;
}
/** a leg hanging from its joint: limb angle a (0 = straight down, + = paw forward) */
function leg(name, x, y, a, vn) {
  const p = K.part(name);
  if (p) place(name, 'a', x, y, HP - a - p.ang, vn);
}

const POSE = { bob: 0, lean: 0, sx: 1, shake: 0, fN: 0, fF: 0, hN: 0, hF: 0, tailDir: 2.6, tailAmp: 0.12, tailF: 3, tele: 0, maw: 0, fire: 0 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, P = e.params ?? {};
  const q = POSE;
  q.bob = Math.sin(t * 2.6) * 0.5; q.lean = 0; q.sx = 1; q.shake = 0; q.tele = 0; q.maw = 0; q.fire = 0;
  q.fN = 0.04; q.fF = -0.04; q.hN = -0.04; q.hF = 0.04;
  q.tailDir = 2.55 + Math.sin(t * 1.4) * 0.08; q.tailAmp = 0.12; q.tailF = 3;
  if (an === 'walk') {
    const ph = t * 9, A = 0.4;
    q.fN = Math.sin(ph) * A; q.hF = Math.sin(ph) * A;            // trot: diagonal pairs together
    q.fF = Math.sin(ph + Math.PI) * A; q.hN = Math.sin(ph + Math.PI) * A;
    q.bob = -Math.abs(Math.cos(ph)) * 1.2; q.tailAmp = 0.16; q.tailF = 9;
  } else if (an === 'wind') {
    const k = ease.outCubic(clamp((e.animT ?? e.stateT ?? 0) / (P.windup ?? 0.42), 0, 1));
    q.fN = q.fF = lerp(0.04, 0.5, k); q.hN = q.hF = lerp(-0.04, -0.55, k);
    q.lean = 0.1 * k; q.shake = Math.sin(t * 60) * 0.8 * k;
    q.tailDir = lerp(2.55, 3.35, k); q.tailAmp = 0.04; q.tailF = 30; q.tele = k; q.maw = 0.3 * k;
  } else if (an === 'charge') {
    const ph = t * 16, A = 0.85;
    q.fN = Math.sin(ph) * A; q.fF = Math.sin(ph + 0.35) * A;        // rotary gallop
    q.hN = Math.sin(ph + 2.5) * A; q.hF = Math.sin(ph + 2.85) * A;
    q.sx = 1.1; q.lean = Math.sin(ph) * 0.06; q.bob = Math.sin(ph * 2) * 1.6;
    q.tailDir = 3.05; q.tailAmp = 0.1; q.tailF = 16;
  } else if (an === 'breath') {
    const wu = P.breath ?? 0.5, at = e.animT ?? e.stateT ?? 0;
    if (at < wu) {
      // rear back, the throat fills with fire
      const k = ease.outCubic(clamp(at / wu, 0, 1));
      q.lean = -0.16 * k; q.fN = q.fF = lerp(0.04, 0.35, k); q.hN = q.hF = lerp(-0.04, -0.2, k); q.bob = -1.5 * k;
      q.tele = k; q.maw = 0.4 + 0.6 * k;
      q.tailDir = lerp(2.55, 3.2, k); q.tailAmp = 0.05; q.tailF = 24;
    } else {
      // jaws snap forward and down: the jet pours out (AI fire particles + hit box for 0.7 s)
      const k = clamp((at - wu) / 0.1, 0, 1), f = at < wu + 0.7 ? 1 : clamp(1 - (at - wu - 0.7) / 0.25, 0, 1);
      q.lean = lerp(-0.16, 0.07, ease.outExpo(k)); q.fN = q.fF = 0.3; q.hN = q.hF = -0.3;
      q.shake = Math.sin(t * 45) * 0.6 * f; q.maw = f; q.fire = f;
      q.tailDir = 3.2; q.tailAmp = 0.08; q.tailF = 20;
    }
  }
  if (e.onGround === false && !(e.stun > 0)) { q.fN = q.fF = 0.8; q.hN = q.hF = -0.85; q.tailDir = 2.9; }
  if (K.hurtOf(e)) { q.lean = -0.15; q.shake = 0; }
  return q;
}

const L0 = {};
function layout(e, q) {
  NP = 0;
  const flen = K.part('fleg')?.len ?? 22, hlen = K.part('hleg')?.len ?? 22;
  // joint height: the lower of the two leg pairs touches the ground (rigid legs: a splayed pair is shorter)
  const reach = Math.max(flen * Math.cos(Math.max(Math.abs(q.fN), Math.abs(q.fF)) * 0.6), hlen * Math.cos(Math.max(Math.abs(q.hN), Math.abs(q.hF)) * 0.6));
  const ay = -(reach + 6.2) + q.bob, ax = 7 + q.shake;
  const sx = q.sx;
  K.pivotPos('body', 'a', 'shoulder', ax, ay, q.lean, sx, 1, _j); const sX = _j[0], sY = _j[1];
  K.pivotPos('body', 'a', 'shoulder2', ax, ay, q.lean, sx, 1, _j); const s2X = _j[0], s2Y = _j[1];
  K.pivotPos('body', 'a', 'hip', ax, ay, q.lean, sx, 1, _j); const hX = _j[0], hY = _j[1];
  K.pivotPos('body', 'a', 'hip2', ax, ay, q.lean, sx, 1, _j); const h2X = _j[0], h2Y = _j[1];
  K.pivotPos('body', 'a', 'tail', ax, ay, q.lean, sx, 1, _j); L0.tx = _j[0]; L0.ty = _j[1];
  leg('hleg', h2X, h2Y, q.hF, 'deep');
  leg('fleg', s2X, s2Y, q.fF, 'deep');
  L0.tailAt = NP;                                   // the tail chain is drawn between the far legs and the body
  place('body', 'a', ax, ay, q.lean, 'base', sx, 1);
  leg('hleg', hX, hY, q.hN, 'base');
  leg('fleg', sX, sY, q.fN, 'base');
  L0.ax = ax; L0.ay = ay; L0.sx = sx;
  return L0;
}

let TW_T = 0, TW_A = 0.12, TW_F = 3;
const tailBend = (u) => Math.sin(TW_T * TW_F - u * 3.2) * TW_A * (0.4 + u);

function drawAll(e, q, L) {
  for (let i = 0; i < NP; i++) {
    if (i === L.tailAt) {
      TW_T = e.t ?? 0; TW_A = q.tailAmp; TW_F = q.tailF;
      K.chain('tail', L.tx, L.ty, q.tailDir + q.lean, 1, K.nStrips(6), tailBend);
    }
    const p = PL[i];
    K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, 1, p.vn);
  }
}

/** local → world (camera space) for the render-only particles: feet origin, facing, elite and spec scale */
function toWorld(e, rig, lx, ly, out) {
  const s = (e.scale || 1) * (rig.scale ?? 1), f = e.facing < 0 ? -1 : 1;
  out[0] = e.cx + f * s * lx; out[1] = e.bottom + s * ly;
  return out;
}

function die(e, world, rig, q) {
  const L = layout(e, q);
  e._pcorpse = true;
  claimDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  const pieces = [];
  for (let i = 0; i < NP; i++) {
    const p = PL[i];
    pieces.push({ ...p, vx: kb * 70 + K.frand(-90, 90), vy: -K.frand(120, 300) * (p.name === 'body' ? 0.7 : 1), vr: K.frand(-7, 7) * (p.name === 'body' ? 0.4 : 1) });
  }
  pieces.push({ name: 'tail', pv: 'a', x: L.tx, y: L.ty, rot: 0.3, vn: 'base', sx: 1, sy: 1, vx: K.frand(-80, 40), vy: -K.frand(100, 220), vr: K.frand(-6, 6) });
  // corpse: pieces cool from ember-red to ash while they tumble; ember sparks burst from the body
  K.spawnCorpse(world, e, rig, pieces, { life: 1.4, fade: 0.55, bounce: 0.25, dust: { n: 10, w: 26, h: 20, col: '#3a2a26' } });
  if (!world.fx?.ghost) return;
  const pool = new K.FxPool(22), t0 = world.time ?? 0;
  toWorld(e, rig, L.ax, L.ay, _q);
  for (let i = 0; i < 22; i++) { const a = K.frand(-Math.PI, 0), sp = K.frand(60, 240); pool.add(3, _q[0] + K.frand(-18, 18), _q[1] + K.frand(-8, 8), Math.cos(a) * sp, Math.sin(a) * sp - 40, K.frand(0.4, 0.9), K.frand(2, 4), i % 3 ? '#ff8a2a' : '#ffd080'); }
  world.fx.ghost((c) => {
    if ((world.time ?? t0) - t0 > 1.0) return;
    c.save(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    pool.step(world.time ?? t0); pool.draw(c);
    c.restore();
  }, 1.05, 'front');
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  const t = e.t ?? 0;
  if (e.dying > 0) {
    if (!e._pcorpse && world) { K.begin(ctx, rig, 0); die(e, world, rig, q); K.end(); }
    if (world) return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.08 * sq, 1 - 0.08 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(26, 0.42);
  const L = layout(e, q);
  if (!o.flash) K.glow(L.ax - 4, L.ay - 2, 30, '#ff5a1a', 0.22 + 0.08 * Math.sin(t * 3.1));     // body heat
  drawAll(e, q, L);
  if (!o.flash) {
    const ea = 0.55 + 0.2 * Math.sin(t * 5) + q.tele * 0.5;
    K.pivotPos('body', 'a', 'eye', L.ax, L.ay, q.lean, L.sx, 1, _q); K.glow(_q[0], _q[1], 2.4 + q.tele * 2.5, EYE, ea);
    K.pivotPos('body', 'a', 'eye2', L.ax, L.ay, q.lean, L.sx, 1, _q); K.glow(_q[0], _q[1], 1.8 + q.tele * 1.6, EYE, ea * 0.7);
    K.pivotPos('body', 'a', 'mouth', L.ax, L.ay, q.lean, L.sx, 1, _q);
    const mx = _q[0], my = _q[1];
    // glowing maw: molten drool at rest, a furnace while it breathes
    K.glow(mx, my - 1, 4 + 7 * q.maw, '#ff8a2a', 0.45 + 0.55 * q.maw);
    if (q.maw > 0.3) K.glow(mx, my - 1, 2 + 4 * q.maw, '#fff0a0', q.maw);
    if (q.fire > 0) flameTongue(ctx, mx + 2, my - 1, q.fire, t);
    if (q.tele > 0.5 && e.anim !== 'breath') glint(ctx, mx + 1, my - 3, 3 + 3 * q.tele, '#fff0d0', 0.8 * (q.tele - 0.5) / 0.5);
    if (e.anim === 'breath' && q.tele > 0.4) glint(ctx, mx + 4, my - 2, 4 + 4 * q.tele, '#ffd080', (q.tele - 0.4) / 0.6);
  }
  K.end();
  // embers off the flame mane and the tail tuft, sparks under the gallop (world space, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(26));
    const dt = pool.step(K.clockOf(e, world));
    const lo = K.lod() === 0, f = e.facing < 0 ? -1 : 1, fast = e.anim === 'charge';
    K.pivotPos('body', 'a', 'a', L.ax, L.ay, q.lean, L.sx, 1, _j);
    for (let k = pool.rate(0, (lo ? 5 : 10) * (fast ? 2 : 1), dt); k > 0; k--) {
      toWorld(e, rig, _j[0] + K.frand(-16, 14), _j[1] - K.frand(8, 16), _q);
      pool.add(3, _q[0], _q[1], -f * K.frand(10, fast ? 120 : 30), -K.frand(30, 80), K.frand(0.4, 0.8), K.frand(1.5, 3), K.fr() < 0.5 ? '#ff9a3a' : '#ffd070');
    }
    if (fast && e.onGround !== false) {
      for (let k = pool.rate(1, lo ? 8 : 16, dt); k > 0; k--) pool.add(3, e.cx - f * K.frand(4, 26), e.bottom - K.frand(0, 3), -f * K.frand(40, 140), -K.frand(40, 160), K.frand(0.25, 0.5), K.frand(1.2, 2.2), '#ffb050');
    }
    ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
  }
}

/** the jet's root: a flickering additive tongue of fire leaving the maw (the AI's particles carry it further) */
function flameTongue(ctx, x, y, a, t) {
  K.local();
  const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const L = (26 + 8 * Math.sin(t * 31 + i * 2)) * (1 - i * 0.22), w = (6 - i * 1.6) * (1 + 0.15 * Math.sin(t * 40 + i));
    ctx.globalAlpha = ga * a * (i === 2 ? 0.9 : 0.55);
    ctx.fillStyle = i === 2 ? '#fff2b0' : i === 1 ? '#ffa030' : '#ff5a18';
    ctx.beginPath();
    ctx.moveTo(x, y - w * 0.5);
    ctx.quadraticCurveTo(x + L * 0.55, y - w * 1.1 + Math.sin(t * 27 + i) * 2, x + L, y + Math.sin(t * 23 + i) * 3);
    ctx.quadraticCurveTo(x + L * 0.55, y + w * 1.1 + Math.sin(t * 29 + i) * 2, x, y + w * 0.5);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
}
