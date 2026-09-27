// T2 painted mini-puppet (rig reuse): 뼈 던지는 해골 (bone_thrower). The skeleton rig (same bones, loincloth recoloured
// moss green) + a bone sack on the hip and the femur it throws (1 Kling image). Driven by AI.thrower:
// idle / walk (keeps its distance) · attack = throw: the arm swings back over the shoulder with the femur in the hand
// (wind-up, telegraph glint on the bone) → release at params.windup (the femur leaves the hand exactly when the AI
// spawns the bone projectile) → follow-through with a short arc trail · hurt · airborne · death (bones collapse).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { bipedPose, swingTrail, glint } from './_biped.js';
import { layoutSkel, drawSkel, dieSkel } from './skeleton.js';
import { atkPhase } from '../enemy_kit.js';

export const spec = {
  id: 'bone_thrower', tier: 'T2', src: 'bone_thrower',
  bake: { outline: 0.42, deep: { '*': 0.66 }, deepTint: 'rgb(150,150,176)' },
};

const OPT = { weapon: 'bone', shield: false, sack: true, boneOut: false };
const _q = [0, 0];

/** biped pose + the vector 'throw' branch (drawSkel pose:'throw' in render/enemies_a.js) */
function pose(e) {
  const q = bipedPose(e, { stride: 9, pose: 'throw' });
  OPT.boneOut = false;
  if (e.anim === 'attack') {
    const wu = e.params?.windup ?? 0.42;
    const ap = atkPhase(e.animT ?? 0, wu, 0.09);
    const kw = ease.outCubic(ap.w), ks = ease.outCubic(ap.s);
    if (ap.s <= 0) { q.shF = lerp(0.35, -2.3, kw); q.elF = lerp(0.55, -0.9, kw); q.lean = lerp(0.03, -0.18, kw); q.tele = ap.w; }
    else { q.shF = lerp(-2.3, -4.55, ks); q.elF = lerp(-0.9, 0.2, ks); q.lean = lerp(-0.18, 0.22, ks); q.trail = TR; TR[0] = -2.3; TR[1] = q.shF; TR[2] = clamp(1 - ap.after / 0.2, 0, 1) * 0.7; }
    q.shB = lerp(q.shB, 1.2, kw) - ks * 0.6; q.elB = 0.8;
    q.jaw = 0.25 * kw;
    OPT.boneOut = (e.animT ?? 0) < wu + 0.02;          // same instant the vector bone disappears / the AI throws
    if (q.hurt) { q.lean = -0.28; q.shF -= 0.6; q.shB -= 0.5; }
  }
  return q;
}
const TR = [0, 0, 0];

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0) {
    if (!e._pcorpse && world) { K.begin(ctx, rig, 0); layoutSkel(e, q, OPT); K.end(); dieSkel(e, world, rig); }
    if (world) return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(15);
  const L = layoutSkel(e, q, OPT);
  drawSkel();
  if (!o.flash) {
    if (q.trail) swingTrail(ctx, L.shx, L.shy, q.trail[0], q.trail[1], 14.5 + 13.5 + 6, 8, '#ffe0a0', q.trail[2]);
    K.pivotPos('skull', 'a', 'eye', L.nx, L.ny, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.6 + 2.5 * q.tele, '#ffb030', 0.55 + 0.2 * Math.sin((e.t ?? 0) * 6) + q.tele * 0.3);
  }
  if (q.tele > 0.45 && OPT.boneOut) glint(ctx, L.gx, L.gy, 5 + 5 * q.tele, '#ffd080', (q.tele - 0.45) / 0.55);
  K.end();
}
