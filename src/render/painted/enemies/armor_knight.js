// T2 painted mini-puppet: 방패 갑옷 (armor_knight). Parts: cuirass (pauldrons + faulds + tabard), great helm, rerebrace
// (upper arm, reused as the cuisse), vambrace+gauntlet, greave+sabaton, longsword, tower shield, cape.
// Driven by AI.knight (walker): idle breathing, heavy 6.5 rad/s walk, overhead sword (BACK arm, behind the body like
// the vector version) with visor flare + blade glint on the wind-up and a crescent trail on the strike frame, the tower
// shield braced in front (jolts when hit — AI.knight's front block sparks come from the AI), hurt recoil + white flash,
// death collapse (armour pieces tumble and clatter, the helm rolls, cape drops).
import * as K from '../enemy_kit.js';
import { bipedPose, dirOf, swingTrail, glint, claimDebris, HP } from './_biped.js';
import { atkPhase } from '../enemy_kit.js';

export const spec = {
  id: 'armor_knight', tier: 'T2', src: 'armor_knight',
  bake: { outline: 0.42, deep: { '*': 0.62 }, deepTint: 'rgb(140,146,176)' },
};

const PL = []; let NP = 0;
function place(name, x, y, rot, vn = 'base', sx = 1, sy = 1, pv = 'a') {
  const o = PL[NP] ?? (PL[NP] = {});
  o.name = name; o.x = x; o.y = y; o.rot = rot; o.vn = vn; o.sx = sx; o.sy = sy; o.pv = pv; o.cape = false; NP++;
  return o;
}
const _q = [0, 0], _r = [0, 0];
/** limb whose painted piece is shorter than the logical bone: pivot b sits on the far joint, piece stretched `st` */
function limb(name, x, y, dir, L, vn, st = 1, sx = 1) {
  const p = K.part(name);
  const ex = x + Math.cos(dir) * L, ey = y + Math.sin(dir) * L;
  if (p) { const o = place(name, ex, ey, dir - p.ang, vn, sx, st, 'b'); o.sx = sx; }
  _r[0] = ex; _r[1] = ey;
  return _r;
}
function bone(name, x, y, dir, vn) {
  const p = K.part(name);
  if (p) place(name, x, y, dir - p.ang, vn);
  _r[0] = x + Math.cos(dir) * (p?.len ?? 0); _r[1] = y + Math.sin(dir) * (p?.len ?? 0);
  return _r;
}

let CAPE = null;
function layout(e, q) {
  NP = 0;
  const hipY = -36 + q.bob, sx0 = q.stepX;
  const tr = q.lean;                       // torso rotation about the hip
  const tp = K.part('torso');
  // joints on the cuirass
  K.pivotPos('torso', 'a', 'neck', sx0, hipY, tr, 1, 1, _q); const nx = _q[0], ny = _q[1];
  K.pivotPos('torso', 'a', 'shN', sx0, hipY, tr, 1, 1, _q); const snx = _q[0], sny = _q[1];
  K.pivotPos('torso', 'a', 'shF', sx0, hipY, tr, 1, 1, _q); const sfx = _q[0], sfy = _q[1];
  // cape hangs from behind the neck (drawn first, strip-warped in draw())
  CAPE = place('cape', nx - 5, ny + 3, tr * 0.5, 'deep', 0.62, 1);
  CAPE.cape = true;
  // back arm (sword arm, behind the body)
  let b = bone('uarm', sfx - 1, sfy + 1, dirOf(q.shB), 'deep');
  const bex = b[0], bey = b[1];
  const fp = K.part('farm'), bfr = dirOf(q.shB + q.elB) - fp.ang;
  K.pivotPos('farm', 'a', 'grip', bex, bey, bfr, 1, 1, _q);
  const gx = _q[0], gy = _q[1];
  const swp = K.part('sword');
  const hold = place('sword', gx, gy, dirOf(q.wA) - swp.ang, 'base');     // blade keeps its gleam even on the far arm
  place('farm', bex, bey, bfr, 'deep');
  // back leg
  b = limb('uarm', sx0 - 2, hipY, dirOf(q.hipB), 15, 'deep', 1.15, 1.2);
  bone('shin', b[0], b[1], dirOf(q.hipB + q.knB), 'deep');
  // cuirass
  place('torso', sx0, hipY, tr);
  // front leg
  b = limb('uarm', sx0 + 2, hipY, dirOf(q.hipF), 15, 'base', 1.15, 1.2);
  bone('shin', b[0], b[1], dirOf(q.hipF + q.knF));
  // helm
  const hr = q.lean * 0.5 + q.head * 0.7;
  place('helm', nx + 1, ny + 2, hr);
  // front arm (shield arm) + tower shield on top
  b = bone('uarm', snx, sny, dirOf(q.shF));
  const fex = b[0], fey = b[1];
  place('farm', fex, fey, dirOf(q.shF + q.elF) - fp.ang);
  let shx = 13 + sx0 * 0.4, shy = -48 + q.bob, srot = 0;
  const P = e.params || {};
  if (e.anim === 'attack') { const ap = atkPhase(e.animT ?? 0, P.windup ?? 0.62, 0.1); shx -= 4 * ap.w - 6 * ap.s; srot = -0.12 * ap.w + 0.1 * ap.s; }
  if (q.hurt) { shx -= 3; srot -= 0.15; }
  place('shield', shx, shy, srot, 'base', 0.8, 1);
  return { sfx, sfy, gx, gy, tipx: gx + Math.cos(dirOf(q.wA)) * swp.len, tipy: gy + Math.sin(dirOf(q.wA)) * swp.len, nx, ny, hr, hold };
}

function drawAll(e) {
  const t = e.t ?? 0, walk = e.anim === 'walk';
  for (let i = 0; i < NP; i++) {
    const p = PL[i];
    if (p.cape) {
      // cloth: horizontal strips, each pushed back (−x) more the lower it hangs; walk flutter + idle sway
      const sway = walk ? 1 : 0.35;
      K.strips(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, 10, 'y', (u) => {
        _q[0] = -(u * u) * (walk ? 26 : 8) - Math.sin(t * (walk ? 9 : 2.2) - u * 3) * u * 7 * sway; _q[1] = 0; return _q;
      }, 1, p.vn);
    } else K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, 1, p.vn);
  }
}

function die(e, world, rig) {
  e._pcorpse = true;
  claimDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  const pieces = [];
  for (let i = 0; i < NP; i++) {
    const p = PL[i];
    const heavy = p.name === 'torso' || p.name === 'shield';
    pieces.push({ ...p, vx: kb * 40 + K.frand(-90, 90) * (heavy ? 0.4 : 1), vy: -K.frand(80, 300) * (heavy ? 0.5 : p.name === 'helm' ? 1.3 : 1), vr: K.frand(-7, 7) * (heavy ? 0.4 : 1) });
  }
  K.spawnCorpse(world, e, rig, pieces, { life: 1.6, fade: 0.55, bounce: 0.2, dust: { n: 8, w: 18, h: 20, col: '#6a6470' } });
}

export function draw(ctx, e, world, o, rig) {
  const q = bipedPose(e, { stride: 6.5, pose: 'overhead', weaponArm: 'B', restWA: 2.2, legSwing: 0.42, armSwing: 0.3, knee: 0.8, bobAmp: 2.2, walkLean: 0.06, stepAmp: 5 });
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(20);
  const L = layout(e, q);
  drawAll(e);
  if (!o.flash) {
    // visor: red glare inside the slit, flares on the wind-up
    K.pivotPos('helm', 'a', 'eye', L.nx + 1, L.ny + 2, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 3 + 4 * q.tele, '#ff3020', 0.55 + 0.45 * q.tele + 0.1 * Math.sin((e.t ?? 0) * 5));
    if (q.trail) swingTrail(ctx, L.sfx, L.sfy, q.trail[0], q.trail[1], 15 + 14 + 36, 16, '#dfe8ff', q.trail[2]);
  }
  if (q.tele > 0.4) glint(ctx, L.tipx, L.tipy, 5 + 6 * q.tele, '#fff0c8', (q.tele - 0.4) / 0.6);
  K.end();
}
