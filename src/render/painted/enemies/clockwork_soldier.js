// T2 painted mini-puppet: 태엽 병사 (clockwork_soldier, 30×80). Parts from the Kling parts sheets (mirrored to face right):
// 'body' = the side figure (tall black shako with a white plume, porcelain skull face with red button eyes and a painted
// moustache, red coat with white cross-belts, gold epaulettes and a cartridge box) without its forearm and legs; 'farm' =
// the blue cuff with the gold chevron and the white glove (turns at the elbow, holds the musket); 'leg' = the navy trouser
// leg with the red stripe and the black knee boot (twice, the far one darkened: a stiff wooden march); 'rifle' = the
// musket; 'gear' = the brass wind-up gear on the back (spins, seen at an angle).
// Driven by AI_B.rifleman: idle (the gear ticks, slight sway) · walk (7 rad/s stiff march) · aim (params.aim 0.7 s: the
// musket comes up to the chest and tracks e.aimA, a red aiming line runs from the muzzle for e.aimLen px and blinks
// faster before the shot, the eyes flare, glint at the muzzle) · fire (0.3 s: recoil, muzzle flash, smoke) · winddown
// (params.rewind 1.8 s after the clip: the gear unwinds backwards and stops, the soldier slumps, musket lowered, eyes out,
// three dots rise — then the gear rewinds and he straightens) · hurt · death (the clockwork bursts apart).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';
import { Placer, claimDeathDebris } from './blood_skeleton.js';

export const spec = {
  id: 'clockwork_soldier', tier: 'T2', src: 'clockwork_soldier',
  bake: { outline: 0.4, deep: { leg: 0.55 }, deepTint: 'rgb(120,100,110)' },
};

const P = new Placer();
const _h = [0, 0], _e = [0, 0], _hand = [0, 0], _m = [0, 0], _g = [0, 0], _b = [0, 0];
const Q = {};
const TAU = Math.PI * 2;
const GEAR_SX = 0.55;           // the gear is seen at an angle: squashed across, spun in its own plane
let RIG = null, CTX = null, FL = 0, GROT = 0;
/** the back gear, spun in its own plane and then foreshortened (put() only scales before it rotates) */
const GEARFX = (p, a) => {
  K.local();
  CTX.save();
  CTX.translate(p.x, p.y); CTX.scale(GEAR_SX * p.sx, p.sy);
  K.begin(CTX, RIG, FL);
  K.put('gear', 'c', 0, 0, GROT, 1, 1, a * p.alpha, p.vn);
  CTX.restore();
  K.begin(CTX, RIG, FL);
};

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = Q;
  const walk = an === 'walk', ph = t * 7;
  q.t = t; q.aim = an === 'aim'; q.fire = an === 'fire'; q.wd = an === 'winddown';
  q.lean = 0; q.bob = walk ? 0 : Math.sin(t * 2) * 0.4;
  // stiff march: the swinging leg comes further forward than the planted one goes back (negative = forward)
  const s = walk ? Math.sin(ph) : 0;
  q.lN = s > 0 ? -0.42 * s : -0.22 * s; q.lF = s < 0 ? 0.42 * s : 0.22 * s;
  if (walk) q.lean = 0.03;
  // forearm direction (local radians, 0 = forward, π/2 = down) and musket angle
  q.arm = Math.PI / 2 - 0.2 + (walk ? Math.sin(ph) * 0.06 : 0);
  q.gun = -Math.PI / 2 + 0.12; q.eye = 0.6; q.tele = 0; q.recoil = 0; q.flash = 0; q.dots = 0;
  q.gear = Math.floor(t * 3) * (TAU / 24) + ease.outCubic((t * 3) % 1) * (TAU / 24);   // ticks round
  if (q.aim || q.fire) {
    const la = e.facing >= 0 ? (e.aimA ?? 0) : Math.PI - (e.aimA ?? Math.PI);
    const a = Math.atan2(Math.sin(la), Math.cos(la));
    const k = q.aim ? ease.outCubic(clamp(at / 0.18, 0, 1)) : 1;
    q.gun = lerp(q.gun, a, k); q.arm = lerp(q.arm, -0.8 + a * 0.4, k);
    q.tele = q.aim ? clamp(at / (e.params?.aim ?? 0.7), 0, 1) : 0; q.eye = 1;
    if (q.fire) {
      const r = 1 - clamp(at / 0.22, 0, 1);
      q.recoil = r * r; q.gun -= 0.22 * q.recoil; q.arm -= 0.1 * q.recoil; q.lean = -0.08 * q.recoil;
      q.flash = clamp(1 - at / 0.08, 0, 1);
    }
  } else if (q.wd) {
    const T = e.params?.rewind ?? 1.8, slump = ease.outCubic(clamp(at / 0.5, 0, 1)), up = ease.inOutCubic(clamp((at - (T - 0.45)) / 0.4, 0, 1));
    const k = slump * (1 - up);
    q.lean = 0.2 * k + Math.sin(t * 3) * 0.02 * k; q.bob = 2.5 * k;
    q.arm = lerp(q.arm, Math.PI / 2 + 0.1, k); q.gun = lerp(q.gun, 0.35, k);
    q.eye = 0.6 * (1 - k); q.dots = k;
    // the gear unwinds backwards and runs down, then winds up again fast
    const un = clamp(at / 1.2, 0, 1);
    q.gear = -(un - un * un / 2) * 5 + ease.inCubic(up) * 9;
  }
  if (K.hurtOf(e)) { q.lean -= 0.15; q.gun -= 0.3; }
  q.lean += K.deathK(e) * 0.5;
  return q;
}

function layout(e, q, dying) {
  P.reset();
  const lp = K.part('leg');
  const L = lp ? lp.len : 33;
  // hip height from the planted leg (both feet stay on the ground line)
  const hipK = Math.cos(Math.max(Math.abs(q.lN), Math.abs(q.lF)) * 0.6);
  K.pivotPos('body', 'a', 'hip', 0, 0, 0, 1, 1, _h);
  const hx = _h[0], hy = -L * hipK + q.bob;
  // back gear (behind everything)
  K.pivotPos('body', 'hip', 'back', hx, hy, q.lean, 1, 1, _g);
  GROT = q.gear;
  const g = P.place('gear', _g[0], _g[1], dying ? q.gear : 0, 'base', dying ? GEAR_SX : 1, 1, 'c');
  if (!dying) g.fx = GEARFX;
  P.place('leg', hx - 1, hy, q.lF, 'deep');
  P.place('leg', hx, hy, q.lN, 'base');
  P.place('body', hx, hy, q.lean, 'base', 1, 1, 'hip');
  // forearm at the elbow, musket in the glove
  K.pivotPos('body', 'hip', 'elbow', hx, hy, q.lean, 1, 1, _e);
  const fp = K.part('farm'), rp = K.part('rifle');
  const ex = _e[0] - q.recoil * 2.5, ey = _e[1];
  P.place('farm', ex, ey, q.arm - (fp ? fp.ang : 0), 'base');
  const fl = fp ? fp.len : 11.6;
  _hand[0] = ex + Math.cos(q.arm) * fl; _hand[1] = ey + Math.sin(q.arm) * fl;
  const gr = q.gun - (rp ? rp.ang : 0);
  P.place('rifle', _hand[0], _hand[1], gr, 'base');
  K.pivotPos('rifle', 'a', 'muzzle', _hand[0], _hand[1], gr, 1, 1, _m);
  K.pivotPos('body', 'hip', 'eye', hx, hy, q.lean, 1, 1, _b);
  // the glove is drawn over the musket grip: move it to the end
  const n = P.n, f = P.L[n - 2]; P.L[n - 2] = P.L[n - 1]; P.L[n - 1] = f;
}

function die(e, world, rig) {
  e._pcorpse = true;
  claimDeathDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => {
    const heavy = p.name === 'body';
    return [kb * 40 + K.frand(-120, 120) * (heavy ? 0.35 : 1), -K.frand(80, 260) * (heavy ? 0.5 : 1), K.frand(-8, 8) * (heavy ? 0.4 : 1)];
  }, { life: 1.6, fade: 0.5, bounce: 0.3, dust: { n: 12, w: 16, h: 60, col: '#ffd080', k: 3 } });
}

/** the red aiming line from the painted muzzle (x0,y0) to (x1,y1) = the far end of the AI's ray, local space */
function laser(ctx, x0, y0, x1, y1, k, t, a) {
  // nothing to draw when the ray ends at/behind the muzzle (soldier pressed against a wall)
  if ((x1 - x0) * Math.cos(a) + (y1 - y0) * Math.sin(a) < 2) return;
  K.local();
  const blink = k > 0.7 ? (Math.sin(t * 60) > 0 ? 1 : 0.45) : 0.65;
  const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  ctx.strokeStyle = '#ff2030'; ctx.globalAlpha = ga * blink * (0.18 + 0.3 * k); ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = '#ff8080'; ctx.globalAlpha = ga * blink * (0.45 + 0.55 * k); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  RIG = rig; CTX = ctx;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); FL = 0; layout(e, q, true); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.05 * sq, 1 - 0.05 * sq);
  FL = K.flashK(e, o);
  K.begin(ctx, rig, FL);
  K.shadow(14);
  layout(e, q, false);
  P.draw();
  if (!o.flash) {
    K.glow(_b[0], _b[1], 1.6 + q.eye * 2 + q.tele * 1.5, '#ff3030', 0.35 + 0.55 * q.eye, 0.25);
    if (q.aim) {
      // the line starts at the painted muzzle and ends exactly where the AI's ray does (cast from 20 px ahead at −50 for
      // e.aimLen world px along e.aimA) — the bullet flies along that ray, so the spot it lights is the spot it hits.
      // World px → local px: divide by the elite/rig scale (the local frame is scaled, the ray is not).
      const sc = (e.scale || 1) * (rig.scale ?? 1), L = e.aimLen ?? 400;
      const la = e.facing >= 0 ? (e.aimA ?? 0) : Math.PI - (e.aimA ?? Math.PI);
      laser(ctx, _m[0], _m[1], (20 + Math.cos(la) * L) / sc, (-50 + Math.sin(la) * L) / sc, q.tele, q.t, q.gun);
      if (q.tele > 0.6) glint(ctx, _m[0], _m[1], 5 + 3 * Math.sin(q.t * 30), '#ff8080', (q.tele - 0.6) * 2.5);
    }
    if (q.flash > 0) { K.glow(_m[0] + Math.cos(q.gun) * 3, _m[1] + Math.sin(q.gun) * 3, 8 + 14 * q.flash, '#ffd070', q.flash); K.glow(_m[0], _m[1], 5, '#ffffff', q.flash); }
    if (q.dots > 0.3) {
      // three dots rising over the shako while the spring is run down
      K.local();
      const ga = ctx.globalAlpha;
      ctx.fillStyle = '#e8e4f0';
      for (let i = 0; i < 3; i++) {
        const u = (q.t * 0.9 + i / 3) % 1;
        ctx.globalAlpha = ga * (q.dots - 0.3) * 1.4 * Math.sin(u * Math.PI);
        ctx.beginPath(); ctx.arc(_b[0] - 6 + i * 4, _b[1] - 34 - u * 10, 1.3, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = ga;
    }
  }
  K.end();
  // powder smoke after the shot, sparks off the gear while it rewinds (render-only, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(16));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    if (q.flash > 0.8 && !e._pfx) {
      e._pfx = true;
      for (let i = 0; i < 5; i++) pool.add(2, e.cx + f * _m[0] * sc, e.bottom + _m[1] * sc, f * Math.cos(q.gun) * K.frand(20, 70), K.frand(-40, 5), K.frand(0.5, 0.9), K.frand(3, 5) * sc, '#b8b0a8');
      for (let i = 0; i < 4; i++) pool.add(3, e.cx + f * _m[0] * sc, e.bottom + _m[1] * sc, f * Math.cos(q.gun) * K.frand(80, 220), K.frand(-80, 40), K.frand(0.1, 0.22), K.frand(1, 1.8), '#ffd070');
    }
    if (q.flash <= 0) e._pfx = false;
    if (q.wd && q.dots < 0.9 && q.dots > 0.05 && (e.animT ?? 0) > 1) {
      for (let n = pool.rate(0, 10, dt); n > 0; n--) pool.add(3, e.cx + f * _g[0] * sc, e.bottom + _g[1] * sc, K.frand(-60, 60), K.frand(-90, -10), K.frand(0.1, 0.25), K.frand(0.8, 1.4), '#ffe0a0');
    }
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
