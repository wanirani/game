// T2 painted puppet: 뼈 천사 (bone_angel). A fallen angel of the desecrated chapel: ivory skeleton with gilded cracks
// (skull with the cracked golden halo, ribcage + spine, pelvis with the gold-sashed temple rags and dangling bony feet),
// two feathered bone wings (the far one darkened), a vertebra bone lance with the glowing blade, and the arm that holds it.
// Rig: skull / torso / lower (rags: seam-free warpY cloth — they stream back against the motion and flutter) placed
// from the torso pivots; wings rotate about the back of the shoulders with a foreshortening squash on the stroke; the arm is
// two rigid bones (upper arm + forearm with the open hand) with the lance gripped in the palm.
// States (AI_B.angel, anims 'fly' 'raise' 'aim' 'dive'): fly (slow wingbeat, bob, lance slanted down at the player) ·
// raise (0.55 s: wings sweep high, the lance is raised aloft, the halo blazes and a glint flares — the bone-feather rain
// leaves at 0.55 s) · aim (0.5 s: the body tilts toward the player along e.aimA, the lance is couched and trembles, the
// blade glints) · dive (wings swept back, body pitched along the dive, lance leading, holy dust streak) · climb ('fly') ·
// hurt (flash, squash, recoil, bone chips) · airborne always · death (the bones come apart and fall: skull, ribcage,
// rags, wings, lance, arm as tumbling corpse pieces, ivory dust).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';
import { claimDeathDebris } from './skeleton.js';

export const spec = {
  id: 'bone_angel', tier: 'T2', src: 'bone_angel',
  bake: {
    outline: 0.4, deep: { wing: 0.62 }, deepTint: 'rgb(150,140,118)',
    glow: { lance: '#ffe9a0', skull: '#ffd86a' },
  },
};

const RAISE = 0.55, AIM = 0.5;
const GOLD = '#ffd86a';
const _q = [0, 0], _w = [0, 0];
const PL = [];
let NP = 0;
function place(name, pv, x, y, rot, vn = 'base', sx = 1, sy = 1, kind = 0) {
  const o = PL[NP] ?? (PL[NP] = {});
  o.name = name; o.pv = pv; o.x = x; o.y = y; o.rot = rot; o.vn = vn; o.sx = sx; o.sy = sy; o.kind = kind; NP++;
  return o;
}

const POSE = { lift: 0, wsy: 1, rot: 0, bob: 0, lean: 0, dU: 1.35, dF: 0.55, dL: 0.55, rk: 0, ak: 0, dive: 0, trail: 4, tremble: 0 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? e.stateT ?? 0;
  const q = POSE;
  const flap = Math.sin(t * 3.5);
  q.lift = flap; q.wsy = 0.76 + 0.24 * Math.abs(flap); q.rot = 0; q.lean = 0; q.rk = 0; q.ak = 0; q.dive = 0; q.tremble = 0;
  q.bob = Math.sin(t * 1.8) * 2 - flap * 1.4;
  q.dU = 1.3 + Math.sin(t * 1.8) * 0.04; q.dF = 0.55; q.dL = 0.62 + Math.sin(t * 1.8) * 0.04;
  q.trail = 4 + Math.min(12, Math.hypot(e.vx ?? 0, e.vy ?? 0) * 0.02);
  let la = e.aimA !== undefined ? (e.facing >= 0 ? e.aimA : Math.PI - e.aimA) : 0.6;
  la = Math.atan2(Math.sin(la), Math.cos(la));
  if (an === 'raise') {
    const k = ease.outCubic(clamp(at / RAISE, 0, 1));
    q.rk = k; q.lift = lerp(flap, 1.3, k); q.wsy = lerp(q.wsy, 1, k);
    q.dU = lerp(q.dU, -1.25, k); q.dF = lerp(q.dF, -1.45, k); q.dL = lerp(q.dL, -1.52, k); q.lean = -0.08 * k;
    if (at > RAISE) q.lift = 1.3 - clamp((at - RAISE) / 0.3, 0, 1) * 1.1;          // the downbeat that throws the feathers
  } else if (an === 'aim') {
    const k = clamp(at / AIM, 0, 1);
    q.ak = k; q.tremble = Math.sin(t * 40) * 0.025 * k;
    q.lift = 0.7 + Math.sin(t * 20) * 0.05; q.wsy = 0.95;
    q.rot = clamp(la, -0.6, 1.3) * 0.4 * ease.outCubic(k);
    const dl = la - q.rot;
    q.dL = lerp(q.dL, dl, ease.outCubic(Math.min(1, k * 1.6))) + q.tremble; q.dF = q.dL; q.dU = q.dL + 0.95;
  } else if (an === 'dive') {
    q.dive = 1; q.lift = -1; q.wsy = 0.62;
    q.rot = clamp(la, -0.5, 1.3) * 0.8;
    q.dL = la - q.rot; q.dF = q.dL; q.dU = q.dL + 0.8; q.trail = 16; q.bob = 0;
  }
  if (K.hurtOf(e)) { q.lean -= 0.22; q.lift += Math.sin(t * 50) * 0.3; }
  return q;
}

const L = { hx: 0, hy: 0, tipx: 0, tipy: 0, halox: 0, haloy: 0, eyex: 0, eyey: 0, lowerAt: 0, cx: 0, cy: 0 };
function layout(e, q) {
  NP = 0;
  const hipX = -1, hipY = -42 + q.bob, tr = q.lean;
  K.pivotPos('torso', 'hip', 'neck', hipX, hipY, tr, 1, 1, _q); const nx = _q[0], ny = _q[1];
  K.pivotPos('torso', 'hip', 'sh', hipX, hipY, tr, 1, 1, _q); const sx = _q[0], sy = _q[1];
  K.pivotPos('torso', 'hip', 'wing', hipX, hipY, tr, 1, 1, _q); const wx = _q[0], wy = _q[1];
  // wings: rotation about the shoulder joint (0 = as painted: spread up and back; + raises, − beats down/back)
  const wr = q.dive ? -1.0 : -0.25 + 0.38 * q.lift;
  place('wing', 'a', wx + 6, wy - 3, wr + 0.3 + (q.dive ? 0.08 : 0), 'deep', 0.88, q.wsy * 0.95);   // far wing
  L.lowerAt = NP;
  place('lower', 'a', hipX, hipY, tr * 0.6, 'base', 1, 1, 1);
  place('torso', 'hip', hipX, hipY, tr);
  const hr = tr * 0.6 + (q.rk ? -0.12 * q.rk : 0) + (q.ak ? 0.1 * q.ak : 0);
  place('skull', 'a', nx + 0.5, ny + 0.5, hr);
  place('wing', 'a', wx, wy, wr, 'base', 1, q.wsy);                                                 // near wing
  // arm + lance (lance behind the gripping hand)
  const up = K.part('uarm'), fp = K.part('farm'), lp = K.part('lance');
  const ex = sx + Math.cos(q.dU) * (up?.len ?? 11), ey = sy + Math.sin(q.dU) * (up?.len ?? 11);
  const hx = ex + Math.cos(q.dF) * (fp?.len ?? 11), hy = ey + Math.sin(q.dF) * (fp?.len ?? 11);
  if (lp) place('lance', 'a', hx, hy, q.dL - lp.ang);
  if (up) place('uarm', 'a', sx, sy, q.dU - up.ang);
  if (fp) place('farm', 'a', ex, ey, q.dF - fp.ang);
  const ll = lp ? lp.len : 30;
  L.hx = hx; L.hy = hy; L.tipx = hx + Math.cos(q.dL) * ll; L.tipy = hy + Math.sin(q.dL) * ll;
  K.pivotPos('skull', 'a', 'halo', nx + 0.5, ny + 0.5, hr, 1, 1, _q); L.halox = _q[0]; L.haloy = _q[1];
  K.pivotPos('skull', 'a', 'eye', nx + 0.5, ny + 0.5, hr, 1, 1, _q); L.eyex = _q[0]; L.eyey = _q[1];
  L.cx = hipX; L.cy = hipY - 14;
  return L;
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      K.begin(ctx, rig, 0); layout(e, q); K.end();
      e._pcorpse = true;
      claimDeathDebris(world, e);
      const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
      const pieces = [];
      for (let i = 0; i < NP; i++) {
        const p = PL[i];
        const heavy = p.name === 'lower' || p.name === 'torso' || p.name === 'lance';
        pieces.push({ name: p.name, pv: p.pv, x: p.x, y: p.y, rot: p.rot, sx: p.sx, sy: p.sy, vn: p.vn,
          vx: kb * 50 + K.frand(-110, 110) * (heavy ? 0.5 : 1), vy: -K.frand(60, 260) * (p.name === 'skull' ? 1.3 : heavy ? 0.5 : 1), vr: K.frand(-8, 8) * (heavy ? 0.4 : 1) });
      }
      K.spawnCorpse(world, e, rig, pieces, { life: 1.6, fade: 0.5, bounce: 0.3, dust: { n: 9, w: 22, h: 26, col: '#e8dcc0' } });
    }
    return;
  }
  const sq = K.squashK(e);
  ctx.save();
  if (q.rot) { ctx.translate(0, -52); ctx.rotate(q.rot); ctx.translate(0, 52); }
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  const lay = layout(e, q);
  const flick = 0.6 + 0.4 * Math.sin(t * 7) * Math.sin(t * 3.1);
  if (!o.flash) K.glow(lay.cx, lay.cy - 6, 40, '#fff2b0', 0.1 + q.rk * 0.18 + q.ak * 0.1);
  const ph = t * 4.2, trail = q.trail;
  for (let i = 0; i < NP; i++) {
    const p = PL[i];
    if (p.kind === 1) {
      // temple rags: bands below the sash stream back and flutter (feet swing with them)
      K.warpY(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, K.nStrips(9), (u) => {
        const w = Math.max(0, u - 0.12) / 0.88;
        _q[0] = (-(w * w) * trail - Math.sin(ph - u * 6) * w * 2.2) * rig.td; _q[1] = 0; return _q;
      }, 1, p.vn, 0);
      continue;
    }
    K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, 1, p.vn);
    if (p.name === 'lance' && !o.flash && (q.ak > 0 || q.dive || q.rk > 0.3)) {
      const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      K.put('lance', p.pv, p.x, p.y, p.rot, 1.02, 1.1, 0.25 + 0.5 * Math.max(q.ak, q.dive * 0.8, q.rk * 0.6), 'glow');
      ctx.globalCompositeOperation = gco;
    }
  }
  if (!o.flash) {
    K.glow(lay.halox, lay.haloy, 11 + 5 * q.rk, GOLD, 0.22 + 0.16 * flick + q.rk * 0.22);
    K.glow(lay.eyex, lay.eyey, 2.4 + 2 * (q.rk + q.ak), GOLD, 0.8 + 0.2 * flick);
    if (q.rk > 0.5 && (e.animT ?? 0) <= RAISE + 0.05) glint(ctx, lay.halox + 1, lay.haloy - 14, 3 + 4 * q.rk, '#fff4c0', (q.rk - 0.5) * 1.6);
    if (q.ak > 0.2) glint(ctx, lay.tipx, lay.tipy, 3 + 4 * q.ak + Math.sin(t * 30) * 1.2, '#fff4c0', q.ak);
    if (q.dive) K.glow(lay.tipx, lay.tipy, 12, GOLD, 0.6);
  }
  K.end();
  ctx.restore();
  if (!world || !o.cam || o.flash) return;
  // world-space FX: golden motes rising to the halo while raising, holy dust streaming off a dive, ivory flecks shed in flight
  const pool = e._fx ?? (e._fx = new K.FxPool(26));
  const dt = pool.step(K.clockOf(e, world));
  const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1), lo = K.lod() === 0 ? 0.5 : 1;
  const c = Math.cos(q.rot), s = Math.sin(q.rot);
  const wpt = (x, y) => { const yy = y + 52; _w[0] = e.cx + f * sc * (x * c - yy * s); _w[1] = e.bottom + sc * (x * s + yy * c - 52); return _w; };
  if (q.rk > 0) {
    wpt(lay.halox, lay.haloy);
    for (let n = pool.rate(0, 22 * lo * q.rk, dt); n > 0; n--) pool.add(0, _w[0] + K.frand(-22, 22) * sc, _w[1] + K.frand(4, 30) * sc, K.frand(-10, 10), K.frand(-70, -30), K.frand(0.35, 0.7), K.frand(2, 3.5) * sc, '#ffe7a0');
  }
  if (q.dive) {
    wpt(lay.cx, lay.cy);
    for (let n = pool.rate(1, 26 * lo, dt); n > 0; n--) pool.add(0, _w[0] + K.frand(-10, 10) * sc, _w[1] + K.frand(-16, 16) * sc, -(e.vx ?? 0) * 0.15, -(e.vy ?? 0) * 0.15, K.frand(0.25, 0.5), K.frand(3, 5) * sc, '#f4e6c0');
  }
  wpt(lay.cx - 4, lay.cy + 20);
  for (let n = pool.rate(2, 2.5 * lo, dt); n > 0; n--) pool.add(4, _w[0] + K.frand(-8, 8) * sc, _w[1], K.frand(-20, 20), K.frand(10, 40), K.frand(0.6, 1.1), K.frand(1.2, 2), '#e8dcc0');
  if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 8; i++) pool.add(4, e.cx + K.frand(-10, 10), e.bottom - 44 + K.frand(-12, 12), K.frand(-170, 170), K.frand(-200, 20), K.frand(0.4, 0.7), K.frand(1.6, 2.8), '#efe4c8'); }
  if (e.flashT <= 0) e._hitFx = false;
  ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
}
