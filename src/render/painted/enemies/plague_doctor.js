// T2 painted mini-puppet: 역병 의사 (plague_doctor, 34×84). Parts from the Kling parts sheet (mirrored to face right):
// 'body' = the armless side figure (wide-brimmed hat with the red band, the bone-white beak mask with green goggles, the
// leather capelet, the long buttoned coat with the belt), 'arm' = sleeve + black glove (twice: the far one darkened),
// 'boot' = the knee boot (twice, under the coat hem), 'cane' = the brass-handled walking cane in the far hand, 'flask' =
// the green poison flask (held while throwing; two small copies hang on the belt).
// Driven by AI_B.plague: idle (leans on the cane, slow breathing, the goggles pulse) · walk (7 rad/s stiff strut, coat sways,
// the cane swings with the far arm, belt vials jingle) · throw (params.windup 0.5 s: the near arm draws a flask back over
// the head, lean back, the goggles flare, glint on the flask → release at the windup frame with a whip-forward arm and a
// green arc trail; the AI spawns the flask projectile from bottom-70 at the same frame) · hop (0.x s backstep: lean back,
// boots tucked, coat flares) · hurt (flash, recoil) · death (the coat collapses into its pieces, green miasma).
// Poison miasma seeps from under the coat all the time (render-only glow + FxPool puffs).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { dirOf, glint, swingTrail } from './_biped.js';
import { Placer, claimDeathDebris } from './blood_skeleton.js';

export const spec = {
  id: 'plague_doctor', tier: 'T2', src: 'plague_doctor',
  bake: { outline: 0.42, deep: { arm: 0.55, boot: 0.55, cane: 0.75 }, deepTint: 'rgb(120,110,140)' },
};

const P = new Placer();
const _q = [0, 0];
const Q = {};
const HIP = -49.5, BOOT = -21.8;
const LO = { shx: 0, shy: 0, hx: 0, hy: 0, ex: 0, ey: 0, hipY: 0, tr: 0 };   // layout result, reused every frame

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const walk = an === 'walk', thr = an === 'throw', hop = an === 'hop';
  const wu = e.params?.windup ?? 0.5, ph = t * 7;
  const q = Q;
  q.t = t; q.walk = walk; q.ph = ph;
  q.bob = walk ? -Math.abs(Math.sin(ph)) * 1.5 : Math.sin(t * 2) * 0.6;
  q.lean = walk ? 0.08 : 0.04; q.sway = walk ? Math.sin(ph) * 0.04 : Math.sin(t * 1.3) * 0.015;
  q.armN = walk ? 0.25 - Math.sin(ph) * 0.3 : 0.28 + Math.sin(t * 1.6) * 0.04;
  q.armF = walk ? 0.45 + Math.sin(ph) * 0.25 : 0.5;
  q.bootN = walk ? Math.sin(ph) * 0.4 : 0.05; q.bootF = walk ? -Math.sin(ph) * 0.4 : -0.08;
  q.liftN = walk ? Math.max(0, -Math.cos(ph)) * 3 : 0; q.liftF = walk ? Math.max(0, Math.cos(ph)) * 3 : 0;
  q.tele = 0; q.hold = false; q.trail = 0; q.hop = hop; q.flare = 0;
  if (thr) {
    if (at < wu) {
      const k = ease.outCubic(clamp(at / wu, 0, 1));
      q.armN = lerp(0.28, -2.5, k); q.lean = lerp(0.04, -0.12, k); q.tele = at / wu; q.hold = true;
      q.bootN = lerp(0.05, 0.25, k); q.bootF = lerp(-0.08, -0.25, k);
    } else {
      const k = ease.outCubic(clamp((at - wu) / 0.12, 0, 1));
      q.armN = lerp(-2.5, 1.7, k); q.lean = lerp(-0.12, 0.18, k);
      q.trail = clamp(1 - (at - wu) / 0.25, 0, 1);
      q.bootN = 0.3; q.bootF = -0.2;
    }
  }
  if (hop) { q.lean = -0.2; q.bob = -3; q.bootN = -0.35; q.bootF = -0.55; q.liftN = 4; q.liftF = 3; q.armN = -0.4; q.armF = 0.9; q.flare = 1; }
  if (K.hurtOf(e)) { q.lean = -0.22; q.armN -= 0.6; q.armF -= 0.3; }
  if (e.onGround === false && !hop && !(e.stun > 0)) { q.bootN = 0.3; q.bootF = -0.3; q.liftN = 3; q.liftF = 2; }
  q.lean += K.deathK(e) * 0.5;
  return q;
}

function layout(e, q) {
  P.reset();
  const hipY = HIP + q.bob, tr = q.lean + q.sway;
  K.pivotPos('body', 'hip', 'shoulder', 0, hipY, tr, 1, 1, _q);
  const shx = _q[0], shy = _q[1];
  // far side: arm with the cane, boot (darkened)
  const fb = P.bone('arm', shx - 2, shy + 1, dirOf(q.armF), 'deep');
  const fhx = fb[0], fhy = fb[1];
  const tipX = fhx + 6 + (q.walk ? Math.sin(q.ph) * 3 : 0), tipY = q.hop ? fhy + 34 : 0;
  const cn = K.part('cane');
  const cd = Math.hypot(tipX - fhx, tipY - fhy), cs = clamp(cd / cn.len, 0.8, 1.12);
  P.place('cane', fhx, fhy, Math.atan2(tipY - fhy, tipX - fhx) - cn.ang, 'deep', cs, cs, 'grip');
  const bt = K.part('boot');
  P.place('boot', -4, BOOT - q.liftF, dirOf(q.bootF) - bt.ang, 'deep');
  P.place('boot', 3, BOOT - q.liftN, dirOf(q.bootN) - bt.ang);
  // coat (+ belt vials swinging on it)
  P.place('body', 0, hipY, tr, 'base', 1 + q.flare * 0.04, 1 - q.flare * 0.03, 'hip');
  for (let i = 0; i < 2; i++) {
    K.pivotPos('body', 'hip', i ? 'v2' : 'v1', 0, hipY, tr, 1, 1, _q);
    const sw = Math.sin(q.t * 3 + i * 1.7) * 0.12 + (q.walk ? Math.sin(q.ph + i) * 0.3 : 0) - q.lean;
    P.place('flask', _q[0], _q[1], sw, 'base', i ? 0.42 : 0.5, i ? 0.42 : 0.5, 'a').noCorpse = i === 1;
  }
  // near arm (the throwing arm) in front of the coat
  const nb = P.bone('arm', shx + 1, shy, dirOf(q.armN));
  const hx = nb[0], hy = nb[1];
  if (q.hold) P.place('flask', hx, hy + 1, dirOf(q.armN) - Math.PI / 2 + 0.3, 'base', 0.9, 0.9, 'c');
  K.pivotPos('body', 'hip', 'eye', 0, hipY, tr, 1, 1, _q);
  const o = LO;
  o.shx = shx; o.shy = shy; o.hx = hx; o.hy = hy; o.ex = _q[0]; o.ey = _q[1]; o.hipY = hipY; o.tr = tr;
  return o;
}

function die(e, world, rig) {
  e._pcorpse = true;
  claimDeathDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => {
    const heavy = p.name === 'body';
    return [kb * 40 + K.frand(-90, 90) * (heavy ? 0.35 : 1), -K.frand(90, 260) * (heavy ? 0.45 : 1), K.frand(-6, 6) * (heavy ? 0.35 : 1)];
  }, { life: 1.6, fade: 0.55, bounce: 0.2, dust: { n: 12, w: 16, h: 40, col: '#7ac85a', k: 2 } });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.05 * sq, 1 - 0.05 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(15);
  // poison miasma pooling under the coat (behind the puppet)
  if (!o.flash) {
    for (let i = 0; i < 4; i++) {
      const u = (q.t * 0.5 + i * 0.25) % 1;
      K.glow(-10 + i * 7 + Math.sin(q.t + i) * 3, -4 - u * 20, 8 + u * 6, '#5aa040', 0.22 * (1 - u));
    }
  }
  const L = layout(e, q);
  P.draw();
  if (!o.flash) {
    const pk = 0.5 + 0.5 * Math.sin(q.t * 4);
    K.glow(L.ex, L.ey, 3 + pk + q.tele * 4, '#5dffb0', 0.55 + 0.25 * pk + 0.3 * q.tele, 0.2);
    if (q.hold) K.glow(L.hx, L.hy + 2, 6 + q.tele * 6, '#8aff5a', 0.35 + 0.4 * q.tele);
    if (q.trail > 0) swingTrail(ctx, L.shx, L.shy, -2.5, 1.7, 24, 9, '#8aff5a', q.trail * 0.8);
  }
  if (q.tele > 0.45) glint(ctx, L.hx, L.hy - 3, 5 + 5 * q.tele, '#e8ffc0', (q.tele - 0.45) / 0.55);
  K.end();
  // miasma puffs drifting off the coat hem (render-only, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(14));
    const dt = pool.step(K.clockOf(e, world));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    for (let n = pool.rate(0, K.lod() === 0 ? 1.2 : 2.5, dt); n > 0; n--) pool.add(2, e.cx + K.frand(-14, 14) * sc, e.bottom - K.frand(2, 10) * sc, K.frand(-10, 10), K.frand(-24, -10), K.frand(0.9, 1.5), K.frand(3, 5.5) * sc, '#6a9a4a');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
