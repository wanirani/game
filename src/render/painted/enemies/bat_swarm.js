// T1 instanced rig reuse: 박쥐 떼 (bat_swarm). The painted vampire bat (bat atlas: flying body + one wing, mirrored) drawn
// as a flock of up to 14 small bats sharing ONE bake with the regular bat (spec.src 'bat' → the same runtime atlas; no own
// Kling images, docs/art/ENEMY_PIPELINE.md §6). Each bat = far wing (darkened) + near wing as 3-strip bending chains
// (2 on the 'low' quality) + the body, i.e. ≤ 7 blits per bat, one texture for the whole swarm.
// The flock thins out with the HP like the vector version ("상처를 입을수록 수가 줄어든다"): a bat that drops out of
// the flock tumbles down and fades (render-only ghost, outlives nothing gameplay-side).
// States (AI_B.swarm): fly (bats orbit the centre on their own ellipses, far half darkened and smaller = depth, each bat
// banks toward its direction of travel) · gather (0.5 s wind-up: the flock contracts into a tight red-eyed knot, beat
// quickens, red glow + glint at the peak) · charge (the flock streams forward as one black wave, wings swept back,
// speed streaks behind) · hurt (flash on every bat, the flock jolts outward) · death (the flock bursts apart: every bat
// flees outward flapping and fades; render-only ghost).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { spec as BAT } from './bat.js';

export const spec = { id: 'bat_swarm', tier: 'T1', src: 'bat', bake: BAT.bake };

const PI = Math.PI, TAU = PI * 2;
const MAXN = 14;
const _q = [0, 0];
// per-bat constants (render-only, deterministic): orbit radius factors, speed, phase, size
const B = [];
for (let i = 0; i < MAXN; i++) B.push({ s: K.h1(i * 7.3), s2: K.h1(i * 3.1 + 2), ph: K.h1(i * 5.9 + 1) * TAU, fr: 17 + K.h1(i * 2.7) * 8 });

const bodyOf = (rig) => (rig.parts.fly ? 'fly' : 'body');

/** number of bats in the flock for the entity's HP (same rule as the vector renderer) */
function countOf(e) {
  const maxHp = e.stats?.maxHp ?? e.hp ?? 1;
  return Math.max(3, Math.min(MAXN, Math.ceil((e.params?.count ?? 14) * clamp((e.hp ?? maxHp) / maxHp, 0, 1))));
}

/** position/look of bat i at time t → writes into o (reused) */
const P = { x: 0, y: 0, z: 0, dir: 1, s: 1, beat: 0, sweep: 0 };
function batPose(e, i, t, cy, gk, charge, hurt) {
  const b = B[i];
  const sp = 1.6 + b.s * 1.8, a = t * sp * (i % 2 ? 1 : -1) + b.s2 * TAU;
  let rx = 34 * (0.4 + b.s * 0.6), ry = 21 * (0.4 + b.s2 * 0.6);
  rx *= 1 - gk * 0.62; ry *= 1 - gk * 0.62;
  if (hurt) { rx *= 1.12; ry *= 1.12; }
  let x = Math.cos(a) * rx, y = cy + Math.sin(a * 1.3) * ry;
  const vx = -Math.sin(a) * (i % 2 ? 1 : -1);             // orbit tangent → which way this bat is flying
  P.z = Math.sin(a);                                        // depth on the orbit: − = behind the flock
  P.dir = vx >= 0 ? 1 : -1;
  P.sweep = 0;
  if (charge) {
    // one black wave: stretched along the flight line, bats re-shuffle toward the front
    const u = (t * 2.2 + b.s * 5) % 1;
    x = (b.s - 0.5) * 70 + (u - 0.5) * 12; y = cy + (b.s2 - 0.5) * 26 + Math.sin(t * 10 + i) * 3;
    P.dir = 1; P.sweep = 1; P.z = b.s2 - 0.5;
  }
  P.x = x; P.y = y;
  P.s = (0.37 + b.s2 * 0.14) * (1 + P.z * 0.12) * (1 - gk * 0.08);
  P.beat = t * (b.fr * (1 + gk * 0.6) + (charge ? 6 : 0)) + b.ph;
  return P;
}

/** one small bat at (x,y): far wing (deep) + near wing chains + body; flipped by dir (body mirrored, wings symmetric) */
function drawOne(rig, BODY, x, y, s, beat, sweep, dir, alpha, deep, eyes) {
  const A = Math.sin(beat);
  const bob = -A * 2.2 * s;
  const tilt = dir * (sweep ? 0.35 : 0.08);
  let dirR = -0.12 - A * 0.62;
  if (sweep) dirR = -0.95 + A * 0.12;
  const bc = Math.cos(beat);
  const bend = sweep ? -0.16 : 0.2 * bc - 0.03;
  BEND = bend;
  const sx = dir * s, sy = s;
  K.pivotPos(BODY, 'a', 'wl', x, y + bob, tilt, sx, sy, _q); const lx = _q[0], ly = _q[1];
  K.pivotPos(BODY, 'a', 'wr', x, y + bob, tilt, sx, sy, _q); const rx = _q[0], ry = _q[1];
  const n = LOWQ ? 2 : 3, ws = s * WING;
  K.chain('wing', lx, ly, PI - dirR + tilt, 0.9 * ws, n, bendL, alpha, 'deep', true);
  K.chain('wing', rx, ry, dirR + tilt, ws, n, bendR, alpha, deep ? 'deep' : 'base');
  K.put(BODY, 'a', x, y + bob, tilt, sx, sy, alpha, deep ? 'deep' : 'base');
  if (eyes > 0.01) { K.pivotPos(BODY, 'a', 'eyeR', x, y + bob, tilt, sx, sy, _q); K.glow(_q[0] - dir * 2 * s, _q[1], 5 * s + 1, '#ff2a3a', eyes * alpha); }
}
let BEND = 0, LOWQ = false;
/** swarm bats read by their wings at this size: the wing is drawn 1.4× relative to the body (the regular bat is 1×) */
const WING = 1.4;
const bendR = (u) => BEND * (0.4 + u);
const bendL = (u) => -BEND * (0.4 + u);

/** dark translucent body of the flock (normal blend soft puff) */
function cloud(ctx, x, y, rx, ry, a) {
  if (a <= 0.01) return;
  K.local();
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * a;
  ctx.drawImage(K.puff('#0a0008', 0.5), x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = ga;
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const BODY = bodyOf(rig);
  const cy = -(e.def?.size?.h ?? 52) / 2;
  const n = countOf(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { e._pcorpse = true; scatter(e, world, rig, BODY, n, cy); }
    return;
  }
  // a bat dropped out of the flock (HP loss) → it tumbles down (render-only)
  if (world && e._bsN !== undefined && n < e._bsN) for (let i = n; i < e._bsN; i++) fallOne(e, world, rig, BODY, i, cy);
  e._bsN = n;
  const gather = an === 'gather', charge = an === 'charge';
  const gk = gather ? ease.outCubic(clamp(at / 0.5, 0, 1)) : 0;
  const hurt = K.hurtOf(e) > 0;
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) {
    K.glow(0, cy, 46, '#8a0a2a', 0.22 + gk * 0.35);
    cloud(ctx, 0, cy, 30 * (1 - gk * 0.4), 19 * (1 - gk * 0.4), 0.4);
  }
  const eyeA = o.flash ? 0 : gather ? 0.9 : 0.55;
  const low = LOWQ = K.lod() === 0;
  // two passes: the far half of the orbit (darkened, smaller) behind the near half
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const q = batPose(e, i, t, cy, gk, charge, hurt);
      if ((q.z < 0) !== (pass === 0)) continue;
      drawOne(rig, BODY, q.x, q.y, q.s, q.beat, q.sweep, q.dir, 1, pass === 0, low && i % 2 ? 0 : eyeA * (pass === 0 ? 0.6 : 1));
    }
  }
  if (!o.flash) {
    if (gather) { K.glow(0, cy, 22, '#ff3a5a', gk * 0.6); glint(ctx, 10, cy - 4, 4 + 6 * gk, gk > 0.5 ? (gk - 0.5) * 2 : 0); }
    if (charge) streaks(ctx, t, cy);
  }
  K.end();
}

function glint(ctx, x, y, s, a) {
  if (a <= 0.01) return;
  K.glow(x, y, s * 2.2, '#ff9aa8', a * 0.8);
  const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
  ctx.globalAlpha = ga * a; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.16, y - s * 0.16); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.16, y + s * 0.16);
  ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.16, y + s * 0.16); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.16, y - s * 0.16);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
}
/** charge: blood-red speed streaks trailing the wave (local space) */
function streaks(ctx, t, cy) {
  K.local();
  const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#ff506e'; ctx.lineWidth = 2;
  ctx.globalAlpha = ga * 0.3;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const y = cy - 14 + i * 9, x0 = -38 - ((t * 400 + i * 37) % 30); ctx.moveTo(x0, y); ctx.lineTo(x0 - 22, y); }
  ctx.stroke();
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
}

/** one bat leaving the flock: tumbles and falls while flapping weakly, fades (world.fx ghost, render-only) */
function fallOne(e, world, rig, BODY, i, cy) {
  if (!world.fx?.ghost) return;
  const q = batPose(e, i, e.t ?? 0, cy, 0, false, false);
  const ox = e.cx, oy = e.bottom, fx = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
  const x0 = q.x, y0 = q.y, s = q.s, dir = q.dir, t0 = world.time ?? 0, vx = K.frand(-40, 40), life = 0.8;
  world.fx.ghost((c) => {
    const age = (world.time ?? t0) - t0, k = clamp(age / life, 0, 1);
    if (k >= 1) return;
    c.save();
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.translate(ox, oy); c.scale(fx * sc, sc);
    K.begin(c, rig, 0);
    const x = x0 + vx * age, y = y0 + 380 * age * age;
    drawOne(rig, BODY, x, y, s * (1 - 0.3 * k), age * 30 + i, 0, dir, 1 - k, false, 0);
    K.end();
    c.restore();
  }, life + 0.05, 'front');
}

/** death: the flock bursts apart, every bat flees outward flapping hard and fades; a puff of dark mist where it was */
function scatter(e, world, rig, BODY, n, cy) {
  if (!world.fx?.ghost) return;
  const ox = e.cx, oy = e.bottom, fx = e.facing < 0 ? -1 : 1, sc = e.scale || 1, t0 = world.time ?? 0, life = 0.85;
  const S = [];
  for (let i = 0; i < n; i++) {
    const q = batPose(e, i, e.t ?? 0, cy, 0, false, false);
    const a = Math.atan2(q.y - cy, q.x) + K.frand(-0.5, 0.5), sp = K.frand(140, 260);
    S.push({ x: q.x, y: q.y, s: q.s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, dir: Math.cos(a) >= 0 ? 1 : -1, ph: K.frand(0, TAU) });
  }
  world.fx.ghost((c) => {
    const age = (world.time ?? t0) - t0, k = clamp(age / life, 0, 1);
    if (k >= 1) return;
    c.save();
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.translate(ox, oy); c.scale(fx * sc, sc);
    K.begin(c, rig, k < 0.1 ? 0.7 * (1 - k / 0.1) : 0);
    cloud(c, 0, cy, 30 + 30 * k, 19 + 20 * k, 0.45 * (1 - k));
    const fade = (1 - k) ** 0.8;
    for (const b of S) drawOne(rig, BODY, b.x + b.vx * age, b.y + b.vy * age - 40 * age * age, b.s, age * 34 + b.ph, 0, b.dir, fade, false, 0.6 * fade);
    K.glow(0, cy, 40 * (1 - k), '#ff3a5a', 0.4 * (1 - k));
    K.end();
    c.restore();
  }, life + 0.05, 'front');
}
