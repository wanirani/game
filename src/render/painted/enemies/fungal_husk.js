// T2 painted walker: 균사 망자 (fungal_husk, 34×84). Parts (Kling parts sheet 2, side + back views): the bare skull
// with its drooling jaw and a glowing spore bead, the torso in the torn vest with the clump of little mushrooms on its
// back, one long grey arm (shoulder to claws, x2 — the far arm darkened), one trouser leg with the bare foot (x2), and
// the huge spotted mushroom cap with glowing gills that grows out of the skull (from the back view).
// States (AI_D.husk = AI.zombie → AI.walker): rise (0.9 s: clipped by the ground line and pushed up through a mound,
// claws first, the cap pops out last) · walk (stiff-legged shamble, arms stretched forward, the cap wobbling) · idle
// (sway, cap nodding) · attack (walker windup 0.35 s: both arms rear up, then rake down at the 56 px strike, lean in)
// · hurt (flash, recoil, cap tips back) · death (the cap pops off, the body folds; spores puff — the swell warning and
// the cloud itself are the AI's zone, drawn by ZONE_D.spore_swell / spore_cloud).
import * as K from '../enemy_kit.js';
import { dirOf, glint, claimDebris } from './_biped.js';
import { clamp, lerp, ease } from '../../../core/math.js';

export const spec = {
  id: 'fungal_husk', tier: 'T2', src: 'fungal_husk',
  bake: { outline: 0.42, deep: { arm: 0.6, leg: 0.6 }, deepTint: 'rgb(120,130,110)' },
};

const _q = [0, 0], _p = [0, 0];
let TD = 2.4;
const Q = { hipN: 0, hipF: 0, lean: 0, bob: 0, armN: 0, armF: 0, head: 0, cap: 0, rise: 1, tele: 0, swipe: 0 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0, q = Q;
  const walk = an === 'walk', ph = t * 5.2, sw = walk ? Math.sin(ph) : 0, cw = walk ? Math.cos(ph) : 0;
  q.hipN = walk ? sw * 0.36 : 0.05; q.hipF = walk ? -sw * 0.3 : -0.04;
  q.lean = walk ? 0.13 : 0.06 + Math.sin(t * 1.1) * 0.03;
  q.bob = walk ? -Math.abs(cw) * 2 : Math.sin(t * 1.6) * 0.6;
  q.armN = 1.38 + Math.sin(ph + 0.8) * (walk ? 0.1 : 0.04) + Math.sin(t * 1.7) * 0.03;
  q.armF = 1.25 + Math.sin(ph + 2.4) * (walk ? 0.1 : 0.04);
  q.head = (walk ? Math.sin(ph * 0.5) * 0.08 : Math.sin(t * 1.2) * 0.05) + 0.06;
  q.cap = Math.sin(t * 2.3) * 0.05 + (walk ? Math.sin(ph) * 0.06 : 0);
  q.rise = 1; q.tele = 0; q.swipe = 0;
  if (an === 'attack') {
    const wu = e.params?.windup ?? 0.35;
    if (at < wu) { const k = ease.outCubic(at / wu); q.armN = lerp(q.armN, 2.55, k); q.armF = lerp(q.armF, 2.35, k); q.lean = lerp(q.lean, -0.1, k); q.head = lerp(q.head, -0.2, k); q.tele = at / wu; }
    else {
      const s = ease.outCubic(clamp((at - wu) / 0.1, 0, 1)), r = clamp((at - wu - 0.12) / 0.23, 0, 1);
      q.armN = lerp(lerp(2.55, 0.75, s), 1.38, r); q.armF = lerp(lerp(2.35, 0.95, s), 1.25, r);
      q.lean = lerp(lerp(-0.1, 0.3, s), 0.12, r); q.head = lerp(-0.2, 0.25, s) * (1 - r); q.swipe = s * (1 - r);
      q.hipN = lerp(q.hipN, 0.3, s * (1 - r));
    }
  }
  if (e.state === 'rise' || an === 'rise') {
    const k = clamp((e.stateT ?? at) / (e.params?.riseTime ?? 0.9), 0, 1);
    q.rise = ease.outCubic(k);
    q.armN = lerp(2.85, q.armN, ease.inQuad(k)); q.armF = lerp(2.6, q.armF, ease.inQuad(k)); q.lean = lerp(-0.05, q.lean, k);
  }
  if (K.hurtOf(e)) { q.lean -= 0.25; q.head -= 0.3; q.cap -= 0.25; q.armN += 0.4; q.armF += 0.3; }
  q.lean += K.deathK(e) * 0.5;
  return q;
}

/** vertical drop hip → sole for a one-piece leg swung by limb angle a */
function legDrop(a) {
  const p = K.part('leg'), d = dirOf(a), rot = d - p.ang, s = p.piv.sole, b = p.piv.b;
  const lx = (s[0] - b[0]) / TD, ly = (s[1] - b[1]) / TD;
  return Math.sin(d) * p.len + Math.sin(rot) * lx + Math.cos(rot) * ly;
}
const L = { hy: 0, rot: 0, sN: [0, 0], sF: [0, 0], nx: 0, ny: 0, hr: 0, cx: 0, cy: 0, cr: 0, handN: [0, 0] };
function layout(q) {
  L.hy = -Math.max(legDrop(q.hipN), legDrop(q.hipF)) + q.bob * 0.5; L.rot = q.lean;
  K.pivotPos('torso', 'hip', 'shoulder', 0, L.hy, L.rot, 1, 1, L.sN);
  K.pivotPos('torso', 'hip', 'shoulder2', 0, L.hy, L.rot, 1, 1, L.sF);
  K.pivotPos('torso', 'hip', 'neck', 0, L.hy, L.rot, 1, 1, _q); L.nx = _q[0]; L.ny = _q[1];
  L.hr = L.rot * 0.5 + q.head;
  K.pivotPos('head', 'a', 'top', L.nx, L.ny, L.hr, 1, 1, _q); L.cx = _q[0]; L.cy = _q[1] + 2.5; L.cr = L.hr * 0.6 + q.cap;
  const arm = K.part('arm'), d = dirOf(q.armN);
  L.handN[0] = L.sN[0] + Math.cos(d) * arm.len; L.handN[1] = L.sN[1] + Math.sin(d) * arm.len;
  return L;
}
function figure(q, vn) {
  K.bone('arm', L.sF[0], L.sF[1], dirOf(q.armF), 1, 'deep');
  K.bone('leg', -1, L.hy, dirOf(q.hipF), 1, 'deep');
  K.bone('leg', 1, L.hy, dirOf(q.hipN), 1, vn);
  K.put('torso', 'hip', 0, L.hy, L.rot, 1, 1, 1, vn);
  K.put('cap', 'a', L.cx, L.cy, L.cr, 1, 1, 1, vn);
  K.put('head', 'a', L.nx, L.ny, L.hr, 1, 1, 1, vn);
  K.bone('arm', L.sN[0], L.sN[1], dirOf(q.armN), 1, vn);
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e), t = e.t ?? 0;
  TD = rig.td;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      K.begin(ctx, rig, 0); layout(q); K.end();
      e._pcorpse = true; claimDebris(world, e);
      const arm = rig.parts.arm, leg = rig.parts.leg;   // (K.part is only valid between begin/end)
      const pc = (name, pv, x, y, rot, vx, vy, vr, vn = 'base') => ({ name, pv, x, y, rot, vn, vx, vy, vr });
      K.spawnCorpse(world, e, rig, [
        pc('arm', 'a', L.sF[0], L.sF[1], dirOf(q.armF) - arm.ang, K.frand(-60, 60), -K.frand(60, 160), K.frand(-6, 6), 'deep'),
        pc('leg', 'a', -1, L.hy, dirOf(q.hipF) - leg.ang, K.frand(-30, 30), -K.frand(40, 100), K.frand(-3, 3), 'deep'),
        pc('leg', 'a', 1, L.hy, dirOf(q.hipN) - leg.ang, K.frand(-30, 30), -K.frand(40, 100), K.frand(-3, 3)),
        pc('torso', 'hip', 0, L.hy, L.rot, K.frand(-40, 40), -K.frand(60, 140), K.frand(-3, 3)),
        pc('head', 'a', L.nx, L.ny, L.hr, K.frand(-60, 60), -K.frand(160, 260), K.frand(-7, 7)),
        pc('cap', 'a', L.cx, L.cy, L.cr, K.frand(-50, 50), -K.frand(260, 360), K.frand(-4, 4)),
        pc('arm', 'a', L.sN[0], L.sN[1], dirOf(q.armN) - arm.ang, K.frand(-90, 90), -K.frand(80, 200), K.frand(-7, 7)),
      ], { life: 1.6, fade: 0.55, bounce: 0.22, dust: { n: 12, w: 18, h: 40, col: '#b8d860', k: 0 } });
    }
    return;
  }
  const rising = q.rise < 1;
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  if (rising) {
    ctx.save();
    ctx.beginPath(); ctx.rect(-80, -160, 160, 160.5); ctx.clip();
    ctx.translate(Math.sin(t * 13) * (1 - q.rise) * 1.5, (1 - q.rise) * 104);
    ctx.rotate((1 - q.rise) * -0.12);
  }
  K.begin(ctx, rig, K.flashK(e, o));
  layout(q);
  if (!rising) K.shadow(15);
  figure(q, 'base');
  if (!o.flash) {
    // glowing gills, the eye socket ember and the spore bead on the jaw
    K.pivotPos('cap', 'a', 'gill', L.cx, L.cy, L.cr, 1, 1, _p);
    K.glow(_p[0], _p[1], 14 + 2 * Math.sin(t * 2.6), '#e8f070', 0.35);
    K.pivotPos('head', 'a', 'eye', L.nx, L.ny, L.hr, 1, 1, _p); K.glow(_p[0], _p[1], 2.2, '#f4ff9a', 0.7);
    K.pivotPos('head', 'a', 'drop', L.nx, L.ny, L.hr, 1, 1, _p); K.glow(_p[0], _p[1], 2.5 + Math.sin(t * 5) * 0.6, '#f0ff60', 0.8);
    if (q.tele > 0.5) glint(ctx, L.handN[0], L.handN[1], 3 + 4 * q.tele, '#f0ffb0', (q.tele - 0.5) * 2);
    if (q.swipe > 0.05) K.glow(L.handN[0], L.handN[1], 10, '#d8f080', 0.35 * q.swipe);
  }
  K.end();
  if (rising) {
    ctx.restore();
    if (!o.flash) {
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * (1 - q.rise * 0.7);
      ctx.fillStyle = '#2e2418';
      ctx.beginPath(); ctx.ellipse(0, 0, 22, 5 + (1 - q.rise) * 3, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a6a2a';
      ctx.beginPath(); ctx.ellipse(-3, -1, 13, 3, 0.1, Math.PI, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = ga;
    }
  }
  // spores drifting down off the gills; clods while rising (camera space)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(18));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
    if (!rising) for (let n = pool.rate(0, K.lod() === 0 ? 1.2 : 3, dt); n > 0; n--) pool.add(0, e.cx + f * sc * (L.cx + K.frand(-14, 14)), e.bottom + sc * (L.cy + K.frand(0, 6)), K.frand(-10, 10), K.frand(8, 26), K.frand(0.8, 1.5), K.frand(1.2, 2), '#e8f070');
    else for (let n = pool.rate(1, 14, dt); n > 0; n--) pool.add(4, e.cx + K.frand(-16, 16) * sc, e.bottom - 2, K.frand(-70, 70), -K.frand(120, 260), K.frand(0.4, 0.7), K.frand(1.5, 3), '#3a2c1c');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
