// T2 painted puppet: 가고일 (gargoyle). Parts: the wingless body (crouching leap pose, horned head with the glowing
// maw, moss on the back, lava cracks), a cold-stone copy of it for the statue (desaturated, cracks put out) and the
// bat wing, drawn as a bending chain from its clawed wrist: near wing in front of the body, far wing behind (darker).
// States (AI.gargoyle): statue (idle: perched grey stone, wings folded, dead eyes — only a faint ember now and then
// betrays it) · wake (0.7 s: shudders, the stone flakes away — crossfade to the living colours — the cracks and eyes
// kindle, the wings unfold; the AI adds dust and a shard burst) · fly (9 rad/s wing beats, the tips lagging, body
// bobbing against the stroke, embers drifting from the cracks) · breath (0.6 s wind-up: rears back, the maw fills with
// fire and sparks, a glint at the jaws — the AI spits three fireballs at its peak) · swoop (0.35 s: wings flung high,
// eyes flare) → dive (wings swept back, nose along the dive vector, claws glinting) · hurt (flash, squash, recoil) ·
// death (the gargoyle crumbles: strip dissolve falling apart, stone chips and a last flare of the cracks).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'gargoyle', tier: 'T2', src: 'gargoyle',
  bake: { outline: 0.4, deep: { wing: 0.62 }, deepTint: 'rgb(150,150,164)' },
};

const _q = [0, 0], _r = [0, 0];
const PI = Math.PI;
const FOLD = PI - 1.15;                     // folded wing: drapes down along the back

let WN = 6, WB = 0;
const wingBend = (u) => WB * (0.5 + u) / WN;

const P = {};
function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = P, hurt = K.hurtOf(e);
  q.statue = an === 'statue' || an === 'idle'; q.wake = an === 'wake' ? clamp(at / 0.7, 0, 1) : q.statue ? 0 : 1;
  q.cy = -26; q.rot = 0; q.shake = 0; q.eye = 1; q.fire = 0; q.burst = 0; q.tele = 0; q.clawG = 0;
  const ph = t * 9, flap = Math.sin(ph);
  q.dir = PI + 0.15 + 0.85 * flap; q.bend = -0.3 * Math.cos(ph); q.ws = 1; q.lag = 0.35;
  q.cy = -28 + flap * 2; q.embers = 1;
  if (q.statue) {
    q.cy = -26; q.dir = FOLD; q.bend = 0.25; q.ws = 0.86; q.eye = 0; q.embers = 0; q.lag = 0.1;
  } else if (an === 'wake') {
    const k = q.wake, ke = ease.inOutQuad(k);
    q.cy = -26 - ease.inCubic(k) * 5; q.shake = Math.sin(t * 55) * 1.6 * (1 - k);
    q.dir = lerp(FOLD, PI + 0.75, ease.outBack(clamp((k - 0.35) / 0.65, 0, 1))); q.bend = lerp(0.25, -0.2, ke); q.ws = lerp(0.86, 1, ke);
    q.eye = ke; q.embers = 0;
  } else if (an === 'breath') {
    const wu = e.params?.breathWind ?? 0.6, k = clamp(at / wu, 0, 1), after = Math.max(0, at - wu);
    const sflap = Math.sin(t * 6);
    q.dir = PI + 0.35 + 0.45 * sflap; q.bend = -0.2 * Math.cos(t * 6); q.cy = -28 + sflap;
    if (after <= 0) { q.fire = ease.outCubic(k); q.rot = -0.14 * k; q.tele = k; }
    else { q.burst = clamp(1 - after / 0.35, 0, 1); q.rot = lerp(0.12, 0, clamp(after / 0.4, 0, 1)); q.fire = q.burst * 0.6; }
  } else if (an === 'swoop') {
    const k = clamp(at / 0.35, 0, 1);
    q.dir = PI + 1.05 + Math.sin(t * 40) * 0.05 * k; q.bend = 0.25; q.rot = -0.2 * ease.outCubic(k); q.tele = k; q.cy = -28;
  } else if (an === 'dive') {
    const f = e.facing < 0 ? -1 : 1, vx = (e.vx ?? 0) * f, vy = e.vy ?? 0;
    q.rot = clamp(Math.atan2(vy, Math.max(60, vx)) * 0.8, -0.3, 0.9);
    q.dir = PI - 0.4 + q.rot * 0.5 + Math.sin(t * 30) * 0.05; q.bend = 0.3; q.ws = 0.92; q.cy = -26;
    q.clawG = clamp(1 - at / 0.3, 0, 1);
  }
  if (hurt && !q.statue) { q.rot -= 0.22; q.dir += 0.4; q.shake = 0; }
  return q;
}

/** body placement + wing roots in the enemy's local frame */
const L = {};
function layout(q) {
  L.x = q.shake; L.y = q.cy; L.rot = q.rot;
  K.pivotPos('body', 'a', 'w1', L.x, L.y, L.rot, 1, 1, _q); L.w1x = _q[0]; L.w1y = _q[1];
  K.pivotPos('body', 'a', 'w2', L.x, L.y, L.rot, 1, 1, _q); L.w2x = _q[0]; L.w2y = _q[1];
  return L;
}
function wing(x, y, dir, s, bend, vn, alpha = 1) {
  WB = bend;
  K.chain('wing', x, y, dir, s, WN, wingBend, alpha, vn);
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.begin(ctx, rig, 0); layout(q); K.end();
      K.spawnDissolve(world, e, rig, [
        { name: 'wing', pv: 'a', x: L.w2x, y: L.w2y, rot: q.dir - q.lag * 0.3 - PI, sx: q.ws * 0.94, sy: q.ws * 0.94, vn: 'deep' },
        { name: 'body', pv: 'a', x: L.x, y: L.y, rot: L.rot },
        { name: 'wing', pv: 'a', x: L.w1x, y: L.w1y, rot: q.dir - PI, sx: q.ws, sy: q.ws },
      ], { life: 0.85, strips: 12, drift: 36, rise: -16, col: '#8a8480', kind: 4, n: 26, spread: 170, glow: '#ff8a2a', cy: -26 });
    }
    return;
  }
  const fl = K.flashK(e, o), sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.08 * sq, 1 - 0.08 * sq);
  K.begin(ctx, rig, fl);
  WN = K.nStrips(6);
  if (q.statue || q.wake < 1) K.shadow(24, 0.45);
  const Lq = layout(q);
  const stoneA = 1 - ease.inQuad(q.wake), liveA = q.wake >= 1 ? 1 : ease.inQuad(clamp(q.wake * 1.15, 0, 1));
  // far wing (behind), body (stone ↔ living crossfade), near wing (in front)
  wing(Lq.w2x, Lq.w2y, q.dir - q.lag * 0.3, q.ws * 0.94, q.bend * 0.8, 'deep');
  if (stoneA > 0.003) K.put('stone', 'a', Lq.x, Lq.y, Lq.rot, 1, 1, 1);
  if (liveA > 0.003) K.put('body', 'a', Lq.x, Lq.y, Lq.rot, 1, 1, liveA);
  if (stoneA > 0.003) wing(Lq.w1x, Lq.w1y, q.dir, q.ws, q.bend, 'deep', 1);
  if (liveA > 0.003) wing(Lq.w1x, Lq.w1y, q.dir, q.ws, q.bend, 'base', liveA);
  if (!o.flash) {
    // eyes, crack glow, the fire in the maw
    const ea = q.statue ? 0.18 * Math.max(0, Math.sin(t * 0.8)) ** 12 : q.eye * (0.75 + 0.15 * Math.sin(t * 5)) + q.tele * 0.3;
    K.pivotPos('body', 'a', 'eye', Lq.x, Lq.y, Lq.rot, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.4 + q.tele * 2.5, '#ff7020', ea);
    if (!q.statue) { K.pivotPos('body', 'a', 'chest', Lq.x, Lq.y, Lq.rot, 1, 1, _r); K.glow(_r[0], _r[1], 14, '#ff8a2a', (0.12 + 0.06 * Math.sin(t * 4)) * q.wake + (q.wake < 1 ? 0.3 * Math.sin(q.wake * PI) : 0)); }
    if (q.fire > 0.02) {
      K.pivotPos('body', 'a', 'jaw', Lq.x, Lq.y, Lq.rot, 1, 1, _q);
      K.glow(_q[0] - 1, _q[1] + 1, 5 + q.fire * 12, '#ff8a2a', q.fire);
      K.glow(_q[0] - 1, _q[1] + 1, 3 + q.fire * 5, '#fff0a0', q.fire * 0.85);
      if (q.tele > 0.5) glint(ctx, _q[0] + 3, _q[1], 4 + 6 * q.tele, '#ffb060', (q.tele - 0.5) * 2);
    }
    if (q.tele > 0.4 && e.anim === 'swoop') { K.pivotPos('body', 'a', 'eye', Lq.x, Lq.y, Lq.rot, 1, 1, _q); glint(ctx, _q[0], _q[1], 5, '#ffd0a0', (q.tele - 0.4) / 0.6); }
    if (q.clawG > 0) { K.pivotPos('body', 'a', 'claw', Lq.x, Lq.y, Lq.rot, 1, 1, _q); glint(ctx, _q[0] + 2, _q[1], 6, '#ffd0a0', q.clawG); }
  }
  K.end();
  // world-space render particles: embers from the cracks, stone flakes while waking, sparks from the maw
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(20));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1), lo = K.lod() === 0;
    const wx = (lx) => e.cx + f * sc * lx, wy = (ly) => e.bottom + sc * ly;
    if (q.embers) {
      K.begin(ctx, rig, 0); K.pivotPos('body', 'a', 'chest', Lq.x, Lq.y, Lq.rot, 1, 1, _r); K.end();
      for (let k = pool.rate(0, lo ? 1.5 : 3, dt); k > 0; k--) pool.add(0, wx(_r[0] + K.frand(-12, 8)), wy(_r[1] + K.frand(-6, 10)), K.frand(-10, 10), K.frand(-40, -15), K.frand(0.5, 0.9), K.frand(1.5, 2.5), '#ff8a2a');
    }
    if (e.anim === 'wake') for (let k = pool.rate(1, lo ? 12 : 24, dt); k > 0; k--) pool.add(4, wx(K.frand(-22, 22)), wy(-26 + K.frand(-20, 18)), K.frand(-80, 80), K.frand(-140, -20), K.frand(0.4, 0.7), K.frand(1.4, 2.6), '#8a8480');
    if (q.fire > 0.3) {
      K.begin(ctx, rig, 0); K.pivotPos('body', 'a', 'jaw', Lq.x, Lq.y, Lq.rot, 1, 1, _q); K.end();
      for (let k = pool.rate(2, lo ? 10 : 22, dt); k > 0; k--) pool.add(3, wx(_q[0]), wy(_q[1]), f * K.frand(20, 90), K.frand(-60, 30), K.frand(0.2, 0.4), K.frand(1, 2), '#ffb040');
    }
    ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
  }
}
