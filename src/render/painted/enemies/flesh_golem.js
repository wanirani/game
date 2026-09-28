// T3 large painted puppet: 육체 골렘 (flesh_golem, 60×100). Parts from the Kling parts sheet: 'body' = the hunched stitched
// torso (three glowing alchemical vials and iron spikes in the hump, the small iron-jawed skull head with the green eye
// and copper tubes, the riveted belt, the loincloth; the flank behind the big arm repainted), 'arm' = the huge banded near
// arm (shoulder → knuckles, knuckle-walking), 'farm' = the front arm by the head (drawn behind, darkened), 'legN' / 'legF'
// = the two legs of the sheet's legs item. Damage variants by HP (dmg1 < 60 %, dmg2 < 30 %).
// Driven by AI_B.brute: idle (heavy breathing, vials pulse, neck bolt sparks) · walk (5.5 rad/s lumber: legs swing, the
// body bobs, the knuckles drag) · slam (params.windup 0.75 s: both arms swing back and up over the hump, lean back,
// shaking, the eye flares, glint on the fist → at the windup frame both fists hammer down in front (the AI's strike box
// reaches melee + 14 px, the shock ring / flesh waves start 0.7 × melee ahead), lunge + crouch, green impact flash, slow
// recovery) · hurt (flash, squash, recoil) · death (the golem comes apart: arms, legs and torso fall in a spray of gore).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';
import { Placer } from './blood_skeleton.js';

const DMG = { cracks: 2, char: 1, holes: 2, crackMinLum: 40, stain: '#3a0a12' };
export const spec = {
  id: 'flesh_golem', tier: 'T3', src: 'flesh_golem',
  bake: {
    outline: 0.5, deep: { farm: 0.6, legF: 0.6 }, deepTint: 'rgb(140,100,110)',
    damage: { body: DMG, arm: DMG, farm: DMG, legN: DMG, legF: DMG },
  },
};

const P = new Placer();
const _q = [0, 0], _f = [0, 0], _g = [0, 0], _b = [0, 0];
const VARS = [['base', 'deep'], ['dmg1', 'deep_dmg1'], ['dmg2', 'deep_dmg2']];
const HIP = -34, TAU = Math.PI * 2;
const Q = {}, LO = { hx: 0, hy: 0, tr: 0 };   // pose / layout results, reused every frame

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = Q;
  const walk = an === 'walk', slam = an === 'slam';
  const wu = e.params?.windup ?? 0.75, ph = t * 5.5;
  q.t = t; q.walk = walk; q.slam = slam;
  q.bob = walk ? -Math.abs(Math.sin(ph)) * 2.5 : Math.sin(t * 1.8) * 1.2;
  q.lean = walk ? 0.04 : 0; q.hx = 0; q.shake = 0; q.raise = 0; q.impact = 0; q.flare = 0;
  q.aN = 1.26 + (walk ? Math.sin(ph) * 0.22 : Math.sin(t * 1.8) * 0.03);
  q.aF = 1.32 + (walk ? -Math.sin(ph) * 0.22 : Math.sin(t * 1.8 + 1) * 0.03);
  q.lN = walk ? Math.sin(ph) * 0.3 : 0.03; q.lF = walk ? -Math.sin(ph) * 0.3 : -0.04;
  q.liftN = walk ? Math.max(0, -Math.cos(ph)) * 4 : 0; q.liftF = walk ? Math.max(0, Math.cos(ph)) * 4 : 0;
  if (slam) {
    if (at < wu) {
      const k = ease.outCubic(clamp(at / wu, 0, 1));
      q.raise = k; q.aN = lerp(1.26, 4.3, k); q.aF = lerp(1.32, 4.25, k); q.lean = lerp(0, -0.18, k);
      q.shake = Math.sin(t * 50) * k * 0.8; q.flare = k; q.bob = -2 * k;
    } else {
      const s = ease.outCubic(clamp((at - wu) / 0.08, 0, 1)), rec = clamp((at - wu - 0.25) / 0.5, 0, 1);
      q.impact = 1 - clamp((at - wu) / 0.6, 0, 1);
      q.aN = lerp(lerp(4.3, 6.98, s), TAU + 1.26, rec); q.aF = lerp(lerp(4.25, 6.78, s), TAU + 1.32, rec);
      q.lean = lerp(-0.18, 0.3, s) * (1 - rec); q.hx = 6 * s * (1 - rec); q.bob = 4 * s * (1 - rec);
      q.lN = 0.25 * (1 - rec); q.lF = -0.2 * (1 - rec); q.flare = 1 - rec;
    }
  }
  if (K.hurtOf(e)) { q.lean -= 0.1; q.aN += 0.3; q.aF += 0.3; }
  q.lean += K.deathK(e) * 0.4;
  return q;
}

function layout(e, q, vN, vF) {
  P.reset();
  const hx = q.hx + q.shake, hy = HIP + q.bob, tr = q.lean;
  const lnp = K.part('legN'), lfp = K.part('legF');
  K.pivotPos('body', 'hip', 'armF', hx, hy, tr, 1, 1, _q);
  P.bone('farm', _q[0], _q[1], q.aF, vF);
  K.pivotPos('body', 'hip', 'legF', hx, hy, tr, 1, 1, _q);
  P.place('legF', _q[0], -lfp.len - 1 - q.liftF, q.lF, vF);
  K.pivotPos('body', 'hip', 'legN', hx, hy, tr, 1, 1, _q);
  P.place('legN', _q[0], -lnp.len - 1 - q.liftN, q.lN, vN);
  P.place('body', hx, hy, tr, vN, 1, 1, 'hip');
  K.pivotPos('body', 'hip', 'armN', hx, hy, tr, 1, 1, _q);
  const b = P.bone('arm', _q[0], _q[1], q.aN, vN);
  _f[0] = b[0]; _f[1] = b[1];
  // front fist (far arm) end point for the glint / impact
  K.pivotPos('body', 'hip', 'armF', hx, hy, tr, 1, 1, _q);
  const fp = K.part('farm');
  _g[0] = _q[0] + Math.cos(q.aF) * fp.len; _g[1] = _q[1] + Math.sin(q.aF) * fp.len;
  LO.hx = hx; LO.hy = hy; LO.tr = tr;
  return LO;
}

function die(e, world, rig) {
  e._pcorpse = true;
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => {
    const heavy = p.name === 'body';
    return [kb * 40 + K.frand(-100, 100) * (heavy ? 0.3 : 1), -K.frand(80, 240) * (heavy ? 0.4 : 1), K.frand(-4, 4) * (heavy ? 0.4 : 1)];
  }, { life: 1.8, fade: 0.5, bounce: 0.15, dust: { n: 16, w: 30, h: 60, col: '#7a1a24', k: 1 } });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  const hpK = e.stats?.maxHp ? e.hp / e.stats.maxHp : 1;
  const dl = e.dying > 0 ? 2 : hpK < 0.3 ? 2 : hpK < 0.6 ? 1 : 0;
  const [vN, vF] = VARS[dl];
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q, vN, vF); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.05 * sq, 1 - 0.05 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(30, 0.45);
  const L = layout(e, q, vN, vF);
  K.pivotPos('body', 'hip', 'bolt', L.hx, L.hy, L.tr, 1, 1, _b);
  P.draw();
  if (!o.flash) {
    // vials in the hump, the green eye, the sparking neck bolt
    for (let i = 0; i < 3; i++) {
      K.pivotPos('body', 'hip', i === 0 ? 'v1' : i === 1 ? 'v2' : 'v3', L.hx, L.hy, L.tr, 1, 1, _q);
      K.glow(_q[0], _q[1], 6 + q.flare * 3, '#6aff4a', 0.35 + 0.15 * Math.sin(q.t * 4 + i) + q.flare * 0.2);
    }
    K.pivotPos('body', 'hip', 'eye', L.hx, L.hy, L.tr, 1, 1, _q);
    K.glow(_q[0], _q[1], 3 + q.flare * 3, '#8aff4a', 0.8, 0.2);
    if (Math.sin(q.t * 13) > 0.6 || q.slam) K.glow(_b[0], _b[1], 7, '#9fe8ff', 0.55);
    if (q.raise > 0.6) glint(ctx, _g[0], _g[1], 6 + 5 * q.raise, '#c8ff90', (q.raise - 0.6) * 2.5);
    if (q.impact > 0.5) {
      const k = (q.impact - 0.5) * 2;
      K.glow(50, -6, 40, '#c8ffa0', k * 0.4);
      K.glow(_g[0], _g[1], 14 * k + 4, '#e8ffd0', k * 0.6);
    }
  }
  K.end();
  // neck-bolt sparks and vial drips (render-only, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(16));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    const bx = e.cx + f * _b[0] * sc, by = e.bottom + _b[1] * sc;
    for (let n = pool.rate(0, (K.lod() === 0 ? 1.5 : 3) * (q.slam ? 3 : 1), dt); n > 0; n--) pool.add(3, bx, by, K.frand(-60, 60), K.frand(-90, -10), K.frand(0.12, 0.25), K.frand(1, 1.8), '#bff0ff');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
