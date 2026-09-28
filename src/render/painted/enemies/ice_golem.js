// T3 painted puppet: 얼음 골렘 (ice_golem). New design: a hulking giant of glacial crystal crusted with snow, a
// jagged-toothed ice skull sunk between its spiked shoulders and a glowing crystal heart in the chest. Rig: the torso
// (head + heart) cut free of its arms; one spiked arm piece used for both arms (far one darkened), rigid, swung from the
// shoulders; one leg piece (the foot frozen into an ice slab) for both legs. Damage variants by HP (dmg1 < 60 %,
// dmg2 < 30 %: cracks and chipped crystal).
// States (AI_B.brute: 'idle' 'walk' 'slam'): idle (slow heave, heart pulse, frost mist) · walk (heavy lumbering stride,
// body roll, the arms swing like pendulums) · slam (0.8 s wind-up: both arms rise over the head, the golem rears back, the
// heart blazes and the fists glint — the double-fisted blow lands on 0.8 s: arms smash down in front, the body lurches
// forward with a squash and an ice flash at the fists; 0.75 s recovery) · hurt (flash, recoil, ice chips) · airborne
// (legs dangle) · death (the golem shatters: torso, arms and legs fall as corpse pieces with a burst of ice chips).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint, bipedPose, dirOf } from './_biped.js';
import { claimDeathDebris } from './skeleton.js';

const DMG = { char: 0, cracks: 3, holes: 0, chips: 3, stain: '#2a4868', crackMinLum: 60 };
export const spec = {
  id: 'ice_golem', tier: 'T3', src: 'ice_golem',
  scale: 1.1,
  bake: {
    outline: 0.45, deep: { '*': 0.6 }, deepTint: 'rgb(90,120,160)', glow: { arm: '#8fe0ff' },
    damage: { torso: DMG, arm: DMG, leg: DMG },
  },
};

const ICE = '#9fe8ff';
const VARS = [['base', 'deep'], ['dmg1', 'deep_dmg1'], ['dmg2', 'deep_dmg2']];
const _q = [0, 0], _w = [0, 0];
const PL = [];
let NP = 0;
function place(name, pv, x, y, rot, vn = 'base') {
  const o = PL[NP] ?? (PL[NP] = {});
  o.name = name; o.pv = pv; o.x = x; o.y = y; o.rot = rot; o.vn = vn; NP++;
  return o;
}

const S = { lean: 0, rise: 0, armN: 0, armF: 0, wind: 0, hit: 0, sq: 0 };
function slamPose(e) {
  const s = S, P = e.params ?? {};
  s.lean = 0; s.rise = 0; s.wind = 0; s.hit = 0; s.sq = 0;
  s.armN = Math.PI / 2 - 0.12; s.armF = Math.PI / 2 - 0.02;
  if (e.anim !== 'slam') return s;
  const wu = P.windup ?? 0.8, at = e.animT ?? e.stateT ?? 0;
  if (at < wu) {
    const k = ease.inOutCubic(clamp(at / wu, 0, 1));
    s.wind = k; s.lean = -0.16 * k; s.rise = 3 * k;
    s.armN = lerp(s.armN, -Math.PI / 2 - 0.35, k); s.armF = lerp(s.armF, -Math.PI / 2 - 0.2, k);
  } else {
    const u = at - wu, k = ease.outCubic(clamp(u / 0.12, 0, 1)), r = clamp((u - 0.35) / 0.4, 0, 1);
    s.hit = k * (1 - r);
    s.lean = lerp(-0.16, 0.26, k) * (1 - r); s.sq = (1 - clamp(u / 0.25, 0, 1)) * k;
    const down = 0.72;                                             // fists on the ground in front
    s.armN = lerp(-Math.PI / 2 - 0.35, down, k); s.armF = lerp(-Math.PI / 2 - 0.2, down + 0.08, k);
    s.armN = lerp(s.armN, Math.PI / 2 - 0.12, ease.inOutCubic(r)); s.armF = lerp(s.armF, Math.PI / 2 - 0.02, ease.inOutCubic(r));
  }
  return s;
}

const L = { hx: 0, hy: 0, fnx: 0, fny: 0, ffx: 0, ffy: 0, heartX: 0, heartY: 0, eyeX: 0, eyeY: 0 };
function layout(e, q, s, vars) {
  NP = 0;
  const vN = vars[0], vF = vars[1];
  const t = e.t ?? 0, walk = e.anim === 'walk';
  const legP = K.part('leg'), armP = K.part('arm');
  const legLen = legP?.len ?? 35;
  const hipY = -(legLen + 3.5) + q.bob * 1.4 - s.rise + s.sq * 3, hipX = q.stepX * 0.6 + s.hit * 4;
  const roll = walk ? Math.sin(t * 4.2) * 0.035 : Math.sin(t * 1.3) * 0.012;
  const tr = s.lean + roll + q.lean * 0.5;
  // legs (far first): heavy stride, feet planted on the slab
  const air = e.onGround === false && !(e.stun > 0);
  // the slam lunge (near foot forward, far foot back) follows s.hit, so it settles with the arms during the recovery
  const lf = air ? 0.25 : q.hipB * 0.7 - 0.24 * s.hit, ln = air ? -0.15 : q.hipF * 0.7 + 0.3 * s.hit;
  place('leg', 'a', hipX - 7, hipY, dirOf(lf) - (legP?.ang ?? 0), vF);
  K.pivotPos('torso', 'hip', 'shF', hipX, hipY, tr, 1, 1, _q); const sfx = _q[0], sfy = _q[1];
  K.pivotPos('torso', 'hip', 'shN', hipX, hipY, tr, 1, 1, _q); const snx = _q[0], sny = _q[1];
  // arm swing while walking (pendulum, opposite phase)
  const sw = walk && e.anim !== 'slam' ? Math.sin(t * 4.2) * 0.22 : Math.sin(t * 1.3) * 0.03;
  const aF = s.armF - sw, aN = s.armN + sw;
  place('arm', 'a', sfx, sfy, aF - (armP?.ang ?? 0), vF);
  place('torso', 'hip', hipX, hipY, tr, vN);
  place('leg', 'a', hipX + 6, hipY, dirOf(ln) - (legP?.ang ?? 0), vN);
  place('arm', 'a', snx, sny, aN - (armP?.ang ?? 0), vN);
  const al = armP?.len ?? 43;
  L.fnx = snx + Math.cos(aN) * al; L.fny = sny + Math.sin(aN) * al;
  L.ffx = sfx + Math.cos(aF) * al; L.ffy = sfy + Math.sin(aF) * al;
  K.pivotPos('torso', 'hip', 'heart', hipX, hipY, tr, 1, 1, _q); L.heartX = _q[0]; L.heartY = _q[1];
  K.pivotPos('torso', 'hip', 'eyeN', hipX, hipY, tr, 1, 1, _q); L.eyeX = _q[0]; L.eyeY = _q[1];
  L.hx = hipX; L.hy = hipY;
  return L;
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  // pose 'none': the slam is posed by slamPose alone (the generic overhead attack pose kept its lunge and lean until the
  // AI left the slam, so the golem snapped upright on the first walk frame)
  const q = bipedPose(e, { stride: 5, legSwing: 0.36, armSwing: 0.2, knee: 0.5, bobAmp: 2.2, walkLean: 0.04, pose: 'none' });
  const s = slamPose(e);
  const hpK = e.stats?.maxHp ? e.hp / e.stats.maxHp : 1;
  const dl = e.dying > 0 ? 2 : hpK < 0.3 ? 2 : hpK < 0.6 ? 1 : 0;
  const vars = VARS[dl];
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      K.begin(ctx, rig, 0); layout(e, q, s, vars); K.end();
      e._pcorpse = true;
      claimDeathDebris(world, e);
      const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
      const pieces = [];
      for (let i = 0; i < NP; i++) {
        const p = PL[i];
        const heavy = p.name === 'torso';
        pieces.push({ name: p.name, pv: p.pv, x: p.x, y: p.y, rot: p.rot, sx: 1, sy: 1, vn: p.vn, vx: kb * 30 + K.frand(-80, 80) * (heavy ? 0.3 : 1), vy: -K.frand(60, 220) * (heavy ? 0.4 : 1), vr: K.frand(-4, 4) * (heavy ? 0.3 : 1) });
      }
      K.spawnCorpse(world, e, rig, pieces, { life: 1.8, fade: 0.55, bounce: 0.15, dust: { n: 12, w: 40, h: 50, col: '#dff4ff' } });
      chips(world, e);
    }
    return;
  }
  const sq = Math.max(K.squashK(e), s.sq * 0.7);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(34, 0.45);
  const lay = layout(e, q, s, vars);
  // the fists glow with frost while winding up (additive glow variant of the arm)
  for (let i = 0; i < NP; i++) {
    const p = PL[i];
    K.put(p.name, p.pv, p.x, p.y, p.rot, 1, 1, 1, p.vn);
    if (p.name === 'arm' && !o.flash && s.wind > 0.3) {
      const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      K.put('arm', 'a', p.x, p.y, p.rot, 1.02, 1.02, (s.wind - 0.3) * 0.4, 'glow');
      ctx.globalCompositeOperation = gco;
    }
  }
  if (!o.flash) {
    const pulse = 0.5 + 0.2 * Math.sin(t * 3) + 0.5 * s.wind + 0.3 * s.hit;
    K.glow(lay.heartX, lay.heartY, 9 + 10 * s.wind, ICE, pulse);
    K.glow(lay.eyeX, lay.eyeY, 3 + 3 * s.wind, '#dffaff', 0.8);
    K.glow(lay.eyeX - 3.5, lay.eyeY, 2.5 + 2 * s.wind, '#dffaff', 0.6);
    if (s.wind > 0.6) {
      const g = (s.wind - 0.6) / 0.4;
      glint(ctx, lay.fnx, lay.fny - 2, 5 + 7 * g, '#e8fbff', g);
    }
    if (s.hit > 0.05) {
      K.glow((lay.fnx + lay.ffx) / 2, Math.min(-2, (lay.fny + lay.ffy) / 2), 30 * s.hit, '#e8fbff', s.hit, 0.2);
    }
  }
  K.end();
  if (!world || !o.cam || o.flash) return;
  // frost mist creeping off the body, ice sparkle swirling at the fists while winding up (world space)
  const pool = e._fx ?? (e._fx = new K.FxPool(26));
  const dt = pool.step(K.clockOf(e, world));
  const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1), lo = K.lod() === 0 ? 0.5 : 1;
  for (let n = pool.rate(0, 4 * lo, dt); n > 0; n--) pool.add(2, e.cx + K.frand(-26, 26) * sc, e.bottom - K.frand(0, 12), K.frand(-12, 12), K.frand(-14, -2), K.frand(0.7, 1.3), K.frand(6, 10) * sc, 'rgba(220,240,255,0.5)');
  if (s.wind > 0.2) {
    _w[0] = e.cx + f * sc * lay.fnx; _w[1] = e.bottom + sc * lay.fny;
    for (let n = pool.rate(1, 26 * lo * s.wind, dt); n > 0; n--) { const a = K.frand(0, 6.28), r = K.frand(8, 20) * sc; pool.add(3, _w[0] + Math.cos(a) * r, _w[1] + Math.sin(a) * r, -Math.cos(a) * 30, -Math.sin(a) * 30, K.frand(0.25, 0.5), K.frand(1.2, 2.2), '#e8fbff'); }
  }
  if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 9; i++) pool.add(4, e.cx + K.frand(-16, 16), e.bottom - 60 + K.frand(-20, 20), K.frand(-170, 170), K.frand(-220, 10), K.frand(0.45, 0.8), K.frand(2, 3.4), i % 2 ? '#dff6ff' : '#8fd0f0'); }
  if (e.flashT <= 0) e._hitFx = false;
  ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
}

/** ice chips thrown off when it shatters (outlive the entity; render-only) */
function chips(world, e) {
  if (!world.fx?.ghost) return;
  const pool = new K.FxPool(20), t0 = world.time ?? 0, cy = e.bottom - 50;
  for (let i = 0; i < 18; i++) { const a = K.frand(0, Math.PI * 2), sp = K.frand(80, 260); pool.add(4, e.cx + K.frand(-16, 16), cy + K.frand(-20, 20), Math.cos(a) * sp, Math.sin(a) * sp - 160, K.frand(0.6, 1.1), K.frand(2, 4), i % 2 ? '#dff6ff' : '#8fd0f0'); }
  world.fx.ghost((ctx) => {
    const now = world.time ?? t0;
    if (now - t0 > 1.2) return;
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    pool.step(now); pool.draw(ctx);
    ctx.restore();
  }, 1.3, 'front');
}
