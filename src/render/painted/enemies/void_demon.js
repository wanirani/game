// T3 painted floater: 공허의 악마 (void_demon) — a horned shadow whose torso is a window onto a violet starfield,
// trailing off into a mist tail: the painted front body (seam-free cloth warp: the mist tail sways), a long clawed near
// arm (upper arm + forearm bones) and a straight far arm darkened behind it; a slowly turning event-horizon ring (black
// disc, violet rim) hangs behind the horned head and stars twinkle inside the torso.
// Driven by AI_B.voider: float (bob, tail sway, hands drifting) · cast (0.6 s: both hands rise to the front, two void orbs
// swell between the claws — the AI launches them at 0.6 from (20, −58)) · rift (0.5 s: one arm thrown up, the other
// pointed at the player, a violet tear flares at the raised claw, the body arches) · blink (the AI fades e.alpha over
// 0.35 s: the body stretches thin and implodes into violet motes, then reappears behind the player) · claw (0.42 s
// wind-up with the arm reared high and back, a raking downward swipe on the AI's hit at 0.42 with a violet crescent) ·
// hurt (flash, the starfield stutters) · damage variants by HP (dmg1 < 60 %, dmg2 < 30 %: the shadow flesh tears and
// frays) · death (the demon collapses inward: strips drift apart and wink out in a burst of stars).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { HP, swingTrail, glint } from './_biped.js';

const DMG = { char: 0.5, cracks: 2, holes: 1, chips: 1, stain: '#1a0830', crackMinLum: 18 };
export const spec = {
  id: 'void_demon', tier: 'T3', src: 'void_demon',
  bake: { outline: 0.35, deep: { arm2: 0.55 }, deepTint: 'rgb(90,70,130)', damage: { body: DMG, uarm: DMG, farm: DMG } },
};

const _q = [0, 0], _e = [0, 0], _h = [0, 0], _s = [0, 0];
const A2S = 0.72;                       // far arm scale (the straight painted arm is long)

function pose(e) {
  const t = e.t ?? 0, an = e.anim, st = e.stateT ?? e.animT ?? 0;
  const q = { bob: Math.sin(t * 1.2) * 3, rot: 0, sx: 1, sy: 1, u: HP - 0.35 + Math.sin(t * 1.4) * 0.08, f: 0, a2: HP + 0.15 + Math.sin(t * 1.1 + 1) * 0.06,
    ck: 0, orb: 0, rk: 0, bk: 0, wind: 0, strike: 0, trail: null, sway: 1 };
  q.f = q.u - 0.25;
  if (an === 'cast') {
    const k = ease.outCubic(clamp(st / 0.6, 0, 1)), back = clamp((st - 0.6) / 0.4, 0, 1);
    q.ck = k * (1 - back); q.orb = st < 0.6 ? k : 0;
    q.u = lerp(q.u, -0.35, q.ck); q.f = q.u - 0.15; q.a2 = lerp(q.a2, -0.55, q.ck); q.rot = -0.05 * q.ck;
  } else if (an === 'rift') {
    const k = ease.outCubic(clamp(st / 0.5, 0, 1)), back = clamp((st - 0.5) / 0.4, 0, 1);
    q.rk = k * (1 - back);
    q.u = lerp(q.u, -HP - 0.25, q.rk); q.f = q.u + 0.1; q.a2 = lerp(q.a2, 0.05, q.rk); q.rot = -0.1 * q.rk; q.sway = 1 + q.rk;
  } else if (an === 'blink') {
    q.bk = clamp(st / 0.35, 0, 1); q.sx = 1 - 0.55 * q.bk; q.sy = 1 + 0.25 * q.bk; q.sway = 2;
  } else if (an === 'claw') {
    const w = ease.outCubic(clamp(st / 0.42, 0, 1)), s = ease.outExpo(clamp((st - 0.42) / 0.1, 0, 1)), r = clamp((st - 0.6) / 0.25, 0, 1);
    q.wind = w * (1 - s); q.strike = s * (1 - r);
    const up = -2.45, hit = 0.35;
    q.u = lerp(lerp(q.u, up, w), hit, s); q.u = lerp(q.u, HP - 0.35, ease.inOutQuad(r));
    q.f = q.u + lerp(0.35, 0.3, s);
    q.rot = -0.12 * q.wind + 0.12 * q.strike;
    const ta = st > 0.42 && st < 0.62 ? 1 - clamp((st - 0.5) / 0.12, 0, 1) : 0;
    if (ta > 0) q.trail = [HP - up, HP - q.u, ta];
  }
  return q;
}

/** near arm from shoulder (x,y): upper arm along a, forearm along b; claw tip → _h */
function nearArm(x, y, a, b, vn) {
  const e = K.bone('uarm', x, y, a, 1, vn); _e[0] = e[0]; _e[1] = e[1];
  K.bone('farm', _e[0], _e[1], b, 1, vn);
  K.pivotPos('farm', 'a', 'tip', _e[0], _e[1], b - K.part('farm').ang, 1, 1, _h);
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, q = pose(e), td = rig.td;
  const hpK = e.stats?.maxHp ? e.hp / e.stats.maxHp : 1;
  const dl = hpK < 0.3 ? 2 : hpK < 0.6 ? 1 : 0, vb = dl ? 'dmg' + dl : 'base';
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { e._pcorpse = true; die(e, world, rig, q, vb); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.05 * sq, 1 - 0.05 * sq);
  const ny = -67 + q.bob;                      // neck (body pivot 'a')
  K.begin(ctx, rig, K.flashK(e, o));
  const hot = q.ck + q.rk + q.wind * 0.6 + q.strike;
  if (!o.flash) K.glow(0, -50 + q.bob, 58, '#8a3aff', 0.2 + hot * 0.2 + q.bk * 0.4);
  // event-horizon ring behind the head
  K.pivotPos('body', 'a', 'eyes', 0, ny, q.rot, q.sx, q.sy, _q);
  if (!o.flash) halo(ctx, _q[0] - 1, _q[1] - 5, t, 1 - q.bk);
  // far arm behind the body
  K.pivotPos('body', 'a', 'shF', 0, ny, q.rot, q.sx, q.sy, _s);
  K.bone('arm2', _s[0], _s[1], q.a2, A2S * q.sx, 'deep');
  // body: the mist tail sways (seam-free cloth warp, pivot at the neck)
  K.warpY('body', 'a', 0, ny, q.rot, q.sx, q.sy, K.nStrips(16), (u) => {
    _q[0] = Math.sin(t * 2.2 - u * 5) * u * u * 5 * q.sway * td; return _q;
  }, 1, vb, 0);
  // stars twinkling in the torso window
  if (!o.flash) stars(ctx, e, q, ny, t);
  // near arm over the body
  K.pivotPos('body', 'a', 'shN', 0, ny, q.rot, q.sx, q.sy, _s);
  const sx = _s[0], sy = _s[1];
  if (!o.flash && q.trail) swingTrail(ctx, sx, sy, q.trail[0], q.trail[1], 44, 18, '#b070ff', q.trail[2]);
  nearArm(sx, sy, q.u, q.f, vb);
  if (!o.flash) {
    // white eyes burn brighter while it casts / strikes
    K.pivotPos('body', 'a', 'eyes', 0, ny, q.rot, q.sx, q.sy, _q);
    const ea = 0.5 + 0.2 * Math.sin(t * 3) + hot * 0.4;
    K.glow(_q[0] - 3, _q[1] + 1, 3 + hot * 2, '#e8d8ff', ea); K.glow(_q[0] + 3, _q[1] + 1, 3 + hot * 2, '#e8d8ff', ea);
    if (q.orb > 0) { voidOrb(ctx, _h[0] + 4, _h[1] - 2, q.orb, t); voidOrb(ctx, 18, -60 + q.bob, q.orb * 0.8, t + 1.3); }
    if (q.rk > 0.2) { K.glow(_h[0], _h[1], 10 + 12 * q.rk, '#b060ff', q.rk); glint(ctx, _h[0], _h[1], 4 + 5 * q.rk, '#f0d8ff', q.rk); }
    if (q.wind > 0.5) glint(ctx, _h[0], _h[1], 3 + 4 * q.wind, '#e0c0ff', (q.wind - 0.5) * 2);
    if (q.bk > 0) K.glow(0, -50, 30 + 30 * q.bk, '#c080ff', q.bk * 0.8);
    const hurt = K.hurtOf(e);
    if (hurt) K.glow(0, -50 + q.bob, 34, '#d0a0ff', 0.35 * hurt);
  }
  motes(ctx, e, world, o, rig, q, ny);
  K.end();
}

/** the slowly turning event-horizon ring (black disc, violet rim, a hot arc) */
function halo(ctx, x, y, t, a) {
  if (a <= 0.02) return;
  K.local();
  const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
  ctx.globalAlpha = ga * a;
  ctx.fillStyle = '#050008'; ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(170,90,255,0.55)'; ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.stroke();
  const r0 = t * 0.4;
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,210,255,0.6)'; ctx.beginPath(); ctx.arc(x, y, 17, r0, r0 + 1.4); ctx.stroke();
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
}

function voidOrb(ctx, x, y, k, t) {
  const r = 2 + 4 * k;
  K.glow(x, y, r * 3, '#9a40ff', 0.8 * k);
  K.local();
  ctx.fillStyle = '#040008'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  const gco = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1; ctx.strokeStyle = `rgba(220,170,255,${0.8 * k})`;
  ctx.beginPath(); ctx.arc(x, y, r + 0.6, t * 3, t * 3 + 2); ctx.stroke();
  ctx.globalCompositeOperation = gco;
}

const NSTAR = 9;
function stars(ctx, e, q, ny, t) {
  const n = K.lod() === 0 ? 4 : NSTAR;
  K.pivotPos('body', 'a', 'core', 0, ny, q.rot, q.sx, q.sy, _q);
  const hurt = K.hurtOf(e);
  for (let i = 0; i < n; i++) {
    const x = _q[0] + (K.h1(i * 3.1) - 0.5) * 14 * q.sx, y = _q[1] + (K.h1(i * 7.7 + 2) - 0.3) * 30;
    const tw = Math.abs(Math.sin(t * (1.2 + K.h1(i) * 2.5) + i * 1.7)) * (hurt ? 0.4 + 0.6 * K.fr() : 1);
    if (tw > 0.35) K.glow(x, y, 1.6 + tw * 1.6, i % 3 ? '#e8e0ff' : '#d0a0ff', tw * 0.9, 0.2);
  }
}

function motes(ctx, e, world, o, rig, q, ny) {
  if (!o.cam) return;
  const pool = e._fx ?? (e._fx = new K.FxPool(K.lod() === 0 ? 12 : 22));
  const dt = pool.step(K.clockOf(e, world));
  if (dt > 0 && !o.flash) {
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    // violet motes shed by the mist tail; imploding motes while it blinks
    for (let k = pool.rate(0, 4, dt); k > 0; k--) pool.add(3, e.cx + f * K.frand(-8, 8) * sc, e.bottom + K.frand(-24, -4) * sc, K.frand(-10, 10), K.frand(10, 40), K.frand(0.5, 1), K.frand(1.2, 2.2), '#b080ff');
    if (q.bk > 0) for (let k = pool.rate(1, 40, dt); k > 0; k--) {
      const a = K.frand(0, 6.283), r = K.frand(20, 44) * sc, cx = e.cx, cy = e.bottom + (ny + 20) * sc;
      pool.add(3, cx + Math.cos(a) * r, cy + Math.sin(a) * r, -Math.cos(a) * r * 4, -Math.sin(a) * r * 4, 0.22, K.frand(1.5, 2.5), '#d0a0ff');
    }
  }
  if (pool.n) { ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore(); }
}

function die(e, world, rig, q, vb) {
  const ny = -67 + q.bob;
  K.spawnDissolve(world, e, rig, [
    { name: 'arm2', pv: 'a', x: -11, y: ny + 3, rot: q.a2 - HP, sx: A2S, sy: A2S, vn: 'deep' },
    { name: 'body', pv: 'a', x: 0, y: ny, rot: q.rot, vn: vb },
    { name: 'uarm', pv: 'a', x: 12, y: ny + 3, rot: q.u - HP, vn: vb },
  ], { life: 1.0, strips: 16, drift: 60, rise: 20, col: '#c090ff', kind: 3, n: 30, spread: 200, glow: '#9a40ff', cy: -50 });
}
