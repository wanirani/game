// T2 painted mini-puppet: 해골 기사 (skeleton_knight). Skeleton-rig variant: horned black helm over the skull, spiked
// breastplate with a separate spiked pauldron (drawn over the shield arm), tasset skirt over bare femurs, black greaves,
// crimson cape (strip-warped), longsword in the BACK arm and a black kite shield with a gold skull on the front arm.
// Driven by AI.knight (walker + front shield): idle breathing · walk (8 rad/s) · attack (overhead longsword: wind-up
// with a red visor flare and a blade glint → strike at params.windup → crescent trail, the shield swings aside) · hurt
// (flash + squash + recoil, shield jolts) · airborne · death (armour, bones, helm, sword and shield tumble and clatter).
import * as K from '../enemy_kit.js';
import { atkPhase } from '../enemy_kit.js';
import { bipedPose, dirOf, swingTrail, glint, claimDebris, HP } from './_biped.js';
import { Placer } from './blood_skeleton.js';

export const spec = {
  id: 'skeleton_knight', tier: 'T2', src: 'skeleton_knight',
  scale: 1.08,          // the cut puppet stands ≈ 82 px (horn tip → sole); logic rect / vector knight: 88 px
  bake: { outline: 0.42, deep: { '*': 0.62 }, deepTint: 'rgb(150,146,172)' },
};

const P = new Placer();
const _q = [0, 0];
let T = 0, WALK = false, TD = 2;

function cape(p, alpha) {        // cloth: strips pushed back (−x) the lower they hang; walk flutter + idle sway
  const sway = WALK ? 1 : 0.35;
  K.strips(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, K.nStrips(7), 'y', (u) => {
    _q[0] = (-(u * u) * (WALK ? 22 : 7) - Math.sin(T * (WALK ? 8 : 2.2) - u * 3) * u * 6 * sway) * TD; _q[1] = 0; return _q;
  }, alpha, p.vn);
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
  // cape from behind the neck
  const cp = P.place('cape', nx - 7, ny + 4, q.lean * 0.5, 'deep', 0.6, 1);
  cp.fx = cape;
  // back arm + longsword (behind the body, like the armour knight)
  let b = P.bone('uarm', shx - 2, shy, dirOf(q.shB), 'deep');
  const bex = b[0], bey = b[1];
  const fp = K.part('farm'), sw = K.part('sword');
  const bfr = dirOf(q.shB + q.elB) - fp.ang;
  K.pivotPos('farm', 'a', 'grip', bex, bey, bfr, 1, 1, _q);
  const gx = _q[0], gy = _q[1];
  const wd = dirOf(q.wA);
  P.place('sword', gx, gy, wd - sw.ang);          // the blade keeps its gleam on the far arm
  P.place('farm', bex, bey, bfr, 'deep');
  // legs (femur under the tasset, greave below)
  b = P.bone('thigh', sx0 - 1.5, hipY, dirOf(q.hipB), 'deep');
  P.bone('shin', b[0], b[1], dirOf(q.hipB + q.knB), 'deep');
  b = P.bone('thigh', sx0 + 1.5, hipY, dirOf(q.hipF));
  P.bone('shin', b[0], b[1], dirOf(q.hipF + q.knF));
  // breastplate (+ spine) and the tasset skirt over the thighs
  P.place('torso', lx, ly, trot);
  P.place('pelvis', sx0, hipY, pr, 'base', 1, 1, 'hip');
  // horned helm over the skull
  const hr = q.lean * 0.6 + q.head;
  P.place('head', nx, ny, hr);
  // front arm holds the kite shield up in front of the body
  const shF = q.swing > 0 || q.tele > 0 ? q.shF : 0.95, elF = q.swing > 0 || q.tele > 0 ? q.elF : 0.95;
  b = P.bone('uarm', shx + 0.5, shy, dirOf(shF));
  P.place('farm', b[0], b[1], dirOf(shF + elF) - fp.ang);
  K.pivotPos('torso', 'a', 'paul', lx, ly, trot, 1, 1, _q);
  P.place('pauldron', _q[0], _q[1], trot + (shF - 0.95) * 0.1);
  let sx = 11 + sx0 * 0.4, sy = -43 + q.bob, srot = 0.05;
  if (e.anim === 'attack') { const ap = atkPhase(e.animT ?? 0, e.params?.windup ?? 0.5, 0.09); sx -= 6 * ap.w - 2 * ap.s; srot = -0.2 * ap.w + 0.25 * ap.s; }
  if (q.hurt) { sx -= 3; srot = -0.3; }
  P.place('shield', sx, sy, srot, 'base', 1, 1, 'a');
  return { shx, shy, gx, gy, tipx: gx + Math.cos(wd) * sw.len, tipy: gy + Math.sin(wd) * sw.len, nx, ny, hr, reach: K.part('uarm').len + fp.len + sw.len };
}

function die(e, world, rig) {
  e._pcorpse = true;
  claimDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => {
    const heavy = p.name === 'torso' || p.name === 'shield' || p.name === 'pelvis';
    const up = p.name === 'head' ? 1.35 : heavy ? 0.5 : 1;
    return [kb * 50 + K.frand(-100, 100) * (heavy ? 0.5 : 1), -K.frand(100, 340) * up, K.frand(-8, 8) * (heavy ? 0.5 : 1)];
  }, { life: 1.6, fade: 0.55, bounce: 0.24, dust: { n: 8, w: 16, h: 24, col: '#8a8070' } });
}

export function draw(ctx, e, world, o, rig) {
  T = e.t ?? 0; WALK = e.anim === 'walk'; TD = rig.td;
  const q = bipedPose(e, { stride: 8, pose: 'overhead', weaponArm: 'B', restWA: 2.35, legSwing: 0.48, armSwing: 0.32, windup: e.params?.windup, stepAmp: 5 });
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(18);
  const L = layout(e, q);
  P.draw();
  if (!o.flash) {
    if (q.trail) swingTrail(ctx, L.shx, L.shy, q.trail[0], q.trail[1], L.reach, 15, '#ffb0a0', q.trail[2]);
    K.pivotPos('head', 'a', 'eye', L.nx, L.ny, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.8 + 3.5 * q.tele, '#ff3a2a', 0.55 + 0.2 * Math.sin(T * 6) + q.tele * 0.35);
  }
  if (q.tele > 0.4) glint(ctx, L.tipx, L.tipy, 5 + 6 * q.tele, '#fff0c8', (q.tele - 0.4) / 0.6);
  K.end();
}
