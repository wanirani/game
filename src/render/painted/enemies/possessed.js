// T2 painted mini-puppet: 빙의된 주민 (possessed). Parts: head under the battered straw hat (skull grin, violet eyes),
// vest torso, upper arm in the rolled linen sleeve, bare forearm + hand, thigh, shin + boot, and the long pitchfork —
// on the biped FK skeleton. The front hand holds the fork, the back hand reaches the shaft by IK.
// States (AI.walker, pose 'fork' of the vector renderer): idle / walk (fork carried slanted up, slight stagger) · attack
// (wind-up 0.55 s: the fork is drawn back to the chest — the tines glint, the eyes flare — then the thrust at
// params.windup: arms shoot forward, step in, violet thrust smear to the AI's 100 px strike reach, recovery) · hurt ·
// airborne · death (the villager collapses: limbs, hat and fork tumble). Violet possession smoke rises from the
// shoulders (render particles, per second of game time).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { bipedPose, dirOf, claimDebris, glint, ik2 } from './_biped.js';
import { atkPhase } from '../enemy_kit.js';

export const spec = {
  id: 'possessed', tier: 'T2', src: 'possessed',
  scale: 1.12,              // the cut puppet stands 71 px: sized to the 80 px logic rect
  bake: { outline: 0.4, deep: { '*': 0.64 }, deepTint: 'rgb(160,150,170)' },
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
function swapLast(i) { const a = PL[i - 1]; PL[i - 1] = PL[i]; PL[i] = a; }

function pose(e) {
  const t = e.t ?? 0, at = e.animT ?? 0, P = e.params || {};
  const q = bipedPose(e, { stride: 7, pose: 'fork', hunch: 0.1, walkLean: 0.08, legSwing: 0.45, knee: 0.6 });
  q.fork = -0.55 + Math.sin(t * 2.1) * 0.03 + (q.walking ? Math.sin(q.ph) * 0.06 : 0);
  q.shF = 0.45 + (q.walking ? Math.sin(q.ph) * 0.1 : 0); q.elF = 0.9;
  q.smear = 0;
  if (e.anim === 'attack') {
    const ap = atkPhase(at, P.windup ?? 0.55, 0.08);
    const kw = ease.outCubic(ap.w), ks = ease.outBack(ap.s);
    q.shF = ap.s <= 0 ? lerp(0.45, 0.1, kw) : lerp(0.1, 1.25, ks);
    q.elF = ap.s <= 0 ? lerp(0.9, 1.5, kw) : lerp(1.5, 0.3, ks);
    q.lean = ap.s <= 0 ? lerp(q.lean, -0.12, kw) : lerp(-0.12, 0.3, ks);
    q.stepX = ap.s <= 0 ? -4 * kw : lerp(-4, 8, ks);
    q.fork = lerp(q.fork, 0.02, Math.min(1, kw * 1.4));
    q.tele = ap.s <= 0 ? ap.w : 0; q.jaw = 0.4 * kw;
    q.smear = ap.s > 0 ? clamp(1 - ap.after / 0.22, 0, 1) : 0;
    if (q.hurt) { q.lean = -0.28; q.shF -= 0.5; }
  }
  return q;
}

const L0 = {};
const EYES = [['eye', 2.4], ['eye2', 1.8]];   // [pivot, glow radius] (hoisted: no per-frame allocation)
const TS = 1.3;          // the painted vest piece is the front half of the torso (its arm was cut away): widened a little
function layout(e, q) {
  NP = 0;
  const th = K.part('thigh'), sh = K.part('shin');
  const hipY = -((th?.len ?? 16) + (sh?.len ?? 19)) + q.bob, x0 = q.stepX, tr = q.lean;
  K.pivotPos('torso', 'hip', 'neck', x0, hipY, tr, TS, 1, _q); const nx = _q[0], ny = _q[1];
  K.pivotPos('torso', 'hip', 'shoulder', x0, hipY, tr, TS, 1, _q); const sx = _q[0], sy = _q[1];
  K.pivotPos('torso', 'hip', 'shoulder2', x0, hipY, tr, TS, 1, _q); const s2x = _q[0], s2y = _q[1];
  // front arm FK → hand; the fork's grip sits in that hand
  const ua = K.part('uarm'), fa = K.part('farm');
  const ex = sx + Math.cos(dirOf(q.shF)) * (ua?.len ?? 15), ey = sy + Math.sin(dirOf(q.shF)) * (ua?.len ?? 15);
  K.pivotPos('farm', 'a', 'grip', ex, ey, dirOf(q.shF + q.elF) - (fa?.ang ?? 0), 1, 1, _q); const hx = _q[0], hy = _q[1];
  const fp = K.part('fork');
  const frot = q.fork - (fp?.ang ?? 0);
  // the back hand holds the shaft further back (IK)
  K.pivotPos('fork', 'grip', 'grip2', hx, hy, q.fork, 1, 1, _q); const g2x = _q[0], g2y = _q[1];
  const ik = ik2(s2x + 1, s2y, g2x, g2y, ua?.len ?? 15, (fa?.len ?? 9) + 3, -1);
  const d1 = ik[0], d2 = ik[1];
  let b = bone('uarm', s2x + 1, s2y, d1, 'deep');
  bone('farm', b[0], b[1], d2, 'deep');
  b = bone('thigh', x0 - 1, hipY, dirOf(q.hipB), 'deep'); const bkx = b[0], bky = b[1];
  let i = NP; bone('shin', bkx, bky, dirOf(q.hipB + q.knB), 'deep'); swapLast(i);
  b = bone('thigh', x0 + 1, hipY, dirOf(q.hipF)); const fkx = b[0], fky = b[1];
  i = NP; bone('shin', fkx, fky, dirOf(q.hipF + q.knF)); swapLast(i);
  place('torso', 'hip', x0, hipY, tr).sx = TS;
  const hr = tr * 0.5 + q.head * 0.6 - q.jaw * 0.15;
  place('head', 'a', nx + 0.4, ny + 0.8, hr);
  place('fork', 'grip', hx, hy, q.fork);
  bone('uarm', sx, sy, dirOf(q.shF));
  bone('farm', ex, ey, dirOf(q.shF + q.elF));
  K.pivotPos('fork', 'grip', 'tip', hx, hy, q.fork, 1, 1, _q);
  L0.tipx = _q[0]; L0.tipy = _q[1]; L0.hx = hx; L0.hy = hy;
  L0.nx = nx + 0.4; L0.ny = ny + 0.8; L0.hr = hr; L0.sx = sx; L0.sy = sy;
  void frot;
  return L0;
}

function drawAll() { for (let i = 0; i < NP; i++) { const p = PL[i]; K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, 1, p.vn); } }

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0) {
    if (!e._pcorpse && world) {
      K.begin(ctx, rig, 0); layout(e, q); K.end();
      e._pcorpse = true; claimDebris(world, e);
      const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
      const pieces = [];
      for (let k = 0; k < NP; k++) {
        const p = PL[k];
        const up = p.name === 'head' ? 1.4 : p.name === 'fork' ? 0.5 : p.name === 'torso' ? 0.6 : 1;
        pieces.push({ ...p, vx: kb * 60 + K.frand(-100, 100), vy: -K.frand(110, 320) * up, vr: K.frand(-8, 8) * (p.name === 'fork' ? 0.3 : 1) });
      }
      K.spawnCorpse(world, e, rig, pieces, { life: 1.5, fade: 0.5, bounce: 0.25, dust: { n: 7, w: 14, h: 30, col: '#5a4a3a' } });
    }
    if (world) return;
  }
  const t = e.t ?? 0;
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(14);
  const L = layout(e, q);
  drawAll();
  if (!o.flash) {
    // thrust smear (to the AI's strike reach), tine glint on the wind-up, violet eyes
    if (q.smear > 0) {
      K.local();
      const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * q.smear * 0.6; ctx.fillStyle = '#e0c0ff';
      const c = Math.cos(q.fork), s = Math.sin(q.fork), tx = L.tipx, ty = L.tipy, reach = Math.max(8, 92 / (rig.scale ?? 1) - tx);
      ctx.beginPath(); ctx.moveTo(tx - c * 26 - s * 4, ty - s * 26 + c * 4); ctx.lineTo(tx + c * reach, ty + s * reach); ctx.lineTo(tx - c * 26 + s * 4, ty - s * 26 - c * 4); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
    }
    if (q.tele > 0.45) glint(ctx, L.tipx - 2, L.tipy, 3 + 4 * q.tele, '#e8c8ff', 0.85 * (q.tele - 0.45) / 0.55);
    for (const [pn, r] of EYES) {
      K.pivotPos('head', 'a', pn, L.nx, L.ny, L.hr, 1, 1, _q);
      K.glow(_q[0], _q[1], r + q.tele * 2, '#c060ff', 0.7 + 0.2 * Math.sin(t * 5) + q.tele * 0.3);
    }
  }
  K.end();
  // violet possession smoke from the shoulders (world space)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(14));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    for (let k = pool.rate(0, K.lod() === 0 ? 4 : 7, dt); k > 0; k--) pool.add(0, e.cx + f * sc * (L.sx + K.frand(-5, 3)), e.bottom + sc * (L.sy - 2), K.frand(-10, 10), K.frand(-40, -18), K.frand(0.7, 1.2), K.frand(4, 7), '#8a3aff');
    ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
  }
}
