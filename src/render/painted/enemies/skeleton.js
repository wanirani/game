// T2 painted mini-puppet: 해골 병사 (skeleton). 10 parts (skull, jaw, ribcage, pelvis+loincloth, thigh, shin+foot,
// upper arm, forearm+hand, sabre, buckler) on the biped FK skeleton driven by AI.walker's anim/animT/windup.
// States: idle (breathing, jaw chatter) · walk (9 rad/s stride) · attack (overhead wind-up → strike frame at
// params.windup → recovery, swing trail + telegraph glint) · hurt (flash + squash + recoil) · airborne/knockback ·
// death (collapse: every posed bone becomes a tumbling corpse piece, skull bounces, bone dust).
import * as K from '../enemy_kit.js';
import { bipedPose, dirOf, swingTrail, glint, claimDebris, HP } from './_biped.js';

export const spec = {
  id: 'skeleton', tier: 'T2', src: 'skeleton',
  bake: { outline: 0.42, deep: { '*': 0.66 }, deepTint: 'rgb(150,150,176)' },
};

const PL = [];          // placements (reused): {name, x, y, rot, sx, sy, vn}
let NP = 0;
function place(name, x, y, rot, vn = 'base', sx = 1, sy = 1, pv = 'a') {
  const o = PL[NP] ?? (PL[NP] = {});
  o.name = name; o.x = x; o.y = y; o.rot = rot; o.vn = vn; o.sx = sx; o.sy = sy; o.pv = pv; NP++;
  return o;
}
const _b = [0, 0], _q = [0, 0];
/** place a bone with pivot a at (x,y) pointing along world dir; returns its b pivot */
function bone(name, x, y, dir, vn) {
  const p = K.part(name);
  if (!p) { _b[0] = x; _b[1] = y; return _b; }
  const rot = dir - p.ang;
  place(name, x, y, rot, vn);
  _b[0] = x + Math.cos(dir) * p.len; _b[1] = y + Math.sin(dir) * p.len;
  return _b;
}

function layout(e, q) {
  NP = 0;
  const hipY = -40 + q.bob;
  const sx0 = q.stepX;
  // back leg
  let b = bone('thigh', sx0 - 1.5, hipY, dirOf(q.hipB), 'deep');
  const bkx = b[0], bky = b[1];
  bone('shin', bkx, bky, dirOf(q.hipB + q.knB), 'deep');
  // pelvis + loincloth: its hip socket sits on the hip joint, tilts a little with the torso
  const pr = q.lean * 0.35;
  place('pelvis', sx0, hipY, pr, 'base', 1, 1, 'hip');
  K.pivotPos('pelvis', 'hip', 'a', sx0, hipY, pr, 1, 1, _q);
  const lx = _q[0], ly = _q[1];
  // ribcage from the lumbar joint, leaning
  const tDir = -HP + q.lean;
  const tp = K.part('torso'), trot = tDir - tp.ang;
  K.pivotPos('torso', 'a', 'shoulder', lx, ly, trot, 1, 1, _q);
  const shx = _q[0], shy = _q[1];
  K.pivotPos('torso', 'a', 'neck', lx, ly, trot, 1, 1, _q);
  const nx = _q[0], ny = _q[1];
  // back arm + buckler (behind the ribcage: shows through the rib gaps)
  b = bone('uarm', shx - 1.5, shy, dirOf(q.shB), 'deep');
  const bex = b[0], bey = b[1];
  const fp = K.part('farm'), bfr = dirOf(q.shB + q.elB) - fp.ang;
  place('farm', bex, bey, bfr, 'deep');
  K.pivotPos('farm', 'a', 'grip', bex, bey, bfr, 1, 1, _q);
  place('shield', _q[0] + 1, _q[1] - 2, 0.12 + q.shB * 0.15, 'deep', 0.6, 1);
  place('torso', lx, ly, trot);
  // front leg
  b = bone('thigh', sx0 + 1.5, hipY, dirOf(q.hipF));
  bone('shin', b[0], b[1], dirOf(q.hipF + q.knF));
  // skull + hinged jaw
  const hr = q.lean * 0.6 + q.head;
  place('skull', nx, ny, hr);
  K.pivotPos('skull', 'a', 'jaw', nx, ny, hr, 1, 1, _q);
  place('jaw', _q[0], _q[1], hr + q.jaw * 0.9);
  // front arm + sabre (sabre first so the finger bones wrap the grip)
  b = bone('uarm', shx + 0.5, shy, dirOf(q.shF));
  const fex = b[0], fey = b[1];
  const ffr = dirOf(q.shF + q.elF) - fp.ang;
  K.pivotPos('farm', 'a', 'grip', fex, fey, ffr, 1, 1, _q);
  const gx = _q[0], gy = _q[1];
  const swp = K.part('sword');
  place('sword', gx, gy, dirOf(q.wA) - swp.ang);
  place('farm', fex, fey, ffr);
  return { shx, shy, gx, gy, tipx: gx + Math.cos(dirOf(q.wA)) * swp.len, tipy: gy + Math.sin(dirOf(q.wA)) * swp.len, nx, ny };
}

function drawPlacements(alpha = 1) {
  for (let i = 0; i < NP; i++) { const p = PL[i]; K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, alpha, p.vn); }
}

function die(e, world, rig) {
  e._pcorpse = true;
  claimDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  const pieces = [];
  for (let i = 0; i < NP; i++) {
    const p = PL[i];
    const up = p.name === 'skull' ? 1.4 : p.name === 'sword' || p.name === 'shield' ? 0.6 : 1;
    pieces.push({ ...p, vx: kb * 60 + K.frand(-110, 110), vy: -K.frand(120, 380) * up, vr: K.frand(-9, 9) });
  }
  K.spawnCorpse(world, e, rig, pieces, { life: 1.5, fade: 0.5, bounce: 0.32, dust: { n: 7, w: 14, h: 30, col: '#c8b898' } });
}

export function draw(ctx, e, world, o, rig) {
  const q = bipedPose(e, { stride: 9, pose: 'overhead', windup: e.params?.windup, stepAmp: 4 });
  if (e.dying > 0) {
    // the corpse (world.fx 'back' layer) takes over; the entity itself stays invisible while dying
    if (!e._pcorpse && world) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    if (world) return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(15);
  const L = layout(e, q);
  drawPlacements();
  // swing trail (crescent from the shoulder) + telegraph glint on the blade tip
  if (q.trail && !o.flash) swingTrail(ctx, L.shx, L.shy, q.trail[0], q.trail[1], 14.5 + 13.5 + 20, 13, '#e8f0ff', q.trail[2]);
  if (q.tele > 0.45) glint(ctx, L.tipx, L.tipy, 5 + 5 * q.tele, '#ffe8b0', (q.tele - 0.45) / 0.55);
  // eye embers
  if (!o.flash) {
    const p = K.part('skull');
    K.pivotPos('skull', 'a', 'eye', L.nx, L.ny, q.lean * 0.6 + q.head, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.6 + (q.tele > 0 ? 2.5 * q.tele : 0), '#ff3a2a', 0.5 + 0.2 * Math.sin((e.t ?? 0) * 6) + q.tele * 0.3);
    void p;
  }
  K.end();
}
