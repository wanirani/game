// T2 painted mini-puppet: 익사체 (drowned, 34×80). Parts from the Kling parts sheet: 'body' = the side figure above the belt
// (weed-green hair, the grey drowned face with pale glowing eyes, torn blue shirt, the huge bloated corpse belly),
// 'legs' = the soaked trousers and bare feet (one piece; the shamble drags the feet through a seam-free warp), 'arm' = the
// hanging near arm, 'farm' = the clawed forearm reaching out on the far side (darkened).
// Driven by AI_B.drowned: rise (params.riseTime 1 s: climbs up out of the ground/water — clipped at the floor line, water
// spilling off) · walk (4.5 rad/s drag: body rolls, feet drag, arms reach) · idle (swaying, dripping) · spew (0.55 s windup:
// the belly swells, the torso doubles over, the head tips back, glint at the lips → 0.6 s gush of rotten water from the
// mouth; the AI's hit box is 10…10+spew px ahead at −76…−36 and its own water particles fly with it) · hurt · death.
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { dirOf, glint } from './_biped.js';
import { Placer } from './blood_skeleton.js';

export const spec = {
  id: 'drowned', tier: 'T2', src: 'drowned',
  bake: { outline: 0.4, deep: { farm: 0.55 }, deepTint: 'rgb(100,120,120)' },
};

const P = new Placer();
const _q = [0, 0], _m = [0, 0], _e = [0, 0], _b = [0, 0];
const HIP = -44.6;
const Q = {};
let SW = 0, TD = 2;
/** feet drag: the lower trousers lag behind the hips (u = 0 at the hip … 1 at the soles) */
function drag(u) { _w[0] = SW * u * u * TD; _w[1] = 0; return _w; }
const _w = [0, 0];
const LEGFX = (p, a) => K.warpY('legs', 'a', p.x, p.y, 0, 1, 1, K.nStrips(6), drag, a * p.alpha, p.vn, 3);

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = Q;
  const walk = an === 'walk', ph = t * 4.5;
  q.t = t; q.walk = walk;
  q.bob = walk ? -Math.abs(Math.sin(ph)) * 2 : Math.sin(t * 1.4) * 0.8;
  q.lean = walk ? 0.08 + Math.sin(ph * 0.5) * 0.04 : 0.02; q.sway = walk ? Math.sin(ph) * 0.05 : Math.sin(t * 1.1) * 0.03;
  q.aN = walk ? 0.5 + Math.sin(ph) * 0.25 : 0.25 + Math.sin(t * 1.3) * 0.05; q.aF = walk ? 1.0 - Math.sin(ph) * 0.2 : 0.8;
  q.drag = walk ? Math.sin(ph) * 3.5 : Math.sin(t * 1.1) * 0.6;
  q.bloat = 0; q.gush = 0; q.head = 0; q.rise = 1; q.glint = 0;
  if (an === 'spew') {
    const wu = 0.55;
    if (at < wu) { const k = ease.outCubic(clamp(at / wu, 0, 1)); q.bloat = k; q.lean = lerp(0.02, 0.4, k); q.aN = lerp(0.25, -0.2, k); q.aF = lerp(0.8, 0.3, k); q.glint = k; }
    else { q.gush = at < wu + 0.6 ? 1 : 1 - clamp((at - wu - 0.6) / 0.35, 0, 1); q.bloat = 1 - clamp((at - wu) / 0.6, 0, 1); q.lean = 0.4 - 0.1 * (1 - q.gush); q.aN = 0.1; q.aF = 0.5; }
  } else if (an === 'rise') q.rise = ease.outCubic(clamp((e.stateT ?? at) / (e.params?.riseTime ?? 1), 0, 1));
  if (K.hurtOf(e)) { q.lean = -0.2; q.aN -= 0.4; q.aF -= 0.3; }
  q.lean += K.deathK(e) * 0.5;
  return q;
}

function layout(e, q) {
  P.reset();
  const hy = HIP + q.bob, tr = q.lean + q.sway;
  K.pivotPos('body', 'hip', 'shF', 0, hy, tr, 1, 1, _q);
  const fp = K.part('farm');
  P.place('farm', _q[0], _q[1], dirOf(q.aF) - fp.ang, 'deep');
  SW = q.drag;
  P.place('legs', 0, hy, 0, 'base').fx = LEGFX;
  const bs = 1 + q.bloat * 0.08;
  P.place('body', 0, hy, tr, 'base', bs, 1 + q.bloat * 0.03, 'hip');
  K.pivotPos('body', 'hip', 'shN', 0, hy, tr, bs, 1, _q);
  const ap = K.part('arm');
  P.place('arm', _q[0], _q[1], dirOf(q.aN) - ap.ang);
  K.pivotPos('body', 'hip', 'mouth', 0, hy, tr, bs, 1, _m);
  K.pivotPos('body', 'hip', 'eye', 0, hy, tr, bs, 1, _e);
  K.pivotPos('body', 'hip', 'belly', 0, hy, tr, bs, 1, _b);
}

function die(e, world, rig) {
  e._pcorpse = true;
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => {
    const heavy = p.name === 'body' || p.name === 'legs';
    return [kb * 40 + K.frand(-90, 90) * (heavy ? 0.4 : 1), -K.frand(80, 240) * (heavy ? 0.5 : 1), K.frand(-6, 6) * (heavy ? 0.4 : 1)];
  }, { life: 1.6, fade: 0.55, bounce: 0.15, dust: { n: 14, w: 16, h: 50, col: '#8ab0a0', k: 1 } });
}

/** the gush of rotten water: a wavy ribbon from the mouth, thick at the lips, breaking into drops at the far end */
function stream(ctx, mx, my, len, k, t, flash) {
  if (flash || k <= 0) return;
  K.local();
  const ga = ctx.globalAlpha, N = 10;
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? 'rgba(210,235,225,0.55)' : 'rgba(110,150,130,0.75)';
    ctx.lineWidth = pass ? 1.4 : 5.5;
    ctx.globalAlpha = ga * k;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = i / N, x = mx + u * len, y = my + u * u * 10 + Math.sin(u * 9 - t * 30) * 2 * u - (pass ? 1.2 : 0);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = ga;
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    return;
  }
  TD = rig.td;
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.05 * sq, 1 - 0.05 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(15 * (0.3 + 0.7 * q.rise));
  layout(e, q);
  if (q.rise < 1) {
    // climbing out of the floor: everything below the floor line is hidden
    K.local();
    ctx.save(); ctx.beginPath(); ctx.rect(-60, -160, 120, 160); ctx.clip();
    ctx.translate(0, (1 - q.rise) * 82);
    K.begin(ctx, rig, K.flashK(e, o)); P.draw(); K.end();
    ctx.restore();
    if (!o.flash) {
      // the pool it climbs out of: rings spreading on the floor line
      const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 1.3;
      for (let i = 0; i < 2; i++) {
        const u = (q.t * 1.4 + i * 0.5) % 1;
        ctx.globalAlpha = ga * (1 - u) * 0.6 * (1 - q.rise * 0.6);
        ctx.beginPath(); ctx.ellipse(0, -1, 10 + u * 14, 1.6 + u * 2, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
    }
    K.begin(ctx, rig, K.flashK(e, o));
  } else P.draw();
  if (!o.flash && q.rise >= 1) {
    K.glow(_e[0], _e[1], 2.2, '#d8fff0', 0.6, 0.2);
    if (q.bloat > 0.05) K.glow(_b[0], _b[1], 8 + q.bloat * 6, '#9fd0b0', q.bloat * 0.35);
  }
  if (q.glint > 0.5) glint(ctx, _m[0] + 3, _m[1], 4 + 4 * q.glint, '#d0f0e0', (q.glint - 0.5) * 2);
  if (q.gush > 0) stream(ctx, _m[0] + 1, _m[1] + 1, (e.params?.spew ?? 150) * Math.min(1, q.gush * 1.4), q.gush, q.t, o.flash);
  K.end();
  // drips off the soaked body (render-only, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(12));
    const dt = pool.step(K.clockOf(e, world));
    const sc = (e.scale || 1) * (rig.scale ?? 1), f = e.facing < 0 ? -1 : 1;
    for (let n = pool.rate(0, (K.lod() === 0 ? 1.5 : 3) * (q.rise < 1 ? 4 : 1), dt); n > 0; n--) pool.add(1, e.cx + f * K.frand(-10, 12) * sc, e.bottom - K.frand(20, 70) * sc * q.rise, K.frand(-10, 10), K.frand(10, 40), K.frand(0.4, 0.7), 1.3 * sc, '#8ab0a0');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
