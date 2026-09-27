// T2 painted mini-puppet: 저주 인형 (puppet_maiden). Parts: porcelain head (golden ringlets, crimson bow, cracked face,
// one blue and one red glass eye), gothic dress body, porcelain arm (twice, the far one darkened), legs + mary-janes.
// It moves like a marionette: head and arm poses step in 1/8 s jerks, three procedural strings run up out of frame.
// Driven by AI_A.puppet: idle (jerky head tilt, dangling arms) · crouch (squashes before a hop — the jump tell) · jump
// (arms fly up on their strings, legs dangle, stretched by the vertical speed) · throw (every third landing: the near
// arm rises with three needles between the fingers, the head twitches, glint just before they fly at
// params.throwWind) · hurt (flash, head snaps back) · death (the doll comes apart: head, arms, legs and dress tumble,
// porcelain shards).
import * as K from '../enemy_kit.js';
import { clamp, ease } from '../../../core/math.js';
import { dirOf, glint, claimDebris } from './_biped.js';
import { Placer } from './blood_skeleton.js';

export const spec = {
  id: 'puppet_maiden', tier: 'T2', src: 'puppet_maiden',
  bake: { outline: 0.4, deep: { arm: 0.6 }, deepTint: 'rgb(170,160,176)' },
};

const P = new Placer();
const _q = [0, 0];
const Q = {};

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const tq = Math.floor(t * 8) / 8;                 // stepped time: marionette jerks
  const q = Q;
  q.crouch = an === 'crouch'; q.jump = an === 'jump' || (e.onGround === false && an !== 'throw'); q.thr = an === 'throw';
  q.sqy = q.crouch ? 0.8 : 1; q.sqx = q.crouch ? 1.12 : 1;
  q.head = Math.sin(tq * 2.3) * 0.25; q.armF = 0.2 + Math.sin(tq * 3) * 0.15; q.armB = -0.1 + Math.sin(tq * 2.1) * 0.1;
  q.legs = 0; q.k = 0;
  if (q.jump) {
    const vy = e.vy ?? 0;
    q.armF = 2.2 + Math.sin(t * 6) * 0.2; q.armB = 2.0 + Math.sin(t * 6 + 1) * 0.2; q.head = -0.2; q.legs = -0.18;
    q.sqy = 1 + clamp(-vy / 3000, -0.06, 0.12); q.sqx = 2 - q.sqy;
  }
  if (q.thr) {
    q.k = ease.outCubic(clamp(at / (e.params?.throwWind ?? 0.45), 0, 1));
    q.armF = 0.2 + (1.9 - 0.2) * q.k; q.head = 0.4 * Math.sin(t * 20) * q.k;
  }
  if (K.hurtOf(e)) q.head = -0.6;
  return q;
}

function layout(e, q) {
  P.reset();
  const ly = -14.3 * q.sqy;
  P.place('legs', 0, ly, q.legs, 'base', q.sqx, q.sqy);
  const bx = 0, by = ly;
  K.pivotPos('body', 'a', 'shoulder', bx, by, 0, q.sqx, q.sqy, _q); const shx = _q[0], shy = _q[1];
  K.pivotPos('body', 'a', 'neck', bx, by, 0, q.sqx, q.sqy, _q); const nx = _q[0], ny = _q[1];
  const ar = K.part('arm');
  P.place('arm', shx - 3, shy + 0.5, dirOf(-q.armB * 0.8) - ar.ang, 'deep');
  P.place('body', bx, by, 0, 'base', q.sqx, q.sqy);
  P.place('head', nx + 1, ny + 0.5, q.head);
  const ad = dirOf(q.armF);
  P.place('arm', shx, shy, ad - ar.ang);
  K.pivotPos('arm', 'a', 'hand', shx, shy, ad - ar.ang, 1, 1, _q);
  const hx = _q[0], hy = _q[1];
  K.pivotPos('head', 'a', 'top', nx + 1, ny + 0.5, q.head, 1, 1, _q);
  return { hx, hy, tx: _q[0], ty: _q[1], shx, shy, nx, ny };
}

function strings(ctx, e, L) {
  const t = e.t ?? 0;
  K.local();
  const ga = ctx.globalAlpha;
  ctx.strokeStyle = 'rgba(230,230,255,0.35)'; ctx.lineWidth = 0.7;
  const sy = -220;
  ctx.beginPath();
  ctx.moveTo(L.tx, L.ty); ctx.lineTo(Math.sin(t) * 6, sy);
  ctx.moveTo(L.shx - 3, L.shy); ctx.lineTo(-14 + Math.sin(t * 1.3) * 5, sy);
  ctx.moveTo(L.hx, L.hy); ctx.lineTo(16 + Math.sin(t * 1.1) * 5, sy);
  ctx.stroke();
  const gco = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
  const gy = -60 - ((t * 60) % 120); ctx.fillRect(Math.sin(t) * 6 * (gy / sy) - 0.5, gy, 1, 3);
  ctx.globalCompositeOperation = gco; ctx.globalAlpha = ga;
}

function die(e, world, rig) {
  e._pcorpse = true;
  claimDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => [kb * 50 + K.frand(-120, 120), -K.frand(120, 340) * (p.name === 'head' ? 1.3 : 1), K.frand(-8, 8)],
    { life: 1.5, fade: 0.5, bounce: 0.35, dust: { n: 10, w: 12, h: 30, col: '#f4efe6', k: 4 } });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  if (!q.jump) K.shadow(12);
  const L = layout(e, q);
  if (!o.flash) strings(ctx, e, L);
  P.draw();
  if (!o.flash) {
    K.pivotPos('head', 'a', 'eye', L.nx + 1, L.ny + 0.5, q.head, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.4 + q.k * 2, '#ff2030', 0.7);
    if (q.thr) {
      // three needles fanned between the fingers
      K.local();
      ctx.strokeStyle = '#d8dce8'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) { const a = i * 0.4 - 0.3; ctx.moveTo(L.hx, L.hy); ctx.lineTo(L.hx + Math.cos(a) * 9, L.hy + Math.sin(a) * 9); }
      ctx.stroke();
    }
  }
  if (q.thr && q.k > 0.5) glint(ctx, L.hx + 8, L.hy - 2, 5 + 4 * q.k, '#ffffff', (q.k - 0.5) * 2);
  K.end();
}
