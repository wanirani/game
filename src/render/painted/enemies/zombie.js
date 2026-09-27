// T2 painted mini-puppet: 구울 (zombie). Parts: head (skull face, lank hair, glowing eyes), torso in the torn purple shirt,
// trouser thigh (torn hem hanging over the knee), bare shin + foot, upper arm with the torn sleeve end, forearm with the
// clawed hand — on the biped FK skeleton, both arms stretched forward in the classic reaching shamble.
// States (AI.zombie → AI.walker, never attacks: contact damage only): rise (0.9 s: claws out of the ground first, the
// body is clipped by the ground line and pushed up through a dirt mound that spits clods) · walk (slow shamble 5 rad/s,
// short dragging stride, hunched, arms bobbing, head lolling) · idle (sway) · hurt (flash, squash, recoil, arms fling
// up) · airborne · death (collapses into limbs; dust and gore on the floor under each piece).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { bipedPose, dirOf, claimDebris } from './_biped.js';

export const spec = {
  id: 'zombie', tier: 'T2', src: 'zombie',
  bake: { outline: 0.42, deep: { '*': 0.64 }, deepTint: 'rgb(150,160,150)' },
};

const PL = [];
let NP = 0;
function place(name, pv, x, y, rot, vn = 'base') {
  const o = PL[NP] ?? (PL[NP] = {});
  o.name = name; o.pv = pv; o.x = x; o.y = y; o.rot = rot; o.vn = vn; o.sx = 1; o.sy = 1; NP++;
  return o;
}
const _b = [0, 0], _q = [0, 0];
function bone(name, x, y, dir, vn) {
  const p = K.part(name);
  if (!p) { _b[0] = x; _b[1] = y; return _b; }
  place(name, 'a', x, y, dir - p.ang, vn);
  _b[0] = x + Math.cos(dir) * p.len; _b[1] = y + Math.sin(dir) * p.len;
  return _b;
}

/** zombie shamble on top of the shared biped pose (arms reach forward instead of swinging) */
function pose(e) {
  const t = e.t ?? 0;
  const q = bipedPose(e, { stride: 5, hunch: 0.26, walkLean: 0.06, legSwing: 0.42, knee: 0.7, bobAmp: 2.2 });
  const walking = q.walking, ph = q.ph;
  // arms: stiff forward reach, bobbing out of step with the legs
  q.shF = 1.42 + Math.sin(ph + 0.8) * (walking ? 0.12 : 0.05) + Math.sin(t * 1.7) * 0.04;
  q.elF = 0.12 + Math.sin(ph * 0.5 + 1.3) * 0.06;
  q.shB = 1.28 + Math.sin(ph + 2.4) * (walking ? 0.12 : 0.05);
  q.elB = 0.22;
  q.head = (walking ? Math.sin(ph * 0.5) * 0.09 : Math.sin(t * 1.1) * 0.06) + 0.12;
  if (walking) { q.hipB *= 0.7; q.knB = Math.min(q.knB, -0.25); }   // the far leg drags
  q.rise = 1;
  if (e.state === 'rise' || e.anim === 'rise') {
    const k = clamp((e.stateT ?? e.animT ?? 0) / (e.params?.riseTime ?? 0.9), 0, 1);
    q.rise = ease.outCubic(k);
    // claws first: arms raised overhead, then lowering to the reach as the body clears the ground
    q.shF = lerp(2.9, q.shF, ease.inQuad(k)); q.shB = lerp(2.6, q.shB, ease.inQuad(k));
    q.elF = lerp(0.4, q.elF, k); q.lean = lerp(-0.05, q.lean, k);
  }
  if (q.hurt) { q.shF += 0.6; q.shB += 0.5; q.head = -0.25; }
  return q;
}

const L0 = {};
function layout(e, q) {
  NP = 0;
  const th = K.part('thigh'), sh = K.part('shin');
  const hipY = -((th?.len ?? 15) + (sh?.len ?? 18.5)) + q.bob, x0 = q.stepX;
  const tr = q.lean;
  K.pivotPos('torso', 'hip', 'neck', x0, hipY, tr, 1, 1, _q); const nx = _q[0], ny = _q[1];
  K.pivotPos('torso', 'hip', 'shoulder', x0, hipY, tr, 1, 1, _q); const sx = _q[0], sy = _q[1];
  K.pivotPos('torso', 'hip', 'shoulder2', x0, hipY, tr, 1, 1, _q); const s2x = _q[0], s2y = _q[1];
  // far arm (behind everything)
  let b = bone('uarm', s2x + 1.5, s2y, dirOf(q.shB), 'deep');
  bone('farm', b[0], b[1], dirOf(q.shB + q.elB), 'deep');
  // far leg, near leg (the shin under the thigh: the torn trouser hem hangs over the knee)
  b = bone('thigh', x0 - 1, hipY, dirOf(q.hipB), 'deep'); const bkx = b[0], bky = b[1];
  const i0 = NP; bone('shin', bkx, bky, dirOf(q.hipB + q.knB), 'deep'); swapLast(i0);
  b = bone('thigh', x0 + 1, hipY, dirOf(q.hipF)); const fkx = b[0], fky = b[1];
  const i1 = NP; bone('shin', fkx, fky, dirOf(q.hipF + q.knF)); swapLast(i1);
  place('torso', 'hip', x0, hipY, tr);
  const hr = tr * 0.5 + q.head;
  place('head', 'a', nx + 0.5, ny + 1, hr);
  // near arm
  b = bone('uarm', sx, sy, dirOf(q.shF));
  const ex = b[0], ey = b[1];
  bone('farm', ex, ey, dirOf(q.shF + q.elF));
  L0.nx = nx; L0.ny = ny; L0.hr = hr;
  return L0;
}
/** move the just-placed shin before its thigh (placed one slot earlier) */
function swapLast(i) {
  const a = PL[i - 1], s = PL[i];
  PL[i - 1] = s; PL[i] = a;
}

function drawAll() { for (let i = 0; i < NP; i++) { const p = PL[i]; K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, 1, p.vn); } }

function die(e, world, rig) {
  e._pcorpse = true;
  claimDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  const pieces = [];
  for (let i = 0; i < NP; i++) {
    const p = PL[i];
    const up = p.name === 'head' ? 1.3 : p.name === 'torso' ? 0.6 : 1;
    pieces.push({ ...p, vx: kb * 60 + K.frand(-100, 100), vy: -K.frand(110, 320) * up, vr: K.frand(-8, 8) * (p.name === 'torso' ? 0.4 : 1) });
  }
  K.spawnCorpse(world, e, rig, pieces, { life: 1.5, fade: 0.5, bounce: 0.22, dust: { n: 8, w: 14, h: 30, col: '#4a3a2a' } });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0) {
    if (!e._pcorpse && world) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    if (world) return;
  }
  const rising = q.rise < 1;
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  if (rising) {
    // clipped by the ground line and pushed up out of the earth (a slow wobble while it claws its way out)
    ctx.save();
    ctx.beginPath(); ctx.rect(-60, -140, 120, 140.5); ctx.clip();
    ctx.translate(Math.sin((e.t ?? 0) * 13) * (1 - q.rise) * 1.5, (1 - q.rise) * 80);
    ctx.rotate((1 - q.rise) * -0.15);
  }
  K.begin(ctx, rig, K.flashK(e, o));
  if (!rising) K.shadow(15);
  const L = layout(e, q);
  drawAll();
  if (!o.flash) {
    K.pivotPos('head', 'a', 'eye', L.nx + 0.5, L.ny + 1, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.4, '#ffd040', 0.6 + 0.15 * Math.sin((e.t ?? 0) * 4));
  }
  K.end();
  if (rising) ctx.restore();
  // dirt mound + clods while rising (clods: render particles in world space, per second of game time)
  if (rising || e._fx?.n) {
    if (rising && !o.flash) {
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * (1 - q.rise * 0.7);
      ctx.fillStyle = '#2e2218';
      ctx.beginPath(); ctx.ellipse(0, 0, 20, 5 + (1 - q.rise) * 3, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a3828';
      ctx.beginPath(); ctx.ellipse(-4, -1, 12, 3, 0.1, Math.PI, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = ga;
    }
    if (world && o.cam) {
      const pool = e._fx ?? (e._fx = new K.FxPool(16));
      const dt = pool.step(K.clockOf(e, world));
      if (rising) for (let k = pool.rate(0, 14, dt); k > 0; k--) pool.add(4, e.cx + K.frand(-14, 14), e.bottom - 2, K.frand(-80, 80), K.frand(-260, -120), K.frand(0.4, 0.7), K.frand(1.4, 2.6), '#4a3828');
      ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
    }
  }
}
