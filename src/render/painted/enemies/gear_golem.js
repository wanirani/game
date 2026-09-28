// T3 large painted puppet: 톱니 골렘 (gear_golem, 64×100). Parts from the Kling parts sheet (mirrored to face right): 'body' =
// the riveted brass torso with the dome head and glowing visor, the furnace grille, the smoke stack and the shoulder +
// upper arm down to the elbow gear; 'farm' = the plated piston forearm + fist turning on the elbow gear (reused darkened
// for the far arm); 'pelvis' + 'leg' (twice) = the separate legs item; 'cog' = the big spoked cog on its back (spins, and
// it is what the golem throws). Damage variants by HP (dmg1 < 60 %, dmg2 < 30 %).
// Driven by AI_B.geargolem: idle (hissing, furnace breathing, the cog ticks round) · walk (5 rad/s stomp) · punch
// (params.windup 0.7 s: the forearm cocks back, lean back, the furnace roars white-hot, steam jets, glint on the fist → at
// the windup frame the piston fist shoots forward (the AI's strike box reaches melee + 14 px at −78…−38), recoil) · throw
// (0.55 s: the back cog spins up, the far arm swings over → released at 0.55: the cog leaves the back (the AI's rolling cog
// projectile), comes back after the recovery) · hurt · death (the golem bursts apart in sparks and steam).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';
import { Placer, claimDeathDebris } from './blood_skeleton.js';

const DMG = { cracks: 2, char: 1, holes: 1, crackMinLum: 40, stain: '#20140a' };
export const spec = {
  id: 'gear_golem', tier: 'T3', src: 'gear_golem',
  bake: {
    outline: 0.5, deep: { farm: 0.6, leg: 0.6 }, deepTint: 'rgb(150,120,80)',
    damage: { body: DMG, farm: DMG, leg: DMG, pelvis: DMG },
  },
};

const P = new Placer();
const _q = [0, 0], _f = [0, 0], _s = [0, 0], _c = [0, 0], _st = [0, 0];
const VARS = [['base', 'deep'], ['dmg1', 'deep_dmg1'], ['dmg2', 'deep_dmg2']];
const Q = {}, LO = { hx: 0, hy: 0, tr: 0 };   // pose / layout results, reused every frame
// Piston punch: the forearm shoots out along its axis on a telescoping rod (outer brass sleeve + inner steel ram) so the
// fist reaches the AI's strike box (melee + 14 px ahead at −78…−38; the spark puff lands at melee + 10). PISTON = rod
// length at full extension; the rod is procedural, drawn between the body and the near forearm.
const PISTON = 84;
let CTX = null, FLASHED = false, RX = 0, RY = 0, RD = 0, RE = 0;
let NX = 0, NY = 0;
/** one rod section: dark outline, body colour, a thin highlight on the upper edge */
function seg(ctx, x0, y0, x1, y1, w, col, hi) {
  ctx.strokeStyle = '#140c06'; ctx.lineWidth = w + 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = FLASHED ? '#f4f0ec' : col; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  if (!FLASHED) {
    const o = -w * 0.28;
    ctx.strokeStyle = hi; ctx.lineWidth = w * 0.22;
    ctx.beginPath(); ctx.moveTo(x0 + NX * o, y0 + NY * o); ctx.lineTo(x1 + NX * o, y1 + NY * o); ctx.stroke();
  }
}
const ROD = () => {
  if (RE < 1) return;
  const ctx = CTX, c = Math.cos(RD), s = Math.sin(RD);
  const lx = RX + c * (RE + 5), ly = RY + s * (RE + 5), sl = RE * 0.5 + 3, sx = RX + c * sl, sy = RY + s * sl;
  NX = -s; NY = c;   // side normal (highlight on the upper edge)
  K.local();
  ctx.lineCap = 'butt';
  seg(ctx, RX, RY, lx, ly, 3.8, '#8e949c', '#e8ecf2');          // inner steel ram (into the forearm)
  seg(ctx, RX, RY, sx, sy, 6.6, '#7a5a2e', '#e0b870');          // outer brass sleeve out of the elbow gear
  // collar at the end of the sleeve
  ctx.strokeStyle = '#140c06'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(sx + NX * 4.4, sy + NY * 4.4); ctx.lineTo(sx - NX * 4.4, sy - NY * 4.4); ctx.stroke();
  ctx.strokeStyle = FLASHED ? '#f4f0ec' : '#c89a4a'; ctx.lineWidth = 1.4; ctx.stroke();
};

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = Q;
  const walk = an === 'walk', ph = t * 5;
  const wu = e.params?.windup ?? 0.7;
  q.t = t; q.punch = an === 'punch'; q.throw = an === 'throw';
  q.bob = walk ? -Math.abs(Math.sin(ph)) * 2.5 : Math.sin(t * 2) * 0.6;
  q.lean = walk ? 0.05 : 0.02; q.hx = 0;
  q.aN = 1.16 + (walk ? Math.sin(ph) * 0.25 : Math.sin(t * 2) * 0.03); q.aF = 1.0 - (walk ? Math.sin(ph) * 0.25 : 0);
  q.ext = 0; q.heat = 0.45 + 0.1 * Math.sin(t * 3); q.tele = 0; q.flash = 0;
  q.lN = walk ? Math.sin(ph) * 0.3 : 0.02; q.lF = walk ? -Math.sin(ph) * 0.3 : -0.03;
  q.liftN = walk ? Math.max(0, -Math.cos(ph)) * 5 : 0; q.liftF = walk ? Math.max(0, Math.cos(ph)) * 5 : 0;
  q.cogSpin = t * 0.8; q.cogOn = 1;
  if (q.punch) {
    if (at < wu) {
      const k = ease.outCubic(clamp(at / wu, 0, 1));
      q.aN = lerp(1.16, 2.5, k); q.lean = lerp(0.02, -0.14, k); q.heat = 0.5 + 0.5 * k; q.tele = k;
    } else {
      // the ram fires out level with the strike box (forearm axis ≈ horizontal after the lean), holds a beat, retracts
      const k = ease.outExpo(clamp((at - wu) / 0.07, 0, 1)), back = clamp((at - wu - 0.3) / 0.3, 0, 1);
      const retract = ease.inOutCubic(clamp((at - wu - 0.14) / 0.2, 0, 1));
      q.aN = lerp(lerp(2.5, -0.19, k), 1.16, back); q.ext = PISTON * k * (1 - retract); q.lean = lerp(-0.14, 0.22, k) * (1 - back);
      q.hx = 5 * k * (1 - back); q.heat = 1 - back * 0.5; q.flash = clamp(1 - (at - wu) / 0.2, 0, 1);
      q.lN = 0.3 * (1 - back); q.lF = -0.25 * (1 - back);
    }
  }
  if (q.throw) {
    if (at < 0.55) { const k = ease.inOutCubic(clamp(at / 0.55, 0, 1)); q.aF = lerp(1.0, -2.4, k); q.lean = -0.1 * k; q.cogSpin = t * (0.8 + 14 * k); q.tele = k; }
    else {
      const k2 = ease.outCubic(clamp((at - 0.55) / 0.12, 0, 1));
      q.aF = lerp(-2.4, 0.6, k2); q.lean = 0.15 * (1 - clamp((at - 0.7) / 0.3, 0, 1));
      q.cogOn = clamp((at - 0.9) / 0.1, 0, 1);
    }
  }
  if (K.hurtOf(e)) { q.lean -= 0.12; q.aN += 0.3; }
  q.lean += K.deathK(e) * 0.4;
  return q;
}

function layout(e, q, vN, vF) {
  P.reset();
  const hx = q.hx, hy = -56 + q.bob, tr = q.lean;
  const lp = K.part('leg'), fp = K.part('farm');
  // back cog (behind everything)
  K.pivotPos('body', 'hip', 'cog', hx, hy, tr, 1, 1, _c);
  if (q.cogOn > 0) P.place('cog', _c[0], _c[1], q.cogSpin, vN, q.cogOn, q.cogOn);
  // far arm
  K.pivotPos('body', 'hip', 'elbow', hx, hy, tr, 1, 1, _s);
  P.place('farm', _s[0] + 3, _s[1] - 2, q.aF - fp.ang + tr, vF);
  // legs + pelvis
  P.place('leg', hx + 5, -lp.len - q.liftF, q.lF, vF);
  P.place('leg', hx - 5, -lp.len - q.liftN, q.lN, vN);
  P.place('pelvis', hx, -lp.len - 10 + q.bob * 0.5, 0, vN);
  P.place('body', hx, hy, tr, vN, 1, 1, 'hip');
  // near forearm: turns on the elbow gear, the piston pushes it out along its axis on the telescoping rod
  const d = q.aN + tr;
  RX = _s[0]; RY = _s[1]; RD = d; RE = q.ext;
  if (q.ext >= 1) P.place('farm', _s[0], _s[1], 0, vN).fx = ROD;
  P.place('farm', _s[0] + Math.cos(d) * q.ext, _s[1] + Math.sin(d) * q.ext, d - fp.ang, vN);
  _f[0] = _s[0] + Math.cos(d) * (fp.len + q.ext); _f[1] = _s[1] + Math.sin(d) * (fp.len + q.ext);
  // Placer slots are reused frame to frame: only the procedural rod stays out of the corpse
  for (let i = 0; i < P.n; i++) P.L[i].noCorpse = P.L[i].fx === ROD;
  LO.hx = hx; LO.hy = hy; LO.tr = tr;
  return LO;
}

function die(e, world, rig, vN) {
  e._pcorpse = true;
  claimDeathDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => {
    const heavy = p.name === 'body' || p.name === 'pelvis';
    return [kb * 40 + K.frand(-120, 120) * (heavy ? 0.3 : 1), -K.frand(100, 300) * (heavy ? 0.4 : 1), K.frand(-6, 6) * (heavy ? 0.3 : 1)];
  }, { life: 1.8, fade: 0.5, bounce: 0.3, dust: { n: 16, w: 30, h: 70, col: '#ffc060', k: 3 } });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  const hpK = e.stats?.maxHp ? e.hp / e.stats.maxHp : 1;
  const dl = e.dying > 0 ? 2 : hpK < 0.3 ? 2 : hpK < 0.6 ? 1 : 0;
  const [vN, vF] = VARS[dl];
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q, vN, vF); K.end(); die(e, world, rig, vN); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.05 * sq, 1 - 0.05 * sq);
  CTX = ctx; FLASHED = !!o.flash;
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(32, 0.5);
  const L = layout(e, q, vN, vF);
  K.pivotPos('body', 'hip', 'stack', L.hx, L.hy, L.tr, 1, 1, _st);
  P.draw();
  if (!o.flash) {
    K.pivotPos('body', 'hip', 'furnace', L.hx, L.hy, L.tr, 1, 1, _q);
    K.glow(_q[0] + 2, _q[1], 8 + q.heat * 8, q.heat > 0.8 ? '#ffe0a0' : '#ff8a2a', 0.35 + q.heat * 0.45);
    K.pivotPos('body', 'hip', 'eye', L.hx, L.hy, L.tr, 1, 1, _q);
    K.glow(_q[0], _q[1], 3 + q.tele * 3, '#ffb040', 0.7, 0.2);
    if (q.punch && q.tele > 0.6) glint(ctx, _f[0], _f[1], 6 + 5 * q.tele, '#ffe0a0', (q.tele - 0.6) * 2.5);
    if (q.throw && q.tele > 0.5 && q.cogOn > 0) glint(ctx, _c[0], _c[1] - 16, 5 + 4 * q.tele, '#ffd080', (q.tele - 0.5) * 2);
    if (q.flash > 0) { K.glow(_f[0] + 4, _f[1], 18 * q.flash + 6, '#ffd080', q.flash); K.glow(_f[0] + 4, _f[1], 6, '#fff4d0', q.flash); }
  }
  K.end();
  // steam from the stack (more while winding up) and sparks off the fist (render-only, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(24));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    const sx = e.cx + f * _st[0] * sc, sy = e.bottom + _st[1] * sc;
    for (let n = pool.rate(0, (K.lod() === 0 ? 1.5 : 3) * (1 + q.tele * 4), dt); n > 0; n--) pool.add(2, sx, sy, K.frand(-15, 15) - f * 10, K.frand(-60, -30), K.frand(0.7, 1.2), K.frand(3, 6) * sc, '#d8d0c8');
    if (q.flash > 0.9 && !e._pfx) { e._pfx = true; for (let i = 0; i < 10; i++) pool.add(3, e.cx + f * _f[0] * sc, e.bottom + _f[1] * sc, f * K.frand(60, 260), K.frand(-160, 60), K.frand(0.15, 0.35), K.frand(1.2, 2.2), '#ffd080'); }
    if (q.flash <= 0) e._pfx = false;
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
