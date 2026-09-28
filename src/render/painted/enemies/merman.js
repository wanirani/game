// T2 painted mini-puppet: 어인 (merman, 34×80). Parts from the Kling reference: 'body' = the fish head (gaping fanged jaw,
// yellow eyes, the tall red crest), back fins and the scaled torso with the pale belly; 'arm' = the long clawed arm with
// its forearm fin (twice: the far one darkened), 'leg' = the scaled leg with the red clawed foot (twice).
// Driven by AI_B.merman: lurk (under the surface: only the red crest breaks the water, the rest is a murky shape, the
// eyes glow through, ripples and bubbles) · rise (0.5 s: the crest and head push up, ripples widen, spray) · leap / fall
// (arms flung up, legs trailing, water shed off the body) · walk / idle (hunched stalk, 8 rad/s) · spit (params.spit 0.5 s:
// rears back, the throat swells with fire light, glint at the jaw → at the windup frame the AI spits the fireball from
// bottom−66, the head thrusts forward with a muzzle flash) · hurt (flash, recoil) · death (falls apart in water spray).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { dirOf, glint } from './_biped.js';
import { Placer } from './blood_skeleton.js';

export const spec = {
  id: 'merman', tier: 'T2', src: 'merman',
  bake: { outline: 0.4, deep: { arm: 0.55, leg: 0.55 }, deepTint: 'rgb(90,130,130)' },
};

const P = new Placer();
const _q = [0, 0], _m = [0, 0], _e = [0, 0];
const HIP = -31.6;
const Q = {};

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = Q;
  q.t = t; q.an = an; q.under = an === 'lurk' || an === 'rise'; q.up = an === 'rise' ? ease.inCubic(clamp(at / 0.5, 0, 1)) : 0;
  const walk = an === 'walk', ph = t * 8;
  q.walk = walk; q.air = an === 'leap' || an === 'fall';
  q.bob = walk ? -Math.abs(Math.sin(ph)) * 2 : Math.sin(t * 2.4) * 0.8;
  q.lean = walk ? 0.1 : 0; q.aN = walk ? 0.1 + Math.sin(ph) * 0.35 : 0.05 + Math.sin(t * 1.5) * 0.04;
  q.aF = walk ? 0.1 - Math.sin(ph) * 0.35 : 0.1;
  q.lN = walk ? Math.sin(ph) * 0.45 : 0.06; q.lF = walk ? -Math.sin(ph) * 0.45 : -0.08;
  q.liftN = walk ? Math.max(0, -Math.cos(ph)) * 3 : 0; q.liftF = walk ? Math.max(0, Math.cos(ph)) * 3 : 0;
  q.cheek = 0; q.fire = 0; q.glint = 0;
  if (an === 'leap') { q.lean = -0.15; q.aN = 2.5; q.aF = 2.7; q.lN = -0.5; q.lF = -0.3; q.liftN = q.liftF = 0; }
  else if (an === 'fall') { q.lean = 0.15; q.aN = 1.6; q.aF = 1.3; q.lN = 0.5; q.lF = 0.3; q.liftN = q.liftF = 0; }
  else if (an === 'spit') {
    const wu = e.params?.spit ?? 0.5;
    if (at < wu) { q.cheek = ease.outCubic(clamp(at / wu, 0, 1)); q.lean = -0.2 * q.cheek; q.aN = 0.5 * q.cheek; q.glint = q.cheek; }
    else { const k = 1 - clamp((at - wu) / 0.4, 0, 1); q.fire = k; q.lean = lerp(0.3, -0.2, k * k); q.aN = 0.6 * k; }
  }
  if (K.hurtOf(e)) { q.lean = -0.25; q.aN += 0.5; q.aF += 0.4; }
  q.lean += K.deathK(e) * 0.5;
  return q;
}

function layout(e, q, dy) {
  P.reset();
  const hy = HIP + q.bob + dy, tr = q.lean;
  const ap = K.part('arm'), lp = K.part('leg');
  K.pivotPos('body', 'hip', 'shF', 0, hy, tr, 1, 1, _q);
  P.place('arm', _q[0], _q[1], dirOf(q.aF) - ap.ang, 'deep');
  K.pivotPos('body', 'hip', 'legF', 0, hy, tr, 1, 1, _q);
  const ground = !q.air && !q.under;
  P.place('leg', _q[0], ground ? -lp.len - q.liftF : _q[1], dirOf(q.lF) - lp.ang, 'deep');
  K.pivotPos('body', 'hip', 'legN', 0, hy, tr, 1, 1, _q);
  P.place('leg', _q[0], ground ? -lp.len - q.liftN : _q[1], dirOf(q.lN) - lp.ang);
  P.place('body', 0, hy, tr, 'base', 1 + q.cheek * 0.02, 1, 'hip');
  K.pivotPos('body', 'hip', 'shN', 0, hy, tr, 1, 1, _q);
  P.place('arm', _q[0], _q[1], dirOf(q.aN) - ap.ang);
  K.pivotPos('body', 'hip', 'mouth', 0, hy, tr, 1, 1, _m);
  K.pivotPos('body', 'hip', 'eye', 0, hy, tr, 1, 1, _e);
}

function die(e, world, rig) {
  e._pcorpse = true;
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => {
    const heavy = p.name === 'body';
    return [kb * 50 + K.frand(-100, 100) * (heavy ? 0.4 : 1), -K.frand(100, 280) * (heavy ? 0.5 : 1), K.frand(-7, 7) * (heavy ? 0.4 : 1)];
  }, { life: 1.5, fade: 0.5, bounce: 0.2, dust: { n: 12, w: 16, h: 50, col: '#8ad0ff', k: 1 } });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q, 0); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.05 * sq, 1 - 0.05 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  if (q.under) {
    // lurking below the surface (AI: box top 14 px under the water line): the crest breaks the surface, the rest is murk
    const surf = -(e.def?.size?.h ?? 80) - 14;
    K.pivotPos('body', 'hip', 'crest', 0, HIP, 0, 1, 1, _q);
    const dy = surf - _q[1] - 8 - 10 * q.up + Math.sin(q.t * 2) * 1.5 - q.bob;
    layout(e, q, dy);
    K.local();
    const gco = ctx.globalCompositeOperation;
    ctx.save(); ctx.beginPath(); ctx.rect(-80, surf - 120, 160, 120); ctx.clip(); P.draw(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(-80, surf, 160, 160); ctx.clip(); P.draw(0.22 + 0.2 * q.up); ctx.restore();
    if (!o.flash) {
      K.glow(_e[0], _e[1], 3 + 2 * q.up, '#ffe040', 0.6 + 0.4 * q.up, 0.2);
      K.local();
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1.2; ctx.strokeStyle = '#bfe8ff';
      const ga = ctx.globalAlpha;
      for (let i = 0; i < 3; i++) {
        const u = (q.t * (0.8 + q.up) + i / 3) % 1;
        ctx.globalAlpha = ga * (1 - u) * (0.4 + 0.4 * q.up);
        ctx.beginPath(); ctx.ellipse(2, surf + 2, (14 + q.up * 12) * (0.35 + u), 1.5 + u * 3, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
      for (let i = 0; i < 4; i++) { const u = (q.t * 1.3 + K.h1(i)) % 1; K.glow((K.h1(i + 2) - 0.5) * 20, surf + 28 - u * 26, 1.4, '#dff4ff', 0.6 * (1 - u), 0.5); }
    }
    K.end();
    return;
  }
  if (!q.air) K.shadow(16);
  layout(e, q, 0);
  P.draw();
  if (!o.flash) {
    K.glow(_e[0], _e[1], 2.6, '#ffe040', 0.6, 0.2);
    if (q.cheek > 0.05) K.glow(_m[0] - 4, _m[1] + 3, 6 + q.cheek * 6, '#ff8a2a', q.cheek * 0.8);
    if (q.fire > 0) { K.glow(_m[0] + 3, _m[1], 16 * q.fire + 4, '#ffb040', q.fire); K.glow(_m[0] + 3, _m[1], 6, '#fff0c0', q.fire); }
  }
  if (q.glint > 0.5) glint(ctx, _m[0] + 3, _m[1] - 3, 4 + 5 * q.glint, '#ffb060', (q.glint - 0.5) * 2);
  K.end();
  // water shed while airborne (render-only, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(16));
    const dt = pool.step(K.clockOf(e, world));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    if (q.air) for (let n = pool.rate(0, K.lod() === 0 ? 8 : 16, dt); n > 0; n--) pool.add(1, e.cx + K.frand(-14, 14) * sc, e.bottom - K.frand(10, 60) * sc, K.frand(-30, 30), K.frand(-20, 40), K.frand(0.35, 0.6), 1.5 * sc, '#a8dcff');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
