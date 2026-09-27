// T2 painted mini-puppet: 곡도 해골 (bone_scimitar). Skeleton-rig variant: skull under a crimson/cream turban (tail
// cloth strip-warped), ribcage, crimson sash + ragged skirt (strip-warped), bare bone legs, bone arms, TWO scimitars.
// Driven by AI_A.scimitar: idle · walk (11 rad/s, fast shuffle) · combo (0–0.26 s both blades drawn back with a glint →
// 0.30 s first cut from the front hand → 0.54 s second cut from the back hand, crescent trails on both) · hop (back-step
// jump) · hurt · death collapse (bones + cloth + both blades tumble).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { bipedPose, dirOf, swingTrail, glint, claimDebris, HP } from './_biped.js';
import { Placer } from './blood_skeleton.js';

export const spec = {
  id: 'bone_scimitar', tier: 'T2', src: 'bone_scimitar',
  bake: { outline: 0.42, deep: { '*': 0.64 }, deepTint: 'rgb(160,150,170)' },
};

const P = new Placer();
const _q = [0, 0];
let T = 0, WALK = false, TD = 2;

/** vector 'dual' pose of render/enemies_a.js drawSkel, on top of the shared biped pose */
function pose(e) {
  const q = bipedPose(e, { stride: 11, pose: 'none', stepAmp: 0, legSwing: 0.6 });
  q.wB = q.shB + q.elB + 0.5;                     // back-hand blade, roughly along the forearm
  q.trailB = null;
  if (e.anim === 'combo') {
    const at = e.animT ?? 0;
    const a1 = clamp((at - 0.26) / 0.08, 0, 1), a2 = clamp((at - 0.5) / 0.08, 0, 1);
    const k0 = ease.outCubic(clamp(at / 0.26, 0, 1));
    q.tele = at < 0.26 ? k0 : 0;
    q.shF = lerp(lerp(0.35, 3.3, k0), 0.9, ease.outCubic(a1)); q.elF = lerp(0.6, 0.1, a1);
    let shB = lerp(lerp(0.1, -1.2, k0), 3.4, a1 * 0.6); shB = lerp(shB, 1.2, ease.outCubic(a2));
    q.shB = shB; q.elB = lerp(0.4, 0.1, a2);
    q.wA = lerp(lerp(1.9, 3.9, k0), 1.2, ease.outCubic(a1));
    q.wB = lerp(lerp(q.shB + q.elB + 0.5, 3.7, a1 * 0.6), 1.3, ease.outCubic(a2));
    q.lean = 0.05 + a1 * 0.15 + a2 * 0.1 - k0 * 0.1;
    q.stepX = a1 * 3 + a2 * 3;
    q.jaw = 0.2;
    q.trail = a1 > 0 && a2 <= 0 ? [3.9, q.wA, clamp(1 - (at - 0.34) / 0.18, 0, 1)] : null;
    q.trailB = a2 > 0 ? [3.2, lerp(3.2, 1.3, ease.outCubic(a2)), clamp(1 - (at - 0.58) / 0.18, 0, 1)] : null;
    q.hipF = lerp(q.hipF, 0.45, Math.max(a1, a2)); q.knF = lerp(q.knF, -0.4, Math.max(a1, a2)); q.hipB = lerp(q.hipB, -0.35, a1);
  }
  return q;
}

function cloth(p, alpha) {       // sash / turban tail: strips hang from the pivot, stream back when walking
  const tail = p.name === 'tail';
  K.strips(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, K.nStrips(tail ? 5 : 6), 'y', (u) => {
    const w = WALK ? 1 : 0.35;
    _q[0] = (-(u * u) * (WALK ? (tail ? 10 : 8) : 2.5) - Math.sin(T * (WALK ? 8 : 2.4) - u * 3) * u * (tail ? 3 : 2.2) * w) * TD; _q[1] = 0; return _q;
  }, alpha * p.alpha, p.vn);
}

function layout(e, q) {
  P.reset();
  const hipY = -40 + q.bob, sx0 = q.stepX;
  const pr = q.lean * 0.3;
  K.pivotPos('pelvis', 'hip', 'a', sx0, hipY, pr, 1, 1, _q);
  const lx = _q[0], ly = _q[1];
  const tp = K.part('torso'), trot = (-HP + q.lean) - tp.ang;
  K.pivotPos('torso', 'a', 'shoulder', lx, ly, trot, 1, 1, _q); const shx = _q[0], shy = _q[1];
  K.pivotPos('torso', 'a', 'neck', lx, ly, trot, 1, 1, _q); const nx = _q[0], ny = _q[1];
  const hr = q.lean * 0.6 + q.head;
  // turban tail (behind everything)
  K.pivotPos('skull', 'a', 'tail', nx, ny, hr, 1, 1, _q);
  const tl = P.place('tail', _q[0], _q[1], hr * 0.4 + 0.05, 'deep');
  tl.fx = cloth;
  // back arm + back scimitar
  let b = P.bone('uarm', shx - 1.5, shy, dirOf(q.shB), 'deep');
  const bex = b[0], bey = b[1];
  const fp = K.part('farm'), sp = K.part('scim');
  const bfr = dirOf(q.shB + q.elB) - fp.ang;
  K.pivotPos('farm', 'a', 'grip', bex, bey, bfr, 1, 1, _q);
  const bgx = _q[0], bgy = _q[1];
  P.place('scim', bgx, bgy, dirOf(q.wB) - sp.ang, 'deep');
  P.place('farm', bex, bey, bfr, 'deep');
  // back leg
  b = P.bone('thigh', sx0 - 1.5, hipY, dirOf(q.hipB), 'deep');
  P.bone('shin', b[0], b[1], dirOf(q.hipB + q.knB), 'deep');
  // front leg
  b = P.bone('thigh', sx0 + 1.5, hipY, dirOf(q.hipF));
  P.bone('shin', b[0], b[1], dirOf(q.hipF + q.knF));
  // ribcage, sash + skirt over the thighs
  P.place('torso', lx, ly, trot);
  const sa = P.place('pelvis', sx0, hipY, pr, 'base', 1, 1, 'hip');
  sa.fx = cloth;
  // skull + jaw
  P.place('skull', nx, ny, hr);
  K.pivotPos('skull', 'a', 'jaw', nx, ny, hr, 1, 1, _q);
  P.place('jaw', _q[0], _q[1], hr + q.jaw * 0.9);
  // front arm + scimitar
  b = P.bone('uarm', shx + 0.5, shy, dirOf(q.shF));
  const fex = b[0], fey = b[1];
  const ffr = dirOf(q.shF + q.elF) - fp.ang;
  K.pivotPos('farm', 'a', 'grip', fex, fey, ffr, 1, 1, _q);
  const gx = _q[0], gy = _q[1];
  P.place('scim', gx, gy, dirOf(q.wA) - sp.ang);
  P.place('farm', fex, fey, ffr);
  const L = K.part('uarm').len + fp.len + sp.len;
  return { shx, shy, gx, gy, tipx: gx + Math.cos(dirOf(q.wA)) * sp.len, tipy: gy + Math.sin(dirOf(q.wA)) * sp.len, nx, ny, hr, reach: L };
}

function die(e, world, rig) {
  e._pcorpse = true;
  claimDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => {
    const up = p.name === 'skull' ? 1.4 : p.name === 'scim' ? 0.7 : 1;
    return [kb * 60 + K.frand(-120, 120), -K.frand(120, 380) * up, K.frand(-9, 9)];
  }, { life: 1.5, fade: 0.5, bounce: 0.3, dust: { n: 7, w: 14, h: 26, col: '#c8b898' } });
}

export function draw(ctx, e, world, o, rig) {
  T = e.t ?? 0; WALK = e.anim === 'walk'; TD = rig.td;
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(15);
  const L = layout(e, q);
  P.draw();
  if (!o.flash) {
    if (q.trail) swingTrail(ctx, L.shx, L.shy, q.trail[0], q.trail[1], L.reach, 12, '#ffe0a0', q.trail[2]);
    if (q.trailB) swingTrail(ctx, L.shx - 2, L.shy, q.trailB[0], q.trailB[1], L.reach - 4, 11, '#ffd070', q.trailB[2]);
    K.pivotPos('skull', 'a', 'eye', L.nx, L.ny, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.6 + 2.5 * q.tele, '#ffcc40', 0.55 + 0.2 * Math.sin(T * 6) + q.tele * 0.3);
  }
  if (q.tele > 0.45) glint(ctx, L.tipx, L.tipy, 5 + 5 * q.tele, '#ffe8b0', (q.tele - 0.45) / 0.55);
  K.end();
}
