// T2 painted puppet: 샹들리에 마귀 (chandelier_fiend). Parts: core (brass ceiling cup, the fleshy sack with the
// grinning red-eyed skull, the hooked brass rod, two dripping blood-candle arms, the crystal curtain), leg (black bone leg
// with a fanged demon head at its root; six of them, bent by the chain warp), chain (tiled from the ceiling anchor).
// Driven by AI_C.chandelier: hang (hangs from the ceiling chain, sways by e.sway, the legs arched round it like a cage,
// candles flicker) · shake (the player walked under it: the sway goes wild, the legs twitch, the skull chatters) · fall
// (legs clenched in, dropping) · shatter (0.5 s: lands and bursts, crystal shards and a flash, the legs splay out) · crawl
// (broken: skitters on the six legs, e.broken) · spit (P.spitWindup 0.4: rears back, the skull's maw fills with fire,
// then the candle flame is spat) · hurt (flash, squash) · death (the core and the legs clatter apart in a spray of glass).
import * as K from '../enemy_kit.js';
import { claimDebris } from './_biped.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'chandelier_fiend', tier: 'T2', src: 'chandelier_fiend',
  bake: { outline: 0.35, deep: { leg: 0.62 }, deepTint: 'rgb(90,70,70)' },
};

const _q = [0, 0], _h = [0, 0, 0, 0];
const PI = Math.PI;
const FLAME = '#ffc060';
let _bt = 0;
const bendFn = (u) => _bt;          // constant bend per strip (total / n), set before each leg

// leg layout per side: [dir (right side), total bend, scale, deep?]
const HANG = [[-1.4, 2.5, 0.85, 1], [-0.95, 2.3, 0.95, 1], [-0.5, 2.1, 1, 0]];
const CRAWL = [[-0.45, 2.3, 1.15, 1], [-0.2, 2.1, 1.25, 1], [0.05, 1.9, 1.2, 0]];

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim, P = e.params || {};
  const f = e.facing < 0 ? -1 : 1;
  const sc = (e.scale || 1) * (rig.scale ?? 1);
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const hung = an === 'hang' || an === 'shake' || an === 'fall';
  const shake = an === 'shake', fall = an === 'fall', shatter = an === 'shatter', spit = an === 'spit';
  const crawl = !hung && !shatter;
  const swu = P.spitWindup ?? 0.4;
  const sp = spit ? clamp(at / swu, 0, 1) : 0, spr = spit && at >= swu ? clamp((at - swu) / 0.12, 0, 1) : 0;
  const sk = shatter ? clamp(at / 0.5, 0, 1) : 0;
  // core placement: hanging from the cup top (sway pivots there), or carried by the legs
  const bob = crawl ? Math.sin(t * 10) * 1.2 : 0;
  const ty = hung ? -52 : shatter ? lerp(-44, -52, clamp(at / 0.25, 0, 1)) : -54 + bob;
  let rot = hung ? (e.sway ?? 0) : crawl ? Math.sin(t * 5) * 0.04 : 0;
  if (spit) rot += spr > 0 ? lerp(-0.18, 0.1, spr) : -0.18 * sp;
  if (hurt && !hung) rot -= 0.1;
  const sx = 1 + sq * 0.08, sy = 1 - sq * 0.08;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      claimDebris(world, e);                 // metal material: Enemy.die spawned vector debris for this body
      K.begin(ctx, rig, 0);
      K.pivotPos('core', 'top', 'hipL', 0, ty, rot, sx, sy, _q); const lx = _q[0], ly = _q[1];
      K.pivotPos('core', 'top', 'hipR', 0, ty, rot, sx, sy, _q); const rx = _q[0], ry = _q[1];
      K.end();
      K.spawnCorpse(world, e, rig, [
        { name: 'leg', pv: 'a', x: lx, y: ly, rot: PI - 0.4, sx: 1, sy: -1, vn: 'base', vx: K.frand(-160, -60), vy: -K.frand(120, 240), vr: K.frand(-7, 7) },
        { name: 'core', pv: 'top', x: 0, y: ty, rot, sx: 1, sy: 1, vn: 'base', vx: K.frand(-30, 30), vy: -K.frand(80, 160), vr: K.frand(-3, 3) },
        { name: 'leg', pv: 'a', x: rx, y: ry, rot: 0.4, sx: 1, sy: 1, vn: 'base', vx: K.frand(60, 160), vy: -K.frand(120, 240), vr: K.frand(-7, 7) },
        { name: 'leg', pv: 'a', x: rx, y: ry + 4, rot: -0.3, sx: 1, sy: 1, vn: 'deep', vx: K.frand(20, 120), vy: -K.frand(160, 280), vr: K.frand(-8, 8) },
      ], { life: 1.5, fade: 0.5, bounce: 0.3, dust: { n: 16, w: 30, h: 26, col: '#e8f4ff', k: 4 } });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  // ceiling chain (only while hanging from an anchor; in the gallery a short stub)
  if (hung && !fall) {
    const topY = e.anchorY != null ? (e.anchorY - e.bottom) / sc : ty - 18;
    if (topY < ty - 0.5) {
      const cp = K.part('chain'), CL = cp ? cp.len : 8.7;
      let y = ty + 1;
      for (let i = 0; i < 40 && y > topY; i++) { K.put('chain', 'a', 0, y, -PI / 2, 1, 1); y -= CL; }
    }
  }
  if (!o.flash) {
    K.glow(0, ty + 30, 30, '#ffb050', 0.22 + (shatter ? 0.6 * (1 - sk) : 0));
    if (crawl || shatter) K.shadow(26, 0.4);
  }
  // legs: two behind the core per side, one in front
  K.pivotPos('core', 'top', 'hipL', 0, ty, rot, sx, sy, _q); const lx = _q[0], ly = _q[1];
  K.pivotPos('core', 'top', 'hipR', 0, ty, rot, sx, sy, _q); const rx = _q[0], ry = _q[1];
  const L = hung ? HANG : CRAWL;
  const n = K.nStrips(6);
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) {
      K.put('core', 'top', 0, ty, rot, sx, sy);
    }
    for (let i = 0; i < 3; i++) {
      const [d0, b0, s0, deep] = L[i];
      if ((deep === 1) !== (pass === 0)) continue;
      for (let side = -1; side <= 1; side += 2) {
        const ph = t * (crawl ? 11 : 2.3) + i * 2.1 + (side > 0 ? 0 : PI);
        let d = d0 + (crawl ? Math.sin(ph) * 0.2 : Math.sin(ph) * 0.04), b = b0 + (crawl ? Math.max(0, Math.sin(ph)) * 0.35 : 0);
        if (shake) { d += Math.sin(t * 40 + i * 3 + side) * 0.12; b += 0.2; }
        if (fall) { d = -1.55 + i * 0.12; b = 3.1; }
        if (shatter) { const k = 1 - sk; d = lerp(d, d0 + 0.5, k); b = lerp(b, 1.2, k); }
        if (spit) b += 0.25 * sp;
        if (hurt) d -= 0.25;
        _bt = b / n;
        const dir = side > 0 ? d + rot : PI - d + rot;
        K.chain('leg', side > 0 ? rx : lx, side > 0 ? ry : ly, dir, s0, n, side > 0 ? bendFn : negBend, 1, deep ? 'deep' : 'base', side < 0);
      }
    }
  }
  if (!o.flash) {
    // candle flames flicker, the skull's red eyes, the maw fills with fire before the spit
    for (const pn of ['candL', 'candR']) {
      K.pivotPos('core', 'top', pn, 0, ty, rot, sx, sy, _q);
      K.glow(_q[0], _q[1] - 1, 4 + Math.sin(t * 13 + _q[0]) * 0.8, FLAME, 0.85, 0.3);
      K.glow(_q[0], _q[1] - 1, 10, '#ff8a30', 0.3);
    }
    const ey = 0.7 + (shake ? 0.3 * Math.sin(t * 30) : 0) + 0.3 * sp;
    for (const pn of ['eye', 'eye2']) { K.pivotPos('core', 'top', pn, 0, ty, rot, sx, sy, _q); K.glow(_q[0], _q[1], 1.8 + 1.2 * sp, '#ff3020', ey); }
    if (spit || shake) {
      K.pivotPos('core', 'top', 'mouth', 0, ty, rot, sx, sy, _q);
      const m = spit ? (spr > 0 ? 1 - spr : sp) : 0.3 + 0.3 * Math.sin(t * 40);
      K.glow(_q[0], _q[1], 3 + 6 * m, '#ffb040', 0.3 + 0.6 * m, 0.25);
    }
    if (shatter) K.glow(0, -12, 50 * (1 - sk * 0.6), '#ffe0a0', 0.8 * (1 - sk));
  }
  K.end();
  // crystal drops tinkle while hanging/shaking; glass burst on the shatter; embers from the candles
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(28));
    const dt = pool.step(K.clockOf(e, world));
    for (let n2 = pool.rate(0, 2 + (shake ? 10 : 0), dt); n2 > 0; n2--) pool.add(3, e.cx + K.frand(-12, 12), e.bottom - sc * K.frand(8, 20), K.frand(-10, 10), K.frand(-10, 20), K.frand(0.2, 0.4), K.frand(1, 1.8), '#e8f4ff');
    for (let n2 = pool.rate(1, 3, dt); n2 > 0; n2--) pool.add(3, e.cx + f * sc * (K.fr() < 0.5 ? -10 : 11), e.bottom + sc * (ty + 26), K.frand(-10, 10), K.frand(-40, -15), K.frand(0.3, 0.6), K.frand(1, 1.6), FLAME);
    if (shatter && !e._burst) {
      e._burst = true;
      for (let i = 0; i < 14; i++) pool.add(4, e.cx + K.frand(-14, 14), e.bottom - sc * K.frand(6, 20), K.frand(-240, 240), K.frand(-360, -80), K.frand(0.5, 0.9), K.frand(2, 3.5), i % 2 ? '#e8f4ff' : '#bfe0ff');
    }
    if (!shatter) e._burst = false;
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
const negBend = (u) => -_bt;
