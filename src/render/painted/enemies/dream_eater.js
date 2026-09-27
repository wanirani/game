// T3 painted floating nightmare: 꿈 삼키는 자 (dream_eater, 64×80). Parts (Kling parts sheet 2): the bloated nebula body
// (tiny stars inside, a dozen lashed eyes along the flank, stubby hoofed legs), the tusked tapir head, and the long
// star-filled trunk with the toothed sucking maw — swung through the bending chain from the snout. The flank eyes are
// pivots: they glow and pulse (flaring while it casts), violet smoke streams off the back. Damage variants by HP.
// States (AI_B.voider, animT = time in the pose): float (slow bob, trunk curling and uncurling) · cast (0.6 s: head
// rears, trunk lifts forward, the maw gathers a violet orb, every eye flares → orbs fire at 0.6) · rift (0.5 s: the
// body swells, eyes blaze, trunk points down at the floor where the rift opens) · blink (alpha fades; the body
// contracts into smoke) · claw (the trunk coils back over the head, then lashes out straight at 0.42 s = the AI's
// 86 px strike) · hurt (flash, squash, eyes clench) · death (dissolves into violet smoke and stars).
import * as K from '../enemy_kit.js';
import { swingTrail, glint, claimDebris } from './_biped.js';
import { clamp, lerp, ease } from '../../../core/math.js';

export const spec = {
  id: 'dream_eater', tier: 'T3', src: 'dream_eater',
  bake: { outline: 0.45, glow: { trunk: '#c890ff' }, damage: { body: { char: 1, holes: 4, cracks: 2, crackMinLum: 30 }, head: { char: 1, cracks: 2, crackMinLum: 40 } } },
};

const PI = Math.PI;
const _q = [0, 0];
const EYES = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9'];
let BEND = 0, CURL = 0, TT = 0, TN = 8;
const trunkBend = (u, i) => (CURL * (0.2 + u * 1.4) + Math.sin(TT * 2.2 - i * 0.7) * 0.06) * BEND;
const VAR = ['base', 'dmg1', 'dmg2'];

const Q = { bob: 0, rot: 0, sx: 1, sy: 1, head: 0, tDir: 0, curl: 0, eyes: 0, maw: 0, trail: null, tele: 0, lash: 0 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0, q = Q;
  q.bob = Math.sin(t * 1.5) * 3; q.rot = Math.sin(t * 0.9) * 0.04; q.sx = 1 + Math.sin(t * 2) * 0.02; q.sy = 1 - Math.sin(t * 2) * 0.02;
  q.head = Math.sin(t * 1.2) * 0.05; q.tDir = PI / 2 - 0.8 + Math.sin(t * 1.6) * 0.12; q.curl = 1.15 + Math.sin(t * 1.3) * 0.25;
  q.eyes = 0.35 + 0.15 * Math.sin(t * 3); q.maw = 0.2; q.trail = null; q.tele = 0; q.lash = 0;
  if (an === 'cast') {
    const k = ease.outCubic(clamp(at / 0.6, 0, 1)), fire = at > 0.6 ? clamp(1 - (at - 0.6) / 0.3, 0, 1) : 0;
    q.head = lerp(q.head, -0.3, k); q.tDir = lerp(q.tDir, -0.35, k); q.curl = lerp(q.curl, -0.2, k); q.eyes = 0.35 + 0.65 * k; q.maw = 0.2 + 0.8 * Math.max(k, fire);
  } else if (an === 'rift') {
    const k = ease.outCubic(clamp(at / 0.5, 0, 1));
    q.sx = 1 + 0.12 * k; q.sy = 1 + 0.1 * k; q.eyes = 0.35 + 0.65 * k; q.tDir = lerp(q.tDir, PI / 2 + 0.1, k); q.curl = lerp(q.curl, 0.1, k); q.head = lerp(q.head, 0.2, k);
  } else if (an === 'blink') {
    const k = clamp(at / 0.3, 0, 1);
    q.sx = 1 - 0.35 * k; q.sy = 1 + 0.2 * k; q.eyes = 1;
  } else if (an === 'claw') {
    const WU = 0.42;
    if (at < WU) { const k = ease.outCubic(at / WU); q.tDir = lerp(q.tDir, -1.9, k); q.curl = lerp(q.curl, -0.6, k); q.head = lerp(q.head, -0.25, k); q.tele = at / WU; q.eyes = 0.5 + 0.4 * k; }
    else { const s = clamp((at - WU) / 0.08, 0, 1), ks = ease.outCubic(s); q.tDir = lerp(-1.9, 0.12, ks); q.curl = lerp(-0.6, 0, ks); q.head = lerp(-0.25, 0.15, ks); q.lash = 1 - clamp((at - WU) / 0.35, 0, 1); q.trail = [-1.9, q.tDir, q.lash]; }
  }
  if (K.hurtOf(e)) { q.rot -= 0.15; q.head -= 0.3; q.eyes = 0.05; q.curl += 0.8; }
  return q;
}

const L = { bx: 0, by: 0, hx: 0, hy: 0, hr: 0, sx: 0, sy: 0, mx: 0, my: 0 };
function layout(q) {
  L.bx = -8; L.by = -43 + q.bob;   // floats: the curled trunk tip stays above the hitbox floor
  K.pivotPos('body', 'a', 'neck', L.bx, L.by, q.rot, q.sx, q.sy, _q); L.hx = _q[0]; L.hy = _q[1];
  L.hr = q.rot + q.head;
  K.pivotPos('head', 'a', 'snout', L.hx, L.hy, L.hr, 1, 1, _q); L.sx = _q[0]; L.sy = _q[1];
  // the maw: end of the bending chain (same walk as K.chain, the mouth sits at ~96 % of the a→b length)
  const tl = (K.part('trunk')?.len ?? 58) * 0.96, n = TN, st = tl / n;
  let x = L.sx, y = L.sy, d = q.tDir;
  for (let i = 0; i < n; i++) { d += trunkBend(i / n, i); x += Math.cos(d) * st; y += Math.sin(d) * st; }
  L.mx = x; L.my = y;
  return L;
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e), t = e.t ?? 0;
  TN = K.nStrips(8); TT = t; CURL = q.curl; BEND = 0.22 * 8 / TN;   // same total curl at every strip count
  const hpK = e.stats?.maxHp ? e.hp / e.stats.maxHp : 1;
  const vn = VAR[e.dying > 0 ? 2 : hpK < 0.3 ? 2 : hpK < 0.6 ? 1 : 0];
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      K.begin(ctx, rig, 0); layout(q); K.end();
      e._pcorpse = true; claimDebris(world, e);
      K.spawnDissolve(world, e, rig, [
        { name: 'body', pv: 'a', x: L.bx, y: L.by, rot: q.rot, sx: q.sx, sy: q.sy, vn },
        { name: 'head', pv: 'a', x: L.hx, y: L.hy, rot: L.hr, vn },
      ], { life: 1.1, strips: 14, drift: 50, rise: 30, col: '#b070ff', kind: 0, n: 28, spread: 150, glow: '#9a5aff', cy: -40 });
    }
    return;
  }
  const sq = K.squashK(e);
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.glow(-6, -42 + q.bob, 44 + 10 * q.eyes, '#5a2a9a', 0.3 + 0.2 * q.eyes);
  layout(q);
  const bsx = q.sx * (1 + sq * 0.08), bsy = q.sy * (1 - sq * 0.08);
  K.put('body', 'a', L.bx, L.by, q.rot, bsx, bsy, 1, vn);
  // trunk behind the head's jaw, then the head
  const tn = TN;
  if (!o.flash && (q.maw > 0.4 || q.lash > 0)) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.chain('trunk', L.sx, L.sy, q.tDir, 1.04, tn, trunkBend, 0.35 * Math.max(q.maw - 0.3, q.lash), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.chain('trunk', L.sx, L.sy, q.tDir, 1, tn, trunkBend, 1, 'base');
  K.put('head', 'a', L.hx, L.hy, L.hr, 1, 1, 1, vn);
  if (!o.flash) {
    // the flank eyes: staggered pulse, flaring with the spell
    for (let i = 0; i < EYES.length; i++) {
      K.pivotPos('body', 'a', EYES[i], L.bx, L.by, q.rot, bsx, bsy, _q);
      const a = clamp(q.eyes + 0.25 * Math.sin(t * 2.3 + i * 1.7), 0, 1);
      K.glow(_q[0], _q[1], 2 + 3 * a, '#e0a8ff', 0.4 + 0.55 * a);
    }
    K.pivotPos('head', 'a', 'eye', L.hx, L.hy, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.5 + 2 * q.eyes, '#f0c8ff', 0.6);
    if (q.maw > 0.25) { K.glow(L.mx, L.my, 6 + 14 * q.maw, '#c060ff', 0.3 + 0.6 * q.maw); K.glow(L.mx, L.my, 3 + 4 * q.maw, '#ffffff', 0.6 * q.maw, 0.2); }
    if (q.tele > 0.5) glint(ctx, L.mx, L.my, 4 + 5 * q.tele, '#f0d8ff', (q.tele - 0.5) * 2);
    if (q.trail) swingTrail(ctx, L.sx, L.sy, PI / 2 - q.trail[0], PI / 2 - q.trail[1], 56, 12, '#c8a0ff', 0.7 * q.trail[2]);
  }
  K.end();
  // violet nightmare smoke off the back, stars shed from the trunk (camera space, per-second emission)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(26));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
    K.begin(ctx, rig, 0); K.pivotPos('body', 'a', 'back', L.bx, L.by, q.rot, 1, 1, _q); K.end();
    const bx = _q[0], by = _q[1];
    for (let n = pool.rate(0, (K.lod() === 0 ? 4 : 8) + (e.anim === 'blink' ? 30 : 0), dt); n > 0; n--) pool.add(2, e.cx + f * sc * (bx + K.frand(-20, 14)), e.bottom + sc * (by + K.frand(-4, 8)), -f * K.frand(5, 25), K.frand(-40, -15), K.frand(0.8, 1.4), K.frand(5, 9), '#4a2a7a');
    for (let n = pool.rate(1, 3 + q.maw * 10, dt); n > 0; n--) pool.add(3, e.cx + f * sc * (L.mx + K.frand(-4, 4)), e.bottom + sc * (L.my + K.frand(-4, 4)), K.frand(-30, 30), K.frand(-30, 30), K.frand(0.3, 0.6), K.frand(1, 2), '#f0d8ff');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
