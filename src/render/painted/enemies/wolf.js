// T2 painted quadruped: 굶주린 늑대 (wolf). Parts: the hunched body with the snarling head and bristling hackles, one
// front leg and one hind leg (each a rigid painted limb swung from its joint: near pair in front of the body, far pair
// behind it and darkened) and the bushy tail (bending chain).
// States (AI.charger → AI.walker): idle (breathing, slow tail sway) · walk (diagonal trot, 9 rad/s) · wind (0.5 s
// growl: the wolf crouches — forelegs forward, hind legs back —, shivers, eyes flare, a glint runs along the fangs:
// the charge comes when it peaks) · charge (gallop 16 rad/s, body stretched, tail streaming, dust kicked up) · rest
// (idle) · hurt (flash, squash, recoil) · airborne (legs tucked) · death (the body and legs collapse as corpse pieces).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { HP, glint, claimDebris } from './_biped.js';

export const spec = {
  id: 'wolf', tier: 'T2', src: 'wolf',
  bake: { outline: 0.42, deep: { fleg: 0.6, hleg: 0.6 }, deepTint: 'rgb(120,116,150)' },
};

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
  if (!p) return;
  place(name, 'a', x, y, HP - a - p.ang, vn);
}

const POSE = { bob: 0, lean: 0, sx: 1, shake: 0, fN: 0, fF: 0, hN: 0, hF: 0, tailDir: 2.6, tailAmp: 0.12, tailF: 3, tele: 0, crouch: 0 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim;
  const q = POSE;
  const hurt = K.hurtOf(e);
  q.bob = Math.sin(t * 2.6) * 0.5; q.lean = 0; q.sx = 1; q.shake = 0; q.tele = 0; q.crouch = 0;
  q.fN = 0.04; q.fF = -0.04; q.hN = -0.04; q.hF = 0.04;
  q.tailDir = 2.55 + Math.sin(t * 1.4) * 0.08; q.tailAmp = 0.12; q.tailF = 3;
  if (an === 'walk') {
    const ph = t * 9, A = 0.4;
    q.fN = Math.sin(ph) * A; q.hF = Math.sin(ph) * A;            // diagonal pairs move together (trot)
    q.fF = Math.sin(ph + Math.PI) * A; q.hN = Math.sin(ph + Math.PI) * A;
    q.bob = -Math.abs(Math.cos(ph)) * 1.2;
    q.tailAmp = 0.16; q.tailF = 9;
  } else if (an === 'wind') {
    const wu = e.params?.windup ?? 0.5;
    const k = ease.outCubic(clamp((e.animT ?? e.stateT ?? 0) / wu, 0, 1));
    q.crouch = k;
    q.fN = q.fF = lerp(0.04, 0.5, k); q.hN = q.hF = lerp(-0.04, -0.55, k);
    q.lean = 0.1 * k; q.shake = Math.sin(t * 60) * 0.8 * k;
    q.tailDir = lerp(2.55, 3.35, k); q.tailAmp = 0.04; q.tailF = 30;
    q.tele = k;
  } else if (an === 'charge') {
    const ph = t * 16, A = 0.85;
    q.fN = Math.sin(ph) * A; q.fF = Math.sin(ph + 0.35) * A;      // rotary gallop: fore pair, then hind pair
    q.hN = Math.sin(ph + 2.5) * A; q.hF = Math.sin(ph + 2.85) * A;
    q.sx = 1.1; q.lean = Math.sin(ph) * 0.06; q.bob = Math.sin(ph * 2) * 1.6;
    q.tailDir = 3.05; q.tailAmp = 0.1; q.tailF = 16;
  }
  if (e.onGround === false && !(e.stun > 0)) { q.fN = q.fF = 0.8; q.hN = q.hF = -0.85; q.tailDir = 2.9; }
  if (hurt) { q.lean = -0.15; q.shake = 0; }
  return q;
}

const L0 = {};
function layout(e, q) {
  NP = 0;
  const flen = K.part('fleg')?.len ?? 22, hlen = K.part('hleg')?.len ?? 22;
  // joint height: the lower of the two leg pairs touches the ground (rigid legs: a splayed pair is shorter)
  const reach = Math.max(flen * Math.cos(Math.max(Math.abs(q.fN), Math.abs(q.fF)) * 0.6), hlen * Math.cos(Math.max(Math.abs(q.hN), Math.abs(q.hF)) * 0.6));
  const ay = -(reach + 6.2) + q.bob, ax = q.shake;
  const sx = q.sx;
  K.pivotPos('body', 'a', 'shoulder', ax, ay, q.lean, sx, 1, _j); const sX = _j[0], sY = _j[1];
  K.pivotPos('body', 'a', 'shoulder2', ax, ay, q.lean, sx, 1, _j); const s2X = _j[0], s2Y = _j[1];
  K.pivotPos('body', 'a', 'hip', ax, ay, q.lean, sx, 1, _j); const hX = _j[0], hY = _j[1];
  K.pivotPos('body', 'a', 'hip2', ax, ay, q.lean, sx, 1, _j); const h2X = _j[0], h2Y = _j[1];
  K.pivotPos('body', 'a', 'tail', ax, ay, q.lean, sx, 1, _j);
  L0.tx = _j[0]; L0.ty = _j[1];
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

function drawAll(e, q, L, rig) {
  for (let i = 0; i < NP; i++) {
    if (i === L.tailAt) {
      TW_T = e.t ?? 0; TW_A = q.tailAmp; TW_F = q.tailF;
      K.chain('tail', L.tx, L.ty, q.tailDir + q.lean, 1, K.nStrips(6), tailBend);
    }
    const p = PL[i];
    K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, 1, p.vn);
  }
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0) {
    if (!e._pcorpse && world) {
      K.begin(ctx, rig, 0); const L = layout(e, q); K.end();
      e._pcorpse = true;
      claimDebris(world, e);
      const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
      const pieces = [];
      for (let i = 0; i < NP; i++) {
        const p = PL[i];
        pieces.push({ ...p, vx: kb * 70 + K.frand(-90, 90), vy: -K.frand(120, 300) * (p.name === 'body' ? 0.7 : 1), vr: K.frand(-7, 7) * (p.name === 'body' ? 0.4 : 1) });
      }
      pieces.push({ name: 'tail', pv: 'a', x: L.tx, y: L.ty, rot: 0.3, vn: 'base', sx: 1, sy: 1, vx: K.frand(-80, 40), vy: -K.frand(100, 220), vr: K.frand(-6, 6) });
      K.spawnCorpse(world, e, rig, pieces, { life: 1.4, fade: 0.5, bounce: 0.25, dust: { n: 7, w: 24, h: 18, col: '#5a4a40' } });
    }
    if (world) return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.08 * sq, 1 - 0.08 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(26, 0.4);
  const L = layout(e, q);
  drawAll(e, q, L, rig);
  if (!o.flash) {
    const ea = 0.5 + 0.2 * Math.sin((e.t ?? 0) * 5) + q.tele * 0.5;
    K.pivotPos('body', 'a', 'eye', L.ax, L.ay, q.lean, L.sx, 1, _q); K.glow(_q[0], _q[1], 2.2 + q.tele * 2.5, '#ffb030', ea);
    K.pivotPos('body', 'a', 'eye2', L.ax, L.ay, q.lean, L.sx, 1, _q); K.glow(_q[0], _q[1], 1.6 + q.tele * 1.6, '#ffb030', ea * 0.7);
    if (q.tele > 0.5) { K.pivotPos('body', 'a', 'mouth', L.ax, L.ay, q.lean, L.sx, 1, _q); glint(ctx, _q[0] + 1, _q[1] - 2, 3 + 3 * q.tele, '#fff0d0', 0.8 * (q.tele - 0.5) / 0.5); }
  }
  K.end();
  // gallop dust (world space, per second of game time)
  if (world && o.cam && (e.anim === 'charge' || e._fx?.n)) {
    const pool = e._fx ?? (e._fx = new K.FxPool(16));
    const dt = pool.step(K.clockOf(e, world));
    if (e.anim === 'charge' && e.onGround !== false) {
      const f = e.facing < 0 ? -1 : 1;
      for (let k = pool.rate(0, K.lod() === 0 ? 8 : 16, dt); k > 0; k--) pool.add(2, e.cx - f * K.frand(8, 26), e.bottom - K.frand(0, 3), -f * K.frand(30, 90), K.frand(-50, -15), K.frand(0.35, 0.6), K.frand(3, 5), '#6a5a4a');
    }
    ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
  }
}
