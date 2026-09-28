// T2 painted floater: 흡혈 신부 (vampire_bride) — a pale bride of the vampire lord floating over her own bloody hem:
// painted head (silver tiara, veil, black hair, red eyes) with a separate SCREAMING head (maw open on the fangs, eyes
// flaring), the gown from the lace collar down to the torn hem dissolving into red mist (seam-free cloth warp), the
// long torn veil streaming behind her (strip warp), two gloved arms ending in black claws (upper arm + forearm bones, the
// far arm darkened behind the gown) and a bouquet of withered black roses in the far hand.
// Driven by AI_B.bride: float (bob, veil and hem ripple, the near hand drifting) · move (leans into the glide, veil
// streams further) · scream (0.6 s: head tips back, arms fling out, the screaming head takes over, red sound rings leave
// the maw — the AI releases the bats at 0.6) · gather (0.45 s: arms pulled in, shiver, red mist sucked into her chest,
// glint) · mist (0.55 s, invulnerable dash: she comes apart into a streak of red mist with only the glowing eyes and a
// ghost of the veil left) · claw (hand drawn back over the shoulder, then a raking swipe at 0.2–0.3 s = the AI's hit at
// 0.28, red crescent) · hurt · death (the bride tears into strips that rise and scatter in red mist and blood motes).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { HP, swingTrail, glint } from './_biped.js';

export const spec = {
  id: 'vampire_bride', tier: 'T2', src: 'vampire_bride',
  bake: { outline: 0.35, deep: { uarm: 0.55, farm: 0.55, bouquet: 0.8 }, deepTint: 'rgb(120,110,140)' },
};

const AS = 0.72;                 // arm scale (the painted arm is long for the bride's floating proportions)
const _q = [0, 0], _j = [0, 0];

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = { bob: Math.sin(t * 1.4) * 4, lean: clamp((e.vx ?? 0) / 900, -0.12, 0.12) * (e.facing < 0 ? -1 : 1), hr: Math.sin(t * 0.8) * 0.05,
    sk: 0, gk: 0, mist: 0, scream: false, shake: 0, stream: 1 + Math.min(1, Math.abs(e.vx ?? 0) / 300),
    nA: HP - 0.28 + Math.sin(t * 1.3) * 0.08, nB: 0, fA: HP + 0.12, fB: 0, bouquet: 1, trail: null };
  q.nB = q.nA - 0.35; q.fB = q.fA - 0.75;
  if (an === 'scream') {
    q.sk = ease.outCubic(clamp((e.stateT ?? at) / 0.6, 0, 1)); q.scream = q.sk > 0.25;
    q.hr = -0.32 * q.sk; q.nA = lerp(q.nA, -0.75, q.sk); q.nB = q.nA - 0.25; q.fA = lerp(q.fA, -2.3, q.sk); q.fB = q.fA + 0.3;
    q.bouquet = 1 - q.sk; q.stream = 1.4; q.shake = q.sk > 0.8 ? 0.6 : 0;
  } else if (an === 'gather') {
    q.gk = clamp((e.stateT ?? at) / 0.45, 0, 1);
    q.nA = HP - 1.15; q.nB = q.nA + 1.9; q.fA = HP - 0.9; q.fB = q.fA + 1.9; q.hr = 0.18 * q.gk; q.shake = q.gk; q.bouquet = 0; q.stream = 1.5;
  } else if (an === 'mist') {
    q.mist = 1;
  } else if (an === 'claw') {
    const s = e.stateT ?? at;
    const k1 = ease.outCubic(clamp(s / 0.2, 0, 1)), k2 = ease.outExpo(clamp((s - 0.2) / 0.1, 0, 1)), k3 = clamp((s - 0.38) / 0.22, 0, 1);
    const up = -2.35, hit = 0.12;
    q.nA = lerp(lerp(q.nA, up, k1), hit, k2); q.nA = lerp(q.nA, HP - 0.28, ease.inOutQuad(k3));
    q.nB = q.nA - lerp(0.5, 0.05, k2);
    q.lean += 0.12 * k2 * (1 - k3); q.hr = 0.12 * k2 * (1 - k3);
    const ta = s > 0.2 && s < 0.45 ? 1 - clamp((s - 0.3) / 0.15, 0, 1) : 0;
    if (ta > 0) q.trail = [HP - up, HP - q.nA, ta];
  }
  const hurt = K.hurtOf(e);
  if (hurt) { q.hr -= 0.2 * hurt; q.shake = Math.max(q.shake, 0.5 * hurt); }
  return q;
}

/** one arm from the shoulder (x,y): upper arm along dir a, forearm along dir b; returns the wrist in _j */
function arm(x, y, a, b, vn) {
  const e = K.bone('uarm', x, y, a, AS, vn); const ex = e[0], ey = e[1];
  K.bone('farm', ex, ey, b, AS, vn);
  _j[0] = ex + Math.cos(b) * K.part('farm').len * AS; _j[1] = ey + Math.sin(b) * K.part('farm').len * AS;
  return _j;
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, q = pose(e), td = rig.td;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { e._pcorpse = true; die(e, world, rig, q); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.05 * sq, 1 - 0.05 * sq);
  const jx = q.shake ? Math.sin(t * 55) * 1.2 * q.shake : 0;
  const nx = jx, ny = -58 + q.bob;                    // neckline (gown top) = the head's chest
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.glow(0, -44 + q.bob, 42, '#ff2a4a', 0.12 + q.sk * 0.3 + q.gk * 0.3 + q.mist * 0.2);
  if (q.mist) { mistForm(ctx, e, q, nx, ny, t, o); K.end(); return; }
  // veil streaming behind (strip warp: waves travel down its length)
  const vs = q.stream;
  K.strips('veil', 'a', nx - 4, ny - 21, -0.72 + q.lean * 0.5 + (vs - 1) * 0.3 + Math.sin(t * 1.1) * 0.04, 0.9 + (vs - 1) * 0.08, 0.9, K.nStrips(10), 'x', (u) => {
    _q[0] = 0; _q[1] = Math.sin(t * 2.6 - u * 5) * u * 5 * td + u * u * (vs - 1) * -6 * td; return _q;
  }, 0.92);
  // far arm + bouquet (behind the gown)
  const fw = arm(nx - 6, ny + 3, q.fA, q.fB, 'deep');
  if (q.bouquet > 0.05) K.put('bouquet', 'a', fw[0] + 1, fw[1] + 2, -0.25, 0.5, 0.5, q.bouquet, 'deep');
  // gown: seam-free cloth warp, the hem ripples and trails
  K.warpY('gown', 'a', nx, ny, q.lean, 1, 1, K.nStrips(14), (u) => {
    _q[0] = (Math.sin(t * 2.2 - u * 4) * u * u * 3.2 - u * u * (vs - 1) * 5) * td; return _q;
  }, 1, 'base', 0);
  // head (calm or screaming)
  const hn = q.scream ? 'scream' : 'head';
  K.put(hn, 'a', nx + 1, ny + 5, q.hr + q.lean, 1, 1);
  // near arm over the gown
  const ns = [nx + 6, ny + 3];
  if (!o.flash && q.trail) swingTrail(ctx, ns[0], ns[1], q.trail[0], q.trail[1], 30, 12, '#ff4a6a', q.trail[2]);
  const nw = arm(ns[0], ns[1], q.nA, q.nB, 'base');
  if (!o.flash) {
    // eyes, scream rings, gather glint
    K.pivotPos(hn, 'a', 'eyes', nx + 1, ny + 5, q.hr + q.lean, 1, 1, _q);
    const ea = 0.55 + 0.2 * Math.sin(t * 4) + q.sk * 0.5 + q.gk * 0.3;
    K.glow(_q[0] - 2, _q[1], 2.6 + q.sk * 2, '#ff2a3a', ea); K.glow(_q[0] + 2.5, _q[1], 2.6 + q.sk * 2, '#ff2a3a', ea);
    if (q.scream && q.sk > 0.5) {
      K.pivotPos('scream', 'a', 'mouth', nx + 1, ny + 5, q.hr + q.lean, 1, 1, _q);
      rings(ctx, _q[0] + 2, _q[1], t, (q.sk - 0.5) * 2);
    }
    if (q.gk > 0) { glint(ctx, nx + 4, ny + 6, 4 + 6 * q.gk, '#ff8aa0', q.gk > 0.4 ? (q.gk - 0.4) * 1.7 : 0); K.glow(nx + 2, ny + 8, 16 * q.gk, '#ff2a4a', q.gk * 0.5); }
    if (e.anim === 'claw' && (e.stateT ?? 0) < 0.22) glint(ctx, nw[0], nw[1], 3 + 4 * clamp((e.stateT ?? 0) / 0.2, 0, 1), '#ffb0c0', clamp((e.stateT ?? 0) / 0.2, 0, 1) * 0.8);
    const hurt = K.hurtOf(e);
    if (hurt) K.glow(nx, ny + 10, 30, '#ff6080', 0.3 * hurt);
  }
  // red mist curling off the hem, sucked in while she gathers (world space)
  motes(ctx, e, world, o, rig, q, nx, ny);
  K.end();
}

function rings(ctx, x, y, t, a) {
  K.local();
  const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    const r = 5 + i * 6 + (t * 40) % 6;
    ctx.globalAlpha = ga * a * (1 - i * 0.25);
    ctx.strokeStyle = '#ff5a7a';
    ctx.beginPath(); ctx.arc(x, y, r, -0.65, 0.65); ctx.stroke();
  }
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
}

/** mist dash: the bride is a streak of red mist; only the eyes and a ghost of the veil and head remain */
function mistForm(ctx, e, q, nx, ny, t, o) {
  if (!o.flash) {
    for (let i = 0; i < 9; i++) {
      const u = i / 8, y = ny - 20 + u * 66, w = 12 + Math.sin(i * 1.3 + t * 7) * 4;
      K.glow(nx - 6 - u * 10 + Math.sin(t * 6 + i) * 3, y, w + 4, '#c01838', 0.5 + 0.15 * Math.sin(t * 8 + i), 0.3);
    }
  }
  K.put('veil', 'a', nx - 4, ny - 21, -0.35, 0.8, 0.7, 0.25);
  K.put('head', 'a', nx + 1, ny + 5, 0.1, 1, 1, 0.3);
  if (!o.flash) { K.pivotPos('head', 'a', 'eyes', nx + 1, ny + 5, 0.1, 1, 1, _q); K.glow(_q[0] - 2, _q[1], 4, '#ff3a4a', 1); K.glow(_q[0] + 2.5, _q[1], 4, '#ff3a4a', 1); }
}

function motes(ctx, e, world, o, rig, q, nx, ny) {
  if (!o.cam) return;
  const pool = e._fx ?? (e._fx = new K.FxPool(K.lod() === 0 ? 10 : 20));
  const dt = pool.step(K.clockOf(e, world));
  if (dt > 0 && !o.flash) {
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    const hx = e.cx + f * nx * sc, hy = e.bottom + (ny + 50) * sc;
    for (let k = pool.rate(0, 5, dt); k > 0; k--) pool.add(2, hx + f * K.frand(-26, 8) * sc, hy + K.frand(-4, 6) * sc, K.frand(-15, 15), K.frand(-30, -10), K.frand(0.6, 1.1), K.frand(4, 7) * sc, '#6a0a1c');
    if (q.gk > 0) for (let k = pool.rate(1, 22, dt); k > 0; k--) {
      const a = K.frand(0, 6.283), r = K.frand(26, 40) * sc, cx = e.cx + f * (nx + 3) * sc, cy = e.bottom + (ny + 8) * sc;
      pool.add(0, cx + Math.cos(a) * r, cy + Math.sin(a) * r, -Math.cos(a) * r * 2.6, -Math.sin(a) * r * 2.6, 0.35, K.frand(3, 5), '#ff2a4a');
    }
  }
  if (pool.n) { ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore(); }
}

function die(e, world, rig, q) {
  const ny = -58 + q.bob;
  K.spawnDissolve(world, e, rig, [
    { name: 'veil', pv: 'a', x: -4, y: ny - 21, rot: -0.72, sx: 0.9, sy: 0.9 },
    { name: 'gown', pv: 'a', x: 0, y: ny, rot: 0 },
    { name: 'head', pv: 'a', x: 1, y: ny + 5, rot: -0.2 },
  ], { life: 1.0, strips: 14, drift: 50, rise: 26, col: '#ff2a4a', kind: 0, n: 26, spread: 150, glow: '#ff2a4a', cy: -44 });
}
