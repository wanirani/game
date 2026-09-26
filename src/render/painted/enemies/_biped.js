// Shared T2 biped pose + small VFX for painted enemy puppets.
// The pose math is the SAME contract as the vector renderers (render/enemies_a.js drawSkel/drawArmor/drawHumanoid):
// it reads only the enemy's animation fields (anim, animT, t, flashT, stun, dying, params, vx/vy/onGround) so the painted
// puppet moves in lock-step with the AI's timings (wind-up → strike frame → recovery).
// Angle convention (limbs): 0 = hanging straight down, + = rotated toward the front (+x). World dir = π/2 − a.
import { clamp, lerp, ease } from '../../../core/math.js';
import { atkPhase, hurtOf, deathK } from '../enemy_kit.js';
import * as K from '../enemy_kit.js';

export const HP = Math.PI / 2;
export const dirOf = (a) => HP - a;

/**
 * o: { stride, pose:'overhead'|'axe'|'thrust'|'shovel', windup, hunch, walkLean, armSwing, legSwing, knee }
 * returns a reused pose object
 */
const P0 = {};
export function bipedPose(e, o = {}) {
  const t = e.t ?? 0, at = e.animT ?? 0, anim = e.anim, P = e.params || {};
  const hurt = hurtOf(e);
  const walking = anim === 'walk' || anim === 'run' || anim === 'chase';
  const ph = t * (o.stride ?? 9);
  const sw = walking ? Math.sin(ph) : 0, cw = walking ? Math.cos(ph) : 0;
  const br = Math.sin(t * 2.6);
  const q = P0;
  const LS = o.legSwing ?? 0.55, AS = o.armSwing ?? 0.45, KN = o.knee ?? 0.95;
  q.walking = walking; q.ph = ph; q.sw = sw; q.cw = cw; q.br = br;
  q.bob = walking ? -Math.abs(cw) * (o.bobAmp ?? 1.8) : br * 0.7;
  q.lean = (o.hunch ?? 0) + (walking ? (o.walkLean ?? 0.1) : 0.03);
  q.hipF = walking ? sw * LS : 0.14; q.hipB = walking ? -sw * LS : -0.12;
  q.knF = walking ? -Math.max(0, cw) * KN - 0.08 : -0.12; q.knB = walking ? -Math.max(0, -cw) * KN - 0.08 : -0.05;
  q.shF = walking ? -sw * AS + 0.35 : 0.35 + br * 0.04; q.elF = 0.55;
  q.shB = walking ? sw * AS + 0.1 : 0.12 - br * 0.04; q.elB = 0.45;
  q.wA = o.restWA ?? 1.9;
  q.jaw = 0.05 + Math.max(0, Math.sin(t * 7)) * 0.08;
  q.head = anim === 'idle' ? Math.sin(t * 1.3) * 0.04 : 0;
  q.trail = null; q.tele = 0; q.stepX = 0; q.swing = 0; q.hurt = hurt;
  const attacking = anim === 'attack' || anim === 'slam' || anim === 'combo';
  if (attacking && (o.pose ?? 'overhead') === 'overhead') {
    const ap = atkPhase(at, P.windup ?? o.windup ?? 0.4, 0.09);
    const kw = ease.outCubic(ap.w), ks = ease.outCubic(ap.s);
    const arm = o.weaponArm ?? 'F';
    let sh, el, wA, lean;
    if (ap.s <= 0) { sh = lerp(0.35, 3.55, kw); el = lerp(0.55, 0.65, kw); wA = lerp(1.9, 4.05, kw); lean = lerp(0.03, -0.12, kw); q.tele = ap.w; }
    else { sh = lerp(3.55, 1.05, ks); el = lerp(0.65, 0.1, ks); wA = lerp(4.05, 1.3, ks); lean = lerp(-0.12, 0.28, ks); q.stepX = (o.stepAmp ?? 4) * ks; q.trail = [4.05, wA, clamp(1 - ap.after / 0.22, 0, 1)]; }
    if (arm === 'F') { q.shF = sh; q.elF = el; } else { q.shB = sh; q.elB = el; }
    q.wA = wA; q.lean = lean + (o.hunch ?? 0) * 0.5;
    q.hipF = lerp(q.hipF, 0.45, ap.s); q.knF = lerp(q.knF, -0.4, ap.s); q.hipB = lerp(q.hipB, -0.35, ap.s);
    q.jaw = 0.25 * kw; q.swing = ap.s;
  }
  if (anim === 'jump' || (e.onGround === false && !e.def?.flying && !(e.stun > 0))) {
    q.hipF = 0.9; q.knF = -1.4; q.hipB = 0.3; q.knB = -1.2; q.shF = Math.max(q.shF, 1.6); q.shB = -0.6; q.lean = 0.1;
  }
  if (hurt) { q.lean = -0.28; q.shF += -0.6; q.shB += -0.5; q.jaw = 0.35; q.head = -0.3; }
  q.lean += deathK(e) * 0.6;
  return q;
}

/** crescent swing trail around (px,py) from limb-angle a0 to a1 (additive), local space */
export function swingTrail(ctx, px, py, a0, a1, R, width, color, alpha) {
  if (alpha <= 0.02 || Math.abs(a1 - a0) < 0.05) return;
  if (Math.abs(a1 - a0) > 2.3) a0 = a1 + Math.sign(a0 - a1) * 2.3;
  K.local();
  const t0 = HP - a0, t1 = HP - a1, N = 12, ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (let pass = 0; pass < 2; pass++) {
    const from = pass === 0 ? 0 : 0.45;
    ctx.globalAlpha = ga * alpha * (pass === 0 ? 0.32 : 0.55);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const k = from + (1 - from) * (i / N), th = t0 + (t1 - t0) * k; ctx.lineTo(px + Math.cos(th) * R, py + Math.sin(th) * R); }
    for (let i = N; i >= 0; i--) { const k = from + (1 - from) * (i / N), th = t0 + (t1 - t0) * k, r = R - width * (0.1 + 0.9 * k * k); ctx.lineTo(px + Math.cos(th) * r, py + Math.sin(th) * r); }
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
}

/** telegraph glint (4-point star + glow), local space */
export function glint(ctx, x, y, s, color = '#fff0c8', a = 1) {
  if (a <= 0.01) return;
  K.glow(x, y, s * 2.4, color, a * 0.8);
  const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
  ctx.globalAlpha = ga * clamp(a, 0, 1); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.16, y - s * 0.16); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.16, y + s * 0.16);
  ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.16, y + s * 0.16); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.16, y - s * 0.16);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
}

/** limb end point for angle a (vector convention) */
export function endOf(x, y, a, L, out) { out[0] = x + Math.sin(a) * L; out[1] = y + Math.cos(a) * L; return out; }

/**
 * Enemy.die() spawns generic vector debris for bone/metal/stone materials; a painted puppet hands its own parts to a
 * corpse instead, so the vector debris spawned on the death frame (same position, full life) is retired.
 */
export function claimDebris(world, e) {
  const L = world?.debrisList;
  if (!L) return;
  // world.spawnBones/spawnDebris scatter ±10 px around (cx, cy) with |v| ≤ 560 px/s; the painted renderer claims them on
  // the render right after the death update, so only pieces at most a couple of frames old and still next to the body
  // are this enemy's (a neighbour dying in the same frame 30+ px away keeps its own debris)
  for (const d of L) {
    const age = d.maxLife - d.life;
    if (age < 0.06 && Math.abs(d.x - e.cx) < 12 + 280 * age + d.w && Math.abs(d.y - e.cy) < 22 + 580 * age + d.h) d.life = 0;
  }
}

/**
 * 2-bone IK: shoulder (sx,sy) reaching (tx,ty) with bone lengths L1,L2; bend = +1/-1 picks the elbow side.
 * Returns [dir1, dir2] world directions (radians) of the upper and lower bone (reused array).
 */
const _ik = [0, 0];
export function ik2(sx, sy, tx, ty, L1, L2, bend = 1) {
  const dx = tx - sx, dy = ty - sy;
  const d = Math.min(Math.hypot(dx, dy), L1 + L2 - 1e-3), base = Math.atan2(dy, dx);
  const c1 = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d || 1), -1, 1);
  const a1 = Math.acos(c1);
  _ik[0] = base - bend * a1;
  const ex = sx + Math.cos(_ik[0]) * L1, ey = sy + Math.sin(_ik[0]) * L1;
  _ik[1] = Math.atan2(ty - ey, tx - ex);
  return _ik;
}
