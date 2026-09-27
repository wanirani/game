// T2 painted mini-puppet: 미라 (mummy). Parts: bandaged body (skull face, blue/gold shoulder cloth, glowing scarab,
// hanging flap), a stiff bandaged arm (twice: the far one darkened), a bandaged leg (twice) and the long loose bandage
// strip — the whip — bent along a bending chain and thinned at runtime.
// Driven by AI.walker (params.windup 0.62, reach 120): idle (hunched sway, arms reaching) · walk (5 rad/s stiff-legged
// shamble, body rolls, toes drag) · attack 'lash' (wind-up: the arm rears back over the head, the green eye and the
// scarab flare, glint on the hand → at params.windup the arm whips forward and the bandage unrolls ~118 px in a
// travelling wave, then falls slack) · hurt (flash, recoil) · airborne · death (the husk collapses into bandaged pieces,
// dust of old linen).
import * as K from '../enemy_kit.js';
import { atkPhase } from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { dirOf, glint, claimDebris, HP } from './_biped.js';
import { Placer } from './blood_skeleton.js';

export const spec = {
  id: 'mummy', tier: 'T2', src: 'mummy',
  bake: { outline: 0.42, deep: { arm: 0.6, leg: 0.6 }, deepTint: 'rgb(150,140,120)' },
};

const P = new Placer();
const _q = [0, 0];
let LASH = 0, LT = 0;
const Q = {};

function pose(e) {
  const t = e.t ?? 0, at = e.animT ?? 0, walk = e.anim === 'walk';
  const ph = t * 5;
  const q = Q;
  q.walk = walk; q.lean = 0.12 + (walk ? 0.05 : 0); q.bob = walk ? -Math.abs(Math.cos(ph)) * 1.6 : Math.sin(t * 1.8) * 0.6;
  q.legF = walk ? Math.sin(ph) * 0.34 : 0.06; q.legB = walk ? -Math.sin(ph) * 0.34 : -0.08;
  q.shF = 0.95 + (walk ? Math.sin(ph) * 0.12 : Math.sin(t * 1.4) * 0.06); q.shB = 0.75 - (walk ? Math.sin(ph) * 0.1 : 0);
  q.tele = 0; q.lash = 0; q.lashT = 0; q.stepX = 0;
  if (e.anim === 'attack') {
    const ap = atkPhase(at, e.params?.windup ?? 0.62, 0.12);
    const kw = ease.outCubic(ap.w), ks = ease.outCubic(ap.s);
    q.shF = ap.s <= 0 ? lerp(1.2, 3.3, kw) : lerp(3.3, 1.5, ks);
    q.lean = ap.s <= 0 ? lerp(q.lean, 0.0, kw) : lerp(0, 0.3, ks);
    q.stepX = ap.s <= 0 ? -3 * kw : lerp(-3, 5, ks);
    q.tele = ap.s <= 0 ? ap.w : 0;
    q.lash = ap.s > 0 ? clamp(1 - ap.after / 0.45, 0, 1) : 0;
    q.lashT = ap.after;
  }
  if (K.hurtOf(e)) { q.lean = -0.2; q.shF -= 0.5; q.shB -= 0.4; }
  if (e.onGround === false && !(e.stun > 0)) { q.legF = 0.5; q.legB = -0.3; }
  q.lean += K.deathK(e) * 0.5;
  return q;
}

function layout(e, q) {
  P.reset();
  const hipY = -27.5 + q.bob, sx = q.stepX;
  const tr = q.lean * 0.7;
  K.pivotPos('body', 'hip', 'shoulder', sx, hipY, tr, 1, 1, _q);
  const shx = _q[0], shy = _q[1];
  const ar = K.part('arm'), lg = K.part('leg');
  // far arm + far leg (darkened) behind the body
  P.place('arm', shx - 3, shy + 1, dirOf(q.shB) - ar.ang, 'deep');
  P.place('leg', sx - 2, hipY, dirOf(q.legB) - lg.ang, 'deep');
  P.place('leg', sx + 1, hipY, dirOf(q.legF) - lg.ang);
  P.place('body', sx, hipY, tr, 'base', 1, 1, 'hip');
  const ad = dirOf(q.shF);
  P.place('arm', shx, shy, ad - ar.ang);
  K.pivotPos('arm', 'a', 'hand', shx, shy, ad - ar.ang, 1, 1, _q);
  const hx = _q[0], hy = _q[1];
  K.pivotPos('body', 'hip', 'eye', sx, hipY, tr, 1, 1, _q);
  return { hx, hy, ex: _q[0], ey: _q[1], tr, hipY, sx };
}

/** the bandage whip: travelling wave, drooping tip (same shape as the vector drawBandageLash) */
function lashBend(u) {
  return (Math.cos(u * 9 - LT * 30) * 0.16 * u + 0.05) * (0.3 + 0.7 * LASH);
}

function die(e, world, rig) {
  e._pcorpse = true;
  claimDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => {
    const heavy = p.name === 'body';
    return [kb * 40 + K.frand(-90, 90) * (heavy ? 0.4 : 1), -K.frand(80, 280) * (heavy ? 0.5 : 1), K.frand(-6, 6) * (heavy ? 0.4 : 1)];
  }, { life: 1.6, fade: 0.55, bounce: 0.18, dust: { n: 9, w: 14, h: 36, col: '#b8a67e' } });
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
  K.shadow(16);
  const L = layout(e, q);
  P.draw();
  if (q.lash > 0) {
    // the strip unrolls from the hand: its scale grows (thickness kept constant through sy2) as the lash pays out
    LASH = q.lash; LT = q.lashT;
    const st = K.part('strip');
    const len = 118 * ease.outCubic(Math.min(1, (1 - q.lash) * 3 + 0.2)) * (0.4 + 0.6 * q.lash);
    const s = len / st.len;
    K.chain('strip', L.hx - 1, L.hy, 0.08, s, K.nStrips(9), lashBend, 1, 'base', false, 0.36 / s);
  }
  if (!o.flash) {
    K.glow(L.ex, L.ey, 2.6 + 3 * q.tele, '#40ffb0', 0.75 + 0.25 * q.tele);
    K.pivotPos('body', 'hip', 'chest', L.sx, L.hipY, L.tr, 1, 1, _q);
    K.glow(_q[0], _q[1] + 2, 5 + 4 * q.tele, '#40ffb0', 0.3 + 0.3 * q.tele);
  }
  if (q.tele > 0.4) glint(ctx, L.hx, L.hy, 6 + 5 * q.tele, '#ffe8c0', (q.tele - 0.4) / 0.6);
  K.end();
}
