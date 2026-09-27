// T3 painted large flyer: 뇌조 (thunder_roc, 110×70). Parts (Kling Step-3 singles + parts sheets): the hunched
// soot-black body with the bleached skull head and ragged tail, one enormous lightning-veined wing (far copy darkened
// behind the body, near copy in front, both flapped through the bending chain), a scaly taloned leg (×2) and the
// open-beak screeching skull laid over the head. Damage variants by HP (dmg1 < 60 %, dmg2 < 30 %: torn feathers,
// charred cracks). Lightning veins pulse additively over the wings; storm wisps trail from the wing tips.
// States (AI_D.roc): fly (slow heavy beat 6.5 rad/s) · call (cast, aimK 0→1: both wings thrown up, the veins and tips
// charge white — at aimK 1 the bolts drop on e.cols) · screech (windup, aimK: the head rears, beak gapes with
// lightning in the throat, wings half-open) · swoop (dive: wings swept back, talons thrust forward, body along the
// velocity, streaking wisps) · hurt (flash + squash, wings jolt) · death (corpse: wings, body, legs tumble; sparks).
import * as K from '../enemy_kit.js';
import { claimDebris } from './_biped.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'thunder_roc', tier: 'T3', src: 'thunder_roc',
  bake: {
    outline: 0.5, deep: { wing: 0.58, leg: 0.6 }, deepTint: 'rgb(110,120,160)', glow: { wing: '#9fd0ff' },
    damage: { body: { char: 2, cracks: 2, holes: 2, crackMinLum: 30 }, head: { char: 1, cracks: 3, crackMinLum: 60 } },   // wings: no damage copies (memory)
  },
};

const PI = Math.PI;
const _q = [0, 0];
let BEND = 0;
const bendN = (u) => BEND * (0.3 + u);
const bendF = (u) => -BEND * (0.3 + u) * 0.8;
const VARS = [['base', 'deep'], ['dmg1', 'deep_dmg1'], ['dmg2', 'deep_dmg2']];

const Q = { el: 0, elF: 0, pitch: 0, charge: 0, scr: 0, legA: 0, fold: 1, bob: 0, freq: 6.5 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, q = Q;
  const k = clamp(e.aimK ?? 0, 0, 1);
  q.freq = 6.5; q.charge = 0; q.scr = 0; q.fold = 1;
  const A = Math.sin(t * q.freq);
  q.el = 0.75 + 0.75 * A; q.elF = 0.8 + 0.7 * Math.sin(t * q.freq - 0.45);
  q.pitch = 0.04 + Math.sin(t * q.freq + 1) * 0.03; q.bob = -A * 3; q.legA = 0.25 + Math.sin(t * 2.3) * 0.08;
  if (an === 'call') {
    q.el = lerp(q.el, 1.55, k) + Math.sin(t * 35) * 0.03 * k; q.elF = lerp(q.elF, 1.45, k);
    q.pitch = -0.18 * k; q.charge = k; q.bob *= 1 - k;
  } else if (an === 'screech') {
    q.el = lerp(q.el, 1.1, k); q.elF = lerp(q.elF, 1.0, k); q.pitch = -0.28 * k; q.scr = k; q.charge = k * 0.6; q.bob *= 1 - k;
    q.legA = lerp(q.legA, -0.2, k);
  } else if (an === 'swoop') {
    const vx = Math.abs(e.vx ?? 0) + 1, vy = e.vy ?? 0;
    q.el = 0.35 + Math.sin(t * 20) * 0.06; q.elF = 0.45; q.fold = 0.86;
    q.pitch = clamp(Math.atan2(vy, vx) * 0.7, -0.45, 0.55); q.legA = -0.9; q.charge = 0.3; q.bob = 0;
  }
  if (K.hurtOf(e)) { q.el += 0.45; q.elF += 0.35; q.pitch -= 0.2; }
  return q;
}

function bolt(ctx, x0, y0, x1, y1, n, amp, seed) {
  ctx.moveTo(x0, y0);
  for (let i = 1; i < n; i++) { const u = i / n, j = (K.h1(seed * 3.7 + i * 1.3) - 0.5) * amp; ctx.lineTo(lerp(x0, x1, u) + j * 0.5, lerp(y0, y1, u) + j); }
  ctx.lineTo(x1, y1);
}

const L = { bx: 0, by: 0, rot: 0, sq: 0, wx: 0, wy: 0, fx: 0, fy: 0, dN: 0, dF: 0, tipX: 0, tipY: 0, ftX: 0, ftY: 0, hFx: 0, hFy: 0, hBx: 0, hBy: 0, nx: 0, ny: 0, hx: 0, hy: 0, hr: 0 };
function layout(e, q) {
  L.sq = K.squashK(e);
  L.bx = -4; L.by = -32 + q.bob; L.rot = q.pitch;
  const sx = 1 + L.sq * 0.08, sy = 1 - L.sq * 0.08;
  K.pivotPos('body', 'a', 'wing', L.bx, L.by, L.rot, sx, sy, _q); L.wx = _q[0]; L.wy = _q[1];
  K.pivotPos('body', 'a', 'wingF', L.bx, L.by, L.rot, sx, sy, _q); L.fx = _q[0]; L.fy = _q[1];
  K.pivotPos('body', 'a', 'hipF', L.bx, L.by, L.rot, sx, sy, _q); L.hFx = _q[0]; L.hFy = _q[1];
  K.pivotPos('body', 'a', 'hipB', L.bx, L.by, L.rot, sx, sy, _q); L.hBx = _q[0]; L.hBy = _q[1];
  K.pivotPos('body', 'a', 'neck', L.bx, L.by, L.rot, sx, sy, _q); L.nx = _q[0]; L.ny = _q[1];
  K.pivotPos('body', 'a', 'skull', L.bx, L.by, L.rot, sx, sy, _q); L.hx = _q[0]; L.hy = _q[1]; L.hr = L.rot;
  L.dN = -PI + q.el + L.rot; L.dF = -PI + q.elF + L.rot;
  const wl = (K.part('wing')?.len ?? 70) * q.fold;
  L.tipX = L.wx + Math.cos(L.dN) * wl; L.tipY = L.wy + Math.sin(L.dN) * wl;
  L.ftX = L.fx + Math.cos(L.dF) * wl * 0.92; L.ftY = L.fy + Math.sin(L.dF) * wl * 0.92;
  return L;
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e), t = e.t ?? 0;
  const hpK = e.stats?.maxHp ? e.hp / e.stats.maxHp : 1;
  const dl = e.dying > 0 ? 2 : hpK < 0.3 ? 2 : hpK < 0.6 ? 1 : 0, V = VARS[dl];
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      K.begin(ctx, rig, 0); layout(e, q); K.end();
      e._pcorpse = true; claimDebris(world, e);
      const legA = rig.parts.leg?.ang ?? PI / 2;
      K.spawnCorpse(world, e, rig, [
        { name: 'wing', pv: 'a', x: L.fx, y: L.fy, rot: L.dF, sx: 0.92, sy: -0.92, vn: V[1], vx: K.frand(-90, -20), vy: -K.frand(80, 220), vr: K.frand(-4, 4) },
        { name: 'leg', pv: 'a', x: L.hBx, y: L.hBy, rot: PI / 2 - legA, vn: V[1], vx: K.frand(-60, 60), vy: -K.frand(100, 260), vr: K.frand(-8, 8) },
        { name: 'body', pv: 'a', x: L.bx, y: L.by, rot: L.rot, vn: V[0], vx: K.frand(-30, 50), vy: -K.frand(40, 140), vr: K.frand(1.5, 3) },
        { name: 'head', pv: 'a', x: L.hx, y: L.hy, rot: L.rot, vn: V[0], vx: K.frand(20, 120), vy: -K.frand(160, 320), vr: K.frand(-9, 9) },
        { name: 'leg', pv: 'a', x: L.hFx, y: L.hFy, rot: PI / 2 - legA, vn: V[0], vx: K.frand(-60, 80), vy: -K.frand(100, 260), vr: K.frand(-8, 8) },
        { name: 'wing', pv: 'a', x: L.wx, y: L.wy, rot: L.dN, sx: 1, sy: -1, vn: V[0], vx: K.frand(-20, 90), vy: -K.frand(120, 280), vr: K.frand(-5, 5) },
      ], {
        life: 2.0, fade: 0.6, bounce: 0.2, dust: { n: 12, w: 50, h: 18, col: '#4a4e62' },
        after: (age) => { if (age < 0.6) K.glow(L.bx + 10, L.by, 50 * (1 - age * 1.4), '#bfe0ff', 0.9 * (1 - age / 0.6)); },
      });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  layout(e, q);
  const sx = 1 + L.sq * 0.08, sy = 1 - L.sq * 0.08, n = K.nStrips(7);
  const legA = rig.parts.leg?.ang ?? PI / 2;
  BEND = q.charge > 0.5 ? 0.02 : 0.1 * Math.cos(t * q.freq) - 0.015;
  // far wing, far leg, body, near leg, near wing
  K.chain('wing', L.fx, L.fy, L.dF, 0.92 * q.fold, n, bendF, 1, V[1], true);
  K.put('leg', 'a', L.hBx, L.hBy, PI / 2 + q.legA * 0.8 - 0.15 - legA, 0.95, 0.95, 1, V[1]);
  K.put('body', 'a', L.bx, L.by, L.rot, sx, sy, 1, V[0]);
  // skull: the closed skull nods with the beat; the screech crossfades to the gaping skull (both pivot on the cranium)
  const hx = L.hx, hy = L.hy, hr = L.rot * 0.4 + Math.sin(t * q.freq + 2) * 0.04 - 0.3 * q.scr;
  const sa = clamp(q.scr * 2.5, 0, 1);
  if (sa < 1) K.put('head', 'a', hx, hy, hr, 1, 1, 1 - sa * 0.9, V[0]);
  if (sa > 0) K.put('screech', 'a', hx + 1, hy + 1, hr, 1.05, 1.05, sa);
  L.hx = hx; L.hy = hy; L.hr = hr;
  K.put('leg', 'a', L.hFx, L.hFy, PI / 2 + q.legA - legA, 1, 1, 1, V[0]);
  K.chain('wing', L.wx, L.wy, L.dN, q.fold, n, bendN, 1, V[0], true);
  if (!o.flash) {
    // lightning veins: the baked glow silhouette of the wing pulses additively (charging → white-hot)
    const pulse = 0.18 + 0.12 * Math.sin(t * 7) + 0.6 * q.charge + (K.h1(Math.floor(t * 10)) > 0.85 ? 0.25 : 0);
    const gco = ctx.globalCompositeOperation;
    if (K.lod() > 0) {
      ctx.globalCompositeOperation = 'lighter';
      K.chain('wing', L.wx, L.wy, L.dN, q.fold, K.nStrips(5), bendN, clamp(pulse * 0.5, 0, 0.8), 'glow', true);
      ctx.globalCompositeOperation = gco;
    }
    K.glow(L.tipX, L.tipY, 8 + 22 * q.charge, '#cfe8ff', 0.35 + 0.6 * q.charge);
    K.glow(L.ftX, L.ftY, 6 + 18 * q.charge, '#9fc8ff', 0.25 + 0.5 * q.charge);
    K.pivotPos('head', 'a', 'eye', L.hx, L.hy, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 4 + 4 * q.charge, '#9fe8ff', 0.9);
    if (q.scr > 0.1) { K.pivotPos('screech', 'a', 'throat', L.hx + 1, L.hy + 1, L.hr, 1.05, 1.05, _q); K.glow(_q[0], _q[1], 8 + 10 * q.scr, '#dff4ff', q.scr); }
    // crackling arcs: tip ↔ sky while calling, between the tips at full charge
    if (q.charge > 0.2) {
      K.local();
      const ga = ctx.globalAlpha, seed = Math.floor(t * 18);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = ga * (pass ? 0.95 : 0.4) * q.charge;
        ctx.strokeStyle = pass ? '#f4fbff' : '#6ab4ff'; ctx.lineWidth = pass ? 1 : 3;
        ctx.beginPath();
        bolt(ctx, L.tipX, L.tipY, L.tipX + (K.h1(seed) - 0.5) * 20, L.tipY - 26, 5, 8, seed);
        bolt(ctx, L.ftX, L.ftY, L.ftX + (K.h1(seed + 5) - 0.5) * 20, L.ftY - 22, 5, 8, seed + 9);
        if (q.charge > 0.75) bolt(ctx, L.tipX, L.tipY, L.ftX, L.ftY, 6, 10, seed + 4);
        ctx.stroke();
      }
      ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
    }
  }
  K.end();
  // storm-cloud wisps shed from the wing tips (more while swooping), static sparks while charged (camera space)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(30));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1, sw = e.anim === 'swoop';
    const wr = (K.lod() === 0 ? 3 : 6) + (sw ? 14 : 0);
    for (let nn = pool.rate(0, wr, dt); nn > 0; nn--) {
      const tip = nn & 1;
      pool.add(2, e.cx + f * sc * (tip ? L.tipX : L.ftX), e.bottom + sc * (tip ? L.tipY : L.ftY), -(e.vx ?? 0) * 0.3 + K.frand(-20, 20), K.frand(-15, 10), K.frand(0.7, 1.2), K.frand(6, 11), '#6a7088');
    }
    if (q.charge > 0.1) for (let nn = pool.rate(1, 20 * q.charge, dt); nn > 0; nn--) pool.add(3, e.cx + f * sc * (L.tipX + K.frand(-8, 8)), e.bottom + sc * (L.tipY + K.frand(-8, 8)), K.frand(-60, 60), K.frand(-80, 20), K.frand(0.15, 0.3), K.frand(1.2, 2.4), '#e8f6ff');
    if (dl === 2) for (let nn = pool.rate(2, 3, dt); nn > 0; nn--) pool.add(4, e.cx + f * sc * K.frand(-20, 20), e.bottom + sc * (L.by + K.frand(-6, 6)), K.frand(-20, 20), K.frand(-10, 20), K.frand(0.6, 1), K.frand(1.5, 2.5), '#2a2a36');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
