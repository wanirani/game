// T2 painted mini-puppet: 마귀 두꺼비 (frog_demon, 54×44). Parts from the Kling parts sheet: 'body' = the sitting horned toad
// (slit-pupil eye, glowing orange warts, pale belly, clawed forelegs; the folded hind leg cut out and the rump repainted),
// 'hind' = the folded hind leg (kicks out straight when it jumps), 'tongue' = the long pink tongue with the barbed tip,
// stretched out of the mouth to the AI's live tongue length. The throat sac is procedural (swells pink).
// Driven by AI_B.frog: idle (slow breathing, sac pulse, warts smoulder) · swell (0.45 s: the throat sac balloons, the body
// hunches, eye + warts flare, glint at the lips → tongue) · tongue (the tongue shoots to e.tongue px at mouth height —
// the AI's strike box starts 20 px ahead at −34 — holds, reels back, barb glint at full reach) · jump (stretched, nose up
// while rising / down while falling, hind leg kicked straight) · land (0.3 s splat squash) · hurt · death (bursts, goo).
import * as K from '../enemy_kit.js';
import { clamp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';
import { Placer } from './blood_skeleton.js';

export const spec = {
  id: 'frog_demon', tier: 'T2', src: 'frog_demon',
  bake: { outline: 0.4 },
};

const P = new Placer();
const _q = [0, 0], _m = [0, 0], _t = [0, 0], _e = [0, 0];
const WARTS = ['w1', 'w2', 'w3', 'w4', 'w5'];
let TT = 0, TK = 0;
const Q = {};
/** tongue: a travelling ripple that dies out as it straightens */
function tongueBend(u) { return Math.sin(u * 7 - TT * 40) * 0.05 * (1 - TK); }

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = Q;
  q.t = t; q.sx = 1; q.sy = 1 + Math.sin(t * 3) * 0.015; q.lift = 0; q.rot = 0; q.sac = 0.15 + Math.sin(t * 3) * 0.08;
  q.hind = 0; q.hs = 1; q.flare = 0; q.tongue = 0; q.air = false;
  if (an === 'swell') { const k = ease.outCubic(clamp(at / 0.45, 0, 1)); q.sac = 0.2 + 0.9 * k; q.sy = 1 - 0.06 * k; q.sx = 1 + 0.03 * k; q.flare = k; }
  else if (an === 'tongue') { q.sac = 0.3; q.tongue = e.tongue ?? 0; q.flare = 0.5; }
  else if (an === 'jump' || e.onGround === false) {
    q.air = true; q.sx = 0.92; q.sy = 1.08; q.lift = 4; q.hind = 0.95; q.hs = 1.25;
    q.rot = (e.vy ?? 0) < 0 ? -0.22 : 0.18;
  } else if (an === 'land') { const k = 1 - clamp(at / 0.3, 0, 1); q.sy = 1 - 0.2 * k; q.sx = 1 + 0.18 * k; q.hind = -0.1 * k; }
  if (K.hurtOf(e)) { q.rot -= 0.12; q.sy *= 0.95; }
  return q;
}

function layout(e, q) {
  P.reset();
  const y = -q.lift;
  K.pivotPos('body', 'a', 'hip', 0, y, q.rot, q.sx, q.sy, _q);
  P.place('hind', _q[0], _q[1], q.rot + q.hind, 'base', q.sx, q.sy * q.hs);
  P.place('body', 0, y, q.rot, 'base', q.sx, q.sy);
  K.pivotPos('body', 'a', 'mouth', 0, y, q.rot, q.sx, q.sy, _m);
  K.pivotPos('body', 'a', 'throat', 0, y, q.rot, q.sx, q.sy, _t);
  K.pivotPos('body', 'a', 'eye', 0, y, q.rot, q.sx, q.sy, _e);
  return y;
}

function die(e, world, rig) {
  e._pcorpse = true;
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => [kb * 40 + K.frand(-80, 80), -K.frand(80, 220), K.frand(-5, 5) * (p.name === 'body' ? 0.4 : 1)],
    { life: 1.4, fade: 0.5, bounce: 0.2, dust: { n: 14, w: 26, h: 24, col: '#8aa040', k: 1 } });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  if (!q.air) K.shadow(26, 0.45); else K.shadow(16, 0.25);
  layout(e, q);
  if (!o.flash) for (let i = 0; i < WARTS.length; i++) {
    // warts smoulder under the painted glow (behind the body so only the halo shows)
    K.pivotPos('body', 'a', WARTS[i], 0, -q.lift, q.rot, q.sx, q.sy, _q);
    K.glow(_q[0], _q[1], 5 + q.flare * 3, '#ff8a2a', 0.25 + 0.12 * Math.sin(q.t * 3 + i * 1.3) + q.flare * 0.3);
  }
  P.draw();
  // throat sac (procedural): a glossy pink bladder under the jaw
  if (q.sac > 0.12) {
    K.local();
    const r = 2 + q.sac * 7, ga = ctx.globalAlpha;
    ctx.fillStyle = o.flash ? '#ffffff' : '#c85478';
    ctx.beginPath(); ctx.ellipse(_t[0] + 1, _t[1] + r * 0.55, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    if (!o.flash) {
      ctx.fillStyle = '#ff9ab8'; ctx.globalAlpha = ga * 0.7;
      ctx.beginPath(); ctx.ellipse(_t[0] + 1 - r * 0.3, _t[1] + r * 0.3, r * 0.35, r * 0.22, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = ga;
    }
  }
  if (q.tongue > 1) {
    TT = q.t; const tp = K.part('tongue'), s = q.tongue / tp.len;
    TK = clamp(s, 0, 1);
    K.chain('tongue', _m[0] - 1, _m[1] + 1, q.rot, s, K.nStrips(8), tongueBend, 1, 'base', false, Math.min(1.8 / Math.max(s, 0.05), 20));
    if (q.tongue > (e.params?.tongue ?? 170) * 0.9) glint(ctx, _m[0] + q.tongue, _m[1], 5, '#ffd0e0', 0.8);
  }
  if (!o.flash) {
    K.glow(_e[0], _e[1], 2.5 + q.flare * 2, '#ffd040', 0.55 + 0.4 * q.flare, 0.2);
    if (q.flare > 0.5 && q.tongue <= 1) glint(ctx, _m[0] + 2, _m[1] - 1, 4 + 4 * q.flare, '#ffc0d8', (q.flare - 0.5) * 2);
  }
  K.end();
}
