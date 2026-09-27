// T2 painted winged flyer: 폭풍 하피 (storm_harpy, 50×54). Parts (Kling parts sheet 1): raptor-headed hag head (glowing
// ice-blue eye), feathered body with the storm-grey tail and one taloned leg, one spread wing (drawn twice: far wing
// darkened behind the body, near wing in front) flapped through the mesh-free bending chain.
// States (AI_B.harpy, animT = time in the pose): fly (wing beat 12 rad/s, body bob on the down-stroke) · spread
// (0.5 s wind-up: both wings thrown wide and high, lightning crawls out to the wing tips, the head rears back
// screaming → the AI fires the feather fan) · shoot (0.35 s: wings sweep forward/down, tip flash) · aim (0.4 s: wings
// cocked high, body pitched up, glint at the talons) · dive (wings swept back, body pitched down along the velocity,
// talons thrust forward) · hurt (flash + squash, wings jolt) · death (corpse: head/body/wings tumble to the floor, feathers).
import * as K from '../enemy_kit.js';
import { claimDebris } from './_biped.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'storm_harpy', tier: 'T2', src: 'storm_harpy',
  bake: { outline: 0.4, deep: { wing: 0.62 }, deepTint: 'rgb(130,140,170)' },
};

const PI = Math.PI;
const _q = [0, 0], _h = [0, 0];
let BEND = 0;                                    // hoisted chain bend amplitude (no per-frame closures)
const bendNear = (u) => BEND * (0.4 + u);
const bendFar = (u) => -BEND * (0.4 + u);

/** pose: wing elevation (0 = level back, + = raised), body pitch, head tilt, charge 0..1 */
const Q = { el: 0, elF: 0, pitch: 0, head: 0, charge: 0, flash: 0, bob: 0, freq: 12, fold: 1 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = Q;
  q.freq = 12; q.charge = 0; q.flash = 0; q.fold = 1;
  const A = Math.sin(t * q.freq);
  q.el = 1.0 + 0.6 * A; q.elF = 1.0 + 0.6 * Math.sin(t * q.freq - 0.5);
  q.pitch = 0.06; q.head = Math.sin(t * 1.7) * 0.06; q.bob = -A * 2;
  if (an === 'spread') {
    const k = clamp(at / 0.5, 0, 1);
    q.el = lerp(q.el, 1.5, k) + Math.sin(t * 40) * 0.04 * k; q.elF = lerp(q.elF, 1.35, k);
    q.charge = k; q.head = -0.35 * k; q.pitch = -0.1 * k; q.bob = 0;
  } else if (an === 'shoot') {
    const k = clamp(at / 0.12, 0, 1);
    q.el = lerp(1.5, -0.25, k); q.elF = lerp(1.35, -0.1, k); q.flash = 1 - clamp(at / 0.35, 0, 1);
    q.head = -0.25 + 0.2 * k; q.pitch = -0.05;
  } else if (an === 'aim') {
    const k = clamp(at / 0.4, 0, 1);
    q.el = lerp(q.el, 1.55, k); q.elF = lerp(q.elF, 1.45, k); q.pitch = -0.35 * k; q.head = 0.15 * k; q.fold = 1 - 0.18 * k; q.bob = 0;
    q.charge = k * 0.4;
  } else if (an === 'dive') {
    q.el = 0.25 + Math.sin(t * 30) * 0.05; q.elF = 0.35; q.fold = 0.82;
    const vx = Math.abs(e.vx ?? 0) + 1, vy = e.vy ?? 0;
    q.pitch = clamp(Math.atan2(vy, vx) * 0.8, -0.2, 0.9); q.head = 0.2; q.bob = 0;
  }
  if (K.hurtOf(e)) { q.el += 0.5; q.elF += 0.4; q.pitch -= 0.25; q.head -= 0.2; }
  return q;
}

/** jagged lightning polyline (local space) */
function bolt(ctx, x0, y0, x1, y1, n, amp, seed) {
  ctx.moveTo(x0, y0);
  for (let i = 1; i < n; i++) { const k = i / n, j = (K.h1(seed * 5.1 + i * 2.3) - 0.5) * amp; ctx.lineTo(lerp(x0, x1, k) + j, lerp(y0, y1, k) + j * 0.6); }
  ctx.lineTo(x1, y1);
}

const L = { bx: 0, by: 0, rot: 0, sq: 1, nx: 0, ny: 0, hx: 0, hy: 0, hr: 0, wx: 0, wy: 0, fx: 0, fy: 0, tipX: 0, tipY: 0, ftX: 0, ftY: 0 };
function layout(e, q) {
  const sq = K.squashK(e);
  L.bx = 2; L.by = -27 + q.bob; L.rot = q.pitch; L.sq = sq;
  const sx = 1 + sq * 0.1, sy = 1 - sq * 0.1;
  K.pivotPos('body', 'a', 'neck', L.bx, L.by, L.rot, sx, sy, _q); L.nx = _q[0]; L.ny = _q[1];
  K.pivotPos('body', 'a', 'wing', L.bx, L.by, L.rot, sx, sy, _q); L.wx = _q[0]; L.wy = _q[1];
  K.pivotPos('body', 'a', 'wingF', L.bx, L.by, L.rot, sx, sy, _q); L.fx = _q[0]; L.fy = _q[1];
  L.hr = L.rot * 0.6 + q.head;
  const wl = (K.part('wing')?.len ?? 40) * q.fold;
  const dN = -PI + q.el + L.rot, dF = -PI + q.elF + L.rot;
  L.dN = dN; L.dF = dF;
  L.tipX = L.wx + Math.cos(dN) * wl; L.tipY = L.wy + Math.sin(dN) * wl;
  L.ftX = L.fx + Math.cos(dF) * wl * 0.9; L.ftY = L.fy + Math.sin(dF) * wl * 0.9;
  return L;
}

function drawFigure(e, q, alpha = 1) {
  const sx = 1 + L.sq * 0.1, sy = 1 - L.sq * 0.1, n = K.nStrips(6);
  BEND = (q.charge > 0 ? 0.03 : 0.12 * Math.cos((e.t ?? 0) * q.freq)) - 0.02;
  K.chain('wing', L.fx, L.fy, L.dF, 0.9 * q.fold, n, bendFar, alpha, 'deep', true);
  K.put('body', 'a', L.bx, L.by, L.rot, sx, sy, alpha);
  K.put('head', 'a', L.nx, L.ny + 1, L.hr, 1, 1, alpha);
  K.chain('wing', L.wx, L.wy, L.dN, q.fold, n, bendNear, alpha, 'base', true);
}

function die(e, world, rig, q) {
  e._pcorpse = true;
  claimDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  K.spawnCorpse(world, e, rig, [
    { name: 'wing', pv: 'a', x: L.fx, y: L.fy, rot: L.dF, sx: 0.9, sy: -0.9, vn: 'deep', vx: -60 + K.frand(-40, 40), vy: -K.frand(80, 200), vr: K.frand(-5, 5) },
    { name: 'body', pv: 'a', x: L.bx, y: L.by, rot: L.rot, vx: kb * 50 + K.frand(-40, 40), vy: -K.frand(60, 160), vr: K.frand(2, 5) },
    { name: 'head', pv: 'a', x: L.nx, y: L.ny, rot: L.hr, vx: 60 + K.frand(-40, 60), vy: -K.frand(180, 320), vr: K.frand(-9, 9) },
    { name: 'wing', pv: 'a', x: L.wx, y: L.wy, rot: L.dN, sx: 1, sy: -1, vx: 30 + K.frand(-60, 60), vy: -K.frand(120, 260), vr: K.frand(-6, 6) },
  ], { life: 1.5, fade: 0.5, bounce: 0.25, dust: { n: 6, w: 20, h: 16, col: '#5a6478' } });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig, q); }
    return;
  }
  const t = e.t ?? 0;
  K.begin(ctx, rig, K.flashK(e, o));
  layout(e, q);
  drawFigure(e, q);
  if (!o.flash) {
    K.pivotPos('head', 'a', 'eye', L.nx, L.ny + 1, L.hr, 1, 1, _h);
    K.glow(_h[0], _h[1], 2.8 + q.charge * 2.5, '#9fe8ff', 0.85);
    // storm crackle: tips always spark a little; the spread wind-up drags lightning out to both wing tips
    const ch = Math.max(q.charge, q.flash);
    K.glow(L.tipX, L.tipY, 5 + 16 * ch, '#bfe0ff', 0.35 + 0.6 * ch);
    if (ch > 0.05) K.glow(L.ftX, L.ftY, 4 + 12 * ch, '#9fd0ff', 0.3 + 0.5 * ch);
    if (ch > 0.25 || K.h1(Math.floor(t * 9)) > 0.86) {
      K.local();
      const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation, seed = Math.floor(t * 22);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = ga * (pass ? 0.9 : 0.35) * Math.max(0.5, ch);
        ctx.strokeStyle = pass ? '#f2faff' : '#6ab4ff'; ctx.lineWidth = pass ? 0.8 : 2.4;
        ctx.beginPath();
        bolt(ctx, L.wx, L.wy, L.tipX, L.tipY, 6, 7, seed);
        if (ch > 0.5) bolt(ctx, L.fx, L.fy, L.ftX, L.ftY, 5, 6, seed + 7);
        if (q.flash > 0.3) bolt(ctx, L.tipX, L.tipY, L.tipX + 22, L.tipY + 8, 4, 8, seed + 3);
        ctx.stroke();
      }
      ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
    }
    if (e.anim === 'aim') { K.pivotPos('body', 'a', 'talon', L.bx, L.by, L.rot, 1, 1, _q); K.glow(_q[0], _q[1], 5 + 6 * q.charge, '#e8f6ff', q.charge); }
  }
  K.end();
  // drifting static sparks + shed feathers while diving (camera space, per-second emission)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(18));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
    for (let n = pool.rate(0, (K.lod() === 0 ? 3 : 6) + q.charge * 20, dt); n > 0; n--) {
      pool.add(3, e.cx + f * sc * (L.tipX + K.frand(-6, 6)), e.bottom + sc * (L.tipY + K.frand(-6, 6)), K.frand(-30, 30), K.frand(-30, 20), K.frand(0.15, 0.35), K.frand(1, 2.2), '#dff4ff');
    }
    if (e.anim === 'dive') for (let n = pool.rate(1, 8, dt); n > 0; n--) pool.add(4, e.cx + f * sc * K.frand(-10, 6), e.bottom + sc * (L.by + K.frand(-8, 8)), -(e.vx ?? 0) * 0.3, K.frand(-60, -20), K.frand(0.5, 0.9), K.frand(1.6, 2.6), '#46526a');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
